import type * as Party from "partykit/server";
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
  freshEntropy,
  isPrivateSinglePlayer,
  OBSERVER_VIEWER_SEAT,
  redactStateForSeat,
  resetVoteAuthorizes,
  resetVoteRequired,
  seatForViewer,
  sessionModeOf,
  type AdventurePlayerConfig,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameSessionMode,
  type GameState
} from "@/engine";
import {
  applyHumanComputerAdvance,
  computerPumpOwed,
  computerStepDelayMs,
  settleComputerForLiveAction,
  settleComputerVisibleStep,
} from "@/server/computer-runner";
import { deriveLobbyRecord, lobbyRecordSignature, lobbyReportIsDue, LOBBY_SINGLETON_ID } from "@/server/lobby-registry";
import { detectFinishedMatch } from "@/server/match-report";
import { httpTokenVerifier, memoizeVerifier, type TokenVerifier } from "@/server/verified-actor";

/**
 * One PartyKit room per game table — PartyKit runs every room as its own
 * Cloudflare Durable Object at the edge, so this class is the authoritative
 * version of src/server/game-room-store.ts: it owns the GameState, applies
 * actions through the same rules engine, persists snapshots to Durable
 * Object storage (rooms survive hibernation), and pushes every new snapshot
 * to all connected WebSockets (players, observers, the works).
 *
 * Deploy with `npx partykit deploy` and point the Next.js client at it with
 * NEXT_PUBLIC_PARTYKIT_HOST (see src/lib/realtime.ts).
 */

export type RoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  /** When the room was first created (ISO) — for lobby sort/age, mirrors the store. */
  createdAt?: string;
  /** Display name of whoever created the room (the first member to join). */
  createdByName?: string;
  state: GameState;
  /**
   * This server's ENGINE_SIGNATURE, stamped onto every snapshot at send time
   * (see src/engine/version.ts). Lets the client warn when the room server is
   * running older engine code than the frontend.
   */
  serverSignature?: string;
  /** Set on the final frame a closed room sends, so clients return to the lobby. */
  closed?: boolean;
  /**
   * The seat this frame was redacted for ("p1"…, or "observer"), stamped at
   * send time on HOSTED rooms only. Lets the client tell a zero-trust observer
   * frame from its own seat frame at the SAME version — after a socket
   * reconnect both arrive back-to-back, and the version gate alone would drop
   * the seat-correct one (the "no Event buttons after reconnect" freeze).
   * Absent on open-table frames (the full shared state) and older servers.
   */
  viewerSeat?: string;
};

type CloseRoomResult = { closed: boolean; reason?: string };

export type RoomResetOptions = {
  mode?: GameMode;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
  sessionMode?: GameSessionMode;
  computerOpponents?: number;
};

type ClientMessage =
  | { type: "action"; requestId?: string; action: GameAction; actorClientId?: string }
  | ({ type: "reset"; requestId?: string; actorClientId?: string; adminKey?: string } & RoomResetOptions)
  | { type: "sync"; knownVersion?: number }
  | { type: "ping"; knownVersion: number };

/** The app origin the party calls to verify a socket's session token (Phase 2). */
function appUrlOf(room: Party.Room): string | undefined {
  const env = (room as unknown as { env?: Record<string, unknown> }).env;
  const url = typeof env?.HOMM3BG_APP_URL === "string" ? env.HOMM3BG_APP_URL : "";
  return url.length > 0 ? url : undefined;
}

/**
 * Where the edge posts finished-match results (Phase 6). The Durable Object has
 * no database of its own, so it reports to the app's /api/matches/report,
 * authenticated by the shared HOMM3BG_MATCH_REPORT_KEY (set the SAME value on
 * the party env AND the app deployment). Null ⇒ reporting is off on the edge.
 */
function matchReportConfigOf(room: Party.Room): { appUrl: string; key: string } | null {
  const appUrl = appUrlOf(room);
  const env = (room as unknown as { env?: Record<string, unknown> }).env;
  // Prefer the dedicated match-report secret; fall back to the admin key so a
  // deployment that already set HOMM3BG_ADMIN_KEY for room moderation still
  // records finished games when HOMM3BG_MATCH_REPORT_KEY was never configured.
  const matchKey = typeof env?.HOMM3BG_MATCH_REPORT_KEY === "string" ? env.HOMM3BG_MATCH_REPORT_KEY : "";
  const adminKey = typeof env?.HOMM3BG_ADMIN_KEY === "string" ? env.HOMM3BG_ADMIN_KEY : "";
  const key = matchKey.trim() || adminKey.trim();
  if (!appUrl || key.length === 0) {
    return null;
  }
  return { appUrl: appUrl.replace(/\/+$/, ""), key };
}

type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | {
      type: "action-result";
      requestId?: string;
      version: number;
      errors: { code: string; message: string }[];
      notices?: string[];
    }
  | { type: "pong"; version: number; viewerSeat?: string }
  /** Sent only to a sender whose reset was REFUSED (host-authority rule). */
  | { type: "reset-denied"; reason: string };

const SNAPSHOT_KEY = "snapshot";

export default class GameRoomServer implements Party.Server {
  /** Snapshots persist across hibernation; connections re-sync on attach. */
  readonly options: Party.ServerOptions = { hibernate: true };

  private snapshot: RoomSnapshot | null = null;
  private readonly metricsEnabled: boolean;

  /**
   * Verified-identity resolver (Phase 2). Built lazily from the HOMM3BG_APP_URL
   * env: the edge cannot read the app's httpOnly cookie cross-origin, so it
   * resolves a socket's raw session token by calling back to the app's
   * /api/auth/verify-token route. Memoized so only the first action per token
   * pays the round-trip. Null (and every action stays a guest) when no app URL
   * is configured — the current guest behaviour, unchanged.
   */
  private tokenVerifier: TokenVerifier | null | undefined;

