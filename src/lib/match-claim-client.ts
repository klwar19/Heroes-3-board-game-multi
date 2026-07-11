/**
 * Browser-side dual-claim for finished matches — the backup path when the
 * PartyKit edge cannot POST /api/matches/report (missing report key). Each
 * signed-in participant posts once; the server parks the first claim and
 * records W/L when a second distinct participant confirms the same payload.
 *
 * Idempotent: the same matchId is claimed at most once per tab (ref), and the
 * server no-ops duplicates / already-recorded matches.
 */
import type { GameState } from "@/engine";
import { detectFinishedMatch, gameIsOver } from "@/server/match-report";

/** Match ids this tab already claimed (avoids re-POSTing on every snapshot). */
const claimedThisTab = new Set<string>();

/**
 * If `next` is a just-finished multiplayer match with verified seats, POST a
 * dual-claim. Safe to call on every snapshot; no-ops when already claimed,
 * not over, or the detector finds no recordable result.
 */
export function maybeClaimFinishedMatch(prev: GameState | null | undefined, next: GameState): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!gameIsOver(next) || (prev && gameIsOver(prev))) {
    return;
  }
  // Build a synthetic "not over" prev when the client has no prior frame
  // (reconnect into an already-finished game): still try to claim so a
  // late-joining peer / refresh can supply the second confirmation.
  const before: GameState = prev && !gameIsOver(prev)
    ? prev
    : ({
        ...next,
        phase: "player-turn",
        adventure: next.adventure
          ? { ...next.adventure, winnerPlayerId: null }
          : next.adventure
      } as GameState);

  const match = detectFinishedMatch(before, next);
  if (!match || claimedThisTab.has(match.matchId)) {
    return;
  }
  claimedThisTab.add(match.matchId);

  const body = {
    matchId: match.matchId,
    ranked: match.ranked,
    participants: match.participants.map(({ accountId, result }) => ({ accountId, result }))
  };
  void fetch("/api/matches/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  }).catch(() => {
    // Network blip: allow a later snapshot to retry this matchId.
    claimedThisTab.delete(match.matchId);
  });
}

/** Test helper: clear the per-tab claim set. */
export function resetMatchClaimClientForTests(): void {
  claimedThisTab.clear();
}
