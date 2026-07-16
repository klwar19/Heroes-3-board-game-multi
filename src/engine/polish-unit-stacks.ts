import { coreUnitDefinitions } from "@/data/factions/units";

import type { ArmyUnitState, ResourceCost, UnitGrade } from "./state";

/** Printed Polish-tournament cap and gold surcharge for each faction tier. */
export const POLISH_UNIT_STACK_RULES: Partial<Record<UnitGrade, { cap: number; goldSurcharge: number }>> = {
  bronze: { cap: 3, goldSurcharge: 1 },
  silver: { cap: 2, goldSurcharge: 2 },
  gold: { cap: 1, goldSurcharge: 3 }
};

/** Number of persistent Stack layers a Pack card of this tier may carry. */
export function polishUnitStackCap(unitDefId: string): number {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  return tier ? (POLISH_UNIT_STACK_RULES[tier]?.cap ?? 0) : 0;
}

/**
 * Cost of one Stack: the Pack's printed GOLD cost + the tier number in gold.
 * Other printed resources and recruit/reinforce discounts do not apply.
 */
export function polishUnitStackCost(unitDefId: string): ResourceCost | null {
  const unit = coreUnitDefinitions[unitDefId];
  const rule = unit ? POLISH_UNIT_STACK_RULES[unit.tier] : undefined;
  if (!unit?.pack || !rule) {
    return null;
  }

  return { gold: (unit.pack.cost.gold ?? 0) + rule.goldSurcharge };
}

/** Pure eligibility check used by legal actions, the reducer, and town UI. */
export function polishArmyUnitCanBuyStack(unit: ArmyUnitState): boolean {
  const cap = polishUnitStackCap(unit.unitDefId);
  return unit.side === "pack" && cap > 0 && (unit.stacks ?? 0) < cap;
}
