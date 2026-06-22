import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  ENGINE_SIGNATURE,
  ensureUniqueArmyUnitIds,
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
  /** This server's ENGINE_SIGNATURE, stamped at send time (see version.ts). */
  serverSignature?: string;
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
  // Stamp the running server's engine signature at send time (never persisted)
  // so clients can detect a stale room-server deploy.
  return { ...snapshot, bootId, serverSignature: ENGINE_SIGNATURE };
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

/**
 * Repairs duplicate army-unit ids in a stored room (a legacy artifact of the
 * old id scheme resetting its counter across a host recycle). Runs on every
 * read so the snapshots we serve — and the legal actions / player views derived
 * from them — already carry unique ids; otherwise a client could still drag a
 * unit by a stale shared id before the next action heals the room. Bumps the
 * version and notifies listeners only when it actually changed something.
 */
function healRoomArmyIds(roomId: string, record: GameRoomRecord): void {
  if (!ensureUniqueArmyUnitIds(record.state)) {
    return;
  }
  record.version += 1;
  record.updatedAt = new Date().toISOString();
  roomStore.set(roomId, record);
  persistRoom(record);
  notifyRoomListeners(roomId, withBootId(cloneSerializable(record)));
}

/** In-memory record, falling back to the persisted copy after a restart. */
function getRoomRecord(roomId: string): GameRoomRecord {
  const existing = roomStore.get(roomId);
  if (existing) {
    healRoomArmyIds(roomId, existing);
    return existing;
  }

  const persisted = loadPersistedRoom(roomId);
  if (persisted) {
    roomStore.set(roomId, persisted);
    healRoomArmyIds(roomId, persisted);
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
  // Carry room membership (host, seats, observers) across a game reset so the
  // table does not have to re-host and re-seat after "New adventure".
  reset.state.room = existing?.state.room ?? null;
  roomStore.set(roomId, reset);
  persistRoom(reset);
  const snapshot = withBootId(cloneSerializable(reset));
  notifyRoomListeners(roomId, snapshot);
  return snapshot;
}

/**
 * Re-seeds a room from a client's cached game state after the server lost it
 * (process recycle / cold start cleared the in-memory store and the temp-dir
 * copy). To stay safe it only writes over a *fresh setup lobby* — the state a
 * lost room is recreated as — so it can never clobber a game already in
 * progress, and racing restores converge (the first wins; the rest are no-ops
 * that simply return the now-restored room).
 */
export function restoreRoom(roomId: string, state: GameState): GameRoomSnapshot {
  const current = getRoomRecord(roomId);
  const currentIsFreshLobby = current.state.phase === "setup" && Boolean(current.state.setupLobby);
  const incomingIsRealGame =
    Boolean(state) &&
    typeof state === "object" &&
    Boolean(state.players) &&
    typeof state.phase === "string" &&
    !(state.phase === "setup" && Boolean(state.setupLobby));

  if (!currentIsFreshLobby || !incomingIsRealGame) {
    return withBootId(cloneSerializable(current));
  }

  // Recovery restores the GAME, never the live room membership: keep whoever
  // is currently seated/hosting rather than the (stale) cached membership.
  state.room = current.state.room ?? state.room ?? null;
  const next: GameRoomRecord = {
    roomId,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    state
  };
  roomStore.set(roomId, next);
  persistRoom(next);
  const snapshot = withBootId(cloneSerializable(next));
  notifyRoomListeners(roomId, snapshot);
  return snapshot;
}

export function submitRoomAction(
  roomId: string,
  action: GameAction,
  actorClientId?: string
): { snapshot: GameRoomSnapshot; result: EngineResult } {
  const current = getRoomRecord(roomId);
  const result = applyAction(current.state, action, actorClientId ? { actorClientId } : {});

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
