import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  type AdventurePlayerConfig,
  type EngineResult,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameState
} from "@/engine";

export type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
  /**
   * Identity of the server store that produced this snapshot. When the
   * process restarts (dev reload, host recycling after idle) a new bootId is
   * minted, telling clients to accept the snapshot even though its version
   * counter started over — the cause of the old "nothing works after a
   * while" freeze.
   */
  bootId?: string;
};

export type RoomResetOptions = {
  mode?: GameMode;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
};

type GameRoomRecord = GameRoomSnapshot;
type RoomListener = (snapshot: GameRoomSnapshot) => void;

declare global {
  var __homm3bgRoomStore: Map<string, GameRoomRecord> | undefined;
  var __homm3bgRoomListeners: Map<string, Set<RoomListener>> | undefined;
  var __homm3bgRoomBootId: string | undefined;
}

const roomStore = globalThis.__homm3bgRoomStore ?? new Map<string, GameRoomRecord>();
globalThis.__homm3bgRoomStore = roomStore;

const roomListeners = globalThis.__homm3bgRoomListeners ?? new Map<string, Set<RoomListener>>();
globalThis.__homm3bgRoomListeners = roomListeners;

const bootId =
  globalThis.__homm3bgRoomBootId ?? `boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
globalThis.__homm3bgRoomBootId = bootId;

// ---------------------------------------------------------------------------
// Disk persistence: rooms survive dev-server restarts and idle reclaims of
// the host process. Best effort — read-only filesystems simply skip it.
// ---------------------------------------------------------------------------

const persistDir = process.env.HOMM3BG_ROOM_DIR ?? join(tmpdir(), "homm3bg-rooms");

function roomFilePath(roomId: string): string {
  const safe = encodeURIComponent(roomId).replace(/%/g, "_");
  return join(persistDir, `${safe}.json`);
}

function persistRoom(record: GameRoomRecord): void {
  try {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    writeFileSync(roomFilePath(record.roomId), JSON.stringify(record));
  } catch {
    // Persistence is opportunistic; the in-memory store keeps working.
  }
}

function loadPersistedRoom(roomId: string): GameRoomRecord | null {
  try {
    const path = roomFilePath(roomId);
    if (!existsSync(path)) {
      return null;
    }
    const record = JSON.parse(readFileSync(path, "utf8")) as GameRoomRecord;
    if (!record || record.roomId !== roomId || !record.state) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withBootId(snapshot: GameRoomSnapshot): GameRoomSnapshot {
  return { ...snapshot, bootId };
}

function notifyRoomListeners(roomId: string, snapshot: GameRoomSnapshot): void {
  const listeners = roomListeners.get(roomId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(cloneSerializable(snapshot));
    } catch {
      listeners.delete(listener);
    }
  }
}

/** Streams live snapshots to one SSE subscriber until unsubscribed. */
export function subscribeToRoom(roomId: string, listener: RoomListener): () => void {
  const listeners = roomListeners.get(roomId) ?? new Set<RoomListener>();
  listeners.add(listener);
  roomListeners.set(roomId, listeners);

  return () => {
    listeners.delete(listener);
  };
}

function makeRoom(roomId: string, options: RoomResetOptions = {}): GameRoomRecord {
  // Add a fresh nonce so each created/reset room rolls a new deterministic die
  // sequence instead of replaying the same rolls every game. The seed is stored
  // in the state, so the server stays authoritative and every client agrees.
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const seed = `room-${roomId}-${nonce}`;
  const mode = options.mode ?? "adventure";

  return {
    roomId,
    version: 1,
    updatedAt: new Date().toISOString(),
    state:
      mode === "combat-sandbox"
        ? createInitialGameState(seed)
        : options.players?.length
          ? createAdventureGameState({
              seed,
              difficulty: options.difficulty,
              scenarioId: options.scenarioId,
              players: options.players
            })
          : // New adventure rooms open in the map-setup lobby: players pick
            // factions and heroes, then the scenario map builds itself.
            createAdventureLobbyState({ seed, scenarioId: options.scenarioId })
  };
}

/** In-memory record, falling back to the persisted copy after a restart. */
function getRoomRecord(roomId: string): GameRoomRecord {
  const existing = roomStore.get(roomId);
  if (existing) {
    return existing;
  }

  const persisted = loadPersistedRoom(roomId);
  if (persisted) {
    roomStore.set(roomId, persisted);
    return persisted;
  }

  const fresh = makeRoom(roomId);
  roomStore.set(roomId, fresh);
  persistRoom(fresh);
  return fresh;
}

export function getRoomSnapshot(roomId: string): GameRoomSnapshot {
  return withBootId(cloneSerializable(getRoomRecord(roomId)));
}

export function resetRoom(roomId: string, options: RoomResetOptions = {}): GameRoomSnapshot {
  const existing = roomStore.get(roomId) ?? loadPersistedRoom(roomId);
  const reset = makeRoom(roomId, options);
  reset.version = (existing?.version ?? 0) + 1;
  roomStore.set(roomId, reset);
  persistRoom(reset);
  const snapshot = withBootId(cloneSerializable(reset));
  notifyRoomListeners(roomId, snapshot);
  return snapshot;
}

export function submitRoomAction(
  roomId: string,
  action: GameAction
): { snapshot: GameRoomSnapshot; result: EngineResult } {
  const current = getRoomRecord(roomId);
  const result = applyAction(current.state, action);

  if (result.errors.length > 0) {
    roomStore.set(roomId, current);
    return {
      snapshot: withBootId(cloneSerializable(current)),
      result
    };
  }

  const next: GameRoomRecord = {
    roomId,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    state: result.state
  };
  roomStore.set(roomId, next);
  persistRoom(next);
  const snapshot = withBootId(cloneSerializable(next));
  notifyRoomListeners(roomId, snapshot);

  return {
    snapshot,
    result
  };
}
