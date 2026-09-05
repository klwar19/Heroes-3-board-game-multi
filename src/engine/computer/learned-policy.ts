import model from "./learned-policy.json";
import { replayPolicyBias } from "./replay-model";
import type { GameAction } from "../state";
import type { ComputerObservation } from "./types";
/** Small learned tie-break. The caller preserves hard safety/mandatory bands. */
export function learnedActionBias(
  observation: ComputerObservation,
  action: GameAction,
): number {
  let described = action;
  if (
    action.type === "RESOLVE_DECK_SEARCH" &&
    action.pick.kind === "revealed"
  ) {
    const choice = observation.state.pendingChoice;
    if (choice?.type !== "DECK_SEARCH") return 0;
    described = {
      ...action,
      cardId: choice.revealedCardIds[action.pick.index],
    } as GameAction;
  }
  const fight = observation.state.combat;
  const own = fight
    ? Object.values(fight.units).filter(
        (u) =>
          u.controllerId === observation.playerId && u.damage < u.maxHealth,
      )
    : [];
  const enemy = fight
    ? Object.values(fight.units).filter(
        (u) =>
          u.controllerId !== observation.playerId && u.damage < u.maxHealth,
      )
    : [];
  return replayPolicyBias(
    model,
    {
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
