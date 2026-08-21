import { createCanvas } from './engine/render.js';
import { createInput } from './engine/input.js';
import { createLoop } from './engine/loop.js';
import { buildEndlessStart, buildLevel, extendEndless } from './game/generator.js';
import { createWorld, drawWorld, scoreOf, stepWorld, WorldState } from './game/world.js';
import { LEVELS } from './data/levels.js';
import { VIEW } from './data/tuning.js';
import { isLevelUnlocked, loadSave, recordEndlessScore, recordLevelComplete } from './save.js';
import { drawHud, drawSteerHints, PAUSE_BUTTON, pointInRect } from './ui/hud.js';
import {
  drawGameOver, drawHelp, drawLevelComplete, drawLevelSelect, drawMainMenu, drawPaused,
  gameOverButtons, levelCompleteButtons, levelSelectOptions, MAIN_MENU_OPTIONS,
  overlayButtonAt, PANELS, pausedButtons, updateMenu,
} from './ui/screens.js';
import { drawBackground } from './game/background.js';
import { Sfx, unlockAudio } from './engine/audio.js';

/**
 * Boot and top-level state machine.
 *
 * One `screen` value decides what steps and what draws. Gameplay lives in world.js; this
 * file only routes input to the right place and owns the transitions between screens —
 * including pause, which lives here rather than in the loop so that input keeps flowing
 * while paused (see engine/loop.js).
 */

const Screen = {
  MENU: 'MENU',
  LEVEL_SELECT: 'LEVEL_SELECT',
  HELP: 'HELP',
  RUN: 'RUN',
};

const canvas = createCanvas(document.getElementById('game'));
// The pause button must not double as a steering tap — see engine/input.js.
const input = createInput(canvas, { deadZones: [PAUSE_BUTTON] });
const save = loadSave();

const app = {
  screen: Screen.MENU,
  menu: { index: 0 },

  /** Active run, or null outside gameplay. */
  world: null,
  /** 'campaign' | 'endless' */
  mode: null,
  /** Index into LEVELS for campaign runs. */
  levelIndex: 0,
  /** Endless generator cursor state, kept between steps to extend the climb. */
  endless: null,

  paused: false,
  /** Set when the last endless run beat the stored best, for the game-over screen. */
  lastRunWasRecord: false,
  /** Guards against recording the same finished run more than once. */
  resultRecorded: false,
};

// --- Screen transitions ---

function openMenu() {
  app.screen = Screen.MENU;
  app.menu = { index: 0 };
  app.world = null;
  app.mode = null;
  app.paused = false;
}

function openLevelSelect() {
  app.screen = Screen.LEVEL_SELECT;
  // Start on the newest unlocked level — that's the one the player came here for.
  app.menu = { index: Math.min(save.unlockedLevels - 1, LEVELS.length - 1) };
}

function startCampaign(levelIndex) {
  if (!isLevelUnlocked(save, levelIndex)) return;
  app.screen = Screen.RUN;
  app.mode = 'campaign';
  app.levelIndex = levelIndex;
  app.endless = null;
  app.paused = false;
  app.resultRecorded = false;
  app.world = createWorld(buildLevel(LEVELS[levelIndex]));
}

function startEndless() {
  app.screen = Screen.RUN;
  app.mode = 'endless';
  app.paused = false;
  app.resultRecorded = false;
  app.lastRunWasRecord = false;
  app.endless = buildEndlessStart();
  app.world = createWorld(app.endless.layout);
}

function restartRun() {
  if (app.mode === 'campaign') startCampaign(app.levelIndex);
  else startEndless();
}

/** Leaves an active run for whichever menu the player came from. */
function leaveRun() {
  if (app.mode === 'campaign') openLevelSelect();
  else openMenu();
}

// --- Per-screen input handling ---

function stepMenu() {
  const options = MAIN_MENU_OPTIONS.map((option) => (
    option.id === 'endless' && save.bestScore > 0
      ? { ...option, detail: `récord ${save.bestScore}` }
      : option
  ));

  const chosen = updateMenu(app.menu, input, options, 300);
  if (chosen === 'campaign') openLevelSelect();
  else if (chosen === 'endless') startEndless();
  else if (chosen === 'help') app.screen = Screen.HELP;
}

function stepLevelSelect() {
  if (input.pressed('back')) {
    openMenu();
    return;
  }
  const options = levelSelectOptions(save);
  const chosen = updateMenu(app.menu, input, options, 280);
  if (!chosen) return;

  const index = LEVELS.findIndex((level) => level.id === chosen);
  if (index >= 0) startCampaign(index);
}

function stepHelp() {
  if (input.pressed('back') || input.pressed('confirm') || input.tap()) openMenu();
}

