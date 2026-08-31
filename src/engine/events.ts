import type { GameEvent, GameState } from "./state";
import { unitAbilities } from "@/data/units/abilities";

type EventDraft = Omit<GameEvent, "id">;

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
  }
  const nextEvent = {
    id: `evt_${nextEventNumber(state)}`,
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
  return nextEvent;
}
