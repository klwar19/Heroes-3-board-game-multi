import type { CombatUnitState, GameState } from "./state";
import { factionVeterancy, getUnitAbilityDefinitions, isUnitDamageImmune } from "./unit-abilities";
import { appendEvent, eventSeedNumber } from "./events";
import { createSeededRandom } from "./random";
import { isAdjacent } from "./battlefield";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { noteUnitDamagedForTokens } from "./tokens";
import { queueElementalChoice } from "./elemental-veterancy";
import { makeActiveEffect, effectAppliesToUnit } from "./active-effects";

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
  if (factionVeterancy(unit, "dread") && [1, 3].includes(combat.round)) {
    const target = veteranRandom(state, Object.values(combat.units).filter(t => alive(t) && t.controllerId !== unit.controllerId), unit.id + "-dread");
    if (!target) return;
    const effect = makeActiveEffect(state, { name: "Dread of the Grave", scope: "unit", duration: { type: "combat" }, polarity: "negative", removable: true, modifiers: [{ type: "DEFENSE_BONUS", amount: -1 }] },
      { type: "unit", unitId: unit.id, controllerId: unit.controllerId }, unit.controllerId, { type: "unit", unitId: target.id });
    if (effectAppliesToUnit(effect, target)) {
      state.activeEffects.push(effect);
      veteranTrigger(state, unit, "veteran-dragon-dread", target, `${target.cardName} loses 1 Defense for this combat.`);
    }
  }
}

export function veteranAfterAttack(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): void {
  if (!state.combat || !alive(attacker)) return;
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
  return Object.values(combat.units).find(t => alive(t) && t.id !== defender.id && t.controllerId === defender.controllerId && isAdjacent(t.position, defender.position) && factionVeterancy(t, "intercept") && t.factionVeterancy?.guardRound !== combat.round);
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
