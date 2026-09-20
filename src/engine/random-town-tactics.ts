import { effectiveInitiative, getActiveAttackBonus, getActiveDefenseBonus, getActiveRetaliationAttackBonus, getAttackerTypeDefenseBonus, getConditionalAttackBonus, getConditionalDefenseBonus, unitHasCannotRetaliateEffect, unitHasUnlimitedRetaliationEffect, unitHasUnstoppableRetaliationEffect } from "./active-effects";
import { getBattlefieldDistance, getOrthogonalNeighbors, isAdjacent } from "./battlefield";
import { commanderLiveAttackBonus, commanderLiveDefenseBonus } from "./commanders";
import { canUnitAttack, canUnitMoveAndAttack, getAttackRollMode, getLegalMoveDestinations, getPathDistances, isUnitAlive } from "./legal-actions";
import { unitRemovalHealth, unitThreatValue } from "./computer/score";
import { tokenAttackBonus, tokenDefenseDelta } from "./tokens";
import { getAttackBonusAfterMove, getAttackBonusOnAttackDie, getDefenseBonusOnAttackDie, getAttackDefenseReductionAbility, getDamageCapPerAttack, getDefendBonus, getFlatDefenseWhenAttacked, getIgnoreTargetCardDefenseAbility, getInnateFlatAttackBonus, getRetaliationAttackBonus, getSelfAttackerTypeDefenseBonus, getUnitAbilityDefinitions, hasUnitAbilityEffect, isUnitDamageImmune, getPreemptiveRetaliation } from "./unit-abilities";
import { townAllowsRangedRetaliation, townAttackBonus, townDefenseBonus, townHasUnstoppableRetaliation, townVeterancy } from "./town-veterancy";
import type { CombatState, CombatUnitState, GameState } from "./state";
import type { NeutralIntent } from "./neutral-ai";

type TokenAbility = NonNullable<ReturnType<typeof getUnitAbilityDefinitions>[number]["effect"]> & { type: "PLACE_TOKEN_ACTION" };
const health = (unit: CombatUnitState) => Math.max(0, unit.maxHealth - unit.damage);
const living = (combat: CombatState) => Object.values(combat.units).filter(isUnitAlive);

/** Ordering estimate only: no actions, dice, events or state mutations. Read
 * effects by their implemented behavior, including shields, pierce and caps.
 * Hidden cards and conditional multi-hit/save chains remain uncertain. */
export function randomTownStrikeValue(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, retaliation = false): number {
  if (isUnitDamageImmune(defender)) return 0;
  const attack = attacker.attack + tokenAttackBonus(attacker) +
    getActiveAttackBonus(state, { attacker, defender, attackKind: attacker.type === "ranged" && !isAdjacent(attacker.position, defender.position) ? "ranged" : "melee" }) + getConditionalAttackBonus(state, attacker, defender) +
    getInnateFlatAttackBonus(attacker, retaliation) + commanderLiveAttackBonus(state, attacker) +
    townAttackBonus(state, attacker, defender, retaliation) + (retaliation ? getRetaliationAttackBonus(attacker) + getActiveRetaliationAttackBonus(state, attacker) : 0) +
    (!retaliation && attacker.movedThisActivation ? getAttackBonusAfterMove(attacker) : 0);
  const pierce = getAttackDefenseReductionAbility(attacker, attacker.movedThisActivation, retaliation)?.amount ?? 0;
  const printed = !retaliation && getIgnoreTargetCardDefenseAbility(attacker) ? 0 : defender.defense;
  const defense = Math.max(0, printed + tokenDefenseDelta(defender) + getActiveDefenseBonus(state, defender) +
    getAttackerTypeDefenseBonus(state, defender, attacker) + getSelfAttackerTypeDefenseBonus(defender, attacker) +
    getConditionalDefenseBonus(state, defender, attacker) + commanderLiveDefenseBonus(state, defender) +
    townDefenseBonus(state, attacker, defender, retaliation) +
    (retaliation ? 0 : getFlatDefenseWhenAttacked(defender)) - pierce) +
    (defender.defenseToken ? 0.5 + getDefendBonus(defender) : 0);
  const cap = getDamageCapPerAttack(defender)?.amount ?? Infinity;
  const mode = getAttackRollMode(attacker, defender, state, retaliation);
  // Analytical distribution, not rolled dice: disadvantage must recognize
  // commander armor and ranged penalties, and zero-base hits can still chip.
  const weights = mode === "advantage" ? [1, 3, 5] : mode === "disadvantage" ? [5, 3, 1] : [3, 3, 3];
  return [-1, 0, 1].reduce((sum, roll, index) => sum + weights[index] / 9 *
    Math.min(cap, Math.max(0, attack + roll + (retaliation ? 0 : getAttackBonusOnAttackDie(attacker, roll)) -
      defense - getDefenseBonusOnAttackDie(defender, roll))), 0);
}

