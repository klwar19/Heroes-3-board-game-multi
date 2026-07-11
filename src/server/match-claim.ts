/**
 * Participant dual-claim match reporting — the backup path that records a
 * finished game when the PartyKit edge cannot POST (missing
 * HOMM3BG_MATCH_REPORT_KEY) or the in-process reporter never ran.
 *
 * Security model (deliberately stricter than a single-client report):
 *  - the claimer must be a signed-in participant of the match;
 *  - the first claim parks a pending row (no W/L yet);
 *  - a SECOND distinct participant must submit an IDENTICAL payload before
 *    `recordMatchResult` runs — so one account cannot invent wins/losses for
 *    others. Multi-account collusion can still farm (true of any ladder);
 *  - once recorded, further claims no-op via the matchId idempotency gate.
 *
 * Durable on BOTH backends: the built-in store keeps pending claims in memory
 * (persisted with accounts.json); Supabase stores one claim-row per
 * (matchId, accountId) inside the matches table under a reserved id prefix
 * and promotes when two agree.
 */
import type { MatchParticipantInput, RecordMatchResult } from "@/server/accounts/account-store";
import type { FinishedMatch } from "@/server/match-report";

/**
 * Reserved match_id prefix for pending dual-claim rows (never a real game seed).
 * Uses a trailing colon so a PostgREST `like` filter can list every claim for
 * one match without colliding with real room seeds (`room-…`).
 */
export const MATCH_CLAIM_ID_PREFIX = "claim:";

export type MatchClaimInput = {
  matchId: string;
  ranked: boolean;
  participants: MatchParticipantInput[];
};

export type MatchClaimOutcome = {
  status: "pending" | "recorded" | "already-recorded" | "rejected";
  /** Why rejected / how many distinct claims parked so far. */
  detail?: string;
  result?: RecordMatchResult;
};

/** Stable fingerprint so two clients must agree on the exact outcome. */
export function matchClaimFingerprint(input: MatchClaimInput): string {
  const parts = [...input.participants]
    .map((p) => `${p.accountId}:${p.result}`)
    .sort();
  return `${input.ranked ? "R" : "N"}|${parts.join(",")}`;
}

export function claimRowId(matchId: string, accountId: string): string {
  // claim:<matchId>:<accountId> — account ids are opaque and matchIds use
  // [A-Za-z0-9_-], so a single colon separator stays unambiguous.
  return `${MATCH_CLAIM_ID_PREFIX}${matchId}:${accountId}`;
}

export function isClaimRowId(matchId: string): boolean {
  return matchId.startsWith(MATCH_CLAIM_ID_PREFIX);
}

/** PostgREST `like` pattern that matches every claim row for one game seed. */
export function claimRowsLikePattern(matchId: string): string {
  return `${MATCH_CLAIM_ID_PREFIX}${matchId}:*`;
}

/**
 * Validate a client-submitted claim and return a normalized payload, or a
 * rejection reason. Pure — no I/O.
 */
export function validateMatchClaim(
  claimerAccountId: string,
  body: { matchId?: unknown; ranked?: unknown; participants?: unknown }
): { ok: true; claim: MatchClaimInput } | { ok: false; reason: string } {
  const matchId = typeof body.matchId === "string" ? body.matchId.slice(0, 200) : "";
  if (!matchId || isClaimRowId(matchId)) {
    return { ok: false, reason: "Invalid matchId." };
  }
  const ranked = body.ranked !== false;
  const raw = Array.isArray(body.participants) ? body.participants : [];
  const participants: MatchParticipantInput[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, 12)) {
    const accountId =
      typeof (entry as { accountId?: unknown }).accountId === "string"
        ? (entry as { accountId: string }).accountId.slice(0, 64)
        : "";
    const result = (entry as { result?: unknown }).result;
    if (
      !accountId ||
      seen.has(accountId) ||
      typeof result !== "string" ||
      !["win", "loss", "draw", "abandon"].includes(result)
    ) {
      continue;
    }
    seen.add(accountId);
    participants.push({ accountId, result: result as MatchParticipantInput["result"] });
  }
  if (participants.length < 2) {
    return { ok: false, reason: "A match needs at least two participants." };
  }
  if (!participants.some((p) => p.accountId === claimerAccountId)) {
    return { ok: false, reason: "You are not a participant of this match." };
  }
  const hasWinner = participants.some((p) => p.result === "win");
  const hasLoser = participants.some((p) => p.result === "loss" || p.result === "abandon");
  if (!hasWinner || !hasLoser) {
    return { ok: false, reason: "A match needs a winner and a loser." };
  }
  return { ok: true, claim: { matchId, ranked, participants } };
}

