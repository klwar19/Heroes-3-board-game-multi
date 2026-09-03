import { cardLibrary } from "@/data/cards/library";
import { returnCardUnderSharedDeckDiscardTop } from "./decks";
import { houseRuleEnabled } from "./house-rules";
import type {
  CardId,
  CardLibrary,
  CardOptionDefinition,
  EffectDefinition,
  GameState,
  PlayerId,
  PlayerState
} from "./state";

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
 * source may return it to the refreshed side while that effect lives. The
 * physical Book card is represented in `ongoingCards` until the effect ends,
 * then moves to its recorded used/refreshed destination.
 *
 * This is the ONE read every refresh path consults: the round-start whole-side
 * refresh, `refreshPolishUsedSpell` (Mysticism / Clone return / cancel paths) and
 * the discard-recovery "Refresh a Spell in your Spell Book" pick. A Polish Book
 * live-effect read remains the source of truth; the tray's effect ids are also
 * checked for defensive consistency.
 */
export function polishBookSpellEffectIsLive(
  state: Pick<GameState, "activeEffects"> & { combat?: GameState["combat"] },
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
  if (
    state.combat?.battlefieldTokens?.some(
      (token) =>
        token.controllerId === playerId && token.sourceSpellCardId === cardId
    )
  ) {
    return true;
  }
  const activeById = new Map(state.activeEffects.map((effect) => [effect.id, effect]));
  return Boolean(
    player?.ongoingCards?.some(
      (entry) =>
        entry.cardId === cardId &&
        entry.effectIds.some((effectId) => {
          const effect = activeById.get(effectId);
          return Boolean(
            effect &&
              !(turnScopedIsOver && effect.expiresAtTurnEndPlayerId === playerId),
          );
        }),
    ),
  );
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
  state: Pick<GameState, "activeEffects"> & { combat?: GameState["combat"] },
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
  state: Pick<GameState, "activeEffects"> & { combat?: GameState["combat"] },
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
  state: Pick<GameState, "activeEffects"> & { combat?: GameState["combat"] },
  player: PlayerState
): CardId[] {
  return (player.spellBookUsed ?? []).filter(
    (cardId) => polishBookSpellRefreshBlocked(state, player.id, cardId, player) === null
  );
}

/**
 * Every `filter` a TAKE_FROM_DISCARD / DISCARD_PICK recovery may carry. Kept
 * here beside the ONE shared matcher below so a new filter value cannot be
 * added to the resolution without the two legality gates learning it.
 */
export type DiscardRecoveryFilter =
  | "spell"
  | "non-artifact"
  | "specialty"
  | "power-or-knowledge-statistic"
  | "spell-or-specialty"
  | "magic-arrow"
  | "cast-enabler-or-specialty"
  | "polish-refresh-only";

/**
 * THE one filter read shared by `openDiscardPickChoice`'s candidate builder AND
 * both playability gates (`isOptionEffectPlayable`'s TAKE_FROM_DISCARD case and
 * the reaction-window twin `isInstantReactionUtility`). It used to be three
 * hand-copied `matchesFilter` closures, and the two gate copies knew neither
 * `cast-enabler-or-specialty` (the Balance Pack Adelaide IV filter) nor
 * `polish-refresh-only` — both fell through to a catch-all "any card matches",
 * so a recovery card looked playable whenever the discard pile was merely
 * NON-EMPTY and unplayable whenever it was empty.
 */
export function discardRecoveryFilterMatches(
  state: Pick<GameState, "ruleset" | "adventure">,
  cardId: CardId,
  filter: DiscardRecoveryFilter | undefined,
  cards: CardLibrary = cardLibrary
): boolean {
  const kind = cards[cardId]?.kind;
  switch (filter) {
    case undefined:
      return true;
    case "spell":
      return kind === "spell";
    case "non-artifact":
      return kind !== "artifact";
    case "specialty":
      return kind === "hero-specialty";
    case "spell-or-specialty":
      return kind === "spell" || kind === "hero-specialty";
    case "magic-arrow":
      return cardId === "spell.magic_arrow";
    // Polish Balance Pack Adelaide IV — BOOK-AWARE: with the Polish Book on the
    // printed "Cast a Spell or Specialty card" is exactly those two (owned Spells
    // live in the Book, so a raw Spell is never in the discard pile to take);
    // with the Book off there is no enabler and the card keeps its classic
    // printed reading, "Spell or Specialty".
    case "cast-enabler-or-specialty":
      if (kind === "hero-specialty") {
        return true;
      }
      return polishSpellBookEnabled(state) ? isCastASpellCard(cardId) : kind === "spell";
    // The Adelaide IV follow-up: only a used Book Spell may be picked (every
    // discard-pile candidate is filtered out by the caller's polish-recovery
    // exclusion, which adds the used-Book side instead).
    case "polish-refresh-only":
      return kind === "spell";
    case "power-or-knowledge-statistic": {
      const statisticType = cards[cardId]?.statisticType;
      return kind === "statistic" && (statisticType === "power" || statisticType === "knowledge");
    }
  }
}

