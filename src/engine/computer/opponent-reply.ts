import {
  canUnitAttack,
  canUnitMoveAndAttack,
  getLegalMoveDestinations,
} from "../legal-actions";
import type { CombatState, CombatUnitState, GameState } from "../state";
import {
  isParalyzed,
  unitRemainingHealth,
  expectedAttackDamage,
} from "./score";
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
    const reaches =
      canUnitAttack(board, enemy, projected, state?.activeEffects ?? []) ||
      (enemy.type !== "ranged" &&
        getLegalMoveDestinations(board, enemy, projectedState).some((destination) =>
          canUnitMoveAndAttack(board, enemy, destination, projected, projectedState),
        ));
    if (reaches) damage += expectedAttackDamage(enemy, projected);
  }
  return damage;
}
