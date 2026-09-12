import { TRADE_RATES } from "@/data/map/locations";
import type { GameState, PlayerId } from "../state";
import {
  armyDevelopmentProfile,
  assessDwellingRush,
  developmentResourceTargets,
  shouldPrioritizeFirstAidTent,
  shouldSeekLateWarMachineShop,
} from "./development";

export type ResourceKey = "gold" | "buildingMaterials" | "valuables";
export const GOLD_RESERVE = 5;
export const MARKET_MIN_ROUND = 5;

export function playerResources(
  state: GameState,
  playerId: string,
): Record<ResourceKey, number> {
  const r = state.players[playerId]?.resources;
  return {
    gold: r?.gold ?? 0,
    buildingMaterials: r?.buildingMaterials ?? 0,
    valuables: r?.valuables ?? 0,
  };
}

/**
 * How much of each resource the seat "wants" right now (positive = deficit).
 * Public resource counts only — used to open the market and rank trades without
 * spinning forever on repeatable exchanges.
 */
export function resourceDeficits(
  state: GameState,
  playerId: PlayerId,
): Record<ResourceKey, number> {
  const res = playerResources(state, playerId);
  const army = state.players[playerId]?.army.length ?? 0;
  // Preserve the ACTUAL next dwelling cost. The old fixed 3 materials / one
  // valuable target made the market sell the Silver/Gold savings as "surplus",
  // leaving the computer permanently stuck on Bronze units.
  const target = developmentResourceTargets(state, playerId);
  const goldTarget = Math.max(target.gold, army < 5 ? 14 : 10) +
    (res.gold < GOLD_RESERVE ? 6 : 0);
  const wantGold = goldTarget - res.gold;
  const wantMats = Math.max(0, target.buildingMaterials - res.buildingMaterials) > 0
    ? target.buildingMaterials - res.buildingMaterials
    : res.buildingMaterials >= target.buildingMaterials + 2
      ? -(res.buildingMaterials - target.buildingMaterials - 1)
      : 0;
  const wantVals = target.valuables - res.valuables > 0
    ? target.valuables - res.valuables
    : res.valuables >= target.valuables + 2
      ? -(res.valuables - target.valuables - 1)
      : 0;
  return {
    gold: wantGold,
    buildingMaterials: wantMats,
    valuables: wantVals,
  };
}

/** True when at least one TRADE_RATES exchange would reduce a real deficit. */
export function hasUsefulMarketTrade(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return TRADE_RATES.some((_, index) => tradeUtility(state, playerId, index) > 0);
}

/**
 * Net utility of one market rate: + for filling a deficit with surplus stock,
 * ≤0 when the seat would burn a scarce resource for something it does not need.
 */
export function tradeUtility(
  state: GameState,
  playerId: PlayerId,
  rateIndex: number,
): number {
  const rate = TRADE_RATES[rateIndex];
  if (!rate) return -99;
  const res = playerResources(state, playerId);
  // Must be able to pay (legal-actions already gates, but score still ranks).
  for (const key of Object.keys(rate.sell) as ResourceKey[]) {
    if ((res[key] ?? 0) < (rate.sell[key] ?? 0)) return -99;
  }
  // DWELLING-INPUT FLOOR: until the Gold dwelling stands, materials and
  // valuables are the bottleneck the whole tempo hangs on, and the market
  // spread makes every sell-then-rebuy a net loss (1m sells for 1g, rebuys at
  // 2g; 1v sells for 3g, rebuys at 6g). Measured pre-fix: seven materials
  // dumped at 1:1 plus a v→2m / 3m→v churn cycle in the round before the
  // Silver dwelling. A trade may only sell m/v stock that stays a cushion
  // ABOVE the current dwelling target after the sale (materials keep +3
  // toward the NEXT dwelling's rebuild; valuables +2, they trickle slower).
  // The margin also breaks the churn pair: after a v→m conversion the bought
  // side sits at/above its target, so the reverse trade buys "nothing wanted"
  // and scores below zero.
  if (!armyDevelopmentProfile(state, playerId).goldUnlocked) {
    const target = developmentResourceTargets(state, playerId);
    const cushion = { buildingMaterials: 3, valuables: 2 } as const;
    for (const key of ["buildingMaterials", "valuables"] as const) {
      const sold = rate.sell[key] ?? 0;
      if (sold > 0 && res[key] - sold < (target[key] ?? 0) + cushion[key]) {
        return -99;
      }
    }
  }
  const deficit = resourceDeficits(state, playerId);
  let utility = 0;
  for (const key of Object.keys(rate.sell) as ResourceKey[]) {
    const amount = rate.sell[key] ?? 0;
    // Selling something we still want is a cost; selling surplus is free-ish.
    const remainingWant = deficit[key];
    if (remainingWant > 0) {
      // Burning a scarce resource — heavy penalty.
      utility -= amount * 6;
    } else {
      // Surplus: mild cost so we do not spam-convert for no reason.
      utility -= amount * 0.5;
    }
  }
  for (const key of Object.keys(rate.buy) as ResourceKey[]) {
    const amount = rate.buy[key] ?? 0;
    const want = deficit[key];
    if (want > 0) {
      utility += Math.min(want, amount) * 5 + amount;
    } else {
      // Buying something we already have enough of is almost worthless.
      utility += 0.2;
    }
  }
  return utility;
}

/** Whether the seat should bother opening this particular market this turn. */
export function wantsMarketVisit(
  state: GameState,
  playerId: PlayerId,
  location?: string,
): boolean {
  if (
    location === "war_machine_factory" &&
    shouldPrioritizeFirstAidTent(state, playerId)
  ) {
    return true;
  }
  if (assessDwellingRush(state, playerId)?.feasible) return true;
  if ((state.round ?? 0) < MARKET_MIN_ROUND) return false;
  if (
    TRADE_RATES.some(
      (_, index) => tradeUtility(state, playerId, index) >= 4,
    )
  ) {
    return true;
  }
  // War-machine detours are specific to the Factory and use the shared
  // late-development/surplus gate.
  return (
    location === "war_machine_factory" &&
    shouldSeekLateWarMachineShop(state, playerId)
  );
}
