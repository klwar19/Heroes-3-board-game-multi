import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "@/server/atomic-file";
import {
  afkDropPending,
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  driveAfkDrop,
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
import { reportFinishedMatch } from "@/server/match-report-trigger";
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
    // Atomic (temp + rename): a crash mid-write must never leave a truncated
    // room file that silently loses the game on the next restart.
    writeFileAtomic(roomFilePath(record.roomId), JSON.stringify(record));
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

/**
 * Fan a snapshot out to every subscriber. Every caller hands in a freshly
 * cloned snapshot, and all listeners share that ONE object — cloning the whole
 * game state again per listener made each action broadcast O(state × clients).
 * The listener contract is therefore read-only: serialize/derive immediately,
 * never mutate (the SSE route just JSON.stringifies it).
 */
function notifyRoomListeners(roomId: string, snapshot: GameRoomSnapshot): void {
  const listeners = roomListeners.get(roomId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      listeners.delete(listener);
    }
  }
}

/**
 * Streams live snapshots to one SSE subscriber until unsubscribed. Snapshots
 * are shared across subscribers — treat them as immutable (see
 * notifyRoomListeners).
 */
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

export type ResetRoomResult = {
  reset: boolean;
  reason?: string;
  /** The room after the call: the fresh game on success, untouched on refusal. */
  snapshot: GameRoomSnapshot;
};

/**
 * Starts a fresh game in the room. A reset is as destructive as a close (the
 * running game is wiped for every seat), so it carries the SAME authority rule
 * as closeRoom — see authorizeHostedWipe: host always; any member once the
 * host holds no live stream; strangers never. An OPEN table has no ownership
 * to protect and anyone may reset it.
 */
export function resetRoom(
  roomId: string,
  options: RoomResetOptions = {},
  actorClientId?: string,
  adminKey?: string,
  /**
   * Server-verified platform admin (resolved from the session cookie in the API
   * route, so it is NOT client-forgeable). An admin may reset ANY room, exactly
   * like the developer HOMM3BG_ADMIN_KEY override.
   */
  isAdmin = false
): ResetRoomResult {
  const existing = roomStore.get(roomId) ?? loadPersistedRoom(roomId);
  const room = existing?.state.room ?? null;
  if (room?.hosted && !adminKeyAuthorizes(adminKey) && !isAdmin) {
    const authority = authorizeHostedWipe(roomId, room, actorClientId, "reset");
    if (!authority.allowed) {
      return { reset: false, reason: authority.reason, snapshot: getRoomSnapshot(roomId) };
    }
  }
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
  return { reset: true, snapshot };
}

/**
 * Re-seeds a room from a client's cached game state after the server lost it
 * (process recycle / cold start cleared the in-memory store and the temp-dir
 * copy). To stay safe it only writes over a *fresh setup lobby* — the state a
 * lost room is recreated as — so it can never clobber a game already in
 * progress, and racing restores converge (the first wins; the rest are no-ops
 * that simply return the now-restored room).
 *
 * Authority: when the lobby being written over is a HOSTED room, the restore
 * must come from one of its current members — an outsider cannot stomp a
 * hosted table's setup with a fabricated "recovered" game. A fresh
 * post-restart room (no membership yet) stays permissive, which the recovery
 * race needs (the cached-game push can land before the client's own re-join).
 */
