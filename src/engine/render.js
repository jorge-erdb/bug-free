import { VIEW } from '../data/tuning.js';

/**
 * Canvas setup and draw helpers.
 *
 * The back buffer is sized to VIEW × devicePixelRatio and the context scaled once, so all
 * game code works in logical 540×960 coordinates and stays crisp on retina displays.
 * CSS letterboxes the element to preserve aspect ratio.
 */

export const PALETTE = {
  background: '#0d1117',
  gutter: '#161b22',
  lineNumber: '#2d333b',
  text: '#c9d1d9',
  textDim: '#6e7681',
  accent: '#58a6ff',
  player: '#79c0ff',
  playerEye: '#0d1117',
  platform: '#238636',
  platformEdge: '#2ea043',
  danger: '#f85149',
  warning: '#d29922',
  token: '#e3b341',
  string: '#a5d6ff',
  keyword: '#ff7b72',
  comment: '#8b949e',
};

export const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function createCanvas(element) {
  const ctx = element.getContext('2d', { alpha: false });

  /** Device-pixel scale currently applied, tracked for pointer→logical conversion. */
  let cssWidth = VIEW.width;
  let cssHeight = VIEW.height;

  function resize() {
    // Fit the view box inside the window while preserving aspect ratio.
    const scale = Math.min(
      window.innerWidth / VIEW.width,
      window.innerHeight / VIEW.height,
    );
    cssWidth = Math.floor(VIEW.width * scale);
    cssHeight = Math.floor(VIEW.height * scale);

    element.style.width = `${cssWidth}px`;
    element.style.height = `${cssHeight}px`;

    const dpr = window.devicePixelRatio || 1;
    element.width = Math.round(VIEW.width * dpr);
    element.height = Math.round(VIEW.height * dpr);

    // One transform for the whole app; game code never thinks about DPR again.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'top';
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  return {
    element,
    ctx,

    /** Converts a client-space pointer position into logical game coordinates. */
    toLogical(clientX, clientY) {
      const rect = element.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * VIEW.width,
        y: ((clientY - rect.top) / rect.height) * VIEW.height,
      };
    },

    clear(color = PALETTE.background) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    },
  };
}

/** Filled rounded rectangle — used for the player and most UI panels. */
export function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function text(ctx, value, x, y, { size = 16, color = PALETTE.text, align = 'left', weight = '' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`.trim();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  ctx.textAlign = 'left';
}
