import type { NeutralTownVeterancyMechanic } from "@/data/units/abilities";
import type { ActiveEffectState, CombatUnitState, DamageKind, GameState, SourceRef } from "./state";
import { getUnitAbilityDefinitions } from "./unit-abilities";
import { getBattlefieldDistance, isAdjacent } from "./battlefield";
import { effectAppliesToUnit, makeActiveEffect, unitImmuneToParalysis } from "./active-effects";
import { queueElementalChoice } from "./elemental-veterancy";
import { veteranDamage, veteranHeal, veteranRandom, veteranTrigger } from "./faction-veterancy";
import { placeCombatToken } from "./tokens";
import { applyNeutralDebuff } from "./neutral-veterancy";

const alive = (unit: CombatUnitState) => unit.damage < unit.maxHealth;
type Memory = Record<string, unknown>;
const memory = (unit: CombatUnitState): Memory => (unit.townVeterancy ??= {}) as Memory;
const usedThisRound = (unit: CombatUnitState, key: string, round: number) => memory(unit)[key] === round;
const markRound = (unit: CombatUnitState, key: string, round: number) => { memory(unit)[key] = round; };

export function neutralTownVeterancy(unit: CombatUnitState, mechanic: NeutralTownVeterancyMechanic): boolean {
  return getUnitAbilityDefinitions(unit).some(a => a.implementationStatus === "implemented" && a.effect?.type === "NEUTRAL_TOWN_VETERANCY" && a.effect.mechanic === mechanic);
}

export function neutralTownDeepRooted(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(state?.combat && Object.values(state.combat.units).some(source => alive(source) && source.controllerId !== unit.controllerId && neutralTownVeterancy(source, "deep-roots") && isAdjacent(source.position, unit.position)));
}

export function neutralTownAttackBonus(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, currentDefense = defender.defense): number {
  const allies = Object.values(state.combat?.units ?? {});
  return Number(neutralTownVeterancy(attacker, "righteous-pursuit") && defender.damage > 0)
    + Number(neutralTownVeterancy(attacker, "first-volley") && !defender.activatedThisRound && state.combat?.activeUnitId !== defender.id)
    + Number(neutralTownVeterancy(attacker, "pack-rush") && allies.some(u => alive(u) && u.id !== attacker.id && u.controllerId === attacker.controllerId && isAdjacent(u.position, defender.position)))
    + Number(neutralTownVeterancy(attacker, "armoured-prey") && currentDefense >= 2)
    + Number(neutralTownVeterancy(attacker, "blind-instinct") && state.activeEffects.some(e => e.polarity === "negative" && effectAppliesToUnit(e, attacker, true)))
    + Number(neutralTownVeterancy(attacker, "ally-blind-instinct") && allies.some(u => alive(u) && u.controllerId === attacker.controllerId && state.activeEffects.some(e => e.polarity === "negative" && effectAppliesToUnit(e, u, true))))
    + Number(neutralTownVeterancy(attacker, "victory-command") && memory(attacker).victoryAttackReady === true)
    + Number(neutralTownVeterancy(attacker, "predators-mark") && memory(attacker).predatorTarget === defender.id)
    + Number(memory(attacker).measuredRound === state.combat?.round)
    + Number((memory(attacker).tormentUntilRound as number | undefined) !== undefined)
    + Number(memory(attacker).wishAttack === true);
}

