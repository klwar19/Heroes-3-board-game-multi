import { NextResponse } from "next/server";
import { LobbyChatError } from "@/server/lobby-chat";
import { getLobbyChatBoard } from "@/server/lobby-chat-instance";
import { LOBBY_SINGLETON_ID } from "@/server/lobby-registry";

export const dynamic = "force-dynamic";

const EDGE_TIMEOUT_MS = 8_000;

/**
 * The browser deliberately calls this same-origin route. In an edge-backed
 * deployment we relay to PartyKit server-to-server, so lobby chat stays durable
 * without exposing the browser to a second origin's CORS/TLS configuration.
 */
function edgeChatUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_PARTYKIT_HOST?.trim();
  if (!configured) return null;

  const withProtocol = /^https?:\/\//i.test(configured)
    ? configured
    : `${configured.startsWith("localhost") || configured.startsWith("127.") ? "http" : "https"}://${configured}`;
  try {
    const origin = new URL(withProtocol).origin;
    return `${origin}/parties/lobby-chat/${encodeURIComponent(LOBBY_SINGLETON_ID)}`;
  } catch {
    return null;
  }
}

async function relayToEdge(method: "GET" | "POST", body?: string): Promise<NextResponse> {
  const url = edgeChatUrl();
  if (!url) {
    return NextResponse.json({ error: "The multiplayer chat backend is not configured correctly." }, { status: 503 });
  }

  try {
    const response = await fetch(url, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS)
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) {
      return NextResponse.json(
        { error: "The multiplayer chat service returned an invalid response. Deploy the current PartyKit worker." },
        { status: 502 }
      );
    }
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "The multiplayer chat service is temporarily unreachable." }, { status: 503 });
  }
}

/** Recent lobby chat lines (oldest → newest). Polled by the /play room browser. */
export async function GET() {
  if (process.env.NEXT_PUBLIC_PARTYKIT_HOST?.trim()) {
    return relayToEdge("GET");
  }
  return NextResponse.json({ messages: getLobbyChatBoard().list() });
}

/** Post a lobby chat line. Body: { clientId, name, text }. */
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_PARTYKIT_HOST?.trim()) {
    return relayToEdge("POST", await request.text());
  }
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
