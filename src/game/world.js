import { createPlayer, drawPlayer, stepPlayer } from './player.js';
import { createCamera, deathPlane, shakeCamera, stepCamera } from './camera.js';
import { drawPlatform, isPlatformGone, stepPlatform } from './platform.js';
import {
  bugHitsPlayer, BugType, DEATH_MESSAGES, drawBug, isBugGone, spawnBugOnPlatform, stepBug,
} from './bug.js';
import {
  drawToken, REVERT_DURATION, stepToken, TOKEN_SCORE, tokenHitsPlayer, TokenType,
} from './token.js';
import { drawBackground } from './background.js';
import { FONT, PALETTE } from '../engine/render.js';
import { VIEW } from '../data/tuning.js';

/**
 * Owns the simulation: entity lists, step order, and the death/win decision.
 *
 * Entities never add or remove each other — behaviour modules request changes (a BUGGY
 * platform asks for a bug) and the world is the only place lists are mutated. That keeps
 * iteration safe and makes the order of operations explicit in one place.
 */

export const WorldState = {
  PLAYING: 'PLAYING',
  DEAD: 'DEAD',
  WON: 'WON',
};

/** Bugs a BUGGY platform may emit. Kept narrow so its spawns are predictable to fight. */
const SPAWNABLE_BUG_TYPES = [BugType.CRAWLER, BugType.NULL_POINTER];

/** Cap on live bugs from BUGGY platforms, so a long run can't fill the screen. */
const MAX_SPAWNED_BUGS = 14;

export function createWorld(layout) {
  const player = createPlayer(layout.spawnX, layout.spawnY);

  return {
    player,
    camera: createCamera(layout.spawnY),
    platforms: [...layout.platforms],
    bugs: [...(layout.bugs ?? [])],
    tokens: [...(layout.tokens ?? [])],

    finishY: layout.finishY ?? null,
    /** Kept so climb height can be measured against where the run began. */
    spawnY: layout.spawnY,
    state: WorldState.PLAYING,
    deathReason: '',

    /** Seconds of simulated play, for HUD timing and difficulty ramps. */
    elapsed: 0,
    /** Best height reached in px above the spawn point. */
    height: 0,
    tokensCollected: 0,
    /** Remaining seconds of the git revert freeze. */
    revertRemaining: 0,

    /**
     * Feedback events raised by the last step — 'jump', 'land', 'token', 'revert',
     * 'crumble', 'death', 'deployed' — for the caller to turn into sound.
     *
     * The simulation reports what happened rather than playing anything itself, so world.js
     * stays free of browser APIs and remains runnable headlessly under node for the playtest
     * and reachability harnesses.
     */
    events: [],
  };
}

export function stepWorld(world, input, dt) {
  if (world.state !== WorldState.PLAYING) return;

  world.elapsed += dt;
  world.events.length = 0;

  const { player, camera } = world;

  // --- Power-up timer ---
  if (world.revertRemaining > 0) {
    world.revertRemaining = Math.max(0, world.revertRemaining - dt);
  }
  const frozen = world.revertRemaining > 0;

  // --- Platforms (may request bug spawns) ---
  for (const platform of world.platforms) {
    const wasTriggered = platform.triggered;
    stepPlatform(platform, player, dt, (host) => requestBugSpawn(world, host));
    if (!wasTriggered && platform.triggered) world.events.push('crumble');
  }

  // --- Player ---
  stepPlayer(player, input, world.platforms, dt);
  if (player.justJumped) world.events.push('jump');
  if (player.justLanded) world.events.push('land');

  // --- Hazards and pickups ---
  for (const bug of world.bugs) {
    bug.frozen = frozen;
    stepBug(bug, player, dt);
  }

  for (const token of world.tokens) {
    stepToken(token, dt);
    if (!tokenHitsPlayer(token, player)) continue;

    token.collected = true;
    if (token.type === TokenType.REVERT) {
      world.revertRemaining = REVERT_DURATION;
      world.events.push('revert');
    } else {
      world.tokensCollected += 1;
      world.events.push('token');
    }
  }

  stepCamera(camera, player, dt);

  // --- Cleanup ---
  // Crumbled platforms are dropped only after fading, so the fade is visible.
  for (let i = world.platforms.length - 1; i >= 0; i -= 1) {
    if (!isPlatformGone(world.platforms[i])) continue;
    // Clear the reference before removal so nothing holds a dead platform.
    if (player.standingOn === world.platforms[i]) player.standingOn = null;
    world.platforms.splice(i, 1);
  }

  cullBelowView(world);

  // --- Height, win, death ---
  // Climb height is measured from the spawn point to the highest point reached. Comparing
  // against the player's current y instead would just report how far they've since fallen.
  world.height = Math.max(world.height, Math.round(world.spawnY - player.peakY));

  if (world.finishY !== null && player.y <= world.finishY) {
    world.state = WorldState.WON;
    world.events.push('deployed');
    return;
  }

  // Contact is checked after everything has moved, so a bug can't pass through the player
  // within a single step by being stepped before them.
  if (!frozen) {
    for (const bug of world.bugs) {
      if (!bugHitsPlayer(bug, player)) continue;
      killPlayer(world, DEATH_MESSAGES[bug.type]);
      return;
    }
  }

  if (player.y > deathPlane(camera)) {
    killPlayer(world, 'RangeError: fell out of scope');
  }
}

