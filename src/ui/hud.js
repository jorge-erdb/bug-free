import { FONT, PALETTE, roundRect, text } from '../engine/render.js';
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

/**
 * The pause button, and the only on-screen control in the game.
 *
 * Sized generously in logical pixels because logical pixels shrink: the canvas is letterboxed
 * to fit, so on a phone this 64px square lands at roughly 44 real pixels — the smallest target
 * a thumb hits reliably. It is exported because engine/input.js takes it as a dead zone, so
 * reaching for pause never also steers the player sideways.
 */
export const PAUSE_BUTTON = {
  x: VIEW.width - 76,
  y: BAR_HEIGHT + 8,
  width: 64,
  height: 64,
};

export function pointInRect(point, rect) {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height
  );
}

export function drawHud(ctx, world, { title, mode, best, touch }) {
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
  if (touch) drawPauseButton(ctx);
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

function drawPauseButton(ctx) {
  const { x, y, width, height } = PAUSE_BUTTON;

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(1, 4, 9, 0.7)';
  roundRect(ctx, x, y, width, height, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gutter;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 10);
  ctx.stroke();

  // Two bars — the universal pause glyph, drawn rather than typed so it never depends
  // on the font having it.
  ctx.fillStyle = PALETTE.textDim;
  const barWidth = 5;
  const barHeight = 20;
  const cx = x + width / 2;
  const cy = y + height / 2;
  ctx.fillRect(cx - barWidth - 4, cy - barHeight / 2, barWidth, barHeight);
  ctx.fillRect(cx + 4, cy - barHeight / 2, barWidth, barHeight);
  ctx.restore();
}

/**
 * Steering hints for touch play.
 *
 * The control is the whole screen split down the middle, which is invisible by nature — so
 * it gets shown clearly for the first few seconds of a run and then settles to a whisper.
 * Left permanently at full strength it would be clutter over the one thing the player is
 * trying to read; removed entirely, nobody would ever learn the control exists.
 */
export function drawSteerHints(ctx, elapsed) {
  const fade = elapsed < 3 ? 1 : Math.max(0.22, 1 - (elapsed - 3) / 2);
  const bandTop = VIEW.height - 150;

  ctx.save();

  // The divider, only along the bottom where thumbs actually rest.
  ctx.globalAlpha = 0.1 * fade;
  ctx.fillStyle = PALETTE.text;
  ctx.fillRect(VIEW.width / 2 - 0.5, bandTop, 1, VIEW.height - bandTop);

  ctx.globalAlpha = 0.5 * fade;
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('◀', VIEW.width * 0.25, VIEW.height - 90);
  ctx.fillText('▶', VIEW.width * 0.75, VIEW.height - 90);

  if (elapsed < 4) {
    ctx.globalAlpha = Math.min(1, (4 - elapsed) / 1.5);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = PALETTE.comment;
    ctx.fillText('mantén pulsado un lado para moverte', VIEW.width / 2, VIEW.height - 46);
    ctx.fillText('el salto es automático', VIEW.width / 2, VIEW.height - 26);
  }

  ctx.restore();
  ctx.textAlign = 'left';
}
