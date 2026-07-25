import { appendEvent, eventSeedNumber } from "./events";
import { createSeededRandom } from "./random";
import type { CardId, GameState, PlayerId } from "./state";

export const SHARED_DECK_IDS = [
  "spells",
  "spells-expert",
  "abilities",
  "artifacts",
  "artifacts-minor",
  "artifacts-major",
  "artifacts-relic"
] as const;
export type SharedDeckId = (typeof SHARED_DECK_IDS)[number];

export function isSharedDeckId(deckId: string): deckId is SharedDeckId {
  return (SHARED_DECK_IDS as readonly string[]).includes(deckId);
}

/**
 * Face-up discard invariant: every SHARED deck (Spells / Abilities / Artifacts
 * and their split tiers) ALWAYS shows one card face-up on its discard pile.
 *
 * Setup flips the first one (`makeSharedDecks`); this keeps it true for the rest
 * of the game — the instant the LAST discarded card is TAKEN (a Search's "take
 * the top discard", the Genie wish, an Artifact-Merchant discard-top buy, a
 * recovery artifact…) the deck's next draw-pile card is flipped into its place,
 * exactly like the physical game.
 *
 * ONE seam: called at the tail of every action transaction (`applyAction`) with
 * the PRE-action state, so no take path can bypass it and none has to remember
 * to refill. It moves a card only from that deck's own draw pile to its own
 * discard pile, so nothing is created or lost and every downstream tier /
 * uniqueness gate still applies to the flipped card.
 *
 * Three deliberate limits:
 *  - `before` gates it on the pile having HELD a card when the action started.
 *    A pile that was already empty is left alone — the rule is "when the last
 *    card is taken, flip a new one", not "conjure a face-up card onto an empty
 *    pile" (which would also quietly steal a card another effect had just put
 *    on the deck top).
 *  - never while a pendingChoice is open: an open decision can be HOLDING cards
 *    lifted out of a deck (a Search's revealed cards, a Pandora scry, the
 *    discard face-up pick) that are about to land back on that pile, so flipping
 *    a replacement then would burn a draw-pile card for nothing. The invariant
 *    re-checks on the next action, so the flip lands as soon as it settles.
 *  - a deck whose draw pile is ALSO empty has nothing left to show and is left
 *    alone (a Search reshuffle refills the draw pile first).
 *
 * Deliberately silent (no feed event): the discard top is rendered on the table,
 * so a line per flip would be noise, and the state is public either way.
 */
export function refillSharedDeckDiscards(state: GameState, before: GameState): void {
  if (state.pendingChoice) {
    return;
  }
  for (const deckId of SHARED_DECK_IDS) {
    const deck = state.decks[deckId];
    if (!deck || deck.discardPile.length > 0 || deck.drawPile.length === 0) {
      continue;
    }
    if ((before.decks[deckId]?.discardPile.length ?? 0) === 0) {
      continue;
    }
    deck.discardPile.push(deck.drawPile.pop() as CardId);
  }
}

/**
 * Deterministic Fisher-Yates shuffle. Every shuffle in the engine must come
 * through here so multiplayer clients replay identical deck orders from the
 * shared game seed.
 */
export function shuffleCards(cards: CardId[], seed: string): CardId[] {
  const random = createSeededRandom(seed);
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(0, index);
    const held = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = held;
  }

  return shuffled;
}

/**
 * Draws up to `amount` cards from the player's personal deck into their hand.
 * When the draw pile empties mid-draw, the discard pile is shuffled into a new
 * draw pile (standard board-game reshuffle) before drawing continues.
 */
export function drawCardsForPlayer(state: GameState, playerId: PlayerId, amount: number): number {
  const player = state.players[playerId];
  if (!player || amount <= 0) {
    return 0;
  }

  let drawn = 0;
  let reshuffledDiscard = false;
  const cardIds: CardId[] = [];

  for (let count = 0; count < amount; count += 1) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      player.deck = shuffleCards(player.discard, `${state.seed}#reshuffle#${playerId}#${eventSeedNumber(state)}`);
      player.discard = [];
      reshuffledDiscard = true;
    }

    const card = player.deck.pop();
    if (!card) {
      break;
    }

    player.hand.push(card);
    cardIds.push(card);
    drawn += 1;
  }

  appendEvent(state, {
    type: "CARDS_DRAWN",
    playerId,
    count: drawn,
    requested: amount,
    reshuffledDiscard,
    cardIds
  });

  return drawn;
}
