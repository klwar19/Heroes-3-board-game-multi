import type { CardDefinition, CardLibrary } from "@/engine/state";

import { adventureCards } from "./adventure";

/**
 * Polish Balance Pack (`polish-card-balance`) — the 11 reprinted HERO SPECIALTY
 * cards.
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (the pack's own graphics folder), not
 * the balance spreadsheet: every clause below was read off
 * `public/assets/polish-balance/specialty-<hero>-<level>.webp`. Each entry is the
 * PRINTED definition with a replaced `effect` (and `tags`), so everything else
 * the engine reads off a card — kind, timing, hero, art — is untouched.
 * `polishBalanceCardLibrary` in `src/engine/polish-balance-spells.ts` swaps these
 * definitions in ONLY while the house rule is on; with it off nothing here is
 * consulted and every card plays its printed text.
 *
 * `tags`' last entry is the human-readable "Balance pack: …" text (the
 * `initiative-specialty-draw` precedent).
 *
 * DELIBERATE READINGS / LIMITS, stated up front (CLAUDE.md #4):
 *  - The Polish Unit-STACK clauses ("Put this card on the Stack or Pack …",
 *    "If you have a Stack or Pack of Magi …") need NO new placement rule: a
 *    "Stack" in this engine IS a Pack card carrying paid `stacks` layers, so a
 *    Stacked Pack was always a legal target of the cover / the trade. What the
 *    reprints ADD is the rider on top — the cover's extra +1 Attack while it
 *    sits on a Stack (Sandro I, Vidomina IV) and the per-layer gold refund
 *    (Dracon IV, Gelu IV). With `polish-unit-stacks` off no card ever carries a
 *    layer, so every one of those riders is an exact no-op.
 *  - Sandro IV's face prints NO "+1 ⚔ on a Stack" rider (its siblings do), so
 *    the reprint carries none: only its printed text is restated. Its Stack
 *    placement is pinned by test all the same.
 *  - The Stack rider is read LIVE (while the covered card still has a layer),
 *    not frozen at play time: spend the last layer and the +1 goes with it.
 *  - GELU IV keeps its `grantAttackBonus` (the separate BINH
 *    `gelu-sharpshooter-buff` house rule). The balance face does not print that
 *    buff, but it is a DIFFERENT toggle — the Balance Pack must not silently
 *    switch another house rule off.
 *  - DRACON IV keeps its third `dracon-few-magi-trade` option for the same
 *    reason (the spec explicitly leaves that rule alone).
 *  - The BOOK-GATED reprints (Adelaide IV, Jeddite I/VI, Ciele I/IV) resolve
 *    their Polish half only while `polish-spell-book` is on; without the Book
 *    they keep the classic printed reading, because the printed "Cast a Spell"
 *    card does not exist on such a table.
 *  - CIELE I/IV are the ONE pair whose two readings are different EFFECT kinds
 *    (cast vs. recall), so the reprint carries both sides and gates them with
 *    `requiresHouseRule` / `forbidsHouseRule` on `polish-spell-book`.
 *  - TARNUM (Conflux) I's reprint only DROPS the Remove option. "Add it to your
 *    Spellbook" needs no new wiring: under the Polish Book every acquired owned
 *    Spell already routes into the Book (`gainOwnedCard`).
 */

/** The printed definition a balance reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = adventureCards[cardId];
  if (!card) {
    throw new Error(`Polish Balance Pack: no printed specialty ${cardId}`);
  }
  return card;
}

/**
 * Clone `cardId`'s printed definition with `patch` applied. Keys explicitly set
 * to `undefined` in `patch` are DELETED (a plain spread would keep them).
 */
function reprint(
  cardId: string,
  patch: Partial<CardDefinition>,
): CardDefinition {
  const next = { ...printed(cardId), ...patch } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    }
  }
  return next as CardDefinition;
}

function tags(cardId: string, balanceText: string): string[] {
  const base = printed(cardId).tags ?? [];
  // Drop the printed rules line (always the last tag) — it would promise the
  // classic text — and state the reprint instead.
  const keep = base.slice(0, Math.max(0, base.length - 1));
  return [...keep, `Balance pack: ${balanceText}`];
}

