import { unitAbilities, type UnitAbilityDefinition, type UnitAbilityEffectDefinition } from "@/data/units/abilities";
import { BATTLEFIELD_COLUMNS } from "./battlefield";
import type { CombatState, CombatUnitState, DamageKind, UnitId } from "./state";

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

export function getUnitAttackRerollSources(
  unit: CombatUnitState
): { name: string; rerolls: number; onlyOnRoll?: number }[] {
  return getAbilitiesWithEffect(unit, "ATTACK_DIE_REROLL").flatMap((ability) =>
    ability.effect?.type === "ATTACK_DIE_REROLL" && ability.effect.rerollsPerAttack > 0
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
  amount: number;
};

/** Thunderbirds: roll one extra Attack die and damage the original target on 0/+1. */
export function getAttackDieDamageFollowUps(unit: CombatUnitState): AttackDieDamageFollowUp[] {
  return getAbilitiesWithEffect(unit, "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET").flatMap((ability) =>
    ability.effect?.type === "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET"
      ? [
          {
            abilityId: ability.id,
            abilityName: ability.name,
            minRoll: ability.effect.minRoll,
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
