import { NextResponse } from "next/server";
import { deleteSharedMap, listSharedMaps, saveSharedMap } from "@/server/shared-map-store";

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
 * Maps are fully shared: any client may save, edit, or delete any map.
 */
export async function GET() {
  return NextResponse.json({ maps: listSharedMaps() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const result = saveSharedMap(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, map: result.map, maps: result.maps });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id ?? new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "An id is required." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, maps: deleteSharedMap(id) });
}
