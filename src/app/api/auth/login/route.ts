import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse, save, setSessionCookie } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** Authenticate by nickname/email + password; sets the httpOnly session cookie. */
export async function POST(request: Request) {
  try {
    // The store rate-limits per identifier; this per-IP bound stops an attacker
    // rotating identifiers to burn scrypt CPU or brute-force across accounts.
    enforceIpRate(request, "login", 20, 5 * 60_000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const store = getAccountBackend();
    const { token, profile } = await store.login({ identifier: body.identifier, password: body.password });
    save();
    const response = NextResponse.json({ profile });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