export function neutralTownDefenseBonus(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, currentDefense = defender.defense): number {
  const allies = Object.values(state.combat?.units ?? {});
  let bonus = Number(neutralTownVeterancy(defender, "bone-wall") && allies.some(u => alive(u) && u.id !== defender.id && u.controllerId === defender.controllerId && isAdjacent(u.position, defender.position)))
    + Number(neutralTownVeterancy(defender, "boarding-formation") && allies.some(u => alive(u) && u.id !== defender.id && u.controllerId === defender.controllerId && u.type === "ranged" && isAdjacent(u.position, defender.position)))
    + Number((memory(defender).stoneUntilActivation as boolean | undefined) === true);
  bonus += Number(memory(defender).wishDefense === true);
  bonus += Number(neutralTownVeterancy(defender, "set-the-spear") && attacker.movedThisActivation && isAdjacent(attacker.position, defender.position));
  if (neutralTownVeterancy(attacker, "full-gallop") && memory(attacker).movedTwo) bonus -= 1;
  if (neutralTownVeterancy(attacker, "raking-dive") && memory(attacker).movedTwo) bonus -= 1;
  if (neutralTownVeterancy(attacker, "crushing-claws") && currentDefense >= 2) bonus -= 1;
  if (memory(defender).volleyMarkedRound === state.combat?.round && !memory(defender).volleyConsumed) bonus -= 1;
  return bonus;
}

export function neutralTownAttackDamagePreview(state: GameState, defender: CombatUnitState, damage: number): number {
  if (damage >= 2 && neutralTownVeterancy(defender, "hellish-endurance") && !usedThisRound(defender, "enduranceRound", state.combat!.round)) return damage - 1;
  return damage;
}

export function neutralTownCommitAttackReduction(state: GameState, defender: CombatUnitState): void {
  if (neutralTownVeterancy(defender, "hellish-endurance") && state.combat) {
    markRound(defender, "enduranceRound", state.combat.round);
    veteranTrigger(state, defender, "ntv-hellish-endurance", defender, `${defender.cardName} reduces attack damage by 1.`);
  }
}

export function neutralTownMovement(state: GameState, unit: CombatUnitState, from: number, to: number): void {
  const combat = state.combat;
  if (!combat || from === to) return;
  const mem = memory(unit);
  mem.activationOrigin ??= from;
  const distance = getBattlefieldDistance(from, to);
  if (distance >= 2) mem.movedTwo = true;
  if (neutralTownVeterancy(unit, "stone-landing") && distance >= 2) { mem.stoneUntilActivation = true; veteranTrigger(state, unit, "ntv-stone-landing"); }
  if ((neutralTownVeterancy(unit, "full-gallop") || neutralTownVeterancy(unit, "raking-dive")) && distance >= 2) mem.movedTwo = true;
  if (neutralTownVeterancy(unit, "searing-passage")) {
    const nearBefore = Object.values(combat.units).some(e => alive(e) && e.controllerId !== unit.controllerId && isAdjacent(from, e.position));
    if (nearBefore) mem.searingReady = true;
  }
  if (neutralTownVeterancy(unit, "disorienting-landing") && distance >= 2)
    queueElementalChoice(state, { kind: "debuff-attack", unitId: unit.id, abilityId: "ntv-disorienting-landing", amount: 1, adjacent: true, enemiesOnly: true });
}

function clearActivationBonuses(unit: CombatUnitState): void {
  const mem = memory(unit);
  if (typeof mem.wishInitiativeBonus === "number") unit.initiative -= mem.wishInitiativeBonus as number;
  delete mem.wishInitiativeBonus;
  delete mem.wishAttack;
  delete mem.wishDefense;
  delete mem.stoneUntilActivation; delete mem.movedTwo; delete mem.activationOrigin; delete mem.searingReady; delete mem.activationProc; delete mem.dreadChargeSpentActivation;
}

export function neutralTownActivation(state: GameState, unit: CombatUnitState): void {
  const mem = memory(unit);
  if (neutralTownVeterancy(unit, "unstable-wish")) {
    const roll = veteranRandom(state, [-1, 0, 1], `${unit.id}-wish-${state.combat?.round}`) ?? 0;
    mem.wishAttack = roll === 1; mem.wishDefense = roll === -1; mem.wishInitiativeBonus = roll === 0 ? 1 : 0;
    if (roll === 0) unit.initiative += 1;
    veteranTrigger(state, unit, "ntv-unstable-wish", unit, `${unit.cardName}'s Unstable Wish rolls ${roll > 0 ? "+1" : roll}.`);
  }
}

