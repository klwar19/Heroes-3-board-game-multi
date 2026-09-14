/** Shared replay → outcome-labelled training samples. Used by the ranked
 * trainer (human seats) and the self-play trainer (computer seats). */
import { gunzipSync } from "node:zlib";
import { describeReplayAction } from "../../src/engine/computer/replay-model.ts";
import { replayConditions } from "../../src/engine/computer/replay-context.ts";
import { extractStrategicDecisionSamples } from "../../src/server/ranked-replay-learning.ts";

/** Decode one stored row: plain jsonb payload or the gzip/base64 column. */
export function replayPayload(row) {
  if (row.payload) return row.payload;
  if (typeof row.payload_gzip_base64 === "string") {
    return JSON.parse(gunzipSync(Buffer.from(row.payload_gzip_base64, "base64")).toString("utf8"));
  }
  return null;
}

/**
 * Convert one replay into trainer samples. `sources` selects which seats are
 * decisions (default human); `battleLabelsWithoutWinner` keeps battle-labelled
 * combat decisions of a round-capped game that declared no winner.
 */
export function buildReplaySamples(p, options = {}) {
  const samples = [];
  for (const sample of extractStrategicDecisionSamples(p, {
    ...(options.sources ? { sources: options.sources } : {}),
    ...(options.battleLabelsWithoutWinner ? { battleLabelsWithoutWinner: true } : {}),
  })) {
    // Older combat records may have a domain but no health/kind snapshot.
    // Missing tactical context must not teach a fabricated map-spell policy.
    if (!sample.context.combat && sample.context.domains.some((domain) =>
      domain === "pvp-combat" || domain === "neutral-combat")) continue;
    const action = describeReplayAction(sample.context.policyFacts?.action ?? sample.chosenAction, sample.context.search?.revealedCardIds);
    samples.push({
      matchId: sample.matchId,
      action,
      outcome: sample.decisionOutcome,
      context: {
        conditions: sample.context.policyFacts?.conditions ?? (p.initialState ? replayConditions(p.initialState) : undefined),
        situation: sample.context.policyFacts?.situation,
        stage: sample.context.stage,
        faction:
          sample.context.development?.factionId ??
          p.initialState.players[sample.actorPlayerId]?.factionId ??
          "unknown",
        combat: sample.context.combat?.kind ?? "map",
        pressure: sample.context.combat
          ? sample.context.combat.ownRemainingHealth <
            sample.context.combat.enemyRemainingHealth
          : (sample.context.actorEconomy?.gold ?? 99) <= 2,
      },
    });
  }
  return samples;
}

export function trainingReport(model, samples) {
  return {
    matches: model.matches,
    samples: model.samples,
    learnedPatterns: Object.keys(model.weights).length,
    samplesWithDecisionTimeFacts: samples.filter(sample => sample.context.situation).length,
    samplesByStage: Object.fromEntries(["opening", "midgame", "late-game"].map(stage =>
      [stage, samples.filter(sample => sample.context.stage === stage).length])),
    samplesByConditions: Object.fromEntries([...new Set(samples.map(sample => sample.context.conditions))].map(conditions =>
      [conditions, samples.filter(sample => sample.context.conditions === conditions).length])),
    samplesByAction: Object.fromEntries([...new Set(samples.map(sample => sample.action.type))].sort().map(type =>
      [type, samples.filter(sample => sample.action.type === type).length])),
    samplesByDomain: Object.fromEntries(["map", "pvp", "neutral"].map((domain) =>
      [domain, samples.filter((sample) => sample.context.combat === domain).length])),
    patternsByAction: Object.fromEntries([...new Set(samples.map((sample) => sample.action.type))].sort()
      .map((type) => [type, Object.keys(model.weights).filter((key) => key.split("|")[4] === type).length])
      .filter(([, count]) => count > 0)),
  };
}
