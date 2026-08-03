import { coreUnitDefinitions } from "@/data/factions/units";

import type { ArmyUnitState, ResourceCost, UnitGrade } from "./state";

/** Printed Polish house-rule cap and gold surcharge for each faction tier. */
export const POLISH_UNIT_STACK_RULES: Partial<Record<UnitGrade, { cap: number; goldSurcharge: number }>> = {
  bronze: { cap: 3, goldSurcharge: 1 },
  silver: { cap: 2, goldSurcharge: 2 },
  gold: { cap: 1, goldSurcharge: 3 }
};

/** Sides that can carry paid Unit Stacks (Pack Groups and recruited Neutrals). */
export type PolishStackSide = "pack" | "neutral";

/**
 * Number of persistent Stack layers a human-controlled army card may carry.
 * Always the army table — bronze 3 / silver 2 / gold 1 (azure counted as gold → 1).
 */
export function polishUnitStackCap(unitDefId: string, _side: PolishStackSide = "pack"): number {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  if (!tier) {
    return 0;
  }
  if (tier === "azure") {
    return POLISH_UNIT_STACK_RULES.gold?.cap ?? 0;
  }
  return POLISH_UNIT_STACK_RULES[tier]?.cap ?? 0;
}

/**
 * Cost of one Stack:
 * - Pack: Pack printed gold + tier gold surcharge, plus the Pack's printed valuables
 * - Neutral: Neutral printed gold + same surcharge, plus the Neutral's printed valuables
 * The valuables fee is exactly the side's printed valuables — the same valuables
 * paid to reinforce that unit Few→Pack (a Pack that costs no valuables adds none).
 * Building materials, recruit discounts, and Freelancer's Guild gold substitution
 * never apply.
 */
export function polishUnitStackCost(
  unitDefId: string,
  side: PolishStackSide = "pack"
): ResourceCost | null {
  const unit = coreUnitDefinitions[unitDefId];
  if (!unit) {
    return null;
  }
  const tier = unit.tier === "azure" ? "gold" : unit.tier;
  const rule = POLISH_UNIT_STACK_RULES[tier];
  if (!rule) {
    return null;
  }
  const printed = side === "pack" ? unit.pack : unit.neutral;
  if (!printed) {
    return null;
  }
  // Gold: printed gold + the tier surcharge (0 printed gold still pays the fee).
  // Valuables: the side's printed valuables — the same fee as a Few→Pack reinforce.
  const valuables = printed.cost.valuables ?? 0;
  return {
    gold: (printed.cost.gold ?? 0) + rule.goldSurcharge,
    ...(valuables > 0 ? { valuables } : {})
  };
}

/**
 * The tier a unit's Stacks are priced/gated by — always the army table, with
 * azure counted as gold (the same convention as the cap). Null when the unit
 * cannot carry Stacks at all.
 */
export function polishStackTier(unitDefId: string): "bronze" | "silver" | "gold" | null {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  if (!tier) {
    return null;
  }
  return tier === "azure" ? "gold" : tier;
}

/** Pure eligibility check used by legal actions, the reducer, and town UI. */
export function polishArmyUnitCanBuyStack(unit: ArmyUnitState): boolean {
  if (unit.side !== "pack" && unit.side !== "neutral") {
    return false;
  }
  const side: PolishStackSide = unit.side;
  const cap = polishUnitStackCap(unit.unitDefId, side);
  return cap > 0 && (unit.stacks ?? 0) < cap;
}

/** Cost for the army card's actual side (Pack or Neutral). */
export function polishArmyUnitStackCost(unit: ArmyUnitState): ResourceCost | null {
  if (unit.side !== "pack" && unit.side !== "neutral") {
    return null;
  }
  return polishUnitStackCost(unit.unitDefId, unit.side);
}

/** Cap for the army card's actual side (always army bronze/silver/gold table). */
export function polishArmyUnitStackCap(unit: ArmyUnitState): number {
  if (unit.side !== "pack" && unit.side !== "neutral") {
    return 0;
  }
  return polishUnitStackCap(unit.unitDefId, unit.side);
}

/** Plain-words tier cap for UI (e.g. "bronze · max 3"). */
export function polishUnitStackCapLabel(unitDefId: string): string {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  const cap = polishUnitStackCap(unitDefId);
  if (!tier || cap <= 0) {
    return "";
  }
  const tierName = tier === "azure" ? "azure (gold cap)" : tier;
  return `${tierName} · max ${cap}`;
}
