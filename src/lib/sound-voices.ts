"use client";

import { effectsGain, subscribeAudioMix, voiceGain } from "@/lib/audio-mix";

/**
 * The library sound effects' VOICE BUDGET and decoded-clip cache (used by
 * sound.ts; music.ts keeps its own elements).
 *
 * Every clip used to be a fresh <audio> element. A big Order & Chaos wave fires
 * a dozen clips a second, and each element is its own media pipeline (network
 * request, decoder, audio output): the browser caps how many it keeps alive,
 * so effects went missing and the background music could not (re)start, while
 * the setup work fed the frame lag. Two fixes live here:
 *  - a global cap on simultaneous clips, with priority: a new clip takes the
 *    slot of the least important one (a stale one first, then the lowest
 *    priority, then the quietest, then the oldest), never a more important
 *    one — voice lines and cues outrank ordinary effects. One key may not
 *    stack more than a few copies or restart in a burst.
 *  - clips decoded once into AudioBuffers and played through the one shared
 *    AudioContext (one output for every effect). Fetching needs CORS from the
 *    CDN; until a fetch succeeds, or for any clip that fails to fetch/decode,
 *    sound.ts keeps playing <audio> elements (within the cap).
 */

export const SOUND_PRIORITY = { normal: 1, voice: 2, cue: 3 } as const;

export type SoundVoice = {
  key: string;
  priority: number;
  /** The requested (pre-mix) volume: the quietest clip is the cheapest to lose. */
  level: number;
  startedAt: number;
  /** An <audio> element voice (counts against the tighter element cap). */
  element: boolean;
  /** Stop at once (the voice is already released): fade, pause, keep any chain moving. */
  stop: () => void;
  /** Re-apply the Options mix (element voices; buffer voices ride the mix buses). */
  relevel?: () => void;
};

/** Clips heard at once, all paths together. */
const MAX_VOICES = 24;
/** Of those, <audio> elements (each one its own media pipeline and output). */
const MAX_ELEMENT_VOICES = 12;
/** Copies of one clip at once, and starts of one clip per burst window. */
const MAX_SAME_KEY = 3;
const SAME_KEY_WINDOW_MS = 150;
/** A clip still "playing" after this long lost its ended event (stalled load): free its slot first. */
const STALE_MS = 15000;

const active = new Set<SoundVoice>();
const recentStarts = new Map<string, number[]>();

export function soundNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function victimOf(pool: Iterable<SoundVoice>, now: number): SoundVoice | null {
  let best: SoundVoice | null = null;
  let bestStale = false;
  for (const voice of pool) {
    const stale = now - voice.startedAt > STALE_MS;
    if (!best) {
      best = voice;
      bestStale = stale;
      continue;
    }
    if (stale !== bestStale) {
      if (stale) {
        best = voice;
        bestStale = true;
      }
      continue;
    }
    if (
      voice.priority < best.priority ||
      (voice.priority === best.priority && (voice.level < best.level || (voice.level === best.level && voice.startedAt < best.startedAt)))
    ) {
      best = voice;
    }
  }
  return best;
}

/** Free `victim`'s slot for a clip of `priority`; false when the victim outranks it. */
function evict(victim: SoundVoice | null, priority: number, now: number): boolean {
  if (!victim) return false;
  if (victim.priority > priority && now - victim.startedAt <= STALE_MS) return false;
  active.delete(victim);
  victim.stop();
  return true;
}

/**
 * Ask for a slot before starting a clip. False: skip it (the caller still
 * moves any chain on). True: the caller starts it and calls registerVoice.
 */
export function admitVoice(key: string, priority: number, element: boolean): boolean {
  const now = soundNow();
  // A burst of one clip (ten arrows in a frame) is heard as a few, not ten.
  const starts = (recentStarts.get(key) ?? []).filter((at) => now - at >= 0 && now - at < SAME_KEY_WINDOW_MS);
  if (starts.length >= MAX_SAME_KEY && priority < SOUND_PRIORITY.cue) {
    recentStarts.set(key, starts);
    return false;
  }
  const sameKey = [...active].filter((voice) => voice.key === key);
  if (sameKey.length >= MAX_SAME_KEY && !evict(victimOf(sameKey, now), priority, now)) return false;
  while (active.size >= MAX_VOICES) {
    if (!evict(victimOf(active, now), priority, now)) return false;
  }
  if (element) {
    let elements = [...active].filter((voice) => voice.element);
    while (elements.length >= MAX_ELEMENT_VOICES) {
      if (!evict(victimOf(elements, now), priority, now)) return false;
      elements = [...active].filter((voice) => voice.element);
    }
  }
  starts.push(now);
  recentStarts.set(key, starts);
  if (recentStarts.size > 256) {
    for (const [other, times] of recentStarts) {
      if (!times.some((at) => now - at >= 0 && now - at < SAME_KEY_WINDOW_MS)) recentStarts.delete(other);
    }
  }
  return true;
}

