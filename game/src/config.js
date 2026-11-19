// Neon Bay — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window.
// The world is a 3600x2800 top-down city; the camera follows the player.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 3600, height: 2800 };

// Road centrelines. Roads are 96 wide with a 16 px sidewalk on each side.
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_HALF = 48;
export const WALK_HALF = 64; // road half-width + sidewalk

// The bay: beach from BEACH_Y, water from WATER_Y to the bottom of the world.
export const BEACH_Y = 2664;
export const WATER_Y = 2740;

export const PLAYER = {
  radius: 14,
  walkSpeed: 170,
  runSpeed: 285,
  health: 100,
  punchRange: 46,
  punchDamage: 34,
  shootCooldown: 0.22,
  bulletSpeed: 920,
  bulletRange: 560,
  bulletDamage: 26,
};

export const CAR = {
  radius: 20, // collision circle, roughly half the car length
  length: 46,
  width: 24,
  accel: 300,
  brake: 420,
  reverseAccel: 200,
  maxSpeed: 540,
  maxReverse: 170,
  steerRate: 2.4, // rad/s at full speed
  drag: 0.55, // 1/s passive slowdown
  health: 100,
};

export const TRAFFIC = { count: 10, speedMin: 130, speedMax: 190 };
export const PARKED = { count: 8 };
export const PEDS = { count: 24, walkMin: 42, walkMax: 72, fleeSpeed: 175 };

// Wanted: heat 0..100; stars from thresholds. Crimes add heat, laying low drains it.
export const WANTED = {
  thresholds: [12, 32, 55, 76, 92], // heat at which each star appears
  decay: 4.5, // heat/s while quiet
  decayHot: 1.6, // heat/s at 3+ stars while quiet
  quietAfter: 7, // seconds after the last crime before decay starts
  stealCar: 14,
  hitPed: 12,
  shoot: 5,
  shootHit: 7,
  punch: 4,
  hitCar: 3,
  ramPolice: 10,
  max: 100,
};

export const POLICE = {
  carSpeed: 580,
  copSpeed: 205,
  ramDamage: 6,
  ramCooldown: 0.6,
  shootRange: 420,
  shootCooldown: 0.9,
  shootDamage: 7,
  grabTime: 1.2, // seconds a cop must touch the player on foot to bust them
  bustTime: 2.5, // seconds at near-zero speed next to a police car to be busted
  bustSpeed: 45,
  spawnDistance: 750,
};

export const MISSIONS = [
  {
    id: 'm1',
    title: 'New in Town',
    giver: 'Vex',
    brief: 'You just rolled into Neon Bay with fifty bucks and a borrowed jacket. Vex runs jobs out of the noodle bar on Dock Street. Get to the meet point and hear her out.',
    reward: 150,
  },
  {
    id: 'm2',
    title: 'Hot Wheels',
    giver: 'Vex',
    brief: 'A buyer wants a silver Comet GT, no questions asked. Steal the marked car and deliver it to the chop shop on Harbor Road.',
    reward: 300,
  },
  {
    id: 'm3',
    title: 'Package Run',
    giver: 'Vex',
    brief: 'Pick up the package at the docks and get it to the Meridian Hotel. Ninety seconds. The client does not like waiting.',
    reward: 400,
  },
  {
    id: 'm4',
    title: 'Heat Wave',
    giver: 'Vex',
    brief: 'The drop was a setup — the Bay PD is all over you. Lose the heat, then lay low at the safehouse. Do not get caught.',
    reward: 500,
  },
  {
    id: 'm5',
    title: 'The Big Score',
    giver: 'Vex',
    brief: 'One last job: the Bay Bank on Harbor Road. Grab the cash, then run the gauntlet back to the safehouse. After this, Neon Bay is yours.',
    reward: 1000,
  },
];

export const SAVE_KEY = 'neon-bay.save.v1';

export const PALETTE = {
  backdrop: '#0b0e1a',
  grass: '#101a14',
  park: '#142a1c',
  sand: '#8a7a52',
  water: '#0d2b45',
  waterDeep: '#0a2036',
  road: '#1c1f2b',
  roadEdge: '#2b3040',
  sidewalk: '#333848',
  lane: '#c8b25a',
  building: '#1d2233',
  buildingRoof: '#262c42',
  neon: ['#22d3ee', '#f472b6', '#facc15', '#4ade80', '#a78bfa', '#fb923c'],
  text: '#eef1f5',
  muted: '#9aa3b5',
  cash: '#4ade80',
  health: '#4ade80',
  healthLow: '#ef4444',
  star: '#facc15',
  starEmpty: '#3a4157',
  police: '#3b82f6',
  policeRed: '#ef4444',
  marker: '#facc15',
  markerCar: '#fb923c',
  player: '#f8fafc',
  panel: 'rgba(10, 13, 24, 0.82)',
  panelBorder: '#2e3550',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
