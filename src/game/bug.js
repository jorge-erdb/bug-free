import { FONT, PALETTE } from '../engine/render.js';
import { PHYSICS } from '../data/tuning.js';
import { aabbOverlap } from './collision.js';

/**
 * Bugs — the hazards. Touching one ends the run.
 *
 * Each type is a different way real code fails, which is the joke, but they're also three
 * genuinely different threats: one patrols a surface you want to land on, one punishes
 * moving underneath, and one denies a platform outright.
 */
export const BugType = {
  /** Walks its host platform, turning at the edges. Threatens the landing itself. */
  CRAWLER: 'CRAWLER',
  /** Hangs until the player passes below, then drops. Punishes climbing without looking up. */
  NULL_POINTER: 'NULL_POINTER',
  /** Spins in place with a wide reach. Makes its platform a no-go. */
  INFINITE_LOOP: 'INFINITE_LOOP',
};

const TYPE_STYLE = {
  [BugType.CRAWLER]: { color: PALETTE.danger, size: 20, glyph: 'e' },
  [BugType.NULL_POINTER]: { color: PALETTE.warning, size: 18, glyph: '∅' },
  [BugType.INFINITE_LOOP]: { color: '#db61a2', size: 24, glyph: '∞' },
};

/** Flavour text shown on death, per type. */
export const DEATH_MESSAGES = {
  [BugType.CRAWLER]: 'TypeError: undefined is not a function',
  [BugType.NULL_POINTER]: 'NullPointerException: unexpected null',
  [BugType.INFINITE_LOOP]: 'RangeError: maximum call stack exceeded',
};

const CRAWLER_SPEED = 46;
const DROP_TRIGGER_WIDTH = 46;

export function createBug(type, x, y, host = null) {
  const style = TYPE_STYLE[type];
  return {
    type,
    x,
    y,
    width: style.size,
    height: style.size,
    vx: 0,
    vy: 0,

    /** The platform this bug belongs to, used for patrol bounds and drop triggers. */
    host,
    direction: 1,

    // NULL_POINTER
    dropping: false,

    /** Set by the git revert power-up: frozen bugs hold position and can't be triggered. */
    frozen: false,

    animTime: Math.random() * 10,
  };
}

/** Spawns a bug appropriate to a platform, centred on its surface. */
export function spawnBugOnPlatform(type, platform) {
  const style = TYPE_STYLE[type];
  const x = platform.x + platform.width / 2 - style.size / 2;
  // Crawlers and loops sit on top; null pointers hang just beneath, ready to drop.
  const y = type === BugType.NULL_POINTER
    ? platform.y + platform.height + 2
    : platform.y - style.size;
  return createBug(type, x, y, platform);
}

export function stepBug(bug, player, dt) {
  bug.animTime += dt;

  if (bug.frozen) return;

  switch (bug.type) {
    case BugType.CRAWLER: {
      if (!bug.host?.solid) {
        // Its platform crumbled away — fall with it rather than hovering in mid-air.
        bug.vy += PHYSICS.gravity * dt;
        bug.y += bug.vy * dt;
        break;
      }

      bug.x += CRAWLER_SPEED * bug.direction * dt;

      // Track a moving host so the bug rides along instead of walking off into space.
      bug.y = bug.host.y - bug.height;
      if (bug.host.vx) bug.x += bug.host.vx * dt;

      const left = bug.host.x;
      const right = bug.host.x + bug.host.width - bug.width;
      if (bug.x < left) {
        bug.x = left;
        bug.direction = 1;
      } else if (bug.x > right) {
        bug.x = right;
        bug.direction = -1;
      }
      break;
    }

    case BugType.NULL_POINTER: {
      if (!bug.dropping) {
        // Trigger when the player is below and roughly aligned horizontally.
        const playerCentre = player.x + player.width / 2;
        const bugCentre = bug.x + bug.width / 2;
        const aligned = Math.abs(playerCentre - bugCentre) < DROP_TRIGGER_WIDTH;
        const below = player.y > bug.y;
        if (aligned && below) bug.dropping = true;
        break;
      }

      bug.vy += PHYSICS.gravity * 0.8 * dt;
      bug.y += bug.vy * dt;
      break;
    }

    case BugType.INFINITE_LOOP: {
      if (bug.host?.solid) bug.y = bug.host.y - bug.height;
      break;
    }

    default:
      break;
  }
}

/**
 * Hitboxes are inset from the drawn size so a near miss reads as a near miss. Being
 * slightly generous here matters — the alternative is deaths that look unfair.
 */
export function bugHitsPlayer(bug, player) {
  const inset = 4;
  return aabbOverlap(player, {
    x: bug.x + inset,
    y: bug.y + inset,
    width: bug.width - inset * 2,
    height: bug.height - inset * 2,
  });
}

/** True once a dropped bug is far enough below the view to discard. */
export function isBugGone(bug, cameraBottom) {
  return bug.y > cameraBottom + 200;
}

export function drawBug(ctx, bug, camera) {
  const style = TYPE_STYLE[bug.type];
  const screenY = bug.y - camera.y;
  const centreX = bug.x + bug.width / 2;
  const centreY = screenY + bug.height / 2;

  ctx.save();
  ctx.translate(centreX, centreY);

  if (bug.type === BugType.INFINITE_LOOP) {
    ctx.rotate(bug.animTime * 3.2);
  } else if (bug.type === BugType.CRAWLER) {
    // A slight waddle so it reads as walking.
    ctx.rotate(Math.sin(bug.animTime * 12) * 0.12);
  }

  if (bug.frozen) ctx.globalAlpha = 0.45;

  // Body.
  ctx.fillStyle = style.color;
  ctx.beginPath();
  ctx.arc(0, 0, bug.width / 2, 0, Math.PI * 2);
  ctx.fill();

  // Legs — three per side, enough to read as an insect at this size.
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 2;
  const legLength = bug.width * 0.42;
  const wiggle = Math.sin(bug.animTime * 14) * 0.25;
  for (let i = -1; i <= 1; i += 1) {
    const angle = i * 0.5 + wiggle;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * bug.width * 0.3, angle * 5);
      ctx.lineTo(side * (bug.width * 0.3 + legLength), angle * 9);
      ctx.stroke();
    }
  }

  // The glyph identifies the failure mode at a glance.
  ctx.font = `bold ${Math.round(bug.width * 0.55)}px ${FONT}`;
  ctx.fillStyle = PALETTE.background;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.glyph, 0, 1);

  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
