import { unitAbilities, type UnitAbilityDefinition, type UnitAbilityEffectDefinition } from "@/data/units/abilities";
import { BATTLEFIELD_COLUMNS } from "./battlefield";
import type { CombatState, CombatTokenKind, CombatUnitState, DamageKind, SpellSchool, UnitId } from "./state";

export type UnitAbilityDamageEffect = {
  abilityId: string;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  amount: number;
  damageKind: DamageKind;
  message: string;
};

type PostAttackContext = {
  attacker: CombatUnitState;
  defender: CombatUnitState;
  attackKind: "melee" | "ranged";
  roll: number;
  damage: number;
};

function isAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

function isAdjacent(leftPosition: number, rightPosition: number): boolean {
  const leftRow = Math.floor(leftPosition / BATTLEFIELD_COLUMNS);
  const leftColumn = leftPosition % BATTLEFIELD_COLUMNS;
  const rightRow = Math.floor(rightPosition / BATTLEFIELD_COLUMNS);
  const rightColumn = rightPosition % BATTLEFIELD_COLUMNS;

  return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn) === 1;
}

export function getUnitAbilityDefinitions(unit: CombatUnitState): UnitAbilityDefinition[] {
  // Disrupting Ray: a suppressed unit "cannot use their special ability". This
  // is the single chokepoint every ability read flows through, so returning []
  // here switches off ALL of the unit's abilities — whatever it has now or
  // gains later — for as long as the suppression lasts. The flag is kept in
  // sync with the UNIT_ABILITY_SUPPRESSED active effect by syncAbilitySuppression.
  if (unit.abilitiesSuppressed) {
    return [];
  }
  // Standard bank cards are Stacked while their random-stat token remains.
  // Polish sized banks use 1/2/3 deterministic coin layers on every defender.
  // Paid armyStacks stay excluded: bank-only abilities must never leak onto a
  // player's army card even if another effect copied an ability id onto it.
  const isStacked = Boolean(unit.stackToken) || (unit.bankUnit === true && (unit.bankStacks ?? 0) > 0);
  return unit.abilities
    .map((abilityId) => unitAbilities[abilityId])
    .filter(Boolean)
    // "As long as this unit is Stacked …": a Creature Bank card's Stacked-only
    // ability vanishes — for every read, combat or display — the instant the
    // unit is not Stacked (never given a token, or it was discarded on a lethal
    // hit). Non-bank abilities never set the flag, so this is a no-op for them.
    .filter((ability) => !ability.requiresStacked || isStacked);
}

export function hasUnitAbilityEffect(
  unit: CombatUnitState,
  effectType: UnitAbilityEffectDefinition["type"]
): boolean {
  return getUnitAbilityDefinitions(unit).some(
    (ability) => ability.implementationStatus === "implemented" && ability.effect?.type === effectType
  );
}

function getAbilitiesWithEffect(
  unit: CombatUnitState,
  effectType: UnitAbilityEffectDefinition["type"]
): UnitAbilityDefinition[] {
  return getUnitAbilityDefinitions(unit).filter(
    (ability) => ability.implementationStatus === "implemented" && ability.effect?.type === effectType
  );
}

/**
 * Whether the unit's "roll 2 Attack dice and resolve the higher" advantage
 * applies to the current roll. The `[unit_attack]` printed variant
 * (`ownAttackOnly`) fires only on the unit's OWN declared attack, so it drops on
 * a Retaliation Attack; the `[unit_passive]` "any attack" variant applies always.
 */
export function unitHasAttackRollAdvantage(
  unit: CombatUnitState,
  isRetaliation: boolean
): boolean {
  return getAbilitiesWithEffect(unit, "ATTACK_ROLL_ADVANTAGE").some((ability) => {
    if (ability.effect?.type !== "ATTACK_ROLL_ADVANTAGE") {
      return false;
    }
    return !(ability.effect.ownAttackOnly && isRetaliation);
  });
}

/**
 * The Spell schools an Elemental is printed immune to — Magic Arrow's school
 * ("any") plus its own element (Air/Earth/Fire/Water), or just "any" for Magic
 * Elementals. Empty for ordinary units.
 */
export function getUnitImmuneSpellSchools(unit: CombatUnitState): SpellSchool[] {
  const schools = new Set<SpellSchool>();
  for (const ability of getAbilitiesWithEffect(unit, "IMMUNE_TO_SPELL_SCHOOLS")) {
    if (ability.effect?.type === "IMMUNE_TO_SPELL_SCHOOLS") {
      for (const school of ability.effect.schools) {
        schools.add(school);
      }
    }
  }
  return [...schools];
}

/**
 * Whether a unit's printed elemental immunity blocks a Spell of the given
 * schools: a Spell is immune when any of its schools is one the unit is immune
 * to ("any" is Magic Arrow's school). Other (non-elemental) units are never
 * immune by this trait.
 */
export function unitImmuneToSpellSchools(
  unit: CombatUnitState,
  spellSchools: readonly SpellSchool[] | undefined
): boolean {
  // Factory Couatls' activated invulnerability: while set the unit "ignores all
  // spell effects", so it is immune to every Spell (of any school, and the
  // school-less ones), exactly like a full immune-all-spells passive.
  if (unit.invulnerableUntilActivation) {
    return true;
  }
  if (!spellSchools || spellSchools.length === 0) {
    return false;
  }
  const immune = getUnitImmuneSpellSchools(unit);
  return immune.length > 0 && spellSchools.some((school) => immune.includes(school));
}

export function getUnitAttackRerollSources(
  unit: CombatUnitState,
  /** Whether the unit moved during this attack — gates Champions' "Charge". */
  moved = false,
  /** Whether this is a Retaliation Attack — every unit reroll ability is
   * printed [unit_attack] (own declared attack only, a distinct symbol from
   * retaliation per the rules legend), so none is offered on a retaliation. */
  isRetaliation = false
): { name: string; rerolls: number; onlyOnRoll?: number }[] {
  if (isRetaliation) {
    return [];
  }
  return getAbilitiesWithEffect(unit, "ATTACK_DIE_REROLL").flatMap((ability) =>
    ability.effect?.type === "ATTACK_DIE_REROLL" &&
    ability.effect.rerollsPerAttack > 0 &&
    (!ability.effect.requiresMoved || moved)
      ? [{ name: ability.name, rerolls: ability.effect.rerollsPerAttack, onlyOnRoll: ability.effect.onlyOnRoll }]
      : []
  );
}

