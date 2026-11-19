// The city of Neon Bay: a road grid, blocks of buildings and parks, a waterfront
// promenade and the bay itself. Generation is deterministic from the seed, so a saved
// game always reloads the same streets. Nothing here draws; it answers questions:
// is this point solid, is it road, where is the nearest road, where can cars park.
import { BEACH_Y, PALETTE, ROADS_X, ROADS_Y, ROAD_HALF, WALK_HALF, WATER_Y, WORLD } from './config.js';
import { circleRect, intRange, pick, range } from './util.js';

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const lamps = [];

  // Blocks sit between neighbouring road centrelines. The last row (south of the
  // 2200 road) is the waterfront promenade: a park, never buildings.
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length; iy += 1) {
      const x0 = ROADS_X[ix] + WALK_HALF;
      const x1 = ROADS_X[ix + 1] - WALK_HALF;
      const y0 = ROADS_Y[iy] + WALK_HALF;
      const y1 = iy + 1 < ROADS_Y.length ? ROADS_Y[iy + 1] - WALK_HALF : BEACH_Y - 8;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 40 || h < 40) continue;
      const waterfront = iy === ROADS_Y.length - 1;
      const roll = random();
      if (waterfront || roll < 0.16) {
        // A park: grass, trees, a few lamps.
        parks.push({ x: x0, y: y0, w, h });
        const count = Math.floor((w * h) / 9000);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: range(random, x0 + 14, x1 - 14), y: range(random, y0 + 14, y1 - 14), r: range(random, 7, 12) });
        }
        continue;
      }
      if (roll < 0.26) {
        // A parking lot: no buildings, cars park here.
        parks.push({ x: x0, y: y0, w, h, lot: true });
        continue;
      }
      // Buildings: one big one, or two to four smaller ones.
      const n = random() < 0.45 ? 1 : intRange(random, 2, 4);
      for (let b = 0; b < n; b += 1) {
        const bw = range(random, 70, Math.min(220, w - 16));
        const bh = range(random, 60, Math.min(200, h - 16));
        const bx = range(random, x0 + 8, x1 - bw - 8);
        const by = range(random, y0 + 8, y1 - bh - 8);
        // Keep buildings from overlapping each other in the same block.
        let ok = true;
        for (const other of buildings) {
          if (bx < other.x + other.w + 14 && bx + bw + 14 > other.x && by < other.y + other.h + 14 && by + bh + 14 > other.y) { ok = false; break; }
        }
        if (!ok) continue;
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          neon: pick(random, PALETTE.neon),
          windows: intRange(random, 3, 9),
          seed: random(),
        });
      }
    }
  }

  // Street lamps at every intersection corner, for the dusk glow.
  for (const rx of ROADS_X) {
    for (const ry of ROADS_Y) {
      lamps.push({ x: rx + ROAD_HALF + 6, y: ry + ROAD_HALF + 6 });
      lamps.push({ x: rx - ROAD_HALF - 6, y: ry - ROAD_HALF - 6 });
    }
  }

  // Named places the missions and the story point at. All are road points, so a
  // car can always reach them.
  const places = {
    safehouse: { x: 200, y: 200, name: 'Safehouse' },
    noodleBar: { x: 1000, y: 600, name: "Vex's Noodle Bar" },
    chopShop: { x: 2600, y: 1400, name: 'Chop Shop' },
    docks: { x: 3400, y: 2200, name: 'Docks' },
    hotel: { x: 600, y: 1400, name: 'Meridian Hotel' },
    bank: { x: 2200, y: 1000, name: 'Bay Bank' },
  };

  function inWater(x, y) {
    return y >= WATER_Y;
  }

  function buildingAt(x, y, r) {
    for (const b of buildings) {
      if (circleRect(x, y, r, b.x, b.y, b.w, b.h)) return b;
    }
    return null;
  }

  /** True when a circle of radius r at (x, y) cannot be there: building, water, or outside the world. */
  function solidAt(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return true;
    if (inWater(x, y)) return true;
    return buildingAt(x, y, r) !== null;
  }

  /** True when the point is on a road surface (not sidewalk, not block). */
  function onRoad(x, y) {
    for (const rx of ROADS_X) if (Math.abs(x - rx) <= ROAD_HALF) return true;
    for (const ry of ROADS_Y) if (Math.abs(y - ry) <= ROAD_HALF) return true;
    return false;
  }

  function onSidewalk(x, y) {
    for (const rx of ROADS_X) if (Math.abs(x - rx) <= WALK_HALF && Math.abs(x - rx) > ROAD_HALF) return true;
    for (const ry of ROADS_Y) if (Math.abs(y - ry) <= WALK_HALF && Math.abs(y - ry) > ROAD_HALF) return true;
    return false;
  }

  /** Nearest point on a road centreline to (x, y), and which road it is. */
  function nearestRoad(x, y) {
    let best = null;
    for (const rx of ROADS_X) {
      const d = Math.abs(x - rx);
      if (!best || d < best.d) best = { d, x: rx, y, axis: 'v', road: rx };
    }
    for (const ry of ROADS_Y) {
      const d = Math.abs(y - ry);
      if (!best || d < best.d) best = { d, x, y: ry, axis: 'h', road: ry };
    }
    return best;
  }

  /** A random point on a road edge (where parked cars sit), facing along the road. */
  function parkedSpot() {
    if (random() < 0.5) {
      const rx = pick(random, ROADS_X);
      const side = random() < 0.5 ? -1 : 1;
      return { x: rx + side * (ROAD_HALF - 6), y: range(random, 120, 2280), angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 };
    }
    const ry = pick(random, ROADS_Y);
    const side = random() < 0.5 ? -1 : 1;
    return { x: range(random, 120, 3480), y: ry + side * (ROAD_HALF - 6), angle: side > 0 ? 0 : Math.PI };
  }

  /** A random point on a sidewalk, for a pedestrian to start on. */
  function sidewalkSpot() {
    if (random() < 0.5) {
      const rx = pick(random, ROADS_X);
      const side = random() < 0.5 ? -1 : 1;
      return { x: rx + side * (ROAD_HALF + 8), y: range(random, 120, 2600) };
    }
    const ry = pick(random, ROADS_Y);
    const side = random() < 0.5 ? -1 : 1;
    return { x: range(random, 120, 3480), y: ry + side * (ROAD_HALF + 8) };
  }

  return { buildings, parks, trees, lamps, places, inWater, buildingAt, solidAt, onRoad, onSidewalk, nearestRoad, parkedSpot, sidewalkSpot };
}
