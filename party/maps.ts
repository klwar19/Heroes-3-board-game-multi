import type * as Party from "partykit/server";
import {
  actorMayModifyMap,
  MapRegistry,
  sanitizeSharedMap,
  stampSavedMapOwnership,
  type MapActor,
  type SharedMapRecord
} from "@/server/map-registry";

/**
 * The shared map-library Durable Object — the edge backend's answer to the
 * built-in `/api/maps` store. It is one fixed singleton object addressed at
 * `/parties/maps/catalog`, holding every designed map so any player on any
 * browser can browse, open, and COPY them.
 *
 * A map created by a signed-in player is OWNED: only its owner or an admin may
 * edit (overwrite) or delete it ({@link actorMayModifyMap}). Because this edge is
 * cross-origin it never receives the session cookie, so the acting user is read
 * from the request BODY (`actorUserId` / `actorRole`) — a CASUAL gate, matching
 * the app's existing edge-identity posture (see src/lib/identity.ts "Phase 2"):
 * it stops the normal UI from editing/deleting someone else's map, but is not
 * cryptographically enforced here. Unowned/legacy maps stay fully shared.
 *
 * It mirrors `party/lobby.ts`: the pure storage/sanitize/sort rules live in the
 * shared, unit-tested {@link MapRegistry}; this class is just its HTTP + storage
 * shell. Records survive hibernation in Durable Object storage.
 */

/**
 * Storage layout. Each map is persisted under its OWN key (`map:<id>`), NOT in
 * one combined array. A single Durable Object storage value is size-capped, so a
 * whole-catalog blob eventually grows past the ceiling and every `put` then
 * throws mid-request — the connection resets with no response and the client
 * reports "Could not reach the map library". Per-key storage keeps each written
 * value tiny (~a few KB) no matter how large the library gets.
 *
 * `LEGACY_STORAGE_KEY` is the old combined array. It is read once, split into
 * per-key records, and then left UNTOUCHED as a backup (a one-time marker records
 * that the migration ran, so later starts read only the per-key records and
 * deletes stick). Keeping the old blob means the migration can never lose a map.
 */
const LEGACY_STORAGE_KEY = "maps";
const MIGRATED_MARKER_KEY = "mapsMigratedV2";
const MAP_KEY_PREFIX = "map:";
/** The Durable Object per-call batch ceiling for `storage.put(entries)`. */
const STORAGE_PUT_BATCH = 128;

/** The storage key for one map record. */
function mapKey(id: string): string {
  return `${MAP_KEY_PREFIX}${id}`;
}

/** The acting user for a mutation, read from the request body (edge casual gate). */
function actorFromBody(body: unknown): MapActor {
  const raw = (body && typeof body === "object" ? body : {}) as { actorUserId?: unknown; actorRole?: unknown };
  return {
    userId: typeof raw.actorUserId === "string" ? raw.actorUserId : null,
    role: raw.actorRole === "admin" ? "admin" : raw.actorRole === "player" ? "player" : null
  };
}

export default class MapsServer implements Party.Server {
  /** The library persists across hibernation; reloaded in onStart. */
  readonly options: Party.ServerOptions = { hibernate: true };

  private registry = new MapRegistry();

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    // Load every per-key map record.
    const perMap = await this.room.storage.list<SharedMapRecord>({ prefix: MAP_KEY_PREFIX });
    const merged = new Map<string, SharedMapRecord>();
    for (const record of perMap.values()) {
      if (record && typeof record.id === "string" && record.id.length > 0) {
        merged.set(record.id, record);
      }
    }
    // One-time migration from the old combined-array key. Records not already
    // present as per-key entries are written out; the marker stops this ever
    // running again, and the legacy blob is left in place as a backup.
    const migrated = await this.room.storage.get<boolean>(MIGRATED_MARKER_KEY);
    if (!migrated) {
      const legacy = await this.room.storage.get<SharedMapRecord[]>(LEGACY_STORAGE_KEY);
      const toWrite: Record<string, SharedMapRecord> = {};
      if (Array.isArray(legacy)) {
        for (const record of legacy) {
          if (record && typeof record.id === "string" && record.id.length > 0 && !merged.has(record.id)) {
            merged.set(record.id, record);
            toWrite[mapKey(record.id)] = record;
          }
        }
      }
      await this.putBatched(toWrite);
      await this.room.storage.put(MIGRATED_MARKER_KEY, true);
    }
    this.registry = new MapRegistry(merged.values());
  }

  /** Batched `put`, chunked to the Durable Object per-call key ceiling. */
  private async putBatched(entries: Record<string, SharedMapRecord>): Promise<void> {
    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i += STORAGE_PUT_BATCH) {
      const chunk: Record<string, SharedMapRecord> = {};
      for (const key of keys.slice(i, i + STORAGE_PUT_BATCH)) {
        chunk[key] = entries[key];
      }
      if (Object.keys(chunk).length > 0) {
        await this.room.storage.put(chunk);
      }
    }
  }

  /**
   * Plain HTTP, mirroring the built-in `/api/maps` surface so the client uses one
   * shape on both backends:
   *  - GET    → `{ maps }` (the whole library, newest first)
   *  - POST  <SharedMapRecord> → upsert one map → `{ ok, map, maps }`
   *  - DELETE { id }           → remove one map → `{ ok, maps }`
   *
   * The browser GETs this from a different origin than the app host, so every
   * response carries CORS headers exactly like the room/lobby parties.
   */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      return jsonWithCors({ maps: this.registry.list() });
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as unknown;
      const record = sanitizeSharedMap(body);
      if (!record) {
        return jsonWithCors({ ok: false, error: "A map needs a tiles array." }, 400);
      }
      const existing = this.registry.get(record.id);
      if (!actorMayModifyMap(existing, actorFromBody(body))) {
        return jsonWithCors({ ok: false, error: "Only the map's owner or an admin can edit this map." }, 403);
      }
      // Preserve the original owner + creation stamp on an edit; stamp the actor
      // as owner on a fresh create.
      stampSavedMapOwnership(record, existing, actorFromBody(body));
      const before = new Set(this.registry.records().map((map) => map.id));
      this.registry.upsert(record);
      // Persist only what changed: write the upserted map's own key, and delete
      // the keys of any maps the cap evicted. No whole-catalog rewrite.
      await this.room.storage.put(mapKey(record.id), record);
      const after = new Set(this.registry.records().map((map) => map.id));
      const evicted = [...before].filter((id) => !after.has(id));
      if (evicted.length > 0) {
        await this.room.storage.delete(evicted.map(mapKey));
      }
      return jsonWithCors({ ok: true, map: record, maps: this.registry.list() });
    }

    if (request.method === "DELETE") {
      const body = (await request.json().catch(() => null)) as { id?: string } | null;
      const id = body?.id ?? new URL(request.url).searchParams.get("id") ?? "";
      const existing = id ? this.registry.get(id) : undefined;
      if (existing && !actorMayModifyMap(existing, actorFromBody(body))) {
        return jsonWithCors(
          { ok: false, error: "Only the map's owner or an admin can delete this map.", maps: this.registry.list() },
          403
        );
      }
      if (id && this.registry.remove(id)) {
        await this.room.storage.delete(mapKey(id));
      }
      return jsonWithCors({ ok: true, maps: this.registry.list() });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
}

/** Public map library (no credentials), so a wildcard origin is safe. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonWithCors(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

MapsServer satisfies Party.Worker;
