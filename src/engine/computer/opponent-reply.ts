import {
  canUnitAttack,
  getLegalMoveDestinations,
} from "../legal-actions";
import { unitsAdjacentAt } from "../hex-footprint";
import type { ActiveEffectState, CombatState, CombatUnitState, GameState } from "../state";
import {
  isParalyzed,
  unitRemainingHealth,
} from "./score";
import { estimatedStrikeDamage } from "./strike-value";
import { conditionExpectedStrikeDamage } from "./battlefield-conditions";

/**
 * `canUnitMoveAndAttack` for a landing ALREADY taken from
 * `getLegalMoveDestinations(board, attacker, state)` with the same board and
 * state (pass that state's activeEffects). The engine check re-runs the whole
 * move search only to confirm the landing, so a destinations × targets scan
 * paid one search per pair — ruinous on the 117-hex battlefield, where a unit
 * moves its initiative in hexes. Same answer, no search: a non-ranged strike
 * needs an adjacent landing unless the unit is bombarding (canUnitAttack), so
 * every other landing is refused before the attack check.
 */
export function canStrikeFromLegalLanding(
  board: CombatState,
  attacker: CombatUnitState,
  landing: number,
  defender: CombatUnitState,
  activeEffects: ActiveEffectState[] = [],
): boolean {
  if (attacker.type === "ranged") return false;
  // Adjacency from the landing footprint (a double-wide attacker's tail counts, hex board).
  if (!attacker.bombardment && !unitsAdjacentAt(board, attacker, landing, defender)) return false;
  const moved = { ...attacker, position: landing };
  return canUnitAttack({ ...board, units: { ...board.units, [attacker.id]: moved } }, moved, defender, activeEffects);
}

/** Bounded one-reply public-board search. Enemy cards/dice are never invented.
 * Project our destination first so screens, engagement and blocked cells matter. */
export function coordinatedReplyDamage(
  combat: CombatState,
  unit: CombatUnitState,
  position: number,
  removedEnemyId?: string,
  state?: GameState,
): number {
  const projected = { ...unit, position };
  const units = { ...combat.units, [unit.id]: projected };
  if (removedEnemyId) delete units[removedEnemyId];
  const board = { ...combat, units };
  const projectedState = state
    ? { ...state, activeEffects: state.activeEffects ?? [], combat: board }
    : undefined;
  let damage = 0;
  for (const enemy of Object.values(units)) {
    if (
      enemy.controllerId === unit.controllerId ||
      enemy.activatedThisRound ||
      enemy.position < 0 ||
      unitRemainingHealth(enemy) <= 0 ||
      isParalyzed(enemy)
    )
      continue;
    let best = canUnitAttack(board, enemy, projected, state?.activeEffects ?? [])
      ? projectedState ? conditionExpectedStrikeDamage(projectedState, enemy, projected) : estimatedStrikeDamage(enemy, projected)
      : 0;
    if (enemy.type !== "ranged") {
      for (const destination of getLegalMoveDestinations(board, enemy, projectedState)) {
        if (canStrikeFromLegalLanding(board, enemy, destination, projected, projectedState?.activeEffects)) {
          best = Math.max(best, estimatedStrikeDamage(enemy, projected, destination));
        }
      }
    }
    damage += best;
  }
  return damage;
}
