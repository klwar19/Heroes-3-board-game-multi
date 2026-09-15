import { neutralCombatControllerId } from "../neutral-control";
import type { CardId, CombatState, GameState } from "../state";
import { isComputerPlayer, sessionModeOf } from "./control";

/**
 * Single-player smoothing (house rule #2, sibling of guaranteed-wins.ts): at
 * the start of every NON-PvP combat a computer seat fights, it draws ONE
 * temporary Attack card and ONE temporary Defense card (the plain statistic
 * instants) into its hand, both Empowered for the fight — their Expert side
 * (+2) plays without spending a crown. The AI's existing reaction policy then
 * uses them exactly like any held statistic card (scoreStatReaction ranks an
 * attack/defense stat reaction above PASS, and the crown-free Expert side is
 * offered by the normal legal-actions gate). At combat end the two injected
 * copies are REMOVED FROM THE GAME — wherever they ended up (hand if unused,
 * discard if played, deck if a mid-combat reshuffle swallowed them) — and the
 * temporary Empower marks are stripped, so nothing persists past the battle.
 *
 * Leading with what does NOT get the boost (the abuse guards):
 * - PvP battles NEVER qualify (a human or another seat is a participant) —
 *   `combat.context.kind` must be "neutral" (guard fields AND Creature Banks).
 * - Sandbox/Battle-Test combats and multiplayer sessions are untouched.
 * - A PvP-Neutral-Control controller (defensive; the mode is multiplayer-only)
 *   disables it — never hand the attacker free cards in a human-played fight.
 * - A seat that already Empowered a real Attack/Defense card (bank reward)
 *   keeps that empowerment: only marks THIS module added are stripped, and
 *   only one card instance per injected id is removed.
 * - Guaranteed-win fights never reach it (they short-circuit combat start).
 *
 * Honest limit: a computer seat eliminated mid-combat skips the cleanup (the
 * dead seat's cards no longer matter); every fought-out, retreated or
 * surrendered combat cleans up through finalizeAdventureCombat.
 */
export const COMPUTER_COMBAT_BOOST_CARDS: readonly CardId[] = [
  "stat.attack",
  "stat.defense",
];

/**
 * Phantom combat cards (user ruling 2026-09-15): a SEPARATE, always-on AI
 * advantage — every combat, EACH computer seat also fields one Power and one
 * Magic Arrow so it can reliably deal magic damage (Power boosts the Arrow) when
 * its bodies alone cannot break a guard. Unlike the Attack/Defense smoothing
 * boost above, these:
 *  - apply in EVERY combat kind, including PvP and human-controlled-neutral
 *    (the Attack/Defense cards deliberately never enter a PvP fight);
 *  - are granted to the attacker OR the defender, whichever seat(s) the computer
 *    controls;
 *  - are NOT Empowered (a plain Power stat and a spell cast on its own timing).
 * Like the boost, they are removed from the game at combat end (never kept in
 * hand or discard). Guaranteed-win fights short-circuit combat start before the
 * injection, so they never receive phantom cards either.
 */
export const COMPUTER_PHANTOM_COMBAT_CARDS: readonly CardId[] = [
  "stat.power",
  "spell.magic_arrow",
];

/** Whether the just-assembled combat qualifies for the temp-card boost. */
export function combatQualifiesForComputerBoost(
  state: GameState,
  combat: CombatState,
): boolean {
  if (sessionModeOf(state) !== "single-player") {
    return false;
  }
  if (combat.context.kind !== "neutral" || combat.outcome) {
    return false;
  }
  // Idempotence: finalizeCombatStart can be re-entered (Wayfarer decision,
  // tactics drain) — never inject twice into the same fight.
  if (combat.computerBoost) {
    return false;
  }
  if (!isComputerPlayer(state, combat.attackerPlayerId)) {
    return false;
  }
  if (neutralCombatControllerId(state, combat)) {
    return false;
  }
  return true;
}

