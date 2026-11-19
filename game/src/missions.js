// Missions: the story of Neon Bay. A newcomer does jobs for Vex, a fixer who runs
// work out of a noodle bar. Five story missions, then endless courier jobs. Each
// mission is a short chain of steps — go somewhere, steal a car, deliver it, lose
// the heat — with a marker on the map and the minimap, and cash on completion.
import { MISSIONS, WANTED } from './config.js';
import { dist, range } from './util.js';
import { makeCar } from './vehicles.js';

// Where the silver Comet GT waits for mission 2 (road edge, facing south).
const COMET_SPOT = { x: 1842, y: 350, angle: Math.PI / 2 };

function stepGoto(x, y, text) {
  return { type: 'goto', x, y, radius: 70, text };
}
function stepSteal(text) {
  return { type: 'steal', text };
}
function stepDeliver(x, y, text) {
  return { type: 'deliver', x, y, radius: 70, text };
}
function stepEscape(text) {
  return { type: 'escape', text };
}

function missionSteps(index, places) {
  switch (index) {
    case 0:
      return [stepGoto(places.noodleBar.x, places.noodleBar.y, 'Get to Vex\'s Noodle Bar')];
    case 1:
      return [
        stepSteal('Steal the silver Comet GT'),
        stepDeliver(places.chopShop.x, places.chopShop.y, 'Deliver the Comet to the Chop Shop'),
      ];
    case 2:
      return [
        stepGoto(places.docks.x, places.docks.y, 'Pick up the package at the Docks'),
        stepDeliver(places.hotel.x, places.hotel.y, 'Deliver the package to the Meridian Hotel'),
      ];
    case 3:
      return [
        stepEscape('Lose the heat — get your wanted level to zero'),
        stepGoto(places.safehouse.x, places.safehouse.y, 'Lay low at the Safehouse'),
      ];
    case 4:
      return [
        stepGoto(places.bank.x, places.bank.y, 'Hit the Bay Bank and grab the cash'),
        stepDeliver(places.safehouse.x, places.safehouse.y, 'Escape to the Safehouse with the cash'),
      ];
    default:
      return [];
  }
}

function spawnComet(state, random) {
  const car = makeCar(COMET_SPOT.x, COMET_SPOT.y, COMET_SPOT.angle, 'mission', random);
  car.topSpeed = 600; // the Comet GT is the fastest car in Neon Bay
  car.color = '#c0c0c8';
  state.cars.push(car);
  state.mission.targetCar = car;
  return car;
}

export function startMission(state, index, random) {
  const def = MISSIONS[index];
  state.mission = {
    index,
    title: def.title,
    giver: def.giver,
    brief: def.brief,
    reward: def.reward,
    steps: missionSteps(index, state.city.places),
    step: 0,
    timer: 0,
    timerMax: 0,
    targetCar: null,
    active: true,
  };
  if (index === 1) spawnComet(state, random);
  if (index === 3) {
    // The drop was a setup: the Bay PD is already on you.
    state.heat = 58;
    state.stars = 3;
    state.lastCrime = state.time;
  }
  state.missionText = def.brief;
}

function startCourier(state, random) {
  const places = state.city.places;
  const spots = [places.docks, places.hotel, places.bank, places.noodleBar, places.chopShop];
  const from = spots[Math.floor(random() * spots.length)];
  let to = spots[Math.floor(random() * spots.length)];
  while (to === from) to = spots[Math.floor(random() * spots.length)];
  const reward = 150 + Math.floor(random() * 4) * 50;
  state.mission = {
    index: -1,
    title: 'Courier Job',
    giver: 'Vex',
    brief: `A client needs a package moved from ${from.name} to ${to.name}. Quick and quiet pays best.`,
    reward,
    steps: [
      stepGoto(from.x, from.y, `Pick up the package at ${from.name}`),
      stepDeliver(to.x, to.y, `Deliver the package to ${to.name}`),
    ],
    step: 0,
    timer: 0,
    timerMax: 0,
    targetCar: null,
    active: true,
  };
  state.missionText = state.mission.brief;
}

function failMission(state, reason) {
  state.toast = { text: reason, until: state.time + 3 };
  state.events.missionFail = true;
  startMission(state, state.mission.index, state.random);
}

