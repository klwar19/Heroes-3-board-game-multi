import { neutralCombatControllerId } from "../neutral-control";
import type { CardId, CombatState, GameState, PlayerState } from "../state";
import { isComputerPlayer, sessionModeOf } from "./control";
import { toPhantomCardId } from "../phantom-cards";

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
  "stat.attack.empowered",
  "stat.defense.empowered",
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
  // The boost hands the game's own distinct Empowered Attack/Defense cards
  // (stat.*.empowered — intrinsically empowered, one each), NOT a by-card-id
  // mark on the plain statistic, which would wrongly empower the seat's real
  // Attack/Defense copies too (user ruling 2026-09-17: only the bonus is
  // empowered). Nothing is added to empoweredAbilities.
  for (const cardId of COMPUTER_COMBAT_BOOST_CARDS) {
    player.hand.push(cardId);
  }
  combat.computerBoost = {
    playerId,
    cardIds: [...COMPUTER_COMBAT_BOOST_CARDS],
    empoweredAdded: [],
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
    // Grant DISTINCT phantom ids (base + marker), not the shared base ids: the
    // phantom behaves like the base everywhere (cardLibrary alias) but is
    // trackable, so cleanup removes exactly the granted copies and never a real
    // Power / Magic Arrow. See phantom-cards.ts.
    const phantomIds = COMPUTER_PHANTOM_COMBAT_CARDS.map(toPhantomCardId);
    for (const cardId of phantomIds) player.hand.push(cardId);
    granted.push({ playerId, cardIds: phantomIds });
  }
  combat.computerPhantomCards = granted.length > 0 ? granted : null;
}

/** Every card-holding pile a phantom could reach during a combat. */
function phantomHoldingPiles(player: PlayerState): CardId[][] {
  const piles: CardId[][] = [player.hand, player.discard, player.deck];
  if (player.spellBook) piles.push(player.spellBook);
  if (player.spellBookUsed) piles.push(player.spellBookUsed);
  return piles;
}

/**
 * Combat-end teardown for the phantom cards: remove ONE instance of each
 * injected id from each granted seat's piles. Consume a PLAYED copy first
 * (discard → deck) and only then a copy still in HAND — so when the seat played
 * the free phantom and KEPT its genuinely-owned twin in hand, the owned card
 * survives IN HAND (available next turn), not shoved into the discard. User
 * ruling (2026-09-18, live tutoring): spending the disposable bonus must NOT cost
 * a real card its hand slot — the whole point of using the bonus is to keep the
 * real one in hand. (The old hand-first order deleted the kept hand copy and left
 * the played one in discard, so a correct "spend the bonus" play still lost the
 * card from hand.) A genuinely owned twin still survives with the correct count.
 */
export function removeComputerPhantomCards(state: GameState): void {
  const combat = state.combat;
  const granted = combat?.computerPhantomCards;
  if (!combat || !granted) return;
  for (const { playerId, cardIds } of granted) {
    const player = state.players[playerId];
    if (!player) continue;
    const phantomIds = new Set(cardIds);
    // A phantom disappears after combat NO MATTER WHAT it did in the fight. Its id
    // is distinct, so scrub EVERY granted copy from EVERY pile it could have
    // reached — hand (unused / Knowledge-recalled), discard (played), deck (a
    // reshuffle), spell book (a stash) — without ever touching a genuinely-owned
    // Power or Magic Arrow (those keep the plain base id).
    for (const pile of phantomHoldingPiles(player)) {
      for (let index = pile.length - 1; index >= 0; index -= 1) {
        if (phantomIds.has(pile[index])) pile.splice(index, 1);
      }
    }
  }
  combat.computerPhantomCards = null;
}

/**
 * Combat-end teardown: remove ONE instance of each injected card id from the
 * seat's piles (hand → discard → deck, wherever it landed) and strip the
 * temporary Empower marks. The boost cards are the game's OWN distinct Empowered
 * ids (stat.*.empowered), not shared with the plain statistic, so removing one
 * instance can only hit an injected copy unless the seat genuinely owns an
 * Empowered twin — in which case exactly one is removed and the twin survives.
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
