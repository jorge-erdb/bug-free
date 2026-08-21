import { PHYSICS, PLAYER } from '../data/tuning.js';
import { clampToWalls, resolveLanding } from './collision.js';
import { PALETTE, roundRect } from '../engine/render.js';

/**
 * The player: an LLM, rendered as a rounded token with a blinking cursor for an eye.
 *
 * There is no jump input. The player bounces automatically the instant they touch a
 * surface, always to the same height, and the only thing they control is which way to
 * steer while airborne. That is what lets one control scheme serve keyboard, tablet and
 * phone identically — steering is the whole game, and a thumb can do it as well as a
 * keyboard.
 *
 * It also removes the forgiveness machinery a manual jump needs (coyote time, jump
 * buffering, variable height): none of it has anything to forgive when the jump is not a
 * decision the player can get wrong.
 */
export function createPlayer(x, y) {
  return {
    x,
    y,
    width: PLAYER.width,
    height: PLAYER.height,
    vx: 0,
    vy: 0,

    grounded: false,
    /** The platform touched this step, so callers can react to what it is. */
    standingOn: null,
    facing: 1,

    /** Highest point reached, in world space. Drives score and the ratcheting camera. */
    peakY: y,

    /** Animation-only clock, never used by physics. */
    animTime: 0,
  };
}

export function stepPlayer(player, input, platforms, dt) {
  // One-shot flag, consumed by the caller for feedback. Reset first so it only ever
  // describes the step that just ran.
  player.justJumped = false;

  const wantsLeft = input.held('left');
  const wantsRight = input.held('right');
  const direction = (wantsRight ? 1 : 0) - (wantsLeft ? 1 : 0);

  // --- Horizontal ---
  const accel = player.grounded ? PLAYER.groundAccel : PLAYER.airAccel;
  const friction = player.grounded ? PLAYER.groundFriction : PLAYER.airFriction;

  if (direction !== 0) {
    player.vx += direction * accel * dt;
    player.vx = Math.max(-PLAYER.runSpeed, Math.min(PLAYER.runSpeed, player.vx));
    player.facing = direction;
  } else if (player.vx !== 0) {
    // Decay toward zero without overshooting into the opposite direction.
    const drop = friction * dt;
    player.vx = player.vx > 0
      ? Math.max(0, player.vx - drop)
      : Math.min(0, player.vx + drop);
  }

  // --- Vertical ---
  player.vy += PHYSICS.gravity * dt;
  if (player.vy > PHYSICS.maxFallSpeed) player.vy = PHYSICS.maxFallSpeed;

  const previousY = player.y;
  player.y += player.vy * dt;
  player.x += player.vx * dt;

  const landedOn = resolveLanding(player, previousY, platforms);

  player.grounded = landedOn !== null;
  player.standingOn = landedOn;

  if (landedOn) {
    /*
     * The bounce. `standingOn` is left set for this one step even though the player is
     * already leaving, because that single frame of contact is what a crumbling platform
     * reads to start falling apart and what a moving platform reads to carry the player.
     * By the next step the player is airborne and both revert to null.
     */
    if (landedOn.vx) player.x += landedOn.vx * dt;
    player.vy = PLAYER.bounceVelocity;
    player.justJumped = true;
  }

  clampToWalls(player);

  if (player.y < player.peakY) player.peakY = player.y;
  player.animTime += dt;
}

export function drawPlayer(ctx, player, camera) {
  const screenX = player.x;
  const screenY = player.y - camera.y;

  // Squash and stretch read velocity, so bounces and falls have weight.
  const stretch = Math.max(-0.18, Math.min(0.18, player.vy / 4200));
  const height = player.height * (1 + stretch);
  const width = player.width * (1 - stretch * 0.7);
  const offsetX = (player.width - width) / 2;
  const offsetY = player.height - height;

  ctx.fillStyle = PALETTE.player;
  roundRect(ctx, screenX + offsetX, screenY + offsetY, width, height, 7);
  ctx.fill();

  // A blinking block cursor for an eye — mostly open, brief blinks.
  const blinking = player.animTime % 3.4 > 3.2;
  if (!blinking) {
    const eyeWidth = 6;
    const eyeHeight = 12;
    const eyeX = screenX + offsetX + width / 2 + player.facing * 4 - eyeWidth / 2;
    const eyeY = screenY + offsetY + height / 2 - eyeHeight / 2;
    ctx.fillStyle = PALETTE.playerEye;
    ctx.fillRect(eyeX, eyeY, eyeWidth, eyeHeight);
  }
}
