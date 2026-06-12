import type { UnitDefinition } from "./types";

/**
 * Core-box unit roster: the three core factions plus the four neutral tiers.
 * Stats, costs and ability text transcribed from the fan wiki units table
 * (https://en.homm3bg.wiki/units/). Ability tags reference implemented
 * engine abilities; abilityText keeps the printed rules text for display
 * and for the content tracker until each ability is implemented.
 */
export const coreUnitDefinitions: Record<string, UnitDefinition> = {
  "castle.halberdiers": {
    id: "castle.halberdiers",
    name: "Halberdiers",
    faction: "castle",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 4, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-castle-bronze-halberdiers-few.webp" },
    pack: { attack: 3, defense: 1, health: 2, initiative: 5, cost: { gold: 3 }, abilities: [], abilityText: "[unit_passive] When the unit is targeted by any attack, you can discard a card and ignore the Attack die's roll result.", cardImage: "/assets/units-castle-bronze-halberdiers-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/halberdiers/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/halberdiers/"
    }
  },
  "castle.marksmen": {
    id: "castle.marksmen",
    name: "Marksmen",
    faction: "castle",
    tier: "bronze",
    type: "ranged",
    few: { attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-castle-bronze-marksmen-few.webp" },
    pack: { attack: 2, defense: 0, health: 2, initiative: 6, cost: { gold: 5 }, abilities: ["double-attack"], abilityText: "[unit_attack] If a target is a non-adjacent unit, attack this target again.", cardImage: "/assets/units-castle-bronze-marksmen-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/marksmen/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/marksmen/"
    }
  },
  "castle.griffins": {
    id: "castle.griffins",
    name: "Griffins",
    faction: "castle",
    tier: "bronze",
    type: "flying",
    few: { attack: 2, defense: 0, health: 4, initiative: 6, cost: { gold: 4 }, abilities: ["unlimited-retaliation"], abilityText: "[unit_retaliation] This unit can perform an unlimited number of Retaliation Attacks.", cardImage: "/assets/units-castle-bronze-griffins-few.webp" },
    pack: { attack: 3, defense: 0, health: 4, initiative: 9, cost: { gold: 6 }, abilities: ["unlimited-retaliation"], abilityText: "[unit_retaliation] This unit can perform an unlimited number of Retaliation Attacks.", cardImage: "/assets/units-castle-bronze-griffins-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/griffins/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/griffins/"
    }
  },
  "castle.crusaders": {
    id: "castle.crusaders",
    name: "Crusaders",
    faction: "castle",
    tier: "silver",
    type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 6 }, abilities: [], cardImage: "/assets/units-castle-silver-crusaders-few.webp" },
    pack: { attack: 4, defense: 2, health: 4, initiative: 6, cost: { gold: 10 }, abilities: ["attack-die-reroll"], abilityText: "[unit_attack] You can reroll every \"0\" on this unit's Attack die .", cardImage: "/assets/units-castle-silver-crusaders-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/crusaders/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/crusaders/"
    }
  },
  "castle.zealots": {
    id: "castle.zealots",
    name: "Zealots",
    faction: "castle",
    tier: "silver",
    type: "ranged",
    few: { attack: 3, defense: 1, health: 5, initiative: 5, cost: { gold: 8 }, abilities: [], cardImage: "/assets/units-castle-silver-zealots-few.webp" },
    pack: { attack: 4, defense: 1, health: 5, initiative: 7, cost: { gold: 12 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-castle-silver-zealots-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/zealots/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/zealots/"
    }
  },
  "castle.champions": {
    id: "castle.champions",
    name: "Champions",
    faction: "castle",
    tier: "gold",
    type: "ground",
    few: { attack: 5, defense: 2, health: 7, initiative: 7, cost: { gold: 12 }, abilities: [], abilityText: ".", cardImage: "/assets/units-castle-golden-champions-few.webp" },
    pack: { attack: 6, defense: 2, health: 7, initiative: 9, cost: { gold: 20, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_attack] If this unit's movement ends in a space other than where it started, you may reroll an Attack die .", cardImage: "/assets/units-castle-golden-champions-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/champions/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/champions/"
    }
  },
  "castle.archangels": {
    id: "castle.archangels",
    name: "Archangels",
    faction: "castle",
    tier: "gold",
    type: "flying",
    few: { attack: 6, defense: 3, health: 8, initiative: 12, cost: { gold: 20, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_passive] When combat begins, draw 1 card.", cardImage: "/assets/units-castle-golden-archangels-few.webp" },
    pack: { attack: 7, defense: 3, health: 10, initiative: 18, cost: { gold: 30, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [unit_passive] Once per Combat. Cancel an attack that would reduce another unit's [health_points] to 0.", cardImage: "/assets/units-castle-golden-archangels-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/archangels/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/archangels/"
    }
  },
  "necropolis.skeletons": {
    id: "necropolis.skeletons",
    name: "Skeletons",
    faction: "necropolis",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 4, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-necropolis-bronze-skeletons-few.webp" },
    pack: { attack: 3, defense: 1, health: 2, initiative: 5, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-necropolis-bronze-skeletons-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/skeletons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/skeletons/"
    }
  },
  "necropolis.zombies": {
    id: "necropolis.zombies",
    name: "Zombies",
    faction: "necropolis",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 3, initiative: 3, cost: { gold: 3 }, abilities: [], abilityText: "[unit_passive] If the attacker resolves a \"+1\" on Attack die , gain +1 [defense] .", cardImage: "/assets/units-necropolis-bronze-zombies-few.webp" },
    pack: { attack: 2, defense: 1, health: 3, initiative: 4, cost: { gold: 4 }, abilities: [], abilityText: "[unit_passive] If the attacker resolves a \"0\" or a +1\" on Attack die , gain +1 [defense] .", cardImage: "/assets/units-necropolis-bronze-zombies-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/zombies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/zombies/"
    }
  },
  "necropolis.wraiths": {
    id: "necropolis.wraiths",
    name: "Wraiths",
    faction: "necropolis",
    tier: "bronze",
    type: "flying",
    few: { attack: 3, defense: 0, health: 3, initiative: 5, cost: { gold: 4 }, abilities: [], abilityText: "[activation] Remove up to 1 [damage] from this unit.", cardImage: "/assets/units-necropolis-bronze-wraiths-few.webp" },
    pack: { attack: 3, defense: 0, health: 5, initiative: 7, cost: { gold: 6 }, abilities: [], abilityText: "[activation] Remove up to 1 [damage] from this unit, then discard 1 random card from the enemy's hand.", cardImage: "/assets/units-necropolis-bronze-wraiths-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/wraiths/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/wraiths/"
    }
  },
  "necropolis.vampires": {
    id: "necropolis.vampires",
    name: "Vampires",
    faction: "necropolis",
    tier: "silver",
    type: "flying",
    few: { attack: 4, defense: 1, health: 4, initiative: 6, cost: { gold: 8 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack.", cardImage: "/assets/units-necropolis-silver-vampires-few.webp" },
    pack: { attack: 5, defense: 1, health: 4, initiative: 9, cost: { gold: 12 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack. Then remove up to 2 [damage] from this unit.", cardImage: "/assets/units-necropolis-silver-vampires-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/vampires/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/vampires/"
    }
  },
  "necropolis.liches": {
    id: "necropolis.liches",
    name: "Liches",
    faction: "necropolis",
    tier: "silver",
    type: "ranged",
    few: { attack: 3, defense: 1, health: 5, initiative: 6, cost: { gold: 8 }, abilities: [], cardImage: "/assets/units-necropolis-silver-liches-few.webp" },
    pack: { attack: 4, defense: 1, health: 5, initiative: 7, cost: { gold: 14 }, abilities: ["lich-death-cloud"], abilityText: "[unit_attack] Choose a unit adjacent to the target and attack it. For the purpose of this attack, your [attack] is 2.", cardImage: "/assets/units-necropolis-silver-liches-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/liches/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/liches/"
    }
  },
  "necropolis.dread_knights": {
    id: "necropolis.dread_knights",
    name: "Dread Knights",
    faction: "necropolis",
    tier: "gold",
    type: "ground",
    few: { attack: 5, defense: 2, health: 7, initiative: 7, cost: { gold: 12 }, abilities: [], abilityText: "[unit_attack] When retaliating after this attack, the enemy rolls 2 Attack dice and resolves the lower result.", cardImage: "/assets/units-necropolis-golden-dread_knights-few.webp" },
    pack: { attack: 6, defense: 2, health: 7, initiative: 9, cost: { gold: 20, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_attack] If you resolve a \"0\" or a \"+1\" on the Attack die , increase this unit's total attack value by another \"+1\".", cardImage: "/assets/units-necropolis-golden-dread_knights-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dread_knights/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dread_knights/"
    }
  },
  "necropolis.ghost_dragons": {
    id: "necropolis.ghost_dragons",
    name: "Ghost Dragons",
    faction: "necropolis",
    tier: "gold",
    type: "flying",
    few: { attack: 6, defense: 3, health: 8, initiative: 9, cost: { gold: 19, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [activation] Discard the enemy's [morale_positive] token.", cardImage: "/assets/units-necropolis-golden-ghost_dragons-few.webp" },
    pack: { attack: 7, defense: 3, health: 9, initiative: 14, cost: { gold: 32, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [activation] Discard the enemy's [morale_positive] token. [unit_attack] Add +1 to your Attack die result.", cardImage: "/assets/units-necropolis-golden-ghost_dragons-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ghost_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ghost_dragons/"
    }
  },
  "dungeon.troglodytes": {
    id: "dungeon.troglodytes",
    name: "Troglodytes",
    faction: "dungeon",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 4, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-dungeon-bronze-troglodytes-few.webp" },
    pack: { attack: 3, defense: 1, health: 2, initiative: 5, cost: { gold: 3 }, abilities: [], abilityText: "[unit_passive] This unit ignores [paralysis] effect.", cardImage: "/assets/units-dungeon-bronze-troglodytes-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/troglodytes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/troglodytes/"
    }
  },
  "dungeon.harpies": {
    id: "dungeon.harpies",
    name: "Harpies",
    faction: "dungeon",
    tier: "bronze",
    type: "flying",
    few: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 3 }, abilities: [], abilityText: "[unit_attack] After the enemy's Retaliation Attack, this unit can return to the space from which it moved to attack.", cardImage: "/assets/units-dungeon-bronze-harpies-few.webp" },
    pack: { attack: 3, defense: 0, health: 3, initiative: 9, cost: { gold: 5 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack. This unit can return to the space from which it moved to attack.", cardImage: "/assets/units-dungeon-bronze-harpies-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/harpies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/harpies/"
    }
  },
  "dungeon.evil_eyes": {
    id: "dungeon.evil_eyes",
    name: "Evil Eyes",
    faction: "dungeon",
    tier: "bronze",
    type: "ranged",
    few: { attack: 3, defense: 0, health: 3, initiative: 5, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-dungeon-bronze-evil_eyes-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 7, cost: { gold: 6 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-dungeon-bronze-evil_eyes-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/evil_eyes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/evil_eyes/"
    }
  },
  "dungeon.medusas": {
    id: "dungeon.medusas",
    name: "Medusas",
    faction: "dungeon",
    tier: "silver",
    type: "ranged",
    few: { attack: 3, defense: 1, health: 4, initiative: 5, cost: { gold: 6 }, abilities: [], abilityText: "[unit_passive] After the Retaliation Attack, roll an Attack die , on a \"0\" the target is [paralysis] .", cardImage: "/assets/units-dungeon-silver-medusas-few.webp" },
    pack: { attack: 4, defense: 1, health: 4, initiative: 6, cost: { gold: 12 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units. [unit_retaliation] The target gains [paralysis] .", cardImage: "/assets/units-dungeon-silver-medusas-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/medusas/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/medusas/"
    }
  },
  "dungeon.minotaurs": {
    id: "dungeon.minotaurs",
    name: "Minotaurs",
    faction: "dungeon",
    tier: "silver",
    type: "ground",
    few: { attack: 4, defense: 2, health: 4, initiative: 6, cost: { gold: 8 }, abilities: [], abilityText: "[unit_attack] If you resolve a \"-1\" on the Attack die , draw a card,", cardImage: "/assets/units-dungeon-silver-minotaurs-few.webp" },
    pack: { attack: 5, defense: 2, health: 4, initiative: 8, cost: { gold: 14 }, abilities: [], abilityText: "[unit_attack] If you resolve a \"-1\" on the Attack die , draw a card,", cardImage: "/assets/units-dungeon-silver-minotaurs-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/minotaurs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/minotaurs/"
    }
  },
  "dungeon.manticores": {
    id: "dungeon.manticores",
    name: "Manticores",
    faction: "dungeon",
    tier: "gold",
    type: "flying",
    few: { attack: 5, defense: 1, health: 6, initiative: 7, cost: { gold: 10 }, abilities: [], cardImage: "/assets/units-dungeon-golden-manticores-few.webp" },
    pack: { attack: 5, defense: 1, health: 6, initiative: 11, cost: { gold: 18, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_attack] For this attack, ignore the [defense] value from the target unit's card.", cardImage: "/assets/units-dungeon-golden-manticores-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/manticores/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/manticores/"
    }
  },
  "dungeon.black_dragons": {
    id: "dungeon.black_dragons",
    name: "Black Dragons",
    faction: "dungeon",
    tier: "gold",
    type: "flying",
    few: { attack: 6, defense: 3, health: 8, initiative: 11, cost: { gold: 19, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_passive] Reduce [damage] taken by this unit from [spell] by 2 to a minimum of 0.", cardImage: "/assets/units-dungeon-golden-black_dragons-few.webp" },
    pack: { attack: 8, defense: 3, health: 8, initiative: 15, cost: { gold: 33, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [unit_passive] Ignore any [spell] effects and [damage] from Specialty .", cardImage: "/assets/units-dungeon-golden-black_dragons-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/black_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/black_dragons/"
    }
  },
  // ---- Rampart expansion -------------------------------------------------
  "rampart.centaurs": {
    id: "rampart.centaurs",
    name: "Centaurs",
    faction: "rampart",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-rampart-bronze-centaurs-few.webp" },
    pack: { attack: 3, defense: 0, health: 3, initiative: 8, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-rampart-bronze-centaurs-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/centaurs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/centaurs/"
    }
  },
  "rampart.dwarves": {
    id: "rampart.dwarves",
    name: "Dwarves",
    faction: "rampart",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 3, initiative: 3, cost: { gold: 3 }, abilities: [], abilityText: "[unit_passive] If this unit is targeted by any Spell or Specialty card, roll 1 Attack die. On a \"+1\" result, ignore the card's effect.", cardImage: "/assets/units-rampart-bronze-dwarves-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 5, cost: { gold: 4 }, abilities: [], abilityText: "[unit_passive] If this unit is targeted by any Spell or Specialty card, roll 1 Attack die. On a \"+1\" result, ignore the card's effect.", cardImage: "/assets/units-rampart-bronze-dwarves-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dwarves/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dwarves/"
    }
  },
  "rampart.elves": {
    id: "rampart.elves",
    name: "Elves",
    faction: "rampart",
    tier: "bronze",
    type: "ranged",
    few: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-rampart-bronze-elves-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 7, cost: { gold: 7 }, abilities: ["double-attack-low-roll"], abilityText: "[unit_attack] If a target is a non adjacent unit, on a \"-1\" or \"0\" result, attack this target again.", cardImage: "/assets/units-rampart-bronze-elves-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/elves/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/elves/"
    }
  },
  "rampart.pegasi": {
    id: "rampart.pegasi",
    name: "Pegasi",
    faction: "rampart",
    tier: "silver",
    type: "flying",
    few: { attack: 3, defense: 0, health: 5, initiative: 8, cost: { gold: 6 }, abilities: [], cardImage: "/assets/units-rampart-silver-pegasi-few.webp" },
    pack: { attack: 4, defense: 0, health: 6, initiative: 12, cost: { gold: 10 }, abilities: [], abilityText: "[unit_passive] The [power] of all enemy spells is reduced by 1 (to a minimum of 0).", cardImage: "/assets/units-rampart-silver-pegasi-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/pegasi/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/pegasi/"
    }
  },
  "rampart.dendroids": {
    id: "rampart.dendroids",
    name: "Dendroids",
    faction: "rampart",
    tier: "silver",
    type: "ground",
    few: { attack: 4, defense: 2, health: 5, initiative: 3, cost: { gold: 8 }, abilities: [], cardImage: "/assets/units-rampart-silver-dendroids-few.webp" },
    pack: { attack: 4, defense: 2, health: 6, initiative: 4, cost: { gold: 15 }, abilities: [], abilityText: "[unit_passive] Enemy units that start activation adjacent to this unit cannot move.", cardImage: "/assets/units-rampart-silver-dendroids-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dendroids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dendroids/"
    }
  },
  "rampart.unicorns": {
    id: "rampart.unicorns",
    name: "Unicorns",
    faction: "rampart",
    tier: "gold",
    type: "ground",
    few: { attack: 5, defense: 1, health: 8, initiative: 7, cost: { gold: 11 }, abilities: [], abilityText: "[unit_passive] Reduce any [damage] from [spell] dealt to this unit by 1 (to a minimum of 0).", cardImage: "/assets/units-rampart-golden-unicorns-few.webp" },
    pack: { attack: 6, defense: 1, health: 8, initiative: 9, cost: { gold: 18, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_passive] Reduce any [damage] from [spell] dealt to this and adjacent friendly unit(s) by 1 (to a minimum of 0).", cardImage: "/assets/units-rampart-golden-unicorns-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/unicorns/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/unicorns/"
    }
  },
  "rampart.gold_dragons": {
    id: "rampart.gold_dragons",
    name: "Gold Dragons",
    faction: "rampart",
    tier: "gold",
    type: "flying",
    few: { attack: 5, defense: 3, health: 9, initiative: 10, cost: { gold: 22, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 2 [attack].", cardImage: "/assets/units-rampart-golden-gold_dragons-few.webp" },
    pack: { attack: 6, defense: 3, health: 10, initiative: 16, cost: { gold: 30, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 3 [attack].", cardImage: "/assets/units-rampart-golden-gold_dragons-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gold_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gold_dragons/"
    }
  },

  // ---- Inferno expansion ---------------------------------------------------
  "inferno.familiars": {
    id: "inferno.familiars",
    name: "Familiars",
    faction: "inferno",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 5, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-inferno-bronze-familiars-few.webp" },
    pack: { attack: 3, defense: 1, health: 2, initiative: 7, cost: { gold: 3 }, abilities: [], abilityText: "[unit_passive] Whenever an enemy casts a [spell] from hand, they must discard 1 card from hand.", cardImage: "/assets/units-inferno-bronze-familiars-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/familiars/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/familiars/"
    }
  },
  "inferno.magogs": {
    id: "inferno.magogs",
    name: "Magogs",
    faction: "inferno",
    tier: "bronze",
    type: "ranged",
    few: { attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-inferno-bronze-magogs-few.webp" },
    pack: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["magog-fireball-splash"], abilityText: "[unit_attack] When Magogs attack a target that is not adjacent to them, they also deal 1 [damage] to a unit adjacent to the target.", cardImage: "/assets/units-inferno-bronze-magogs-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magogs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magogs/"
    }
  },
  "inferno.cerberi": {
    id: "inferno.cerberi",
    name: "Cerberi",
    faction: "inferno",
    tier: "bronze",
    type: "ground",
    few: { attack: 3, defense: 0, health: 4, initiative: 7, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-inferno-bronze-cerberi-few.webp" },
    pack: { attack: 3, defense: 1, health: 5, initiative: 8, cost: { gold: 7 }, abilities: ["ignores-retaliation", "cerberi-second-head"], abilityText: "[unit_attack] Ignores Retaliation Attacks. Additionally, deals 1 [damage] to another enemy unit adjacent to Cerberi.", cardImage: "/assets/units-inferno-bronze-cerberi-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/cerberi/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/cerberi/"
    }
  },
  "inferno.demons": {
    id: "inferno.demons",
    name: "Demons",
    faction: "inferno",
    tier: "silver",
    type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 6 }, abilities: [], cardImage: "/assets/units-inferno-silver-demons-few.webp" },
    pack: { attack: 3, defense: 2, health: 5, initiative: 6, cost: { gold: 8 }, abilities: [], cardImage: "/assets/units-inferno-silver-demons-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/demons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/demons/"
    }
  },
  "inferno.pit_lords": {
    id: "inferno.pit_lords",
    name: "Pit Lords",
    faction: "inferno",
    tier: "silver",
    type: "ground",
    few: { attack: 4, defense: 1, health: 6, initiative: 6, cost: { gold: 8 }, abilities: [], cardImage: "/assets/units-inferno-silver-pit_lords-few.webp" },
    pack: { attack: 5, defense: 1, health: 6, initiative: 7, cost: { gold: 15 }, abilities: ["summon-demons"], abilityText: "[unit_other] If one of your units has been removed from the board during this Combat, Summon or Reinforce Demons.", cardImage: "/assets/units-inferno-silver-pit_lords-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/pit_lords/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/pit_lords/"
    }
  },
  "inferno.efreet": {
    id: "inferno.efreet",
    name: "Efreet",
    faction: "inferno",
    tier: "gold",
    type: "flying",
    few: { attack: 5, defense: 1, health: 7, initiative: 9, cost: { gold: 12 }, abilities: [], abilityText: "[unit_passive] Ignores any [damage] from Magic Arrows.", cardImage: "/assets/units-inferno-golden-efreet-few.webp" },
    pack: { attack: 6, defense: 1, health: 7, initiative: 13, cost: { gold: 18, valuables: 1 }, abilities: [], abilityText: "1 [valuables] [unit_passive] Ignores any [damage] from Magic Arrows or spells from the Fire School of Magic.", cardImage: "/assets/units-inferno-golden-efreet-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/efreet/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/efreet/"
    }
  },
  "inferno.arch_devils": {
    id: "inferno.arch_devils",
    name: "Arch Devils",
    faction: "inferno",
    tier: "gold",
    type: "flying",
    few: { attack: 6, defense: 3, health: 8, initiative: 11, cost: { gold: 22, valuables: 1 }, abilities: ["ignores-retaliation"], abilityText: "1 [valuables] [unit_attack] Ignores Retaliation Attacks.", cardImage: "/assets/units-inferno-golden-arch_devils-few.webp" },
    pack: { attack: 7, defense: 3, health: 9, initiative: 15, cost: { gold: 30, valuables: 2 }, abilities: ["ignores-retaliation", "teleport-move"], abilityText: "2 [valuables] [unit_attack] Ignores Retaliation Attacks. [unit_passive] As a regular movement, the Arch Devils can move to any empty space.", cardImage: "/assets/units-inferno-golden-arch_devils-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/arch_devils/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/arch_devils/"
    }
  },

  "neutral.boars": {
    id: "neutral.boars",
    name: "Boars",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 6, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-neutral-bronze-boars.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/boars/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/boars/"
    }
  },
  "neutral.evil_eyes": {
    id: "neutral.evil_eyes",
    name: "Evil Eyes",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 6 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-blank-bronze.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/evil_eyes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/evil_eyes/"
    }
  },
  "neutral.griffins": {
    id: "neutral.griffins",
    name: "Griffins",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 3, defense: 0, health: 4, initiative: 8, cost: { gold: 7 }, abilities: ["unlimited-retaliation"], abilityText: "[unit_retaliation] This unit can perform and unlimited number of Retaliation Attacks.", cardImage: "/assets/units-neutral-bronze-griffins.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/griffins/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/griffins/"
    }
  },
  "neutral.halberdiers": {
    id: "neutral.halberdiers",
    name: "Halberdiers",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 4, cost: { gold: 4 }, abilities: [], abilityText: "[unit_passive] Treat allied adjacent units as if they had a Defense token.", cardImage: "/assets/units-neutral-bronze-halberdiers.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/halberdiers/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/halberdiers/"
    }
  },
  "neutral.halflings": {
    id: "neutral.halflings",
    name: "Halflings",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_attack] Roll 2 Attack dice and resolve the higher one. Ignore combat penalties.", cardImage: "/assets/units-neutral-bronze-halflings.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/halflings/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/halflings/"
    }
  },
  "neutral.harpies": {
    id: "neutral.harpies",
    name: "Harpies",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 8, cost: { gold: 5 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack. This unit can return to the space from which it moved to attack.", cardImage: "/assets/units-neutral-bronze-harpies.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/harpies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/harpies/"
    }
  },
  "neutral.marksmen": {
    id: "neutral.marksmen",
    name: "Marksmen",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 3, initiative: 5, cost: { gold: 7 }, abilities: ["double-attack"], abilityText: "[unit_attack] If a target is a non-adjacent unit, attack this target again.", cardImage: "/assets/units-neutral-bronze-marksmen.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/marksmen/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/marksmen/"
    }
  },
  "neutral.peasants": {
    id: "neutral.peasants",
    name: "Peasants",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 1, defense: 0, health: 2, initiative: 3, cost: { gold: 3 }, abilities: [], abilityText: ".", cardImage: "/assets/units-neutral-bronze-peasants.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/peasants/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/peasants/"
    }
  },
  "neutral.rogues": {
    id: "neutral.rogues",
    name: "Rogues",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 5 }, abilities: [], abilityText: "[map_effect] Once during your turn, look at the top card from any deck, then put it back on the top or on the bottom of that deck.", cardImage: "/assets/units-neutral-bronze-rogues.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/rogues/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/rogues/"
    }
  },
  "neutral.skeletons": {
    id: "neutral.skeletons",
    name: "Skeletons",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 3, initiative: 4, cost: { gold: 3 }, abilities: [], abilityText: "[unit_passive] After defeating Skeletons, if you control a [necro] Hero , immediately Reinforce 1 of your [bronze] units.", cardImage: "/assets/units-neutral-bronze-skeletons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/skeletons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/skeletons/"
    }
  },
  "neutral.troglodytes": {
    id: "neutral.troglodytes",
    name: "Troglodytes",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: [], abilityText: "[unit_passive] This unit ignores [paralysis] effects.", cardImage: "/assets/units-neutral-bronze-troglodytes.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/troglodytes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/troglodytes/"
    }
  },
  "neutral.wraiths": {
    id: "neutral.wraiths",
    name: "Wraiths",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 7, cost: { gold: 7 }, abilities: [], abilityText: "[activation] Remove up to 2 [damage] from this unit.", cardImage: "/assets/units-neutral-bronze-wraiths.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/wraiths/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/wraiths/"
    }
  },
  "neutral.zombies": {
    id: "neutral.zombies",
    name: "Zombies",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 3, cost: { gold: 5 }, abilities: [], abilityText: "[unit_passive] If the attacker resolves a \"0\" or a \"+1\" on an Attack die , gain +1 [defense]", cardImage: "/assets/units-neutral-bronze-zombies.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/zombies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/zombies/"
    }
  },
  "neutral.crusaders": {
    id: "neutral.crusaders",
    name: "Crusaders",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 11 }, abilities: [], abilityText: "[unit_passive] During any attack, roll 2 Attack dice and resolve the higher outcome.", cardImage: "/assets/units-neutral-silver-crusaders.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/crusaders/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/crusaders/"
    }
  },
  "neutral.liches": {
    id: "neutral.liches",
    name: "Liches",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: { attack: 3, defense: 0, health: 6, initiative: 7, cost: { gold: 12 }, abilities: ["lich-death-cloud"], abilityText: "[unit_attack] Choose a unit adjacent to the target and attack it. For the purpose of this attack, your [attack] is 2.", cardImage: "/assets/units-neutral-silver-liches.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/liches/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/liches/"
    }
  },
  "neutral.medusas": {
    id: "neutral.medusas",
    name: "Medusas",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: { attack: 3, defense: 1, health: 4, initiative: 6, cost: { gold: 11 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units. [unit_retaliation] The target is [paralysis] .", cardImage: "/assets/units-neutral-silver-medusas.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/medusas/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/medusas/"
    }
  },
  "neutral.minotaurs": {
    id: "neutral.minotaurs",
    name: "Minotaurs",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 2, health: 4, initiative: 7, cost: { gold: 11 }, abilities: [], abilityText: "[unit_attack] Reroll this unit's \"-1\" outcome on the Attack die .", cardImage: "/assets/units-neutral-silver-minotaurs.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/minotaurs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/minotaurs/"
    }
  },
  "neutral.mummies": {
    id: "neutral.mummies",
    name: "Mummies",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 1, health: 4, initiative: 5, cost: { gold: 8 }, abilities: [], abilityText: "[unit_attack] Ignore the result on the Attack die . [unit_passive] Whenever this unit is attacked, set your opponent's Attack die to \"-1\".", cardImage: "/assets/units-neutral-silver-mummies.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/mummies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/mummies/"
    }
  },
  "neutral.nomads": {
    id: "neutral.nomads",
    name: "Nomads",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 1, health: 4, initiative: 7, cost: { gold: 10 }, abilities: [], abilityText: "[map_effect] At the end of your turn, move your Hero's model to an adjacent empty field.", cardImage: "/assets/units-neutral-silver-nomads.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/nomads/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/nomads/"
    }
  },
  "neutral.sharpshooters": {
    id: "neutral.sharpshooters",
    name: "Sharpshooters",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: { attack: 3, defense: 0, health: 6, initiative: 9, cost: { gold: 10 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_attack] Ignore the combat penalties.", cardImage: "/assets/units-neutral-silver-sharpshooters.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sharpshooters/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sharpshooters/"
    }
  },
  "neutral.vampires": {
    id: "neutral.vampires",
    name: "Vampires",
    faction: "neutral",
    tier: "silver",
    type: "flying",
    neutral: { attack: 3, defense: 0, health: 5, initiative: 8, cost: { gold: 9 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore Enemy's Retaliation Attack. Then remove up to 2 [damage] from this unit.", cardImage: "/assets/units-neutral-silver-vampires.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/vampires/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/vampires/"
    }
  },
  "neutral.zealots": {
    id: "neutral.zealots",
    name: "Zealots",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: { attack: 3, defense: 0, health: 5, initiative: 5, cost: { gold: 12 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-neutral-silver-zealots.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/zealots/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/zealots/"
    }
  },
  "neutral.archangels": {
    id: "neutral.archangels",
    name: "Archangels",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 5, defense: 2, health: 7, initiative: 10, cost: { gold: 29 }, abilities: [], abilityText: "[unit_attack] When attacking Arch Devils , this unit gains +2 [attack] .", cardImage: "/assets/units-neutral-golden-archangels.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/archangels/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/archangels/"
    }
  },
  "neutral.black_dragons": {
    id: "neutral.black_dragons",
    name: "Black Dragons",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 5, defense: 2, health: 7, initiative: 9, cost: { gold: 30 }, abilities: [], abilityText: "[unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 2 [attack] .", cardImage: "/assets/units-neutral-golden-black_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/black_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/black_dragons/"
    }
  },
  "neutral.champions": {
    id: "neutral.champions",
    name: "Champions",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 4, defense: 2, health: 6, initiative: 8, cost: { gold: 18 }, abilities: [], abilityText: "[unit_attack] Roll 2 Attack dice and apply both outcomes. [unit_passive] Reroll this unit's all \"-1\" rolls.", cardImage: "/assets/units-neutral-golden-champions.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/champions/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/champions/"
    }
  },
  "neutral.diamond_golems": {
    id: "neutral.diamond_golems",
    name: "Diamond Golems",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 4, defense: 2, health: 6, initiative: 6, cost: { gold: 16 }, abilities: [], abilityText: "[unit_passive] Reduce any [damage] from spells by 3 — to a minimum of 0.", cardImage: "/assets/units-neutral-golden-diamond_golems.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/diamond_golems/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/diamond_golems/"
    }
  },
  "neutral.dread_knights": {
    id: "neutral.dread_knights",
    name: "Dread Knights",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 5, defense: 1, health: 7, initiative: 7, cost: { gold: 18 }, abilities: [], abilityText: "[unit_passive] When this unit is targeted by a Retaliation Attack, it gains +1 [defense] .", cardImage: "/assets/units-neutral-golden-dread_knights.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dread_knights/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dread_knights/"
    }
  },
  "neutral.enchanters": {
    id: "neutral.enchanters",
    name: "Enchanters",
    faction: "neutral",
    tier: "gold",
    type: "ranged",
    neutral: { attack: 4, defense: 1, health: 5, initiative: 5, cost: { gold: 16 }, abilities: [], abilityText: "[activation] Remove up to 2 [damage] from a friendly unit. Otherwise, Enchanters gain +1 [attack] .", cardImage: "/assets/units-neutral-golden-enchanters.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/enchanters/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/enchanters/"
    }
  },
  "neutral.ghost_dragons": {
    id: "neutral.ghost_dragons",
    name: "Ghost Dragons",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 5, defense: 2, health: 6, initiative: 9, cost: { gold: 28 }, abilities: [], abilityText: "[unit_attack] After the attack, roll 1 Attack die ; if the result is \"0\", the target must immediately move away 1 space.", cardImage: "/assets/units-neutral-golden-ghost_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ghost_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ghost_dragons/"
    }
  },
  "neutral.gold_golems": {
    id: "neutral.gold_golems",
    name: "Gold Golems",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 3, defense: 2, health: 6, initiative: 5, cost: { gold: 14 }, abilities: [], abilityText: "[unit_passive] Reduce any [damage] from spells by 2 — to a minimum of 0.", cardImage: "/assets/units-neutral-golden-gold_golems.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gold_golems/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gold_golems/"
    }
  },
  "neutral.manticores": {
    id: "neutral.manticores",
    name: "Manticores",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 4, defense: 1, health: 7, initiative: 8, cost: { gold: 18 }, abilities: [], abilityText: "[unit_passive] On a \"0\" or a \"+1\" outcomes on the enemy's Attack die , gain +1 [defense] .", cardImage: "/assets/units-neutral-golden-manticores.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/manticores/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/manticores/"
    }
  },
  "neutral.trolls": {
    id: "neutral.trolls",
    name: "Trolls",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 4, defense: 0, health: 7, initiative: 7, cost: { gold: 13 }, abilities: [], abilityText: "[activation] Remove up to 3 [damage] from this unit.", cardImage: "/assets/units-neutral-golden-trolls.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/trolls/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/trolls/"
    }
  },
  "neutral.azure_dragons": {
    id: "neutral.azure_dragons",
    name: "Azure Dragons",
    faction: "neutral",
    tier: "azure",
    type: "flying",
    neutral: { attack: 8, defense: 3, health: 10, initiative: 19, cost: { gold: 45, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [unit_attack] If you resolve a \"-1\" on the Attack die , the target gains [paralysis] . [unit_passive] Ignore any [spell] effects and [damage] from Specialty .", cardImage: "/assets/units-neutral-azure-azure_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/azure_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/azure_dragons/"
    }
  },
  "neutral.crystal_dragons": {
    id: "neutral.crystal_dragons",
    name: "Crystal Dragons",
    faction: "neutral",
    tier: "azure",
    type: "ground",
    neutral: { attack: 7, defense: 3, health: 9, initiative: 16, cost: { gold: 40, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [map_effect] At the beginning of each Resource round, gain 2 [valuables] .", cardImage: "/assets/units-neutral-azure-crystal_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/crystal_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/crystal_dragons/"
    }
  },
  "neutral.cerberi": {
    id: "neutral.cerberi",
    name: "Cerberi",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 5, initiative: 8, cost: { gold: 10 }, abilities: ["ignores-retaliation", "cerberi-second-head"], abilityText: "[unit_attack] Ignores Retaliation Attacks. Additionally, deals 1 [damage] to another enemy unit adjacent to Cerberi.", cardImage: "/assets/units-neutral-bronze-cerberi.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/cerberi/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/cerberi/"
    }
  },
  "neutral.familiars": {
    id: "neutral.familiars",
    name: "Familiars",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 3, defense: 1, health: 2, initiative: 7, cost: { gold: 6 }, abilities: [], abilityText: "[unit_passive] Whenever an enemy casts a [spell] from hand, they must discard 1 card from hand.", cardImage: "/assets/units-neutral-bronze-familiars.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/familiars/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/familiars/"
    }
  },
  "neutral.magogs": {
    id: "neutral.magogs",
    name: "Magogs",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 6, cost: { gold: 8 }, abilities: ["magog-fireball-splash"], abilityText: "[unit_attack] When Magogs attack a target that is non adjacent to them, they also deal 1 [damage] to a unit adjacent to the target.", cardImage: "/assets/units-neutral-bronze-magogs.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magogs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magogs/"
    }
  },
  "neutral.demons": {
    id: "neutral.demons",
    name: "Demons",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 0, health: 8, initiative: 6, cost: { gold: 13 }, abilities: [], cardImage: "/assets/units-neutral-silver-demons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/demons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/demons/"
    }
  },
  "neutral.pit_lords": {
    id: "neutral.pit_lords",
    name: "Pit Lords",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 4, defense: 1, health: 5, initiative: 7, cost: { gold: 15 }, abilities: [], cardImage: "/assets/units-neutral-silver-pit_lords.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/pit_lords/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/pit_lords/"
    }
  },
  "neutral.arch_devils": {
    id: "neutral.arch_devils",
    name: "Arch Devils",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 5, defense: 2, health: 7, initiative: 10, cost: { gold: 23 }, abilities: [], abilityText: "[unit_attack] When attacking Archangels, this unit gains +2 [attack].", cardImage: "/assets/units-neutral-golden-arch_devils.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/arch_devils/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/arch_devils/"
    }
  },
  "neutral.efreet": {
    id: "neutral.efreet",
    name: "Efreet",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 4, defense: 2, health: 6, initiative: 13, cost: { gold: 20 }, abilities: [], abilityText: "[unit_passive] Ignores any [damage] from Magic Arrows or spells from the Fire School of Magic.", cardImage: "/assets/units-neutral-golden-efreet.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/efreet/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/efreet/"
    }
  },
  "neutral.faerie_dragons": {
    id: "neutral.faerie_dragons",
    name: "Faerie Dragons",
    faction: "neutral",
    tier: "azure",
    type: "flying",
    neutral: { attack: 5, defense: 2, health: 8, initiative: 15, cost: { gold: 35, valuables: 2 }, abilities: [], abilityText: "2 [valuables] [activation] The selected unit suffers 2 [damage]. This is a [spell] that does not count towards your spell limit.", cardImage: "/assets/units-neutral-azure-faerie_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/faerie_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/faerie_dragons/"
    }
  },
};
