import type { CardDefinition, CardLibrary } from "@/engine/state";

import { extraAbilityCards } from "./abilities-extra";

/**
 * Polish Balance Pack (`polish-card-balance`) — the reprinted ABILITY cards
 * whose NEW text changes what the engine runs (as opposed to the abilities whose
 * only balance change is scoped inline at an engine seam).
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (`public/assets/polish-balance/
 * ability-<slug>.webp`), not the balance spreadsheet. Each entry is the PRINTED
 * definition with a replaced `effect` (and `tags`); everything else the engine
 * reads off a card — kind, timing, class, art — is untouched.
 * `polishBalanceCardLibrary` (`src/engine/polish-balance-spells.ts`) swaps these
 * in ONLY while the house rule is on; with it off nothing here is consulted and
 * the classic ability plays its printed text byte-identically.
 *
 * `tags`' last entries are the human-readable "Balance pack: …" text (the
 * `initiative-specialty-draw` precedent) stating exactly what runs.
 *
 * --- INTELLIGENCE (the one reprint here) ---
 * Printed: "At the start of a Combat, before any unit activates, you can Cast a
 * Spell. (you don't need to play Cast a Spell card.)" Expert adds: "This spell
 * does not count toward your spell limit per Combat round."
 *
 * The classic card grants a COMBAT-LONG timing freedom (an ongoing
 * `SPELL_CAST_ANYTIME` effect that stays in the "Permanents & Ongoing" tray and
 * lets its expert side lift the per-round limit for the whole fight). The
 * reprint makes it a ONE-SHOT enabler, so:
 *   1. the freedom is scoped to the start-of-combat window (the shared
 *      `combatStartWindowOpen` read via `balanceIntelligenceWindowClosed`);
 *   2. it grants EXACTLY ONE free Spell cast — `modifiers[].oneShot` makes
 *      `noteSpellCast` consume the effect the moment the holder casts a Spell,
 *      so a second Spell needs the ordinary "Cast a Spell" allowance again;
 *   3. it never parks a card in the ongoing tray — `keepSourceInDiscard` keeps
 *      the physical Intelligence card in the discard pile (spent), so
 *      `holdLiveOngoingCardsFromDiscard` never lifts it into the pile;
 *   4. the EXPERT rider (`ignoreSpellLimit`) is likewise one-shot: that ONE free
 *      cast does not count toward the per-round limit, and later Spells face the
 *      ordinary limit again.
 * Under `polish-spell-book` the free cast needs no "Cast a Spell" card and
 * consumes none (the freedom stands in for the enabler); the Intelligence card
 * itself is the thing that is spent.
 */

/** The printed definition a balance reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = extraAbilityCards[cardId];
  if (!card) {
    throw new Error(`Polish Balance Pack: no printed ability ${cardId}`);
  }
  return card;
}

export const polishBalanceAbilityCards: CardLibrary = {
  "ability.artillery": {
    ...printed("ability.artillery"),
    tags: [
      "ability",
      "instant",
      "war-machine",
      "Basic: Deal 1 damage to an enemy unit with the lowest initiative. OR, when your Ballista fires, choose its target, resolve its effect 2 times, and choose Ballista targets for the rest of this combat. Expert: resolve the Ballista against one chosen target 3 times and keep choosing its targets.",
      "Balance pack: Artillery is offered whenever a Ballista fires, including the start of every combat round and specialty activations. Basic costs no crown; Expert costs a crown. Either volley grants target choice for the rest of combat. Playing the one-damage fallback outside a firing window grants no ongoing targeting."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Deal 1 damage to the enemy unit with the lowest initiative",
          combatOnly: true,
          combatAnytime: true,
          effect: { type: "DAMAGE_LOWEST_INITIATIVE_ENEMY", amount: 1 }
        },
        {
          label: "When your Ballista fires: resolve it against the same target 2× (you pick the target)",
          effect: { type: "ARTILLERY_BALLISTA_VOLLEY", shots: 2 }
        },
        {
          label: "When your Ballista fires: resolve it against the same target 3× (you pick the target)",
          expertOnly: true,
          effect: { type: "ARTILLERY_BALLISTA_VOLLEY", shots: 3 }
        }
      ]
    }
  },
  "ability.intelligence": {
    ...printed("ability.intelligence"),
    tags: [
      "ability",
      "magic",
      "spell-timing",
      "Instant (Combat): At the start of a Combat, before any unit activates, you may Cast ONE Spell (no Cast a Spell card needed). Expert: that one Spell does not count toward your per-round Spell limit.",
      "Balance pack: a ONE-SHOT free cast — playable only at the start of the Combat (the shared combatStartWindowOpen read), spent the instant you cast a Spell, and never parked in the Permanents & Ongoing tray. Under polish-spell-book the free cast consumes no Cast a Spell card; the Intelligence card is what is spent. A SECOND Spell in the same window needs the ordinary allowance. Expert's no-limit rider covers only that one free cast."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Intelligence",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        keepSourceInDiscard: true,
        modifiers: [{ type: "SPELL_CAST_ANYTIME", oneShot: true }]
      },
      expertEffect: {
        name: "Expert Intelligence",
        scope: "player",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        keepSourceInDiscard: true,
        modifiers: [{ type: "SPELL_CAST_ANYTIME", ignoreSpellLimit: true, oneShot: true }]
      }
    }
  }
};

/** Every ability card id the Balance Pack REPRINTS as a whole definition. */
export const POLISH_BALANCE_ABILITY_IDS: readonly string[] = Object.keys(polishBalanceAbilityCards);
