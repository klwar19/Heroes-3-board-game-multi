import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  dropDisconnectedMember,
  ENGINE_SIGNATURE,
  ensureUniqueArmyUnitIds,
  freshEntropy,
  MAX_ROOM_NAME_LENGTH,
  type AdventurePlayerConfig,
  type EngineResult,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameState
} from "@/engine";
import {
  deriveLobbyRecord,
  isStaleRecord,
  toDirectoryEntry as toLobbyDirectoryEntry,
  type LobbyRoomRecord,
  type RoomDirectoryEntry
} from "@/server/lobby-registry";

// The lobby directory's derivation, per-viewer canClose, stale-room TTL, and
// directory-entry shape live in the shared, isomorphic lobby-registry so the
// built-in store and the PartyKit edge present an IDENTICAL lobby. Re-exported
// here for back-compat with existing importers/tests.
export { STALE_ROOM_TTL_MS } from "@/server/lobby-registry";
export type { RoomDirectoryEntry };

export type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  /** When the room was first created (ISO). Used to sort/age rooms in the lobby. */
  createdAt?: string;
  /** Display name of whoever created the room (lobby attribution only). */
  createdByName?: string;
  /**
   * Set on the final frame a closed room broadcasts: every connected client
   * drops back to the lobby instead of silently freezing on a deleted room.
   */
  closed?: boolean;
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

