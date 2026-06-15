import { getBattlefieldDistance } from "./battlefield";
import {
  canUnitAttack,
  canUnitMoveTo,
  getLegalMoveDestinations,
  getPathDistances,
  isAdjacent,
  isUnitAlive
} from "./legal-actions";
import type { CombatState, CombatUnitState, GameState, UnitGrade, UnitId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

/**
 * Neutral activation logic per the community rulebook's AI rules:
 *
 * - Ground and flying units prioritise attacking units of the same tier,
 *   then lower tiers in descending order, then higher tiers in ascending
 *   order.
 * - Ranged units prioritise other ranged units with the same tier order;
 *   only when no ranged target exists do they fall back to ground/flying.
 * - Among equally valid targets they attack the closest. When targets are
 *   still tied after that, the rulebook says the player chooses — the
 *   activation pauses on an ABILITY_TARGET_CHOICE so the table decides.
 * - Summoned units (Summon Elemental) have no printed grade, so the tier rule
 *   does not apply to them: they sort behind every graded enemy and are only
 *   targeted once no real unit is left.
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

/**
 * The ranked target pool of a neutral unit: ranged attackers prefer ranged
 * targets, everyone prefers same tier, then lower, then higher tiers, and
 * closer targets beat farther ones.
 */
function rankedTargetPool(combat: CombatState, attacker: CombatUnitState): CombatUnitState[] {
  const enemies = Object.values(combat.units).filter(
    (unit) => unit.controllerId !== attacker.controllerId && isUnitAlive(unit)
  );
  if (enemies.length === 0) {
    return [];
  }

  // Engaged ranged units must attack an adjacent enemy.
  if (attacker.type === "ranged") {
    const adjacent = enemies.filter((unit) => isAdjacent(attacker.position, unit.position));
    if (adjacent.length > 0) {
      return sortNeutralTargetCandidates(attacker, adjacent);
    }
  }

  const pool =
    attacker.type === "ranged"
      ? enemies.some((unit) => unit.type === "ranged")
        ? enemies.filter((unit) => unit.type === "ranged")
        : enemies
      : enemies;

  return sortNeutralTargetCandidates(attacker, pool);
}

export function pickNeutralTarget(combat: CombatState, attacker: CombatUnitState): CombatUnitState | null {
  return rankedTargetPool(combat, attacker)[0] ?? null;
}

/**
 * Targets the rulebook leaves to the table: candidates that tie the best
 * target on both priority class and distance. Returns 2+ entries only when
 * there is a real tie.
 */
export function getNeutralTargetTies(combat: CombatState, attacker: CombatUnitState): CombatUnitState[] {
  const pool = rankedTargetPool(combat, attacker);
  if (pool.length < 2) {
    return pool;
  }

  const best = pool[0];
  const bestSummoned = Boolean(best.summoned);
  // A summoned best target means only summoned units remain — they share no
  // grade, so the tie group is decided purely by distance.
  const bestPriority = bestSummoned ? 0 : tierPriority(attacker.grade, best.grade);
  const bestDistance = getBattlefieldDistance(attacker.position, best.position);
  return pool.filter(
    (unit) =>
      Boolean(unit.summoned) === bestSummoned &&
      (bestSummoned || tierPriority(attacker.grade, unit.grade) === bestPriority) &&
      getBattlefieldDistance(attacker.position, unit.position) === bestDistance
  );
}

export function sortNeutralTargetCandidates(
  attacker: CombatUnitState,
  candidates: CombatUnitState[]
): CombatUnitState[] {
  return [...candidates].sort((left, right) => {
    // Gradeless summoned units always sort behind graded ones, whatever their
    // tier or distance — the AI exhausts real targets first.
    const summonedDelta = (left.summoned ? 1 : 0) - (right.summoned ? 1 : 0);
    if (summonedDelta !== 0) {
      return summonedDelta;
    }

    // Tier priority only applies between graded units; two summoned units have
    // no grade to compare, so they fall straight through to distance.
    if (!left.summoned) {
      const priority = tierPriority(attacker.grade, left.grade) - tierPriority(attacker.grade, right.grade);
      if (priority !== 0) {
        return priority;
      }
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
  | { kind: "pass" }
  | {
      /** Rulebook tie between equally valid targets: the player chooses. */
      kind: "choose-target";
      candidateIds: UnitId[];
    };

/**
 * Decides what the active neutral unit does this activation. With
 * `forcedTargetId` set (the player already resolved a target tie) the unit
 * commits to that target.
 */
export function planNeutralActivation(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  forcedTargetId?: UnitId
): NeutralIntent {
  // A neutral that already fired never repositions: its activation is over.
  if (unit.attackedThisActivation) {
    return { kind: "pass" };
  }

  let target: CombatUnitState | null = null;
  if (forcedTargetId) {
    target = combat.units[forcedTargetId] ?? null;
    if (target && !isUnitAlive(target)) {
      target = null;
    }
  }

  if (!target) {
    const ties = getNeutralTargetTies(combat, unit);
    if (!forcedTargetId && ties.length > 1) {
      return { kind: "choose-target", candidateIds: ties.map((candidate) => candidate.id) };
    }
    target = ties[0] ?? null;
  }

  if (!target) {
    return { kind: "pass" };
  }

  if (canUnitAttack(combat, unit, target, state.activeEffects)) {
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

// Squares with no walkable path to the target sort behind every reachable one
// while still preferring the closest of the unreachable lot.
const BATTLEFIELD_PATH_PENALTY = 1000;

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

  // Distance is measured along an actual path around other units and obstacle
  // tokens, not as the crow flies — otherwise a unit walled off the straight
  // line reads every reachable square as "no closer" and freezes in place
  // (the bug where a guard just never moves). Flyers ignore blockers, so for
  // them this matches the straight-line distance.
  const field = getPathDistances(combat, unit, target.position);
  const distanceTo = (position: number): number =>
    field.get(position) ?? getBattlefieldDistance(position, target.position) + BATTLEFIELD_PATH_PENALTY;

  const here = distanceTo(unit.position);
  const best = destinations
    .slice()
    .sort(
      (left, right) =>
        distanceTo(left) - distanceTo(right) ||
        getBattlefieldDistance(left, target.position) - getBattlefieldDistance(right, target.position) ||
        left - right
    )[0];

  // Only move when the step actually shortens the path to the target.
  if (distanceTo(best) >= here) {
    return null;
  }

  return best;
}

export function isNeutralUnit(unit: CombatUnitState): boolean {
  return unit.controllerId === NEUTRAL_PLAYER_ID;
}
