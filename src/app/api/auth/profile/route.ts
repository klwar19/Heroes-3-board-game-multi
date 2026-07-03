import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { errorResponse, requireSession, save } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** The signed-in owner's own profile (includes the private email). */
export async function GET(request: Request) {
  try {
    return NextResponse.json({ profile: requireSession(request) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Update the owner's editable contact fields. */
export async function PATCH(request: Request) {
  try {
    const me = requireSession(request);
    const body = (await request.json().catch(() => ({}))) as { contact?: unknown };
    const profile = getAccountStore().updateContact(me.id, body.contact);
    save();
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
