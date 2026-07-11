"use client";

import type { PresenceEntry } from "@/server/lobby-presence";

export type { PresenceEntry };

/**
 * Browser wrappers for the global lobby presence endpoints (/api/lobby-presence)
 * — the "who is online right now" board. Best-effort like the lobby chat: a
 * network hiccup just means the next poll retries. The verified/guest flag is
 * decided server-side from the session cookie, so the client only sends WHO it
 * is and WHERE (which room, if any).
 */

export type PresenceHeartbeatInput = {
  clientId: string;
  name: string;
  /** The room the player is in, if any (absent ⇒ idling in the lobby). */
  roomId?: string;
  roomName?: string;
  /** "setup" = seating lobby, "playing" = game started (only when roomId set). */
  roomStatus?: "setup" | "playing";
};

/** The currently-online players (verified first). */
export async function fetchPresence(): Promise<PresenceEntry[]> {
  const response = await fetch("/api/lobby-presence", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load who is online.");
  }
  const data = (await response.json()) as { players?: PresenceEntry[] };
  return data.players ?? [];
}

/**
 * Send one heartbeat and get back the fresh online list (so a lobby poll can do
 * both in one round trip). Resolves to NULL on any failure — never an empty
 * list, so a transient network hiccup can't be mistaken for "nobody online"
 * (the lobby panel would flash empty for a poll cycle). Presence is decorative
 * and must never break the surface that calls it.
 */
export async function sendPresence(input: PresenceHeartbeatInput): Promise<PresenceEntry[] | null> {
  try {
    const response = await fetch("/api/lobby-presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { players?: PresenceEntry[] };
    return data.players ?? [];
  } catch {
    return null;
  }
}

/**
 * Best-effort "I'm leaving" so the player drops off the list immediately instead
 * of waiting out the TTL. Fire-and-forget; safe to call on unmount. Uses
 * sendBeacon when available so it still delivers during page unload.
 */
export function leavePresence(clientId: string): void {
  const payload = JSON.stringify({ clientId, leave: true });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/lobby-presence", new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch("/api/lobby-presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
