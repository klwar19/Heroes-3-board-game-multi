/**
 * Elo rating maths (plan §D5). Pure and self-contained so it is trivially
 * table-tested. K=32, floor 100. Two-player games use ordinary Elo. In games
 * with 3+ rated finishers, only last place loses MMR and that zero-sum pool is
 * distributed to every higher finisher with strictly descending place weights.
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
    const explicitLast = ordered.find((participant) => participant.mmrRole === "last");
    const last = explicitLast ?? (participants.some((participant) => participant.mmrRole) ? null : ordered.at(-1)!);
    const finishers = ordered.filter((participant) => participant !== last && participant.mmrRole !== "neutral");
    if (!last) {
      const champion = finishers.find((participant) => participant.mmrRole === "winner" || participant.result === "win");
      if (champion) {
        const opponents = ordered.filter((participant) => participant !== champion);
        const averageOpponent = opponents.reduce((sum, participant) => sum + participant.rating, 0) / opponents.length;
        const gain = Math.max(1, Math.round(ELO_K * (1 - expectedScore(champion.rating, averageOpponent))));
        result.set(champion.id, champion.rating + gain);
      }
      return result;
    }
    const rawLoss = Math.round(
      finishers.reduce(
        (sum, finisher) => sum + ELO_K * expectedScore(last.rating, finisher.rating),
        0
      )
    );
    const loss = Math.min(rawLoss, Math.max(0, last.rating - ELO_FLOOR));
    const distinctPlaces = [...new Set(finishers.map((finisher, index) => finisher.placement ?? index + 1))]
      .sort((a, b) => a - b);
    const weights = finishers.map((finisher, index) => {
      const place = finisher.placement ?? index + 1;
      return distinctPlaces.length - distinctPlaces.indexOf(place);
    });
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const exact = weights.map((weight) => (loss * weight) / weightTotal);
    const gains = exact.map(Math.floor);
    const remainder = loss - gains.reduce((sum, gain) => sum + gain, 0);
    const remainderOrder = exact
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let index = 0; index < remainder; index += 1) gains[remainderOrder[index]!.index] += 1;
    finishers.forEach((finisher, index) => {
      result.set(finisher.id, finisher.rating + gains[index]!);
    });
    result.set(last.id, last.rating - loss);
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
