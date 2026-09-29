import { coreUnitDefinitions } from "@/data/factions/units";

import { armyUnitStacksActive, houseRuleEnabled } from "./house-rules";
import type { ArmyUnitState, GameState, ResourceCost, UnitGrade } from "./state";

/** Game state slice the Stack cap reads (the Unlimited Stacks house rule). */
export type PolishStackRulesView = Pick<GameState, "ruleset" | "adventure" | "anime">;

/**
 * Polish house rule "Unlimited Stacks" (USER RULING 2026-09-29): Stack layers
 * have NO tier cap. Only meaningful while army Unit Stacks are active; the
 * price ladder is the same escalating one (see polishStackLayerPrice).
 */
export function polishUnlimitedStacksEnabled(state?: PolishStackRulesView | null): boolean {
  return Boolean(state && houseRuleEnabled(state, "polish-unlimited-stacks") && armyUnitStacksActive(state));
}

/**
 * Printed Polish house-rule cap for each faction tier. `goldSurcharge` is the
 * PRE-2026-09-29 tier fee, kept only for the Dracon IV refund text and old
 * readers — the Stack PRICE is now the escalating ladder (polishStackLayerPrice).
 * The surcharge IS the "nr of tier" of the user ruling (bronze 1 / silver 2 /
 * gold 3). AZURE has no row on purpose: it is priced (and capped) as gold, the
 * same azure→gold convention the cap uses — a literal tier number would be 4,
 * so changing it is a conscious decision, pinned in
 * `polish-stack-reinforcement-price.test.ts`.
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
 * Gold price of a unit card's NEXT Stack layer — USER RULING 2026-09-29: "each
 * stack costs +1 gold more than the previous": the card's 1st layer costs 1
 * gold, its 2nd 2 gold, its Nth N gold. Counted PER UNIT CARD; tier, side and
 * printed valuables no longer matter. `currentStacks` is the layer count the
 * card already carries.
 */
export function polishStackLayerPrice(currentStacks: number): number {
  return Math.max(0, Math.trunc(currentStacks)) + 1;
}

/**
 * Cost of one Stack layer for a card of this unit that carries `currentStacks`
 * layers (default 0 = its first layer). Null when the unit cannot carry Stacks
 * (no tier / no such side). Gold only — the whole price is the ladder.
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
  return { gold: polishStackLayerPrice(currentStacks) };
}

/**
 * A FREE-Stack source (Garden of Life, Necropolis City Hall, the Skeletons
 * reward) — USER RULING 2026-09-29: the free part covers the 1st layer's price
 * (1 gold); the player pays the difference for a higher layer (layer 1 free,
 * layer 2 pays 1, layer 3 pays 2 …). Gold owed for this card's next layer.
 */
export function polishFreeStackTopUpGold(unit: Pick<ArmyUnitState, "stacks">): number {
  return Math.max(0, polishStackLayerPrice(unit.stacks ?? 0) - polishStackLayerPrice(0));
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