/** Jeddite I / VI — the dig now takes Cast a Spell enablers under the Book. */
function warlockDigReprint(level: 1 | 6, count: number): CardDefinition {
  const cardId = `specialty.jeddite.${level}`;
  return reprint(cardId, {
    tags: tags(
      cardId,
      `Draw up to ${count} cards from your deck, take any Cast a Spell and Specialty cards to your hand, and discard the rest. (Without the Polish Spell Book there is no Cast a Spell card, so the dig keeps Spells and Specialties, as printed.)`,
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Dig ${count} cards; keep Cast a Spell and Specialties`,
          effect: {
            type: "DECK_DIG_KEEP_MATCHING",
            count,
            filter: "cast-enabler-or-specialty",
          },
        },
      ],
    },
  });
}

/** Ciele I / IV — the Book refresh-and-cast reading (level IV is over-limit). */
function cieleArrowReprint(level: 1 | 4): CardDefinition {
  const cardId = `specialty.ciele.${level}`;
  const overLimit = level === 4;
  return reprint(cardId, {
    tags: tags(
      cardId,
      `Instant: if you have a Cast a Spell card on your discard pile, Refresh up to 1 Magic Arrow spell and cast it${
        overLimit
          ? " — this spell does not count toward your Spell limit per Combat round"
          : ""
      } (no Cast a Spell card is spent). Without the Polish Spell Book the card keeps its printed ${
        overLimit
          ? "free cast from your own discard pile"
          : "recall of a Magic Arrow to your hand"
      }. — OR — Instant: +1 Power.`,
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // Polish Book reading. Offered only while `polish-spell-book` is on:
          // the legal-action layer reads `polishRefreshFromBook` and additionally
          // requires the Cast a Spell enabler to be sitting in the discard pile
          // (the printed CONDITION — the enabler is never spent).
          label: "Refresh a Magic Arrow in your Spell Book and cast it",
          requiresHouseRule: "polish-spell-book",
          combatOnly: true,
          effect: {
            type: "CAST_FROM_SPELL_DISCARD",
            spellId: "spell.magic_arrow",
            ownDiscard: true,
            polishRefreshFromBook: true,
            // Only level IV prints "does not count toward your Spell limit".
            ...(overLimit ? {} : { countsTowardSpellLimit: true }),
          },
        },
        // The classic side, kept for a table WITHOUT the Polish Book (there is no
        // Cast a Spell card there, so the reprint's own arm can never resolve).
        level === 1
          ? {
              label: "Take a Magic Arrow from your discard pile",
              forbidsHouseRule: "polish-spell-book",
              effect: {
                type: "TAKE_FROM_DISCARD",
                count: 1,
                filter: "magic-arrow",
                allowInCombat: true,
              },
            }
          : {
              label: "Cast a Magic Arrow from your discard pile (free)",
              forbidsHouseRule: "polish-spell-book",
              combatOnly: true,
              effect: {
                type: "CAST_FROM_SPELL_DISCARD",
                spellId: "spell.magic_arrow",
                ownDiscard: true,
              },
            },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 },
        },
      ],
    },
  });
}

export const polishBalanceSpecialtyCards: CardLibrary = {
  // Adelaide IV — "Take Cast a Spell or Specialty card from your discard pile
  // and put it back in your hand. Refresh 1 Spell." The shared Spell Book rule
  // owns the one-refresh-per-Spell-per-round limit. The take is
  // BOOK-AWARE (`cast-enabler-or-specialty`); the refresh is a SECOND pick the
  // take opens (`polishRefreshAfter`), so both printed sentences resolve. Off
  // the Book the filter falls back to the printed classic "Spell or Specialty"
  // and no refresh pick opens (there is no Book).
  "specialty.adelaide.4": reprint("specialty.adelaide.4", {
    tags: tags(
      "specialty.adelaide.4",
      "Instant (map or Combat): take a Cast a Spell or Specialty card from your discard pile back into your hand, then refresh 1 Spell in your Spell Book. Without the Polish Spell Book it takes a Spell or Specialty card, as printed.",
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take a Cast a Spell or Specialty card from your discard pile",
          effect: {
            type: "TAKE_FROM_DISCARD",
            count: 1,
            filter: "cast-enabler-or-specialty",
            allowInCombat: true,
            polishRefreshAfter: true,
          },
        },
      ],
    },
  }),

  "specialty.jeddite.1": warlockDigReprint(1, 3),
  "specialty.jeddite.6": warlockDigReprint(6, 4),

  // Sandro I — "Put this card on the Stack or Pack of Skeletons Unit card; it
  // replaces the card's statistic. When the card is played on the Stack it gives
  // additional +1 ⚔." Printed stats unchanged (A3 D1 HP2 I6).
  "specialty.sandro.1": reprint("specialty.sandro.1", {
    tags: tags(
      "specialty.sandro.1",
      "Put this card on the Stack or Pack of Skeletons Unit card; it replaces the card's statistics until defeated. On a Stack (a Pack carrying Polish Unit-Stack layers) it gives an additional +1 Attack while a layer remains.",
    ),
    effect: {
      type: "TRANSFORM_UNIT",
      targetUnitName: "Skeletons",
      targetVariants: ["pack"],
      newName: "Horde of Skeletons",
      attack: 3,
      defense: 1,
      health: 2,
      initiative: 6,
      stackAttackBonus: 1,
      cardImage: "/assets/hero_specialties-sandro-1.webp",
    },
  }),

  // Sandro IV — "Put this card on the Pack or Stack of Zombies Unit card…" The
  // face prints NO +1 rider, so the reprint adds none: it restates that a
  // Stacked Pack is a legal target (which the engine already allows).
  "specialty.sandro.4": reprint("specialty.sandro.4", {
    tags: tags(
      "specialty.sandro.4",
      "Put this card on the Pack or Stack of Zombies Unit card; it replaces the card's statistics until defeated. No Stack rider is printed on this level.",
    ),
  }),

  // Vidomina IV — the Skeletons cover with the same Stack rider as Sandro I, and
  // the printed "keep the card until its HP drops to 0" clause (unchanged).
  "specialty.vidomina.4": reprint("specialty.vidomina.4", {
    tags: tags(
      "specialty.vidomina.4",
      "Put this card on the Stack or Pack of Skeletons Unit card; it replaces the card's statistics (Horde of Skeletons) until its HP drops to 0. On a Stack it gives an additional +1 Attack while a layer remains.",
    ),
    effect: {
      type: "TRANSFORM_UNIT",
      targetUnitName: "Skeletons",
      targetVariants: ["pack"],
      newName: "Horde of Skeletons",
      attack: 3,
      defense: 1,
      health: 2,
      initiative: 6,
      stackAttackBonus: 1,
      cardImage: "/assets/hero_specialties-vidomina-4.webp",
    },
  }),

  // Dracon IV — "If you have a Stack or Pack of Magi Unit card, discard it …
  // Gain 13 gold for each stack of Magi you had." 13 = the Magi Polish Stack
  // price, so a fully Stacked Pack refunds what those layers cost.
  "specialty.dracon.4": reprint("specialty.dracon.4", {
    tags: tags(
      "specialty.dracon.4",
      "Map: discard a Stack or Pack of Magi, then search the Neutral Unit gold deck for the Enchanters card and add it to your Unit deck (only 1 Enchanters at a time). Gain 13 gold for each Unit-Stack layer that Magi card carried. — OR — Draw a card. — OR — (house rule) discard a Few of Magi AND pay 6 gold to take the Enchanters.",
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label:
            "Discard a Stack or Pack of Magi → take the Enchanters (13 gold per Stack layer)",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "tower.magi",
            fromSide: "pack",
            toUnitDefId: "neutral.enchanters",
            toTier: "gold",
            unique: true,
            goldPerStackLayer: 13,
          },
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 },
        },
        {
          label: "Discard a Few of Magi + 6 gold → take the Enchanters",
          mapOnly: true,
          requiresHouseRule: "dracon-few-magi-trade",
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "tower.magi",
            fromSide: "few",
            toUnitDefId: "neutral.enchanters",
            toTier: "gold",
            unique: true,
            goldCost: 6,
          },
        },
      ],
    },
  }),

  // Gelu IV — the same shape with Elves → Sharpshooters at 9 gold per layer
  // (the Elves' own Polish Stack price). The BINH `gelu-sharpshooter-buff`
  // grant is a DIFFERENT house rule and is deliberately kept.
  "specialty.gelu.4": reprint("specialty.gelu.4", {
    tags: tags(
      "specialty.gelu.4",
      "Map: discard a Stack or Pack of Elves, then search the Neutral Unit silver deck for the Sharpshooters card and add it to your Unit deck (only 1 Sharpshooters at a time). Gain 9 gold for each Unit-Stack layer that Elves card carried. — OR — Draw a card.",
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label:
            "Discard a Stack or Pack of Elves → take the Sharpshooters (9 gold per Stack layer)",
          mapOnly: true,
          effect: {
            type: "CONVERT_ARMY_UNIT",
            fromUnitDefId: "rampart.elves",
            fromSide: "pack",
            toUnitDefId: "neutral.sharpshooters",
            toTier: "silver",
            unique: true,
            goldPerStackLayer: 9,
            // House rule (BINH, `gelu-sharpshooter-buff`) — a separate toggle the
            // Balance Pack must not switch off. Inert while that rule is off.
            grantAttackBonus: 1,
          },
        },
        {
          label: "Draw a card",
          effect: { type: "DRAW_CARDS", amount: 1 },
        },
      ],
    },
  }),

  "specialty.ciele.1": cieleArrowReprint(1),
  "specialty.ciele.4": cieleArrowReprint(4),

  // Tarnum (Conflux) I — "Search (1) Spell and add it to your Spellbook." The
  // Remove-from-the-game option is DROPPED (`allowRemove` gone); the Spellbook
  // destination is the Polish Book's own routing for every acquired Spell.
  "specialty.tarnum_conflux.1": reprint("specialty.tarnum_conflux.1", {
    tags: tags(
      "specialty.tarnum_conflux.1",
      "Map: Search (1) Spell and add it to your Spellbook (your hand without the Polish Spell Book). The card can no longer be Removed from the game instead.",
    ),
    effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 1 },
  }),
};

/** Every specialty id the Balance Pack reprints. */
export const POLISH_BALANCE_SPECIALTY_IDS: readonly string[] = Object.keys(
  polishBalanceSpecialtyCards,
);