/** Marksmen/Elves: attack the same non-adjacent target a second time. */
export function getDoubleAttackAbility(unit: CombatUnitState): { abilityId: string; maxRoll?: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "DOUBLE_ATTACK")) {
    if (ability.effect?.type === "DOUBLE_ATTACK") {
      return { abilityId: ability.id, maxRoll: ability.effect.maxRoll };
    }
  }

  return null;
}

/**
 * Liches' Death Cloud: a full second attack against a unit adjacent to the
 * original target, with the printed replacement attack value.
 */
export function getSecondAttackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; baseAttack: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SECOND_ATTACK_ADJACENT_TO_TARGET")) {
    if (ability.effect?.type === "SECOND_ATTACK_ADJACENT_TO_TARGET") {
      return { abilityId: ability.id, abilityName: ability.name, baseAttack: ability.effect.baseAttack };
    }
  }

  return null;
}

/** Wolf Raiders: a same-target second attack after retaliation has resolved. */
export function getAfterRetaliationAttackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION")) {
    if (ability.effect?.type === "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }

  return null;
}

export type AttackDieDamageFollowUp = {
  abilityId: string;
  abilityName: string;
  minRoll: number;
  /** When set, the face must also be ≤ maxRoll (Wyverns: exactly "0"). */
  maxRoll?: number;
  amount: number;
};

/**
 * Thunderbirds / Wyverns: roll one extra Attack die and damage the original
 * target when the face is within [minRoll, maxRoll] (Thunderbirds 0/+1,
 * Wyverns exactly 0).
 */
export function getAttackDieDamageFollowUps(unit: CombatUnitState): AttackDieDamageFollowUp[] {
  return getAbilitiesWithEffect(unit, "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET").flatMap((ability) =>
    ability.effect?.type === "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET"
      ? [
          {
            abilityId: ability.id,
            abilityName: ability.name,
            minRoll: ability.effect.minRoll,
            ...(ability.effect.maxRoll !== undefined ? { maxRoll: ability.effect.maxRoll } : {}),
            amount: ability.effect.amount
          }
        ]
      : []
  );
}

/**
 * Hydras: one more separate attack against an enemy adjacent to the Hydra.
 * Cove Ayssids reuse this with `requiresTargetRemoved` so the caller only fires
 * the follow-up when the primary attack removed the original target.
 */
export function getSelfAdjacentSecondAttackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; baseAttack?: number; requiresTargetRemoved: boolean } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SECOND_ATTACK_ONE_ADJACENT_TO_SELF")) {
    if (ability.effect?.type === "SECOND_ATTACK_ONE_ADJACENT_TO_SELF") {
      return {
        abilityId: ability.id,
        abilityName: ability.name,
        baseAttack: ability.effect.baseAttack,
        requiresTargetRemoved: Boolean(ability.effect.requiresTargetRemoved)
      };
    }
  }

  return null;
}

/** Gold Dragons: a separate attack against the unit directly behind the target. */
export function getLineAttackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; baseAttack: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SECOND_ATTACK_BEHIND_TARGET")) {
    if (ability.effect?.type === "SECOND_ATTACK_BEHIND_TARGET") {
      return { abilityId: ability.id, abilityName: ability.name, baseAttack: ability.effect.baseAttack };
    }
  }

  return null;
}

export type ParalysisFollowUp = {
  abilityId: string;
  abilityName: string;
  source: "own" | "extra";
  onRoll: number;
};

/** Azure Dragons / Basilisks: paralyse the target on a matching Attack die face. */
export function getParalysisFollowUps(unit: CombatUnitState): ParalysisFollowUp[] {
  return getAbilitiesWithEffect(unit, "PARALYZE_TARGET_ON_DIE").flatMap((ability) =>
    ability.effect?.type === "PARALYZE_TARGET_ON_DIE"
      ? [
          {
            abilityId: ability.id,
            abilityName: ability.name,
            source: ability.effect.source,
            onRoll: ability.effect.onRoll
          }
        ]
      : []
  );
}

/** Neutral Magi: after its attack the defender discards a Power card or a random one. */
export function getEnemyDiscardAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ENEMY_DISCARDS_POWER_OR_RANDOM")) {
    if (ability.effect?.type === "ENEMY_DISCARDS_POWER_OR_RANDOM") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }

  return null;
}

export function getAttackDefenseReductionAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; amount: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "DEFENSE_REDUCTION_ON_ATTACK")) {
    if (ability.effect?.type === "DEFENSE_REDUCTION_ON_ATTACK") {
      return { abilityId: ability.id, abilityName: ability.name, amount: ability.effect.amount };
    }
  }

  return null;
}

/** Manticores (Pack): treat the target's printed card Defense as 0 for this attack. */
export function getIgnoreTargetCardDefenseAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "IGNORE_TARGET_CARD_DEFENSE")) {
    if (ability.effect?.type === "IGNORE_TARGET_CARD_DEFENSE") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }

  return null;
}

/** Troglodytes / Gargoyles: cannot gain a Paralysis token. */
export function hasIgnoreParalysis(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IGNORE_PARALYSIS");
}

/**
 * WOG commander Damage grade ("Might"): the number of ADDITIONAL attack dice
 * this unit rolls on each of its attacks (and retaliations). The caller rolls
 * that many dice, adds +1 to the attack for each "+1" face and subtracts 1 for
 * the whole roll if any "−1" face appears (at most one "−1" counts). Resolved
 * in reducer.ts (rolled once per attack, reused by the lethal-save preview).
 */
export function getMightDiceCount(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "MIGHT_ATTACK_DICE").reduce(
    (total, ability) => total + (ability.effect?.type === "MIGHT_ATTACK_DICE" ? ability.effect.dice : 0),
    0
  );
}

/**
 * The Might-dice attack modifier for a rolled pool of ADDITIONAL attack dice:
 * +1 per "+1" face, and −1 for the whole pool if any "−1" face appears (extra
 * "−1"s are ignored). Pure so the reducer and its tests share one definition.
 */
export function mightDiceAttackBonus(rolls: readonly number[]): number {
  const plus = rolls.filter((roll) => roll > 0).length;
  const anyMinus = rolls.some((roll) => roll < 0);
  return plus - (anyMinus ? 1 : 0);
}

/**
 * WOG commander Charge combo: +Attack when this unit attacks after having
 * moved this activation (never on a retaliation).
 */
export function getAttackBonusAfterMove(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "ATTACK_BONUS_AFTER_MOVE").reduce(
    (total, ability) => total + (ability.effect?.type === "ATTACK_BONUS_AFTER_MOVE" ? ability.effect.amount : 0),
    0
  );
}

