import { VIEW } from '../data/tuning.js';

/**
 * Input is normalised into an action map so game code never touches raw events and
 * keyboard/touch stay interchangeable.
 *
 * Actions expose two things:
 *  - `held(action)` — current state, for continuous input like movement.
 *  - `pressed(action)` — true only on the step where it went down. Consumed by
 *    `clearPressed()` at the end of each simulation step, so a single tap fires once
 *    no matter how many frames render.
 */

/**
 * A key can drive several actions at once, which is how the same arrow keys serve both
 * gameplay and menu navigation without a modal input scheme: Up is `up` in a menu and
 * unused in a run, and each context simply reads the action it cares about.
 *
 * There is no `jump` binding — the player bounces automatically (see game/player.js), so
 * during a run the only meaningful keys are left and right.
 */
const KEY_BINDINGS = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['confirm'],
  Enter: ['confirm'],
  KeyR: ['restart'],
  Escape: ['back'],
  KeyP: ['back'],
};

/**
 * @param {object} canvas The object returned by engine/render.js createCanvas.
 * @param {object} [options]
 * @param {Array<{x: number, y: number, width: number, height: number}>} [options.deadZones]
 *   Logical-space rectangles that never steer. On-screen buttons live here, so reaching for
 *   one doesn't also send the player sideways.
 */
export function createInput(canvas, { deadZones = [] } = {}) {
  const held = new Set();
  const pressed = new Set();

  /**
   * Whether to present the game as touch-first.
   *
   * Seeded from the platform's own report of a touchscreen rather than waiting for the
   * first touch: a player who has to touch the screen once before any control hint appears
   * is a player who spent their first run guessing. It is still promoted to true on a real
   * touch, which covers devices that under-report.
   *
   * Keyboard never stops working, so a hybrid laptop showing touch hints loses nothing.
   */
  let touchSeen = (
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    || 'ontouchstart' in window
  );

  /** Maps each active touch id to the action it triggered, so multi-touch releases cleanly. */
  const activeTouches = new Map();

  function press(action) {
    if (!action) return;
    if (!held.has(action)) pressed.add(action);
    held.add(action);
  }

  function release(action) {
    if (!action) return;
    held.delete(action);
  }

  window.addEventListener('keydown', (event) => {
    const actions = KEY_BINDINGS[event.code];
    if (!actions) return;
    // Stop Space and arrows from scrolling the page.
    event.preventDefault();
    if (event.repeat) return;
    for (const action of actions) press(action);
  });

  window.addEventListener('keyup', (event) => {
    const actions = KEY_BINDINGS[event.code];
    if (!actions) return;
    event.preventDefault();
    for (const action of actions) release(action);
  });

  // A held key or finger stays "down" forever if the window loses focus mid-press. Touches
  // matter as much as keys here: an interrupted drag would otherwise leave the player
  // walking into a wall until the next touch happened to release the same action.
  window.addEventListener('blur', () => {
    held.clear();
    activeTouches.clear();
  });

  /**
   * Steering is the only touch action, so the whole play area is the control: hold the left
   * half to go left, the right half to go right.
   *
   * Splitting the entire screen rather than a strip along the bottom means there is no
   * button to hit and no dead zone to miss — a thumb resting anywhere on its side of the
   * screen works, on a phone or a tablet, and the playfield loses no space to a control
   * band.
   *
   * The only exclusions are the dead zones, which is where on-screen buttons sit; steering
   * from there would fire a stray step every time the player reached for one.
   */
  function actionForPoint(x, y) {
    for (const zone of deadZones) {
      if (
        x >= zone.x && x <= zone.x + zone.width
        && y >= zone.y && y <= zone.y + zone.height
      ) return null;
    }
    return x < VIEW.width / 2 ? 'left' : 'right';
  }

  function handleTouchStart(event) {
    touchSeen = true;
    event.preventDefault();
    for (const touch of event.changedTouches) {
      const point = canvas.toLogical(touch.clientX, touch.clientY);
      const action = actionForPoint(point.x, point.y);
      activeTouches.set(touch.identifier, action);
      press(action);
    }
  }

  function handleTouchEnd(event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      const action = activeTouches.get(touch.identifier);
      activeTouches.delete(touch.identifier);
      if (!action) continue;
      // Only release if no other finger is still holding the same action.
      if (![...activeTouches.values()].includes(action)) release(action);
    }
  }

  function handleTouchMove(event) {
    event.preventDefault();
    for (const touch of event.changedTouches) {
      const previous = activeTouches.get(touch.identifier);
      if (!previous) continue;
      const point = canvas.toLogical(touch.clientX, touch.clientY);
      const next = actionForPoint(point.x, point.y);
      if (next === previous) continue;
      // Sliding between zones re-targets the action, so drag-to-steer works.
      activeTouches.set(touch.identifier, next);
      if (![...activeTouches.values()].includes(previous)) release(previous);
      press(next);
    }
  }

  /**
   * Menu clicks and taps. Held separately from game actions because menus need a position,
   * not a verb. Consumed once, like `pressed`.
   */
  let pendingTap = null;

  canvas.element.addEventListener('pointerdown', (event) => {
    pendingTap = canvas.toLogical(event.clientX, event.clientY);
  });

  canvas.element.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.element.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.element.addEventListener('touchcancel', handleTouchEnd, { passive: false });
  canvas.element.addEventListener('touchmove', handleTouchMove, { passive: false });

  return {
    held: (action) => held.has(action),
    pressed: (action) => pressed.has(action),
    /** Called at the end of every simulation step so each press is seen exactly once. */
    clearPressed: () => {
      pressed.clear();
      pendingTap = null;
    },
    hasTouch: () => touchSeen,
    /** Any of the given actions pressed — handy for "press anything to continue". */
    anyPressed: (...actions) => actions.some((action) => pressed.has(action)),
    /** Logical-space position of a tap this step, or null. */
    tap: () => pendingTap,
  };
}
