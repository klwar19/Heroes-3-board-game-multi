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

/** What a dig off the top of a player's own deck turned up. */
export interface OwnDeckDigResult {
  /** Cards taken off the top, in dig order (the first entry was the top card). */
  cardIds: CardId[];
  /** True when the discard pile had to be shuffled back in to keep the dig going. */
  reshuffledDiscard: boolean;
}

/**
 * THE one seam for taking cards off the top of a player's own Might & Magic
 * deck. When the deck runs out mid-dig the discard pile is shuffled into a new
 * deck (the standard board-game reshuffle) so the dig can finish the count the
 * card asks for; it stops early only when BOTH piles are genuinely empty.
 *
 * CALLER CONTRACT (this is what makes it terminate): the cards it returns are
 * held by the caller and must NOT be pushed onto `player.discard` until the
 * whole dig is over. A card discarded back mid-dig would be shuffled in and
 * dealt again — the dig would re-read its own rejects, and a "dig until X" scan
 * would never finish. With the rejects held aside nothing is ever added to the
 * discard pile while the dig runs, so at most ONE reshuffle can happen and the
 * loop always ends.
 */
export function digFromOwnDeckTop(
  state: GameState,
  playerId: PlayerId,
  amount: number,
  seedTag: string,
  options?: {
    /**
     * Every card whose current play/cast has not finished resolving. These
     * cards have often already entered the discard pile, but must not be swept
     * into an empty-deck reshuffle and dealt back before their effects finish.
     * One occurrence is protected per entry, so genuine duplicate copies still
     * shuffle normally.
     */
    inFlightCardIds?: readonly CardId[];
  }
): OwnDeckDigResult {
  const player = state.players[playerId];
  const cardIds: CardId[] = [];
  let reshuffledDiscard = false;
  if (!player || amount <= 0) {
    return { cardIds, reshuffledDiscard };
  }

  for (let count = 0; count < amount; count += 1) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      const protectedCounts = new Map<CardId, number>();
      for (const cardId of options?.inFlightCardIds ?? []) {
        protectedCounts.set(cardId, (protectedCounts.get(cardId) ?? 0) + 1);
      }
      const held: CardId[] = [];
      const toShuffle: CardId[] = [];
      for (const cardId of player.discard) {
        const remaining = protectedCounts.get(cardId) ?? 0;
        if (remaining > 0) {
          held.push(cardId);
          protectedCounts.set(cardId, remaining - 1);
        } else {
          toShuffle.push(cardId);
        }
      }
      if (toShuffle.length === 0) {
        break; // nothing left to shuffle back in but the card being played
      }
      player.deck = shuffleCards(toShuffle, `${state.seed}#${seedTag}#${playerId}#${eventSeedNumber(state)}`);
      player.discard = held;
      reshuffledDiscard = true;
    }

    const card = player.deck.pop();
    if (!card) {
      break;
    }
    cardIds.push(card);
  }

  return { cardIds, reshuffledDiscard };
}

/**
 * The same rule for a SHARED deck: when its draw pile has run out, shuffle its
 * discard pile back into it so a draw / dig can keep going (exactly what
 * `revealSharedDeckSearch` already does mid-Search). Returns true when a
 * reshuffle actually happened.
 *
 * Same CALLER CONTRACT as `digFromOwnDeckTop`: cards this dig has already looked
 * at must be held aside (a local array, tucked back or discarded once the dig
 * ends), never pushed onto `deck.discardPile` while the dig runs — otherwise the
 * reshuffle would deal them again.
 */
export function reshuffleSharedDeckIfEmpty(state: GameState, deckId: string, seedTag: string): boolean {
  const deck = state.decks[deckId];
  if (!deck || deck.drawPile.length > 0 || deck.discardPile.length === 0) {
    return false;
  }
  deck.drawPile = shuffleCards(deck.discardPile, `${state.seed}#${seedTag}#${deckId}#${eventSeedNumber(state)}`);
  deck.discardPile = [];
  return true;
}

/**
 * Draws up to `amount` cards from the player's personal deck into their hand.
 * When the draw pile empties mid-draw, the discard pile is shuffled into a new
 * draw pile (standard board-game reshuffle) before drawing continues.
 */
export function drawCardsForPlayer(
  state: GameState,
  playerId: PlayerId,
  amount: number,
  options?: { inFlightCardIds?: readonly CardId[] }
): number {
  const player = state.players[playerId];
  if (!player || amount <= 0) {
    return 0;
  }

  const { cardIds, reshuffledDiscard } = digFromOwnDeckTop(state, playerId, amount, "reshuffle", options);
  player.hand.push(...cardIds);

  appendEvent(state, {
    type: "CARDS_DRAWN",
    playerId,
    count: cardIds.length,
    requested: amount,
    reshuffledDiscard,
    cardIds
  });

  return cardIds.length;
}