/**
 * Factory Armadillos (Pack): a positive Initiative increase this unit receives
 * from active effects is amplified by one more point (read in effectiveInitiative).
 */
export function hasAmplifyInitiativeIncrease(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "AMPLIFY_INITIATIVE_INCREASE");
}

/** Archangels: the once-per-combat "cancel a killing blow on another unit" ability. */
export function getLethalSaveUnitAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "CANCEL_LETHAL_UNIT_ABILITY")) {
    if (ability.effect?.type === "CANCEL_LETHAL_UNIT_ABILITY") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/**
 * Factory Bounty Hunters: the "Mark an enemy at combat start" ability, if this
 * unit carries it (the caller places the Mark token; `attackBonus` is the bonus
 * the unit later gets against Marked units).
 */
export function getCombatStartMark(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; attackBonus: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "MARK_AND_HUNT")) {
    if (ability.effect?.type === "MARK_AND_HUNT") {
      return { abilityId: ability.id, abilityName: ability.name, attackBonus: ability.effect.attackBonus };
    }
  }
  return null;
}

/**
 * Factory Bounty Hunters: the extra Attack this unit gets for striking a Marked
 * unit. 0 unless the defender carries a Mark AND this attacker has the ability.
 */
export function getAttackBonusVsMarked(attacker: CombatUnitState, defender: CombatUnitState): number {
  if (!defender.marked) {
    return 0;
  }
  return getAbilitiesWithEffect(attacker, "MARK_AND_HUNT").reduce(
    (total, ability) => total + (ability.effect?.type === "MARK_AND_HUNT" ? ability.effect.attackBonus : 0),
    0
  );
}

/**
 * "Hatred" Attack bonus: extra Attack this unit gains when its target's
 * creature name matches a printed grudge (Archangels ↔ Arch Devils, Genies →
 * Efreet, Titans → Black Dragons).
 */
export function getAttackBonusVsDefenderName(attacker: CombatUnitState, defenderName: string): number {
  return getAbilitiesWithEffect(attacker, "ATTACK_BONUS_VS_UNIT_NAME").reduce(
    (total, ability) =>
      ability.effect?.type === "ATTACK_BONUS_VS_UNIT_NAME" && ability.effect.unitName === defenderName
        ? total + ability.effect.amount
        : total,
    0
  );
}

/**
 * Zombies / Manticores: extra Defense the defender gains for an incoming attack
 * whose resolved Attack die is within an ability's [minRoll, maxRoll] window.
 */
export function getDefenseBonusOnAttackDie(defender: CombatUnitState, roll: number): number {
  return getAbilitiesWithEffect(defender, "DEFENSE_BONUS_ON_ATTACK_DIE").reduce(
    (total, ability) =>
      ability.effect?.type === "DEFENSE_BONUS_ON_ATTACK_DIE" &&
      roll >= ability.effect.minRoll &&
      roll <= ability.effect.maxRoll
        ? total + ability.effect.amount
        : total,
    0
  );
}

/**
 * Dread Knights (Pack): extra Attack the attacker gains when its own resolved
 * Attack die is within an ability's [minRoll, maxRoll] window.
 */
export function getAttackBonusOnAttackDie(attacker: CombatUnitState, roll: number): number {
  return getAbilitiesWithEffect(attacker, "ATTACK_BONUS_ON_ATTACK_DIE").reduce(
    (total, ability) =>
      ability.effect?.type === "ATTACK_BONUS_ON_ATTACK_DIE" &&
      roll >= ability.effect.minRoll &&
      roll <= ability.effect.maxRoll
        ? total + ability.effect.amount
        : total,
    0
  );
}

/** The attack-die Attack-bonus abilities that actually fired on this roll (for FX/logging). */
export function getTriggeredAttackDieBonusAbilities(
  attacker: CombatUnitState,
  roll: number
): { abilityId: string; abilityName: string; amount: number }[] {
  return getAbilitiesWithEffect(attacker, "ATTACK_BONUS_ON_ATTACK_DIE").flatMap((ability) =>
    ability.effect?.type === "ATTACK_BONUS_ON_ATTACK_DIE" &&
    roll >= ability.effect.minRoll &&
    roll <= ability.effect.maxRoll
      ? [{ abilityId: ability.id, abilityName: ability.name, amount: ability.effect.amount }]
      : []
  );
}

export type OnAttackDieToken = {
  abilityId: string;
  abilityName: string;
  onRoll: number;
  token: CombatTokenKind;
  amount: number;
};

/** Rust Dragons: token placed on the target when the attack's own die matches. */
export function getOnAttackDieTokens(unit: CombatUnitState): OnAttackDieToken[] {
  return getAbilitiesWithEffect(unit, "ON_ATTACK_DIE_TOKEN").flatMap((ability) =>
    ability.effect?.type === "ON_ATTACK_DIE_TOKEN"
      ? [
          {
            abilityId: ability.id,
            abilityName: ability.name,
            onRoll: ability.effect.onRoll,
            token: ability.effect.token,
            amount: ability.effect.amount
          }
        ]
      : []
  );
}

export type DeathStareFollowUp = {
  abilityId: string;
  abilityName: string;
  diceCount: number;
  onRoll: number;
};

/** Gorgons: roll extra dice after the attack and instakill the target on all-matching faces. */
export function getDeathStareFollowUps(unit: CombatUnitState): DeathStareFollowUp[] {
  return getAbilitiesWithEffect(unit, "DEATH_STARE_ON_DICE").flatMap((ability) =>
    ability.effect?.type === "DEATH_STARE_ON_DICE"
      ? [
          {
            abilityId: ability.id,
            abilityName: ability.name,
            diceCount: ability.effect.diceCount,
            onRoll: ability.effect.onRoll
          }
        ]
      : []
  );
}

export type FlatDamageFollowUp = {
  abilityId: string;
  abilityName: string;
  amount: number;
  /** Units the attacker may pick from; the hit is mandatory when non-empty. */
  candidateUnitIds: UnitId[];
};

/**
 * Flat-damage follow-ups of a resolved attack: Magog fireball splash (a unit
 * adjacent to the target, friend or foe) and the Cerberi second head
 * (another enemy unit adjacent to Cerberi). Candidates are computed against
 * the original target's last position, so a defender killed by the attack
 * still anchors the splash.
 */
