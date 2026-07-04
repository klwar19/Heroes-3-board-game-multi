import { describe, expect, it } from "vitest";
import LobbyServer from "../../party/lobby";
import { STALE_ROOM_TTL_MS, type LobbyRoomRecord, type RoomDirectoryEntry } from "./lobby-registry";

/**
 * Exercises the lobby Durable Object's HTTP surface (party/lobby.ts) with a fake
 * room. PartyKit's runtime types are `import type`-only in the party file, so
 * they erase at compile time and the class runs under plain vitest — only its
 * `LobbyRegistry` + storage shell execute. This covers the GET/POST/DELETE
 * routing and the storage round-trip; the cross-party network plumbing (the
 * room party fetching this object) is integration code, verified by typecheck +
 * `partykit deploy`, not by this unit test.
 */

type RoomCtor = ConstructorParameters<typeof LobbyServer>[0];
type LobbyRequest = Parameters<LobbyServer["onRequest"]>[0];

/** A Map-backed stand-in for Durable Object storage (structured-clone on write). */
function makeFakeRoom(id = "directory") {
  const store = new Map<string, unknown>();
  const room = {
    id,
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return store.has(key) ? (structuredClone(store.get(key)) as T) : undefined;
      },
      async put(key: string, value: unknown): Promise<void> {
        store.set(key, structuredClone(value));
      },
      async delete(key: string): Promise<boolean> {
        return store.delete(key);
      }
    }
  };
  return { room: room as unknown as RoomCtor, store };
}

function lobbyRequest(
  method: string,
  options: { body?: unknown; query?: Record<string, string> } = {}
): LobbyRequest {
  const url = new URL("https://heroes3bg-rooms.partykit.dev/parties/lobby/directory");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const init: RequestInit = { method };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init) as unknown as LobbyRequest;
}

function makeRecord(overrides: Partial<LobbyRoomRecord> & { roomId: string }): LobbyRoomRecord {
  return {
    name: `Room ${overrides.roomId}`,
    mode: "adventure",
    phase: "setup",
    inProgress: false,
    memberCount: 1,
    seatedCount: 0,
    hosted: false,
    hostName: null,
    hostClientId: null,
    memberClientIds: ["c1"],
    ranked: true,
    createdByName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

async function listVia(server: LobbyServer, clientId?: string): Promise<RoomDirectoryEntry[]> {
  const response = await server.onRequest(lobbyRequest("GET", clientId ? { query: { clientId } } : {}));
  const data = (await response.json()) as { rooms: RoomDirectoryEntry[]; supported: boolean };
  expect(data.supported).toBe(true);
  return data.rooms;
}

describe("lobby Durable Object (party/lobby.ts)", () => {
  it("registers a room via POST and serves it from GET", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();

    const post = await server.onRequest(lobbyRequest("POST", { body: makeRecord({ roomId: "alpha", name: "Alpha" }) }));
    expect(post.status).toBe(200);
    expect((await post.json()) as { ok: boolean }).toEqual({ ok: true });

    const rooms = await listVia(server);
    expect(rooms.map((entry) => entry.roomId)).toEqual(["alpha"]);
    expect(rooms[0].name).toBe("Alpha");
  });

  it("upserts by roomId (the room party re-reports the same room)", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();

    await server.onRequest(lobbyRequest("POST", { body: makeRecord({ roomId: "r", memberCount: 1, memberClientIds: ["a"] }) }));
    await server.onRequest(
      lobbyRequest("POST", { body: makeRecord({ roomId: "r", name: "Renamed", memberCount: 2, memberClientIds: ["a", "b"] }) })
    );

    const rooms = await listVia(server);
    expect(rooms).toHaveLength(1); // not duplicated
    expect(rooms[0].name).toBe("Renamed");
    expect(rooms[0].memberCount).toBe(2);
  });

  it("rejects a POST with no roomId", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();

    const response = await server.onRequest(lobbyRequest("POST", { body: { name: "no id" } }));
    expect(response.status).toBe(400);
    expect(await listVia(server)).toHaveLength(0);
  });

  it("removes a room via DELETE so the browser stops listing it", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();
    await server.onRequest(lobbyRequest("POST", { body: makeRecord({ roomId: "gone" }) }));
    expect(await listVia(server)).toHaveLength(1);

    const del = await server.onRequest(lobbyRequest("DELETE", { body: { roomId: "gone" } }));
    expect(del.status).toBe(200);
    expect(await listVia(server)).toHaveLength(0);
  });

  it("computes canClose per viewer from the GET clientId", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();
    await server.onRequest(
      lobbyRequest("POST", {
        body: makeRecord({
          roomId: "hosted",
          hosted: true,
          hostClientId: "host",
          hostName: "Host",
          memberClientIds: ["host", "guest"],
          memberCount: 2
        })
      })
    );

    expect((await listVia(server, "host"))[0].canClose).toBe(true);
    expect((await listVia(server, "guest"))[0].canClose).toBe(false);
    expect((await listVia(server, "stranger"))[0].canClose).toBe(false);
  });

  it("prunes stale empty rooms when listed, and persists the pruned set", async () => {
    const { room, store } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();

    const stale = new Date(Date.now() - STALE_ROOM_TTL_MS - 60_000).toISOString();
    await server.onRequest(lobbyRequest("POST", { body: makeRecord({ roomId: "ghost", memberCount: 0, memberClientIds: [], updatedAt: stale }) }));
    await server.onRequest(lobbyRequest("POST", { body: makeRecord({ roomId: "live", memberCount: 1, memberClientIds: ["c1"] }) }));

    const rooms = await listVia(server);
    expect(rooms.map((entry) => entry.roomId)).toEqual(["live"]);

    // The prune is persisted to storage, so a fresh server doesn't resurrect it.
    const persisted = store.get("records") as LobbyRoomRecord[];
    expect(persisted.map((entry) => entry.roomId)).toEqual(["live"]);
  });

  it("survives hibernation: a new instance reloads the directory from storage", async () => {
    const { room, store } = makeFakeRoom();
    const first = new LobbyServer(room);
    await first.onStart();
    await first.onRequest(lobbyRequest("POST", { body: makeRecord({ roomId: "persist-me", name: "Persisted" }) }));

    // A second instance over the SAME storage (as after a Durable Object wakes).
    const second = new LobbyServer({ id: room.id, storage: room.storage } as unknown as RoomCtor);
    await second.onStart();
    const rooms = await listVia(second);
    expect(rooms.map((entry) => entry.roomId)).toEqual(["persist-me"]);
    expect(store.has("records")).toBe(true);
  });

  it("answers the CORS preflight and rejects unknown methods", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyServer(room);
    await server.onStart();

    const preflight = await server.onRequest(lobbyRequest("OPTIONS"));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const bad = await server.onRequest(lobbyRequest("PUT", { body: {} }));
    expect(bad.status).toBe(405);
  });
});
