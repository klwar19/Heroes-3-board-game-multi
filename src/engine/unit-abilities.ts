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
  return unit.abilities.map((abilityId) => unitAbilities[abilityId]).filter(Boolean);
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
  if (!spellSchools || spellSchools.length === 0) {
    return false;
  }
  const immune = getUnitImmuneSpellSchools(unit);
  return immune.length > 0 && spellSchools.some((school) => immune.includes(school));
}

export function getUnitAttackRerollSources(
  unit: CombatUnitState,
  /** Whether the unit moved during this attack — gates Champions' "Charge". */
  moved = false
): { name: string; rerolls: number; onlyOnRoll?: number }[] {
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

/** Hydras: one more separate attack against an enemy adjacent to the Hydra. */
export function getSelfAdjacentSecondAttackAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; baseAttack?: number } | null {
  for (const ability of getAbilitiesWithEffect(unit, "SECOND_ATTACK_ONE_ADJACENT_TO_SELF")) {
    if (ability.effect?.type === "SECOND_ATTACK_ONE_ADJACENT_TO_SELF") {
      return { abilityId: ability.id, abilityName: ability.name, baseAttack: ability.effect.baseAttack };
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

    // "When Magogs attack a target that is not adjacent to them": melee-kind
    // attacks (adjacent shots) never splash.
    if (ability.effect.requiresNonAdjacentTarget && context.attackKind !== "ranged") {
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
  kind: "heal-self" | "discard-enemy-morale" | "discard-enemy-card" | "boost-first-spell-power";
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
    } else if (ability.effect?.type === "ON_ACTIVATION_SPELL_POWER_FIRST_CAST") {
      abilities.push({ abilityId: ability.id, abilityName: ability.name, kind: "boost-first-spell-power", amount: ability.effect.amount });
    }
  }
  return abilities;
}

/** Enchanters: the activation heal-a-friendly-or-buff-self choice ability. */
export function getEnchanterActivationAbility(
  unit: CombatUnitState
): { abilityId: string; abilityName: string; healAmount: number; attackBonus: number } | null {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (
      ability.implementationStatus === "implemented" &&
      ability.effect?.type === "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF"
    ) {
      return {
        abilityId: ability.id,
        abilityName: ability.name,
        healAmount: ability.effect.healAmount,
        attackBonus: ability.effect.attackBonus
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
 * each instance of Spell damage this unit takes. The caller floors the dealt
 * damage at 0.
 */
export function getSpellDamageReduction(unit: CombatUnitState): number {
  return getAbilitiesWithEffect(unit, "REDUCE_SPELL_DAMAGE").reduce(
    (total, ability) => total + (ability.effect?.type === "REDUCE_SPELL_DAMAGE" ? ability.effect.amount : 0),
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

/** Neutral Halberdiers: this unit grants adjacent allies a virtual Defense token. */
export function hasDefenseTokenAura(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "DEFENSE_TOKEN_AURA");
}

/** Familiars: enemies pay one card whenever they cast a Spell from hand near this unit. */
export function hasSpellCastHandTax(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "SPELL_CAST_HAND_TAX");
}

/** Neutral Champions: "roll 2 Attack dice and apply both outcomes" (reroll each "-1"). */
export function getRollTwoDiceApplyBoth(unit: CombatUnitState): { rerollMinusOnce: boolean } | null {
  for (const ability of getAbilitiesWithEffect(unit, "ROLL_TWO_DICE_APPLY_BOTH")) {
    if (ability.effect?.type === "ROLL_TWO_DICE_APPLY_BOTH") {
      return { rerollMinusOnce: ability.effect.rerollMinusOnce };
    }
  }
  return null;
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

/** Azure / Black Dragons (Pack): no damage from Specialty cards (non-damage Specialty still applies). */
export function hasImmuneToSpecialtyDamage(unit: CombatUnitState): boolean {
  return hasUnitAbilityEffect(unit, "IMMUNE_TO_SPECIALTY_DAMAGE");
}
