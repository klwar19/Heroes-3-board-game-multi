/**
 * PartyKit edge server — mutation serialization + reconnect seat frames.
 *
 * A Durable Object delivers new events while a handler awaits non-storage work
 * (the identity-verification fetch), so before the mutation lock two
 * overlapping actions could both read snapshot version N and both write N+1:
 * the first writer's action VANISHED while its reply still reported success
 * ("I clicked, got nothing" — a lost Event choice, a stuck round barrier).
 * These tests fail if the serialization, the requestId dedupe ledger or the
 * post-connect seat-correct frame is removed.
 */
import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createInitialGameState } from "@/engine";
import type { GameState } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

function makeConnection(id: string, clientId: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://example.partykit.dev/parties/main/room?clientId=${clientId}`,
    received,
    send: (data: string) => received.push(data)
  };
}

type Frame = { type: string; requestId?: string; errors?: { code: string; message: string }[]; snapshot?: RoomSnapshot };

function frames(conn: MockConnection): Frame[] {
  return conn.received.map((raw) => JSON.parse(raw) as Frame);
}

function latestSnapshot(conn: MockConnection): RoomSnapshot {
  for (let i = conn.received.length - 1; i >= 0; i -= 1) {
    const message = JSON.parse(conn.received[i]) as Frame;
    if (message.snapshot) {
      return message.snapshot;
    }
  }
  throw new Error(`${conn.id} received no snapshot`);
}

function makeEdgeRoom(roomId: string, seedState: GameState) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version: 7,
    updatedAt: new Date().toISOString(),
    state: seedState
  } satisfies RoomSnapshot);

  const connections = new Set<MockConnection>();
  const room = {
    id: roomId,
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key)
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    getConnections: () => connections.values(),
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, connections };
}

async function bootOpenRoom(roomId: string) {
  const { room, connections } = makeEdgeRoom(roomId, createInitialGameState(roomId));
  const server = new GameRoomServer(room);
  await server.onStart();
  return { server, connections };
}

/** Flush the floated post-connect seat frame (microtasks + a macrotask). */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PartyKit edge server — concurrent action serialization (P0)", () => {
  it("two overlapping actions BOTH land — neither write clobbers the other", async () => {
    const { server, connections } = await bootOpenRoom("edge-concurrent");
    const alice = makeConnection("conn-a", "client-a");
    const bob = makeConnection("conn-b", "client-b");
    connections.add(alice);
    connections.add(bob);

    // Fire both actions WITHOUT awaiting the first: the identity-verification
    // await inside onMessage is exactly where a Durable Object interleaves
    // overlapping requests, so this reproduces the production race.
    const first = server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "req-a",
        actorClientId: "client-a",
        action: { type: "JOIN_ROOM", clientId: "client-a", name: "Alice" }
      }),
      alice as unknown as EdgeConnection
    );
    const second = server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "req-b",
        actorClientId: "client-b",
        action: { type: "JOIN_ROOM", clientId: "client-b", name: "Bob" }
      }),
      bob as unknown as EdgeConnection
    );
    await Promise.all([first, second]);

    // Both replies reported success…
    const aliceReply = frames(alice).find((frame) => frame.type === "action-result" && frame.requestId === "req-a");
    const bobReply = frames(bob).find((frame) => frame.type === "action-result" && frame.requestId === "req-b");
    expect(aliceReply?.errors).toEqual([]);
    expect(bobReply?.errors).toEqual([]);

    // …and BOTH actions are in the canonical state: two members, two version
    // bumps. Without the mutation lock the second apply reads the same base
    // snapshot and silently erases the first join (1 member, version 8).
    const final = latestSnapshot(bob);
    expect(final.version).toBe(9);
    const memberNames = (final.state.room?.members ?? []).map((member) => member.name).sort();
    expect(memberNames).toEqual(["Alice", "Bob"]);
  });

  it("a duplicated requestId is answered from the ledger, never applied twice", async () => {
    const { server, connections } = await bootOpenRoom("edge-dedupe");
    const alice = makeConnection("conn-a", "client-a");
    connections.add(alice);

    const join = JSON.stringify({
      type: "action",
      requestId: "req-dup",
      actorClientId: "client-a",
      action: { type: "JOIN_ROOM", clientId: "client-a", name: "Alice" }
    });
    await server.onMessage(join, alice as unknown as EdgeConnection);
    expect(latestSnapshot(alice).version).toBe(8);

    // The exact same frame again (a client retry after a socket flap): the
    // reply carries the recorded outcome, and the version does NOT advance —
    // re-applying a zero-error action would have bumped it to 9.
    await server.onMessage(join, alice as unknown as EdgeConnection);
    const replies = frames(alice).filter((frame) => frame.type === "action-result" && frame.requestId === "req-dup");
    expect(replies).toHaveLength(2);
    expect(replies[1].errors).toEqual([]);
    expect(latestSnapshot(alice).version).toBe(8);

    // A NEW requestId still applies normally — the ledger only swallows repeats.
    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "req-fresh",
        actorClientId: "client-a",
        action: { type: "JOIN_ROOM", clientId: "client-a", name: "Alice Renamed" }
      }),
      alice as unknown as EdgeConnection
    );
    expect(latestSnapshot(alice).version).toBe(9);
  });
});

