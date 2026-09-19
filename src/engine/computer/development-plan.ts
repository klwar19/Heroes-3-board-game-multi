import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { effectiveTownBuildingCost } from "../house-rules";
import type { GameState, GameAction, ResourceCost } from "../state";
import {
  armyDevelopmentProfile,
  developmentResourceTargets,
  factionBuildingForEffect,
  incomeBuildingBeforeDwelling,
  needsPremiumSilverBreakthrough,
  needsNecromancyVampire,
  committedGoldInvestment,
  nextGoldLadderStep,
} from "./development";
import { economyHorizonBias } from "./planning-horizon";
export type DevelopmentPlan = {
  goal: "rebuild" | "income" | "silver" | "gold" | "gold-recruit" | "pressure";
  sinceRound: number;
  buildingId?: string;
  reserve: Required<ResourceCost>;
  armyValue: number;
  rebuilding: boolean;
};
/** A persistent goal with explicit recovery and return to the gold milestone. */
export function updateDevelopmentPlan(
  state: GameState,
  playerId: string,
  previous?: DevelopmentPlan,
): DevelopmentPlan {
  const profile = armyDevelopmentProfile(state, playerId);
  const armyValue = (state.players[playerId]?.army ?? []).reduce(
    (sum, unit) => {
      const def = coreUnitDefinitions[unit.unitDefId];
      const side = unit.side === "bank" ? undefined : def?.[unit.side];
      return (
        sum + (side ? side.attack * 3 + side.health * 2 + side.defense : 0)
      );
    },
    0,
  );
  const rebuilding =
    Boolean(
      previous &&
      armyValue < previous.armyValue * 0.7 &&
      profile.phase === "establish-core",
    ) || Boolean(previous?.rebuilding && profile.phase === "establish-core");
  const income = incomeBuildingBeforeDwelling(state, playerId);
  const goal =
    rebuilding || profile.phase === "establish-core"
      ? "rebuild"
      : needsPremiumSilverBreakthrough(state, playerId) &&
          !needsNecromancyVampire(state, playerId)
        ? "silver"
      : income
        ? "income"
        : !profile.silverUnlocked
        ? "silver"
        : !profile.goldUnlocked
          ? "gold"
          : nextGoldLadderStep(state, playerId)?.kind === "recruit" || committedGoldInvestment(state, playerId)
            ? "gold-recruit"
            : "pressure";
  const building =
    goal === "income"
      ? income
      : (goal === "silver" && !profile.silverUnlocked) || goal === "gold"
      ? factionBuildingForEffect(
          state,
          playerId,
          (effect) =>
            effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === goal,
        )
      : null;
  return {
    goal,
    sinceRound: previous?.goal === goal ? previous.sinceRound : state.round,
    buildingId: building?.id,
    reserve: developmentResourceTargets(state, playerId),
    armyValue,
    rebuilding,
  };
}
export function developmentPlanBias(
  state: GameState,
  playerId: string,
  action: GameAction,
  plan?: DevelopmentPlan,
): number {
  if (!plan || state.combat) return 0;
  const horizonBias = economyHorizonBias(state, playerId, action);
  if (action.type === "BUILD_STRUCTURE") {
    if (action.buildingId === plan.buildingId) return 30 + horizonBias;
    const definition = coreBuildingDefinitions[action.buildingId];
    const cost = definition ? effectiveTownBuildingCost(state, definition) : undefined;
    const resources = state.players[playerId]?.resources;
    if (
      cost &&
      resources &&
      (plan.goal === "income" ||
        plan.goal === "silver" ||
        plan.goal === "gold" ||
        plan.goal === "gold-recruit")
    ) {
      // Defer a side purchase when it consumes a saved input. Strong existing
      // safety/income scores still decide whether an exception is warranted.
      if (
        Object.entries(cost).some(
          ([key, amount]) =>
            Number(amount) > 0 &&
            Number(resources[key as keyof ResourceCost] ?? 0) - Number(amount) <
              plan.reserve[key as keyof ResourceCost],
        )
      )
        return -30;
    }
    return horizonBias;
  }
  if (action.type === "POPULATION_ACTION" && plan.goal === "rebuild") return 25;
  return horizonBias;
}
