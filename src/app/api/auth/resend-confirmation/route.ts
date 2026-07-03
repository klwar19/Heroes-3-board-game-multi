import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse, requestOrigin, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** Re-send a confirmation link (cooldown-limited in the store; IP-limited here). */
export async function POST(request: Request) {
  try {
    enforceIpRate(request, "resend", 5, 60_000);
    const body = (await request.json().catch(() => ({}))) as { email?: unknown };
    getAccountStore().resendConfirmation(body.email, requestOrigin(request) ?? undefined);
    save();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
