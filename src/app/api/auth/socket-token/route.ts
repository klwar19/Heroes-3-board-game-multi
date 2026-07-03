import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { readSessionToken } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Mint a short-lived SOCKET TICKET for the signed-in caller (Phase 2). The
 * browser can't read its own httpOnly session cookie, so it can't attach the
 * session to a cross-origin PartyKit socket. Instead it calls this same-origin
 * endpoint (the cookie rides along automatically), gets a throwaway ticket, and
 * attaches THAT to the edge socket — which the party verifies via
 * /api/auth/verify-token. The long-lived session never becomes JS-readable.
 *
 * Returns `{ token: null }` (401) for a guest / no session, so guests simply
 * connect without a ticket (guest behaviour, unchanged).
 */
export async function GET(request: Request) {
  const ticket = await getAccountBackend().mintSocketTicket(readSessionToken(request));
  if (!ticket) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  // No save() here: the built-in store deliberately keeps tickets in memory
  // only (minutes-lived), and the Supabase backend already wrote its row.
  return NextResponse.json({ token: ticket });
}
