import { FONT, PALETTE } from '../engine/render.js';
import { VIEW } from '../data/tuning.js';

/**
 * The backdrop is an editor: a gutter of line numbers down the left that scrolls with the
 * camera, so climbing reads as scrolling up through a growing file. Numbers increase as
 * you gain height, which gives the climb a legible sense of progress even between
 * platforms.
 */

const LINE_HEIGHT = 26;
const GUTTER_WIDTH = 46;

export function drawBackground(ctx, camera) {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.fillStyle = PALETTE.gutter;
  ctx.fillRect(0, 0, GUTTER_WIDTH, VIEW.height);

  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'right';

  // World y of the first line boundary above the top of the view.
  const firstLine = Math.floor(camera.y / LINE_HEIGHT) * LINE_HEIGHT;

  for (let worldY = firstLine; worldY < camera.y + VIEW.height; worldY += LINE_HEIGHT) {
    const screenY = worldY - camera.y;
    // Line 1 sits at world y = 0, and numbers climb from there.
    const lineNumber = Math.floor(-worldY / LINE_HEIGHT) + 1;

    // Below the start line there is no file yet — clamping instead printed a stack of 1s.
    if (lineNumber < 1) continue;

    ctx.fillStyle = PALETTE.lineNumber;
    ctx.fillText(String(lineNumber), GUTTER_WIDTH - 8, screenY + 4);

    // A very faint rule across the page, like an editor's indent guides.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.014)';
    ctx.fillRect(GUTTER_WIDTH, screenY + LINE_HEIGHT - 1, VIEW.width - GUTTER_WIDTH, 1);
  }

  ctx.textAlign = 'left';
}
