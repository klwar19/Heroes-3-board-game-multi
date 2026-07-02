/**
 * Reset authority over BOTH multiplayer transports: a game reset is as
 * destructive as a room close (the running game is wiped for every seat), so a
 * HOSTED room accepts it from the host alone, while an OPEN table keeps the
 * original anyone-may-reset behaviour. The store half of this rule is tested in
 * game-room-store.test.ts ("refuses a hosted-room reset from anyone but the
 * host"); this file drives the PartyKit edge server (party/index.ts) through
 * its two reset entry points — the socket message and the HTTP POST.
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
    // The socket URL carries the per-tab clientId, exactly as realtime.ts opens it.
    uri: `https://example.partykit.dev/parties/main/room?clientId=${clientId}`,
    received,
    send: (data: string) => received.push(data)
  };
}

function latestVersion(conn: MockConnection): number {
  for (let i = conn.received.length - 1; i >= 0; i -= 1) {
    const message = JSON.parse(conn.received[i]) as { snapshot?: RoomSnapshot };
    if (message.snapshot) {
      return message.snapshot.version;
    }
  }
  throw new Error(`${conn.id} received no snapshot`);
}

function hostedState(seed: string, hosted: boolean): GameState {
  const state = createInitialGameState(seed);
  state.room = {
    hosted,
    hostClientId: hosted ? "host-1" : null,
    members: [
      { clientId: "host-1", name: "Host", seat: "p1", isHost: hosted },
      { clientId: "guest-1", name: "Guest", seat: "p2", isHost: false }
    ]
  };
  return state;
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
      }
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, connections };
}

async function bootHostedRoom(roomId: string, hosted = true) {
  const { room, connections } = makeEdgeRoom(roomId, hostedState(roomId, hosted));
  const server = new GameRoomServer(room);
  await server.onStart();
  const host = makeConnection("host-conn", "host-1");
  const guest = makeConnection("guest-conn", "guest-1");
  connections.add(host);
  connections.add(guest);
  server.onConnect(host as unknown as EdgeConnection);
  server.onConnect(guest as unknown as EdgeConnection);
  return { server, host, guest };
}

describe("PartyKit edge server — reset authority", () => {
  it("refuses a guest's socket reset on a hosted room; the game is untouched", async () => {
    const { server, host, guest } = await bootHostedRoom("edge-reset-guest");
    await server.onMessage(JSON.stringify({ type: "reset", mode: "adventure" }), guest as unknown as EdgeConnection);

    // The guest got a snapshot back (its pending reset promise settles), but it
    // is the SAME game — version unchanged — and nothing was broadcast to the host.
    expect(latestVersion(guest)).toBe(7);
    expect(latestVersion(host)).toBe(7);
    const guestFinal = JSON.parse(guest.received.at(-1)!) as { snapshot: RoomSnapshot };
    expect(guestFinal.snapshot.state.room?.hosted).toBe(true);
  });

  it("a spoof-free guest HTTP reset gets 403; the host's succeeds (the CONTROL)", async () => {
    const { server, host } = await bootHostedRoom("edge-reset-http");

    const denied = await server.onRequest({
      method: "POST",
      json: async () => ({ reset: true, mode: "adventure", actorClientId: "guest-1" })
    } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
    expect(denied.status).toBe(403);
    expect(latestVersion(host)).toBe(7);

    const allowed = await server.onRequest({
      method: "POST",
      json: async () => ({ reset: true, mode: "adventure", actorClientId: "host-1" })
    } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
    expect(allowed.status).toBe(200);
    // The reset broadcast reached every connection with a bumped version.
    expect(latestVersion(host)).toBe(8);
  });

  it("the host's socket reset still works, and an OPEN table lets anyone reset", async () => {
    const hostedRoom = await bootHostedRoom("edge-reset-host");
    await hostedRoom.server.onMessage(
      JSON.stringify({ type: "reset", mode: "adventure" }),
      hostedRoom.host as unknown as EdgeConnection
    );
    expect(latestVersion(hostedRoom.host)).toBe(8);
    expect(latestVersion(hostedRoom.guest)).toBe(8);
    // Membership (host, seats) carries across the reset, as before.
    const final = JSON.parse(hostedRoom.host.received.at(-1)!) as { snapshot: RoomSnapshot };
    expect(final.snapshot.state.room?.hostClientId).toBe("host-1");

    const openTable = await bootHostedRoom("edge-reset-open", false);
    await openTable.server.onMessage(
      JSON.stringify({ type: "reset", mode: "adventure" }),
      openTable.guest as unknown as EdgeConnection
    );
    expect(latestVersion(openTable.guest)).toBe(8);
  });
});
