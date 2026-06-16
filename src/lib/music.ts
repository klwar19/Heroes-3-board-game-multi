"use client";

import { useEffect } from "react";
import soundManifest from "../../public/sounds/manifest.json";
import { assetUrl } from "@/lib/asset-url";

/**
 * Looping background music, one track per game scene:
 *  - "menu"   → the setup / map-setup lobby (MAINMENU theme)
 *  - "map"    → the adventure map (GRASS theme)
 *  - "combat" → the battle table (COMBAT02 theme)
 *
 * This is separate from the one-shot foley/voice layer in lib/sound.ts. A
 * single <audio> element loops the current scene's track; switching scenes
 * swaps its source. Music is intentionally quieter than the sound effects
 * (SFX play at ~0.45–0.6) so the foley/voice layer stays clearly audible over
 * it, and it has its own mute that persists independently of the SFX mute.
 *
 * Browsers block audio before the first user gesture, so playback starts
 * silently and a persistent pointerdown listener resumes the current scene's
 * track the moment the player interacts.
 */

export type MusicScene = "menu" | "map" | "combat";

/** Scene → manifest key. Each key must exist in the manifest with loop:true. */
export const SCENE_TRACK: Record<MusicScene, string> = {
  menu: "music/main-menu",
  map: "music/grass",
  combat: "music/combat-02",
};

/**
 * Music volume. Kept well below the SFX volumes (0.45–0.6 in lib/sound.ts) so
 * the background theme never drowns out unit voices, spell hits or dice.
 */
export const MUSIC_VOLUME = 0.18;

const MUTE_STORAGE_KEY = "h3-music-muted";

const soundLibrary = soundManifest as Record<string, { src?: string }>;

let muted = false;
if (typeof window !== "undefined") {
  muted = window.localStorage?.getItem(MUTE_STORAGE_KEY) === "1";
}

let audio: HTMLAudioElement | null = null;
let currentScene: MusicScene | null = null;
let unlockHooked = false;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Subscribe to mute-state changes (for useSyncExternalStore in the toggle). */
export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isMusicMuted(): boolean {
  return muted;
}

function trackSrc(scene: MusicScene): string {
  const key = SCENE_TRACK[scene];
  return assetUrl(soundLibrary[key]?.src ?? `/sounds/${key}.mp3`);
}

/** Resume the current scene's track once the browser allows playback. */
function hookUnlock(): void {
  if (unlockHooked || typeof window === "undefined") {
    return;
  }
  unlockHooked = true;
  const unlock = () => {
    if (audio && currentScene && !muted && audio.paused) {
      audio.play().catch(() => undefined);
    }
  };
  window.addEventListener("pointerdown", unlock);
}

function startScene(scene: MusicScene): void {
  if (!audio) {
    audio = new Audio();
  }
  const src = trackSrc(scene);
  // Only reset the source when the track actually changes, so re-renders that
  // report the same scene don't restart the music from the top.
  if (!audio.src.endsWith(src)) {
    audio.src = src;
  }
  audio.loop = true;
  audio.volume = MUSIC_VOLUME;
  hookUnlock();
  audio.play().catch(() => undefined);
}

function stopAudio(): void {
  audio?.pause();
}

/**
 * Switch background music to `scene` (or stop it with `null`). Remembers the
 * requested scene even while muted, so unmuting resumes the right track. A
 * repeated call with the unchanged scene is a no-op (music keeps playing).
 */
export function setMusicScene(scene: MusicScene | null): void {
  if (typeof window === "undefined" || scene === currentScene) {
    return;
  }
  currentScene = scene;
  if (!scene || muted) {
    stopAudio();
    return;
  }
  startScene(scene);
}

export function setMusicMuted(next: boolean): void {
  if (next === muted) {
    return;
  }
  muted = next;
  try {
    window.localStorage?.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // private mode etc. - mute state just won't persist
  }
  if (muted) {
    stopAudio();
  } else if (currentScene) {
    startScene(currentScene);
  }
  notify();
}

/** Drive the background music from the current scene for the component's life. */
export function useBackgroundMusic(scene: MusicScene | null): void {
  useEffect(() => {
    setMusicScene(scene);
  }, [scene]);
  useEffect(
    () => () => {
      setMusicScene(null);
    },
    []
  );
}

/** Test-only reset of module singletons. */
export function __resetMusicForTests(): void {
  audio = null;
  currentScene = null;
  unlockHooked = false;
  muted = false;
  listeners.clear();
}
