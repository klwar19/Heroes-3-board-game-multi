import type { CardDefinition, CardLibrary } from "@/engine/state";

import { artifactCards } from "./artifacts";
import { sampleCards } from "./sample";

/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * reprinted ARTIFACT cards (the sheet's Artifacts tab plus the Royal Armor of
 * Nix follow-up, 35 cards).
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (`public/assets/community-balance/
 * artifact-<slug>.webp`), not this file's prose. Each entry is the PRINTED
 * definition with a replaced `effect` (plus `timing` / `permanent` /
 * `permanentEffect` where the reprint really moves them) and a trailing
 * "Community pack: …" `tags` line stating exactly what the engine runs — the
 * `polishBalanceArtifactCards` precedent.
 *
 * `communityBalanceCardLibrary` (`src/engine/community-balance-cards.ts`) swaps
 * these in ONLY while the house rule is on; with it off nothing here is consulted
 * and the classic artifact plays its printed text byte-identically. When BOTH
 * balance packs are on the COMMUNITY definition wins (the community swap is
 * applied after the polish one at every seam).
 *
 * LEAD WITH THE DEVIATIONS / DELIBERATE READINGS (CLAUDE.md #4):
 *
 *  - CELESTIAL NECKLACE OF BLISS option A prints "+1 <attack>, then discard X
 *    cards from hand to gain +X <defense>" — one play, two stats. USER RULING
 *    2026-08-23 ("should give attack when discard", answering the sheet author's
 *    "Gives defense instead of Attack" feedback): the discard scaling rides the
 *    SAME BLOW AS ATTACK, exactly like Sword of Judgement's `perCostCard` — so
 *    discarding 2 cards is +3 attack in total on that attack. This SUPERSEDES the
 *    old reading (each paid card laid +1 Defense on the holder's own unit for the
 *    combat round, `perCostCardSelfDefense`), which is deleted.
 *  - HOURGLASS OF THE EVIL HOUR option B ("ignore all +1 Attack die results") is
 *    read as GLOBAL — both armies, the printed "all" — and it ignores only the
 *    die's NUMERIC result. Abilities keyed off the "+1" FACE (Death Blow, the
 *    Minotaur draw, …) still fire; suppressing those is the separate
 *    IGNORE_ATTACK_DIE_RESULT arm (Shield of the Dwarven Lords).
 *  - CENTAUR'S AXE option A ("use this AFTER the Attack die roll") is offered to
 *    the ATTACKING side in the dedicated post-roll ATTACK_DIE_SETTLED window and
 *    is withheld from every pre-roll window (`afterAttackRoll`). PRECEDENCE with
 *    the Polish pack: the Polish reprint's "ignored on a −1" clause is NOT on this
 *    printing, so with both packs on a rolled −1 IS tripled again, and the play
 *    moves from pre-roll to post-roll.
 *  - EVERSMOKING RING OF SULFUR: the sheet's "Extra Change" column moves it from
 *    MINOR to MAJOR. The pack composes with the existing
 *    `eversmoking-ring-of-sulfur-major` house rule — the Ring is Major (tier read
 *    AND deck placement) whenever EITHER is on.
 *  - The "🔄 At the end of your turn gain X" sides (Endless Bag of Gold,
 *    Everpouring Vial of Mercury, Inexhaustible Cart of Lumber) are ONE-TURN
 *    ONGOINGS, not ♾️ permanents: a player-scoped `duration: "current-turn"`
 *    active effect carrying TURN_END_RESOURCE_GAIN. The card parks in the
 *    "Permanents & Ongoing" tray, pays ONCE at the end of that same turn
 *    (`payTurnEndOngoingIncome`, which also SPENDS the effect) and is then moved
 *    to the owner's DISCARD pile by the shared `releaseEndedOngoingCards` tail —
 *    so it can be drawn and played again, which is what "endless" means. It
 *    never pays on a later turn and does NOT occupy a permanent slot.
 *    ENDLESS SACK OF GOLD's ♾️ side is the other kind — a real income PERMANENT
 *    (`resourceRoundGain`), so it does take the permanent slot.
 *  - AMBASSADOR'S SASH and CARDS OF PROPHECY lose their engine-side "reroll a die
 *    from hand" offer while the pack is on (`balanceRerollReactionArtifactIds`):
 *    the reprint replaces that printed half (Sash → gain positive morale, Prophecy
 *    → the pre-Search Search (4)). Diplomat's Ring is untouched.
 *  - ARMS / HEAD OF LEGION print "…by 1 <valuables> OR 4 <gold>". The engine ships
 *    that as TWO CHOOSE_ONE options so the player really picks the currency (the
 *    printed Torso-of-Legion "1 valuables or 2 building materials" precedent).
 *  - The Legion REMOVE sides ("🌍 Remove this card, then Reinforce a <tier> unit
 *    …") ride the SHARED `REINFORCE_FLAT_GOLD` visit step, so the Citadel
 *    (UNLOCK_REINFORCE) requirement, the stacking with a banked Legion voucher and
 *    the spend path are the ones the rest of the game uses. The option is withheld
 *    when the menu would be empty, so the card is never removed for nothing.
 *  - SPECULUM's remove side ("Search (1) the Artifact, Spell or your M&M deck")
 *    is three options, one per deck — the player picks.
 *  - SURCOAT OF COUNTERPOISE reuses INTERFERE_SPELL, the arm Interference and the
 *    Plate of the Dying Light already run: "+N defense, and the same +N reduces
 *    THIS spell's damage to your unit". Exactly the printed "+1 <defense>. This
 *    effect can be used to reduce <damage> from <spell>".
 *  - CROWN OF DRAGONTOOTH option A becomes "select UP TO 2" — the discard pick
 *    gains a "Take no cards" exit at every step.
 *  - TUNIC OF THE CYCLOPS KING option A ("+1 <power>, then draw a card") and CARDS
 *    OF PROPHECY option B ("Set a die on the side of your choice") already ran
 *    exactly as reprinted; they are re-listed for their tags only.
 */

/** The printed definition a community reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = artifactCards[cardId] ?? sampleCards[cardId];
  if (!card) {
    throw new Error(`Community Balance Change: no printed artifact ${cardId}`);
  }
  return card;
}

/**
 * Clone `cardId`'s printed definition with `patch` applied. Keys explicitly set
 * to `undefined` in `patch` are DELETED (a plain spread would keep them).
 */
function reprint(cardId: string, patch: Partial<CardDefinition>): CardDefinition {
  const next = { ...printed(cardId), ...patch } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    }
  }
  return next as CardDefinition;
}

