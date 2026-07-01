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
  /**
   * Virtual entry: play these member clips strictly in order, each starting
   * only after the previous one finishes (the Arch Devil's teleport plays its
   * move-out half EXT1, then its move-in half EXT2).
   */
  sequence?: string[];
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

function playAudioElement(audio: HTMLAudioElement): void {
  const result = audio.play() as Promise<void> | undefined;
  result?.catch(() => undefined);
}

/**
 * Play one concrete manifest clip (a real `src`, honouring its `repeat`),
 * invoking `onDone` once every play has finished. The building block under
 * playLibrarySound's virtual entries.
 */
function playClip(key: string, volume: number, onDone?: () => void): void {
  const entry = soundLibrary[key];
  const audio = new Audio(assetUrl(entry?.src ?? `/sounds/${key}.mp3`));
  audio.volume = volume;
  let remainingPlays = Math.max(1, entry?.repeat ?? 1);
  audio.addEventListener("ended", () => {
    remainingPlays -= 1;
    if (remainingPlays > 0) {
      audio.currentTime = 0;
      playAudioElement(audio);
    } else {
      onDone?.();
    }
  });
  playAudioElement(audio);
}

/** Play the members of a `sequence` entry one after another, in order. */
function playSequence(keys: string[], volume: number, index = 0): void {
  if (index >= keys.length) {
    return;
  }
  playClip(keys[index], volume, () => playSequence(keys, volume, index + 1));
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
  if (entry?.sequence?.length) {
    playSequence(entry.sequence, volume);
    return;
  }
  playClip(key, volume);
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

/**
 * Opening the Spell Book shelf: a page-flip riffle. The converted H3 library has
 * no dedicated spell-book cue, so this layers the two recorded paper "deal"
 * clips (the same parchment foley the deck uses) into a quick two-page turn —
 * a real sound, not silence — played when the Book icon is opened.
 */
export function playSpellBookOpen(): void {
  playLibrarySound("cards/card-deal-1", 0.5);
  window.setTimeout(() => playLibrarySound("cards/card-deal-2", 0.42), 90);
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
 * Tabletop dice roll: an airy throw, then a rattle of wooden knocks that bounce
 * off the table and spread out as the die sheds energy, and finally a firm
 * settling thud — with a little rock as it tips onto its face — when it comes to
 * rest. This makes the on-screen dice read as a physical throw, not a silent CSS
 * tumble. `settleMs` should match the moment the visual cube stops spinning so
 * the closing thud lands together with the result.
 *
 * Note: the rolling body now comes from /sounds/ui/dice-roll.mp3; the WebAudio
 * layer below only adds the exact landing thud.
 */
export function playDiceRoll(dieCount = 1, settleMs = 1300): void {
  if (muted || typeof window === "undefined") {
    return;
  }
  const sampleDelay = Math.max(0, settleMs - 1392);
  window.setTimeout(() => playLibrarySound("ui/dice-roll", Math.min(0.72, 0.54 + dieCount * 0.04)), sampleDelay);

  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }

  // The die comes to rest: a low, firm thud on the felt, then a quick lighter
  // tick as it rocks and tips flat onto its face.
  playNoise({ durationMs: 100, from: 470, to: 170, q: 0.8, gain: 0.12, attackMs: 3 }, settleMs);
  playNoise({ durationMs: 46, from: 880, to: 360, q: 1.0, gain: 0.045, attackMs: 2 }, settleMs + 78);
}

/**
 * Combat-strike foley. These are synthesized placeholders (the same
 * filtered-noise toolkit as the dice / card sounds) layered under each unit's
 * own H3 voice clip, so a melee blow reads "grunt + thwack" and a shot reads
 * "loose + whoosh + thud". Swap the bodies for recorded weapon hits later;
 * callers (the FX layer) need not change.
 */

/** A melee weapon connecting: a low body thud plus a sharp metallic crack. */
export function playMeleeImpact(delayMs = 0): void {
  // Low, blunt body of the hit.
  playNoise({ durationMs: 95, from: 330, to: 105, q: 0.8, gain: 0.15, attackMs: 2 }, delayMs);
  // Bright transient on top so it cuts through as a strike, not just a thump.
  playNoise({ durationMs: 55, from: 2700, to: 950, q: 1.25, gain: 0.08, attackMs: 1 }, delayMs + 4);
}

/** A projectile leaving the shooter: an airy high-to-low whoosh. */
export function playWhoosh(delayMs = 0): void {
  playNoise({ durationMs: 220, from: 1850, to: 520, q: 0.7, gain: 0.07, attackMs: 18 }, delayMs);
}

/** A projectile landing: a lighter thud than a melee blow, with a tick. */
export function playProjectileImpact(delayMs = 0): void {
  playNoise({ durationMs: 70, from: 880, to: 300, q: 1.0, gain: 0.11, attackMs: 2 }, delayMs);
  playNoise({ durationMs: 38, from: 2200, to: 1200, q: 1.4, gain: 0.05, attackMs: 1 }, delayMs + 3);
}