/**
 * Which recovery filters read the Polish Book's USED side instead of a discard
 * pile that can no longer hold owned Spells. Shared by the candidate builder and
 * both gates for the same reason `discardRecoveryFilterMatches` is.
 */
export function discardRecoveryReadsPolishBook(
  state: Pick<GameState, "ruleset" | "adventure">,
  filter: DiscardRecoveryFilter | undefined
): boolean {
  return (
    polishSpellBookEnabled(state) &&
    (filter === "spell" ||
      filter === "spell-or-specialty" ||
      filter === "magic-arrow" ||
      filter === "polish-refresh-only")
  );
}

/**
 * Multiset subtraction: drop ONE occurrence per in-flight card id. A card whose
 * play is still resolving must not count as recoverable by its own resolution
 * (`recoveryInFlightCardIds`); duplicates keep their remaining copies.
 */
export function excludeInFlightOccurrences(
  pool: readonly CardId[],
  inFlightCardIds: readonly CardId[]
): CardId[] {
  const excludedCounts = new Map<CardId, number>();
  for (const cardId of inFlightCardIds) {
    excludedCounts.set(cardId, (excludedCounts.get(cardId) ?? 0) + 1);
  }
  return pool.filter((cardId) => {
    const remaining = excludedCounts.get(cardId) ?? 0;
    if (remaining <= 0) return true;
    excludedCounts.set(cardId, remaining - 1);
    return false;
  });
}

/**
 * "Does this recovery have anything to do right now?" — the ONE predicate both
 * playability gates ask, written to mirror `openDiscardPickChoice` exactly so an
 * offered recovery can never open an empty prompt (consuming the card for
 * nothing) and a recovery with real work can never be withheld.
 *
 * Three kinds of work, any one of which is enough:
 *  1. a takeable discard-pile card (under the Book a raw Spell is NOT takeable —
 *     it is excluded from the candidate list there, same as at resolution);
 *  2. the Polish enabler return (`filter: "spell"` only: the four recovery
 *     artifacts + Crown of Dragontooth hand back a "Cast a Spell" from the
 *     discard pile before any refresh);
 *  3. a refreshable used Book Spell — including the STANDALONE follow-up refresh
 *     of Balance Pack Adelaide IV (`polishRefreshAfter`), whose printed second
 *     sentence ("Refresh 1 Spell, once per round") stands on its own and must
 *     make the card playable with nothing at all to take.
 *
 * USER RULING 2026-08-25: the once-per-round limit belongs to the REFRESH, never
 * to the card. That falls out of (1) and (2) — a card with another job stays
 * playable once its refresh is spent, and only the refresh half no-ops.
 */
export function discardRecoveryHasWork(
  state: Pick<GameState, "ruleset" | "adventure" | "activeEffects">,
  player: PlayerState,
  pick: { filter?: DiscardRecoveryFilter; fromTop?: number; polishRefreshAfter?: boolean },
  /** The RAW discard pile — `fromTop` is sliced BEFORE the in-flight exclusion, exactly as `openDiscardPickChoice` does. */
  discard: readonly CardId[],
  inFlightCardIds: readonly CardId[] = [],
  cards: CardLibrary = cardLibrary
): boolean {
  const readsBook = discardRecoveryReadsPolishBook(state, pick.filter);
  // The enabler return reads the WHOLE pile and ignores `fromTop`, like resolution.
  if (readsBook && pick.filter === "spell" && discard.includes(CAST_A_SPELL_CARD_ID)) {
    return true;
  }
  const pool = excludeInFlightOccurrences(
    pick.fromTop ? discard.slice(-pick.fromTop) : discard,
    inFlightCardIds
  );
  if (
    pool.some(
      (cardId) =>
        discardRecoveryFilterMatches(state, cardId, pick.filter, cards) &&
        !(readsBook && cards[cardId]?.kind === "spell")
    )
  ) {
    return true;
  }
  const refreshable = midRoundRefreshablePolishUsedSpells(state, player).filter(
    (cardId) => !inFlightCardIds.includes(cardId)
  );
  if (readsBook && refreshable.some((cardId) => discardRecoveryFilterMatches(state, cardId, pick.filter, cards))) {
    return true;
  }
  return Boolean(pick.polishRefreshAfter) && polishSpellBookEnabled(state) && refreshable.length > 0;
}

