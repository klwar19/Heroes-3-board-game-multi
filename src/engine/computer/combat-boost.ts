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
