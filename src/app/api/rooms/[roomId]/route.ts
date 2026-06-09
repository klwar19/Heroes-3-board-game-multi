import { NextResponse } from "next/server";
import { getRoomSnapshot, resetRoom } from "@/server/game-room-store";

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
  const body = (await request.json().catch(() => ({}))) as { reset?: boolean };

  if (body.reset) {
    return NextResponse.json(resetRoom(decodeURIComponent(roomId)));
  }

  return NextResponse.json(getRoomSnapshot(decodeURIComponent(roomId)));
}
