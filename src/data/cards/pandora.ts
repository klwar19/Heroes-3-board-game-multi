import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Card text from the fan wiki Pandora's Box field page (Stretch Goals deck); verify against official owned components before full content import.";

const pandoraSource = {
  product: "Heroes of Might and Magic III: The Board Game",
  credit: wikiCredit,
  url: "https://en.homm3bg.wiki/fields/pandoras_box/"
};

function notImplementedPandora(slug: string, name: string, text: string): CardLibrary[string] {
  return {
    id: `pandora.${slug}`,
    name,
    kind: "pandora",
    timing: "map",
    tags: ["pandora", "needs-implementation", text],
    effect: { type: "DRAW_CARDS", amount: 0 },
    assets: { imageAlt: `${name} Pandora's Box card` },
    implementationStatus: "not-implemented",
    source: pandoraSource
  };
}

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

  // ---- Not yet implemented Pandora cards (library entries only) -----------
  "pandora.power_or_morale": notImplementedPandora(
    "power_or_morale",
    "Pandora's Bargain: Power",
    "Permanent: +1 power. As long as this card is in play, at the end of your turn, remove this card or gain Negative Morale."
  ),
  "pandora.resource_income": notImplementedPandora(
    "resource_income",
    "Pandora's Gift: Income",
    "Roll 1 Resource die and increase the income of the corresponding resource by 1 tier."
  ),
  "pandora.neutral_recruits": notImplementedPandora(
    "neutral_recruits",
    "Pandora's Gift: Recruits",
    "Draw 3 cards from the Neutral Unit deck. You can Recruit one of these units if you pay half of its recruit cost rounded up."
  )
};

/**
 * Draw pile composition: only implemented cards enter the deck, so a drawn
 * card can always be used. The not-implemented entries above stay library-
 * only until their effects land.
 */
export const pandoraDeckCardIds: string[] = ["pandora.permanent_slots", "pandora.hand_size"];