/** Build the claim body a client should POST from a FinishedMatch. */
export function finishedMatchToClaimBody(match: FinishedMatch): MatchClaimInput {
  return {
    matchId: match.matchId,
    ranked: match.ranked,
    participants: match.participants.map(({ accountId, result }) => ({ accountId, result }))
  };
}

/**
 * In-memory pending-claim board used by the built-in account store (and tests).
 * Keyed by matchId → fingerprint → set of claimer account ids.
 */
export class PendingMatchClaimBoard {
  private readonly byMatch = new Map<string, { fingerprint: string; claimers: Set<string>; claim: MatchClaimInput }>();

  /**
   * Register a claim. Returns how many distinct claimers now agree on this
   * fingerprint for the matchId (0 if this claim conflicts with an earlier
   * fingerprint — the earlier one wins until expiry/restart).
   */
  add(claimerAccountId: string, claim: MatchClaimInput): { claimers: number; fingerprint: string } {
    const fingerprint = matchClaimFingerprint(claim);
    const existing = this.byMatch.get(claim.matchId);
    if (!existing) {
      this.byMatch.set(claim.matchId, {
        fingerprint,
        claimers: new Set([claimerAccountId]),
        claim
      });
      return { claimers: 1, fingerprint };
    }
    if (existing.fingerprint !== fingerprint) {
      // Conflicting payload — do not mix. First claimer set wins until cleared.
      return { claimers: existing.claimers.size, fingerprint: existing.fingerprint };
    }
    existing.claimers.add(claimerAccountId);
    return { claimers: existing.claimers.size, fingerprint };
  }

  get(matchId: string): { claim: MatchClaimInput; claimers: string[] } | null {
    const row = this.byMatch.get(matchId);
    if (!row) {
      return null;
    }
    return { claim: row.claim, claimers: [...row.claimers] };
  }

  clear(matchId: string): void {
    this.byMatch.delete(matchId);
  }

  /** Snapshot for account-store persistence. */
  toJSON(): { matchId: string; fingerprint: string; claimers: string[]; claim: MatchClaimInput }[] {
    return [...this.byMatch.entries()].map(([matchId, row]) => ({
      matchId,
      fingerprint: row.fingerprint,
      claimers: [...row.claimers],
      claim: row.claim
    }));
  }

  loadJSON(rows: { matchId: string; fingerprint: string; claimers: string[]; claim: MatchClaimInput }[]): void {
    this.byMatch.clear();
    for (const row of rows) {
      if (!row?.matchId || !row.claim) {
        continue;
      }
      this.byMatch.set(row.matchId, {
        fingerprint: row.fingerprint,
        claimers: new Set(row.claimers ?? []),
        claim: row.claim
      });
    }
  }
}

/**
 * Park a dual-claim on the board. Returns "ready" with the agreed claim when
 * enough distinct participants have submitted the same fingerprint (caller then
 * runs recordMatchResult). Pure board mutation — no I/O.
 */
export function parkDualClaim(
  claimerAccountId: string,
  claim: MatchClaimInput,
  board: PendingMatchClaimBoard,
  /** How many distinct agreeing claimers are required to record. Default 2. */
  requiredClaimers = 2
):
  | { status: "pending"; detail: string; claimers: number }
  | { status: "ready"; claim: MatchClaimInput; claimers: number }
  | { status: "rejected"; detail: string } {
  const fingerprint = matchClaimFingerprint(claim);
  const { claimers, fingerprint: parkedFingerprint } = board.add(claimerAccountId, claim);
  if (parkedFingerprint !== fingerprint) {
    return { status: "rejected", detail: "Claim conflicts with an earlier report for this match." };
  }
  if (claimers < requiredClaimers) {
    return {
      status: "pending",
      detail: `Waiting for ${requiredClaimers - claimers} more participant(s) to confirm.`,
      claimers
    };
  }
  const parked = board.get(claim.matchId);
  if (!parked) {
    return { status: "rejected", detail: "Claim board lost the match." };
  }
  return { status: "ready", claim: parked.claim, claimers };
}
