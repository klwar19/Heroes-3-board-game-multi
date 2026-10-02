"use client";

import { useEffect } from "react";
import type { GameState, HeroState } from "@/engine/state";
import soundManifest from "../../public/sounds/manifest.json";
import { assetUrl } from "@/lib/asset-url";
import { musicGain, silencedInBackground, getAudioMix, subscribeAudioMix } from "@/lib/audio-mix";

/**
 * "oc-prep" / "oc-battle" are the Order & Chaos mode's own scenes: the
 * preparation theme (loadout screen + Last Stand planning, looping) and the
 * battle opener, Grasswalk (plays once per battle, then hands over to the
 * combat rotation). "oc-battle-horde" opens the same way, then its rotation
 * also carries Remnants of the Horde (Endless Siege, Chaos Raids, some
 * campaign worlds); "oc-battle-remnants" opens with Remnants of the Horde, then
 * Grasswalk, the two taking turns from then on (Krewlod).
 * "oc-boss" is an Order & Chaos boss fight: the boss theme loops until the
 * scene changes. When the battle announces the boss ahead (setBossApproach),
 * the music fades away, the warning plays alone in the wave before it, and the
 * theme swells in so its first full accent lands as the boss arrives; a boss
 * that comes unannounced gets the warning sting once, then the theme.
 * "oc-menu" is the Order & Chaos menus' own theme (the main game's menus keep "menu");
 * "oc-home" is the mode-select screen's own (and the campaign map's), The Orcish Hordes.
 */
export type MusicScene = "menu" | "map" | "combat" | "oc-prep" | "oc-battle" | "oc-battle-horde" | "oc-battle-remnants" | "oc-boss" | "oc-menu" | "oc-home";
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
  | "town-stronghold" | "town-tower" | "town-fortress"
  | "oc-prep" | "oc-battle" | "oc-battle-horde" | "oc-battle-remnants" | "oc-horde" | "oc-pair" | "oc-boss" | "oc-boss-loop" | "oc-menu" | "oc-home";

/** Multi-track profiles advance randomly and never immediately repeat. */
export const MUSIC_TRACKS: Record<MusicProfile, readonly string[]> = {
  menu: ["music/main-menu"],
  combat: ["music/combat-02", "music/combat-03", "music/combat-04"],
  // (The Orcish Hordes, from Order & Chaos, takes its turn in the terrain playlist too.)
  "map-general": ["music/rough", "music/sand", "music/snow", "music/grass", "music/order-chaos/orcish-hordes"],
  "map-water": ["music/water"],
  "map-underground": ["music/dirt"],
  "town-necropolis": ["music/necro-town"],
  "town-rampart": ["music/rampart"],
  "town-cove": ["music/cove-town"],
  "town-castle": ["music/castle-town"],
  "town-stronghold": ["music/stronghold"],
  "town-tower": ["music/snow"],
  "town-fortress": ["music/swamp"],
  "oc-prep": ["music/order-chaos/choose-your-seeds"],
  "oc-battle": ["music/order-chaos/grasswalk"],
  "oc-battle-horde": ["music/order-chaos/grasswalk"],
  "oc-battle-remnants": ["music/order-chaos/remnants-of-the-horde"],
  // Two tracks that take turns (the pool never repeats the one just played).
  "oc-pair": ["music/order-chaos/grasswalk", "music/order-chaos/remnants-of-the-horde"],
  "oc-horde": ["music/combat-02", "music/combat-03", "music/combat-04", "music/order-chaos/remnants-of-the-horde"],
  "oc-boss": ["music/order-chaos/boss-warning"],
  "oc-boss-loop": ["music/order-chaos/flesh-and-metal"],
  "oc-menu": ["music/order-chaos/menu-casino"],
  "oc-home": ["music/order-chaos/orcish-hordes"],
};

/**
 * Profiles that start from the top on every fresh request, even when the same
 * file is still loaded (a restarted battle opens with Grasswalk again instead
 * of resuming it mid-song).
 */
const RESTART_ON_REQUEST: ReadonlySet<MusicProfile> = new Set<MusicProfile>(["oc-prep", "oc-battle", "oc-battle-horde", "oc-battle-remnants", "oc-boss"]);

