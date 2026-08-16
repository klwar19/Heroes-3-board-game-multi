import type { CardDefinition, CardLibrary } from "@/engine/state";

import { artifactCards } from "./artifacts";
import { sampleCards } from "./sample";

/**
 * Polish Balance Pack (`polish-card-balance`) — the 27 reprinted ARTIFACT cards.
 *
 * THE COMMITTED CARD FACE IS THE AUTHORITY (the pack's own graphics folder), not
 * the balance spreadsheet: every clause below was read off
 * `public/assets/polish-balance/artifact-<slug>.webp`. Face-vs-spec divergences
 * are called out per card (the face wins).
 *
 * Each entry is the PRINTED definition with a replaced `effect` (and `tags`), so
 * everything else the engine reads off a card — kind, tier, deck membership,
 * uniqueness, artifact-SET membership, art — is untouched.
 * `polishBalanceCardLibrary` in `src/engine/polish-balance-spells.ts` swaps these
 * definitions in ONLY while the house rule is on; with it off nothing here is
 * consulted and every card plays its printed text.
 *
 * `tags`' last entry is the human-readable "Balance pack: …" text (the
 * `initiative-specialty-draw` precedent).
 *
 * DELIBERATE READINGS / LIMITS, stated up front (CLAUDE.md #4):
 *  - The five "+N initiative AND can move N more spaces" reprints (Boots of
 *    Speed, Equestrian's Gloves, Ring of the Wayfarer, Necklace of Swiftness,
 *    Cape of Velocity) PRINT their Combat-movement half, so — exactly like the
 *    Balance-Pack Haste / Slow — it applies whatever the `combat-move-initiative`
 *    house rule says. Their own printed amount REPLACES the classic ±1 rider, so
 *    nothing double-counts when both rules are on
 *    (`POLISH_BALANCE_PRINTED_MOVEMENT_IDS`, read in `getUnitMoveRange`).
 *  - CARDS OF PROPHECY option A prints "Until its activation in the next round".
 *    The closest existing duration is `next-activation`, which ends when that
 *    unit's next activation ENDS — one activation's worth longer than the printed
 *    wording. The same reading the Balance-Pack Prayer already ships.
 *  - CARDS OF PROPHECY option B ("roll it 3 times and resolve 1 chosen result")
 *    lives in the ATTACK-die and ABILITY-roll reroll windows, where a candidate
 *    list exists. On the MAP dice (the Resource/Treasure/Scholar roll windows)
 *    the card keeps its classic single reroll — those windows re-roll in place
 *    and hold no candidate history, so "resolve 1 chosen result" has nothing to
 *    choose between there. Stated, not silently narrowed.
 *  - GOLDEN BOW's "can reroll 1 Attack die once per turn" is read per ATTACK (the
 *    Ammo Cart precedent, whose identical printed clause is rebuilt per attack):
 *    a ranged unit of the owner gets one reroll on each of its attacks while the
 *    Bow's effect lives.
 *  - CROWN OF DRAGONTOOTH option B is UNCHANGED. The spec sheet read it as
 *    "remove 1 spell from the Spellbook"; the committed face prints "Remove 1
 *    [spell] from hand, then Search (2) [spells]" — i.e. the printed card. Face
 *    wins.
 *  - The four "Cast a Spell + Refresh 1" recovery reprints (Crown of the Five
 *    Seas, Thunder Helmet, Helm of the Alabaster Unicorn, Rib Cage) are ALREADY
 *    exactly what the Polish Spell Book mode does for a count-1 `filter: "spell"`
 *    TAKE_FROM_DISCARD (openDiscardPickChoice's `polishReturnEnabler` path). They
 *    are reprinted here for their TAGS only — the engine needed no change, and a
 *    NON-book game keeps the printed "return a Spell from your discard" reading.
 *  - HELM OF THE ALABASTER UNICORN option B's "Add casted Spell to your
 *    Spellbook" is BOOK-GATED: without `polish-spell-book` there is no Spellbook
 *    to inscribe into and the cast spell stays in the shared Spell-deck discard
 *    pile exactly as before.
 *  - BLACKSHARD's draw rider is BOOK-GATED: with the Polish Book on it fires when
 *    the discarded card was a "Cast a Spell" enabler (owned Spells live in the
 *    Book, so a raw Spell card is not in hand to pitch); without the Book it
 *    keeps the printed "was a Spell" check.
 */

