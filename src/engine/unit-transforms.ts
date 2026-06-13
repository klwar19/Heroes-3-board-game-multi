import { coreUnitDefinitions } from "@/data/factions/units";
import { applyUnitSideRules, specialtyTransformHealth } from "./ruleset";
import type { CombatUnitState, EffectDefinition, GameRuleset, UnitTransformState } from "./state";

/**
 * Sandro's Cloak of the Undead King: specialty cards physically placed on a
 * unit card. The stack lives on the army card (and is mirrored onto the
 * combat unit), bottom-up — the LAST entry is on top and its statistics
 * replace the unit's printed side until that card is defeated.
 */

type TransformEffect = Extract<EffectDefinition, { type: "TRANSFORM_UNIT" }>;

/** The transform entry a specialty play creates (BINH health baked in). */
export function makeUnitTransformState(
  effect: TransformEffect,
  cardId: string,
  ruleset: GameRuleset
): UnitTransformState {
  return {
    cardId,
    name: effect.newName,
    attack: effect.attack,
    defense: effect.defense,
    health: specialtyTransformHealth(ruleset, cardId, effect.health),
    initiative: effect.initiative,
    ...(effect.cardImage ? { cardImage: effect.cardImage } : {}),
    ...(effect.alwaysOnTop ? { alwaysOnTop: true } : {})
  };
}

export function topTransform(holder: { transforms?: UnitTransformState[] }): UnitTransformState | undefined {
  return holder.transforms?.at(-1);
}

/**
 * Whether this specialty card may be placed on the unit right now. The
 * checks always look at the UNDERLYING card (name, printed side), per the
 * printed FAQ: the Legion goes on Few, Pack or even a Horde and always stays
 * on top, while the level I/IV Hordes need the bare pack side (they slide
 * under an already-placed Legion).
 */
export function canPlaceTransformOn(
  underlyingName: string,
  underlyingVariant: "few" | "pack" | "neutral",
  transforms: UnitTransformState[] | undefined,
  effect: TransformEffect
): boolean {
  if (underlyingName !== effect.targetUnitName) {
    return false;
  }
  if (!(effect.targetVariants as string[]).includes(underlyingVariant)) {
    return false;
  }

  const stack = transforms ?? [];
  if (effect.alwaysOnTop) {
    // One Legion at a time; a Horde underneath is fine ("even a Horde").
    return !stack.some((entry) => entry.alwaysOnTop);
  }

  // One Horde at a time; an alwaysOnTop Legion above it is fine.
  return !stack.some((entry) => !entry.alwaysOnTop);
}

/** Inserts a transform, keeping alwaysOnTop cards (the Legion) on top. */
export function insertUnitTransform(
  transforms: UnitTransformState[] | undefined,
  entry: UnitTransformState
): UnitTransformState[] {
  const stack = [...(transforms ?? [])];
  if (entry.alwaysOnTop) {
    stack.push(entry);
    return stack;
  }

  const topIndex = stack.findIndex((candidate) => candidate.alwaysOnTop);
  if (topIndex === -1) {
    stack.push(entry);
  } else {
    stack.splice(topIndex, 0, entry);
  }
  return stack;
}

/** Display name of a printed unit side ("Few X" / "Pack of X" / "Neutral X"). */
export function printedCardName(side: "few" | "pack" | "neutral", unitName: string): string {
  return side === "few" ? `Few ${unitName}` : side === "pack" ? `Pack of ${unitName}` : `Neutral ${unitName}`;
}

/**
 * Recomputes a combat unit's fighting statistics from its current top: the
 * topmost transform when one is on the card (printed abilities inactive,
 * wiki FAQ), otherwise the printed side with the ruleset's unit tweaks.
 * Damage stays as it is — the tokens sit on the physical stack.
 */
export function applyUnitCurrentSide(unit: CombatUnitState, ruleset: GameRuleset): void {
  const top = topTransform(unit);
  if (top) {
    unit.cardName = top.name;
    unit.attack = top.attack;
    unit.defense = top.defense;
    unit.maxHealth = top.health;
    unit.initiative = top.initiative;
    unit.abilities = [];
    if (unit.assets && top.cardImage) {
      unit.assets.cardImage = top.cardImage;
    }
    return;
  }

  const def = unit.unitDefId ? coreUnitDefinitions[unit.unitDefId] : undefined;
  const printed =
    unit.variant === "few" ? def?.few : unit.variant === "pack" ? def?.pack : def?.neutral;
  if (!def || !printed) {
    return;
  }

  const side = applyUnitSideRules(ruleset, unit.unitDefId as string, unit.variant, printed);
  unit.cardName = printedCardName(unit.variant, def.name);
  unit.attack = side.attack;
  unit.defense = side.defense;
  unit.maxHealth = side.health;
  unit.initiative = side.initiative;
  unit.abilities = side.abilities;
  if (unit.assets && side.cardImage) {
    unit.assets.cardImage = side.cardImage;
  }
}
