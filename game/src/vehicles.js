// Cars: the player's ride, parked cars to steal, traffic that follows the roads,
// and police cars (their chase logic lives in police.js; this file owns movement).
import { CAR, PARKED, ROADS_X, ROADS_Y, ROAD_HALF, TRAFFIC, WORLD } from './config.js';
import { angleDiff, angleToward, clamp, dist, dist2, pick, range } from './util.js';

const CAR_COLORS = ['#c0392b', '#2980b9', '#f39c12', '#7f8c8d', '#8e44ad', '#16a085', '#d35400', '#bdc3c7', '#2c3e50', '#e74c3c'];
const TAXI_COLOR = '#f1c40f';

let nextId = 1;

export function makeCar(x, y, angle, kind, random) {
  const car = {
    id: nextId += 1,
    x, y, angle,
    speed: 0,
    kind, // 'player' | 'traffic' | 'parked' | 'police' | 'mission'
    color: kind === 'police' ? '#1f2937' : kind === 'mission' ? '#c0c0c8' : pick(random, CAR_COLORS),
    health: CAR.health,
    wrecked: false,
    driver: kind === 'traffic', // a traffic car has a driver who flees when stolen
    // Traffic AI state:
    road: null, axis: 'h', dir: 1, cruise: range(random, TRAFFIC.speedMin, TRAFFIC.speedMax),
    stuck: 0, reverseTimer: 0,
    smoke: 0,
  };
  return car;
}

/** Parked cars along road edges, plus the traffic stream. */
export function spawnCityCars(city, random) {
  const cars = [];
  for (let i = 0; i < PARKED.count; i += 1) {
    const spot = city.parkedSpot();
    cars.push(makeCar(spot.x, spot.y, spot.angle, 'parked', random));
  }
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = spawnTrafficCar(city, random);
    if (car) cars.push(car);
  }
  return cars;
}

function spawnTrafficCar(city, random) {
  if (random() < 0.5) {
    const rx = pick(random, ROADS_X);
    const dir = random() < 0.5 ? 1 : -1;
    const lane = dir === 1 ? 24 : -24;
    const car = makeCar(rx + lane, range(random, 100, 2300), dir === 1 ? Math.PI / 2 : -Math.PI / 2, 'traffic', random);
    car.road = rx; car.axis = 'v'; car.dir = dir; car.speed = car.cruise;
    return car;
  }
  const ry = pick(random, ROADS_Y);
  const dir = random() < 0.5 ? 1 : -1;
  const lane = dir === 1 ? 24 : -24;
  const car = makeCar(range(random, 100, 3400), ry + lane, dir === 1 ? 0 : Math.PI, 'traffic', random);
  car.road = ry; car.axis = 'h'; car.dir = dir; car.speed = car.cruise;
  return car;
}

/**
 * Drive one car for a step. `ctl` is { up, down, left, right } for the player;
 * traffic and police pass their own steering instead. Returns an event mask
 * (see world.js) for crashes. Buildings stop the car; other cars push apart.
 */
