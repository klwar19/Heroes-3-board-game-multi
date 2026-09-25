import type { CombatUnitState, GameState, ActiveEffectModifier } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import { getUnitAbilityDefinitions, isUnitDamageImmune } from "./unit-abilities";
import { effectAppliesToUnit, makeActiveEffect } from "./active-effects";
import { appendEvent } from "./events";
import { unitsAdjacent } from "./hex-footprint";
import { queueElementalChoice } from "./elemental-veterancy";
import type { UnitAbilityEffectDefinition } from "@/data/units/abilities";
import { markUnitRemovedIfNeeded, finishCombatIfNeeded } from "./combat-units";
import { noteUnitDamagedForTokens } from "./tokens";
import { veteranDamage } from "./faction-veterancy";

type Mechanic = Extract<UnitAbilityEffectDefinition, { type: "NEUTRAL_VETERANCY" }>["mechanic"];
const alive = (unit: CombatUnitState): boolean => unit.damage < unit.maxHealth;
export function neutralCombatStart(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.neutralSandstormStarted || combat.outcome) return;
  combat.worldRound = state.round;
  combat.neutralSandstormStarted = true;
  // All living Sandstorms trigger at the same battle-start timing. Assign a
  // whole storm before removing casualties, so early deaths cannot end its AoE.
  const sources = Object.values(combat.units).filter(u => u.damage < u.maxHealth && neutralVeterancy(u, "sandstorm"));
  for (const source of sources) {
    const targets = Object.values(combat.units).filter(t => t.controllerId !== source.controllerId && t.damage < t.maxHealth);
    for (const target of targets) {
      if (isUnitDamageImmune(target)) continue;
      appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: source.id, targetUnitId: target.id, abilityId: "veteran-sandstorm", message: `${source.cardName}'s Sandstorm deals 1 damage to ${target.cardName}.` });
      target.damage += 1;
      appendEvent(state, { type: "DAMAGE_ASSIGNED", source: { type: "unit", unitId: source.id, controllerId: source.controllerId }, target: { type: "unit", unitId: target.id }, amount: 1, damageKind: "effect" });
      noteUnitDamagedForTokens(state, target, 1);
    }
    for (const target of targets) markUnitRemovedIfNeeded(state, target);
  }
  finishCombatIfNeeded(state);
}

export function neutralVeterancy(unit: CombatUnitState, mechanic: Mechanic): boolean {
  return getUnitAbilityDefinitions(unit).some(a => a.implementationStatus === "implemented" && a.effect?.type === "NEUTRAL_VETERANCY" && a.effect.mechanic === mechanic);
}

export function neutralActivation(state: GameState, unit: CombatUnitState): void {
  if (neutralVeterancy(unit, "air-chain-lightning")) queueElementalChoice(state, {
    kind: "chain-lightning", unitId: unit.id, abilityId: "veteran-air-chain-lightning",
  });
  if (neutralVeterancy(unit, "adjacent-pulse")) queueElementalChoice(state, {
    kind: "damage", unitId: unit.id, abilityId: "veteran-adjacent-pulse", amount: 1, adjacent: true,
  });
  // Decision ownership can belong to a human commanding guards. Resource ownership
  // remains neutral, and must be checked independently of the chooser.
  if (neutralVeterancy(unit, "crystal-burst") && unit.controllerId !== NEUTRAL_PLAYER_ID && (state.players[unit.controllerId]?.resources.valuables ?? 0) >= 1) queueElementalChoice(state, {
    kind: "damage", unitId: unit.id, abilityId: "veteran-crystal-burst", amount: 2, valuablesCost: 1, optional: true,
  });
  if (neutralVeterancy(unit, "blind-dust")) queueElementalChoice(state, { kind: "blind-dust", unitId: unit.id, abilityId: "veteran-blind-dust" });
  if (neutralVeterancy(unit, "troll-snare")) queueElementalChoice(state, { kind: "troll-snare", unitId: unit.id, abilityId: "veteran-troll-snare", optional: true });
}

/** Burn is checked before paralysis/morale can skip the activation. */
export function applyNeutralBurnAtActivation(state: GameState, unit: CombatUnitState): boolean {
  const burn = state.activeEffects.find(effect => effectAppliesToUnit(effect, unit) && effect.target?.type === "unit" && effect.target.unitId === unit.id && effect.modifiers.some(modifier => modifier.type === "NEUTRAL_BURN_DAMAGE"));
  const source = burn?.source.type === "unit" ? state.combat?.units[burn.source.unitId] : undefined;
  const amount = burn?.modifiers.find(modifier => modifier.type === "NEUTRAL_BURN_DAMAGE");
  if (!source || source.controllerId === unit.controllerId || !amount || amount.type !== "NEUTRAL_BURN_DAMAGE" || !alive(unit)) return false;
  veteranDamage(state, source, unit, amount.amount, "veteran-lava-burn");
  return !alive(unit);
}

