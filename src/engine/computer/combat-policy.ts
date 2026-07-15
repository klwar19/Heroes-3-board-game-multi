import { coreUnitDefinitions } from "@/data/factions/units";
import { getUnitSide } from "../adventure";
import { commanderCastOf } from "../commanders";
import {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
} from "../adventure-reducer";
import { getBattlefieldDistance, isAdjacent } from "../battlefield";
import type { CombatState, CombatUnitState, GameAction } from "../state";
import type { ComputerActionScore } from "./map-policy";
import {
  attackIsLethal,
  distanceToNearestEnemy,
  expectedAttackDamage,
  hasThreatAbility,
  isParalyzed,
  livingEnemyUnits,
  targetPriority,
  unitRemainingHealth,
  unitThreatValue,
} from "./score";
import type { ComputerObservation } from "./types";

/**
 * True when our side is clearly losing a neutral fight: no living unit can
 * still threaten meaningful damage and enemies out-bulk us. Used to prefer
 * RETREAT over CONTINUE when the fight is hopeless (saves MP and units).
 */
function combatIsHopeless(
  observation: ComputerObservation,
  combat: CombatState,
): boolean {
  const own = Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === observation.playerId &&
      unitRemainingHealth(unit) > 0,
  );
  if (own.length === 0) return true;
  const enemies = livingEnemyUnits(combat, observation.playerId);
  if (enemies.length === 0) return false;
  const ownThreat = own.reduce((sum, u) => sum + unitThreatValue(u), 0);
  const enemyThreat = enemies.reduce((sum, u) => sum + unitThreatValue(u), 0);
  // Hopeless when out-bulked by more than 2× and we have at most one unit left,
  // or total threat is tiny vs the opposition.
  if (own.length <= 1 && enemyThreat >= ownThreat * 2.5) return true;
  if (ownThreat * 2 < enemyThreat && own.every((u) => unitRemainingHealth(u) <= 2)) {
    return true;
  }
  return false;
}

// Attack scores live in a band that always outranks the passive activation
// exits (DEFEND = 500, END_ACTIVATION = 400 in the foundation) so a computer
// unit that CAN strike always does, while target quality orders WITHIN the
// band. Kept below the mandatory stage scores (FINISH/PLACE ≥ 900) which belong
// to other combat stages.
const ATTACK_BASE = 620;
const ATTACK_FLOOR = 560;
const ATTACK_CEIL = 880;
// A pure suicide — zero expected damage AND a lethal retaliation invited —
// drops below the high-value Defend band (550+) so the unit is not thrown
// away, while still beating the plain defend/end exits (≤530/400): a unit with
// nothing to protect keeps trading rather than turtling.
const SUICIDAL_ATTACK_SCORE = 545;
// A value-losing trade — the retaliation kills our MORE valuable attacker for
// only a small chip on the defender. Sits just below the high-value Defend
// save (550) so a threatened key unit turtles instead, while plain-defend
// chaff (≤530) still takes the trade.
const BAD_TRADE_ATTACK_SCORE = 548;
// Enemy shooters strike every round without exposing themselves to melee
// retaliation — removing (or pressuring) them first is the classic opening.
const RANGED_TARGET_BONUS = 18;
// Reaching an enemy caster / activation-threat (Enchanter heal, Faerie Bolt,
// Genie, splash…) with our melee this activation is the same "deny the backline"
// hunt as pressuring a shooter — a strong humans-deny-shooters bonus.
const CASTER_TARGET_BONUS = 14;
// Focus fire: reward stacking damage onto a body reachable allies can also hit,
// capped so it orders WITHIN the attack band without swamping the lethal/chip
// signal, and a larger bonus when this hit plus those allies can FINISH it now.
const FOCUS_PRESSURE_CAP = 24;
const FOCUS_FINISH_BONUS = 24;
// A non-lethal poke that the army cannot finish this round, thrown at a
// safely-skippable PARALYZED enemy, would only wake it (any damage removes the
// Paralysis token, cancelling the activation it was going to skip). Score it
// below the passive exits (END_ACTIVATION = 400) so the unit holds / does
// something real instead of trading its strike to wake a sleeper. A lethal hit
// (or one the army can finish) never reaches this — those remove the unit.
const PARALYSIS_WAKE_POKE_SCORE = 360;
// Focus march: how strongly a MOVE toward the highest value-adjusted target is
// preferred (and the mild penalty for stepping away from it).
const FOCUS_MARCH_BONUS = 14;
const FOCUS_MARCH_AWAY_PENALTY = 6;

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
 *
 * Multi-unit focus-fire: prefer the same enemy allies already threaten (or the
 * lowest-remaining high-threat target) so the army finishes units instead of
 * spreading chips.
 */
