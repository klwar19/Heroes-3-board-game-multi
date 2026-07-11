import { NextResponse } from "next/server";
import { createRoom, listRooms, type RoomCreateOptions } from "@/server/game-room-store";

export const dynamic = "force-dynamic";

/** Lobby room directory: every active room with enough detail to pick one. */
export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
  return NextResponse.json({ rooms: listRooms(clientId) });
}

/**
 * Create a brand-new room. Body may carry a `name`, `createdByName`, an explicit
 * `roomId`, and the usual reset options (mode/difficulty/scenario). Returns the
 * created room id and its first snapshot.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as
    | (RoomCreateOptions & { roomId?: string })
    | null;

  const snapshot = createRoom({
    roomId: typeof body?.roomId === "string" ? body.roomId : undefined,
    name: typeof body?.name === "string" ? body.name : undefined,
    createdByName: typeof body?.createdByName === "string" ? body.createdByName : undefined,
    mode: body?.mode,
    difficulty: body?.difficulty,
    scenarioId: body?.scenarioId,
    players: body?.players,
    sessionMode: body?.sessionMode,
    computerOpponents: body?.computerOpponents,
    ...(typeof body?.ranked === "boolean" ? { ranked: body.ranked } : {})
  });

  return NextResponse.json({ roomId: snapshot.roomId, snapshot });
}