export function applyNeutralDebuff(state: GameState, source: CombatUnitState, target: CombatUnitState, abilityId: string, name: string, modifier: ActiveEffectModifier): void {
  const effect = makeActiveEffect(state, {
    name, scope: "unit", polarity: "negative", removable: true,
    duration: { type: modifier.type === "NEUTRAL_NEXT_ATTACK_PENALTY" ? "combat" : "next-activation" },
    modifiers: [modifier],
  }, { type: "unit", unitId: source.id, controllerId: source.controllerId }, source.controllerId, { type: "unit", unitId: target.id });
  if (modifier.type !== "NEUTRAL_NEXT_ATTACK_PENALTY" && state.combat?.activeUnitId === target.id) effect.activationsRemaining = 2;
  if (!effectAppliesToUnit(effect, target)) return;
  state.activeEffects.push(effect);
  appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: source.id, targetUnitId: target.id, abilityId, message: `${source.cardName} applies ${name} to ${target.cardName}.` });
}

/** Called after the real hit, before retaliations or another attack can start. */
export function neutralAfterAttack(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, retaliation: boolean, roll: number, dieCancelled: boolean, attackKind: "melee" | "ranged"): void {
  state.activeEffects = state.activeEffects.filter(e => !(e.target?.type === "unit" && e.target.unitId === attacker.id && e.modifiers.some(m => m.type === "NEUTRAL_NEXT_ATTACK_PENALTY")));
  if (attacker.controllerId !== defender.controllerId && attacker.damage < attacker.maxHealth) {
    const adjacent = neutralVeterancy(defender, "adjacent-enfeeble") && unitsAdjacent(state.combat, attacker, defender);
    if (adjacent || neutralVeterancy(defender, "unicorn-enfeeble")) applyNeutralDebuff(state, defender, attacker,
      adjacent ? "veteran-adjacent-enfeeble" : "veteran-unicorn-enfeeble", "Next attack: -1 Attack", { type: "NEUTRAL_NEXT_ATTACK_PENALTY", amount: 1 });
  }
  if (!retaliation && !dieCancelled && (roll === -1 || roll === 0) && neutralVeterancy(attacker, "cyber-splash")) queueElementalChoice(state, {
    kind: "damage", unitId: attacker.id, abilityId: "veteran-cyber-splash", amount: 2, adjacent: true,
  });
  if (retaliation && !dieCancelled && (roll === 0 || roll === 1) && neutralVeterancy(attacker, "thunder-retaliation")) appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED", unitId: attacker.id, targetUnitId: defender.id, abilityId: "veteran-thunder-retaliation", message: `${attacker.cardName}'s Thunderbolt Retaliation adds 1 damage.`,
  });
  if (!retaliation && attackKind === "ranged" && alive(defender) && neutralVeterancy(attacker, "arctic-slow-shot")) {
    const already = state.activeEffects.some(effect => effect.target?.type === "unit" && effect.target.unitId === defender.id && effect.name === "Crippling Frost Shot");
    if (!already) {
      const effect = makeActiveEffect(state, { name: "Crippling Frost Shot", scope: "unit", polarity: "negative", removable: true, duration: { type: "combat" }, modifiers: [{ type: "INITIATIVE_BONUS", amount: -2 }, { type: "NEUTRAL_MOVEMENT_BONUS", amount: -1 }] }, { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId }, attacker.controllerId, { type: "unit", unitId: defender.id });
      if (effectAppliesToUnit(effect, defender, true)) {
        state.activeEffects.push(effect);
        appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: attacker.id, targetUnitId: defender.id, abilityId: "veteran-arctic-slow-shot", message: `${defender.cardName} loses 2 Initiative and 1 movement for this Combat.` });
      }
    }
  }
  if (!retaliation && attackKind === "ranged" && alive(defender) && neutralVeterancy(attacker, "lava-burn")) {
    const probe = makeActiveEffect(state, { name: "Searing Shot", scope: "unit", polarity: "negative", removable: true, duration: { type: "combat" }, modifiers: [{ type: "NEUTRAL_BURN_DAMAGE", amount: 1 }] }, { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId }, attacker.controllerId, { type: "unit", unitId: defender.id });
    if (effectAppliesToUnit(probe, defender)) {
      state.activeEffects = state.activeEffects.filter(effect => !(effect.target?.type === "unit" && effect.target.unitId === defender.id && effect.modifiers.some(modifier => modifier.type === "NEUTRAL_BURN_DAMAGE")));
      state.activeEffects.push(probe);
      appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: attacker.id, targetUnitId: defender.id, abilityId: "veteran-lava-burn", message: `${attacker.cardName} leaves ${defender.cardName} burning.` });
    }
  }
}

export function neutralAttackBonus(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, currentDefense = defender.defense): number {
  let bonus = 0;
  for (const ability of getUnitAbilityDefinitions(attacker)) {
    if (ability.effect?.type === "ATTACK_BONUS_VS_DEFENSE_AT_MOST" && currentDefense <= ability.effect.maximum) bonus += ability.effect.amount;
  }
  if (neutralVeterancy(attacker, "werewolf-pack-call")) {
    bonus += Object.values(state.combat?.units ?? {}).filter(unit => unit.damage < unit.maxHealth && unit.unitDefId === "wog.werewolf").length;
  }
  return bonus;
}