  /**
   * Serializes every snapshot MUTATION on this room. A Durable Object delivers
   * new events while a handler is awaiting non-storage work (the identity
   * verification fetch), so without this two concurrent actions could both
   * read the same snapshot, both apply against it, and both write
   * `version + 1` — the first writer's action vanished while its reply still
   * reported success ("I clicked, got nothing"; lost Event choices, stuck
   * round barriers). Every read-modify-write of `this.snapshot` goes through
   * `serialized()`; read-only paths (sync, GET) stay lock-free. Identity
   * verification is resolved BEFORE taking the lock so one player's slow
   * token fetch never stalls the whole table.
   */
  private mutationQueue: Promise<unknown> = Promise.resolve();

  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const queuedAt = Date.now();
    const execute = () => {
      this.metric("room.mutation.queue", queuedAt);
      return run();
    };
    const next = this.mutationQueue.then(execute, execute);
    // Keep the chain alive whether `run` resolved or rejected.
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Recently answered action requestIds (keyed by sender identity), so a
   * DUPLICATED frame — a client retry after a socket flap, a double-send — is
   * answered from this ledger with the original outcome instead of applying
   * the same action twice. Bounded FIFO (Map keeps insertion order).
   */
  private answeredActionRequests = new Map<
    string,
    { errors: { code: string; message: string }[]; notices: string[]; version: number }
  >();

  private static readonly ANSWERED_REQUEST_CAP = 256;

  private recordAnsweredRequest(
    key: string,
    outcome: { errors: { code: string; message: string }[]; notices: string[]; version: number }
  ): void {
    if (this.answeredActionRequests.size >= GameRoomServer.ANSWERED_REQUEST_CAP) {
      const oldest = this.answeredActionRequests.keys().next().value;
      if (oldest !== undefined) {
        this.answeredActionRequests.delete(oldest);
      }
    }
    this.answeredActionRequests.set(key, outcome);
  }

  constructor(readonly room: Party.Room) {
    const env = (room as unknown as { env?: Record<string, unknown> }).env;
    const rate = Math.max(0, Math.min(1, Number(env?.PERFORMANCE_METRICS_SAMPLE_RATE ?? 0)));
    this.metricsEnabled = rate > 0 && Math.random() < rate;
  }

  private metric(name: string, startedAt: number, fields: Record<string, string | number | boolean> = {}): void {
    if (!this.metricsEnabled) return;
    console.info(JSON.stringify({ metric: name, durationMs: Date.now() - startedAt, roomId: this.roomIdSafe(), ...fields }));
  }

  /**
   * The room id, readable from ANY handler. `this.room.id` THROWS inside
   * onAlarm (a documented PartyKit limitation), so alarm-reachable code must
   * come through here — the persisted snapshot carries the same id.
   */
  private roomIdSafe(): string {
    try {
      return this.room.id;
    } catch {
      return this.snapshot?.roomId ?? "unknown";
    }
  }

  private connectionCount(): number {
    const getConnections = (this.room as unknown as { getConnections?: () => Iterable<Party.Connection> }).getConnections;
    return typeof getConnections === "function" ? [...getConnections.call(this.room)].length : 0;
  }

  private verifier(): TokenVerifier | null {
    if (this.tokenVerifier === undefined) {
      const appUrl = appUrlOf(this.room);
      this.tokenVerifier = appUrl
        ? memoizeVerifier(httpTokenVerifier(appUrl, (input, init) => fetch(input, init)))
        : null;
    }
    return this.tokenVerifier;
  }