function attackScore(
  combat: CombatState,
  playerId: string,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackFromPosition: number,
): number {
  const remaining = unitRemainingHealth(defender);
  const threat = unitThreatValue(defender);
  const damage = expectedAttackDamage(attacker, defender);
  const damageFraction = remaining > 0 ? damage / remaining : 0;
  const lethal = attackIsLethal(attacker, defender);
  const ownRemaining = unitRemainingHealth(attacker);

  // Allies that have NOT acted yet this round and can reach this same enemy
  // (adjacent melee, or any ranged): the bodies that can still add damage to
  // this target this round. Drives both focus-fire and the paralysis guard.
  const reachingAllies = Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === playerId &&
      unit.id !== attacker.id &&
      unitRemainingHealth(unit) > 0 &&
      !unit.activatedThisRound &&
      (unit.type === "ranged" || isAdjacent(unit.position, defender.position)),
  );
  const allyFollowUpDamage = reachingAllies.reduce(
    (sum, unit) => sum + expectedAttackDamage(unit, defender),
    0,
  );
  const armyCanFinish = damage + allyFollowUpDamage >= remaining;

  // Don't wake a safely-skippable paralyzed enemy for chip: any damage removes
  // its Paralysis token, cancelling the activation it would have skipped. Only a
  // kill — or a hit the army can finish this round (the wake-up is then moot) —
  // is worth it; otherwise leave the sleeper be.
  if (
    !lethal &&
    !armyCanFinish &&
    isParalyzed(defender) &&
    !defender.activatedThisRound
  ) {
    return PARALYSIS_WAKE_POKE_SCORE;
  }

  let quality: number;
  if (lethal) {
    quality = 160 + Math.min(80, threat);
  } else {
    quality = Math.round(damageFraction * 80) + Math.min(40, Math.round(threat / 4));
    if (provokesRetaliation(attacker, defender, attackFromPosition)) {
      const retaliation = expectedAttackDamage(defender, attacker);
      quality -= Math.min(50, retaliation * 4);
      if (damage === 0 && retaliation >= ownRemaining) {
        return SUICIDAL_ATTACK_SCORE;
      }
      // Expected-value trade: refuse ONLY when the counter-hit KILLS our
      // attacker (we lose its whole value), we would be trading DOWN (our unit
      // is worth more than the target), and the value we remove now
      // (damage-fraction × the target's value) is less than half the value we
      // lose. A big chip — or trading a cheaper body UP into a pricier one —
      // still strikes; a high-value Defend wins here instead.
      if (retaliation >= ownRemaining) {
        const removedValue = damageFraction * threat;
        const ownValue = unitThreatValue(attacker);
        if (ownValue > threat && removedValue < ownValue * 0.5) {
          return BAD_TRADE_ATTACK_SCORE;
        }
      }
    }
  }

  // Hunt shooters AND casters in reach: a shooter deals full damage every round
  // from safety, a caster warps the fight from the backline — removing either
  // beats an equal-stat melee body. (Additive: a ranged caster is top priority.)
  if (defender.type === "ranged") {
    quality += RANGED_TARGET_BONUS;
  }
  if (hasThreatAbility(defender)) {
    quality += CASTER_TARGET_BONUS;
  }

  // Focus fire: stack onto a body reachable allies can also hit, and especially
  // one this hit plus those allies can FINISH this round — the army removes a
  // unit instead of spreading chips.
  quality += Math.min(FOCUS_PRESSURE_CAP, reachingAllies.length * 8);
  if (!lethal && armyCanFinish) {
    quality += FOCUS_FINISH_BONUS;
  }
  // Prefer low remaining among equal threats (finish wounded).
  if (remaining <= 2) quality += 10;

  return Math.max(ATTACK_FLOOR, Math.min(ATTACK_CEIL, ATTACK_BASE + quality));
}

function isBacklineCell(combat: CombatState, playerId: string, position: number): boolean {
  if (playerId === combat.attackerPlayerId) {
    return ATTACKER_BACKLINE.includes(position);
  }
  return DEFENDER_BACKLINE.includes(position);
}

