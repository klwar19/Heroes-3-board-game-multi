import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Card text from the official Stretch Goals Pandora's Box cards (English scans and Polish 'Puszka Pandory' art, translated); cross-checked against the fan wiki Pandora's Box field page.";

const pandoraSource = {
  product: "Heroes of Might and Magic III: The Board Game",
  credit: wikiCredit,
  url: "https://en.homm3bg.wiki/fields/pandoras_box/"
};

/** Root path of the downloaded Pandora's Box card art (webp). */
const art = (slug: string) => `/assets/pandora/${slug}.webp`;

/**
 * Pandora's Box deck (Stretch Goals, cards 168–187 / 197): a hero visiting a
 * Pandora's Box field may draw one of these instead of rolling the printed dice.
 * Drawn cards go to the hand; permanents are then put into play like any other
 * permanent, and one-shot cards are played from hand as normal map cards.
 *
 * Engine notes (see pandora-cards.test.ts for the covering tests):
 *  - Straightforward one-shots resolve through PANDORA_VISIT (a main-hero
 *    visit-steps reward) so they reuse the tested visit pipeline.
 *  - The "peek 3, discard up to 2, reorder" cards use PANDORA_SCRY.
 *  - The treasure-gamble Search cards use the PANDORA_TREASURE_GAMBLE_SEARCH step.
 *  - The pay-for-dice card uses the PANDORA_PAY_FOR_DICE self-rebuilding loop.
 */
