import { cardLibrary } from "@/data/cards/library";
import { polishBalanceSpellCards, POLISH_BALANCE_SPELL_IDS } from "@/data/cards/spells-balance";
import {
  polishBalanceArtifactCards,
  POLISH_BALANCE_ARTIFACT_IDS,
  POLISH_BALANCE_MOVEMENT_ARTIFACT_IDS
} from "@/data/cards/artifacts-balance";
import {
  polishBalanceSpecialtyCards,
  POLISH_BALANCE_SPECIALTY_IDS
} from "@/data/cards/specialties-balance";

import { houseRuleEnabled } from "./house-rules";
import type { CardDefinition, CardLibrary, GameState } from "./state";

export { POLISH_BALANCE_SPELL_IDS, POLISH_BALANCE_ARTIFACT_IDS, POLISH_BALANCE_SPECIALTY_IDS };

/** Every card id the Balance Pack REPRINTS as a whole definition. */
const REPRINTED_CARDS: CardLibrary = {
  ...polishBalanceSpellCards,
  ...polishBalanceArtifactCards,
  ...polishBalanceSpecialtyCards
};
const REPRINTED_IDS: readonly string[] = Object.keys(REPRINTED_CARDS);

/**
 * The reprints whose PRINTED text carries a Combat-movement half — the
 * Balance-Pack Haste / Slow and the five "+N initiative and can move N more
 * spaces" artifacts. `getUnitMoveRange` applies THEIR movement whatever the
 * classic `combat-move-initiative` house rule says, because the card prints it;
 * every other MOVEMENT_BONUS stays gated on that rule.
 */
export const POLISH_BALANCE_PRINTED_MOVEMENT_IDS: readonly string[] = [
  ...POLISH_BALANCE_SPELL_IDS,
  ...POLISH_BALANCE_MOVEMENT_ARTIFACT_IDS
];

/**
 * Polish Balance Pack — the ONE seam that swaps the 21 reprinted Spell cards in.
 *
 * The reducer and the legal-action layer both thread a `CardLibrary` through
 * every read (`cards[cardId]`), so substituting the library at their entry
 * points is enough for the whole engine to see the balanced ladders — offers,
 * targeting, tier gates, resolution and the ladder text all read the same
 * definition, so an offer can never promise a number the resolution does not
 * pay. With the rule OFF the caller's own library is returned UNCHANGED (the
 * same object identity), so a default table is byte-identical.
 *
 * Memoized per base library so repeated calls in one action are free and the
 * merged object keeps a stable identity.
 */
const merged = new WeakMap<CardLibrary, CardLibrary>();
/**
 * Already-merged libraries, so a nested call (the reducer hands its balanced
 * library to `getLegalReactionsForTrigger`, which substitutes again) is a
 * no-op instead of building a fresh object every time.
 */
const alreadyMerged = new WeakSet<CardLibrary>();

export function polishBalanceCardLibrary(state: GameState, cards: CardLibrary): CardLibrary {
  if (!houseRuleEnabled(state, "polish-card-balance") || alreadyMerged.has(cards)) {
    return cards;
  }
  const cached = merged.get(cards);
  if (cached) {
    return cached;
  }
  const next: CardLibrary = { ...cards };
  for (const cardId of REPRINTED_IDS) {
    // Only replace a card the caller's library actually carries: the combat
    // sandbox and the tests build trimmed libraries, and inventing a card there
    // would put a card in play the table never dealt.
    if (cards[cardId] && REPRINTED_CARDS[cardId]) {
      next[cardId] = REPRINTED_CARDS[cardId]!;
    }
  }
  merged.set(cards, next);
  alreadyMerged.add(next);
  return next;
}

/**
 * The definition the engine should read for `cardId` right now — the balance
 * reprint while the rule is on, the printed card otherwise. For the handful of
 * call sites that reach `cardLibrary` directly instead of the threaded library.
 */
export function polishBalanceCard(state: GameState, cardId: string): CardDefinition | undefined {
  if (houseRuleEnabled(state, "polish-card-balance") && cardLibrary[cardId] && REPRINTED_CARDS[cardId]) {
    return REPRINTED_CARDS[cardId];
  }
  return cardLibrary[cardId];
}

/** Pure display resolver for UI surfaces that have the rule boolean, not GameState. */
export function polishBalanceCardForDisplay(enabled: boolean, cardId: string): CardDefinition | undefined {
  if (enabled && cardLibrary[cardId] && REPRINTED_CARDS[cardId]) {
    return REPRINTED_CARDS[cardId];
  }
  return cardLibrary[cardId];
}
