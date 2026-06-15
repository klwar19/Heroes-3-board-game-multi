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
      cardImage: "/assets/statistics-attack.webp",
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
      cardImage: "/assets/statistics-defense.webp",
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
      cardImage: "/assets/statistics-power.webp",
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
      cardImage: "/assets/statistics-knowledge.webp",
      imageAlt: "Knowledge statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/knowledge/"
    }
  },
  // Empowered Statistics (Inferno expansion / Star Axis): a single printed
  // side worth the regular card's expert value, with no separate expert play.
  // Attack/Defense/Power are a flat +2; Knowledge recalls the spell AND raises
  // the spell limit by 1 without spending a crown.
  "stat.attack.empowered": {
    id: "stat.attack.empowered",
    name: "Empowered Attack",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    statisticType: "attack",
    tags: ["statistic", "instant", "attack", "empowered", "wiki-reference"],
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
      cardImage: "/assets/statistics-attack.webp",
      imageAlt: "Empowered Attack statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/"
    }
  },
  "stat.defense.empowered": {
    id: "stat.defense.empowered",
    name: "Empowered Defense",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    statisticType: "defense",
    tags: ["statistic", "instant", "defense", "empowered", "wiki-reference"],
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 2
    },
    assets: {
      cardImage: "/assets/statistics-defense.webp",
      imageAlt: "Empowered Defense statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/"
    }
  },
  "stat.power.empowered": {
    id: "stat.power.empowered",
    name: "Empowered Power",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    statisticType: "power",
    tags: ["statistic", "instant", "power", "empowered", "wiki-reference"],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "ADD_SPELL_POWER",
      amount: 2
    },
    assets: {
      cardImage: "/assets/statistics-power.webp",
      imageAlt: "Empowered Power statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/"
    }
  },
  "stat.knowledge.empowered": {
    id: "stat.knowledge.empowered",
    name: "Empowered Knowledge",
    kind: "statistic",
    timing: "instant",
    phaseLimit: ["reaction", "combat", "map"],
    statisticType: "knowledge",
    tags: ["statistic", "instant", "knowledge", "spell-recall", "empowered", "wiki-reference"],
    trigger: {
      event: "SPELL_CAST_STARTED",
      controller: "self"
    },
    effect: {
      type: "RECALL_SPELL",
      basicSpellLimitBonus: 1
    },
    assets: {
      cardImage: "/assets/statistics-knowledge.webp",
      imageAlt: "Empowered Knowledge statistic card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/statistics/"
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
    power: 0,
    target: { type: "enemy-unit" },
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
      cardImage: "/assets/spells-magic_arrow.webp",
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
      cardImage: "/assets/spells-lightning_bolt.webp",
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
    // Printed card is an Instant: it boosts the defender of the current
    // attack ("The selected unit gains +1/+2/+3 defense").
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["earth"],
    tags: ["spell", "instant", "defense", "basic", "earth", "wiki-reference"],
    power: 0,
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "opponent"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "defense",
      amount: 1,
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      }
    },
    assets: {
      cardImage: "/assets/spells-stone_skin.webp",
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
    // Printed card is an Instant on your ground/flying unit's attack.
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    spellLevel: "basic",
    spellSchools: ["fire"],
    tags: ["spell", "instant", "attack", "wiki-reference"],
    power: 0,
    trigger: {
      event: "UNIT_ATTACK_DECLARED",
      controller: "self"
    },
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1,
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      unitTypes: ["ground", "flying"]
    },
    assets: {
      cardImage: "/assets/spells-bloodlust.webp",
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
    // Power comes from the Hero's Power statistic / Power cards like every other
    // spell (base 0). The card used to carry power: 1, which silently healed 2
    // and removed effects at Power 0 — one breakpoint too strong.
    power: 0,
    target: { type: "friendly-unit" },
    // engine: heal damage by Power (0→1, 1→2, 2→3) AND remove the friendly
    // target's negative ongoing effects + its Paralysis token. The printed
    // "Remove any effect" also permits dropping a positive effect, but on your
    // own unit you would only ever clear debuffs/paralysis — so the engine
    // removes those and keeps positives, matching the wiki note that removing
    // an effect is optional (a positive effect "does not have to be removed").
    // The "OR +1 Power" side is the universal power-source discard.
    effect: {
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
      amountByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      removePolarity: "negative",
      removeParalysis: true
    },
    assets: {
      cardImage: "/assets/spells-cure.webp",
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
    // Instant (per the wiki): played before a die roll. Cast in Combat for the
    // Attack die, or played on the adventure map for the Treasure/Resource dice.
    // No phaseLimit, so it reaches both contexts; the combat and map play gates
    // decide where it is actually legal.
    timing: "instant",
    spellLevel: "basic",
    spellSchools: ["air"],
    tags: [
      "spell",
      "basic",
      "air",
      "reroll",
      "Instant: Reroll one Treasure, Resource, or Attack die, then resolve the result of your choice: Power 0: once; Power 1: twice; Power 2: 3 times. — OR — Instant: +1 Power.",
      "wiki-reference"
    ],
    // Base 0 like every other spell. The card used to carry power: 1, which
    // silently granted one extra reroll at every Power level (a "number" bug).
    power: 0,
    target: { type: "none" },
    // engine: a player-scoped reroll effect lasting the turn. In Combat the
    // Attack die may be rerolled up to N times, N scaling with the Hero's Power
    // (0/1/2 -> 1/2/3) the usual way. `adventureDice` adds a shared
    // Treasure/Resource reroll budget of the same N for map play, where Power is
    // paid by discarding power-source cards (the map has no Power statistic).
    // "Resolve the result of your choice" = the reroll keeps whichever result
    // the player prefers. The "OR +1 Power" side is the universal discard.
    effect: {
      type: "CREATE_ATTACK_DIE_REROLL",
      name: "Fortune",
      basicRerolls: 1,
      rerollsByPower: {
        0: 1,
        1: 2,
        2: 3
      },
      adventureDice: true,
      duration: { type: "current-turn" },
      consumeEffectOnUse: true
    },
    assets: {
      cardImage: "/assets/spells-fortune.webp",
      imageAlt: "Fortune card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/spells/fortune/"
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
    // "Select 2 adjacent places": the chosen target plus one unit adjacent
    // to it (friend or foe; the second space may be empty).
    target: { type: "any-unit" },
    effect: {
      type: "AREA_DAMAGE_ADJACENT",
      amountByPower: {
        0: 1,
        2: 2,
        4: 3
      }
    },
    assets: {
      cardImage: "/assets/spells-fireball.webp",
      imageAlt: "Fireball card"
    },
    implementationStatus: "implemented",
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
    // Wiki card text: basic play ignores the spell if it was cast with 1
    // power or less; the expert play ignores the spell regardless of power.
    // Either way, once Resistance applies the spell always ends.
    effect: {
      type: "CANCEL_SPELL",
      maxPower: 1,
      expertIgnoresMaxPower: true
    },
    assets: {
      cardImage: "/assets/abilities-resistance.webp",
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
      // engine: both modifiers run. RANGED_ATTACK_BONUS (+1 vs non-adjacent) is
      // applied in getActiveAttackBonus; RANGED_INITIATIVE_BONUS (+1) is summed
      // in effectiveInitiative for the player's Ranged units only. The effect is
      // player-scoped and lasts until the end of the next combat round.
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
      cardImage: "/assets/abilities-archery.webp",
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
    // Printed card: "+1 attack / Then draw 1 card" (expert +2).
    effect: {
      type: "ADD_COMBAT_STAT",
      stat: "attack",
      amount: 1,
      expertAmount: 2,
      drawCards: 1
    },
    assets: {
      cardImage: "/assets/abilities-offense.webp",
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
    // Wiki card text (Ongoing): basic "You can reroll a Treasure die and a
    // Resource die once during this turn"; expert "You can reroll any die
    // once during this turn". Ongoing cards are played during your own turn
    // on the map or while activating one of your units in combat.
    timing: "ongoing",
    abilityClass: "adventure",
    tags: ["ability", "ongoing", "reroll", "wiki-reference"],
    target: { type: "none" },
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Luck",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "ADVENTURE_DIE_REROLL", dice: "treasure" }, { type: "ADVENTURE_DIE_REROLL", dice: "resource" }]
      },
      expertEffect: {
        name: "Expert Luck",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [
          { type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: true },
          { type: "ADVENTURE_DIE_REROLL", dice: "any" }
        ]
      }
    },
    assets: {
      cardImage: "/assets/abilities-luck.webp",
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
    tags: ["artifact", "minor", "instant", "attack", "or-choice", "wiki-reference"],
    // Wiki card text: "Triple the Attack die's outcome. — OR — +1 attack".
    // Either fighter may play the tripling before the die is rolled; the flat
    // bonus only helps the attacking player.
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Triple the Attack die's outcome",
          trigger: {
            event: "UNIT_ATTACK_DECLARED",
            controller: "any"
          },
          effect: { type: "TRIPLE_ATTACK_DIE" }
        },
        {
          label: "+1 attack",
          trigger: {
            event: "UNIT_ATTACK_DECLARED",
            controller: "self"
          },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/artifacts_minor-centaurs_axe.webp",
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
    // Printed card: "Discard 1 card to gain +2 attack. — OR — +1 attack".
    tags: ["artifact", "major", "instant", "attack", "or-choice", "wiki-reference"],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +2 attack",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        },
        {
          label: "+1 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/artifacts_major-ogres_club_of_havoc.webp",
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
    // Printed card: "Discard 1 card to gain +3 attack. — OR — +2 attack".
    tags: ["artifact", "relic", "instant", "attack", "or-choice", "wiki-reference"],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Discard 1 card: +3 attack",
          cost: { discardCards: 1 },
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 3 }
        },
        {
          label: "+2 attack",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "self" },
          effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/artifacts_relic-titans_gladius.webp",
      imageAlt: "Titan's Gladius artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/titans_gladius/"
    }
  },
  "artifact.breastplate_of_petrified_wood": {
    id: "artifact.breastplate_of_petrified_wood",
    name: "Breastplate of Petrified Wood",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    tags: ["artifact", "minor", "instant", "draw", "power", "or-choice", "wiki-reference"],
    // Wiki card text: "Draw 1 card. — OR — +1 Power". The player picks
    // exactly one printed option when the card is played.
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Draw 1 card",
          effect: { type: "DRAW_CARDS", amount: 1 }
        },
        {
          label: "+1 Power",
          trigger: {
            event: "SPELL_CAST_STARTED",
            controller: "self"
          },
          effect: { type: "ADD_SPELL_POWER", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/artifacts_minor-breastplate_of_petrified_wood.webp",
      imageAlt: "Breastplate of Petrified Wood artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/breastplate_of_petrified_wood/"
    }
  },
  "artifact.buckler_of_the_gnoll_king": {
    id: "artifact.buckler_of_the_gnoll_king",
    name: "Buckler of the Gnoll King",
    kind: "artifact",
    timing: "instant",
    phaseLimit: ["reaction", "combat"],
    artifactTier: "minor",
    // Printed reference: "+2 defense, then this unit suffers -1 attack until the
    // end of the Combat (minimum 0). — OR — +1 defense." Engine wires both sides
    // through the CHOOSE_ONE options below (option 0 = +2/-1, option 1 = +1).
    tags: [
      "artifact",
      "minor",
      "instant",
      "defense",
      "wiki-reference",
      "+2 defense, then -1 attack until the end of the Combat. — OR — +1 defense."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          // The defending unit gains +2 defense for this attack and carries a
          // -1 attack penalty (floored at 0) for the rest of the Combat.
          label: "+2 defense, then -1 attack this Combat",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: {
            type: "ADD_COMBAT_STAT",
            stat: "defense",
            amount: 2,
            selfStatPenalty: { stat: "attack", amount: 1 }
          }
        },
        {
          label: "+1 defense",
          trigger: { event: "UNIT_ATTACK_DECLARED", controller: "opponent" },
          effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 }
        }
      ]
    },
    assets: {
      cardImage: "/assets/artifacts_minor-buckler_of_the_gnoll_king.webp",
      imageAlt: "Buckler of the Gnoll King artifact card"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/artifacts/buckler_of_the_gnoll_king/"
    }
  },
  // First Aid Tent moved to permanents.ts with the rest of the war machines
  // (same card id, now using the permanent-card model).
};
