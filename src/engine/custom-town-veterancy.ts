import type { ActiveEffectState, CombatUnitState, GameState } from "./state";
import type { CustomTownVeterancyMechanic } from "@/data/units/abilities";
import { getUnitAbilityDefinitions } from "./unit-abilities";
import { isAdjacent } from "./battlefield";
import { queueElementalChoice, breakCoverTargets } from "./elemental-veterancy";
import { veteranHeal, veteranTrigger } from "./faction-veterancy";
import { applyNeutralDebuff } from "./neutral-veterancy";

const alive = (unit: CombatUnitState) => unit.damage < unit.maxHealth;
const has = (unit: CombatUnitState, mechanic: CustomTownVeterancyMechanic) =>
  getUnitAbilityDefinitions(unit).some(a => a.implementationStatus === "implemented" && a.effect?.type === "CUSTOM_TOWN_VETERANCY" && a.effect.mechanic === mechanic);

/** Per-combat, serialized round limits; no global counters or client-only state. */
function spendRound(state: GameState, unit: CombatUnitState, mechanic: CustomTownVeterancyMechanic): boolean {
  if (!state.combat || !alive(unit) || !has(unit, mechanic)) return false;
  const rounds = (unit.customVeterancyRounds ??= {});
  if (rounds[mechanic] === state.combat.round) return false;
  rounds[mechanic] = state.combat.round;
  return true;
}

export function customTownActivation(state: GameState, unit: CombatUnitState, removeEffect: (effect: ActiveEffectState) => void): void {
  if (!alive(unit)) return;
  const units = Object.values(state.combat?.units ?? {});
  if (has(unit, "rescue-step") && units.some(t => alive(t) && t.id !== unit.id && t.controllerId === unit.controllerId && isAdjacent(t.position, unit.position) && units.some(e => alive(e) && e.controllerId !== t.controllerId && isAdjacent(e.position, t.position))) && spendRound(state, unit, "rescue-step")) {
    queueElementalChoice(state, { kind: "move-ally-one", unitId: unit.id, abilityId: "ctv-rescue-step", adjacent: true, engagedOnly: true, optional: true });
  }
  if (units.some(t => alive(t) && t.controllerId !== unit.controllerId && isAdjacent(t.position, unit.position))) return;
  if (has(unit, "clear-mind") && unit.customVeterancyRounds?.["clear-mind"] === undefined) {
    const effect = state.activeEffects.find(e => e.polarity === "negative" && e.removable && e.target?.type === "unit" && e.target.unitId === unit.id);
    if (effect) {
      (unit.customVeterancyRounds ??= {})["clear-mind"] = state.combat!.round;
      removeEffect(effect);
      veteranTrigger(state, unit, "ctv-clear-mind", unit, `${unit.cardName} removes ${effect.name}.`);
    }
  }
  if (!has(unit, "field-repair")) return;
  if (!units.some(t => alive(t) && t.id !== unit.id && t.controllerId === unit.controllerId && t.damage > 0 && isAdjacent(t.position, unit.position))) return;
  if (spendRound(state, unit, "field-repair"))
    queueElementalChoice(state, { kind: "heal", unitId: unit.id, abilityId: "ctv-field-repair", amount: 1, alliesOnly: true, adjacent: true });
}

/** Runs after actual attack damage, for own attacks and retaliation alike. */
export function customTownAfterAttack(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, retaliation: boolean, roll: number, dieCancelled: boolean, kind: "melee" | "ranged", damage: number, removeEffect: (effect: ActiveEffectState) => void): void {
  if (!state.combat || attacker.controllerId === defender.controllerId) return;
  if (dieCancelled) roll = NaN;
  if (alive(defender) && isAdjacent(attacker.position, defender.position) && (roll === -1 || roll === 0) && spendRound(state, defender, "muscle-reversal")) {
    queueElementalChoice(state, { kind: "damage", unitId: defender.id, abilityId: "ctv-muscle-reversal", amount: 1, adjacent: true, enemiesOnly: true, optional: true });
  }
  if (!alive(attacker)) return;
  if (retaliation && (roll === 0 || roll === 1) && spendRound(state, attacker, "returning-edge")) {
    queueElementalChoice(state, { kind: "damage", unitId: attacker.id, abilityId: "ctv-returning-edge", amount: 1, adjacent: true, enemiesOnly: true, excludeTargetId: defender.id, optional: true });
  }
  if (retaliation) return;
  if (alive(defender) && roll === -1 && attacker.maxHealth - attacker.damage >= 2 && has(attacker, "blood-price") && attacker.customVeterancyRounds?.["blood-price"] === undefined) {
    queueElementalChoice(state, { kind: "blood-price", unitId: attacker.id, targetId: defender.id, abilityId: "ctv-blood-price", optional: true });
  }
  if (alive(defender) && damage > 0 && kind === "melee" && (roll === 0 || roll === 1) && has(attacker, "break-cover") && attacker.customVeterancyRounds?.["break-cover"] === undefined) {
    const mountain = getUnitAbilityDefinitions(attacker).some(a => a.id === "ctv-mountain-break");
    if (breakCoverTargets(state, defender, mountain).length) {
      queueElementalChoice(state, { kind: "break-cover", unitId: attacker.id, targetId: defender.id, abilityId: mountain ? "ctv-mountain-break" : "ctv-break-cover", optional: true });
    } else if (mountain && attacker.damage > 0) {
      (attacker.customVeterancyRounds ??= {})["break-cover"] = state.combat.round;
      veteranHeal(state, attacker, 1, "ctv-mountain-break-heal");
    }
  }
  if (damage > 0 && kind === "ranged" && !isAdjacent(attacker.position, defender.position) && spendRound(state, attacker, "covering-extraction")) {
    queueElementalChoice(state, { kind: "move-ally-one", unitId: attacker.id, abilityId: "ctv-covering-extraction", optional: true });
  }
  if (damage > 0 && roll === 0 && alive(defender) && spendRound(state, attacker, "meridian-exchange")) {
    applyNeutralDebuff(state, attacker, defender, "ctv-meridian-exchange", "Meridian Exchange", { type: "NEUTRAL_NEXT_ATTACK_PENALTY", amount: 1 });
    queueElementalChoice(state, { kind: "heal", unitId: attacker.id, abilityId: "ctv-meridian-exchange", amount: 1, alliesOnly: true, adjacent: true });
  }
  if (damage > 0 && alive(defender) && has(attacker, "rule-unravel")) {
    const effect = state.activeEffects.find(e => e.polarity === "positive" && e.removable && e.target?.type === "unit" && e.target.unitId === defender.id);
    if (effect && spendRound(state, attacker, "rule-unravel")) {
      removeEffect(effect);
      veteranTrigger(state, attacker, "ctv-rule-unravel", defender, `${attacker.cardName} removes ${effect.name}.`);
      veteranHeal(state, attacker, 1, "ctv-rule-unravel");
    }
  }
}
