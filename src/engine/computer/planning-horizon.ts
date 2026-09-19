import { coreBuildingDefinitions } from "@/data/factions/core";
import { locationDefinitions } from "@/data/map/locations";
import { ATTACK_DIE_FACES, isAdjacent } from "../battlefield";
import { effectiveInitiative } from "../active-effects";
import { getUnitSide, heroMovementMax } from "../adventure";
import { effectiveTownBuildingCost } from "../house-rules";
import { getRuleset, unitSideRuleOverrides } from "../ruleset";
import { applyUnitCurrentSide } from "../unit-transforms";
import {
  getOnRemovalDetonation,
  getPreemptiveRetaliation,
  getReapOnAdjacentRemoval,
  getSelfRebirthAbility,
  getSelfRebirthRollAbility,
  isUnitDamageImmune,
} from "../unit-abilities";
import {
  canUnitAttack,
  canUnitMoveAndAttack,
  getLegalMoveDestinations,
  getActivationStep,
} from "../legal-actions";
import { hexDistance, parseHexSpaceId } from "../hex";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  PlayerId,
  ResourceKind,
} from "../state";
import { playersAreAllied } from "./control";
import {
  isParalyzed,
  unitRemovalHealth,
  unitRemainingHealth,
  unitThreatValue,
} from "./score";
import { estimatedStrikeDamage } from "./strike-value";

/** Public, bounded planning horizons. Keeping these small makes live turns fast. */
export const STRATEGIC_HORIZON_ROUNDS = 4;
export const COMBAT_HORIZON_PLIES = 3;

type ObjectiveLike = {
  spaceId: MapSpaceId;
  kind: "victory" | "enemy-hero" | "guard" | "town" | "flaggable" | "visitable" | "explore";
};

const RESOURCE_VALUE: Record<ResourceKind, number> = {
  gold: 1,
  buildingMaterials: 3,
  valuables: 5,
};

function resourceRoundsInWindow(round: number, delayRounds: number): number {
  let count = 0;
  for (let offset = Math.max(1, delayRounds + 1); offset <= STRATEGIC_HORIZON_ROUNDS; offset += 1) {
    const futureRound = round + offset;
    if (futureRound > 1 && futureRound % 2 === 1) count += 1;
  }
  return count;
}

function travelRounds(state: GameState, hero: HeroState, distance: number): number {
  // Current movement and this hero's implemented movement bonuses determine
  // the horizon; do not give every specialty the same three-MP estimate.
  const beyondThisTurn = Math.max(0, distance - Math.max(0, hero.movementPoints));
  return beyondThisTurn === 0 ? 0 : Math.ceil(beyondThisTurn / Math.max(1, heroMovementMax(state, hero)));
}

function fieldRecurringIncome(field: MapFieldState): Partial<Record<ResourceKind, number>> {
  if (field.location === "mine" && field.resource) {
    return { [field.resource]: Math.max(0, field.amount ?? 0) };
  }
  if (field.location === "settlement") {
    // A new settlement chooses its token after capture. The exact choice is
    // not known yet, so use the conservative material-equivalent level rather
    // than peeking at or inventing a future choice.
    return { buildingMaterials: 2 };
  }
  return {};
}

function weightedIncome(income: Partial<Record<ResourceKind, number>>): number {
  return (Object.keys(RESOURCE_VALUE) as ResourceKind[]).reduce(
    (sum, resource) => sum + (income[resource] ?? 0) * RESOURCE_VALUE[resource],
    0,
  );
}

function straightDistance(a: MapSpaceId | null, b: MapSpaceId): number | null {
  if (!a) return null;
  const from = parseHexSpaceId(a);
  const to = parseHexSpaceId(b);
  return from && to ? hexDistance(from, to) : null;
}

