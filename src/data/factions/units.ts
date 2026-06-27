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
    pack: { attack: 3, defense: 1, health: 2, initiative: 5, cost: { gold: 3 }, abilities: ["halberdier-die-ignore"], abilityText: "[unit_passive] When the unit is targeted by any attack, you can discard a card and ignore the Attack die's roll result.", cardImage: "/assets/units-castle-bronze-halberdiers-pack.webp" },
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
    few: { attack: 5, defense: 2, health: 7, initiative: 7, cost: { gold: 12 }, abilities: ["champion-stables-discount"], abilityText: "[map_effect] If your hero is on a field with Stables, this unit's reinforcement cost is reduced by 6 [gold] .", cardImage: "/assets/units-castle-golden-champions-few.webp" },
    pack: { attack: 6, defense: 2, health: 7, initiative: 9, cost: { gold: 20, valuables: 1 }, abilities: ["champion-move-reroll"], abilityText: "1 [valuables] [unit_attack] If this unit's movement ends in a space other than where it started, you may reroll an Attack die .", cardImage: "/assets/units-castle-golden-champions-pack.webp" },
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
    few: { attack: 6, defense: 3, health: 8, initiative: 12, cost: { gold: 20, valuables: 1 }, abilities: ["archangel-combat-start-draw"], abilityText: "1 [valuables] [unit_passive] When combat begins, draw 1 card.", cardImage: "/assets/units-castle-golden-archangels-few.webp" },
    pack: { attack: 7, defense: 3, health: 10, initiative: 18, cost: { gold: 30, valuables: 2 }, abilities: ["archangel-lethal-save"], abilityText: "2 [valuables] [unit_passive] Once per Combat. Cancel an attack that would reduce another unit's [health_points] to 0.", cardImage: "/assets/units-castle-golden-archangels-pack.webp" },
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
    few: { attack: 2, defense: 1, health: 3, initiative: 3, cost: { gold: 3 }, abilities: ["zombie-resilience-weak"], abilityText: "[unit_passive] If the attacker resolves a \"+1\" on Attack die , gain +1 [defense] .", cardImage: "/assets/units-necropolis-bronze-zombies-few.webp" },
    pack: { attack: 2, defense: 1, health: 3, initiative: 4, cost: { gold: 4 }, abilities: ["zombie-resilience"], abilityText: "[unit_passive] If the attacker resolves a \"0\" or a +1\" on Attack die , gain +1 [defense] .", cardImage: "/assets/units-necropolis-bronze-zombies-pack.webp" },
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
    few: { attack: 3, defense: 0, health: 3, initiative: 5, cost: { gold: 4 }, abilities: ["wraith-heal-1"], abilityText: "[activation] Remove up to 1 [damage] from this unit.", cardImage: "/assets/units-necropolis-bronze-wraiths-few.webp" },
    pack: { attack: 3, defense: 0, health: 5, initiative: 7, cost: { gold: 6 }, abilities: ["wraith-heal-1", "wraith-enemy-discard"], abilityText: "[activation] Remove up to 1 [damage] from this unit, then discard 1 random card from the enemy's hand.", cardImage: "/assets/units-necropolis-bronze-wraiths-pack.webp" },
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
    // engine: ignores-retaliation + vampire-heal-on-attack (ON_ATTACK_HEAL_SELF,
    // amount 2). The wiki Pack column reads "Ignore the Retaliation Attack. Then
    // remove up to 2 damage from this unit." — the self-heal half was previously
    // unwired (only the neutral guard carried it); both halves now run.
    pack: { attack: 5, defense: 1, health: 4, initiative: 9, cost: { gold: 12 }, abilities: ["ignores-retaliation", "vampire-heal-on-attack"], abilityText: "[unit_attack] Ignore the Retaliation Attack. Then remove up to 2 [damage] from this unit.", cardImage: "/assets/units-necropolis-silver-vampires-pack.webp" },
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
    few: { attack: 5, defense: 2, health: 7, initiative: 7, cost: { gold: 12 }, abilities: ["dread-knight-retaliation-disadvantage"], abilityText: "[unit_attack] When retaliating after this attack, the enemy rolls 2 Attack dice and resolves the lower result.", cardImage: "/assets/units-necropolis-golden-dread_knights-few.webp" },
    pack: { attack: 6, defense: 2, health: 7, initiative: 9, cost: { gold: 20, valuables: 1 }, abilities: ["dread-knight-death-blow"], abilityText: "1 [valuables] [unit_attack] If you resolve a \"0\" or a \"+1\" on the Attack die , increase this unit's total attack value by another \"+1\".", cardImage: "/assets/units-necropolis-golden-dread_knights-pack.webp" },
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
    few: { attack: 6, defense: 3, health: 8, initiative: 9, cost: { gold: 19, valuables: 1 }, abilities: ["ghost-dragon-morale-drain"], abilityText: "1 [valuables] [activation] Discard the enemy's [morale_positive] token.", cardImage: "/assets/units-necropolis-golden-ghost_dragons-few.webp" },
    pack: { attack: 7, defense: 3, health: 9, initiative: 14, cost: { gold: 32, valuables: 2 }, abilities: ["ghost-dragon-morale-drain", "ghost-dragon-attack-die"], abilityText: "2 [valuables] [activation] Discard the enemy's [morale_positive] token. [unit_attack] Add +1 to your Attack die result.", cardImage: "/assets/units-necropolis-golden-ghost_dragons-pack.webp" },
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
    pack: { attack: 3, defense: 1, health: 2, initiative: 5, cost: { gold: 3 }, abilities: ["ignore-paralysis"], abilityText: "[unit_passive] This unit ignores [paralysis] effect.", cardImage: "/assets/units-dungeon-bronze-troglodytes-pack.webp" },
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
    few: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 3 }, abilities: ["harpy-return"], abilityText: "[unit_attack] After the enemy's Retaliation Attack, this unit can return to the space from which it moved to attack.", cardImage: "/assets/units-dungeon-bronze-harpies-few.webp" },
    pack: { attack: 3, defense: 0, health: 3, initiative: 9, cost: { gold: 5 }, abilities: ["ignores-retaliation", "harpy-return"], abilityText: "[unit_attack] Ignore the Retaliation Attack. This unit can return to the space from which it moved to attack.", cardImage: "/assets/units-dungeon-bronze-harpies-pack.webp" },
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
    few: { attack: 3, defense: 1, health: 4, initiative: 5, cost: { gold: 6 }, abilities: ["medusa-paralyze-retaliation-die"], abilityText: "[unit_passive] After the Retaliation Attack, roll an Attack die , on a \"0\" the target is [paralysis] .", cardImage: "/assets/units-dungeon-silver-medusas-few.webp" },
    pack: { attack: 4, defense: 1, health: 4, initiative: 6, cost: { gold: 12 }, abilities: ["ignore-combat-penalties", "medusa-paralyze-retaliation"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units. [unit_retaliation] The target gains [paralysis] .", cardImage: "/assets/units-dungeon-silver-medusas-pack.webp" },
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
    few: { attack: 4, defense: 2, health: 4, initiative: 6, cost: { gold: 8 }, abilities: ["minotaur-draw-on-miss"], abilityText: "[unit_attack] If you resolve a \"-1\" on the Attack die , draw a card.", cardImage: "/assets/units-dungeon-silver-minotaurs-few.webp" },
    pack: { attack: 5, defense: 2, health: 4, initiative: 8, cost: { gold: 14 }, abilities: ["minotaur-draw-on-miss"], abilityText: "[unit_attack] If you resolve a \"-1\" on the Attack die , draw a card.", cardImage: "/assets/units-dungeon-silver-minotaurs-pack.webp" },
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
    pack: { attack: 5, defense: 1, health: 6, initiative: 11, cost: { gold: 18, valuables: 1 }, abilities: ["manticore-ignore-defense"], abilityText: "1 [valuables] [unit_attack] For this attack, ignore the [defense] value from the target unit's card.", cardImage: "/assets/units-dungeon-golden-manticores-pack.webp" },
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
    few: { attack: 6, defense: 3, health: 8, initiative: 11, cost: { gold: 19, valuables: 1 }, abilities: ["reduce-spell-damage-2"], abilityText: "1 [valuables] [unit_passive] Reduce [damage] taken by this unit from [spell] by 2 to a minimum of 0.", cardImage: "/assets/units-dungeon-golden-black_dragons-few.webp" },
    pack: { attack: 8, defense: 3, health: 8, initiative: 15, cost: { gold: 33, valuables: 2 }, abilities: ["immune-all-spells", "immune-specialty-damage"], abilityText: "2 [valuables] [unit_passive] Ignore any [spell] effects and [damage] from Specialty .", cardImage: "/assets/units-dungeon-golden-black_dragons-pack.webp" },
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
    few: { attack: 2, defense: 1, health: 3, initiative: 3, cost: { gold: 3 }, abilities: ["dwarf-magic-resistance"], abilityText: "[unit_passive] If this unit is targeted by any Spell or Specialty card, roll 1 Attack die. On a \"+1\" result, ignore the card's effect.", cardImage: "/assets/units-rampart-bronze-dwarves-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 5, cost: { gold: 4 }, abilities: ["dwarf-magic-resistance"], abilityText: "[unit_passive] If this unit is targeted by any Spell or Specialty card, roll 1 Attack die. On a \"+1\" result, ignore the card's effect.", cardImage: "/assets/units-rampart-bronze-dwarves-pack.webp" },
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
    pack: { attack: 4, defense: 0, health: 6, initiative: 12, cost: { gold: 10 }, abilities: ["pegasi-magic-damper"], abilityText: "[unit_passive] The [power] of all enemy spells is reduced by 1 (to a minimum of 0).", cardImage: "/assets/units-rampart-silver-pegasi-pack.webp" },
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
    pack: { attack: 4, defense: 2, health: 6, initiative: 4, cost: { gold: 15 }, abilities: ["dendroid-bind"], abilityText: "[unit_passive] Enemy units that start activation adjacent to this unit cannot move.", cardImage: "/assets/units-rampart-silver-dendroids-pack.webp" },
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
    few: { attack: 5, defense: 1, health: 8, initiative: 7, cost: { gold: 11 }, abilities: ["reduce-spell-damage-1"], abilityText: "[unit_passive] Reduce any [damage] from [spell] dealt to this unit by 1 (to a minimum of 0).", cardImage: "/assets/units-rampart-golden-unicorns-few.webp" },
    pack: { attack: 6, defense: 1, health: 8, initiative: 9, cost: { gold: 18, valuables: 1 }, abilities: ["unicorn-spell-ward-aura"], abilityText: "1 [valuables] [unit_passive] Reduce any [damage] from [spell] dealt to this and adjacent friendly unit(s) by 1 (to a minimum of 0).", cardImage: "/assets/units-rampart-golden-unicorns-pack.webp" },
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
    few: { attack: 5, defense: 3, health: 9, initiative: 10, cost: { gold: 22, valuables: 1 }, abilities: ["dragon-line-attack-2"], abilityText: "1 [valuables] [unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 2 [attack].", cardImage: "/assets/units-rampart-golden-gold_dragons-few.webp" },
    pack: { attack: 6, defense: 3, health: 10, initiative: 16, cost: { gold: 30, valuables: 2 }, abilities: ["dragon-line-attack-3"], abilityText: "2 [valuables] [unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 3 [attack].", cardImage: "/assets/units-rampart-golden-gold_dragons-pack.webp" },
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
    pack: { attack: 3, defense: 1, health: 2, initiative: 7, cost: { gold: 3 }, abilities: ["familiar-spell-tax"], abilityText: "[unit_passive] Whenever an enemy casts a [spell] from hand, they must discard 1 card from hand.", cardImage: "/assets/units-inferno-bronze-familiars-pack.webp" },
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
    few: { attack: 5, defense: 1, health: 7, initiative: 9, cost: { gold: 12 }, abilities: ["efreet-magic-arrow-immunity"], abilityText: "[unit_passive] Ignores any [damage] from Magic Arrows.", cardImage: "/assets/units-inferno-golden-efreet-few.webp" },
    pack: { attack: 6, defense: 1, health: 7, initiative: 13, cost: { gold: 18, valuables: 1 }, abilities: ["efreet-fire-immunity"], abilityText: "1 [valuables] [unit_passive] Ignores any [damage] from Magic Arrows or spells from the Fire School of Magic.", cardImage: "/assets/units-inferno-golden-efreet-pack.webp" },
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

  // ---- Stronghold expansion ----------------------------------------------
  "stronghold.goblins": {
    id: "stronghold.goblins",
    name: "Goblins",
    faction: "stronghold",
    tier: "bronze",
    type: "ground",
    few: { attack: 1, defense: 0, health: 4, initiative: 6, cost: { gold: 1 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-goblins-few.webp" },
    pack: { attack: 2, defense: 0, health: 4, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-goblins-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/goblins/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/goblins/"
    }
  },
  "stronghold.wolf_raiders": {
    id: "stronghold.wolf_raiders",
    name: "Wolf Raiders",
    faction: "stronghold",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 0, health: 3, initiative: 7, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-wolf_raiders-few.webp" },
    pack: { attack: 2, defense: 0, health: 4, initiative: 8, cost: { gold: 5 }, abilities: ["wolf-raiders-strike-twice"], abilityText: "[unit_attack] Attack this target again. The second attack happens after the target retaliates (if possible).", cardImage: "/assets/units-stronghold-bronze-wolf_raiders-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/wolf_raiders/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/wolf_raiders/"
    }
  },
  "stronghold.orcs": {
    id: "stronghold.orcs",
    name: "Orcs",
    faction: "stronghold",
    tier: "bronze",
    type: "ranged",
    few: { attack: 2, defense: 1, health: 4, initiative: 4, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-orcs-few.webp" },
    pack: { attack: 3, defense: 1, health: 5, initiative: 5, cost: { gold: 7 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-orcs-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/orcs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/orcs/"
    }
  },
  "stronghold.ogres": {
    id: "stronghold.ogres",
    name: "Ogres",
    faction: "stronghold",
    tier: "silver",
    type: "ground",
    // engine: the Attack ("Bloodlust") token is a pure BUFF, so the engine only
    // lets the Ogres drop it on a FRIENDLY ground/flying unit (targets:
    // "friendly" in ogres-attack-token-few/pack) — the mirror of the Sorceresses'
    // enemy-only Weakness token.
    few: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 6 }, abilities: ["ogres-attack-token-few"], abilityText: "[unit_other] Place a +1 [attack] token on a chosen friendly [unit_ground] or [unit_flying] unit for 2 Combat rounds.", cardImage: "/assets/units-stronghold-silver-ogres-few.webp" },
    pack: { attack: 3, defense: 2, health: 6, initiative: 5, cost: { gold: 8 }, abilities: ["ogres-attack-token-pack"], abilityText: "[unit_other] Place a +2 [attack] token on a chosen friendly [unit_ground] or [unit_flying] unit for 2 Combat rounds.", cardImage: "/assets/units-stronghold-silver-ogres-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ogres/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ogres/"
    }
  },
  "stronghold.thunderbirds": {
    id: "stronghold.thunderbirds",
    name: "Thunderbirds",
    faction: "stronghold",
    tier: "silver",
    type: "flying",
    few: { attack: 4, defense: 1, health: 5, initiative: 9, cost: { gold: 8 }, abilities: [], cardImage: "/assets/units-stronghold-silver-thunderbirds-few.webp" },
    pack: { attack: 4, defense: 1, health: 6, initiative: 11, cost: { gold: 14 }, abilities: ["thunderbirds-lightning"], abilityText: "[unit_passive] Right after this unit's attack and before any Retaliation, roll 1 Attack die, on a \"0\" or \"+1\", deal 1 [damage] to the target.", cardImage: "/assets/units-stronghold-silver-thunderbirds-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/thunderbirds/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/thunderbirds/"
    }
  },
  "stronghold.cyclopes": {
    id: "stronghold.cyclopes",
    name: "Cyclopes",
    faction: "stronghold",
    tier: "gold",
    type: "ranged",
    few: { attack: 5, defense: 0, health: 6, initiative: 6, cost: { gold: 13 }, abilities: ["cyclops-demolish"], abilityText: "[unit_other] This unit can destroy the Gate or a Wall.", cardImage: "/assets/units-stronghold-golden-cyclopes-few.webp" },
    pack: { attack: 5, defense: 1, health: 7, initiative: 8, cost: { gold: 17, valuables: 1 }, abilities: ["cyclops-demolish-full"], abilityText: "[unit_other] This unit can destroy the Gate, a Wall, or the Arrow Tower.", cardImage: "/assets/units-stronghold-golden-cyclopes-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/cyclopes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/cyclopes/"
    }
  },
  "stronghold.behemoths": {
    id: "stronghold.behemoths",
    name: "Behemoths",
    faction: "stronghold",
    tier: "gold",
    type: "ground",
    few: { attack: 6, defense: 2, health: 9, initiative: 6, cost: { gold: 19, valuables: 1 }, abilities: ["behemoth-defense-crush-few"], abilityText: "[unit_attack] Decrease the target's [defense] by 1 (to a minimum of 0).", cardImage: "/assets/units-stronghold-golden-behemoths-few.webp" },
    pack: { attack: 7, defense: 2, health: 10, initiative: 9, cost: { gold: 29, valuables: 2 }, abilities: ["behemoth-defense-crush-pack", "behemoth-corrosion"], abilityText: "[unit_attack] Decrease the target's [defense] by 2 (to a minimum of 0). After the attack, place 1 Corrosion token on the target.", cardImage: "/assets/units-stronghold-golden-behemoths-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/behemoths/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/behemoths/"
    }
  },

  // ---- Fortress expansion -------------------------------------------------
  // Few/Pack stats, costs and ability text transcribed from each unit's
  // Fortress section on the fan wiki. Card art is the wiki's Fortress card
  // faces (units-fortress-<tier>-<slug>-<side>.webp), normalised by
  // scripts/fetch-fortress-art.py. Implemented ability tags are used wherever
  // the engine supports the printed effect; the rest stay display-only text.
  "fortress.gnolls": {
    id: "fortress.gnolls",
    name: "Gnolls",
    faction: "fortress",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 3, initiative: 4, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-fortress-bronze-gnolls-few.webp" },
    pack: { attack: 2, defense: 1, health: 4, initiative: 5, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-fortress-bronze-gnolls-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gnolls/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gnolls/"
    }
  },
  "fortress.lizardmen": {
    id: "fortress.lizardmen",
    name: "Lizardmen",
    faction: "fortress",
    tier: "bronze",
    type: "ranged",
    few: { attack: 2, defense: 0, health: 3, initiative: 4, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-fortress-bronze-lizardmen-few.webp" },
    pack: { attack: 3, defense: 0, health: 3, initiative: 5, cost: { gold: 5 }, abilities: [], cardImage: "/assets/units-fortress-bronze-lizardmen-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/lizardmen/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/lizardmen/"
    }
  },
  "fortress.dragon_flies": {
    id: "fortress.dragon_flies",
    name: "Dragon Flies",
    faction: "fortress",
    tier: "bronze",
    type: "flying",
    few: { attack: 3, defense: 0, health: 3, initiative: 8, cost: { gold: 4 }, abilities: ["dragon-fly-dispel"], abilityText: "[unit_attack] Remove all [ongoing] effects played on the target by the enemy player.", cardImage: "/assets/units-fortress-bronze-dragon_flies-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 12, cost: { gold: 7 }, abilities: ["dragon-fly-dispel", "dragon-fly-retaliation-penalty"], abilityText: "[unit_attack] Remove all [ongoing] effects played on the target by the enemy player. [unit_retaliation] If the target retaliates, it suffers -1 [attack] .", cardImage: "/assets/units-fortress-bronze-dragon_flies-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dragon_flies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dragon_flies/"
    }
  },
  "fortress.basilisks": {
    id: "fortress.basilisks",
    name: "Basilisks",
    faction: "fortress",
    tier: "silver",
    type: "ground",
    few: { attack: 4, defense: 1, health: 4, initiative: 5, cost: { gold: 6 }, abilities: ["fortress-basilisk-paralysis"], abilityText: "[unit_attack] On a \"-1\" on the Attack die , the target gains [paralysis] .", cardImage: "/assets/units-fortress-silver-basilisks-few.webp" },
    pack: { attack: 4, defense: 1, health: 5, initiative: 7, cost: { gold: 9 }, abilities: ["fortress-basilisk-paralysis"], abilityText: "[unit_attack] On a \"-1\" on the Attack die , the target gains [paralysis] .", cardImage: "/assets/units-fortress-silver-basilisks-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/basilisks/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/basilisks/"
    }
  },
  "fortress.gorgons": {
    id: "fortress.gorgons",
    name: "Gorgons",
    faction: "fortress",
    tier: "silver",
    type: "ground",
    few: { attack: 4, defense: 2, health: 5, initiative: 5, cost: { gold: 9 }, abilities: [], cardImage: "/assets/units-fortress-silver-gorgons-few.webp" },
    pack: { attack: 5, defense: 2, health: 5, initiative: 6, cost: { gold: 14 }, abilities: ["fortress-gorgon-death-stare"], abilityText: "[unit_attack] After the attack, roll 2 Attack dice . On a double \"0\", reduce the target's [health_points] to 0.", cardImage: "/assets/units-fortress-silver-gorgons-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gorgons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gorgons/"
    }
  },
  "fortress.wyverns": {
    id: "fortress.wyverns",
    name: "Wyverns",
    faction: "fortress",
    tier: "gold",
    type: "flying",
    few: { attack: 5, defense: 1, health: 8, initiative: 7, cost: { gold: 12 }, abilities: ["wyvern-poison-cube-few"], abilityText: "[unit_attack] Place 1 faction cube on the target. At the beginning of its every activation, remove it to inflict 1 [damage] .", cardImage: "/assets/units-fortress-golden-wyverns-few.webp" },
    pack: { attack: 6, defense: 1, health: 8, initiative: 11, cost: { gold: 18, valuables: 1 }, abilities: ["wyvern-poison-cube-pack"], abilityText: "[unit_attack] Place 2 faction cubes on the target. At the beginning of its every activation, remove 1 of them to inflict 1 [damage] .", cardImage: "/assets/units-fortress-golden-wyverns-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/wyverns/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/wyverns/"
    }
  },
  "fortress.hydras": {
    id: "fortress.hydras",
    name: "Hydras",
    faction: "fortress",
    tier: "gold",
    type: "ground",
    few: { attack: 6, defense: 3, health: 8, initiative: 5, cost: { gold: 20, valuables: 1 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack.", cardImage: "/assets/units-fortress-golden-hydras-few.webp" },
    pack: { attack: 7, defense: 3, health: 10, initiative: 7, cost: { gold: 28, valuables: 2 }, abilities: ["ignores-retaliation", "hydra-multi-attack"], abilityText: "[unit_attack] Ignore the Retaliation Attack. This unit attacks up to 2 adjacent enemy units.", cardImage: "/assets/units-fortress-golden-hydras-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/hydras/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/hydras/"
    }
  },
  // ---- Tower expansion ---------------------------------------------------
  // Stats, costs and ability text transcribed from the fan wiki Tower town
  // page and each unit page (https://en.homm3bg.wiki/towns/tower/). Gremlins
  // and Titans change type when reinforced (Few = ground, Pack = ranged), so
  // their Pack side carries a per-side `type` override.
  "tower.gremlins": {
    id: "tower.gremlins",
    name: "Gremlins",
    faction: "tower",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 0 }, abilities: [], cardImage: "/assets/units-tower-bronze-gremlins-few.webp" },
    pack: { attack: 2, defense: 0, health: 2, initiative: 5, cost: { gold: 2 }, abilities: [], type: "ranged", cardImage: "/assets/units-tower-bronze-gremlins-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gremlins/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gremlins/"
    }
  },
  "tower.gargoyles": {
    id: "tower.gargoyles",
    name: "Gargoyles",
    faction: "tower",
    tier: "bronze",
    type: "flying",
    few: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 3 }, abilities: ["gargoyle-spell-ward"], abilityText: "[unit_passive] This unit ignores any [ongoing] Spell effects.", cardImage: "/assets/units-tower-bronze-gargoyles-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 9, cost: { gold: 4 }, abilities: ["gargoyle-spell-ward"], abilityText: "[unit_passive] This unit ignores any [ongoing] Spell effects.", cardImage: "/assets/units-tower-bronze-gargoyles-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gargoyles/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gargoyles/"
    }
  },
  "tower.iron_golems": {
    id: "tower.iron_golems",
    name: "Iron Golems",
    faction: "tower",
    tier: "bronze",
    type: "ground",
    few: { attack: 3, defense: 1, health: 3, initiative: 4, cost: { gold: 4 }, abilities: ["reduce-spell-damage-1"], abilityText: "[unit_passive] This unit reduces any [damage] it takes from spells by 1 — to a minimum of 0.", cardImage: "/assets/units-tower-bronze-iron_golems-few.webp" },
    pack: { attack: 3, defense: 2, health: 3, initiative: 5, cost: { gold: 7 }, abilities: ["reduce-spell-damage-2"], abilityText: "[unit_passive] This unit reduces any [damage] it takes from spells by 2 — to a minimum of 0.", cardImage: "/assets/units-tower-bronze-iron_golems-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/iron_golems/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/iron_golems/"
    }
  },
  "tower.magi": {
    id: "tower.magi",
    name: "Magi",
    faction: "tower",
    tier: "silver",
    type: "ranged",
    few: { attack: 3, defense: 0, health: 4, initiative: 5, cost: { gold: 6 }, abilities: ["ignore-all-combat-penalties"], abilityText: "[unit_attack] Ignore combat penalties.", cardImage: "/assets/units-tower-silver-magi-few.webp" },
    pack: { attack: 4, defense: 1, health: 4, initiative: 6, cost: { gold: 11 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost"], abilityText: "[unit_attack] Ignore combat penalties. [activation] Add +1 [power] to the first spell you cast this round.", cardImage: "/assets/units-tower-silver-magi-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magi/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magi/"
    }
  },
  "tower.genies": {
    id: "tower.genies",
    name: "Genies",
    faction: "tower",
    tier: "silver",
    type: "flying",
    few: { attack: 3, defense: 1, health: 6, initiative: 7, cost: { gold: 8 }, abilities: ["genie-spell-draw-few"], abilityText: "[unit_other] Discard 3 cards from your deck and take a [spell] discarded this way to your hand.", cardImage: "/assets/units-tower-silver-genies-few.webp" },
    pack: { attack: 4, defense: 1, health: 6, initiative: 8, cost: { gold: 12 }, abilities: ["genie-spell-draw-pack"], abilityText: "[unit_attack] Discard up to 3 cards from your deck and take a [spell] discarded this way to your hand.", cardImage: "/assets/units-tower-silver-genies-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/genies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/genies/"
    }
  },
  "tower.nagas": {
    id: "tower.nagas",
    name: "Nagas",
    faction: "tower",
    tier: "gold",
    type: "ground",
    few: { attack: 5, defense: 2, health: 7, initiative: 6, cost: { gold: 13 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore Retaliation Attacks.", cardImage: "/assets/units-tower-golden-nagas-few.webp" },
    pack: { attack: 6, defense: 2, health: 7, initiative: 8, cost: { gold: 18, valuables: 1 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore Retaliation Attacks.", cardImage: "/assets/units-tower-golden-nagas-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/nagas/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/nagas/"
    }
  },
  "tower.titans": {
    id: "tower.titans",
    name: "Titans",
    faction: "tower",
    tier: "gold",
    type: "ground",
    few: { attack: 6, defense: 3, health: 8, initiative: 7, cost: { gold: 18, valuables: 1 }, abilities: ["titan-ignore-ongoing"], abilityText: "[unit_passive] Ignore any [ongoing] effects on this unit.", cardImage: "/assets/units-tower-golden-titans-few.webp" },
    pack: { attack: 6, defense: 3, health: 8, initiative: 11, cost: { gold: 32, valuables: 2 }, abilities: ["ignore-combat-penalties", "titan-ignore-ongoing"], type: "ranged", abilityText: "[unit_passive] Ignore any [ongoing] effects on this unit and combat penalties against adjacent units.", cardImage: "/assets/units-tower-golden-titans-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/titans/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Stats from the fan wiki Tower town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/titans/"
    }
  },

  // ---- Conflux (expansion) -----------------------------------------------
  // Seven recruitable Conflux units. Each card is named for its Pack (upgrade)
  // side; the Few side is the base creature. Elementals carry the engine's
  // already-wired elemental passives (immune to Magic Arrow + their school,
  // deal elemental damage) and, on their Pack side, the new school-scoped
  // "+1 power to your first <school> spell this Activation" boost. Stats/costs
  // and ability text transcribed from the fan wiki Conflux unit pages; the wiki
  // has no printed card scans yet, so every side uses the blank tier frame.
  "conflux.sprites": {
    id: "conflux.sprites",
    name: "Sprites",
    faction: "conflux",
    tier: "bronze",
    type: "flying",
    few: { attack: 2, defense: 0, health: 2, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-conflux-bronze-sprites-few.webp" },
    pack: { attack: 2, defense: 0, health: 4, initiative: 9, cost: { gold: 4 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack.", cardImage: "/assets/units-conflux-bronze-sprites-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sprites/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sprites/"
    }
  },
  "conflux.storm_elementals": {
    id: "conflux.storm_elementals",
    name: "Storm Elementals",
    faction: "conflux",
    tier: "bronze",
    type: "ground",
    // Per the verbatim wiki card the FACTION (recruitable) elemental Few has no
    // abilities and the Pack only the spell-power activation — the Magic-Arrow /
    // school immunity + "deals elemental damage" belong to the NEUTRAL guard
    // (neutral.storm_elementals) card alone, NOT to the Conflux Few/Pack.
    few: { attack: 2, defense: 0, health: 3, initiative: 7, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-conflux-bronze-storm_elementals-few.webp" },
    pack: { attack: 2, defense: 0, health: 5, initiative: 8, cost: { gold: 5 }, abilities: ["storm-elemental-air-power"], type: "ranged", abilityText: "[activation] Add +1 [power] to the first Air Magic spell you cast during this Activation.", cardImage: "/assets/units-conflux-bronze-storm_elementals-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/storm_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/storm_elementals/"
    }
  },
  "conflux.ice_elementals": {
    id: "conflux.ice_elementals",
    name: "Ice Elementals",
    faction: "conflux",
    tier: "bronze",
    type: "ground",
    // Faction Few/Pack carry no immunity / elemental damage (neutral guard only).
    few: { attack: 2, defense: 1, health: 4, initiative: 5, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-conflux-bronze-ice_elementals-few.webp" },
    pack: { attack: 3, defense: 1, health: 5, initiative: 6, cost: { gold: 7 }, abilities: ["ice-elemental-water-power"], type: "ranged", abilityText: "[activation] Add +1 [power] to the first Water Magic spell you cast during this Activation.", cardImage: "/assets/units-conflux-bronze-ice_elementals-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ice_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ice_elementals/"
    }
  },
  "conflux.energy_elementals": {
    id: "conflux.energy_elementals",
    name: "Energy Elementals",
    faction: "conflux",
    tier: "silver",
    type: "ground",
    // Faction Few/Pack carry no immunity / elemental damage (neutral guard only).
    few: { attack: 3, defense: 1, health: 5, initiative: 5, cost: { gold: 6 }, abilities: [], cardImage: "/assets/units-conflux-silver-energy_elementals-few.webp" },
    pack: { attack: 4, defense: 1, health: 5, initiative: 8, cost: { gold: 8 }, abilities: ["energy-elemental-fire-power"], type: "flying", abilityText: "[activation] Add +1 [power] to the first Fire Magic spell you cast during this Activation.", cardImage: "/assets/units-conflux-silver-energy_elementals-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/energy_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/energy_elementals/"
    }
  },
  "conflux.magma_elementals": {
    id: "conflux.magma_elementals",
    name: "Magma Elementals",
    faction: "conflux",
    tier: "silver",
    type: "ground",
    // Faction Few/Pack carry no immunity / elemental damage (neutral guard only).
    few: { attack: 4, defense: 2, health: 5, initiative: 4, cost: { gold: 9 }, abilities: [], cardImage: "/assets/units-conflux-silver-magma_elementals-few.webp" },
    pack: { attack: 5, defense: 2, health: 5, initiative: 6, cost: { gold: 13 }, abilities: ["magma-elemental-earth-power"], abilityText: "[activation] Add +1 [power] to the first Earth Magic spell you cast during this Activation.", cardImage: "/assets/units-conflux-silver-magma_elementals-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magma_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magma_elementals/"
    }
  },
  "conflux.magic_elementals": {
    id: "conflux.magic_elementals",
    name: "Magic Elementals",
    faction: "conflux",
    tier: "gold",
    type: "ground",
    // engine (Few): ignores-retaliation + "Attack all adjacent units" (a full
    // separate follow-up attack on every other adjacent unit, friend or foe —
    // `magic-elemental-attack-all`). The wiki card carries nothing else on the
    // Few side (no immunity, no elemental damage).
    few: { attack: 4, defense: 2, health: 7, initiative: 7, cost: { gold: 13 }, abilities: ["ignores-retaliation", "magic-elemental-attack-all"], abilityText: "[unit_attack] Ignore the Retaliation Attack. Attack all adjacent units.", cardImage: "/assets/units-conflux-golden-magic_elementals-few.webp" },
    // engine (Pack): ignores-retaliation + "Attack all adjacent enemy units"
    // (`magic-elemental-attack-all-enemies`) + "Ignore any spell effects"
    // (`immune-all-spells`, which also covers Magic Arrows) + "damage from
    // Specialty" (`immune-specialty-damage`). The wiki card has NO separate
    // Magic-Arrow line and does NOT deal elemental damage.
    pack: { attack: 5, defense: 2, health: 7, initiative: 9, cost: { gold: 19, valuables: 1 }, abilities: ["ignores-retaliation", "magic-elemental-attack-all-enemies", "immune-all-spells", "immune-specialty-damage"], abilityText: "[unit_attack] Ignore the Retaliation Attack. Attack all adjacent enemy units. [unit_passive] Ignore any [spell] effects and [damage] from Specialty.", cardImage: "/assets/units-conflux-golden-magic_elementals-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magic_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magic_elementals/"
    }
  },
  "conflux.phoenixes": {
    id: "conflux.phoenixes",
    name: "Phoenixes",
    faction: "conflux",
    tier: "gold",
    type: "flying",
    few: { attack: 6, defense: 2, health: 7, initiative: 12, cost: { gold: 21, valuables: 1 }, abilities: ["phoenix-rebirth", "phoenix-fire-immunity"], abilityText: "[unit_passive] Once per Combat, when this unit's [health_points] drops to 0, set it to 1 instead. Immune to Fire Magic spells.", cardImage: "/assets/units-conflux-golden-phoenixes-few.webp" },
    // HOUSE RULE: the Pack side also carries Rebirth, so BOTH sides cling to
    // life at 1 Health once per combat (engine: `phoenix-rebirth`, fired before
    // the Pack→Few flip so a Pack Phoenix survives at its Pack side).
    pack: { attack: 7, defense: 2, health: 8, initiative: 18, cost: { gold: 29, valuables: 2 }, abilities: ["dragon-line-attack-2", "phoenix-fire-immunity", "phoenix-rebirth"], abilityText: "[unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 2 [attack]. [unit_passive] Immune to Fire Magic spells. [unit_passive] Once per Combat, when this unit's [health_points] drops to 0, set it to 1 instead.", cardImage: "/assets/units-conflux-golden-phoenixes-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/phoenixes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Stats from the fan wiki Conflux town and unit pages. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/phoenixes/"
    }
  },

  // ---- Cove (expansion) --------------------------------------------------
  // Stats and ability text transcribed from the fan wiki Cove town page and
  // each unit page (https://en.homm3bg.wiki/towns/cove/). The fan wiki still has
  // no individual Cove card art, so each Few/Pack face is cropped from the
  // official Gamefound Cove reveal composite (scripts/fetch-cove-unit-art.py).
  // Four Cove-specific mechanics are engine-wired and covered in
  // cove-unit-abilities.test.ts: Seamen "Plunder" (gain gold on a kill), Ayssids
  // "Killer Instinct" (a kill lets them pounce on another adjacent unit), Nix
  // "Hardened Shell" (per-attack damage cap) and Haspids "Vengeance" (+2 Attack
  // once flipped down). The remaining tags reuse already-implemented abilities:
  // Oceanids Pack = full Spell immunity (immune-all-spells), Sea Dogs = no
  // adjacent penalty / no retaliation, Sorceresses = the Weakness-token abilities
  // shared with the rulebook Sorceress, Haspids Pack = the Wyvern poison cubes.
  "cove.oceanids": {
    id: "cove.oceanids",
    name: "Oceanids",
    faction: "cove",
    tier: "bronze",
    type: "flying",
    few: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-cove-bronze-oceanids-few.webp" },
    // engine: immune-all-spells (IMMUNE_TO_SPELL_SCHOOLS, every school) faithfully
    // realises "ignore all effects and damage from spells".
    pack: { attack: 3, defense: 0, health: 3, initiative: 8, cost: { gold: 3 }, abilities: ["immune-all-spells"], abilityText: "[unit_passive] Ignore all effects and [damage] from [spell].", cardImage: "/assets/units-cove-bronze-oceanids-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/oceanids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/oceanids/"
    }
  },
  "cove.seamen": {
    id: "cove.seamen",
    name: "Seamen",
    faction: "cove",
    tier: "bronze",
    type: "ground",
    few: { attack: 2, defense: 1, health: 3, initiative: 5, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-cove-bronze-seamen-few.webp" },
    pack: { attack: 2, defense: 1, health: 5, initiative: 6, cost: { gold: 5 }, abilities: ["seamen-plunder"], abilityText: "[unit_passive] Once per Combat, when this unit removes a unit from Combat, gain 2 [gold].", cardImage: "/assets/units-cove-bronze-seamen-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/seamen/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/seamen/"
    }
  },
  "cove.sea_dogs": {
    id: "cove.sea_dogs",
    name: "Sea Dogs",
    faction: "cove",
    tier: "bronze",
    type: "ranged",
    few: { attack: 2, defense: 0, health: 4, initiative: 6, cost: { gold: 4 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-cove-bronze-sea_dogs-few.webp" },
    pack: { attack: 3, defense: 0, health: 5, initiative: 8, cost: { gold: 6 }, abilities: ["ignores-retaliation", "ignore-combat-penalties"], abilityText: "[unit_attack] Ignores Retaliation Attacks. [unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-cove-bronze-sea_dogs-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sea_dogs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sea_dogs/"
    }
  },
  "cove.ayssids": {
    id: "cove.ayssids",
    name: "Ayssids",
    faction: "cove",
    tier: "silver",
    type: "flying",
    few: { attack: 3, defense: 1, health: 5, initiative: 9, cost: { gold: 6 }, abilities: [], cardImage: "/assets/units-cove-silver-ayssids-few.webp" },
    pack: { attack: 3, defense: 1, health: 6, initiative: 11, cost: { gold: 10 }, abilities: ["ayssid-pounce"], abilityText: "[unit_attack] If the target is reduced to 0 [health_points], after resolving the [unit_retaliation] (if applicable), the Ayssids can attack another adjacent unit.", cardImage: "/assets/units-cove-silver-ayssids-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ayssids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ayssids/"
    }
  },
  "cove.sorceresses": {
    id: "cove.sorceresses",
    name: "Sorceresses",
    faction: "cove",
    tier: "silver",
    type: "ranged",
    // engine: sorceress-weakness-few restricts the Weakness token to an ENEMY
    // unit (house rule — a debuff is never placed on your own side). The wiki
    // card prints "on any one unit"; the engine narrows it to enemies.
    few: { attack: 3, defense: 1, health: 5, initiative: 6, cost: { gold: 8 }, abilities: ["sorceress-weakness-few"], abilityText: "[unit_other] Place a \"-2\" Weakness token on a chosen enemy unit for 2 Combat rounds.", cardImage: "/assets/units-cove-silver-sorceresses-few.webp" },
    pack: { attack: 4, defense: 1, health: 6, initiative: 7, cost: { gold: 13 }, abilities: ["sorceress-weakness-on-attack"], abilityText: "[unit_attack] After the attack, place a \"-1\" Weakness token on the target for 2 Combat rounds.", cardImage: "/assets/units-cove-silver-sorceresses-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sorceresses/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sorceresses/"
    }
  },
  "cove.nix": {
    id: "cove.nix",
    name: "Nix",
    faction: "cove",
    tier: "gold",
    type: "ground",
    few: { attack: 5, defense: 2, health: 7, initiative: 6, cost: { gold: 12 }, abilities: [], cardImage: "/assets/units-cove-golden-nix-few.webp" },
    pack: { attack: 6, defense: 2, health: 8, initiative: 7, cost: { gold: 20, valuables: 1 }, abilities: ["nix-damage-cap"], abilityText: "[unit_passive] This unit cannot take more than 4 [damage] from a single attack.", cardImage: "/assets/units-cove-golden-nix-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/nix/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/nix/"
    }
  },
  "cove.haspids": {
    id: "cove.haspids",
    name: "Haspids",
    faction: "cove",
    tier: "gold",
    type: "ground",
    few: { attack: 5, defense: 3, health: 8, initiative: 9, cost: { gold: 18, valuables: 1 }, abilities: ["haspid-vengeance"], abilityText: "[unit_attack] +2 attack if, during this Combat, this unit was flipped from the Pack to the Few side.", cardImage: "/assets/units-cove-golden-haspids-few.webp" },
    // engine: wyvern-poison-cube-pack (ON_ATTACK_POISON_CUBES, 2 cubes) is the
    // same mechanic as the printed "2 faction cubes, 1 damage per activation".
    pack: { attack: 7, defense: 3, health: 8, initiative: 12, cost: { gold: 30, valuables: 2 }, abilities: ["wyvern-poison-cube-pack"], abilityText: "[unit_attack] Place 2 faction cubes on the target. At the beginning of its every activation, remove 1 of them to inflict 1 [damage].", cardImage: "/assets/units-cove-golden-haspids-pack.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/haspids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Stats and ability text from the fan wiki Cove town and unit pages; unit art not on the wiki yet (blank placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/haspids/"
    }
  },

  // ==== Bulwark faction units (expansion) ================================
  // Fan-faction roster (heroes.thelazy.net/Bulwark) rescaled to the board
  // game's stat band (calibrated against Tower/Cove). The `abilities` array is
  // the COMPLETE list of engine-wired effects for each side; `abilityText` is
  // display flavour. Card art is the creature's wiki portrait composed onto a
  // card canvas by scripts/fetch-bulwark-art.py (placeholder; replace before
  // any wider release).
  "bulwark.kobolds": {
    id: "bulwark.kobolds",
    name: "Kobolds",
    faction: "bulwark",
    tier: "bronze",
    type: "ground",
    // engine: the gold income is the Pack (Kobold Foreman) ONLY; the Few (Kobold)
    // has no wired ability and intentionally carries no abilityText, so it stays a
    // true no-op rather than a decorative gold-income claim.
    few: { attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 0 }, abilities: [], cardImage: "/assets/units-bulwark-bronze-kobolds-few.webp" },
    pack: { attack: 2, defense: 1, health: 3, initiative: 5, cost: { gold: 2 }, abilities: ["bulwark-kobold-gold"], abilityText: "[map] At the beginning of each Resource round, gain 1 [gold] (Kobold Foreman).", cardImage: "/assets/units-bulwark-bronze-kobolds-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Kobold",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },
  "bulwark.mountain_rams": {
    id: "bulwark.mountain_rams",
    name: "Mountain Rams",
    faction: "bulwark",
    tier: "bronze",
    type: "ground",
    // engine: Few (Mountain Ram) has no wired ability; Pack (Argali) carries the
    // magic-resistance translation only (reduce-spell-damage-1).
    few: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-bulwark-bronze-mountain_rams-few.webp" },
    pack: { attack: 2, defense: 1, health: 4, initiative: 8, cost: { gold: 4 }, abilities: ["reduce-spell-damage-1"], abilityText: "[unit_passive] Reduce any [damage] from [spell] by 1 (Argali).", cardImage: "/assets/units-bulwark-bronze-mountain_rams-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Mountain_Ram",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },
  "bulwark.snow_elves": {
    id: "bulwark.snow_elves",
    name: "Snow Elves",
    faction: "bulwark",
    tier: "bronze",
    type: "ranged",
    // engine: Both sides ignore the melee penalty (ignore-combat-penalties). The
    // Pack (Steel Elf) additionally provokes NO enemy Retaliation on its attacks
    // (ignores-retaliation).
    few: { attack: 3, defense: 0, health: 3, initiative: 4, cost: { gold: 3 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] No combat penalty for attacking an adjacent unit.", cardImage: "/assets/units-bulwark-bronze-snow_elves-few.webp" },
    pack: { attack: 3, defense: 1, health: 3, initiative: 5, cost: { gold: 5 }, abilities: ["ignore-combat-penalties", "ignores-retaliation"], abilityText: "[unit_passive] No combat penalty for attacking an adjacent unit. [unit_attack] This unit's attacks provoke no Retaliation Attack (Steel Elf).", cardImage: "/assets/units-bulwark-bronze-snow_elves-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Snow_Elf",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },
  "bulwark.yetis": {
    id: "bulwark.yetis",
    name: "Yetis",
    faction: "bulwark",
    tier: "silver",
    type: "ground",
    // engine: Few (Yeti) has no wired ability; Pack (Yeti Runemaster) keeps Recovery.
    few: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 6 }, abilities: [], cardImage: "/assets/units-bulwark-silver-yetis-few.webp" },
    pack: { attack: 3, defense: 2, health: 5, initiative: 7, cost: { gold: 10 }, abilities: ["bulwark-yeti-recover"], abilityText: "[unit_passive] At the start of its activation, this unit recovers from all negative effects.", cardImage: "/assets/units-bulwark-silver-yetis-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Yeti",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },
  "bulwark.shamans": {
    id: "bulwark.shamans",
    name: "Shamans",
    faction: "bulwark",
    tier: "silver",
    type: "ranged",
    // engine: Few carries Air Shield only; Pack (Great Shaman) adds Freezing Shot.
    few: { attack: 3, defense: 0, health: 5, initiative: 5, cost: { gold: 7 }, abilities: ["bulwark-air-shield"], abilityText: "[unit_passive] +1 Defense against ranged attackers (Air Shield).", cardImage: "/assets/units-bulwark-silver-shamans-few.webp" },
    pack: { attack: 3, defense: 1, health: 6, initiative: 6, cost: { gold: 11 }, abilities: ["bulwark-air-shield", "bulwark-freezing-shot"], abilityText: "[unit_passive] +1 Defense against ranged attackers (Air Shield). [unit_attack] After the attack, reduce the target's Initiative by 2 next round (Freezing Shot).", cardImage: "/assets/units-bulwark-silver-shamans-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Shaman_(Bulwark)",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },
  "bulwark.mammoths": {
    id: "bulwark.mammoths",
    name: "Mammoths",
    faction: "bulwark",
    tier: "gold",
    type: "ground",
    // engine: Few (Mammoth) has no wired ability; Pack (War Mammoth) adds Thick Hide.
    few: { attack: 5, defense: 2, health: 7, initiative: 5, cost: { gold: 12 }, abilities: [], cardImage: "/assets/units-bulwark-golden-mammoths-few.webp" },
    pack: { attack: 5, defense: 2, health: 8, initiative: 6, cost: { gold: 20, valuables: 1 }, abilities: ["bulwark-thick-hide"], abilityText: "[unit_passive] +1 Defense while this unit is defending (War Mammoth).", cardImage: "/assets/units-bulwark-golden-mammoths-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Mammoth",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },
  "bulwark.jotunns": {
    id: "bulwark.jotunns",
    name: "Jotunns",
    faction: "bulwark",
    tier: "gold",
    type: "ground",
    // engine: only the Pack (Jotunn Warlord) carries the Teleport ability
    // (bulwark-jotunn-teleport); the Few (Jotunn) has no wired ability. House
    // rule (per the owner): at the START of its activation the Warlord may
    // teleport one of its OTHER OWN units — a friendly unit, NEVER itself and
    // NEVER an enemy — to an empty space like the Teleport Spell, optionally, and
    // still act normally afterwards. The printed enemy-flying-slow rider is NOT wired.
    few: { attack: 5, defense: 3, health: 8, initiative: 6, cost: { gold: 18, valuables: 1 }, abilities: [], cardImage: "/assets/units-bulwark-golden-jotunns-few.webp" },
    pack: { attack: 6, defense: 3, health: 9, initiative: 8, cost: { gold: 32, valuables: 2 }, abilities: ["bulwark-jotunn-teleport"], abilityText: "[activation] At the start of its activation, this unit may teleport one of your other units to an empty space, then act as normal (Teleport).", cardImage: "/assets/units-bulwark-golden-jotunns-pack.webp" },
    wikiUrl: "https://heroes.thelazy.net/index.php/Jotunn",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction stats/abilities from heroes.thelazy.net/Bulwark, rescaled to the board game; placeholder art. Verify before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    }
  },

  // ---- Cove neutral guards (expansion) ----------------------------------
  // The single-sided Neutral Unit card the wiki prints for each Cove creature
  // (https://en.homm3bg.wiki/units/<slug>/, "Neutral" column). Auto-joins its
  // tier's Neutral Units deck and Cove's faction counterparts (name+tier match
  // in neutralUnitIdsByTier / neutralCounterpartId). Stats and ability text are
  // the wiki's Neutral column verbatim — distinct from Few/Pack, so two carry a
  // DIFFERENT engine effect from the faction sides: the Nix guard caps a hit at
  // 5 (nix-damage-cap-neutral), not the Pack's 4, and the Haspid guard plants 1
  // poison cube (wyvern-poison-cube-few), not the Pack's 2. The others reuse the
  // already-implemented faction tags (immune-all-spells, ignore-combat-penalties,
  // ayssid-pounce, sorceress-weakness-on-attack). The Seamen guard has NO ability.
  // Card art is the faction Few-side crop (no separate Neutral art exists).
  "neutral.oceanids": {
    id: "neutral.oceanids",
    name: "Oceanids",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 3 }, abilities: ["immune-all-spells"], abilityText: "[unit_passive] Ignore all effects and [damage] from [spell].", cardImage: "/assets/units-cove-bronze-oceanids-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/oceanids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats and ability text from the fan wiki Cove unit page; card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/oceanids/"
    }
  },
  "neutral.seamen": {
    id: "neutral.seamen",
    name: "Seamen",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    // engine: no ability (the wiki Neutral column prints a dash).
    neutral: { attack: 2, defense: 1, health: 3, initiative: 5, cost: { gold: 5 }, abilities: [], cardImage: "/assets/units-cove-bronze-seamen-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/seamen/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats from the fan wiki Cove unit page (no ability); card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/seamen/"
    }
  },
  "neutral.sea_dogs": {
    id: "neutral.sea_dogs",
    name: "Sea Dogs",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 6, cost: { gold: 7 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-cove-bronze-sea_dogs-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sea_dogs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats and ability text from the fan wiki Cove unit page; card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sea_dogs/"
    }
  },
  "neutral.ayssids": {
    id: "neutral.ayssids",
    name: "Ayssids",
    faction: "neutral",
    tier: "silver",
    type: "flying",
    neutral: { attack: 3, defense: 1, health: 5, initiative: 9, cost: { gold: 9 }, abilities: ["ayssid-pounce"], abilityText: "[unit_attack] If the target is reduced to 0 [health_points], after resolving the [unit_retaliation] (if applicable), the Ayssids can attack another adjacent unit.", cardImage: "/assets/units-cove-silver-ayssids-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ayssids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats and ability text from the fan wiki Cove unit page; card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ayssids/"
    }
  },
  "neutral.sorceresses": {
    id: "neutral.sorceresses",
    name: "Sorceresses",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: { attack: 3, defense: 1, health: 5, initiative: 6, cost: { gold: 13 }, abilities: ["sorceress-weakness-on-attack"], abilityText: "[unit_attack] After the attack, place a \"-1\" Weakness token on the target for 2 Combat rounds.", cardImage: "/assets/units-cove-silver-sorceresses-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sorceresses/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats and ability text from the fan wiki Cove unit page; card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sorceresses/"
    }
  },
  "neutral.nix": {
    id: "neutral.nix",
    name: "Nix",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    // engine: nix-damage-cap-neutral caps a single attack at 5 (the Pack's is 4).
    neutral: { attack: 5, defense: 1, health: 7, initiative: 6, cost: { gold: 20 }, abilities: ["nix-damage-cap-neutral"], abilityText: "[unit_passive] This unit cannot take more than 5 [damage] from a single attack.", cardImage: "/assets/units-cove-golden-nix-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/nix/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats and ability text from the fan wiki Cove unit page; card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/nix/"
    }
  },
  "neutral.haspids": {
    id: "neutral.haspids",
    name: "Haspids",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    // engine: wyvern-poison-cube-few plants 1 cube (the Pack's wyvern-poison-cube-pack plants 2).
    neutral: { attack: 5, defense: 2, health: 6, initiative: 9, cost: { gold: 25 }, abilities: ["wyvern-poison-cube-few"], abilityText: "[unit_attack] Place 1 faction cube on the target. At the beginning of its every activation, remove it to inflict 1 [damage].", cardImage: "/assets/units-cove-golden-haspids-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/haspids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Neutral-column stats and ability text from the fan wiki Cove unit page; card art cropped from the official Gamefound Cove reveal (Few-side placeholder). Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/haspids/"
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
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 6 }, abilities: ["ignore-combat-penalties"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units.", cardImage: "/assets/units-dungeon-bronze-evil_eyes-few.webp" },
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
    neutral: { attack: 2, defense: 0, health: 4, initiative: 4, cost: { gold: 4 }, abilities: ["halberdier-defense-aura"], abilityText: "[unit_passive] Treat allied adjacent units as if they had a Defense token.", cardImage: "/assets/units-neutral-bronze-halberdiers.webp" },
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
    neutral: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["attack-roll-advantage", "ignore-all-combat-penalties"], abilityText: "[unit_attack] Roll 2 Attack dice and resolve the higher one. Ignore combat penalties.", cardImage: "/assets/units-neutral-bronze-halflings.webp" },
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
    neutral: { attack: 2, defense: 0, health: 4, initiative: 8, cost: { gold: 5 }, abilities: ["ignores-retaliation", "harpy-return"], abilityText: "[unit_attack] Ignore the Retaliation Attack. This unit can return to the space from which it moved to attack.", cardImage: "/assets/units-neutral-bronze-harpies.webp" },
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
    neutral: { attack: 1, defense: 0, health: 2, initiative: 3, cost: { gold: 3 }, abilities: ["peasant-gold-income"], abilityText: "[map_effect] At the beginning of each Resource round, gain 3 [gold].", cardImage: "/assets/units-neutral-bronze-peasants.webp" },
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
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["rogue-deck-peek"], abilityText: "[map_effect] Once during your turn, look at the top card from any deck, then put it back on the top or on the bottom of that deck.", cardImage: "/assets/units-neutral-bronze-rogues.webp" },
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
    // engine: the "after defeating Skeletons … Reinforce 1 bronze unit" reward is
    // NOT a combat ability tag — it is wired through a dedicated win path:
    // combat-units.ts sets `combat.skeletonGuardDefeated` when a non-bank
    // neutral.skeletons guard is destroyed, and adventure-reducer's
    // openSkeletonReinforceChoice offers the attacker's Necropolis hero a free
    // Few→Pack flip (covered by necromancy.test.ts / neutral-abilities-batch2).
    // `abilities: []` is therefore correct; this is not a decorative stub.
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
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: ["ignore-paralysis"], abilityText: "[unit_passive] This unit ignores [paralysis] effects.", cardImage: "/assets/units-neutral-bronze-troglodytes.webp" },
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
    neutral: { attack: 2, defense: 0, health: 4, initiative: 7, cost: { gold: 7 }, abilities: ["wraith-heal-2"], abilityText: "[activation] Remove up to 2 [damage] from this unit.", cardImage: "/assets/units-neutral-bronze-wraiths.webp" },
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
    neutral: { attack: 2, defense: 0, health: 4, initiative: 3, cost: { gold: 5 }, abilities: ["zombie-resilience"], abilityText: "[unit_passive] If the attacker resolves a \"0\" or a \"+1\" on an Attack die , gain +1 [defense]", cardImage: "/assets/units-neutral-bronze-zombies.webp" },
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
    neutral: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 11 }, abilities: ["attack-roll-advantage"], abilityText: "[unit_passive] During any attack, roll 2 Attack dice and resolve the higher outcome.", cardImage: "/assets/units-neutral-silver-crusaders.webp" },
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
    neutral: { attack: 3, defense: 1, health: 4, initiative: 6, cost: { gold: 11 }, abilities: ["ignore-combat-penalties", "medusa-paralyze-retaliation"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units. [unit_retaliation] The target is [paralysis] .", cardImage: "/assets/units-neutral-silver-medusas.webp" },
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
    neutral: { attack: 3, defense: 2, health: 4, initiative: 7, cost: { gold: 11 }, abilities: ["minotaur-reroll"], abilityText: "[unit_attack] Reroll this unit's \"-1\" outcome on the Attack die .", cardImage: "/assets/units-neutral-silver-minotaurs.webp" },
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
    neutral: { attack: 3, defense: 1, health: 4, initiative: 5, cost: { gold: 8 }, abilities: ["mummy-ignore-own-die", "mummy-force-attacker-die"], abilityText: "[unit_attack] Ignore the result on the Attack die . [unit_passive] Whenever this unit is attacked, set your opponent's Attack die to \"-1\".", cardImage: "/assets/units-neutral-silver-mummies.webp" },
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
    neutral: { attack: 3, defense: 1, health: 4, initiative: 7, cost: { gold: 10 }, abilities: ["nomad-end-turn-step"], abilityText: "[map_effect] At the end of your turn, move your Hero's model to an adjacent empty field.", cardImage: "/assets/units-neutral-silver-nomads.webp" },
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
    neutral: { attack: 3, defense: 0, health: 6, initiative: 9, cost: { gold: 10 }, abilities: ["ignore-all-combat-penalties"], abilityText: "[unit_attack] Ignore the combat penalties.", cardImage: "/assets/units-neutral-silver-sharpshooters.webp" },
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
    neutral: { attack: 3, defense: 0, health: 5, initiative: 8, cost: { gold: 9 }, abilities: ["ignores-retaliation", "vampire-heal-on-attack"], abilityText: "[unit_attack] Ignore Enemy's Retaliation Attack. Then remove up to 2 [damage] from this unit.", cardImage: "/assets/units-neutral-silver-vampires.webp" },
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
    neutral: { attack: 5, defense: 2, health: 7, initiative: 10, cost: { gold: 29 }, abilities: ["archangel-hate-devils"], abilityText: "[unit_attack] When attacking Arch Devils , this unit gains +2 [attack] .", cardImage: "/assets/units-neutral-golden-archangels.webp" },
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
    neutral: { attack: 5, defense: 2, health: 7, initiative: 9, cost: { gold: 30 }, abilities: ["dragon-line-attack-2"], abilityText: "[unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 2 [attack] .", cardImage: "/assets/units-neutral-golden-black_dragons.webp" },
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
    neutral: { attack: 4, defense: 2, health: 6, initiative: 8, cost: { gold: 18 }, abilities: ["champion-roll-two-dice-reroll"], abilityText: "[unit_attack] Roll 2 Attack dice and apply both outcomes. [unit_passive] Reroll this unit's all \"-1\" rolls.", cardImage: "/assets/units-neutral-golden-champions.webp" },
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
    neutral: { attack: 4, defense: 2, health: 6, initiative: 6, cost: { gold: 16 }, abilities: ["reduce-spell-damage-3"], abilityText: "[unit_passive] Reduce any [damage] from spells by 3 — to a minimum of 0.", cardImage: "/assets/units-neutral-golden-diamond_golems.webp" },
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
    neutral: { attack: 5, defense: 1, health: 7, initiative: 7, cost: { gold: 18 }, abilities: ["dread-knight-retaliation-defense"], abilityText: "[unit_passive] When this unit is targeted by a Retaliation Attack, it gains +1 [defense] .", cardImage: "/assets/units-neutral-golden-dread_knights.webp" },
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
    neutral: { attack: 4, defense: 1, health: 5, initiative: 5, cost: { gold: 16 }, abilities: ["enchanter-heal-or-buff"], abilityText: "[activation] Remove up to 2 [damage] from a friendly unit. Otherwise, Enchanters gain +1 [attack] .", cardImage: "/assets/units-neutral-golden-enchanters.webp" },
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
    neutral: { attack: 5, defense: 2, health: 6, initiative: 9, cost: { gold: 28 }, abilities: ["ghost-dragon-knockback"], abilityText: "[unit_attack] After the attack, roll 1 Attack die ; if the result is \"0\", the target must immediately move away 1 space.", cardImage: "/assets/units-neutral-golden-ghost_dragons.webp" },
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
    neutral: { attack: 3, defense: 2, health: 6, initiative: 5, cost: { gold: 14 }, abilities: ["reduce-spell-damage-2"], abilityText: "[unit_passive] Reduce any [damage] from spells by 2 — to a minimum of 0.", cardImage: "/assets/units-neutral-golden-gold_golems.webp" },
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
    neutral: { attack: 4, defense: 1, health: 7, initiative: 8, cost: { gold: 18 }, abilities: ["manticore-thick-hide"], abilityText: "[unit_passive] On a \"0\" or a \"+1\" outcomes on the enemy's Attack die , gain +1 [defense] .", cardImage: "/assets/units-neutral-golden-manticores.webp" },
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
    neutral: { attack: 4, defense: 0, health: 7, initiative: 7, cost: { gold: 13 }, abilities: ["troll-heal-3"], abilityText: "[activation] Remove up to 3 [damage] from this unit.", cardImage: "/assets/units-neutral-golden-trolls.webp" },
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
    neutral: { attack: 8, defense: 3, health: 10, initiative: 19, cost: { gold: 45, valuables: 2 }, abilities: ["azure-dragon-paralysis", "immune-all-spells", "immune-specialty-damage"], abilityText: "2 [valuables] [unit_attack] If you resolve a \"-1\" on the Attack die , the target gains [paralysis] . [unit_passive] Ignore any [spell] effects and [damage] from Specialty .", cardImage: "/assets/units-neutral-azure-azure_dragons.webp" },
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
    neutral: { attack: 7, defense: 3, health: 9, initiative: 16, cost: { gold: 40, valuables: 2 }, abilities: ["crystal-dragon-valuables"], abilityText: "2 [valuables] [map_effect] At the beginning of each Resource round, gain 2 [valuables] .", cardImage: "/assets/units-neutral-azure-crystal_dragons.webp" },
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
    neutral: { attack: 3, defense: 1, health: 2, initiative: 7, cost: { gold: 6 }, abilities: ["familiar-spell-tax"], abilityText: "[unit_passive] Whenever an enemy casts a [spell] from hand, they must discard 1 card from hand.", cardImage: "/assets/units-neutral-bronze-familiars.webp" },
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
    neutral: { attack: 5, defense: 2, health: 7, initiative: 10, cost: { gold: 23 }, abilities: ["arch-devil-hate-angels"], abilityText: "[unit_attack] When attacking Archangels, this unit gains +2 [attack].", cardImage: "/assets/units-neutral-golden-arch_devils.webp" },
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
    neutral: { attack: 4, defense: 2, health: 6, initiative: 13, cost: { gold: 20 }, abilities: ["efreet-fire-immunity"], abilityText: "[unit_passive] Ignores any [damage] from Magic Arrows or spells from the Fire School of Magic.", cardImage: "/assets/units-neutral-golden-efreet.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/efreet/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/efreet/"
    }
  },
  // Stronghold neutral guards (Goblins … Behemoths): the board game has no
  // dedicated single-sided Neutral art for these creatures yet, so each reuses
  // its Stronghold faction FEW-side card as placeholder art (the neutral twin is
  // the same creature — same voice in unit-sounds.ts, same engine ability path).
  // Swap to real `units-neutral-*` scans when they land. The faction Few faces
  // all exist on disk; printed-unit-abilities.test.ts guards that every neutral
  // cardImage resolves to a real file.
  "neutral.goblins": {
    id: "neutral.goblins",
    name: "Goblins",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 1, defense: 0, health: 4, initiative: 6, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-goblins-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/goblins/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/goblins/"
    }
  },
  "neutral.wolf_raiders": {
    id: "neutral.wolf_raiders",
    name: "Wolf Raiders",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 3, initiative: 7, cost: { gold: 6 }, abilities: ["wolf-raiders-strike-twice"], abilityText: "[unit_attack] Attack this target again. The second attack happens after the target retaliates (if possible).", cardImage: "/assets/units-stronghold-bronze-wolf_raiders-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/wolf_raiders/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/wolf_raiders/"
    }
  },
  "neutral.orcs": {
    id: "neutral.orcs",
    name: "Orcs",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 1, health: 4, initiative: 4, cost: { gold: 7 }, abilities: [], cardImage: "/assets/units-stronghold-bronze-orcs-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/orcs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/orcs/"
    }
  },
  "neutral.ogres": {
    id: "neutral.ogres",
    name: "Ogres",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 10 }, abilities: ["ogres-attack-token-pack"], abilityText: "[unit_other] Place a +2 [attack] token on a chosen friendly [unit_ground] or [unit_flying] unit for 2 Combat rounds.", cardImage: "/assets/units-stronghold-silver-ogres-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ogres/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ogres/"
    }
  },
  "neutral.thunderbirds": {
    id: "neutral.thunderbirds",
    name: "Thunderbirds",
    faction: "neutral",
    tier: "silver",
    type: "flying",
    neutral: { attack: 3, defense: 0, health: 6, initiative: 9, cost: { gold: 13 }, abilities: ["thunderbirds-lightning"], abilityText: "[unit_passive] Right after this unit's attack and before any Retaliation, roll 1 Attack die, on a \"0\" or \"+1\", deal 1 [damage] to the target.", cardImage: "/assets/units-stronghold-silver-thunderbirds-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/thunderbirds/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/thunderbirds/"
    }
  },
  "neutral.cyclopes": {
    id: "neutral.cyclopes",
    name: "Cyclopes",
    faction: "neutral",
    tier: "gold",
    type: "ranged",
    neutral: { attack: 5, defense: 1, health: 6, initiative: 8, cost: { gold: 19 }, abilities: ["cyclops-demolish-full"], abilityText: "[unit_other] This unit can destroy a Wall, the Gate, or the Arrow Tower.", cardImage: "/assets/units-stronghold-golden-cyclopes-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/cyclopes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/cyclopes/"
    }
  },
  "neutral.behemoths": {
    id: "neutral.behemoths",
    name: "Behemoths",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 5, defense: 1, health: 8, initiative: 9, cost: { gold: 26 }, abilities: ["behemoth-defense-crush-pack", "behemoth-corrosion"], abilityText: "[unit_attack] Decrease the target's [defense] by 2 (to a minimum of 0). After the attack, place 1 Corrosion token on the target.", cardImage: "/assets/units-stronghold-golden-behemoths-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/behemoths/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/behemoths/"
    }
  },
  "neutral.faerie_dragons": {
    id: "neutral.faerie_dragons",
    name: "Faerie Dragons",
    faction: "neutral",
    tier: "azure",
    type: "flying",
    neutral: { attack: 5, defense: 2, health: 8, initiative: 15, cost: { gold: 35, valuables: 2 }, abilities: ["faerie-dragon-spell"], abilityText: "[activation] The selected unit suffers 2 [damage]. This is a [spell] that does not count towards your spell limit.", cardImage: "/assets/units-neutral-azure-faerie_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/faerie_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/faerie_dragons/"
    }
  },

  // ---- Rampart neutral units ---------------------------------------------
  // Single-sided neutral guard versions of the six core Rampart creatures.
  // Stats and ability text transcribed from each card face on the fan wiki
  // (card art normalised to /assets/units-neutral-<tier>-<slug>.webp). The
  // neutral guards reuse the faction creatures' implemented ability tags —
  // EXCEPT the neutral Pegasi (a different printed ability, see below) and the
  // neutral Unicorn, whose card prints a Retaliation paralysis instead of the
  // faction Unicorn's spell-damage reduction.
  "neutral.centaurs": {
    id: "neutral.centaurs",
    name: "Centaurs",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 0, health: 5, initiative: 7, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-neutral-bronze-centaurs.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/centaurs/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Neutral Rampart unit. Stats and ability transcribed from the card face on the fan wiki. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/centaurs/"
    }
  },
  "neutral.dwarves": {
    id: "neutral.dwarves",
    name: "Dwarves",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 1, health: 4, initiative: 3, cost: { gold: 4 }, abilities: ["dwarf-magic-resistance"], abilityText: "[unit_passive] If this unit is targeted by any Spell or Specialty card, roll 1 Attack die. On a \"+1\" result, ignore the card's effect.", cardImage: "/assets/units-neutral-bronze-dwarves.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dwarves/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Neutral Rampart unit. Stats and ability transcribed from the card face on the fan wiki. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dwarves/"
    }
  },
  "neutral.elves": {
    id: "neutral.elves",
    name: "Elves",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 7 }, abilities: ["double-attack-low-roll"], abilityText: "[unit_attack] If a target is a non adjacent unit, on a \"-1\" or \"0\" result, attack this target again.", cardImage: "/assets/units-neutral-bronze-elves.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/elves/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Neutral Rampart unit. Stats and ability transcribed from the card face on the fan wiki. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/elves/"
    }
  },
  "neutral.pegasi": {
    id: "neutral.pegasi",
    name: "Pegasi",
    faction: "neutral",
    tier: "silver",
    type: "flying",
    // The neutral Pegasi card prints a DIFFERENT ability from the Rampart Pegasi
    // (which dampens enemy spell Power). engine: pegasi-power-tax gates enemy
    // spellcasting — they must pay (discard) a card with Power to cast a Spell,
    // and cannot cast at all when they have no Power card to pay.
    neutral: { attack: 3, defense: 0, health: 5, initiative: 8, cost: { gold: 14 }, abilities: ["pegasi-power-tax"], abilityText: "[unit_passive] Whenever an enemy casts a [spell], they must discard an additional card with [power].", cardImage: "/assets/units-neutral-silver-pegasi.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/pegasi/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Neutral Rampart unit. Stats and ability transcribed from the card face on the fan wiki. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/pegasi/"
    }
  },
  "neutral.dendroids": {
    id: "neutral.dendroids",
    name: "Dendroids",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 2, health: 6, initiative: 3, cost: { gold: 12 }, abilities: ["dendroid-bind"], abilityText: "[unit_passive] Enemy units that start activation adjacent to this unit cannot move.", cardImage: "/assets/units-neutral-silver-dendroids.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dendroids/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Neutral Rampart unit. Stats and ability transcribed from the card face on the fan wiki. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dendroids/"
    }
  },
  "neutral.unicorns": {
    id: "neutral.unicorns",
    name: "Unicorns",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    // The neutral Unicorn card prints a Retaliation paralysis (NOT the Rampart
    // Unicorn's spell-damage reduction). engine: unicorn-paralyze-retaliation
    // (the implemented PARALYZE_ON_RETALIATION effect, shared with Medusas).
    neutral: { attack: 5, defense: 1, health: 7, initiative: 7, cost: { gold: 18 }, abilities: ["unicorn-paralyze-retaliation"], abilityText: "[unit_retaliation] The target is [paralysis].", cardImage: "/assets/units-neutral-golden-unicorns.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/unicorns/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
      credit: "Neutral Rampart unit. Stats and ability transcribed from the card face on the fan wiki. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/unicorns/"
    }
  },

  // ---- Tower / Fortress / Conflux neutral units --------------------------
  // Creatures from factions not yet playable as towns; they appear only as
  // neutral guards. Single-sided stats and ability text transcribed per unit
  // from the fan wiki (https://en.homm3bg.wiki/towns/neutral/). Abilities that
  // the engine does not implement are kept as display-only abilityText.
  "neutral.gnolls": {
    id: "neutral.gnolls",
    name: "Gnolls",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 1, health: 2, initiative: 4, cost: { gold: 3 }, abilities: [], cardImage: "/assets/units-neutral-bronze-gnolls.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gnolls/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gnolls/"
    }
  },
  "neutral.gremlins": {
    id: "neutral.gremlins",
    name: "Gremlins",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 2, initiative: 5, cost: { gold: 2 }, abilities: [], cardImage: "/assets/units-neutral-bronze-gremlins.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gremlins/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gremlins/"
    }
  },
  "neutral.gargoyles": {
    id: "neutral.gargoyles",
    name: "Gargoyles",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 2, defense: 1, health: 3, initiative: 9, cost: { gold: 4 }, abilities: ["ignore-paralysis"], abilityText: "[unit_passive] This unit ignores [paralysis] effect.", cardImage: "/assets/units-neutral-bronze-gargoyles.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gargoyles/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gargoyles/"
    }
  },
  "neutral.lizardmen": {
    id: "neutral.lizardmen",
    name: "Lizardmen",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 4, initiative: 5, cost: { gold: 4 }, abilities: [], cardImage: "/assets/units-neutral-bronze-lizardmen.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/lizardmen/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/lizardmen/"
    }
  },
  "neutral.iron_golems": {
    id: "neutral.iron_golems",
    name: "Iron Golems",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: { attack: 2, defense: 1, health: 4, initiative: 3, cost: { gold: 6 }, abilities: ["reduce-spell-damage-2"], abilityText: "[unit_passive] Reduce any [damage] from spells by 2 — to a minimum of 0.", cardImage: "/assets/units-neutral-bronze-iron_golems.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/iron_golems/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/iron_golems/"
    }
  },
  "neutral.steel_golems": {
    id: "neutral.steel_golems",
    name: "Steel Golems",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    // No card art converted yet: the board falls back to the named card frame.
    neutral: { attack: 3, defense: 2, health: 3, initiative: 5, cost: { gold: 12 }, abilities: ["reduce-spell-and-specialty-damage-2"], abilityText: "[unit_passive] Reduce any [damage] this unit takes from spells or Specialty by 2 — to a minimum of 0." },
    wikiUrl: "https://en.homm3bg.wiki/units/steel_golems/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals 2024)",
      credit: "Neutral unit. Stats and ability from the fan wiki unit page. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/steel_golems/"
    }
  },
  "neutral.sprites": {
    id: "neutral.sprites",
    name: "Sprites",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 2, defense: 0, health: 2, initiative: 7, cost: { gold: 2 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack.", cardImage: "/assets/units-conflux-bronze-sprites-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/sprites/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/sprites/"
    }
  },
  "neutral.dragon_flies": {
    id: "neutral.dragon_flies",
    name: "Dragon Flies",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: { attack: 3, defense: 0, health: 3, initiative: 8, cost: { gold: 7 }, abilities: ["dragon-fly-retaliation-penalty"], abilityText: "[unit_attack] Retaliation Attacks against Dragon Flies suffer -1 [attack].", cardImage: "/assets/units-neutral-bronze-dragon_flies.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/dragon_flies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/dragon_flies/"
    }
  },
  // The wiki publishes blank frames for the four summonable base-school
  // Elementals. Their card faces below are locally composed from one shared art
  // panel per creature (Few/Pack/Neutral) plus the printed tier/variant frame;
  // scripts/build-elemental-cards.mjs is the reproducible source of truth.
  "neutral.air_elementals": {
    id: "neutral.air_elementals",
    name: "Air Elementals",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    // Few/Pack are the summonable Conflux sides (Summon Air Elemental).
    few: { attack: 2, defense: 0, health: 4, initiative: 8, cost: {}, abilities: ["elemental-damage", "air-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Air Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-air_elementals-few.webp" },
    pack: { attack: 3, defense: 0, health: 4, initiative: 8, cost: {}, abilities: ["elemental-damage", "air-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Air Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-air_elementals-pack.webp" },
    neutral: { attack: 2, defense: 0, health: 3, initiative: 7, cost: { gold: 7 }, abilities: ["elemental-damage", "air-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Air Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-neutral-bronze-air_elementals.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/air_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/air_elementals/"
    }
  },
  "neutral.earth_elementals": {
    id: "neutral.earth_elementals",
    name: "Earth Elementals",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    // Summon spell forms (Few/Pack via Summon Earth Elemental) AND a single
    // Neutral guard card. The fan wiki lists a gold-tier Neutral Earth Elemental
    // (3/2/5/4, 16 gold) whose stats differ from the summon Few/Pack — so the
    // guard joins the gold neutral deck (see neutralUnitIdsByTier). Its custom
    // golden face reuses the exact art panel from the bronze summon cards.
    few: { attack: 2, defense: 2, health: 2, initiative: 5, cost: {}, abilities: ["elemental-damage", "earth-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Earth Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-earth_elementals-few.webp" },
    pack: { attack: 3, defense: 2, health: 2, initiative: 5, cost: {}, abilities: ["elemental-damage", "earth-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Earth Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-earth_elementals-pack.webp" },
    neutral: { attack: 3, defense: 2, health: 5, initiative: 4, cost: { gold: 16 }, abilities: ["elemental-damage", "earth-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Earth Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-neutral-golden-earth_elementals.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/earth_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/earth_elementals/"
    }
  },
  "neutral.water_elementals": {
    id: "neutral.water_elementals",
    name: "Water Elementals",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    // Summon spell forms (Few/Pack via Summon Water Elemental) AND a single
    // Neutral guard card. The fan wiki lists a silver-tier Neutral Water
    // Elemental (2/1/4/5, 10 gold) whose stats differ from the summon Few/Pack —
    // so the guard joins the silver neutral deck (see neutralUnitIdsByTier). Its
    // custom silver face reuses the exact art panel from the bronze summon cards.
    few: { attack: 2, defense: 0, health: 5, initiative: 6, cost: {}, abilities: ["elemental-damage", "water-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Water Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-water_elementals-few.webp" },
    pack: { attack: 3, defense: 0, health: 5, initiative: 6, cost: {}, abilities: ["elemental-damage", "water-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Water Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-water_elementals-pack.webp" },
    neutral: { attack: 2, defense: 1, health: 4, initiative: 5, cost: { gold: 10 }, abilities: ["elemental-damage", "water-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Water Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-neutral-silver-water_elementals.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/water_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/water_elementals/"
    }
  },
  "neutral.ice_elementals": {
    id: "neutral.ice_elementals",
    name: "Ice Elementals",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 1, health: 3, initiative: 5, cost: { gold: 7 }, abilities: ["elemental-damage", "water-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Water Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-ice_elementals-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/ice_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/ice_elementals/"
    }
  },
  "neutral.storm_elementals": {
    id: "neutral.storm_elementals",
    name: "Storm Elementals",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: { attack: 2, defense: 0, health: 3, initiative: 7, cost: { gold: 5 }, abilities: ["elemental-damage", "air-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Air Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-storm_elementals-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/storm_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/storm_elementals/"
    }
  },
  "neutral.basilisks": {
    id: "neutral.basilisks",
    name: "Basilisks",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 4, defense: 1, health: 4, initiative: 5, cost: { gold: 12 }, abilities: ["basilisk-paralysis"], abilityText: "[unit_attack] After the attack, roll 1 Attack die . On a \"0\" result, the target is [paralysis] .", cardImage: "/assets/units-neutral-silver-basilisks.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/basilisks/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/basilisks/"
    }
  },
  "neutral.gorgons": {
    id: "neutral.gorgons",
    name: "Gorgons",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 4, defense: 2, health: 4, initiative: 5, cost: { gold: 13 }, abilities: ["gorgon-death-stare"], abilityText: "[unit_attack] After the attack, roll 2 Attack dice . On two \"-1\" results, reduce the target's [health_points] to 0.", cardImage: "/assets/units-neutral-silver-gorgons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gorgons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gorgons/"
    }
  },
  "neutral.genies": {
    id: "neutral.genies",
    name: "Genies",
    faction: "neutral",
    tier: "silver",
    type: "flying",
    neutral: { attack: 3, defense: 1, health: 4, initiative: 9, cost: { gold: 11 }, abilities: ["genie-hate-efreet"], abilityText: "[unit_attack] When attacking Efreet , this unit gains +1 [attack] .", cardImage: "/assets/units-neutral-silver-genies.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/genies/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/genies/"
    }
  },
  "neutral.magi": {
    id: "neutral.magi",
    name: "Magi",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: { attack: 3, defense: 0, health: 5, initiative: 6, cost: { gold: 11 }, abilities: ["ignore-all-combat-penalties", "magi-power-drain"], abilityText: "[unit_attack] Ignore combat penalties. After this unit's attack, the enemy discards a random card or a card with [power].", cardImage: "/assets/units-neutral-silver-magi.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magi/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magi/"
    }
  },
  "neutral.energy_elementals": {
    id: "neutral.energy_elementals",
    name: "Energy Elementals",
    faction: "neutral",
    tier: "silver",
    type: "flying",
    neutral: { attack: 3, defense: 1, health: 4, initiative: 5, cost: { gold: 11 }, abilities: ["elemental-damage", "fire-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Fire Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-silver-energy_elementals-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/energy_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/energy_elementals/"
    }
  },
  "neutral.fire_elementals": {
    id: "neutral.fire_elementals",
    name: "Fire Elementals",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    // Few/Pack are the summonable Conflux sides (Summon Fire Elemental).
    few: { attack: 2, defense: 1, health: 4, initiative: 5, cost: {}, abilities: ["elemental-damage", "fire-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Fire Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-fire_elementals-few.webp" },
    pack: { attack: 3, defense: 1, health: 4, initiative: 5, cost: {}, abilities: ["elemental-damage", "fire-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Fire Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-bronze-fire_elementals-pack.webp" },
    neutral: { attack: 3, defense: 1, health: 3, initiative: 6, cost: { gold: 13 }, abilities: ["elemental-damage", "fire-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Fire Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-neutral-silver-fire_elementals.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/fire_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/fire_elementals/"
    }
  },
  "neutral.magma_elementals": {
    id: "neutral.magma_elementals",
    name: "Magma Elementals",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 14 }, abilities: ["elemental-damage", "earth-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow and Earth Magic spells. This unit deals elemental damage.", cardImage: "/assets/units-conflux-silver-magma_elementals-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magma_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magma_elementals/"
    }
  },

  // ---- Gold & azure neutral units ----------------------------------------
  // High-tier neutral guards (Tower/Fortress/Conflux/Dungeon/Rampart creatures
  // with no playable town yet, plus the azure "mighty" tier). Stats and ability
  // text per unit from the fan wiki. Implemented ability tags are used only
  // where the engine already supports them (Nagas/Hydras no-retaliation, Titans
  // no-adjacent-shot penalty); the rest stay display-only.
  "neutral.nagas": {
    id: "neutral.nagas",
    name: "Nagas",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 5, defense: 1, health: 6, initiative: 6, cost: { gold: 16 }, abilities: ["ignores-retaliation"], abilityText: "[unit_attack] Ignore the Retaliation Attack.", cardImage: "/assets/units-neutral-golden-nagas.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/nagas/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/nagas/"
    }
  },
  "neutral.wyverns": {
    id: "neutral.wyverns",
    name: "Wyverns",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: { attack: 4, defense: 1, health: 7, initiative: 8, cost: { gold: 17 }, abilities: ["wyvern-sting"], abilityText: "[unit_attack] After the attack, roll 1 Attack die . On a \"0\" result, deal 1 [damage] to the target unit.", cardImage: "/assets/units-neutral-golden-wyverns.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/wyverns/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/wyverns/"
    }
  },
  "neutral.magic_elementals": {
    id: "neutral.magic_elementals",
    name: "Magic Elementals",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: { attack: 3, defense: 1, health: 7, initiative: 7, cost: { gold: 19 }, abilities: ["elemental-damage", "magic-elemental-immunity"], abilityText: "[unit_passive] Immune to Magic Arrow. This unit deals elemental damage.", cardImage: "/assets/units-conflux-golden-magic_elementals-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/magic_elementals/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/magic_elementals/"
    }
  },
  "neutral.titans": {
    id: "neutral.titans",
    name: "Titans",
    faction: "neutral",
    tier: "azure",
    type: "ranged",
    neutral: { attack: 6, defense: 2, health: 10, initiative: 10, cost: { gold: 39 }, abilities: ["ignore-combat-penalties", "titan-hate-black-dragons"], abilityText: "[unit_passive] Ignore the combat penalty against adjacent units. [unit_attack] When attacking Black Dragons , this unit gains +2 [attack] .", cardImage: "/assets/units-neutral-azure-titans.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/titans/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Tower unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/titans/"
    }
  },
  "neutral.hydras": {
    id: "neutral.hydras",
    name: "Hydras",
    faction: "neutral",
    tier: "azure",
    type: "ground",
    neutral: { attack: 7, defense: 3, health: 8, initiative: 5, cost: { gold: 40 }, abilities: ["ignores-retaliation", "hydra-multi-attack"], abilityText: "[unit_attack] Ignore the Retaliation Attack. This unit attacks up to 2 adjacent enemy units.", cardImage: "/assets/units-neutral-azure-hydras.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/hydras/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Fortress unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/hydras/"
    }
  },
  "neutral.phoenixes": {
    id: "neutral.phoenixes",
    name: "Phoenixes",
    faction: "neutral",
    tier: "azure",
    type: "flying",
    neutral: { attack: 6, defense: 2, health: 7, initiative: 12, cost: { gold: 32 }, abilities: ["phoenix-rebirth", "phoenix-fire-immunity"], abilityText: "[unit_passive] Once per Combat, when this unit's [health_points] drops to 0, set it to 1 instead. [unit_passive] Immune to Fire Magic [spell] .", cardImage: "/assets/units-conflux-golden-phoenixes-few.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/phoenixes/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Conflux unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/phoenixes/"
    }
  },
  "neutral.rust_dragons": {
    id: "neutral.rust_dragons",
    name: "Rust Dragons",
    faction: "neutral",
    tier: "azure",
    type: "flying",
    neutral: { attack: 7, defense: 3, health: 10, initiative: 17, cost: { gold: 38, valuables: 1 }, abilities: ["rust-dragon-acid"], abilityText: "1 [valuables] [unit_attack] On a \"-1\" result on the Attack die , decrease the target's [defense] by 2 — to a minimum of 0.", cardImage: "/assets/units-neutral-azure-rust_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/rust_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Dungeon unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/rust_dragons/"
    }
  },
  "neutral.gold_dragons": {
    id: "neutral.gold_dragons",
    name: "Gold Dragons",
    faction: "neutral",
    tier: "azure",
    type: "flying",
    neutral: { attack: 6, defense: 3, health: 9, initiative: 10, cost: { gold: 42 }, abilities: ["dragon-line-attack-3"], abilityText: "[unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 3 [attack] .", cardImage: "/assets/units-neutral-azure-gold_dragons.webp" },
    wikiUrl: "https://en.homm3bg.wiki/units/gold_dragons/",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: "Neutral Rampart unit. Stats from the fan wiki units table. Verify against official cards before final release.",
      url: "https://en.homm3bg.wiki/units/gold_dragons/"
    }
  },
};