/** Delayed venom is damage at activation start, even if paralysis skips the action. */
export function neutralTownDelayedDamageAtActivation(state: GameState, unit: CombatUnitState): boolean {
  clearActivationBonuses(unit);
  delete memory(unit).positiveEffectsBlockedDuringActivation;
  delete memory(unit).tormentDuringActivation;
  const delayed = memory(unit).delayedDamage as { sourceId: string; round: number } | { sourceId: string; round: number }[] | undefined;
  delete memory(unit).delayedDamage;
  for (const entry of delayed ? (Array.isArray(delayed) ? delayed : [delayed]) : []) {
    if (!alive(unit)) break;
    const source = state.combat?.units[entry.sourceId] ?? unit;
    veteranDamage(state, source, unit, 1, neutralTownVeterancy(source, "toxic-counter") ? "ntv-toxic-counter" : "ntv-potent-venom");
  }
  return !alive(unit);
}

function queueVenom(target: CombatUnitState, sourceId: string, round: number): void {
  const previous = memory(target).delayedDamage;
  memory(target).delayedDamage = [...(Array.isArray(previous) ? previous : previous ? [previous] : []), { sourceId, round }];
}

function debuff(state: GameState, source: CombatUnitState, target: CombatUnitState, abilityId: string, stat: "attack" | "initiative", amount: number): void {
  const effect = makeActiveEffect(state, { name: abilityId, scope: "unit", duration: { type: "next-activation" }, polarity: "negative", removable: true, modifiers: [{ type: stat === "attack" ? "ATTACK_BONUS" : "INITIATIVE_BONUS", amount: -amount }] },
    { type: "unit", unitId: source.id, controllerId: source.controllerId }, source.controllerId, { type: "unit", unitId: target.id });
  if (state.combat?.activeUnitId === target.id) effect.activationsRemaining = 2;
  if (effectAppliesToUnit(effect, target, true)) { state.activeEffects.push(effect); veteranTrigger(state, source, abilityId, target); }
}

