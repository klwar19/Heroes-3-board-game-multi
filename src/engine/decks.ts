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