  /** The raw session token the client attached to the socket URL, if any. */
  private tokenOf(connection: Party.Connection): string | undefined {
    const uri = (connection as unknown as { uri?: string }).uri;
    if (!uri) {
      return undefined;
    }
    try {
      return new URL(uri).searchParams.get("token") ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The VERIFIED account id for a socket, or undefined for a guest. Authoritative
   * over any client-claimed actorClientId (Phase 2): the engine binds a signed-in
   * actor to their seat by this id, so a spoofed clientId can no longer act for a
   * verified seat. A verification failure degrades to guest, never throws.
   */
  private async verifiedUserId(connection: Party.Connection): Promise<string | undefined> {
    const verify = this.verifier();
    if (!verify) {
      return undefined;
    }
    const identity = await verify(this.tokenOf(connection));
    return identity?.userId;
  }

  /**
   * Whether the socket's verified session belongs to a PLATFORM ADMIN. Resolved
   * from the same token callback as the seat identity, so a spoofed clientId
   * cannot claim it. Lets an admin close/reset ANY room over the edge, matching
   * the built-in backend (which reads the role from the session cookie). False
   * for a guest, an ordinary player, or when no app URL is configured.
   */
  private async verifiedIsAdmin(connection: Party.Connection): Promise<boolean> {
    const verify = this.verifier();
    if (!verify) {
      return false;
    }
    return (await verify(this.tokenOf(connection)))?.isAdmin === true;
  }

  async onStart(): Promise<void> {
    this.snapshot = (await this.room.storage.get<RoomSnapshot>(SNAPSHOT_KEY)) ?? null;
  }

  private makeState(options: RoomResetOptions = {}): GameState {
    // Crypto entropy (freshEntropy), not Date.now()+Math.random(): PartyKit runs
    // each room as a Cloudflare Durable Object where the clock can be frozen and
    // Math.random() seeded per isolate, which made every fresh room (new game in
    // a new window) open on the identical map and Creature Bank order.
    const nonce = freshEntropy();
    const seed = `room-${this.room.id}-${nonce}`;
    const mode = options.mode ?? "adventure";

    if (mode === "combat-sandbox") {
      return createCombatSandboxLobbyState(seed);
    }

    return options.players?.length
      ? createAdventureGameState({
          seed,
          difficulty: options.difficulty,
          scenarioId: options.scenarioId,
          players: options.players,
          sessionMode: options.sessionMode,
          computerOpponents: options.computerOpponents
        })
      : createAdventureLobbyState({ seed, scenarioId: options.scenarioId, sessionMode: options.sessionMode,
          computerOpponents: options.computerOpponents });
  }

  private ensureSnapshot(): RoomSnapshot {
    if (!this.snapshot) {
      const now = new Date().toISOString();
      this.snapshot = {
        roomId: this.room.id,
        version: 1,
        createdAt: now,
        updatedAt: now,
        state: this.makeState()
      };
      void this.persist();
    }

    return this.snapshot;
  }

  /**
   * Reset options with the single-player session rules applied:
   * — preservation: a single-player room's "New adventure" stays single-player
   *   with the same computer-seat count unless the caller explicitly overrides
   *   the mode (plan §4.4);
   * — fresh-room-only creation: a reset may INTRODUCE single-player mode only
   *   over a memberless, unstarted setup lobby (the implicit-creation flow).
   *   An established room can never be flipped into a private single-player
   *   one by a later client — the marker is silently dropped instead.
   */
  private resetOptionsFor(previous: RoomSnapshot, options: RoomResetOptions): RoomResetOptions {
    const prev = previous.state;
    if (sessionModeOf(prev) === "single-player") {
      if (options.sessionMode !== undefined) {
        return options;
      }
      return {
        ...options,
        sessionMode: "single-player",
        computerOpponents: options.computerOpponents ?? Math.max(1, configuredComputerOpponents(prev))
      };
    }
    if (options.sessionMode === "single-player") {
      const fresh =
        prev.phase === "setup" && Boolean(prev.setupLobby) && (prev.room?.members.length ?? 0) === 0;
      if (!fresh) {
        return { ...options, sessionMode: undefined, computerOpponents: undefined };
      }
    }
    return options;
  }

  private async persist(): Promise<void> {
    if (this.snapshot) {
      await this.room.storage.put(SNAPSHOT_KEY, this.snapshot);
    }
  }

  /**
   * Creation identity carried across every new snapshot version: the original
   * `createdAt`, plus `createdByName` captured the first time the room has a
   * member (the lobby's creator attribution, since the edge has no separate
   * "create" call that could pass it). Read from the CURRENT snapshot, which is
   * still the previous version while a new one is being built.
   */
  private creationMeta(state: GameState): { createdAt?: string; createdByName?: string } {
    const createdAt = this.snapshot?.createdAt;
    let createdByName = this.snapshot?.createdByName;
    if (!createdByName) {
      const firstMember = state.room?.members[0];
      if (firstMember?.name) {
        createdByName = firstMember.name;
      }
    }
    return {
      ...(createdAt ? { createdAt } : {}),
      ...(createdByName ? { createdByName } : {})
    };
  }

  /** Directory-record signature last reported to the lobby (skip-if-unchanged). */
  private lastReportedSignature: string | null = null;
  /** `updatedAt` of the last record reported (for the throttled activity refresh). */
  private lastReportedAt: string | null = null;

  /**
   * Report this room to the lobby Durable Object so it shows up in (and updates
   * within) the room browser. Fires when a directory-relevant field changed OR
   * — while the room is still being played — when the last report's stamp has
   * aged past the activity-refresh interval (see {@link lobbyReportIsDue}), so
   * ordinary game actions don't spam the lobby yet an active game keeps a fresh
   * `updatedAt` and is never idle-pruned mid-game. Best-effort: a failed report
   * is retried on the next change, and a missing lobby party (e.g. local
   * single-room dev) is simply a no-op.
   */
  private async reportToLobby(): Promise<void> {
    const snapshot = this.snapshot;
    const lobby = this.room.context?.parties?.lobby;
    if (!snapshot || !lobby) {
      return;
    }
    if (isPrivateSinglePlayer(snapshot.state)) {
      await this.deregisterFromLobby();
      return;
    }
    const record = deriveLobbyRecord({
      roomId: this.room.id,
      state: snapshot.state,
      createdAt: snapshot.createdAt ?? snapshot.updatedAt,
      updatedAt: snapshot.updatedAt,
      createdByName: snapshot.createdByName ?? null
    });
    const signature = lobbyRecordSignature(record);
    if (!lobbyReportIsDue(this.lastReportedSignature, signature, this.lastReportedAt, snapshot.updatedAt)) {
      return;
    }
    this.lastReportedSignature = signature;
    this.lastReportedAt = snapshot.updatedAt;
    try {
      await lobby.get(LOBBY_SINGLETON_ID).fetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
    } catch {
      // Let the next change retry rather than going permanently silent.
      this.lastReportedSignature = null;
      this.lastReportedAt = null;
    }
  }

  /** Remove this room from the lobby directory when it is closed. */
  private async deregisterFromLobby(): Promise<void> {
    const lobby = this.room.context?.parties?.lobby;
    this.lastReportedSignature = null;
    this.lastReportedAt = null;
    if (!lobby) {
      return;
    }
    try {
      await lobby.get(LOBBY_SINGLETON_ID).fetch({
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: this.room.id })
      });
    } catch {
      // Best effort; the lobby also expires empty rooms after the TTL.
    }
  }

  /**
   * Stamp this server's engine signature onto an outgoing snapshot. Done at
   * send time (not persisted) so a snapshot stored by an older deploy is
   * always re-broadcast with the *running* server's signature.
   */
  private signed(snapshot: RoomSnapshot): RoomSnapshot {
    return { ...snapshot, serverSignature: ENGINE_SIGNATURE };
  }

  /**
   * Developer override for destructive room ops: a request carrying the
   * deployment's HOMM3BG_ADMIN_KEY (PartyKit env var) may reset or close ANY
   * table. With no key configured the override does not exist — an empty or
   * missing env never matches anything.
   */
  private adminAuthorizes(adminKey: string | undefined): boolean {
    const env = (this.room as unknown as { env?: Record<string, unknown> }).env;
    const configured = typeof env?.HOMM3BG_ADMIN_KEY === "string" ? env.HOMM3BG_ADMIN_KEY : "";
    return configured.length > 0 && adminKey === configured;
  }

  /** Whether the given clientId currently holds a live socket on this room. */
  private isClientConnected(clientId: string | null): boolean {
    if (!clientId) {
      return false;
    }
    for (const connection of this.room.getConnections()) {
      if (this.clientIdOf(connection) === clientId) {
        return true;
      }
    }
    return false;
  }

