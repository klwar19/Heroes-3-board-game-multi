"use client";

import type { LobbyInvite } from "@/server/lobby-invites";

export type { LobbyInvite };

/**
 * Browser wrappers for the global lobby-invite REST endpoints
 * (/api/lobby-invites). Best-effort like presence/chat: a network hiccup just
 * means the next poll retries. Delivery is a popup on the invitee's client —
 * not only a lobby-chat line.
 */

export async function fetchLobbyInvites(clientId: string): Promise<LobbyInvite[]> {
  const response = await fetch(`/api/lobby-invites?clientId=${encodeURIComponent(clientId)}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Could not load invites.");
  }
  const data = (await response.json()) as { invites?: LobbyInvite[] };
  return data.invites ?? [];
}

export async function sendLobbyInvite(input: {
  fromClientId: string;
  fromName: string;
  toClientId: string;
  roomId?: string;
  roomName?: string;
}): Promise<LobbyInvite> {
  const response = await fetch("/api/lobby-invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = (await response.json().catch(() => ({}))) as { invite?: LobbyInvite; error?: string };
  if (!response.ok || !data.invite) {
    throw new Error(data.error ?? "Could not send the invite.");
  }
  return data.invite;
}

/** Accept or decline — drops the invite so it no longer pops on the next poll. */
export async function dismissLobbyInvite(input: {
  clientId: string;
  dismissId: string;
}): Promise<void> {
  try {
    await fetch("/api/lobby-invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch {
    /* best-effort — the invite will TTL out either way */
  }
}
