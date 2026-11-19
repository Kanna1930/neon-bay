// Pedestrians: ordinary people walking the sidewalks of Neon Bay. They stroll along
// a road's sidewalk, turn at intersections, and run from danger — a speeding car, a
// gunshot, or a punch. Knocked down, they drop a little cash and get back up elsewhere.
import { PEDS, ROADS_X, ROADS_Y, ROAD_HALF } from './config.js';
import { dist, dist2, pick, range } from './util.js';

const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9', '#fdcb6e'];

let nextId = 1;

export function makePed(city, random, x, y) {
  const spot = x === undefined ? city.sidewalkSpot() : { x, y };
  // Find the road this sidewalk belongs to, so the ped can walk along it.
  let axis = 'h';
  let road = ROADS_Y[0];
  let best = 1e9;
  for (const rx of ROADS_X) {
    const d = Math.abs(spot.x - rx);
    if (d <= ROAD_HALF + 10 && d < best) { best = d; axis = 'v'; road = rx; }
  }
  for (const ry of ROADS_Y) {
    const d = Math.abs(spot.y - ry);
    if (d <= ROAD_HALF + 10 && d < best) { best = d; axis = 'h'; road = ry; }
  }
  return {
    id: nextId += 1,
    x: spot.x, y: spot.y,
    axis, road,
    dir: random() < 0.5 ? 1 : -1,
    speed: range(random, PEDS.walkMin, PEDS.walkMax),
    shirt: pick(random, SHIRTS),
    flee: 0, fleeX: 0, fleeY: 0,
    down: 0, // seconds left lying down
    cash: 5 + Math.floor(random() * 16),
    phase: random() * Math.PI * 2, // walk-cycle phase for the little leg swing
  };
}

export function spawnPeds(city, random) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) peds.push(makePed(city, random));
  return peds;
}

/** Make every ped within `radius` of (x, y) run away from it. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.down > 0) continue;
    if (dist2(ped.x, ped.y, x, y) < radius * radius) {
      ped.flee = 2.5 + Math.random() * 1.5;
      ped.fleeX = x; ped.fleeY = y;
    }
  }
}

export function updatePeds(peds, dt, city, random) {
  for (const ped of peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      if (ped.down <= 0) {
        // Get back up somewhere else, out of trouble.
        const spot = city.sidewalkSpot();
        ped.x = spot.x; ped.y = spot.y;
        ped.flee = 0;
      }
      continue;
    }
    ped.phase += dt * (ped.flee > 0 ? 14 : 7);
    if (ped.flee > 0) {
      ped.flee -= dt;
      const d = Math.max(1, dist(ped.x, ped.y, ped.fleeX, ped.fleeY));
      const nx = ped.x + ((ped.x - ped.fleeX) / d) * PEDS.fleeSpeed * dt;
      const ny = ped.y + ((ped.y - ped.fleeY) / d) * PEDS.fleeSpeed * dt;
      if (!city.solidAt(nx, ny, 10)) { ped.x = nx; ped.y = ny; }
      continue;
    }
    // Stroll along the sidewalk. At an intersection, sometimes turn onto the crossing road.
    const pos = ped.axis === 'v' ? ped.y : ped.x;
    const roads = ped.axis === 'v' ? ROADS_Y : ROADS_X;
    let atCross = false;
    for (const r of roads) if (Math.abs(pos - r) < 12) { atCross = true; break; }
    if (atCross && random() < 0.015) {
      if (ped.axis === 'v') {
        ped.axis = 'h'; ped.road = ped.y;
        ped.dir = random() < 0.5 ? 1 : -1;
        ped.y = ped.road + (ped.dir === 1 ? ROAD_HALF + 8 : -ROAD_HALF - 8);
      } else {
        ped.axis = 'v'; ped.road = ped.x;
        ped.dir = random() < 0.5 ? 1 : -1;
        ped.x = ped.road + (ped.dir === 1 ? ROAD_HALF + 8 : -ROAD_HALF - 8);
      }
    }
    const step = ped.dir * ped.speed * dt;
    if (ped.axis === 'v') {
      const ny = ped.y + step;
      if (ny < 90 || ny > 2620) ped.dir *= -1;
      else if (!city.solidAt(ped.x, ny, 10)) ped.y = ny;
      else ped.dir *= -1;
    } else {
      const nx = ped.x + step;
      if (nx < 90 || nx > 3510) ped.dir *= -1;
      else if (!city.solidAt(nx, ped.y, 10)) ped.x = nx;
      else ped.dir *= -1;
    }
  }
}

/** The nearest standing ped to (x, y) within `rangePx`, or null. */
export function nearestPed(peds, x, y, rangePx) {
  let best = null;
  let bestD = rangePx * rangePx;
  for (const ped of peds) {
    if (ped.down > 0) continue;
    const d2 = dist2(x, y, ped.x, ped.y);
    if (d2 < bestD) { bestD = d2; best = ped; }
  }
  return best;
}
