import { CAMERA, VIEW } from '../data/tuning.js';

/**
 * A ratcheting camera. World y grows downward, so climbing means decreasing y — and this
 * camera's y only ever decreases.
 *
 * That one-way behaviour is what makes the climb feel committed: ground you've gained is
 * gone for good, and the bottom edge of the view becomes a moving death plane. A camera
 * that followed the player back down would turn the same level into an aimless sandbox.
 */
export function createCamera(playerY) {
  const target = playerY - VIEW.height * CAMERA.anchorY;
  return {
    y: target,
    /** Additive screen offset for hit feedback. Never affects the simulation. */
    shakeX: 0,
    shakeY: 0,
    shakeRemaining: 0,
    shakeStrength: 0,
  };
}

export function stepCamera(camera, player, dt) {
  const target = player.y - VIEW.height * CAMERA.anchorY;

  // Only ever pull upward. Falling doesn't move the camera at all.
  if (target < camera.y) {
    const t = 1 - Math.exp(-CAMERA.followLerp * dt);
    camera.y += (target - camera.y) * t;
  }

  if (camera.shakeRemaining > 0) {
    camera.shakeRemaining -= dt;
    const decay = Math.max(0, camera.shakeRemaining / 0.35);
    const amount = camera.shakeStrength * decay;
    camera.shakeX = (Math.random() * 2 - 1) * amount;
    camera.shakeY = (Math.random() * 2 - 1) * amount;
  } else {
    camera.shakeX = 0;
    camera.shakeY = 0;
  }
}

export function shakeCamera(camera, strength = 9) {
  camera.shakeStrength = strength;
  camera.shakeRemaining = 0.35;
}

/** World y of the bottom edge of the view, past which the player is lost. */
export function deathPlane(camera) {
  return camera.y + VIEW.height + CAMERA.deathMargin;
}