  /**
   * The clientIds currently holding a live socket on this room (for
   * RECLAIM_HOST). Called on every action, so it degrades gracefully if the
   * runtime cannot enumerate connections — an unknown live set just means host
   * recovery cannot verify the host is present (treated as absent), never a
   * crashed action.
   */
  private liveClientIds(): string[] {
    const ids: string[] = [];
    const getConnections = (this.room as { getConnections?: () => Iterable<Party.Connection> | undefined })
      .getConnections;
    const connections = typeof getConnections === "function" ? getConnections.call(this.room) : undefined;
    if (!connections || typeof (connections as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
      return ids;
    }
    for (const connection of connections) {
      const clientId = this.clientIdOf(connection);
      if (clientId && !ids.includes(clientId)) {
        ids.push(clientId);
      }
    }
    return ids;
  }

  /**
   * Mirrors the store's authorizeHostedWipe for the two destructive room ops
   * (reset and close) — both wipe the running game for every seat. HOSTED
   * room: the host always may; any MEMBER may while the host holds no live
   * socket (per-tab client ids die with the browser, so a restarted host must
   * not strand the table); a stranger never may. An OPEN table has no
   * ownership to protect, so anyone may.
   */
  private hostAuthorizes(actorClientId: string | undefined, verb: "reset" | "close"): { allowed: boolean; reason?: string } {
    const room = this.snapshot?.state.room ?? null;
    if (!room?.hosted) {
      // Open table: no ownership to protect.
      return { allowed: true };
    }
    if (actorClientId && actorClientId === room.hostClientId) {
      return { allowed: true };
    }
    const isMember = Boolean(actorClientId) && room.members.some((member) => member.clientId === actorClientId);
    if (!isMember) {
      return { allowed: false, reason: `Only members of this room can ${verb} it.` };
    }
    if (this.isClientConnected(room.hostClientId)) {
      return { allowed: false, reason: `Only the host can ${verb} this room while the host is connected.` };
    }
    return { allowed: true };
  }

  private authorizeClose(actorClientId: string | undefined, adminKey?: string, isAdmin = false): CloseRoomResult {
    // A verified platform admin (from the socket ticket) or the developer's
    // admin key may close ANY room, exactly like the built-in backend.
    if (isAdmin || this.adminAuthorizes(adminKey)) {
      return { closed: true };
    }
    const authority = this.hostAuthorizes(actorClientId, "close");
    return authority.allowed ? { closed: true } : { closed: false, reason: authority.reason };
  }

  /**
   * A signed snapshot redacted to ONE actor's own seat (Phase 2,
   * per-connection redaction). On a hosted room a devtools reader on the socket
   * never sees another seat's hidden info; an open table keeps the full shared
   * frame (the client redacts locally), so it stays the O(1) fast path.
   */
  private redactSnapshotForActor(signed: RoomSnapshot, actor: { clientId?: string; userId?: string }): RoomSnapshot {
    const room = signed.state.room;
    if (!room?.hosted) {
      return signed;
    }
    const seat = seatForViewer(signed.state, actor);
    const viewer = seat === "observer" ? OBSERVER_VIEWER_SEAT : seat;
    // Stamp which seat this frame is redacted for, so the client can accept a
    // seat-correct frame that follows an observer frame at the SAME version
    // (the post-reconnect redaction refresh) without weakening its version gate.
    return { ...signed, viewerSeat: viewer, state: redactStateForSeat(signed.state, viewer) };
  }

  /** The signed snapshot redacted to one live socket's seat. */
  private async snapshotForConnection(connection: Party.Connection): Promise<RoomSnapshot> {
    const userId = await this.verifiedUserId(connection);
    // Re-read AFTER the await: another event may have advanced (or re-created)
    // the snapshot while the token verification round-trip was in flight.
    return this.redactSnapshotForActor(this.signed(this.ensureSnapshot()), {
      clientId: this.clientIdOf(connection),
      userId
    });
  }

  /** The verified account id for an HTTP request's `?token=`, or undefined. */
  private async verifiedUserIdFromRequest(request: Party.Request): Promise<string | undefined> {
    const verify = this.verifier();
    if (!verify) {
      return undefined;
    }
    try {
      const token = new URL(request.url).searchParams.get("token") ?? undefined;
      return (await verify(token))?.userId;
    } catch {
      return undefined;
    }
  }

  /**
   * Whether an HTTP request's `?token=` belongs to a PLATFORM ADMIN. Backs the
   * admin panel's "Delete" on the edge: the admin is a stranger to the hosted
   * room, so only this role bypass lets them close it. False on any failure.
   */
  private async verifiedIsAdminFromRequest(request: Party.Request): Promise<boolean> {
    const verify = this.verifier();
    if (!verify) {
      return false;
    }
    try {
      const token = new URL(request.url).searchParams.get("token") ?? undefined;
      return (await verify(token))?.isAdmin === true;
    } catch {
      return false;
    }
  }

  private async broadcastSnapshot(): Promise<void> {
    const startedAt = Date.now();
    if (!this.snapshot) {
      return;
    }
    const room = this.snapshot.state.room;
    if (!room?.hosted) {
      // Open table: one shared frame to everyone (the client redacts locally).
      const frame = JSON.stringify({ type: "snapshot", snapshot: this.signed(this.snapshot) });
      this.room.broadcast(frame);
      this.metric("room.broadcast", startedAt, {
        connections: this.connectionCount(),
        hosted: false,
        bytes: new TextEncoder().encode(frame).byteLength
      });
      return;
    }
    // Hosted: each socket gets a frame redacted to its own seat.
    for (const connection of this.room.getConnections()) {
      const redactStartedAt = Date.now();
      const snapshot = await this.snapshotForConnection(connection);
      this.metric("room.redaction", redactStartedAt, { version: snapshot.version });
      const serializeStartedAt = Date.now();
      const frame = JSON.stringify({ type: "snapshot", snapshot } satisfies ServerMessage);
      connection.send(frame);
      this.metric("room.serialization", serializeStartedAt, {
        version: snapshot.version,
        bytes: new TextEncoder().encode(frame).byteLength
      });
    }
    this.metric("room.broadcast", startedAt, { connections: this.connectionCount(), hosted: true });
  }

  /**
   * Single-player paced computer turns. Durable Object alarms survive
   * hibernation (setTimeout does not with `hibernate: true`). Each alarm tick
   * applies ONE computer action, broadcasts, and re-arms until the human owns
   * the next decision — so the human watches move → roll → reward → move.
   */
  private async scheduleComputerPump(delayMs: number): Promise<void> {
    try {
      await this.room.storage.setAlarm(Date.now() + Math.max(0, delayMs));
    } catch (error) {
      console.warn("[computer-runner] failed to arm computer alarm", error);
    }
  }

  /**
   * Arm the pump only when NO alarm is already pending — the self-heal path
   * (onConnect) must never postpone a due tick by overwriting it.
   */
  private async ensureComputerPump(delayMs: number): Promise<void> {
    try {
      const pending = await this.room.storage.getAlarm();
      if (pending !== null && pending !== undefined) {
        return;
      }
    } catch {
      // getAlarm unavailable (old runtime/mock): fall through and arm.
    }
    await this.scheduleComputerPump(delayMs);
  }

  /** Retry pace after a FAILED alarm tick — slower than a normal step so a
   *  persistent fault (storage hiccup, throwing socket) can never hot-loop. */
  private static readonly COMPUTER_PUMP_RETRY_MS = 5_000;

  async onAlarm(): Promise<void> {
    try {
      await this.runComputerPumpTick();
    } catch (error) {
      // A failed tick (a storage/broadcast hiccup) must NOT kill the pump
      // chain: Cloudflare retries a throwing alarm only a few times before
      // giving up, and a lost alarm used to freeze the AI turn until a page
      // reload. Log and re-arm at a gentle retry pace instead — the
      // onMessage/onConnect/GET self-heals remain the backstop.
      console.warn(
        `[computer-runner] alarm tick failed in room ${this.snapshot?.roomId ?? "unknown"}; re-arming`,
        error,
      );
      if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
        await this.scheduleComputerPump(GameRoomServer.COMPUTER_PUMP_RETRY_MS);
      }
    }
  }

