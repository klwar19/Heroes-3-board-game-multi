import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Nickname/email availability for the register form's inline feedback. Reveals
 * email-taken deliberately (owner requirement, §D1) — rate-limited per IP to
 * bound the accepted enumeration surface.
 */
export async function POST(request: Request) {
  try {
    enforceIpRate(request, "availability", 30, 60_000);
    const body = (await request.json().catch(() => ({}))) as { nickname?: unknown; email?: unknown };
    const result = await getAccountBackend().checkAvailability({ nickname: body.nickname, email: body.email });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
