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

function latestSnapshot(conn: MockConnection): RoomSnapshot {
  for (let i = conn.received.length - 1; i >= 0; i -= 1) {
    const message = JSON.parse(conn.received[i]) as { snapshot?: RoomSnapshot };
    if (message.snapshot) return message.snapshot;
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

  it("RECLAIM_HOST over the socket: refused while the host is connected, allowed once the host's socket is gone", async () => {
    const { server, host, guest, connections } = await bootHostedRoom("edge-reclaim-host");

    const send = (conn: MockConnection) =>
      server.onMessage(
        JSON.stringify({ type: "action", action: { type: "RECLAIM_HOST", clientId: "guest-1" }, actorClientId: "guest-1" }),
        conn as unknown as EdgeConnection
      );

    // CONTROL: the host still holds a live socket — the reclaim is refused and
    // the host pointer is untouched.
    await send(guest);
    const refused = JSON.parse(guest.received.at(-1)!) as {
      type: string;
      errors: { message: string }[];
    };
    expect(refused.type).toBe("action-result");
    expect(refused.errors.length).toBeGreaterThan(0);
    expect(latestSnapshot(guest).state.room?.hostClientId).toBe("host-1");

    // The host's browser dies: its socket drops. The member may now take host.
    connections.delete(host);
    await send(guest);
    const taken = JSON.parse(guest.received.at(-1)!) as {
      errors: { message: string }[];
    };
    expect(taken.errors).toHaveLength(0);
    expect(latestSnapshot(guest).state.room?.hostClientId).toBe("guest-1");
    expect(latestSnapshot(guest).state.room?.members.find((m) => m.clientId === "guest-1")?.isHost).toBe(true);
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

  it("a verified PLATFORM ADMIN (session ticket) closes a hosted room it does not belong to", async () => {
    // The edge resolves admin-ness by calling back to the app's verify-token
    // route (it can't read the cross-origin cookie). Stub that callback: only
    // "admin-tok" resolves to an admin; "player-tok" is an ordinary signed-in
    // stranger. Both are strangers to the room's host/membership.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
      const token = JSON.parse(String(init?.body ?? "{}")).token as string;
      const isAdmin = token === "admin-tok";
      return { ok: true, json: async () => ({ userId: token, nickname: token, isAdmin }) };
    }) as unknown as typeof fetch;

    try {
      const env = { HOMM3BG_APP_URL: "http://app.test" };
      const deleteReq = (token: string) =>
        ({
          method: "DELETE",
          url: `https://example.partykit.dev/parties/main/room?token=${token}`,
          json: async () => ({ actorClientId: "stranger-9" })
        }) as unknown as Parameters<GameRoomServer["onRequest"]>[0];

      // CONTROL: an ordinary signed-in player who is a stranger is still refused.
      const player = await bootHostedRoom("edge-close-admin-session-player", true, env);
      const denied = await player.server.onRequest(deleteReq("player-tok"));
      expect(denied.status).toBe(403);
      expect((await denied.json()).closed).toBe(false);
      expect(latestVersion(player.host)).toBe(7); // untouched

      // The admin's session ticket closes the very same hosted room.
      const admin = await bootHostedRoom("edge-close-admin-session", true, env);
      const closed = await admin.server.onRequest(deleteReq("admin-tok"));
      expect(closed.status).toBe(200);
      expect((await closed.json()).closed).toBe(true);
      const finalFrame = JSON.parse(admin.host.received.at(-1)!) as { snapshot?: RoomSnapshot };
      expect(finalFrame.snapshot?.closed).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("a verified PLATFORM ADMIN (session ticket) resets a hosted room over HTTP", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: { body?: string }) => {
      const token = JSON.parse(String(init?.body ?? "{}")).token as string;
      return { ok: true, json: async () => ({ userId: token, nickname: token, isAdmin: token === "admin-tok" }) };
    }) as unknown as typeof fetch;

    try {
      const env = { HOMM3BG_APP_URL: "http://app.test" };
      const resetReq = (token: string) =>
        ({
          method: "POST",
          url: `https://example.partykit.dev/parties/main/room?token=${token}`,
          json: async () => ({ reset: true, mode: "adventure", actorClientId: "stranger-9" })
        }) as unknown as Parameters<GameRoomServer["onRequest"]>[0];

      // CONTROL: an ordinary player stranger cannot reset while the host is live.
      const player = await bootHostedRoom("edge-reset-admin-session-player", true, env);
      const denied = await player.server.onRequest(resetReq("player-tok"));
      expect(denied.status).toBe(403);
      expect(latestVersion(player.host)).toBe(7);

      // The admin's session ticket wipes the game even with the host connected.
      const admin = await bootHostedRoom("edge-reset-admin-session", true, env);
      const allowed = await admin.server.onRequest(resetReq("admin-tok"));
      expect(allowed.status).toBe(200);
      expect(latestVersion(admin.host)).toBe(8);
    } finally {
      globalThis.fetch = realFetch;
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
