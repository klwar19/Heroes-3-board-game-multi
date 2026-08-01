"use client";

import { ENGINE_SIGNATURE, type GameState } from "@/engine";
import { getIdentity } from "@/lib/identity";

/**
 * Single-player SAVE SLOTS (browser half). Each slot stores a FULL raw game
 * state fetched from the server (see src/server/single-player-save.ts for why
 * the redacted client frames can never serve as a save). Everything lives in
 * this browser's localStorage — the server stores nothing per save, so slots
 * can never flood it — keyed by the same identity rule that owns sp rooms
 * (verified account first, else the guest tab's clientId), so every player on
 * a shared computer keeps their own list.
 *
 * Layout: one small INDEX entry (metadata only, cheap to list) plus one
 * per-save STATE key (parsed only when actually loading). Saves are stamped
 * with the writing build's ENGINE_SIGNATURE as an ADVISORY marker: unlike the
 * room-cache (which hard-discards on mismatch because its restore re-runs
 * automatically on every reload and a bad state would crash-loop), loading a
 * save is a deliberate one-shot the player confirms — and the engine is built
 * to tolerate legacy snapshots — so an older save stays loadable, with the UI
 * warning that a patch may interfere.
 */

export const MAX_SINGLE_PLAYER_SAVES = 10;

const INDEX_PREFIX = "homm3bg.sp-save-index:";
const STATE_PREFIX = "homm3bg.sp-save-state:";
const PENDING_KEY = "homm3bg.sp-pending-load";
/** A menu-page "Load" must land in the room shortly after navigation. */
const PENDING_TTL_MS = 2 * 60 * 1000;

export type SavedSinglePlayerGame = {
  id: string;
  name: string;
  roomId: string;
  savedAt: number;
  round: number;
  /** ENGINE_SIGNATURE of the build that wrote the save (advisory only). */
  signature: string;
};

export type SaveSinglePlayerResult =
  | { ok: true; save: SavedSinglePlayerGame }
  | { ok: false; reason: string };

function ownerKey(): string {
  const identity = getIdentity();
  return identity.userId ? `user:${identity.userId}` : `client:${identity.clientId}`;
}

function indexKey(): string {
  return `${INDEX_PREFIX}${ownerKey()}`;
}

function stateKey(id: string): string {
  return `${STATE_PREFIX}${ownerKey()}:${id}`;
}

function readIndex(): SavedSinglePlayerGame[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(indexKey()) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is SavedSinglePlayerGame => {
      const candidate = entry as Partial<SavedSinglePlayerGame>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.roomId === "string" &&
        typeof candidate.savedAt === "number" &&
        typeof candidate.round === "number" &&
        typeof candidate.signature === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeIndex(saves: SavedSinglePlayerGame[]): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(indexKey(), JSON.stringify(saves));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedSinglePlayerGames(): SavedSinglePlayerGame[] {
  return readIndex().sort((left, right) => right.savedAt - left.savedAt);
}

/** Whether a save was written by this exact build (advisory display only). */
export function saveMatchesEngine(save: SavedSinglePlayerGame): boolean {
  return save.signature === ENGINE_SIGNATURE;
}

/**
 * Stores a new save slot holding the FULL state. Same (trimmed) name =
 * overwrite that slot — the classic save-game convention — while different
 * names always create DISTINCT save points, even of the same room.
 */
export function saveSinglePlayerGame(name: string, roomId: string, state: GameState): SaveSinglePlayerResult {
  if (typeof window === "undefined") {
    return { ok: false, reason: "Saving needs a browser." };
  }
  const saves = readIndex();
  const cleanName = name.trim().slice(0, 48) || `Solo game — round ${state.round}`;
  const existing = saves.find((save) => save.name === cleanName);
  if (!existing && saves.length >= MAX_SINGLE_PLAYER_SAVES) {
    return {
      ok: false,
      reason: `Save limit reached (${MAX_SINGLE_PLAYER_SAVES}) — delete a save or reuse a name to overwrite it.`
    };
  }
  const save: SavedSinglePlayerGame = {
    id: existing?.id ?? `solo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    roomId,
    savedAt: Date.now(),
    round: state.round,
    signature: ENGINE_SIGNATURE
  };
  // A same-name save overwrites an existing blob. Keep the previous bytes until
  // the metadata index commits too: localStorage has no transaction primitive,
  // and an index quota failure must never destroy the player's last good copy.
  const key = stateKey(save.id);
  let previousState: string | null = null;
  try {
    previousState = window.localStorage.getItem(key);
    window.localStorage.setItem(key, JSON.stringify({ signature: ENGINE_SIGNATURE, state }));
  } catch {
    return { ok: false, reason: "Browser storage is full — delete a save (or other site data) and try again." };
  }
  if (!writeIndex([save, ...saves.filter((entry) => entry.id !== save.id)])) {
    // Roll the blob back as well as the index. For a new slot there was no old
    // blob; for an overwrite restore the exact previous checkpoint.
    try {
      if (previousState === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, previousState);
      }
    } catch {
      /* best-effort: the index still points at the original slot metadata */
    }
    return { ok: false, reason: "Browser storage is full — delete a save (or other site data) and try again." };
  }
  return { ok: true, save };
}

/** The stored full state for one save slot, or null when missing/corrupt. */
export function loadSavedSinglePlayerGameState(id: string): GameState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(stateKey(id));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { state?: GameState } | null;
    return parsed && parsed.state && typeof parsed.state === "object" ? parsed.state : null;
  } catch {
    return null;
  }
}

export function deleteSavedSinglePlayerGame(id: string): void {
  writeIndex(readIndex().filter((save) => save.id !== id));
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(stateKey(id));
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Menu-page load handshake: /single-player has no live room connection, so its
// Load button records WHICH save to apply and navigates to the room; the table
// page applies it once, right after it connects to that room.
// ---------------------------------------------------------------------------

type PendingLoad = { id: string; roomId: string; at: number };

export function setPendingSinglePlayerLoad(id: string, roomId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ id, roomId, at: Date.now() } satisfies PendingLoad));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads (without consuming) the pending load for this room. A caller must clear
 * it only AFTER the server confirms the whole-state swap; retaining the marker
 * across a network/deploy failure makes a refresh a safe retry instead of
 * silently losing the player's requested load.
 */
export function peekPendingSinglePlayerLoad(roomId: string): { save: SavedSinglePlayerGame; state: GameState } | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) {
      return null;
    }
    const pending = JSON.parse(raw) as Partial<PendingLoad> | null;
    if (!pending || pending.roomId !== roomId) {
      return null;
    }
    if (typeof pending.at !== "number" || Date.now() - pending.at > PENDING_TTL_MS || typeof pending.id !== "string") {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    const save = readIndex().find((entry) => entry.id === pending.id);
    const state = save ? loadSavedSinglePlayerGameState(save.id) : null;
    return save && state ? { save, state } : null;
  } catch {
    return null;
  }
}

/** Clear exactly the pending marker whose load the server just committed. */
export function clearPendingSinglePlayerLoad(id: string, roomId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as Partial<PendingLoad> | null) : null;
    if (pending?.id === id && pending.roomId === roomId) {
      window.localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    /* A malformed marker is harmless and expires naturally. */
  }
}

/** Back-compatible consume-on-read helper for direct callers and tests. */
export function takePendingSinglePlayerLoad(roomId: string): { save: SavedSinglePlayerGame; state: GameState } | null {
  const pending = peekPendingSinglePlayerLoad(roomId);
  if (pending) {
    clearPendingSinglePlayerLoad(pending.save.id, roomId);
  }
  return pending;
}