export function neutralTownAfterAttack(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, retaliation: boolean, roll: number, dieCancelled: boolean, kind: "melee" | "ranged", damage: number, removeEffect: (effect: ActiveEffectState) => void): void {
  const combat = state.combat; if (!combat) return;
  // A cancelled/ignored die supplies no face for any rank trigger.
  if (dieCancelled) roll = NaN;
  const mem = memory(attacker); const round = combat.round; const nonAdjacent = !isAdjacent(attacker.position, defender.position);
  // Moving charges only the next attack; another move may re-arm it.
  delete mem.movedTwo;
  if (memory(defender).volleyMarkedRound === round && !memory(defender).volleyConsumed) memory(defender).volleyConsumed = true;
  if (damage > 0 && neutralTownVeterancy(attacker, "predators-mark") && !mem.predatorTarget) { mem.predatorTarget = defender.id; veteranTrigger(state, attacker, "ntv-predators-mark", defender); }
  if (damage > 0 && neutralTownVeterancy(attacker, "marked-volley") && kind === "ranged" && nonAdjacent && !usedThisRound(attacker, "volleyRound", round)) { markRound(attacker, "volleyRound", round); memory(defender).volleyMarkedRound = round; memory(defender).volleyConsumed = false; veteranTrigger(state, attacker, "ntv-marked-volley", defender); }
  if (damage > 0 && neutralTownVeterancy(attacker, "putrid-grasp")) {
    const effect = makeActiveEffect(state, { name: "Putrid Grasp", scope: "unit", duration: { type: "next-activation" }, polarity: "negative", removable: true, modifiers: [{ type: "TOWN_MOVE_LIMIT", amount: 1 }] }, { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId }, attacker.controllerId, { type: "unit", unitId: defender.id });
    if (state.combat?.activeUnitId === defender.id) effect.activationsRemaining = 2;
    if (effectAppliesToUnit(effect, defender, true)) { state.activeEffects.push(effect); veteranTrigger(state, attacker, "ntv-putrid-grasp", defender); }
  }
  if (damage > 0 && neutralTownVeterancy(attacker, "suppressing-shot") && !usedThisRound(attacker, "suppressRound", round)) { markRound(attacker, "suppressRound", round); debuff(state, attacker, defender, "ntv-suppressing-shot", "initiative", 1); }
  if (damage > 0 && alive(defender) && neutralTownVeterancy(attacker, "core-suppression") && !usedThisRound(attacker, "coreSuppressRound", round)) {
    markRound(attacker, "coreSuppressRound", round);
    debuff(state, attacker, defender, "ntv-core-suppression", "initiative", 1);
    debuff(state, attacker, defender, "ntv-core-suppression", "attack", 1);
  }
  if (!retaliation && (roll === -1 || roll === 0) && alive(defender) && attacker.controllerId !== defender.controllerId && neutralTownVeterancy(attacker, "mountain-stillness") && !unitImmuneToParalysis(state, defender)) {
    placeCombatToken(state, defender, "paralysis", 0, "Mountain Stillness");
    veteranTrigger(state, attacker, "ntv-mountain-stillness", defender);
  }
  if (damage > 0 && neutralTownVeterancy(attacker, "venom-arrow") && kind === "ranged" && nonAdjacent && !usedThisRound(attacker, "venomRound", round)) { markRound(attacker, "venomRound", round); applyNeutralDebuff(state, attacker, defender, "ntv-venom-arrow", "Venom Arrow", { type: "NEUTRAL_NEXT_ATTACK_PENALTY", amount: 1 }); }
  if (damage > 0 && neutralTownVeterancy(attacker, "ageing-breath") && !usedThisRound(attacker, "ageRound", round)) { markRound(attacker, "ageRound", round); debuff(state, attacker, defender, "ntv-ageing-breath", "attack", 1); }
  if (damage > 0 && neutralTownVeterancy(attacker, "potent-venom") && !usedThisRound(attacker, "potentRound", round)) { markRound(attacker, "potentRound", round); queueVenom(defender, attacker.id, round); veteranTrigger(state, attacker, "ntv-potent-venom", defender); }
  if (retaliation && damage > 0 && neutralTownVeterancy(attacker, "toxic-counter") && !usedThisRound(attacker, "toxicRound", round)) { markRound(attacker, "toxicRound", round); queueVenom(defender, attacker.id, round); veteranTrigger(state, attacker, "ntv-toxic-counter", defender); }
  if (!retaliation && roll === -1 && neutralTownVeterancy(attacker, "measured-blades")) mem.measuredRound = round; else if (mem.measuredRound === round) delete mem.measuredRound;
  if (mem.searingReady) { if (damage > 0) veteranDamage(state, attacker, defender, 1, "ntv-searing-passage"); delete mem.searingReady; }
  const splash = (neutralTownVeterancy(attacker, "scattering-flame") && kind === "ranged" && nonAdjacent && damage > 0 && !usedThisRound(attacker, "scatterRound", round)) ? "ntv-scattering-flame"
    : (neutralTownVeterancy(attacker, "death-cloud") && kind === "ranged" && nonAdjacent && damage > 0 && !usedThisRound(attacker, "cloudRound", round)) ? "ntv-death-cloud"
    : (neutralTownVeterancy(attacker, "chain-lightning") && roll === 1 && !usedThisRound(attacker, "chainRound", round)) ? "ntv-chain-lightning"
    : (neutralTownVeterancy(attacker, "lucky-ricochet") && kind === "ranged" && nonAdjacent && (roll === -1 || roll === 0) && !usedThisRound(attacker, "ricochetRound", round)) ? "ntv-lucky-ricochet" : undefined;
  if (splash) {
    const roundKey = splash === "ntv-scattering-flame" ? "scatterRound" : splash === "ntv-death-cloud" ? "cloudRound" : splash === "ntv-chain-lightning" ? "chainRound" : "ricochetRound";
    markRound(attacker, roundKey, round);
    queueElementalChoice(state, { kind: "damage", unitId: attacker.id, anchorId: defender.id, abilityId: splash, amount: 1, adjacent: true, enemiesOnly: true, excludeTargetId: defender.id });
  }
  if (neutralTownVeterancy(attacker, "threefold-threat") && !mem.activationProc) { mem.activationProc = true; queueElementalChoice(state, { kind: "damage", unitId: attacker.id, abilityId: "ntv-threefold-threat", amount: 1, adjacent: true, enemiesOnly: true, excludeTargetId: defender.id, optional: true }); }
  if (damage > 0 && neutralTownVeterancy(attacker, "labyrinth-cleave") && kind === "melee" && !mem.activationProc) { mem.activationProc = true; queueElementalChoice(state, { kind: "damage", unitId: attacker.id, abilityId: "ntv-labyrinth-cleave", amount: 1, adjacent: true, enemiesOnly: true, excludeTargetId: defender.id }); }
  if (neutralTownVeterancy(attacker, "consecrated-shot") && kind === "ranged" && nonAdjacent && roll >= 0 && !usedThisRound(attacker, "consecrateRound", round)) { markRound(attacker, "consecrateRound", round); queueElementalChoice(state, { kind: "heal", unitId: attacker.id, abilityId: "ntv-consecrated-shot", amount: 1, alliesOnly: true }); }
  if (damage > 0 && neutralTownVeterancy(attacker, "blood-tribute") && !usedThisRound(attacker, "bloodRound", round)) { markRound(attacker, "bloodRound", round); queueElementalChoice(state, { kind: "heal", unitId: attacker.id, abilityId: "ntv-blood-tribute", amount: 1, alliesOnly: true, adjacentOrSelf: true }); }
  if (neutralTownVeterancy(attacker, "moonlit-aid") && !usedThisRound(attacker, "moonRound", round)) { markRound(attacker, "moonRound", round); queueElementalChoice(state, { kind: "heal", unitId: attacker.id, abilityId: "ntv-moonlit-aid", amount: 1, alliesOnly: true, adjacent: true }); }
  if ((retaliation && neutralTownVeterancy(attacker, "winged-riposte")) || (!retaliation && kind === "ranged" && nonAdjacent && neutralTownVeterancy(attacker, "skirmisher-step")) || (!retaliation && attacker.movedThisActivation && neutralTownVeterancy(attacker, "flowing-assault")))
    queueElementalChoice(state, { kind: "move-one", unitId: attacker.id, abilityId: retaliation ? "ntv-winged-riposte" : neutralTownVeterancy(attacker, "skirmisher-step") ? "ntv-skirmisher-step" : "ntv-flowing-assault", optional: true });
  if (!retaliation && neutralTownVeterancy(attacker, "strike-and-return") && typeof mem.activationOrigin === "number") queueElementalChoice(state, { kind: "return-origin", unitId: attacker.id, abilityId: "ntv-strike-and-return", position: mem.activationOrigin as number, optional: true });
  if (neutralTownVeterancy(defender, "barbed-revenge") && alive(defender) && isAdjacent(attacker.position, defender.position) && !usedThisRound(defender, "barbRound", round)) { markRound(defender, "barbRound", round); veteranDamage(state, defender, attacker, 1, "ntv-barbed-revenge"); }
  if (neutralTownVeterancy(attacker, "petrifying-aim") && kind === "ranged" && nonAdjacent && roll === 1 && alive(defender) && !unitImmuneToParalysis(state, defender) && !usedThisRound(attacker, "petrifyRound", round)) { markRound(attacker, "petrifyRound", round); placeCombatToken(state, defender, "paralysis", 0, "Petrifying Aim"); veteranTrigger(state, attacker, "ntv-petrifying-aim", defender); }
  if (damage > 0 && neutralTownVeterancy(attacker, "bewitching-bolt") && kind === "ranged" && nonAdjacent && !usedThisRound(attacker, "bewitchRound", round)) { const effect = state.activeEffects.find(e => e.polarity === "positive" && e.removable && e.target?.type === "unit" && e.target.unitId === defender.id); if (effect) { markRound(attacker, "bewitchRound", round); removeEffect(effect); veteranTrigger(state, attacker, "ntv-bewitching-bolt", defender); } }
  if (damage > 0 && neutralTownVeterancy(attacker, "disrupting-gaze") && !usedThisRound(attacker, "disruptRound", round)) {
    markRound(attacker, "disruptRound", round);
    memory(defender).positiveEffectsBlocked = true;
    memory(defender).positiveEffectsBlockedDuringActivation = combat.activeUnitId === defender.id;
    memory(defender).allowedPositiveEffectIds ??= state.activeEffects.filter(effect => effect.polarity === "positive" && effect.target?.type === "unit" && effect.target.unitId === defender.id).map(effect => effect.id);
    veteranTrigger(state, attacker, "ntv-disrupting-gaze", defender);
  }
  if (alive(defender) && neutralTownVeterancy(defender, "ethereal-escape") && !usedThisRound(defender, "escapeRound", round)) {
    markRound(defender, "escapeRound", round);
    queueElementalChoice(state, { kind: "move-one", unitId: defender.id, abilityId: "ntv-ethereal-escape", optional: true });
  }
}