  private async runComputerPumpTick(): Promise<void> {
    const continuePump = await this.serialized(async () => {
      const current = this.snapshot;
      if (!current || !computerPumpOwed(current.state)) {
        return false;
      }
      const before = current.state;
      const run = settleComputerVisibleStep(before);
      if (run.decisions.length === 0) {
        // Pump was owed (computerPumpOwed above) yet produced nothing: a genuine
        // stall. Single-player rooms have no turn-clock/AFK recovery, so log it
        // rather than freezing the table silently.
        if (run.stalled) {
          console.warn(
            `[computer-runner] alarm stall in room ${current.roomId}: ${run.reason ?? "no safe legal action"}`,
          );
        }
        return false;
      }
      this.snapshot = {
        // PartyKit THROWS on `this.room.id` inside onAlarm ("You can not access
        // `Party.id` in the `onAlarm` handler") — reading it here crashed every
        // alarm tick, killing the paced computer pump after its first step and
        // freezing the AI turn. The snapshot already carries the room id.
        roomId: current.roomId,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
        ...this.creationMeta(run.state),
        state: run.state,
      };
      await this.persist();
      await this.broadcastSnapshot();
      // Match report may fire mid-computer-turn (last faction standing, etc.).
      void this.reportFinishedMatchToApp(before, run.state);
      return computerPumpOwed(run.state);
    });
    if (continuePump && this.snapshot) {
      await this.scheduleComputerPump(computerStepDelayMs(this.snapshot.state));
    }
  }

