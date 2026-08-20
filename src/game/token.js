import { FONT, PALETTE } from '../engine/render.js';
import { aabbOverlap } from './collision.js';

/**
 * Pickups. Two kinds:
 *  - TOKEN: score. Placed slightly off the direct path so collecting is a choice with
 *    risk, not something you sweep up by climbing.
 *  - REVERT: the `git revert` power-up, which freezes every bug for a few seconds. One
 *    power-up is enough — it gives a way out of a bad spot without turning the game into
 *    inventory management.
 */
export const TokenType = {
  TOKEN: 'TOKEN',
  REVERT: 'REVERT',
};

export const TOKEN_SCORE = 25;
export const REVERT_DURATION = 3;

const SIZE = { [TokenType.TOKEN]: 18, [TokenType.REVERT]: 26 };

export function createToken(type, x, y) {
  const size = SIZE[type];
  return {
    type,
    x,
    y,
    width: size,
    height: size,
    collected: false,
    animTime: Math.random() * 10,
    /** Home y, so the bob animation doesn't drift the hitbox over time. */
    baseY: y,
  };
}

export function stepToken(token, dt) {
  token.animTime += dt;
  // Bob is cosmetic only; the hitbox stays anchored to baseY.
  token.y = token.baseY + Math.sin(token.animTime * 2.4) * 3;
}

export function tokenHitsPlayer(token, player) {
  if (token.collected) return false;
  return aabbOverlap(player, token);
}

export function drawToken(ctx, token, camera) {
  if (token.collected) return;

  const screenY = token.y - camera.y;
  const centreX = token.x + token.width / 2;
  const centreY = screenY + token.height / 2;
  const pulse = 1 + Math.sin(token.animTime * 4) * 0.06;

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.scale(pulse, pulse);

  if (token.type === TokenType.REVERT) {
    // A ring with a back-arrow, reading as "undo".
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, token.width / 2 - 2, 0.6, Math.PI * 1.9);
    ctx.stroke();

    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.moveTo(-token.width / 2 + 1, -2);
    ctx.lineTo(-token.width / 2 + 8, -7);
    ctx.lineTo(-token.width / 2 + 8, 3);
    ctx.closePath();
    ctx.fill();
  } else {
    // A token of context — drawn as a small brace pair, the currency of prompting.
    ctx.fillStyle = PALETTE.token;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('{}', 0, 0);
  }

  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