/** Representative track retained for scene/manifest audits. */
export const SCENE_TRACK: Record<MusicScene, string> = {
  menu: MUSIC_TRACKS.menu[0]!,
  map: MUSIC_TRACKS["map-general"][0]!,
  combat: MUSIC_TRACKS.combat[0]!,
  "oc-prep": MUSIC_TRACKS["oc-prep"][0]!,
  "oc-battle": MUSIC_TRACKS["oc-battle"][0]!,
  "oc-battle-horde": MUSIC_TRACKS["oc-battle-horde"][0]!,
  "oc-battle-remnants": MUSIC_TRACKS["oc-battle-remnants"][0]!,
  "oc-boss": MUSIC_TRACKS["oc-boss-loop"][0]!,
  "oc-menu": MUSIC_TRACKS["oc-menu"][0]!,
  "oc-home": MUSIC_TRACKS["oc-home"][0]!,
};

export const MUSIC_VOLUME = 0.18;
/** The boss theme sits a little above the other beds; the warning, heard alone, well above it. */
export const BOSS_MUSIC_VOLUME = 0.24;
export const BOSS_WARNING_VOLUME = 0.6;

/** The bed's own level (before the Options mix and any boss-approach fade). */
function profileVolume(profile: MusicProfile | null): number {
  if (profile === "oc-boss-loop") return BOSS_MUSIC_VOLUME;
  if (profile === "oc-boss") return BOSS_WARNING_VOLUME;
  return MUSIC_VOLUME;
}
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
/** A game pause holds the background track where it is (see setMusicHeld). */
let held = false;
/** Back-to-back load failures of the background track (cleared once one plays). */
let bedFailures = 0;
let bedRetry: number | undefined;
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
    if (audio && currentScene && !muted && !held && !silencedInBackground() && !stingPlaying() && !bedHushed() && audio.paused) {
      audio.play().catch(() => undefined);
    }
    if (approach) syncWarning();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/**
 * Options → Audio: a fader move re-levels the elements already playing, and
 * the "play in background" switch pauses the bed while the tab is hidden and
 * resumes it (same track, same spot) once it is shown again.
 */
let lastBackgroundSetting = getAudioMix().background;

function resumeBedIfDue(): void {
  if (audio && currentScene && currentProfile && !muted && !held && !silencedInBackground() && !stingPlaying() && !bedHushed() && audio.paused) {
    const playing = audio.play() as Promise<void> | undefined;
    playing?.catch?.(() => undefined);
  }
  if (approach) syncWarning();
}

function syncBackgroundSilence(): void {
  if (silencedInBackground()) stopAudio();
  else resumeBedIfDue();
}

if (typeof window !== "undefined") {
  subscribeAudioMix(() => {
    applyBedVolume();
    if (warning) warning.volume = warningVolume();
    if (fanfare) fanfare.volume = VICTORY_FANFARE_VOLUME * musicGain();
    const background = getAudioMix().background;
    if (background !== lastBackgroundSetting) {
      lastBackgroundSetting = background;
      syncBackgroundSilence();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!getAudioMix().background) syncBackgroundSilence();
  });
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
      // Once there, the continuation is simply the scene's own pool (a lone
      // track then loops natively, like the boss theme after its warning sting).
      if (currentContinuationProfile === currentProfile) currentContinuationProfile = null;
      playProfile(currentProfile, true);
    });
    audio.addEventListener("playing", () => {
      bedFailures = 0;
    });
    // A track that fails to load (a dropped request, or a media pipeline the
    // browser refused while a battle was busy) never fires "ended", so the
    // scene would stay silent until the next scene change. Try again after a
    // beat — another track of the pool when there is one — a few times.
    audio.addEventListener("error", () => {
      if (!audio || !currentProfile || !currentScene || muted || bedFailures >= 4) return;
      bedFailures += 1;
      const failedSrc = audio.src;
      window.clearTimeout(bedRetry);
      bedRetry = window.setTimeout(() => {
        if (!audio || !currentProfile || !currentScene || muted || audio.src !== failedSrc) return;
        if (MUSIC_TRACKS[currentProfile].length > 1) {
          playProfile(currentProfile, true);
          return;
        }
        audio.load();
        if (!held && !silencedInBackground() && !stingPlaying() && !bedHushed()) audio.play().catch(() => undefined);
      }, 1500 * bedFailures);
    });
  }
  const tracks = MUSIC_TRACKS[profile];
  const canKeep = !chooseAnother && currentTrack !== null && tracks.includes(currentTrack);
  const nextTrack: string = canKeep
    ? currentTrack!
    : pickTrack(profile, chooseAnother ? currentTrack : null);
  const src = trackSrc(nextTrack);
  if (!audio.src.endsWith(src)) audio.src = src;
  else if (chooseAnother && RESTART_ON_REQUEST.has(profile)) audio.currentTime = 0;
  currentTrack = nextTrack;
  audio.loop = tracks.length === 1 && currentContinuationProfile === null;
  applyBedVolume();
  hookUnlock();
  // Held by a game pause (or a hidden tab the player silenced in Options), or
  // hushed for a boss warning: the track is cued, releasing the hold starts it.
  if (held || silencedInBackground() || bedHushed()) return;
  audio.play().catch(() => undefined);
}

