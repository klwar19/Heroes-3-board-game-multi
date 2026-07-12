"use client";

import type { LobbyChatMessage } from "@/server/lobby-chat";
import { getPartyKitHost, partyLobbyChatUrl } from "@/lib/realtime";

export type { LobbyChatMessage };

/**
 * Browser wrappers for the global lobby chat feed. On the built-in backend this
 * hits the Next `/api/lobby-chat` route (an in-memory global on a single Node
 * server). On the PartyKit edge — where the Next API routes run as short-lived
 * serverless functions whose in-memory board is empty on a cold invocation, so a
 * posted line never survives to the next poll — it routes to the durable
 * lobby-chat Durable Object instead (party/lobby-chat.ts), exactly like
 * `fetchRoomList` uses the lobby directory object. Both are best-effort: a
 * network hiccup surfaces as a thrown error the caller can swallow.
 */
function lobbyChatEndpoint(): string {
  const host = getPartyKitHost();
  return host ? partyLobbyChatUrl(host) : "/api/lobby-chat";
}

export async function fetchLobbyChat(): Promise<LobbyChatMessage[]> {
  const response = await fetch(lobbyChatEndpoint(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load lobby chat.");
  }
  const data = (await response.json()) as { messages?: LobbyChatMessage[] };
  return data.messages ?? [];
}

export async function postLobbyChat(input: { clientId: string; name: string; text: string }): Promise<LobbyChatMessage> {
  const response = await fetch(lobbyChatEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = (await response.json().catch(() => ({}))) as { message?: LobbyChatMessage; error?: string };
  if (!response.ok || !data.message) {
    throw new Error(data.error ?? "Could not send the message.");
  }
  return data.message;
}
