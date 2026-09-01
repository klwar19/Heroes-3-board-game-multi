/**
 * Elo rating maths (plan §D5). Pure and self-contained so it is trivially
 * table-tested. K=32, floor 100. Two-player games use ordinary Elo. In games
 * with 3+ rated finishers, the winner receives one balanced Elo gain and every
 * loser pays a placement-weighted share of it. The runner-up loses the least,
 * last place loses the most, and the rounded result remains zero-sum.
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
  /** 1-based finishing place. Missing values retain stable input order. */
  placement?: number;
  mmrRole?: "winner" | "minor" | "last" | "neutral";
};

/**
 * Placement-aware Elo. Ratings never fall below ELO_FLOOR.
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
  if (participants.length >= 3) {
    const ordered = participants
      .map((participant, inputIndex) => ({ participant, inputIndex }))
      .sort((a, b) => {
        const aPlace = a.participant.placement ?? (a.participant.result === "win" ? 1 : Number.MAX_SAFE_INTEGER);
        const bPlace = b.participant.placement ?? (b.participant.result === "win" ? 1 : Number.MAX_SAFE_INTEGER);
        return aPlace - bPlace || a.inputIndex - b.inputIndex;
      })
      .map(({ participant }) => participant);
    const champion = ordered.find(
      (participant) => participant.mmrRole === "winner" && participant.result === "win",
    ) ?? ordered.find((participant) => participant.result === "win");
    if (!champion) return result;
    const rankedLosers = ordered.filter((participant) => participant !== champion && participant.result === "loss");
    if (rankedLosers.length === 0) return result;

    // A multiplayer win is worth one ordinary Elo result against the average
    // opposition. Adding one full K pairing per opponent made large tables
    // inflate wildly; this keeps a 3/4-player win comparable to a duel.
    const averageOpponent = rankedLosers.reduce((sum, participant) => sum + participant.rating, 0) / rankedLosers.length;
    const targetGain = Math.max(
      1,
      Math.round(ELO_K * (1 - expectedScore(champion.rating, averageOpponent))),
    );

    // Later finishing places carry a larger share. Equal placements receive
    // equal place weight; rating expectation then makes an over-rated loser pay
    // slightly more than an underdog without overwhelming the finish order.
    const distinctPlaces = [...new Set(rankedLosers.map((loser, index) => loser.placement ?? index + 2))]
      .sort((a, b) => a - b);
    const weights = rankedLosers.map((loser, index) => {
      const place = loser.placement ?? index + 2;
      const placementWeight = distinctPlaces.indexOf(place) + 1;
      // Keep rating strength a modest ±25% adjustment. Placement remains the
      // dominant signal, so an unusually high-rated runner-up cannot be charged
      // more than a lower finisher merely because of the pre-game ratings.
      const ratingFactor = 0.75 + 0.5 * expectedScore(loser.rating, champion.rating);
      return placementWeight * ratingFactor;
    });
    const losses = Array(rankedLosers.length).fill(0) as number[];
    let remaining = Math.min(
      targetGain,
      rankedLosers.reduce((sum, loser) => sum + Math.max(0, loser.rating - ELO_FLOOR), 0),
    );

    // Allocate one point at a time by greatest weighted deficit. The rating
    // changes are tiny (normally <= 16 total), so this is clearer and handles
    // floor-capped players without rounding drift or a non-zero-sum result.
    while (remaining > 0) {
      let pick = -1;
      let bestDeficit = Number.NEGATIVE_INFINITY;
      const weightTotal = weights.reduce((sum, weight, index) =>
        losses[index]! < Math.max(0, rankedLosers[index]!.rating - ELO_FLOOR) ? sum + weight : sum, 0);
      if (weightTotal <= 0) break;
      const allocated = losses.reduce((sum, loss) => sum + loss, 0);
      for (let index = 0; index < rankedLosers.length; index += 1) {
        const cap = Math.max(0, rankedLosers[index]!.rating - ELO_FLOOR);
        if (losses[index]! >= cap) continue;
        const ideal = ((allocated + 1) * weights[index]!) / weightTotal;
        const deficit = ideal - losses[index]!;
        if (deficit > bestDeficit) {
          bestDeficit = deficit;
          pick = index;
        }
      }
      if (pick < 0) break;
      losses[pick] += 1;
      remaining -= 1;
    }

    rankedLosers.forEach((loser, index) => {
      result.set(loser.id, loser.rating - losses[index]!);
    });
    const actualGain = losses.reduce((sum, loss) => sum + loss, 0);
    result.set(champion.id, champion.rating + actualGain);
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
