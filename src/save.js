/**
 * Persistence via localStorage.
 *
 * Every read goes through a validating load rather than trusting what's on disk: the stored
 * blob is user-editable and survives across versions of the game, so a missing or malformed
 * field must degrade to a fresh save instead of throwing on boot. localStorage also throws
 * outright in some privacy modes, which is why every access is guarded — a player with
 * storage disabled should still be able to play, just without a saved high score.
 */

const STORAGE_KEY = 'bug-free.save.v1';

function defaultSave() {
  return {
    /** Best endless score. */
    bestScore: 0,
    /** Number of campaign levels unlocked; the first is always available. */
    unlockedLevels: 1,
    /** Best climb per level id, keyed by level id. */
    levelBest: {},
  };
}

function readRaw() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage disabled (private browsing, blocked cookies). Play on without saving.
    return null;
  }
}

export function loadSave() {
  const raw = readRaw();
  if (!raw) return defaultSave();

  try {
    const parsed = JSON.parse(raw);
    const fallback = defaultSave();

    return {
      bestScore: Number.isFinite(parsed.bestScore) && parsed.bestScore >= 0
        ? Math.floor(parsed.bestScore)
        : fallback.bestScore,
      unlockedLevels: Number.isInteger(parsed.unlockedLevels) && parsed.unlockedLevels >= 1
        ? parsed.unlockedLevels
        : fallback.unlockedLevels,
      levelBest: parsed.levelBest && typeof parsed.levelBest === 'object'
        ? parsed.levelBest
        : fallback.levelBest,
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Quota or disabled storage — nothing to do but keep playing.
  }
}

/** Records an endless result. Returns true when it beat the stored best. */
export function recordEndlessScore(save, score) {
  if (score <= save.bestScore) return false;
  save.bestScore = score;
  writeSave(save);
  return true;
}

/** Records a campaign completion, unlocking the next level. */
export function recordLevelComplete(save, levelId, levelIndex, totalLevels) {
  save.levelBest[levelId] = true;
  const nextUnlock = Math.min(totalLevels, levelIndex + 2);
  if (nextUnlock > save.unlockedLevels) save.unlockedLevels = nextUnlock;
  writeSave(save);
}

export function isLevelUnlocked(save, index) {
  return index < save.unlockedLevels;
}
