import { PHYSICS, PLAYER } from '../data/tuning.js';
import { clampToWalls, resolveLanding } from './collision.js';
import { PALETTE, roundRect } from '../engine/render.js';

/**
 * The player: an LLM, rendered as a rounded token with a blinking cursor for an eye.
 *
 * Movement carries the two forgiveness mechanics that make a climber feel fair rather
 * than fussy:
 *  - coyote time: a jump still works briefly after walking off a ledge
 *  - jump buffer: a jump pressed just before landing fires on touchdown
 * Both are small windows (~0.1s) that players never notice consciously but immediately
 * feel the absence of.
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
    /** The platform currently underfoot, so callers can react to what it is. */
    standingOn: null,
    facing: 1,

    /** Countdown timers for the forgiveness windows. */
    coyoteRemaining: 0,
    jumpBufferRemaining: 0,

    /** Set once the jump key is released, to stop a single press re-triggering. */
    jumpConsumed: true,

    /** Highest point reached, in world space. Drives score and the ratcheting camera. */
    peakY: y,

    /** Animation-only clock, never used by physics. */
    animTime: 0,
  };
}

export function stepPlayer(player, input, platforms, dt) {
  // One-shot flags, consumed by the caller for feedback. Reset first so they only ever
  // describe the step that just ran.
  player.justJumped = false;
  player.justLanded = false;

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

  // --- Jump intent ---
  if (input.pressed('jump')) player.jumpBufferRemaining = PLAYER.jumpBuffer;
  if (!input.held('jump')) player.jumpConsumed = true;

  const canJump = player.grounded || player.coyoteRemaining > 0;
  if (player.jumpBufferRemaining > 0 && canJump && player.jumpConsumed) {
    player.vy = PLAYER.jumpVelocity;
    player.grounded = false;
    player.standingOn = null;
    player.coyoteRemaining = 0;
    player.jumpBufferRemaining = 0;
    player.jumpConsumed = false;
    player.justJumped = true;
  }

  /*
   * Releasing early clips upward momentum to a floor — once, not per frame. Decaying it
   * every frame instead collapses the jump to almost nothing (a tap peaked at 26px against
   * a 62px minimum gap), which makes short jumps useless rather than merely shorter.
   * A single clamp keeps the tap jump a real option: it still clears the tightest gap, but
   * not a wide one.
   */
  if (!input.held('jump') && player.vy < 0) {
    const floor = PLAYER.jumpVelocity * PLAYER.jumpCutoff;
    if (player.vy < floor) player.vy = floor;
  }

  // --- Vertical ---
  player.vy += PHYSICS.gravity * dt;
  if (player.vy > PHYSICS.maxFallSpeed) player.vy = PHYSICS.maxFallSpeed;

  const previousY = player.y;
  player.y += player.vy * dt;
  player.x += player.vx * dt;

  const wasGrounded = player.grounded;
  const landedOn = resolveLanding(player, previousY, platforms);

  player.grounded = landedOn !== null;
  player.standingOn = landedOn;
  player.justLanded = player.grounded && !wasGrounded;

  // Being carried by a moving platform.
  if (landedOn?.vx) player.x += landedOn.vx * dt;

  clampToWalls(player);

  // --- Timers ---
  if (player.grounded) {
    player.coyoteRemaining = PLAYER.coyoteTime;
  } else {
    player.coyoteRemaining = Math.max(0, player.coyoteRemaining - dt);
  }
  player.jumpBufferRemaining = Math.max(0, player.jumpBufferRemaining - dt);

  if (player.y < player.peakY) player.peakY = player.y;
  player.animTime += dt;
}

export function drawPlayer(ctx, player, camera) {
  const screenX = player.x;
  const screenY = player.y - camera.y;

  // Squash and stretch read velocity, so jumps and landings have weight.
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