/**
 * Injects the two temporary Empowered statistic cards into the computer
 * attacker's hand at combat start. Tracked on `combat.computerBoost` so the
 * combat-end cleanup can remove exactly what was added.
 */
export function applyComputerCombatBoost(state: GameState): void {
  const combat = state.combat;
  if (!combat || !combatQualifiesForComputerBoost(state, combat)) {
    return;
  }
  const playerId = combat.attackerPlayerId;
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const empoweredAdded: CardId[] = [];
  for (const cardId of COMPUTER_COMBAT_BOOST_CARDS) {
    player.hand.push(cardId);
    player.empoweredAbilities ??= [];
    if (!player.empoweredAbilities.includes(cardId)) {
      player.empoweredAbilities.push(cardId);
      empoweredAdded.push(cardId);
    }
  }
  combat.computerBoost = {
    playerId,
    cardIds: [...COMPUTER_COMBAT_BOOST_CARDS],
    empoweredAdded,
  };
}

/**
 * Injects the un-Empowered phantom Power + Magic Arrow cards into EVERY
 * computer-controlled seat in the just-assembled combat (attacker and/or
 * defender), in any combat kind. Tracked on `combat.computerPhantomCards` so the
 * combat-end cleanup removes exactly what was added. Idempotent across
 * finalizeCombatStart re-entries.
 */
export function applyComputerPhantomCards(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.outcome || combat.computerPhantomCards) return;
  const seats = [...new Set([combat.attackerPlayerId, combat.defenderPlayerId])];
  const granted: { playerId: string; cardIds: CardId[] }[] = [];
  for (const playerId of seats) {
    const player = state.players[playerId];
    if (!player || !isComputerPlayer(state, playerId)) continue;
    for (const cardId of COMPUTER_PHANTOM_COMBAT_CARDS) player.hand.push(cardId);
    granted.push({ playerId, cardIds: [...COMPUTER_PHANTOM_COMBAT_CARDS] });
  }
  combat.computerPhantomCards = granted.length > 0 ? granted : null;
}

/**
 * Combat-end teardown for the phantom cards: remove ONE instance of each
 * injected id from each granted seat's piles (hand → discard → deck), exactly
 * like removeComputerCombatBoost. A genuinely owned twin survives.
 */
export function removeComputerPhantomCards(state: GameState): void {
  const combat = state.combat;
  const granted = combat?.computerPhantomCards;
  if (!combat || !granted) return;
  for (const { playerId, cardIds } of granted) {
    const player = state.players[playerId];
    if (!player) continue;
    for (const cardId of cardIds) {
      for (const pile of [player.hand, player.discard, player.deck]) {
        const index = pile.indexOf(cardId);
        if (index >= 0) {
          pile.splice(index, 1);
          break;
        }
      }
    }
  }
  combat.computerPhantomCards = null;
}

/**
 * Combat-end teardown: remove ONE instance of each injected card id from the
 * seat's piles (hand → discard → deck, wherever it landed) and strip the
 * temporary Empower marks. Card ids are indistinguishable between a real and
 * an injected copy, so exactly one instance per injected id is removed — a
 * genuinely owned twin survives with the correct count.
 */
export function removeComputerCombatBoost(state: GameState): void {
  const combat = state.combat;
  const boost = combat?.computerBoost;
  if (!combat || !boost) {
    return;
  }
  const player = state.players[boost.playerId];
  if (player) {
    for (const cardId of boost.cardIds) {
      for (const pile of [player.hand, player.discard, player.deck]) {
        const index = pile.indexOf(cardId);
        if (index >= 0) {
          pile.splice(index, 1);
          break;
        }
      }
    }
    if (boost.empoweredAdded.length > 0 && player.empoweredAbilities) {
      player.empoweredAbilities = player.empoweredAbilities.filter(
        (cardId) => !boost.empoweredAdded.includes(cardId),
      );
    }
  }
  combat.computerBoost = null;
}
