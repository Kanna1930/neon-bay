// The game's rules and state, with no drawing and no browser in it: the city, the
// player on foot and in cars, traffic, pedestrians, the police, missions, combat.
// step() advances one fixed step and records what happened in state.events, so the
// caller can react (sound, announcements, screens) without the world knowing about
// any of them. The camera follows the player.
import { CAR, PLAYER, STEP, VIEW, WANTED, WORLD } from './config.js';
import { clamp, dist, dist2 } from './util.js';
import { createCity } from './city.js';
import { driveCar, driveTraffic, makeCar, nearestCar, spawnCityCars } from './vehicles.js';
import { makePed, nearestPed, scarePeds, spawnPeds, updatePeds } from './pedestrians.js';
import { addHeat, updatePolice } from './police.js';
import { startMission, updateMissions } from './missions.js';
import { tryPunch, tryShoot, updateBullets } from './combat.js';
import { spawnCrash, spawnSkid, spawnSmoke, updateParticles } from './particles.js';

function freshEvents() {
  return {
    shot: false, crash: false, pickup: false, missionDone: false, missionFail: false,
    punch: false, swing: false, wreck: false, ram: false, playerHit: false,
    stepDone: false, busted: false, wasted: false, hitPed: false, hitCar: false,
    wantedUp: false, hitCop: false, steal: false,
  };
}

