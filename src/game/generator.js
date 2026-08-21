import { createPlatform, PlatformType } from './platform.js';
import { BugType, spawnBugOnPlatform } from './bug.js';
import { createToken, TokenType } from './token.js';
import { createRng } from '../engine/rng.js';
import { GENERATION, PLATFORM, VIEW } from '../data/tuning.js';

/**
 * Builds platform layouts from a config object. One generator serves both modes:
 * campaign passes a fixed config and seed, endless calls it repeatedly with a difficulty
 * that rises with height.
 *
 * Reachability is guaranteed structurally rather than checked afterwards: each platform is
 * placed within GENERATION's vertical and horizontal caps of the previous one, and those
 * caps are derived from the jump arc (see data/tuning.js). So there is no such thing as an
 * impossible generated gap.
 */

const SPAWN_Y = 0;
const WALL_MARGIN = 52;

/**
 * Height above the spawn point kept free of hazards, so no run can end before it begins.
 *
 * This has to clear several bounces, not one. The player cannot stop climbing — there is no
 * jump button to hold back on — so they cover about 141px every 0.78s from the moment the
 * run starts, whether they have read the screen or not. At the old 260px a run could reach
 * the first hazard tier inside two bounces, and playtests died to a null pointer 0.7s in,
 * having never had a decision to make. Half a screen gives roughly three seconds of runway.
 */
const SAFE_START_HEIGHT = 520;

/**
 * @typedef {object} LevelConfig
 * @property {string} title
 * @property {number} height Climb distance in px from spawn to finish.
 * @property {number} seed
 * @property {string[]} platformTypes Types allowed beyond NORMAL.
 * @property {number} variantChance Probability a platform uses a variant type.
 * @property {number} bugRate Probability a platform carries a bug.
 * @property {string[]} bugTypes
 */

/** Builds a complete, finite campaign level. */
export function buildLevel(config) {
  const rng = createRng(config.seed);
  const platforms = [createSpawnPlatform()];
  const bugs = [];
  const tokens = [];

  const finishY = SPAWN_Y - config.height;
  let cursorY = SPAWN_Y;
  let cursorX = VIEW.width / 2;

  // Fill upward until the finish line is reachable from the last platform.
  while (cursorY > finishY + GENERATION.maxVerticalGap) {
    const difficulty = difficultyAt(config, cursorY);
    const placed = placeNext(rng, cursorX, cursorY, config, difficulty);
    platforms.push(placed);

    const route = resolveRoute(rng, placed, cursorX, config, difficulty, platforms, bugs, tokens);
    cursorY = route.y;
    cursorX = route.x + route.width / 2;
  }

  /*
   * A wide, safe landing under the finish, so the last jump is never a coin flip.
   *
   * It sits a minimum gap above the last generated platform rather than at a fixed offset
   * from the finish: the loop exits as soon as the cursor is within maxVerticalGap of the
   * top, so a fixed offset could place this platform on top of the previous one, or — when
   * the cursor already ended close to the finish — above the finish line entirely, inside
   * the deploy terminal.
   *
   * When there isn't room for it, it's simply omitted: the last generated platform is by
   * then already within jump range of the finish, so it serves as the landing itself.
   */
  const landingY = cursorY - GENERATION.minVerticalGap;
  if (landingY > finishY) {
    platforms.push(
      createPlatform(
        clampX(VIEW.width / 2 - GENERATION.spawnPlatformWidth / 2, GENERATION.spawnPlatformWidth),
        landingY,
        GENERATION.spawnPlatformWidth,
        PlatformType.NORMAL,
        { label: 'git push origin main' },
      ),
    );
  }

  return {
    platforms,
    bugs,
    tokens,
    spawnX: VIEW.width / 2 - 17,
    spawnY: SPAWN_Y - 60,
    finishY,
  };
}

/** The opening layout for endless: spawn platform plus enough climb to fill the view. */
export function buildEndlessStart() {
  const rng = createRng(Date.now() >>> 0);
  const platforms = [createSpawnPlatform()];
  const bugs = [];
  const tokens = [];

  let cursorY = SPAWN_Y;
  let cursorX = VIEW.width / 2;

  // Generate a screen and a half so there's always something above the camera.
  while (cursorY > SPAWN_Y - VIEW.height * 1.5) {
    const placed = placeNext(rng, cursorX, cursorY, ENDLESS_CONFIG, 0);
    platforms.push(placed);
    const route = resolveRoute(rng, placed, cursorX, ENDLESS_CONFIG, 0, platforms, bugs, tokens);
    cursorY = route.y;
    cursorX = route.x + route.width / 2;
  }

  return {
    layout: {
      platforms,
      bugs,
      tokens,
      spawnX: VIEW.width / 2 - 17,
      spawnY: SPAWN_Y - 60,
      finishY: null,
    },
    rng,
    cursorY,
    cursorX,
  };
}

