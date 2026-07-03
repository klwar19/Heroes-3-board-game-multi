import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse, requestOrigin, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Request a password-reset email. Always returns ok (no account enumeration):
 * a link is issued only if the address exists, but the response never says so.
 */
export async function POST(request: Request) {
  try {
    enforceIpRate(request, "reset", 5, 60_000);
    const body = (await request.json().catch(() => ({}))) as { email?: unknown };
    await getAccountBackend().requestPasswordReset(body.email, requestOrigin(request) ?? undefined);
    save();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
