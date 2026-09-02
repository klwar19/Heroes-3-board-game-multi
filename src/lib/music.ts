"use client";

import { useEffect } from "react";
import type { GameState, HeroState } from "@/engine/state";
import soundManifest from "../../public/sounds/manifest.json";
import { assetUrl } from "@/lib/asset-url";

export type MusicScene = "menu" | "map" | "combat";
export type MapMusicEnvironment = "surface" | "water" | "underground";
export type MapMusicContext = {
  /** Drives a fresh general-map pick when the active turn changes. */
  turnKey: string;
  factionId?: string;
  environment: MapMusicEnvironment;
};

type MusicProfile =
  | "menu" | "combat" | "map-general" | "map-water" | "map-underground"
  | "town-necropolis" | "town-rampart" | "town-cove" | "town-castle"
  | "town-stronghold" | "town-tower" | "town-fortress";

/** Multi-track profiles advance randomly and never immediately repeat. */
export const MUSIC_TRACKS: Record<MusicProfile, readonly string[]> = {
  menu: ["music/main-menu"],
  combat: ["music/combat-02", "music/combat-03", "music/combat-04"],
  "map-general": ["music/rough", "music/sand", "music/snow"],
  "map-water": ["music/water"],
  "map-underground": ["music/dirt"],
  "town-necropolis": ["music/necro-town"],
  "town-rampart": ["music/rampart"],
  "town-cove": ["music/cove-town"],
  "town-castle": ["music/castle-town"],
  "town-stronghold": ["music/stronghold"],
  "town-tower": ["music/snow"],
  "town-fortress": ["music/swamp"],
};

/** Representative track retained for scene/manifest audits. */
export const SCENE_TRACK: Record<MusicScene, string> = {
  menu: MUSIC_TRACKS.menu[0]!,
  map: MUSIC_TRACKS["map-general"][0]!,
  combat: MUSIC_TRACKS.combat[0]!,
};

export const MUSIC_VOLUME = 0.18;
const MUTE_STORAGE_KEY = "h3-music-muted";
const soundLibrary = soundManifest as Record<string, { src?: string }>;

let muted = false;
if (typeof window !== "undefined") {
  muted = window.localStorage?.getItem(MUTE_STORAGE_KEY) === "1";
}

let audio: HTMLAudioElement | null = null;
let currentScene: MusicScene | null = null;
let currentProfile: MusicProfile | null = null;
let currentRequestKey: string | null = null;
let currentTrack: string | null = null;
let unlockHooked = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMusicMuted(): boolean {
  return muted;
}

function trackSrc(key: string): string {
  return assetUrl(soundLibrary[key]?.src ?? `/sounds/${key}.mp3`);
}

function hookUnlock(): void {
  if (unlockHooked || typeof window === "undefined") return;
  unlockHooked = true;
  const unlock = () => {
    if (audio && currentScene && !muted && audio.paused) {
      audio.play().catch(() => undefined);
    }
  };
  window.addEventListener("pointerdown", unlock);
}

function pickTrack(profile: MusicProfile, avoid: string | null): string {
  const tracks = MUSIC_TRACKS[profile];
  const choices = tracks.length > 1 && avoid ? tracks.filter((track) => track !== avoid) : tracks;
  return choices[Math.floor(Math.random() * choices.length)] ?? tracks[0]!;
}

function playProfile(profile: MusicProfile, chooseAnother: boolean): void {
  if (!audio) {
    audio = new Audio();
    audio.addEventListener("ended", () => {
      if (currentProfile && currentScene && !muted) playProfile(currentProfile, true);
    });
  }
  const tracks = MUSIC_TRACKS[profile];
  const canKeep = !chooseAnother && currentTrack !== null && tracks.includes(currentTrack);
  const nextTrack: string = canKeep
    ? currentTrack!
    : pickTrack(profile, chooseAnother ? currentTrack : null);
  const src = trackSrc(nextTrack);
  if (!audio.src.endsWith(src)) audio.src = src;
  currentTrack = nextTrack;
  audio.loop = tracks.length === 1;
  audio.volume = MUSIC_VOLUME;
  hookUnlock();
  audio.play().catch(() => undefined);
}

