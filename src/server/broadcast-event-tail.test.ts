/**
 * N4 (docs/partykit-network-upgrade-plan.md): wire-only broadcast event-log
 * tail behind the party env flag HOMM3BG_BROADCAST_EVENT_TAIL.
 *
 * The eventLog is ~45% of a late-game frame and is re-sent to every
 * connection on every action. With the flag set to K, every OUTGOING
 * snapshot carries only the last K events — while STORAGE always keeps the
 * engine's full log, so persistence, reports and the built-in backend are
 * untouched. Flag absent/0 = today's behaviour (the CONTROL below).
 *
 * The client side is safe by design: presentation is cursor-based
 * (src/lib/presentation-event-window.ts) — a tail starting past the cursor
 * reads as log rotation and PRIMES from state instead of replaying (pinned in
 * presentation-event-window.test.ts "detects rotation and primes current
 * history instead of replaying a partial timeline").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createInitialGameState, type GameEvent, type GameState } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeConnection(id: string, query: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://example.partykit.dev/parties/main/room?${query}`,
    received,
    send: (data: string) => received.push(data)
  };
}

/** Minimal PartyKit room double (storage + sockets + env), pump-test pattern. */
function makeEdgeRoom(roomId: string, state: GameState, env: Record<string, unknown>) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version: 7,
    updatedAt: new Date().toISOString(),
    state
  } satisfies RoomSnapshot);
  const connections = new Set<MockConnection>();
  const room = {
    id: roomId,
    env,
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key),
      setAlarm: async () => {},
      getAlarm: async () => null,
      deleteAlarm: async () => {}
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    getConnections: () => connections.values(),
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, connections, storage };
}

/** Twelve deterministic events; the last one is a REDACTABLE Pandora draw. */
function seedEvents(): GameEvent[] {
  const plain = Array.from(
    { length: 11 },
    (_, index) => ({ id: `evt_${index + 1}`, type: "ROUND_STARTED", round: 1 }) as GameEvent
  );
  const pandora = {
    id: "evt_12",
    type: "PANDORA_CARD_DRAWN",
    playerId: "p1",
    cardId: "spell.fireball"
  } as unknown as GameEvent;
  return [...plain, pandora];
}

function seedState(hosted: boolean): GameState {
  const state = createInitialGameState("broadcast-tail");
  state.eventLog = seedEvents();
  state.players.p1.hand = ["spell.magic_arrow"];
  if (hosted) {
    state.room = {
      hosted: true,
      hostClientId: "owner-1",
      visibility: "private",
      ranked: false,
      ownerClientId: "owner-1",
      members: [{ clientId: "owner-1", name: "Owner", seat: "p1", isHost: true }]
    } as GameState["room"];
  }
  return state;
}

function firstSnapshotFrame(connection: MockConnection): RoomSnapshot {
  const frame = connection.received
    .map((data) => JSON.parse(data) as { type: string; snapshot?: RoomSnapshot })
    .find((message) => message.type === "snapshot");
  if (!frame?.snapshot) {
    throw new Error("no snapshot frame received");
  }
  return frame.snapshot;
}

async function connectAndRead(
  hosted: boolean,
  env: Record<string, unknown>
): Promise<{ frame: RoomSnapshot; storage: Map<string, unknown>; server: GameRoomServer; socket: MockConnection }> {
  const { room, connections, storage } = makeEdgeRoom("tail-room", seedState(hosted), env);
  const server = new GameRoomServer(room);
  await server.onStart();
  const socket = makeConnection("conn-1", "clientId=owner-1");
  connections.add(socket);
  server.onConnect(socket as unknown as EdgeConnection);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { frame: firstSnapshotFrame(socket), storage, server, socket };
}

describe("HOMM3BG_BROADCAST_EVENT_TAIL — wire-only event-log tail (plan N4)", () => {
  it("with the flag set, outgoing frames carry exactly the last K events while STORAGE keeps the full log", async () => {
    const { frame, storage } = await connectAndRead(false, { HOMM3BG_BROADCAST_EVENT_TAIL: "5" });

    // Exactly the last 5, in original order; version/state otherwise untouched.
    expect(frame.state.eventLog.map((event) => event.id)).toEqual([
      "evt_8",
      "evt_9",
      "evt_10",
      "evt_11",
      "evt_12"
    ]);
    expect(frame.version).toBe(7);
    expect(frame.state.players.p1).toBeTruthy();

    // The trim is WIRE-ONLY: the stored snapshot keeps all 12 events.
    const stored = storage.get("snapshot") as RoomSnapshot;
    expect(stored.state.eventLog).toHaveLength(12);
  });

  it("the sync reply flows through the same shared trim spot", async () => {
    const { server, socket } = await connectAndRead(false, { HOMM3BG_BROADCAST_EVENT_TAIL: "5" });
    socket.received.length = 0;
    await server.onMessage(JSON.stringify({ type: "sync" }), socket as unknown as EdgeConnection);
    const reply = firstSnapshotFrame(socket);
    expect(reply.state.eventLog.map((event) => event.id)).toEqual([
      "evt_8",
      "evt_9",
      "evt_10",
      "evt_11",
      "evt_12"
    ]);
  });

  it("CONTROL: with the flag absent, the full log is broadcast exactly as before", async () => {
    const { frame } = await connectAndRead(false, {});
    expect(frame.state.eventLog).toHaveLength(12);
    expect(frame.state.eventLog[0].id).toBe("evt_1");
  });

  it("privacy: on a hosted room the trimmed frame stays seat-redacted — trimming never resurrects hidden content", async () => {
    const { frame, storage } = await connectAndRead(true, { HOMM3BG_BROADCAST_EVENT_TAIL: "5" });

    // The synchronous connect frame is the zero-trust OBSERVER view: the trim
    // must compose with redaction, never bypass it.
    expect(frame.viewerSeat).toBe("observer");
    // p1's real hand never reaches the wire…
    expect(frame.state.players.p1.hand).not.toContain("spell.magic_arrow");
    // …and the Pandora draw inside the kept tail is still masked.
    const pandora = frame.state.eventLog.find((event) => event.type === "PANDORA_CARD_DRAWN");
    expect(pandora).toBeTruthy();
    expect((pandora as { cardId?: string }).cardId).toBe("hidden");
    expect(frame.state.eventLog).toHaveLength(5);

    // The raw stored state keeps the real ids (storage is not redacted).
    const stored = storage.get("snapshot") as RoomSnapshot;
    const storedPandora = stored.state.eventLog.find((event) => event.type === "PANDORA_CARD_DRAWN");
    expect((storedPandora as { cardId?: string }).cardId).toBe("spell.fireball");
  });
});

