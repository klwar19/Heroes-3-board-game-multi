import { townVeterancy, townAllyLost, townArtifactUsed } from "./town-veterancy";
import { neutralTownAllyLost, neutralTownCardDamageReduction, neutralTownCardDamageResolved } from "./neutral-town-veterancy";
import type { GameEvent, GameState, SourceRef } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import { unitAbilities } from "@/data/units/abilities";
import { noteUnitDamagedForTokens } from "./tokens";
import { cardDamageNullified, specialtyImmunityActive } from "./active-effects";
import {
  getUnitAbilityDefinitions,
  factionVeterancy,
  twilightWardReduction,
  hasImmuneToSpecialtyDamage,
  getSpecialtyDamageReduction,
  getSpellAndSpecialtyDamageReductionAura,
} from "./unit-abilities";
import { isAdjacent } from "./battlefield";
import { cardLibrary } from "@/data/cards/library";

type EventDraft = Omit<GameEvent, "id">;

/** Feed/FX slug for Komari's Star Candy shield absorbing a hit. */
export const LITTLE_BUSTERS_STAR_CANDY_ID = "little-busters-star-candy";

/**
 * Hoshino Iron Horus lives at the DAMAGE_ASSIGNED event seam because every
 * attack, spell, specialty, battlefield token and scripted effect reports its
 * actual damage there immediately after adding it and before removal checks.
 * Calling this before an attack mutates HP also keeps lethal previews and
 * attack follow-ups aligned; the event seam covers every non-attack caller.
 */
export function reduceFirstDamageByAbility(
  state: GameState,
  unitId: string,
  incoming: number
): { amount: number; reduced: number; abilityId?: string } {
  const combat = state.combat;
  const unit = combat?.units[unitId];
  if (!combat || !unit || incoming <= 0 || unit.abilitiesSuppressed) {
    return { amount: incoming, reduced: 0 };
  }
  const ability = unit.abilities
    .map((id) => unitAbilities[id])
    .find((definition) => {
      const effect = definition?.effect;
      if (definition?.implementationStatus !== "implemented") return false;
      if (effect?.type === "REDUCE_FIRST_DAMAGE_EACH_ROUND") return unit.ironHorusUsedRound !== combat.round;
      if (effect?.type === "REDUCE_FIRST_DAMAGE_EACH_COMBAT") return !unit.dutyEternalUsedThisCombat;
      // Adamantine Hull caps the first damage: it only fires (and spends its
      // once-per-Combat proc) on a damage assignment large enough for the cap to
      // actually reduce it, so a 1-damage poke never wastes the shield.
      if (effect?.type === "CAP_FIRST_DAMAGE_EACH_COMBAT") return !unit.dutyEternalUsedThisCombat && incoming > effect.cap;
      return false;
    });
  const effect = ability?.effect;
  if (
    !ability ||
    !effect ||
    (effect.type !== "REDUCE_FIRST_DAMAGE_EACH_ROUND" &&
      effect.type !== "REDUCE_FIRST_DAMAGE_EACH_COMBAT" &&
      effect.type !== "CAP_FIRST_DAMAGE_EACH_COMBAT")
  ) {
    return { amount: incoming, reduced: 0 };
  }
  const reduced =
    effect.type === "CAP_FIRST_DAMAGE_EACH_COMBAT"
      ? incoming - effect.cap
      : Math.min(effect.amount, incoming);
  if (effect.type === "REDUCE_FIRST_DAMAGE_EACH_ROUND") unit.ironHorusUsedRound = combat.round;
  else unit.dutyEternalUsedThisCombat = true;
  return { amount: incoming - reduced, reduced, abilityId: ability.id };
}

