"use client";

import type { LobbyChatMessage } from "@/server/lobby-chat";

export type { LobbyChatMessage };

/**
 * Browser wrappers for the global lobby chat REST endpoints (/api/lobby-chat).
 * The feed is an ephemeral, in-memory global on the Next server — a restart
 * clears it, which is the intended "temporary" behaviour. Both are best-effort:
 * a network hiccup surfaces as a thrown error the caller can swallow.
 */
export async function fetchLobbyChat(): Promise<LobbyChatMessage[]> {
  const response = await fetch("/api/lobby-chat", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load lobby chat.");
  }
  const data = (await response.json()) as { messages?: LobbyChatMessage[] };
  return data.messages ?? [];
}

export async function postLobbyChat(input: { clientId: string; name: string; text: string }): Promise<LobbyChatMessage> {
  const response = await fetch("/api/lobby-chat", {
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
