/**
 * PartyKit edge server — SIMULTANEOUS actions must never lose an update.
 *
 * The room runs as a Cloudflare Durable Object, which interleaves other events
 * at every `await`. Verifying a signed-in sender's socket token is an async
 * app callback, so the action handler used to capture the room snapshot BEFORE
 * that await: two simultaneous actions then both applied on the SAME base
 * version and the later write silently overwrote the earlier one (a lost
 * update — one player's join/move/choice vanished). The handler now resolves
 * the verification FIRST and runs read→apply→write synchronously; this test
 * fails if that ordering regresses.
 */
import { afterEach, describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createInitialGameState } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

function makeConnection(id: string, clientId: string, token: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    // clientId + the signed-in session token, exactly as realtime.ts opens it.
    uri: `https://example.partykit.dev/parties/main/room?clientId=${clientId}&token=${token}`,
    received,
    send: (data: string) => received.push(data)
  };
}

function makeEdgeRoom(roomId: string) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version: 7,
    updatedAt: new Date().toISOString(),
    state: createInitialGameState(roomId)
  } satisfies RoomSnapshot);

  const connections = new Set<MockConnection>();
  const room = {
    id: roomId,
    env: { HOMM3BG_APP_URL: "http://app.test" },
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

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("PartyKit edge server — concurrent action serialization", () => {
  it("applies two simultaneous verified actions on top of EACH OTHER, never on the same base version", async () => {
    // The app's verify-token callback answers after a real async delay, so both
    // handlers are parked on their await at the same time — the exact
    // interleaving window Durable Objects permit.
    globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
      const token = JSON.parse(String(init?.body ?? "{}")).token as string;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true, json: async () => ({ userId: `user-${token}`, nickname: token, isAdmin: false }) };
    }) as unknown as typeof fetch;

    const { room, connections } = makeEdgeRoom("edge-action-race");
    const server = new GameRoomServer(room);
    await server.onStart();
    const alice = makeConnection("conn-a", "client-a", "tok-a");
    const bob = makeConnection("conn-b", "client-b", "tok-b");
    connections.add(alice);
    connections.add(bob);

    // Two players join AT THE SAME TIME (the lobby's most common simultaneous
    // pair, and the same shape as two parallel-turn actions landing together).
    await Promise.all([
      server.onMessage(
        JSON.stringify({
          type: "action",
          requestId: "req-a",
          actorClientId: "client-a",
          action: { type: "JOIN_ROOM", clientId: "client-a", name: "Alice" }
        }),
        alice as unknown as EdgeConnection
      ),
      server.onMessage(
        JSON.stringify({
          type: "action",
          requestId: "req-b",
          actorClientId: "client-b",
          action: { type: "JOIN_ROOM", clientId: "client-b", name: "Bob" }
        }),
        bob as unknown as EdgeConnection
      )
    ]);

    // Each sender gets an immediate transport receipt before identity
    // verification, mutation queueing, persistence, and full-state fan-out.
    // `durable: true` advertises the persisted dedupe ledger — the client's
    // permission to re-send an unacknowledged frame (see realtime.ts).
    expect(JSON.parse(alice.received[0])).toEqual({
      type: "action-received",
      requestId: "req-a",
      durable: true
    });
    expect(JSON.parse(bob.received[0])).toEqual({
      type: "action-received",
      requestId: "req-b",
      durable: true
    });

    // Both actions landed: two version bumps, and BOTH members exist in the
    // final snapshot. Before the fix the later write overwrote the earlier one:
    // version 8 with a single member.
    const final = JSON.parse(alice.received.at(-1)!) as { snapshot: RoomSnapshot };
    expect(final.snapshot.version).toBe(9);
    const names = (final.snapshot.state.room?.members ?? []).map((member) => member.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("a retry whose identity verification FLAPPED still dedupes (guest-applied, verified repeat)", async () => {
    // First send: the app callback is down, the verify fails, and the action
    // applies as a GUEST (recorded under the clientId ledger key). The client
    // re-sends the same frame over a recovered socket; by then the app is back
    // and the SAME token verifies — the lookup keyed only on the verified
    // userId would miss the guest-keyed entry and re-apply the action.
    let appUp = false;
    globalThis.fetch = (async () => {
      if (!appUp) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ userId: "user-a", nickname: "Alice", isAdmin: false }) };
    }) as unknown as typeof fetch;

    const { room, connections } = makeEdgeRoom("edge-identity-flap");
    const server = new GameRoomServer(room);
    await server.onStart();
    const alice = makeConnection("conn-a", "client-a", "tok-a");
    connections.add(alice);

    const join = JSON.stringify({
      type: "action",
      requestId: "req-flap",
      actorClientId: "client-a",
      action: { type: "JOIN_ROOM", clientId: "client-a", name: "Alice" }
    });
    const lastSnapshotVersion = () => {
      for (let i = alice.received.length - 1; i >= 0; i -= 1) {
        const frame = JSON.parse(alice.received[i]) as { snapshot?: RoomSnapshot };
        if (frame.snapshot) {
          return frame.snapshot.version;
        }
      }
      throw new Error("no snapshot received");
    };
    await server.onMessage(join, alice as unknown as EdgeConnection);
    expect(lastSnapshotVersion()).toBe(8);

    appUp = true;
    await server.onMessage(join, alice as unknown as EdgeConnection);
    // Answered from the ledger; the state did NOT advance to 9.
    await server.onMessage(JSON.stringify({ type: "sync" }), alice as unknown as EdgeConnection);
    expect(lastSnapshotVersion()).toBe(8);
  });
});
