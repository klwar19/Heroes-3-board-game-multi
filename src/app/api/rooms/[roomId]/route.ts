import { NextResponse } from "next/server";
import type { GameState } from "@/engine";
import { closeRoom, getRoomSnapshot, resetRoom, restoreRoom, type RoomResetOptions } from "@/server/game-room-store";
import { readSessionToken, sessionProfile } from "@/server/accounts/http";
import { redactSnapshotForViewer } from "@/server/redact-snapshot";
import { closeEdgeRoomAsAdmin, partyKitConfigured } from "@/server/edge-close";

export const dynamic = "force-dynamic";

/** The VERIFIED account id for this request (httpOnly cookie), or undefined. */
async function verifiedUserId(request: Request): Promise<string | undefined> {
  try {
    return (await sessionProfile(request))?.id;
  } catch {
    return undefined;
  }
}

/**
 * Whether this request carries a signed-in PLATFORM ADMIN session. Resolved
 * server-side from the httpOnly session cookie (unforgeable — a client cannot
 * claim it), so a real admin may wipe/close ANY room, exactly like the
 * developer HOMM3BG_ADMIN_KEY env override. Returns false when accounts are off
 * or the caller is a guest / ordinary player.
 */
async function requestIsAdmin(request: Request): Promise<boolean> {
  try {
    return (await sessionProfile(request))?.role === "admin";
  } catch {
    return false;
  }
}

type RoomContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function GET(request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
  // Redact the snapshot to the requester's own seat (hosted rooms only), so a
  // poll / initial load leaks no opponent hidden info — same rule as the stream.
  const snapshot = getRoomSnapshot(decodeURIComponent(roomId));
  return NextResponse.json(redactSnapshotForViewer(snapshot, { clientId, userId: await verifiedUserId(request) }));
}

export async function POST(request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as
    | ({
        reset?: boolean;
        restore?: boolean;
        state?: GameState;
        actorClientId?: string;
        adminKey?: string;
      } & RoomResetOptions)
    | null;

  const actorClientId = typeof body?.actorClientId === "string" ? body.actorClientId : undefined;
  const viewer = { clientId: actorClientId, userId: await verifiedUserId(request) };

  if (body?.reset) {
    // resetRoom checks the actor against the host on hosted rooms (same rule
    // as DELETE/closeRoom): host while connected, any member once the host is
    // gone, the developer's HOMM3BG_ADMIN_KEY always.
    const result = resetRoom(
      decodeURIComponent(roomId),
      {
        mode: body.mode,
        difficulty: body.difficulty,
        players: body.players
      },
      actorClientId,
      typeof body.adminKey === "string" ? body.adminKey : undefined,
      await requestIsAdmin(request)
    );
    if (!result.reset) {
      return NextResponse.json({ reason: result.reason }, { status: 403 });
    }
    return NextResponse.json(redactSnapshotForViewer(result.snapshot, viewer));
  }

  // Client recovery: re-seed a room the server lost from the caller's cached
  // game (only applied over a fresh lobby, member-only on hosted rooms — see
  // restoreRoom).
  if (body?.restore && body.state) {
    return NextResponse.json(
      redactSnapshotForViewer(
        restoreRoom(decodeURIComponent(roomId), body.state, actorClientId),
        viewer
      )
    );
  }

  return NextResponse.json(redactSnapshotForViewer(getRoomSnapshot(decodeURIComponent(roomId)), viewer));
}

/**
 * Close (delete) a room for everyone. The caller's `actorClientId` (query or
 * JSON body) is checked against the room's host / membership in closeRoom, so a
 * non-host cannot delete a hosted room. Returns `{ closed, reason? }`.
 */
export async function DELETE(request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("actorClientId") ?? undefined;
  const body = (await request.json().catch(() => null)) as
    | { actorClientId?: string; adminKey?: string }
    | null;
  const actorClientId = typeof body?.actorClientId === "string" ? body.actorClientId : fromQuery;
  const adminKey = typeof body?.adminKey === "string" ? body.adminKey : undefined;
  const isAdmin = await requestIsAdmin(request);

  // Rooms live on the cross-origin PartyKit EDGE when it is configured, so the
  // built-in closeRoom below has no such room to delete. A signed-in admin's
  // authority is proven RIGHT HERE from the same-origin session cookie (reliable
  // — no cross-origin ticket needed), so we forward the delete to the edge with
  // the app's server-held credentials. This is the robust replacement for the
  // browser → edge admin delete that kept failing with "Only members of this
  // room can close it".
  if (isAdmin && partyKitConfigured()) {
    const forwarded = await closeEdgeRoomAsAdmin(decodeURIComponent(roomId), readSessionToken(request));
    if (forwarded.forwarded) {
      return NextResponse.json(
        { closed: forwarded.closed, reason: forwarded.reason },
        { status: forwarded.closed ? 200 : 403 }
      );
    }
  }

  const result = closeRoom(decodeURIComponent(roomId), actorClientId, adminKey, isAdmin);
  return NextResponse.json(result, { status: result.closed ? 200 : 403 });
}