function projectedState(state: GameState, combat: CombatState, unit: CombatUnitState, position: number): GameState {
  return { ...state, combat: { ...combat, units: { ...combat.units,
    [unit.id]: { ...unit, position, movedThisActivation: unit.movedThisActivation || position !== unit.position },
  } } };
}

function attackPositions(state: GameState, combat: CombatState, unit: CombatUnitState, target: CombatUnitState): number[] {
  const positions = canUnitAttack(combat, unit, target, state.activeEffects) ? [unit.position] : [];
  if (unit.type !== "ranged") positions.push(...getLegalMoveDestinations(combat, unit, state)
    .filter(position => canUnitMoveAndAttack(combat, unit, position, target, state)));
  return positions;
}

export function bestDamage(state: GameState, unit: CombatUnitState, target: CombatUnitState): number {
  const combat = state.combat!;
  return Math.max(0, ...attackPositions(state, combat, unit, target).map(position =>
    randomTownStrikeValue(state, { ...unit, position, movedThisActivation: unit.movedThisActivation || position !== unit.position }, target)));
}

export function retaliationValue(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): number {
  if (unitHasCannotRetaliateEffect(state, defender) ||
      (!isAdjacent(attacker.position, defender.position) && !townAllowsRangedRetaliation(defender) && !getPreemptiveRetaliation(defender))) return 0;
  if (defender.retaliatedThisRound && !hasUnitAbilityEffect(defender, "ALLOW_UNLIMITED_RETALIATION") &&
      !unitHasUnlimitedRetaliationEffect(state, defender) && !townHasUnstoppableRetaliation(defender)) return 0;
  if (!townHasUnstoppableRetaliation(defender) && !unitHasUnstoppableRetaliationEffect(state, defender) && (
      (townVeterancy(attacker, "angel-safe") && (state.combat?.round ?? 0) % 2 === 1 && ["ground", "flying"].includes(defender.type)) ||
      hasUnitAbilityEffect(attacker, "IGNORE_RETALIATION") ||
      hasUnitAbilityEffect(attacker, "IGNORE_ADJACENT_RANGED_PENALTY_AND_RETALIATION") ||
      hasUnitAbilityEffect(attacker, "IGNORE_RANGED_PENALTIES_AND_MELEE_RETALIATION") ||
      (attacker.movedThisActivation && hasUnitAbilityEffect(attacker, "IGNORE_RETALIATION_AFTER_MOVE")))) return 0;
  return randomTownStrikeValue(state, defender, attacker, true);
}

/** Current-round replies plus next-round enemies that act before this unit.
 * Tied initiative is conservatively treated as a possible enemy reply. */
function incoming(state: GameState, unit: CombatUnitState, removedId?: string): number {
  return living(state.combat!).filter(enemy => enemy.controllerId !== unit.controllerId && enemy.id !== removedId &&
    !enemy.tokens?.some(token => token.kind === "paralysis") &&
    (!enemy.activatedThisRound || effectiveInitiative(enemy, state.activeEffects, state.combat) >= effectiveInitiative(unit, state.activeEffects, state.combat)))
    .reduce((sum, enemy) => {
      const next = { ...enemy, activatedThisRound: false, attackedThisActivation: false, movedThisActivation: false };
      return sum + bestDamage(state, next, unit);
    }, 0);
}

export function randomTownTokenValue(state: GameState, source: CombatUnitState, target: CombatUnitState, effect: TokenAbility): number {
  const friendly = source.controllerId === target.controllerId;
  if (!isUnitAlive(target) || (effect.targets === "enemy" && friendly) || (effect.targets === "friendly" && !friendly) ||
      (effect.targets !== "enemy" && target.position < 0) ||
      (effect.adjacentOnly && !isAdjacent(source.position, target.position)) ||
      (effect.targetTypes && !effect.targetTypes.includes(target.type))) return 0;
  const existing = target.tokens?.find(token => token.kind === effect.token);
  // Weakness keeps the MILDER token; reapplying cannot strengthen it. Do not
  // spend an activation refreshing a token while other useful actions exist.
  if (existing && (effect.token !== "attack" || existing.amount >= effect.amount)) return 0;
  if ((effect.amount < 0) === friendly) return 0;
  const delta = effect.amount - (existing?.amount ?? 0);
  const changed = { ...target, attack: target.attack + delta };
  const opponents = living(state.combat!).filter(unit => unit.controllerId !== target.controllerId);
  const swing = Math.max(0, ...opponents.map(victim => {
    const before = randomTownStrikeValue(state, target, victim);
    const after = randomTownStrikeValue(state, changed, victim);
    const reachable = bestDamage(state, { ...target, activatedThisRound: false, attackedThisActivation: false, movedThisActivation: false }, victim) > 0;
    return Math.abs(after - before) * (reachable ? 1 : 0.35);
  }));
  const canActThisRound = !target.activatedThisRound && !target.attackedThisActivation && target.id !== source.id &&
    !target.tokens?.some(token => token.kind === "paralysis");
  const turns = (canActThisRound ? 1 : 0) + Math.max(0, (effect.rounds ?? 2) - 1) * 0.7;
  return swing * turns * 15 + (swing > 0 ? Math.min(10, unitThreatValue(target) / 8) : 0);
}

