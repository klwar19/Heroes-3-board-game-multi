import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { clearSessionCookie, readSessionToken, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** Revoke the current session server-side and clear the cookie. */
export async function POST(request: Request) {
  await getAccountBackend().logout(readSessionToken(request));
  save();
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
