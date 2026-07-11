import { NextResponse } from "next/server";
import {
  accountsBackendKind,
  getAccountBackend,
  getAccountStore,
  persistAccounts
} from "@/server/accounts/account-store-instance";
import type { MatchParticipantInput } from "@/server/accounts/account-store";

export const dynamic = "force-dynamic";

const RESULTS = new Set(["win", "loss", "draw", "abandon"]);
const MAX_PARTICIPANTS = 12;

/**
 * Finished-match ingestion for the PartyKit edge (Phase 6). The room Durable
 * Object has no database access, so when a game ends there it POSTs the result
 * here; the built-in backend records matches in-process and never calls this.
 *
 * Trust boundary: the shared secret HOMM3BG_MATCH_REPORT_KEY (same value on the
 * app deployment and the party env) IS the authorization — with it you can
 * write ladder results, so treat it like any server credential. With the env
 * unset the route is a hard 403 (edge match reporting simply off), exactly like
 * the HOMM3BG_ADMIN_KEY convention. Idempotency is downstream: recordMatchResult
 * no-ops a repeated matchId on both backends, so redelivery cannot double-count.
 */
export async function POST(request: Request) {
  // Prefer the dedicated match-report secret; fall back to the admin break-glass
  // key so a deployment that already set HOMM3BG_ADMIN_KEY on both the app and
  // the party (for room moderation) still records finished games when the
  // match-report key was never configured. Either secret empty ⇒ still 403.
  const configured =
    (process.env.HOMM3BG_MATCH_REPORT_KEY || process.env.HOMM3BG_ADMIN_KEY || "").trim();
  const presented = request.headers.get("x-homm3bg-report-key") ?? "";
  if (configured.length === 0 || presented !== configured) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Match reporting is not enabled." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { matchId?: unknown; participants?: unknown; ranked?: unknown }
    | null;
  const matchId = typeof body?.matchId === "string" ? body.matchId.slice(0, 200) : "";
  // Casual games still record win/loss but leave MMR alone. Absent ⇒ ranked
  // (back-compat with edge deploys that predate the flag).
  const ranked = body?.ranked !== false;
  const rawParticipants = Array.isArray(body?.participants) ? body.participants : [];
  const participants: MatchParticipantInput[] = [];
  for (const entry of rawParticipants.slice(0, MAX_PARTICIPANTS)) {
    const accountId = typeof (entry as { accountId?: unknown }).accountId === "string" ? (entry as { accountId: string }).accountId : "";
    const result = (entry as { result?: unknown }).result;
    if (accountId && accountId.length <= 64 && typeof result === "string" && RESULTS.has(result)) {
      participants.push({ accountId, result: result as MatchParticipantInput["result"] });
    }
  }
  if (!matchId || participants.length < 2) {
    return NextResponse.json({ error: "INVALID", message: "A match needs a matchId and at least two participants." }, { status: 400 });
  }

  const outcome = await getAccountBackend().recordMatchResult({ matchId, participants, ranked });
  if (outcome.applied && accountsBackendKind() === "builtin") {
    persistAccounts(getAccountStore());
  }
  return NextResponse.json({ applied: outcome.applied });
}
