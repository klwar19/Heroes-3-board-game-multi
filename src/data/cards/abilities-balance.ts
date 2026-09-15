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
 * --- INTELLIGENCE ---
 * Reprint (the committed face): "At the start of a combat round, Refresh 1
 * Spell, then Cast a Spell. (you don't need to play Cast a Spell card.)"
 * Empowered adds: "This spell does not count toward your spell limit per Combat
 * round."
 *
 * The classic card grants a COMBAT-LONG timing freedom (an ongoing
 * `SPELL_CAST_ANYTIME` effect that stays in the "Permanents & Ongoing" tray and
 * lets its expert side lift the per-round limit for the whole fight). The
 * reprint makes it a ONE-SHOT enabler that ALSO refreshes a Spell first, so:
 *   1. the freedom is scoped to the start of the CURRENT combat round (the
 *      shared round-start read via `balanceIntelligenceWindowClosed`), so a
 *      held card can be saved for round 2 or later;
 *   2. it grants EXACTLY ONE free Spell cast — `modifiers[].oneShot` makes
 *      `noteSpellCast` consume the effect the moment the holder casts a Spell,
 *      so a second Spell needs the ordinary "Cast a Spell" allowance again;
 *   3. it never parks a card in the ongoing tray — `keepSourceInDiscard` keeps
 *      the physical Intelligence card in the discard pile (spent), so
 *      `holdLiveOngoingCardsFromDiscard` never lifts it into the pile;
 *   4. the EXPERT rider (`ignoreSpellLimit`) is likewise one-shot: that ONE free
 *      cast does not count toward the per-round limit, and later Spells face the
 *      ordinary limit again;
 *   5. the boost (2026-09-15): `polishRefreshSpellFirst` opens a standalone
 *      "Refresh 1 Spell in your Spell Book" pick the instant Intelligence is
 *      played — BEFORE the free cast (`openPolishBookRefreshPick`, the shared
 *      once-per-round refresh gate) — so a Spell already spent this round can be
 *      the free cast (a Might hero's lone Magic Arrow, or a second Chain
 *      Lightning in a two-Combat round). Refresh-then-cast, never cast-then-
 *      refresh, so it is not an easy in-window double cast. Book-gated: with no
 *      `polish-spell-book` there is nothing to refresh and the printed one-shot
 *      free cast stands.
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
  "ability.diplomacy": {
    ...printed("ability.diplomacy"),
    tags: [
      "ability",
      "map",
      "Regular (basic): for every Dwelling you have, draw 1 corresponding Neutral Unit card; you may recruit one by paying its cost. Decide separately whether each unpurchased card returns to the top or bottom of its deck.",
      "Expert: before a battle against Neutral Units, reduce one unit in the lowest-tier pair by one tier (remove it if bronze), OR enter a Creature Bank with one fewer Stack Token on its defenders. The battle and its normal field or Bank reward still resolve. Empowered: use either side without spending a crown.",
      "Balance pack: the old Diplomacy combat skip is replaced. This side only makes the real battle easier; it never Quick-Combats, claims a field, grants Experience, or changes its reward."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Draw 1 Neutral Unit per Dwelling, recruit one, then place each unpurchased card on its deck's top or bottom",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT" }
        },
        {
          label: "Expert: before a Neutral battle, downgrade the lowest-tier pair; or fight a Bank with 1 fewer Stack Token",
          expertOnly: true,
          effect: { type: "DIPLOMACY_EASE_BATTLE" }
        }
      ]
    }
  },
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
      "Instant (Combat): At the start of a combat round, Refresh 1 Spell, then Cast ONE Spell (no Cast a Spell card needed). Empowered: that one Spell does not count toward your per-round Spell limit.",
      "Balance pack: Refresh 1 Spell in your Spell Book FIRST, then take a ONE-SHOT free cast. Intelligence may be played before any unit acts in the current combat round, including round 2 and later; it is spent the instant you cast and never parks in the Permanents & Ongoing tray. The refresh is book-gated: without polish-spell-book the card keeps its printed one-shot cast. Under polish-spell-book the cast consumes no Cast a Spell card. A SECOND Spell needs the ordinary allowance. The Empowered no-limit rider covers only the Intelligence cast."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      polishRefreshSpellFirst: true,
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
