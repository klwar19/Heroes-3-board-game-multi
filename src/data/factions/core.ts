import type { FactionDefinition, HeroDefinition, TownBuildingDefinition } from "./types";
import { coreUnitDefinitions } from "./units";

const wikiCredit =
  "Costs and effects from the fan wiki town pages and the community rulebook rewrite. Verify against official components before final release.";

function townSource(faction: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Core Game)",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/towns/${faction}/`
  };
}

function heroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Core Game)",
    credit: "Hero board data and portrait from the fan wiki. Verify against official components before final release.",
    url: `https://en.homm3bg.wiki/heroes/${slug}/`
  };
}

/**
 * Town buildings for the three core factions. Every faction shares the same
 * City Hall / Citadel / Mage Guild / dwelling costs; City Hall income choices,
 * Mage Guild spell prices, and the two faction buildings differ.
 */
export const coreBuildingDefinitions: Record<string, TownBuildingDefinition> = {
  // ---- Castle ----------------------------------------------------------
  "castle.city_hall": {
    id: "castle.city_hall",
    name: "City Hall",
    faction: "castle",
    cost: { gold: 10, buildingMaterials: 4 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 5 gold", gold: 5 },
        { label: "Gain +1 movement point this round", movement: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.citadel": {
    id: "castle.citadel",
    name: "Citadel",
    faction: "castle",
    cost: { gold: 8, buildingMaterials: 5, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.mage_guild": {
    id: "castle.mage_guild",
    name: "Mage Guild",
    faction: "castle",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 6,
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.dwelling_bronze": {
    id: "castle.dwelling_bronze",
    name: "Towers",
    faction: "castle",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.dwelling_silver": {
    id: "castle.dwelling_silver",
    name: "Holy Grounds",
    faction: "castle",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["castle.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.dwelling_gold": {
    id: "castle.dwelling_gold",
    name: "Glory of Erathia",
    faction: "castle",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["castle.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.brotherhood_of_the_sword": {
    id: "castle.brotherhood_of_the_sword",
    name: "Brotherhood of the Sword",
    faction: "castle",
    cost: { gold: 8, buildingMaterials: 4 },
    effect: { type: "RESOURCE_ROUND_MORALE" },
    implementationStatus: "implemented",
    source: townSource("castle")
  },
  "castle.blacksmith": {
    id: "castle.blacksmith",
    name: "Blacksmith",
    faction: "castle",
    cost: { gold: 4, buildingMaterials: 3 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "During your turn: remove an Artifact card from hand for 4 gold, OR pay 6 gold to Search(2) Artifacts."
    },
    implementationStatus: "not-implemented",
    source: townSource("castle")
  },

  // ---- Necropolis ------------------------------------------------------
  "necropolis.city_hall": {
    id: "necropolis.city_hall",
    name: "City Hall",
    faction: "necropolis",
    cost: { gold: 10, buildingMaterials: 4 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 4 gold", gold: 4 },
        { label: "Reinforce 1 bronze unit for free", reinforceBronzeFree: true }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.citadel": {
    id: "necropolis.citadel",
    name: "Citadel",
    faction: "necropolis",
    cost: { gold: 8, buildingMaterials: 5, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.mage_guild": {
    id: "necropolis.mage_guild",
    name: "Mage Guild",
    faction: "necropolis",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.dwelling_bronze": {
    id: "necropolis.dwelling_bronze",
    name: "Old Cemetery",
    faction: "necropolis",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.dwelling_silver": {
    id: "necropolis.dwelling_silver",
    name: "Mausoleum Domain",
    faction: "necropolis",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["necropolis.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.dwelling_gold": {
    id: "necropolis.dwelling_gold",
    name: "Vaults of Darkness",
    faction: "necropolis",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["necropolis.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.necromancy_amplifier": {
    id: "necropolis.necromancy_amplifier",
    name: "Necromancy Amplifier",
    faction: "necropolis",
    cost: { gold: 7, buildingMaterials: 3, valuables: 1 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "At the beginning of your turn: search the Ability deck for a Necromancy card, OR take 1 Specialty card from your discard pile to your hand."
    },
    implementationStatus: "not-implemented",
    source: townSource("necropolis")
  },
  "necropolis.cover_of_darkness": {
    id: "necropolis.cover_of_darkness",
    name: "Cover of Darkness",
    faction: "necropolis",
    cost: { gold: 6, buildingMaterials: 4, valuables: 1 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "During your turn: discard up to 2 cards to draw that many, OR at the beginning of Combat with an enemy Hero, discard 1 random card from the enemy's hand."
    },
    implementationStatus: "not-implemented",
    source: townSource("necropolis")
  },

  // ---- Rampart (expansion) ----------------------------------------------
  "rampart.city_hall": {
    id: "rampart.city_hall",
    name: "City Hall",
    faction: "rampart",
    cost: { gold: 10, buildingMaterials: 6 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [{ label: "Gain 7 gold", gold: 7 }]
    },
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.citadel": {
    id: "rampart.citadel",
    name: "Citadel",
    faction: "rampart",
    cost: { gold: 8, buildingMaterials: 5, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.mage_guild": {
    id: "rampart.mage_guild",
    name: "Mage Guild",
    faction: "rampart",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.dwelling_bronze": {
    id: "rampart.dwelling_bronze",
    name: "Housing Estate",
    faction: "rampart",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.dwelling_silver": {
    id: "rampart.dwelling_silver",
    name: "Spring upon Arches",
    faction: "rampart",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["rampart.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.dwelling_gold": {
    id: "rampart.dwelling_gold",
    name: "Cliff behind the Glade",
    faction: "rampart",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["rampart.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.mystic_pond": {
    id: "rampart.mystic_pond",
    name: "Mystic Pond",
    faction: "rampart",
    cost: { gold: 7, buildingMaterials: 4 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "At the beginning of each Resource round, roll a Resource die and gain its reward."
    },
    implementationStatus: "not-implemented",
    source: townSource("rampart")
  },
  "rampart.saplings": {
    id: "rampart.saplings",
    name: "Saplings",
    faction: "rampart",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "During Astrologers' rounds, Reinforce bronze and silver units at half cost."
    },
    implementationStatus: "not-implemented",
    source: townSource("rampart")
  },

  // ---- Inferno (expansion) -----------------------------------------------
  "inferno.city_hall": {
    id: "inferno.city_hall",
    name: "City Hall",
    faction: "inferno",
    cost: { gold: 13, buildingMaterials: 5 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 6 gold", gold: 6 },
        { label: "Gain 3 building materials", buildingMaterials: 3 }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.citadel": {
    id: "inferno.citadel",
    name: "Citadel",
    faction: "inferno",
    cost: { gold: 9, buildingMaterials: 4, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.mage_guild": {
    id: "inferno.mage_guild",
    name: "Mage Guild",
    faction: "inferno",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.dwelling_bronze": {
    id: "inferno.dwelling_bronze",
    name: "Crucible of Sins",
    faction: "inferno",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.dwelling_silver": {
    id: "inferno.dwelling_silver",
    name: "Gates of Abyss",
    faction: "inferno",
    cost: { gold: 9, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["inferno.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.dwelling_gold": {
    id: "inferno.dwelling_gold",
    name: "Hellfire Palace",
    faction: "inferno",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["inferno.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.castle_gate": {
    id: "inferno.castle_gate",
    name: "Castle Gate",
    faction: "inferno",
    cost: { gold: 7, buildingMaterials: 5 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "During your turn: pay 3 gold to discard a random card from an opponent's hand, OR move your Hero between Towns you control."
    },
    implementationStatus: "not-implemented",
    source: townSource("inferno")
  },
  "inferno.brimstone_stormclouds": {
    id: "inferno.brimstone_stormclouds",
    name: "Brimstone Stormclouds",
    faction: "inferno",
    cost: { gold: 6, buildingMaterials: 3, valuables: 2 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "Place Faction Cubes here (max 3) to gain +1 Power per cube during Combat."
    },
    implementationStatus: "not-implemented",
    source: townSource("inferno")
  },

  // ---- Dungeon ---------------------------------------------------------
  "dungeon.city_hall": {
    id: "dungeon.city_hall",
    name: "City Hall",
    faction: "dungeon",
    cost: { gold: 10, buildingMaterials: 4 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 5 gold", gold: 5 },
        { label: "Gain 1 valuables", valuables: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.citadel": {
    id: "dungeon.citadel",
    name: "Citadel",
    faction: "dungeon",
    cost: { gold: 8, buildingMaterials: 5, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.mage_guild": {
    id: "dungeon.mage_guild",
    name: "Mage Guild",
    faction: "dungeon",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.dwelling_bronze": {
    id: "dungeon.dwelling_bronze",
    name: "Warrens",
    faction: "dungeon",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.dwelling_silver": {
    id: "dungeon.dwelling_silver",
    name: "Inner Labyrinths",
    faction: "dungeon",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["dungeon.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.dwelling_gold": {
    id: "dungeon.dwelling_gold",
    name: "Ancient Lairs",
    faction: "dungeon",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["dungeon.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.portal_of_summoning": {
    id: "dungeon.portal_of_summoning",
    name: "Portal of Summoning",
    faction: "dungeon",
    cost: { gold: 7, buildingMaterials: 3, valuables: 1 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "At the beginning of your turn, draw 1 Neutral Unit card from decks matching your Dwellings and pay its cost to recruit it."
    },
    implementationStatus: "not-implemented",
    source: townSource("dungeon")
  },
  "dungeon.mana_vortex": {
    id: "dungeon.mana_vortex",
    name: "Mana Vortex",
    faction: "dungeon",
    cost: { gold: 6, buildingMaterials: 4, valuables: 1 },
    effect: {
      type: "NOT_IMPLEMENTED",
      note: "At the beginning of your turn, discard 1 card to shuffle your discard pile into your deck, then Search(3) from it."
    },
    implementationStatus: "not-implemented",
    source: townSource("dungeon")
  }
};

export const coreHeroDefinitions: Record<string, HeroDefinition> = {
  catherine: {
    id: "catherine",
    name: "Catherine",
    faction: "castle",
    class: "Knight",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: {
      1: "specialty.catherine.1",
      4: "specialty.catherine.4",
      6: "specialty.catherine.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-castle-might-catherine.webp",
    source: heroSource("catherine")
  },
  rion: {
    id: "rion",
    name: "Rion",
    faction: "castle",
    class: "Cleric",
    type: "magic",
    startingStats: { attack: 1, defense: 0, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.rion.1",
      4: "specialty.rion.4",
      6: "specialty.rion.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-castle-magic-rion.webp",
    source: heroSource("rion")
  },
  sandro: {
    id: "sandro",
    name: "Sandro",
    faction: "necropolis",
    class: "Necromancer",
    type: "magic",
    startingStats: { attack: 1, defense: 0, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: {
      1: "specialty.sandro.1",
      4: "specialty.sandro.4",
      6: "specialty.sandro.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-necropolis-magic-sandro.webp",
    source: heroSource("sandro")
  },
  tamika: {
    id: "tamika",
    name: "Tamika",
    faction: "necropolis",
    class: "Death Knight",
    type: "might",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: {
      1: "specialty.tamika.1",
      4: "specialty.tamika.4",
      6: "specialty.tamika.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-necropolis-might-tamika.webp",
    source: heroSource("tamika")
  },
  gelu: {
    id: "gelu",
    name: "Gelu",
    faction: "rampart",
    class: "Ranger",
    type: "might",
    startingStats: { attack: 1, defense: 3, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.archery",
    specialtyCardIds: {
      1: "specialty.gelu.1",
      4: "specialty.gelu.4",
      6: "specialty.gelu.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-rampart-might-gelu.webp",
    source: heroSource("gelu")
  },
  gem: {
    id: "gem",
    name: "Gem",
    faction: "rampart",
    class: "Druid",
    type: "magic",
    startingStats: { attack: 0, defense: 2, power: 1, knowledge: 2 },
    startingAbilityCardId: "ability.first_aid",
    specialtyCardIds: {
      1: "specialty.gem.1",
      4: "specialty.gem.4",
      6: "specialty.gem.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-rampart-magic-gem.webp",
    source: heroSource("gem")
  },
  xyron: {
    id: "xyron",
    name: "Xyron",
    faction: "inferno",
    class: "Heretic",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.xyron.1",
      4: "specialty.xyron.4",
      6: "specialty.xyron.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-inferno-magic-xyron.webp",
    source: heroSource("xyron")
  },
  rashka: {
    id: "rashka",
    name: "Rashka",
    faction: "inferno",
    class: "Demoniac",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.scholar",
    specialtyCardIds: {
      1: "specialty.rashka.1",
      4: "specialty.rashka.4",
      6: "specialty.rashka.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-inferno-might-rashka.webp",
    source: heroSource("rashka")
  },
  alamar: {
    id: "alamar",
    name: "Alamar",
    faction: "dungeon",
    class: "Warlock",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 3, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.alamar.1",
      4: "specialty.alamar.4",
      6: "specialty.alamar.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-dungeon-magic-alamar.webp",
    source: heroSource("alamar")
  },
  mutare: {
    id: "mutare",
    name: "Mutare",
    faction: "dungeon",
    class: "Overlord",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: {
      1: "specialty.mutare.1",
      4: "specialty.mutare.4",
      6: "specialty.mutare.6"
    },
    portrait: "https://en.homm3bg.wiki/assets/heroes-dungeon-might-mutare.webp",
    source: heroSource("mutare")
  }
};

function unitsOfFaction(faction: string): string[] {
  return Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === faction)
    .map((unit) => unit.id);
}

function buildingsOfFaction(faction: string): string[] {
  return Object.values(coreBuildingDefinitions)
    .filter((building) => building.faction === faction)
    .map((building) => building.id);
}

export const coreFactionDefinitions: Record<string, FactionDefinition> = {
  castle: {
    id: "castle",
    name: "Castle",
    color: "#2f6fd0",
    startingTileId: "S3",
    heroes: ["catherine", "rion"],
    buildings: buildingsOfFaction("castle"),
    units: unitsOfFaction("castle"),
    townImage: "https://en.homm3bg.wiki/assets/towns-castle-empty.webp",
    source: townSource("castle")
  },
  rampart: {
    id: "rampart",
    name: "Rampart",
    color: "#2e9e57",
    startingTileId: "S4",
    heroes: ["gelu", "gem"],
    buildings: buildingsOfFaction("rampart"),
    units: unitsOfFaction("rampart"),
    townImage: "https://en.homm3bg.wiki/assets/towns-rampart-empty.webp",
    source: townSource("rampart")
  },
  inferno: {
    id: "inferno",
    name: "Inferno",
    color: "#e07020",
    startingTileId: "S5",
    heroes: ["xyron", "rashka"],
    buildings: buildingsOfFaction("inferno"),
    units: unitsOfFaction("inferno"),
    townImage: "https://en.homm3bg.wiki/assets/towns-inferno-empty.webp",
    source: townSource("inferno")
  },
  necropolis: {
    id: "necropolis",
    name: "Necropolis",
    color: "#7c4dbe",
    startingTileId: "S1",
    heroes: ["sandro", "tamika"],
    buildings: buildingsOfFaction("necropolis"),
    units: unitsOfFaction("necropolis"),
    ignoresMorale: true,
    townImage: "https://en.homm3bg.wiki/assets/towns-necropolis-empty.webp",
    source: townSource("necropolis")
  },
  dungeon: {
    id: "dungeon",
    name: "Dungeon",
    color: "#c0392b",
    startingTileId: "S2",
    heroes: ["alamar", "mutare"],
    buildings: buildingsOfFaction("dungeon"),
    units: unitsOfFaction("dungeon"),
    townImage: "https://en.homm3bg.wiki/assets/towns-dungeon-empty.webp",
    source: townSource("dungeon")
  }
};

/** Neutral unit definition ids grouped by tier, used to build the four neutral decks. */
export const neutralUnitIdsByTier: Record<"bronze" | "silver" | "gold" | "azure", string[]> = {
  bronze: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "bronze")
    .map((unit) => unit.id),
  silver: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "silver")
    .map((unit) => unit.id),
  gold: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "gold")
    .map((unit) => unit.id),
  azure: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "azure")
    .map((unit) => unit.id)
};

/**
 * Which starting tile faces which faction. S3 = Castle, S1 = Necropolis,
 * S2 = Dungeon (dirt/cursed/subterranean core starting tiles); S4-S6 are the
 * second printed set used for variety in multiplayer setups.
 */
export const startingTileByFaction: Record<string, string> = {
  castle: "S3",
  necropolis: "S1",
  dungeon: "S2",
  rampart: "S4",
  inferno: "S6"
};
