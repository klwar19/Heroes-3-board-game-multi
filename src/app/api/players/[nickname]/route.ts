import { NextResponse } from "next/server";
import { getAccountBackend } from "@/server/accounts/account-store-instance";
import { enforceIpRate, errorResponse } from "@/server/accounts/http";

export const dynamic = "force-dynamic";

/**
 * Public player profile by nickname — what makes other players' profiles
 * viewable (Hall of Fame rows, room member names link here). Returns only the
 * PUBLIC profile shape: nickname, rating record, member-since and the
 * owner-editable contact fields ("so other players can reach you") — never the
 * email, role internals or ban bookkeeping. Banned accounts read as not found,
 * matching their absence from the Hall of Fame. Rate-limited per IP: it is an
 * unauthenticated nickname-probe surface.
 */
export async function GET(request: Request, context: { params: Promise<{ nickname: string }> }) {
  try {
    enforceIpRate(request, "player-profile", 60, 60_000);
    const { nickname } = await context.params;
    const profile = await getAccountBackend().getProfileByNickname(decodeURIComponent(nickname));
    if (!profile || profile.bannedAt) {
      return NextResponse.json({ error: "NOT_FOUND", message: "No registered player with that nickname." }, { status: 404 });
    }
    return NextResponse.json({
      player: {
        nickname: profile.nickname,
        mmr: profile.mmr,
        wins: profile.wins,
        losses: profile.losses,
        matches: profile.matches,
        createdAt: profile.createdAt,
        contact: profile.contact
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
