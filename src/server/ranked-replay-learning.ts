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
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
      return "{" + entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",") + "}";
    }
    return JSON.stringify(value);
  };
  return canonical(a) === canonical(b);
}

function hasOverlappingLegacyBattles(replay: RankedReplay): boolean {
  const open = new Set<string>();
  for (const entry of replay.entries) for (const event of entry.events) {
    const id = "combatContextId" in event ? event.combatContextId : undefined;
    if (!id) continue;
    if (event.type.endsWith("COMBAT_STARTED")) open.add(id);
    if (open.size > 1) return true;
    if (event.type === "COMBAT_ENDED") open.delete(id);
  }
  return false;
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
  const identified = new Map<string, PlayerId>();
  for (const entry of replay.entries) {
    for (const event of entry.events) {
      if (event.type !== "COMBAT_ENDED" || !event.winnerPlayerId) continue;
      const id = event.combatContextId ?? entry.learningContext?.combat?.id;
      if (id) identified.set(id, event.winnerPlayerId);
    }
  }
  let combatSequences: number[] = [];
  for (const entry of replay.entries) {
    const id = entry.learningContext?.combat?.id;
    if (id) {
      combatSequences = [];
      const winner = identified.get(id);
      if (winner) outcomes.set(entry.sequence, winner);
      continue;
    }
    const inCombat = Boolean(
      entry.learningContext?.domains.some(
        (domain) => domain === "pvp-combat" || domain === "neutral-combat",
      ),
    );
    // Captures made before the combat context covered actor-less steps carry
    // no combat domain on a system entry taken mid-fight. Such an entry is
    // neither a decision nor proof the fight ended, so it must not split the
    // segment — a split credited only the tail of the battle to its winner.
    if (!inCombat && entry.source === "system" && combatSequences.length > 0) {
      const endedBySystem = entry.events.find((event) => event.type === "COMBAT_ENDED");
      if (endedBySystem?.type === "COMBAT_ENDED" && endedBySystem.winnerPlayerId) {
        for (const sequence of combatSequences) outcomes.set(sequence, endedBySystem.winnerPlayerId);
        combatSequences = [];
      }
      continue;
    }
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
  const continuous = replay.entries.every((entry, index) => index === 0 || replay.entries[index - 1].afterStateHash === entry.beforeStateHash);
  const completeTrajectory = replay.captureStart === "adventure-start" && !replay.truncated && continuous;
  const localBattleWinners = battleOutcomes(replay);
  const ambiguousLegacyCombat = hasOverlappingLegacyBattles(replay);
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
    const combatDecision = entry.learningContext.domains.some((domain) => domain === "pvp-combat" || domain === "neutral-combat");
    // Unknown local battle results must not turn into fabricated match labels.
    if (combatDecision && (!battleWinner || (ambiguousLegacyCombat && !entry.learningContext.combat?.id))) return [];
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
  const perPattern = new Map<string, Map<string, "win" | "loss" | "mixed">>();
  const actionTypes = new Map<string, GameAction["type"]>();
  for (const replay of replays) {
    for (const sample of extractStrategicDecisionSamples(replay)) {
      const pattern = samplePattern(sample);
      actionTypes.set(pattern, sample.chosenAction.type);
      const matches = perPattern.get(pattern) ?? new Map<string, "win" | "loss" | "mixed">();
      // One match is one vote. If both seats produce this pattern, a winner's
      // evidence wins neither extra weight nor a fabricated counterfactual.
      if (!matches.has(sample.matchId)) matches.set(sample.matchId, sample.decisionOutcome);
      else if (matches.get(sample.matchId) !== sample.decisionOutcome) matches.set(sample.matchId, "mixed");
      perPattern.set(pattern, matches);
    }
  }
  return [...perPattern.entries()].flatMap(([pattern, matches]) => {
    const outcomes = [...matches.values()].filter((outcome) => outcome !== "mixed");
    if (outcomes.length < minimumDistinctMatches) return [];
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
