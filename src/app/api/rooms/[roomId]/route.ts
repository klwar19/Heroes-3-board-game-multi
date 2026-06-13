import { NextResponse } from "next/server";
import type { GameState } from "@/engine";
import { getRoomSnapshot, resetRoom, restoreRoom, type RoomResetOptions } from "@/server/game-room-store";

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