function isFrontlineCell(combat: CombatState, playerId: string, position: number): boolean {
  if (playerId === combat.attackerPlayerId) {
    return ATTACKER_FRONTLINE.includes(position);
  }
  return DEFENDER_FRONTLINE.includes(position);
}

function cellColumn(position: number): number {
  return position % 4;
}

type UnitRole = "ranged" | "melee" | "flying";

function unitRole(unit: { type?: string } | null | undefined): UnitRole {
  if (unit?.type === "ranged") return "ranged";
  if (unit?.type === "flying") return "flying";
  return "melee";
}

function livingFriendlies(
  combat: CombatState,
  playerId: string,
): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (unit) =>
      unit.controllerId === playerId && unitRemainingHealth(unit) > 0,
  );
}

/**
 * How well a unit of the given role sits on `position` given already-placed
 * friendlies. Higher is better. Used for placement AND tactics swaps.
 */
export function formationFitScore(
  combat: CombatState,
  playerId: string,
  role: UnitRole,
  position: number,
  /** Unit being scored (excluded from "already placed" column counts). */
  selfId?: string,
  /** Extra bulk for tank preference on the front. */
  bulk?: number,
): number {
  let score = 0;
  const front = isFrontlineCell(combat, playerId, position);
  const back = isBacklineCell(combat, playerId, position);

  if (role === "ranged") {
    score += back ? 30 : front ? -20 : -5;
  } else if (role === "melee") {
    score += front ? 28 : back ? -18 : 5;
    // Durable tanks prefer the front more.
    if (front && (bulk ?? 0) > 0) {
      score += Math.min(12, bulk ?? 0);
    }
  } else {
    // Flying: front preferred, mid ok, pure back mild penalty.
    score += front ? 18 : back ? -8 : 8;
  }

  // Prefer central columns (1,2) for reach / less edge waste.
  const col = cellColumn(position);
  score += col === 1 || col === 2 ? 4 : 0;

  const friends = livingFriendlies(combat, playerId).filter(
    (unit) => unit.id !== selfId,
  );

  // Column diversity: avoid stacking 3+ bodies in one file.
  const sameCol = friends.filter((unit) => cellColumn(unit.position) === col).length;
  if (sameCol >= 2) score -= 10 * (sameCol - 1);

  // Ranged wants a friendly melee adjacent in front (screen).
  if (role === "ranged") {
    const screened = friends.some(
      (unit) =>
        unitRole(unit) === "melee" &&
        isAdjacent(unit.position, position) &&
        isFrontlineCell(combat, playerId, unit.position),
    );
    if (screened) score += 14;
  }

  // Melee wants to sit in front of a friendly ranged (be the screen).
  if (role === "melee" && front) {
    const coversRanged = friends.some(
      (unit) =>
        unitRole(unit) === "ranged" &&
        isAdjacent(unit.position, position),
    );
    if (coversRanged) score += 12;
  }

  return score;
}

/**
 * Placement: multi-unit formation — tanks/frontline melee screen, ranged in
 * back, column diversity, adjacency to complementary allies. Base stays in the
 * PLACE band (above FINISH = 900 foundation when units remain).
 */
function placeScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }>,
): number {
  const combat = observation.state.combat;
  const player = observation.state.players[observation.playerId];
  if (!combat || !player) {
    return 920;
  }
  const armyUnit = player.army.find((unit) => unit.id === action.armyUnitId);
  const existing = Object.values(combat.units).find(
    (unit) => unit.armyUnitId === action.armyUnitId,
  );
  const def = armyUnit ? coreUnitDefinitions[armyUnit.unitDefId] : undefined;
  const side = armyUnit
    ? getUnitSide(armyUnit.unitDefId, armyUnit.side)
    : undefined;
  // Unit TYPE lives on the definition root (Few/Pack sides rarely re-declare it).
  const sideType = existing?.type ?? side?.type ?? def?.type;
  const role = unitRole({ type: sideType });
  const bulk =
    (side?.health ?? existing?.maxHealth ?? 0) +
    (side?.defense ?? existing?.defense ?? 0);

  let score =
    920 +
    formationFitScore(
      combat,
      observation.playerId,
      role,
      action.position,
      existing?.id,
      bulk,
    );

  if (armyUnit) {
    score += Math.min(5, armyUnit.permanentAttackBonus ?? 0);
  }
  // Prefer deploying higher-threat units first (better cells claimed early).
  if (side) {
    score += Math.min(8, Math.round((side.attack * 3 + side.health) / 8));
  }
  return score;
}

