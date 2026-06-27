import type * as Party from "partykit/server";
import { MapRegistry, sanitizeSharedMap, type SharedMapRecord } from "@/server/map-registry";

/**
 * The shared map-library Durable Object — the edge backend's answer to the
 * built-in `/api/maps` store. It is one fixed singleton object addressed at
 * `/parties/maps/catalog`, holding every designed map so any player on any
 * browser can browse, open, edit, play, or delete them (maps are fully shared —
 * there is no per-map owner gate).
 *
 * It mirrors `party/lobby.ts`: the pure storage/sanitize/sort rules live in the
 * shared, unit-tested {@link MapRegistry}; this class is just its HTTP + storage
 * shell. Records survive hibernation in Durable Object storage.
 */

const STORAGE_KEY = "maps";

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
      // Editing keeps the original creation stamp rather than re-minting it.
      const existing = this.registry.get(record.id);
      if (existing) {
        record.createdAt = existing.createdAt;
      }
      this.registry.upsert(record);
      await this.persist();
      return jsonWithCors({ ok: true, map: record, maps: this.registry.list() });
    }

    if (request.method === "DELETE") {
      const body = (await request.json().catch(() => null)) as { id?: string } | null;
      const id = body?.id ?? new URL(request.url).searchParams.get("id") ?? "";
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
