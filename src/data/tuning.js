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

  /**
   * Upward speed of the automatic bounce, applied the instant the player touches a surface.
   *
   * There is no jump button: landing *is* jumping, so this is the only launch speed in the
   * game and every hop is identical. Against the gravity above it gives a peak rise of
   * v²/2g ≈ 148px (about 142px measured), which is what sets the generator's vertical cap.
   */
  bounceVelocity: -790,
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
 * These are derived from the bounce, not guessed. Peak rise is v²/2g =
 * 790²/(2·2100) ≈ 148px, and a full bounce arc lasts about 0.75s, covering ~218px at
 * runSpeed. The caps below sit meaningfully inside both numbers, so the player always has
 * both the height and the time to steer onto the next platform — difficulty comes from
 * hazards and pacing, never from a gap that cannot physically be crossed.
 */
export const GENERATION = {
  minVerticalGap: 62,
  maxVerticalGap: 112,
  /** Horizontal distance between consecutive platform centres. */
  maxHorizontalStep: 170,
  /** Width of the wide starting platform every level opens on. */
  spawnPlatformWidth: 260,
};