/**
 * Komari "Star Candy" (specialty.komari_kamikita.*): the shielded unit's NEXT
 * damage — attack, Spell or effect — is reduced by the shield's amount and the
 * shield is then spent, even when only part of it was needed. It lives at the
 * SAME two seams Iron Horus does (the attack path, so the lethal-save preview
 * agrees, and this DAMAGE_ASSIGNED event seam, which covers every non-attack
 * caller); the attack path removes the effect before its own DAMAGE_ASSIGNED is
 * appended, so a hit can never spend two shields.
 *
 * Matches the shield's explicit unit target, so a shield is consumed only by
 * damage to the unit that received it.
 */
export function consumeStarCandyShield(
  state: GameState,
  unitId: string,
  incoming: number
): { amount: number; reduced: number } {
  const unit = state.combat?.units[unitId];
  if (!unit || incoming <= 0) {
    return { amount: incoming, reduced: 0 };
  }
  const shield = state.activeEffects.find(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unitId &&
      effect.modifiers.some((modifier) => modifier.type === "DAMAGE_SHIELD")
  );
  if (!shield) {
    return { amount: incoming, reduced: 0 };
  }
  const amount = shield.modifiers.reduce(
    (total, modifier) =>
      modifier.type === "DAMAGE_SHIELD" ? total + modifier.amount : total,
    0
  );
  const reduced = Math.min(amount, incoming);
  if (reduced <= 0) {
    return { amount: incoming, reduced: 0 };
  }
  // Spent whole, even when only part of it was needed (printed card).
  state.activeEffects = state.activeEffects.filter((effect) => effect.id !== shield.id);
  return { amount: incoming - reduced, reduced };
}

/** Consume only the hit belonging to the parked attack/cast. Redirected effect
 * damage cannot recursively consume this same receipt. HP is never deducted
 * from the protected unit on the attack path; event callers undo their addition
 * before any removal checks run. */
export function transferPendingDamage(
  state: GameState,
  unitId: string,
  incoming: number,
  source: SourceRef,
): number {
  if (incoming <= 0) return incoming;
  const stack = [...state.stack].reverse().find((item) => {
    if (!item.modifiers.damageTransfers?.[unitId]) return false;
    const action = item.action;
    return (
      (source.type === "unit" &&
        (action.type === "ATTACK_UNIT" ||
          action.type === "MOVE_AND_ATTACK_UNIT") &&
        action.attackerId === source.unitId) ||
      (source.type === "card" &&
        (action.type === "CAST_SPELL" || action.type === "PLAY_CARD") &&
        action.cardId === source.cardId)
    );
  });
  const transfers =
    stack?.modifiers.damageTransfers ??
    (source.type === "card" &&
    state.combat?.pendingCardDamageTransfers?.cardId === source.cardId
      ? state.combat!.pendingCardDamageTransfers.transfers
      : undefined);
  const transfer = transfers?.[unitId];
  if (!transfer) return incoming;
  delete transfers![unitId];
  const target = state.combat?.units[transfer.targetUnitId];
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId,
    targetUnitId: transfer.targetUnitId,
    abilityId: transfer.cardId,
    message: `Little Busters' Bond prevents ${incoming} damage and redirects ${Math.ceil(incoming / 2)}.`,
  });
  if (target && target.damage < target.maxHealth) {
    const immune =
      Boolean(target.invulnerableUntilActivation) ||
      cardDamageNullified(state) ||
      hasImmuneToSpecialtyDamage(target) ||
      specialtyImmunityActive(state, target);
    const aura = Object.values(state.combat!.units).reduce(
      (sum, unit) =>
        unit.damage < unit.maxHealth &&
        (unit.id === target.id || isAdjacent(unit.position, target.position))
          ? sum + getSpellAndSpecialtyDamageReductionAura(unit)
          : sum,
      0,
    );
    const amount = immune
      ? 0
      : Math.max(
          0,
          Math.ceil(incoming / 2) - getSpecialtyDamageReduction(target) - aura -
          twilightWardReduction(target, state.combat?.round),
        );
    target.damage += amount;
    const assigned = appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: {
        type: "card",
        cardId: transfer.cardId,
        controllerId: transfer.playerId,
      },
      target: { type: "unit", unitId: target.id },
      amount,
      damageKind: "effect",
    });
    noteUnitDamagedForTokens(state, target, assigned.amount);
    (state.combat!.redirectedDamageRemovals ??= []).push(target.id);
  }
  return 0;
}