export function restoreRoom(roomId: string, state: GameState, actorClientId?: string): GameRoomSnapshot {
  const current = getRoomRecord(roomId);
  const currentRoom = current.state.room ?? null;
  if (
    currentRoom?.hosted &&
    (!actorClientId || !currentRoom.members.some((member) => member.clientId === actorClientId))
  ) {
    return withBootId(cloneSerializable(current));
  }
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
  actorClientId?: string,
  /**
   * The account id the API route VERIFIED from the session cookie (Phase 2).
   * Authoritative over the client-claimed `actorClientId`: the engine's seat
   * guard binds a signed-in actor to their account and `joinRoom` stamps it onto
   * the member. Undefined for a guest (no session).
   */
  actorUserId?: string
): { snapshot: GameRoomSnapshot; result: EngineResult; pendingMatchReport?: Promise<void> } {
  const current = getRoomRecord(roomId);
  // Fresh crypto entropy per action: every die roll, shuffle and Ⅱ–Ⅲ tile flip is
  // genuinely unpredictable and non-reproducible from the game seed (true random
  // in play). A no-op for the deterministic engine test suite, which calls
  // applyAction directly without it (see random.ts).
  const result = applyAction(current.state, action, {
    entropy: freshEntropy(),
    // Server wall clock: the AFK vote-kick's only time source (idle stamps +
    // the 10-minute idle/re-ask gates).
    now: Date.now(),
    ...(actorClientId ? { actorClientId } : {}),
    ...(actorUserId ? { actorUserId } : {})
  });

  if (result.errors.length > 0) {
    roomStore.set(roomId, current);
    return {
      snapshot: withBootId(cloneSerializable(current)),
      result
    };
  }

  // A passed AFK kick vote: drive the drop through the normal action pipeline
  // until the seat is removed (or the table must wait for an open interaction).
  const settledState = afkDropPending(result.state)
    ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
    : result.state;

  const next: GameRoomRecord = {
    roomId,
    version: current.version + 1,
    // Keep the room's identity (creation stamp / creator) across every action.
    ...(current.createdAt ? { createdAt: current.createdAt } : {}),
    ...(current.createdByName ? { createdByName: current.createdByName } : {}),
    updatedAt: new Date().toISOString(),
    state: settledState
  };
  roomStore.set(roomId, next);
  persistRoom(next);
  // Auto-report the ranked result the moment this action ends the game (Phase
  // 6): seated verified accounts get their win/loss + Elo recorded exactly once
  // per game (matchId = the game's unique seed; duplicate reports no-op). The
  // pending write is RETURNED so the HTTP route can hold its response open on a
  // serverless host (a floated promise there may be frozen mid-write); errors
  // are caught + logged inside, never breaking the winning action.
  // Read the SETTLED state — an AFK kick driven right after this action may
  // itself have ended the game (last faction standing).
  const pendingMatchReport = reportFinishedMatch(current.state, settledState) ?? undefined;
  const snapshot = withBootId(cloneSerializable(next));
  notifyRoomListeners(roomId, snapshot);

  return {
    snapshot,
    result,
    ...(pendingMatchReport ? { pendingMatchReport } : {})
  };
}

// ---------------------------------------------------------------------------
// Live presence: which clientIds currently hold an open stream per room.
// Backs the host-while-connected rule for destructive room ops (reset/close):
// the host's word is law while their tab is live, but a host whose per-tab
// identity is gone (browser restart) must not strand the table — any member
// may then wipe/close it. Reference-counted per clientId (multiple streams).
// ---------------------------------------------------------------------------

const liveRoomClients = new Map<string, Map<string, number>>();

/**
 * Developer override for destructive room ops: a request carrying the
 * deployment's HOMM3BG_ADMIN_KEY env var may reset or close ANY table. With no
 * key configured the override does not exist — an empty or missing env never
 * matches anything.
 */
function adminKeyAuthorizes(adminKey: string | undefined): boolean {
  const configured = process.env.HOMM3BG_ADMIN_KEY ?? "";
  return configured.length > 0 && adminKey === configured;
}

/** Registers a live stream for `clientId` on the room (SSE route connect). */
export function markRoomClientConnected(roomId: string, clientId: string | undefined): void {
  if (!clientId) {
    return;
  }
  const clients = liveRoomClients.get(roomId) ?? new Map<string, number>();
  clients.set(clientId, (clients.get(clientId) ?? 0) + 1);
  liveRoomClients.set(roomId, clients);
}

/** Drops one live stream for `clientId` on the room (SSE route teardown). */
export function markRoomClientDisconnected(roomId: string, clientId: string | undefined): void {
  if (!clientId) {
    return;
  }
  const clients = liveRoomClients.get(roomId);
  const count = clients?.get(clientId) ?? 0;
  if (!clients || count <= 0) {
    return;
  }
  if (count === 1) {
    clients.delete(clientId);
    if (clients.size === 0) {
      liveRoomClients.delete(roomId);
    }
  } else {
    clients.set(clientId, count - 1);
  }
}

