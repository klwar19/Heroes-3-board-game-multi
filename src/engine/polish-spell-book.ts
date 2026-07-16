import { cardLibrary } from "@/data/cards/library";
import { houseRuleEnabled } from "./house-rules";
import type { CardId, CardLibrary, GameState, PlayerId } from "./state";

/** Unlimited generic M&M card minted by setup, Mage Guilds, and level grants. */
export const CAST_A_SPELL_CARD_ID = "spell.cast_a_spell";

export function isCastASpellCard(cardId: CardId): boolean {
  return cardId === CAST_A_SPELL_CARD_ID;
}

export function polishSpellBookEnabled(state: Pick<GameState, "ruleset" | "adventure">): boolean {
  return houseRuleEnabled(state, "polish-spell-book");
}

/**
 * Owned Spells enter the Polish Book, including starting Magic Arrow. The
 * generic enabler is deliberately excluded even though its physical card kind
 * is Spell (so its printed alternative +1 Power remains compatible).
 */
export function polishSpellCanEnterBook(cardId: CardId, cards: CardLibrary = cardLibrary): boolean {
  return cards[cardId]?.kind === "spell" && !isCastASpellCard(cardId);
}

/** Route one newly acquired owned card to its mandatory Polish destination. */
export function gainOwnedCard(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardLibrary = cardLibrary
): "spellBook" | "hand" {
  const player = state.players[playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  if (polishSpellBookEnabled(state) && polishSpellCanEnterBook(cardId, cards)) {
    player.spellBook.push(cardId);
    return "spellBook";
  }
  player.hand.push(cardId);
  return "hand";
}
