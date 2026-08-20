/**
 * Route-existence audit.
 *
 * Asks the only question that is actually a fairness invariant rather than a skill question:
 * from the spawn platform, is there a chain of jumps to the finish line where every hop is
 * within the jump envelope and every platform landed on is free of a route-blocking bug?
 *
 * Whether a player dodges a patrolling crawler is skill. Whether a safe route exists at all
 * is correctness — and it's what the single-chain generator used to get wrong.
 */
import { buildLevel, buildEndlessStart, extendEndless } from '../src/game/generator.js';
import { LEVELS } from '../src/data/levels.js';
import { BugType } from '../src/game/bug.js';
import { GENERATION, VIEW } from '../src/data/tuning.js';

/** Measured full-hold jump envelope, from verify.mjs. Conservative on purpose. */
const MAX_RISE = 138;
const MAX_HORIZONTAL = 200;

function centreOf(platform) {
  return platform.x + platform.width / 2;
}

/** Can the player get from platform A up to platform B in one jump? */
function canReach(a, b) {
  const rise = a.y - b.y;
  if (rise <= 0) return false;
  if (rise > MAX_RISE) return false;

  // Horizontal distance measured edge to edge — landing anywhere on the platform counts.
  const gap = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  return gap <= MAX_HORIZONTAL;
}

function blockedPlatforms(bugs) {
  return new Set(
    bugs
      .filter((bug) => bug.host && bug.type !== BugType.NULL_POINTER)
      .map((bug) => bug.host),
  );
}

/** BFS from the lowest platform upward over safe platforms only. */
function findRoute(platforms, bugs, goalY) {
  const blocked = blockedPlatforms(bugs);
  const safe = platforms.filter((platform) => !blocked.has(platform));

  const start = platforms.reduce((lowest, p) => (p.y > lowest.y ? p : lowest), platforms[0]);
  if (blocked.has(start)) return { ok: false, reason: 'spawn platform is blocked' };

  const seen = new Set([start]);
  const queue = [start];
  let highestReached = start.y;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.y < highestReached) highestReached = current.y;

    // Goal: any safe platform close enough below the finish line to jump to it.
    if (goalY !== null && current.y - goalY <= MAX_RISE && current.y > goalY) {
      return { ok: true, highestReached };
    }

    for (const next of safe) {
      if (seen.has(next)) continue;
      if (!canReach(current, next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return {
    ok: goalY === null,
    reason: `route dead-ends at y=${Math.round(highestReached)} (goal ${goalY})`,
    highestReached,
    reachedCount: seen.size,
  };
}

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('--- campaign: a safe route to the finish exists ---');
for (const config of LEVELS) {
  const layout = buildLevel(config);
  const result = findRoute(layout.platforms, layout.bugs, layout.finishY);
  const blocked = blockedPlatforms(layout.bugs).size;
  check(
    `${config.title}`,
    result.ok,
    `${layout.platforms.length} platforms, ${layout.bugs.length} bugs (${blocked} blocking)`
      + `${result.ok ? '' : ` — ${result.reason}`}`,
  );
}

console.log('\n--- campaign: route still exists across many seeds ---');
{
  // The shipped seeds passing is necessary but not sufficient — the generator must be sound
  // for any seed, or retuning a level by changing its seed could silently seal it.
  const hardest = LEVELS[LEVELS.length - 1];
  let sealed = 0;
  const trials = 300;
  for (let seed = 1; seed <= trials; seed += 1) {
    const layout = buildLevel({ ...hardest, seed });
    if (!findRoute(layout.platforms, layout.bugs, layout.finishY).ok) sealed += 1;
  }
  check(
    `${trials} random seeds of the hardest level all have a safe route`,
    sealed === 0,
    `${sealed} sealed`,
  );
}

console.log('\n--- endless: route exists deep into a run ---');
{
  let sealed = 0;
  const trials = 40;
  for (let i = 0; i < trials; i += 1) {
    const state = buildEndlessStart();
    const world = { platforms: state.layout.platforms, bugs: state.layout.bugs, tokens: state.layout.tokens };
    extendEndless(state, world, -VIEW.height * 15);

    // No finish line in endless, so verify the route reaches near the top of what exists.
    const topY = Math.min(...world.platforms.map((p) => p.y));
    const result = findRoute(world.platforms, world.bugs, topY + GENERATION.maxVerticalGap);
    if (!result.ok) sealed += 1;
  }
  check(`${trials} endless runs climb 15 screens with a safe route throughout`, sealed === 0, `${sealed} sealed`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