/** True while a combat sting is audible over the (paused) background track. */
function stingPlaying(): boolean {
  return fanfare !== null && !fanfare.paused && !fanfare.ended;
}

/**
 * Hold the background track while a game is paused and resume it from the same
 * spot when the pause ends (no track change, no restart). Scene requests made
 * during the hold are recorded and cued, then heard on release. Mute still
 * wins, and a playing combat sting is left alone (its end resumes the bed).
 */
export function setMusicHeld(next: boolean): void {
  if (next === held) return;
  held = next;
  if (typeof window === "undefined" || !audio) return;
  if (held) {
    audio.pause();
    warning?.pause();
    return;
  }
  if (!muted && currentScene && currentProfile && !silencedInBackground() && !stingPlaying() && !bedHushed()) {
    audio.play().catch(() => undefined);
  }
  if (approach) syncWarning();
}

function stopAudio(): void {
  audio?.pause();
  fanfare?.pause();
  warning?.pause();
}

// ---- Order & Chaos: a world boss approaches -----------------------------------

/** Where the boss theme's first full accent falls: the world boss steps onto the lawn on it. */
export const BOSS_ARRIVAL_BEAT_S = 12.95;
/** The warning's length (the whole 20.4 s clip): the boss theme comes in as it ends (never over it). */
const BOSS_WARNING_HANDOFF_S = 20.4;
/** The warning starts this long before the boss arrives (the sim's BOSS_LEAD leaves room for the hush before it). */
export const BOSS_WARNING_LEAD_S = BOSS_ARRIVAL_BEAT_S + BOSS_WARNING_HANDOFF_S;
/** Before the warning, the battle music (and the battle's sounds) fade away over this long. */
export const BOSS_HUSH_S = 1.5;
/** The boss theme swells in over this long (so it has played its full 13 s when the boss arrives). */
const BOSS_SWELL_S = 1.5;
/** The battle's sounds come back to normal over this long once the boss theme starts. */
const BOSS_EFFECTS_RETURN_S = 6;
const BOSS_WARNING_TRACK = MUSIC_TRACKS["oc-boss"][0]!;

type ApproachStage = "hush" | "warning" | "swell";
const STAGE_ORDER: Record<ApproachStage, number> = { hush: 0, warning: 1, swell: 2 };
/** The boss approach in progress (null: none): its stage and the seconds left before the boss arrives. */
let approach: { stage: ApproachStage; left: number } | null = null;
let warning: HTMLAudioElement | null = null;
let warningStarted = false;
/** Loads the boss theme while the warning plays, so it starts on time (released once the theme is on the bed). */
let themePreload: HTMLAudioElement | null = null;
/** This announcement's tracks were asked for already. */
let bossPreloaded = false;

function approachStage(left: number): ApproachStage | null {
  if (left <= BOSS_ARRIVAL_BEAT_S) return "swell";
  if (left <= BOSS_WARNING_LEAD_S) return "warning";
  if (left <= BOSS_WARNING_LEAD_S + BOSS_HUSH_S) return "hush";
  return null;
}

