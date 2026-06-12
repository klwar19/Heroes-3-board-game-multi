"use client";

/**
 * Table audio. Two sources:
 *  - the converted Heroes III library under /public/sounds (manifest keys
 *    like "spells/fireball"), played through <audio> elements
 *  - synthesized card-handling foley (draw swish, card landing, shuffle)
 *    generated with WebAudio, since the original game has no card sounds
 *
 * Browsers block audio before the first user gesture; every call degrades to
 * silence until then, and a one-time pointerdown listener unlocks the
 * context for remote players who receive events before interacting.
 */

let audioContext: AudioContext | null = null;
let unlockHooked = false;
let muted = false;

const MUTE_STORAGE_KEY = "h3-table-muted";

if (typeof window !== "undefined") {
  muted = window.localStorage?.getItem(MUTE_STORAGE_KEY) === "1";
}

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage?.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // private mode etc. - mute state just won't persist
  }
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (!unlockHooked) {
    unlockHooked = true;
    const unlock = () => {
      audioContext?.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => undefined);
  }
  return audioContext;
}

/** Play a converted H3 sound by manifest key ("spells/fireball"). */
export function playLibrarySound(key: string, volume = 0.55): void {
  if (muted || typeof window === "undefined") {
    return;
  }
  const audio = new Audio(`/sounds/${key}.mp3`);
  audio.volume = volume;
  audio.play().catch(() => undefined);
}

type NoiseShape = {
  durationMs: number;
  /** Bandpass sweep, in Hz. */
  from: number;
  to: number;
  q: number;
  gain: number;
  attackMs?: number;
};

/** Filtered-noise burst: the basis of every synthesized card sound. */
function playNoise(shape: NoiseShape, delayMs = 0): void {
  if (muted) {
    return;
  }
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }

  const start = ctx.currentTime + delayMs / 1000;
  const duration = shape.durationMs / 1000;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = shape.q;
  filter.frequency.setValueAtTime(shape.from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, shape.to), start + duration);

  const gain = ctx.createGain();
  const attack = (shape.attackMs ?? 8) / 1000;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(shape.gain, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration);
}

/** Card sliding off the deck (alternates two recorded deal sounds). */
let dealAlternator = 0;
export function playCardSwish(delayMs = 0): void {
  dealAlternator = (dealAlternator + 1) % 2;
  const key = dealAlternator === 0 ? "cards/card-deal-1" : "cards/card-deal-2";
  if (delayMs > 0) {
    window.setTimeout(() => playLibrarySound(key, 0.5), delayMs);
  } else {
    playLibrarySound(key, 0.5);
  }
}

/** Card settling on the table / into the hand. */
export function playCardPlace(delayMs = 0): void {
  if (delayMs > 0) {
    window.setTimeout(() => playLibrarySound("cards/card-play", 0.45), delayMs);
  } else {
    playLibrarySound("cards/card-play", 0.45);
  }
}

/** Quick riffle when the discard pile shuffles back into the deck. */
export function playShuffle(delayMs = 0): void {
  for (let i = 0; i < 5; i += 1) {
    playNoise(
      { durationMs: 65, from: 1200 + i * 250, to: 2800, q: 1.4, gain: 0.1, attackMs: 4 },
      delayMs + i * 55
    );
  }
}
