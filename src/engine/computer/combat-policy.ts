import { getUnitSide } from "../adventure";
import {
  ATTACKER_BACKLINE,
  DEFENDER_BACKLINE,
} from "../adventure-reducer";
import { isAdjacent } from "../battlefield";
import type { CombatState, CombatUnitState, GameAction } from "../state";
import type { ComputerActionScore } from "./map-policy";
import {
  attackIsLethal,
  distanceToNearestEnemy,
  expectedAttackDamage,
  livingEnemyUnits,
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

function isBacklineCell(combat: CombatState, playerId: string, position: number): boolean {
  if (playerId === combat.attackerPlayerId) {
    return ATTACKER_BACKLINE.includes(position);
  }
  return DEFENDER_BACKLINE.includes(position);
}

/**
 * Placement: ranged units prefer the backline (like neutral AI); melee/flying
 * prefer the frontline so they can reach enemies sooner. Base stays in the
 * PLACE band (above FINISH = 900 foundation when units remain) via foundation
 * PLACE_COMBAT_UNIT = 920 — we only order WITHIN that stage.
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
  const sideType =
    existing?.type ??
    (armyUnit
      ? getUnitSide(armyUnit.unitDefId, armyUnit.side)?.type
      : undefined);
  const isRanged = sideType === "ranged";

  const back = isBacklineCell(combat, observation.playerId, action.position);
  let score = 920;
  if (isRanged) {
    score += back ? 25 : -15;
  } else {
    // Melee / flying: frontline first so they can reach.
    score += back ? -10 : 20;
  }
  // Prefer more central columns slightly (positions 1,2 / 13,14 style).
  const col = action.position % 4;
  score += col === 1 || col === 2 ? 3 : 0;
  if (armyUnit) {
    score += Math.min(5, armyUnit.permanentAttackBonus ?? 0);
  }
  return score;
}

/**
 * Strategic scores for a computer's own combat activation. Returns null for any
 * action it does not specialize (tactics, defend, end-activation, ability plays,
 * continue/retreat…), delegating those to the map/foundation layers unchanged.
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
    case "USE_UNIT_ABILITY":
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
      return {
        score: 500 + Math.min(30, missing * 4),
        policy: "combat.defend-wounded",
      };
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