/**
 * The log keeps only the most recent events. Long adventures used to grow the
 * log (and with it every snapshot, clone and player view) without bound until
 * clicks took seconds; the cap keeps the working set constant while staying
 * far larger than anything the UI or in-flight resolutions look back at.
 */
const EVENT_LOG_LIMIT = 500;

/** Next unique event number; tolerant of snapshots saved before the counter. */
export function nextEventNumber(state: GameState): number {
  const counter = Math.max(state.eventCounter ?? 0, state.eventLog.length) + 1;
  state.eventCounter = counter;
  return counter;
}

/**
 * Ever-increasing number for random seeds and generated ids. Reading the
 * capped log length instead would freeze the value (and with it every "new"
 * die roll) once the log is full.
 */
export function eventSeedNumber(state: GameState): number {
  return Math.max(state.eventCounter ?? 0, state.eventLog.length);
}

export function appendEvent<T extends EventDraft>(
  state: GameState,
  event: T,
): Extract<GameEvent, { type: T["type"] }> {
  let eventDraft: EventDraft = event;
  let damageReduction:
    | { unitId: string; amount: number; abilityId: string }
    | undefined;
  let starCandy: { unitId: string; amount: number } | undefined;
  let neutralTownPrevented = 0;
  const damageEvent = event as unknown as {
    type: string;
    target?: { type: string; unitId?: string };
    amount?: number;
    source?: SourceRef;
    damageKind?: string;
  };
  const payingDebt = Boolean(damageEvent.target?.unitId && state.combat?.units[damageEvent.target.unitId]?.elementalVeterancy?.payingDebt);
  if (
    !payingDebt && damageEvent.type === "DAMAGE_ASSIGNED" &&
    damageEvent.target?.type === "unit" &&
    damageEvent.target.unitId &&
    (damageEvent.amount ?? 0) > 0
  ) {
    const reduction = reduceFirstDamageByAbility(
      state,
      damageEvent.target.unitId,
      damageEvent.amount ?? 0,
    );
    if (reduction.reduced > 0) {
      const unit = state.combat?.units[damageEvent.target.unitId];
      if (unit) unit.damage = Math.max(0, unit.damage - reduction.reduced);
      eventDraft = { ...event, amount: reduction.amount };
      damageReduction = {
        unitId: damageEvent.target.unitId,
        amount: reduction.reduced,
        abilityId: reduction.abilityId ?? "kivotos-iron-horus",
      };
    }
    // Star Candy runs AFTER the printed reduction (and after every printed cap,
    // which clamped further upstream): the shield eats what is still coming.
    const candy = consumeStarCandyShield(
      state,
      damageEvent.target.unitId,
      (eventDraft as { amount?: number }).amount ?? damageEvent.amount ?? 0,
    );
    if (candy.reduced > 0) {
      const unit = state.combat?.units[damageEvent.target.unitId];
      if (unit) unit.damage = Math.max(0, unit.damage - candy.reduced);
      eventDraft = { ...eventDraft, amount: candy.amount } as EventDraft;
      starCandy = { unitId: damageEvent.target.unitId, amount: candy.reduced };
    }
  }
  if (
    !payingDebt && damageEvent.type === "DAMAGE_ASSIGNED" &&
    damageEvent.target?.unitId &&
    damageEvent.source
  ) {
    const amount = (eventDraft as { amount?: number }).amount ?? 0;
    const remaining = transferPendingDamage(
      state,
      damageEvent.target.unitId,
      amount,
      damageEvent.source,
    );
    if (remaining !== amount) {
      const protectedUnit = state.combat?.units[damageEvent.target.unitId];
      if (protectedUnit)
        protectedUnit.damage = Math.max(
          0,
          protectedUnit.damage - amount + remaining,
        );
      eventDraft = { ...eventDraft, amount: remaining } as EventDraft;
    }
  }

  if (!payingDebt && damageEvent.type === "DAMAGE_ASSIGNED" && damageEvent.target?.unitId) {
    const unit = state.combat?.units[damageEvent.target.unitId];
    let amount = (eventDraft as { amount?: number }).amount ?? 0;
    if (unit?.elementalVeterancy?.solidifyUntilRound !== undefined && amount > 0 && damageEvent.damageKind !== "attack") {
      unit.damage = Math.max(0, unit.damage - 1);
      amount -= 1;
      eventDraft = { ...eventDraft, amount } as EventDraft;
    }
    const hasEarthShield = unit
      ? getUnitAbilityDefinitions(unit).some(
          (ability) =>
            ability.implementationStatus === "implemented" &&
            ((ability.effect?.type === "ELEMENTAL_VETERANCY" &&
              ability.effect.mechanic === "earth-shield") ||
             (ability.effect?.type === "CAP_DAMAGE_PER_ATTACK" &&
              ability.effect.reflectOverflow === true)),
        )
      : false;
    if (unit && hasEarthShield && unit.damage > 4) {
      const prevented = Math.min(amount, unit.damage - 4);
      unit.damage -= prevented;
      eventDraft = { ...eventDraft, amount: amount - prevented } as EventDraft;
    }
    if (unit && damageEvent.source) {
      amount = (eventDraft as { amount?: number }).amount ?? 0;
      neutralTownPrevented = neutralTownCardDamageReduction(state, unit, damageEvent.source, damageEvent.damageKind as import("./state").DamageKind, amount);
      if (neutralTownPrevented > 0) {
        unit.damage = Math.max(0, unit.damage - neutralTownPrevented);
        eventDraft = { ...eventDraft, amount: amount - neutralTownPrevented } as EventDraft;
      }
    }
  }

  const nextEvent = {
    id: `evt_${nextEventNumber(state)}`,
    ...(state.turn?.mode === "parallel" && state.combat
      ? { combatContextId: state.combat.id }
      : {}),
    ...eventDraft,
  } as unknown as Extract<GameEvent, { type: T["type"] }>;

  state.eventLog.push(nextEvent);
  if (nextEvent.type === "CARD_PLAYED" && state.combat) {
    const played = nextEvent as Extract<GameEvent, { type: "CARD_PLAYED" }>;
    if (cardLibrary[played.cardId]?.kind === "artifact") {
      townArtifactUsed(state, played.playerId);
    }
  }
  if (nextEvent.type === "DAMAGE_ASSIGNED" && state.combat) {
    const dealt = nextEvent as Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }>;
    if (dealt.target.type === "unit" && dealt.amount > 0) {
      const target = state.combat.units[dealt.target.unitId];
      // Only the lethal hit can earn a bounty. A later non-damage removal
      // (for example, a disappearing clone) must not credit an older hit.
      if (target) {
        const memory = (target.townVeterancy ??= {});
        if (target.damage - dealt.amount < target.maxHealth) delete memory.lossRecorded;
        memory.damageSourceId = target.damage >= target.maxHealth && dealt.source.type === "unit" ? dealt.source.unitId : undefined;
      }
      if (target) target.neutralLastDamageSourceId = target.damage >= target.maxHealth && dealt.source.type === "unit" ? dealt.source.unitId : undefined;
      if (target) {
        const fury = getUnitAbilityDefinitions(target).find(
          ability => ability.effect?.type === "ATTACK_BONUS_PER_DAMAGE_SUFFERED",
        );
        if (fury?.effect?.type === "ATTACK_BONUS_PER_DAMAGE_SUFFERED") {
          const memory = (target.townVeterancy ??= {});
          memory.damageSuffered = (memory.damageSuffered ?? 0) + dealt.amount;
          const earned = Math.min(
            fury.effect.maxBonus,
            Math.floor(memory.damageSuffered / fury.effect.damagePerBonus),
          );
          const previous = memory.damageSufferedAttack ?? 0;
          if (earned > previous) {
            memory.damageSufferedAttack = earned;
            memory.attack = (memory.attack ?? 0) + earned - previous;
            appendEvent(state, {
              type: "UNIT_ABILITY_TRIGGERED",
              unitId: target.id,
              targetUnitId: target.id,
              abilityId: fury.id,
              message: `${target.cardName} has suffered ${memory.damageSuffered} total damage and gains +${earned - previous} Attack.`,
            });
          }
        }
      }
      if (
        target && target.damage < target.maxHealth &&
        getUnitAbilityDefinitions(target).some(ability => ability.effect?.type === "NEUTRAL_VETERANCY" && ability.effect.mechanic === "arctic-harden")
      ) {
        const memory = (target.neutralVeterancy ??= {});
        memory.damageDefense = (memory.damageDefense ?? 0) + 1;
        appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: target.id, targetUnitId: target.id, abilityId: "veteran-arctic-harden", message: `${target.cardName} gains +1 Defense after taking damage.` });
      }
    }
  }
  if (nextEvent.type === "UNIT_REMOVED" && state.combat) {
    const removedEvent = nextEvent as Extract<GameEvent, { type: "UNIT_REMOVED" }>;
    // A defeated dragon releases its snare permanently, even if it later revives.
    for (const target of Object.values(state.combat.units)) {
      if (target.townVeterancy?.boundBy) {
        target.townVeterancy.boundBy = target.townVeterancy.boundBy.filter(id => id !== removedEvent.unitId);
      }
    }
    const fallen = state.combat.units[removedEvent.unitId];
    const killer = fallen?.neutralLastDamageSourceId ? state.combat.units[fallen.neutralLastDamageSourceId] : undefined;
    if (fallen && fallen.damage >= fallen.maxHealth && !fallen.neutralBountyRecorded && killer && killer.controllerId !== fallen.controllerId && getUnitAbilityDefinitions(killer).some(a => a.implementationStatus === "implemented" && a.effect?.type === "NEUTRAL_VETERANCY" && a.effect.mechanic === "peasant-bounty")) {
      fallen.neutralBountyRecorded = true;
      const rewards = (state.combat.neutralBountyGold ??= {});
      rewards[killer.controllerId] = (rewards[killer.controllerId] ?? 0) + 3;
      appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: killer.id, targetUnitId: fallen.id, abilityId: "veteran-peasant-bounty", message: `${killer.cardName} earns 3 Gold, payable after combat.` });
    }
  }
  if (nextEvent.type === "COMBAT_ENDED" && state.combat?.neutralBountyGold) {
    const rewards = state.combat.neutralBountyGold;
    delete state.combat.neutralBountyGold;
    for (const [playerId, amount] of Object.entries(rewards)) {
      const player = state.players[playerId];
      if (player && playerId !== NEUTRAL_PLAYER_ID) player.resources.gold += amount;
    }
  }
  if (nextEvent.type === "UNIT_MOVED" && state.combat) {
    const moved = nextEvent as Extract<GameEvent, { type: "UNIT_MOVED" }>;
    const unit = state.combat.units[moved.unitId];
    if (unit && moved.from !== moved.to) (unit.townVeterancy ??= {}).movedRound = state.combat.round;
    for (const target of Object.values(state.combat.units)) {
      if (target.townVeterancy?.boundBy) target.townVeterancy.boundBy = target.townVeterancy.boundBy.filter(id => {
        const source = state.combat!.units[id];
        return source && source.damage < source.maxHealth && isAdjacent(source.position, target.position);
      });
    }
  }
  if ((nextEvent.type === "UNIT_REMOVED" || nextEvent.type === "UNIT_FLIPPED" || nextEvent.type === "ARMY_STACK_LOST" || nextEvent.type === "STACK_TOKEN_DISCARDED") && state.combat) {
    const loss = nextEvent as Extract<GameEvent, { type: "UNIT_REMOVED" | "UNIT_FLIPPED" | "ARMY_STACK_LOST" | "STACK_TOKEN_DISCARDED" }>;
    const fallen = state.combat.units[loss.unitId];
    if (fallen && (nextEvent.type !== "UNIT_REMOVED" || !fallen.townVeterancy?.lossRecorded)) {
      if (nextEvent.type === "UNIT_REMOVED") (fallen.townVeterancy ??= {}).lossRecorded = true;
      townAllyLost(state, fallen);
      neutralTownAllyLost(state, fallen, nextEvent.type);
    }
  }
  if (nextEvent.type === "DAMAGE_ASSIGNED" && state.combat) {
    const hit = nextEvent as Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }>;
    const target = hit.target.type === "unit" ? state.combat.units[hit.target.unitId] : undefined;
    // Guardian Angel can protect any ally, including one without rank abilities.
    // Record every hit so the removal chokepoint can distinguish attacks from spells.
    if (target) {
      (target.factionVeterancy ??= {}).lastDamage = { kind: hit.damageKind, source: hit.source, amount: hit.amount };
    }
    // Follow-up damage may remove the target recursively. Preserve this hit's
    // bookkeeping first so the outer event cannot restore stale lethal state.
    if (target) neutralTownCardDamageResolved(state, target, hit.source, hit.damageKind, hit.amount, neutralTownPrevented);
  }
  if (nextEvent.type === "UNIT_REMOVED" && state.combat) {
    const lost =
      state.combat.units[
        (nextEvent as Extract<GameEvent, { type: "UNIT_REMOVED" }>).unitId
      ];
    if (
      lost?.armyUnitId &&
      !lost.summoned &&
      !lost.temporary &&
      !lost.commanderSlug &&
      !lost.cloneOfUnitId
    ) {
      const fallen = Object.values(state.combat.units).filter(
        (unit) =>
          unit.controllerId === lost.controllerId &&
          unit.damage >= unit.maxHealth &&
          unit.armyUnitId &&
          !unit.summoned &&
          !unit.temporary &&
          !unit.commanderSlug &&
          !unit.cloneOfUnitId,
      ).length;
      for (const effect of state.activeEffects) {
        const bond = effect.fallenBond;
        if (
          !bond ||
          effect.controllerId !== lost.controllerId ||
          fallen <= bond.fallen
        )
          continue;
        bond.fallen = fallen;
        effect.modifiers = [
          {
            type: bond.stat === "attack" ? "ATTACK_BONUS" : "INITIATIVE_BONUS",
            amount: bond.base + Math.min(fallen, bond.cap ?? Infinity),
          },
        ];
        effect.expiresAtCombatRoundEnd = state.combat.round + 1;
      }
    }
  }
  if (state.eventLog.length > EVENT_LOG_LIMIT) {
    state.eventLog.splice(0, state.eventLog.length - EVENT_LOG_LIMIT);
  }
  if (damageReduction) {
    const unit = state.combat?.units[damageReduction.unitId];
    if (unit) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: damageReduction.abilityId,
        targetUnitId: unit.id,
        message: `${unit.cardName}'s damage reduction prevents ${damageReduction.amount} damage.`,
      });
    }
  }
  if (starCandy) {
    const unit = state.combat?.units[starCandy.unitId];
    if (unit) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: LITTLE_BUSTERS_STAR_CANDY_ID,
        targetUnitId: unit.id,
        message: `${unit.cardName}'s Star Candy absorbs ${starCandy.amount} damage.`,
      });
    }
  }
  return nextEvent;
}
