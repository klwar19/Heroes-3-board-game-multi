import { NextResponse } from "next/server";
import type { GameState } from "@/engine";
import { closeRoom, getRoomSnapshot, resetRoom, restoreRoom, type RoomResetOptions } from "@/server/game-room-store";
import { sessionProfile } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Whether this request carries a signed-in PLATFORM ADMIN session. Resolved
 * server-side from the httpOnly session cookie (unforgeable — a client cannot
 * claim it), so a real admin may wipe/close ANY room, exactly like the
 * developer HOMM3BG_ADMIN_KEY env override. Returns false when accounts are off
 * or the caller is a guest / ordinary player.
 */
function requestIsAdmin(request: Request): boolean {
  try {
    return sessionProfile(request)?.role === "admin";
  } catch {
    return false;
  }
}

type RoomContext = {
  params: Promise<{
    roomId: string;
  }>;
};

export async function GET(_request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  return NextResponse.json(getRoomSnapshot(decodeURIComponent(roomId)));
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
      typeof body.actorClientId === "string" ? body.actorClientId : undefined,
      typeof body.adminKey === "string" ? body.adminKey : undefined,
      requestIsAdmin(request)
    );
    if (!result.reset) {
      return NextResponse.json({ reason: result.reason }, { status: 403 });
    }
    return NextResponse.json(result.snapshot);
  }

  // Client recovery: re-seed a room the server lost from the caller's cached
  // game (only applied over a fresh lobby, member-only on hosted rooms — see
  // restoreRoom).
  if (body?.restore && body.state) {
    return NextResponse.json(
      restoreRoom(
        decodeURIComponent(roomId),
        body.state,
        typeof body.actorClientId === "string" ? body.actorClientId : undefined
      )
    );
  }

  return NextResponse.json(getRoomSnapshot(decodeURIComponent(roomId)));
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

  const result = closeRoom(decodeURIComponent(roomId), actorClientId, adminKey, requestIsAdmin(request));
  return NextResponse.json(result, { status: result.closed ? 200 : 403 });
}
