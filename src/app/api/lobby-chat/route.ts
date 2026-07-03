import { NextResponse } from "next/server";
import { LobbyChatError } from "@/server/lobby-chat";
import { getLobbyChatBoard } from "@/server/lobby-chat-instance";

export const dynamic = "force-dynamic";

/** Recent lobby chat lines (oldest → newest). Polled by the /play room browser. */
export async function GET() {
  return NextResponse.json({ messages: getLobbyChatBoard().list() });
}

/** Post a lobby chat line. Body: { clientId, name, text }. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { clientId?: unknown; name?: unknown; text?: unknown }
    | null;
  try {
    const message = getLobbyChatBoard().post({
      clientId: body?.clientId,
      name: body?.name,
      text: body?.text
    });
    return NextResponse.json({ message });
  } catch (error) {
    const reason = error instanceof LobbyChatError ? error.message : "Could not send the message.";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}
