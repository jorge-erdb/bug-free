import { VIEW } from '../data/tuning.js';

/**
 * Collision against axis-aligned platform rects, resolved vertically first.
 *
 * Platforms are one-way by design: you pass up through them from below and land on top.
 * That falls out of the sweep condition rather than needing a special case — a landing
 * only registers when the player is moving downward *and* their previous bottom edge was
 * at or above the platform's top surface. Because the check uses the previous position
 * rather than just the current overlap, a fast fall can't tunnel through a thin platform.
 *
 * Horizontally, one-way platforms don't block at all. That's deliberate for a climber:
 * catching on platform edges mid-jump feels broken, and there's nothing to gain from it.
 */

export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Sweeps the body from `previousY` to its current `y` and lands it on the highest
 * platform it crossed.
 *
 * @returns the platform landed on, or null if the body is still airborne.
 */
export function resolveLanding(body, previousY, platforms) {
  // Rising or hovering: nothing to land on.
  if (body.vy < 0) return null;

  const previousBottom = previousY + body.height;
  const currentBottom = body.y + body.height;

  let landed = null;
  let landedTop = Infinity;

  for (const platform of platforms) {
    if (!platform.solid) continue;

    // Must have been above the surface before, and be at or past it now.
    if (previousBottom > platform.y) continue;
    if (currentBottom < platform.y) continue;

    // Horizontal overlap is checked at the landing position.
    if (body.x + body.width <= platform.x) continue;
    if (body.x >= platform.x + platform.width) continue;

    // Several candidates can qualify in one step; the highest surface wins.
    if (platform.y < landedTop) {
      landedTop = platform.y;
      landed = platform;
    }
  }

  if (landed) {
    body.y = landed.y - body.height;
    body.vy = 0;
  }

  return landed;
}

/** Keeps the body inside the play field. The margins read as the edges of a code file. */
export function clampToWalls(body) {
  if (body.x < 0) {
    body.x = 0;
    if (body.vx < 0) body.vx = 0;
  }
  const maxX = VIEW.width - body.width;
  if (body.x > maxX) {
    body.x = maxX;
    if (body.vx > 0) body.vx = 0;
  }
}
