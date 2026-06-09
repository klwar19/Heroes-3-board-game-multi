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
    statisticType: "attack",
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
    statisticType: "defense",
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
    statisticType: "power",
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
  "stat.knowledge": {
    id: "stat.knowledge",
    name: "Knowledge",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat", "map"],
    statisticType: "knowledge",
    tags: ["statistic", "instant", "knowledge", "spell-recall", "wiki-reference"],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "RECALL_SPELL",
      expertSpellLimitBonus: 1
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/statistics-knowledge.webp",
      imageAlt: "Knowledge statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/knowledge/"
    }
  },
  "spell.magic_arrow": {
    id: "spell.magic_arrow",
    name: "Magic Arrow",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["any"],
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
  "spell.lightning_bolt": {
    id: "spell.lightning_bolt",
    name: "Lightning Bolt",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: ["spell", "damage", "basic", "air", "wiki-reference"],
    power: 0,
    target: { type: "enemy-unit" },
    effect: {
      type: "DEAL_DAMAGE",
      amountByPower: {
        0: 2,
        1: 3,
        2: 4
      },
      damageKind: "spell"
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-lightning_bolt.webp",
      imageAlt: "Lightning Bolt card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/lightning_bolt/"
    }
  },
  "spell.stone_skin": {
    id: "spell.stone_skin",
    name: "Stone Skin",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: ["spell", "buff", "defense", "basic", "earth", "wiki-reference"],
    power: 0,
    target: { type: "friendly-unit" },
    effect: {
      type: "CREATE_DEFENSE_BUFF",
      name: "Stone Skin",
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-stone_skin.webp",
      imageAlt: "Stone Skin card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/stone_skin/"
    }
  },
  "spell.bloodlust": {
    id: "spell.bloodlust",
    name: "Bloodlust",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    tags: ["spell", "buff", "attack", "wiki-reference"],
    power: 1,
    target: { type: "friendly-unit", unitTypes: ["ground", "flying"] },
    effect: {
      type: "CREATE_ATTACK_BUFF",
      name: "Bloodlust",
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      duration: { type: "combat" },
      polarity: "positive",
      removable: true
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-bloodlust.webp",
      imageAlt: "Bloodlust card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/bloodlust/"
    }
  },
  "spell.cure": {
    id: "spell.cure",
    name: "Cure",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["water"],
    tags: ["spell", "heal", "effect-removal", "wiki-reference"],
    power: 1,
    target: { type: "friendly-unit" },
    effect: {
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      removePolarity: "negative"
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-cure.webp",
      imageAlt: "Cure card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/cure/"
    }
  },
  "spell.fortune": {
    id: "spell.fortune",
    name: "Fortune",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: ["spell", "reroll", "attack-die", "wiki-reference"],
    power: 1,
    target: { type: "none" },
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Fortune",
      basicRerolls: 1,
      rerollsByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      duration: { type: "current-turn" },
      consumeEffectOnUse: true
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-fortune.webp",
      imageAlt: "Fortune card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://homm3bg.wiki/spells/fortune/"
    }
  },
  "spell.fireball": {
    id: "spell.fireball",
    name: "Fireball",
    kind: "spell",
    timing: "combat",
    phaseLimit: ["combat"],
    spellLevel: "expert",
    spellSchools: ["fire"],
    tags: ["spell", "damage", "area", "expert", "fire", "wiki-reference"],
    power: 0,
    target: { type: "any-unit" },
    effect: {
      type: "DEAL_DAMAGE",
      amountByPower: {
        0: 1,
        2: 2,
        4: 3
      },
      damageKind: "spell"
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/spells-fireball.webp",
      imageAlt: "Fireball card"
    },
    implementationStatus: "not-implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/fireball/"
    }
  },
  "ability.resistance": {
    id: "ability.resistance",
    name: "Resistance",
    kind: "ability",
    timing: "reaction",
    phaseLimit: ["reaction", "combat"],
    abilityClass: "magic",
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
    timing: "ongoing",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: ["ability", "ongoing", "ranged", "attack", "wiki-reference"],
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
      },
      expertEffect: {
        name: "Expert Archery",
        scope: "player",
        duration: { type: "next-combat-round" },
        modifiers: [
          {
            type: "RANGED_ATTACK_BONUS",
            amount: 1,
            nonAdjacentOnly: true
          },
          {
            type: "RANGED_INITIATIVE_BONUS",
            amount: 1
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
  },
  "ability.offense": {
    id: "ability.offense",
    name: "Offense",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    abilityClass: "might",
    tags: ["ability", "instant", "attack", "wiki-reference"],
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
      cardImage: "https://en.homm3bg.wiki/assets/abilities-offense.webp",
      imageAlt: "Offense ability card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/abilities/offense/"
    }
  },
  "ability.luck": {
    id: "ability.luck",
    name: "Luck",
    kind: "ability",
    timing: "combat",
    phaseLimit: ["combat"],
    abilityClass: "combat",
    tags: ["ability", "reroll", "attack-die", "wiki-reference"],
    target: { type: "none" },
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Luck",
      basicRerolls: 0,
      expertRerolls: 1,
      duration: { type: "current-turn" },
      consumeEffectOnUse: false
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/abilities-luck.webp",
      imageAlt: "Luck card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://homm3bg.wiki/abilities/luck/"
    }
  },
  "artifact.centaurs_axe": {
    id: "artifact.centaurs_axe",
    name: "Centaur's Axe",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "instant", "attack", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/artifacts_minor-centaurs_axe.webp",
      imageAlt: "Centaur's Axe artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/centaurs_axe/"
    }
  },
  "artifact.ogres_club_of_havoc": {
    id: "artifact.ogres_club_of_havoc",
    name: "Ogre's Club of Havoc",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "major",
    tags: ["artifact", "major", "instant", "attack", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/artifacts_major-ogres_club_of_havoc.webp",
      imageAlt: "Ogre's Club of Havoc artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/ogres_club_of_havoc/"
    }
  },
  "artifact.titans_gladius": {
    id: "artifact.titans_gladius",
    name: "Titan's Gladius",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "relic",
    tags: ["artifact", "relic", "instant", "attack", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 2
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/artifacts_relic-titans_gladius.webp",
      imageAlt: "Titan's Gladius artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/titans_gladius/"
    }
  },
  "artifact.buckler_of_the_gnoll_king": {
    id: "artifact.buckler_of_the_gnoll_king",
    name: "Buckler of the Gnoll King",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "instant", "defense", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 1
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/artifacts_minor-buckler_of_the_gnoll_king.webp",
      imageAlt: "Buckler of the Gnoll King artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/buckler_of_the_gnoll_king/"
    }
  },
  "war_machine.first_aid_tent": {
    id: "war_machine.first_aid_tent",
    name: "First Aid Tent",
    kind: "war-machine",
    timing: "combat",
    phaseLimit: ["combat"],
    tags: ["war-machine", "permanent", "heal", "wiki-reference"],
    target: { type: "none" },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "First Aid Tent",
        scope: "player",
        duration: { type: "permanent" },
        polarity: "positive",
        removable: false,
        modifiers: [
          {
            type: "HEAL_ONCE_PER_COMBAT_ROUND",
            amount: 1
          }
        ]
      }
    },
    assets: {
      cardImage: "https://en.homm3bg.wiki/assets/war_machines-first_aid_tent.webp",
      imageAlt: "First Aid Tent war machine card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://homm3bg.wiki/war_machines/first_aid_tent/"
    }
  }
};