/** The bed stays silent while the warning plays alone. */
function bedHushed(): boolean {
  return approach?.stage === "warning";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The bed's fade during the approach: fading out before the warning, swelling in after it. */
function approachBedFactor(): number {
  if (!approach) return 1;
  if (approach.stage === "hush") return clamp01((approach.left - BOSS_WARNING_LEAD_S) / BOSS_HUSH_S);
  if (approach.stage === "swell") return clamp01((BOSS_ARRIVAL_BEAT_S - approach.left) / BOSS_SWELL_S);
  return 0;
}

function applyBedVolume(): void {
  if (audio) audio.volume = profileVolume(currentProfile) * musicGain() * approachBedFactor();
}

/** The warning plays at full level to its own end (its tail is its fade). */
function warningVolume(): number {
  return BOSS_WARNING_VOLUME * musicGain();
}

/** Keeps the warning element playing exactly while the approach wants it heard. */
function syncWarning(): void {
  if (!warning) return;
  warning.volume = warningVolume();
  const audible = approach !== null && warningStarted && (approach.stage === "warning" || approach.stage === "swell")
    && !muted && !held && !silencedInBackground() && !stingPlaying() && !warning.ended;
  if (!audible) {
    if (!warning.paused) warning.pause();
    return;
  }
  if (warning.paused) {
    const playing = warning.play() as Promise<void> | undefined;
    playing?.catch?.(() => undefined);
  }
}

/** The warning element, its file cued (and loading) without playing. */
function cueWarning(): HTMLAudioElement {
  if (!warning) {
    warning = new Audio();
    warning.loop = false;
    warning.preload = "auto";
  }
  const src = trackSrc(BOSS_WARNING_TRACK);
  if (!warning.src.endsWith(src)) warning.src = src;
  return warning;
}

/**
 * A boss was announced: fetch the warning and the theme now, while the battle
 * still runs, so neither starts late (or silent) on a cold load when its moment comes.
 */
function preloadBossAudio(): void {
  if (muted || bossPreloaded) return;
  bossPreloaded = true;
  cueWarning();
  const themeSrc = trackSrc(MUSIC_TRACKS["oc-boss-loop"][0]!);
  if (themePreload?.src.endsWith(themeSrc) || audio?.src.endsWith(themeSrc)) return;
  themePreload = new Audio();
  themePreload.preload = "auto";
  themePreload.src = themeSrc;
}

/** A battle with a world boss in it: the (small) warning loads now, so it can never start late. */
export function preloadBossWarning(): void {
  if (typeof window === "undefined" || muted) return;
  cueWarning();
}

function releaseThemePreload(): void {
  if (!themePreload) return;
  themePreload.removeAttribute("src");
  themePreload.load();
  themePreload = null;
}

function startWarning(): void {
  const element = cueWarning();
  if (!warningStarted && element.currentTime > 0) element.currentTime = 0;
  warningStarted = true;
  hookUnlock();
  syncWarning();
}

/** The boss theme takes the bed: from its top, or further in when the approach began late, so its accent still meets the boss. */
function bossThemeIn(left: number): void {
  currentScene = "oc-boss";
  currentProfile = "oc-boss-loop";
  currentContinuationProfile = null;
  currentRequestKey = "oc-boss";
  if (muted) return;
  playProfile("oc-boss-loop", true);
  releaseThemePreload();
  // (Always set: a theme still cued from an earlier boss must not pick up mid-song.)
  if (audio) audio.currentTime = Math.max(0, BOSS_ARRIVAL_BEAT_S - left);
}

/** Forget the approach and silence the warning (the caller decides what the bed does next). */
function dropApproach(): void {
  approach = null;
  warningStarted = false;
  warning?.pause();
  releaseThemePreload();
}

/** The approach is over: the boss came (its theme plays on) or it was called off (the battle music comes back). */
function endApproach(): void {
  if (!approach) return;
  dropApproach();
  applyBedVolume();
  resumeBedIfDue();
}

/**
 * Order & Chaos: the seconds (real time, at the battle's speed) before a world
 * boss arrives, every frame; null when none is due. The battle music fades
 * away, the warning plays alone, then the boss theme swells in on the bed so
 * its first full accent lands on the arrival. Stages only move forward (a
 * speed change never replays the warning); null after the theme came in
 * leaves the bed to the "oc-boss" scene, null before it calls the approach off.
 */
export function setBossApproach(left: number | null): void {
  if (typeof window === "undefined") return;
  const stage = left === null ? null : approachStage(left);
  if (left === null) {
    bossPreloaded = false;
    releaseThemePreload();
  } else preloadBossAudio();
  if (left === null || (stage === null && !approach)) {
    endApproach();
    return;
  }
  const next: ApproachStage = approach && (stage === null || STAGE_ORDER[approach.stage] > STAGE_ORDER[stage]) ? approach.stage : stage!;
  const entered = approach?.stage !== next ? next : null;
  approach = { stage: next, left };
  if (entered === "warning") {
    audio?.pause();
    startWarning();
  } else if (entered === "swell" && currentScene !== "oc-boss") {
    // (A theme already on the bed came with the boss scene's own sting: no second warning.)
    if (!warningStarted) startWarning();
    bossThemeIn(left);
  }
  applyBedVolume();
  syncWarning();
}

/**
 * The battle's own sounds during a boss approach (0..1): they fade with the
 * music, stay silent through the warning and come back as the boss theme
 * starts. Always 1 while the music is muted (nothing would play in their place).
 */
export function bossEffectsDuck(left: number | null): number {
  if (left === null || muted || silencedInBackground()) return 1;
  if (left > BOSS_WARNING_LEAD_S) return clamp01((left - BOSS_WARNING_LEAD_S) / BOSS_HUSH_S);
  if (left > BOSS_ARRIVAL_BEAT_S) return 0;
  return clamp01((BOSS_ARRIVAL_BEAT_S - left) / BOSS_EFFECTS_RETURN_S);
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

/** The sting is over (ended, failed or refused): the background comes back, once. */
function stingDone(): void {
  const done = fanfareEnded;
  fanfareEnded = null;
  done?.();
}

/**
 * Play a combat-outcome sting once over the current scene: the background
 * track pauses, the sting plays at its own volume, and when it ends the
 * background resumes wherever the scene stands by then (a scene change
 * mid-sting simply takes over). Honours the music mute (nothing plays, nothing
 * pauses). One reusable element, one "ended" listener — repeated fights never
 * stack listeners.
 */
export function playCombatSting(track: CombatStingTrack): void {
  if (typeof window === "undefined" || muted || silencedInBackground()) return;
  audio?.pause();
  warning?.pause();
  if (!fanfare) {
    fanfare = new Audio();
    fanfare.addEventListener("ended", stingDone);
    // A sting that cannot load must not leave the background paused for good.
    fanfare.addEventListener("error", stingDone);
  }
  fanfareEnded = () => {
    if (!muted && currentProfile && currentScene) playProfile(currentProfile, false);
    if (approach) syncWarning();
  };
  fanfare.src = trackSrc(track);
  fanfare.loop = false;
  fanfare.volume = VICTORY_FANFARE_VOLUME * musicGain();
  hookUnlock();
  // jsdom's play() returns undefined (not a Promise) — guard so a test render never throws.
  const playing = fanfare.play() as Promise<void> | undefined;
  playing?.catch?.((error: unknown) => {
    // Refused or unplayable (an abort only means the next sting replaced it).
    if ((error as { name?: string } | null)?.name !== "AbortError") stingDone();
  });
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
  // Order & Chaos battles open with their own theme, then rotate through the
  // game's combat tracks (random, never an immediate repeat) until the battle ends.
  if (scene === "oc-battle") return "combat";
  // ...and the horde's fights (Endless Siege, Chaos Raids, Krewlod) also carry Remnants of the Horde.
  if (scene === "oc-battle-horde") return "oc-horde";
  if (scene === "oc-battle-remnants") return "oc-pair";
  // A boss fight: the warning sting once, then the boss theme on a loop.
  if (scene === "oc-boss") return "oc-boss-loop";
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
    dropApproach();
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
  // The boss came while its approach was still hushing or warning: the theme comes in now.
  if (scene === "oc-boss" && approach) {
    approach = { stage: "swell", left: Math.min(approach.left, BOSS_ARRIVAL_BEAT_S) };
    if (!warningStarted) startWarning();
    bossThemeIn(approach.left);
    applyBedVolume();
    syncWarning();
    return;
  }
  // Any other scene calls an approach off (the new scene takes the bed).
  dropApproach();
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
  if (approach) syncWarning();
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
  warning = null;
  warningStarted = false;
  themePreload = null;
  bossPreloaded = false;
  approach = null;
  fanfareEnded = null;
  currentScene = null;
  currentProfile = null;
  currentContinuationProfile = null;
  currentRequestKey = null;
  currentTrack = null;
  unlockHooked = false;
  held = false;
  bedFailures = 0;
  if (typeof window !== "undefined") window.clearTimeout(bedRetry);
  playlistGameKey = null;
  playlistQueues.clear();
  muted = false;
  listeners.clear();
}
