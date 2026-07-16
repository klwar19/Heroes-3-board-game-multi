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

const STORAGE_KEY = "maps";

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
    const stored = (await this.room.storage.get<SharedMapRecord[]>(STORAGE_KEY)) ?? [];
    this.registry = new MapRegistry(stored);
  }

  private async persist(): Promise<void> {
    await this.room.storage.put(STORAGE_KEY, this.registry.records());
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
      this.registry.upsert(record);
      await this.persist();
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
        await this.persist();
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
