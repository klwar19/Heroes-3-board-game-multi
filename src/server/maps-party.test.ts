import { describe, expect, it } from "vitest";
import MapsServer from "../../party/maps";
import { MAX_STORED_MAPS, type SharedMapRecord } from "./map-registry";

/**
 * Exercises the shared-map Durable Object's HTTP surface (party/maps.ts) with a
 * fake room, exactly like lobby-party.test.ts does for the lobby. PartyKit's
 * runtime types are `import type`-only in the party file, so they erase at
 * compile time and the class runs under plain vitest — only its `MapRegistry` +
 * storage shell execute. This covers GET/POST/DELETE routing and the storage
 * round-trip; the browser↔party network plumbing is integration code, verified
 * by typecheck + `partykit deploy`.
 */

type RoomCtor = ConstructorParameters<typeof MapsServer>[0];
type MapsRequest = Parameters<MapsServer["onRequest"]>[0];

/**
 * A Map-backed stand-in for Durable Object storage (structured-clone on write).
 * Since 2e03c928 the party stores one `map:<id>` key per map, so the fake mirrors
 * the DO API it uses: batch `put(entries)`, `delete(keys[])` and a key-sorted
 * `list({ prefix })`.
 */
function makeFakeRoom(id = "catalog") {
  const store = new Map<string, unknown>();
  const room = {
    id,
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return store.has(key) ? (structuredClone(store.get(key)) as T) : undefined;
      },
      async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
        if (typeof keyOrEntries === "string") {
          store.set(keyOrEntries, structuredClone(value));
          return;
        }
        for (const [key, entry] of Object.entries(keyOrEntries)) store.set(key, structuredClone(entry));
      },
      async delete(keys: string | string[]): Promise<boolean | number> {
        if (typeof keys === "string") return store.delete(keys);
        return keys.filter((key) => store.delete(key)).length;
      },
      async list<T>(options: { prefix?: string } = {}): Promise<Map<string, T>> {
        const keys = [...store.keys()].filter((key) => !options.prefix || key.startsWith(options.prefix)).sort();
        return new Map(keys.map((key) => [key, structuredClone(store.get(key)) as T]));
      }
    }
  };
  return { room: room as unknown as RoomCtor, store };
}

function mapsRequest(
  method: string,
  options: { body?: unknown; query?: Record<string, string> } = {}
): MapsRequest {
  const url = new URL("https://heroes3bg-rooms.partykit.dev/parties/maps/catalog");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const init: RequestInit = { method };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init) as unknown as MapsRequest;
}

function mapBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    name: "Frontier",
    scenarioId: "skirmish",
    players: 3,
    tiles: [{ row: 9, col: 4, group: "near", faceDown: true }],
    ...overrides
  };
}

async function listVia(server: MapsServer): Promise<SharedMapRecord[]> {
  const response = await server.onRequest(mapsRequest("GET"));
  const data = (await response.json()) as { maps: SharedMapRecord[] };
  return data.maps;
}

