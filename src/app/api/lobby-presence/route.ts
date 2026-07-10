import { NextResponse } from "next/server";
import { LobbyPresenceError } from "@/server/lobby-presence";
import { getLobbyPresenceBoard } from "@/server/lobby-presence-instance";
import { sessionProfile } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * The VERIFIED account id for this heartbeat, resolved SERVER-side from the
 * same-origin httpOnly session cookie — never the request body. This is what
 * makes the "verified" badge in the Players-online panel trustworthy (and
 * consistent with the room roster's guest flag): a client cannot claim to be a
 * signed-in account it isn't. Undefined for a guest / signed-out / accounts-off.
 */
async function verifiedUserId(request: Request): Promise<string | undefined> {
  try {
    return (await sessionProfile(request))?.id;
  } catch {
    return undefined;
  }
}

/** The players online right now (verified first). Polled by the lobby. */
export async function GET() {
  return NextResponse.json({ players: getLobbyPresenceBoard().list() });
}

/**
 * A presence heartbeat (upsert) or a clean leave. Body:
 *   { clientId, name, roomId?, roomName? }         → heartbeat
 *   { clientId, leave: true }                       → drop this client
 * The account id is resolved from the cookie, so the body never carries it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { clientId?: unknown; name?: unknown; roomId?: unknown; roomName?: unknown; leave?: unknown }
    | null;
  const board = getLobbyPresenceBoard();
  const userId = await verifiedUserId(request);

  if (body?.leave) {
    const clientId = typeof body.clientId === "string" ? body.clientId : undefined;
    board.remove(clientId, userId);
    return NextResponse.json({ ok: true });
  }

  try {
    const player = board.heartbeat({
      clientId: body?.clientId,
      name: body?.name,
      roomId: body?.roomId,
      roomName: body?.roomName,
      userId
    });
    return NextResponse.json({ player, players: board.list() });
  } catch (error) {
    const reason = error instanceof LobbyPresenceError ? error.message : "Could not update presence.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}
