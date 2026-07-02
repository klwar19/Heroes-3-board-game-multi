import type * as Party from "partykit/server";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  dropDisconnectedMember,
  ENGINE_SIGNATURE,
  freshEntropy,
  type AdventurePlayerConfig,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameState
} from "@/engine";
import { deriveLobbyRecord, lobbyRecordSignature, LOBBY_SINGLETON_ID } from "@/server/lobby-registry";

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

  constructor(readonly room: Party.Room) {}

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

  private authorizeClose(actorClientId: string | undefined, adminKey?: string): CloseRoomResult {
    if (this.adminAuthorizes(adminKey)) {
      return { closed: true };
    }
    const authority = this.hostAuthorizes(actorClientId, "close");
    return authority.allowed ? { closed: true } : { closed: false, reason: authority.reason };
  }

  private broadcastSnapshot(): void {
    if (!this.snapshot) {
      return;
    }

    const message: ServerMessage = { type: "snapshot", snapshot: this.signed(this.snapshot) };
    this.room.broadcast(JSON.stringify(message));
  }

  onConnect(connection: Party.Connection): void {
    const message: ServerMessage = { type: "snapshot", snapshot: this.signed(this.ensureSnapshot()) };
    connection.send(JSON.stringify(message));
    // A connection means the room exists — surface it in the lobby. The
    // JOIN_ROOM that follows re-reports reliably (awaited) once it has a member.
    void this.reportToLobby();
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
    if (!this.snapshot) {
      return;
    }
    const clientId = this.clientIdOf(connection);
    if (!clientId || !dropDisconnectedMember(this.snapshot.state, clientId)) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      version: this.snapshot.version + 1,
      updatedAt: new Date().toISOString()
    };
    await this.persist();
    this.broadcastSnapshot();
    await this.reportToLobby();
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
      const reply: ServerMessage = { type: "snapshot", snapshot: this.signed(this.ensureSnapshot()) };
      sender.send(JSON.stringify(reply));
      return;
    }

    if (message.type === "reset") {
      const previous = this.ensureSnapshot();
      // Same authority as close: host while connected, any member once the
      // host is gone, the developer's admin key always. The socket's own
      // ?clientId= identity backs up the message field.
      if (!this.adminAuthorizes(message.adminKey)) {
        const authority = this.hostAuthorizes(message.actorClientId ?? this.clientIdOf(sender), "reset");
        if (!authority.allowed) {
          // Refused: the room is untouched; tell the sender (only) why.
          const reply: ServerMessage = {
            type: "reset-denied",
            reason: authority.reason ?? "Only the host can reset this room."
          };
          sender.send(JSON.stringify(reply));
          return;
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
      this.broadcastSnapshot();
      await this.reportToLobby();
      return;
    }

    if (message.type === "action") {
      const current = this.ensureSnapshot();
      const result = applyAction(current.state, message.action, {
        // Fresh crypto entropy per action makes every die roll, shuffle and Ⅱ–Ⅲ
        // tile flip genuinely unpredictable and non-reproducible (true random),
        // not derivable from the game seed (see random.ts).
        entropy: freshEntropy(),
        ...(message.actorClientId ? { actorClientId: message.actorClientId } : {})
      });

      if (result.errors.length === 0) {
        this.snapshot = {
          roomId: this.room.id,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
          ...this.creationMeta(result.state),
          state: result.state
        };
        await this.persist();
        this.broadcastSnapshot();
      }

      const reply: ServerMessage = {
        type: "action-result",
        requestId: message.requestId,
        errors: result.errors.map((error) => ({ code: error.code, message: error.message })),
        snapshot: this.signed(this.snapshot ?? current)
      };
      sender.send(JSON.stringify(reply));
      // Do not hold the initiating browser's action-result behind a lobby
      // registry round trip. The snapshot is already persisted + broadcast;
      // replying now lets local UI state (including discard selections) settle
      // immediately. Keep awaiting the best-effort directory report afterward
      // so the Durable Object remains alive until it finishes.
      if (result.errors.length === 0) {
        await this.reportToLobby();
      }
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
      const snapshot = this.signed(this.ensureSnapshot());
      void this.reportToLobby();
      return jsonWithCors(snapshot);
    }

    if (request.method === "DELETE") {
      const body = (await request.json().catch(() => null)) as
        | { actorClientId?: string; adminKey?: string }
        | null;
      const result = this.authorizeClose(body?.actorClientId, body?.adminKey);
      if (!result.closed) {
        return jsonWithCors(result, 403);
      }
      // Tell everyone still connected the room is gone, then wipe its storage.
      const closing = this.snapshot;
      if (closing) {
        const message: ServerMessage = { type: "snapshot", snapshot: this.signed({ ...closing, closed: true }) };
        this.room.broadcast(JSON.stringify(message));
      }
      this.snapshot = null;
      await this.room.storage.delete(SNAPSHOT_KEY);
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
        const previous = this.ensureSnapshot();
        // Same authority as DELETE: host while connected, member once the
        // host is gone, the developer's admin key always.
        if (!this.adminAuthorizes(body.adminKey)) {
          const authority = this.hostAuthorizes(
            "actorClientId" in body ? body.actorClientId : undefined,
            "reset"
          );
          if (!authority.allowed) {
            return jsonWithCors({ reason: authority.reason }, 403);
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
        this.broadcastSnapshot();
        await this.reportToLobby();
        return jsonWithCors(this.signed(this.snapshot));
      }

      if (body && "action" in body && body.action) {
        const current = this.ensureSnapshot();
        const result = applyAction(current.state, body.action, {
          entropy: freshEntropy(),
          ...("actorClientId" in body && body.actorClientId ? { actorClientId: body.actorClientId } : {})
        });
        if (result.errors.length === 0) {
          this.snapshot = {
            roomId: this.room.id,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
            ...this.creationMeta(result.state),
            state: result.state
          };
          await this.persist();
          this.broadcastSnapshot();
          await this.reportToLobby();
        }
        return jsonWithCors({ snapshot: this.signed(this.snapshot ?? current), result });
      }

      return jsonWithCors(this.signed(this.ensureSnapshot()));
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
