"use client";

import soundManifest from "../../public/sounds/manifest.json";
import { assetUrl } from "@/lib/asset-url";
import { unitSoundKey, type UnitSoundAction } from "@/data/unit-sounds";

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

type SoundManifestEntry = {
  src?: string;
  /** Play the clip this many times back-to-back (creature movement loops). */
  repeat?: number;
  /** Ambience/music; nothing battle-side loops, so playback ignores it. */
  loop?: boolean;
  /**
   * Follow-up impact (lich/magog attacks chain their explosion). Playback
   * ignores it on purpose: the board game triggers those impacts through
   * abilityFxPlans only when the splash ability actually fires.
   */
  then?: string;
  /** Virtual entry: play one member at random. */
  random?: string[];
  note?: string;
};

const soundLibrary = soundManifest as Record<string, SoundManifestEntry>;

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
  const entry = soundLibrary[key];
  if (entry?.random?.length) {
    playLibrarySound(entry.random[Math.floor(Math.random() * entry.random.length)], volume);
    return;
  }
  const audio = new Audio(assetUrl(entry?.src ?? `/sounds/${key}.mp3`));
  audio.volume = volume;
  let extraPlays = Math.max(0, (entry?.repeat ?? 1) - 1);
  if (extraPlays > 0) {
    audio.addEventListener("ended", () => {
      if (extraPlays > 0) {
        extraPlays -= 1;
        audio.currentTime = 0;
        audio.play().catch(() => undefined);
      }
    });
  }
  audio.play().catch(() => undefined);
}

/**
 * Creature voice for a combat moment: the unit's own H3 clip for placing
 * its card, striking, blocking, wincing, moving or dying. Unknown units and
 * missing clips stay silent.
 */
export function playUnitSound(
  unitDefId: string | undefined,
  action: UnitSoundAction,
  delayMs = 0
): void {
  if (!unitDefId || typeof window === "undefined") {
    return;
  }
  const key = unitSoundKey(unitDefId, action);
  if (!key) {
    return;
  }
  if (delayMs > 0) {
    window.setTimeout(() => playLibrarySound(key), delayMs);
  } else {
    playLibrarySound(key);
  }
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

/**
 * Tabletop dice roll: a rattle of wooden knocks that bounce off the table and
 * spread out as the die loses energy, then a firmer settling thud when it comes
 * to rest. This makes the on-screen dice read as a physical throw instead of a
 * silent CSS tumble. `settleMs` should match the moment the visual cube stops
 * spinning so the final knock lands with the result.
 */
export function playDiceRoll(dieCount = 1, settleMs = 1300): void {
  if (muted || typeof window === "undefined") {
    return;
  }
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }

  // Bounces start fast and tight, then grow apart (a decaying bounce); a touch
  // of jitter on timing and pitch keeps it from sounding metronomic. More dice
  // pack a few extra knocks into the same window.
  const knocks = Math.min(18, 10 + dieCount * 2);
  let t = 30;
  for (let i = 0; i < knocks; i += 1) {
    const progress = i / knocks;
    const gap = 48 + progress * progress * 210 + Math.random() * 30;
    t += gap;
    if (t >= settleMs) {
      break;
    }
    const freq = 1550 - progress * 760 + (Math.random() * 260 - 130);
    const gain = 0.045 + (1 - progress) * 0.05;
    playNoise({ durationMs: 20 + Math.random() * 16, from: freq, to: freq * 0.55, q: 1.1, gain, attackMs: 2 }, t);
  }

  // The die finally comes to rest: one lower, firmer knock on the felt.
  playNoise({ durationMs: 80, from: 520, to: 220, q: 0.85, gain: 0.13, attackMs: 3 }, settleMs);
}
