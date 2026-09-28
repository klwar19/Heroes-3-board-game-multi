import { A, MUSIC, SFX } from "./assets";

/**
 * Restia's own music/SFX player. Reuses the game's existing Heroes 3 tracks
 * (no new audio files). Settings persist per browser.
 */
export type AudioSettings = { music: number; sfx: number; muted: boolean };

const KEY = "restia:settings";
let settings: AudioSettings = { music: 0.35, sfx: 0.5, muted: false };
let track: string | null = null;
let audio: HTMLAudioElement | null = null;
let unlockHooked = false;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) settings = { ...settings, ...(JSON.parse(saved) as Partial<AudioSettings>) };
  } catch {
    // Private mode / blocked storage: keep defaults.
  }
}

export function audioSettings(): AudioSettings {
  return settings;
}

export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAudioSettings(next: Partial<AudioSettings>): void {
  settings = { ...settings, ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
  if (audio) {
    audio.volume = settings.music;
    audio.muted = settings.muted;
    if (!settings.muted && audio.paused && track) void audio.play().catch(() => undefined);
  }
  for (const listener of listeners) listener();
}

function hookUnlock(): void {
  if (unlockHooked || typeof window === "undefined") return;
  unlockHooked = true;
  const resume = () => {
    if (audio && audio.paused && !settings.muted) void audio.play().catch(() => undefined);
  };
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);
}

export function playMusic(name: string | null): void {
  if (typeof window === "undefined" || name === track) return;
  track = name;
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  if (!name) return;
  audio = new Audio(MUSIC(name));
  audio.loop = true;
  audio.volume = settings.music;
  audio.muted = settings.muted;
  hookUnlock();
  void audio.play().catch(() => undefined);
}

export function playSfx(key: keyof typeof SFX): void {
  if (typeof window === "undefined" || settings.muted || settings.sfx <= 0) return;
  const sound = new Audio(A(SFX[key]));
  sound.volume = settings.sfx;
  void sound.play().catch(() => undefined);
}

export function stopMusic(): void {
  playMusic(null);
}
