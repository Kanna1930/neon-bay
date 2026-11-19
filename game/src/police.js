// The Bay PD: wanted stars, the heat that feeds them, police cars and foot cops
// that chase the player, and the bust that ends a run. Heat rises with crime and
// drains when the player lays low; stars decide how hard the law comes down.
import { POLICE, ROADS_X, ROADS_Y, WANTED } from './config.js';
import { angleToward, clamp, dist, dist2, pick, range } from './util.js';
import { driveCar, makeCar } from './vehicles.js';

export function starsFromHeat(heat) {
  let stars = 0;
  for (const t of WANTED.thresholds) if (heat >= t) stars += 1;
  return stars;
}

export function addHeat(state, amount) {
  state.heat = clamp(state.heat + amount, 0, WANTED.max);
  const stars = starsFromHeat(state.heat);
  if (stars > state.stars) {
    state.stars = stars;
    state.events.wantedUp = true;
  }
  state.lastCrime = state.time;
}

function policeTargetCount(stars) {
  return stars; // one police car per star
}

function copTargetCount(stars) {
  return stars >= 3 ? stars - 2 : 0; // foot cops join at 3 stars
}

/** Spawn a police car on a road some distance from the player. */
function spawnPoliceCar(state, random) {
  const p = state.player;
  for (let tries = 0; tries < 12; tries += 1) {
    const onVertical = random() < 0.5;
    let x; let y; let angle;
    if (onVertical) {
      x = pick(random, ROADS_X);
      y = clamp(p.y + (random() < 0.5 ? -1 : 1) * range(random, 600, 900), 100, 2300);
      angle = y > p.y ? -Math.PI / 2 : Math.PI / 2;
    } else {
      y = pick(random, ROADS_Y);
      x = clamp(p.x + (random() < 0.5 ? -1 : 1) * range(random, 600, 900), 100, 3400);
      angle = x > p.x ? Math.PI : 0;
    }
    if (dist(x, y, p.x, p.y) < POLICE.spawnDistance - 150) continue;
    const car = makeCar(x, y, angle, 'police', random);
    car.cruise = POLICE.carSpeed;
    car.topSpeed = POLICE.carSpeed;
    car.speed = POLICE.carSpeed * 0.6;
    car.stuck = 0;
    return car;
  }
  return null;
}

function spawnCop(state, random) {
  const p = state.player;
  const angle = random() * Math.PI * 2;
  const x = clamp(p.x + Math.cos(angle) * range(random, 400, 600), 80, 3520);
  const y = clamp(p.y + Math.sin(angle) * range(random, 400, 600), 80, 2620);
  return {
    x, y, angle: 0, speed: POLICE.copSpeed,
    shootTimer: range(random, 0.3, 0.9), grabTimer: 0,
  };
}

