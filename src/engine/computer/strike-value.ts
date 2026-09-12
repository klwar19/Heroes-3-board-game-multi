import type { CombatUnitState } from "../state";
import {
  getAttackDefenseReductionAbility,
  getDamageCapPerAttack,
  getIgnoreTargetCardDefenseAbility,
} from "../unit-abilities";

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
  const defense = Math.max(0, defender.defense - printedDefense - pierce);
  const cap = getDamageCapPerAttack(defender)?.amount ?? Number.POSITIVE_INFINITY;
  return Math.min(cap, Math.max(0, attacker.attack - defense));
}
