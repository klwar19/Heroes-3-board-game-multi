import { isAdjacent } from "../battlefield";
import type { CombatState, CombatUnitState, GameAction } from "../state";
import type { ComputerActionScore } from "./map-policy";
import {
  attackIsLethal,
  distanceToNearestEnemy,
  expectedAttackDamage,
  unitRemainingHealth,
  unitThreatValue,
} from "./score";
import type { ComputerObservation } from "./types";

// Attack scores live in a band that always outranks the passive activation
// exits (DEFEND = 500, END_ACTIVATION = 400 in the foundation) so a computer
// unit that CAN strike always does, while target quality orders WITHIN the
// band. Kept below the mandatory stage scores (FINISH/PLACE ≥ 900) which belong
// to other combat stages.
const ATTACK_BASE = 620;
const ATTACK_FLOOR = 560;
const ATTACK_CEIL = 880;

/** Whether this attack would let the defender retaliate for damage back. */
function provokesRetaliation(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackFromPosition: number,
): boolean {
  if (defender.retaliatedThisRound) return false;
  if (attacker.abilities?.includes("ignores-retaliation")) return false;
  // A ranged unit shooting from range draws no retaliation; only a melee-range
  // strike (adjacent after any move) does. Move-and-attack always lands adjacent.
  if (
    attacker.type === "ranged" &&
    !isAdjacent(attackFromPosition, defender.position)
  ) {
    return false;
  }
  return true;
}

/**
 * Rank one of the active unit's legal attacks. A lethal removal is always
 * preferred (it deletes the enemy AND avoids their retaliation), scaled by how
 * dangerous the removed unit was; otherwise reward damage as a fraction of the
 * target's remaining health plus a slice of its threat, minus a nudge for the
 * retaliation the surviving defender would deal back.
 */
function attackScore(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackFromPosition: number,
): number {
  const remaining = unitRemainingHealth(defender);
  const threat = unitThreatValue(defender);
  let quality: number;
  if (attackIsLethal(attacker, defender)) {
    quality = 160 + Math.min(80, threat);
  } else {
    const damage = expectedAttackDamage(attacker, defender);
    const damageFraction = remaining > 0 ? damage / remaining : 0;
    quality = Math.round(damageFraction * 80) + Math.min(40, Math.round(threat / 4));
    if (provokesRetaliation(attacker, defender, attackFromPosition)) {
      const retaliation = expectedAttackDamage(defender, attacker);
      quality -= Math.min(50, retaliation * 4);
    }
  }
  return Math.max(ATTACK_FLOOR, Math.min(ATTACK_CEIL, ATTACK_BASE + quality));
}

/**
 * Strategic scores for a computer's own combat activation. Returns null for any
 * action it does not specialize (placement, tactics, defend, end-activation,
 * ability plays, continue/retreat…), delegating those to the map/foundation
 * layers unchanged.
 */
export function scoreCombatAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  const combat: CombatState | null = observation.state.combat;
  if (!combat) return null;

  switch (action.type) {
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT": {
      const attacker = combat.units[action.attackerId];
      const defender = combat.units[action.defenderId];
      if (!attacker || !defender) return null;
      const attackFrom =
        action.type === "MOVE_AND_ATTACK_UNIT"
          ? action.destination
          : attacker.position;
      return {
        score: attackScore(attacker, defender, attackFrom),
        policy: "combat.attack-target",
      };
    }
    case "MOVE_UNIT": {
      // No attack is in reach (or the caller preferred moving): close on the
      // nearest enemy rather than turtling in place. A destination that does not
      // reduce the distance scores below DEFEND, so the unit never wanders/flees.
      const mover = combat.units[action.unitId];
      if (!mover) return null;
      const current = distanceToNearestEnemy(
        combat,
        observation.playerId,
        mover.position,
      );
      const next = distanceToNearestEnemy(
        combat,
        observation.playerId,
        action.destination,
      );
      if (current === null || next === null) return null;
      if (next < current) {
        return {
          score: 520 + Math.min(20, current - next),
          policy: "combat.close-distance",
        };
      }
      return { score: 260, policy: "combat.hold-position" };
    }
    default:
      return null;
  }
}
