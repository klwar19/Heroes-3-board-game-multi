import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type PlayerId } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];
type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

function connection(id: string): MockConnection {
  const received: string[] = [];
  return { id, uri: `https://example.test/room?clientId=${id}`, received, send: (data) => received.push(data) };
}

function latestState(peer: MockConnection): RoomSnapshot["state"] {
  for (let index = peer.received.length - 1; index >= 0; index -= 1) {
    const message = JSON.parse(peer.received[index]!) as { type: string; snapshot?: RoomSnapshot };
    if (message.type === "snapshot" && message.snapshot) return message.snapshot.state;
  }
  throw new Error("No snapshot received");
}

describe("PartyKit Ranked Clash replay persistence", () => {
  it("stays outside snapshots, uses size-safe values, and resumes appending after a cold wake", async () => {
    const state = createAdventureGameState({ seed: "edge-ranked-replay", playerCount: 2, rollFirstPlayer: false });
    state.room = {
      hosted: true,
      ranked: true,
      hostClientId: "c1",
      members: [
        { clientId: "c1", name: "Alice", seat: "p1", isHost: true },
        { clientId: "c2", name: "Bob", seat: "p2", isHost: false },
      ],
    };
    const initial: RoomSnapshot = { roomId: "edge-ranked-replay", version: 1, updatedAt: new Date().toISOString(), state };
    const storage = new Map<string, unknown>([["snapshot", initial]]);
    let replayTransactions = 0;
    const peers = new Map<string, MockConnection>([["c1", connection("c1")], ["c2", connection("c2")]]);
    const encoder = new TextEncoder();
    const room = {
      id: "edge-ranked-replay",
      env: { HOMM3BG_RANKED_REPLAY_ENABLED: "true" },
      storage: {
        get: async (key: string) => storage.get(key),
        put: async (key: string, value: unknown) => {
          const bytes = value instanceof Uint8Array ? value.byteLength : encoder.encode(JSON.stringify(value)).byteLength;
          if (bytes > 128 * 1024) throw new RangeError("Durable Object value exceeded 128 KiB");
          storage.set(key, value);
        },
        delete: async (key: string) => storage.delete(key),
        transaction: async <T>(run: (transaction: {
          get: (key: string) => Promise<unknown>;
          put: (key: string, value: unknown) => Promise<void>;
          delete: (key: string) => Promise<boolean>;
        }) => Promise<T>) => {
          replayTransactions += 1;
          const staged = new Map(storage);
          const result = await run({
            get: async (key) => staged.get(key),
            put: async (key, value) => {
              const bytes = value instanceof Uint8Array ? value.byteLength : encoder.encode(JSON.stringify(value)).byteLength;
              if (bytes > 128 * 1024) throw new RangeError("Durable Object value exceeded 128 KiB");
              staged.set(key, value);
            },
            delete: async (key) => staged.delete(key),
          });
          storage.clear();
          staged.forEach((value, key) => storage.set(key, value));
          return result;
        },
        setAlarm: async () => {},
        getAlarm: async () => null,
        deleteAlarm: async () => {},
      },
      broadcast: (data: string) => peers.forEach((peer) => peer.send(data)),
      getConnections: () => peers.values(),
      context: { parties: {} },
    } as unknown as EdgeRoom;

    const submitFirstLegal = async (server: GameRoomServer, current: RoomSnapshot["state"], requestId: string) => {
      const playerId = current.activePlayerId as PlayerId;
      const action = getLegalActions(current, playerId)[0]!.action as GameAction;
      const peer = peers.get(playerId === "p2" ? "c2" : "c1")!;
      await server.onMessage(
        JSON.stringify({ type: "action", requestId, actorClientId: peer.id, action }),
        peer as unknown as EdgeConnection,
      );
      return latestState(peer);
    };

    let server = new GameRoomServer(room);
    await server.onStart();
    const afterFirst = await submitFirstLegal(server, state, "replay-1");
    expect(storage.get("ranked-replay-meta")).toMatchObject({ entryCount: 1, truncated: false });
    expect(storage.has("ranked-replay-entry-0")).toBe(true);
    expect(JSON.stringify(latestState(peers.get("c1")!))).not.toContain("rankedReplay");

    server = new GameRoomServer(room);
    await server.onStart();
    await submitFirstLegal(server, afterFirst, "replay-2");
    expect(storage.get("ranked-replay-meta")).toMatchObject({ entryCount: 2, truncated: false });
    expect(storage.has("ranked-replay-entry-1")).toBe(true);

    // The production edge must initialize at the setup -> adventure boundary,
    // before any opening/economy/combat action occurs.
    const roundOne = createAdventureGameState({
      seed: "edge-ranked-from-round-one",
      playerCount: 2,
      rollFirstPlayer: false,
    });
    roundOne.room = structuredClone(state.room);
    const lobby = structuredClone(roundOne);
    lobby.adventure = null;
    lobby.phase = "setup";
    await (server as unknown as {
      captureRankedReplay: (
        before: RoomSnapshot["state"],
        action: GameAction,
        result: { state: RoomSnapshot["state"]; events: []; errors: []; notices: [] },
        options: { actorClientId: string; entropy: string; now: number },
      ) => Promise<void>;
    }).captureRankedReplay(
      lobby,
      { type: "START_ADVENTURE", playerId: "p1" },
      { state: roundOne, events: [], errors: [], notices: [] },
      { actorClientId: "c1", entropy: "round-one", now: 100 },
    );
    expect(storage.get("ranked-replay-meta")).toMatchObject({
      matchId: "edge-ranked-from-round-one",
      captureStart: "adventure-start",
      entryCount: 0,
    });
    expect(replayTransactions).toBeGreaterThan(0);
    const roundOneMeta = storage.get("ranked-replay-meta") as { initialChunkCount: number };
    const initialBytes = Array.from({ length: roundOneMeta.initialChunkCount }, (_, index) =>
      storage.get(`ranked-replay-initial-${index}`) as Uint8Array,
    );
    const joined = new Uint8Array(initialBytes.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let joinedOffset = 0;
    for (const chunk of initialBytes) {
      joined.set(chunk, joinedOffset);
      joinedOffset += chunk.byteLength;
    }
    expect(JSON.parse(new TextDecoder().decode(joined))).toMatchObject({ round: 1 });

    // The action pipeline invokes capture once in its pre-start gate and once
    // after the snapshot commit. The second call must be an idempotent no-op.
    await (server as unknown as {
      captureRankedReplay: (
        before: RoomSnapshot["state"],
        action: GameAction,
        result: { state: RoomSnapshot["state"]; events: []; errors: []; notices: [] },
        options: { actorClientId: string; entropy: string; now: number },
      ) => Promise<void>;
    }).captureRankedReplay(
      lobby,
      { type: "START_ADVENTURE", playerId: "p1" },
      { state: roundOne, events: [], errors: [], notices: [] },
      { actorClientId: "c1", entropy: "round-one", now: 100 },
    );
    expect(storage.get("ranked-replay-meta")).toMatchObject({ entryCount: 0 });
    expect(storage.has("ranked-replay-entry-0")).toBe(false);

    // A WebSocket submit and its HTTP recovery twin can deliver the exact same
    // accepted transition. It must remain one replay entry with a continuous
    // hash chain, not two copies of the same before/after pair.
    const duplicateAction = getLegalActions(roundOne, roundOne.activePlayerId as PlayerId)[0]!.action as GameAction;
    const duplicateResult = applyAction(roundOne, duplicateAction, { entropy: "duplicate", now: 200 });
    const capture = (server as unknown as {
      captureRankedReplay: (
        before: RoomSnapshot["state"],
        action: GameAction,
        result: ReturnType<typeof applyAction>,
        options: { actorClientId: string; entropy: string; now: number },
      ) => Promise<void>;
    }).captureRankedReplay.bind(server);
    await capture(roundOne, duplicateAction, duplicateResult, { actorClientId: "c1", entropy: "duplicate", now: 200 });
    await capture(roundOne, duplicateAction, duplicateResult, { actorClientId: "c1", entropy: "duplicate", now: 200 });
    expect(storage.get("ranked-replay-meta")).toMatchObject({ entryCount: 1 });
    expect(storage.has("ranked-replay-entry-0")).toBe(true);
    expect(storage.has("ranked-replay-entry-1")).toBe(false);
  });
});