describe("PartyKit action acknowledgement boundary", () => {
  it("turns an unexpected commit failure into an immediate terminal result and rolls the room back", async () => {
    const { room, connections, storage } = makeEdgeRoom(
      "terminal-commit-failure",
      seedState(true),
      {}
    );
    const rawRoom = room as unknown as {
      storage: { put: (key: string, value: unknown) => Promise<void> };
    };
    const normalPut = rawRoom.storage.put;
    let failSnapshotWrite = true;
    rawRoom.storage.put = async (key, value) => {
      if (failSnapshotWrite && key === "snapshot") {
        throw new Error("simulated storage outage");
      }
      await normalPut(key, value);
    };

    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    connections.add(owner);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "req-storage-failure",
        actorClientId: "owner-1",
        action: { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }
      }),
      owner as unknown as EdgeConnection
    );

    const actionFrames = owner.received.map((raw) => JSON.parse(raw) as {
      type: string;
      requestId?: string;
      version?: number;
      errors?: { message: string }[];
    });
    expect(actionFrames[0]).toEqual({
      type: "action-received",
      requestId: "req-storage-failure",
      durable: true
    });
    expect(actionFrames[1]).toMatchObject({
      type: "action-result",
      requestId: "req-storage-failure",
      version: 7,
      errors: [{ message: expect.stringMatching(/nothing changed/i) }]
    });
    expect((storage.get("snapshot") as RoomSnapshot).version).toBe(7);

    // The failed request did not poison the in-memory mutation queue or state.
    failSnapshotWrite = false;
    owner.received.length = 0;
    await server.onMessage(JSON.stringify({ type: "sync" }), owner as unknown as EdgeConnection);
    expect(firstSnapshotFrame(owner).version).toBe(7);
    error.mockRestore();
  });

  it("acknowledges a persisted action before a slow hosted recipient finishes fan-out", async () => {
    const releasePeers: (() => void)[] = [];
    globalThis.fetch = (async () =>
      new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
        releasePeers.push(() => resolve({ ok: false, json: async () => ({}) }));
      })) as unknown as typeof fetch;

    const { room, connections } = makeEdgeRoom(
      "ack-before-fanout",
      seedState(true),
      { HOMM3BG_APP_URL: "https://app.example" }
    );
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    const slowPeer = makeConnection("slow-conn", "clientId=slow-peer&token=slow-token");
    connections.add(owner);
    connections.add(slowPeer);

    let completed = false;
    const running = server
      .onMessage(
        JSON.stringify({
          type: "action",
          requestId: "req-heavy",
          actorClientId: "owner-1",
          action: { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }
        }),
        owner as unknown as EdgeConnection
      )
      .finally(() => {
        completed = true;
      });

    // Persistence completes, then hosted fan-out parks on the peer callback.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ownerFrames = owner.received.map((raw) => JSON.parse(raw) as { type: string; requestId?: string });
    expect(ownerFrames[0]).toEqual({ type: "action-received", requestId: "req-heavy", durable: true });
    expect(ownerFrames[1]).toMatchObject({ type: "action-result", requestId: "req-heavy" });
    expect(completed).toBe(false);

    // Fan-out for req-heavy is still parked, but it no longer owns the mutation
    // lock: another action can persist and receive its acknowledgement now.
    let secondCompleted = false;
    const secondRunning = server
      .onMessage(
        JSON.stringify({
          type: "action",
          requestId: "req-after-slow-peer",
          actorClientId: "owner-1",
          action: { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }
        }),
        owner as unknown as EdgeConnection
      )
      .finally(() => {
        secondCompleted = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const framesWhileBlocked = owner.received.map(
      (raw) => JSON.parse(raw) as { type: string; requestId?: string }
    );
    expect(framesWhileBlocked).toContainEqual({
      type: "action-received",
      requestId: "req-after-slow-peer",
      durable: true
    });
    expect(framesWhileBlocked).toContainEqual(
      expect.objectContaining({ type: "action-result", requestId: "req-after-slow-peer" })
    );
    expect(secondCompleted).toBe(false);

    for (const releasePeer of releasePeers) releasePeer();
    await Promise.all([running, secondRunning]);
    expect(completed).toBe(true);
    expect(secondCompleted).toBe(true);

    const committedSnapshots = owner.received
      .map((raw) => JSON.parse(raw) as { type: string; requestId?: string })
      .filter((frame) => frame.type === "snapshot");
    expect(committedSnapshots.map((frame) => frame.requestId)).toEqual(
      expect.arrayContaining(["req-heavy", "req-after-slow-peer"])
    );
  });
});
