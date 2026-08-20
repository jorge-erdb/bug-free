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
 * gameplay and menu navigation without a modal input scheme: Up is `jump` in a run and
 * `up` in a menu, and each context simply reads the action it cares about.
 */
const KEY_BINDINGS = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['jump', 'up'],
  KeyW: ['jump', 'up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['jump', 'confirm'],
  Enter: ['confirm'],
  KeyR: ['restart'],
  Escape: ['back'],
  KeyP: ['back'],
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();

  /**
   * Touch controls are only drawn once a touch has actually occurred — no user-agent
   * sniffing, and desktop stays clean even on hybrid laptops with touchscreens.
   */
  let touchSeen = false;

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

  // A held key stays "down" forever if the window loses focus mid-press.
  window.addEventListener('blur', () => held.clear());

  /**
   * Screen is split into three zones in logical coordinates: bottom-left and bottom-right
   * thirds steer, everything above the control band jumps. Tapping anywhere high on the
   * screen jumps, which is far more forgiving than a small button.
   */
  function actionForPoint(x, y) {
    const bandTop = VIEW.height * 0.72;
    if (y < bandTop) return 'jump';
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
