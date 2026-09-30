import { coreUnitDefinitions } from "@/data/factions/units";

import { armyUnitStacksActive, houseRuleEnabled } from "./house-rules";
import type { ArmyUnitState, GameState, ResourceCost, UnitGrade } from "./state";

/** Game state slice the Stack cap reads (the Unlimited Stacks house rule). */
export type PolishStackRulesView = Pick<GameState, "ruleset" | "adventure" | "anime">;

/**
 * Polish house rule "Unlimited Stacks" (USER RULING 2026-09-29): Stack layers
 * have NO tier cap. Only meaningful while army Unit Stacks are active; each
 * layer is priced exactly as in the capped rule (see polishUnitStackCost).
 */
export function polishUnlimitedStacksEnabled(state?: PolishStackRulesView | null): boolean {
  return Boolean(state && houseRuleEnabled(state, "polish-unlimited-stacks") && armyUnitStacksActive(state));
}

/**
 * Printed Polish house-rule cap for each faction tier. `goldSurcharge` is the
 * retired 2026-08-12 "nr of tier" fee (bronze 1 / silver 2 / gold 3), kept only
 * as legacy data — the tier adds NOTHING to the Stack price since the
 * 2026-09-30 ruling (Group cost + N gold, see polishUnitStackCost). AZURE has no
 * row on purpose: it is capped as gold (the azure→gold convention).
 */
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
export function polishUnitStackCap(
  unitDefId: string,
  _side: PolishStackSide = "pack",
  state?: PolishStackRulesView | null
): number {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  if (!tier) {
    return 0;
  }
  if (polishUnlimitedStacksEnabled(state)) {
    return Number.POSITIVE_INFINITY;
  }
  if (tier === "azure") {
    return POLISH_UNIT_STACK_RULES.gold?.cap ?? 0;
  }
  return POLISH_UNIT_STACK_RULES[tier]?.cap ?? 0;
}

/**
 * The escalating LADDER part of a unit card's NEXT Stack layer: N gold for its
 * Nth layer (N = `currentStacks` + 1) — 1st layer 1, 2nd 2, 3rd 3. Counted PER
 * UNIT CARD. The full price adds the card's Group cost (polishUnitStackCost).
 */
export function polishStackLayerPrice(currentStacks: number): number {
  return Math.max(0, Math.trunc(currentStacks)) + 1;
}

/**
 * The card's GROUP REINFORCEMENT cost — the part of a Stack's price a
 * Settlement / free-Stack source covers. For a Pack card it is the printed Pack
 * side cost (= the undiscounted Few→Pack `reinforceCostFor`: gold AND printed
 * valuables, any other printed resource too). A recruited Neutral card has no
 * Few→Pack reinforcement, so its own printed Neutral cost stands in for the
 * Group. Null when the unit has no such side or no Stack tier.
 */
export function polishStackGroupCost(unitDefId: string, side: PolishStackSide = "pack"): ResourceCost | null {
  const unit = coreUnitDefinitions[unitDefId];
  if (!unit) {
    return null;
  }
  const tier = unit.tier === "azure" ? "gold" : unit.tier;
  if (!POLISH_UNIT_STACK_RULES[tier]) {
    return null;
  }
  const printed = side === "pack" ? unit.pack : unit.neutral;
  if (!printed) {
    return null;
  }
  const group: ResourceCost = { gold: printed.cost.gold ?? 0 };
  for (const [resource, amount] of Object.entries(printed.cost) as [keyof ResourceCost, number | undefined][]) {
    if (resource !== "gold" && (amount ?? 0) > 0) {
      group[resource] = amount;
    }
  }
  return group;
}

/**
 * Cost of one Stack layer for a card of this unit that carries `currentStacks`
 * layers (default 0 = its first layer) — USER RULING 2026-09-30 (supersedes the
 * 2026-09-29 "Nth layer = N gold" ladder): the Nth layer costs the card's GROUP
 * reinforcement cost (polishStackGroupCost, valuables included) + N gold. E.g.
 * Gargoyles Group 4 gold → 1st Stack 5, 2nd 6, 3rd 7; Magi 11 → 12, 13. The
 * tier adds nothing. Null when the unit cannot carry Stacks.
 * This is the BASE price only: the town Population purchase still folds a
 * reserved {kind:"stack"} Legion voucher via applyRecruitGoldDiscount and pays
 * through spendRecruitResources, where the Freelancer's Guild may substitute for
 * missing gold (see BUY_UNIT_STACK in adventure-reducer.ts).
 */
export function polishUnitStackCost(
  unitDefId: string,
  side: PolishStackSide = "pack",
  currentStacks = 0
): ResourceCost | null {
  const group = polishStackGroupCost(unitDefId, side);
  if (!group) {
    return null;
  }
  return { ...group, gold: (group.gold ?? 0) + polishStackLayerPrice(currentStacks) };
}

/**
 * Gold a Settlement or a FREE-Stack source (Garden of Life, Necropolis City
 * Hall, the Skeletons reward) charges for this card's next layer — USER RULING
 * 2026-09-30: the source "covers the difference in cost between Stack and
 * Group", so the player pays only the ladder part: N gold for the Nth layer
 * (1st layer 1 gold, 2nd 2 gold …), never the Group's valuables — even on a
 * Settlement's first flag.
 */
export function polishFreeStackTopUpGold(unit: Pick<ArmyUnitState, "stacks">): number {
  return polishStackLayerPrice(unit.stacks ?? 0);
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
export function polishArmyUnitCanBuyStack(unit: ArmyUnitState, state?: PolishStackRulesView | null): boolean {
  if (unit.side !== "pack" && unit.side !== "neutral") {
    return false;
  }
  const side: PolishStackSide = unit.side;
  const cap = polishUnitStackCap(unit.unitDefId, side, state);
  return cap > 0 && (unit.stacks ?? 0) < cap;
}

/** Cost for the army card's actual side (Pack or Neutral). */
export function polishArmyUnitStackCost(unit: ArmyUnitState): ResourceCost | null {
  if (unit.side !== "pack" && unit.side !== "neutral") {
    return null;
  }
  return polishUnitStackCost(unit.unitDefId, unit.side, unit.stacks ?? 0);
}

/** Cap for the army card's actual side (always army bronze/silver/gold table). */
export function polishArmyUnitStackCap(unit: ArmyUnitState, state?: PolishStackRulesView | null): number {
  if (unit.side !== "pack" && unit.side !== "neutral") {
    return 0;
  }
  return polishUnitStackCap(unit.unitDefId, unit.side, state);
}

/** Plain-words tier cap for UI (e.g. "bronze · max 3"). */
export function polishUnitStackCapLabel(unitDefId: string, state?: PolishStackRulesView | null): string {
  const tier = coreUnitDefinitions[unitDefId]?.tier;
  const cap = polishUnitStackCap(unitDefId, "pack", state);
  if (!tier || cap <= 0) {
    return "";
  }
  if (!Number.isFinite(cap)) {
    return `${tier} · no cap`;
  }
  const tierName = tier === "azure" ? "azure (gold cap)" : tier;
  return `${tierName} · max ${cap}`;
}
