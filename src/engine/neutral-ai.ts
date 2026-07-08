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
 * - Ground and flying units prioritise attacking units of the SAME tier, then
 *   the LOWER tiers in descending order (the closest tier down first), and only
 *   then the higher tiers. Among those remaining HIGHER tiers there is no tier
 *   order — they go by distance, the NEAREST first. So a Bronze hits Bronze,
 *   then the nearest of {Silver, Gold, Azure}; a Silver hits Silver, then
 *   Bronze, then the nearer of {Gold, Azure}; a Gold hits Gold, then Silver,
 *   then Bronze, then Azure; an Azure runs straight down Gold → Silver → Bronze.
 * - Ranged units apply that exact rule but hunt other ranged units first; only
 *   when no ranged target exists do they fall back to ground/flying (same rule
 *   again). They never move-then-shoot, so they only count targets they can hit
 *   from where they stand. An engaged ranged unit must hit an adjacent enemy.
 * - Among equally valid (attackable) targets they attack the closest. When
 *   targets are still tied after that, the rulebook says the player chooses —
 *   the activation pauses on an ABILITY_TARGET_CHOICE so the table decides.
 * - Summoned units (Summon Elemental) have no printed grade, so the tier rule
 *   does not apply to them: they sort behind every graded enemy and are only
 *   targeted once no real unit is left.
 * - Creature Bank guard cards likewise carry NO tier (rulebook p.66 — a bank
 *   unit card is gradeless, "grade 0"). As a TARGET a bank guard therefore sorts
 *   behind every graded enemy exactly like a summoned unit: a graded attacker
 *   hits it LAST, only once no graded enemy remains. (Bank guards also stay
 *   exempt from tier-specific spells/abilities — see gradeRankOfUnit — which is
 *   a separate axis from this AI target priority.)
 * - Creature Bank guards fight from gradeless bank cards (rulebook p.66: a bank
 *   unit card carries NO tier). With no tier the same-tier priority cannot apply,
 *   so a bank guard ranks its candidate targets by distance — the NEAREST first
 *   (ties still pause on a player choice). It KEEPS the universal ranged rules: a
 *   ranged guard still hunts ranged targets first, and an engaged one must hit an
 *   adjacent enemy. Detected from the `bankUnit` flag via isGradelessNeutralAttacker.
 * - Neutral units never defend.
 */

const TIER_RANK: Record<UnitGrade, number> = { bronze: 0, silver: 1, gold: 2, azure: 3 };
// Every higher tier shares this one priority class so the distance tiebreaker —
// not the tier gap — orders them. It sits above any lower-tier value (those are
// at most TIER_RANK spread = 3), so all lower tiers are still struck first.
const HIGHER_TIER_PRIORITY = 10;

/**
 * Target-tier ranking: the attacker's own tier first (0), then the LOWER tiers
 * in descending order — the closest tier down ranks ahead of the next (so a
 * Gold prefers Silver over Bronze) — and finally the higher tiers, which ALL
 * share {@link HIGHER_TIER_PRIORITY}. That shared class means the distance
 * tiebreaker in {@link sortNeutralTargetCandidates} picks the NEAREST higher
 * tier rather than the smallest tier gap (a Bronze with no Bronze target takes
 * the closest of Silver/Gold/Azure; a Silver after Silver+Bronze takes the
 * nearer of Gold/Azure). Distance still breaks ties within any single class.
 */
function tierPriority(attackerTier: UnitGrade, targetTier: UnitGrade): number {
  const attacker = TIER_RANK[attackerTier];
  const target = TIER_RANK[targetTier];
  if (target === attacker) {
    return 0;
  }
  if (target < attacker) {
    // Lower tiers next, the closest tier down first (descending order).
    return attacker - target;
  }
  // Every higher tier ties here, so distance — not the tier gap — orders them.
  return HIGHER_TIER_PRIORITY;
}

/**
 * Creature Bank guards fight from gradeless bank cards (rulebook p.66: a bank
 * unit card has NO tier). With no tier the same-tier/lower-tier priority cannot
 * apply, so among its candidate targets such a guard orders purely by distance —
 * the NEAREST first. It still keeps the universal ranged rules: a ranged guard
 * hunts ranged targets first, and an engaged one must strike an adjacent enemy.
 */
function isGradelessNeutralAttacker(unit: CombatUnitState): boolean {
  return Boolean(unit.bankUnit);
}

