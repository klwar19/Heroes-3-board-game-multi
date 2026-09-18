import { TRADE_RATES } from "@/data/map/locations";
import type { GameState, PlayerId } from "../state";
import {
  armyDevelopmentProfile,
  assessDwellingRush,
  developmentResourceTargets,
  goldBodyComboTradePlan,
  goldLadderValuablesReserve,
  goldStepMarketPlan,
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
  // USER RULING (2026-09-16): valuables are never sold below what the whole
  // remaining Gold ladder still needs (dwelling, each missing Few and Pack —
  // goldLadderValuablesReserve); a sale fetches 3 gold, the buy-back costs 6,
  // and they trickle in at 1–2 per Resource Round. Surplus above it may go.
  const soldValuables = rate.sell.valuables ?? 0;
  if (soldValuables > 0 &&
      res.valuables - soldValuables < goldLadderValuablesReserve(state, playerId)) {
    return -99;
  }
  const target = developmentResourceTargets(state, playerId);
  // Even surplus valuables are sold only for a REAL gold shortfall on the
  // saved purchase (the target minus its five-gold cushion), never to pad the
  // cushion: measured, two valuables went for 6 gold right after the Black
  // Dragon was already affordable, 12 gold to buy back for its Pack.
  if (soldValuables > 0 && (rate.buy.gold ?? 0) > 0 &&
      res.gold >= target.gold - GOLD_RESERVE) {
    return -99;
  }
  const goldUnlocked = armyDevelopmentProfile(state, playerId).goldUnlocked;
  const cushion = goldUnlocked
    ? { buildingMaterials: 0, valuables: 0 }
    : { buildingMaterials: 3, valuables: 2 };
  for (const key of ["buildingMaterials", "valuables"] as const) {
    const sold = rate.sell[key] ?? 0;
    if (sold > 0 && res[key] - sold < (target[key] ?? 0) + cushion[key]) {
      return -99;
    }
  }
  // GOLD-LADDER FLOOR (after the Gold dwelling): the development target is now
  // the saved Gold recruit (its cost plus the five-gold cushion). A generic
  // exchange must never sell a valuable/material that recruit needs, nor spend
  // the gold saved for it. Measured before this floor (Dungeon, impossible,
  // R9, 11g/9m/5v, Black Dragons 19g+1v saved): the recruit plan sold three
  // spare valuables to reach 20g, then THIS heuristic — whose old floor only
  // ran before Gold — kept selling the last valuables as "not wanted", the
  // plan bought one back at 6g, the heuristic sold it again for 3g, and the
  // seat left the market 22 trades later with 23g/0m/0v and no dragon. A
  // planned exchange (dwelling rush / Gold-step plan) is scored before this
  // function, so the floor only governs surplus conversion.
  const soldGold = rate.sell.gold ?? 0;
  if (soldGold > 0 && res.gold - soldGold < target.gold) {
    return -99;
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
  // Resource exchanges exist only at the Trading Post. A War Machine Factory
  // is a "market" too but sells no resources: measured (Rampart seed eval-0,
  // R9–R11) the saved-recruit plan pulled the hero to a Factory on its Far
  // tile every turn, it opened the shop, found no trade, left and came back.
  const tradesResources = location === undefined || location === "trading_post";
  if (tradesResources && assessDwellingRush(state, playerId)?.feasible) return true;
  // The post can complete the saved Gold recruit this visit (buy the missing
  // valuable, sell stock the body does not need). The generic utility below
  // would refuse it: it reads the gold as "scarce" against its own +5 cushion.
  if (tradesResources && goldStepMarketPlan(state, playerId)) return true;
  // The post can complete the Gold dwelling AND its level-7 body on this one
  // visit (see goldBodyComboTradePlan) — worth opening even when the dwelling
  // alone needs no trade at all.
  if (tradesResources && goldBodyComboTradePlan(state, playerId)) return true;
  if (!tradesResources) {
    const shop: string | undefined = location;
    return shop === "war_machine_factory" && shouldSeekLateWarMachineShop(state, playerId);
  }
  // USER RULING (2026-09-17): no generic "useful exchange" visits any more —
  // from MARKET_MIN_ROUND the only remaining trade is the one that buys the
  // planned Silver body for a fight this round (premiumRecruitMarketVisit in
  // map-navigation, which also knows the hero's reach). tradeUtility still
  // ranks/blocks individual rates once a market is open.
  return false;
}
