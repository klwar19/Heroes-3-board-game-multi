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
 * Convert one replay into outcome-labelled decisions. Forced choices, missing
 * legal sets, system/AI moves and non-terminal captures are excluded. A losing
 * move remains evidence—not an automatic error—and unchosen moves remain
 * counterfactual candidates, never fabricated negative labels.
 */
export function extractStrategicDecisionSamples(replay: RankedReplay): StrategicDecisionSample[] {
  if (!replay.winnerPlayerId) return [];
  const completeTrajectory = replay.captureStart === "adventure-start" && !replay.truncated;
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
    return [{
      matchId: replay.matchId,
      sequence: entry.sequence,
      actorPlayerId: entry.actorPlayerId,
      chosenAction: entry.action,
      unchosenAlternatives: entry.legalActions.filter((candidate) => !actionEquals(candidate, entry.action)),
      context: entry.learningContext,
      terminalOutcome: entry.actorPlayerId === replay.winnerPlayerId ? "win" : "loss",
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
      if (!matches.has(sample.matchId)) matches.set(sample.matchId, sample.terminalOutcome);
      else if (matches.get(sample.matchId) !== sample.terminalOutcome) matches.delete(sample.matchId);
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
