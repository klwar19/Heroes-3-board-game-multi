/**
 * Client preference: the audio MIX (Options → Audio). Four volume faders —
 * master, music, effects, voices — each 0..1, multiplied onto the volume every
 * playback path already chose for itself (music.ts's bed/sting, sound.ts's
 * clips and synthesized foley, battlefield-audio.ts's entrance bus). Defaults
 * are all 1, so a player who never opens Options hears exactly what they did
 * before. The existing mute switches (music / effects) stay separate and still
 * win.
 *
 * `background` = keep playing while the tab is hidden (default true, the old
 * behavior). Off: music pauses and new sound effects are skipped while the tab
 * is in the background, and the music resumes when it is shown again.
 *
 * Stored per BROWSER in localStorage (never in GameState, never sent to the
 * server); same-tab listeners + the storage event keep every tab in sync.
 */

export type AudioMix = {
  master: number;
  music: number;
  effects: number;
  voices: number;
  background: boolean;
};

export const AUDIO_MIX_DEFAULTS: Readonly<AudioMix> = Object.freeze({
  master: 1,
  music: 1,
  effects: 1,
  voices: 1,
  background: true,
});

const STORAGE_KEY = "binh-audio-mix";

function level(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function sanitizeAudioMix(raw: unknown): AudioMix {
  const source = raw && typeof raw === "object" ? (raw as Partial<AudioMix>) : {};
  return {
    master: level(source.master, AUDIO_MIX_DEFAULTS.master),
    music: level(source.music, AUDIO_MIX_DEFAULTS.music),
    effects: level(source.effects, AUDIO_MIX_DEFAULTS.effects),
    voices: level(source.voices, AUDIO_MIX_DEFAULTS.voices),
    background: typeof source.background === "boolean" ? source.background : AUDIO_MIX_DEFAULTS.background,
  };
}

function readStored(): AudioMix {
  if (typeof window === "undefined") return { ...AUDIO_MIX_DEFAULTS };
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return sanitizeAudioMix(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...AUDIO_MIX_DEFAULTS };
  }
}

let mix: AudioMix = readStored();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    mix = readStored();
    notify();
  });
}

export function getAudioMix(): AudioMix {
  return mix;
}

export function subscribeAudioMix(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAudioMix(patch: Partial<AudioMix>): void {
  const next = sanitizeAudioMix({ ...mix, ...patch });
  if (
    next.master === mix.master &&
    next.music === mix.music &&
    next.effects === mix.effects &&
    next.voices === mix.voices &&
    next.background === mix.background
  ) {
    return;
  }
  mix = next;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(mix));
  } catch {
    // Private mode / quota — the mix still applies for this session.
  }
  notify();
}

/** Multiplier for the background music bed and combat stings. */
export function musicGain(): number {
  return mix.master * mix.music;
}

/** Multiplier for sound effects (foley, spells, UI clicks, ambience). */
export function effectsGain(): number {
  return mix.master * mix.effects;
}

/** Multiplier for spoken character lines. */
export function voiceGain(): number {
  return mix.master * mix.voices;
}

/** True while the tab is hidden and the player chose not to hear it then. */
export function silencedInBackground(): boolean {
  return !mix.background && typeof document !== "undefined" && document.hidden === true;
}

/** Test helper — reset the in-memory mix (storage is left to the test). */
export function __resetAudioMixForTests(): void {
  mix = readStored();
  notify();
}

export const AUDIO_MIX_STORAGE_KEY = STORAGE_KEY;
