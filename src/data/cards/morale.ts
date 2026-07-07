import type { CardLibrary } from "@/engine/state";

export const MORALE_POSITIVE_DECK_ID = "morale-positive";
export const MORALE_NEGATIVE_DECK_ID = "morale-negative";

export type MoraleCardPolarity = "positive" | "negative";

const moraleSource = {
  product: "Heroes of Might and Magic III: The Board Game",
  credit: "Morale card scans cropped from the provided morale deck contact sheet.",
  url: "https://github.com/Heegu-sama/Homm3BG/tree/main/assets/cards"
};

const face = (name: string) => `/assets/morale-cards/sheet/${name}.png`;

export const moraleCardDefinitions: CardLibrary = {
  "morale.positive.repeat_search": {
    id: "morale.positive.repeat_search",
    name: "Positive Morale: Repeat Search",
    kind: "ability",
    timing: "instant",
    tags: ["morale", "positive", "Discard the cards gained from Search (X) to perform the Search (X) again."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-repeat-search"),
      imageAlt: "Positive Morale card: repeat Search X"
    },
    // engine: after the holder resolves a shared-deck Search, an offer opens to
    // discard the gained card and run the same Search (X) again (reducer
    // resolveDeckSearch -> "morale-repeat-search" choice). Test:
    // morale-card-effects.test.ts "Repeat Search".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.positive.combat_draw": {
    id: "morale.positive.combat_draw",
    name: "Positive Morale: Combat Draw",
    kind: "ability",
    timing: "combat",
    tags: ["morale", "positive", "When Combat on board starts, draw 1 card."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-combat-draw-one"),
      imageAlt: "Positive Morale card: draw 1 when combat starts"
    },
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.positive.combat_bonus": {
    id: "morale.positive.combat_bonus",
    name: "Positive Morale: Combat Bonus",
    kind: "ability",
    timing: "combat",
    tags: ["morale", "positive", "During the next Combat, gain +1 Attack, +1 Defense, or +1 Combat Power."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-combat-power"),
      imageAlt: "Positive Morale card: next combat +1 attack, defense or combat power"
    },
    // engine: played during the holder's own Combat via SPEND_MORALE
    // "combat-bonus" -> a combat-long +1 ATTACK_BONUS or +1 DEFENSE_BONUS
    // player effect. The printed third option (+1 Combat Power) is a
    // Battlefield-expansion-mode value with no regular-game roll, so only the
    // Attack/Defense picks exist. Test: morale-card-effects.test.ts "Combat Bonus".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.positive.reroll_die": {
    id: "morale.positive.reroll_die",
    name: "Positive Morale: Reroll a Die",
    kind: "ability",
    timing: "reaction",
    tags: ["morale", "positive", "Reroll a die."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-reroll-die"),
      imageAlt: "Positive Morale card: reroll a die"
    },
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.positive.set_attack_die_plus": {
    id: "morale.positive.set_attack_die_plus",
    name: "Positive Morale: Set Attack Die +1",
    kind: "ability",
    timing: "reaction",
    tags: ["morale", "positive", "During the next Attack die roll, set one of the dice to the +1 side."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-set-attack-die-plus"),
      imageAlt: "Positive Morale card: set next Attack die to +1"
    },
    // engine: offered inside the attack-die window as a SET source (never spent
    // by a plain reroll): the die that improves the outcome most flips to +1,
    // no reroll. Test: morale-card-effects.test.ts "Set Attack Die +1".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.positive.remove_token": {
    id: "morale.positive.remove_token",
    name: "Positive Morale: Remove Token",
    kind: "ability",
    timing: "instant",
    tags: ["morale", "positive", "Remove 1 morale-token marker from one of your units."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-remove-token"),
      imageAlt: "Positive Morale card: remove one token from one of your units"
    },
    // engine reading: the printed morale-token marker exists only in the
    // Battlefield expansion's own modes, so in regular games this removes one
    // NEGATIVE combat token (Weakness/Corrosion/Paralysis) from an own unit —
    // SPEND_MORALE "remove-token". Test: morale-card-effects.test.ts "Remove Token".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.positive.replace_adventure_card": {
    id: "morale.positive.replace_adventure_card",
    name: "Positive Morale: Replace Adventure Card",
    kind: "ability",
    timing: "instant",
    tags: ["morale", "positive", "Discard 1 Adventure card and draw another in its place."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-replace-adventure-card"),
      imageAlt: "Positive Morale card: discard 1 Adventure card and draw another"
    },
    // engine: never in play. The printed card carries the Battlefield Symbol
    // (the sword glyph under the text) — the Battlefield-expansion rulebook
    // removes such cards from the Morale decks in regular games, and "Adventure
    // cards" (the expansion's own 50-card deck) exist only in its Adventure/
    // Skirmish modes. Excluded from the regular deck in BATTLEFIELD_ONLY_
    // MORALE_CARD_IDS below; kept here so the scanned card can still be shown.
    implementationStatus: "not-implemented",
    source: moraleSource
  },
  "morale.positive.redraw_hand": {
    id: "morale.positive.redraw_hand",
    name: "Positive Morale: Redraw Hand Cards",
    kind: "ability",
    timing: "instant",
    tags: ["morale", "positive", "Discard any number of cards from hand and draw as many."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("positive-redraw-hand"),
      imageAlt: "Positive Morale card: discard any number of hand cards and draw as many"
    },
    implementationStatus: "implemented",
    source: moraleSource
  },

  "morale.negative.search_one": {
    id: "morale.negative.search_one",
    name: "Negative Morale: Search One",
    kind: "ability",
    timing: "passive",
    tags: [
      "morale",
      "negative",
      "Instead of your next Search (X), do Search (1). This effect is not triggered by Search (1)."
    ],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-research"),
      imageAlt: "Negative Morale card: next Search X becomes Search 1"
    },
    // engine: the holder's next shared-deck Search that would reveal 2+ cards
    // reveals 1 instead (revealSharedDeckSearch), never triggered by Search (1).
    // Test: morale-card-effects.test.ts "Search One".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.negative.set_attack_die_minus": {
    id: "morale.negative.set_attack_die_minus",
    name: "Negative Morale: Set Attack Die -1",
    kind: "ability",
    timing: "passive",
    tags: ["morale", "negative", "During the next Attack die roll, set one of the dice to the -1 side."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-next-attack-minus-side"),
      imageAlt: "Negative Morale card: set next Attack die to -1"
    },
    // engine: at the holder's next Attack-die roll the die whose flip hurts the
    // outcome most is set to -1 (a curse resolves against its holder), then the
    // card returns under its deck. Test: morale-card-effects.test.ts "Set Attack Die -1".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.negative.next_roll_minus_one": {
    id: "morale.negative.next_roll_minus_one",
    name: "Negative Morale: Next Roll -1",
    kind: "ability",
    timing: "passive",
    tags: ["morale", "negative", "Suffer -1 to your next Attack, Defense, or Combat Power roll. Whichever comes first."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-next-roll-minus-one"),
      imageAlt: "Negative Morale card: suffer -1 to next Attack, Defense, or Combat Power roll"
    },
    // engine: -1 latched onto the holder's next Attack roll (stack modifier,
    // survives window rerolls) OR next Defense (Defend-die) roll — whichever
    // comes first. "Combat Power" rolls exist only in the Battlefield
    // expansion's own modes, so that clause cannot come first in a regular
    // game. Test: morale-card-effects.test.ts "Next Roll -1".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.negative.roll_one_less": {
    id: "morale.negative.roll_one_less",
    name: "Negative Morale: Roll One Less",
    kind: "ability",
    timing: "passive",
    tags: ["morale", "negative", "When you are about to roll at least 2 Treasure dice or 2 Attack dice, roll 1 die less."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-roll-one-less"),
      imageAlt: "Negative Morale card: roll one die less when rolling at least 2 Treasure or Attack dice"
    },
    // engine: the holder's next roll of 2+ Treasure dice (map treasure rolls,
    // the Crypt gamble) or 2+ Attack dice (advantage/disadvantage, apply-both,
    // Slayer) throws one die less — mandatory even where fewer dice help.
    // Test: morale-card-effects.test.ts "Roll One Less".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.negative.skip_activation": {
    id: "morale.negative.skip_activation",
    name: "Negative Morale: Skip Activation Check",
    kind: "ability",
    timing: "passive",
    tags: [
      "morale",
      "negative",
      "During Combat, roll 1 Attack die before your unit's activation. On a -1, skip this unit's activation. Discard this card when you skip a unit's activation."
    ],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-skip-activation"),
      imageAlt: "Negative Morale card: before activation, -1 skips that unit"
    },
    // engine: before each of the holder's unit activations one Attack die is
    // rolled (setActiveUnit); a -1 skips that activation and only then does the
    // card leave, exactly as printed. Test: morale-card-effects.test.ts
    // "Skip Activation Check".
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.negative.random_combat_discard": {
    id: "morale.negative.random_combat_discard",
    name: "Negative Morale: Random Combat Discard",
    kind: "ability",
    timing: "passive",
    tags: ["morale", "negative", "At the start of your next Combat on board, discard 1 card from hand at random."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-discard-random-combat"),
      imageAlt: "Negative Morale card: discard 1 random hand card at next combat start"
    },
    implementationStatus: "implemented",
    source: moraleSource
  },
  "morale.negative.put_token": {
    id: "morale.negative.put_token",
    name: "Negative Morale: Put Token",
    kind: "ability",
    timing: "passive",
    tags: ["morale", "negative", "Immediately put 1 morale-token marker on one of your units."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-put-token-unit"),
      imageAlt: "Negative Morale card: put one token on one of your units"
    },
    // engine: never in play. The printed card carries the Battlefield Symbol
    // (the sword glyph under the text) — the Battlefield-expansion rulebook
    // removes such cards from the Morale decks in regular games (the morale
    // marker it places on a unit is a Battlefield-mode component). Excluded
    // from the regular deck in BATTLEFIELD_ONLY_MORALE_CARD_IDS below.
    implementationStatus: "not-implemented",
    source: moraleSource
  },
  "morale.negative.reroll_plus_one": {
    id: "morale.negative.reroll_plus_one",
    name: "Negative Morale: Reroll +1",
    kind: "ability",
    timing: "passive",
    tags: ["morale", "negative", "On a +1 on an Attack die, reroll the die."],
    effect: { type: "ENTER_PLAY" },
    assets: {
      cardImage: face("negative-reroll-minus-one"),
      imageAlt: "Negative Morale card: on a +1 Attack die, reroll the die"
    },
    // engine: the next +1 the holder rolls on an Attack die — attack rolls
    // (window rerolls included), the Defend die, the skip-activation check —
    // is forcibly rerolled once, then the card resolves. Map-side attack-die
    // rolls (Scholar) are deliberately out of scope. Test:
    // morale-card-effects.test.ts "Reroll +1".
    implementationStatus: "implemented",
    source: moraleSource
  }
};

