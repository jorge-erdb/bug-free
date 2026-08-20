import { FONT, PALETTE, roundRect, text } from '../engine/render.js';
import { LEVELS } from '../data/levels.js';
import { isLevelUnlocked } from '../save.js';
import { VIEW } from '../data/tuning.js';

/**
 * Menus and overlays.
 *
 * Every screen is a list of options, so they all share one small menu model: draw a list,
 * track a highlighted index, and hit-test the same rectangles for pointer input. Keyboard
 * and pointer therefore stay in sync automatically instead of each screen inventing its own
 * navigation.
 *
 * `updateMenu` returns the id of a chosen option, or null. Screens are pure functions of
 * state — they never mutate game state themselves, they only report what was picked.
 */

const ROW_HEIGHT = 44;
const ROW_WIDTH = 340;

/**
 * @typedef {object} MenuOption
 * @property {string} id
 * @property {string} label
 * @property {string} [detail] Right-aligned secondary text.
 * @property {boolean} [locked]
 */

/** Layout for a vertical option list, shared by drawing and hit-testing. */
function rowRect(index, count, topY) {
  const totalHeight = count * ROW_HEIGHT;
  const startY = topY ?? (VIEW.height - totalHeight) / 2;
  return {
    x: (VIEW.width - ROW_WIDTH) / 2,
    y: startY + index * ROW_HEIGHT,
    width: ROW_WIDTH,
    height: ROW_HEIGHT - 8,
  };
}

/**
 * Advances a menu by one step of input.
 *
 * @returns {string|null} the chosen option id, or null if nothing was chosen.
 */
export function updateMenu(menu, input, options, topY) {
  const selectable = options.filter((option) => !option.locked);
  if (selectable.length === 0) return null;

  // Space and Enter both map to `confirm`, so one binding covers menus and gameplay.
  if (input.pressed('confirm')) {
    const current = options[menu.index];
    if (current && !current.locked) return current.id;
  }

  if (input.pressed('down')) menu.index = nextSelectable(options, menu.index, 1);
  if (input.pressed('up')) menu.index = nextSelectable(options, menu.index, -1);

  // Pointer: a tap that lands on an unlocked row selects it directly.
  const tap = input.tap();
  if (tap) {
    for (let i = 0; i < options.length; i += 1) {
      const rect = rowRect(i, options.length, topY);
      const inside = tap.x >= rect.x && tap.x <= rect.x + rect.width
        && tap.y >= rect.y && tap.y <= rect.y + rect.height;
      if (!inside) continue;
      menu.index = i;
      return options[i].locked ? null : options[i].id;
    }
  }

  return null;
}

function nextSelectable(options, from, step) {
  let index = from;
  for (let i = 0; i < options.length; i += 1) {
    index = (index + step + options.length) % options.length;
    if (!options[index].locked) return index;
  }
  return from;
}

export function drawMenu(ctx, menu, options, topY) {
  options.forEach((option, index) => {
    const rect = rowRect(index, options.length, topY);
    const selected = index === menu.index;

    ctx.fillStyle = selected ? 'rgba(88, 166, 255, 0.14)' : 'rgba(22, 27, 34, 0.7)';
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 5);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = PALETTE.accent;
      ctx.lineWidth = 1.5;
      roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 5);
      ctx.stroke();
    }

    const labelColor = option.locked
      ? PALETTE.lineNumber
      : (selected ? PALETTE.text : PALETTE.textDim);

    // A caret marks the selection, in keeping with the terminal framing.
    if (selected) {
      text(ctx, '>', rect.x + 12, rect.y + 11, { size: 15, color: PALETTE.accent });
    }
    text(ctx, option.label, rect.x + 30, rect.y + 11, { size: 15, color: labelColor });

    if (option.detail) {
      text(ctx, option.detail, rect.x + rect.width - 12, rect.y + 12, {
        size: 12,
        color: option.locked ? PALETTE.lineNumber : PALETTE.comment,
        align: 'right',
      });
    }
  });
}

/** Shared page furniture: the title block at the top of every non-gameplay screen. */
function drawHeader(ctx, title, subtitle) {
  text(ctx, title, VIEW.width / 2, 120, {
    size: 34, color: PALETTE.text, align: 'center', weight: 'bold',
  });
  if (subtitle) {
    text(ctx, subtitle, VIEW.width / 2, 164, {
      size: 13, color: PALETTE.comment, align: 'center',
    });
  }
}

export const MAIN_MENU_OPTIONS = [
  { id: 'campaign', label: 'campaña', detail: `${LEVELS.length} niveles` },
  { id: 'endless', label: 'modo infinito', detail: 'sin final' },
  { id: 'help', label: 'cómo jugar' },
];

export function drawMainMenu(ctx, menu, save) {
  drawHeader(ctx, 'Bug Free', 'eres un LLM. escala hasta desplegar la app.');

  const options = MAIN_MENU_OPTIONS.map((option) => (
    option.id === 'endless' && save.bestScore > 0
      ? { ...option, detail: `récord ${save.bestScore}` }
      : option
  ));

  drawMenu(ctx, menu, options, 300);
  text(ctx, 'flechas para elegir · espacio para confirmar', VIEW.width / 2, VIEW.height - 60, {
    size: 12, color: PALETTE.textDim, align: 'center',
  });
  return options;
}

