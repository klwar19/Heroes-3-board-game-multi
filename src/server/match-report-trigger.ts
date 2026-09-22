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
import { detectFinishedDesignedMap, detectFinishedMatch, type FinishedMatch } from "./match-report";
import { storeRankedReplay } from "./ranked-replay-store";
import type { RankedReplay } from "./ranked-replay";
import { recordSharedMapFinishedGame } from "./shared-map-store";

/**
 * Detect + record, called by the room store after every successfully applied
 * action. A database/report error is logged and never breaks the action that
 * ended the game. Returns the pending write (the HTTP route awaits it so a
 * serverless host cannot freeze it away), or null when nothing ranked ended.
 */
export function reportFinishedMatch(
  prev: GameState,
  next: GameState,
  replay?: RankedReplay | null,
): Promise<void> | null {
  const match = detectFinishedMatch(prev, next);
  const mapFinish = detectFinishedDesignedMap(prev, next);
  if (!match && !mapFinish) {
    return null;
  }
  return Promise.all([
    match ? recordMatch(match, replay) : Promise.resolve(),
    mapFinish
      ? Promise.resolve(recordSharedMapFinishedGame(mapFinish.mapId, mapFinish.matchId)).then(() => undefined)
      : Promise.resolve()
  ]).then(() => undefined).catch((error) => {
    console.error(`[match-report] failed to record match ${next.seed}:`, error);
  });
}

async function recordMatch(match: FinishedMatch, replay?: RankedReplay | null): Promise<void> {
  const result = await getAccountBackend().recordMatchResult({
    matchId: match.matchId,
    ranked: match.ranked,
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
  if (match.ranked && replay) {
    try {
      await storeRankedReplay(match.matchId, replay);
    } catch (error) {
      console.error(`[ranked-replay] failed to store ${match.matchId}:`, error);
    }
  }
}