export function neutralTownFinishActivation(state: GameState, unit: CombatUnitState): void {
  if (memory(unit).positiveEffectsBlocked) {
    const allowed = new Set((memory(unit).allowedPositiveEffectIds as string[] | undefined) ?? []);
    state.activeEffects = state.activeEffects.filter(effect => effect.polarity !== "positive" || effect.target?.type !== "unit" || effect.target.unitId !== unit.id || allowed.has(effect.id));
  }
  if (!memory(unit).tormentDuringActivation) delete memory(unit).tormentUntilRound;
  if (memory(unit).positiveEffectsBlockedDuringActivation) return;
  delete memory(unit).positiveEffectsBlocked;
  delete memory(unit).allowedPositiveEffectIds;
}

export function neutralTownFailedParalysis(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, roll: number): void {
  if (roll === -1 && neutralTownVeterancy(attacker, "heavy-gaze") && alive(defender)) debuff(state, attacker, defender, "ntv-heavy-gaze", "initiative", 1);
}

const isSpellOrSpecialtyDamage = (kind: DamageKind, source: SourceRef): boolean =>
  kind === "spell" || (source.type === "card" && source.cardId.startsWith("specialty."));

export function neutralTownCardDamageReduction(state: GameState, target: CombatUnitState, source: SourceRef, kind: DamageKind, amount: number): number {
  const round = state.combat?.round;
  if (!round || amount <= 0 || !isSpellOrSpecialtyDamage(kind, source) || !neutralTownVeterancy(target, "arcane-plating") || usedThisRound(target, "platingRound", round)) return 0;
  markRound(target, "platingRound", round);
  return 1;
}

