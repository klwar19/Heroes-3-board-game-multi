/**
 * Server-side admin close of a PartyKit EDGE room.
 *
 * The cross-origin browser → edge DELETE path (src/lib/realtime.ts) has to prove
 * the caller is a platform admin to a Durable Object that cannot read the app's
 * login cookie, so it relies on a short-lived socket TICKET the edge verifies by
 * calling back to /api/auth/verify-token. That has several fragile links
 * (ticket store sharing across serverless instances, CORS on the cross-origin
 * DELETE, the browser's localStorage admin key) — any of which silently degrades
 * the admin to a guest and yields "Only members of this room can close it".
 *
 * This helper moves the whole operation SERVER-SIDE, off the same-origin app that
 * has ALREADY verified the admin from the httpOnly session cookie. It deletes the
 * edge room with BOTH credentials the edge accepts, so at least one works on any
 * deployment:
 *   - HOMM3BG_ADMIN_KEY — a shared secret checked directly against the edge's env
 *     (adminAuthorizes). Set the SAME value on the app AND the edge and admin
 *     delete works regardless of account backend or instance topology.
 *   - a freshly minted admin socket ticket — resolves on a shared account store
 *     (Supabase, the production path), so admin delete needs no extra config
 *     there. (On the in-memory built-in store across serverless instances a
 *     ticket may not resolve; that is exactly what HOMM3BG_ADMIN_KEY covers.)
 *
 * The app has already authorised the caller as an admin before calling this, so
 * this function only carries that authority to the edge — it performs no
 * authorisation of its own.
 */
import { getAccountBackend } from "./accounts/account-store-instance";

/** The PartyKit edge host, or null when the app runs its own in-process rooms. */
export function partyKitHost(): string | null {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  return host && host.trim().length > 0 ? host.trim() : null;
}

/** Whether rooms live on the cross-origin PartyKit edge (vs the built-in store). */
export function partyKitConfigured(): boolean {
  return partyKitHost() !== null;
}

function edgeProtocol(host: string): string {
  return host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
}

export type EdgeCloseResult = { forwarded: boolean; closed: boolean; reason?: string };

/**
 * Close (delete) a PartyKit edge room on behalf of an already-verified admin.
 * `adminSessionToken` is the caller's raw session token (from the cookie) — used
 * only to mint a matching socket ticket. Returns `forwarded: false` when no edge
 * is configured (the caller should fall back to the in-process store).
 */
export async function closeEdgeRoomAsAdmin(
  roomId: string,
  adminSessionToken: string | null
): Promise<EdgeCloseResult> {
  const host = partyKitHost();
  if (!host) {
    return { forwarded: false, closed: false };
  }
  const adminKey = process.env.HOMM3BG_ADMIN_KEY;
  // Best-effort ticket: covers a shared account store with zero extra config.
  let token: string | undefined;
  try {
    token = (await getAccountBackend().mintSocketTicket(adminSessionToken)) ?? undefined;
  } catch {
    token = undefined;
  }

  const url = new URL(`${edgeProtocol(host)}://${host}/parties/main/${encodeURIComponent(roomId)}`);
  if (token) {
    url.searchParams.set("token", token);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(adminKey ? { adminKey } : {}) })
    });
    const data = (await response.json().catch(() => ({}))) as { closed?: boolean; reason?: string };
    const closed = response.ok && data.closed !== false;
    if (closed) {
      return { forwarded: true, closed: true };
    }
    // The app already verified this caller as an admin, so a refusal here means
    // the EDGE could not confirm it — almost always because the edge and the app
    // disagree on the credentials. Turn the edge's terse "Only members…" into an
    // actionable message naming the two things that must both be true.
    const detail = data.reason ? ` (edge said: ${data.reason})` : "";
    const cause = adminKey
      ? "the room server was not redeployed since HOMM3BG_ADMIN_KEY was set, or its value does not match the app's"
      : "HOMM3BG_ADMIN_KEY is not set on the app, and the admin session ticket could not be verified by the edge";
    console.warn(`[admin-close] edge refused admin delete of ${roomId}: ${cause}${detail}`);
    return { forwarded: true, closed: false, reason: `The room server rejected the admin delete — ${cause}.${detail}` };
  } catch {
    return { forwarded: true, closed: false, reason: "Could not reach the room server to delete it." };
  }
}
