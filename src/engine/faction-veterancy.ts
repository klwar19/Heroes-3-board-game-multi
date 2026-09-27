import type { CombatUnitState, GameState } from "./state";
import { factionVeterancy, getUnitAbilityDefinitions, isUnitDamageImmune } from "./unit-abilities";
import { appendEvent, eventSeedNumber } from "./events";
import { createSeededRandom } from "./random";
import { unitsAdjacent } from "./hex-footprint";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { hasToken, noteUnitDamagedForTokens } from "./tokens";
import { queueElementalChoice } from "./elemental-veterancy";
import { unitImmuneToParalysis } from "./active-effects";

const alive = (u: CombatUnitState) => u.damage < u.maxHealth;

export function veteranTrigger(state: GameState, unit: CombatUnitState, abilityId: string, target = unit, message?: string): void {
  appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: unit.id, targetUnitId: target.id, abilityId, message: message ?? `${unit.cardName} uses ${abilityId}.` });
}

export function veteranHeal(state: GameState, unit: CombatUnitState, amount: number, abilityId: string, source = unit): void {
  if (!alive(unit) || unit.damage <= 0) return;
  const healed = Math.min(amount, unit.damage);
  unit.damage -= healed;
  veteranTrigger(state, source, abilityId, unit, `${unit.cardName} heals ${healed} HP.`);
  appendEvent(state, { type: "DAMAGE_HEALED", source: { type: "unit", unitId: source.id, controllerId: source.controllerId }, target: { type: "unit", unitId: unit.id }, amount: healed });
}

export function veteranRandom<T>(state: GameState, candidates: T[], salt: string): T | undefined {
  if (!candidates.length) return undefined;
  return candidates[createSeededRandom(`${state.seed}#${salt}#${eventSeedNumber(state)}`).nextInt(0, candidates.length - 1)];
}

export function veteranDamage(state: GameState, source: CombatUnitState, target: CombatUnitState, amount: number, abilityId: string, announce = true): void {
  if (!alive(target) || isUnitDamageImmune(target)) return;
  if (announce) veteranTrigger(state, source, abilityId, target);
  target.damage += amount;
  const event = appendEvent(state, { type: "DAMAGE_ASSIGNED", source: { type: "unit", unitId: source.id, controllerId: source.controllerId }, target: { type: "unit", unitId: target.id }, amount, damageKind: "effect" });
  noteUnitDamagedForTokens(state, target, event.amount);
  markUnitRemovedIfNeeded(state, target);
}

export function veteranActivation(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || !alive(unit)) return;
  if (factionVeterancy(unit, "tribute")) {
    queueElementalChoice(state, { kind: "veteran-tribute", unitId: unit.id, abilityId: "veteran-vampire-tribute" });
  }
  // Ghost Dragons' Dread Aura rolls a real combat die, so it resolves in the
  // reducer (resolveDreadAuraActivation) beside the other activation dice.
}

/** Rough "strongest first" order for a Paralysis pick: hitting power, then staying power. */
function dreadThreat(unit: CombatUnitState): number {
  return unit.attack * 2 + unit.defense + (unit.maxHealth - unit.damage) + unit.initiative / 100;
}

/**
 * Ghost Dragons' Dread Aura "-1": the enemy units its controller may Paralyze —
 * living, on the board, not already Paralyzed and not immune to Paralysis —
 * strongest first, so an automatic (computer / Neutral) pick of option 0 takes
 * the most dangerous one.
 */
export function dreadAuraParalyzeCandidates(state: GameState, unit: CombatUnitState): CombatUnitState[] {
  const combat = state.combat;
  if (!combat) return [];
  return Object.values(combat.units)
    .filter(t => alive(t) && t.position >= 0 && t.controllerId !== unit.controllerId && !hasToken(t, "paralysis") && !unitImmuneToParalysis(state, t))
    .sort((a, b) => dreadThreat(b) - dreadThreat(a) || a.id.localeCompare(b.id));
}