describe("maps Durable Object (party/maps.ts)", () => {
  it("saves a map via POST and serves it from GET", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();

    const post = await server.onRequest(mapsRequest("POST", { body: mapBody() }));
    expect(post.status).toBe(200);
    const posted = (await post.json()) as { ok: boolean; map: SharedMapRecord };
    expect(posted.ok).toBe(true);
    expect(posted.map.players).toBe(3);

    const maps = await listVia(server);
    expect(maps.map((m) => m.id)).toEqual(["m1"]);
    expect(maps[0].name).toBe("Frontier");
  });

  it("edits in place by id (another player overwrites the same map)", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();

    await server.onRequest(mapsRequest("POST", { body: mapBody({ name: "Original", players: 2 }) }));
    await server.onRequest(mapsRequest("POST", { body: mapBody({ name: "Edited", players: 4 }) }));

    const maps = await listVia(server);
    expect(maps).toHaveLength(1); // not duplicated
    expect(maps[0].name).toBe("Edited");
    expect(maps[0].players).toBe(4);
  });

  it("clamps an over-range player count to the map's scenario on save", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();
    // land-2p tops out at 2 seats — a stored 4 must come back as 2.
    await server.onRequest(mapsRequest("POST", { body: mapBody({ scenarioId: "land-2p", players: 4 }) }));
    expect((await listVia(server))[0].players).toBe(2);
  });

  it("rejects a POST that isn't a map (no tiles array)", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();

    const response = await server.onRequest(mapsRequest("POST", { body: { id: "x", name: "no tiles" } }));
    expect(response.status).toBe(400);
    expect(await listVia(server)).toHaveLength(0);
  });

  it("deletes a map via DELETE so it stops listing (anyone may delete)", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();
    await server.onRequest(mapsRequest("POST", { body: mapBody() }));
    expect(await listVia(server)).toHaveLength(1);

    const del = await server.onRequest(mapsRequest("DELETE", { body: { id: "m1" } }));
    expect(del.status).toBe(200);
    expect(await listVia(server)).toHaveLength(0);
  });

  it("gates an OWNED map: only its owner or an admin may edit / delete it (edge casual gate)", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();

    // The owner creates it — on the edge the actor rides the request body.
    const create = await server.onRequest(
      mapsRequest("POST", { body: mapBody({ actorUserId: "u_owner", actorRole: "player" }) })
    );
    const created = (await create.json()) as { ok: boolean; map: SharedMapRecord };
    expect(created.map.createdByUserId).toBe("u_owner");

    // A stranger's overwrite is refused (403); the stored map is untouched.
    const strangerEdit = await server.onRequest(
      mapsRequest("POST", { body: mapBody({ name: "Hijacked", actorUserId: "u_stranger", actorRole: "player" }) })
    );
    expect(strangerEdit.status).toBe(403);
    expect((await listVia(server))[0].name).toBe("Frontier");

    // A stranger's delete is refused (403); the map remains.
    const strangerDelete = await server.onRequest(
      mapsRequest("DELETE", { body: { id: "m1", actorUserId: "u_stranger", actorRole: "player" } })
    );
    expect(strangerDelete.status).toBe(403);
    expect(await listVia(server)).toHaveLength(1);

    // Control: an admin MAY delete it (proving the gate is ownership, not a block).
    const adminDelete = await server.onRequest(
      mapsRequest("DELETE", { body: { id: "m1", actorUserId: "u_admin", actorRole: "admin" } })
    );
    expect(adminDelete.status).toBe(200);
    expect(await listVia(server)).toHaveLength(0);
  });

  it("survives hibernation: a new instance reloads the library from storage", async () => {
    const { room, store } = makeFakeRoom();
    const first = new MapsServer(room);
    await first.onStart();
    await first.onRequest(mapsRequest("POST", { body: mapBody({ id: "persist-me", name: "Persisted" }) }));

    const second = new MapsServer({ id: room.id, storage: room.storage } as unknown as RoomCtor);
    await second.onStart();
    const maps = await listVia(second);
    expect(maps.map((m) => m.id)).toEqual(["persist-me"]);
    // 2e03c928: each map lives under its own key; no whole-catalog blob is written.
    expect(store.has("map:persist-me")).toBe(true);
    expect(store.has("maps")).toBe(false);
  });

  it("migrates the legacy combined blob into per-map keys once, keeping the blob as a backup", async () => {
    const { room, store } = makeFakeRoom();
    const legacy = { ...mapBody({ id: "legacy-1", name: "Legacy" }), createdAt: 1, updatedAt: 1 };
    store.set("maps", [legacy]);
    const server = new MapsServer(room);
    await server.onStart();
    expect((await listVia(server)).map((m) => m.id)).toEqual(["legacy-1"]);
    expect(store.has("map:legacy-1")).toBe(true);
    expect(store.get("mapsMigratedV2")).toBe(true);
    expect(store.has("maps")).toBe(true); // untouched backup

    // CONTROL: once migrated, a deleted map is not resurrected from the backup.
    await server.onRequest(mapsRequest("DELETE", { body: { id: "legacy-1" } }));
    const reloaded = new MapsServer(room);
    await reloaded.onStart();
    expect(await listVia(reloaded)).toHaveLength(0);
  });

  it("keeps the library bounded — POSTing past the cap evicts the oldest", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();
    for (let index = 0; index <= MAX_STORED_MAPS; index += 1) {
      await server.onRequest(mapsRequest("POST", { body: mapBody({ id: `m${index}`, name: `Map ${index}` }) }));
    }
    const maps = await listVia(server);
    expect(maps).toHaveLength(MAX_STORED_MAPS);
    expect(maps.some((m) => m.id === "m0")).toBe(false); // first one evicted
  });

  it("answers the CORS preflight and rejects unknown methods", async () => {
    const { room } = makeFakeRoom();
    const server = new MapsServer(room);
    await server.onStart();

    const preflight = await server.onRequest(mapsRequest("OPTIONS"));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const bad = await server.onRequest(mapsRequest("PUT", { body: {} }));
    expect(bad.status).toBe(405);
  });
});
