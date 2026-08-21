/**
 * Headless playtest bot.
 *
 * Proves levels are actually completable by the movement model, not just that gaps fall
 * within a numeric cap. The bot is deliberately dumb — pick the lowest platform above me and
 * steer toward its centre. A competent human should comfortably beat a bot this crude, so if
 * the bot finishes, the level is not gated on precision.
 *
 * Since jumping is automatic, steering is the bot's only output, which makes it a much
 * closer model of a real player than it used to be: it has exactly the same controls.
 */
import { stepWorld, createWorld, WorldState } from '../src/game/world.js';
import { buildLevel, buildEndlessStart, extendEndless } from '../src/game/generator.js';
import { VIEW } from '../src/data/tuning.js';
import { LEVELS } from '../src/data/levels.js';

const DT = 1 / 60;

function botInput() {
  const held = new Set();
  const pressed = new Set();
  return {
    held: (a) => held.has(a),
    pressed: (a) => pressed.has(a),
    clearPressed: () => pressed.clear(),
    set(action, on) {
      if (on) {
        if (!held.has(action)) pressed.add(action);
        held.add(action);
      } else {
        held.delete(action);
      }
    },
  };
}

/**
 * Chooses steering for one step.
 *
 * The bot commits to a target platform while airborne and only re-picks once it lands.
 * Re-picking every step made it chase whichever platform was nearest above its feet, which
 * changes mid-flight — so it steered toward one platform on the way up and a different one
 * on the way down, and landed on neither.
 */
function decide(world, input, memory) {
  const { player, platforms } = world;
  const playerCentre = player.x + player.width / 2;
  const playerBottom = player.y + player.height;

  /*
   * A target stays valid even once the player has risen above it — being above the surface
   * is exactly the state you need to land on it. Invalidating on that basis made the bot
   * abandon each platform at the apex and chase the next one up forever.
   */
  const targetInvalid = !memory.target
    || !memory.target.solid
    || !platforms.includes(memory.target);

  if (player.grounded || targetInvalid) {
    // Solid platforms above the player's feet, lowest first.
    const candidates = platforms
      .filter((platform) => platform.solid && platform.y < playerBottom - 2)
      .sort((a, b) => b.y - a.y);

    /*
     * A platform hosting a crawler or an infinite loop is a death trap to land on, so the
     * bot skips it the way a player would and aims one tier higher. Without this the test
     * only measures whether the bot walks into bugs — which it always will — instead of
     * whether the level is actually survivable.
     */
    const occupied = new Set(
      world.bugs
        .filter((bug) => bug.host && bug.type !== 'NULL_POINTER')
        .map((bug) => bug.host),
    );

    memory.target = candidates.find((platform) => !occupied.has(platform))
      ?? candidates[0]
      ?? null;
  }

  const target = memory.target;

  if (!target) {
    /*
     * Nothing left above — this is the top platform and the finish line is just overhead.
     * The bounce carries the player across it without any input, so the bot simply stops
     * steering and lets the next arc finish the level.
     */
    input.set('left', false);
    input.set('right', false);
    return;
  }

  const targetCentre = target.x + target.width / 2;
  const dx = targetCentre - playerCentre;

  // Steering is the entire control surface now, so this is the whole bot.
  input.set('right', dx > 6);
  input.set('left', dx < -6);
}

function play(world, maxSeconds = 240) {
  const input = botInput();
  const memory = {};
  const steps = Math.round(maxSeconds / DT);
  let deaths = 0;

  for (let i = 0; i < steps; i += 1) {
    decide(world, input, memory);
    stepWorld(world, input, DT);
    input.clearPressed();

    if (world.state === WorldState.WON) {
      return { outcome: 'WON', seconds: world.elapsed, height: world.height, deaths };
    }
    if (world.state === WorldState.DEAD) {
      return { outcome: 'DEAD', seconds: world.elapsed, height: world.height, reason: world.deathReason };
    }
  }
  return { outcome: 'TIMEOUT', seconds: world.elapsed, height: world.height };
}

let failures = 0;
function check(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

console.log('--- campaign completability (bot plays each level) ---');


/*
 * Completability is asserted with hazards stripped, because that isolates the question the
 * bot can actually answer: does the movement model plus the generated layout allow a climb
 * to the top? Whether a crude bot also dodges a patrolling crawler is a skill question, and
 * route fairness with bugs present is verified structurally in reachability.mjs instead.
 */
for (const config of LEVELS) {
  const world = createWorld(buildLevel({
    ...config,
    bugTypes: [],
    bugRate: 0,
    // BUGGY platforms spawn bugs on their own timer, independent of bugTypes.
    platformTypes: config.platformTypes.filter((type) => type !== 'BUGGY'),
  }));
  const result = play(world);
  check(
    `${config.title} completable (hazards off)`,
    result.outcome === 'WON',
    `${result.outcome} at ${Math.round(result.height)}/${config.height}px in ${result.seconds.toFixed(1)}s${result.reason ? ` (${result.reason})` : ''}`,
  );
}

console.log('\n--- progress with hazards on (informational, bot has no bug avoidance) ---');
for (const config of LEVELS) {
  const world = createWorld(buildLevel(config));
  const result = play(world, 120);
  const pct = Math.round((result.height / config.height) * 100);
  console.log(`   ${config.title.padEnd(18)} ${String(pct).padStart(3)}% — ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`);
}

console.log('\n--- endless survivability ---');
{
  const start = buildEndlessStart();
  const world = createWorld(start.layout);
  const input = botInput();
  const memory = {};

  let steps = 0;
  const maxSteps = Math.round(180 / DT);
  while (world.state === WorldState.PLAYING && steps < maxSteps) {
    // Keep generating ahead of the camera, the way the endless mode will.
    extendEndless(start, world, world.camera.y - VIEW.height);

    /*
     * Hazards are held frozen for the whole loop, using the git revert power-up's own
     * mechanism, so the climb runs its full length.
     *
     * What this loop uniquely proves is that a long live session keeps its entity lists
     * bounded — and a bot that dies to a crawler nine seconds in proves nothing about
     * culling, however the run is seeded. Frozen bugs still fill the lists and are still
     * culled, so the thing under test is untouched; only the dying stops.
     */
    world.revertRemaining = 10;

    decide(world, input, memory);
    stepWorld(world, input, DT);
    input.clearPressed();
    steps += 1;
  }

  // Route soundness deep into a run is proven in reachability.mjs; what this loop uniquely
  // exercises is that a long live session keeps its entity lists bounded.
  console.log(`   bot reached ${world.height}px (${(world.height / VIEW.height).toFixed(1)} screens) in ${world.elapsed.toFixed(0)}s, state ${world.state}`);
  check(
    'endless entity lists stay bounded (culling works)',
    world.platforms.length < 60 && world.bugs.length < 40 && world.tokens.length < 40,
    `${world.platforms.length} platforms, ${world.bugs.length} bugs, ${world.tokens.length} tokens live`,
  );
  console.log(`   endless detail: ${world.platforms.length} platforms in memory after ${world.elapsed.toFixed(0)}s`);
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