/** Keep the police presence in line with the wanted level, then chase. */
export function updatePolice(state, dt, random) {
  const p = state.player;

  // Wanted decay: quiet for a while, out of sight, and the heat drains.
  if (state.time - state.lastCrime > WANTED.quietAfter && state.stars > 0) {
    const nearPolice = state.cars.some((c) => c.kind === 'police' && dist2(c.x, c.y, p.x, p.y) < 400 * 400)
      || state.cops.some((c) => dist2(c.x, c.y, p.x, p.y) < 400 * 400);
    if (!nearPolice) {
      state.heat = Math.max(0, state.heat - (state.stars >= 3 ? WANTED.decayHot : WANTED.decay) * dt);
      const stars = starsFromHeat(state.heat);
      if (stars < state.stars) state.stars = stars;
    }
  }

  // Spawn / remove police cars to match the stars.
  const wantCars = policeTargetCount(state.stars);
  const policeCars = state.cars.filter((c) => c.kind === 'police' && !c.wrecked);
  if (policeCars.length < wantCars) {
    const car = spawnPoliceCar(state, random);
    if (car) state.cars.push(car);
  }
  // Extra police cars hang around briefly after the heat drops, then leave.
  if (state.stars === 0) {
    for (const car of policeCars) {
      car.leaveTimer = (car.leaveTimer ?? 0) + dt;
      if (car.leaveTimer > 4) {
        state.cars.splice(state.cars.indexOf(car), 1);
      }
    }
    for (const cop of [...state.cops]) {
      cop.leaveTimer = (cop.leaveTimer ?? 0) + dt;
      if (cop.leaveTimer > 3) state.cops.splice(state.cops.indexOf(cop), 1);
    }
  }

  // Foot cops to match the stars.
  const wantCops = copTargetCount(state.stars);
  if (state.cops.length < wantCops) {
    state.cops.push(spawnCop(state, random));
  }

  // Police cars chase: steer at the player, full throttle, ram them.
  for (const car of policeCars) {
    if (car.wrecked) continue;
    car.leaveTimer = 0;
    const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
    car.angle = angleToward(car.angle, targetAngle, 2.6 * dt);
    const d = dist(car.x, car.y, p.x, p.y);
    const ctl = { up: d > 60, down: false, left: false, right: false };
    // If wedged against a building, back out.
    if (Math.abs(car.speed) < 10 && d > 120) car.stuck += dt;
    else car.stuck = 0;
    if (car.stuck > 1.2) {
      car.reverseTimer = 0.8;
      car.stuck = 0;
    }
    if (car.reverseTimer > 0) {
      car.reverseTimer -= dt;
      ctl.up = false; ctl.down = true;
    }
    // Chase speed: a touch faster than the player's car so escapes take work.
    driveCar(car, dt, ctl, state.city, state.cars, state.events);
    // Ram the player: damage on contact, with a cooldown.
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    if (dist2(car.x, car.y, px, py) < 44 * 44) {
      state.ramTimer = (state.ramTimer ?? 0) - dt;
      if ((state.ramTimer ?? 0) <= 0) {
        state.ramTimer = POLICE.ramCooldown;
        state.events.ram = true;
        p.health -= POLICE.ramDamage;
        if (p.car) p.car.health -= 4;
        state.shake = Math.max(state.shake, 0.35);
      }
    }
  }

  // Foot cops run at the player and try to grab them; at 3+ stars they shoot.
  for (const cop of state.cops) {
    cop.leaveTimer = 0;
    const d = dist(cop.x, cop.y, p.x, p.y);
    cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
    if (!p.car) {
      // On foot: run at the player.
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      if (!state.city.solidAt(nx, ny, 10)) { cop.x = nx; cop.y = ny; }
      if (d < 34) {
        cop.grabTimer += dt;
        if (cop.grabTimer > POLICE.grabTime) {
          state.events.busted = true;
          return;
        }
      } else cop.grabTimer = Math.max(0, cop.grabTimer - dt * 2);
    } else if (d < POLICE.shootRange && state.stars >= 3) {
      // In a car: stand off and shoot.
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = POLICE.shootCooldown;
        const spread = (random() - 0.5) * 0.35;
        state.bullets.push({
          x: cop.x, y: cop.y,
          vx: Math.cos(cop.angle + spread) * 700, vy: Math.sin(cop.angle + spread) * 700,
          range: POLICE.shootRange, damage: POLICE.shootDamage, from: 'cop',
        });
        state.events.shot = true;
      }
    }
  }

  // Busted while driving: crawling next to a police car for too long.
  if (p.car && state.stars > 0) {
    const speed = Math.abs(p.car.speed);
    const near = policeCars.some((c) => dist2(c.x, c.y, p.car.x, p.car.y) < 80 * 80);
    if (speed < POLICE.bustSpeed && near) {
      state.bustTimer += dt;
      if (state.bustTimer > POLICE.bustTime) {
        state.events.busted = true;
        return;
      }
    } else {
      state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
    }
  } else {
    state.bustTimer = 0;
  }
}
