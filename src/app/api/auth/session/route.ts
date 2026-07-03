import { NextResponse } from "next/server";
import { sessionProfile } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/** The signed-in profile for the current cookie, or `{ profile: null }`. */
export async function GET(request: Request) {
  return NextResponse.json({ profile: await sessionProfile(request) });
}
