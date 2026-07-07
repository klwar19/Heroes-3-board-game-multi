import {
  MORALE_NEGATIVE_DECK_ID,
  MORALE_POSITIVE_DECK_ID,
  moraleCardPolarity,
  moraleDeckIdFor,
  moraleNegativeDeckCardIds,
  moralePositiveDeckCardIds,
  type MoraleCardPolarity
} from "@/data/cards/morale";
import { cardLibrary } from "@/data/cards/library";
import { shuffleCards } from "./decks";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import type { CardId, DeckState, GamePhase, GameState, PlayerId, PlayerState } from "./state";

const POSITIVE_MORALE_CARD_LIMIT = 2;

export {
  MORALE_NEGATIVE_DECK_ID,
  MORALE_POSITIVE_DECK_ID,
  POSITIVE_MORALE_CARD_LIMIT,
  type MoraleCardPolarity
};

export function moraleCardsRuleEnabled(state: GameState): boolean {
  return Boolean(state.adventure?.moraleCards);
}

export function makeMoraleDecks(seed: string): Record<string, DeckState> {
  return {
    [MORALE_POSITIVE_DECK_ID]: {
      id: MORALE_POSITIVE_DECK_ID,
      drawPile: shuffleCards(moralePositiveDeckCardIds, `${seed}#morale#positive`),
      discardPile: []
    },
    [MORALE_NEGATIVE_DECK_ID]: {
      id: MORALE_NEGATIVE_DECK_ID,
      drawPile: shuffleCards(moraleNegativeDeckCardIds, `${seed}#morale#negative`),
      discardPile: []
    }
  };
}

export function ensurePlayerMoraleCards(player: PlayerState): { positive: CardId[]; negative: CardId[] } {
  player.moraleCards ??= { positive: [], negative: [] };
  player.moraleCards.positive ??= [];
  player.moraleCards.negative ??= [];
  return player.moraleCards;
}

function ensureMoraleDeck(state: GameState, polarity: MoraleCardPolarity): DeckState {
  const deckId = moraleDeckIdFor(polarity);
  state.decks[deckId] ??= makeMoraleDecks(state.seed)[deckId];
  return state.decks[deckId];
}

function currentReturnPhase(state: GameState): GamePhase {
  if (state.phase !== "choice") {
    return state.phase;
  }
  return state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.returnPhase : "player-turn";
}

export function openMoralePositiveLimitChoiceIfNeeded(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const held = ensurePlayerMoraleCards(player).positive;
  if (held.length <= POSITIVE_MORALE_CARD_LIMIT) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `You may only keep ${POSITIVE_MORALE_CARD_LIMIT} Positive Morale cards. Discard one.`,
    options: held.map((cardId, index) => ({
      label: `Discard ${cardLibrary[cardId]?.name ?? cardId}${held.indexOf(cardId) === index ? "" : ` #${index + 1}`}`
    })),
    context: "morale-positive-limit",
    moralePositiveLimit: { cardIds: [...held] },
    returnPhase: currentReturnPhase(state)
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

export function drawMoraleCard(
  state: GameState,
  playerId: PlayerId,
  polarity: MoraleCardPolarity
): CardId | null {
  const player = state.players[playerId];
  if (!player) {
    return null;
  }

  const deckId = moraleDeckIdFor(polarity);
  const deck = ensureMoraleDeck(state, polarity);
  let reshuffledDiscard = false;
  if (deck.drawPile.length === 0 && deck.discardPile.length > 0) {
    deck.drawPile = shuffleCards(deck.discardPile, `${state.seed}#morale-reshuffle#${deckId}#${eventSeedNumber(state)}`);
    deck.discardPile = [];
    reshuffledDiscard = true;
  }

  const cardId = deck.drawPile.pop();
  if (!cardId) {
    return null;
  }

  ensurePlayerMoraleCards(player)[polarity].push(cardId);
  appendEvent(state, {
    type: "MORALE_CARD_DRAWN",
    playerId,
    cardId,
    polarity,
    reshuffledDiscard
  });
  if (polarity === "positive") {
    openMoralePositiveLimitChoiceIfNeeded(state, playerId);
  }
  return cardId;
}

export function discardHeldMoraleCardByIndex(
  state: GameState,
  playerId: PlayerId,
  polarity: MoraleCardPolarity,
  index: number,
  reason: "cancelled-by-positive" | "positive-limit"
): CardId | null {
  const player = state.players[playerId];
  if (!player) {
    return null;
  }
  const held = ensurePlayerMoraleCards(player)[polarity];
  const [cardId] = held.splice(index, 1);
  if (!cardId) {
    return null;
  }
  ensureMoraleDeck(state, polarity).discardPile.push(cardId);
  appendEvent(state, {
    type: "MORALE_CARD_DISCARDED",
    playerId,
    cardId,
    polarity,
    reason
  });
  return cardId;
}

export function returnHeldMoraleCardToDeckBottom(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  reason: "used"
): boolean {
  const polarity = moraleCardPolarity(cardId);
  const player = state.players[playerId];
  if (!polarity || !player) {
    return false;
  }
  const held = ensurePlayerMoraleCards(player)[polarity];
  const index = held.indexOf(cardId);
  if (index === -1) {
    return false;
  }
  held.splice(index, 1);
  ensureMoraleDeck(state, polarity).drawPile.unshift(cardId);
  appendEvent(state, {
    type: "MORALE_CARD_USED",
    playerId,
    cardId,
    polarity,
    reason
  });
  return true;
}

export function applyMoraleCardGain(state: GameState, playerId: PlayerId, amount: number): void {
  const player = state.players[playerId];
  if (!player || amount === 0) {
    return;
  }

  player.morale = 0;
  player.moraleOverflow = 0;
  player.discardHandAtTurnEnd = false;
  const held = ensurePlayerMoraleCards(player);

  for (let step = 0; step < Math.abs(amount); step += 1) {
    if (amount > 0) {
      if (held.negative.length > 0) {
        discardHeldMoraleCardByIndex(state, playerId, "negative", 0, "cancelled-by-positive");
      } else {
        drawMoraleCard(state, playerId, "positive");
      }
    } else {
      drawMoraleCard(state, playerId, "negative");
    }
  }
}
