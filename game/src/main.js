// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between title, play, paused, busted and
// wasted. Progress (cash, story, position) saves to localStorage.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SHOOT, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';
import { startMission } from './missions.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

// Debug and test handle: the state is readable from the console and from the
// automated checks, so a run can assert on cash, stars and mission progress.
window.__neonBay = world.state;

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, null, hasSave());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let saveAvailable = hasSave();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) {
      clearSave();
      world.reset();
    } else {
      const save = loadGame();
      if (save) {
        world.reset();
        const s = world.state;
        s.cash = save.cash;
        s.storyDone = !!save.storyDone;
        s.player.x = save.playerX;
        s.player.y = save.playerY;
        s.player.health = save.health;
        s.time = save.time;
        // Missions restart at the saved index (its steps replay from the start).
        startMission(s, Math.min(save.missionIndex, 4), s.random);
        world.updateCamera(s);
      } else {
        world.reset();
      }
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    announce('Playing Neon Bay. Reach the marker for your first job.');
  }

  function toTitle() {
    saveGame(world.state);
    screen = SCREEN_TITLE;
    saveAvailable = hasSave();
    announce('Neon Bay. Press Enter to start, C to continue.');
  }

  function handleActions() {
    const actions = input.takeActions(ACTION_CONFIRM | ACTION_PAUSE | ACTION_MUTE);
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(true);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        saveGame(world.state);
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        world.respawn();
        saveGame(world.state);
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    }
  }

  // C (continue) is read off the keydown stream directly: it is not a held key.
  let continuePressed = false;
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) continuePressed = true;
    if (event.code === 'KeyT' && !event.repeat && screen === SCREEN_PAUSED) toTitle();
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Fold the C press into the action handling for the title screen.
    if (continuePressed) {
      continuePressed = false;
      if (screen === SCREEN_TITLE && saveAvailable) startGame(false);
    }
    handleActions();

    if (screen === SCREEN_TITLE) {
      // The city simmers behind the title.
      while (accumulator >= STEP) {
        world.step(STEP, { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, aimX: 0, aimY: 0 });
        accumulator -= STEP;
      }
      renderer.draw(world.state, screen, null, saveAvailable);
      return;
    }
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const ctl = {
          up: input.held.up, down: input.held.down,
          left: input.held.left, right: input.held.right,
          run: input.held.run, shoot: input.held.shoot,
          enter: false, punch: false,
          aimX: 0, aimY: 0,
        };
        // One-shot actions are read fresh each step so a press is never lost.
        const acts = input.takeActions(ACTION_ENTER | ACTION_PUNCH | ACTION_SHOOT);
        if (acts & ACTION_ENTER) ctl.enter = true;
        if (acts & ACTION_PUNCH) ctl.punch = true;
        if (acts & ACTION_SHOOT) ctl.shoot = true;
        // Aim: mouse position in CSS pixels -> world coordinates.
        const aimWorld = renderer.toWorld(input.mouse.x, input.mouse.y, world.state.camera);
        ctl.aimX = aimWorld.x;
        ctl.aimY = aimWorld.y;
        const events = world.step(STEP, ctl);
        if (events.busted) {
          // Caught: freeze on the busted screen. The respawn (and the cash it
          // costs) happens once, when the player presses Enter to continue.
          screen = SCREEN_BUSTED;
          announce('Busted. The Bay PD caught you.');
        } else if (events.wasted) {
          screen = SCREEN_WASTED;
          announce('Wasted.');
        } else if (events.missionDone) {
          announce(`Mission complete. Cash $${Math.floor(world.state.cash)}.`);
        }
        accumulator -= STEP;
      }
      audio.update(world.state, STEP);
      renderer.draw(world.state, screen, input.mouse, saveAvailable);
    } else {
      accumulator = 0;
      audio.update(world.state, 0);
      renderer.draw(world.state, screen, input.mouse, saveAvailable);
    }
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(world.state);
      announce('Paused.');
    }
  });

  // The first click or keypress unlocks the audio.
  window.addEventListener('pointerdown', () => audio.ensure(), { once: true });
  window.addEventListener('keydown', () => audio.ensure(), { once: true });

  announce('Neon Bay. Press Enter to start, C to continue.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