/**
 * Tactics swap: only swap when formation quality of the pair improves. Finish
 * when no swap is clearly better so we never thrash.
 */
function swapScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "SWAP_COMBAT_UNITS" }>,
): number {
  const combat = observation.state.combat;
  if (!combat) return 880;
  const a = combat.units[action.unitIdA];
  const b = combat.units[action.unitIdB];
  if (!a || !b) return 850;
  if (a.controllerId !== observation.playerId || b.controllerId !== observation.playerId) {
    return 800;
  }

  const roleA = unitRole(a);
  const roleB = unitRole(b);
  const bulkA = a.maxHealth + a.defense;
  const bulkB = b.maxHealth + b.defense;

  const before =
    formationFitScore(combat, observation.playerId, roleA, a.position, a.id, bulkA) +
    formationFitScore(combat, observation.playerId, roleB, b.position, b.id, bulkB);
  const after =
    formationFitScore(combat, observation.playerId, roleA, b.position, a.id, bulkA) +
    formationFitScore(combat, observation.playerId, roleB, a.position, b.id, bulkB);
  const gain = after - before;
  if (gain <= 0) {
    // No improvement — fall below FINISH_TACTICS (900) so we stop.
    return 870;
  }
  // Improvement: outrank finish so the swap is taken.
  return 905 + Math.min(40, gain);
}

/**
 * Multi-unit movement: close on enemies, screen friendly ranged, keep ranged
 * out of melee when they already have a shot, and cluster toward focus targets.
 */
function moveUnitScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "MOVE_UNIT" }>,
): ComputerActionScore | null {
  const combat = observation.state.combat;
  if (!combat) return null;
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

  const role = unitRole(mover);
  let score: number;

  if (next < current) {
    score = 520 + Math.min(20, current - next);
  } else if (next === current) {
    score = 400;
  } else {
    // Moving away — only for ranged disengaging or screening reposition.
    score = 260;
  }

  // Ranged: strong penalty for walking adjacent to an enemy (melee range).
  if (role === "ranged") {
    const enemies = livingEnemyUnits(combat, observation.playerId);
    const wouldTouch = enemies.some((enemy) =>
      isAdjacent(action.destination, enemy.position),
    );
    const alreadyTouch = enemies.some((enemy) =>
      isAdjacent(mover.position, enemy.position),
    );
    if (wouldTouch && !alreadyTouch) {
      score -= 80;
    }
    // Prefer staying put-ish in backline if already back and not threatened.
    if (
      isBacklineCell(combat, observation.playerId, action.destination) &&
      !wouldTouch
    ) {
      score += 15;
    }
  }

  // Melee tank: reward moves that put us adjacent to a friendly ranged that is
  // threatened (screen), or between enemy and that ranged.
  if (role === "melee" || role === "flying") {
    const friends = livingFriendlies(combat, observation.playerId).filter(
      (unit) => unit.id !== mover.id && unitRole(unit) === "ranged",
    );
    for (const ranged of friends) {
      // Threats near THIS ranged ally. Use board distance per enemy — the old
      // `distanceToNearestEnemy(ranged.position)` took no enemy argument, so its
      // clause was constant across the filter (every enemy in, or none), never
      // the intended "enemies within 2 of this ally". Distance ≤ 2 already
      // subsumes adjacency (adjacent = distance 1).
      const enemiesNearRanged = livingEnemyUnits(combat, observation.playerId).filter(
        (enemy) => getBattlefieldDistance(enemy.position, ranged.position) <= 2,
      );
      if (enemiesNearRanged.length === 0) continue;
      if (isAdjacent(action.destination, ranged.position)) {
        score += 25;
      }
      // Step closer to the threat near the ranged ally. Board distance, not the
      // linear cell-index difference (the board is a 4-wide grid — index diff is
      // not distance and can reward a move that increases real distance).
      for (const threat of enemiesNearRanged) {
        const before = getBattlefieldDistance(mover.position, threat.position);
        const after = getBattlefieldDistance(action.destination, threat.position);
        if (after < before) score += 8;
      }
    }
  }

  // Focus march: converge on the highest VALUE-adjusted target we can threaten
  // (tier / ranged / caster via `targetPriority`, a wounded body a premium),
  // not merely the nearest — so the army collapses onto one worthwhile unit
  // instead of chasing whatever chaff is closest. Value primary, wounds break
  // ties. Stepping toward it is rewarded; stepping away is mildly penalised.
  const enemies = livingEnemyUnits(combat, observation.playerId);
  if (enemies.length > 0) {
    const focus = [...enemies].sort(
      (a, b) =>
        targetPriority(b) - targetPriority(a) ||
        unitRemainingHealth(a) - unitRemainingHealth(b),
    )[0];
    const before = getBattlefieldDistance(mover.position, focus.position);
    const after = getBattlefieldDistance(action.destination, focus.position);
    if (after < before) score += FOCUS_MARCH_BONUS;
    else if (after > before) score -= FOCUS_MARCH_AWAY_PENALTY;
  }

  if (next >= current && score < 400) {
    return { score: Math.min(score, 260), policy: "combat.hold-position" };
  }
  if (next < current) {
    return { score, policy: "combat.close-distance" };
  }
  return { score, policy: "combat.reposition-formation" };
}