/**
 * A TARGET with no printed tier — a summoned unit or a gradeless Creature Bank
 * guard card ("grade 0"). The tier rule can't rank it, so it sorts behind every
 * graded enemy: a graded attacker strikes it LAST, only once no graded enemy is
 * left. (Whether the ATTACKER itself is gradeless is a separate question — see
 * isGradelessNeutralAttacker.)
 */
function isNoTierTarget(unit: CombatUnitState): boolean {
  // Summons, bank defenders and WOG commanders all fight without a printed
  // tier, so the same-tier priority never applies to them — a graded neutral
  // attacker turns on them last.
  return Boolean(unit.summoned || unit.bankUnit || unit.commanderSlug);
}

/**
 * How far the attacker must travel to reach a target, as the "nearest" target
 * tiebreaker counts it.
 *
 * A RANGED attacker shoots over obstacles and other unit cards — it never walks
 * to its target — so for a shooter "nearest" is the straight-line grid distance,
 * exactly like a flyer's. Ranking a shooter by a WALKED path (the branch below)
 * walls it off behind blockers and makes it fire on a visually-FARTHER enemy:
 * the "weird" melee targeting. An engaged ranged unit only ever melees an
 * adjacent enemy (distance 1 either way), so straight-line is right there too.
 *
 * A ground unit, by contrast, must MOVE next to its target, so its distance is
 * counted along a real path that treats other unit cards and obstacle tokens as
 * walls (flyers pass over them — getPathDistances keys "ignore obstacles" off
 * the mover's type). A ground unit walled off the straight line must walk AROUND
 * the blockers, so its nearest target by walking can differ from the crow-flies
 * nearest. A target with no walkable path sorts behind every reachable one but
 * still prefers the closer of the unreachable lot (the straight-line fallback).
 *
 * Flooding from the target's own square (its occupant excepted) yields the
 * distance to stand on it; standing ADJACENT to attack is one step less, but
 * since that offset is uniform it never changes the target ordering.
 */
function neutralMoveDistanceToTarget(
  combat: CombatState,
  attacker: CombatUnitState,
  target: CombatUnitState
): number {
  // A shooter fires from where it stands — count the straight line, not a walk.
  if (attacker.type === "ranged") {
    return getBattlefieldDistance(attacker.position, target.position);
  }
  const field = getPathDistances(combat, attacker, target.position);
  return (
    field.get(attacker.position) ??
    getBattlefieldDistance(attacker.position, target.position) + BATTLEFIELD_PATH_PENALTY
  );
}

/** Travel distance from the attacker to each candidate, computed once (walked
 * for ground movers, straight-line for shooters and flyers). */
function neutralTargetDistances(
  combat: CombatState,
  attacker: CombatUnitState,
  candidates: CombatUnitState[]
): Map<UnitId, number> {
  const distances = new Map<UnitId, number>();
  for (const target of candidates) {
    distances.set(target.id, neutralMoveDistanceToTarget(combat, attacker, target));
  }
  return distances;
}

/**
 * The ranked target pool of a neutral unit: ranged attackers prefer ranged
 * targets; everyone then ranks by {@link tierPriority} (same tier, lower tiers
 * descending, higher tiers by distance) with the closest breaking ties. A
 * gradeless Creature Bank guard keeps the ranged preference but skips the tier
 * ordering, ranking its chosen pool purely by distance. "Closest" is the
 * walking distance ({@link neutralMoveDistanceToTarget}), so a unit boxed in by
 * other cards counts as far even when it is near as the crow flies.
 */
function rankedTargetPool(combat: CombatState, attacker: CombatUnitState): CombatUnitState[] {
  const enemies = Object.values(combat.units).filter(
    (unit) => unit.controllerId !== attacker.controllerId && isUnitAlive(unit)
  );
  if (enemies.length === 0) {
    return [];
  }

  // Engaged ranged units must attack an adjacent enemy. This is a hard
  // restriction, not a tier preference, so it binds gradeless bank guards too.
  if (attacker.type === "ranged") {
    const adjacent = enemies.filter((unit) => isAdjacent(attacker.position, unit.position));
    if (adjacent.length > 0) {
      return sortNeutralTargetCandidates(combat, attacker, adjacent);
    }
  }

  // Ranged units hunt ranged targets first — gradeless bank guards included
  // (the tier ORDERING within the chosen pool is the only thing they drop).
  const pool =
    attacker.type === "ranged"
      ? enemies.some((unit) => unit.type === "ranged")
        ? enemies.filter((unit) => unit.type === "ranged")
        : enemies
      : enemies;

  return sortNeutralTargetCandidates(combat, attacker, pool);
}