export function getFlatDamageFollowUps(
  combat: CombatState,
  context: { attacker: CombatUnitState; defender: CombatUnitState; attackKind: "melee" | "ranged" }
): FlatDamageFollowUp[] {
  const followUps: FlatDamageFollowUp[] = [];
  const { attacker, defender } = context;
  const units = Object.values(combat.units);

  for (const ability of getAbilitiesWithEffect(attacker, "FLAT_DAMAGE_ADJACENT_TO_TARGET")) {
    if (ability.effect?.type !== "FLAT_DAMAGE_ADJACENT_TO_TARGET") {
      continue;
    }

    // Magogs: "When Magogs attack a target that is not adjacent to them". Gate
    // on geometry (not attackKind) so a ranged Magog that somehow lands a
    // melee-kind strike at range still splashes, and an adjacent shot never does
    // — attackKind alone used to miss the splash if the unit's type drifted.
    if (
      ability.effect.requiresNonAdjacentTarget &&
      isAdjacent(attacker.position, defender.position)
    ) {
      continue;
    }

    const candidates = units.filter(
      (unit) =>
        unit.id !== defender.id &&
        unit.id !== attacker.id &&
        isAlive(unit) &&
        isAdjacent(unit.position, defender.position)
    );
    if (candidates.length > 0) {
      followUps.push({
        abilityId: ability.id,
        abilityName: ability.name,
        amount: ability.effect.amount,
        candidateUnitIds: candidates.map((unit) => unit.id)
      });
    }
  }

  for (const ability of getAbilitiesWithEffect(attacker, "FLAT_DAMAGE_ADJACENT_TO_SELF")) {
    if (ability.effect?.type !== "FLAT_DAMAGE_ADJACENT_TO_SELF") {
      continue;
    }

    const candidates = units.filter(
      (unit) =>
        unit.id !== defender.id &&
        unit.id !== attacker.id &&
        unit.controllerId !== attacker.controllerId &&
        isAlive(unit) &&
        isAdjacent(unit.position, attacker.position)
    );
    if (candidates.length > 0) {
      followUps.push({
        abilityId: ability.id,
        abilityName: ability.name,
        amount: ability.effect.amount,
        candidateUnitIds: candidates.map((unit) => unit.id)
      });
    }
  }

  return followUps;
}

/**
 * Candidates of the Liches' second attack: every living unit adjacent to the
 * original target's position — enemies, friends, and the Liches themselves
 * (the wiki FAQ confirms all three) — except the original target.
 */
export function getSecondAttackCandidates(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): UnitId[] {
  return Object.values(combat.units)
    .filter(
      (unit) => unit.id !== defender.id && isAlive(unit) && isAdjacent(unit.position, defender.position)
    )
    .map((unit) => unit.id);
}

/** Ghost Dragons (Pack): flat "+N to your Attack die result" on every attack. */
export function getAttackDieResultBonus(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "ATTACK_DIE_RESULT_BONUS").reduce(
    (total, ability) => total + (ability.effect?.type === "ATTACK_DIE_RESULT_BONUS" ? ability.effect.amount : 0),
    0
  );
}

/** Dread Knights: +N Defense while this unit is the target of a Retaliation Attack. */
export function getDefenseBonusWhenRetaliated(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "DEFENSE_BONUS_WHEN_RETALIATED").reduce(
    (total, ability) => total + (ability.effect?.type === "DEFENSE_BONUS_WHEN_RETALIATED" ? ability.effect.amount : 0),
    0
  );
}

/** Dragon Flies: Retaliation Attacks against this unit lose N Attack. */
export function getRetaliationAgainstAttackPenalty(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "RETALIATION_AGAINST_ATTACK_PENALTY").reduce(
    (total, ability) => total + (ability.effect?.type === "RETALIATION_AGAINST_ATTACK_PENALTY" ? ability.effect.amount : 0),
    0
  );
}

/** Necropolis Dread Knights (Few): the enemy's Retaliation Attack rolls at disadvantage. */
export function hasRetaliationAgainstDisadvantage(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "RETALIATION_AGAINST_DISADVANTAGE");
}

export type RetaliationParalysis = {
  abilityId: string;
  abilityName: string;
  /** When set, roll one Attack die and only paralyse on this face. */
  onRoll?: number;
};

/** Medusas: paralysis inflicted by this unit's own Retaliation Attack. */
export function getRetaliationParalysis(unit: CombatUnitState): RetaliationParalysis | null {
  for (const ability of getAbilitiesWithEffect(unit, "PARALYZE_ON_RETALIATION")) {
    if (ability.effect?.type === "PARALYZE_ON_RETALIATION") {
      return { abilityId: ability.id, abilityName: ability.name, onRoll: ability.effect.onRoll };
    }
  }
  return null;
}

export type ActivationAbility = {
  abilityId: string;
  abilityName: string;
  kind: "heal-self" | "discard-enemy-morale" | "discard-enemy-card";
  amount: number;
};

/**
 * Auto-resolving "[activation]" abilities applied when a unit's turn comes up:
 * self-regeneration (Wraiths, Trolls), morale drain (Ghost Dragons) and the
 * enemy hand discard (Wraith pack). Returned in card order.
 */
export function getActivationAbilities(unit: CombatUnitState): ActivationAbility[] {
  const abilities: ActivationAbility[] = [];
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.implementationStatus !== "implemented") {
      continue;
    }
    if (ability.effect?.type === "ON_ACTIVATION_HEAL_SELF") {
      abilities.push({ abilityId: ability.id, abilityName: ability.name, kind: "heal-self", amount: ability.effect.amount });
    } else if (ability.effect?.type === "ON_ACTIVATION_DISCARD_ENEMY_MORALE") {
      abilities.push({ abilityId: ability.id, abilityName: ability.name, kind: "discard-enemy-morale", amount: 1 });
    } else if (ability.effect?.type === "ON_ACTIVATION_DISCARD_ENEMY_CARD") {
      abilities.push({ abilityId: ability.id, abilityName: ability.name, kind: "discard-enemy-card", amount: ability.effect.count });
    }
  }
  return abilities;
}

/**
 * Tower Magi (Pack) and Conflux Pack Elementals: the extra power this unit
 * grants "to the first spell you cast" — applied only while the unit is the
 * active unit (its own turn), so the caller checks the active unit at cast
 * time. 0 for other units.
 *
 * A school-less boost (the Magi) always counts. A school-scoped boost (the
 * Conflux Pack Elementals — "the first Air/Water/Fire/Earth Magic spell")
 * counts only when the spell being cast lists that school, so `spellSchools`
 * must be passed for those to apply. Calling without `spellSchools` keeps the
 * legacy Magi behaviour (school-less boosts only).
 */
