import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki Pandora's Box field page (Stretch Goals deck); verify against official owned components before full content import.";

const pandoraSource = {
  product: "Heroes of Might and Magic III: The Board Game",
  credit: wikiCredit,
  url: "https://en.homm3bg.wiki/fields/pandoras_box/"
};

/**
 * Pandora's Box deck (Stretch Goals): a hero visiting a Pandora's Box field
 * may draw one of these instead of rolling the printed dice. Drawn cards go
 * to the hand; permanents are then put into play like any other permanent.
 */
export const pandoraCards: CardLibrary = {
  /**
   * The printed exception to the one-permanent rule: "You can have up to
   * 3 permanent cards played at a time, including this one."
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
    assets: { imageAlt: "Pandora's Box card: up to 3 permanent cards" },
    implementationStatus: "implemented",
    source: pandoraSource
  },
  /** "Your hand is increased by 1." */
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
    assets: { imageAlt: "Pandora's Box card: your hand is increased by 1" },
    implementationStatus: "implemented",
    source: pandoraSource
  },

  // engine: Permanent +1 Power — a flat bonus folded into EVERY spell the owner
  // casts (getCurrentSpellPower at cast time + standingSpellPower for
  // affordability/preview, so it is never display-only). Its upkeep ("at the end
  // of your turn, remove this card OR gain Negative Morale") is offered by
  // queuePandoraUpkeep when the owner ends their turn. See
  // pandora-cards.test.ts.
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
  // engine: a map play that rolls 1 Resource die and raises that resource's
  // production by one resource-gain level (+5 gold / +2 materials / +1
  // valuables) — RAISE_INCOME_BY_DIE. See pandora-cards.test.ts.
  "pandora.resource_income": {
    id: "pandora.resource_income",
    name: "Pandora's Gift: Income",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Roll 1 Resource die and increase the income of the corresponding resource by 1 tier."
    ],
    effect: { type: "RAISE_INCOME_BY_DIE" },
    assets: { imageAlt: "Pandora's Box card: raise a resource's income" },
    implementationStatus: "implemented",
    source: pandoraSource
  },
  // engine: a map play that draws 3 bronze Neutral units and offers to Recruit
  // ONE at half its cost (rounded up); the rest return to the Neutral discard —
  // DRAW_NEUTRAL_RECRUIT_OFFER. The tiered Neutral decks model "the Neutral Unit
  // deck" as its entry (bronze) tier. See pandora-cards.test.ts.
  "pandora.neutral_recruits": {
    id: "pandora.neutral_recruits",
    name: "Pandora's Gift: Recruits",
    kind: "pandora",
    timing: "map",
    tags: [
      "pandora",
      "Draw 3 cards from the Neutral Unit deck. You can Recruit one of these units if you pay half of its recruit cost rounded up."
    ],
    effect: { type: "DRAW_NEUTRAL_RECRUIT_OFFER", count: 3, tier: "bronze" },
    assets: { imageAlt: "Pandora's Box card: draw 3 Neutral recruits" },
    implementationStatus: "implemented",
    source: pandoraSource
  }
};

/**
 * Draw pile composition: every Pandora card is now implemented and shuffled in.
 */
export const pandoraDeckCardIds: string[] = [
  "pandora.permanent_slots",
  "pandora.hand_size",
  "pandora.power_or_morale",
  "pandora.resource_income",
  "pandora.neutral_recruits"
];