function nearestEnemyEta(state: GameState, playerId: PlayerId, spaceId: MapSpaceId): number | null {
  let nearest = Number.POSITIVE_INFINITY;
  for (const enemy of Object.values(state.heroes)) {
    if (!enemy.spaceId || enemy.controllerId === playerId || enemy.controllerId === "neutrals" ||
        playersAreAllied(state, playerId, enemy.controllerId) || state.players[enemy.controllerId]?.eliminated) continue;
    const distance = straightDistance(enemy.spaceId, spaceId);
    if (distance !== null) nearest = Math.min(nearest, travelRounds(state, enemy, distance));
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/**
 * Four-round value of a map objective. This augments, rather than replaces,
 * rule-specific objective priorities: recurring income is priced by how many
 * Resource rounds remain after travel, enemy races create urgency/regret, and
 * clusters preserve a useful follow-up instead of choosing an isolated prize.
 * Every input is visible on the acting seat's redacted map.
 */
export function objectiveHorizonAdjustment(
  state: GameState,
  hero: HeroState,
  objective: ObjectiveLike,
  distance: number,
): number {
  const field = state.adventure?.fields[objective.spaceId];
  if (!field) return 0;
  const delay = travelRounds(state, hero, distance);
  const payouts = resourceRoundsInWindow(state.round ?? 0, delay);
  const income = weightedIncome(fieldRecurringIncome(field));
  let adjustment = Math.min(72, income * payouts * 2);

  // Capturing an enemy income source is a two-sided swing over the horizon.
  if (income > 0 && field.flagOwnerId && field.flagOwnerId !== hero.controllerId &&
      !playersAreAllied(state, hero.controllerId, field.flagOwnerId)) {
    adjustment += Math.min(28, income * Math.max(1, payouts));
  }

  const ownEta = delay;
  const enemyEta = nearestEnemyEta(state, hero.controllerId, objective.spaceId);
  if (enemyEta !== null) {
    if (ownEta < enemyEta) adjustment += 18; // take the tempo window now
    else if (enemyEta < ownEta && objective.kind !== "victory") adjustment -= 22;
  }

  // Option value: after this target, prefer a region with several distinct
  // visible jobs. This is intentionally small; it breaks close route choices
  // without overriding a victory target or a safety gate.
  const target = parseHexSpaceId(objective.spaceId);
  if (target) {
    let followUps = 0;
    for (const other of Object.values(state.adventure?.fields ?? {})) {
      if (other.spaceId === objective.spaceId || other.blackCube) continue;
      const cell = parseHexSpaceId(other.spaceId);
      if (!cell || hexDistance(target, cell) > 2) continue;
      const category = locationDefinitions[other.location]?.category;
      if (category === "blocked" || category === "empty") continue;
      if (other.flagOwnerId === hero.controllerId) continue;
      followUps += 1;
    }
    adjustment += Math.min(18, followUps * 3);
  }

  // Exploration is an uncertain strategy. Reward it when the current visible
  // board has little productive diversity, but never pretend to know what is
  // under a face-down tile.
  if (objective.kind === "explore") {
    const knownJobs = Object.values(state.adventure?.fields ?? {}).filter((candidate) =>
      !candidate.blackCube && candidate.flagOwnerId !== hero.controllerId &&
      locationDefinitions[candidate.location]?.category !== "empty" &&
      locationDefinitions[candidate.location]?.category !== "blocked").length;
    adjustment += knownJobs <= 3 ? 26 : knownJobs >= 9 ? -12 : 6;
  }

  return Math.max(-40, Math.min(90, adjustment));
}

function recurringBuildingReturn(buildingId: string): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
  if (!effect) return 0;
  if (effect.type === "RESOURCE_ROUND_CHOICE") {
    return Math.max(0, ...effect.options.map((option) =>
      (option.gold ?? 0) * RESOURCE_VALUE.gold +
      (option.buildingMaterials ?? 0) * RESOURCE_VALUE.buildingMaterials +
      (option.valuables ?? 0) * RESOURCE_VALUE.valuables));
  }
  // Expected public value of recurring non-City-Hall engines. These are not
  // treated as exact resources: the conservative equivalents only compare
  // their four-round compounding against one-off side buildings.
  switch (effect.type) {
    case "RESOURCE_ROUND_RESOURCE_DIE": return 3;
    case "RESOURCE_ROUND_MORALE": return 1.5;
    case "RESOURCE_ROUND_SEARCH_DISCARD": return 2;
    case "FREELANCERS_GUILD": return Math.max(1, effect.winGold);
    default: return 0;
  }
}

/** Four-round payback/opportunity-cost nudge for real economy actions. */
export function economyHorizonBias(
  state: GameState,
  playerId: PlayerId,
  action: GameAction,
): number {
  if (action.type !== "BUILD_STRUCTURE") return 0;
  const definition = coreBuildingDefinitions[action.buildingId];
  if (!definition) return 0;
  const payouts = resourceRoundsInWindow(state.round ?? 0, 0);
  const income = recurringBuildingReturn(action.buildingId) * payouts;
  const cost = weightedIncome(effectiveTownBuildingCost(state, definition));
  if (income > 0) {
    // Prefer a building whose visible four-round return repays much of its
    // weighted cost, but do not let payback override the saved dwelling/body.
    return Math.max(4, Math.min(28, Math.round(income - cost * 0.35)));
  }
  // A non-income side building paid for from resources below one future
  // production tick carries a small liquidity penalty. Existing specialty and
  // safety rules can still lift it when it is tactically necessary.
  const player = state.players[playerId];
  if (!player) return 0;
  const buffer = weightedIncome(player.production);
  const after = weightedIncome(player.resources) - cost;
  return after < buffer ? -10 : 0;
}

type Reply = {
  utility: number;
  damage: number;
  attackerId: string;
  defenderId?: string;
  from: number;
};

/** Shared by the shortlist, never by successive live decisions. */
export type CombatPlanningBudget = { remaining: number };
export const COMBAT_PLANNING_WORK_LIMIT = 384;
export const COMBAT_PLANNING_CANDIDATES = 4;

function strikeUtility(defender: CombatUnitState, damage: number): number {
  const remaining = unitRemovalHealth(defender);
  // A Stack Token is not infinite health, but its removal cannot be promised.
  const durability = Number.isFinite(remaining) ? remaining : unitRemainingHealth(defender) + defender.maxHealth;
  return unitThreatValue(defender) * Math.min(1, damage / Math.max(1, durability)) +
    (damage > 0 && damage >= remaining ? unitThreatValue(defender) * 0.7 : 0);
}

function strikeOutcomes(attacker: CombatUnitState, defender: CombatUnitState, from: number): number[] {
  // Apply the face BEFORE defense and damage caps. Adding +/-1 to already
  // clamped damage invents hits against armor and damage above an ability cap.
  return ATTACK_DIE_FACES.map(face => isUnitDamageImmune(defender) ? 0 :
    estimatedStrikeDamage(attacker, defender, from, false, face));
}

/** Only the next initiative slot may reply, including same-side continuations. */
function nextReply(state: GameState, combat: CombatState, budget: CombatPlanningBudget): Reply | null {
  const step = getActivationStep(combat, state.activeEffects ?? []);
  if (!step) return null;
  let best: Reply | null = null;
  for (const candidate of step.candidates) {
    if (--budget.remaining < 0) return null;
    // An upcoming activation is fresh; this unit's old move/attack flags must
    // not stop it reaching a destination in the forecast.
    const attacker = { ...candidate, movedThisActivation: false, attackedThisActivation: false };
    const board = { ...combat, activeUnitId: attacker.id, units: { ...combat.units, [attacker.id]: attacker } };
    const view = { ...state, combat: board };
    const idle: Reply = { utility: 0, damage: 0, attackerId: attacker.id, from: attacker.position };
    if (!best) best = idle;
    if (isParalyzed(attacker)) continue;
    const destinations = attacker.type === "ranged" ? [] : getLegalMoveDestinations(board, attacker, view);
    for (const defender of Object.values(board.units)) {
      if (defender.controllerId === attacker.controllerId || defender.position < 0 || unitRemainingHealth(defender) <= 0) continue;
      for (const from of [attacker.position, ...destinations]) {
        if (attacker.type !== "ranged" && !attacker.bombardment && !isAdjacent(from, defender.position)) continue;
        if (--budget.remaining < 0) return null;
        const legal = from === attacker.position
          ? canUnitAttack(board, attacker, defender, state.activeEffects ?? [])
          : canUnitMoveAndAttack(board, attacker, from, defender, view);
        if (!legal) continue;
        const outcomes = strikeOutcomes(attacker, defender, from);
        const utility = outcomes.reduce((sum, damage) => sum + strikeUtility(defender, damage), 0) / outcomes.length;
        if (utility > (best?.utility ?? 0)) {
          // Follow-up plies use the median face; only the chosen first action
          // branches. This keeps the live work fixed rather than exponential.
          best = { utility, damage: outcomes[Math.floor(outcomes.length / 2)], attackerId: attacker.id, defenderId: defender.id, from };
        }
      }
    }
  }
  return best;
}

/** Approximate ordinary damage on detached unit copies, never the live state.
 * Special death/flip triggers fall back to the established policy instead of
 * inventing a continuation with a dead unit or stale Pack statistics. */
function projectDamage(state: GameState, combat: CombatState, id: string, damage: number): CombatState | null {
  const original = combat.units[id];
  if (!original || damage <= 0 || isUnitDamageImmune(original)) return combat;
  const unit = structuredClone(original);
  unit.damage += damage;
  unit.tokens = unit.tokens?.filter(token => token.kind !== "paralysis");
  const units = { ...combat.units, [id]: unit };
  if (unit.damage >= unit.maxHealth) {
    if (unit.maxHealth <= 0 || (unit.armyStacks ?? 0) > 8 || unit.stackToken || unit.bossUnit || unit.unitRank || unit.cloneOfUnitId || unit.transforms?.length ||
        unit.townVeterancy || unit.factionVeterancy || unit.elementalVeterancy ||
        getSelfRebirthAbility(unit) || getSelfRebirthRollAbility(unit) || getOnRemovalDetonation(unit) ||
        Object.values(combat.units).some(other => other.cloneOfUnitId === id ||
          isAdjacent(other.position, unit.position) && getReapOnAdjacentRemoval(other)) ||
        (state.activeEffects ?? []).some(effect => effect.target?.type === "unit" && effect.target.unitId === id)) return null;
    while ((unit.armyStacks ?? 0) > 0 && unit.damage >= unit.maxHealth) {
      unit.damage -= unit.maxHealth;
      unit.armyStacks = (unit.armyStacks ?? 0) - 1;
      applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
      if (unit.maxHealth <= 0) return null;
    }
    if (unit.damage >= unit.maxHealth && unit.variant === "pack" && unit.unitDefId && getUnitSide(unit.unitDefId, "few")) {
      unit.damage -= unit.maxHealth;
      unit.variant = "few";
      unit.flippedDownThisCombat = true;
      delete unit.armyStacks;
      applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
    }
    // Keep removed entries, just as the engine does: their earlier activation
    // still counts when alternating sides tied at the same initiative.
    unit.damage = Math.min(unit.damage, unit.maxHealth);
  }
  return { ...combat, units };
}

function projectReply(state: GameState, combat: CombatState, reply: Reply): CombatState | null {
  const attacker = combat.units[reply.attackerId];
  if (!attacker) return combat;
  const moved = {
    ...attacker, position: reply.from, activatedThisRound: true, waitPending: false,
    activationInitiative: effectiveInitiative(attacker, state.activeEffects ?? [], combat),
  };
  let board: CombatState | null = { ...combat, activeUnitId: null, units: { ...combat.units, [attacker.id]: moved } };
  const defender = reply.defenderId ? combat.units[reply.defenderId] : undefined;
  if (!defender) return board;
  // Preemptive retaliation changes the order of damage. Let the existing
  // specialty-aware policy judge it rather than applying the ordinary order.
  if (getPreemptiveRetaliation(defender)) return null;
  board = projectDamage(state, board, defender.id, reply.damage);
  const survivor = board?.units[defender.id];
  if (!board || !survivor || unitRemainingHealth(survivor) <= 0 || survivor.retaliatedThisRound || isParalyzed(survivor) ||
      attacker.abilities?.includes("ignores-retaliation") || !isAdjacent(reply.from, survivor.position)) return board;
  board = { ...board, units: { ...board.units, [survivor.id]: { ...survivor, retaliatedThisRound: true } } };
  return projectDamage(state, board, attacker.id, estimatedStrikeDamage(survivor, moved, survivor.position, true));
}

function sideStrength(combat: CombatState, side: PlayerId): number {
  return Object.values(combat.units).filter(unit => unit.controllerId === side && unitRemainingHealth(unit) > 0)
    .reduce((sum, unit) => sum + unitThreatValue(unit), 0);
}

/** Bounded public-board forecast, not an engine rollout. Evaluate each distinct
 * first-strike damage outcome separately, then two actual initiative slots.
 * Cards, special triggers and future rolls remain uncertain; the next live
 * decision always starts over from the resolved, redacted state. */
export function combatHorizonAdjustment(
  state: GameState,
  action: GameAction,
  budget: CombatPlanningBudget = { remaining: COMBAT_PLANNING_WORK_LIMIT },
): number {
  const combat = state.combat;
  if (!combat || Object.keys(combat.units).length > 24 ||
      (action.type !== "ATTACK_UNIT" && action.type !== "MOVE_AND_ATTACK_UNIT")) return 0;
  const attacker = combat.units[action.attackerId];
  const defender = combat.units[action.defenderId];
  if (!attacker || !defender) return 0;
  const from = action.type === "MOVE_AND_ATTACK_UNIT" ? action.destination : attacker.position;
  const outcomes = strikeOutcomes(attacker, defender, from);
  const values = new Map<number, number>();
  const baseline = sideStrength(combat, attacker.controllerId) - sideStrength(combat, defender.controllerId);
  for (const damage of new Set(outcomes)) {
    let board = projectReply(state, combat, { utility: 0, damage, attackerId: attacker.id, defenderId: defender.id, from });
    if (!board) return 0;
    for (let ply = 1; ply < COMBAT_HORIZON_PLIES; ply += 1) {
      const reply = nextReply(state, board, budget);
      if (budget.remaining < 0) return 0;
      if (!reply) break;
      board = projectReply(state, board, reply);
      if (!board) return 0;
    }
    values.set(damage, sideStrength(board, attacker.controllerId) - sideStrength(board, defender.controllerId) - baseline);
  }
  const branches = outcomes.map(damage => values.get(damage)!);
  const mean = branches.reduce((sum, value) => sum + value, 0) / branches.length;
  const riskWeight = baseline >= 0 ? 0.35 : 0.15;
  const value = mean - (mean - Math.min(...branches)) * riskWeight;
  return Math.max(-24, Math.min(24, Math.round(value * 0.6)));
}
