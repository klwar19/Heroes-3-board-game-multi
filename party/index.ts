import type * as Party from "partykit/server";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  ENGINE_SIGNATURE,
  type AdventurePlayerConfig,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameState
} from "@/engine";

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
  state: GameState;
  /**
   * This server's ENGINE_SIGNATURE, stamped onto every snapshot at send time
   * (see src/engine/version.ts). Lets the client warn when the room server is
   * running older engine code than the frontend.
   */
  serverSignature?: string;
};

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
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
      this.snapshot = {
        roomId: this.room.id,
        version: 1,
        updatedAt: new Date().toISOString(),
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
   * Stamp this server's engine signature onto an outgoing snapshot. Done at
   * send time (not persisted) so a snapshot stored by an older deploy is
   * always re-broadcast with the *running* server's signature.
   */
  private signed(snapshot: RoomSnapshot): RoomSnapshot {
    return { ...snapshot, serverSignature: ENGINE_SIGNATURE };
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
        state
      };
      await this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (message.type === "action") {
      const current = this.ensureSnapshot();
      const result = applyAction(
        current.state,
        message.action,
        message.actorClientId ? { actorClientId: message.actorClientId } : {}
      );

      if (result.errors.length === 0) {
        this.snapshot = {
          roomId: this.room.id,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
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
      return jsonWithCors(this.signed(this.ensureSnapshot()));
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
          state
        };
        await this.persist();
        this.broadcastSnapshot();
        return jsonWithCors(this.signed(this.snapshot));
      }

      if (body && "action" in body && body.action) {
        const current = this.ensureSnapshot();
        const result = applyAction(
          current.state,
          body.action,
          "actorClientId" in body && body.actorClientId ? { actorClientId: body.actorClientId } : {}
        );
        if (result.errors.length === 0) {
          this.snapshot = {
            roomId: this.room.id,
            version: current.version + 1,
            updatedAt: new Date().toISOString(),
            state: result.state
          };
          await this.persist();
          this.broadcastSnapshot();
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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonWithCors(data: unknown): Response {
  return Response.json(data, { headers: CORS_HEADERS });
}

GameRoomServer satisfies Party.Worker;