export function pickNeutralTarget(combat: CombatState, attacker: CombatUnitState): CombatUnitState | null {
  return rankedTargetPool(combat, attacker)[0] ?? null;
}

/**
 * Within a priority-sorted pool, the leading group the rulebook leaves to the
 * table: entries that tie the front-runner on both priority class and distance.
 * Returns 2+ entries only when there is a real tie.
 */
function leadingTieGroup(
  combat: CombatState,
  attacker: CombatUnitState,
  sortedPool: CombatUnitState[]
): CombatUnitState[] {
  if (sortedPool.length < 2) {
    return sortedPool;
  }

  // A gradeless attacker (a Creature Bank guard) or a no-tier best target (a
  // summoned unit or a bank-guard card) means grade plays no part, so the tie
  // group is decided purely by distance. Distance is the same walking metric the
  // sort uses ({@link neutralMoveDistanceToTarget}), so the tie group matches the
  // order: two targets only tie when they are equally far to WALK to.
  const gradeless = isGradelessNeutralAttacker(attacker);
  const distanceTo = neutralTargetDistances(combat, attacker, sortedPool);
  const best = sortedPool[0];
  const bestNoTier = isNoTierTarget(best);
  const bestPriority = gradeless || bestNoTier ? 0 : tierPriority(attacker.grade, best.grade);
  const bestDistance = distanceTo.get(best.id);
  return sortedPool.filter(
    (unit) =>
      isNoTierTarget(unit) === bestNoTier &&
      (gradeless || bestNoTier || tierPriority(attacker.grade, unit.grade) === bestPriority) &&
      distanceTo.get(unit.id) === bestDistance
  );
}

/**
 * Ties across every enemy, ignoring whether they can be reached this
 * activation. Kept for callers that want the abstract priority tie; the
 * activation planner uses {@link attackableTargetPool} so it only ever ties
 * over enemies it can actually strike.
 */
