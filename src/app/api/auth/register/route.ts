import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse, requestOrigin, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Create an account and email a confirmation link. Returns the new (unconfirmed)
 * profile; the caller shows a "check your inbox" state. In dev with the capture
 * mail transport the confirmation link is echoed back so a local tester can
 * follow it without a real inbox — never in production.
 */
export async function POST(request: Request) {
  try {
    // Every registration fires a real confirmation email and writes a permanent
    // account row — never leave it scriptable without a per-IP bound. Generous
    // enough for a game night behind one NAT (10 sign-ups / 10 min).
    enforceIpRate(request, "register", 10, 10 * 60_000);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const store = getAccountStore();
    const { profile, confirmation } = store.register(
      {
        nickname: body.nickname,
        email: body.email,
        password: body.password,
        contact: body.contact
      },
      requestOrigin(request) ?? undefined
    );
    save();
    const devLink = process.env.HOMM3BG_MAIL_TRANSPORT === "capture" ? confirmation.link : undefined;
    return NextResponse.json({ profile, needsConfirmation: true, ...(devLink ? { devConfirmLink: devLink } : {}) });
  } catch (error) {
    return errorResponse(error);
  }
}