/** A BUGGY platform emitting a bug, subject to the global cap. */
function requestBugSpawn(world, host) {
  if (world.bugs.length >= MAX_SPAWNED_BUGS) return;
  // Don't spawn onto the platform the player is standing on — that's an unavoidable hit.
  if (world.player.standingOn === host) return;

  const type = SPAWNABLE_BUG_TYPES[Math.floor(Math.random() * SPAWNABLE_BUG_TYPES.length)];
  world.bugs.push(spawnBugOnPlatform(type, host));
}

/**
 * Discards everything that has fallen out of play below the camera.
 *
 * The camera never scrolls back down, so anything well below its bottom edge is
 * unreachable by definition and safe to drop. Without this an endless run accumulates
 * entities forever — a playtest reached 100 live platforms in under a minute.
 */
function cullBelowView(world) {
  const cutoff = world.camera.y + VIEW.height + 400;

  for (let i = world.platforms.length - 1; i >= 0; i -= 1) {
    const platform = world.platforms[i];
    if (platform.y <= cutoff) continue;
    if (world.player.standingOn === platform) continue;
    world.platforms.splice(i, 1);
  }

  const bugCutoff = world.camera.y + VIEW.height;
  for (let i = world.bugs.length - 1; i >= 0; i -= 1) {
    const bug = world.bugs[i];
    // A bug whose host was culled has nothing left to patrol.
    if (isBugGone(bug, bugCutoff) || (bug.host && !world.platforms.includes(bug.host))) {
      world.bugs.splice(i, 1);
    }
  }

  for (let i = world.tokens.length - 1; i >= 0; i -= 1) {
    const token = world.tokens[i];
    if (token.collected || token.baseY > cutoff) world.tokens.splice(i, 1);
  }
}

export function killPlayer(world, reason) {
  if (world.state !== WorldState.PLAYING) return;
  world.state = WorldState.DEAD;
  world.deathReason = reason;
  world.events.push('death');
  shakeCamera(world.camera, 11);
}

/** Score for a run: distance climbed plus a flat bonus per token. */
export function scoreOf(world) {
  return Math.max(0, world.height) + world.tokensCollected * TOKEN_SCORE;
}

export function drawWorld(ctx, world) {
  const { camera } = world;

  drawBackground(ctx, camera);

  // Shake is a render-only offset — the simulation never sees it.
  ctx.save();
  ctx.translate(camera.shakeX, camera.shakeY);

  if (world.finishY !== null) {
    drawFinishLine(ctx, world.finishY, camera);
  }

  for (const platform of world.platforms) {
    // Cull anything comfortably off screen.
    const screenY = platform.y - camera.y;
    if (screenY < -60 || screenY > VIEW.height + 60) continue;
    drawPlatform(ctx, platform, camera);
  }

  for (const token of world.tokens) {
    drawToken(ctx, token, camera);
  }

  for (const bug of world.bugs) {
    const screenY = bug.y - camera.y;
    if (screenY < -60 || screenY > VIEW.height + 60) continue;
    drawBug(ctx, bug, camera);
  }

  if (world.state !== WorldState.DEAD) {
    drawPlayer(ctx, world.player, camera);
  }

  ctx.restore();
}

/**
 * The finish line is a terminal window printing a successful build — the payoff the whole
 * climb is aimed at, and the clearest way to say "this is the top" without a label.
 */
function drawFinishLine(ctx, finishY, camera) {
  const screenY = finishY - camera.y;
  if (screenY < -140 || screenY > VIEW.height + 60) return;

  const width = VIEW.width - 100;
  const height = 76;
  const x = 50;
  const y = screenY - height;

  ctx.fillStyle = '#010409';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = PALETTE.platformEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  // Title bar dots, so it reads as a window.
  ctx.fillStyle = PALETTE.gutter;
  ctx.fillRect(x + 1, y + 1, width - 2, 16);
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = ['#f85149', '#d29922', '#2ea043'][i];
    ctx.beginPath();
    ctx.arc(x + 12 + i * 12, y + 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = PALETTE.comment;
  ctx.fillText('$ npm run deploy', x + 10, y + 24);
  ctx.fillStyle = PALETTE.platformEdge;
  ctx.fillText('✓ build succeeded — deployed', x + 10, y + 44);

  // The line itself.
  ctx.strokeStyle = 'rgba(46, 160, 67, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, screenY);
  ctx.lineTo(VIEW.width, screenY);
  ctx.stroke();
  ctx.setLineDash([]);
}