function isRoomClientConnected(roomId: string, clientId: string | null | undefined): boolean {
  return Boolean(clientId && (liveRoomClients.get(roomId)?.get(clientId) ?? 0) > 0);
}

/**
 * Shared authority for the two destructive room operations (reset and close)
 * on a HOSTED room; an open table never reaches this. One rule:
 *  - the host may always do it;
 *  - any MEMBER may do it while the host holds NO live stream (per-tab client
 *    ids die with the browser, so a restarted host must not be locked out of
 *    wiping their own table — and polling-fallback hosts are the accepted
 *    edge of this rule);
 *  - a non-member never may.
 */
function authorizeHostedWipe(
  roomId: string,
  room: { hostClientId: string | null; members: { clientId: string }[] },
  actorClientId: string | undefined,
  verb: "reset" | "close"
): { allowed: boolean; reason?: string } {
  if (actorClientId && actorClientId === room.hostClientId) {
    return { allowed: true };
  }
  const isMember = Boolean(actorClientId) && room.members.some((member) => member.clientId === actorClientId);
  if (!isMember) {
    return { allowed: false, reason: `Only members of this room can ${verb} it.` };
  }
  if (isRoomClientConnected(roomId, room.hostClientId)) {
    return { allowed: false, reason: `Only the host can ${verb} this room while the host is connected.` };
  }
  return { allowed: true };
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

/**
 * Per-file parse cache for the lobby's disk scan, keyed by mtime + size. The
 * lobby is polled every few seconds by every browser sitting in the room list;
 * re-reading and re-parsing EVERY room file (each holding a full game state) on
 * each poll is O(rooms × file size) for data that almost never changes. A stat
 * per file is cheap; only new/rewritten files pay the parse. `null` marks a
 * file that parsed to something that is not a room (e.g. shared-maps.json),
 * so junk isn't re-parsed forever either.
 */
const persistedReadCache = new Map<string, { mtimeMs: number; size: number; record: GameRoomRecord | null }>();

/** Reads every persisted room record off disk (best effort, skips junk files). */
function readPersistedRecords(): GameRoomRecord[] {
  try {
    if (!existsSync(persistDir)) {
      return [];
    }
    const records: GameRoomRecord[] = [];
    const seen = new Set<string>();
    for (const file of readdirSync(persistDir)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      seen.add(file);
      const path = join(persistDir, file);
      try {
        const { mtimeMs, size } = statSync(path);
        const cached = persistedReadCache.get(file);
        if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
          if (cached.record) {
            records.push(cached.record);
          }
          continue;
        }
        const parsed = JSON.parse(readFileSync(path, "utf8")) as GameRoomRecord;
        const record = parsed?.roomId && parsed.state ? parsed : null;
        persistedReadCache.set(file, { mtimeMs, size, record });
        if (record) {
          records.push(record);
        }
      } catch {
        // Ignore a corrupt/partial file; it just won't list.
      }
    }
    // Files deleted from disk must not linger in the cache.
    for (const file of persistedReadCache.keys()) {
      if (!seen.has(file)) {
        persistedReadCache.delete(file);
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
 * Deletes a room for everyone. A HOSTED room follows authorizeHostedWipe (the
 * host always; any member once the host holds no live stream — a restarted
 * host's per-tab id is gone and must not strand the table; strangers never).
 * An OPEN table has no host/ownership to protect and so can be closed by
 * anyone (a per-session clientId means the creator no longer "owns" it after a
 * browser restart — see viewerCanClose). Connected clients receive one final
 * `closed` snapshot so they drop back to the lobby. Idempotent: closing a room
 * that is already gone succeeds.
 */
export function closeRoom(
  roomId: string,
  actorClientId?: string,
  adminKey?: string,
  /** Server-verified platform admin (from the session cookie) — may close ANY room. */
  isAdmin = false
): CloseRoomResult {
  const record = roomStore.get(roomId) ?? loadPersistedRoom(roomId);
  if (!record) {
    return { closed: true };
  }

  const room = record.state.room ?? null;
  if (room?.hosted && !adminKeyAuthorizes(adminKey) && !isAdmin) {
    const authority = authorizeHostedWipe(roomId, room, actorClientId, "close");
    if (!authority.allowed) {
      return { closed: false, reason: authority.reason };
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
