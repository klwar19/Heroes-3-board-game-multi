import { getUnitSide } from "../adventure";
import type { ArmyUnitState, GameState, PlayerId } from "../state";

/**
 * A rough combat value for an army card side, used ONLY to order engagement
 * decisions (fight this hero or not) — never to resolve a battle, which the real
 * dice-driven combat engine still does. Attack is weighted heaviest (it is what
 * ends enemy units), health next (it is what keeps yours alive), with defense
 * and a slice of initiative rounding it out. Mirrors the combat policy's
 * `unitThreatValue` so the map read and the in-combat read agree on what a unit
 * is worth.
 */
export function unitSideStrength(unit: ArmyUnitState): number {
  const side = getUnitSide(unit.unitDefId, unit.side);
  if (!side) {
    return 0;
  }
  const attack = side.attack + (unit.permanentAttackBonus ?? 0);
  const health = side.health + (unit.permanentHealthBonus ?? 0);
  return attack * 3 + health * 2 + side.defense + Math.round(side.initiative / 2);
}

/** Total army strength of a player's unit deck (all sides summed). */
export function playerArmyStrength(
  state: GameState,
  playerId: PlayerId,
): number {
  const army = state.players[playerId]?.army ?? [];
  return army.reduce((total, unit) => total + unitSideStrength(unit), 0);
}

/**
 * How close the attacker's army must be to the defender's before the computer
 * is willing to start the fight. Below 1 deliberately: a game opponent that only
 * attacks when overwhelmingly ahead never fights, so it engages on a roughly
 * even — or even slightly unfavourable — matchup and lets the dice decide,
 * rather than hoarding units it never risks.
 */
export const ENEMY_ENGAGE_RATIO = 0.85;

/**
 * Whether the computer player `playerId` should be willing to walk its main army
 * into a battle with `enemyPlayerId`. A larger or comparable army engages; a
 * clearly outmatched one holds off. An enemy with no valued army (nothing to
 * fear) is always engaged.
 */
export function shouldEngageEnemy(
  state: GameState,
  playerId: PlayerId,
  enemyPlayerId: PlayerId,
): boolean {
  const enemyStrength = playerArmyStrength(state, enemyPlayerId);
  if (enemyStrength <= 0) {
    return true;
  }
  return playerArmyStrength(state, playerId) >= enemyStrength * ENEMY_ENGAGE_RATIO;
}