function completeMission(state) {
  const m = state.mission;
  state.cash += m.reward;
  state.stats.missionsDone += 1;
  state.events.missionDone = true;
  state.toast = { text: `Mission complete: ${m.title}  +$${m.reward}`, until: state.time + 3.5 };
  state.mission.active = false;
  if (m.index >= 0 && m.index < MISSIONS.length - 1) {
    startMission(state, m.index + 1, state.random);
  } else if (m.index === MISSIONS.length - 1) {
    state.storyDone = true;
    state.toast = { text: `The Big Score is done — Neon Bay is yours. Courier jobs keep coming.`, until: state.time + 4 };
    startCourier(state, state.random);
  } else {
    startCourier(state, state.random);
  }
}

export function updateMissions(state, dt, random) {
  const m = state.mission;
  if (!m || !m.active) return;
  const p = state.player;

  // Mission 3's clock starts at the pickup and runs to the delivery.
  if (m.timerMax > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'Too slow — the client walked. Vex is giving you another shot.');
      return;
    }
  }

  const step = m.steps[m.step];
  if (!step) return;

  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;

  switch (step.type) {
    case 'goto': {
      if (dist(px, py, step.x, step.y) < step.radius) {
        advance(state);
      }
      break;
    }
    case 'steal': {
      if (p.car === m.targetCar) advance(state);
      // The Comet got wrecked before you stole it: Vex finds another one.
      if (m.targetCar && m.targetCar.wrecked) {
        state.cars.splice(state.cars.indexOf(m.targetCar), 1);
        spawnComet(state, random);
        state.toast = { text: 'The Comet is wrecked — Vex found another one.', until: state.time + 3 };
      }
      break;
    }
    case 'deliver': {
      const needCar = m.index === 1 || m.index === 4 || m.index === -1;
      const inRightCar = !needCar || (m.index === 1 ? p.car === m.targetCar : true);
      if (inRightCar && dist(px, py, step.x, step.y) < step.radius) {
        advance(state);
      }
      break;
    }
    case 'escape': {
      if (state.stars === 0) advance(state);
      break;
    }
    default:
      break;
  }
}

function advance(state) {
  const m = state.mission;
  // Mission 3: the timer starts when the package is picked up.
  if (m.index === 2 && m.step === 0) {
    m.timerMax = 90;
    m.timer = 90;
    state.events.pickup = true;
  }
  // Mission 5: grabbing the cash puts the whole city on alert.
  if (m.index === 4 && m.step === 0) {
    state.heat = Math.max(state.heat, 78);
    state.stars = 4;
    state.lastCrime = state.time;
    state.events.wantedUp = true;
    state.toast = { text: 'The vault is open — the whole Bay PD is coming. Run!', until: state.time + 3.5 };
  }
  m.step += 1;
  if (m.step >= m.steps.length) {
    completeMission(state);
  } else {
    state.events.stepDone = true;
  }
}

/** Where the current objective points, for the map marker and the minimap. */
export function missionMarker(state) {
  const m = state.mission;
  if (!m || !m.active) return null;
  const step = m.steps[m.step];
  if (!step) return null;
  if (step.type === 'steal' && m.targetCar) {
    return { x: m.targetCar.x, y: m.targetCar.y, kind: 'car' };
  }
  if (step.type === 'escape') {
    return { x: state.city.places.safehouse.x, y: state.city.places.safehouse.y, kind: 'point' };
  }
  return { x: step.x, y: step.y, kind: 'point' };
}

/** The objective line the HUD shows, with distance and the timer when one runs. */
export function missionText(state) {
  const m = state.mission;
  if (!m || !m.active) return '';
  const step = m.steps[m.step];
  if (!step) return '';
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  let target = step.type === 'steal' && m.targetCar
    ? { x: m.targetCar.x, y: m.targetCar.y }
    : step.type === 'escape'
      ? state.city.places.safehouse
      : step;
  const d = Math.round(dist(px, py, target.x, target.y));
  let text = `${m.title} — ${step.text} (${d}m)`;
  if (m.timerMax > 0) text += `  ⏱ ${Math.ceil(m.timer)}s`;
  return text;
}
