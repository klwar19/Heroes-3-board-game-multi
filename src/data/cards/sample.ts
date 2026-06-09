import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Visual reference from the community wiki/database; verify against official owned components before full content import.";

export const sampleCards: CardLibrary = {
  "spell.magic_arrow": {
    id: "spell.magic_arrow",
    name: "Magic Arrow",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["spell", "damage", "basic", "wiki-reference"],
    power: 1,
    effect: {
      type: "DEAL_DAMAGE",
      amount: 2,
      damageKind: "spell"
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-magic_arrow.webp",
      imageAlt: "Magic Arrow card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/magic_arrow/"
    }
  },
  "ability.resistance": {
    id: "ability.resistance",
    name: "Resistance",
    kind: "ability",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    tags: ["ability", "instant", "reaction", "wiki-reference"],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "opponent"
    },
    effect: {
      type: "CANCEL_SPELL",
      maxPower: 1
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/abilities-resistance.webp",
      imageAlt: "Resistance card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/abilities/resistance/"
    }
  }
};