export function registerVoice(voice: SoundVoice): void {
  active.add(voice);
}

export function releaseVoice(voice: SoundVoice): void {
  active.delete(voice);
}

// ---- Shared WebAudio output ---------------------------------------------------

const buses = new WeakMap<BaseAudioContext, { effects: GainNode; voices: GainNode }>();
let mixedContext: AudioContext | null = null;

/**
 * The context's two mix stages (effects, voices), carrying the Options levels
 * live: a fader move re-levels everything already playing through them.
 */
export function mixBus(ctx: AudioContext, voice: boolean): GainNode {
  let pair = buses.get(ctx);
  if (!pair) {
    const effects = ctx.createGain();
    const voices = ctx.createGain();
    effects.connect(ctx.destination);
    voices.connect(ctx.destination);
    pair = { effects, voices };
    buses.set(ctx, pair);
    mixedContext = ctx;
  }
  pair.effects.gain.value = effectsGain();
  pair.voices.gain.value = voiceGain();
  return voice ? pair.voices : pair.effects;
}

if (typeof window !== "undefined") {
  subscribeAudioMix(() => {
    const pair = mixedContext ? buses.get(mixedContext) : undefined;
    if (pair) {
      pair.effects.gain.value = effectsGain();
      pair.voices.gain.value = voiceGain();
    }
    // Element voices carry the mix in their own volume.
    for (const voice of active) voice.relevel?.();
  });
}

// ---- Decoded clip cache ---------------------------------------------------------

type CachedClip = { state: "loading" | "failed" } | { state: "ready"; buffer: AudioBuffer; bytes: number };

/** Decoded PCM kept at once (least recently played dropped first). */
const CACHE_BUDGET_BYTES = 48 * 1024 * 1024;
/** Longer clips (long voice lines, stings) stay on <audio>: not worth the memory. */
const MAX_CLIP_BYTES = 6 * 1024 * 1024;
/** Fetches that fail before any succeeds: the CDN serves no CORS, stop trying. */
const MAX_BLIND_FAILURES = 3;

const clips = new Map<string, CachedClip>();
let cachedBytes = 0;
let fetchSucceeded = false;
let blindFailures = 0;

function failClip(url: string, network: boolean): void {
  clips.set(url, { state: "failed" });
  if (network && !fetchSucceeded) blindFailures += 1;
}

/**
 * The decoded buffer for `url`, or null (and its fetch+decode starts, once,
 * when it is not known yet). Reading a ready clip marks it recently used.
 */
export function clipBuffer(ctx: AudioContext, url: string): AudioBuffer | null {
  const known = clips.get(url);
  if (known) {
    if (known.state !== "ready") return null;
    clips.delete(url);
    clips.set(url, known);
    return known.buffer;
  }
  if (blindFailures >= MAX_BLIND_FAILURES || typeof fetch !== "function") return null;
  clips.set(url, { state: "loading" });
  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fetchSucceeded = true;
      return response.arrayBuffer().then((bytes) =>
        ctx.decodeAudioData(bytes).then(
          (buffer) => {
            const size = buffer.length * buffer.numberOfChannels * 4;
            if (size > MAX_CLIP_BYTES) {
              failClip(url, false);
              return;
            }
            clips.set(url, { state: "ready", buffer, bytes: size });
            cachedBytes += size;
            for (const [other, entry] of clips) {
              if (cachedBytes <= CACHE_BUDGET_BYTES) break;
              if (other === url || entry.state !== "ready") continue;
              clips.delete(other);
              cachedBytes -= entry.bytes;
            }
          },
          () => failClip(url, false)
        )
      );
    })
    .catch(() => {
      if (clips.get(url)?.state === "loading") failClip(url, true);
    });
  return null;
}

/** Test helper — forget every voice and cached clip. */
export function __resetSoundVoicesForTests(): void {
  active.clear();
  recentStarts.clear();
  clips.clear();
  cachedBytes = 0;
  fetchSucceeded = false;
  blindFailures = 0;
}
