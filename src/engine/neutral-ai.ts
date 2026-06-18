import { unitIsBerserk } from "./active-effects";
import { getBattlefieldDistance } from "./battlefield";
import {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  getBerserkNearestTargets,
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
 * - A Neutral Unit "must always attack if possible" (rulebook, Combat Round
 *   Structure). So it only ever picks among the enemies it can actually hit
 *   THIS activation — already in range/adjacent, or (melee & flyers) reachable
 *   to a space next to the target. It never walks toward an out-of-reach
 *   favourite while a different enemy stands ready to be struck; it moves
 *   without attacking only when it can reach no one this activation.
 * - Ground and flying units prioritise attacking units of the SAME tier; when
 *   no same-tier enemy is available they simply hit the NEAREST enemy, whatever
 *   its tier — there is no further tier ordering, closest wins (a bronze with no
 *   bronze target attacks the nearest unit, silver or gold or azure alike).
 * - Ranged units prioritise other ranged units with that same rule (same tier
 *   first, then nearest); only when no ranged target exists do they fall back to
 *   ground/flying. They never move-then-shoot, so they only count targets they
 *   can hit from where they stand. An engaged ranged unit must hit an adjacent
 *   enemy.
 * - Among equally valid (attackable) targets they attack the closest. When
 *   targets are still tied after that, the rulebook says the player chooses —
 *   the activation pauses on an ABILITY_TARGET_CHOICE so the table decides.
 * - Summoned units (Summon Elemental) have no printed grade, so the tier rule
 *   does not apply to them: they sort behind every graded enemy and are only
 *   targeted once no real unit is left.
 * - Neutral units never defend.
 */

/**
 * Same-tier-first, then "attack the nearest." A target of the attacker's own
 * tier outranks every other tier (priority 0); ALL other tiers share one lower
 * priority (1), so the distance tiebreaker in {@link sortNeutralTargetCandidates}
 * — not any tier ordering — decides among them. (Earlier builds ranked the
 * lower tiers in descending order, then the higher tiers ascending; the house
 * rule is the simpler same-tier-then-closest.)
 */
function tierPriority(attackerTier: UnitGrade, targetTier: UnitGrade): number {
  return targetTier === attackerTier ? 0 : 1;
}

/**
 * The ranked target pool of a neutral unit: ranged attackers prefer ranged
 * targets, everyone prefers same tier and then — with no same-tier target —
 * simply the closest, distance alone breaking among the other tiers.
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
 * Within a priority-sorted pool, the leading group the rulebook leaves to the
 * table: entries that tie the front-runner on both priority class and distance.
 * Returns 2+ entries only when there is a real tie.
 */
function leadingTieGroup(attacker: CombatUnitState, sortedPool: CombatUnitState[]): CombatUnitState[] {
  if (sortedPool.length < 2) {
    return sortedPool;
  }

  const best = sortedPool[0];
  const bestSummoned = Boolean(best.summoned);
  // A summoned best target means only summoned units remain — they share no
  // grade, so the tie group is decided purely by distance.
  const bestPriority = bestSummoned ? 0 : tierPriority(attacker.grade, best.grade);
  const bestDistance = getBattlefieldDistance(attacker.position, best.position);
  return sortedPool.filter(
    (unit) =>
      Boolean(unit.summoned) === bestSummoned &&
      (bestSummoned || tierPriority(attacker.grade, unit.grade) === bestPriority) &&
      getBattlefieldDistance(attacker.position, unit.position) === bestDistance
  );
}

/**
 * Ties across every enemy, ignoring whether they can be reached this
 * activation. Kept for callers that want the abstract priority tie; the
 * activation planner uses {@link attackableTargetPool} so it only ever ties
 * over enemies it can actually strike.
 */
export function getNeutralTargetTies(combat: CombatState, attacker: CombatUnitState): CombatUnitState[] {
  return leadingTieGroup(attacker, rankedTargetPool(combat, attacker));
}

/**
 * The priority-ordered subset of enemies this unit can actually attack THIS
 * activation: already in range/adjacent, or (melee & flyers) reachable to a
 * space adjacent to the target. Ranged units never move-then-shoot, so they
 * only keep targets they can hit from where they stand.
 *
 * Built off {@link rankedTargetPool} so the same tier order, ranged-preference
 * and "closest" sorting — plus the engaged-ranged "must hit an adjacent enemy"
 * rule — all carry over; this only drops the ones the unit cannot reach to
 * strike. An empty result means the unit can hit no one this activation.
 */
function attackableTargetPool(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnitState
): CombatUnitState[] {
  const ranked = rankedTargetPool(combat, attacker);
  // Compute reachable spaces once; ranged units don't use them (no move-shoot).
  const reachSpaces = attacker.type === "ranged" ? [] : getLegalMoveDestinations(combat, attacker, state);
  return ranked.filter((target) => {
    if (canUnitAttack(combat, attacker, target, state.activeEffects)) {
      return true;
    }
    if (attacker.type === "ranged") {
      return false;
    }
    return reachSpaces.some(
      (space) => isAdjacent(space, target.position) && canUnitMoveAndAttack(combat, attacker, space, target, state)
    );
  });
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

  // Berserk overrides the rulebook's tier priority: the unit must attack the
  // NEAREST unit (friend or foe), or move to the nearest and attack it. The
  // attacker is berserked, so canUnitAttack lets it strike its own allies.
  if (unitIsBerserk(state.activeEffects, unit)) {
    return planBerserkActivation(state, combat, unit, forcedTargetId);
  }

  // The player resolved a target tie: commit to that exact unit if it still
  // stands — strike it directly or close the last step into it.
  if (forcedTargetId) {
    const forced = combat.units[forcedTargetId] ?? null;
    if (forced && isUnitAlive(forced)) {
      return attackOrReach(state, combat, unit, forced) ?? approachTarget(state, combat, unit, forced);
    }
    // The chosen target is gone — fall through and re-plan from scratch.
  }

  // Rulebook: a Neutral Unit "must always attack if possible." Choose only
  // among the enemies the unit can actually strike this activation, never
  // wandering toward an out-of-reach favourite while an attackable enemy waits.
  const attackable = attackableTargetPool(state, combat, unit);
  if (attackable.length > 0) {
    const ties = leadingTieGroup(unit, attackable);
    if (!forcedTargetId && ties.length > 1) {
      return { kind: "choose-target", candidateIds: ties.map((candidate) => candidate.id) };
    }
    const target = ties[0];
    // attackable membership guarantees a hit is reachable, but keep the
    // approach fallback so a stale plan never returns a non-attacking nothing.
    return attackOrReach(state, combat, unit, target) ?? approachTarget(state, combat, unit, target);
  }

  // It can reach no one this activation: advance on the top-priority target to
  // set up a strike next round (or pass if it cannot close the gap).
  const target = pickNeutralTarget(combat, unit);
  if (!target) {
    return { kind: "pass" };
  }
  return approachTarget(state, combat, unit, target);
}

/**
 * A berserked neutral's activation: it must attack the nearest unit (friend or
 * foe), or move to the nearest and attack it. Mirrors the rulebook's tie rule —
 * several equally near, attackable targets pause on a player choice; otherwise
 * it strikes/closes on the nearest, and only advances (or passes) when it can
 * reach none.
 */
function planBerserkActivation(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  forcedTargetId?: UnitId
): NeutralIntent {
  const nearest = getBerserkNearestTargets(combat, unit);
  if (nearest.length === 0) {
    return { kind: "pass" };
  }

  // Commit to a resolved tie if that unit is still one of the nearest.
  if (forcedTargetId) {
    const forced = nearest.find((candidate) => candidate.id === forcedTargetId);
    if (forced) {
      return attackOrReach(state, combat, unit, forced) ?? approachTarget(state, combat, unit, forced);
    }
  }

  const attackable = nearest.filter((target) => attackOrReach(state, combat, unit, target) !== null);
  if (attackable.length > 0) {
    if (!forcedTargetId && attackable.length > 1) {
      return { kind: "choose-target", candidateIds: attackable.map((candidate) => candidate.id) };
    }
    return attackOrReach(state, combat, unit, attackable[0]) ?? approachTarget(state, combat, unit, attackable[0]);
  }

  // Cannot reach a strike this activation — close on a nearest unit (or pass).
  return approachTarget(state, combat, unit, nearest[0]);
}

/**
 * Strike the target from here, or (melee & flyers) move into the nearest space
 * adjacent to it and strike. Returns null when the unit cannot reach the target
 * to attack it this activation — ranged units never move-then-shoot.
 */
function attackOrReach(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  target: CombatUnitState
): NeutralIntent | null {
  if (canUnitAttack(combat, unit, target, state.activeEffects)) {
    return { kind: "attack", defenderId: target.id };
  }

  if (unit.type === "ranged") {
    return null;
  }

  const attackSpots = getLegalMoveDestinations(combat, unit, state).filter(
    (space) => isAdjacent(space, target.position) && canUnitMoveAndAttack(combat, unit, space, target, state)
  );
  if (attackSpots.length === 0) {
    return null;
  }

  const destination = attackSpots.sort(
    (left, right) =>
      getBattlefieldDistance(unit.position, left) - getBattlefieldDistance(unit.position, right) || left - right
  )[0];
  return { kind: "move-and-attack", destination, defenderId: target.id };
}

/** Step toward a target the unit cannot strike yet, or pass if it cannot close in. */
function approachTarget(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  target: CombatUnitState
): NeutralIntent {
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