/**
 * Extends an endless run upward to `targetY`, mutating the cursor state in place.
 * Difficulty is a function of how far the cursor has climbed.
 */
export function extendEndless(state, world, targetY) {
  while (state.cursorY > targetY) {
    const climbed = SPAWN_Y - state.cursorY;
    const difficulty = endlessDifficulty(climbed);
    const placed = placeNext(
      state.rng,
      state.cursorX,
      state.cursorY,
      ENDLESS_CONFIG,
      difficulty,
    );
    world.platforms.push(placed);
    const route = resolveRoute(
      state.rng, placed, state.cursorX, ENDLESS_CONFIG, difficulty,
      world.platforms, world.bugs, world.tokens,
    );
    state.cursorY = route.y;
    state.cursorX = route.x + route.width / 2;
  }
}

/**
 * Endless difficulty ramps to full over roughly 12 screens of climbing, then holds. It
 * plateaus rather than rising forever so a long run stays playable instead of becoming a
 * coin flip.
 */
function endlessDifficulty(climbed) {
  return Math.min(1, climbed / (VIEW.height * 12));
}

/** Campaign difficulty ramps within the level, so the top is the hardest part. */
function difficultyAt(config, cursorY) {
  const progress = (SPAWN_Y - cursorY) / config.height;
  return Math.max(0, Math.min(1, progress));
}

function createSpawnPlatform() {
  return createPlatform(
    VIEW.width / 2 - GENERATION.spawnPlatformWidth / 2,
    SPAWN_Y,
    GENERATION.spawnPlatformWidth,
    PlatformType.NORMAL,
    { label: '#!/usr/bin/env vibe' },
  );
}

/** Places one platform above (cursorX, cursorY) within the reachability caps. */
function placeNext(rng, cursorX, cursorY, config, difficulty) {
  // Gaps widen and platforms narrow as difficulty rises.
  const gapSpan = GENERATION.maxVerticalGap - GENERATION.minVerticalGap;
  const gap = GENERATION.minVerticalGap + gapSpan * rng.range(0.25 + difficulty * 0.5, 0.55 + difficulty * 0.45);

  const widthCeiling = PLATFORM.maxWidth - (PLATFORM.maxWidth - PLATFORM.minWidth) * difficulty * 0.75;
  const width = rng.range(PLATFORM.minWidth, Math.max(PLATFORM.minWidth + 20, widthCeiling));

  const shift = rng.range(-GENERATION.maxHorizontalStep, GENERATION.maxHorizontalStep);
  const centreX = cursorX + shift;
  const x = clampX(centreX - width / 2, width);

  const type = pickType(rng, config, difficulty);

  return createPlatform(x, cursorY - gap, width, type, optionsForType(rng, type, difficulty));
}

/**
 * Populates a freshly placed platform and returns the platform the safe route continues
 * from — which is not always the one just placed.
 *
 * This is the fairness guarantee for hazards, and it matters because the climb is a chain:
 * each platform is generated within jump range of the previous one, so if a bug occupies a
 * chain platform it blocks the *only* route. Skipping a tier means a 224px jump against a
 * 142px maximum — impossible, not hard. A playtest bot died within seconds on every level
 * with bugs enabled for exactly this reason.
 *
 * So whenever a route-blocking bug lands on a platform, a clear bypass platform is added at
 * the same height and the route continues from that instead. If no bypass fits, the bug is
 * not placed at all. The player can still take the occupied platform — it's usually the
 * shorter line, and tokens sit there to tempt them — but there is always a way around.
 */
