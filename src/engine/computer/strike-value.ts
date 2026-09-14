import type { CombatUnitState } from "../state";
import {
  getAttackDefenseReductionAbility,
  getDamageCapPerAttack,
  getIgnoreTargetCardDefenseAbility,
  getUnitAbilityDefinitions,
} from "../unit-abilities";

/**
 * Whether this unit's strike is ELEMENTAL: the resolver ignores the target's
 * Defense value entirely, including Defense cards (Elementals, Moandor's
 * Liches VI). A ranged-only elemental hit (Ice Bolt) counts for shooters only.
 * Read off the ability definition's effect type, like the resolver does.
 */
export function dealsElementalStrike(unit: CombatUnitState): boolean {
  return getUnitAbilityDefinitions(unit).some((ability) =>
    ability.implementationStatus === "implemented" &&
    ability.effect?.type === "DEALS_ELEMENTAL_DAMAGE" &&
    (!ability.effect.rangedOnly || unit.type === "ranged"));
}

/** AI-only single-strike estimate using the resolver's printed pierce/cap
 * helpers. No dice or actions run here. Retaliation cannot borrow an ordinary
 * attack-only ability; a prospective charge does activate after-move pierce.
 * Cards, dice, secondary hits and remaining conditional abilities are still
 * approximate, so this is an ordering value, not a guaranteed damage result.
 */
export function estimatedStrikeDamage(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  position = attacker.position,
  retaliation = false,
): number {
  const moved = attacker.movedThisActivation || position !== attacker.position;
  const pierce = getAttackDefenseReductionAbility(attacker, moved, retaliation)?.amount ?? 0;
  // The resolver treats the combat card's current Defense as printed Defense
  // (including its current face), with separate effect bonuses added later.
  const printedDefense = !retaliation && getIgnoreTargetCardDefenseAbility(attacker) ? defender.defense : 0;
  // An elemental strike cannot be defended against at all.
  const defense = dealsElementalStrike(attacker) ? 0 : Math.max(0, defender.defense - printedDefense - pierce);
  const cap = getDamageCapPerAttack(defender)?.amount ?? Number.POSITIVE_INFINITY;
  return Math.min(cap, Math.max(0, attacker.attack - defense));
}
