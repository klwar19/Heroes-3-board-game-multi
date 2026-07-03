import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { errorResponse, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Create an account and email a confirmation link. Returns the new (unconfirmed)
 * profile; the caller shows a "check your inbox" state. In dev with the capture
 * mail transport the confirmation link is echoed back so a local tester can
 * follow it without a real inbox — never in production.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const store = getAccountStore();
    const { profile, confirmation } = store.register({
      nickname: body.nickname,
      email: body.email,
      password: body.password,
      contact: body.contact
    });
    save();
    const devLink = process.env.HOMM3BG_MAIL_TRANSPORT === "capture" ? confirmation.link : undefined;
    return NextResponse.json({ profile, needsConfirmation: true, ...(devLink ? { devConfirmLink: devLink } : {}) });
  } catch (error) {
    return errorResponse(error);
  }
}
