/**
 * Headless verification of the movement model and generated layouts.
 * Run from the project root: node <this file>
 */
import { createPlayer, stepPlayer } from '../src/game/player.js';
import { createPlatform } from '../src/game/platform.js';
import { buildLevel, buildEndlessStart, extendEndless } from '../src/game/generator.js';
import { GENERATION, PLAYER, PHYSICS, VIEW } from '../src/data/tuning.js';

const DT = 1 / 60;

/** Minimal stand-in for engine/input.js. */
function fakeInput(state = {}) {
  const held = new Set(state.held ?? []);
  const pressed = new Set(state.pressed ?? []);
  return {
    held: (a) => held.has(a),
    pressed: (a) => pressed.has(a),
    clearPressed: () => pressed.clear(),
    _held: held,
    _pressed: pressed,
  };
}

/** Measures peak rise and horizontal distance of a full-hold jump from a platform. */
function measureJump({ holdJump = true, moveHorizontally = true } = {}) {
  const ground = createPlatform(0, 0, VIEW.width, 'NORMAL');
  const platforms = [ground];
  const player = createPlayer(20, -PLAYER.height);
  player.grounded = true;
  player.standingOn = ground;
  player.coyoteRemaining = PLAYER.coyoteTime;

  const input = fakeInput();
  const startY = player.y;
  const startX = player.x;

  // Build horizontal speed first, the way a player would run up to a gap.
  if (moveHorizontally) {
    input._held.add('right');
    for (let i = 0; i < 40; i += 1) stepPlayer(player, input, platforms, DT);
  }

  input._pressed.add('jump');
  input._held.add('jump');

  let peakRise = 0;
  let horizontalAtPeak = 0;

  for (let i = 0; i < 240; i += 1) {
    stepPlayer(player, input, platforms, DT);
    input.clearPressed();
    if (!holdJump) input._held.delete('jump');

    const rise = startY - player.y;
    if (rise > peakRise) {
      peakRise = rise;
      horizontalAtPeak = Math.abs(player.x - startX);
    }
    if (i > 5 && player.grounded) break;
  }

  return { peakRise, horizontalAtPeak };
}

const full = measureJump({ holdJump: true });
const tapped = measureJump({ holdJump: false });

console.log('--- jump envelope ---');
console.log(`theoretical peak (v^2/2g): ${(PLAYER.jumpVelocity ** 2 / (2 * PHYSICS.gravity)).toFixed(1)}px`);
console.log(`measured full-hold peak:   ${full.peakRise.toFixed(1)}px  (horizontal ${full.horizontalAtPeak.toFixed(0)}px)`);
console.log(`measured tap peak:         ${tapped.peakRise.toFixed(1)}px`);
console.log(`generator max vertical gap: ${GENERATION.maxVerticalGap}px`);
console.log(`generator max horizontal:   ${GENERATION.maxHorizontalStep}px`);

let failures = 0;

function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('\n--- reachability invariants ---');
check(
  'full jump clears the widest vertical gap with margin',
  full.peakRise > GENERATION.maxVerticalGap * 1.25,
  `${full.peakRise.toFixed(0)}px vs ${GENERATION.maxVerticalGap}px`,
);
check(
  'variable jump height works (tap is meaningfully shorter than hold)',
  tapped.peakRise < full.peakRise * 0.7,
  `tap ${tapped.peakRise.toFixed(0)}px vs hold ${full.peakRise.toFixed(0)}px`,
);

console.log('\n--- generated layout invariants ---');

/** Verifies consecutive platforms are within the reachability caps. */
function auditLayout(name, platforms) {
  let worstGap = 0;
  let worstShift = 0;
  let offField = 0;

  for (let i = 1; i < platforms.length; i += 1) {
    const previous = platforms[i - 1];
    const current = platforms[i];

    const gap = previous.y - current.y;

    /*
     * Platforms at the same height are a hazard platform and its bypass sibling, not a hop:
     * the route runs from the *previous* tier to the bypass, so measuring between the pair
     * reports a horizontal distance the player is never asked to cover. Route correctness
     * with bypasses is verified properly by BFS in reachability.mjs.
     */
    if (gap === 0) continue;

    if (gap > worstGap) worstGap = gap;

    const shift = Math.abs(
      (current.x + current.width / 2) - (previous.x + previous.width / 2),
    );
    if (shift > worstShift) worstShift = shift;

    if (current.x < 0 || current.x + current.width > VIEW.width) offField += 1;
  }

  check(`${name}: every vertical gap is jumpable`, worstGap < full.peakRise, `worst gap ${worstGap.toFixed(0)}px, peak ${full.peakRise.toFixed(0)}px`);
  check(`${name}: no platform leaves the play field`, offField === 0, `${offField} off-field`);
  check(`${name}: horizontal steps stay within cap`, worstShift <= GENERATION.maxHorizontalStep + 1, `worst ${worstShift.toFixed(0)}px`);
  return { worstGap, worstShift };
}

const level = buildLevel({
  title: 'audit', height: 2600, seed: 20260808,
  platformTypes: ['MOVING', 'CRUMBLING'], variantChance: 0.35,
});
auditLayout('campaign', level.platforms);
check('campaign: finish line is above the top platform run', level.finishY < 0, `finishY ${level.finishY}`);
check('campaign: platform count is sane', level.platforms.length > 20, `${level.platforms.length} platforms`);

const endless = buildEndlessStart();
auditLayout('endless start', endless.layout.platforms);

// Push endless far out to confirm difficulty scaling never breaks reachability.
const deepWorld = {
  platforms: [...endless.layout.platforms],
  bugs: [...endless.layout.bugs],
  tokens: [...endless.layout.tokens],
};
extendEndless(endless, deepWorld, -VIEW.height * 25);
auditLayout('endless deep (25 screens)', deepWorld.platforms);

console.log('\n--- determinism ---');
const a = buildLevel({ title: 't', height: 1500, seed: 42, platformTypes: [], variantChance: 0 });
const b = buildLevel({ title: 't', height: 1500, seed: 42, platformTypes: [], variantChance: 0 });
const same = JSON.stringify(a.platforms.map((p) => [p.x, p.y, p.width]))
  === JSON.stringify(b.platforms.map((p) => [p.x, p.y, p.width]));
check('same seed produces an identical layout', same);

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
