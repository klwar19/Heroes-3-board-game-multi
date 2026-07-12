import { NextResponse } from "next/server";
import { LobbyInviteError } from "@/server/lobby-invites";
import { getLobbyInviteBoard } from "@/server/lobby-invites-instance";
import { getLobbyPresenceBoard } from "@/server/lobby-presence-instance";
import { sessionProfile } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

async function verifiedUserId(request: Request): Promise<string | undefined> {
  try {
    return (await sessionProfile(request))?.id;
  } catch {
    return undefined;
  }
}

/**
 * List pending invites for this tab. Query: ?clientId=…
 * The verified account id is resolved from the cookie so any of a signed-in
 * player's tabs receives invites addressed to their account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "A client id is required." }, { status: 400 });
  }
  const userId = await verifiedUserId(request);
  const invites = getLobbyInviteBoard().listFor(clientId, { userId });
  return NextResponse.json({ invites });
}

/**
 * Send a new invite OR dismiss one.
 *   { fromClientId, fromName, toClientId, roomId?, roomName? }  → send
 *   { clientId, dismissId }                                     → dismiss
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        fromClientId?: unknown;
        fromName?: unknown;
        toClientId?: unknown;
        roomId?: unknown;
        roomName?: unknown;
        clientId?: unknown;
        dismissId?: unknown;
      }
    | null;
  const board = getLobbyInviteBoard();
  const userId = await verifiedUserId(request);

  if (body?.dismissId) {
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const dismissId = typeof body.dismissId === "string" ? body.dismissId : "";
    if (!clientId || !dismissId) {
      return NextResponse.json({ error: "clientId and dismissId are required." }, { status: 400 });
    }
    board.dismiss(dismissId, clientId, { userId });
    return NextResponse.json({ ok: true, invites: board.listFor(clientId, { userId }) });
  }

  try {
    const toClientId = typeof body?.toClientId === "string" ? body.toClientId.trim() : "";
    // Stamp the invitee's account id when presence knows it, so every one of
    // their tabs (lobby + game) can receive the popup via listFor(userId).
    const toUserId = toClientId
      ? getLobbyPresenceBoard().userIdForClientId(toClientId)
      : undefined;

    const invite = board.send({
      fromClientId: body?.fromClientId,
      fromName: body?.fromName,
      toClientId: body?.toClientId,
      toUserId,
      roomId: body?.roomId,
      roomName: body?.roomName
    });
    return NextResponse.json({ invite });
  } catch (error) {
    const reason = error instanceof LobbyInviteError ? error.message : "Could not send the invite.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}