function stepRun(dt) {
  const world = app.world;
  const tap = input.tap();

  if (world.state === WorldState.PLAYING) {
    if (app.paused) {
      // Confirm resumes and back leaves — mirrored by the two on-screen buttons, so the
      // pause screen is fully operable with no keyboard.
      const button = overlayButtonAt(tap, pausedButtons().length, PANELS.paused);
      if (input.pressed('confirm') || button === 0) app.paused = false;
      else if (input.pressed('back') || button === 1) leaveRun();
      return;
    }

    if (input.pressed('back') || (tap && pointInRect(tap, PAUSE_BUTTON))) {
      app.paused = true;
      return;
    }

    if (input.pressed('restart')) {
      restartRun();
      return;
    }

    // Endless generates ahead of the camera so there's always a platform above.
    if (app.mode === 'endless') {
      extendEndless(app.endless, world, world.camera.y - VIEW.height);
    }

    stepWorld(world, input, dt);
    playEvents(world.events);
    return;
  }

  // The run is over: record the result once, then wait for a decision.
  recordResultOnce();

  const won = world.state === WorldState.WON;
  const isLast = app.levelIndex === LEVELS.length - 1;
  const labels = won ? levelCompleteButtons(app.mode === 'campaign' && isLast) : gameOverButtons();
  const button = overlayButtonAt(tap, labels.length, PANELS.result);

  // The last campaign level offers a single button, which quits rather than advancing.
  const quitPressed = input.pressed('back')
    || (button === 1)
    || (button === 0 && labels.length === 1);
  if (quitPressed) {
    leaveRun();
    return;
  }

  if (button !== 0 && !input.pressed('confirm') && !input.pressed('restart')) return;

  if (world.state === WorldState.DEAD) {
    restartRun();
    return;
  }

  // Won: advance to the next level, or back to the menu if that was the last.
  const nextIndex = app.levelIndex + 1;
  if (app.mode === 'campaign' && nextIndex < LEVELS.length) startCampaign(nextIndex);
  else if (app.mode === 'campaign') openLevelSelect();
  else restartRun();
}

/**
 * Turns the simulation's feedback events into sound.
 *
 * Deduplicated per step: several platforms can begin crumbling in the same frame, and
 * playing one blip per platform turns a subtle cue into a burst of noise.
 */
function playEvents(events) {
  if (events.length === 0) return;
  for (const event of new Set(events)) {
    switch (event) {
      case 'jump': Sfx.jump(); break;
      case 'token': Sfx.token(); break;
      case 'revert': Sfx.revert(); break;
      case 'crumble': Sfx.crumble(); break;
      case 'death': Sfx.death(); break;
      case 'deployed': Sfx.deployed(); break;
      default: break;
    }
  }
}

/** Persists the outcome of a finished run. Idempotent — a run is only recorded once. */
function recordResultOnce() {
  if (app.resultRecorded) return;
  app.resultRecorded = true;

  const world = app.world;
  if (app.mode === 'endless') {
    app.lastRunWasRecord = recordEndlessScore(save, scoreOf(world));
  } else if (world.state === WorldState.WON) {
    recordLevelComplete(save, LEVELS[app.levelIndex].id, app.levelIndex, LEVELS.length);
  }
}

// --- Drawing ---

function draw() {
  const { ctx } = canvas;

  if (app.screen === Screen.RUN) {
    drawWorld(ctx, app.world);
    const playing = app.world.state === WorldState.PLAYING && !app.paused;
    drawHud(ctx, app.world, {
      title: app.mode === 'campaign' ? LEVELS[app.levelIndex].title : 'endless.log',
      mode: app.mode,
      best: save.bestScore,
      touch: input.hasTouch() && playing,
    });

    if (input.hasTouch() && playing) drawSteerHints(ctx, app.world.elapsed);

    if (app.paused) drawPaused(ctx);
    else if (app.world.state === WorldState.DEAD) {
      drawGameOver(ctx, app.world, {
        mode: app.mode,
        score: scoreOf(app.world),
        isRecord: app.lastRunWasRecord,
      });
    } else if (app.world.state === WorldState.WON) {
      drawLevelComplete(ctx, app.world, {
        title: LEVELS[app.levelIndex].title,
        isLast: app.levelIndex === LEVELS.length - 1,
      });
    }
    return;
  }

  // Menus sit on the same editor backdrop, so the framing never breaks. Offset upward so the
  // gutter shows a populated file rather than a single line 1 at the very top.
  drawBackground(ctx, { y: -VIEW.height * 1.5, shakeX: 0, shakeY: 0 });

  if (app.screen === Screen.MENU) drawMainMenu(ctx, app.menu, save);
  else if (app.screen === Screen.LEVEL_SELECT) drawLevelSelect(ctx, app.menu, save);
  else if (app.screen === Screen.HELP) drawHelp(ctx);
}

// --- Wiring ---

const loop = createLoop({
  step(dt) {
    switch (app.screen) {
      case Screen.MENU: stepMenu(); break;
      case Screen.LEVEL_SELECT: stepLevelSelect(); break;
      case Screen.HELP: stepHelp(); break;
      case Screen.RUN: stepRun(dt); break;
      default: break;
    }

    // Every press is consumed exactly once per simulation step.
    input.clearPressed();
  },

  draw,

  /** Losing focus pauses an active run rather than letting it play on unwatched. */
  onFocusLost() {
    if (app.screen === Screen.RUN && app.world?.state === WorldState.PLAYING) {
      app.paused = true;
    }
  },
});

// Browsers only allow audio to start after a user gesture, so the context is unlocked on the
// first real input rather than at boot.
for (const type of ['keydown', 'pointerdown', 'touchstart']) {
  window.addEventListener(type, unlockAudio, { once: true });
}

loop.start();
