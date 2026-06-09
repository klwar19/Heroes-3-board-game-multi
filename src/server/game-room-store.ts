import { applyAction, createInitialGameState, type EngineResult, type GameAction, type GameState } from "@/engine";

export type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
};

type GameRoomRecord = GameRoomSnapshot;

declare global {
  var __homm3bgRoomStore: Map<string, GameRoomRecord> | undefined;
}

const roomStore = globalThis.__homm3bgRoomStore ?? new Map<string, GameRoomRecord>();
globalThis.__homm3bgRoomStore = roomStore;

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeRoom(roomId: string): GameRoomRecord {
  return {
    roomId,
    version: 1,
    updatedAt: new Date().toISOString(),
    state: createInitialGameState(`room-${roomId}`)
  };
}

export function getRoomSnapshot(roomId: string): GameRoomSnapshot {
  const existing = roomStore.get(roomId) ?? makeRoom(roomId);
  roomStore.set(roomId, existing);
  return cloneSerializable(existing);
}

export function resetRoom(roomId: string): GameRoomSnapshot {
  const existing = roomStore.get(roomId);
  const reset = makeRoom(roomId);
  reset.version = (existing?.version ?? 0) + 1;
  roomStore.set(roomId, reset);
  return cloneSerializable(reset);
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

  return {
    snapshot: cloneSerializable(next),
    result
  };
}
