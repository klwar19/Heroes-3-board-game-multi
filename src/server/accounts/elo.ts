/**
 * Elo rating maths (plan §D5). Pure and self-contained so it is trivially
 * table-tested. K=32, floor 100. A multiplayer result is scored as the winner
 * playing one pairwise game against EACH loser (winner-takes-field): the
 * winner's delta is the sum over losers, each loser moves by their single pair.
 *
 * This is the rating groundwork. Auto-reporting a finished game from the engine
 * (detecting the terminal state in the action pipeline) is Phase 6 and is NOT
 * wired yet — the store exposes `recordMatchResult` so the maths + record
 * keeping are real and tested now, independent of that trigger.
 */
export const ELO_START = 1200;
export const ELO_K = 32;
export const ELO_FLOOR = 100;

/** Expected score of A vs B under the logistic Elo curve. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export type EloParticipant = {
  id: string;
  rating: number;
  /** 1 = win, 0 = loss (draws/abandon handled by the caller — see store). */
  result: "win" | "loss";
};

/**
 * Winner-takes-field pairwise Elo. Returns a new rating per participant. Exactly
 * one winner is expected; every other participant is a loser paired against the
 * winner. Ratings never fall below ELO_FLOOR.
 */
export function computeRatings(participants: EloParticipant[]): Map<string, number> {
  const result = new Map<string, number>();
  const winner = participants.find((p) => p.result === "win");
  const losers = participants.filter((p) => p.result === "loss");
  // Seed everyone at their current rating so non-winner/loser inputs pass through.
  for (const p of participants) {
    result.set(p.id, p.rating);
  }
  if (!winner || losers.length === 0) {
    // No decisive pairing (all-draw / no winner) — ratings unchanged.
    return result;
  }
  let winnerDelta = 0;
  for (const loser of losers) {
    const expWin = expectedScore(winner.rating, loser.rating);
    winnerDelta += ELO_K * (1 - expWin);
    const expLose = expectedScore(loser.rating, winner.rating);
    const loserNew = Math.max(ELO_FLOOR, Math.round(loser.rating + ELO_K * (0 - expLose)));
    result.set(loser.id, loserNew);
  }
  result.set(winner.id, Math.max(ELO_FLOOR, Math.round(winner.rating + winnerDelta)));
  return result;
}