export function getActivationSpellPowerBoost(unit: CombatUnitState, spellSchools?: SpellSchool[]): number {
  return getAbilitiesWithEffect(unit, "ON_ACTIVATION_SPELL_POWER_FIRST_CAST").reduce((total, ability) => {
    if (ability.effect?.type !== "ON_ACTIVATION_SPELL_POWER_FIRST_CAST") {
      return total;
    }
    const { amount, school } = ability.effect;
    // Magic Arrow (spellSchools includes "any") may use any school's Power
    // bonus (wiki: one school at a time — a single active unit only grants one).
    if (
      school &&
      !(spellSchools ?? []).includes(school) &&
      !(spellSchools ?? []).includes("any")
    ) {
      return total;
    }
    return total + amount;
  }, 0);
}

/**
 * "Mechanical" units — Factory Automatons and Dreadnoughts (the constructs that
 * carry the gear trait). Mechanics' Field Repair only ever targets these.
 */
export function isMechanicalUnit(unit: CombatUnitState): boolean {
  return unit.unitDefId === "factory.automatons" || unit.unitDefId === "factory.dreadnoughts";
}

/**
 * Enchanters / Factory Mechanics: the activation heal-a-friendly-or-buff-self
 * choice ability. `adjacentOnly` + `targetTrait` restrict the repair target
 * (Mechanics repair only ADJACENT mechanical units); Enchanters leave them unset.
 */
export function getEnchanterActivationAbility(unit: CombatUnitState): {
  abilityId: string;
  abilityName: string;
  healAmount: number;
  attackBonus: number;
  adjacentOnly: boolean;
  targetTrait?: "mechanical";
} | null {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (
      ability.implementationStatus === "implemented" &&
      ability.effect?.type === "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF"
    ) {
      return {
        abilityId: ability.id,
        abilityName: ability.name,
        healAmount: ability.effect.healAmount,
        attackBonus: ability.effect.attackBonus,
        adjacentOnly: Boolean(ability.effect.adjacentOnly),
        targetTrait: ability.effect.targetTrait
      };
    }
  }
  return null;
}

/** Faerie Dragons: the activation flat-damage spell ("Ice Bolt"). */
export function getActivationDamageSpellAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; amount: number } | null {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.implementationStatus === "implemented" && ability.effect?.type === "ON_ACTIVATION_DAMAGE_SPELL") {
      return { abilityId: ability.id, abilityName: ability.name, amount: ability.effect.amount };
    }
  }
  return null;
}

/** Harpies: the optional fly-back-to-origin repositioning after attacking. */
export function getReturnAfterAttackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.implementationStatus === "implemented" && ability.effect?.type === "RETURN_TO_ORIGIN_AFTER_ATTACK") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/** Archangels (Few): cards drawn by the controller when combat begins. */
export function getCombatStartDraws(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; amount: number }[] {
  return getAbilitiesWithEffect(unit, "ON_COMBAT_START_DRAW").flatMap((ability) =>
    ability.effect?.type === "ON_COMBAT_START_DRAW"
      ? [{ abilityId: ability.id, abilityName: ability.name, amount: ability.effect.amount }]
      : []
  );
}

export function getPostAttackAbilityDamageEffects(
  combat: CombatState,
  context: PostAttackContext
): UnitAbilityDamageEffect[] {
  const effects: UnitAbilityDamageEffect[] = [];

  for (const ability of getAbilitiesWithEffect(context.attacker, "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL")) {
    if (
      ability.effect?.type === "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL" &&
      context.attackKind === "ranged" &&
      context.roll <= ability.effect.maxRoll &&
      isAlive(context.defender)
    ) {
      effects.push({
        abilityId: ability.id,
        sourceUnitId: context.attacker.id,
        targetUnitId: context.defender.id,
        amount: ability.effect.amount,
        damageKind: "attack",
        message: `${context.attacker.name} follows up with ${ability.name}.`
      });
    }
  }

  return effects;
}

/**
 * Iron/Gold/Diamond Golems, neutral Black Dragons: total reduction applied to
 * each instance of Spell damage this unit takes. The Steel Golems' "spell or
 * Specialty" passive counts here too. The caller floors the dealt damage at 0.
 */
export function getSpellDamageReduction(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "REDUCE_SPELL_DAMAGE")
    .reduce((total, ability) => total + (ability.effect?.type === "REDUCE_SPELL_DAMAGE" ? ability.effect.amount : 0), 0)
    + getAbilitiesWithEffect(unit, "REDUCE_SPELL_AND_SPECIALTY_DAMAGE").reduce(
      (total, ability) => total + (ability.effect?.type === "REDUCE_SPELL_AND_SPECIALTY_DAMAGE" ? ability.effect.amount : 0),
      0
    );
}

/** WOG Messengers: reduction applies only to damage from their named school. */
export function getSpellSchoolDamageReduction(unit: CombatUnitState, schools: readonly string[]): number {
  return getAbilitiesWithEffect(unit, "REDUCE_SPELL_SCHOOL_DAMAGE").reduce(
    (total, ability) =>
      total +
      (ability.effect?.type === "REDUCE_SPELL_SCHOOL_DAMAGE" &&
      (schools.includes(ability.effect.school) || schools.includes("any"))
        ? ability.effect.amount
        : 0),
    0
  );
}

/** WOG Sylvan Centaur: clamp the resolved Attack die to this floor. */
export function getMinimumAttackDie(unit: CombatUnitState): number | null {
  const floors = getAbilitiesWithEffect(unit, "MINIMUM_ATTACK_DIE").flatMap((ability) =>
    ability.effect?.type === "MINIMUM_ATTACK_DIE" ? [ability.effect.minimum] : []
  );
  return floors.length > 0 ? Math.max(...floors) : null;
}

/** WOG Werewolf: +Attack and forced strike during even Astrologers rounds. */
export function getAstrologersRoundFrenzy(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "ASTROLOGERS_ROUND_FRENZY").reduce(
    (total, ability) =>
      total + (ability.effect?.type === "ASTROLOGERS_ROUND_FRENZY" ? ability.effect.attackBonus : 0),
    0
  );
}

export function hasInnateMagicMirror(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "INNATE_MAGIC_MIRROR");
}

export function isUndeadUnit(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "UNDEAD") || unit.unitDefId?.startsWith("necropolis.") === true;
}

export function getOnKillHealthHarvest(
  unit: CombatUnitState
): { abilityId: string; amount: number; maxBonus: number; requiresNonUndead: boolean } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_KILL_HEAL_AND_PERMANENT_HEALTH")) {
    if (ability.effect?.type === "ON_KILL_HEAL_AND_PERMANENT_HEALTH") {
      return {
        abilityId: ability.id,
        amount: ability.effect.amount,
        maxBonus: ability.effect.maxBonus,
        requiresNonUndead: ability.effect.requiresNonUndead === true
      };
    }
  }
  return null;
}

