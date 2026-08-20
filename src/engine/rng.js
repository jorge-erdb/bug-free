/**
 * Seeded PRNG (mulberry32).
 *
 * Campaign levels must generate identically on every run — otherwise authored difficulty
 * is a lottery and a level that plays well once can be unfair the next time. Seeding also
 * makes tuning practical: if a level's layout is awkward, try a different seed rather than
 * rewriting the generator.
 *
 * Endless seeds from Date.now() so each run differs.
 */
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Float in [0, 1). */
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max] inclusive. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with the given probability. */
    chance: (probability) => next() < probability,
    /** Uniform pick from a non-empty array. */
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
