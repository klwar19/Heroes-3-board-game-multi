import { NextResponse } from "next/server";
import { recordDesignedMapFinish } from "@/server/map-finish-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Trusted game-server endpoint; browser clients cannot inflate popularity. */
export async function POST(request: Request) {
  const configured =
    (process.env.HOMM3BG_MATCH_REPORT_KEY || process.env.HOMM3BG_ADMIN_KEY || "").trim();
  if (!configured || request.headers.get("x-homm3bg-report-key") !== configured) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { mapId?: unknown; matchId?: unknown }
    | null;
  const mapId = typeof body?.mapId === "string" ? body.mapId.slice(0, 120) : "";
  const matchId = typeof body?.matchId === "string" ? body.matchId.slice(0, 200) : "";
  if (!mapId || !matchId) {
    return NextResponse.json({ ok: false, error: "INVALID" }, { status: 400 });
  }
  try {
    await recordDesignedMapFinish(mapId, matchId, configured);
  } catch (error) {
    console.error(`[map-stats] failed to record ${matchId} on ${mapId}:`, error);
    return NextResponse.json({ ok: false, error: "REPORT_FAILED" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