export function neutralTownCardDamageResolved(state: GameState, target: CombatUnitState, sourceRef: SourceRef, kind: DamageKind, amount: number, prevented: number): void {
  const round = state.combat?.round;
  if (!round || !isSpellOrSpecialtyDamage(kind, sourceRef)) return;
  if (prevented > 0) veteranTrigger(state, target, "ntv-arcane-plating", target);
  if (sourceRef.type === "unit") neutralTownRunicBacklash(state, target, state.combat?.units[sourceRef.unitId], prevented);
  if (kind === "spell" && amount > 0 && sourceRef.type !== "system") {
    const controllerId = sourceRef.controllerId;
    for (const channeler of Object.values(state.combat?.units ?? {})) {
      if (!alive(channeler) || channeler.controllerId !== controllerId || channeler.controllerId === target.controllerId || !neutralTownVeterancy(channeler, "spell-channel") || usedThisRound(channeler, "channelRound", round)) continue;
      markRound(channeler, "channelRound", round);
      veteranDamage(state, channeler, target, 1, "ntv-spell-channel");
    }
  }
}

export function neutralTownRunicBacklash(state: GameState, target: CombatUnitState, source: CombatUnitState | undefined, prevented: number): void {
  const round = state.combat?.round;
  if (!round || prevented <= 0 || !source || !alive(source) || source.controllerId === target.controllerId || !neutralTownVeterancy(target, "runic-backlash") || usedThisRound(target, "runicRound", round)) return;
  markRound(target, "runicRound", round);
  veteranDamage(state, target, source, 1, "ntv-runic-backlash");
}