/**
 * Battlefield-Symbol cards: the Battlefield-expansion rulebook removes/ignores
 * cards printed with that symbol during a regular game (their effects reference
 * components that exist only in its Adventure/Skirmish modes). This engine runs
 * regular games, so these two never enter the shuffled Morale decks. Their
 * definitions stay in the library (the scans are real cards), and the data test
 * pins that no deck list contains them.
 */
export const BATTLEFIELD_ONLY_MORALE_CARD_IDS = [
  "morale.positive.replace_adventure_card",
  "morale.negative.put_token"
] as const;

// Deck composition mirrors the provided contact sheet (the TTS scan): 10
// positive faces and 9 negative faces, with combat_draw / reroll_die /
// skip_activation printed twice — MINUS the two Battlefield-Symbol cards the
// rulebook removes from regular games (see BATTLEFIELD_ONLY_MORALE_CARD_IDS).
export const moralePositiveDeckCardIds = [
  "morale.positive.repeat_search",
  "morale.positive.combat_draw",
  "morale.positive.combat_bonus",
  "morale.positive.combat_draw",
  "morale.positive.reroll_die",
  "morale.positive.reroll_die",
  "morale.positive.set_attack_die_plus",
  "morale.positive.remove_token",
  "morale.positive.redraw_hand"
];

