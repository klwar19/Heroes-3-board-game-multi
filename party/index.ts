import type * as Party from "partykit/server";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
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
  | ({ type: "reset"; requestId?: string } & RoomResetOptions)
  | { type: "sync" };

type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | {
      type: "action-result";
      requestId?: string;
      errors: { code: string; message: string }[];
      snapshot: RoomSnapshot;
    };

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
   * Mirrors the store's closeRoom rule: a hosted room can only be closed by its
   * host; an open table by any current member (or anyone when it is empty).
   */
  private authorizeClose(actorClientId: string | undefined): CloseRoomResult {
    const room = this.snapshot?.state.room ?? null;
    const members = room?.members ?? [];
    if (room?.hosted) {
      if (!actorClientId || room.hostClientId !== actorClientId) {
        return { closed: false, reason: "Only the host can close this room." };
      }
    } else if (members.length > 0 && actorClientId && !members.some((m) => m.clientId === actorClientId)) {
      return { closed: false, reason: "Join the room before closing it." };
    }
    return { closed: true };
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
        await this.reportToLobby();
      }

      const reply: ServerMessage = {
        type: "action-result",
        requestId: message.requestId,
        errors: result.errors.map((error) => ({ code: error.code, message: error.message })),
        snapshot: this.signed(this.snapshot ?? current)
      };
      sender.send(JSON.stringify(reply));
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
      const body = (await request.json().catch(() => null)) as { actorClientId?: string } | null;
      const result = this.authorizeClose(body?.actorClientId);
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
        | ({ reset?: boolean } & RoomResetOptions)
        | { action?: GameAction; actorClientId?: string }
        | null;

      if (body && "reset" in body && body.reset) {
        const previous = this.ensureSnapshot();
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