/**
 * Ghost Dragons' Withering Touch: the attacked enemy loses 1 maximum Health for
 * the rest of the combat. Stored as combatMaxHealthPenalty so every side
 * recompute (Pack→Few, Few→Pack, Stack layers, covers) re-applies it; a unit
 * already carrying that much damage goes through the normal removal/flip path.
 */
function witheringTouch(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): void {
  if (!alive(defender) || defender.controllerId === attacker.controllerId) return;
  defender.combatMaxHealthPenalty = (defender.combatMaxHealthPenalty ?? 0) + 1;
  defender.maxHealth = Math.max(1, defender.maxHealth - 1);
  veteranTrigger(state, attacker, "veteran-ghost-dragon-withering-touch", defender, `${defender.cardName} loses 1 maximum Health for the rest of this combat.`);
  markUnitRemovedIfNeeded(state, defender);
}

/**
 * After this unit's OWN attack (the caller never passes a Retaliation).
 * `roll` is the settled Attack die face the attack used; `dieCancelled` when
 * the die was cancelled/ignored (no face for any die trigger).
 */
export function veteranAfterAttack(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, roll?: number, dieCancelled = false): void {
  if (!state.combat) return;
  if (!dieCancelled && roll === 0 && factionVeterancy(attacker, "withering-touch")) {
    witheringTouch(state, attacker, defender);
  }
  if (!alive(attacker)) return;
  if (factionVeterancy(attacker, "ally-heal")) {
    veteranHeal(state, attacker, 1, "veteran-lich-mend");
    const ally = veteranRandom(state, Object.values(state.combat.units).filter(t => alive(t) && t.id !== attacker.id && t.controllerId === attacker.controllerId), attacker.id + "-mend");
    if (ally) veteranHeal(state, ally, 1, "veteran-lich-mend", attacker);
  }
  if (factionVeterancy(attacker, "cleave")) {
    queueElementalChoice(state, { kind: "veteran-cleave", unitId: attacker.id, targetId: defender.id, abilityId: "veteran-minotaur-cleave", amount: 1 });
  }
}

/** Apply once, after reductions and before adding the protected unit's damage. */
function veteranGuard(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, amount: number): CombatUnitState | undefined {
  const combat = state.combat;
  if (!combat || amount <= 0 || attacker.controllerId === defender.controllerId) return undefined;
  return Object.values(combat.units).find(t => alive(t) && t.id !== defender.id && t.controllerId === defender.controllerId && unitsAdjacent(combat, t, defender) && factionVeterancy(t, "intercept") && t.factionVeterancy?.guardRound !== combat.round);
}

export function veteranInterceptPreview(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, amount: number): number {
  const guard = veteranGuard(state, attacker, defender, amount);
  if (!guard) return amount;
  const scaled = getUnitAbilityDefinitions(guard).some(ability => ability.id === "ntv-scaled-intercept" && ability.implementationStatus === "implemented");
  return amount - (scaled ? Math.min(2, amount) : Math.ceil(amount / 2));
}

export function veteranIntercept(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, amount: number): number {
  const guard = veteranGuard(state, attacker, defender, amount);
  if (!guard) return amount;
  (guard.factionVeterancy ??= {}).guardRound = state.combat!.round;
  const scaled = getUnitAbilityDefinitions(guard).some(ability => ability.id === "ntv-scaled-intercept" && ability.implementationStatus === "implemented");
  const transferred = scaled ? Math.min(2, amount) : Math.ceil(amount / 2);
  veteranTrigger(state, guard, scaled ? "ntv-scaled-intercept" : "veteran-zombie-intercept", defender, `${guard.cardName} takes ${transferred} damage for ${defender.cardName}.`);
  if (!isUnitDamageImmune(guard)) {
    guard.damage += transferred;
    const event = appendEvent(state, { type: "DAMAGE_ASSIGNED", source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId }, target: { type: "unit", unitId: guard.id }, amount: transferred, damageKind: "effect" });
    noteUnitDamagedForTokens(state, guard, event.amount);
    markUnitRemovedIfNeeded(state, guard);
  }
  return amount - transferred;
}