function resolveRoute(rng, platform, cursorX, config, difficulty, platforms, bugs, tokens) {
  const bugTypes = config.bugTypes ?? [];
  const bugRate = (config.bugRate ?? 0) * (0.4 + 0.6 * difficulty);

  /*
   * No hazards in the opening stretch. A null pointer hangs *beneath* its platform, and the
   * first generated platform sits close enough to the spawn point that one could occupy the
   * exact space the player starts in — an endless run was ending in under a second, before
   * the player had moved at all.
   */
  const inSafeZone = platform.y > SPAWN_Y - SAFE_START_HEIGHT;

  if (!inSafeZone && bugTypes.length > 0 && rng.chance(bugRate)) {
    // A crawler needs room to patrol; on a narrow platform it may as well be stationary.
    let candidates = bugTypes;
    if (platform.width < 100) {
      const wideEnough = bugTypes.filter((type) => type !== BugType.CRAWLER);
      if (wideEnough.length > 0) candidates = wideEnough;
    }
    const type = rng.pick(candidates);

    /*
     * A null pointer hangs *under* its platform, so the surface above stays landable and
     * the threat is passing beneath it. Only the surface-dwelling types block a route.
     */
    const blocksRoute = type !== BugType.NULL_POINTER;

    if (!blocksRoute) {
      bugs.push(spawnBugOnPlatform(type, platform));
      return platform;
    }

    const bypass = placeBypass(rng, platform, cursorX);
    if (bypass) {
      bugs.push(spawnBugOnPlatform(type, platform));
      platforms.push(bypass);
      // A token on the blocked platform makes taking the risk a real choice.
      if (rng.chance(0.5)) {
        tokens.push(createToken(
          TokenType.TOKEN,
          platform.x + platform.width / 2 - 9,
          platform.y - 46,
        ));
      }
      return bypass;
    }
    // No room for a bypass — drop the bug rather than seal the route.
  }

  if (rng.chance(0.22)) {
    // Floated above the surface so it's collected in flight, not by standing still.
    tokens.push(createToken(
      TokenType.TOKEN,
      platform.x + platform.width / 2 - 9,
      platform.y - 46,
    ));
    return platform;
  }

  // The power-up is rare, and only appears once difficulty is high enough to need it.
  if (difficulty > 0.35 && rng.chance(0.045)) {
    tokens.push(createToken(
      TokenType.REVERT,
      platform.x + platform.width / 2 - 13,
      platform.y - 50,
    ));
  }

  return platform;
}

/**
 * Finds a clear platform at the same height as `blocked`, reachable from `cursorX`.
 *
 * Returns null when nothing fits — the caller then declines to place the bug, so an
 * impossible tier can never be generated.
 */
function placeBypass(rng, blocked, cursorX) {
  const width = rng.range(PLATFORM.minWidth, 130);
  // Enough clearance that the bypass reads as a separate platform and no bug can reach it.
  const separation = 34;

  // Prefer the side away from the blocked platform, but try both.
  const leftEdge = blocked.x - separation - width;
  const rightEdge = blocked.x + blocked.width + separation;
  const options = rng.chance(0.5) ? [leftEdge, rightEdge] : [rightEdge, leftEdge];

  for (const x of options) {
    if (x < WALL_MARGIN) continue;
    if (x + width > VIEW.width - WALL_MARGIN) continue;
    // Must be reachable from where the player is coming from.
    if (Math.abs((x + width / 2) - cursorX) > GENERATION.maxHorizontalStep) continue;

    return createPlatform(x, blocked.y, width, PlatformType.NORMAL, { label: '// safe path' });
  }

  return null;
}

function pickType(rng, config, difficulty) {
  const available = config.platformTypes ?? [];
  if (available.length === 0) return PlatformType.NORMAL;

  const chance = (config.variantChance ?? 0) * (0.45 + 0.55 * difficulty);
  if (!rng.chance(chance)) return PlatformType.NORMAL;

  return rng.pick(available);
}

function optionsForType(rng, type, difficulty) {
  switch (type) {
    case PlatformType.MOVING:
      return {
        range: rng.range(70, 130 + 60 * difficulty),
        speed: rng.range(45, 70 + 55 * difficulty),
      };
    case PlatformType.BUGGY:
      return { spawnInterval: rng.range(2.6, 4.4 - 1.2 * difficulty) };
    default:
      return {};
  }
}

/** Keeps a platform fully inside the play field, clear of the gutter. */
function clampX(x, width) {
  const min = WALL_MARGIN;
  const max = VIEW.width - WALL_MARGIN - width;
  return Math.max(min, Math.min(Math.max(min, max), x));
}

/** Endless uses every mechanic from the start; difficulty controls how often they appear. */
const ENDLESS_CONFIG = {
  platformTypes: [PlatformType.MOVING, PlatformType.CRUMBLING, PlatformType.BUGGY],
  variantChance: 0.55,
  bugRate: 0.3,
  bugTypes: [BugType.CRAWLER, BugType.NULL_POINTER, BugType.INFINITE_LOOP],
};
