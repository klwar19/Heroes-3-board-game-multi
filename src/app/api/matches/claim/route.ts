import { NextResponse } from "next/server";
import {
  accountsBackendKind,
  getAccountBackend,
  getAccountStore,
  persistAccounts
} from "@/server/accounts/account-store-instance";
import { sessionProfile } from "@/server/accounts/http";
import { validateMatchClaim } from "@/server/match-claim";

export const dynamic = "force-dynamic";

/**
 * Participant dual-claim ladder report — the browser-side backup when the
 * PartyKit edge cannot POST to /api/matches/report (missing
 * HOMM3BG_MATCH_REPORT_KEY). Authenticated by the session cookie (not the
 * shared report key): the claimer must be a participant, and a second
 * distinct participant must confirm the same payload before W/L is applied.
 *
 * Clients call this once when they observe a game-over transition; both
 * seats submitting is enough to record even when the edge reporter is off.
 */
export async function POST(request: Request) {
  const profile = await sessionProfile(request);
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Sign in to claim a match result." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { matchId?: unknown; ranked?: unknown; participants?: unknown }
    | null;
  const validated = validateMatchClaim(profile.id, body ?? {});
  if (!validated.ok) {
    return NextResponse.json({ error: "INVALID", message: validated.reason }, { status: 400 });
  }

  const outcome = await getAccountBackend().claimMatchResult({
    claimerAccountId: profile.id,
    matchId: validated.claim.matchId,
    ranked: validated.claim.ranked,
    participants: validated.claim.participants
  });

  if (outcome.status === "recorded" && accountsBackendKind() === "builtin") {
    persistAccounts(getAccountStore());
  }
  // Also persist when only parking a claim so a cold start doesn't lose it.
  if (outcome.status === "pending" && accountsBackendKind() === "builtin") {
    persistAccounts(getAccountStore());
  }

  return NextResponse.json(outcome);
}