export function createWorld(random, seed) {
  const city = createCity(random);
  const state = {
    seed,
    random,
    city,
    time: 0,
    cash: 50,
    heat: 0,
    stars: 0,
    lastCrime: -100,
    bustTimer: 0,
    ramTimer: 0,
    storyDone: false,
    mission: null,
    missionText: '',
    toast: null,
    events: freshEvents(),
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 },
    camera: { x: 0, y: 0 },
    shake: 0,
    muzzle: 0,
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    skids: [],
    cashDrops: [],
    player: {
      x: city.places.safehouse.x + 40, y: city.places.safehouse.y + 40,
      angle: 0, aimAngle: 0, health: PLAYER.health,
      car: null, shootTimer: 0, punchTimer: 0, hurtTimer: 0,
    },
    spawnTimer: 0,
    saveTimer: 0,
  };

  function reset() {
    state.time = 0;
    state.cash = 50;
    state.heat = 0;
    state.stars = 0;
    state.lastCrime = -100;
    state.bustTimer = 0;
    state.storyDone = false;
    state.toast = null;
    state.events = freshEvents();
    state.stats = { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 };
    state.shake = 0;
    state.muzzle = 0;
    state.cars = spawnCityCars(city, random);
    state.peds = spawnPeds(city, random);
    state.cops = [];
    state.bullets = [];
    state.particles = [];
    state.skids = [];
    state.cashDrops = [];
    state.player.x = city.places.safehouse.x + 40;
    state.player.y = city.places.safehouse.y + 40;
    state.player.angle = 0;
    state.player.health = PLAYER.health;
    state.player.car = null;
    state.player.shootTimer = 0;
    state.player.punchTimer = 0;
    startMission(state, 0, random);
    updateCamera(state);
  }

  function updateCamera(s) {
    const focus = s.player.car ?? s.player;
    const tx = clamp(focus.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    const ty = clamp(focus.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    // Ease the camera toward the player so it never snaps.
    s.camera.x += (tx - s.camera.x) * 0.12;
    s.camera.y += (ty - s.camera.y) * 0.12;
  }

  /** Enter the nearest car, or step out of the one being driven. */
  function enterOrExit(s) {
    const p = s.player;
    if (p.car) {
      const car = p.car;
      car.speed = Math.min(car.speed, 60);
      // Step out beside the car, on the side away from the road centre.
      const side = Math.cos(car.angle) > 0 ? 1 : -1;
      const nx = car.x - Math.sin(car.angle) * 26 * side;
      const ny = car.y + Math.cos(car.angle) * 26 * side;
      if (!city.solidAt(nx, ny, PLAYER.radius)) { p.x = nx; p.y = ny; }
      else { p.x = car.x + 30; p.y = car.y + 30; }
      p.angle = car.angle;
      p.car = null;
      return;
    }
    const car = nearestCar(s.cars, p.x, p.y, 64);
    if (!car) return;
    if (car.kind === 'traffic' && car.driver) {
      // The driver bails and runs; taking a car with a driver is a crime.
      car.driver = false;
      const driver = makePed(city, random, car.x + 30, car.y + 30);
      driver.flee = 3; driver.fleeX = car.x; driver.fleeY = car.y;
      s.peds.push(driver);
      addHeat(s, WANTED.stealCar);
      s.events.steal = true;
      s.stats.carsStolen += 1;
      scarePeds(s.peds, car.x, car.y, 180);
    } else if (car.kind === 'parked' || car.kind === 'mission') {
      addHeat(s, WANTED.stealCar);
      s.events.steal = true;
      s.stats.carsStolen += 1;
    }
    p.car = car;
    p.x = car.x; p.y = car.y;
  }

  function updatePlayer(s, dt, ctl) {
    const p = s.player;
    p.shootTimer = Math.max(0, p.shootTimer - dt);
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);

    if (ctl.enter) enterOrExit(s);

    if (p.car) {
      const car = p.car;
      const before = car.speed;
      driveCar(car, dt, ctl, city, s.cars, s.events);
      // Skid marks at speed while turning hard.
      if (Math.abs(car.speed) > 300 && (ctl.left || ctl.right)) {
        spawnSkid(s, car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, car.angle);
      }
      // Running over pedestrians.
      for (const ped of s.peds) {
        if (ped.down > 0) continue;
        if (dist2(car.x, car.y, ped.x, ped.y) < (CAR.radius + 10) * (CAR.radius + 10) && Math.abs(car.speed) > 90) {
          ped.down = 8;
          s.cashDrops.push({ x: ped.x, y: ped.y, amount: ped.cash, life: 20 });
          addHeat(s, WANTED.hitPed);
          s.stats.pedsHit += 1;
          s.events.hitPed = true;
          scarePeds(s.peds, ped.x, ped.y, 220);
        }
      }
      // Hitting another car hard is a (small) crime.
      if (Math.abs(car.speed - before) > 200) addHeat(s, WANTED.hitCar);
      p.x = car.x; p.y = car.y;
      p.angle = car.angle;
      if (car.smoke > 0) spawnSmoke(s, car.x, car.y);
      if (ctl.shoot) tryShoot(s, ctl.aimX, ctl.aimY);
      return;
    }

    // On foot: WASD moves, Shift runs, F punches, mouse shoots.
    let mx = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
    let my = (ctl.down ? 1 : 0) - (ctl.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.angle = Math.atan2(my, mx);
      const speed = ctl.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = p.x + mx * speed * dt;
      const ny = p.y + my * speed * dt;
      if (!city.solidAt(nx, p.y, PLAYER.radius)) p.x = nx;
      if (!city.solidAt(p.x, ny, PLAYER.radius)) p.y = ny;
    }
    if (ctl.punch) tryPunch(s);
    if (ctl.shoot) tryShoot(s, ctl.aimX, ctl.aimY);
    p.aimAngle = Math.atan2(ctl.aimY - p.y, ctl.aimX - p.x);

    // Slow health regen when the heat is off.
    if (s.stars === 0 && p.health < PLAYER.health) {
      p.health = Math.min(PLAYER.health, p.health + 2 * dt);
    }
  }

  function keepWorldPopulated(s, dt) {
    s.spawnTimer -= dt;
    if (s.spawnTimer > 0) return;
    s.spawnTimer = 2;
    // Traffic thins out far from the player; top it back up near the roads.
    const traffic = s.cars.filter((c) => c.kind === 'traffic');
    if (traffic.length < 8) {
      const spot = city.nearestRoad(s.player.x + (random() - 0.5) * 1400, s.player.y + (random() - 0.5) * 1000);
      if (spot) {
        const car = makeCar(spot.x, spot.y, spot.axis === 'v' ? Math.PI / 2 : 0, 'traffic', random);
        car.road = spot.road; car.axis = spot.axis; car.dir = 1;
        car.speed = car.cruise;
        s.cars.push(car);
      }
    }
    if (s.peds.length < 20) s.peds.push(makePed(city, random));
  }

  /** One fixed step. `ctl` carries the held keys, one-shot actions and the aim point in world coordinates. */
  function step(dt, ctl) {
    state.time += dt;
    updatePlayer(state, dt, ctl);
    // Traffic drives itself.
    for (const car of [...state.cars]) {
      if (car.kind === 'traffic' && car !== state.player.car) {
        driveTraffic(car, dt, city, state.cars, random);
      }
    }
    updatePeds(state.peds, dt, city, random);
    updateBullets(state, dt);
    updatePolice(state, dt, random);
    updateMissions(state, dt, random);
    updateParticles(state, dt);
    keepWorldPopulated(state, dt);
    updateCamera(state);

    // A crash (player or police) leaves sparks and a shake; the sound plays from the flag.
    if (state.events.crash) {
      spawnCrash(state, state.events.crashX, state.events.crashY);
      state.shake = Math.max(state.shake, 0.4);
    }

    if (state.player.health <= 0 && !state.events.wasted) {
      state.events.wasted = true;
    }
    return state.events;
  }

  /** After a bust or a waste: lose a cut of the cash, wake up at the safehouse, clean. */
  function respawn() {
    const p = state.player;
    const lost = Math.min(state.cash, Math.max(50, Math.floor(state.cash * 0.2)));
    state.cash -= lost;
    state.lostCash = lost;
    p.health = PLAYER.health;
    p.car = null;
    p.x = state.city.places.safehouse.x + 40;
    p.y = state.city.places.safehouse.y + 40;
    state.heat = 0;
    state.stars = 0;
    state.bustTimer = 0;
    state.cops = [];
    for (const car of state.cars) {
      if (car.kind === 'police') {
        state.cars.splice(state.cars.indexOf(car), 1);
      }
    }
    state.bullets = [];
    state.events = freshEvents();
    updateCamera(state);
  }

  reset();
  return { state, reset, step, respawn, updateCamera };
}