/**
 * Uninscribe an owned Polish Book Spell: remove from the Book (or a leaked
 * hand copy) and put it on the shared Spell discard. Never parks Spells in
 * the personal discard (they would be uncastable and un-refreshable under
 * Polish).
 *
 * It lands UNDER that pile's face-up top, the same convention Rolling Spells
 * takes (`returnCardUnderSharedDeckDiscardTop`): the one caller is the
 * Tournament Morale "Search again" card, which re-opens the SAME Spell Search
 * right after — so a pushed-on-top Spell would come straight back as that
 * Search's take-the-top-discard proposition, the Rolling Spells bug in a
 * second flow.
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
  const deckId =
    (state.decks.spells && "spells") ??
    (state.decks["spells-expert"] && "spells-expert") ??
    Object.keys(state.decks).find((id) => id.startsWith("spells"));
  if (deckId) {
    returnCardUnderSharedDeckDiscardTop(state, deckId, cardId);
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

/**
 * A CAST_FROM_SPELL_DISCARD "cast a Spell you do not own" arm — the Helm of the
 * Alabaster Unicorn's option B, Ciele's Magic Arrow I/IV and their Balance-Pack
 * reprints.
 *
 * THE ONE shared read behind every surface that may spend such an arm:
 *   • the on-turn cast offer (`addSpellActions`),
 *   • the reaction-window offer (`getLegalReactionsForTrigger`'s Spell-deck pass
 *     — the printed ⚡ INSTANT: the discard top may be a TRIGGERED Spell such as
 *     Bless / Curse / Precision, which is playable ONLY inside a window),
 *   • both reducer consume seams (`performSpellCast` and `applyReactionPlayCore`).
 * Keeping them on one read is what stops an offer and its resolution disagreeing
 * about which arm is live or which Spell it names (the 2026-08-26 report: the
 * Helm's second part "still not working" for a castable discard top, because the
 * only surface that ever enumerated it was the on-turn cast path).
 */
export function castFromSpellDiscardArm(
  state: Pick<GameState, "ruleset" | "adventure">,
  cards: CardLibrary,
  enablerId: CardId,
  /**
   * Community Balance Change INTELLIGENCE prints TWO cast-from-discard sides
   * (basic counts toward the Spell limit, expert does not). When the caller names
   * a side, pick the option with the matching `expertOnly`-ness; every other
   * enabler prints one side and leaves this undefined, so the first-match
   * behaviour is byte-identical for them.
   */
  mode?: "basic" | "expert"
): { option: CardOptionDefinition; effect: Extract<EffectDefinition, { type: "CAST_FROM_SPELL_DISCARD" }> } | undefined {
  const enabler = cards[enablerId];
  if (enabler?.effect.type !== "CHOOSE_ONE") {
    return undefined;
  }
  // House-rule gated arms (Balance Pack Ciele I/IV print a Polish-Book cast AND
  // the classic one): take the FIRST whose gates pass, so exactly one reading is
  // live at a time.
  const option = enabler.effect.options.find(
    (entry) =>
      entry.effect.type === "CAST_FROM_SPELL_DISCARD" &&
      !(entry.requiresHouseRule && !houseRuleEnabled(state, entry.requiresHouseRule)) &&
      !(entry.forbidsHouseRule && houseRuleEnabled(state, entry.forbidsHouseRule)) &&
      (mode === undefined || Boolean(entry.expertOnly) === (mode === "expert"))
  );
  return option?.effect.type === "CAST_FROM_SPELL_DISCARD" ? { option, effect: option.effect } : undefined;
}