export function neutralTownAllyLost(state: GameState, fallen: CombatUnitState, lossKind: "UNIT_REMOVED" | "UNIT_FLIPPED" | "ARMY_STACK_LOST" | "STACK_TOKEN_DISCARDED"): void {
  if (lossKind !== "UNIT_REMOVED") return;
  const round = state.combat?.round; if (!round) return;
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (!alive(unit) || unit.id === fallen.id) continue;
    if (unit.controllerId === fallen.controllerId && neutralTownVeterancy(unit, "summoned-torment") && !usedThisRound(unit, "tormentRound", round)) { markRound(unit, "tormentRound", round); memory(unit).tormentUntilRound = round; memory(unit).tormentDuringActivation = state.combat?.activeUnitId === unit.id; veteranTrigger(state, unit, "ntv-summoned-torment", fallen); }
    if (unit.controllerId !== fallen.controllerId && neutralTownVeterancy(unit, "marsh-scavenger") && isAdjacent(unit.position, fallen.position) && !usedThisRound(unit, "scavengeRound", round)) { markRound(unit, "scavengeRound", round); veteranHeal(state, unit, 1, "ntv-marsh-scavenger"); }
  }
  const sourceId = memory(fallen).damageSourceId as string | undefined;
  const source = sourceId ? state.combat?.units[sourceId] : undefined;
  if (source && alive(source) && source.controllerId !== fallen.controllerId && neutralTownVeterancy(source, "victory-command") && !usedThisRound(source, "victoryCommandRound", round)) {
    markRound(source, "victoryCommandRound", round);
    memory(source).victoryAttackReady = true;
    veteranTrigger(state, source, "ntv-victory-command", source, `${source.cardName} gains +1 Attack for its next attack.`);
    queueElementalChoice(state, { kind: "move-ally-one", unitId: source.id, abilityId: "ntv-victory-command", optional: true });
  }
  if (source && alive(source) && source.controllerId !== fallen.controllerId && neutralTownVeterancy(source, "infernal-command") && !usedThisRound(source, "commandRound", round)) {
    markRound(source, "commandRound", round);
    queueElementalChoice(state, { kind: "move-ally-one", unitId: source.id, abilityId: "ntv-infernal-command", optional: true });
  }
}

export function neutralTownSpellCast(state: GameState, casterId: string): void {
  const round = state.combat?.round; if (!round) return;
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (!alive(unit) || unit.controllerId === casterId) continue;
    if (neutralTownVeterancy(unit, "stolen-spark") && !usedThisRound(unit, "sparkRound", round)) { markRound(unit, "sparkRound", round); veteranHeal(state, unit, 1, "ntv-stolen-spark"); }
    if (neutralTownVeterancy(unit, "mana-turbulence") && !usedThisRound(unit, "manaRound", round)) {
      markRound(unit, "manaRound", round);
      (state.pendingManaTurbulence ??= []).push({ casterId, unitId: unit.id, stackDepth: state.stack.length });
    }
  }
}

/** Wait for the spell's stack item and any interactive resolution to finish. */
export function resolveManaTurbulence(state: GameState): void {
  if (state.pendingChoice || !state.pendingManaTurbulence?.length) return;
  const pending = state.pendingManaTurbulence;
  state.pendingManaTurbulence = pending.filter(entry => state.stack.length > entry.stackDepth);
  for (const entry of pending.filter(entry => state.stack.length <= entry.stackDepth)) {
    const player = state.players[entry.casterId];
    const index = veteranRandom(state, (player?.hand ?? []).map((_, i) => i), `${entry.unitId}-mana`);
    if (!player || index === undefined) continue;
    const [card] = player.hand.splice(index, 1);
    if (card) player.discard.push(card);
    const unit = state.combat?.units[entry.unitId];
    if (unit) veteranTrigger(state, unit, "ntv-mana-turbulence");
  }
  if (!state.pendingManaTurbulence.length) delete state.pendingManaTurbulence;
}