/**
 * The reprint's tags: keep the printed structural tags (tier, "artifact",
 * "income", …), drop the printed RULES line (it would promise the classic text)
 * and state the reprint instead.
 */
function tags(cardId: string, communityText: string): string[] {
  const base = printed(cardId).tags ?? [];
  const keep = base.filter(
    (tag) =>
      !tag.includes(" — OR — ") &&
      !tag.startsWith("Triple the Attack die") &&
      tag !== "wiki-reference" &&
      tag !== "or-choice"
  );
  return [...keep, `Community pack: ${communityText}`];
}

export const communityBalanceArtifactCards: CardLibrary = {
  // ===================================================================== RELIC

  // Boots of Polarity — option A no longer rolls: the enemy Spell is simply
  // ignored. Option B is unchanged.
  "artifact.boots_of_polarity": reprint("artifact.boots_of_polarity", {
    tags: tags(
      "artifact.boots_of_polarity",
      "Play immediately after the enemy casts a Spell: ignore the Spell's effect (NO dice roll any more — the printed 2-dice \"+1\" gamble is gone). — OR — Remove 1 ongoing effect from a unit (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ignore the enemy Spell's effect",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "CANCEL_SPELL" }
        },
        {
          label: "Remove 1 ongoing effect from a unit",
          combatOnly: true,
          target: { type: "any-unit" },
          effect: { type: "REMOVE_ACTIVE_EFFECT" }
        }
      ]
    }
  }),

  // Celestial Necklace of Bliss — option A gains the flat +1 attack base AND
  // scales the discard as MORE ATTACK on the same blow (USER RULING 2026-08-23;
  // see the header). Same `perCostCard` mechanism as Sword of Judgement.
  "artifact.celestial_necklace_of_bliss": reprint("artifact.celestial_necklace_of_bliss", {
    tags: tags(
      "artifact.celestial_necklace_of_bliss",
      "+1 attack on this attack, and discard X cards from hand to gain +X MORE attack on the same blow (discarding 2 = +3 attack in total). — OR — Remove this card, then gain +4 attack (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 attack, discard X cards: +X more attack",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, perCostCard: 1 }
        },
        {
          label: "Remove this card: +4 attack",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 4 }
        }
      ]
    }
  }),

  // Crown of Dragontooth — option A becomes "select UP TO 2".
  "artifact.crown_of_dragontooth": reprint("artifact.crown_of_dragontooth", {
    tags: tags(
      "artifact.crown_of_dragontooth",
      "Select UP TO 2 Spell cards from your discard pile and put them back in your hand (was exactly 2 — the pick now offers \"Take no cards\" at every step, so 0, 1 or 2 are all legal). — OR — Remove 1 Spell from hand, then Search (2) the Spell deck (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take up to 2 Spell cards from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 2, filter: "spell", optional: true }
        },
        {
          label: "Remove 1 Spell from hand: Search (2) the Spell deck",
          cost: { discardCards: 1, costCardFilter: "spell", removeCostCards: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 2 }
        }
      ]
    }
  }),

  // Endless Sack of Gold — option A stops being an instant and becomes a real
  // income PERMANENT (4 gold each Resource round); the remove side pays 5 (was 8).
  "artifact.endless_sack_of_gold": reprint("artifact.endless_sack_of_gold", {
    timing: "ongoing",
    permanent: true,
    permanentEffect: { resourceRoundGain: { resource: "gold", amount: 4 } },
    tags: tags(
      "artifact.endless_sack_of_gold",
      "♾️ Put this card into play: at the beginning of each Resource round, gain 4 gold (was a one-shot \"gain 5 gold\"). It occupies a PERMANENT slot like the Eversmoking Ring / Cart of Ore. — OR — Remove this card, then gain 5 gold (was 8)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resource round, gain 4 gold",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 5 gold",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 5 } }
        }
      ]
    }
  }),

  // Lion's Shield of Courage — option A gains the flat +1 base.
  "artifact.lions_shield_of_courage": reprint("artifact.lions_shield_of_courage", {
    tags: tags(
      "artifact.lions_shield_of_courage",
      "+1 defense, then discard X cards from hand to gain +X more defense. — OR — Remove this card, then gain +4 defense (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 defense, discard X cards: +X more defense",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, perCostCard: 1 }
        },
        {
          label: "Remove this card: +4 defense",
          cost: { removeSelf: true },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 4 }
        }
      ]
    }
  }),

  // Sword of Judgement — BOTH sides gain the flat +1 base.
  "artifact.sword_of_judgement": reprint("artifact.sword_of_judgement", {
    tags: tags(
      "artifact.sword_of_judgement",
      "+1 attack, then discard X cards from hand to gain +X more attack. — OR — +1 defense, then discard X cards from hand to gain +X more defense."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 attack, discard X cards: +X more attack",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1, perCostCard: 1 }
        },
        {
          label: "+1 defense, discard X cards: +X more defense",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1, perCostCard: 1 }
        }
      ]
    }
  }),

  // Sandals of the Saint — option A gains the flat +1 base.
  "artifact.sandals_of_the_saint": reprint("artifact.sandals_of_the_saint", {
    tags: tags(
      "artifact.sandals_of_the_saint",
      "+1 Power, then discard X cards from hand to gain +X more Power. — OR — Remove this card, then gain +4 Power (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 Power, discard X cards: +X more Power",
          cost: { discardCardsUpTo: 7 },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, perCostCard: 1 }
        },
        {
          label: "Remove this card: +4 Power",
          cost: { removeSelf: true },
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 4 }
        }
      ]
    }
  }),

  // ===================================================================== MAJOR

  // Ambassador's Sash — option B's "Reroll a die" becomes a Morale token. The
  // reroll offer itself is dropped from the die windows by
  // `balanceRerollReactionArtifactIds` (it never lived on this `effect`).
  "artifact.ambassadors_sash": reprint("artifact.ambassadors_sash", {
    tags: tags(
      "artifact.ambassadors_sash",
      "For every Dwelling you have, draw 1 corresponding Neutral Unit card; you can Recruit one of them at its printed cost (unchanged). — OR — Gain a positive Morale token (was \"Reroll a die\": while this pack is on the Sash is no longer offered in any die-reroll window)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: draw 1 Neutral Unit card per Dwelling, then recruit one (pay its cost)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT" }
        },
        {
          label: "Gain a positive Morale token",
          effect: { type: "GAIN_MORALE", amount: 1 }
        }
      ]
    }
  }),

  // Arms of Legion — the discount is 1 valuables OR 4 gold (two options), and
  // the resource side becomes a map-only silver reinforcement.
  "artifact.arms_of_legion": reprint("artifact.arms_of_legion", {
    tags: tags(
      "artifact.arms_of_legion",
      "Reduce the Recruitment or Reinforcement cost of a chosen unit by 4 gold — OR by 1 valuables (two options; was a flat 5 gold). — OR — Map: Remove this card, then Reinforce one of your silver Few cards, paying its Reinforcement cost reduced by 3 gold (minimum 0). The reinforce menu is the shared one, so the Citadel requirement and any banked Legion voucher apply; the option is hidden when no eligible, affordable silver card exists."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 4 gold",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 4 }
        },
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 1 valuables",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 0, valuables: 1 }
        },
        {
          label: "Map: Remove this card, then reinforce a silver unit for 3 less gold",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "LEGION_TIER_REINFORCE", tier: "silver", goldDiscount: 3 }
        }
      ]
    }
  }),

  // Cards of Prophecy — option A becomes the pre-Search Search (4); option B
  // widens to "any die" (the engine's ADVENTURE_DIE_SET already reads "any").
  "artifact.cards_of_prophecy": reprint("artifact.cards_of_prophecy", {
    tags: tags(
      "artifact.cards_of_prophecy",
      "Play this card before taking a Search action, then do Search (4) instead (was \"Reroll any die\": while this pack is on the Cards are no longer offered in any die-reroll window). — OR — Set a die on the side of your choice: play it FROM HAND in the Resource/Treasure die window itself (one option per printed face, the roll ignored), or arm it in advance on your map turn as a this-turn ongoing."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Before a Search: do Search (4) instead",
          // Instant timing: offered by the shared pre-Search prompt (the Polish
          // Speculum precedent), never armed as an ordinary free-turn map play.
          searchStartOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Cards of Prophecy",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 4 }]
            }
          }
        },
        {
          // Also offered FROM HAND inside the Resource/Treasure die window
          // itself (`communityDieSetHandSources`, adventure.ts) — the playtest
          // report "should not be an ongoing effect but rather an option to be
          // played before a roll". This armed-in-advance ongoing stays as the
          // second surface (and the AI's).
          label: "Set a die to the side of your choice",
          mapOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Cards of Prophecy",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "ADVENTURE_DIE_SET", dice: "any" }]
            }
          }
        }
      ]
    }
  }),

  // Endless Bag of Gold — option A becomes an ONGOING turn-end income.
  "artifact.endless_bag_of_gold": reprint("artifact.endless_bag_of_gold", {
    tags: tags(
      "artifact.endless_bag_of_gold",
      "🔄 Ongoing (ONE TURN): the card parks in your \"Permanents & Ongoing\" tray — it does NOT take a permanent slot — pays 3 gold ONCE at the END of that same turn and is then DISCARDED. It never pays on a later turn; draw it again to replay it. Was a one-shot \"gain 3 gold\". — OR — Remove this card, then gain 4 gold (was 6)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ongoing: gain 3 gold at the end of this turn, then discard this card",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Endless Bag of Gold",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "TURN_END_RESOURCE_GAIN", resource: "gold", amount: 3 }]
            }
          }
        },
        {
          label: "Remove this card: gain 4 gold",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 4 } }
        }
      ]
    }
  }),

  // Endless Purse of Gold — both sides gain a discard cost / cheaper payout.
  "artifact.endless_purse_of_gold": reprint("artifact.endless_purse_of_gold", {
    tags: tags(
      "artifact.endless_purse_of_gold",
      "Discard a card, then gain 3 gold (the 3 gold now costs a card). — OR — Remove this card and discard 2 cards, then gain 6 gold (was 8)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard a card: gain 3 gold",
          cost: { discardCards: 1 },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 3 } }
        },
        {
          label: "Remove this card and discard 2 cards: gain 6 gold",
          cost: { removeSelf: true, discardCards: 2 },
          effect: { type: "GAIN_RESOURCES", gain: { gold: 6 } }
        }
      ]
    }
  }),

  // Everflowing Crystal Cloak — both sides rewritten.
  "artifact.everflowing_crystal_cloak": reprint("artifact.everflowing_crystal_cloak", {
    tags: tags(
      "artifact.everflowing_crystal_cloak",
      "Discard a card, then gain 1 valuables (was discard 3 for 2). — OR — Remove this card and discard 2 cards, then gain 2 valuables (was a free 1 valuables)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard a card: gain 1 valuables",
          cost: { discardCards: 1 },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        },
        {
          label: "Remove this card and discard 2 cards: gain 2 valuables",
          cost: { removeSelf: true, discardCards: 2 },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 2 } }
        }
      ]
    }
  }),

  // Everpouring Vial of Mercury — option A becomes an ONGOING turn-end income.
  "artifact.everpouring_vial_of_mercury": reprint("artifact.everpouring_vial_of_mercury", {
    tags: tags(
      "artifact.everpouring_vial_of_mercury",
      "🔄 Ongoing (ONE TURN): the card parks in your \"Permanents & Ongoing\" tray — it does NOT take a permanent slot — pays 1 valuables ONCE at the END of that same turn and is then DISCARDED. It never pays on a later turn. Was a one-shot \"gain 1 valuables\". — OR — Remove this card, then gain 1 valuables (was 2)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ongoing: gain 1 valuables at the end of this turn, then discard this card",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Everpouring Vial of Mercury",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "TURN_END_RESOURCE_GAIN", resource: "valuables", amount: 1 }]
            }
          }
        },
        {
          label: "Remove this card: gain 1 valuables",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        }
      ]
    }
  }),

  // Eversmoking Ring of Sulfur — the income side is unchanged; the remove side
  // pays 1 valuables (was 2). The MINOR → MAJOR move is the tier seam
  // (`effectiveArtifactTier` / `makeSharedDecks`), not this definition.
  "artifact.eversmoking_ring_of_sulfur": reprint("artifact.eversmoking_ring_of_sulfur", {
    tags: tags(
      "artifact.eversmoking_ring_of_sulfur",
      "At the beginning of each Resource round, gain 1 valuables (unchanged). — OR — Remove this card, then gain 1 valuables (was 2). The sheet also moves this card from MINOR to MAJOR: while the pack is on it is dealt into the Major Artifact deck and reads as Major at every tier gate, exactly as the `eversmoking-ring-of-sulfur-major` house rule does."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resource round, gain 1 valuables",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 1 valuables",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { valuables: 1 } }
        }
      ]
    }
  }),

  // Golden Bow — option A trades the combat-penalty waiver for an Attack-die
  // reroll on each of your ranged units' attacks.
  "artifact.golden_bow": reprint("artifact.golden_bow", {
    tags: tags(
      "artifact.golden_bow",
      "During this Combat, each of your ranged units may reroll its Attack die once per attack (the printed combat-penalty waiver is GONE — this printing grants the reroll instead). — OR — A ranged unit of your choice gains +2 attack (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: your ranged units may reroll an Attack die on each attack",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Golden Bow",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "RANGED_ATTACK_REROLL" }]
            }
          }
        },
        {
          label: "+2 attack for a ranged unit",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2, unitTypes: ["ranged"] }
        }
      ]
    }
  }),

  // Head of Legion — 1 valuables OR 4 gold, and a map-only GOLD-tier reinforce.
  "artifact.head_of_legion": reprint("artifact.head_of_legion", {
    tags: tags(
      "artifact.head_of_legion",
      "Reduce the Recruitment or Reinforcement cost of a chosen unit by 4 gold — OR by 1 valuables (two options; was a flat 6 gold). — OR — Map: Remove this card, then Reinforce one of your GOLD Few cards, paying its Reinforcement cost reduced by 1 valuables or 3 gold (the menu lists both currencies per eligible card). The reinforce menu is the shared one, so the Citadel requirement and any banked Legion voucher apply; the option is hidden when the menu would be empty."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 4 gold",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 4 }
        },
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 1 valuables",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 0, valuables: 1 }
        },
        {
          label: "Map: Remove this card, then reinforce a gold unit for 1 valuables or 3 gold less",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "LEGION_TIER_REINFORCE", tier: "gold", goldDiscount: 3, valuablesDiscount: 1 }
        }
      ]
    }
  }),

  // Ogre's Club of Havoc — option A becomes the Targ pattern: discard 2 for +3
  // attack, then the card returns to hand.
  "artifact.ogres_club_of_havoc": reprint("artifact.ogres_club_of_havoc", {
    tags: tags(
      "artifact.ogres_club_of_havoc",
      "Discard 2 cards to gain +3 attack. Then, instead of discarding, put this card back into your hand (was discard 1 for +2, no return). — OR — +1 attack (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: +3 attack, then return this card to your hand",
          cost: { discardCards: 2 },
          returnSelfToHand: true,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3 }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    }
  }),

  // Pendant of Second Sight — option A now ALSO removes a Paralysis token in the
  // same play; option B becomes a Search (2) of your own deck.
  "artifact.pendant_of_second_sight": reprint("artifact.pendant_of_second_sight", {
    tags: tags(
      "artifact.pendant_of_second_sight",
      "ONE play: remove 1 Paralysis token from your selected unit AND that unit cannot gain Paralysis for the rest of this Combat. — OR — Search (2) your own Might & Magic deck (reveal 2, keep 1, the rest to your discard) — was the standalone \"remove 1 Paralysis token\"."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 1 Paralysis token, and this Combat your unit cannot gain Paralysis",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            removeParalysis: true,
            effect: {
              name: "Pendant of Second Sight",
              scope: "unit",
              duration: { type: "combat" },
              polarity: "positive",
              modifiers: [{ type: "PARALYSIS_IMMUNITY" }]
            }
          }
        },
        {
          label: "Search (2) your Might and Magic deck",
          target: { type: "none" },
          effect: { type: "DECK_DIG_KEEP_ONE", count: 2 }
        }
      ]
    }
  }),

  // Surcoat of Counterpoise — both sides become spell-capable Defense instants
  // (the Interference / Plate of the Dying Light arm).
  "artifact.surcoat_of_counterpoise": reprint("artifact.surcoat_of_counterpoise", {
    tags: tags(
      "artifact.surcoat_of_counterpoise",
      "+1 defense, and the SAME +1 may instead reduce the damage an enemy Spell deals to your unit (played into that Spell's cast, exactly like Interference / Plate of the Dying Light). — OR — Discard 1 card for +2 defense, likewise usable against Spell damage. Both printed halves of the old card (the Power-1 Spell cancel and the Search (1) Artifact) are GONE."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 defense (also reduces this Spell's damage to your unit)",
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "INTERFERE_SPELL", amount: 1 }
        },
        {
          label: "Discard 1 card: +2 defense (also reduces this Spell's damage to your unit)",
          cost: { discardCards: 1 },
          trigger: { event: "SPELL_CAST_STARTED", controller: "opponent" },
          effect: { type: "INTERFERE_SPELL", amount: 2 }
        }
      ]
    }
  }),

  // Targ of the Rampaging Ogre — option A pays +3 defense (was +2).
  "artifact.targ_of_the_rampaging_ogre": reprint("artifact.targ_of_the_rampaging_ogre", {
    tags: tags(
      "artifact.targ_of_the_rampaging_ogre",
      "Discard 2 cards to gain +3 defense (was +2). Then, instead of discarding, put this card back into your hand. — OR — +1 defense (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 2 cards: +3 defense, then return this card to your hand",
          cost: { discardCards: 2 },
          returnSelfToHand: true,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 3 }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    }
  }),

  // Tunic of the Cyclops King — option B pays +3 Power (was +2).
  "artifact.tunic_of_the_cyclops_king": reprint("artifact.tunic_of_the_cyclops_king", {
    tags: tags(
      "artifact.tunic_of_the_cyclops_king",
      "+1 Power, then draw a card (already exactly what the engine ran — the wording only reorders it). — OR — +3 Power (was +2)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 Power, then draw a card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1 }
        },
        {
          label: "+3 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 3 }
        }
      ]
    }
  }),

  // ===================================================================== MINOR

  // Breastplate of Petrified Wood — option B gains the Wisdom "next Spell is
  // free of the round limit" rider.
  "artifact.breastplate_of_petrified_wood": reprint("artifact.breastplate_of_petrified_wood", {
    tags: tags(
      "artifact.breastplate_of_petrified_wood",
      "Draw a card (unchanged). — OR — +1 Power, and the next Spell you play does not count towards this combat round's Spell limit (the same `spellLimitBonus` arm the community Wisdom uses)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        },
        {
          label: "+1 Power; the next Spell does not count towards the round's Spell limit",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, spellLimitBonus: 1 }
        }
      ]
    }
  }),

  // Centaur's Axe — option A moves to the POST-roll window (see the header).
  "artifact.centaurs_axe": reprint("artifact.centaurs_axe", {
    tags: tags(
      "artifact.centaurs_axe",
      "Use this AFTER the Attack die roll: triple the Attack die's outcome. It is offered to the ATTACKING side in the dedicated post-roll window (the face is already known) and is NEVER offered before the roll. The Polish reprint's \"ignored on a −1\" clause is not on this printing, so with both packs on a rolled −1 is tripled again. — OR — +1 attack (unchanged, still a pre-roll play)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "After the Attack die roll: triple the die's outcome",
          afterAttackRoll: true,
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "TRIPLE_ATTACK_DIE" }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    }
  }),

  // Dragon Wing Tabard — both sides rewritten.
  "artifact.dragon_wing_tabard": reprint("artifact.dragon_wing_tabard", {
    tags: tags(
      "artifact.dragon_wing_tabard",
      "+1 Power, then draw 1 card (was \"discard 1 random card from the enemy's hand\"). — OR — Return 1 Spell of your choice from your discard pile to your hand (was a bare +1 Power)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 Power, then draw 1 card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1 }
        },
        {
          label: "Return 1 Spell from your discard pile to your hand",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell" }
        }
      ]
    }
  }),

  // Hourglass of the Evil Hour — option A becomes a flat +1 defense; option B a
  // combat-round-long "ignore all +1 Attack die results".
  "artifact.hourglass_of_the_evil_hour": reprint("artifact.hourglass_of_the_evil_hour", {
    tags: tags(
      "artifact.hourglass_of_the_evil_hour",
      "+1 defense (was the enemy's-morale strip). — OR — Until the end of the Combat round, every rolled \"+1\" on an Attack die counts as 0 — for BOTH armies, as the printed \"all\" reads. LIMIT: only the die's numeric result is ignored; abilities keyed off the \"+1\" FACE still fire."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        },
        {
          label: "This combat round: every \"+1\" Attack die result counts as 0",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Hourglass of the Evil Hour",
              scope: "global",
              duration: { type: "current-combat-round" },
              polarity: "neutral",
              removable: true,
              modifiers: [{ type: "IGNORE_ATTACK_DIE_PLUS_ONE" }]
            }
          }
        }
      ]
    }
  }),

  // Inexhaustible Cart of Lumber — option A becomes an ONGOING turn-end income.
  "artifact.inexhaustible_cart_of_lumber": reprint("artifact.inexhaustible_cart_of_lumber", {
    tags: tags(
      "artifact.inexhaustible_cart_of_lumber",
      "🔄 Ongoing (ONE TURN): the card parks in your \"Permanents & Ongoing\" tray — it does NOT take a permanent slot — pays 2 building materials ONCE at the END of that same turn and is then DISCARDED. It never pays on a later turn. Was a one-shot \"gain 2\". — OR — Remove this card, then gain 3 building materials (was 4)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Ongoing: gain 2 building materials at the end of this turn, then discard this card",
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Inexhaustible Cart of Lumber",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "TURN_END_RESOURCE_GAIN", resource: "buildingMaterials", amount: 2 }]
            }
          }
        },
        {
          label: "Remove this card: gain 3 building materials",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 3 } }
        }
      ]
    }
  }),

  // Inexhaustible Cart of Ore — the income permanent pays 2 (was 1).
  "artifact.inexhaustible_cart_of_ore": reprint("artifact.inexhaustible_cart_of_ore", {
    permanentEffect: { resourceRoundGain: { resource: "buildingMaterials", amount: 2 } },
    tags: tags(
      "artifact.inexhaustible_cart_of_ore",
      "At the beginning of each Resource round, gain 2 building materials (was 1). — OR — Remove this card, then gain 3 building materials (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resource round, gain 2 building materials",
          effect: { type: "ENTER_PLAY" }
        },
        {
          label: "Remove this card: gain 3 building materials",
          cost: { removeSelf: true },
          effect: { type: "GAIN_RESOURCES", gain: { buildingMaterials: 3 } }
        }
      ]
    }
  }),

  // Legs of Legion — 3 gold discount; the resource side becomes a bronze
  // map-only reinforcement.
  "artifact.legs_of_legion": reprint("artifact.legs_of_legion", {
    tags: tags(
      "artifact.legs_of_legion",
      "Reduce the Recruitment or Reinforcement cost of a chosen unit by 3 gold (was 4). — OR — Map: Remove this card, then Reinforce one of your bronze Few cards, paying its Reinforcement cost reduced by 2 gold (minimum 0)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 3 gold",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 3 }
        },
        {
          label: "Map: Remove this card, then reinforce a bronze unit for 2 less gold",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "LEGION_TIER_REINFORCE", tier: "bronze", goldDiscount: 2 }
        }
      ]
    }
  }),

  // Loins of Legion — 3 gold discount; the resource side becomes a bronze
  // map-only reinforcement that also costs a discard.
  "artifact.loins_of_legion": reprint("artifact.loins_of_legion", {
    tags: tags(
      "artifact.loins_of_legion",
      "Reduce the Recruitment or Reinforcement cost of a chosen unit by 3 gold (was 5). — OR — Map: Remove this card AND discard 1 card, then Reinforce one of your bronze Few cards, paying its Reinforcement cost reduced by 3 gold (minimum 0)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 3 gold",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 3 }
        },
        {
          label: "Map: Remove this card and discard 1, then reinforce a bronze unit for 3 less gold",
          mapOnly: true,
          cost: { removeSelf: true, discardCards: 1 },
          effect: { type: "LEGION_TIER_REINFORCE", tier: "bronze", goldDiscount: 3 }
        }
      ]
    }
  }),

  // Scales of the Greater Basilisk — option A pays +2 Power (was +3).
  "artifact.scales_of_the_greater_basilisk": reprint("artifact.scales_of_the_greater_basilisk", {
    tags: tags(
      "artifact.scales_of_the_greater_basilisk",
      "+2 Power (was +3). — OR — +1 Power, then draw a card (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 2 }
        },
        {
          label: "+1 Power, then draw a card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1 }
        }
      ]
    }
  }),

  // Royal Armor of Nix — option A pays +3 Power (was +2), completing the
  // requested +2/+3 swap with Scales of the Greater Basilisk.
  "artifact.royal_armor_of_nix": reprint("artifact.royal_armor_of_nix", {
    tags: tags(
      "artifact.royal_armor_of_nix",
      "+3 Power (was +2). — OR — On a Sea tile, Search (2) the Spell deck (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+3 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 3 }
        },
        {
          label: "On a Sea tile: Search (2) the Spell deck",
          requiresSeaTile: true,
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 2 }
        }
      ]
    }
  }),

  // Speculum — the remove side becomes a Search (1) of a deck you pick.
  "artifact.speculum": reprint("artifact.speculum", {
    tags: tags(
      "artifact.speculum",
      "Discover any Map tile adjacent to the Map tile your Hero is on (unchanged). — OR — Remove this card, then Search (1) the Artifact deck, the Spell deck OR your own Might & Magic deck — three options, you pick which (was a bare \"draw 1 card\")."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discover an adjacent map tile",
          mapOnly: true,
          effect: { type: "DISCOVER_TILE_CARD" }
        },
        {
          label: "Remove this card: Search (1) the Artifact deck",
          cost: { removeSelf: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "artifacts", count: 1 }
        },
        {
          label: "Remove this card: Search (1) the Spell deck",
          cost: { removeSelf: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 1 }
        },
        {
          label: "Remove this card: Search (1) your Might and Magic deck",
          cost: { removeSelf: true },
          target: { type: "none" },
          effect: { type: "DECK_DIG_KEEP_ONE", count: 1 }
        }
      ]
    }
  }),

  // Spirit of Oppression — option A becomes a map play that hits EVERY player
  // with negative morale.
  "artifact.spirit_of_oppression": reprint("artifact.spirit_of_oppression", {
    tags: tags(
      "artifact.spirit_of_oppression",
      "🌎 Map: ALL players — you included — gain a negative Morale token (was the combat-long \"nobody may use positive morale or reroll Attack dice\"). — OR — +1 Power (unchanged)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: every player gains a negative Morale token",
          mapOnly: true,
          effect: { type: "GAIN_MORALE", amount: -1, allPlayers: true }
        },
        {
          label: "+1 Power",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    }
  }),

  // Torso of Legion — 3 gold discount; the resource side becomes a silver
  // map-only reinforcement.
  "artifact.torso_of_legion": reprint("artifact.torso_of_legion", {
    tags: tags(
      "artifact.torso_of_legion",
      "Reduce the Recruitment or Reinforcement cost of a chosen unit by 3 gold. — OR — Map: Remove this card, then Reinforce one of your silver Few cards, paying its Reinforcement cost reduced by 2 gold (minimum 0). The printed \"gain 1 valuables or 2 building materials\" side is gone."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Reduce a chosen unit's recruit/reinforce cost by 3 gold",
          mapOnly: true,
          effect: { type: "GAIN_RECRUIT_DISCOUNT", amount: 3 }
        },
        {
          label: "Map: Remove this card, then reinforce a silver unit for 2 less gold",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "LEGION_TIER_REINFORCE", tier: "silver", goldDiscount: 2 }
        }
      ]
    }
  })
};

/** Every artifact id the Community Balance Change REPRINTS as a whole definition. */
export const COMMUNITY_BALANCE_ARTIFACT_IDS: readonly string[] = Object.keys(communityBalanceArtifactCards);
