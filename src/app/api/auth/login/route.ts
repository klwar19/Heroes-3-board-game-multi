import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { errorResponse, save, setSessionCookie } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** Authenticate by nickname/email + password; sets the httpOnly session cookie. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const store = getAccountStore();
    const { token, profile } = store.login({ identifier: body.identifier, password: body.password });
    save();
    const response = NextResponse.json({ profile });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