/** The printed definition a balance reprint is cloned from. */
function printed(cardId: string): CardDefinition {
  const card = artifactCards[cardId] ?? sampleCards[cardId];
  if (!card) {
    throw new Error(`Polish Balance Pack: no printed artifact ${cardId}`);
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

function tags(cardId: string, balanceText: string): string[] {
  const base = printed(cardId).tags ?? [];
  // Drop the printed rules line (the last tag) — it would promise the classic
  // text — and state the reprint instead. The structural tags (tier, "artifact",
  // "binh-extra", "permanent", "income", …) are kept.
  const keep = base.filter(
    (tag) => !tag.includes(" — OR — ") && !tag.startsWith("Triple the Attack die") && tag !== "wiki-reference"
  );
  return [...keep, `Balance pack: ${balanceText}`];
}

/**
 * The five reprints whose PRINTED text carries a Combat-movement half. Read by
 * `getUnitMoveRange` beside the Balance-Pack Haste / Slow, so their movement
 * applies even with the classic `combat-move-initiative` rule off.
 */
export const POLISH_BALANCE_MOVEMENT_ARTIFACT_IDS = [
  "artifact.boots_of_speed",
  "artifact.equestrians_gloves",
  "artifact.ring_of_the_wayfarer",
  "artifact.necklace_of_swiftness",
  "artifact.cape_of_velocity"
] as const;

export const polishBalanceArtifactCards: CardLibrary = {
  // ---- Initiative + Combat-movement riders --------------------------------

  // Boots of Speed — option B gains "and can move 1 more space".
  "artifact.boots_of_speed": reprint("artifact.boots_of_speed", {
    tags: tags(
      "artifact.boots_of_speed",
      "Your hero gains +1 movement. — OR — For this Combat, your selected unit gains +1 initiative and can move 1 more space."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your hero gains +1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        },
        {
          label: "+1 initiative and +1 Combat movement for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Boots of Speed",
            amount: 1,
            movementBonus: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        }
      ]
    }
  }),

  // Equestrian's Gloves — option A gains "and can move 1 more space".
  "artifact.equestrians_gloves": reprint("artifact.equestrians_gloves", {
    tags: tags(
      "artifact.equestrians_gloves",
      "For this Combat, your selected unit gains +1 initiative and can move 1 more space. — OR — Your Hero gains +1 movement."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 initiative and +1 Combat movement for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Equestrian's Gloves",
            amount: 1,
            movementBonus: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "Your hero gains +1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        }
      ]
    }
  }),

  // Ring of the Wayfarer — option A gains "and can move 1 more space".
  "artifact.ring_of_the_wayfarer": reprint("artifact.ring_of_the_wayfarer", {
    tags: tags(
      "artifact.ring_of_the_wayfarer",
      "For this Combat, your selected unit gains +1 initiative and can move 1 more space. — OR — At the start of a Combat with Neutral Units, place a Paralysis token on any unit except Azure."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 initiative and +1 Combat movement for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Ring of the Wayfarer",
            amount: 1,
            movementBonus: 1,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "Start of a Neutral combat: Paralyse any non-Azure unit",
          combatOnly: true,
          requiresNeutralCombatStart: true,
          target: { type: "any-unit" },
          effect: { type: "PLACE_PARALYSIS", gradeByPower: { 0: "gold" } }
        }
      ]
    }
  }),

  // Necklace of Swiftness — option A's army-wide GROUND buff gains "+1 space".
  "artifact.necklace_of_swiftness": reprint("artifact.necklace_of_swiftness", {
    tags: tags(
      "artifact.necklace_of_swiftness",
      "During this Combat, the initiative of all your ground units is increased by 1 and they can move 1 more space. — OR — Move one of your units 1 space."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: +1 initiative and +1 Combat movement to all your ground units",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Necklace of Swiftness",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              removable: true,
              modifiers: [
                { type: "GROUND_INITIATIVE_BONUS", amount: 1 },
                { type: "GROUND_MOVEMENT_BONUS", amount: 1 }
              ]
            }
          }
        },
        {
          label: "Move one of your units 1 space",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: { type: "MOVE_UNIT_ADJACENT" }
        }
      ]
    }
  }),

  // Cape of Velocity — option A gains "and can move 2 more spaces".
  "artifact.cape_of_velocity": reprint("artifact.cape_of_velocity", {
    tags: tags(
      "artifact.cape_of_velocity",
      "Until the end of the Combat, this unit gains +2 initiative and can move 2 more spaces. — OR — Gain 2 gold."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 initiative and +2 Combat movement for this combat",
          effect: {
            type: "CREATE_INITIATIVE_BUFF",
            name: "Cape of Velocity",
            amount: 2,
            movementBonus: 2,
            duration: { type: "combat" },
            polarity: "positive",
            removable: true
          }
        },
        {
          label: "Gain 2 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 2 } }
        }
      ]
    }
  }),

  // ---- Flat +1 bases on the "Discard X" relics ----------------------------

  // Celestial Necklace of Bliss — option A now reads "+1 attack. Discard X …".
  "artifact.celestial_necklace_of_bliss": reprint("artifact.celestial_necklace_of_bliss", {
    tags: tags(
      "artifact.celestial_necklace_of_bliss",
      "+1 attack, and discard X cards from hand to gain +X more attack. — OR — Remove this card, then gain +4 attack."
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

  // Sword of Judgement — BOTH sides gain the flat +1 base.
  "artifact.sword_of_judgement": reprint("artifact.sword_of_judgement", {
    tags: tags(
      "artifact.sword_of_judgement",
      "+1 attack, and discard X cards from hand to gain +X more attack. — OR — +1 defense, and discard X cards from hand to gain +X more defense."
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

  // Lion's Shield of Courage — option A gains the flat +1 base.
  "artifact.lions_shield_of_courage": reprint("artifact.lions_shield_of_courage", {
    tags: tags(
      "artifact.lions_shield_of_courage",
      "+1 defense, and discard X cards from hand to gain +X more defense. — OR — Remove this card, then gain +4 defense."
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

  // Sandals of the Saint — option A gains the flat +1 base.
  "artifact.sandals_of_the_saint": reprint("artifact.sandals_of_the_saint", {
    tags: tags(
      "artifact.sandals_of_the_saint",
      "+1 Power, and discard X cards from hand to gain +X more Power. — OR — Remove this card, then gain +4 Power."
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

  // ---- Dice manipulation ---------------------------------------------------

  // Cards of Prophecy — REWRITTEN on both halves. Option A is the lasting
  // roll-the-HIGHER buff (the Shaman's Puppet mirror). Option B is the
  // "roll it 3 times, resolve 1 chosen" reroll-window instant, which the engine
  // offers from hand (REROLL_REACTION_ARTIFACT_IDS) rather than as a pre-armed
  // option — exactly like the classic "Reroll any die" half it replaces. The
  // printed map die-SET side is gone.
  "artifact.cards_of_prophecy": reprint("artifact.cards_of_prophecy", {
    target: { type: "friendly-unit" },
    tags: tags(
      "artifact.cards_of_prophecy",
      "Choose one of your units. Until its activation in the next round, for its every attack the unit rolls 2 dice and resolves the HIGHER result. — OR — When you are about to roll any die, roll it 3 times and resolve 1 chosen result (offered in the die window)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your unit rolls 2 Attack dice and keeps the higher until its next activation",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Cards of Prophecy",
              scope: "unit",
              duration: { type: "next-activation" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "ATTACK_ROLL_ADVANTAGE" }]
            }
          }
        }
      ]
    }
  }),

  // Shaman's Puppet — option A's duration extends from "until the end of its
  // activation" to "until the end of the NEXT round" (this combat round and the
  // next = `combat-rounds: 2`, the Balance-Pack Fire Shield reading).
  "artifact.shamans_puppet": reprint("artifact.shamans_puppet", {
    tags: tags(
      "artifact.shamans_puppet",
      "Choose a unit. Until the end of the next combat round, for its every attack it rolls 2 Attack dice and resolves the lower result. — OR — Remove any effect or Paralysis from your selected unit."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Unit rolls the lower of 2 Attack dice until the end of the next round",
          combatOnly: true,
          target: { type: "enemy-unit" },
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Shaman's Puppet",
              scope: "unit",
              duration: { type: "combat-rounds", rounds: 2 },
              polarity: "negative",
              removable: true,
              modifiers: [{ type: "ATTACK_ROLL_DISADVANTAGE" }]
            }
          }
        },
        {
          label: "Remove any effect or Paralysis from your selected unit",
          combatOnly: true,
          target: { type: "friendly-unit" },
          effect: {
            type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
            amount: 0,
            removePolarity: "negative",
            removeParalysis: true
          }
        }
      ]
    }
  }),

  // Hourglass of the Evil Hour — option B replaces the roll-for-morale gamble
  // with a one-combat-round curse on the ENEMY's Attack dice.
  "artifact.hourglass_of_the_evil_hour": reprint("artifact.hourglass_of_the_evil_hour", {
    tags: tags(
      "artifact.hourglass_of_the_evil_hour",
      "If the enemy has positive morale, they gain negative. — OR — For this combat round, each \"+1\" result on your enemy's Attack dice is rerolled once."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "If the enemy has positive morale, they gain negative",
          effect: { type: "ENEMY_MORALE_STRIP" }
        },
        {
          label: "This combat round: reroll each \"+1\" on the enemy's Attack dice",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Hourglass of the Evil Hour",
              scope: "player",
              duration: { type: "current-combat-round" },
              polarity: "positive",
              removable: true,
              modifiers: [{ type: "REROLL_ENEMY_PLUS_ONE" }]
            }
          }
        }
      ]
    }
  }),

  // Centaur's Axe — the tripling is IGNORED on a rolled "-1" (a −1 stays −1
  // instead of becoming −3).
  "artifact.centaurs_axe": reprint("artifact.centaurs_axe", {
    tags: tags(
      "artifact.centaurs_axe",
      "Triple the Attack die's outcome — ignored on a \"-1\" result. — OR — +1 attack."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Triple the Attack die's outcome (ignored on a \"-1\")",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "TRIPLE_ATTACK_DIE", ignoreOnNegative: true }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    }
  }),

  // Golden Bow — option A's ongoing effect also grants the owner's ranged units
  // an Attack-die reroll while it lives.
  "artifact.golden_bow": reprint("artifact.golden_bow", {
    tags: tags(
      "artifact.golden_bow",
      "During this Combat, your ranged units ignore the combat penalty and can reroll 1 Attack die on each of their attacks. — OR — A ranged unit of your choice gains +2 attack."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your ranged units ignore the combat penalty and may reroll an Attack die this combat",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Golden Bow",
              scope: "player",
              duration: { type: "combat" },
              modifiers: [{ type: "RANGED_IGNORE_PENALTY" }, { type: "RANGED_ATTACK_REROLL" }]
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

  // ---- Card / deck economy -------------------------------------------------

  // Pendant of Second Sight — a THIRD option: Search (3) your own M&M deck
  // (reveal 3, keep 1 to hand, the rest to the discard — the Solmyr IV dig).
  "artifact.pendant_of_second_sight": reprint("artifact.pendant_of_second_sight", {
    tags: tags(
      "artifact.pendant_of_second_sight",
      "Your selected unit cannot gain a Paralysis token during this Combat. — OR — Remove 1 Paralysis token from your selected unit. — OR — Search (3) your Might and Magic deck."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: your selected unit cannot gain Paralysis",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
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
          label: "Remove 1 Paralysis token from your selected unit",
          combatOnly: true,
          effect: { type: "HEAL_DAMAGE", amount: 0, removeParalysis: true }
        },
        {
          label: "Search (3) your Might and Magic deck",
          target: { type: "none" },
          effect: { type: "DECK_DIG_KEEP_ONE", count: 3 }
        }
      ]
    }
  }),

  // Speculum — a THIRD option: until the end of this turn every Search you take
  // is Search (X+1) (the Balance-Pack Scouting machinery at delta 1).
  "artifact.speculum": reprint("artifact.speculum", {
    tags: tags(
      "artifact.speculum",
      "Discover any Map tile adjacent to the Map tile your Hero is currently on. — OR — Until the end of this turn, when you do a Search action do Search (X+1) instead. — OR — Remove this card, then draw 1 card."
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
          label: "Until the end of this turn: every Search is Search (X+1)",
          // Instant timing: offered by the shared pre-Search prompt, alongside
          // Scouting. It cannot be armed as an ordinary free-turn map play.
          searchStartOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Speculum",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              // `count` is the classic-printing value this modifier would mean
              // with the rule OFF — unreachable here (the whole definition only
              // exists under the rule), so it is pinned to 0 and `balanceDelta`
              // is what `searchCountOverrideFor` reads.
              modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 0, balanceDelta: 1, balancePersist: true }]
            }
          }
        },
        {
          label: "Remove this card: draw 1 card",
          cost: { removeSelf: true },
          effect: { type: "DRAW_CARDS", amount: 1 }
        }
      ]
    }
  }),

  // Dragon Wing Tabard — option B gains the "draw 1 card then discard 1" cycle.
  "artifact.dragon_wing_tabard": reprint("artifact.dragon_wing_tabard", {
    tags: tags(
      "artifact.dragon_wing_tabard",
      "Discard 1 random card from the enemy's hand. — OR — +1 Power, draw 1 card then discard 1 card."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 random card from the enemy's hand",
          effect: { type: "RANDOM_ENEMY_DISCARD", count: 1 }
        },
        {
          label: "+1 Power, draw 1 card then discard 1 card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1, thenDiscard: 1 }
        }
      ]
    }
  }),

  // Spirit of Oppression — option B gains the same cycle rider.
  "artifact.spirit_of_oppression": reprint("artifact.spirit_of_oppression", {
    tags: tags(
      "artifact.spirit_of_oppression",
      "During this Combat, neither player can use the positive morale token or reroll Attack dice. — OR — +1 Power, draw 1 card then discard 1 card."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This Combat: neither player may use the positive morale token or reroll Attack dice",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Spirit of Oppression",
              scope: "global",
              duration: { type: "combat" },
              modifiers: [{ type: "NO_ATTACK_DIE_REROLL" }]
            }
          }
        },
        {
          label: "+1 Power, draw 1 card then discard 1 card",
          trigger: { event: "SPELL_CAST_STARTED", controller: "self" },
          effect: { type: "ADD_SPELL_POWER", amount: 1, drawCards: 1, thenDiscard: 1 }
        }
      ]
    }
  }),

  // Blackshard of the Dead Knight — the draw rider is book-gated (see the header).
  "artifact.blackshard_of_the_dead_knight": reprint("artifact.blackshard_of_the_dead_knight", {
    tags: tags(
      "artifact.blackshard_of_the_dead_knight",
      "+2 attack and discard 1 card. If the discarded card was a \"Cast a Spell\" (Polish Spell Book) — or a Spell without the Book — draw 1 card. — OR — +1 attack."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+2 attack, discard 1 card (draw 1 if it was a Cast a Spell)",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: {
            type: "ADD_COMBAT_STAT",
            stat: "attack",
            amount: 2,
            drawIfCostCardSpell: true,
            drawIfCostCardCastEnabler: true
          }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    }
  }),

  // Eversmoking Ring of Sulfur — the remove side pays 1 valuables (was 2).
  "artifact.eversmoking_ring_of_sulfur": reprint("artifact.eversmoking_ring_of_sulfur", {
    tags: tags(
      "artifact.eversmoking_ring_of_sulfur",
      "At the beginning of each Resources round, gain 1 valuables. — OR — Remove this card, then gain 1 valuables."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "At the beginning of each Resources round, gain 1 valuables",
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

  // ---- Diplomacy recruits --------------------------------------------------

  // Diplomat's Ring — the Dwelling recruit is 3 gold cheaper. Its "decide top or
  // bottom for each unpurchased unit" half is the SHARED Balance-Pack placement
  // window (deck-card-placement.ts), already gated on this house rule for every
  // DIPLOMACY_RECRUIT — so the reprint only has to price the recruit.
  "artifact.diplomats_ring": reprint("artifact.diplomats_ring", {
    tags: tags(
      "artifact.diplomats_ring",
      "Reroll any die or any roll (offered from hand in the die window). — OR — For every Dwelling you have, draw 1 corresponding Neutral Unit card; recruit one of them with a 3 gold discount, then place each unpurchased unit on the top or bottom of its deck."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: draw 1 Neutral Unit card per Dwelling, then recruit one (3 gold off)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT", goldReduction: 3 }
        }
      ]
    }
  }),

  // Ambassador's Sash — the same two additions.
  "artifact.ambassadors_sash": reprint("artifact.ambassadors_sash", {
    tags: tags(
      "artifact.ambassadors_sash",
      "For every Dwelling you have, draw 1 corresponding Neutral Unit card; recruit one of them with a 3 gold discount, then place each unpurchased unit on the top or bottom of its deck. — OR — Reroll a die (offered from hand in the die window)."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Map: draw 1 Neutral Unit card per Dwelling, then recruit one (3 gold off)",
          mapOnly: true,
          effect: { type: "DIPLOMACY_RECRUIT", goldReduction: 3 }
        }
      ]
    }
  }),

  // ---- Polish-Spell-Book recovery family -----------------------------------
  // The four count-1 `filter: "spell"` recovery artifacts already play EXACTLY
  // their reprinted text under `polish-spell-book` (openDiscardPickChoice's
  // `polishReturnEnabler` path returns a "Cast a Spell" enabler AND offers a used
  // Book Spell to refresh, once per round). They are reprinted for their TAGS, so
  // a reader of the definition sees what the face promises; the engine needed no
  // change and a non-book game keeps the printed reading.

  "artifact.crown_of_the_five_seas": reprint("artifact.crown_of_the_five_seas", {
    tags: tags(
      "artifact.crown_of_the_five_seas",
      "Polish Spell Book: take 1 \"Cast a Spell\" card from your discard pile into your hand and Refresh 1 Book Spell, once per round (without the Book: return 1 Spell from your discard pile). — OR — If this Hero is on a Sea tile, look at the top 3 cards of your discard pile and take 1."
    )
  }),

  "artifact.thunder_helmet": reprint("artifact.thunder_helmet", {
    tags: tags(
      "artifact.thunder_helmet",
      "Polish Spell Book: take 1 \"Cast a Spell\" card from your discard pile into your hand and Refresh 1 Book Spell, once per round (without the Book: return 1 Spell from your discard pile). — OR — For this Combat, whenever you play a Spell card, draw 1 card from your M&M deck; then remove this card."
    )
  }),

  "artifact.rib_cage": reprint("artifact.rib_cage", {
    tags: tags(
      "artifact.rib_cage",
      "Polish Spell Book: take 1 \"Cast a Spell\" card from your discard pile into your hand and Refresh 1 Book Spell, once per round (without the Book: return 1 Spell from your discard pile); then shuffle your discard pile back into your deck. — OR — +1 Power."
    )
  }),

  // Helm of the Alabaster Unicorn — option B additionally INSCRIBES the cast
  // spell into the caster's Spellbook (Polish Book only).
  "artifact.helm_of_the_alabaster_unicorn": reprint("artifact.helm_of_the_alabaster_unicorn", {
    tags: tags(
      "artifact.helm_of_the_alabaster_unicorn",
      "Polish Spell Book: take 1 \"Cast a Spell\" card from your discard pile into your hand and Refresh 1 Book Spell, once per round (without the Book: return 1 Spell from your discard pile). — OR — Cast a Spell from the top of the Spell-deck discard pile and Remove this card; with the Polish Spell Book the cast Spell is added to your Spellbook."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Return 1 Spell from your discard pile to your hand",
          effect: { type: "TAKE_FROM_DISCARD", count: 1, filter: "spell" }
        },
        {
          label: "Cast the top spell of the Spell-deck discard pile, then remove this card",
          combatOnly: true,
          effect: { type: "CAST_FROM_SPELL_DISCARD", addToSpellBook: true }
        }
      ]
    }
  }),

  // Crown of Dragontooth — option A doubles the Polish recovery (up to 2
  // enablers returned AND up to 2 Book Spells refreshed). Option B is UNCHANGED
  // (the committed face prints the printed card).
  "artifact.crown_of_dragontooth": reprint("artifact.crown_of_dragontooth", {
    tags: tags(
      "artifact.crown_of_dragontooth",
      "Polish Spell Book: take up to 2 \"Cast a Spell\" cards from your discard pile into your hand and Refresh up to 2 Book Spells, once per round (without the Book: return 2 Spells from your discard pile). — OR — Remove 1 Spell from hand, then Search (2) the Spell deck."
    ),
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Take 2 Spell cards from your discard pile",
          effect: { type: "TAKE_FROM_DISCARD", count: 2, filter: "spell", polishRecoveryLimit: 2 }
        },
        {
          label: "Remove 1 Spell from hand: Search (2) the Spell deck",
          cost: { discardCards: 1, costCardFilter: "spell", removeCostCards: true },
          effect: { type: "CARD_DECK_SEARCH", deck: "spells", count: 2 }
        }
      ]
    }
  })
};

/** Every artifact id whose Balance-Pack reprint this module ships. */
export const POLISH_BALANCE_ARTIFACT_IDS = Object.keys(polishBalanceArtifactCards) as readonly string[];
