import { NextResponse } from "next/server";
import { submitRoomAction, type GameRoomSnapshot } from "@/server/game-room-store";
import type { EngineResult, GameAction } from "@/engine";

export const dynamic = "force-dynamic";

type RoomContext = {
  params: Promise<{
    roomId: string;
  }>;
};

type ActionResponse = {
  snapshot: GameRoomSnapshot;
  result: EngineResult;
};

export async function POST(request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: GameAction } | null;

  if (!body?.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  const response: ActionResponse = submitRoomAction(decodeURIComponent(roomId), body.action);
  return NextResponse.json(response);
}
