import { coreUnitDefinitions } from "@/data/factions/units";
import { CREATURE_BANK_UNIT_SIDES, stackTokenDelta } from "@/data/map/creature-banks";
import { applyUnitSideRules, specialtyTransformHealth } from "./ruleset";
import { attackBonusIfFlippedForAbilityIds } from "./unit-abilities";
import { combatUnitRankFold, neutralStackRankFold, withRankAbilities } from "./unit-experience";
import { withMgqJobAbilities } from "./mgq-jobs";
import { maxHealthAfterUnitAbilityEffects } from "./unit-abilities";
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
    ...(effect.alwaysOnTop ? { alwaysOnTop: true } : {}),
    ...(effect.stackAttackBonus ? { stackAttackBonus: effect.stackAttackBonus } : {})
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

/** The other printed side a card shows once it flips (what a Pack becomes). */
export type UnitFlipSide = {
  side: "few";
  cardName: string;
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  type: CombatUnitState["type"];
  abilities: string[];
  /**
   * Cove Haspids' "Vengeance": the ATTACK_BONUS_IF_FLIPPED the Few side gains
   * BECAUSE of this very flip. `attack` above stays the printed card value; this
   * is the extra the unit will really strike with once the flip happens, so the
   * preview does not understate the one bonus whose trigger IS the flip. 0 for
   * every other unit.
   */
  flippedAttackBonus: number;
};

/**
 * What a PACK unit turns into when it takes lethal damage: its own card's FEW
 * side, with the same house-rule side tweaks the engine would apply when the flip
 * actually happens (`applyUnitSideRules` — so a buffed Few reads its buffed
 * numbers here too, and the per-side `type` switch is reflected: a Pack shooter
 * that reverts to a melee Few shows "ground").
 *
 * Returns null when nothing will flip — a Few or Neutral side, a Creature-Bank /
 * boss card, a Clone (clones never flip), a unit wearing a specialty transform
 * (its cover decides the stats), or a definition with no Few side. Read-only: it
 * derives from the shipped definitions and mutates nothing, so it is safe to call
 * from the UI on every render. Rank folds and Polish Stack layers are deliberately
 * NOT applied — this is the printed card the player is about to see.
 */
