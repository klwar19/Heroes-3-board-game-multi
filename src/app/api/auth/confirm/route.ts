import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { errorResponse, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Target of the confirmation email link (a browser GET). Confirms the account
 * and redirects to /login with a status flag the login screen shows. A bad or
 * expired token redirects to /login?confirm_error=<code> so the user can ask
 * for a fresh link instead of seeing raw JSON.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const origin = new URL(request.url).origin;
  try {
    await getAccountBackend().confirmEmail(token);
    save();
    return NextResponse.redirect(new URL("/login?confirmed=1", origin));
  } catch (error) {
    const body = (await errorResponse(error).json()) as { error?: string };
    return NextResponse.redirect(new URL(`/login?confirm_error=${encodeURIComponent(body.error ?? "TOKEN_INVALID")}`, origin));
  }
}

/** Programmatic confirmation (used by tests and any non-browser client). */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string };
    const { profile } = await getAccountBackend().confirmEmail(body.token ?? "");
    save();
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