export function getOnKillWeakCopy(
  unit: CombatUnitState
): { abilityId: string; statPenalty: number; oncePerCombat: boolean } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_KILL_SUMMON_WEAK_COPY")) {
    if (ability.effect?.type === "ON_KILL_SUMMON_WEAK_COPY") {
      return {
        abilityId: ability.id,
        statPenalty: ability.effect.statPenalty,
        oncePerCombat: ability.effect.oncePerCombat
      };
    }
  }
  return null;
}

export function getOnAttackFireWallDamage(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "ON_ATTACK_PLACE_FIRE_WALL").reduce(
    (best, ability) =>
      Math.max(best, ability.effect?.type === "ON_ATTACK_PLACE_FIRE_WALL" ? ability.effect.damage : 0),
    0
  );
}

export function getDefenseDieDamageReduction(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; onRoll: number; amount: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "REDUCE_ATTACK_DAMAGE_ON_DEFENSE_DIE")) {
    if (ability.effect?.type === "REDUCE_ATTACK_DAMAGE_ON_DEFENSE_DIE") {
      return { abilityId: ability.id, abilityName: ability.name, onRoll: ability.effect.onRoll, amount: ability.effect.amount };
    }
  }
  return null;
}

/**
 * Mammoths' Thick Hide: extra Defense the unit gets while it is defending (it
 * holds a Defense token). Added on top of the Defend die in resolveDefendBonus.
 */
export function getDefendBonus(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "DEFEND_BONUS").reduce(
    (total, ability) => total + (ability.effect?.type === "DEFEND_BONUS" ? ability.effect.amount : 0),
    0
  );
}

/**
 * Shamans' innate Air Shield: extra Defense the unit gets only against an
 * attacker of a matching unit type ("ranged" = Air Shield, "ground-or-flying" =
 * Shield) — the unit-ability twin of the DEFENSE_VS_ATTACKER_TYPE active-effect
 * modifier (the Air Shield spell), read straight off the printed card.
 */
export function getSelfAttackerTypeDefenseBonus(defender: CombatUnitState, attacker: CombatUnitState): number {
  const attackerIsRanged = attacker.type === "ranged";
  return getAbilitiesWithEffect(defender, "DEFENSE_VS_ATTACKER_TYPE").reduce((total, ability) => {
    if (ability.effect?.type !== "DEFENSE_VS_ATTACKER_TYPE") {
      return total;
    }
    const matches = ability.effect.attackerType === "ranged" ? attackerIsRanged : !attackerIsRanged;
    return matches ? total + ability.effect.amount : total;
  }, 0);
}

/**
 * Steel Golems: total reduction applied to each instance of Hero-Specialty
 * damage this unit takes (Xyron's Inferno, Solmyr's Chain Lightning). Ordinary
 * spell-reducing golems have none — their passive only softens Spell damage.
 */
export function getSpecialtyDamageReduction(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "REDUCE_SPELL_AND_SPECIALTY_DAMAGE").reduce(
    (total, ability) => total + (ability.effect?.type === "REDUCE_SPELL_AND_SPECIALTY_DAMAGE" ? ability.effect.amount : 0),
    0
  );
}

/**
 * Rampart Unicorns (Pack): the spell-damage reduction this unit radiates to
 * itself and adjacent friendly units. The caller (reducedSpellDamage) sums the
 * target's own REDUCE_SPELL_DAMAGE with the auras of the target itself and its
 * adjacent allies.
 */
export function getSpellDamageReductionAura(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "REDUCE_SPELL_DAMAGE_AURA").reduce(
    (total, ability) => total + (ability.effect?.type === "REDUCE_SPELL_DAMAGE_AURA" ? ability.effect.amount : 0),
    0
  );
}

/** Dungeon Minotaurs: cards the attacker draws when its attack die shows `onRoll`. */
export function getOnAttackDieDraw(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; onRoll: number; amount: number }[] {
  return getAbilitiesWithEffect(unit, "ON_ATTACK_DIE_DRAW").flatMap((ability) =>
    ability.effect?.type === "ON_ATTACK_DIE_DRAW"
      ? [{ abilityId: ability.id, abilityName: ability.name, onRoll: ability.effect.onRoll, amount: ability.effect.amount }]
      : []
  );
}

/** Ghost Dragons (neutral): the post-attack die that may shove the target away. */
export function getKnockbackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; onRoll: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "KNOCKBACK_AFTER_ATTACK")) {
    if (ability.effect?.type === "KNOCKBACK_AFTER_ATTACK") {
      return { abilityId: ability.id, abilityName: ability.name, onRoll: ability.effect.onRoll };
    }
  }
  return null;
}

/** Vampires: the self-heal taken after this unit's own attack (never a retaliation). */
export function getOnAttackSelfHeal(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; amount: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_ATTACK_HEAL_SELF")) {
    if (ability.effect?.type === "ON_ATTACK_HEAL_SELF") {
      return { abilityId: ability.id, abilityName: ability.name, amount: ability.effect.amount };
    }
  }
  return null;
}

/** Phoenixes: the once-per-combat self-rebirth that survives a killing blow at 1 Health. */
export function getSelfRebirthAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SELF_REBIRTH_ONCE")) {
    if (ability.effect?.type === "SELF_REBIRTH_ONCE") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/**
 * Factory Automaton: the on-removal detonation ("deal N damage to each adjacent
 * unit"). Returns the base damage and ability identity, or null for any unit
 * without the trait. The controller's Frederick bonus is added by the caller.
 */
export function getOnRemovalDetonation(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; amount: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_REMOVAL_DAMAGE_ADJACENT")) {
    if (ability.effect?.type === "ON_REMOVAL_DAMAGE_ADJACENT") {
      // Factory Automaton (Few): the cube-scaled Detonate deals as much as the
      // number of faction cubes riding the unit — so it fizzles with none and
      // scales up to 2. Every other Detonate uses its fixed printed amount.
      const amount = ability.effect.perCube ? unit.factionCubes ?? 0 : ability.effect.amount;
      return { abilityId: ability.id, abilityName: ability.name, amount };
    }
  }
  return null;
}

/**
 * Factory Couatls: the activated invulnerability ability, if this unit carries
 * it. `endsActivation` is true for the Few (using it is the whole turn) and
 * false for the Pack ("does not replace any regular actions").
 */
