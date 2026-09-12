import {
  canUnitAttack,
  canUnitMoveAndAttack,
  getLegalMoveDestinations,
} from "../legal-actions";
import type { CombatState, CombatUnitState, GameState } from "../state";
import {
  isParalyzed,
  unitRemainingHealth,
} from "./score";
import { estimatedStrikeDamage } from "./strike-value";
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
      ? estimatedStrikeDamage(enemy, projected) : 0;
    if (enemy.type !== "ranged") {
      for (const destination of getLegalMoveDestinations(board, enemy, projectedState)) {
        if (canUnitMoveAndAttack(board, enemy, destination, projected, projectedState)) {
          best = Math.max(best, estimatedStrikeDamage(enemy, projected, destination));
        }
      }
    }
    damage += best;
  }
  return damage;
}