/** Whole-side position value: protect valuable cards but retain real attack
 * exits. A screen that acts later cannot be assumed to vacate in time. */
function positionValue(state: GameState, unit: CombatUnitState): number {
  const combat = state.combat!;
  const friends = living(combat).filter(ally => ally.controllerId === unit.controllerId);
  let score = -incoming(state, unit) * (2 + Math.min(4, unitThreatValue(unit) / 30));
  for (const ally of friends) {
    if (ally.id === unit.id || unitThreatValue(ally) <= unitThreatValue(unit) * 1.25) continue;
    score -= incoming(state, ally) * Math.min(4, unitThreatValue(ally) / 25);
    if (ally.type === "ranged") continue;
    const next = { ...ally, activatedThisRound: false, movedThisActivation: false, attackedThisActivation: false };
    const enemies = living(combat).filter(enemy => enemy.controllerId !== ally.controllerId);
    const canExit = enemies.some(enemy => attackPositions(state, combat, next, enemy).length > 0);
    if (!canExit && isAdjacent(unit.position, ally.position) &&
        effectiveInitiative(unit, state.activeEffects, combat) <= effectiveInitiative(ally, state.activeEffects, combat)) score -= 18;
  }
  return score;
}

export function planRandomTownActivation(state: GameState, combat: CombatState, unit: CombatUnitState): NeutralIntent {
  state = { ...state, combat };
  const enemies = living(combat).filter(enemy => enemy.controllerId !== unit.controllerId);
  if (!enemies.length) return { kind: "pass" };
  const ownValue = unitThreatValue(unit);
  let best: { intent: NeutralIntent; score: number } = { intent: { kind: "pass" }, score: positionValue(state, unit) };
  const consider = (intent: NeutralIntent, score: number) => { if (score > best.score + 0.01) best = { intent, score }; };
  for (const enemy of enemies) {
    for (const position of attackPositions(state, combat, unit, enemy)) {
      const projected = projectedState(state, combat, unit, position);
      const actor = projected.combat!.units[unit.id];
      // One strike only consumes the current face/layer; overkill cannot be
      // credited as damage to a Pack's Few side or another Stack layer.
      const damage = Math.min(health(enemy), randomTownStrikeValue(projected, actor, enemy));
      const removed = damage >= unitRemovalHealth(enemy);
      const retaliation = removed && !getPreemptiveRetaliation(enemy) ? 0 : retaliationValue(projected, actor, enemy);
      const allies = living(projected.combat!).filter(ally => ally.controllerId === unit.controllerId && ally.id !== unit.id && !ally.activatedThisRound);
      const followUp = allies.reduce((sum, ally) => sum + Math.min(health(enemy), bestDamage(projected, ally, enemy)), 0);
      const finish = removed ? 45 + Math.min(35, unitThreatValue(enemy) / 2) :
        damage > 0 && damage + followUp >= unitRemovalHealth(enemy) ? 18 : 0;
      const risk = retaliation + incoming(projected, actor, removed ? enemy.id : undefined);
      const wakes = enemy.tokens?.some(token => token.kind === "paralysis") && damage > 0 && !removed;
      const aftermath = removed ? { ...projected, combat: { ...projected.combat!, units: { ...projected.combat!.units } } } : projected;
      if (removed) delete aftermath.combat!.units[enemy.id];
      const onAttackValue = getUnitAbilityDefinitions(actor).reduce((sum, ability) => {
        const effect = ability.effect;
        return sum + (ability.implementationStatus === "implemented" && effect?.type === "ON_ATTACK_TOKEN" &&
          effect.token === "weakness" && !enemy.tokens?.some(token => token.kind === effect.token)
          ? randomTownTokenValue(projected, actor, enemy, { ...effect, type: "PLACE_TOKEN_ACTION", targets: "enemy" }) : 0);
      }, 0);
      const score = damage * 16 + finish + onAttackValue + (damage > 0 ? Math.min(12, unitThreatValue(enemy) / 8) : -12) -
        retaliation * 10 - (risk >= health(unit) && !removed ? Math.min(45, ownValue) : 0) -
        (wakes && damage + followUp < unitRemovalHealth(enemy) ? 40 : 0) + positionValue(aftermath, actor);
      consider(position === unit.position ? { kind: "attack", defenderId: enemy.id } :
        { kind: "move-and-attack", destination: position, defenderId: enemy.id }, score);
    }
  }
  const distances = enemies.map(enemy => getPathDistances(combat, unit, enemy.position));
  const nextHere = { ...unit, activatedThisRound: false, movedThisActivation: false, attackedThisActivation: false };
  const currentOpportunity = Math.max(0, ...enemies.map(enemy => bestDamage(state, nextHere, enemy)));
  for (const destination of getLegalMoveDestinations(combat, unit, state)) {
    const projected = projectedState(state, combat, unit, destination);
    const actor = projected.combat!.units[unit.id];
    const next = { ...actor, activatedThisRound: false, movedThisActivation: false, attackedThisActivation: false };
    const opportunity = Math.max(0, ...enemies.map(enemy => bestDamage(projected, next, enemy)));
    const beforeDistance = Math.min(...distances.map((field, index) => field.get(unit.position) ?? 100 + getBattlefieldDistance(unit.position, enemies[index].position)));
    const afterDistance = Math.min(...distances.map((field, index) => field.get(destination) ?? 100 + getBattlefieldDistance(destination, enemies[index].position)));
    consider({ kind: "move", destination }, positionValue(projected, actor) + (opportunity - currentOpportunity) * 3 +
      Math.max(-3, Math.min(3, beforeDistance - afterDistance)) * 2 - 3);
  }
  return best.intent;
}

