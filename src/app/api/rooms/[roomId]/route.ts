import { NextResponse } from "next/server";
import { getRoomSnapshot, resetRoom, type RoomResetOptions } from "@/server/game-room-store";

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
  const body = (await request.json().catch(() => ({}))) as ({ reset?: boolean } & RoomResetOptions) | null;

  if (body?.reset) {
    return NextResponse.json(
      resetRoom(decodeURIComponent(roomId), {
        mode: body.mode,
        difficulty: body.difficulty,
        players: body.players
      })
    );
  }

  return NextResponse.json(getRoomSnapshot(decodeURIComponent(roomId)));
}
