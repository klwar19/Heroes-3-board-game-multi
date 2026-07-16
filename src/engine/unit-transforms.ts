import { coreUnitDefinitions } from "@/data/factions/units";
import { CREATURE_BANK_UNIT_SIDES, stackTokenDelta } from "@/data/map/creature-banks";
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
  ruleset: GameRuleset,
  /** `sandro-skeleton-hp` toggle; falls back to the bundled mode default. */
  sandroSkeletonHp?: boolean
): UnitTransformState {
  return {
    cardId,
    name: effect.newName,
    attack: effect.attack,
    defense: effect.defense,
    health: specialtyTransformHealth(ruleset, cardId, effect.health, sandroSkeletonHp),
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
export function applyUnitCurrentSide(
  unit: CombatUnitState,
  ruleset: GameRuleset,
  /** Griffin/Marksman toggle overrides; falls back to the bundled mode default. */
  overrides?: { griffinBuff?: boolean; marksmanBuff?: boolean; polishUnitStacks?: boolean }
): void {
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

  // Creature Bank defenders fight from their own card. Standard banks may add
  // one random-stat Stack Token; Polish sized banks instead add deterministic
  // full-health layers to every card and a flat +1 Attack while any layer is
  // left. The two representations are mutually exclusive at construction.
  if (unit.bankUnit && unit.unitDefId) {
    const bankSide = CREATURE_BANK_UNIT_SIDES[unit.unitDefId];
    if (!bankSide) {
      return;
    }
    const bonus = (stat: "attack" | "defense" | "health" | "initiative") =>
      unit.stackToken === stat ? stackTokenDelta(stat) : 0;
    const polishStackAttack = (unit.bankStacks ?? 0) > 0 ? 1 : 0;
    unit.attack = bankSide.attack + bonus("attack") + polishStackAttack;
    unit.defense = bankSide.defense + bonus("defense");
    unit.maxHealth = bankSide.health + bonus("health");
    unit.initiative = bankSide.initiative + bonus("initiative");
    unit.abilities = bankSide.abilities;
    return;
  }

  const def = unit.unitDefId ? coreUnitDefinitions[unit.unitDefId] : undefined;
  const printed =
    unit.variant === "few" ? def?.few : unit.variant === "pack" ? def?.pack : def?.neutral;
  if (!def || !printed) {
    return;
  }

  const side = applyUnitSideRules(ruleset, unit.unitDefId as string, unit.variant, printed, overrides);
  unit.cardName = printedCardName(unit.variant, def.name);
  // The melee/ranged/flying TYPE is a per-side property (`side.type ?? def.type`),
  // exactly like the creation-time formula in makeCombatUnitFromArmy. Recompute it
  // here so a mid-combat side change carries the new type: Storm/Ice Elementals are
  // ranged on their Pack side but MELEE (ground) on the Few side, so a Pack knocked
  // down to its Few side must stop shooting and fight in melee — likewise a Pack
  // Energy Elemental (flying) reverts to ground, and a Pack Gremlin/Titan (ranged)
  // reverts to ground. Without this the flipped unit kept its Pack type and behaved
  // as a shooter on a melee card.
  unit.type = side.type ?? def.type;
  // House rule (BINH) — Gelu IV: re-apply the permanent +Attack onto the printed
  // side so a Gelu-recruited Sharpshooters keeps its buff across any recompute
  // (e.g. a Pack→Few flip). A specialty cover (top branch) or a bank card (above)
  // replaces stats wholesale and intentionally drops the bonus while covered.
  // Polish Unit Stacks: a Group (Pack) gets one flat +1 Attack while at least
  // one paid layer remains. It never scales with the number of layers and never
  // applies to Few/Neutral cards or specialty covers.
  const armyStackAttack =
    overrides?.polishUnitStacks && unit.variant === "pack" && (unit.armyStacks ?? 0) > 0 ? 1 : 0;
  unit.attack = side.attack + (unit.permanentAttackBonus ?? 0) + armyStackAttack;
  unit.defense = side.defense;
  unit.maxHealth = side.health + (unit.permanentHealthBonus ?? 0);
  unit.initiative = side.initiative;
  unit.abilities = side.abilities;
  if (unit.assets && side.cardImage) {
    unit.assets.cardImage = side.cardImage;
  }
}