export function getInvulnerabilityActivation(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; endsActivation: boolean } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_ACTIVATION_INVULNERABILITY")) {
    if (ability.effect?.type === "ON_ACTIVATION_INVULNERABILITY") {
      return { abilityId: ability.id, abilityName: ability.name, endsActivation: ability.effect.endsActivation };
    }
  }
  return null;
}

/**
 * Whether this unit currently "ignores all damage" — the Factory Couatls'
 * activated invulnerability. Every incoming-damage chokepoint checks this and
 * skips the unit while it is set (until its next activation).
 */
export function isUnitDamageImmune(unit: CombatUnitState): boolean {
  return Boolean(unit.invulnerableUntilActivation);
}

/**
 * Factory Dreadnoughts: the "instead of attacking, allocate splash" activation,
 * if this unit carries it. `damageValues` is the ordered allocation (Few [1,1],
 * Pack/Neutral [2,1,1]); the k-th selected adjacent unit takes `damageValues[k]`.
 */
export function getSplashAllocationAttack(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; damageValues: number[] } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SPLASH_ALLOCATION_ATTACK")) {
    if (ability.effect?.type === "SPLASH_ALLOCATION_ATTACK") {
      return { abilityId: ability.id, abilityName: ability.name, damageValues: ability.effect.damageValues };
    }
  }
  return null;
}

/**
 * Factory Automaton (Few): the "place a faction cube (up to N)" activation, if
 * this unit carries it.
 */
export function getPlaceFactionCubeActivation(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; maxCubes: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_ACTIVATION_PLACE_FACTION_CUBE")) {
    if (ability.effect?.type === "ON_ACTIVATION_PLACE_FACTION_CUBE") {
      return { abilityId: ability.id, abilityName: ability.name, maxCubes: ability.effect.maxCubes };
    }
  }
  return null;
}

/** Factory Sandworms (Pack): banks a faction cube whenever it defeats an enemy. */
export function getGainFactionCubeOnKill(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_KILL_GAIN_FACTION_CUBE")) {
    if (ability.effect?.type === "ON_KILL_GAIN_FACTION_CUBE") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/** Factory Sandworms (Pack): may spend a faction cube to make another attack. */
export function getSpendCubeAttackAgain(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SPEND_FACTION_CUBE_ATTACK_AGAIN")) {
    if (ability.effect?.type === "SPEND_FACTION_CUBE_ATTACK_AGAIN") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/**
 * Factory Bounty Hunters (Neutral): the "Preemptive Shot" retaliation — retaliate
 * before the attacker's blow lands, and against non-adjacent attackers too.
 */
export function getPreemptiveRetaliation(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "PREEMPTIVE_RETALIATION")) {
    if (ability.effect?.type === "PREEMPTIVE_RETALIATION") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/** Living units orthogonally adjacent to `unit`'s board position (friend and foe). */
export function getUnitsAdjacentTo(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (other) => other.id !== unit.id && isAlive(other) && isAdjacent(other.position, unit.position)
  );
}

/** Neutral Halberdiers: this unit grants adjacent allies a virtual Defense token. */
export function hasDefenseTokenAura(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "DEFENSE_TOKEN_AURA");
}

/**
 * Creature Bank Dwarven Treasury Dwarves / Dragon Utopia Crystal Dragons: while
 * Stacked, the card is treated as if it carried its own Defense token (it rolls
 * the Defend die when attacked). The Stacked gate is enforced upstream by
 * `getUnitAbilityDefinitions`, so this simply reports whether the ability is
 * currently active on the unit.
 */
export function hasSelfDefenseToken(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "SELF_DEFENSE_TOKEN");
}

/**
 * Creature Bank Dragon Utopia Black Dragons (while Stacked): the flat, unclamped
 * Attack bonus added to every attack and Retaliation Attack this unit makes.
 */
export function getFlatAttackBonus(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "FLAT_ATTACK_BONUS").reduce(
    (total, ability) => total + (ability.effect?.type === "FLAT_ATTACK_BONUS" ? ability.effect.amount : 0),
    0
  );
}

/**
 * WoG Lava Sharpshooter / War Zealot: "+N Attack when this unit attacks." A flat
 * innate bonus on the unit's OWN attack only — the reducer gates the caller on
 * `!isRetaliation`, so a Retaliation Attack never receives it.
 */
export function getOwnAttackFlatBonus(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "OWN_ATTACK_FLAT_BONUS").reduce(
    (total, ability) => total + (ability.effect?.type === "OWN_ATTACK_FLAT_BONUS" ? ability.effect.amount : 0),
    0
  );
}

/**
 * Creature Bank Medusa Stores Medusas (while Stacked): the on-attack paralysis
 * inflicted by this unit's own attack, if any.
 */
export function getOnAttackParalysis(
  unit: CombatUnitState
): { abilityId: string; abilityName: string } | null {
  for (const ability of getAbilitiesWithEffect(unit, "PARALYZE_TARGET_ON_ATTACK")) {
    if (ability.effect?.type === "PARALYZE_TARGET_ON_ATTACK") {
      return { abilityId: ability.id, abilityName: ability.name };
    }
  }
  return null;
}

/**
 * Creature Bank Crypt / Shipwreck Wraiths: the number of cards the enemy must
 * discard from hand after this unit's own attack (0 if the unit has no such
 * ability).
 */
export function getOnAttackEnemyDiscard(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; count: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_ATTACK_DISCARD_ENEMY_CARD")) {
    if (ability.effect?.type === "ON_ATTACK_DISCARD_ENEMY_CARD" && ability.effect.count > 0) {
      return { abilityId: ability.id, abilityName: ability.name, count: ability.effect.count };
    }
  }
  return null;
}

/**
 * Creature Bank Dragon Utopia Faerie Dragons (while Stacked): this unit locks
 * the enemy out of casting any Spell while it lives.
 */
export function hasSpellCastLock(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "SPELL_CAST_LOCK");
}

/** Familiars: enemies pay one card whenever they cast a Spell from hand near this unit. */
export function hasSpellCastHandTax(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "SPELL_CAST_HAND_TAX");
}

/** Neutral Pegasi: enemies discard an extra Power card whenever they cast a Spell near this unit. */
export function hasSpellCastPowerTax(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "SPELL_CAST_POWER_TAX");
}

/**
 * Neutral Champions ([unit_attack], own attacks only): "roll 2 Attack dice and
 * apply both outcomes." Returns true when the unit carries the marker; the
 * caller gates it off on Retaliation Attacks (own-attack-only) and decides the
 * die count.
 */
