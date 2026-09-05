import type { GameEvent, GameState } from "./state";
import { unitAbilities } from "@/data/units/abilities";

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
      return false;
    });
  const effect = ability?.effect;
  if (!ability || !effect || (effect.type !== "REDUCE_FIRST_DAMAGE_EACH_ROUND" && effect.type !== "REDUCE_FIRST_DAMAGE_EACH_COMBAT")) {
    return { amount: incoming, reduced: 0 };
  }
  const reduced = Math.min(effect.amount, incoming);
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
 * Matches `effect.target` directly rather than going through
 * effectAppliesToUnit — the same shortcut applyFireShieldDamage takes — so this
 * module stays a leaf and cannot close an import cycle through active-effects.
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
    (total, modifier) => (modifier.type === "DAMAGE_SHIELD" ? total + modifier.amount : total),
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
  event: T
): Extract<GameEvent, { type: T["type"] }> {
  let eventDraft: EventDraft = event;
  let damageReduction: { unitId: string; amount: number; abilityId: string } | undefined;
  let starCandy: { unitId: string; amount: number } | undefined;
  const damageEvent = event as unknown as {
    type: string;
    target?: { type: string; unitId?: string };
    amount?: number;
  };
  if (
    damageEvent.type === "DAMAGE_ASSIGNED" &&
    damageEvent.target?.type === "unit" &&
    damageEvent.target.unitId &&
    (damageEvent.amount ?? 0) > 0
  ) {
    const reduction = reduceFirstDamageByAbility(state, damageEvent.target.unitId, damageEvent.amount ?? 0);
    if (reduction.reduced > 0) {
      const unit = state.combat?.units[damageEvent.target.unitId];
      if (unit) unit.damage = Math.max(0, unit.damage - reduction.reduced);
      eventDraft = { ...event, amount: reduction.amount };
      damageReduction = {
        unitId: damageEvent.target.unitId,
        amount: reduction.reduced,
        abilityId: reduction.abilityId ?? "kivotos-iron-horus"
      };
    }
    // Star Candy runs AFTER the printed reduction (and after every printed cap,
    // which clamped further upstream): the shield eats what is still coming.
    const candy = consumeStarCandyShield(
      state,
      damageEvent.target.unitId,
      (eventDraft as { amount?: number }).amount ?? damageEvent.amount ?? 0
    );
    if (candy.reduced > 0) {
      const unit = state.combat?.units[damageEvent.target.unitId];
      if (unit) unit.damage = Math.max(0, unit.damage - candy.reduced);
      eventDraft = { ...eventDraft, amount: candy.amount } as EventDraft;
      starCandy = { unitId: damageEvent.target.unitId, amount: candy.reduced };
    }
  }
  const nextEvent = {
    id: `evt_${nextEventNumber(state)}`,
    ...(state.turn?.mode === "parallel" && state.combat ? { combatContextId: state.combat.id } : {}),
    ...eventDraft
  } as unknown as Extract<GameEvent, { type: T["type"] }>;

  state.eventLog.push(nextEvent);
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
        message: `${unit.cardName}'s damage reduction prevents ${damageReduction.amount} damage.`
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
        message: `${unit.cardName}'s Star Candy absorbs ${starCandy.amount} damage.`
      });
    }
  }
  return nextEvent;
}
