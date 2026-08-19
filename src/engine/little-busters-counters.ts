import { markUnitRemovedIfNeeded } from "./combat-units";
import { drawCardsForPlayer } from "./decks";
import { appendEvent, eventSeedNumber } from "./events";
import { createSeededRandom } from "./random";
import { noteUnitDamagedForTokens } from "./tokens";
import type { CombatState, CombatUnitState, GameState, PlayerId } from "./state";

/**
 * PvP anti-Little-Busters counters (USER RULE): a fighter facing a Little
 * Busters seat in a player-vs-player battle may spend gold on up to three
 * one-off effects during the fight, themed on the campus's own "school
 * festival contribution" economy. Each is optional, costs 1 gold, and is
 * offered at most once per fighter per combat:
 *
 *   - "discard": the Little Busters seat discards 1 random hand card.
 *   - "damage":  the Little Busters campus hero UNIT takes 3 effect damage.
 *   - "draw":    the spending fighter draws 1 card.
 *
 * The availability derivation here is THE shared read the legal-action offer
 * and the reducer handler both consult, so a rendered button can never be
 * refused and a refused action can never have been rendered.
 */
export type LittleBustersCounter = "discard" | "damage" | "draw";

export const LITTLE_BUSTERS_COUNTER_COST = 1;

export const LITTLE_BUSTERS_COUNTERS: readonly LittleBustersCounter[] = ["discard", "damage", "draw"];

const LITTLE_BUSTERS_HERO_DAMAGE = 3;

/** A unit is alive while it still has Health (removal never clears `position`). */
function unitAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

/**
 * The Little Busters seat this fighter is battling in a live PvP combat, or
 * null if the counters do not apply (not a PvP fight, this seat is not a
 * fighter, the fight is over, or the opponent is not Little Busters).
 */
export function littleBustersCounterOpponentId(state: GameState, playerId: PlayerId): PlayerId | null {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player" || state.phase !== "combat" || combat.outcome) {
    return null;
  }
  const { attackerPlayerId, defenderPlayerId } = combat;
  let opponentId: PlayerId | null = null;
  if (playerId === attackerPlayerId) opponentId = defenderPlayerId;
  else if (playerId === defenderPlayerId) opponentId = attackerPlayerId;
  if (!opponentId) return null;
  return state.players[opponentId]?.factionId === "little_busters" ? opponentId : null;
}

/** The living Little Busters campus hero unit on the board (the "damage" target). */
function littleBustersHeroUnit(combat: CombatState, opponentId: PlayerId): CombatUnitState | null {
  return (
    Object.values(combat.units).find(
      (unit) => unit.controllerId === opponentId && unit.heroUnit && unitAlive(unit)
    ) ?? null
  );
}

function counterUsed(combat: CombatState, playerId: PlayerId, counter: LittleBustersCounter): boolean {
  return (combat.littleBustersCountersUsed?.[playerId] ?? []).includes(counter);
}

function counterLabel(counter: LittleBustersCounter, opponentName: string): string {
  switch (counter) {
    case "discard":
      return `Pay ${LITTLE_BUSTERS_COUNTER_COST} gold: ${opponentName} discards a random card (school festival contribution)`;
    case "damage":
      return `Pay ${LITTLE_BUSTERS_COUNTER_COST} gold: deal ${LITTLE_BUSTERS_HERO_DAMAGE} damage to ${opponentName}'s hero`;
    case "draw":
      return `Pay ${LITTLE_BUSTERS_COUNTER_COST} gold: draw a card`;
  }
}

/** The counters this fighter may spend right now (label + counter key). */
export function availableLittleBustersCounters(
  state: GameState,
  playerId: PlayerId
): { counter: LittleBustersCounter; label: string }[] {
  const opponentId = littleBustersCounterOpponentId(state, playerId);
  const combat = state.combat;
  if (!opponentId || !combat) return [];
  const player = state.players[playerId];
  if (!player || (player.resources.gold ?? 0) < LITTLE_BUSTERS_COUNTER_COST) return [];
  const opponent = state.players[opponentId];
  const opponentName = opponent?.name ?? "Little Busters";
  const offers: { counter: LittleBustersCounter; label: string }[] = [];
  for (const counter of LITTLE_BUSTERS_COUNTERS) {
    if (counterUsed(combat, playerId, counter)) continue;
    if (counter === "discard" && (opponent?.hand.length ?? 0) === 0) continue;
    if (counter === "damage" && !littleBustersHeroUnit(combat, opponentId)) continue;
    offers.push({ counter, label: counterLabel(counter, opponentName) });
  }
  return offers;
}

function markCounterUsed(combat: CombatState, playerId: PlayerId, counter: LittleBustersCounter): void {
  const used = combat.littleBustersCountersUsed ?? (combat.littleBustersCountersUsed = {});
  used[playerId] = [...(used[playerId] ?? []), counter];
}

/**
 * Resolve one counter. Self-validating: re-derives availability, so an illegal
 * or duplicate request is a no-op. Deducts the gold, applies the effect and
 * records the spend so the counter cannot be taken again this combat.
 */
export function applyLittleBustersCounter(
  state: GameState,
  action: { playerId: PlayerId; counter: LittleBustersCounter }
): void {
  const { playerId, counter } = action;
  const combat = state.combat;
  if (!combat) return;
  const opponentId = littleBustersCounterOpponentId(state, playerId);
  if (!opponentId) return;
  const available = availableLittleBustersCounters(state, playerId);
  if (!available.some((offer) => offer.counter === counter)) return;
  const player = state.players[playerId];
  const opponent = state.players[opponentId];
  if (!player || !opponent) return;

  player.resources.gold -= LITTLE_BUSTERS_COUNTER_COST;

  switch (counter) {
    case "discard": {
      if (opponent.hand.length === 0) return;
      const random = createSeededRandom(`${state.seed}#lb-counter-discard#${eventSeedNumber(state)}`);
      const index = random.nextInt(0, opponent.hand.length - 1);
      const [discarded] = opponent.hand.splice(index, 1);
      if (discarded) opponent.discard.push(discarded);
      appendEvent(state, {
        type: "HAND_REFRESHED",
        playerId: opponentId,
        discarded: 1,
        drawn: 0,
        discardedCardIds: discarded ? [discarded] : []
      });
      break;
    }
    case "damage": {
      const target = littleBustersHeroUnit(combat, opponentId);
      if (!target) return;
      target.damage += LITTLE_BUSTERS_HERO_DAMAGE;
      noteUnitDamagedForTokens(state, target, LITTLE_BUSTERS_HERO_DAMAGE);
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "system" },
        target: { type: "unit", unitId: target.id },
        amount: LITTLE_BUSTERS_HERO_DAMAGE,
        damageKind: "effect"
      });
      markUnitRemovedIfNeeded(state, target);
      break;
    }
    case "draw": {
      drawCardsForPlayer(state, playerId, 1);
      break;
    }
  }

  markCounterUsed(combat, playerId, counter);
  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId,
    buildingId: `little-busters-counter-${counter}`,
    message: counterLabel(counter, opponent.name ?? "Little Busters")
  });
}
