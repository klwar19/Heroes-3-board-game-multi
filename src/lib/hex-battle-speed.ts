/**
 * Client preference: Hex Battlefield animation speed, the PC's combat "Animation
 * speed" option split into three channels a player sets separately:
 *  - move:     walking / flying, the start- and stop-moving frames, the turns
 *              inside a move, a teleport's vanish / appear
 *  - attack:   melee blows, shots and creature casts — the clips AND the beats
 *              they land on (impact, shot release, projectile flight, cast
 *              release), so a faster setting really shortens each strike
 *  - reaction: being hit, blocking, dying (and rising), turning to face
 * Each value is a VCMI "speedFactor" (1 = the PC's slow setting, 2 = normal,
 * 3 = fast): 10·speed animation frames a second, a walker 2·speed hexes a
 * second (VCMI client/battle/CreatureAnimation.cpp).
 *
 * Presentation only: stored in localStorage (per browser, never in GameState,
 * never sent to the server), so each player picks their own pace and the rules
 * never change. Mirrors the animation-preference.ts pattern (storage event for
 * cross-tab sync, CustomEvent for same-tab sync); the pace functions in
 * src/data/battle-hex/creature-sprites.ts read the live value on every move,
 * strike and hit, so a change applies from the next action on.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

export type HexSpeedChannel = "move" | "attack" | "reaction";
export type HexBattleSpeed = Readonly<Record<HexSpeedChannel, number>>;

const STORAGE_KEY = "binh-hex-battle-speed";
const CHANGE_EVENT = "binh-hex-battle-speed-change";

/**
 * The out-of-the-box pace: moves at the PC's fast setting (3), blows, hits and
 * deaths at the calmer 1.25 the hex board's strike beats are authored at.
 */
export const HEX_SPEED_DEFAULTS: HexBattleSpeed = Object.freeze({ move: 3, attack: 1.25, reaction: 1.25 });

/** The slider stops (VCMI speed factors). */
export const HEX_SPEED_STEPS: readonly number[] = Object.freeze([1, 1.25, 1.5, 2, 2.5, 3, 4, 5]);

const MIN_SPEED = HEX_SPEED_STEPS[0];

/**
 * Each channel's fastest setting. Attacks stop at the PC's fast speed (3): a
 * phased shot's authored launch frames take 120 ms, and any faster its release
 * beat (300 ms at 1.25) would come before the launch could play, so the shot
 * would leave late and land after the impact its damage number waits on.
 */
export const HEX_SPEED_MAX: Readonly<Record<HexSpeedChannel, number>> = Object.freeze({ move: 5, attack: 3, reaction: 5 });

/** The slider stops a channel offers. */
export function hexSpeedSteps(channel: HexSpeedChannel): readonly number[] {
  return HEX_SPEED_STEPS.filter((step) => step <= HEX_SPEED_MAX[channel]);
}

/** One-click paces: the PC's three combat speeds for every channel, and the default mix. */
export const HEX_SPEED_PRESETS: ReadonlyArray<{ key: string; label: string; title: string; speed: HexBattleSpeed }> = [
  { key: "pc-slow", label: "Slow", title: "PC slow combat speed (1) for everything", speed: { move: 1, attack: 1, reaction: 1 } },
  { key: "pc-normal", label: "Normal", title: "PC normal combat speed (2) for everything", speed: { move: 2, attack: 2, reaction: 2 } },
  { key: "pc-fast", label: "Fast", title: "PC fast combat speed (3) for everything", speed: { move: 3, attack: 3, reaction: 3 } },
  { key: "default", label: "Default", title: "Fast moves, calm blows and hits (the board's default)", speed: HEX_SPEED_DEFAULTS }
];

function clampSpeed(value: unknown, channel: HexSpeedChannel): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(HEX_SPEED_MAX[channel], Math.max(MIN_SPEED, value))
    : HEX_SPEED_DEFAULTS[channel];
}

/** A stored / supplied pace made safe: every channel a finite speed inside its slider range. */
export function sanitizeHexBattleSpeed(value: unknown): HexBattleSpeed {
  const raw = value && typeof value === "object" ? (value as Partial<Record<HexSpeedChannel, unknown>>) : {};
  return {
    move: clampSpeed(raw.move, "move"),
    attack: clampSpeed(raw.attack, "attack"),
    reaction: clampSpeed(raw.reaction, "reaction")
  };
}

function readStored(): HexBattleSpeed {
  if (typeof window === "undefined") {
    return HEX_SPEED_DEFAULTS;
  }
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    return text ? sanitizeHexBattleSpeed(JSON.parse(text)) : HEX_SPEED_DEFAULTS;
  } catch {
    return HEX_SPEED_DEFAULTS;
  }
}

// The live value the pace functions read on every animation: read from
// storage once, then kept current by setHexBattleSpeed and other tabs' writes.
let cached: HexBattleSpeed | null = null;
let syncHooked = false;

function hookSync(): void {
  if (syncHooked || typeof window === "undefined") {
    return;
  }
  syncHooked = true;
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cached = readStored();
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }
  });
}

/** The current pace (defaults on the server, before hydration, or with storage blocked). */
export function getHexBattleSpeed(): HexBattleSpeed {
  if (cached === null) {
    cached = readStored();
    hookSync();
  }
  return cached;
}

/** Store a new pace for this browser and tell every subscriber in this tab. */
export function setHexBattleSpeed(next: Partial<Record<HexSpeedChannel, number>>): HexBattleSpeed {
  const value = sanitizeHexBattleSpeed({ ...getHexBattleSpeed(), ...next });
  cached = value;
  if (typeof window === "undefined") {
    return value;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / quota: this tab still uses the new pace.
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
  return value;
}

/**
 * React hook: the live pace and its setter. SSR and the first client render
 * show the defaults; the stored value is adopted after hydration (`ready`).
 */
export function useHexBattleSpeed(): {
  speed: HexBattleSpeed;
  setSpeed: (next: Partial<Record<HexSpeedChannel, number>>) => void;
  ready: boolean;
} {
  const [speed, setState] = useState<HexBattleSpeed>(HEX_SPEED_DEFAULTS);
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setState(getHexBattleSpeed());
    setReady(true);
    const onChange = () => setState(getHexBattleSpeed());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setSpeed = useCallback((next: Partial<Record<HexSpeedChannel, number>>) => {
    setState(setHexBattleSpeed(next));
  }, []);

  return { speed, setSpeed, ready };
}

/** Test helper — one source of truth for the storage key. */
export const HEX_BATTLE_SPEED_STORAGE_KEY = STORAGE_KEY;

/** Test helper: forget the cached value so the next read goes back to storage. */
export function resetHexBattleSpeedCacheForTests(): void {
  cached = null;
}
