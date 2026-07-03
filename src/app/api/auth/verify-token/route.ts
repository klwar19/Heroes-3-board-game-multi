import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Resolve a raw session token to its VERIFIED, non-secret identity
 * (`{ userId, nickname }`) — the callback the PartyKit edge uses to bind a
 * signed-in player to their seat (Phase 2), since a cross-origin Durable Object
 * cannot read the app's httpOnly session cookie. The BUILT-IN backend does not
 * need this route (it reads the cookie directly).
 *
 * Security: the token is presented in the body, not the cookie (the caller is
 * the party on the player's behalf). Knowledge of a valid token IS the
 * authorization — an attacker without one gets `null`, and one WITH a token
 * could already impersonate the user directly, so this reveals nothing new. It
 * returns only the non-secret public identity (never the email/role/hash) and
 * is IP-rate-limited to blunt blind probing.
 */
export async function POST(request: Request) {
  try {
    enforceIpRate(request, "verify-token", 120, 60_000);
  } catch (error) {
    return errorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) {
    return NextResponse.json({ userId: null }, { status: 200 });
  }

  // The party sends a short-lived socket TICKET; the same-origin caller may send
  // a raw session token. getVerifiedProfile resolves either.
  const profile = await getAccountBackend().getVerifiedProfile(token);
  if (!profile) {
    // A missing/expired/invalid token is not an error — the caller degrades to
    // guest. Same 200 shape so it cannot distinguish "no token" from "bad token".
    return NextResponse.json({ userId: null }, { status: 200 });
  }
  return NextResponse.json({ userId: profile.id, nickname: profile.nickname });
}
