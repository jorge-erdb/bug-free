import { PlatformType } from '../game/platform.js';
import { BugType } from '../game/bug.js';

/**
 * The campaign, as data.
 *
 * Each level is a plain config the generator renders — there are no hand-built layouts, so
 * adding levels 6–10 means appending objects here and nothing else. `seed` fixes the
 * layout, so a level plays the same every time and can be retuned by trying seeds.
 *
 * The progression introduces exactly one new mechanic per level and never takes one away.
 * Each level is a project you ship, which is the whole conceit: you climb from an empty
 * file to a deploy, and the code you're standing on gets buggier the more ambitious the
 * project gets.
 */
export const LEVELS = [
  {
    id: 'hello-world',
    title: 'hello_world.py',
    flavorText: 'Todo empieza con un archivo vacío.',
    height: 1500,
    seed: 1001,
    // No hazards at all: this level exists to teach the jump.
    platformTypes: [],
    variantChance: 0,
    bugTypes: [],
    bugRate: 0,
  },
  {
    id: 'todo-app',
    title: 'todo-app',
    flavorText: 'La app de tareas. Nada se mantiene quieto.',
    height: 2000,
    seed: 1002,
    platformTypes: [PlatformType.MOVING],
    variantChance: 0.35,
    bugTypes: [BugType.CRAWLER],
    bugRate: 0.22,
  },
  {
    id: 'portfolio-site',
    title: 'portfolio-site',
    flavorText: 'Código que se desmorona si te quedas parado.',
    height: 2400,
    seed: 1003,
    platformTypes: [PlatformType.MOVING, PlatformType.CRUMBLING],
    variantChance: 0.45,
    bugTypes: [BugType.CRAWLER],
    bugRate: 0.26,
  },
  {
    id: 'rest-api',
    title: 'rest-api',
    flavorText: 'Cuidado con lo que cae desde arriba.',
    height: 2800,
    seed: 1004,
    platformTypes: [PlatformType.MOVING, PlatformType.CRUMBLING],
    variantChance: 0.5,
    bugTypes: [BugType.CRAWLER, BugType.NULL_POINTER],
    bugRate: 0.3,
  },
  {
    id: 'multiplayer-game',
    title: 'multiplayer-game',
    flavorText: 'Demasiado ambicioso. Obviamente.',
    height: 3200,
    seed: 1005,
    platformTypes: [PlatformType.MOVING, PlatformType.CRUMBLING, PlatformType.BUGGY],
    variantChance: 0.6,
    bugTypes: [BugType.CRAWLER, BugType.NULL_POINTER, BugType.INFINITE_LOOP],
    bugRate: 0.34,
  },
];

export function levelByIndex(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}
