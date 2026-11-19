// Combat: a pistol (mouse aim, click to shoot) and a punch for up close. Bullets
// fly straight, hit pedestrians, cops and cars, and scare everyone nearby. Every
// shot is a crime, so the wanted level notices.
import { CAR, PLAYER, WANTED } from './config.js';
import { circleRect, dist2 } from './util.js';
import { addHeat } from './police.js';
import { nearestPed, scarePeds } from './pedestrians.js';

export function tryShoot(state, aimX, aimY) {
  const p = state.player;
  if (p.shootTimer > 0) return;
  p.shootTimer = PLAYER.shootCooldown;
  const ox = p.car ? p.car.x : p.x;
  const oy = p.car ? p.car.y : p.y;
  const angle = Math.atan2(aimY - oy, aimX - ox);
  p.aimAngle = angle;
  state.bullets.push({
    x: ox + Math.cos(angle) * 22,
    y: oy + Math.sin(angle) * 22,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    range: PLAYER.bulletRange,
    damage: PLAYER.bulletDamage,
    from: 'player',
  });
  state.events.shot = true;
  state.muzzle = 0.08;
  state.shake = Math.max(state.shake, 0.12);
  state.stats.shotsFired += 1;
  addHeat(state, WANTED.shoot);
  scarePeds(state.peds, ox, oy, 260);
}

/** Punch the nearest person in front of the player; they drop their cash. */
export function tryPunch(state) {
  const p = state.player;
  if (p.car) return;
  if (p.punchTimer > 0) return;
  p.punchTimer = 0.35;
  const target = nearestPed(state.peds, p.x, p.y, PLAYER.punchRange);
  if (target) {
    target.down = 6;
    state.cashDrops.push({ x: target.x, y: target.y, amount: target.cash, life: 20 });
    state.events.punch = true;
    addHeat(state, WANTED.punch);
    scarePeds(state.peds, p.x, p.y, 200);
  } else {
    state.events.swing = true;
  }
}

export function updateBullets(state, dt) {
  for (const b of [...state.bullets]) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.range -= Math.hypot(b.vx, b.vy) * dt;
    let dead = b.range <= 0;
    // Buildings stop bullets.
    if (!dead && state.city.buildingAt(b.x, b.y, 1)) dead = true;
    if (!dead && state.city.inWater(b.x, b.y)) dead = true;
    if (!dead) {
      if (b.from === 'player') {
        // Hit a pedestrian or a cop?
        for (const ped of state.peds) {
          if (ped.down > 0) continue;
          if (dist2(b.x, b.y, ped.x, ped.y) < 14 * 14) {
            ped.down = 8;
            state.cashDrops.push({ x: ped.x, y: ped.y, amount: ped.cash, life: 20 });
            addHeat(state, WANTED.shootHit);
            state.events.hitPed = true;
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of state.cops) {
            if (dist2(b.x, b.y, cop.x, cop.y) < 14 * 14) {
              state.cops.splice(state.cops.indexOf(cop), 1);
              addHeat(state, WANTED.shootHit + 4);
              state.events.hitCop = true;
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          // Hit a car: damage it; a wrecked car stops and smokes.
          for (const car of state.cars) {
            if (car.wrecked) continue;
            const dx = b.x - car.x;
            const dy = b.y - car.y;
            const along = Math.abs(Math.cos(car.angle) * dx + Math.sin(car.angle) * dy);
            const across = Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy);
            if (along < CAR.length / 2 + 4 && across < CAR.width / 2 + 4) {
              car.health -= b.damage;
              if (car.health <= 0) {
                car.wrecked = true;
                car.smoke = 1;
                state.events.wreck = true;
              }
              state.events.hitCar = true;
              dead = true;
              break;
            }
          }
        }
      } else {
        // A cop's bullet: only the player is a target.
        const px = state.player.car ? state.player.car.x : state.player.x;
        const py = state.player.car ? state.player.car.y : state.player.y;
        if (dist2(b.x, b.y, px, py) < 16 * 16) {
          state.player.health -= b.damage;
          state.events.playerHit = true;
          dead = true;
        }
      }
    }
    if (dead) {
      state.bullets.splice(state.bullets.indexOf(b), 1);
      state.particles.push({ kind: 'spark', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 5, color: '#facc15' });
    }
  }
  // Pick up cash lying on the street.
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (const drop of [...state.cashDrops]) {
    drop.life -= dt;
    if (drop.life <= 0) {
      state.cashDrops.splice(state.cashDrops.indexOf(drop), 1);
      continue;
    }
    if (dist2(px, py, drop.x, drop.y) < 26 * 26) {
      state.cash += drop.amount;
      state.events.pickup = true;
      state.cashDrops.splice(state.cashDrops.indexOf(drop), 1);
    }
  }
}
