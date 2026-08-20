/** Verifies save/unlock logic against a stub localStorage, including hostile stored data. */
let store = {};
globalThis.window = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  },
};

const { loadSave, recordEndlessScore, recordLevelComplete, isLevelUnlocked } =
  await import('../src/save.js');

let failures = 0;
const check = (label, cond, detail = '') => {
  if (!cond) failures += 1;
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
};

const TOTAL = 5;

// Fresh save
store = {};
let save = loadSave();
check('fresh save unlocks only level 1', isLevelUnlocked(save, 0) && !isLevelUnlocked(save, 1));
check('fresh save has no best score', save.bestScore === 0);

// Sequential unlocking
recordLevelComplete(save, 'hello-world', 0, TOTAL);
check('finishing level 1 unlocks level 2', isLevelUnlocked(save, 1) && !isLevelUnlocked(save, 2));
recordLevelComplete(save, 'todo-app', 1, TOTAL);
check('finishing level 2 unlocks level 3', isLevelUnlocked(save, 2));

// Replaying an old level must not roll back progress
recordLevelComplete(save, 'hello-world', 0, TOTAL);
check('replaying level 1 does not reduce unlocks', isLevelUnlocked(save, 2), `unlocked=${save.unlockedLevels}`);

// Last level must not unlock a level that doesn't exist
for (let i = 2; i < TOTAL; i += 1) recordLevelComplete(save, `l${i}`, i, TOTAL);
check('unlocks never exceed the level count', save.unlockedLevels === TOTAL, `unlocked=${save.unlockedLevels}`);

// Persistence across reload
save = loadSave();
check('progress survives a reload', save.unlockedLevels === TOTAL && isLevelUnlocked(save, 4));

// High score
check('a higher score is recorded', recordEndlessScore(save, 500) === true);
check('a lower score is rejected', recordEndlessScore(save, 200) === false);
check('an equal score is rejected', recordEndlessScore(save, 500) === false);
save = loadSave();
check('high score survives a reload', save.bestScore === 500, `best=${save.bestScore}`);

// Malformed / hostile stored data must degrade, never throw
for (const [label, raw] of [
  ['garbage text', 'not json at all'],
  ['null blob', 'null'],
  ['wrong types', '{"bestScore":"lots","unlockedLevels":-4,"levelBest":42}'],
  ['empty object', '{}'],
  ['array', '[1,2,3]'],
]) {
  store = { 'bug-free.save.v1': raw };
  let ok = true;
  let loaded = null;
  try { loaded = loadSave(); } catch { ok = false; }
  check(`${label} degrades to a valid save`,
    ok && loaded && loaded.unlockedLevels >= 1 && loaded.bestScore >= 0,
    ok ? `unlocked=${loaded.unlockedLevels} best=${loaded.bestScore}` : 'threw');
}

// Storage entirely unavailable
globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
let ok = true;
try {
  const s = loadSave();
  recordEndlessScore(s, 999);
} catch { ok = false; }
check('blocked storage does not break the game', ok);

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
