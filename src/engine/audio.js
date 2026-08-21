/**
 * Sound effects synthesised at runtime with WebAudio oscillators.
 *
 * No audio files at all, which keeps the whole game a few tens of kilobytes and matches the
 * no-assets approach used for the visuals. Each effect is a short oscillator plus a gain
 * envelope — enough for the arcade blips this game wants.
 *
 * Two browser realities shape this module:
 *  - An AudioContext created before a user gesture starts suspended. So the context is
 *    created lazily on the first sound and also resumed on the first input, and every call
 *    is a no-op until then rather than an error.
 *  - Audio must never be able to break the game. Every entry point is guarded, so a browser
 *    that refuses to play sound costs the player nothing but sound.
 */

let context = null;
let master = null;
let enabled = true;

function ensureContext() {
  if (context) return context;

  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    enabled = false;
    return null;
  }

  try {
    context = new Ctor();
    master = context.createGain();
    // Headroom: several effects can overlap, and clipping sounds far worse than quiet.
    master.gain.value = 0.22;
    master.connect(context.destination);
  } catch {
    enabled = false;
    return null;
  }

  return context;
}

/** Called on the first real input, when browsers permit audio to start. */
export function unlockAudio() {
  if (!enabled) return;
  const ctx = ensureContext();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

/**
 * One oscillator with a percussive envelope.
 *
 * @param {object} spec
 * @param {number} spec.from Starting frequency in Hz.
 * @param {number} [spec.to] Frequency to glide to; omit to hold steady.
 * @param {number} spec.duration Seconds.
 * @param {OscillatorType} [spec.type]
 * @param {number} [spec.gain] Peak gain before the master bus.
 */
function blip({ from, to, duration, type = 'square', gain = 1 }) {
  if (!enabled) return;
  const ctx = ensureContext();
  if (!ctx || ctx.state === 'suspended') return;

  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    if (to !== undefined) {
      // Exponential ramps cannot reach or pass zero, hence the floor.
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    }

    // Fast attack, exponential decay — the shape of a plucked or struck sound.
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  } catch {
    // A failed effect must never interrupt a frame.
  }
}

export const Sfx = {
  /** The bounce. Fires on every landing, since landing is what launches the player. */
  jump: () => blip({ from: 320, to: 620, duration: 0.11, type: 'square', gain: 0.5 }),
  token: () => blip({ from: 880, to: 1320, duration: 0.1, type: 'sine', gain: 0.6 }),
  revert: () => blip({ from: 660, to: 220, duration: 0.35, type: 'sine', gain: 0.7 }),
  crumble: () => blip({ from: 160, to: 70, duration: 0.22, type: 'sawtooth', gain: 0.35 }),

  death() {
    // Two falling tones stacked — reads as an error rather than a note.
    blip({ from: 300, to: 60, duration: 0.45, type: 'sawtooth', gain: 0.7 });
    blip({ from: 150, to: 40, duration: 0.5, type: 'square', gain: 0.4 });
  },

  deployed() {
    if (!enabled) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state === 'suspended') return;
    // A rising arpeggio for the payoff — the only sound in the game with a melody.
    [523, 659, 784, 1047].forEach((frequency, index) => {
      window.setTimeout(
        () => blip({ from: frequency, duration: 0.16, type: 'triangle', gain: 0.55 }),
        index * 90,
      );
    });
  },
};
