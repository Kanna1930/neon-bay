// Particles: sparks, smoke, skid marks and the screen shake that sells a crash.
// Nothing here knows about rules; the world pushes particles in and the renderer draws them.
import { clamp } from './util.js';

export function spawnCrash(state, x, y) {
  for (let i = 0; i < 10; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 160;
    state.particles.push({
      kind: 'spark', x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.3, max: 0.7, size: 3 + Math.random() * 3,
      color: Math.random() < 0.5 ? '#facc15' : '#fb923c',
    });
  }
  for (let i = 0; i < 4; i += 1) {
    state.particles.push({
      kind: 'smoke', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30,
      life: 0.9 + Math.random() * 0.6, max: 1.5, size: 10 + Math.random() * 8,
      color: '#6b7280',
    });
  }
}

export function spawnSkid(state, x, y, angle) {
  state.skids.push({ x, y, angle, life: 6 });
  if (state.skids.length > 220) state.skids.splice(0, state.skids.length - 220);
}

export function spawnSmoke(state, x, y) {
  state.particles.push({
    kind: 'smoke', x, y,
    vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
    life: 0.8, max: 0.8, size: 9 + Math.random() * 6,
    color: '#4b5563',
  });
}

export function updateParticles(state, dt) {
  for (const pt of [...state.particles]) {
    pt.life -= dt;
    if (pt.life <= 0) {
      state.particles.splice(state.particles.indexOf(pt), 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2 * dt;
    pt.vy *= 1 - 2 * dt;
  }
  for (const skid of [...state.skids]) {
    skid.life -= dt;
    if (skid.life <= 0) state.skids.splice(state.skids.indexOf(skid), 1);
  }
  state.shake = Math.max(0, state.shake - dt * 1.4);
  state.muzzle = Math.max(0, (state.muzzle ?? 0) - dt);
}

export function shakeOffset(state) {
  if (state.shake <= 0) return { x: 0, y: 0 };
  const s = state.shake * 14;
  return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
}

export { clamp };
