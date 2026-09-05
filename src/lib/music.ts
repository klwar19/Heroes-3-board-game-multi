"use client";

import { useEffect } from "react";
import type { GameState, HeroState } from "@/engine/state";
import soundManifest from "../../public/sounds/manifest.json";
import { assetUrl } from "@/lib/asset-url";

export type MusicScene = "menu" | "map" | "combat";
export type MapMusicEnvironment = "surface" | "water" | "underground";
export type MapMusicContext = {
  /** Drives a fresh faction opener when the relevant map turn changes. */
  turnKey: string;
  /** Keeps one shuffled terrain order for this game. */
  gameKey?: string;
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
  "map-general": ["music/rough", "music/sand", "music/snow", "music/grass"],
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
let currentContinuationProfile: MusicProfile | null = null;
let currentRequestKey: string | null = null;
let currentTrack: string | null = null;
let unlockHooked = false;
let playlistGameKey: string | null = null;
const playlistQueues = new Map<MusicProfile, string[]>();
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

function shuffledTracks(profile: MusicProfile, avoid: string | null): string[] {
  const tracks = [...MUSIC_TRACKS[profile]];
  for (let index = tracks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [tracks[index], tracks[swapIndex]] = [tracks[swapIndex]!, tracks[index]!];
  }
  // Crossing from the end of one shuffled cycle into the next must not replay
  // the same song immediately. Keep the shuffle, only exchange its first two.
  if (tracks.length > 1 && tracks[0] === avoid) {
    [tracks[0], tracks[1]] = [tracks[1]!, tracks[0]!];
  }
  return tracks;
}

function pickTrack(profile: MusicProfile, avoid: string | null): string {
  // Only adventure-map terrain music uses the per-game shuffled order. Combat
  // and every non-map scene retain their established random/loop behaviour.
  if (profile !== "map-general") {
    const tracks = MUSIC_TRACKS[profile];
    const choices = tracks.length > 1 && avoid
      ? tracks.filter((track) => track !== avoid)
      : tracks;
    return choices[Math.floor(Math.random() * choices.length)] ?? tracks[0]!;
  }
  let queue = playlistQueues.get(profile);
  if (!queue?.length) {
    queue = shuffledTracks(profile, avoid);
  }
  const next = queue.shift() ?? MUSIC_TRACKS[profile][0]!;
  playlistQueues.set(profile, queue);
  return next;
}

function playProfile(profile: MusicProfile, chooseAnother: boolean): void {
  if (!audio) {
    audio = new Audio();
    audio.addEventListener("ended", () => {
      if (!currentProfile || !currentScene || muted) return;
      // A surface faction theme is an opener, not a forever-loop: after it
      // finishes, fall through to the varied terrain playlist. Other profiles
      // (combat, water, underground, menu) continue within their own pool.
      currentProfile = currentContinuationProfile ?? currentProfile;
      playProfile(currentProfile, true);
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
  audio.loop = tracks.length === 1 && currentContinuationProfile === null;
  audio.volume = MUSIC_VOLUME;
  hookUnlock();
  audio.play().catch(() => undefined);
}

function stopAudio(): void {
  audio?.pause();
  fanfare?.pause();
}

/** The HoMM3 "Win Battle" fanfare (public/sounds/manifest.json key). */
export const VICTORY_FANFARE_TRACK = "music/win-battle";
/** The HoMM3 "LoseCombat" sting (public/sounds/manifest.json key). */
export const DEFEAT_STING_TRACK = "music/lose-combat";
export type CombatStingTrack = typeof VICTORY_FANFARE_TRACK | typeof DEFEAT_STING_TRACK;
/** Louder than the background bed so the sting reads as an event, still well under full scale. */
export const VICTORY_FANFARE_VOLUME = 0.36;

let fanfare: HTMLAudioElement | null = null;
let fanfareEnded: (() => void) | null = null;

/**
 * Play a combat-outcome sting once over the current scene: the background
 * track pauses, the sting plays at its own volume, and when it ends the
 * background resumes wherever the scene stands by then (a scene change
 * mid-sting simply takes over). Honours the music mute (nothing plays, nothing
 * pauses). One reusable element, one "ended" listener — repeated fights never
 * stack listeners.
 */
export function playCombatSting(track: CombatStingTrack): void {
  if (typeof window === "undefined" || muted) return;
  audio?.pause();
  if (!fanfare) {
    fanfare = new Audio();
    fanfare.addEventListener("ended", () => fanfareEnded?.());
  }
  fanfareEnded = () => {
    if (!muted && currentProfile && currentScene) playProfile(currentProfile, false);
  };
  fanfare.src = trackSrc(track);
  fanfare.loop = false;
  fanfare.volume = VICTORY_FANFARE_VOLUME;
  hookUnlock();
  // jsdom's play() returns undefined (not a Promise) — guard so a test render never throws.
  const playing = fanfare.play() as Promise<void> | undefined;
  playing?.catch?.(() => undefined);
}

/** The victory fanfare — `playCombatSting(VICTORY_FANFARE_TRACK)`. */
export function playVictoryFanfare(): void {
  playCombatSting(VICTORY_FANFARE_TRACK);
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
  return {
    profile,
    key: `${context?.gameKey ?? "legacy"}:${profile}:${context?.turnKey ?? "legacy"}`,
  };
}

function continuationProfileFor(scene: MusicScene, profile: MusicProfile): MusicProfile | null {
  if (scene !== "map" || !profile.startsWith("town-")) return null;
  return "map-general";
}

/** Resolve faction and terrain from the authoritative active-turn state. */
export function mapMusicContext(state: GameState, viewerPlayerId?: string): MapMusicContext {
  // Parallel turns have no single meaningful active seat. Each seated client
  // hears their own faction opener and follows their own hero's environment.
  // Ordered games and observers continue to use the authoritative active seat.
  const musicPlayerId = state.turn?.mode === "parallel" && viewerPlayerId && state.players[viewerPlayerId]
    ? viewerPlayerId
    : state.activePlayerId;
  const activePlayer = state.players[musicPlayerId];
  const ownedHeroes = Object.values(state.heroes).filter(
    (hero): hero is HeroState => hero.controllerId === musicPlayerId && hero.spaceId !== null,
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
    turnKey: `${state.round}:${musicPlayerId}`,
    gameKey: `${state.id}:${state.seed}`,
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
    currentContinuationProfile = null;
    currentRequestKey = null;
    stopAudio();
    return;
  }
  const request = requestFor(scene, mapContext);
  if (currentScene === scene && currentRequestKey === request.key) return;
  if (scene === "map") {
    const nextGameKey = mapContext?.gameKey ?? "legacy";
    if (playlistGameKey !== nextGameKey) {
      playlistGameKey = nextGameKey;
      playlistQueues.clear();
    }
  }
  const requestChanged = currentRequestKey !== request.key;
  currentScene = scene;
  currentProfile = request.profile;
  currentContinuationProfile = continuationProfileFor(scene, request.profile);
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
  const gameKey = context?.gameKey;
  useEffect(() => {
    setMusicScene(
      scene,
      turnKey && environment ? { turnKey, gameKey, factionId, environment } : undefined,
    );
  }, [scene, turnKey, gameKey, factionId, environment]);
  useEffect(() => () => setMusicScene(null), []);
}

export function __resetMusicForTests(): void {
  audio = null;
  fanfare = null;
  fanfareEnded = null;
  currentScene = null;
  currentProfile = null;
  currentContinuationProfile = null;
  currentRequestKey = null;
  currentTrack = null;
  unlockHooked = false;
  playlistGameKey = null;
  playlistQueues.clear();
  muted = false;
  listeners.clear();
}
