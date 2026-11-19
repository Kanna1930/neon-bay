// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so the frame is what real play looks like and the same seed
// always gives the same frame.
import { POLICE, STEP } from './config.js';
import { clamp } from './util.js';
import { SCREEN_BUSTED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { startMission } from './missions.js';
import { makeCar } from './vehicles.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 5;
const CHASE_SECONDS = 6;
const MISSION_SECONDS = 4;

/** A control set with everything off. */
function idleCtl() {
  return { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, aimX: 0, aimY: 0 };
}

/**
 * Drive the player's car east along a horizontal road: throttle on, steer at the
 * road's centreline (with a gentle swerve when asked), so the car stays on the
 * asphalt instead of cutting across blocks. `roadY` is the road's centreline.
 */
function followRoad(state, roadY, swerve, t) {
  const ctl = idleCtl();
  const car = state.player.car;
  if (!car) return ctl;
  const lateral = clamp((roadY - car.y) * 0.012, -0.45, 0.45);
  const sway = Math.sin(t * 1.4) * swerve;
  const want = lateral + sway; // east is angle 0
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ctl.up = true;
  ctl.left = diff < -0.06;
  ctl.right = diff > 0.06;
  ctl.aimX = car.x + Math.cos(car.angle) * 200;
  ctl.aimY = car.y + Math.sin(car.angle) * 200;
  return ctl;
}

/** Walk the player toward a point. */
function walkToward(state, tx, ty) {
  const ctl = idleCtl();
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  ctl.up = dy < -20;
  ctl.down = dy > 20;
  ctl.left = dx < -20;
  ctl.right = dx > 20;
  ctl.run = d > 150;
  ctl.aimX = tx;
  ctl.aimY = ty;
  return ctl;
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other name
 * is start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const { state, step } = world;
  world.reset();
  const places = state.city.places;

  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    // Title screen over a living city: traffic and pedestrians move, nobody plays.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      step(STEP, idleCtl());
    }
    return { screen: SCREEN_TITLE };
  }

  if (name === 'drive') {
    // Put the player in a car on the north edge of Harbor Road (y=600) and drive
    // east along it, through traffic, HUD and minimap up.
    const car = makeCar(320, 558, 0, 'parked', state.random);
    state.cars.push(car);
    state.player.x = car.x;
    state.player.y = car.y;
    step(STEP, { ...idleCtl(), enter: true });
    // A clean cruise for this shot: the steal's heat is forgiven here.
    state.heat = 0;
    state.stars = 0;
    for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
      step(STEP, followRoad(state, 600, 0, i * STEP));
    }
    return { screen: SCREEN_PLAY };
  }

  if (name === 'chase') {
    // Three wanted stars, police cars on the tail, the player fleeing east down
    // the avenue with a swerve, sirens behind them.
    const car = makeCar(400, 1358, 0, 'parked', state.random);
    state.cars.push(car);
    state.player.x = car.x;
    state.player.y = car.y;
    step(STEP, { ...idleCtl(), enter: true });
    state.heat = 60;
    state.stars = 3;
    state.lastCrime = state.time;
    // Two patrol cars right on the player's tail, so the chase is in the frame.
    const pc1 = makeCar(400 - 260, 1400 + 24, 0, 'police', state.random);
    pc1.topSpeed = POLICE.carSpeed;
    pc1.speed = 500;
    const pc2 = makeCar(400 - 480, 1400 - 24, 0, 'police', state.random);
    pc2.topSpeed = POLICE.carSpeed;
    pc2.speed = 480;
    state.cars.push(pc1, pc2);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      step(STEP, followRoad(state, 1400, 0.22, i * STEP));
    }
    return { screen: SCREEN_PLAY };
  }

  // Mission: mission 2 is active (steal the Comet GT) and the player is on foot
  // on the road just south of the marked car, about to take it.
  startMission(state, 1, state.random);
  const comet = state.mission.targetCar;
  state.player.x = comet.x;
  state.player.y = comet.y + 210;
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    step(STEP, walkToward(state, comet.x, comet.y));
  }
  return { screen: SCREEN_PLAY };
}

export { SCREEN_BUSTED, SCREEN_WASTED };
