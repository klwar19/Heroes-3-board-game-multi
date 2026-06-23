import { NextResponse } from "next/server";
import type { GameState } from "@/engine";
import { closeRoom, getRoomSnapshot, resetRoom, restoreRoom, type RoomResetOptions } from "@/server/game-room-store";

export const dynamic = "force-dynamic";

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
    | ({ reset?: boolean; restore?: boolean; state?: GameState } & RoomResetOptions)
    | null;

  if (body?.reset) {
    return NextResponse.json(
      resetRoom(decodeURIComponent(roomId), {
        mode: body.mode,
        difficulty: body.difficulty,
        players: body.players
      })
    );
  }

  // Client recovery: re-seed a room the server lost from the caller's cached
  // game (only applied over a fresh lobby — see restoreRoom).
  if (body?.restore && body.state) {
    return NextResponse.json(restoreRoom(decodeURIComponent(roomId), body.state));
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
  const body = (await request.json().catch(() => null)) as { actorClientId?: string } | null;
  const actorClientId = typeof body?.actorClientId === "string" ? body.actorClientId : fromQuery;

  const result = closeRoom(decodeURIComponent(roomId), actorClientId);
  return NextResponse.json(result, { status: result.closed ? 200 : 403 });
}
