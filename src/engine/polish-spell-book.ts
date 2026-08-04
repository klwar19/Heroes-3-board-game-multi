import { cardLibrary } from "@/data/cards/library";
import { houseRuleEnabled } from "./house-rules";
import type { CardId, CardLibrary, GameState, PlayerId, PlayerState } from "./state";

/** Unlimited generic M&M card minted by setup, Mage Guilds, and level grants. */
export const CAST_A_SPELL_CARD_ID = "spell.cast_a_spell";

/** Zone a player can hold an owned Spell in under Polish (or hand under classic). */
export type PolishCardZone = "hand" | "discard" | "spellBook" | "spellBookUsed";

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

/**
 * True for a real owned Spell (not the Cast-a-Spell enabler). Use in Event /
 * Pyramid / Forest "remove a Spell" menus so the enabler is not mistaken for
 * content the player owns in the Book.
 */
export function isOwnedSpellCard(cardId: CardId, cards: CardLibrary = cardLibrary): boolean {
  return polishSpellCanEnterBook(cardId, cards);
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

/**
 * "In effect" — the third Book section (house rule, user ruling 2026-08-04).
 *
 * A Book Spell whose cast left a LASTING effect on the table (Water Walk / Fly
 * "this turn", a combat-long Haste…) is neither refreshed nor used: it sits in
 * effect, exactly like a played Luck ability in the Ongoing tray, and NO refresh
 * source may return it to the refreshed side while that effect lives. When the
 * effect ends (turn end / game-round end / combat end — whatever the spell's own
 * duration is) it becomes an ordinary used Book Spell and refreshes again.
 *
 * This is the ONE read every refresh path consults: the round-start whole-side
 * refresh, `refreshPolishUsedSpell` (Mysticism / Clone return / cancel paths) and
 * the discard-recovery "Refresh a Spell in your Spell Book" pick. A Polish Book
 * cast never enters `ongoingCards` (the physical card is in `spellBookUsed`), so
 * the live-effect read is the source of truth here; the tray is checked too so
 * the same helper is correct for a classic/old-Book card.
 */
export function polishBookSpellEffectIsLive(
  state: Pick<GameState, "activeEffects">,
  playerId: PlayerId,
  cardId: CardId,
  player?: PlayerState
): boolean {
  if (
    state.activeEffects.some(
      (effect) =>
        effect.source.type === "card" &&
        effect.source.cardId === cardId &&
        (effect.source.controllerId === playerId || effect.controllerId === playerId)
    )
  ) {
    return true;
  }
  return Boolean(player?.ongoingCards?.some((entry) => entry.cardId === cardId));
}

/** Used Book Spells eligible for a refresh right now (in-effect ones excluded). */
export function refreshablePolishUsedSpells(
  state: Pick<GameState, "activeEffects">,
  player: PlayerState
): CardId[] {
  return (player.spellBookUsed ?? []).filter(
    (cardId) => !polishBookSpellEffectIsLive(state, player.id, cardId, player)
  );
}

/**
 * Uninscribe an owned Polish Book Spell: remove from the Book (or a leaked
 * hand copy) and put it on the shared Spell discard. Never parks Spells in
 * the personal discard (they would be uncastable and un-refreshable under
 * Polish). Mirrors Rolling Spells' return convention.
 */
export function returnOwnedSpellToSharedDiscard(
  state: GameState,
  player: PlayerState,
  cardId: CardId,
  source: "spellBook" | "spellBookUsed" | "hand"
): void {
  if (source === "spellBook") {
    const index = player.spellBook.indexOf(cardId);
    if (index === -1) {
      return;
    }
    player.spellBook.splice(index, 1);
  } else if (source === "spellBookUsed") {
    const used = player.spellBookUsed ?? [];
    const index = used.indexOf(cardId);
    if (index === -1) {
      return;
    }
    used.splice(index, 1);
    player.spellBookUsed = used;
  } else {
    const index = player.hand.indexOf(cardId);
    if (index === -1) {
      return;
    }
    player.hand.splice(index, 1);
  }
  // Polish forces a merged `"spells"` deck; fall back to any spells* pile.
  const deck =
    state.decks.spells ??
    state.decks["spells-expert"] ??
    Object.entries(state.decks).find(([id]) => id.startsWith("spells"))?.[1];
  if (deck) {
    deck.discardPile.push(cardId);
  }
}

/**
 * Remove a card from a player zone into `removed` (Event / Pyramid / Forest
 * permanent remove). Book zones are first-class under Polish.
 */
export function removeCardFromPlayerZone(
  player: PlayerState,
  cardId: CardId,
  source: PolishCardZone
): boolean {
  if (source === "hand") {
    const index = player.hand.indexOf(cardId);
    if (index === -1) {
      return false;
    }
    player.hand.splice(index, 1);
    player.removed.push(cardId);
    return true;
  }
  if (source === "discard") {
    const index = player.discard.indexOf(cardId);
    if (index === -1) {
      return false;
    }
    player.discard.splice(index, 1);
    player.removed.push(cardId);
    return true;
  }
  if (source === "spellBook") {
    const index = player.spellBook.indexOf(cardId);
    if (index === -1) {
      return false;
    }
    player.spellBook.splice(index, 1);
    player.removed.push(cardId);
    return true;
  }
  const used = player.spellBookUsed ?? [];
  const index = used.indexOf(cardId);
  if (index === -1) {
    return false;
  }
  used.splice(index, 1);
  player.spellBookUsed = used;
  player.removed.push(cardId);
  return true;
}

/**
 * Cards matching an Event / Forest filter for remove-or-contribute menus.
 * Under Polish Spell Book, real Spells are read from the Book (refreshed +
 * used); Cast-a-Spell never counts as an "owned Spell" for spell filters.
 */
export function eventZoneMatches(
  state: Pick<GameState, "ruleset" | "adventure">,
  player: PlayerState,
  filter: "spell" | "spell-or-ability" | "artifact-or-spell" | "pool-kinds",
  cards: CardLibrary = cardLibrary
): { cardId: CardId; source: PolishCardZone }[] {
  const polish = polishSpellBookEnabled(state);
  const out: { cardId: CardId; source: PolishCardZone }[] = [];
  const seen = new Set<string>();

  const matches = (cardId: CardId): boolean => {
    const kind = cards[cardId]?.kind;
    switch (filter) {
      case "spell":
        // Owned Spells only — never the Cast-a-Spell enabler.
        return isOwnedSpellCard(cardId, cards);
      case "spell-or-ability":
        if (kind === "ability") {
          return true;
        }
        return isOwnedSpellCard(cardId, cards);
      case "artifact-or-spell":
        if (kind === "artifact") {
          return true;
        }
        return isOwnedSpellCard(cardId, cards);
      case "pool-kinds":
        if (kind === "artifact" || kind === "ability") {
          return true;
        }
        // Magical Forest: contribute real Spells (Book) or Cast-a-Spell from hand.
        return kind === "spell";
    }
  };

  const push = (cardId: CardId, source: PolishCardZone) => {
    if (!matches(cardId)) {
      return;
    }
    const uniq = `${source}:${cardId}`;
    if (seen.has(uniq)) {
      return;
    }
    seen.add(uniq);
    out.push({ cardId, source });
  };

  for (const cardId of player.hand) {
    // Cast-a-Spell is never an "owned Spell" for remove menus (spell /
    // spell-or-ability / artifact-or-spell). Magical Forest pool-kinds still
    // allows contributing the enabler from hand.
    if (polish && isCastASpellCard(cardId) && filter !== "pool-kinds") {
      continue;
    }
    push(cardId, "hand");
  }

  if (polish) {
    for (const cardId of player.spellBook ?? []) {
      push(cardId, "spellBook");
    }
    for (const cardId of player.spellBookUsed ?? []) {
      push(cardId, "spellBookUsed");
    }
  }

  return out;
}