export function driveCar(car, dt, ctl, city, others, events) {
  if (car.wrecked) {
    car.speed = 0;
    return events;
  }
  // Steering: sharper at low speed, gentler at full speed; reversed when reversing.
  const steerInput = (ctl.left ? -1 : 0) + (ctl.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 200, 0.25, 1);
  const steer = steerInput * CAR.steerRate * speedFactor * (car.speed < 0 ? -1 : 1);
  car.angle += steer * dt;

  if (ctl.up) car.speed += CAR.accel * dt;
  else if (ctl.down) car.speed -= (car.speed > 10 ? CAR.brake : CAR.reverseAccel) * dt;
  else {
    // Drag and rolling resistance.
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, car.topSpeed ?? CAR.maxSpeed);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;

  // Buildings and the bay stop the car: slide along the wall, lose speed, take damage.
  const hit = city.buildingAt(nx, ny, CAR.radius) || city.inWater(nx, ny)
    || nx < CAR.radius || ny < CAR.radius || nx > WORLD.width - CAR.radius || ny > WORLD.height - CAR.radius;
  if (hit) {
    if (Math.abs(car.speed) > 120) {
      events.crash = true;
      events.crashX = car.x; events.crashY = car.y;
      car.health -= Math.min(30, Math.abs(car.speed) * 0.06);
      if (car.health <= 0) { car.wrecked = true; car.smoke = 1; }
    }
    car.speed *= -0.25;
  } else {
    car.x = nx;
    car.y = ny;
  }

  // Other cars: push apart and trade a little speed, with a thud when it is hard.
  for (const other of others) {
    if (other === car || other.wrecked) continue;
    const d2 = dist2(car.x, car.y, other.x, other.y);
    if (d2 < (CAR.radius * 2) * (CAR.radius * 2) && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (CAR.radius * 2 - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * push; car.y += uy * push;
      other.x -= ux * push; other.y -= uy * push;
      const closing = Math.abs(car.speed - other.speed);
      if (closing > 140) {
        events.crash = true;
        events.crashX = (car.x + other.x) / 2; events.crashY = (car.y + other.y) / 2;
        car.health -= 6; other.health -= 6;
        if (car.health <= 0) { car.wrecked = true; car.smoke = 1; }
        if (other.health <= 0) { other.wrecked = true; other.smoke = 1; }
        const avg = (car.speed + other.speed) / 2;
        car.speed = avg * 0.5; other.speed = avg * 0.5;
      }
    }
  }
  if (car.health < 40) car.smoke = Math.max(car.smoke, 0.4);
  return events;
}

/** Traffic AI: follow the road grid, keep your lane, turn at intersections, stop for the car ahead. */
export function driveTraffic(car, dt, city, others, random) {
  if (car.wrecked) { car.speed = 0; return; }
  const ctl = { up: false, down: false, left: false, right: false };

  // Find the car ahead in the same lane; slow down for it.
  let ahead = null;
  let aheadD = 1e9;
  for (const other of others) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
    const side = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
    if (forward > 0 && forward < 130 && side < 30 && forward < aheadD) { ahead = other; aheadD = forward; }
  }
  const want = ahead ? Math.max(0, aheadD - 60) : car.cruise;
  ctl.up = car.speed < want;
  ctl.down = car.speed > want + 30;

  // At an intersection, sometimes turn onto the crossing road.
  const nearX = car.axis === 'v';
  const pos = nearX ? car.y : car.x;
  const roads = nearX ? ROADS_Y : ROADS_X;
  let atCross = false;
  for (const r of roads) {
    if (Math.abs(pos - r) < 14) { atCross = true; break; }
  }
  if (atCross && random() < 0.02) {
    if (car.axis === 'v') {
      const ry = car.y;
      const dir = random() < 0.5 ? 1 : -1;
      car.axis = 'h'; car.road = ry; car.dir = dir;
      car.angle = dir === 1 ? 0 : Math.PI;
      car.y = ry + (dir === 1 ? 24 : -24);
    } else {
      const rx = car.x;
      const dir = random() < 0.5 ? 1 : -1;
      car.axis = 'v'; car.road = rx; car.dir = dir;
      car.angle = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      car.x = rx + (dir === 1 ? 24 : -24);
    }
  }

  // Steer back onto the lane centreline.
  const targetAngle = car.axis === 'v' ? (car.dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (car.dir === 1 ? 0 : Math.PI);
  const diff = angleDiff(car.angle, targetAngle);
  ctl.left = diff < -0.05;
  ctl.right = diff > 0.05;

  // Keep the car on its lane laterally: nudge the angle toward the centreline.
  const lanePos = car.axis === 'v' ? car.x : car.y;
  const laneTarget = car.road + (car.dir === 1 ? 24 : -24);
  const lateral = lanePos - laneTarget;
  if (Math.abs(lateral) > 6) {
    const fix = clamp(-lateral * 0.004, -0.5, 0.5) * (car.dir === 1 ? 1 : -1) * (car.axis === 'v' ? 1 : -1);
    car.angle += fix * dt * 2;
  }

  // Reverse out if stuck against something.
  if (Math.abs(car.speed) < 8 && ctl.up) car.stuck += dt;
  else car.stuck = 0;
  if (car.stuck > 1.5) {
    car.reverseTimer = 0.9;
    car.stuck = 0;
  }
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    ctl.up = false; ctl.down = true;
    ctl.left = !ctl.left; ctl.right = !ctl.right;
  }

  const before = { x: car.x, y: car.y };
  driveCar(car, dt, ctl, city, others, { crash: false });
  // If a building stopped us dead, give up on this road and turn around.
  if (dist(car.x, car.y, before.x, before.y) < 0.5 && Math.abs(car.speed) > 50) {
    car.dir *= -1;
    car.angle += Math.PI;
  }
  // Stay in the world: respawn far away on a road if we somehow leave it.
  if (car.x < 60 || car.y < 60 || car.x > WORLD.width - 60 || car.y > WORLD.height - 60) {
    const fresh = spawnTrafficCar(city, random);
    if (fresh) { Object.assign(car, fresh, { id: car.id }); }
  }
}

/** The nearest car to (x, y) within `range`, ignoring wrecked ones. */
export function nearestCar(cars, x, y, rangePx) {
  let best = null;
  let bestD = rangePx * rangePx;
  for (const car of cars) {
    if (car.wrecked) continue;
    const d2 = dist2(x, y, car.x, car.y);
    if (d2 < bestD) { bestD = d2; best = car; }
  }
  return best;
}

export { TAXI_COLOR };
