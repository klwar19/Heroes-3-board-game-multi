import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { errorResponse, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** Complete a password reset with the emailed token + a new password. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string; password?: unknown };
    const { profile } = getAccountStore().resetPassword(body.token ?? "", body.password);
    save();
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
