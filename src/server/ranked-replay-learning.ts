import type { GameAction, GameEvent, PlayerId } from "@/engine";
import type { RankedReplay, RankedReplayLearningContext } from "./ranked-replay";

export type StrategicDecisionSample = {
  matchId: string;
  sequence: number;
  actorPlayerId: PlayerId;
  chosenAction: GameAction;
  /** Alternatives are context, never automatically labelled as mistakes. */
  unchosenAlternatives: GameAction[];
  context: RankedReplayLearningContext;
  /** Outcome closest to this decision: its PvP battle when known, else match. */
  decisionOutcome: "win" | "loss";
  outcomeBasis: "battle" | "match";
  terminalOutcome: "win" | "loss";
  immediateEventTypes: GameEvent["type"][];
  completeTrajectory: boolean;
};

export type StrategicPreference = {
  pattern: string;
  actionType: GameAction["type"];
  distinctMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  recommendation: "prefer" | "avoid" | "uncertain";
};

function actionEquals(a: GameAction, b: GameAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Credit combat decisions to the battle they actually influenced. A player can
 * lose one fight and still win the match (or vice versa); using only the final
 * match result would teach the exact opposite tactical lesson. The contiguous
 * combat-domain segment also supports captures that begin in the middle of a
 * fight, as the Absolution–VuHy replay did.
 */
function battleOutcomes(replay: RankedReplay): Map<number, PlayerId> {
  const outcomes = new Map<number, PlayerId>();
  let combatSequences: number[] = [];
  for (const entry of replay.entries) {
    const inCombat = Boolean(
      entry.learningContext?.domains.some(
        (domain) => domain === "pvp-combat" || domain === "neutral-combat",
      ),
    );
    if (!inCombat) {
      combatSequences = [];
      continue;
    }
    combatSequences.push(entry.sequence);
    const ended = entry.events.find((event) => event.type === "COMBAT_ENDED");
    if (ended?.type === "COMBAT_ENDED" && ended.winnerPlayerId) {
      for (const sequence of combatSequences) outcomes.set(sequence, ended.winnerPlayerId);
      combatSequences = [];
    }
  }
  return outcomes;
}

/**
 * Convert one replay into outcome-labelled decisions. Forced choices, missing
 * legal sets, system/AI moves and non-terminal captures are excluded. A losing
 * move remains evidence—not an automatic error—and unchosen moves remain
 * counterfactual candidates, never fabricated negative labels.
 */
export function extractStrategicDecisionSamples(replay: RankedReplay): StrategicDecisionSample[] {
  if (!replay.winnerPlayerId) return [];
  const completeTrajectory = replay.captureStart === "adventure-start" && !replay.truncated;
  const localBattleWinners = battleOutcomes(replay);
  return replay.entries.flatMap((entry) => {
    if (
      entry.source !== "human" ||
      !entry.actorPlayerId ||
      !entry.learningContext ||
      entry.legalActionsTruncated ||
      entry.legalActions.length <= 1
    ) return [];
    // A recovered mid-match capture can teach its local fight/recovery context,
    // but must never masquerade as evidence about the opening it did not see.
    if (!completeTrajectory && entry.learningContext.domains.includes("opening")) return [];
    const battleWinner = localBattleWinners.get(entry.sequence);
    const terminalOutcome = entry.actorPlayerId === replay.winnerPlayerId ? "win" : "loss";
    return [{
      matchId: replay.matchId,
      sequence: entry.sequence,
      actorPlayerId: entry.actorPlayerId,
      chosenAction: entry.action,
      unchosenAlternatives: entry.legalActions.filter((candidate) => !actionEquals(candidate, entry.action)),
      context: entry.learningContext,
      decisionOutcome: battleWinner
        ? entry.actorPlayerId === battleWinner ? "win" : "loss"
        : terminalOutcome,
      outcomeBasis: battleWinner ? "battle" : "match",
      terminalOutcome,
      immediateEventTypes: entry.events.map((event) => event.type),
      completeTrajectory,
    }];
  });
}

function samplePattern(sample: StrategicDecisionSample): string {
  const domains = [...sample.context.domains].sort().join("+");
  const pressure = [...sample.context.pressureSignals].sort().join("+") || "stable";
  return `${sample.context.stage}|${domains}|${pressure}|${sample.chosenAction.type}`;
}

/**
 * Cross-match guard against blind copying. Repeated identical decisions within
 * one game count once; no preference is emitted before independent matches
 * corroborate it, and mixed results remain explicitly uncertain.
 */
export function aggregateStrategicPreferences(
  replays: RankedReplay[],
  minimumDistinctMatches = 5,
): StrategicPreference[] {
  const perPattern = new Map<string, Map<string, "win" | "loss">>();
  const actionTypes = new Map<string, GameAction["type"]>();
  for (const replay of replays) {
    for (const sample of extractStrategicDecisionSamples(replay)) {
      const pattern = samplePattern(sample);
      actionTypes.set(pattern, sample.chosenAction.type);
      const matches = perPattern.get(pattern) ?? new Map<string, "win" | "loss">();
      // One match is one vote. If both seats produce this pattern, a winner's
      // evidence wins neither extra weight nor a fabricated counterfactual.
      if (!matches.has(sample.matchId)) matches.set(sample.matchId, sample.decisionOutcome);
      else if (matches.get(sample.matchId) !== sample.decisionOutcome) matches.delete(sample.matchId);
      perPattern.set(pattern, matches);
    }
  }
  return [...perPattern.entries()].flatMap(([pattern, matches]) => {
    if (matches.size < minimumDistinctMatches) return [];
    const outcomes = [...matches.values()];
    const wins = outcomes.filter((outcome) => outcome === "win").length;
    const losses = outcomes.length - wins;
    const winRate = wins / outcomes.length;
    return [{
      pattern,
      actionType: actionTypes.get(pattern)!,
      distinctMatches: outcomes.length,
      wins,
      losses,
      winRate,
      recommendation: winRate >= 0.65 ? "prefer" : winRate <= 0.35 ? "avoid" : "uncertain",
    } satisfies StrategicPreference];
  });
}