export function unitFlipSidePreview(
  unit: CombatUnitState,
  ruleset: GameRuleset,
  overrides?: { griffinBuff?: boolean; marksmanBuff?: boolean; phoenixPackRebirth?: boolean }
): UnitFlipSide | null {
  if (unit.variant !== "pack" || unit.bankUnit || unit.bossUnit || unit.cloneOfUnitId || topTransform(unit)) {
    return null;
  }
  const def = unit.unitDefId ? coreUnitDefinitions[unit.unitDefId] : undefined;
  if (!def?.few) {
    return null;
  }
  const side = applyUnitSideRules(ruleset, unit.unitDefId as string, "few", def.few, overrides);
  const abilities = [...(side.abilities ?? [])];
  return {
    side: "few",
    cardName: printedCardName("few", def.name),
    attack: side.attack,
    defense: side.defense,
    health: side.health,
    initiative: side.initiative,
    type: side.type ?? def.type,
    abilities,
    flippedAttackBonus: attackBonusIfFlippedForAbilityIds(abilities)
  };
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
  /** Unit house-rule overrides; falls back to the bundled mode default. */
  overrides?: {
    griffinBuff?: boolean;
    marksmanBuff?: boolean;
    polishUnitStacks?: boolean;
    /** Neutral Rank-Up (optional module): a Stacked bank defender fights one rank up. */
    neutralRankUp?: boolean;
    /** Phoenix Pack Rebirth (BINH house rule). */
    phoenixPackRebirth?: boolean;
  }
): void {
  const top = topTransform(unit);
  if (top) {
    // Polish Balance Pack Sandro I / Vidomina IV: "Put this card on the Stack or
    // Pack … When the card is played on the Stack it gives additional +1 ⚔."
    // A "Stack" IS a Pack card carrying paid Polish layers, so the cover's own
    // +1 is folded on top of its printed Attack while at least one layer is left
    // (the cover replaces the card's statistics, so the Stack's ordinary flat +1
    // is gone — this rider is what the reprint gives back, and only on a Stack).
    const coverStackBonus =
      overrides?.polishUnitStacks && (unit.armyStacks ?? 0) > 0 ? top.stackAttackBonus ?? 0 : 0;
    unit.cardName = top.name;
    unit.attack = top.attack + coverStackBonus;
    unit.defense = top.defense;
    unit.maxHealth = top.health;
    unit.initiative = top.initiative;
    // A Job is a separate persistent token on the army card, not printed text
    // covered by the transform. Its base package and rank-3 signature remain.
    unit.abilities = withMgqJobAbilities(withRankAbilities([], combatUnitRankFold(unit)), unit.job);
    if (unit.assets && top.cardImage) {
      unit.assets.cardImage = top.cardImage;
    }
    return;
  }

  // Creature Bank units fight from their own card. A Stacked unit adds one
  // Stack Token bonus (won cards use the player's choice; bank defenders use
  // the setup result, and Polish Bank Sizes can guarantee the token count).
  if (unit.bankUnit && unit.unitDefId) {
    const bankSide = CREATURE_BANK_UNIT_SIDES[unit.unitDefId];
    if (!bankSide) {
      return;
    }
    const bonus = (stat: "attack" | "defense" | "health" | "initiative") =>
      unit.stackToken === stat ? stackTokenDelta(stat) : 0;
    // Neutral Rank-Up (optional module) — STACKS half: a Stacked bank defender
    // fights one veteran rank up (Seasoned), on TOP of the Stack Token, folded
    // through the shared rank machinery keyed off the underlying unit def. Gated
    // on the LIVE token, so absorbing it (stackToken → null) reverts to a plain
    // bank card on the recompute. No-op (rankFold null) while the module is off.
    const rankFold =
      overrides?.neutralRankUp && unit.stackToken ? neutralStackRankFold(unit.unitDefId) : null;
    unit.attack = bankSide.attack + bonus("attack") + (rankFold?.attack ?? 0);
    unit.defense = bankSide.defense + bonus("defense") + (rankFold?.defense ?? 0);
    unit.maxHealth = bankSide.health + bonus("health") + (rankFold?.health ?? 0);
    unit.initiative = bankSide.initiative + bonus("initiative") + (rankFold?.initiative ?? 0);
    unit.abilities = rankFold ? withRankAbilities(bankSide.abilities, rankFold) : bankSide.abilities;
    if (rankFold && rankFold.rank > 0) {
      unit.unitRank = rankFold.rank;
    } else {
      delete unit.unitRank;
    }
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
  // Polish Unit Stacks: a Pack Group or recruited Neutral gets one flat +1
  // Attack while at least one paid layer remains. It never scales with the
  // number of layers and never applies to Few cards or specialty covers.
  const armyStackAttack =
    overrides?.polishUnitStacks &&
    (unit.variant === "pack" || unit.variant === "neutral") &&
    (unit.armyStacks ?? 0) > 0
      ? 1
      : 0;
  // Unit Experience (optional rule): re-fold the veteran-rank bonuses + elite
  // ability on every printed-side recompute (a Pack→Few flip keeps its rank),
  // exactly like the permanent bonuses above. No-op without mirrored XP.
  const rankFold = combatUnitRankFold(unit);
  // Creature Bank Stacked reward: a rulebook Stack Token on a PLAYER army card
  // folds its stat bonus here too (a bank DEFENDER is handled by the branch above
  // and returns), so a Pack→Few flip or any recompute keeps the token bonus while
  // the token is live — exactly like permanentAttackBonus. markUnitRemovedIfNeeded
  // clears unit.stackToken when it absorbs a lethal blow, so this fold then drops
  // to 0. No-op on a normally-recruited card (no token).
  const tokenBonus = (stat: "attack" | "defense" | "health" | "initiative") =>
    unit.stackToken === stat ? stackTokenDelta(stat) : 0;
  const combatAbilityIds = withMgqJobAbilities(withRankAbilities(side.abilities, rankFold), unit.job);
  unit.attack = side.attack + (unit.permanentAttackBonus ?? 0) + armyStackAttack + rankFold.attack + tokenBonus("attack");
  unit.defense = side.defense + rankFold.defense + tokenBonus("defense");
  // combatMaxHealthBonus: ADD_UNIT_MAX_HEALTH (Valeska, Vial, Ivor VI…). Must
  // re-fold here so a Pack→Few flip or a Polish Stack layer loss keeps the
  // same +HP on the new health bar (stack / pack / few all share the bonus).
  unit.maxHealth = maxHealthAfterUnitAbilityEffects(
    side.health +
      (unit.permanentHealthBonus ?? 0) +
      (unit.combatMaxHealthBonus ?? 0) +
      rankFold.health +
      tokenBonus("health"),
    combatAbilityIds
  );
  unit.initiative = side.initiative + rankFold.initiative + tokenBonus("initiative");
  unit.abilities = combatAbilityIds;
  if (rankFold.rank > 0) {
    unit.unitRank = rankFold.rank;
  } else {
    delete unit.unitRank;
  }
  if (unit.assets && side.cardImage) {
    unit.assets.cardImage = side.cardImage;
  }
}
