import { NextResponse } from "next/server";
import { submitRoomAction } from "@/server/game-room-store";
import { sessionProfile } from "@/server/accounts/http";
import { redactSnapshotForViewer } from "@/server/redact-snapshot";
import type { GameAction } from "@/engine";

export const dynamic = "force-dynamic";

type RoomContext = {
  params: Promise<{
    roomId: string;
  }>;
};

/**
 * The VERIFIED account id for this request, resolved server-side from the
 * httpOnly session cookie (Phase 2 — verified-identity seats). It is
 * unforgeable: a client cannot set it, only present a session the server
 * validates. Passed to the engine as the authoritative actor identity so a
 * spoofed `actorClientId` can no longer act for a signed-in player's seat.
 * Returns undefined for a guest (accounts off, or not signed in).
 */
async function verifiedUserId(request: Request): Promise<string | undefined> {
  try {
    return (await sessionProfile(request))?.id;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { action?: GameAction; actorClientId?: string }
    | null;

  if (!body?.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  const actorClientId = typeof body.actorClientId === "string" ? body.actorClientId : undefined;
  const actorUserId = await verifiedUserId(request);
  const response = submitRoomAction(decodeURIComponent(roomId), body.action, actorClientId, actorUserId);
  // If this action just ENDED the game, hold the response for the ladder write
  // (Phase 6) — a serverless host may freeze the instance the moment the
  // response is sent, which would drop a floated match report.
  if (response.pendingMatchReport) {
    await response.pendingMatchReport;
  }
  // Redact BOTH the returned snapshot AND the EngineResult's `state` to the
  // ACTING client's own seat (hosted rooms only). result.state is the full
  // GameState — leaving it raw would leak opponents' hidden info in the action
  // response even though the snapshot is redacted.
  const redactedSnapshot = redactSnapshotForViewer(response.snapshot, {
    clientId: actorClientId,
    userId: actorUserId
  });
  return NextResponse.json({
    snapshot: redactedSnapshot,
    result: { ...response.result, state: redactedSnapshot.state }
  });
}