/**
 * Score a WOG commander's activation cast (a `USE_UNIT_ABILITY` with the cast's
 * ability and no board target yet — the target picker opens after and is scored
 * by choice-policy's ability-target handler). The cast is FREE (the commander may
 * still ATTACK afterwards) but LOCKS its MOVEMENT for the activation (engine
 * rule): a marginal cast that strands a melee commander from a target it still
 * needs to WALK to should lose to MOVE_AND_ATTACK, while a cast that swings the
 * fight — a real heal, or an attack buff the commander can follow with an in-place
 * strike — is preferred. `commanderCastAvailable` already guarantees a legal
 * target exists, so no cast reaching here is wholly wasted.
 */
function commanderCastScore(
  observation: ComputerObservation,
  combat: CombatState,
  unit: CombatUnitState,
  cast: NonNullable<ReturnType<typeof commanderCastOf>>,
): number {
  const playerId = observation.playerId;
  const enemies = livingEnemyUnits(combat, playerId);
  const hasAdjacentEnemy = enemies.some((enemy) =>
    isAdjacent(unit.position, enemy.position),
  );
  // A melee commander with no adjacent enemy must still WALK to fight; casting
  // now forfeits that walk. A ranged commander, one already engaged, or one with
  // nothing to reach pays no such price.
  const strandsFromTarget =
    enemies.length > 0 && !hasAdjacentEnemy && unit.type !== "ranged";

  let base: number;
  let swing = false;
  switch (cast.effect.kind) {
    case "heal":
    case "heal-cleanse": {
      // Offered only with a damaged friendly present (damagedOnly targeting).
      // Value by the most-wounded ally — a big heal genuinely swings the fight.
      const maxMissing = Object.values(combat.units).reduce(
        (worst, other) =>
          other.controllerId === playerId && unitRemainingHealth(other) > 0
            ? Math.max(worst, other.maxHealth - unitRemainingHealth(other))
            : worst,
        0,
      );
      base = 600 + Math.min(60, maxMissing * 15);
      swing = maxMissing >= 2;
      break;
    }
    case "attack-buff":
    case "precision":
      // A pre-attack buff pays off when the commander can strike THIS activation
      // (buff, then attack in place): with an adjacent enemy it is a clear swing.
      base = hasAdjacentEnemy ? 640 : 560;
      swing = hasAdjacentEnemy;
      break;
    case "initiative-shift":
      // Haste an ally / slow an enemy — a solid tempo buff.
      base = 575;
      break;
    case "fire-shield":
    case "unlimited-retaliation":
      // Defensive buffs — worth casting while the fight continues.
      base = 560;
      break;
    default:
      base = 550;
  }
  // Movement lock: a marginal cast that costs a NEEDED walk loses to a real
  // strike / move-and-attack (620+). A swing cast still fires.
  if (strandsFromTarget && !swing) {
    base -= 130;
  }
  return base;
}

/**
 * Strategic scores for a computer's own combat activation. Returns null for any
 * action it does not specialize (tactics finish, end-activation…), delegating
 * those to the map/foundation layers unchanged.
 */
