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

export function getUnitAttackRerollSources(unit: CombatUnitState): { name: string; rerolls: number }[] {
  return getAbilitiesWithEffect(unit, "ATTACK_DIE_REROLL").flatMap((ability) =>
    ability.effect?.type === "ATTACK_DIE_REROLL" && ability.effect.rerollsPerAttack > 0
      ? [{ name: ability.name, rerolls: ability.effect.rerollsPerAttack }]
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

  for (const ability of getAbilitiesWithEffect(context.attacker, "SPLASH_DAMAGE_ON_RANGED_HIT")) {
    if (ability.effect?.type !== "SPLASH_DAMAGE_ON_RANGED_HIT" || context.attackKind !== "ranged" || context.damage <= 0) {
      continue;
    }

    for (const target of Object.values(combat.units)) {
      if (
        target.id === context.defender.id ||
        target.controllerId === context.attacker.controllerId ||
        !isAlive(target) ||
        !isAdjacent(target.position, context.defender.position)
      ) {
        continue;
      }

      effects.push({
        abilityId: ability.id,
        sourceUnitId: context.attacker.id,
        targetUnitId: target.id,
        amount: ability.effect.amount,
        damageKind: "effect",
        message: `${context.attacker.name} splashes damage with ${ability.name}.`
      });
    }
  }

  return effects;
}