/**
 * WHICH Spell a `castFromSpellDiscardArm` may cast right now, or undefined when
 * the arm has no source (an empty pile, no matching Spell, a Balance-Pack Ciele
 * Book arm with no "Cast a Spell" card in the discard, …).
 *
 * The Helm reads the face-up TOP of the SHARED Spell-deck discard — of EVERY
 * shared Spell pile: BINH splits the Spell deck into basic + expert, so the
 * table shows TWO face-up Spell-deck discard tops and both answer to the printed
 * "the top of the [spell] deck discard pile" (the same multi-pile convention
 * `tarnumOverlimitSpellAvailable` / `takeTarnumOverlimitSpellFromSharedDiscard` /
 * `inscribeCastSpellIntoSpellBook` already use — reading only `decks.spells` left
 * the expert pile's top permanently unreachable, half of the 2026-08-26 "the top
 * of the discard IS a castable spell and nothing happens" report). Ciele IV's
 * `ownDiscard` reads the caster's own discard (their Book under the Polish Spell
 * Book) for its named `spellId`; the Balance reprint's `polishRefreshFromBook`
 * arm reads the refreshable USED side of the Book.
 *
 * The generic Cast-a-Spell enabler is never a candidate: its card kind is Spell
 * but the reducer refuses to cast it (it enables a Book Spell), so offering it
 * would be a dead button.
 *
 * `anySpell` enablers (Community Intelligence) are NOT covered — they authorise
 * every Spell in the pile and each caller enumerates them itself.
 */
export function castFromSpellDiscardSourceSpellIds(
  state: Pick<GameState, "ruleset" | "adventure" | "decks" | "activeEffects">,
  player: PlayerState,
  effect: Extract<EffectDefinition, { type: "CAST_FROM_SPELL_DISCARD" }>
): CardId[] {
  if (effect.anySpell === true) {
    return [];
  }
  const topOf = (pile: readonly CardId[]): CardId | undefined =>
    effect.spellId ? [...pile].reverse().find((cardId) => cardId === effect.spellId) : pile.at(-1);
  const refreshFromBook = effect.polishRefreshFromBook === true && polishSpellBookEnabled(state);
  if (refreshFromBook && !player.discard.includes(CAST_A_SPELL_CARD_ID)) {
    return [];
  }
  const candidates: (CardId | undefined)[] = refreshFromBook
    ? [
        topOf(
          (player.spellBookUsed ?? []).filter(
            (cardId) => polishBookSpellRefreshBlocked(state, player.id, cardId, player) === null
          )
        )
      ]
    : effect.ownDiscard === true
      ? [topOf(polishSpellBookEnabled(state) ? player.spellBook : player.discard)]
      : sharedSpellDecks(state).map((deck) => topOf(deck.discardPile));
  const out: CardId[] = [];
  for (const cardId of candidates) {
    if (cardId && !isCastASpellCard(cardId) && !out.includes(cardId)) {
      out.push(cardId);
    }
  }
  return out;
}

/**
 * Polish Balance Pack Helm of the Alabaster Unicorn: "Add casted [spell] to your
 * Spellbook." BOOK-GATED — the Spell was cast FROM a shared Spell-deck discard
 * pile (where it normally stays); with the Book on it is pulled out and inscribed
 * onto the USED side (user ruling 2026-08-20: it was just CAST, so it is already
 * spent this round and refreshes at the next round start).
 *
 * ONE seam shared by the CAST_SPELL resolution (`finalizeSpellCardDestination`)
 * and the reaction path (`applyReactionPlayCore`), which has no stack item to
 * carry the flag. Any split deck may hold the Spell, so the pile is found by id.
 * Returns true when the Spell really moved.
 */
export function inscribeCastSpellIntoSpellBook(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  const caster = state.players[playerId];
  const deck = Object.values(state.decks).find((candidate) => candidate?.discardPile.includes(cardId));
  if (!caster || !deck) {
    return false;
  }
  const index = deck.discardPile.lastIndexOf(cardId);
  if (index < 0) {
    return false;
  }
  deck.discardPile.splice(index, 1);
  (caster.spellBookUsed ??= []).push(cardId);
  return true;
}
