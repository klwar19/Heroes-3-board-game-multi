import type * as Party from "partykit/server";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
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
};

export type RoomResetOptions = {
  mode?: GameMode;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
};

type ClientMessage =
  | { type: "action"; requestId?: string; action: GameAction }
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

  private broadcastSnapshot(): void {
    if (!this.snapshot) {
      return;
    }

    const message: ServerMessage = { type: "snapshot", snapshot: this.snapshot };
    this.room.broadcast(JSON.stringify(message));
  }

  onConnect(connection: Party.Connection): void {
    const message: ServerMessage = { type: "snapshot", snapshot: this.ensureSnapshot() };
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
      const reply: ServerMessage = { type: "snapshot", snapshot: this.ensureSnapshot() };
      sender.send(JSON.stringify(reply));
      return;
    }

    if (message.type === "reset") {
      const previous = this.ensureSnapshot();
      this.snapshot = {
        roomId: this.room.id,
        version: previous.version + 1,
        updatedAt: new Date().toISOString(),
        state: this.makeState(message)
      };
      await this.persist();
      this.broadcastSnapshot();
      return;
    }

    if (message.type === "action") {
      const current = this.ensureSnapshot();
      const result = applyAction(current.state, message.action);

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
        snapshot: this.snapshot ?? current
      };
      sender.send(JSON.stringify(reply));
    }
  }

  /** Plain HTTP access to the same room (polling fallback, debugging). */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "GET") {
      return Response.json(this.ensureSnapshot());
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | ({ reset?: boolean } & RoomResetOptions)
        | { action?: GameAction }
        | null;

      if (body && "reset" in body && body.reset) {
        const previous = this.ensureSnapshot();
        this.snapshot = {
          roomId: this.room.id,
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
          state: this.makeState(body)
        };
        await this.persist();
        this.broadcastSnapshot();
        return Response.json(this.snapshot);
      }

      if (body && "action" in body && body.action) {
        const current = this.ensureSnapshot();
        const result = applyAction(current.state, body.action);
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
        return Response.json({ snapshot: this.snapshot ?? current, result });
      }

      return Response.json(this.ensureSnapshot());
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

GameRoomServer satisfies Party.Worker;
