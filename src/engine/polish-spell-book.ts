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

/** Every shared Spell deck: Polish merges them, BINH splits basic/expert. */
function sharedSpellDecks(state: Pick<GameState, "decks">) {
  return Object.entries(state.decks)
    .filter(([id]) => id.startsWith("spells"))
    .map(([, deck]) => deck);
}

/**
 * Tarnum (Conflux) VI — "Search(1) Spell twice" — under POLISH SPELL BOOK.
 *
 * USER RULING 2026-08-22 ("it adds 2 spells to the list — instead it should
 * allow to cast a spell from discard … or cast spells instantly (if able), not
 * add to the card in hand"): with the Book on, a Searched Spell is NEVER added
 * to the hand and never inscribed into the Book. It is laid FACE UP on the
 * shared Spell discard and the free over-limit cast is made FROM THERE — which
 * is also why an uncast one simply stays on that discard (the next Search /
 * Helm cast can reach it) instead of clogging a hand that could never cast it
 * (a Polish hand Spell is uncastable: only the Book + Cast a Spell casts).
 *
 * This is THE one zone read shared by the offer layer (legal-actions' two
 * over-limit passes) and the two consume seams (reducer's CAST_SPELL and
 * PLAY_REACTION arms), so they can never disagree about where the card sits.
 * With the rule OFF it is the classic `hand.includes` check, byte-identical.
 */
export function tarnumOverlimitSpellAvailable(
  state: Pick<GameState, "ruleset" | "adventure" | "decks">,
  player: PlayerState,
  cardId: CardId
): boolean {
  if (!polishSpellBookEnabled(state)) {
    return player.hand.includes(cardId);
  }
  return sharedSpellDecks(state).some((deck) => deck.discardPile.includes(cardId));
}

/**
 * Polish reading only: lift one flagged Searched Spell off the shared Spell
 * discard so the cast can relocate it (deck top / discard) like the classic
 * hand cast does. Returns false when it is not there (a forged play).
 */
export function takeTarnumOverlimitSpellFromSharedDiscard(
  state: Pick<GameState, "decks">,
  cardId: CardId
): boolean {
  for (const deck of sharedSpellDecks(state)) {
    const index = deck.discardPile.lastIndexOf(cardId);
    if (index >= 0) {
      deck.discardPile.splice(index, 1);
      return true;
    }
  }
  return false;
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
  player?: PlayerState,
  options?: { atRoundStart?: boolean }
): boolean {
  // ROUND-START reading (`atRoundStart`): a `current-turn` effect of THIS
  // player is already over. The round only wraps once every seat's turn has
  // ended, and the wrap runs `startAdventureRound` (this refresh) and THEN
  // `startPlayerTurn`, which is where `expireEffectsForTurnEnd` actually drops
  // the effect — so at this exact moment a spent Water Walk / Fly still reads
  // "live" although its owner can never benefit from it again. Counting it
  // withheld the refresh for the WHOLE new round (the Spell only came back one
  // round late, at the NEXT round start). Only an effect stamped to expire at
  // the BOOK OWNER's own turn end is discounted; a foreign-owned or
  // longer-lived effect still blocks, exactly as before.
  const turnScopedIsOver = options?.atRoundStart === true;
  if (
    state.activeEffects.some(
      (effect) =>
        effect.source.type === "card" &&
        effect.source.cardId === cardId &&
        (effect.source.controllerId === playerId || effect.controllerId === playerId) &&
        !(turnScopedIsOver && effect.expiresAtTurnEndPlayerId === playerId)
    )
  ) {
    return true;
  }
  return Boolean(player?.ongoingCards?.some((entry) => entry.cardId === cardId));
}

/**
 * The ROUND-START whole-used-side refresh, as ONE partition: which used Book
 * Spells go back to the refreshed side ("only the in-effect gate applies" — the
 * once-per-round mid-round limit deliberately does NOT, the round start IS the
 * round mechanism) and which stay used. Both halves come from a single
 * `polishBookSpellEffectIsLive(..., { atRoundStart: true })` read, so the
 * refresh and the leftover list can never disagree (they used to be two
 * independent filters at the call site).
 */
export function partitionPolishBookAtRoundStart(
  state: Pick<GameState, "activeEffects">,
  player: PlayerState
): { refresh: CardId[]; stillInEffect: CardId[] } {
  const refresh: CardId[] = [];
  const stillInEffect: CardId[] = [];
  for (const cardId of player.spellBookUsed ?? []) {
    if (polishBookSpellEffectIsLive(state, player.id, cardId, player, { atRoundStart: true })) {
      stillInEffect.push(cardId);
    } else {
      refresh.push(cardId);
    }
  }
  return { refresh, stillInEffect };
}

/**
 * "A single spell can be refreshed only once per round" (user rule 2026-08-07),
 * part of the Polish Spell Book mode itself — not a separate toggle.
 *
 * A Book Spell a MID-ROUND source already returned to the refreshed side this
 * game round may not be refreshed again until the next round start. Counted per
 * physical COPY: a player holding two genuine copies of the same Spell may
 * refresh each of them once (`polishSpellsRefreshedThisRound` keeps
 * multiplicity, and the budget is how many copies the Book holds).
 *
 * The ROUND-START whole-used-side refresh is exempt (it is the round mechanism)
 * and clears the markers for every player.
 */
export function polishSpellRefreshedThisRoundCount(player: PlayerState, cardId: CardId): number {
  return (player.polishSpellsRefreshedThisRound ?? []).filter((entry) => entry === cardId).length;
}

/** How many copies of this Spell the player owns in the Book (either side). */
function polishBookCopyCount(player: PlayerState, cardId: CardId): number {
  const refreshed = player.spellBook.filter((entry) => entry === cardId).length;
  const used = (player.spellBookUsed ?? []).filter((entry) => entry === cardId).length;
  return refreshed + used;
}

/**
 * The ONE read every MID-ROUND refresh path shares — offers and resolution
 * backstops alike, so they can never disagree. Returns the reason a refresh is
 * refused, or null when it may proceed.
 */
export function polishBookSpellRefreshBlocked(
  state: Pick<GameState, "activeEffects">,
  playerId: PlayerId,
  cardId: CardId,
  player: PlayerState
): "in-effect" | "already-refreshed" | null {
  if (polishBookSpellEffectIsLive(state, playerId, cardId, player)) {
    return "in-effect";
  }
  const refreshed = polishSpellRefreshedThisRoundCount(player, cardId);
  if (refreshed > 0 && refreshed >= Math.max(1, polishBookCopyCount(player, cardId))) {
    return "already-refreshed";
  }
  return null;
}

/** Record one successful MID-ROUND refresh against the once-per-round limit. */
export function markPolishSpellRefreshedThisRound(player: PlayerState, cardId: CardId): void {
  (player.polishSpellsRefreshedThisRound ??= []).push(cardId);
}

/** Forget every mid-round refresh marker (called by the round-start refresh). */
export function clearPolishSpellRefreshMarkers(player: PlayerState): void {
  if (player.polishSpellsRefreshedThisRound?.length) {
    player.polishSpellsRefreshedThisRound = [];
  }
}

/**
 * Used Book Spells a MID-ROUND source may refresh right now: in-effect Spells
 * AND Spells already refreshed this round are both excluded.
 */
export function midRoundRefreshablePolishUsedSpells(
  state: Pick<GameState, "activeEffects">,
  player: PlayerState
): CardId[] {
  return (player.spellBookUsed ?? []).filter(
    (cardId) => polishBookSpellRefreshBlocked(state, player.id, cardId, player) === null
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