export function levelSelectOptions(save) {
  return LEVELS.map((level, index) => {
    const unlocked = isLevelUnlocked(save, index);
    return {
      id: level.id,
      label: unlocked ? level.title : '???',
      detail: unlocked ? (save.levelBest[level.id] ? '✓ desplegado' : `${level.height}px`) : 'bloqueado',
      locked: !unlocked,
    };
  });
}

export function drawLevelSelect(ctx, menu, save) {
  drawHeader(ctx, 'campaña', 'cada nivel es un proyecto que hay que desplegar');
  const options = levelSelectOptions(save);
  drawMenu(ctx, menu, options, 280);

  // Flavour text for the highlighted level, so the list isn't just filenames.
  const level = LEVELS[menu.index];
  if (level && isLevelUnlocked(save, menu.index)) {
    text(ctx, level.flavorText, VIEW.width / 2, VIEW.height - 120, {
      size: 12, color: PALETTE.comment, align: 'center',
    });
  }

  text(ctx, 'esc para volver', VIEW.width / 2, VIEW.height - 60, {
    size: 12, color: PALETTE.textDim, align: 'center',
  });
  return options;
}

export function drawHelp(ctx) {
  drawHeader(ctx, 'cómo jugar', null);

  const lines = [
    ['←  →  /  A  D', 'moverte'],
    ['espacio  /  W', 'saltar — mantén para saltar más alto'],
    ['R', 'reiniciar al instante'],
    ['esc', 'pausa'],
    ['', ''],
    ['plataformas verdes', 'sólidas'],
    ['plataformas azules', 'se mueven'],
    ['plataformas ámbar', 'se rompen al pisarlas'],
    ['plataformas rojas', 'generan bugs'],
    ['', ''],
    ['bugs', 'te matan al tocarte'],
    ['{}', 'tokens — puntos'],
    ['git revert', 'congela los bugs 3 segundos'],
  ];

  let y = 230;
  for (const [key, description] of lines) {
    if (key) {
      text(ctx, key, 90, y, { size: 13, color: PALETTE.accent });
      text(ctx, description, 250, y, { size: 13, color: PALETTE.textDim });
    }
    y += 26;
  }

  text(ctx, 'esc o espacio para volver', VIEW.width / 2, VIEW.height - 60, {
    size: 12, color: PALETTE.textDim, align: 'center',
  });
}

/** A translucent panel used by every in-run overlay. */
function drawPanel(ctx, y, height) {
  ctx.fillStyle = 'rgba(1, 4, 9, 0.9)';
  ctx.fillRect(0, y, VIEW.width, height);
  ctx.strokeStyle = PALETTE.gutter;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + 0.5);
  ctx.lineTo(VIEW.width, y + 0.5);
  ctx.moveTo(0, y + height - 0.5);
  ctx.lineTo(VIEW.width, y + height - 0.5);
  ctx.stroke();
}

export function drawGameOver(ctx, world, { mode, score, isRecord }) {
  const y = VIEW.height / 2 - 90;
  drawPanel(ctx, y, 180);

  text(ctx, 'run failed', VIEW.width / 2, y + 22, {
    size: 24, color: PALETTE.danger, align: 'center', weight: 'bold',
  });

  // The death reason is the joke and the information, so it gets prime position.
  ctx.font = `12px ${FONT}`;
  text(ctx, world.deathReason, VIEW.width / 2, y + 58, {
    size: 12, color: PALETTE.warning, align: 'center',
  });

  if (mode === 'endless') {
    text(ctx, `score ${score}`, VIEW.width / 2, y + 88, {
      size: 17, color: PALETTE.text, align: 'center',
    });
    if (isRecord) {
      text(ctx, '¡nuevo récord!', VIEW.width / 2, y + 112, {
        size: 12, color: PALETTE.token, align: 'center',
      });
    }
  } else {
    text(ctx, `${Math.max(0, world.height)}px escalados`, VIEW.width / 2, y + 88, {
      size: 15, color: PALETTE.textDim, align: 'center',
    });
  }

  text(ctx, 'espacio para reintentar · esc para salir', VIEW.width / 2, y + 146, {
    size: 12, color: PALETTE.textDim, align: 'center',
  });
}

export function drawLevelComplete(ctx, world, { title, isLast }) {
  const y = VIEW.height / 2 - 90;
  drawPanel(ctx, y, 180);

  text(ctx, '✓ deployed', VIEW.width / 2, y + 22, {
    size: 26, color: PALETTE.platformEdge, align: 'center', weight: 'bold',
  });
  text(ctx, `${title} está en producción`, VIEW.width / 2, y + 60, {
    size: 13, color: PALETTE.comment, align: 'center',
  });
  text(ctx, `${world.tokensCollected} tokens · ${world.elapsed.toFixed(1)}s`, VIEW.width / 2, y + 88, {
    size: 13, color: PALETTE.textDim, align: 'center',
  });

  const hint = isLast
    ? 'has enviado todo. espacio para volver al menú'
    : 'espacio para el siguiente nivel · esc para el menú';
  text(ctx, hint, VIEW.width / 2, y + 146, {
    size: 12, color: PALETTE.textDim, align: 'center',
  });
}

export function drawPaused(ctx) {
  const y = VIEW.height / 2 - 50;
  drawPanel(ctx, y, 100);
  text(ctx, 'paused', VIEW.width / 2, y + 26, {
    size: 22, color: PALETTE.text, align: 'center', weight: 'bold',
  });
  text(ctx, 'espacio para continuar · esc para salir', VIEW.width / 2, y + 62, {
    size: 12, color: PALETTE.textDim, align: 'center',
  });
}
