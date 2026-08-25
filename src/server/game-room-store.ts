import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "@/server/atomic-file";
import {
  applyAction,
  configuredComputerOpponents,
  createAdventureGameState,
  createAdventureLobbyState,
  createCombatSandboxLobbyState,
  driveAfkDrop,
  dropDisconnectedMember,
  forcedResolutionPending,
  ENGINE_SIGNATURE,
  ensureUniqueArmyUnitIds,
  freshEntropy,
  isPrivateSinglePlayer,
  isSinglePlayerRoomId,
  MAX_ROOM_NAME_LENGTH,
  resetVoteAuthorizes,
  resetVoteRequired,
  sessionModeOf,
  type AdventurePlayerConfig,
  type EngineResult,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameSessionMode,
  type GameState,
  type PlayerId,
  type TableGameMode
} from "@/engine";
import {
  applyHumanComputerAdvance,
  computerPumpOwed,
  computerStepDelayMs,
  settleComputerForLiveAction,
  settleComputerVisibleStep,
} from "@/server/computer-runner";
import { detectFinishedMatch } from "@/server/match-report";
import { reportFinishedMatch } from "@/server/match-report-trigger";
import {
  actorIsRoomParticipant,
  applyUndoMove,
  clearUndoHistory,
  recordUndoSnapshot,
  undoModeEnabled
} from "@/server/undo-history";
import { prepareSinglePlayerLoad, singlePlayerSaveAccess } from "@/server/single-player-save";
import {
  deriveLobbyRecord,
  isStaleRecord,
  surplusRoomIds,
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
  sessionMode?: GameSessionMode;
  computerOpponents?: number;
  /** Clash (default) or the humans-vs-computers Co-op table. */
  gameMode?: TableGameMode;
};