export function getNeutralTargetTies(combat: CombatState, attacker: CombatUnitState): CombatUnitState[] {
  return leadingTieGroup(combat, attacker, rankedTargetPool(combat, attacker));
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
  combat: CombatState,
  attacker: CombatUnitState,
  candidates: CombatUnitState[]
): CombatUnitState[] {
  // A gradeless Creature Bank guard has no tier of its own, so it never applies
  // the same-tier priority and ranks every target purely by distance.
  const gradeless = isGradelessNeutralAttacker(attacker);
  // Walking distance to each candidate, computed once (path-aware: other units
  // and obstacles wall a ground mover in; flyers pass over them).
  const distanceTo = neutralTargetDistances(combat, attacker, candidates);
  return [...candidates].sort((left, right) => {
    // No-tier targets (summoned units OR gradeless bank-guard cards) always sort
    // behind graded ones, whatever their tier or distance — the AI exhausts real
    // graded targets first (true even for a bank guard attacker: it hits real
    // units before any conjured Elemental).
    const noTierDelta = (isNoTierTarget(left) ? 1 : 0) - (isNoTierTarget(right) ? 1 : 0);
    if (noTierDelta !== 0) {
      return noTierDelta;
    }

    // Tier priority needs a graded attacker AND graded targets; a gradeless bank
    // guard attacker or a no-tier target has no grade to compare, so it falls
    // straight through to distance.
    if (!gradeless && !isNoTierTarget(left)) {
      const priority = tierPriority(attacker.grade, left.grade) - tierPriority(attacker.grade, right.grade);
      if (priority !== 0) {
        return priority;
      }
    }

    const distance = (distanceTo.get(left.id) ?? 0) - (distanceTo.get(right.id) ?? 0);
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
    }
  | {
      /**
       * BINH house rule: a melee/flying neutral must step next to its chosen
       * target and SEVERAL legal cells reach it — the attacking player picks
       * which. It still attacks `defenderId` (the target is fixed by the rules);
       * only the landing cell is the player's choice. Composes with a preceding
       * `choose-target` tie: once the target is picked, this offers the cells.
       */
      kind: "choose-destination";
      defenderId: UnitId;
      destinations: number[];
    };

/**
 * Decides what the active neutral unit does this activation. With
 * `forcedTargetId` set (the player already resolved a target tie) the unit
 * commits to that target; with `forcedDestination` set (the player picked the
 * move destination) it commits to landing on that cell before striking.
 */
export function planNeutralActivation(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  forcedTargetId?: UnitId,
  forcedDestination?: number
): NeutralIntent {
  // A neutral that already fired never repositions: its activation is over.
  if (unit.attackedThisActivation) {
    return { kind: "pass" };
  }

  // Berserk overrides the rulebook's tier priority: the unit must attack the
  // NEAREST unit (friend or foe), or move to the nearest and attack it. The
  // attacker is berserked, so canUnitAttack lets it strike its own allies.
  if (unitIsBerserk(state.activeEffects, unit)) {
    return planBerserkActivation(state, combat, unit, forcedTargetId, forcedDestination);
  }

  // The player resolved a target tie: commit to that exact unit if it still
  // stands — strike it directly or close the last step into it (letting the
  // player pick the landing cell too when several reach it).
  if (forcedTargetId) {
    const forced = combat.units[forcedTargetId] ?? null;
    if (forced && isUnitAlive(forced)) {
      return (
        attackOrReach(state, combat, unit, forced, forcedDestination) ?? approachTarget(state, combat, unit, forced)
      );
    }
    // The chosen target is gone — fall through and re-plan from scratch.
  }

  // Rulebook: a Neutral Unit "must always attack if possible." Choose only
  // among the enemies the unit can actually strike this activation, never
  // wandering toward an out-of-reach favourite while an attackable enemy waits.
  const attackable = attackableTargetPool(state, combat, unit);
  if (attackable.length > 0) {
    const ties = leadingTieGroup(combat, unit, attackable);
    if (!forcedTargetId && ties.length > 1) {
      return { kind: "choose-target", candidateIds: ties.map((candidate) => candidate.id) };
    }
    const target = ties[0];
    // attackable membership guarantees a hit is reachable, but keep the
    // approach fallback so a stale plan never returns a non-attacking nothing.
    return (
      attackOrReach(state, combat, unit, target, forcedDestination) ?? approachTarget(state, combat, unit, target)
    );
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
  forcedTargetId?: UnitId,
  forcedDestination?: number
): NeutralIntent {
  const nearest = getBerserkNearestTargets(combat, unit);
  if (nearest.length === 0) {
    return { kind: "pass" };
  }

  // Commit to a resolved tie if that unit is still one of the nearest (letting
  // the player pick the landing cell too when several reach it).
  if (forcedTargetId) {
    const forced = nearest.find((candidate) => candidate.id === forcedTargetId);
    if (forced) {
      return (
        attackOrReach(state, combat, unit, forced, forcedDestination) ?? approachTarget(state, combat, unit, forced)
      );
    }
  }

  const attackable = nearest.filter((target) => attackOrReach(state, combat, unit, target) !== null);
  if (attackable.length > 0) {
    if (!forcedTargetId && attackable.length > 1) {
      return { kind: "choose-target", candidateIds: attackable.map((candidate) => candidate.id) };
    }
    return (
      attackOrReach(state, combat, unit, attackable[0], forcedDestination) ??
      approachTarget(state, combat, unit, attackable[0])
    );
  }

  // Cannot reach a strike this activation — close on a nearest unit (or pass).
  return approachTarget(state, combat, unit, nearest[0]);
}

/**
 * Strike the target from here, or (melee & flyers) move into a space adjacent to
 * it and strike. Returns null when the unit cannot reach the target to attack it
 * this activation — ranged units never move-then-shoot.
 *
 * When several legal cells reach the target, the attacking player picks which
 * (the BINH house rule: `choose-destination`, cells listed by ascending index) —
 * unless the player has already picked (`forcedDestination`, still one of the
 * legal cells), in which case it commits to that cell, or only one cell works,
 * in which case it moves-and-attacks there with no prompt.
 */
function attackOrReach(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState,
  target: CombatUnitState,
  forcedDestination?: number
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

  // The player already picked a destination (via the choose-destination window):
  // commit to it as long as it is still a legal attack cell.
  if (forcedDestination !== undefined && attackSpots.includes(forcedDestination)) {
    return { kind: "move-and-attack", destination: forcedDestination, defenderId: target.id };
  }

  // Several legal cells reach the target — the attacking player chooses which.
  // A single cell needs no prompt.
  if (attackSpots.length > 1) {
    return {
      kind: "choose-destination",
      defenderId: target.id,
      destinations: [...attackSpots].sort((left, right) => left - right)
    };
  }

  return { kind: "move-and-attack", destination: attackSpots[0], defenderId: target.id };
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
