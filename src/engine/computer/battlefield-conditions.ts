import { unitAttackRollFixedMinusOne } from "../active-effects";
import { denseFogThisRound } from "../battlefield-condition-fog";
import { houseRuleEnabled } from "../house-rules";
import { getAttackRollMode } from "../legal-actions";
import type { CombatState, CombatUnitState, GameState } from "../state";
import { dealsElementalStrike, estimatedStrikeDamage } from "./strike-value";

/** Preserve ordinary planning; only the condition's reversed main order differs. */
export function conditionInitiativePrecedes(left: number, right: number, combat: CombatState): boolean {
  return combat.battlefieldCondition?.id === "fey-trickery" && !combat.waitPhase
    ? left < right
    : left > right;
}

/** Analytical weights, not rolled dice. The live roll-mode selector owns all
 * forced disadvantage and advantage precedence, including retaliation. Null
 * keeps the established estimator unchanged outside these two conditions. */
export function conditionAttackFaces(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  position = attacker.position,
  retaliation = false,
): readonly number[] | null {
  const condition = state.combat?.battlefieldCondition?.id;
  if (attacker.type !== "ranged") return null;
  // Lifted fog rounds keep the ordinary flat estimate — no phantom penalty.
  if (condition === "dense-fog" ? !denseFogThisRound(state.combat) : condition !== "perfect-conditions") return null;
  if (dealsElementalStrike(attacker) && houseRuleEnabled(state, "elemental-damage-no-die")) return [0];
  if (unitAttackRollFixedMinusOne(state, attacker)) return [-1];
  const mode = getAttackRollMode({ ...attacker, position }, defender, state, retaliation);
  if (mode === "advantage") return [-1, 0, 0, 0, 1, 1, 1, 1, 1];
  if (mode === "disadvantage") return [-1, -1, -1, -1, -1, 0, 0, 0, 1];
  return [-1, 0, 1];
}

/** Only condition-affected ranged strikes replace the usual zero-die estimate. */
export function conditionExpectedStrikeDamage(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  position = attacker.position,
  retaliation = false,
): number {
  const faces = conditionAttackFaces(state, attacker, defender, position, retaliation);
  if (!faces) return estimatedStrikeDamage(attacker, defender, position, retaliation);
  return faces.reduce((total, face) => total + estimatedStrikeDamage(attacker, defender, position, retaliation, face), 0) / faces.length;
}
