import model from "./learned-policy.json";
import selfPlayModel from "./self-play-policy.json";
import { replayDecisionFacts } from "./replay-context";
import type { GameState } from "../state";
import { describeReplayAction, replayPolicyBias, type ReplayPolicyModel } from "./replay-model";
import type { GameAction } from "../state";
import type { ComputerObservation } from "./types";

/**
 * Which committed models vote: "ranked" = human ranked replays only, "all"
 * adds the self-play model, "none" = pure heuristic policy (A/B baseline).
 */
export type LearnedModelSelection = "all" | "ranked" | "none";
/**
 * Self-play evidence is the AI playing itself under bounded exploration, so it
 * is weaker than a human win: half weight, and the combined vote never leaves
 * the same ±8 band a single model is allowed.
 */
export const SELF_PLAY_MODEL_WEIGHT = 0.5;
export const LEARNED_BIAS_LIMIT = 8;

/** Small learned tie-break. The caller preserves hard safety/mandatory bands. */
export function learnedActionBias(
  observation: ComputerObservation,
  action: GameAction,
  models: LearnedModelSelection = "all",
  candidateModel?: ReplayPolicyModel,
): number {
  if (models === "none") return 0;
  const choice = observation.state.pendingChoice;
  const facts = replayDecisionFacts(observation.state as unknown as GameState, observation.playerId, action);
  const described = describeReplayAction(facts.action, choice?.type === "DECK_SEARCH" ? choice.revealedCardIds : undefined);
  const fight = observation.state.combat;
  const own = fight
    ? Object.values(fight.units).filter(
        (u) =>
          u.controllerId === observation.playerId && u.position >= 0 && u.damage < u.maxHealth,
      )
    : [];
  const enemy = fight
    ? Object.values(fight.units).filter(
        (u) =>
          u.controllerId !== observation.playerId && u.position >= 0 && u.damage < u.maxHealth,
      )
    : [];
  const context = {
      conditions: facts.conditions,
      situation: facts.situation,
      stage:
        observation.state.round <= 3
          ? "opening"
          : observation.state.round >= 8
            ? "late-game"
            : "midgame",
      faction:
        observation.state.players[observation.playerId]?.factionId ?? "unknown",
      combat: fight
        ? fight.attackerPlayerId === "neutrals" ||
          fight.defenderPlayerId === "neutrals"
          ? "neutral"
          : "pvp"
        : "map",
      pressure: fight
        ? own.reduce((n, u) => n + u.maxHealth - u.damage, 0) <
          enemy.reduce((n, u) => n + u.maxHealth - u.damage, 0)
        : (observation.state.players[observation.playerId]?.resources.gold ??
            0) <= 2,
  };
  const ranked = replayPolicyBias(model, context, described);
  if (models === "ranked") return ranked;
  const selfPlay = replayPolicyBias(candidateModel ?? selfPlayModel as ReplayPolicyModel, context, described) * SELF_PLAY_MODEL_WEIGHT;
  return Math.max(-LEARNED_BIAS_LIMIT, Math.min(LEARNED_BIAS_LIMIT, ranked + selfPlay));
}
