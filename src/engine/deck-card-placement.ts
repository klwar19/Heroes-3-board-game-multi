/**
 * "Top or bottom of its deck?" — the shared placement window.
 *
 * Polish Balance Pack (`polish-card-balance`): the reprinted Diplomacy adds
 * "Decide for each unpurchased unit: place its card on the top or bottom of its
 * appropriate deck." The Balance Pack's Diplomat's Ring / Ambassador's Sash
 * reprints (step 3) carry the same clause, so the flow lives here ONCE rather
 * than inside Diplomacy.
 *
 * Shape: ONE `OPTION_CHOICE` ("deck-card-placement") per card, resolved head-first
 * — each answer places that card and re-opens for the tail until the queue empties,
 * then restores the phase the first call captured. Two options only (top / bottom),
 * so the generic AI option scorer and the AFK/turn-timeout driver's `CHOOSE_OPTION`
 * path answer it with no bespoke policy and it can never stall.
 *
 * Deck convention (engine-wide): the TOP of a draw pile is the LAST element, so
 * "top" pushes and "bottom" unshifts.
 */

import { cardLibrary } from "@/data/cards/library";
import { appendEvent, nextEventNumber } from "./events";
import type { CardId, GamePhase, GameState, PlayerId } from "./state";

/** One card waiting to be placed back on a shared deck. */
export type DeckCardPlacement = {
  cardId: CardId;
  deckId: string;
  /** Display name for the prompt (defaults to the card's library name). */
  label?: string;
};

function placementName(placement: DeckCardPlacement): string {
  return placement.label ?? cardLibrary[placement.cardId]?.name ?? placement.cardId;
}

/**
 * Opens the placement window for `placements` (head first). Returns false — and
 * touches nothing — when the list is empty, so a caller can fall through to its
 * own bookkeeping.
 */
export function openDeckCardPlacementChoice(
  state: GameState,
  playerId: PlayerId,
  placements: DeckCardPlacement[],
  returnPhase: GamePhase,
  source?: string
): boolean {
  const pending = placements.filter((placement) => Boolean(state.decks[placement.deckId]));
  if (pending.length === 0) {
    return false;
  }
  const head = pending[0];
  const name = placementName(head);
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${source ? `${source}: ` : ""}place ${name} on the top or the bottom of its deck?`,
    options: [{ label: `Put ${name} on TOP of its deck` }, { label: `Put ${name} on the BOTTOM of its deck` }],
    context: "deck-card-placement",
    deckCardPlacement: { pending, ...(source ? { source } : {}) },
    returnPhase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  return true;
}

/**
 * Resolves one placement (`optionIndex` 0 = top, anything else = bottom), then
 * re-opens for the remaining cards or restores the captured phase.
 */
export function resolveDeckCardPlacementChoice(
  state: GameState,
  playerId: PlayerId,
  optionIndex: number
): void {
  const choice = state.pendingChoice;
  if (
    choice?.type !== "OPTION_CHOICE" ||
    choice.context !== "deck-card-placement" ||
    choice.playerId !== playerId ||
    !choice.deckCardPlacement
  ) {
    throw new Error("There is no deck placement to resolve.");
  }
  const { pending, source } = choice.deckCardPlacement;
  const [head, ...rest] = pending;
  const returnPhase = choice.returnPhase;
  const deck = head ? state.decks[head.deckId] : undefined;
  const toTop = optionIndex === 0;
  if (head && deck) {
    if (toTop) {
      deck.drawPile.push(head.cardId);
    } else {
      deck.drawPile.unshift(head.cardId);
    }
    appendEvent(state, {
      type: "EVENT_NOTE",
      playerId,
      message: `${state.players[playerId]?.name ?? playerId} puts ${placementName(head)} on the ${
        toTop ? "top" : "bottom"
      } of its deck.`
    });
  }

  state.pendingChoice = null;
  state.phase = returnPhase;
  state.priorityPlayerId = null;
  openDeckCardPlacementChoice(state, playerId, rest, returnPhase, source);
}
