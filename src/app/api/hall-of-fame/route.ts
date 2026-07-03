import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";

export const dynamic = "force-dynamic";

/** Public leaderboard: nickname, MMR, W/L, matches — banned accounts excluded. */
export async function GET() {
  const players = getAccountStore()
    .hallOfFame()
    .map((p) => ({ nickname: p.nickname, mmr: p.mmr, wins: p.wins, losses: p.losses, matches: p.matches }));
  return NextResponse.json({ players });
}
