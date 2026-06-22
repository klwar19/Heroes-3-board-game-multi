"use client";

import { ENGINE_SIGNATURE, type GameState } from "@/engine";

/**
 * Local recovery cache: the latest in-progress game is mirrored to localStorage
 * so that if the (ephemeral) server recycles and comes back with an empty setup
 * lobby, the client can push the saved game straight back instead of dumping the
 * player on the menu after a tab switch.
 *
 * The cache is stamped with the engine's ENGINE_SIGNATURE (see
 * src/engine/version.ts). A new deploy that changes the GameState shape (e.g.
 * Creature Banks or the Spell Book adding fields) bumps the signature, so a
 * state serialized by an OLDER engine no longer matches. Restoring such a state
 * and feeding it through the new getPlayerView / getLegalActions throws during
 * render — and because the cache is re-restored on every reload, that crash
 * loops forever with no way out ("can't return or reset"). Gating the cache on
 * the signature discards an incompatible save up front: the player drops to a
 * playable fresh lobby instead of an inescapable error screen.
 */

export const ROOM_CACHE_PREFIX = "homm3bg-room:";

export type CachedRoom = { version: number; state: GameState };

type StoredRoom = CachedRoom & { signature?: string };

export function saveCachedRoom(roomId: string, version: number, state: GameState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const payload: StoredRoom = { signature: ENGINE_SIGNATURE, version, state };
    window.localStorage.setItem(ROOM_CACHE_PREFIX + roomId, JSON.stringify(payload));
  } catch {
    // Storage full / disabled (private mode): recovery is best-effort.
  }
}

export function loadCachedRoom(roomId: string): CachedRoom | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(ROOM_CACHE_PREFIX + roomId);
    if (!raw) {
      return null;
    }
    const cached = JSON.parse(raw) as StoredRoom;
    // Discard a save written by a different engine version (or a legacy save
    // with no signature at all): its state shape may crash the current render.
    if (cached?.signature !== ENGINE_SIGNATURE) {
      clearCachedRoom(roomId);
      return null;
    }
    return cached.state && typeof cached.version === "number"
      ? { version: cached.version, state: cached.state }
      : null;
  } catch {
    return null;
  }
}

export function clearCachedRoom(roomId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(ROOM_CACHE_PREFIX + roomId);
  } catch {
    // Ignore.
  }
}

/**
 * Wipe every cached room. Used by the crash-screen escape hatch so a player
 * stranded by a poisoned save can force a clean start, regardless of which room
 * the bad state lives under.
 */
export function clearAllCachedRooms(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(ROOM_CACHE_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore.
  }
}
