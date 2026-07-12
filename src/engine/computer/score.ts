import { getBattlefieldDistance } from "../battlefield";
import type { CombatState, CombatUnitState, PlayerId } from "../state";

/**
 * Shared strategic estimators used by the combat policy. Every helper reads
 * only PUBLIC combat statistics (all combat units are visible to both sides in
 * `getPlayerView`), never a hidden hand or deck, so a decision built from these
 * is unchanged by an opponent's private information.
 *
 * The estimators are deliberately conservative approximations of the engine's
 * real resolution (`applyAttackDamageFromCandidate` in reducer.ts): they ignore
 * the ±1 attack die (expected value 0 across its six [-1,-1,0,0,1,1] faces) and
 * any per-attack ability rider. They only ORDER already-legal actions, so an
 * approximation error can never produce an illegal or state-corrupting move — at
 * worst a slightly sub-optimal (but still legal) target choice.
 */

/** Remaining health of a combat unit: max health minus accumulated wounds. */
export function unitRemainingHealth(unit: CombatUnitState): number {
  return Math.max(0, unit.maxHealth - unit.damage);
}

/**
 * Expected damage of a melee/base attack: `max(0, attack - defense)`, matching
 * the engine's `rawDamage = max(0, attackValue - defenseValue)` with the die at
 * its expected value 0. Ability splashes, caps and elemental defense-ignores are
 * intentionally not modeled here.
 */
export function expectedAttackDamage(
  attacker: CombatUnitState,
  defender: CombatUnitState,
): number {
  return Math.max(0, attacker.attack - defender.defense);
}

/**
 * Whether `attacker`'s expected hit removes `defender` outright — the engine's
 * lethal test is `defender.damage + damage >= defender.maxHealth`, i.e. the hit
 * meets the defender's remaining health. Guarded on positive damage so a fully
 * blocked (0-damage) attack is never counted as lethal.
 */
export function attackIsLethal(
  attacker: CombatUnitState,
  defender: CombatUnitState,
): boolean {
  const damage = expectedAttackDamage(attacker, defender);
  return damage > 0 && damage >= unitRemainingHealth(defender);
}

/**
 * How valuable it is to remove / how dangerous a unit is: its offensive output
 * (weighted heaviest), durability and initiative, with a premium for ranged
 * units (they threaten damage without provoking a retaliation). Used to rank
 * candidate targets; the absolute magnitude is unimportant, only the ordering.
 */
export function unitThreatValue(unit: CombatUnitState): number {
  let threat = unit.attack * 3 + unitRemainingHealth(unit) + unit.initiative;
  if (unit.type === "ranged") threat += 6;
  return threat;
}

/** Living enemy units of `playerId` on the combat board. */
export function livingEnemyUnits(
  combat: CombatState,
  playerId: PlayerId,
): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (unit) => unit.controllerId !== playerId && unitRemainingHealth(unit) > 0,
  );
}

/** Manhattan distance from `position` to the nearest living enemy unit. */
export function distanceToNearestEnemy(
  combat: CombatState,
  playerId: PlayerId,
  position: number,
): number | null {
  const enemies = livingEnemyUnits(combat, playerId);
  if (enemies.length === 0) return null;
  return enemies.reduce(
    (nearest, enemy) =>
      Math.min(nearest, getBattlefieldDistance(position, enemy.position)),
    Number.POSITIVE_INFINITY,
  );
}