export function scoreCombatAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  const combat: CombatState | null = observation.state.combat;
  if (!combat) return null;

  switch (action.type) {
    case "PLACE_COMBAT_UNIT":
      return {
        score: placeScore(observation, action),
        policy: "combat.place-formation",
      };
    case "SWAP_COMBAT_UNITS":
      return {
        score: swapScore(observation, action),
        policy: "combat.tactics-swap",
      };
    case "FINISH_TACTICS":
      // Finish once no improving swap remains (swaps score 905+ when useful,
      // 870 when not — finish at 900 wins over no-op swaps).
      return { score: 900, policy: "combat.finish-tactics" };
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
        score: attackScore(
          combat,
          observation.playerId,
          attacker,
          defender,
          attackFrom,
        ),
        policy: "combat.attack-target",
      };
    }
    case "MOVE_UNIT":
      return moveUnitScore(observation, action);
    case "USE_UNIT_ABILITY": {
      // WOG commander activation cast (target picked after, no board target yet):
      // score by whether the cast swings the fight, factoring the movement lock.
      const actor = combat.units[action.unitId];
      const cast = actor ? commanderCastOf(actor) : null;
      if (
        actor &&
        cast &&
        cast.abilityId === action.abilityId &&
        action.target?.type === "none"
      ) {
        return {
          score: commanderCastScore(observation, combat, actor, cast),
          policy: "combat.commander-cast",
        };
      }
      // Prefer spending an activation ability over a plain defend when offered.
      // Targeted abilities that name a high-threat enemy score higher.
      if (action.target?.type === "unit") {
        const target = combat.units[action.target.unitId];
        if (target && target.controllerId !== observation.playerId) {
          return {
            score: 560 + Math.min(40, Math.round(unitThreatValue(target) / 3)),
            policy: "combat.use-ability-enemy",
          };
        }
        if (target && target.controllerId === observation.playerId) {
          const missing = unitRemainingHealth(target) < target.maxHealth;
          return {
            score: missing ? 580 : 545,
            policy: "combat.use-ability-ally",
          };
        }
      }
      return { score: 550, policy: "combat.use-ability" };
    }
    case "SUMMON_DEMONS":
      return { score: 600, policy: "combat.summon-demons" };
    case "USE_GENIE_DECK_DRAW":
      return { score: 590, policy: "combat.genie-wish" };
    case "DEFEND_UNIT": {
      // Prefer defending a wounded unit over a healthy one (still below any
      // real attack). A unit that already moved and cannot strike should sit
      // in Defend rather than END_ACTIVATION when offered.
      const defender = combat.units[action.unitId];
      if (!defender) return { score: 500, policy: "combat.defend" };
      const missing = defender.maxHealth - unitRemainingHealth(defender);
      const score = 500 + Math.min(30, missing * 4);
      // Save the high-value body: when the enemies in reach (adjacent melee +
      // any ranged) can finish this unit and it is worth keeping, Defend
      // outranks a suicidal 0-damage poke (545) — a real strike (620+) still
      // always wins, so this never turns a fighting unit passive.
      const incoming = livingEnemyUnits(combat, observation.playerId).reduce(
        (sum, enemy) =>
          enemy.type === "ranged" || isAdjacent(enemy.position, defender.position)
            ? sum + expectedAttackDamage(enemy, defender)
            : sum,
        0,
      );
      if (
        unitThreatValue(defender) >= 25 &&
        incoming >= unitRemainingHealth(defender)
      ) {
        return { score: score + 50, policy: "combat.defend-high-value" };
      }
      return { score, policy: "combat.defend-wounded" };
    }
    case "ATTACK_FORTIFICATION":
      // Siege the wall when no better unit target is offered (legal set only).
      return { score: 640, policy: "combat.attack-fortification" };
    case "CONTINUE_NEUTRAL_COMBAT": {
      // Keep fighting when the battle is still winnable; when hopeless, fall
      // below RETREAT so the AI spends the continue only when it matters.
      if (combatIsHopeless(observation, combat)) {
        return { score: 200, policy: "combat.continue-hopeless" };
      }
      return { score: 360, policy: "combat.continue" };
    }
    case "RETREAT_FROM_COMBAT":
    case "SURRENDER_COMBAT":
    case "GIVE_UP_COMBAT": {
      // Foundation scores these −900 (last resort). Promote only when the fight
      // is clearly lost so the AI saves movement / remaining army.
      if (combatIsHopeless(observation, combat)) {
        return { score: 380, policy: "combat.retreat-hopeless" };
      }
      return { score: -900, policy: "combat.retreat-refuse" };
    }
    default:
      return null;
  }
}
