/**
 * Verifies the fixed-timestep loop.
 *
 * This is the check that matters most structurally: if the loop leaked frame duration into
 * the simulation, a 144Hz monitor would run different physics from a 60Hz laptop, and the
 * whole game would feel different per machine. Driven with a stubbed requestAnimationFrame
 * so frame cadence is exact rather than eyeballed through DevTools throttling.
 */
import { SIM } from '../src/data/tuning.js';

let failures = 0;
const check = (label, cond, detail = '') => {
  if (!cond) failures += 1;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
};

/** Runs the loop for `seconds` of simulated wall time at a given frame rate. */
async function runAt(fps, seconds, { stallAt = null, stallFor = 0 } = {}) {
  let now = 0;
  const callbacks = [];

  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (cb) => { callbacks.push(cb); return callbacks.length; };
  globalThis.cancelAnimationFrame = () => {};

  // Fresh import per run so no module state leaks between cases.
  const { createLoop } = await import(
    `../src/engine/loop.js?v=${fps}-${seconds}-${stallAt}`
  );

  let steps = 0;
  let draws = 0;
  const dts = new Set();

  const loop = createLoop({
    step(dt) { steps += 1; dts.add(dt); },
    draw() { draws += 1; },
  });

  loop.start();

  const frameMs = 1000 / fps;
  const totalFrames = Math.round((seconds * 1000) / frameMs);

  for (let frame = 0; frame < totalFrames; frame += 1) {
    // Simulate a hitch: one enormous frame, as after a GC pause or a breakpoint.
    now += (stallAt !== null && frame === stallAt) ? stallFor : frameMs;
    const cb = callbacks.shift();
    if (!cb) break;
    cb(now);
  }

  return { steps, draws, dts: [...dts], expectedSteps: seconds * SIM.hz };
}

console.log(`--- simulation rate is ${SIM.hz}Hz regardless of frame rate ---`);

const results = {};
for (const fps of [30, 60, 75, 120, 144]) {
  results[fps] = await runAt(fps, 2);
  const { steps, draws, expectedSteps } = results[fps];
  // One step of slack: the accumulator can hold a fraction across the final frame.
  const accurate = Math.abs(steps - expectedSteps) <= 1;
  check(
    `${String(fps).padStart(3)}fps → ${steps} sim steps (expected ${expectedSteps}), ${draws} draws`,
    accurate,
    accurate ? '' : `off by ${steps - expectedSteps}`,
  );
}

{
  /*
   * Step counts agree to within a single step across frame rates. Exact equality is not the
   * invariant: whatever fraction of a step is left in the accumulator when the run ends is
   * carried, not executed, and where that boundary falls depends on the frame cadence. What
   * matters is that the residue never exceeds one step, so it cannot accumulate into drift.
   */
  const counts = Object.values(results).map((r) => r.steps);
  const spread = Math.max(...counts) - Math.min(...counts);
  check(
    'sim step counts agree across frame rates to within one step',
    spread <= 1,
    `${Object.entries(results).map(([fps, r]) => `${fps}:${r.steps}`).join(' ')} (spread ${spread})`,
  );
}

check(
  'step always receives exactly the fixed timestep',
  Object.values(results).every((r) => r.dts.length === 1 && Math.abs(r.dts[0] - 1 / SIM.hz) < 1e-12),
  `dts seen: ${JSON.stringify(Object.values(results).map((r) => r.dts))}`,
);

check(
  'draw runs once per frame',
  results[60].draws === 120 && results[120].draws === 240,
  `60fps:${results[60].draws} 120fps:${results[120].draws}`,
);

console.log('\n--- a long stall is discarded, not replayed ---');
{
  // A 5-second hitch at 60fps would be 300 steps of catch-up if the backlog were replayed —
  // enough for the player to tunnel clean through the level.
  const stalled = await runAt(60, 2, { stallAt: 30, stallFor: 5000 });
  const extra = stalled.steps - results[60].steps;
  check(
    'a 5s stall adds at most the clamp, not the whole backlog',
    extra <= SIM.maxStepsPerFrame,
    `${extra} extra steps (clamp is ${SIM.maxStepsPerFrame}, naive replay would add ~300)`,
  );
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