export const pandoraCards: CardLibrary = {
  /**
   * The printed exception to the one-permanent rule: "You can have up to
   * 3 permanent cards played at a time, including this one." (Card 176)
   */
  "pandora.permanent_slots": {
    id: "pandora.permanent_slots",
    name: "Pandora's Gift: Three Permanents",
    kind: "pandora",
    timing: "ongoing",
    tags: [
      "pandora",
      "permanent",
      "You can have up to 3 permanent cards played at a time, including this one."
    ],
    permanent: true,
    permanentEffect: {
      permanentLimitOverride: 3
    },
    effect: { type: "ENTER_PLAY" },
    assets: { cardImage: art("permanent_slots"), imageAlt: "Pandora's Box card: up to 3 permanent cards" },
    implementationStatus: "implemented",
    source: pandoraSource
  },
  /** "Your hand is increased by 1." (Card 175) */
  "pandora.hand_size": {
    id: "pandora.hand_size",
    name: "Pandora's Gift: Greater Hand",
    kind: "pandora",
    timing: "ongoing",
    tags: ["pandora", "permanent", "Your hand is increased by 1."],
    permanent: true,
    permanentEffect: {
      handLimitBonus: 1
    },
    effect: { type: "ENTER_PLAY" },
    assets: { cardImage: art("hand_size"), imageAlt: "Pandora's Box card: your hand is increased by 1" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine: Permanent +1 Power — a flat bonus folded into EVERY spell the owner
  // casts (getCurrentSpellPower at cast time + standingSpellPower for
  // affordability/preview, so it is never display-only). Its upkeep ("at the end
  // of your turn, remove this card OR gain Negative Morale") is offered by
  // queuePandoraUpkeep when the owner ends their turn. (Card 178 — no card art in
  // the provided set, so it renders as a text frame.) See pandora-cards.test.ts.
  "pandora.power_or_morale": {
    id: "pandora.power_or_morale",
    name: "Pandora's Bargain: Power",
    kind: "pandora",
    timing: "ongoing",
    tags: [
      "pandora",
      "permanent",
      "Permanent: +1 power. As long as this card is in play, at the end of your turn, remove this card or gain Negative Morale."
    ],
    permanent: true,
    permanentEffect: {
      spellPowerBonus: 1,
      endTurnUpkeep: "remove-or-negative-morale"
    },
    effect: { type: "ENTER_PLAY" },
    assets: { imageAlt: "Pandora's Box card: +1 power with an upkeep" },
    implementationStatus: "implemented",
    source: pandoraSource
  },
  // engine: a PERMANENT (the card scan carries the printed ∞ marker and the
  // reminder "the effect of this card lasts only as long as it is in play").
  // Entering play rolls 1 Resource die (incomeTierDieOnEnter); while the card
  // stays in play the owner gains that resource's FULL income tier (+5 gold /
  // +2 materials / +1 valuables) at every Resources round, on top of
  // production. Leaving play (replaced, discarded, Destruction) stops the
  // boost. (Card 174) See pandora-cards.test.ts.
  "pandora.resource_income": {
    id: "pandora.resource_income",
    name: "Pandora's Gift: Income",
    kind: "pandora",
    timing: "ongoing",
    tags: [
      "pandora",
      "permanent",
      "Roll 1 Resource die and increase the income of the corresponding resource by 1 tier.",
      "Remember, the effect of this card lasts only as long as it is in play."
    ],
    permanent: true,
    permanentEffect: {
      incomeTierDieOnEnter: true
    },
    effect: { type: "ENTER_PLAY" },
    assets: { cardImage: art("resource_income"), imageAlt: "Pandora's Box card: raise a resource's income" },
    implementationStatus: "implemented",
    source: pandoraSource
  },
  // engine: a map play that draws 3 SILVER Neutral units (the card's star icon
  // is the silver tier — confirmed against the scan and the wiki) and offers to
  // Recruit ONE at half its cost (rounded up); the rest return to the Neutral
  // discard — DRAW_NEUTRAL_RECRUIT_OFFER. (Card 182) See pandora-cards.test.ts.
  "pandora.neutral_recruits": {
    id: "pandora.neutral_recruits",
    name: "Pandora's Gift: Recruits",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Draw 3 cards from the Silver Neutral Unit deck. You can Recruit one of these units if you pay half of its recruit cost rounded up."
    ],
    effect: { type: "DRAW_NEUTRAL_RECRUIT_OFFER", count: 3, tier: "silver" },
    assets: { cardImage: art("neutral_recruits"), imageAlt: "Pandora's Box card: draw 3 Neutral recruits" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // =========================================================================
  // New cards (168–187, everything except the five above)
  // =========================================================================

  // engine (Card 187): OR — gain 1 experience (main hero) OR "One of your
  // Heroes" gains 1 movement (GAIN_MOVEMENT_ANY_HERO: with a Secondary Hero on
  // the map the owner picks which; a lone hero auto-resolves).
  "pandora.experience_or_movement": {
    id: "pandora.experience_or_movement",
    name: "Pandora's Gift: Insight or Haste",
    kind: "pandora",
    timing: "map",
    tags: ["pandora", "Gain 1 experience. OR One of your Heroes gains 1 movement."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 1 experience",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "GAIN_EXPERIENCE", amount: 1 }] }
        },
        {
          label: "One of your Heroes gains 1 movement",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "GAIN_MOVEMENT_ANY_HERO", amount: 1 }] }
        }
      ]
    },
    assets: { cardImage: art("experience_or_movement"), imageAlt: "Pandora's Box card: 1 experience or 1 movement" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 169): OR — gain 2 experience OR remove 1 card from your hand or
  // discard pile (REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD → masked map removal).
  "pandora.experience_or_remove": {
    id: "pandora.experience_or_remove",
    name: "Pandora's Gift: Wisdom or Cleansing",
    kind: "pandora",
    timing: "map",
    tags: ["pandora", "Gain 2 experience. OR Remove 1 card from your hand or discard pile."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain 2 experience",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "GAIN_EXPERIENCE", amount: 2 }] }
        },
        {
          label: "Remove 1 card from your hand or discard pile",
          effect: { type: "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD" }
        }
      ]
    },
    assets: { cardImage: art("experience_or_remove"), imageAlt: "Pandora's Box card: 2 experience or remove a card" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 170): OR — "One of your Heroes" gains 2 movement (owner picks
  // the hero when a Secondary Hero is fielded) OR remove 1 card from your hand
  // or discard pile.
  "pandora.movement_or_remove": {
    id: "pandora.movement_or_remove",
    name: "Pandora's Gift: Speed or Cleansing",
    kind: "pandora",
    timing: "map",
    tags: ["pandora", "One of your Heroes gains 2 movement. OR Remove 1 card from your hand or discard pile."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "One of your Heroes gains 2 movement",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "GAIN_MOVEMENT_ANY_HERO", amount: 2 }] }
        },
        {
          label: "Remove 1 card from your hand or discard pile",
          effect: { type: "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD" }
        }
      ]
    },
    assets: { cardImage: art("movement_or_remove"), imageAlt: "Pandora's Box card: 2 movement or remove a card" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 172): OR — roll and resolve 2 Resource dice (each resolved, via
  // two count:1 rolls) OR gain 9 gold.
  "pandora.resource_dice_or_gold": {
    id: "pandora.resource_dice_or_gold",
    name: "Pandora's Gift: Prospecting",
    kind: "pandora",
    timing: "map",
    tags: ["pandora", "Roll and resolve 2 Resource dice. OR Gain 9 gold."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Roll and resolve 2 Resource dice",
          effect: {
            type: "PANDORA_VISIT",
            steps: [
              { type: "ROLL_RESOURCE_DICE", count: 1 },
              { type: "ROLL_RESOURCE_DICE", count: 1 }
            ]
          }
        },
        {
          label: "Gain 9 gold",
          effect: { type: "GAIN_RESOURCES", gain: { gold: 9 } }
        }
      ]
    },
    assets: { cardImage: art("resource_dice_or_gold"), imageAlt: "Pandora's Box card: 2 Resource dice or 9 gold" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 171): OR — Search(2) the Artifact deck twice OR Search(2) the
  // Spell deck twice (two sequential shared-deck Searches of the same family).
  "pandora.search_two_twice": {
    id: "pandora.search_two_twice",
    name: "Pandora's Gift: Double Search",
    kind: "pandora",
    timing: "map",
    tags: ["pandora", "Search (2) the Artifact deck twice. OR Search (2) the Spell deck twice."],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (2) the Artifact deck twice",
          effect: {
            type: "PANDORA_VISIT",
            steps: [
              { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 },
              { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 }
            ]
          }
        },
        {
          label: "Search (2) the Spell deck twice",
          effect: {
            type: "PANDORA_VISIT",
            steps: [
              { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 },
              { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 }
            ]
          }
        }
      ]
    },
    assets: { cardImage: art("search_two_twice"), imageAlt: "Pandora's Box card: Search (2) twice" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 179): OR — Search(5) the Ability deck OR roll 2 Treasure dice
  // and, on at least one artifact (ankh) face, Search(8) the Ability deck.
  "pandora.ability_search": {
    id: "pandora.ability_search",
    name: "Pandora's Gift: Ability Search",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Search (5) the Ability deck. OR Roll 2 Treasure dice. If at least 1 artifact symbol is drawn, Search (8) the Ability deck."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (5) the Ability deck",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "SEARCH_SHARED_DECK", deckId: "abilities", count: 5 }] }
        },
        {
          label: "Roll 2 Treasure dice — artifact symbol → Search (8) the Ability deck",
          effect: {
            type: "PANDORA_VISIT",
            steps: [{ type: "PANDORA_TREASURE_GAMBLE_SEARCH", deck: "abilities", diceCount: 2, searchCount: 8 }]
          }
        }
      ]
    },
    assets: { cardImage: art("ability_search"), imageAlt: "Pandora's Box card: Search the Ability deck" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 180): OR — Search(5) the Artifact deck OR the 2-Treasure-dice
  // gamble for Search(8) the Artifact deck.
  "pandora.artifact_search": {
    id: "pandora.artifact_search",
    name: "Pandora's Gift: Artifact Search",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Search (5) the Artifact deck. OR Roll 2 Treasure dice. If at least 1 artifact symbol is drawn, Search (8) the Artifact deck."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (5) the Artifact deck",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 }] }
        },
        {
          label: "Roll 2 Treasure dice — artifact symbol → Search (8) the Artifact deck",
          effect: {
            type: "PANDORA_VISIT",
            steps: [{ type: "PANDORA_TREASURE_GAMBLE_SEARCH", deck: "artifacts", diceCount: 2, searchCount: 8 }]
          }
        }
      ]
    },
    assets: { cardImage: art("artifact_search"), imageAlt: "Pandora's Box card: Search the Artifact deck" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 181): OR — Search(5) the Spell deck OR the 2-Treasure-dice
  // gamble for Search(8) the Spell deck.
  "pandora.spell_search": {
    id: "pandora.spell_search",
    name: "Pandora's Gift: Spell Search",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Search (5) the Spell deck. OR Roll 2 Treasure dice. If at least 1 artifact symbol is drawn, Search (8) the Spell deck."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (5) the Spell deck",
          effect: { type: "PANDORA_VISIT", steps: [{ type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 }] }
        },
        {
          label: "Roll 2 Treasure dice — artifact symbol → Search (8) the Spell deck",
          effect: {
            type: "PANDORA_VISIT",
            steps: [{ type: "PANDORA_TREASURE_GAMBLE_SEARCH", deck: "spells", diceCount: 2, searchCount: 8 }]
          }
        }
      ]
    },
    assets: { cardImage: art("spell_search"), imageAlt: "Pandora's Box card: Search the Spell deck" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 168, INSTANT played on your map turn — the printed Instant
  // symbol is honoured as a map play since every option is map-side): choose 2 of
  // the 3 options and resolve both. Modeled as the three distinct 2-of-3 combos.
  "pandora.instant_choice": {
    id: "pandora.instant_choice",
    name: "Pandora's Gift: Twofold Boon",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Choose 2 of the following options: Roll 2 Resource dice and resolve one. OR One of your Heroes gains 1 movement. OR Gain 1 experience."
    ],
    effect: {
      type: "PANDORA_VISIT",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Pandora's Box: choose 2 of the 3 options",
          options: [
            {
              label: "Roll 2 Resource dice (resolve one) + one Hero gains 1 movement",
              steps: [
                { type: "ROLL_RESOURCE_DICE", count: 2 },
                { type: "GAIN_MOVEMENT_ANY_HERO", amount: 1 }
              ]
            },
            {
              label: "Roll 2 Resource dice (resolve one) + gain 1 experience",
              steps: [
                { type: "ROLL_RESOURCE_DICE", count: 2 },
                { type: "GAIN_EXPERIENCE", amount: 1 }
              ]
            },
            {
              label: "One Hero gains 1 movement + gain 1 experience",
              steps: [
                { type: "GAIN_MOVEMENT_ANY_HERO", amount: 1 },
                { type: "GAIN_EXPERIENCE", amount: 1 }
              ]
            }
          ]
        }
      ]
    },
    assets: { cardImage: art("instant_choice"), imageAlt: "Pandora's Box card: choose two boons" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 177): pay 3 gold / 2 building materials / 1 valuables up to six
  // times in any combination; each payment rolls and resolves 1 Resource die. The
  // PANDORA_PAY_FOR_DICE step rebuilds the menu each time (only affordable
  // payments; a Stop exit ends it early).
  "pandora.pay_for_dice": {
    id: "pandora.pay_for_dice",
    name: "Pandora's Gift: Investment",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "First pay 3 gold, 2 building materials, or 1 valuables up to six times in any combination. Then for each payment made, roll and resolve 1 Resource die."
    ],
    effect: {
      type: "PANDORA_VISIT",
      steps: [{ type: "PANDORA_PAY_FOR_DICE", remaining: 6 }]
    },
    assets: { cardImage: art("pay_for_dice"), imageAlt: "Pandora's Box card: pay to roll Resource dice" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 186): peek the top 3 of the Ability deck, discard up to 2,
  // reorder the rest on top, then gain 1 valuables.
  "pandora.scry_abilities": {
    id: "pandora.scry_abilities",
    name: "Pandora's Gift: Ability Foresight",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Peek at the top 3 cards from the Ability deck, discard up to 2 of them, and put the rest back on top of the deck in any order. You gain 1 valuables."
    ],
    effect: {
      type: "PANDORA_SCRY",
      deck: "abilities",
      count: 3,
      maxDiscard: 2,
      then: [{ type: "GAIN_RESOURCES", valuables: 1 }]
    },
    assets: { cardImage: art("scry_abilities"), imageAlt: "Pandora's Box card: peek the Ability deck, gain valuables" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 184): peek the top 3 of the Spell deck, discard up to 2, reorder
  // the rest on top, then gain 2 building materials.
  "pandora.scry_spells": {
    id: "pandora.scry_spells",
    name: "Pandora's Gift: Spell Foresight",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Peek at the top 3 cards from the Spell deck, discard up to 2 of them, and put the rest back on top of the deck in any order. You gain 2 building materials."
    ],
    effect: {
      type: "PANDORA_SCRY",
      deck: "spells",
      count: 3,
      maxDiscard: 2,
      then: [{ type: "GAIN_RESOURCES", buildingMaterials: 2 }]
    },
    assets: { cardImage: art("scry_spells"), imageAlt: "Pandora's Box card: peek the Spell deck, gain materials" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 185): peek the top 3 of the Artifact deck, discard up to 2,
  // reorder the rest on top, then gain 3 gold.
  "pandora.scry_artifacts": {
    id: "pandora.scry_artifacts",
    name: "Pandora's Gift: Artifact Foresight",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Peek at the top 3 cards from the Artifact deck, discard up to 2 of them, and put the rest back on top of the deck in any order. You gain 3 gold."
    ],
    effect: {
      type: "PANDORA_SCRY",
      deck: "artifacts",
      count: 3,
      maxDiscard: 2,
      then: [{ type: "GAIN_RESOURCES", gold: 3 }]
    },
    assets: { cardImage: art("scry_artifacts"), imageAlt: "Pandora's Box card: peek the Artifact deck, gain gold" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 173): a Unit-Deck (army) refresh. With no Silver unit, the card
  // self-cycles into a fresh Pandora draw. Otherwise choose: (A) reverse a Silver
  // unit to its Handful (Few) side, OR (B) discard a Silver unit, then draw 3
  // Bronze + 3 Silver Neutral units and free-recruit 1 of each. Option A is only
  // offered when a Silver is on its Pack side. See PANDORA_SILVER_REFRESH.
  "pandora.silver_refresh": {
    id: "pandora.silver_refresh",
    name: "Pandora's Gift: Silver Muster",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "If you have no Silver unit in your Unit Deck, discard this card and draw another. Otherwise, choose one option: Reverse 1 Silver unit to the 'Handful' side. OR Discard 1 Silver unit. Then draw 3 cards each from the Bronze and Neutral Unit Decks. From these six units, Recruit for free 1 Bronze and 1 Silver."
    ],
    effect: { type: "PANDORA_SILVER_REFRESH" },
    assets: { cardImage: art("silver_refresh"), imageAlt: "Pandora's Box card: Silver unit refresh" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine (Card 183): peek the top 3 of the Astrologers Proclaim deck, discard
  // up to 2, reorder the rest on top, then Search(2) the Artifact deck.
  "pandora.scry_astrologers": {
    id: "pandora.scry_astrologers",
    name: "Pandora's Gift: Star Foresight",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Peek at the top 3 cards from the Astrologers Proclaim deck, discard up to 2 of them, and put the rest back on top of the deck in any order. Search (2) the Artifact deck."
    ],
    effect: {
      type: "PANDORA_SCRY",
      deck: "astrologers",
      count: 3,
      maxDiscard: 2,
      then: [{ type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 }]
    },
    assets: {
      cardImage: art("scry_astrologers"),
      imageAlt: "Pandora's Box card: peek the Astrologers deck, Search the Artifact deck"
    },
    implementationStatus: "implemented",
    source: pandoraSource
  }
};

/**
 * Draw pile composition: every Pandora card above is shuffled into the deck.
 */
export const pandoraDeckCardIds: string[] = [
  "pandora.permanent_slots",
  "pandora.hand_size",
  "pandora.power_or_morale",
  "pandora.resource_income",
  "pandora.neutral_recruits",
  "pandora.experience_or_movement",
  "pandora.experience_or_remove",
  "pandora.movement_or_remove",
  "pandora.resource_dice_or_gold",
  "pandora.search_two_twice",
  "pandora.ability_search",
  "pandora.artifact_search",
  "pandora.spell_search",
  "pandora.instant_choice",
  "pandora.pay_for_dice",
  "pandora.scry_abilities",
  "pandora.scry_spells",
  "pandora.scry_artifacts",
  "pandora.scry_astrologers",
  "pandora.silver_refresh"
];
