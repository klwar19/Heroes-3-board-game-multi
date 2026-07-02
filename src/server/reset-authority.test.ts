/**
 * Reset/close authority over the PartyKit edge transport. One rule for the two
 * destructive room ops on a HOSTED room (mirrors game-room-store, whose half
 * lives in game-room-store.test.ts): the HOST always may; any MEMBER may once
 * the host holds no live socket (per-tab client ids die with the browser, so a
 * restarted host must not strand the table); a STRANGER never may — unless the
 * request carries the deployment's HOMM3BG_ADMIN_KEY (developer override).
 * Open tables keep the original anyone-may-reset behaviour.
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

function lastMessage(conn: MockConnection): { type: string; reason?: string } {
  return JSON.parse(conn.received.at(-1)!) as { type: string; reason?: string };
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

function makeEdgeRoom(roomId: string, seedState: GameState, env?: Record<string, unknown>) {
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
    ...(env ? { env } : {}),
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

async function bootHostedRoom(roomId: string, hosted = true, env?: Record<string, unknown>) {
  const { room, connections } = makeEdgeRoom(roomId, hostedState(roomId, hosted), env);
  const server = new GameRoomServer(room);
  await server.onStart();
  const host = makeConnection("host-conn", "host-1");
  const guest = makeConnection("guest-conn", "guest-1");
  connections.add(host);
  connections.add(guest);
  server.onConnect(host as unknown as EdgeConnection);
  server.onConnect(guest as unknown as EdgeConnection);
  return { server, host, guest, connections };
}

describe("PartyKit edge server — reset authority", () => {
  it("refuses a guest's socket reset while the host is connected; the game is untouched", async () => {
    const { server, host, guest } = await bootHostedRoom("edge-reset-guest");
    await server.onMessage(JSON.stringify({ type: "reset", mode: "adventure" }), guest as unknown as EdgeConnection);

    // The guest got a reset-denied frame with the reason; nothing was broadcast.
    expect(lastMessage(guest)).toMatchObject({ type: "reset-denied" });
    expect(lastMessage(guest).reason).toMatch(/host/i);
    expect(latestVersion(guest)).toBe(7);
    expect(latestVersion(host)).toBe(7);
  });

  it("lets a MEMBER reset once the host's socket is gone; a stranger still cannot", async () => {
    const { server, host, guest, connections } = await bootHostedRoom("edge-reset-hostgone");
    connections.delete(host); // the host's browser restarted: socket + per-tab id gone

    const stranger = makeConnection("stranger-conn", "stranger-9");
    connections.add(stranger);
    await server.onMessage(JSON.stringify({ type: "reset", mode: "adventure" }), stranger as unknown as EdgeConnection);
    expect(lastMessage(stranger)).toMatchObject({ type: "reset-denied" });
    expect(latestVersion(guest)).toBe(7);

    await server.onMessage(JSON.stringify({ type: "reset", mode: "adventure" }), guest as unknown as EdgeConnection);
    expect(latestVersion(guest)).toBe(8); // the member's wipe landed
    // Membership (host, seats) still carries across the reset, as before.
    const final = JSON.parse(guest.received.at(-1)!) as { snapshot: RoomSnapshot };
    expect(final.snapshot.state.room?.hostClientId).toBe("host-1");
  });

  it("guest HTTP reset 403s while the host is connected; the host's own succeeds (the CONTROL)", async () => {
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

  it("the host's socket reset works, and an OPEN table lets anyone reset", async () => {
    const hostedRoom = await bootHostedRoom("edge-reset-host");
    await hostedRoom.server.onMessage(
      JSON.stringify({ type: "reset", mode: "adventure" }),
      hostedRoom.host as unknown as EdgeConnection
    );
    expect(latestVersion(hostedRoom.host)).toBe(8);
    expect(latestVersion(hostedRoom.guest)).toBe(8);

    const openTable = await bootHostedRoom("edge-reset-open", false);
    await openTable.server.onMessage(
      JSON.stringify({ type: "reset", mode: "adventure" }),
      openTable.guest as unknown as EdgeConnection
    );
    expect(latestVersion(openTable.guest)).toBe(8);
  });

  it("the developer's HOMM3BG_ADMIN_KEY wipes any table; wrong or unconfigured keys never do", async () => {
    // Key configured on the deployment: a stranger with the right key resets
    // even while the host is connected; the wrong key still 403s.
    const withKey = await bootHostedRoom("edge-reset-admin", true, { HOMM3BG_ADMIN_KEY: "sekret" });
    const wrong = await withKey.server.onRequest({
      method: "POST",
      json: async () => ({ reset: true, actorClientId: "stranger-9", adminKey: "wrong" })
    } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
    expect(wrong.status).toBe(403);
    const right = await withKey.server.onRequest({
      method: "POST",
      json: async () => ({ reset: true, actorClientId: "stranger-9", adminKey: "sekret" })
    } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
    expect(right.status).toBe(200);
    expect(latestVersion(withKey.host)).toBe(8);

    // No key configured (and an empty configured key): nothing matches.
    for (const env of [undefined, { HOMM3BG_ADMIN_KEY: "" }] as const) {
      const noKey = await bootHostedRoom(`edge-reset-nokey-${env ? "empty" : "unset"}`, true, env);
      const denied = await noKey.server.onRequest({
        method: "POST",
        json: async () => ({ reset: true, actorClientId: "stranger-9", adminKey: "" })
      } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
      expect(denied.status).toBe(403);
    }
  });

  it("the admin key also authorizes CLOSE over HTTP DELETE", async () => {
    const { server, host } = await bootHostedRoom("edge-close-admin", true, { HOMM3BG_ADMIN_KEY: "sekret" });
    const denied = await server.onRequest({
      method: "DELETE",
      json: async () => ({ actorClientId: "stranger-9", adminKey: "wrong" })
    } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
    expect(denied.status).toBe(403);

    const closed = await server.onRequest({
      method: "DELETE",
      json: async () => ({ actorClientId: "stranger-9", adminKey: "sekret" })
    } as unknown as Parameters<GameRoomServer["onRequest"]>[0]);
    expect(closed.status).toBe(200);
    // Everyone still connected got the final closed frame.
    const finalFrame = JSON.parse(host.received.at(-1)!) as { snapshot?: RoomSnapshot };
    expect(finalFrame.snapshot?.closed).toBe(true);
  });
});
