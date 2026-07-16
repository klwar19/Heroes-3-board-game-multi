import { NextResponse } from "next/server";
import { deleteSharedMap, listSharedMaps, saveSharedMap } from "@/server/shared-map-store";
import { sessionProfile } from "@/server/accounts/http";
import type { MapActor } from "@/server/map-registry";

export const dynamic = "force-dynamic";

/**
 * The built-in shared-map library HTTP surface, mirroring the PartyKit maps
 * Durable Object (`party/maps.ts`) so the browser client (`src/lib/shared-maps.ts`)
 * uses one shape on both backends:
 *
 *  - GET    → `{ maps }` (the whole library, newest first)
 *  - POST   <SharedMapRecord> → upsert one map → `{ ok, map, maps }`
 *  - DELETE { id }            → remove one map → `{ ok, maps }`
 *
 * Maps are shared to BROWSE and COPY freely, but a map created by a signed-in
 * player is OWNED: only its owner or an admin may edit (overwrite) or delete it.
 * Ownership is enforced from the authenticated session COOKIE here — the actor is
 * read from the server session, never trusted from the request body — so a client
 * cannot forge another user's identity on this backend. Unowned/legacy maps (and
 * every save made with accounts off) stay fully shared, unchanged.
 */

/** The acting user for a mutation, read from the authenticated session cookie. */
async function actorFromRequest(request: Request): Promise<MapActor> {
  const profile = await sessionProfile(request);
  return profile ? { userId: profile.id, role: profile.role } : { userId: null, role: null };
}

export async function GET() {
  return NextResponse.json({ maps: listSharedMaps() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const result = saveSharedMap(body, await actorFromRequest(request));
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.forbidden ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, map: result.map, maps: result.maps });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id ?? new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "An id is required." }, { status: 400 });
  }
  const result = deleteSharedMap(id, await actorFromRequest(request));
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, maps: result.maps }, { status: 403 });
  }
  return NextResponse.json({ ok: true, maps: result.maps });
}
