import { cardLibrary } from "@/data/cards/library";
import {
  communityBalanceAbilityCards,
  COMMUNITY_BALANCE_ABILITY_IDS
} from "@/data/cards/community-abilities-balance";
import {
  communityBalanceSpellCards,
  COMMUNITY_BALANCE_SPELL_IDS
} from "@/data/cards/community-spells-balance";

import { houseRuleEnabled } from "./house-rules";
import { polishBalanceCard, polishBalanceCardForDisplay, polishBalanceCardLibrary } from "./polish-balance-spells";
import type { CardDefinition, CardLibrary, GameState } from "./state";

/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * ONE seam that swaps the reprinted card definitions in.
 *
 * Exactly the `polishBalanceCardLibrary` design (see
 * `src/engine/polish-balance-spells.ts`): the reducer and the legal-action layer
 * thread a `CardLibrary` through every read, so substituting the library at
 * their entry points is enough for the whole engine to see the reprints —
 * offers, targeting, tier gates, resolution and the ladder text all read the
 * same definition, so an offer can never promise a number the resolution does
 * not pay. With the rule OFF the caller's own library is returned UNCHANGED (the
 * same object identity), so a default table is byte-identical.
 *
 * PRECEDENCE: the community swap is applied AFTER the polish swap at every call
 * site (`balanceCardLibrary` below is the composed read), so with both rules on
 * the COMMUNITY reprint wins for a card both packs cover.
 *
 * SCOPE: the ABILITIES and SPELLS families have landed. Later steps merge the
 * remaining per-family reprint modules (artifacts, units, war machines) in here
 * the same way.
 */
export const COMMUNITY_REPRINTED_CARDS: CardLibrary = {
  ...communityBalanceAbilityCards,
  ...communityBalanceSpellCards
};

export { COMMUNITY_BALANCE_ABILITY_IDS, COMMUNITY_BALANCE_SPELL_IDS };

/** Memoized per base library (stable identity for repeated calls in one action). */
const merged = new WeakMap<CardLibrary, CardLibrary>();
/** Libraries this seam already produced, so a nested call is a no-op. */
const alreadyMerged = new WeakSet<CardLibrary>();

/**
 * `reprints` is a parameter (defaulting to the shipped table) purely so the
 * precedence and gating can be pinned by a test while the real table is still
 * empty; every production call site takes the default. A non-default table
 * bypasses the memo cache (which is keyed on the base library alone).
 */
export function communityBalanceCardLibrary(
  state: GameState,
  cards: CardLibrary,
  reprints: CardLibrary = COMMUNITY_REPRINTED_CARDS
): CardLibrary {
  const reprintedIds = Object.keys(reprints);
  if (!houseRuleEnabled(state, "community-card-balance") || alreadyMerged.has(cards) || reprintedIds.length === 0) {
    return cards;
  }
  const isDefaultTable = reprints === COMMUNITY_REPRINTED_CARDS;
  const cached = isDefaultTable ? merged.get(cards) : undefined;
  if (cached) {
    return cached;
  }
  const next: CardLibrary = { ...cards };
  for (const cardId of reprintedIds) {
    // Only replace a card the caller's library actually carries: the combat
    // sandbox and the tests build trimmed libraries, and inventing a card there
    // would put a card in play the table never dealt.
    if (cards[cardId] && reprints[cardId]) {
      next[cardId] = reprints[cardId]!;
    }
  }
  if (isDefaultTable) {
    merged.set(cards, next);
    alreadyMerged.add(next);
  }
  return next;
}

/**
 * The composed library read every engine entry point uses: polish first, then
 * community on top, so a card both packs reprint plays the COMMUNITY text.
 */
export function balanceCardLibrary(
  state: GameState,
  cards: CardLibrary,
  reprints: CardLibrary = COMMUNITY_REPRINTED_CARDS
): CardLibrary {
  return communityBalanceCardLibrary(state, polishBalanceCardLibrary(state, cards), reprints);
}

/**
 * The definition the engine should read for `cardId` right now under the
 * community pack alone — the community reprint while the rule is on, the printed
 * card otherwise.
 */
export function communityBalanceCard(state: GameState, cardId: string): CardDefinition | undefined {
  if (
    houseRuleEnabled(state, "community-card-balance") &&
    cardLibrary[cardId] &&
    COMMUNITY_REPRINTED_CARDS[cardId]
  ) {
    return COMMUNITY_REPRINTED_CARDS[cardId];
  }
  return cardLibrary[cardId];
}

/** Pure display resolver for UI surfaces that have the rule boolean, not GameState. */
export function communityBalanceCardForDisplay(enabled: boolean, cardId: string): CardDefinition | undefined {
  if (enabled && cardLibrary[cardId] && COMMUNITY_REPRINTED_CARDS[cardId]) {
    return COMMUNITY_REPRINTED_CARDS[cardId];
  }
  return cardLibrary[cardId];
}

/**
 * The composed single-card read for the few call sites that reach `cardLibrary`
 * directly instead of the threaded library. Community wins, then polish, then
 * the printed card.
 */
export function balanceCard(state: GameState, cardId: string): CardDefinition | undefined {
  if (
    houseRuleEnabled(state, "community-card-balance") &&
    cardLibrary[cardId] &&
    COMMUNITY_REPRINTED_CARDS[cardId]
  ) {
    return COMMUNITY_REPRINTED_CARDS[cardId];
  }
  return polishBalanceCard(state, cardId);
}

/** The composed DISPLAY read (community wins, then polish, then printed). */
export function balanceCardForDisplay(
  polishEnabled: boolean,
  communityEnabled: boolean,
  cardId: string,
  reprints: CardLibrary = COMMUNITY_REPRINTED_CARDS
): CardDefinition | undefined {
  if (communityEnabled && cardLibrary[cardId] && reprints[cardId]) {
    return reprints[cardId];
  }
  return polishBalanceCardForDisplay(polishEnabled, cardId);
}