function stopAudio(): void {
  audio?.pause();
}

function profileForMap(context?: MapMusicContext): MusicProfile {
  // Physical location wins, so WATER/DIRT always follow actual movement.
  if (context?.environment === "water") return "map-water";
  if (context?.environment === "underground") return "map-underground";
  switch (context?.factionId) {
    case "necropolis": return "town-necropolis";
    case "rampart": return "town-rampart";
    case "cove": return "town-cove";
    case "castle": return "town-castle";
    case "stronghold": return "town-stronghold";
    case "tower": return "town-tower";
    case "fortress": return "town-fortress";
    default: return "map-general";
  }
}

function requestFor(scene: MusicScene, context?: MapMusicContext): { profile: MusicProfile; key: string } {
  if (scene !== "map") return { profile: scene, key: scene };
  const profile = profileForMap(context);
  return { profile, key: `${profile}:${context?.turnKey ?? "legacy"}` };
}

/** Resolve faction and terrain from the authoritative active-turn state. */
export function mapMusicContext(state: GameState): MapMusicContext {
  const activePlayer = state.players[state.activePlayerId];
  const ownedHeroes = Object.values(state.heroes).filter(
    (hero): hero is HeroState => hero.controllerId === state.activePlayerId && hero.spaceId !== null,
  );
  const hero = ownedHeroes.find((candidate) => candidate.kind === "main") ?? ownedHeroes[0];
  const field = hero?.spaceId ? state.adventure?.fields[hero.spaceId] : undefined;
  const tile = field ? state.adventure?.tiles[field.tileInstanceId] : undefined;
  const environment: MapMusicEnvironment = field?.terrain === "water"
    ? "water"
    : tile?.group === "subterranean" || tile?.underground === true
      ? "underground"
      : "surface";
  return {
    turnKey: `${state.round}:${state.activePlayerId}`,
    factionId: activePlayer?.factionId,
    environment,
  };
}

/** Switch scene/profile without restarting an unchanged request. */
export function setMusicScene(scene: MusicScene | null, mapContext?: MapMusicContext): void {
  if (typeof window === "undefined") return;
  if (!scene) {
    if (currentScene === null) return;
    currentScene = null;
    currentProfile = null;
    currentRequestKey = null;
    stopAudio();
    return;
  }
  const request = requestFor(scene, mapContext);
  if (currentScene === scene && currentRequestKey === request.key) return;
  const requestChanged = currentRequestKey !== request.key;
  currentScene = scene;
  currentProfile = request.profile;
  currentRequestKey = request.key;
  if (muted) {
    stopAudio();
    return;
  }
  playProfile(request.profile, requestChanged);
}

export function setMusicMuted(next: boolean): void {
  if (next === muted) return;
  muted = next;
  try {
    window.localStorage?.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Private mode etc. — mute state just will not persist.
  }
  if (muted) stopAudio();
  else if (currentProfile) playProfile(currentProfile, false);
  notify();
}

export function useBackgroundMusic(scene: MusicScene | null, context?: MapMusicContext): void {
  const turnKey = context?.turnKey;
  const factionId = context?.factionId;
  const environment = context?.environment;
  useEffect(() => {
    setMusicScene(
      scene,
      turnKey && environment ? { turnKey, factionId, environment } : undefined,
    );
  }, [scene, turnKey, factionId, environment]);
  useEffect(() => () => setMusicScene(null), []);
}

export function __resetMusicForTests(): void {
  audio = null;
  currentScene = null;
  currentProfile = null;
  currentRequestKey = null;
  currentTrack = null;
  unlockHooked = false;
  muted = false;
  listeners.clear();
}
