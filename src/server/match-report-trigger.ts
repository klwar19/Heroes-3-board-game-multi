/**
 * The BUILT-IN backend's match-report trigger (Node side). Kept out of
 * match-report.ts on purpose: that module's pure detector is bundled into the
 * PartyKit Worker, and this one touches the account store (node:fs via the
 * file persistence) — the edge reports over HTTP to /api/matches/report
 * instead.
 */
import type { GameState } from "@/engine";
import {
  accountsBackendKind,
  getAccountBackend,
  getAccountStore,
  persistAccounts
} from "@/server/accounts/account-store-instance";
import { detectFinishedMatch, type FinishedMatch } from "./match-report";

/**
 * Detect + record, called by the room store after every successfully applied
 * action. A database/report error is logged and never breaks the action that
 * ended the game. Returns the pending write (the HTTP route awaits it so a
 * serverless host cannot freeze it away), or null when nothing ranked ended.
 */
export function reportFinishedMatch(prev: GameState, next: GameState): Promise<void> | null {
  const match = detectFinishedMatch(prev, next);
  if (!match) {
    return null;
  }
  return recordMatch(match).catch((error) => {
    console.error(`[match-report] failed to record match ${match.matchId}:`, error);
  });
}

async function recordMatch(match: FinishedMatch): Promise<void> {
  const result = await getAccountBackend().recordMatchResult({
    matchId: match.matchId,
    participants: match.participants.map(({ accountId, result }) => ({ accountId, result }))
  });
  if (result.applied && accountsBackendKind() === "builtin") {
    persistAccounts(getAccountStore());
  }
  if (result.applied) {
    console.log(
      `[match-report] recorded ${match.matchId}: ` +
        match.participants.map((p) => `${p.nickname}=${p.result}`).join(", ")
    );
  }
}
