import type { CardLibrary } from "@/engine/state";

const wikiCredit =
  "Visual reference from the community wiki/database; verify against official owned components before full content import.";

export const sampleCards: CardLibrary = {
  "stat.attack": {
    id: "stat.attack",
    name: "Attack",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["statistic", "instant", "attack", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1,
      expertAmount: 2
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/statistics-attack.webp",
      imageAlt: "Attack statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/attack/"
    }
  },
  "stat.defense": {
    id: "stat.defense",
    name: "Defense",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["statistic", "instant", "defense", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 1,
      expertAmount: 2
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/statistics-defense.webp",
      imageAlt: "Defense statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/defense/"
    }
  },
  "stat.power": {
    id: "stat.power",
    name: "Power",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    tags: ["statistic", "instant", "power", "wiki-reference"],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "ADD_SPELL_POWER",
      amount: 1,
      expertAmount: 2
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/statistics-power.webp",
      imageAlt: "Power statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/power/"
    }
  },
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
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      },
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
  },
  "ability.archery": {
    id: "ability.archery",
    name: "Archery",
    kind: "ability",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    tags: ["ability", "ongoing", "ranged", "attack", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Archery",
        scope: "player",
        duration: { type: "current-combat-round" },
        modifiers: [
          {
            type: "RANGED_ATTACK_BONUS",
            amount: 1,
            nonAdjacentOnly: true
          }
        ]
      }
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/abilities-archery.webp",
      imageAlt: "Archery card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/abilities/archery/"
    }
  }
};
