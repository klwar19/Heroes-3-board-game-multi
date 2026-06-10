import { getBattlefieldDistance } from "./battlefield";
import { canUnitAttack, canUnitMoveTo, getLegalMoveDestinations, isAdjacent, isUnitAlive } from "./legal-actions";
import type { CombatState, CombatUnitState, GameState, UnitGrade } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

/**
 * Neutral activation logic per the community rulebook's AI rules:
 *
 * - Ground and flying units prioritise attacking units of the same tier,
 *   then lower tiers in descending order, then higher tiers in ascending
 *   order.
 * - Ranged units prioritise other ranged units with the same tier order;
 *   only when no ranged target exists do they fall back to ground/flying.
 * - Among equally valid targets they attack the closest. Rule ties are left
 *   to the player at the table; online we break them deterministically by
 *   the lowest board position so every client agrees.
 * - Neutral units never defend.
 */

const TIER_RANK: Record<UnitGrade, number> = { bronze: 0, silver: 1, gold: 2, azure: 3 };

function tierPriority(attackerTier: UnitGrade, targetTier: UnitGrade): number {
  const attacker = TIER_RANK[attackerTier];
  const target = TIER_RANK[targetTier];
  if (target === attacker) {
    return 0;
  }

  if (target < attacker) {
    // Lower tiers next, closest tier first (descending order).
    return attacker - target;
  }

  // Higher tiers last, ascending.
  return 10 + (target - attacker);
}

export function pickNeutralTarget(combat: CombatState, attacker: CombatUnitState): CombatUnitState | null {
  const enemies = Object.values(combat.units).filter(
    (unit) => unit.controllerId !== attacker.controllerId && isUnitAlive(unit)
  );
  if (enemies.length === 0) {
    return null;
  }

  // Engaged ranged units must attack an adjacent enemy.
  if (attacker.type === "ranged") {
    const adjacent = enemies.filter((unit) => isAdjacent(attacker.position, unit.position));
    if (adjacent.length > 0) {
      return sortCandidates(attacker, adjacent)[0];
    }
  }

  const pool =
    attacker.type === "ranged"
      ? enemies.some((unit) => unit.type === "ranged")
        ? enemies.filter((unit) => unit.type === "ranged")
        : enemies
      : enemies;

  return sortCandidates(attacker, pool)[0] ?? null;
}

function sortCandidates(attacker: CombatUnitState, candidates: CombatUnitState[]): CombatUnitState[] {
  return [...candidates].sort((left, right) => {
    const priority = tierPriority(attacker.grade, left.grade) - tierPriority(attacker.grade, right.grade);
    if (priority !== 0) {
      return priority;
    }

    const distance =
      getBattlefieldDistance(attacker.position, left.position) -
      getBattlefieldDistance(attacker.position, right.position);
    if (distance !== 0) {
      return distance;
    }

    return left.position - right.position;
  });
}

export type NeutralIntent =
  | { kind: "attack"; defenderId: string }
  | { kind: "move-and-attack"; destination: number; defenderId: string }
  | { kind: "move"; destination: number }
  | { kind: "pass" };

/** Decides what the active neutral unit does this activation. */
export function planNeutralActivation(state: GameState, combat: CombatState, unit: CombatUnitState): NeutralIntent {
  // A neutral that already fired never repositions: its activation is over.
  if (unit.attackedThisActivation) {
    return { kind: "pass" };
  }

  const target = pickNeutralTarget(combat, unit);
  if (!target) {
    return { kind: "pass" };
  }

  if (canUnitAttack(combat, unit, target)) {
    return { kind: "attack", defenderId: target.id };
  }

  if (unit.type === "ranged") {
    // A ranged unit that cannot attack (should not happen on an open board)
    // steps toward the target instead.
    const destination = bestStepTowards(state, combat, unit, target);
    return destination === null ? { kind: "pass" } : { kind: "move", destination };
  }

  // Melee and flying: find a reachable space adjacent to the target.
  const destinations = getLegalMoveDestinations(combat, unit, state);
  const attackSpots = destinations.filter((destination) => isAdjacent(destination, target.position));
  if (attackSpots.length > 0) {
    const destination = attackSpots.sort(
      (left, right) =>
        getBattlefieldDistance(unit.position, left) - getBattlefieldDistance(unit.position, right) ||
        left - right
    )[0];
    return { kind: "move-and-attack", destination, defenderId: target.id };
  }

  const destination = bestStepTowards(state, combat, unit, target);
  return destination === null ? { kind: "pass" } : { kind: "move", destination };
}

function bestStepTowards(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  target: CombatUnitState
): number | null {
  const destinations = getLegalMoveDestinations(combat, unit, state).filter((destination) =>
    canUnitMoveTo(combat, unit, destination, state)
  );
  if (destinations.length === 0) {
    return null;
  }

  const best = destinations.sort(
    (left, right) =>
      getBattlefieldDistance(left, target.position) - getBattlefieldDistance(right, target.position) ||
      left - right
  )[0];

  // Only move when it actually gets closer.
  if (getBattlefieldDistance(best, target.position) >= getBattlefieldDistance(unit.position, target.position)) {
    return null;
  }

  return best;
}

export function isNeutralUnit(unit: CombatUnitState): boolean {
  return unit.controllerId === NEUTRAL_PLAYER_ID;
}
