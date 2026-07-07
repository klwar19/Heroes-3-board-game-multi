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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
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
    implementationStatus: "not-implemented",
    source: moraleSource
  }
};

export const moralePositiveDeckCardIds = [
  "morale.positive.repeat_search",
  "morale.positive.combat_draw",
  "morale.positive.combat_bonus",
  "morale.positive.combat_draw",
  "morale.positive.reroll_die",
  "morale.positive.reroll_die",
  "morale.positive.set_attack_die_plus",
  "morale.positive.remove_token",
  "morale.positive.replace_adventure_card",
  "morale.positive.redraw_hand"
];

export const moraleNegativeDeckCardIds = [
  "morale.negative.search_one",
  "morale.negative.set_attack_die_minus",
  "morale.negative.next_roll_minus_one",
  "morale.negative.roll_one_less",
  "morale.negative.skip_activation",
  "morale.negative.random_combat_discard",
  "morale.negative.put_token",
  "morale.negative.reroll_plus_one",
  "morale.negative.skip_activation"
];

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
