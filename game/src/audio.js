// Sound, all synthesized with the Web Audio API — no audio files, no network.
// The engine hum and the police siren are loops whose pitch and volume follow the
// game; everything else is a one-shot played from the world's event flags.
// The AudioContext is created on the first user gesture, as browsers require.
import { clamp } from './util.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engine = null;
  let engineGain = null;
  let engineSub = null;
  let siren = null;
  let sirenGain = null;
  let muted = false;
  let time = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: a sawtooth plus a sub sine, both following the car's speed.
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      engineSub = ctx.createOscillator();
      engineSub.type = 'sine';
      engineSub.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engine.connect(engineFilter);
      engineSub.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engine.start();
      engineSub.start();
      // Siren: a triangle wave wailing between two tones.
      siren = ctx.createOscillator();
      siren.type = 'triangle';
      siren.frequency.value = 800;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      siren.connect(sirenGain);
      sirenGain.connect(master);
      siren.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass', when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Play the one-shots the world's event flags ask for, then clear them. */
  function playEvents(events) {
    if (!ctx || muted) {
      events.shot = false; events.crash = false; events.pickup = false;
      events.missionDone = false; events.missionFail = false; events.punch = false;
      events.swing = false; events.wreck = false; events.ram = false;
      events.playerHit = false; events.stepDone = false; events.busted = false;
      events.wasted = false; events.hitPed = false; events.hitCar = false;
      events.wantedUp = false; events.hitCop = false;
      return;
    }
    if (events.shot) { noise(0.12, 0.5, 1800, 'highpass'); tone(180, 0.08, 'square', 0.2, 0, 60); }
    if (events.crash) { noise(0.35, 0.6, 300); tone(70, 0.25, 'sine', 0.5, 0, 40); }
    if (events.pickup) { tone(880, 0.09, 'sine', 0.25); tone(1318, 0.14, 'sine', 0.25, 0.08); }
    if (events.missionDone) {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.3, i * 0.09));
    }
    if (events.missionFail) { tone(392, 0.2, 'triangle', 0.25); tone(311, 0.3, 'triangle', 0.25, 0.15); }
    if (events.stepDone) { tone(660, 0.1, 'sine', 0.25); tone(990, 0.12, 'sine', 0.25, 0.07); }
    if (events.punch || events.swing) { noise(0.08, 0.35, 500); }
    if (events.wreck) { noise(0.6, 0.6, 200); tone(50, 0.5, 'sine', 0.5, 0, 30); }
    if (events.ram) { noise(0.2, 0.4, 400); }
    if (events.playerHit) { tone(220, 0.1, 'square', 0.15, 0, 110); }
    if (events.hitPed || events.hitCar) { noise(0.1, 0.3, 900); }
    if (events.hitCop) { noise(0.15, 0.4, 1200, 'highpass'); }
    if (events.wantedUp) { tone(440, 0.12, 'square', 0.2); tone(440, 0.12, 'square', 0.2, 0.16); }
    if (events.busted || events.wasted) {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, i * 0.16));
    }
    for (const key of Object.keys(events)) events[key] = false;
  }

  /** Called every frame: follow the engine and the siren, play the one-shots. */
  function update(state, dt) {
    time += dt;
    if (!ctx) return;
    if (muted) {
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return;
    }
    const p = state.player;
    if (engineGain && engine) {
      if (p.car && !p.car.wrecked) {
        const s = Math.abs(p.car.speed) / 540;
        engine.frequency.value = 52 + s * 110;
        engineSub.frequency.value = 26 + s * 55;
        engineGain.gain.value = 0.05 + s * 0.1;
      } else {
        engineGain.gain.value = 0;
      }
    }
    if (sirenGain && siren) {
      let nearest = 1e9;
      for (const car of state.cars) {
        if (car.kind !== 'police') continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < nearest) nearest = d;
      }
      if (state.stars > 0 && nearest < 1000) {
        siren.frequency.value = 800 + Math.sin(time * 5.2) * 160;
        sirenGain.gain.value = clamp(1 - nearest / 1000, 0, 1) * 0.16;
      } else {
        sirenGain.gain.value = 0;
      }
    }
    playEvents(state.events);
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.4;
  }

  return { ensure, update, setMuted, isMuted: () => muted };
}
