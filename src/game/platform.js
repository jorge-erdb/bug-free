import { FONT, PALETTE } from '../engine/render.js';
import { PLATFORM, VIEW } from '../data/tuning.js';

/**
 * Platforms are the lines of code you climb.
 *
 * Every variant is the same rect with different behaviour attached, and all of them are
 * one-way (see collision.js). `solid` is the single flag collision reads, so a crumbling
 * platform simply clears it when it goes.
 */
export const PlatformType = {
  NORMAL: 'NORMAL',
  MOVING: 'MOVING',
  CRUMBLING: 'CRUMBLING',
  BUGGY: 'BUGGY',
};

const TYPE_COLORS = {
  [PlatformType.NORMAL]: PALETTE.platform,
  [PlatformType.MOVING]: PALETTE.accent,
  [PlatformType.CRUMBLING]: PALETTE.warning,
  [PlatformType.BUGGY]: PALETTE.keyword,
};

/** Cosmetic labels so each platform reads as a plausible line of source. */
const LABELS = [
  'return true', 'const x = 0', 'if (ok)', 'await run()', 'let acc = []',
  'export fn', 'try {', '} catch (e)', 'for (i++)', 'yield step',
  'commit -m', 'push --force', 'npm run dev', 'import *', 'render()',
  '=> map(fn)', 'assert(ok)', 'while (true)', 'this.state', 'def build():',
];

const CRUMBLE_DELAY = 0.6;
const CRUMBLE_FADE = 0.25;

/**
 * @param {object} options
 * @param {number} [options.range] MOVING: horizontal travel distance in px.
 * @param {number} [options.speed] MOVING: travel speed in px/s.
 * @param {number} [options.spawnInterval] BUGGY: seconds between bug spawns.
 */
export function createPlatform(x, y, width, type = PlatformType.NORMAL, options = {}) {
  return {
    x,
    y,
    width,
    height: PLATFORM.height,
    type,
    solid: true,
    vx: 0,

    label: options.label ?? LABELS[Math.floor(Math.random() * LABELS.length)],

    // MOVING
    originX: x,
    range: options.range ?? 0,
    speed: options.speed ?? 0,
    moveDirection: 1,

    // CRUMBLING
    triggered: false,
    crumbleRemaining: CRUMBLE_DELAY,

    // BUGGY
    spawnInterval: options.spawnInterval ?? 0,
    spawnRemaining: options.spawnInterval ?? 0,
  };
}

/**
 * Advances one platform.
 *
 * @param {(platform: object) => void} [requestBugSpawn] Called when a BUGGY platform is
 *   due to emit a bug. The platform doesn't own bug creation, so world.js stays the only
 *   place entities are added.
 */
export function stepPlatform(platform, player, dt, requestBugSpawn) {
  switch (platform.type) {
    case PlatformType.MOVING: {
      platform.vx = platform.speed * platform.moveDirection;
      platform.x += platform.vx * dt;

      const left = platform.originX - platform.range / 2;
      const right = platform.originX + platform.range / 2;
      if (platform.x < left) {
        platform.x = left;
        platform.moveDirection = 1;
      } else if (platform.x > right) {
        platform.x = right;
        platform.moveDirection = -1;
      }

      // Never let a moving platform carry itself off the play field.
      platform.x = Math.max(0, Math.min(VIEW.width - platform.width, platform.x));
      break;
    }

    case PlatformType.CRUMBLING: {
      if (!platform.triggered && player.standingOn === platform) {
        platform.triggered = true;
      }
      if (platform.triggered) {
        platform.crumbleRemaining -= dt;
        // Stops being standable the moment it starts fading, not when it finishes.
        if (platform.crumbleRemaining <= 0) platform.solid = false;
      }
      break;
    }

    case PlatformType.BUGGY: {
      if (platform.spawnInterval <= 0) break;
      platform.spawnRemaining -= dt;
      if (platform.spawnRemaining <= 0) {
        platform.spawnRemaining = platform.spawnInterval;
        requestBugSpawn?.(platform);
      }
      break;
    }

    default:
      break;
  }
}

/** True once a crumbled platform has finished fading and can be dropped from the world. */
export function isPlatformGone(platform) {
  return (
    platform.type === PlatformType.CRUMBLING &&
    platform.triggered &&
    platform.crumbleRemaining <= -CRUMBLE_FADE
  );
}

export function drawPlatform(ctx, platform, camera) {
  const screenY = platform.y - camera.y;

  let alpha = 1;
  if (platform.type === PlatformType.CRUMBLING && platform.triggered) {
    if (platform.crumbleRemaining > 0) {
      // Warning flicker before it goes, at an accelerating rate.
      const urgency = 1 - platform.crumbleRemaining / CRUMBLE_DELAY;
      alpha = 0.55 + 0.45 * Math.cos(urgency * 40);
    } else {
      alpha = Math.max(0, 1 + platform.crumbleRemaining / CRUMBLE_FADE) * 0.6;
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  const color = TYPE_COLORS[platform.type] ?? PALETTE.platform;

  // The slab, with a brighter top surface so the standable edge is unambiguous.
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.32;
  ctx.fillRect(platform.x, screenY, platform.width, platform.height);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(platform.x, screenY, platform.width, 3);

  // The label is what makes a platform read as a line of source rather than a green bar.
  // Clipped to the slab so a long label can't bleed past its edges.
  ctx.beginPath();
  ctx.rect(platform.x, screenY, platform.width, platform.height);
  ctx.clip();
  ctx.globalAlpha = alpha * 0.75;
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = PALETTE.comment;
  ctx.fillText(platform.label, platform.x + 6, screenY + 6);

  ctx.restore();
}