export type RoomCreateOptions = RoomResetOptions & {
  /** A chosen room name (seeded into `state.room.name`). */
  name?: string;
  /** Display name of the creator (lobby attribution only). */
  createdByName?: string;
  /**
   * Match type chosen at creation (the lobby's Ranked/Normal picker), seeded
   * into `state.room.ranked`. `false` = a casual game that never counts MMR.
   * Absent leaves it unset (treated as ranked, the legacy default).
   */
  ranked?: boolean;
  /**
   * Closed table hint at creation. NOT seeded as hosted:true alone (that would
   * lock the room with no hostClientId and block SET_ROOM_HOSTED). The client
   * still applies hosting via SET_ROOM_HOSTED once the creator has joined.
   * Accepted for API symmetry / future use.
   */
  hosted?: boolean;
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

  // Self-heal the paced computer pump: a room restored after a process restart
  // (or a pump timer lost to a crash) can be frozen mid-computer-turn, and no
  // human action can revive it — it is not the human's turn. A live client
  // (re)opening the stream is the natural recovery point.
  ensureComputerPump(roomId);

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

  // An `sp-` room id is minted ONLY for single-player, so default a room with
  // that id to single-player even when the caller passed no sessionMode (a bare
  // snapshot/action request that auto-creates the room). Without this such a
  // room would be born as a public, listed multiplayer lobby — flooding the
  // directory with what should be an invisible private game.
  const sessionMode =
    options.sessionMode ?? (isSinglePlayerRoomId(roomId) ? "single-player" : undefined);
  const computerOpponents =
    options.computerOpponents ?? (sessionMode === "single-player" ? 1 : undefined);

  const now = new Date().toISOString();
  const state =
    mode === "combat-sandbox"
      ? createCombatSandboxLobbyState(seed)
      : options.players?.length
        ? createAdventureGameState({
            seed,
            difficulty: options.difficulty,
            scenarioId: options.scenarioId,
            players: options.players,
            sessionMode,
            computerOpponents
          })
        : // New adventure rooms open in the map-setup lobby: players pick
          // factions and heroes, then the scenario map builds itself.
          createAdventureLobbyState({
            seed,
            scenarioId: options.scenarioId,
            sessionMode,
            computerOpponents,
            gameMode: options.gameMode
          });

  // A name and/or match type chosen at creation seeds a room membership record
  // so the lobby shows them before anyone joins; JOIN_ROOM then fills in
  // members. Hosting is applied by the creator via SET_ROOM_HOSTED after join
  // (seeding hosted:true with no hostClientId would strand the room).
  const name = options.name?.trim().slice(0, MAX_ROOM_NAME_LENGTH);
  if (name || options.ranked !== undefined || sessionMode === "single-player") {
    const singlePlayer = sessionMode === "single-player";
    state.room = {
      hosted: singlePlayer,
      hostClientId: null,
      members: [],
      ...(singlePlayer ? { visibility: "private" as const, ranked: false } : {}),
      ...(name ? { name } : {}),
      ...(!singlePlayer && options.ranked !== undefined ? { ranked: Boolean(options.ranked) } : {})
    };
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
  const existingState = existing?.state ?? null;
  if (!adminKeyAuthorizes(adminKey) && !isAdmin && existingState) {
    if (resetVoteRequired(existingState)) {
      // In-progress multiplayer adventure: the unanimous "new adventure" vote —
      // approved by every live seat and fired by the browser that opened it —
      // may wipe the running game. The HOST of a hosted room may ALSO start it
      // directly (host override): this is the escape hatch so a stuck vote — a
      // player who left but is not eliminated, a solo-host test where nobody
      // else is present to confirm — is never a dead end. An OPEN table has no
      // host, so it still needs the vote (its requester can confirm every seat
      // through the local switcher, so it is never stuck either). See
      // src/engine/reset-vote.ts.
      const hostOverride =
        Boolean(room?.hosted) && authorizeHostedWipe(roomId, room!, actorClientId, "reset").allowed;
      if (!resetVoteAuthorizes(existingState, actorClientId) && !hostOverride) {
        return {
          reset: false,
          reason: "Everyone still in the game must confirm a new adventure — or the host can start it.",
          snapshot: getRoomSnapshot(roomId)
        };
      }
    } else if (room?.hosted) {
      const authority = authorizeHostedWipe(roomId, room, actorClientId, "reset");
      if (!authority.allowed) {
        return { reset: false, reason: authority.reason, snapshot: getRoomSnapshot(roomId) };
      }
    }
  }
  // Single-player session rules for resets:
  // — preservation: a single-player rematch stays single-player with the same
  //   computer-seat count unless the caller explicitly overrides the mode
  //   (plan §4.4 — resets keep the one human seat and the computer seats);
  // — fresh-room-only creation: a reset may INTRODUCE single-player mode only
  //   over a memberless, unstarted setup lobby — an established room can never
  //   be flipped into a private single-player one (the marker is dropped).
  const effectiveOptions: RoomResetOptions = (() => {
    if (existingState && sessionModeOf(existingState) === "single-player") {
      if (options.sessionMode !== undefined) {
        return options;
      }
      return {
        ...options,
        sessionMode: "single-player",
        computerOpponents:
          options.computerOpponents ?? Math.max(1, configuredComputerOpponents(existingState))
      };
    }
    if (options.sessionMode === "single-player" && existingState) {
      const fresh =
        existingState.phase === "setup" &&
        Boolean(existingState.setupLobby) &&
        (existingState.room?.members.length ?? 0) === 0;
      if (!fresh) {
        return { ...options, sessionMode: undefined, computerOpponents: undefined };
      }
    }
    return options;
  })();
  const reset = makeRoom(roomId, effectiveOptions);
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
  // A reset wipes the running game — drop any undo history so the new game
  // cannot roll back into the old one.
  clearUndoHistory(roomId);
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
  // A restored game may be mid-computer-turn: revive the paced pump, or the
  // recovered table would sit frozen on the AI with no action able to wake it.
  ensureComputerPump(roomId);
  return snapshot;
}

/**
 * Single-player save slots: the RAW (unredacted) room state for the OWNER's
 * local save file. Solo rooms only — see src/server/single-player-save.ts for
 * why the redacted client frames can never serve as a save.
 */
export function getSinglePlayerSaveState(
  roomId: string,
  actorClientId?: string,
  actorUserId?: string
): { ok: true; state: GameState; version: number } | { ok: false; reason: string } {
  const current = getRoomRecord(roomId);
  const access = singlePlayerSaveAccess(current.state, { clientId: actorClientId, userId: actorUserId });
  if (!access.ok) {
    return { ok: false, reason: access.reason };
  }
  return { ok: true, state: cloneSerializable(current.state), version: current.version };
}

/**
 * Single-player save slots: replace the room's game with a saved snapshot —
 * an atomic whole-state swap into the SAME room (never a new room), mirroring
 * the undo restore: version bump, persist, broadcast, pump re-derive. The undo
 * history is dropped like on a reset (a load jumps timelines).
 */
export function loadSinglePlayerSave(
  roomId: string,
  incoming: unknown,
  actorClientId?: string,
  actorUserId?: string
): { loaded: true; snapshot: GameRoomSnapshot } | { loaded: false; reason: string } {
  const current = getRoomRecord(roomId);
  const prepared = prepareSinglePlayerLoad(current.state, incoming, {
    clientId: actorClientId,
    userId: actorUserId
  });
  if (!prepared.ok) {
    return { loaded: false, reason: prepared.reason };
  }
  const next: GameRoomRecord = {
    roomId,
    version: current.version + 1,
    ...(current.createdAt ? { createdAt: current.createdAt } : {}),
    ...(current.createdByName ? { createdByName: current.createdByName } : {}),
    updatedAt: new Date().toISOString(),
    state: prepared.state
  };
  roomStore.set(roomId, next);
  persistRoom(next);
  clearUndoHistory(roomId);
  const snapshot = withBootId(cloneSerializable(next));
  notifyRoomListeners(roomId, snapshot);
  // The loaded game may be mid-computer-turn: re-derive the paced pump exactly
  // like the undo restore (cancel the abandoned timeline's timer, re-arm iff
  // the loaded state owes a move).
  cancelComputerPump(roomId);
  ensureComputerPump(roomId);
  return { loaded: true, snapshot };
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

  // OPTIONAL Undo mode (debug/testing): an UNDO_MOVE never reaches the engine
  // reducer — it pops the server-side per-room snapshot stack and restores it
  // wholesale. Any current member may undo (the whole table opted into the
  // debug toggle); the restore is atomic (a full prior state) so open combats /
  // choices / reward queues roll back together. With the mode off or nothing to
  // undo, it is rejected and the room is untouched.
  if (action.type === "UNDO_MOVE") {
    return undoRoomAction(roomId, current, action.playerId, actorClientId, actorUserId);
  }

  // Record the PRE-action state on the undo stack when the mode is on (no-op
  // otherwise). Done before applyAction so an undo rolls back exactly this
  // action (and any AI settle that rides with it).
  recordUndoSnapshot(roomId, current.state);

  // Fresh crypto entropy per action: every die roll, shuffle and Ⅱ–Ⅲ tile flip is
  // genuinely unpredictable and non-reproducible from the game seed (true random
  // in play). A no-op for the deterministic engine test suite, which calls
  // applyAction directly without it (see random.ts).
  const result = applyAction(current.state, action, {
    entropy: freshEntropy(),
    // Server wall clock: the AFK vote-kick's only time source (idle stamps +
    // the 10-minute idle/re-ask gates).
    now: Date.now(),
    // Live-stream set for this room: RECLAIM_HOST refuses while the current host
    // is still connected (the reset/close "host absent" rule, applied to host
    // recovery so a restarted guest host can take their own table back).
    liveClientIds: liveRoomClientIds(roomId),
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

  // A passed AFK kick vote or an expired 10-minute turn: drive the forced
  // resolution through the normal action pipeline until the seat is removed /
  // its turn ends (or the table must wait for an open interaction).
  const afkSettledState = forcedResolutionPending(result.state)
    ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
    : result.state;

  // Single-player settle rules:
  // - ADVANCE_COMPUTER: recovery watchdog requested one map beat.
  // - Other actions: setup bulk; PvP combat one immediate beat; map work waits
  //   for the authoritative timer so the END_TURN frame broadcasts first.
  let settledState = afkSettledState;
  if (action.type === "ADVANCE_COMPUTER") {
    const advanced = applyHumanComputerAdvance(afkSettledState);
    if (advanced.stalled && advanced.decisions.length === 0) {
      console.warn(
        `[computer-runner] ADVANCE_COMPUTER produced no step: ${advanced.reason ?? "unknown"}`,
      );
    }
    settledState = advanced.state;
  } else {
    settledState = settleComputerForLiveAction(afkSettledState);
  }

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
  const finishedMatch = detectFinishedMatch(current.state, settledState);
  const pendingMatchReport = reportFinishedMatch(current.state, settledState) ?? undefined;
  // RANKED multiplayer only: once a real win/loss is attributed, CLOSE the room
  // so a rematch cannot reuse the same table (same seed / matchSeats edge cases
  // that leave MMR unaccounted). Casual (ranked:false), single-player, sandbox,
  // and unfinished tables are untouched — "New adventure" / rematch still work
  // there. System force-close (no host gate).
  if (finishedMatch?.ranked) {
    forceCloseRoom(roomId, "ranked match finished");
    return {
      snapshot: withBootId({
        ...cloneSerializable(next),
        closed: true
      }),
      result,
      ...(pendingMatchReport ? { pendingMatchReport } : {})
    };
  }
  const snapshot = withBootId(cloneSerializable(next));
  notifyRoomListeners(roomId, snapshot);

  // Server-authoritative computer clock. Map turns, AI-only encounters and PvP
  // all pump until control returns to a human. ADVANCE_COMPUTER remains legal
  // as a delayed recovery watchdog, not as normal turn progression.
  if (computerPumpOwed(settledState)) {
    scheduleComputerPump(roomId, computerStepDelayMs(settledState));
  } else {
    cancelComputerPump(roomId);
  }

  return {
    snapshot,
    result,
    ...(pendingMatchReport ? { pendingMatchReport } : {})
  };
}

function undoRejection(current: GameRoomRecord, message: string): {
  snapshot: GameRoomSnapshot;
  result: EngineResult;
} {
  roomStore.set(current.roomId, current);
  return {
    snapshot: withBootId(cloneSerializable(current)),
    result: { state: current.state, events: [], errors: [{ code: "ACTION_NOT_LEGAL", message }] }
  };
}

/**
 * Server handler for an UNDO_MOVE (built-in store). Validates membership + the
 * undo mode, pops+restores the prior state, then persists/broadcasts it and
 * re-arms the paced computer pump against the restored state (so undoing around
 * a single-player AI turn cannot leave the pump frozen — ensureComputerPump
 * re-arms only when the restored state still owes a computer move).
 */
function undoRoomAction(
  roomId: string,
  current: GameRoomRecord,
  playerId: PlayerId,
  actorClientId?: string,
  actorUserId?: string
): { snapshot: GameRoomSnapshot; result: EngineResult } {
  if (!undoModeEnabled(current.state)) {
    return undoRejection(current, "Undo mode is off for this game.");
  }
  if (!actorIsRoomParticipant(current.state, actorClientId, actorUserId)) {
    return undoRejection(current, "Only a member of this room can undo.");
  }
  const outcome = applyUndoMove(roomId, current.state, playerId);
  if (!outcome.undone) {
    return undoRejection(current, outcome.reason);
  }
  const next: GameRoomRecord = {
    roomId,
    version: current.version + 1,
    ...(current.createdAt ? { createdAt: current.createdAt } : {}),
    ...(current.createdByName ? { createdByName: current.createdByName } : {}),
    updatedAt: new Date().toISOString(),
    state: outcome.state
  };
  roomStore.set(roomId, next);
  persistRoom(next);
  const snapshot = withBootId(cloneSerializable(next));
  notifyRoomListeners(roomId, snapshot);
  // Re-derive the paced pump for the restored state (cancel any pump armed for
  // the now-undone future, then re-arm iff the restored state owes a move).
  cancelComputerPump(roomId);
  ensureComputerPump(roomId);
  return {
    snapshot,
    result: { state: outcome.state, events: [], errors: [] }
  };
}

// ---------------------------------------------------------------------------
// Single-player paced computer pump (Next.js in-process store)
// ---------------------------------------------------------------------------
//
// After a human action the adventure does NOT bulk-resolve the computer turn.
// Instead each computer decision is applied after a short delay, versioned and
// pushed over SSE so the human sees the real map/combat step (a move, a
// resource die, a visit reward) before the next one. Setup still bulk-settles
// inside settleComputerForLiveAction. PartyKit mirrors this with Durable Object
// alarms (see party/index.ts).

const computerPumpTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function cancelComputerPump(roomId: string): void {
  const timer = computerPumpTimers.get(roomId);
  if (timer !== undefined) {
    clearTimeout(timer);
    computerPumpTimers.delete(roomId);
  }
}

/**
 * Arm the paced pump when a computer seat owes a decision but no timer is
 * pending — the self-heal for a room restored after a restart (the timer died
 * with the old process) or a crashed tick. Never postpones a pending timer and
 * never recreates a room that is not already in memory.
 */
export function ensureComputerPump(roomId: string): void {
  if (computerPumpTimers.has(roomId)) {
    return;
  }
  const current = roomStore.get(roomId);
  if (!current || current.closed || !computerPumpOwed(current.state)) {
    return;
  }
  scheduleComputerPump(roomId, computerStepDelayMs(current.state));
}

function scheduleComputerPump(roomId: string, delayMs: number): void {
  cancelComputerPump(roomId);
  computerPumpTimers.set(
    roomId,
    setTimeout(() => {
      computerPumpTimers.delete(roomId);
      try {
        pumpComputerOnce(roomId);
      } catch (error) {
        console.warn("[computer-runner] paced pump failed", error);
      }
    }, Math.max(0, delayMs)),
  );
}

function pumpComputerOnce(roomId: string): void {
  // Only pump rooms still held in memory — never recreate a deleted room.
  const current = roomStore.get(roomId);
  if (!current || current.closed) {
    return;
  }
  if (!computerPumpOwed(current.state)) {
    return;
  }

  const before = current.state;
  const run = settleComputerVisibleStep(before);
  if (run.decisions.length === 0) {
    // The pump was owed (checked above) yet produced no visible step: a genuine
    // stall. Single-player rooms carry no turn clock / AFK recovery, so surface
    // it loudly instead of freezing silently — a stall is now a bug to chase,
    // not an expected quiet stop.
    if (run.stalled) {
      console.warn(
        `[computer-runner] stalled in room ${roomId}: ${run.reason ?? "no safe legal action"}`,
      );
    }
    return;
  }

  const next: GameRoomRecord = {
    roomId,
    version: current.version + 1,
    ...(current.createdAt ? { createdAt: current.createdAt } : {}),
    ...(current.createdByName ? { createdByName: current.createdByName } : {}),
    updatedAt: new Date().toISOString(),
    state: run.state,
  };
  roomStore.set(roomId, next);
  persistRoom(next);
  // Match report may fire mid-computer-turn (last faction standing, etc.).
  const finishedMatch = detectFinishedMatch(before, run.state);
  void reportFinishedMatch(before, run.state);
  if (finishedMatch?.ranked) {
    forceCloseRoom(roomId, "ranked match finished");
    return;
  }
  notifyRoomListeners(roomId, withBootId(cloneSerializable(next)));

  if (computerPumpOwed(run.state)) {
    scheduleComputerPump(roomId, computerStepDelayMs(run.state));
  }
}

/**
 * Test helper: cancel any pending timer and run the paced computer pump to
 * idle synchronously (no real wall-clock delays). Live play uses the timered
 * path so humans can watch each step.
 */
export function drainComputerPumpSync(roomId: string): void {
  cancelComputerPump(roomId);
  let guard = 0;
  while (guard < 512) {
    const current = roomStore.get(roomId);
    if (!current || !computerPumpOwed(current.state)) {
      return;
    }
    // Inline one tick without re-arming the timer.
    const before = current.state;
    const run = settleComputerVisibleStep(before);
    if (run.decisions.length === 0) {
      if (run.stalled) {
        console.warn(
          `[computer-runner] drain stalled in room ${roomId}: ${run.reason ?? "no safe legal action"}`,
        );
      }
      return;
    }
    const next: GameRoomRecord = {
      roomId,
      version: current.version + 1,
      ...(current.createdAt ? { createdAt: current.createdAt } : {}),
      ...(current.createdByName ? { createdByName: current.createdByName } : {}),
      updatedAt: new Date().toISOString(),
      state: run.state,
    };
    roomStore.set(roomId, next);
    persistRoom(next);
    const finishedMatch = detectFinishedMatch(before, run.state);
    void reportFinishedMatch(before, run.state);
    if (finishedMatch?.ranked) {
      forceCloseRoom(roomId, "ranked match finished");
      return;
    }
    notifyRoomListeners(roomId, withBootId(cloneSerializable(next)));
    guard += 1;
  }
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

/** The clientIds currently holding a live stream on `roomId` (for RECLAIM_HOST). */
function liveRoomClientIds(roomId: string): string[] {
  const clients = liveRoomClients.get(roomId);
  if (!clients) {
    return [];
  }
  const ids: string[] = [];
  for (const [clientId, count] of clients) {
    if (count > 0) {
      ids.push(clientId);
    }
  }
  return ids;
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

/** All rooms known to this backend (in-memory first, then disk-only). */
function allRoomRecords(): Map<string, GameRoomRecord> {
  const records = new Map<string, GameRoomRecord>();
  for (const [roomId, record] of roomStore) {
    records.set(roomId, record);
  }
  for (const record of readPersistedRecords()) {
    if (!records.has(record.roomId)) {
      records.set(record.roomId, record);
    }
  }
  return records;
}

/**
 * Auto-delete surplus rooms so no account holds more than MAX_ROOMS_PER_ACCOUNT
 * (the "flooded lobby" fix). Force-closes the surplus (real delete + a `closed`
 * broadcast so anyone connected drops back to the lobby), keeping each owner's
 * in-progress games and newest rooms (see `surplusRoomIds`). Guest / ownerless
 * rooms are never touched. Runs on create and on every directory list, so an
 * existing flood is cleaned up on the next poll without any manual step.
 */
export function enforceRoomCaps(): void {
  const lobbyRecords: LobbyRoomRecord[] = [];
  for (const record of allRoomRecords().values()) {
    if (isPrivateSinglePlayer(record.state)) {
      continue;
    }
    lobbyRecords.push(lobbyRecordOf(record));
  }
  for (const roomId of surplusRoomIds(lobbyRecords)) {
    forceCloseRoom(roomId, "per-account room limit");
  }
}

/**
 * The lobby room list. Merges in-memory rooms with any only on disk (after a
 * host recycle), prunes empty rooms idle past the TTL, auto-deletes rooms over
 * the per-account cap, and returns the rest newest-activity first.
 */
export function listRooms(viewerClientId?: string): RoomDirectoryEntry[] {
  // Auto-delete surplus first so the list never shows (or lets anyone join) a
  // room that is about to be force-closed for exceeding the per-account cap.
  enforceRoomCaps();

  const records = allRoomRecords();

  const entries: RoomDirectoryEntry[] = [];
  for (const record of records.values()) {
    if (isPrivateSinglePlayer(record.state)) {
      // Private single-player rooms are never listed, but they must still be
      // garbage-collected when abandoned — otherwise a client that spins up many
      // single-player games leaks room records that the cap deliberately never
      // touches. Prune them on the same idle-TTL as public rooms.
      if (isStaleRoom(record)) {
        roomStore.delete(record.roomId);
        deletePersistedRoom(record.roomId);
      }
      continue;
    }
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
 * Non-guessable id for a PRIVATE single-player room: 128 random bits (plan
 * §4.2), not the short public-room suffix — the room id is the only thing
 * standing between a private game and a would-be spectator.
 */
function privateRoomId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof cryptoObj?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return `sp-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `sp-${freshEntropy()}${freshEntropy()}`;
}

/**
 * Creates a brand-new room with an optional name + creator attribution. When no
 * roomId is given a fresh random one is minted (retried on the rare collision).
 * Returns the created room's snapshot.
 */
export function createRoom(options: RoomCreateOptions & { roomId?: string } = {}): GameRoomSnapshot {
  let roomId =
    options.roomId?.trim() ||
    (options.sessionMode === "single-player" ? privateRoomId() : randomRoomId());
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
  // Keep the lobby bounded: auto-delete any account's rooms over the cap. The
  // just-created room has no owner yet (nobody has joined), so it is never the
  // one evicted here — this cleans up a caller who already sits at the limit.
  enforceRoomCaps();
  return withBootId(cloneSerializable(record));
}

export type CloseRoomResult = { closed: boolean; reason?: string };

/**
 * System force-close (no host / member authority check). Used after a RANKED
 * match is recorded so the finished table cannot be rematched in place.
 * Idempotent. Connected clients receive a final `closed` snapshot.
 */
export function forceCloseRoom(roomId: string, reason?: string): CloseRoomResult {
  const record = roomStore.get(roomId) ?? loadPersistedRoom(roomId);
  if (!record) {
    return { closed: true };
  }
  cancelComputerPump(roomId);
  clearUndoHistory(roomId);
  roomStore.delete(roomId);
  deletePersistedRoom(roomId);
  notifyRoomListeners(roomId, withBootId({ ...cloneSerializable(record), closed: true }));
  if (reason) {
    console.log(`[room] force-closed ${roomId}: ${reason}`);
  }
  return { closed: true };
}

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
  return forceCloseRoom(roomId);
}