export type RoomCreateOptions = RoomResetOptions & {
  /** A chosen room name (seeded into `state.room.name`). */
  name?: string;
  /** Display name of the creator (lobby attribution only). */
  createdByName?: string;
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

function makeRoom(roomId: string, options: RoomCreateOptions = {}): GameRoomRecord {
  // Add a fresh nonce so each created/reset room rolls a new deterministic die
  // sequence instead of replaying the same rolls every game. The seed is stored
  // in the state, so the server stays authoritative and every client agrees.
  // Use crypto entropy (freshEntropy), not Date.now()+Math.random(): on a
  // frozen-clock / per-isolate-seeded edge runtime the latter collapses so every
  // freshly spun server hands out the SAME map and Creature Bank order.
  const nonce = freshEntropy();
  const seed = `room-${roomId}-${nonce}`;
  const mode = options.mode ?? "adventure";

  const now = new Date().toISOString();
  const state =
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
          createAdventureLobbyState({ seed, scenarioId: options.scenarioId });

  // A name chosen at creation seeds an (open) room membership record so the
  // lobby shows it before anyone joins; JOIN_ROOM then fills in members.
  const name = options.name?.trim().slice(0, MAX_ROOM_NAME_LENGTH);
  if (name) {
    state.room = { hosted: false, hostClientId: null, members: [], name };
  }

  return {
    roomId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(options.createdByName ? { createdByName: options.createdByName.trim().slice(0, 40) } : {}),
    state
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
  // Carry room membership (host, seats, observers, name) across a game reset so
  // the table does not have to re-host, re-seat, or re-name after "New adventure".
  reset.state.room = existing?.state.room ?? null;
  // A reset is the SAME room continuing, so keep its original creation stamp and
  // creator attribution rather than re-minting them.
  if (existing?.createdAt) {
    reset.createdAt = existing.createdAt;
  }
  if (existing?.createdByName) {
    reset.createdByName = existing.createdByName;
  }
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
    // Recovery is the same room continuing — keep its creation identity.
    ...(current.createdAt ? { createdAt: current.createdAt } : {}),
    ...(current.createdByName ? { createdByName: current.createdByName } : {}),
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
  // Fresh crypto entropy per action: every die roll, shuffle and Ⅱ–Ⅲ tile flip is
  // genuinely unpredictable and non-reproducible from the game seed (true random
  // in play). A no-op for the deterministic engine test suite, which calls
  // applyAction directly without it (see random.ts).
  const result = applyAction(current.state, action, {
    entropy: freshEntropy(),
    ...(actorClientId ? { actorClientId } : {})
  });

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
    // Keep the room's identity (creation stamp / creator) across every action.
    ...(current.createdAt ? { createdAt: current.createdAt } : {}),
    ...(current.createdByName ? { createdByName: current.createdByName } : {}),
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

/**
 * Presence cleanup invoked when a client's live SSE stream drops (its tab
 * closed, it navigated back to the lobby, or the socket died). Removes only an
 * ephemeral member (see `dropDisconnectedMember` — never a seated player or the
 * host), then bumps the version and re-broadcasts so every other client, and
 * the lobby directory, sees the corrected member count. A no-op when nothing
 * changed, so a stream that carried no clientId (or a member already gone) costs
 * nothing.
 */
export function handleRoomDisconnect(roomId: string, clientId: string | undefined): void {
  if (!clientId) {
    return;
  }
  const record = roomStore.get(roomId) ?? loadPersistedRoom(roomId);
  if (!record) {
    return;
  }
  if (!dropDisconnectedMember(record.state, clientId)) {
    return;
  }
  record.version += 1;
  record.updatedAt = new Date().toISOString();
  roomStore.set(roomId, record);
  persistRoom(record);
  notifyRoomListeners(roomId, withBootId(cloneSerializable(record)));
}

// ---------------------------------------------------------------------------
// Lobby directory: list rooms, create a named room, and close (delete) one.
// ---------------------------------------------------------------------------

/** Reads every persisted room record off disk (best effort, skips junk files). */
function readPersistedRecords(): GameRoomRecord[] {
  try {
    if (!existsSync(persistDir)) {
      return [];
    }
    const records: GameRoomRecord[] = [];
    for (const file of readdirSync(persistDir)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      try {
        const record = JSON.parse(readFileSync(join(persistDir, file), "utf8")) as GameRoomRecord;
        if (record?.roomId && record.state) {
          records.push(record);
        }
      } catch {
        // Ignore a corrupt/partial file; it just won't list.
      }
    }
    return records;
  } catch {
    return [];
  }
}

function deletePersistedRoom(roomId: string): void {
  try {
    const path = roomFilePath(roomId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Best effort — a read-only FS keeps the in-memory delete only.
  }
}

/** Summarises a stored room into the shared lobby record (one per backend). */
function lobbyRecordOf(record: GameRoomRecord): LobbyRoomRecord {
  return deriveLobbyRecord({
    roomId: record.roomId,
    state: record.state,
    createdAt: record.createdAt ?? record.updatedAt,
    updatedAt: record.updatedAt,
    createdByName: record.createdByName ?? null
  });
}

/** True when nobody is a member AND the room has been idle past the TTL. */
function isStaleRoom(record: GameRoomRecord): boolean {
  return isStaleRecord(lobbyRecordOf(record));
}

function toDirectoryEntry(record: GameRoomRecord, viewerClientId?: string): RoomDirectoryEntry {
  return toLobbyDirectoryEntry(lobbyRecordOf(record), viewerClientId);
}

/**
 * The lobby room list. Merges in-memory rooms with any only on disk (after a
 * host recycle), prunes empty rooms idle past the TTL, and returns the rest
 * newest-activity first.
 */
export function listRooms(viewerClientId?: string): RoomDirectoryEntry[] {
  const records = new Map<string, GameRoomRecord>();
  for (const [roomId, record] of roomStore) {
    records.set(roomId, record);
  }
  for (const record of readPersistedRecords()) {
    if (!records.has(record.roomId)) {
      records.set(record.roomId, record);
    }
  }

  const entries: RoomDirectoryEntry[] = [];
  for (const record of records.values()) {
    if (isStaleRoom(record)) {
      // Garbage-collect the abandoned room as we list.
      roomStore.delete(record.roomId);
      deletePersistedRoom(record.roomId);
      continue;
    }
    entries.push(toDirectoryEntry(record, viewerClientId));
  }

  return entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Generates a short, URL-friendly room id. */
function randomRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a brand-new room with an optional name + creator attribution. When no
 * roomId is given a fresh random one is minted (retried on the rare collision).
 * Returns the created room's snapshot.
 */
export function createRoom(options: RoomCreateOptions & { roomId?: string } = {}): GameRoomSnapshot {
  let roomId = options.roomId?.trim() || randomRoomId();
  // Never silently overwrite an existing room: mint a new id on collision when
  // the caller did not pin one, otherwise return the existing room untouched.
  if (roomStore.has(roomId) || loadPersistedRoom(roomId)) {
    if (options.roomId) {
      return getRoomSnapshot(roomId);
    }
    for (let attempt = 0; attempt < 5 && (roomStore.has(roomId) || loadPersistedRoom(roomId)); attempt += 1) {
      roomId = randomRoomId();
    }
  }

  const record = makeRoom(roomId, options);
  roomStore.set(roomId, record);
  persistRoom(record);
  return withBootId(cloneSerializable(record));
}

export type CloseRoomResult = { closed: boolean; reason?: string };

/**
 * Deletes a room for everyone. A HOSTED room can only be closed by its host; an
 * OPEN table has no host/ownership to protect and so can be closed by anyone (a
 * per-session clientId means the creator no longer "owns" it after a browser
 * restart — see viewerCanClose). Connected clients receive one final `closed`
 * snapshot so they drop back to the lobby. Idempotent: closing a room that is
 * already gone succeeds.
 */
export function closeRoom(roomId: string, actorClientId?: string): CloseRoomResult {
  const record = roomStore.get(roomId) ?? loadPersistedRoom(roomId);
  if (!record) {
    return { closed: true };
  }

  const room = record.state.room ?? null;
  if (room?.hosted) {
    if (!actorClientId || room.hostClientId !== actorClientId) {
      return { closed: false, reason: "Only the host can close this room." };
    }
  }
  // Open table: no ownership to protect — anyone may close it.

  roomStore.delete(roomId);
  deletePersistedRoom(roomId);
  // Tell everyone still connected that the room is gone (last frame on the
  // stream), then they unsubscribe and return to the lobby.
  notifyRoomListeners(roomId, withBootId({ ...cloneSerializable(record), closed: true }));
  return { closed: true };
}
