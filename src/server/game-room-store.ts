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
}

const roomStore = globalThis.__homm3bgRoomStore ?? new Map<string, GameRoomRecord>();
globalThis.__homm3bgRoomStore = roomStore;

const roomListeners = globalThis.__homm3bgRoomListeners ?? new Map<string, Set<RoomListener>>();
globalThis.__homm3bgRoomListeners = roomListeners;

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

export function getRoomSnapshot(roomId: string): GameRoomSnapshot {
  const existing = roomStore.get(roomId) ?? makeRoom(roomId);
  roomStore.set(roomId, existing);
  return cloneSerializable(existing);
}

export function resetRoom(roomId: string, options: RoomResetOptions = {}): GameRoomSnapshot {
  const existing = roomStore.get(roomId);
  const reset = makeRoom(roomId, options);
  reset.version = (existing?.version ?? 0) + 1;
  roomStore.set(roomId, reset);
  const snapshot = cloneSerializable(reset);
  notifyRoomListeners(roomId, snapshot);
  return snapshot;
}

export function submitRoomAction(
  roomId: string,
  action: GameAction
): { snapshot: GameRoomSnapshot; result: EngineResult } {
  const current = roomStore.get(roomId) ?? makeRoom(roomId);
  const result = applyAction(current.state, action);

  if (result.errors.length > 0) {
    roomStore.set(roomId, current);
    return {
      snapshot: cloneSerializable(current),
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
  const snapshot = cloneSerializable(next);
  notifyRoomListeners(roomId, snapshot);

  return {
    snapshot,
    result
  };
}