  onConnect(connection: Party.Connection): void {
    // Single-player creation (plan §5.1): the creating browser's FIRST
    // connection carries ?singlePlayer=<count> on the socket URL. Honored only
    // while NO snapshot exists at all — a fresh, memberless, unconfigured
    // room — so a later connection can never flip an established room. The
    // state is single-player (hence private) before reportToLobby below can
    // run, so not even a momentary public directory record exists.
    if (!this.snapshot) {
      const opponents = this.singlePlayerCreationOf(connection);
      if (opponents !== null) {
        const now = new Date().toISOString();
        this.snapshot = {
          roomId: this.room.id,
          version: 1,
          createdAt: now,
          updatedAt: now,
          state: this.makeState({ sessionMode: "single-player", computerOpponents: opponents })
        };
        void this.persist();
      }
    }
    this.ensureSnapshot();
    // Send the initial frame SYNCHRONOUSLY so it always precedes later messages.
    // The just-attached socket has not verified an identity or run its JOIN yet,
    // so a HOSTED room's first frame is the zero-trust OBSERVER view (it leaks
    // nothing); the client's JOIN then triggers a broadcast redacted to its
    // VERIFIED seat. An open table sends the full shared frame as before.
    const room = this.snapshot!.state.room;
    const snapshot = room?.hosted
      ? {
          ...this.signed(this.snapshot!),
          viewerSeat: OBSERVER_VIEWER_SEAT,
          state: redactStateForSeat(this.snapshot!.state, OBSERVER_VIEWER_SEAT)
        }
      : this.signed(this.snapshot!);
    connection.send(JSON.stringify({ type: "snapshot", snapshot } satisfies ServerMessage));
    if (room?.hosted) {
      // Follow up with the frame redacted to the socket's ACTUAL seat once its
      // identity resolves. An automatic reconnect never re-sends JOIN_ROOM, so
      // without this a seated player who reconnected mid-game would stay stuck
      // on the zero-trust observer frame above — no hand, no pending-Event
      // steps, and (during a round-start barrier) a table frozen for everyone.
      void this.sendSeatFrame(connection);
    }
    // A connection means the room exists — surface it in the lobby. The
    // JOIN_ROOM that follows re-reports reliably (awaited) once it has a member.
    void this.reportToLobby();
    // Self-heal the paced computer pump: if a computer seat still owes a
    // decision but no alarm is pending (a crashed alarm tick, an evicted
    // object, a pre-fix deploy), re-arm it so a reconnecting/reloading human
    // never finds the AI frozen mid-turn with no action able to revive it.
    if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
      void this.ensureComputerPump(computerStepDelayMs(this.snapshot.state));
    }
  }

  /** Push the current snapshot, redacted to one socket's verified seat. */
  private async sendSeatFrame(connection: Party.Connection): Promise<void> {
    try {
      const snapshot = await this.snapshotForConnection(connection);
      connection.send(JSON.stringify({ type: "snapshot", snapshot } satisfies ServerMessage));
    } catch {
      // Best effort — the client's sync / polling paths keep retrying.
    }
  }

  /** The stable per-tab client id the browser put on the socket URL, if any. */
  private clientIdOf(connection: Party.Connection): string | undefined {
    // `connection.uri` is the URL that opened the socket (it survives
    // hibernation, unlike a per-instance map), and carries the `?clientId=` the
    // client attaches in src/lib/realtime.ts. Read defensively so a narrower
    // Party.Connection type never breaks the typecheck.
    const uri = (connection as unknown as { uri?: string }).uri;
    if (!uri) {
      return undefined;
    }
    try {
      return new URL(uri).searchParams.get("clientId") ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The `?singlePlayer=<computer count>` creation marker on the socket URL the
   * creating browser opened (see createSinglePlayerRoom in src/lib/realtime.ts).
   * Consumed by onConnect on a room with no snapshot at all; every other
   * connection ignores it.
   */
  private singlePlayerCreationOf(connection: Party.Connection): number | null {
    const uri = (connection as unknown as { uri?: string }).uri;
    if (!uri) {
      return null;
    }
    try {
      const raw = new URL(uri).searchParams.get("singlePlayer");
      if (!raw) {
        return null;
      }
      const count = Math.floor(Number(raw));
      // The seat cap is enforced again by scenario capacity in the engine.
      return Number.isFinite(count) && count >= 1 ? Math.min(count, 11) : null;
    } catch {
      return null;
    }
  }

  /**
   * A socket dropped (tab closed, navigated back to the lobby, or the network
   * died). Reap that client's ephemeral membership — an unseated spectator or an
   * open-table member — so one computer isn't counted as many after it joins,
   * leaves and rejoins. A SEATED player in a hosted game (and the host) is never
   * reaped, so a transient reconnect never unseats them or hands their turn /
   * choices to anyone else. Only re-broadcasts when the member list changed.
   */
  private async handleDisconnect(connection: Party.Connection): Promise<void> {
    const clientId = this.clientIdOf(connection);
    if (!clientId) {
      return;
    }
    // Serialized with the action pipeline: the reap is a read-modify-write of
    // the snapshot, and racing it against an in-flight action could publish
    // two different snapshots under the same version.
    const changed = await this.serialized(async () => {
      if (!this.snapshot || !dropDisconnectedMember(this.snapshot.state, clientId)) {
        return false;
      }
      this.snapshot = {
        ...this.snapshot,
        version: this.snapshot.version + 1,
        updatedAt: new Date().toISOString()
      };
      await this.persist();
      await this.broadcastSnapshot();
      return true;
    });
    if (changed) {
      await this.reportToLobby();
    }
  }

  async onClose(connection: Party.Connection): Promise<void> {
    // Fires for every closure (a clean close and after an error alike), so it is
    // the single place to reap a dropped client's ephemeral membership.
    await this.handleDisconnect(connection);
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): Promise<void> {
    const parseStartedAt = Date.now();
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMessage;
    } catch {
      return;
    }
    this.metric("room.message.parse", parseStartedAt, { type: message.type });

    // ANY client traffic (ping, sync, action…) self-heals a lost computer
    // pump: if a computer seat owes a decision but no alarm is pending (a
    // crashed/expired alarm chain, a pre-fix deploy), re-arm it — so a frozen
    // AI turn revives on the next health ping instead of needing a page
    // reload. ensureComputerPump never postpones an already-pending tick.
    if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
      void this.ensureComputerPump(computerStepDelayMs(this.snapshot.state));
    }

    if (message.type === "ping") {
      const userId = await this.verifiedUserId(sender);
      const snapshot = this.ensureSnapshot();
      const viewerSeat = snapshot.state.room?.hosted
        ? seatForViewer(snapshot.state, { clientId: this.clientIdOf(sender), userId })
        : undefined;
      const reply: ServerMessage = {
        type: "pong",
        version: snapshot.version,
        ...(viewerSeat ? { viewerSeat } : {})
      };
      sender.send(JSON.stringify(reply));
      return;
    }

    if (message.type === "sync") {
      this.ensureSnapshot();
      const reply: ServerMessage = { type: "snapshot", snapshot: await this.snapshotForConnection(sender) };
      sender.send(JSON.stringify(reply));
      return;
    }

    if (message.type === "reset") {
      // Same authority as close: host while connected, any member once the
      // host is gone, a verified platform admin (socket ticket) or the
      // developer's admin key always. The socket's own ?clientId= identity
      // backs up the message field. Identity resolves BEFORE the lock (it may
      // fetch); the snapshot read-modify-write runs inside it.
      const isAdmin = this.adminAuthorizes(message.adminKey) || (await this.verifiedIsAdmin(sender));
      const deniedReason = await this.serialized(async () => {
        const previous = this.ensureSnapshot();
        if (!isAdmin) {
          const actor = message.actorClientId ?? this.clientIdOf(sender);
          if (resetVoteRequired(previous.state)) {
            // In-progress multiplayer adventure: the unanimous "new adventure"
            // vote, fired by the browser that opened it, may wipe the running
            // game. The HOST of a hosted room may ALSO start it directly (host
            // override) — the escape hatch so a stuck vote (a player who left
            // but is not eliminated, a solo-host test) is never a dead end. An
            // OPEN table has no host, so it still needs the vote.
            const hostOverride =
              Boolean(previous.state.room?.hosted) && this.hostAuthorizes(actor, "reset").allowed;
            if (!resetVoteAuthorizes(previous.state, actor) && !hostOverride) {
              return "Everyone still in the game must confirm a new adventure — or the host can start it.";
            }
          } else {
            const authority = this.hostAuthorizes(actor, "reset");
            if (!authority.allowed) {
              return authority.reason ?? "Only the host can reset this room.";
            }
          }
        }
        const state = this.makeState(this.resetOptionsFor(previous, message));
        // Carry room membership (host, seats, observers) across a game reset.
        state.room = previous.state.room ?? null;
        this.snapshot = {
          roomId: this.room.id,
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
          ...this.creationMeta(state),
          state
        };
        await this.persist();
        await this.broadcastSnapshot();
        return null;
      });
      if (deniedReason) {
        // Refused: the room is untouched; tell the sender (only) why.
        const reply: ServerMessage = { type: "reset-denied", reason: deniedReason };
        sender.send(JSON.stringify(reply));
        return;
      }
      await this.reportToLobby();
      return;
    }

    if (message.type === "action") {
      // Resolve the sender's VERIFIED account id from the token on its socket
      // (Phase 2). Authoritative over the claimed actorClientId — a spoofed id
      // can no longer act for a signed-in player's seat. Undefined for guests.
      // Resolved BEFORE the mutation lock: the verification may fetch, and the
      // room must stay serialized-but-responsive while it does.
      const actorUserId = await this.verifiedUserId(sender);
      const senderClientId = message.actorClientId ?? this.clientIdOf(sender);
      const dedupeKey = message.requestId
        ? `${actorUserId ?? senderClientId ?? sender.id}:${message.requestId}`
        : null;
      const outcome = await this.serialized(async () => {
        const current = this.ensureSnapshot();
        // A requestId this room already answered is a duplicate frame (client
        // retry / double-send): reply with the recorded outcome, apply nothing.
        const answered = dedupeKey ? this.answeredActionRequests.get(dedupeKey) : undefined;
        if (answered) {
          return { ...answered, applied: false, prev: null as GameState | null };
        }
        const applyStartedAt = Date.now();
        const result = applyAction(current.state, message.action, {
          // Fresh crypto entropy per action makes every die roll, shuffle and Ⅱ–Ⅲ
          // tile flip genuinely unpredictable and non-reproducible (true random),
          // not derivable from the game seed (see random.ts).
          entropy: freshEntropy(),
          // Server wall clock: the AFK vote-kick's only time source (idle
          // stamps + the 10-minute idle/re-ask gates).
          now: Date.now(),
          // Live-socket set for this room: RECLAIM_HOST refuses while the host
          // is still connected (host-recovery mirror of the reset/close rule).
          liveClientIds: this.liveClientIds(),
          ...(message.actorClientId ? { actorClientId: message.actorClientId } : {}),
          ...(actorUserId ? { actorUserId } : {})
        });
        this.metric("room.action.apply", applyStartedAt, { actionType: message.action.type });
        const errors = result.errors.map((error) => ({ code: error.code, message: error.message }));
        const notices = result.events
          .filter((event) => event.type === "SPELL_CAST_REFUNDED")
          .map((event) => event.reason);
        if (result.errors.length > 0) {
          const rejected = { errors, notices, version: current.version };
          if (dedupeKey) this.recordAnsweredRequest(dedupeKey, rejected);
          return { ...rejected, applied: false, prev: null as GameState | null };
        }
        // A passed AFK kick vote or an expired 10-minute turn: drive the forced
        // resolution through the normal action pipeline until it settles (or
        // the table must wait). ADVANCE_COMPUTER = one human-confirmed map beat;
        // other actions: setup bulk / PvP one auto beat; map never races ahead.
        const afkSettled = forcedResolutionPending(result.state)
          ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
          : result.state;
        const settled =
          message.action.type === "ADVANCE_COMPUTER"
            ? applyHumanComputerAdvance(afkSettled).state
            : settleComputerForLiveAction(afkSettled);
        this.snapshot = {
          roomId: this.room.id,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
          ...this.creationMeta(settled),
          state: settled
        };
        const persistStartedAt = Date.now();
        await this.persist();
        this.metric("room.storage.persist", persistStartedAt, { version: this.snapshot.version });
        await this.broadcastSnapshot();
        const accepted = { errors, notices, version: this.snapshot.version };
        if (dedupeKey) this.recordAnsweredRequest(dedupeKey, accepted);
        return {
          ...accepted,
          applied: true,
          prev: current.state,
          scheduleComputer: computerPumpOwed(settled),
          computerDelayMs: computerStepDelayMs(settled),
        };
      });

      if (outcome.applied && "scheduleComputer" in outcome && outcome.scheduleComputer) {
        await this.scheduleComputerPump(outcome.computerDelayMs ?? computerStepDelayMs(this.snapshot?.state as GameState));
      }

      const reply: ServerMessage = {
        type: "action-result",
        requestId: message.requestId,
        version: outcome.version,
        errors: outcome.errors,
        // Actor-only notices replace the old second full snapshot. The room
        // broadcast above remains the sole authoritative state frame.
        ...(outcome.notices.length > 0 ? { notices: outcome.notices } : {})
      };
      sender.send(JSON.stringify(reply));
      // Do not hold the initiating browser's action-result behind a lobby
      // registry round trip. The snapshot is already persisted + broadcast;
      // replying now lets local UI state (including discard selections) settle
      // immediately. Keep awaiting the best-effort directory report afterward
      // so the Durable Object remains alive until it finishes.
      if (outcome.applied && outcome.prev) {
        await this.reportToLobby();
        // Ranked-match auto-report (Phase 6): if this action just ended the
        // game, post the result to the app so seated verified accounts get
        // their win/loss + Elo. Awaited (not floated) so hibernation cannot
        // cancel it; failures are logged inside and never break the action.
        // Read the SETTLED snapshot, not result.state — an AFK kick driven
        // right after this action may itself have ended the game.
        await this.reportFinishedMatchToApp(outcome.prev, this.snapshot?.state ?? outcome.prev);
      }
    }
  }

  /** Detect a just-finished ranked game and POST it to the app's report route. */
  private async reportFinishedMatchToApp(prev: GameState, next: GameState): Promise<void> {
    const match = detectFinishedMatch(prev, next);
    if (!match) {
      return;
    }
    const config = matchReportConfigOf(this.room);
    if (!config) {
      console.warn(
        `[match-report] game ${match.matchId} finished but HOMM3BG_APP_URL / HOMM3BG_MATCH_REPORT_KEY ` +
          "are not configured on the party — the result was NOT recorded."
      );
      // Still close a RANKED room even when the report key is missing — staying
      // open is what lets a rematch double-claim / skip MMR accounting.
      if (match.ranked) {
        await this.forceCloseAfterRankedMatch();
      }
      return;
    }
    try {
      const response = await fetch(`${config.appUrl}/api/matches/report`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-homm3bg-report-key": config.key },
        body: JSON.stringify(match)
      });
      if (!response.ok) {
        console.error(`[match-report] app rejected match ${match.matchId}: HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(`[match-report] failed to deliver match ${match.matchId}:`, error);
    }
    // RANKED only: close the table after a real attributed win/loss so rematch
    // cannot reuse seed/matchSeats. Casual / single-player / sandbox stay open.
    if (match.ranked) {
      await this.forceCloseAfterRankedMatch();
    }
  }

  /**
   * System force-close after a ranked match (no host gate). Broadcasts a final
   * closed snapshot, wipes storage, and deregisters from the lobby directory.
   */
  private async forceCloseAfterRankedMatch(): Promise<void> {
    await this.serialized(async () => {
      const closing = this.snapshot;
      if (closing) {
        const message: ServerMessage = {
          type: "snapshot",
          snapshot: this.signed({ ...closing, closed: true })
        };
        this.room.broadcast(JSON.stringify(message));
      }
      this.snapshot = null;
      try {
        await this.room.storage.delete(SNAPSHOT_KEY);
        await this.room.storage.deleteAlarm();
      } catch (error) {
        console.error(`[room] ranked force-close storage wipe failed:`, error);
      }
    });
    await this.deregisterFromLobby();
    console.log(`[room] force-closed ${this.room.id}: ranked match finished`);
  }

  /**
   * Plain HTTP access to the same room (reset, snapshot polling, debugging).
   * The Next.js app is almost always served from a different origin than this
   * `*.partykit.dev` host, so every browser request here is cross-origin: we
   * must answer the CORS pre-flight and stamp the allow-origin header, or the
   * browser blocks the response and the caller sees "Could not reset the
   * room." (The WebSocket has no such restriction, which is why live play
   * works while the HTTP reset fails.)
   */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      // Redact the snapshot to the requesting client's seat (Phase 2). The
      // browser attaches `?clientId=` (+ optional `?token=`) so a cross-origin
      // poll / initial load leaks no opponent hidden info, mirroring the socket.
      // The snapshot is read AFTER the async verification, so the reply always
      // reflects whatever concurrent events landed during the round-trip.
      const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
      const userId = await this.verifiedUserIdFromRequest(request);
      const snapshot = this.redactSnapshotForActor(this.signed(this.ensureSnapshot()), { clientId, userId });
      void this.reportToLobby();
      // The client's http-recovery poll self-heals a lost computer pump too
      // (same rule as onMessage/onConnect): re-arm only when no alarm pends.
      if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
        void this.ensureComputerPump(computerStepDelayMs(this.snapshot.state));
      }
      return jsonWithCors(snapshot);
    }

    if (request.method === "DELETE") {
      const body = (await request.json().catch(() => null)) as
        | { actorClientId?: string; adminKey?: string }
        | null;
      const isAdmin = await this.verifiedIsAdminFromRequest(request);
      const result = this.authorizeClose(body?.actorClientId, body?.adminKey, isAdmin);
      if (!result.closed) {
        return jsonWithCors(result, 403);
      }
      // Tell everyone still connected the room is gone, then wipe its storage.
      // Serialized so an in-flight action can never resurrect the snapshot by
      // writing after the wipe.
      await this.serialized(async () => {
        const closing = this.snapshot;
        if (closing) {
          const message: ServerMessage = { type: "snapshot", snapshot: this.signed({ ...closing, closed: true }) };
          this.room.broadcast(JSON.stringify(message));
        }
        this.snapshot = null;
        await this.room.storage.delete(SNAPSHOT_KEY);
      });
      // Drop it from the lobby directory too, so the room browser stops listing it.
      await this.deregisterFromLobby();
      return jsonWithCors(result);
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | ({ reset?: boolean; actorClientId?: string; adminKey?: string } & RoomResetOptions)
        | { action?: GameAction; actorClientId?: string }
        | null;

      if (body && "reset" in body && body.reset) {
        // Same authority as DELETE: host while connected, member once the
        // host is gone, a verified platform admin (?token=) or the developer's
        // admin key always. Identity resolves before the mutation lock.
        const isAdmin = this.adminAuthorizes(body.adminKey) || (await this.verifiedIsAdminFromRequest(request));
        const resetOutcome = await this.serialized(async () => {
          const previous = this.ensureSnapshot();
          if (!isAdmin) {
            const authority = this.hostAuthorizes(
              "actorClientId" in body ? body.actorClientId : undefined,
              "reset"
            );
            if (!authority.allowed) {
              return { denied: authority.reason ?? "Only the host can reset this room.", snapshot: previous };
            }
          }
          const state = this.makeState(this.resetOptionsFor(previous, body));
          // Carry room membership (host, seats, observers) across a game reset.
          state.room = previous.state.room ?? null;
          this.snapshot = {
            roomId: this.room.id,
            version: previous.version + 1,
            updatedAt: new Date().toISOString(),
            ...this.creationMeta(state),
            state
          };
          await this.persist();
          await this.broadcastSnapshot();
          return { denied: null, snapshot: this.snapshot };
        });
        if (resetOutcome.denied) {
          return jsonWithCors({ reason: resetOutcome.denied }, 403);
        }
        await this.reportToLobby();
        return jsonWithCors(
          this.redactSnapshotForActor(this.signed(this.snapshot ?? resetOutcome.snapshot), {
            clientId: "actorClientId" in body ? body.actorClientId : undefined
          })
        );
      }

      if (body && "action" in body && body.action) {
        const actorClientId = "actorClientId" in body ? body.actorClientId : undefined;
        const actorUserId = await this.verifiedUserIdFromRequest(request);
        const action = body.action;
        const outcome = await this.serialized(async () => {
          const current = this.ensureSnapshot();
          const result = applyAction(current.state, action, {
            entropy: freshEntropy(),
            now: Date.now(),
            liveClientIds: this.liveClientIds(),
            ...(actorClientId ? { actorClientId } : {}),
            ...(actorUserId ? { actorUserId } : {})
          });
          if (result.errors.length === 0) {
            // Mirrors the WebSocket path: ADVANCE_COMPUTER = one map beat;
            // otherwise setup bulk / PvP auto beat; map never races ahead.
            const afkSettled = forcedResolutionPending(result.state)
              ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
              : result.state;
            const settled =
              action.type === "ADVANCE_COMPUTER"
                ? applyHumanComputerAdvance(afkSettled).state
                : settleComputerForLiveAction(afkSettled);
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(settled),
              state: settled
            };
            await this.persist();
            await this.broadcastSnapshot();
            return {
              result,
              prev: current.state,
              applied: true,
              replyBase: this.snapshot ?? current,
              scheduleComputer: computerPumpOwed(settled),
              computerDelayMs: computerStepDelayMs(settled),
            };
          }
          return {
            result,
            prev: current.state,
            applied: false,
            replyBase: this.snapshot ?? current,
            scheduleComputer: false,
            computerDelayMs: 0,
          };
        });
        if (outcome.applied) {
          await this.reportToLobby();
          await this.reportFinishedMatchToApp(outcome.prev, this.snapshot?.state ?? outcome.prev);
          if (outcome.scheduleComputer) {
            await this.scheduleComputerPump(outcome.computerDelayMs);
          }
        }
        const redacted = this.redactSnapshotForActor(this.signed(this.snapshot ?? outcome.replyBase), {
          clientId: actorClientId,
          userId: actorUserId
        });
        // Redact result.state too (the full GameState) so the HTTP action
        // response leaks no opponent hidden info, matching the snapshot.
        return jsonWithCors({ snapshot: redacted, result: { ...outcome.result, state: redacted.state } });
      }

      this.ensureSnapshot();
      return jsonWithCors(this.redactSnapshotForActor(this.signed(this.snapshot!), {}));
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
}

/**
 * Open CORS for the room's HTTP endpoints. The payloads are public room
 * snapshots (no cookies or credentials), so a wildcard origin is safe and
 * lets the app work from any deploy host.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonWithCors(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

GameRoomServer satisfies Party.Worker;