describe("PartyKit edge server — reconnect seat frame (P1)", () => {
  function hostedSeatedState(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["card_a", "card_b"];
    state.room = {
      hosted: true,
      hostClientId: "host-1",
      members: [
        { clientId: "host-1", name: "Host", seat: "p1", isHost: true },
        { clientId: "guest-1", name: "Guest", seat: "p2", isHost: false }
      ]
    };
    return state;
  }

  it("a (re)connecting hosted socket gets the observer frame, then its SEAT frame", async () => {
    const { room, connections } = makeEdgeRoom("edge-seat-frame", hostedSeatedState("edge-seat-frame"));
    const server = new GameRoomServer(room);
    await server.onStart();

    const host = makeConnection("host-conn", "host-1");
    connections.add(host);
    server.onConnect(host as unknown as EdgeConnection);
    await settle();

    const received = frames(host).filter((frame) => frame.type === "snapshot");
    expect(received.length).toBeGreaterThanOrEqual(2);

    // Frame 1 — the synchronous zero-trust observer view: the viewer's own
    // hand is masked and the frame says whom it was redacted for.
    expect(received[0].snapshot?.viewerSeat).toBe("observer");
    expect(received[0].snapshot?.state.players.p1.hand).toEqual(["hidden", "hidden"]);

    // Frame 2 — the follow-up redacted to the socket's actual seat. An
    // automatic reconnect never re-sends JOIN_ROOM, so without this push the
    // player would stay stuck on the observer view (no hand, no pending-Event
    // steps) until someone else acted — the frozen-table report.
    const seatFrame = received[received.length - 1];
    expect(seatFrame.snapshot?.viewerSeat).toBe("p1");
    expect(seatFrame.snapshot?.state.players.p1.hand).toEqual(["card_a", "card_b"]);
    // Same version both times: the client accepts this as a redaction UPGRADE.
    expect(seatFrame.snapshot?.version).toBe(received[0].snapshot?.version);
  });

  it("CONTROL: an open table sends its one full shared frame, no seat follow-up", async () => {
    const { room, connections } = makeEdgeRoom("edge-open-frame", createInitialGameState("edge-open-frame"));
    const server = new GameRoomServer(room);
    await server.onStart();

    const conn = makeConnection("conn-a", "client-a");
    connections.add(conn);
    server.onConnect(conn as unknown as EdgeConnection);
    await settle();

    const received = frames(conn).filter((frame) => frame.type === "snapshot");
    expect(received).toHaveLength(1);
    expect(received[0].snapshot?.viewerSeat).toBeUndefined();
  });
});