/** Bounded, deterministic whole-formation improvement. Empty cells participate
 * in swaps so a small garrison can leave an exit for a fast ground carry. */
export function placeRandomTownFormation(state: GameState, combat: CombatState, units: CombatUnitState[], front: number[], back: number[]): void {
  const cells = [...front, ...back];
  const ordered = [...units].sort((a, b) => unitThreatValue(b) - unitThreatValue(a) || a.id.localeCompare(b.id));
  const positions = ordered.map((_, index) => cells[index]);
  const score = (layout: number[]) => {
    const placed = ordered.map((unit, index) => ({ ...unit, position: layout[index] }));
    const board = { ...combat, units: { ...combat.units, ...Object.fromEntries(placed.map(unit => [unit.id, unit])) } };
    const initiative = (index: number) => effectiveInitiative(placed[index], state.activeEffects, board);
    let total = 0;
    for (let index = 0; index < ordered.length; index++) {
      const unit = ordered[index];
      const position = layout[index];
      const isBack = back.includes(position);
      const value = unitThreatValue(unit);
      const caster = getUnitAbilityDefinitions(unit).some(ability => ability.implementationStatus === "implemented" &&
        (ability.effect?.type === "PLACE_TOKEN_ACTION" || ability.effect?.type === "ON_ACTIVATION_DAMAGE_SPELL"));
      const support = unit.type === "ranged" || caster;
      total += support ? (isBack ? 30 + value / 5 : -20) : (isBack ? -8 : 12);
      if (!isBack && !support) total += Math.min(12, health(unit) + unit.defense);
      const screenIndex = ordered.findIndex((ally, other) => other !== index && front.includes(layout[other]) &&
        isAdjacent(position, layout[other]) && unitThreatValue(ally) < value);
      if (isBack && screenIndex >= 0) {
        total += Math.min(30, value / 2);
        if (unit.type === "ground" && !support) {
          const ownInitiative = initiative(index);
          const neighbors = getOrthogonalNeighbors(position);
          const exits = neighbors.filter(cell => !layout.includes(cell) || ordered.some((_, other) =>
            layout[other] === cell && initiative(other) > ownInitiative));
          if (exits.length === 0) total -= 60;
          // A slower body directly ahead still costs a movement step even if
          // the carry can get out sideways. Flyers can cross these screens.
          if (initiative(screenIndex) <= ownInitiative) total -= 22;
        }
      }
    }
    return total;
  };
  for (let pass = 0; pass < cells.length; pass++) {
    let best = score(positions);
    let improvement: number[] | undefined;
    for (let index = 0; index < positions.length; index++) for (const cell of cells) {
      if (cell === positions[index]) continue;
      const candidate = [...positions];
      const other = candidate.indexOf(cell);
      if (other >= 0) candidate[other] = candidate[index];
      candidate[index] = cell;
      const value = score(candidate);
      if (value > best + 0.01) { best = value; improvement = candidate; }
    }
    if (!improvement) break;
    positions.splice(0, positions.length, ...improvement);
  }
  ordered.forEach((unit, index) => { unit.position = positions[index]; });
}
