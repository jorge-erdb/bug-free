import { SIM } from '../data/tuning.js';

/**
 * Fixed-timestep game loop.
 *
 * The simulation advances in exact 1/60s steps regardless of display refresh rate, so a
 * 144Hz monitor and a 60Hz laptop run identical physics. Rendering happens once per
 * animation frame with whatever the latest simulation state is.
 *
 * The accumulator is clamped to SIM.maxStepsPerFrame. After a stall (tab switch, GC pause,
 * breakpoint) the backlog is discarded rather than replayed, which would teleport entities
 * through platforms.
 *
 * The loop deliberately owns no pause state. It reports focus loss through `onFocusLost` and
 * lets the app decide what that means — because a loop that stops stepping also stops
 * reading input, which would leave the player unable to press anything to resume.
 */
export function createLoop({ step, draw, onFocusLost }) {
  const stepDuration = 1 / SIM.hz;

  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;
  let running = false;

  function frame(now) {
    rafId = requestAnimationFrame(frame);

    const elapsed = (now - lastTime) / 1000;
    lastTime = now;

    accumulator += elapsed;

    // Drop any backlog beyond the cap rather than replaying it.
    const maxAccumulated = stepDuration * SIM.maxStepsPerFrame;
    if (accumulator > maxAccumulated) accumulator = maxAccumulated;

    while (accumulator >= stepDuration) {
      accumulator -= stepDuration;
      step(stepDuration);
    }

    draw();
  }

  function handleFocusLoss() {
    // Discard the span spent away so returning doesn't deliver one enormous delta.
    accumulator = 0;
    lastTime = performance.now();
    onFocusLost?.();
  }

  function handleVisibility() {
    if (document.hidden) handleFocusLoss();
    else {
      accumulator = 0;
      lastTime = performance.now();
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      accumulator = 0;
      window.addEventListener('blur', handleFocusLoss);
      document.addEventListener('visibilitychange', handleVisibility);
      rafId = requestAnimationFrame(frame);
    },

    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('blur', handleFocusLoss);
      document.removeEventListener('visibilitychange', handleVisibility);
    },
  };
}
