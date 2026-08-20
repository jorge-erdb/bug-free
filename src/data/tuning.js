/**
 * Every number that affects game feel lives here. Nothing else in the codebase should
 * hardcode a physics or difficulty constant — tuning happens by editing this file and
 * refreshing the browser.
 *
 * Units: pixels and seconds. All velocities are per-second, so they stay meaningful
 * regardless of the fixed timestep in engine/loop.js.
 */

/** Logical resolution. All game coordinates are in this space; render.js handles scaling. */
export const VIEW = {
  width: 540,
  height: 960,
};

/** Simulation rate. The loop steps at exactly this interval — see engine/loop.js. */
export const SIM = {
  hz: 60,
  /** Max steps per frame. Caps catch-up after a stall so nothing tunnels through geometry. */
  maxStepsPerFrame: 5,
};

export const PHYSICS = {
  gravity: 2100,
  /** Downward speed cap. Keeps fast falls from outrunning collision resolution. */
  maxFallSpeed: 1300,
};

export const PLAYER = {
  width: 34,
  height: 34,

  runSpeed: 290,
  /** Horizontal ramp-up and ramp-down, in px/s². Ground friction is higher than air. */
  groundAccel: 2600,
  groundFriction: 2400,
  airAccel: 1900,
  airFriction: 700,

  jumpVelocity: -790,
  /**
   * Releasing jump early clamps upward velocity to this fraction of the launch speed.
   * Peak height scales with the square of velocity, so 0.7 gives a tap jump about half the
   * height of a full one (~72px vs ~142px) — short enough to matter, tall enough to still
   * clear the generator's minimum gap. Below roughly 0.65 the tap jump stops clearing
   * anything and effectively becomes a dead input.
   */
  jumpCutoff: 0.7,

  /** Grace period after walking off a ledge during which a jump still works. */
  coyoteTime: 0.1,
  /** Jump pressed slightly before landing is remembered this long and fires on touchdown. */
  jumpBuffer: 0.1,
};

export const CAMERA = {
  /**
   * Where the player sits vertically, as a fraction of view height. Below centre so
   * there's more room to see upward than downward.
   */
  anchorY: 0.62,
  /** Follow smoothing per second — higher snaps harder to the target. */
  followLerp: 9,
  /**
   * The camera never scrolls back down, so this is the death plane: falling this far
   * below the bottom edge of the view kills the run.
   */
  deathMargin: 40,
};

export const PLATFORM = {
  height: 18,
  minWidth: 70,
  maxWidth: 190,
};

/**
 * Layout limits for the generator.
 *
 * These are derived from the jump, not guessed. Peak rise is v²/2g =
 * 790²/(2·2100) ≈ 148px, and a full jump arc lasts about 0.75s, covering ~218px at
 * runSpeed. The caps below sit meaningfully inside both numbers so every generated gap is
 * clearable without frame-perfect input — difficulty comes from hazards and pacing, never
 * from a jump the player physically cannot make.
 */
export const GENERATION = {
  minVerticalGap: 62,
  maxVerticalGap: 112,
  /** Horizontal distance between consecutive platform centres. */
  maxHorizontalStep: 170,
  /** Width of the wide starting platform every level opens on. */
  spawnPlatformWidth: 260,
};
