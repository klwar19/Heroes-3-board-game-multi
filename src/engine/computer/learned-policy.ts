import model from "./learned-policy.json";
import { replayDecisionFacts } from "./replay-context";
import type { GameState } from "../state";
import { describeReplayAction, replayPolicyBias } from "./replay-model";
import type { GameAction } from "../state";
import type { ComputerObservation } from "./types";
/** Small learned tie-break. The caller preserves hard safety/mandatory bands. */
export function learnedActionBias(
  observation: ComputerObservation,
  action: GameAction,
): number {
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
  return replayPolicyBias(
    model,
    {
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
    },
    described,
  );
}