export const moraleNegativeDeckCardIds = [
  "morale.negative.search_one",
  "morale.negative.set_attack_die_minus",
  "morale.negative.next_roll_minus_one",
  "morale.negative.roll_one_less",
  "morale.negative.skip_activation",
  "morale.negative.random_combat_discard",
  "morale.negative.reroll_plus_one",
  "morale.negative.skip_activation"
];

/** Card ids by effect, so engine wiring never repeats raw strings. */
export const MORALE_CARD_IDS = {
  repeatSearch: "morale.positive.repeat_search",
  combatDraw: "morale.positive.combat_draw",
  combatBonus: "morale.positive.combat_bonus",
  rerollDie: "morale.positive.reroll_die",
  setAttackDiePlus: "morale.positive.set_attack_die_plus",
  removeToken: "morale.positive.remove_token",
  replaceAdventureCard: "morale.positive.replace_adventure_card",
  redrawHand: "morale.positive.redraw_hand",
  searchOne: "morale.negative.search_one",
  setAttackDieMinus: "morale.negative.set_attack_die_minus",
  nextRollMinusOne: "morale.negative.next_roll_minus_one",
  rollOneLess: "morale.negative.roll_one_less",
  skipActivation: "morale.negative.skip_activation",
  randomCombatDiscard: "morale.negative.random_combat_discard",
  putToken: "morale.negative.put_token",
  rerollPlusOne: "morale.negative.reroll_plus_one"
} as const;

export function moraleDeckIdFor(polarity: MoraleCardPolarity): string {
  return polarity === "positive" ? MORALE_POSITIVE_DECK_ID : MORALE_NEGATIVE_DECK_ID;
}

export function moraleCardPolarity(cardId: string): MoraleCardPolarity | null {
  if (cardId.startsWith("morale.positive.")) {
    return "positive";
  }
  if (cardId.startsWith("morale.negative.")) {
    return "negative";
  }
  return null;
}