export function hasRollTwoDiceApplyBoth(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "ROLL_TWO_DICE_APPLY_BOTH");
}

/**
 * Neutral Champions ([unit_passive], always on): "Reroll this unit's all '-1'
 * rolls." Every Attack/Defend die this unit rolls rerolls a "-1", repeatedly,
 * until it is not "-1".
 */
export function hasRerollAllMinusOne(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "REROLL_ALL_MINUS_ONE");
}

/** Mummies (offence): this unit's own Attack die always counts as 0. */
export function hasIgnoreOwnAttackDie(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IGNORE_OWN_ATTACK_DIE");
}

/** Mummies (defence): the value an attacker's die is forced to while this unit defends, if any. */
export function getForcedAttackerDie(unit: CombatUnitState): number | null {
  for (const ability of getAbilitiesWithEffect(unit, "FORCE_ATTACKER_DIE")) {
    if (ability.effect?.type === "FORCE_ATTACKER_DIE") {
      return ability.effect.value;
    }
  }
  return null;
}

/**
 * Castle Halberdiers (Pack): the defender may discard a card to ignore the
 * attacker's settled Attack die. Returns the ability id when this unit carries
 * it (for the post-roll die-cancel reaction), else null.
 */
export function getDiscardToIgnoreAttackDieAbility(unit: CombatUnitState): string | null {
  for (const ability of getAbilitiesWithEffect(unit, "DISCARD_TO_IGNORE_ATTACK_DIE")) {
    if (ability.effect?.type === "DISCARD_TO_IGNORE_ATTACK_DIE") {
      return ability.id;
    }
  }
  return null;
}

/** Azure / Black Dragons (Pack): no damage from Specialty cards (non-damage Specialty still applies). */
export function hasImmuneToSpecialtyDamage(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IMMUNE_TO_SPECIALTY_DAMAGE");
}

/** Fortress Wyverns: the poison cubes planted on the target by this unit's attack. */
export function getOnAttackPoisonCubes(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; count: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_ATTACK_POISON_CUBES")) {
    if (ability.effect?.type === "ON_ATTACK_POISON_CUBES" && ability.effect.count > 0) {
      return { abilityId: ability.id, abilityName: ability.name, count: ability.effect.count };
    }
  }
  return null;
}

/** Rampart Dwarves: the Attack-die face that lets this unit shrug off a Spell/Specialty card. */
export function getCardNegateOnDie(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; onRoll: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "NEGATE_CARD_ON_DIE")) {
    if (ability.effect?.type === "NEGATE_CARD_ON_DIE") {
      return { abilityId: ability.id, abilityName: ability.name, onRoll: ability.effect.onRoll };
    }
  }
  return null;
}

/** Rampart Pegasi (Pack): the Power this unit shaves off every enemy Spell while it lives. */
export function getEnemySpellPowerReduction(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "REDUCE_ENEMY_SPELL_POWER").reduce(
    (total, ability) =>
      total + (ability.effect?.type === "REDUCE_ENEMY_SPELL_POWER" ? ability.effect.amount : 0),
    0
  );
}

/** Rampart Dendroids (Pack): enemies starting adjacent to this unit cannot move (Bind). */
export function hasBindAdjacentEnemies(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "BIND_ADJACENT_ENEMIES");
}

/** Tower Gargoyles: ongoing effects created by a Spell card never apply to this unit. */
export function hasIgnoreOngoingSpellEffects(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IGNORE_ONGOING_SPELL_EFFECTS");
}

/** Tower Titans: every ongoing effect on this unit is ignored, whatever its source. */
export function hasIgnoreOngoingEffects(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IGNORE_ONGOING_EFFECTS");
}

/** Fangarm: ignores all ongoing effects from spells AND specialties, and is immune to Blind/Paralysis from spells. */
export function hasIgnoreSpellAndSpecialtyNonDamage(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IGNORE_SPELL_AND_SPECIALTY_NONDAMAGE");
}

/** Tower Genies: the "discard from your deck, take a Spell" ability for the given trigger. */
export function getDeckDiscardTakeSpell(
  unit: CombatUnitState,
  trigger: "other-action" | "on-attack"
): { abilityId: string; abilityName: string; count: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "DECK_DISCARD_TAKE_SPELL")) {
    if (ability.effect?.type === "DECK_DISCARD_TAKE_SPELL" && ability.effect.trigger === trigger) {
      return { abilityId: ability.id, abilityName: ability.name, count: ability.effect.count };
    }
  }
  return null;
}

/**
 * Cove Nix (Pack): the most restrictive per-attack damage cap this unit carries,
 * or `null` when it has none. The caller clamps each individual attack's damage
 * to `amount` (attacks only — Spell/ability damage is never capped) and uses the
 * ability id/name to log the cap when it actually bites.
 */
export function getDamageCapPerAttack(
  unit: CombatUnitState
): { amount: number; abilityId: string; abilityName: string } | null {
  let cap: { amount: number; abilityId: string; abilityName: string } | null = null;
  for (const ability of getAbilitiesWithEffect(unit, "CAP_DAMAGE_PER_ATTACK")) {
    if (ability.effect?.type === "CAP_DAMAGE_PER_ATTACK") {
      if (cap === null || ability.effect.amount < cap.amount) {
        cap = { amount: ability.effect.amount, abilityId: ability.id, abilityName: ability.name };
      }
    }
  }
  return cap;
}

/**
 * Cove Haspids (Few): the flat Attack bonus this unit gets *after* it has been
 * flipped down from its Pack side this combat. Returns 0 until the flip flag is
 * set, so a freshly recruited Few never benefits.
 */
export function getAttackBonusIfFlipped(unit: CombatUnitState): number {
  if (!unit.flippedDownThisCombat) {
    return 0;
  }
  return getAbilitiesWithEffect(unit, "ATTACK_BONUS_IF_FLIPPED").reduce(
    (total, ability) => total + (ability.effect?.type === "ATTACK_BONUS_IF_FLIPPED" ? ability.effect.amount : 0),
    0
  );
}

/** Cove Seamen (Pack): the once-per-combat "gain N resource on a kill" reward. */
export function getOnKillResourceGain(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; resource: "gold" | "buildingMaterials" | "valuables"; amount: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ON_KILL_GAIN_RESOURCE")) {
    if (ability.effect?.type === "ON_KILL_GAIN_RESOURCE") {
      return {
        abilityId: ability.id,
        abilityName: ability.name,
        resource: ability.effect.resource,
        amount: ability.effect.amount
      };
    }
  }
  return null;
}
