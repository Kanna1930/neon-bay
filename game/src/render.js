// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred. The camera shows a
// slice of the city; the HUD, the mission line and the minimap are screen space.
// Flat shapes, canvas text, a dusk tint and headlight cones for the neon look.
import { BEACH_Y, CAR, FONT, PALETTE, PLAYER, ROADS_X, ROADS_Y, ROAD_HALF, VIEW, WALK_HALF, WATER_Y, WORLD } from './config.js';
import { clamp } from './util.js';
import { missionMarker, missionText } from './missions.js';
import { shakeOffset } from './particles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = { x: VIEW.width - 216, y: 14, w: 202, h: 158 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', bold = false) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  /** Convert a world point to view (logical 1280x720) coordinates. */
  function worldToView(wx, wy, cam) {
    return { x: wx - cam.x, y: wy - cam.y };
  }

  function drawCity(state) {
    const cam = state.camera;
    const shake = shakeOffset(state);
    const ox = -cam.x + shake.x;
    const oy = -cam.y + shake.y;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD.width, cam.x + VIEW.width + 40);
    const y1 = Math.min(WORLD.height, cam.y + VIEW.height + 40);

    // Ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Parks (and parking lots).
    for (const park of state.city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = park.lot ? '#20242f' : PALETTE.park;
      ctx.fillRect(park.x + ox, park.y + oy, park.w, park.h);
      if (park.lot) {
        ctx.strokeStyle = '#3a4157';
        ctx.lineWidth = 2;
        for (let lx = park.x + 24; lx < park.x + park.w - 10; lx += 48) {
          ctx.beginPath();
          ctx.moveTo(lx + ox, park.y + 8 + oy);
          ctx.lineTo(lx + ox, park.y + park.h - 8 + oy);
          ctx.stroke();
        }
      }
    }

    // Beach and the bay.
    if (y1 > BEACH_Y) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(0, BEACH_Y + oy, VIEW.width, WATER_Y - BEACH_Y);
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(0, WATER_Y + oy, VIEW.width, VIEW.height - (WATER_Y + oy));
      ctx.fillStyle = PALETTE.waterDeep;
      for (let wx = 60; wx < VIEW.width; wx += 180) {
        const wy = WATER_Y + 40 + ((wx * 7) % 60);
        ctx.fillRect(wx, wy + oy, 90, 3);
      }
      // The waterline sparkles.
      ctx.fillStyle = 'rgba(120, 200, 255, 0.35)';
      for (let wx = 20; wx < VIEW.width; wx += 90) {
        ctx.fillRect(wx, WATER_Y + 2 + oy, 34, 2);
      }
    }

    // Roads: all sidewalk bands first, then all asphalt, then centre dashes —
    // so intersections read as road, not as sidewalk crossing road.
    for (const rx of ROADS_X) {
      if (rx < x0 - 80 || rx > x1 + 80) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(rx - WALK_HALF + ox, 0, WALK_HALF * 2, VIEW.height);
    }
    for (const ry of ROADS_Y) {
      if (ry < y0 - 80 || ry > y1 + 80) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(0, ry - WALK_HALF + oy, VIEW.width, WALK_HALF * 2);
    }
    for (const rx of ROADS_X) {
      if (rx < x0 - 80 || rx > x1 + 80) continue;
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(rx - ROAD_HALF + ox, 0, ROAD_HALF * 2, VIEW.height);
      ctx.fillStyle = PALETTE.lane;
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
        ctx.fillRect(rx - 2 + ox, y + oy, 4, 22);
      }
    }
    for (const ry of ROADS_Y) {
      if (ry < y0 - 80 || ry > y1 + 80) continue;
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(0, ry - ROAD_HALF + oy, VIEW.width, ROAD_HALF * 2);
      ctx.fillStyle = PALETTE.lane;
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
        ctx.fillRect(x + ox, ry - 2 + oy, 22, 4);
      }
    }

    // Trees.
    for (const tree of state.city.trees) {
      if (tree.x < x0 || tree.x > x1 || tree.y < y0 || tree.y > y1) continue;
      ctx.fillStyle = '#1d4d2b';
      ctx.beginPath();
      ctx.arc(tree.x + ox, tree.y + oy, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c6b3c';
      ctx.beginPath();
      ctx.arc(tree.x + ox - 2, tree.y + oy - 2, tree.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Skid marks.
    for (const skid of state.skids) {
      if (skid.x < x0 || skid.x > x1 || skid.y < y0 || skid.y > y1) continue;
      ctx.save();
      ctx.translate(skid.x + ox, skid.y + oy);
      ctx.rotate(skid.angle);
      ctx.fillStyle = `rgba(8, 8, 12, ${0.55 * (skid.life / 6)})`;
      ctx.fillRect(-14, -3, 28, 3);
      ctx.fillRect(-14, 3, 28, 3);
      ctx.restore();
    }

    // Buildings: shadow, roof, neon edge, rooftop details.
    for (const b of state.city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(b.x + 6 + ox, b.y + 8 + oy, b.w, b.h);
      ctx.fillStyle = PALETTE.building;
      ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
      ctx.fillStyle = PALETTE.buildingRoof;
      ctx.fillRect(b.x + 4 + ox, b.y + 4 + oy, b.w - 8, b.h - 8);
      ctx.strokeStyle = b.neon;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 2 + ox, b.y + 2 + oy, b.w - 4, b.h - 4);
      ctx.globalAlpha = 1;
      // Rooftop units, placed deterministically from the building's seed.
      ctx.fillStyle = '#39415c';
      for (let w = 0; w < b.windows; w += 1) {
        const wx = b.x + 10 + ((b.seed * 997 + w * 53) % Math.max(10, b.w - 24));
        const wy = b.y + 10 + ((b.seed * 613 + w * 37) % Math.max(10, b.h - 24));
        ctx.fillRect(wx + ox, wy + oy, 8, 6);
      }
    }

    // Street lamps.
    for (const lamp of state.city.lamps) {
      if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
      ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
      ctx.beginPath();
      ctx.arc(lamp.x + ox, lamp.y + oy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(lamp.x + ox, lamp.y + oy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMarker(state) {
    const marker = missionMarker(state);
    if (!marker) return;
    const cam = state.camera;
    const shake = shakeOffset(state);
    const x = marker.x - cam.x + shake.x;
    const y = marker.y - cam.y + shake.y;
    if (x < -40 || x > VIEW.width + 40 || y < -40 || y > VIEW.height + 40) {
      // Off screen: point at the edge toward it.
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      const angle = Math.atan2(y - cy, x - cx);
      const ex = clamp(cx + Math.cos(angle) * 420, 30, VIEW.width - 30);
      const ey = clamp(cy + Math.sin(angle) * 260, 30, VIEW.height - 30);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = marker.kind === 'car' ? PALETTE.markerCar : PALETTE.marker;
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    const pulse = 1 + Math.sin(state.time * 5) * 0.15;
    const r = 16 * pulse;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = marker.kind === 'car' ? PALETTE.markerCar : PALETTE.marker;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = marker.kind === 'car' ? PALETTE.markerCar : PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCar(state, car) {
    const cam = state.camera;
    const shake = shakeOffset(state);
    const x = car.x - cam.x + shake.x;
    const y = car.y - cam.y + shake.y;
    if (x < -80 || x > VIEW.width + 80 || y < -80 || y > VIEW.height + 80) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(car.angle);
    // Headlight cones (dusk) and taillights.
    if (!car.wrecked) {
      const grad = ctx.createLinearGradient(CAR.length / 2, 0, CAR.length / 2 + 90, 0);
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.20)');
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(CAR.length / 2, -8);
      ctx.lineTo(CAR.length / 2 + 90, -26);
      ctx.lineTo(CAR.length / 2 + 90, 26);
      ctx.lineTo(CAR.length / 2, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-CAR.length / 2 - 1, -9, 3, 5);
      ctx.fillRect(-CAR.length / 2 - 1, 4, 3, 5);
    }
    // Body.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width);
    ctx.fillStyle = car.wrecked ? '#3f3f46' : car.color;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = car.wrecked ? '#27272a' : '#0f172a';
    roundRect(-6, -CAR.width / 2 + 4, 18, CAR.width - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(148, 197, 255, 0.5)';
    ctx.fillRect(10, -CAR.width / 2 + 5, 3, CAR.width - 10);
    // Police livery.
    if (car.kind === 'police') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-14, -CAR.width / 2, 10, CAR.width);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-4, -CAR.width / 2 - 2, 6, 5);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(-4, CAR.width / 2 - 3, 6, 5);
      ctx.fillStyle = '#f8fafc';
      ctx.font = font(8, true);
      ctx.textAlign = 'center';
      ctx.fillText('PD', 2, 3);
    }
    // Wheels.
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(-CAR.length / 2 + 4, -CAR.width / 2 - 3, 9, 4);
    ctx.fillRect(-CAR.length / 2 + 4, CAR.width / 2 - 1, 9, 4);
    ctx.fillRect(CAR.length / 2 - 13, -CAR.width / 2 - 3, 9, 4);
    ctx.fillRect(CAR.length / 2 - 13, CAR.width / 2 - 1, 9, 4);
    ctx.restore();
    // Smoke from a damaged car.
    if (car.smoke > 0 && Math.random() < 0.3) {
      ctx.fillStyle = 'rgba(107, 114, 128, 0.5)';
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPed(state, ped) {
    const cam = state.camera;
    const shake = shakeOffset(state);
    const x = ped.x - cam.x + shake.x;
    const y = ped.y - cam.y + shake.y;
    if (x < -30 || x > VIEW.width + 30 || y < -30 || y > VIEW.height + 30) return;
    ctx.save();
    ctx.translate(x, y);
    if (ped.down > 0) {
      // Lying down.
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c89b';
      ctx.beginPath();
      ctx.arc(12, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // A little walking figure: shadow, body, head, swinging arms.
    const swing = Math.sin(ped.phase) * 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(0, -1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, 2); ctx.lineTo(-5 + swing, 8);
    ctx.moveTo(5, 2); ctx.lineTo(5 - swing, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawCop(state, cop) {
    const cam = state.camera;
    const shake = shakeOffset(state);
    const x = cop.x - cam.x + shake.x;
    const y = cop.y - cam.y + shake.y;
    if (x < -30 || x > VIEW.width + 30 || y < -30 || y > VIEW.height + 30) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(cop.angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(1, -1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(6, -2, 8, 4);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-3, -3, 6, 2);
    ctx.restore();
  }

  function drawPlayer(state, aim) {
    const p = state.player;
    const cam = state.camera;
    const shake = shakeOffset(state);
    if (p.car) return; // the car is drawn; the driver is inside it
    const x = p.x - cam.x + shake.x;
    const y = p.y - cam.y + shake.y;
    ctx.save();
    ctx.translate(x, y);
    // Aim line and crosshair.
    if (aim) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(p.aimAngle) * 16, Math.sin(p.aimAngle) * 16);
      ctx.lineTo(Math.cos(p.aimAngle) * 34, Math.sin(p.aimAngle) * 34);
      ctx.stroke();
      const cx = aim.x - cam.x + shake.x;
      const cy = aim.y - cam.y + shake.y;
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Jacket and head; the player wears a teal jacket so they read at a glance.
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath();
    ctx.arc(0, -1, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(0, -3, 5, Math.PI, 0);
    ctx.fill();
    // Gun in hand when aiming.
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.aimAngle) * 8, Math.sin(p.aimAngle) * 8);
    ctx.lineTo(Math.cos(p.aimAngle) * 15, Math.sin(p.aimAngle) * 15);
    ctx.stroke();
    if (state.muzzle > 0) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(Math.cos(p.aimAngle) * 20, Math.sin(p.aimAngle) * 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBullets(state) {
    const cam = state.camera;
    const shake = shakeOffset(state);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    for (const b of state.bullets) {
      const x = b.x - cam.x + shake.x;
      const y = b.y - cam.y + shake.y;
      const len = 12;
      const d = Math.hypot(b.vx, b.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (b.vx / d) * len, y - (b.vy / d) * len);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    const cam = state.camera;
    const shake = shakeOffset(state);
    for (const pt of state.particles) {
      const x = pt.x - cam.x + shake.x;
      const y = pt.y - cam.y + shake.y;
      const a = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(x, y, pt.size * (pt.kind === 'smoke' ? 1 + (1 - a) : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Cash lying on the street.
    for (const drop of state.cashDrops) {
      const x = drop.x - cam.x + shake.x;
      const y = drop.y - cam.y + shake.y;
      const bob = Math.sin(state.time * 4 + drop.x) * 2;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(x - 7, y - 4 + bob, 14, 8);
      ctx.fillStyle = '#14532d';
      ctx.font = font(8, true);
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y + 2 + bob);
    }
  }

  function drawDusk() {
    // A dusk tint: warm at the top, violet at the bottom, plus a vignette.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, 'rgba(255, 140, 60, 0.05)');
    grad.addColorStop(0.55, 'rgba(120, 60, 160, 0.05)');
    grad.addColorStop(1, 'rgba(10, 10, 40, 0.16)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const vig = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawHUD(state, aim) {
    const p = state.player;
    // Top-left: cash, health bar, wanted stars.
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1;
    roundRect(12, 12, 250, 92, 10);
    ctx.fill();
    ctx.stroke();
    text(`$ ${Math.floor(state.cash).toLocaleString('en-US')}`, 26, 46, 26, PALETTE.cash, 'left', true);
    // Health bar.
    ctx.fillStyle = '#1f2937';
    roundRect(26, 56, 150, 12, 6);
    ctx.fill();
    const hp = clamp(p.health / PLAYER.health, 0, 1);
    ctx.fillStyle = hp > 0.5 ? PALETTE.health : hp > 0.25 ? '#facc15' : PALETTE.healthLow;
    if (hp > 0) {
      roundRect(26, 56, 150 * hp, 12, 6);
      ctx.fill();
    }
    text('HP', 182, 67, 12, PALETTE.muted);
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      text('★', 26 + i * 26, 96, 20, i < state.stars ? PALETTE.star : PALETTE.starEmpty, 'left', true);
    }
    if (state.stars > 0) text('WANTED', 160, 96, 13, PALETTE.policeRed, 'left', true);

    // Mission line, top centre.
    const line = missionText(state);
    if (line) {
      ctx.font = font(15, true);
      const w = ctx.measureText(line).width + 28;
      ctx.fillStyle = PALETTE.panel;
      ctx.strokeStyle = PALETTE.panelBorder;
      roundRect((VIEW.width - w) / 2, 12, w, 34, 9);
      ctx.fill();
      ctx.stroke();
      text(line, VIEW.width / 2, 35, 15, '#fde68a', 'center', true);
    }

    // Toast under the mission line.
    if (state.toast && state.time < state.toast.until) {
      ctx.font = font(15, true);
      const w = ctx.measureText(state.toast.text).width + 28;
      ctx.fillStyle = 'rgba(20, 40, 24, 0.9)';
      ctx.strokeStyle = '#22c55e';
      roundRect((VIEW.width - w) / 2, 54, w, 32, 9);
      ctx.fill();
      ctx.stroke();
      text(state.toast.text, VIEW.width / 2, 75, 15, '#bbf7d0', 'center', true);
    }

    // Context prompt, bottom centre.
    const prompt = contextPrompt(state);
    if (prompt) {
      ctx.font = font(16, true);
      const w = ctx.measureText(prompt).width + 28;
      ctx.fillStyle = PALETTE.panel;
      ctx.strokeStyle = PALETTE.panelBorder;
      roundRect((VIEW.width - w) / 2, VIEW.height - 48, w, 34, 9);
      ctx.fill();
      ctx.stroke();
      text(prompt, VIEW.width / 2, VIEW.height - 25, 16, PALETTE.text, 'center', true);
    }

    // Controls hint, bottom left (fades after the first minute).
    if (state.time < 60) {
      ctx.globalAlpha = clamp(1 - state.time / 60, 0.15, 0.85);
      text('WASD move/drive · E enter/exit car · Click shoot · F punch · Shift run · P pause · M mute', 14, VIEW.height - 12, 12, PALETTE.muted);
      ctx.globalAlpha = 1;
    }

    drawMinimap(state);
  }

  function contextPrompt(state) {
    const p = state.player;
    if (p.car) return 'E — Step out of the car';
    // Nearest car worth stealing?
    let best = null;
    let bestD = 64 * 64;
    for (const car of state.cars) {
      if (car.wrecked) continue;
      const dx = car.x - p.x;
      const dy = car.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = car; }
    }
    if (best) {
      if (best.kind === 'mission') return 'E — Steal the Comet GT';
      if (best.kind === 'traffic') return 'E — Steal this car';
      return 'E — Get in the car';
    }
    return '';
  }

  function drawMinimap(state) {
    const { x, y, w, h } = MINIMAP;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    ctx.fillStyle = 'rgba(8, 10, 20, 0.88)';
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    roundRect(x, y, w, h, 8);
    ctx.clip();
    // Water.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x, y + WATER_Y * sy, w, h - WATER_Y * sy);
    // Roads.
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    for (const rx of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(x + rx * sx, y);
      ctx.lineTo(x + rx * sx, y + h);
      ctx.stroke();
    }
    for (const ry of ROADS_Y) {
      ctx.beginPath();
      ctx.moveTo(x, y + ry * sy);
      ctx.lineTo(x + w, y + ry * sy);
      ctx.stroke();
    }
    // Mission marker.
    const marker = missionMarker(state);
    if (marker) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(x + marker.x * sx, y + marker.y * sy, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    ctx.fillStyle = '#60a5fa';
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      ctx.beginPath();
      ctx.arc(x + car.x * sx, y + car.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player.
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + p.x * sx, y + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + p.x * sx, y + p.y * sy, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text('NEON BAY', x + 6, y + h - 8, 10, PALETTE.muted, 'left', true);
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(5, 7, 14, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 56;
    const px = (VIEW.width - width) / 2;
    const py = (VIEW.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = accent || PALETTE.panelBorder;
    ctx.lineWidth = 2;
    roundRect(px, py, width, height, 16);
    ctx.fill();
    ctx.stroke();
    text(title, VIEW.width / 2, py + 64, 46, accent || PALETTE.text, 'center', true);
    let ly = py + 108;
    for (const line of lines) {
      text(line.text, VIEW.width / 2, ly, line.size || 16, line.color || PALETTE.text, 'center', !!line.bold);
      ly += lineH;
    }
    if (prompt) text(prompt, VIEW.width / 2, py + height - 24, 15, PALETTE.muted, 'center');
  }

  function drawTitle(state, hasSave) {
    // The city simmers behind the title: draw the world, dimmed.
    drawWorld(state, null, false);
    ctx.fillStyle = 'rgba(5, 7, 14, 0.66)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Neon title with a glow.
    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 34;
    text('NEON BAY', VIEW.width / 2, 190, 84, '#67e8f9', 'center', true);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#f472b6';
    ctx.shadowBlur = 18;
    text('NEON BAY', VIEW.width / 2, 190, 84, '#e0f2fe', 'center', true);
    ctx.restore();
    text('An original open-world crime story — no affiliation with any other game.', VIEW.width / 2, 232, 16, PALETTE.muted, 'center');
    text('New in town. Broke. Vex has work for you — if you can drive, run, and stay out of jail.', VIEW.width / 2, 262, 16, PALETTE.text, 'center');
    const options = hasSave
      ? ['ENTER — Start a new game', 'C — Continue your saved game']
      : ['ENTER — Start a new game'];
    let oy = 330;
    for (const option of options) {
      ctx.fillStyle = PALETTE.panel;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      roundRect(VIEW.width / 2 - 260, oy - 26, 520, 40, 10);
      ctx.fill();
      ctx.stroke();
      text(option, VIEW.width / 2, oy + 2, 18, '#e0f2fe', 'center', true);
      oy += 56;
    }
    const controls = [
      'WASD / Arrows — move and drive      Shift — run',
      'E — enter / exit a car      Mouse — aim      Click — shoot      F — punch',
      'P — pause      M — mute      Stealing cars and hitting people raises your wanted stars.',
    ];
    let cy = 500;
    for (const line of controls) {
      text(line, VIEW.width / 2, cy, 15, PALETTE.muted, 'center');
      cy += 26;
    }
    text('All names, places, characters and art in this game are original.', VIEW.width / 2, 640, 12, PALETTE.muted, 'center');
  }

  function drawPaused() {
    drawPanel('PAUSED', [
      { text: 'The city waits for no one — except right now.', size: 16, color: PALETTE.muted },
      { text: 'P / Esc — keep playing', size: 16 },
      { text: 'T — back to the title screen', size: 16 },
    ], '', '#22d3ee');
  }

  function drawBusted(state) {
    drawPanel('BUSTED', [
      { text: 'The Bay PD caught up with you.', size: 17, color: PALETTE.muted },
      { text: `You lost $${state.lostCash ?? 0} in fines and impound fees.`, size: 17 },
      { text: `Cash: $${Math.floor(state.cash).toLocaleString('en-US')}`, size: 17, color: PALETTE.cash, bold: true },
    ], 'ENTER — walk out of the precinct and start over', '#3b82f6');
  }

  function drawWasted(state) {
    drawPanel('WASTED', [
      { text: 'Neon Bay is not kind to the careless.', size: 17, color: PALETTE.muted },
      { text: `You lost $${state.lostCash ?? 0} at the hospital.`, size: 17 },
      { text: `Cash: $${Math.floor(state.cash).toLocaleString('en-US')}`, size: 17, color: PALETTE.cash, bold: true },
    ], 'ENTER — patch up and get back out there', '#ef4444');
  }

  function drawWorld(state, aim, showHud) {
    ctx.save();
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawCity(state);
    drawMarker(state);
    for (const car of state.cars) drawCar(state, car);
    for (const ped of state.peds) drawPed(state, ped);
    for (const cop of state.cops) drawCop(state, cop);
    drawBullets(state);
    drawPlayer(state, aim);
    drawParticles(state);
    drawDusk();
    if (showHud) drawHUD(state, aim);
    ctx.restore();
  }

  /** Convert a mouse position in CSS pixels to world coordinates, given the camera. */
  function toWorld(sx, sy, cam) {
    const ratio = window.devicePixelRatio || 1;
    const lx = (sx * ratio - view.x) / view.scale;
    const ly = (sy * ratio - view.y) / view.scale;
    return { x: lx + cam.x, y: ly + cam.y };
  }

  /** Paint one frame. `screen` is one of the SCREEN_* constants; `aim` is the mouse in view coords, or null. */
  function draw(state, screen, aim, hasSave) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_TITLE) drawTitle(state, hasSave);
    else if (screen === SCREEN_PAUSED) { drawWorld(state, aim, true); drawPaused(); }
    else if (screen === SCREEN_BUSTED) { drawWorld(state, aim, true); drawBusted(state); }
    else if (screen === SCREEN_WASTED) { drawWorld(state, aim, true); drawWasted(state); }
    else drawWorld(state, aim, true);
  }

  return { draw, view, toWorld };
}
