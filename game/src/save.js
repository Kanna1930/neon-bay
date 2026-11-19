// Save and load: cash, story progress, the player's position and health, in
// localStorage. The city is deterministic from the seed, so it is not stored.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      seed: state.seed,
      cash: Math.floor(state.cash),
      missionIndex: state.mission ? state.mission.index : 0,
      storyDone: !!state.storyDone,
      playerX: state.player.x,
      playerY: state.player.y,
      health: state.player.health,
      time: state.time,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
