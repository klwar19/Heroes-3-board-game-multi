import { NextResponse } from "next/server";
import {
  accountsBackendKind,
  getAccountBackend,
  getAccountStore,
  persistAccounts,
  supabaseConfigFromEnv,
} from "@/server/accounts/account-store-instance";
import type { MatchParticipantInput } from "@/server/accounts/account-store";
import { rankedReplayEnabled, type RankedReplay } from "@/server/ranked-replay";

export const dynamic = "force-dynamic";

const RESULTS = new Set(["win", "loss", "draw", "abandon"]);
const MAX_PARTICIPANTS = 12;
const MAX_REPORT_BODY_BYTES = 4_200_000;

async function readBoundedJson(request: Request): Promise<{ value: unknown; tooLarge: boolean }> {
  if (!request.body) return { value: null, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_REPORT_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { value: null, tooLarge: true };
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(joined)), tooLarge: false };
  } catch {
    return { value: null, tooLarge: false };
  }
}

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

  const parsed = await readBoundedJson(request);
  if (parsed.tooLarge) {
    return NextResponse.json({ error: "TOO_LARGE", message: "Match report exceeds the replay safety limit." }, { status: 413 });
  }
  const body = parsed.value as
    | { matchId?: unknown; participants?: unknown; ranked?: unknown; replay?: unknown }
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

  const replayRequired = ranked && rankedReplayEnabled(process.env.HOMM3BG_RANKED_REPLAY_ENABLED);
  let replayStored = !replayRequired;
  let replayStore: typeof import("@/server/ranked-replay-store") | null = null;
  let rankedReplay: RankedReplay | null = null;
  if (replayRequired) {
    if (!body?.replay || typeof body.replay !== "object") {
      return NextResponse.json(
        { error: "REPLAY_REQUIRED", message: "A ranked result is accepted only with its training replay." },
        { status: 400 },
      );
    }
    // Vercel's filesystem is ephemeral. Accepting a ranked result there while
    // Supabase is absent would acknowledge—and then lose—the only replay.
    if (process.env.VERCEL === "1" && !supabaseConfigFromEnv()) {
      return NextResponse.json(
        { error: "REPLAY_STORE_UNAVAILABLE", message: "Production Supabase replay storage is not configured." },
        { status: 503 },
      );
    }
    replayStore = await import("@/server/ranked-replay-store");
    rankedReplay = body.replay as RankedReplay;
    if (!replayStore.validRankedReplay(matchId, rankedReplay)) {
      return NextResponse.json(
        { error: "REPLAY_NOT_STORED", reason: "invalid" },
        { status: 400 },
      );
    }
  }

  // The replay table has a foreign key to this match row. If replay insertion
  // fails after this idempotent write, PartyKit's durable outbox retries; the
  // next request observes the duplicate match and fills the missing replay.
  const outcome = await getAccountBackend().recordMatchResult({ matchId, participants, ranked });
  if (outcome.applied && accountsBackendKind() === "builtin") {
    persistAccounts(getAccountStore());
  }
  if (replayRequired && replayStore && rankedReplay) {
    try {
      const stored = await replayStore.storeRankedReplay(matchId, rankedReplay);
      replayStored = stored.stored || stored.reason === "duplicate";
      if (!replayStored) {
        return NextResponse.json(
          { error: "REPLAY_NOT_STORED", reason: stored.reason ?? "unknown" },
          { status: 503 },
        );
      }
    } catch (error) {
      console.error(`[ranked-replay] failed to store ${matchId}:`, error);
      return NextResponse.json({ error: "REPLAY_STORE_FAILED" }, { status: 503 });
    }
  }
  return NextResponse.json({ applied: outcome.applied, replayStored });
}
