import type * as Party from "partykit/server";
import { LobbyRegistry, type LobbyRoomRecord } from "@/server/lobby-registry";

/**
 * The lobby / room-directory Durable Object — the edge backend's answer to the
 * built-in store's `listRooms`. PartyKit runs every game room as its own object
 * (one per `/parties/main/<roomId>`), so no single room can know what other
 * rooms exist. This one extra object, addressed at the fixed singleton id
 * `/parties/lobby/directory`, holds the registry of live rooms:
 *
 *  - Each game room reports its directory record here whenever something a
 *    browser would see in the lobby changes (name, members, host, phase), and
 *    deregisters when it closes — see `reportToLobby` / `deregisterFromLobby`
 *    in `party/index.ts`.
 *  - The browser's `fetchRoomList()` (src/lib/realtime.ts) GETs this object,
 *    so the lobby can finally BROWSE rooms on the edge instead of only joining
 *    by code.
 *
 * The directory rules (per-viewer canClose, stale-room expiry, sort) live in the
 * shared, unit-tested `LobbyRegistry`; this class is just its HTTP + storage
 * shell. Records survive hibernation in Durable Object storage.
 */

const STORAGE_KEY = "records";

export default class LobbyServer implements Party.Server {
  /** The directory persists across hibernation; reloaded in onStart. */
  readonly options: Party.ServerOptions = { hibernate: true };

  private registry = new LobbyRegistry();

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    const stored = (await this.room.storage.get<LobbyRoomRecord[]>(STORAGE_KEY)) ?? [];
    this.registry = new LobbyRegistry(stored);
  }

  private async persist(): Promise<void> {
    await this.room.storage.put(STORAGE_KEY, this.registry.records());
  }

  /** The deployment's admin key, used to authorize a system close of a room. */
  private adminKey(): string {
    const env = (this.room as unknown as { env?: Record<string, unknown> }).env;
    return typeof env?.HOMM3BG_ADMIN_KEY === "string" ? env.HOMM3BG_ADMIN_KEY : "";
  }

  /**
   * Force-close every room over an account's cap (the "auto-delete surplus"
   * half of the per-account room limit). A single room Durable Object can't see
   * its siblings, so this cross-room deletion lives here in the one lobby
   * singleton that holds every room's record. Each surplus room is closed via
   * its own DELETE endpoint using the deployment admin key (the same authority
   * the built-in backend's force-close uses); the room then deregisters itself.
   * Best-effort: with no admin key configured the room stays hidden by list()
   * and ages out via the stale TTL instead. Never throws — a failed close is
   * retried on the next report.
   */
  private async enforceRoomCaps(): Promise<void> {
    // Drop every over-cap room from the directory immediately (so it stops being
    // listed/joined even if the real close lags or no admin key is set)...
    const evicted = this.registry.enforceOwnerCaps();
    if (evicted.length === 0) {
      return;
    }
    await this.persist();
    // ...then force-close the real rooms with the deployment admin key.
    const adminKey = this.adminKey();
    const main = this.room.context?.parties?.main;
    if (!main || !adminKey) {
      return;
    }
    for (const roomId of evicted) {
      try {
        await main.get(roomId).fetch({
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminKey })
        });
      } catch {
        // Best effort; the next report re-attempts and list() keeps it hidden.
      }
    }
  }

  /**
   * Plain HTTP, mirroring the built-in `/api/rooms` surface so the client uses
   * one shape on both backends:
   *  - GET  ?clientId=… → `{ rooms, supported: true }` (the directory)
   *  - POST  <LobbyRoomRecord> → upsert one room (called by each room party)
   *  - DELETE { roomId }       → remove one room (called when a room closes)
   *
   * The browser GETs this from a different origin than the `*.partykit.dev`
   * host, so every response carries CORS headers (room rooms list, no
   * credentials) exactly like the room party's HTTP endpoints.
   */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      const viewerClientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
      const sizeBefore = this.registry.size;
      const rooms = this.registry.list(viewerClientId);
      // list() prunes stale rooms; only re-persist when it actually changed.
      if (this.registry.size !== sizeBefore) {
        await this.persist();
      }
      return jsonWithCors({ rooms, supported: true });
    }

    if (request.method === "POST") {
      const record = (await request.json().catch(() => null)) as LobbyRoomRecord | null;
      if (!record || typeof record.roomId !== "string" || record.roomId.length === 0) {
        return jsonWithCors({ ok: false, error: "A roomId is required." }, 400);
      }
      this.registry.upsert(record);
      await this.persist();
      // Auto-delete surplus: whenever a room reports itself, re-check the
      // per-account cap and force-close every room over it. list() already
      // hides surplus from the directory; this actually deletes the extra
      // rooms so they don't linger as running Durable Objects. Best-effort and
      // fire-and-forget so a slow/failed close never blocks the report.
      void this.enforceRoomCaps();
      return jsonWithCors({ ok: true });
    }

    if (request.method === "DELETE") {
      const body = (await request.json().catch(() => null)) as { roomId?: string } | null;
      const roomId = body?.roomId ?? new URL(request.url).searchParams.get("roomId") ?? undefined;
      if (roomId) {
        this.registry.remove(roomId);
        await this.persist();
      }
      return jsonWithCors({ ok: true });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
}

/** Public room directory (no credentials), so a wildcard origin is safe. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonWithCors(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

LobbyServer satisfies Party.Worker;
