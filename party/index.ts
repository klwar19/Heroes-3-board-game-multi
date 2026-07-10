import type * as Party from "partykit/server";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  driveAfkDrop,
  dropDisconnectedMember,
  forcedResolutionPending,
  ENGINE_SIGNATURE,
  freshEntropy,
  OBSERVER_VIEWER_SEAT,
  redactStateForSeat,
  resetVoteAuthorizes,
  resetVoteRequired,
  seatForViewer,
  type AdventurePlayerConfig,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameState
} from "@/engine";
import { deriveLobbyRecord, lobbyRecordSignature, LOBBY_SINGLETON_ID } from "@/server/lobby-registry";
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
};

type ClientMessage =
  | { type: "action"; requestId?: string; action: GameAction; actorClientId?: string }
  | ({ type: "reset"; requestId?: string; actorClientId?: string; adminKey?: string } & RoomResetOptions)
  | { type: "sync" };

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
  const key = typeof env?.HOMM3BG_MATCH_REPORT_KEY === "string" ? env.HOMM3BG_MATCH_REPORT_KEY : "";
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
      errors: { code: string; message: string }[];
      snapshot: RoomSnapshot;
    }
  /** Sent only to a sender whose reset was REFUSED (host-authority rule). */
  | { type: "reset-denied"; reason: string };

const SNAPSHOT_KEY = "snapshot";

export default class GameRoomServer implements Party.Server {
  /** Snapshots persist across hibernation; connections re-sync on attach. */
  readonly options: Party.ServerOptions = { hibernate: true };

  private snapshot: RoomSnapshot | null = null;

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
    const next = this.mutationQueue.then(run, run);
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
  private answeredActionRequests = new Map<string, { code: string; message: string }[]>();

  private static readonly ANSWERED_REQUEST_CAP = 256;

  private recordAnsweredRequest(key: string, errors: { code: string; message: string }[]): void {
    if (this.answeredActionRequests.size >= GameRoomServer.ANSWERED_REQUEST_CAP) {
      const oldest = this.answeredActionRequests.keys().next().value;
      if (oldest !== undefined) {
        this.answeredActionRequests.delete(oldest);
      }
    }
    this.answeredActionRequests.set(key, errors);
  }

  constructor(readonly room: Party.Room) {}

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
      return createInitialGameState(seed);
    }

    return options.players?.length
      ? createAdventureGameState({
          seed,
          difficulty: options.difficulty,
          scenarioId: options.scenarioId,
          players: options.players
        })
      : createAdventureLobbyState({ seed, scenarioId: options.scenarioId });
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

  /**
   * Report this room to the lobby Durable Object so it shows up in (and updates
   * within) the room browser. Only fires when a directory-relevant field
   * changed since the last report, so ordinary game actions don't spam the
   * lobby. Best-effort: a failed report is retried on the next change, and a
   * missing lobby party (e.g. local single-room dev) is simply a no-op.
   */
  private async reportToLobby(): Promise<void> {
    const snapshot = this.snapshot;
    const lobby = this.room.context?.parties?.lobby;
    if (!snapshot || !lobby) {
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
    if (signature === this.lastReportedSignature) {
      return;
    }
    this.lastReportedSignature = signature;
    try {
      await lobby.get(LOBBY_SINGLETON_ID).fetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
    } catch {
      // Let the next change retry rather than going permanently silent.
      this.lastReportedSignature = null;
    }
  }

  /** Remove this room from the lobby directory when it is closed. */
  private async deregisterFromLobby(): Promise<void> {
    const lobby = this.room.context?.parties?.lobby;
    this.lastReportedSignature = null;
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
    if (!this.snapshot) {
      return;
    }
    const room = this.snapshot.state.room;
    if (!room?.hosted) {
      // Open table: one shared frame to everyone (the client redacts locally).
      this.room.broadcast(JSON.stringify({ type: "snapshot", snapshot: this.signed(this.snapshot) }));
      return;
    }
    // Hosted: each socket gets a frame redacted to its own seat.
    for (const connection of this.room.getConnections()) {
      const snapshot = await this.snapshotForConnection(connection);
      connection.send(JSON.stringify({ type: "snapshot", snapshot } satisfies ServerMessage));
    }
  }

  onConnect(connection: Party.Connection): void {
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
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMessage;
    } catch {
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
            // In-progress multiplayer adventure: only the unanimous "new
            // adventure" vote, fired by the browser that opened it, may wipe the
            // running game — even in a hosted room where it is not the host.
            if (!resetVoteAuthorizes(previous.state, actor)) {
              return "Everyone still in the game must confirm a new adventure first.";
            }
          } else {
            const authority = this.hostAuthorizes(actor, "reset");
            if (!authority.allowed) {
              return authority.reason ?? "Only the host can reset this room.";
            }
          }
        }
        const state = this.makeState(message);
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
          return { errors: answered, applied: false, prev: null as GameState | null, replyBase: current };
        }
        const result = applyAction(current.state, message.action, {
          // Fresh crypto entropy per action makes every die roll, shuffle and Ⅱ–Ⅲ
          // tile flip genuinely unpredictable and non-reproducible (true random),
          // not derivable from the game seed (see random.ts).
          entropy: freshEntropy(),
          // Server wall clock: the AFK vote-kick's only time source (idle
          // stamps + the 10-minute idle/re-ask gates).
          now: Date.now(),
          ...(message.actorClientId ? { actorClientId: message.actorClientId } : {}),
          ...(actorUserId ? { actorUserId } : {})
        });
        const errors = result.errors.map((error) => ({ code: error.code, message: error.message }));
        if (dedupeKey) {
          this.recordAnsweredRequest(dedupeKey, errors);
        }
        if (result.errors.length > 0) {
          return { errors, applied: false, prev: null as GameState | null, replyBase: current };
        }
        // A passed AFK kick vote or an expired 10-minute turn: drive the forced
        // resolution through the normal action pipeline until it settles (or
        // the table must wait).
        const settled = forcedResolutionPending(result.state)
          ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
          : result.state;
        this.snapshot = {
          roomId: this.room.id,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
          ...this.creationMeta(settled),
          state: settled
        };
        await this.persist();
        await this.broadcastSnapshot();
        return { errors, applied: true, prev: current.state, replyBase: this.snapshot };
      });

      const reply: ServerMessage = {
        type: "action-result",
        requestId: message.requestId,
        errors: outcome.errors,
        // Redact the reply to the ACTING sender's own seat — the initiator must
        // not receive opponents' hidden info in the action result either. Uses
        // the snapshot captured under the lock (falling back to it if the room
        // was closed meanwhile) so a concurrent close is never resurrected.
        snapshot: this.redactSnapshotForActor(this.signed(this.snapshot ?? outcome.replyBase), {
          clientId: senderClientId,
          userId: actorUserId
        })
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
          const state = this.makeState(body);
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
            ...(actorClientId ? { actorClientId } : {}),
            ...(actorUserId ? { actorUserId } : {})
          });
          if (result.errors.length === 0) {
            // A passed AFK kick vote or an expired turn: settle the forced
            // resolution before storing/reporting.
            const settled = forcedResolutionPending(result.state)
              ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
              : result.state;
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(settled),
              state: settled
            };
            await this.persist();
            await this.broadcastSnapshot();
          }
          return {
            result,
            prev: current.state,
            applied: result.errors.length === 0,
            replyBase: this.snapshot ?? current
          };
        });
        if (outcome.applied) {
          await this.reportToLobby();
          await this.reportFinishedMatchToApp(outcome.prev, this.snapshot?.state ?? outcome.prev);
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
