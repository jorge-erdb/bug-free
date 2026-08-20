import { FONT, PALETTE, text } from '../engine/render.js';
import { REVERT_DURATION, TOKEN_SCORE } from '../game/token.js';
import { VIEW } from '../data/tuning.js';

/**
 * In-game overlay.
 *
 * Styled as an editor status bar so it belongs to the fiction rather than sitting on top of
 * it. Kept to one line: in a climber the player's attention is on the platforms above, and
 * anything more elaborate is read once and then never again.
 */

const BAR_HEIGHT = 26;

export function drawHud(ctx, world, { title, mode, best }) {
  ctx.fillStyle = 'rgba(1, 4, 9, 0.85)';
  ctx.fillRect(0, 0, VIEW.width, BAR_HEIGHT);
  ctx.fillStyle = PALETTE.gutter;
  ctx.fillRect(0, BAR_HEIGHT - 1, VIEW.width, 1);

  text(ctx, title, 10, 7, { size: 13, color: PALETTE.comment });

  if (mode === 'campaign') {
    // Progress toward the finish is the only number that matters in campaign.
    const total = world.spawnY - world.finishY;
    const percent = Math.max(0, Math.min(100, Math.round((world.height / total) * 100)));
    text(ctx, `${percent}%`, VIEW.width - 10, 7, {
      size: 13, color: PALETTE.text, align: 'right',
    });

    // A thin fill under the bar doubles as a progress read without costing a line.
    ctx.fillStyle = PALETTE.platform;
    ctx.fillRect(0, BAR_HEIGHT - 2, (VIEW.width * percent) / 100, 2);
  } else {
    const score = Math.max(0, world.height) + world.tokensCollected * TOKEN_SCORE;
    text(ctx, `${score}`, VIEW.width - 10, 7, {
      size: 13, color: PALETTE.text, align: 'right',
    });
    text(ctx, `best ${best}`, VIEW.width - 70, 7, {
      size: 13, color: PALETTE.textDim, align: 'right',
    });
  }

  if (world.tokensCollected > 0) {
    text(ctx, `{} ${world.tokensCollected}`, VIEW.width / 2, 7, {
      size: 13, color: PALETTE.token, align: 'center',
    });
  }

  if (world.revertRemaining > 0) drawRevertTimer(ctx, world.revertRemaining);
}

/** The power-up needs a visible clock — its whole value is knowing when it runs out. */
function drawRevertTimer(ctx, remaining) {
  const width = 150;
  const x = (VIEW.width - width) / 2;
  const y = BAR_HEIGHT + 8;

  ctx.fillStyle = 'rgba(1, 4, 9, 0.8)';
  ctx.fillRect(x, y, width, 20);

  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(x, y, width * (remaining / REVERT_DURATION), 20);

  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = PALETTE.background;
  ctx.textAlign = 'center';
  ctx.fillText('git revert — bugs frozen', x + width / 2, y + 6);
  ctx.textAlign = 'left';
}

/**
 * Touch controls, drawn only once a touch has been seen so desktop stays clean.
 * These mirror the zones in engine/input.js exactly — if one changes, so must the other.
 */
export function drawTouchZones(ctx) {
  const bandTop = VIEW.height * 0.72;

  ctx.save();
  ctx.globalAlpha = 0.14;

  ctx.fillStyle = PALETTE.text;
  ctx.fillRect(0, bandTop, VIEW.width / 2 - 1, VIEW.height - bandTop);
  ctx.fillRect(VIEW.width / 2 + 1, bandTop, VIEW.width / 2 - 1, VIEW.height - bandTop);

  ctx.globalAlpha = 0.5;
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = PALETTE.textDim;
  ctx.textAlign = 'center';
  ctx.fillText('◀', VIEW.width * 0.25, bandTop + 26);
  ctx.fillText('▶', VIEW.width * 0.75, bandTop + 26);
  ctx.font = `12px ${FONT}`;
  ctx.fillText('toca arriba para saltar', VIEW.width / 2, bandTop - 24);

  ctx.restore();
  ctx.textAlign = 'left';
}
