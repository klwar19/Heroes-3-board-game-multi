import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import type { FactionDefinition, HeroDefinition, TownBuildingDefinition } from "./types";
import { coreUnitDefinitions } from "./units";

const wikiCredit =
  "Costs and effects from the fan wiki town pages and the community rulebook rewrite. Verify against official components before final release.";

const townProducts: Record<string, string> = {
  castle: "Heroes of Might and Magic III: The Board Game (Core Game)",
  necropolis: "Heroes of Might and Magic III: The Board Game (Core Game)",
  dungeon: "Heroes of Might and Magic III: The Board Game (Core Game)",
  rampart: "Heroes of Might and Magic III: The Board Game (Rampart Expansion)",
  inferno: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
  stronghold: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
  fortress: "Heroes of Might and Magic III: The Board Game (Fortress Expansion)",
  tower: "Heroes of Might and Magic III: The Board Game (Tower Expansion)"
};

function townSource(faction: string) {
  return {
    product: townProducts[faction] ?? "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/towns/${faction}/`
  };
}

function heroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Core Game)",
    credit:
      "Hero board data and board scan from the fan wiki; the portrait is the board-game art cropped from that scan (hosted locally). Verify against official components before final release.",
    url: `https://en.homm3bg.wiki/heroes/${slug}/`
  };
}

function towerHeroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
    credit:
      "Hero board data and board scan from the fan wiki Tower pages; the portrait is the board-game art cropped from that scan (hosted locally). Verify against official components before final release.",
    url: `https://en.homm3bg.wiki/heroes/${slug}/`
  };
}

/**
 * Source for the additional heroes the fan wiki lists under "Regular Stretch
 * Goals 2024" (Fiona, Mephala, Clancy, Adelaide, …): the printed board scan is
 * on the wiki and the portrait is cropped from it (hosted locally), exactly like
 * the core/expansion heroes.
 */
function stretchGoalHeroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals 2024)",
    credit:
      "Hero board data and board scan from the fan wiki; the portrait is the board-game art cropped from that scan (hosted locally). Verify against official components before final release.",
    url: `https://en.homm3bg.wiki/heroes/${slug}/`
  };
}

/**
 * Source for additional wiki heroes shipped with their real printed board scan +
 * cropped portrait + specialty card faces (Lord Haart, Jeddite, Tazar, Adrienne).
 * The wiki PAGE slug can differ from the local ASSET slug — Lord Haart's board
 * files use "lord_haart" while his page is /heroes/lord_haart_castle/ — so the
 * page slug is passed explicitly.
 */
function wikiBoardHeroSource(pageSlug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit:
      "Hero board data and board scan from the fan wiki; the portrait is the board-game art cropped from that scan (hosted locally). Verify against official components before final release.",
    url: `https://en.homm3bg.wiki/heroes/${pageSlug}/`
  };
}

/**
 * Source for the two Tower heroes whose printed boards are not on the fan wiki
 * yet (only placeholder art): stats follow the verified Wizard/Alchemist board
 * pattern and the portrait is the classic PC hero portrait (heroes.thelazy.net,
 * upscaled, hosted locally), exactly like Moandor.
 */
function towerPcPortraitHeroSource(slug: string, pcName: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
    credit:
      "Hero roster, class and specialty from the fan wiki Tower town page. The printed board is not on the wiki yet, so the starting statistics follow the verified Wizard/Alchemist board pattern and the portrait is the classic PC hero portrait from heroes.thelazy.net (upscaled, hosted locally). Verify against official components before final release.",
    url: `https://heroes.thelazy.net/index.php/${pcName}`
  };
}

/**
 * Source for the "Regular Stretch Goals 2024" heroes whose fan-wiki page still
 * shows only the deck-back placeholder (no printed board scan or specialty card
 * faces yet): stats, class, starting ability and the I/IV/VI specialty rules are
 * transcribed from that page, and the portrait is the classic PC hero portrait
 * from heroes.thelazy.net (upscaled, hosted locally), exactly like Moandor.
 */
function stretchGoalPcPortraitHeroSource(slug: string, pcName: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals 2024)",
    credit:
      `Hero roster, class, statistics, starting ability and specialty rules from the fan wiki hero page. The printed board is not on the wiki yet (placeholder art), so the portrait is the classic PC hero portrait from heroes.thelazy.net/index.php/${pcName} (upscaled, hosted locally). Verify against official components before final release.`,
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
    // "During your turn: remove an Artifact card from hand for 4 gold, OR
    // pay 6 gold to Search(2) Artifacts." Also the artifact source that
    // unlocks the BINH Major/Relic decks at hero level 4/6.
    effect: { type: "ARTIFACT_SMITH", searchCost: 6, sellGold: 4 },
    implementationStatus: "implemented",
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
    // "At the beginning of your turn, choose one: 1. Search the Ability card
    // deck for a Necromancy card and put it in your hand. 2. Take 1 Specialty
    // card from your discard pile to your hand."
    effect: { type: "TURN_START_NECROMANCY" },
    implementationStatus: "implemented",
    source: townSource("necropolis")
  },
  "necropolis.cover_of_darkness": {
    id: "necropolis.cover_of_darkness",
    name: "Cover of Darkness",
    faction: "necropolis",
    cost: { gold: 6, buildingMaterials: 4, valuables: 1 },
    // "During your turn, choose one: 1. Discard up to 2 Might and Magic cards
    // to draw that many cards. 2. At the beginning of Combat with an Enemy
    // Hero, discard 1 random card from the enemy's hand."
    effect: { type: "COVER_OF_DARKNESS" },
    implementationStatus: "implemented",
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
    // "At the beginning of each Resource round, roll 1 Resource die and gain
    // the rolled resources."
    effect: { type: "RESOURCE_ROUND_RESOURCE_DIE" },
    implementationStatus: "implemented",
    source: townSource("rampart")
  },
  "rampart.saplings": {
    id: "rampart.saplings",
    name: "Saplings",
    faction: "rampart",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    // "At the beginning of each Astrologers' round, instantly Reinforce 1 of
    // your bronze or silver units for half of the gold cost."
    effect: { type: "ASTROLOGERS_HALF_GOLD_REINFORCE", tiers: ["bronze", "silver"] },
    implementationStatus: "implemented",
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
    // "During your turn, choose one: 1. Pay 3 gold to discard 1 random card
    // from your opponent's hand. 2. If your Hero is in a Town or Settlement,
    // move them to another Town or Settlement under your control."
    effect: { type: "CASTLE_GATE", discardCost: 3 },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },
  "inferno.brimstone_stormclouds": {
    id: "inferno.brimstone_stormclouds",
    name: "Brimstone Stormclouds",
    faction: "inferno",
    cost: { gold: 6, buildingMaterials: 3, valuables: 2 },
    // "When built and at the beginning of each Astrologers' round, place your
    // faction cube here (to a maximum of 3). During any Combat, you can
    // remove them to gain +1 Power per cube. Only one cube per spell."
    effect: { type: "COMBAT_CUBES", max: 3, gainOn: "astrologers", spend: "spell-power" },
    implementationStatus: "implemented",
    source: townSource("inferno")
  },

  // ---- Stronghold (expansion) --------------------------------------------
  "stronghold.city_hall": {
    id: "stronghold.city_hall",
    name: "City Hall",
    faction: "stronghold",
    cost: { gold: 10, buildingMaterials: 4 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Draw 2 cards from the Might & Magic deck", drawCards: 2 },
        { label: "Gain 2 building materials", buildingMaterials: 2 }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.citadel": {
    id: "stronghold.citadel",
    name: "Citadel",
    faction: "stronghold",
    cost: { gold: 8, buildingMaterials: 4, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.mage_guild": {
    id: "stronghold.mage_guild",
    name: "Mage Guild",
    faction: "stronghold",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 6,
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.dwelling_bronze": {
    id: "stronghold.dwelling_bronze",
    name: "Barracks Tower",
    faction: "stronghold",
    cost: { gold: 4, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.dwelling_silver": {
    id: "stronghold.dwelling_silver",
    name: "Fort under the Nest",
    faction: "stronghold",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["stronghold.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.dwelling_gold": {
    id: "stronghold.dwelling_gold",
    name: "Mountain Caves",
    faction: "stronghold",
    cost: { gold: 10, buildingMaterials: 8, valuables: 4 },
    prerequisites: ["stronghold.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.hall_of_valhalla": {
    id: "stronghold.hall_of_valhalla",
    name: "Hall of Valhalla",
    faction: "stronghold",
    cost: { gold: 8, buildingMaterials: 3 },
    // "Once per round, one of your units gains +1 attack to a single attack."
    effect: { type: "HALL_OF_VALHALLA", amount: 1 },
    implementationStatus: "implemented",
    source: townSource("stronghold")
  },
  "stronghold.freelancers_guild": {
    id: "stronghold.freelancers_guild",
    name: "Freelancer's Guild",
    faction: "stronghold",
    cost: { gold: 2, buildingMaterials: 2, valuables: 1 },
    // "Each time you win against Neutral Units, gain 1 gold. When Reinforcing
    // or Recruiting you can use building materials and valuables like gold."
    effect: { type: "FREELANCERS_GUILD", winGold: 1 },
    implementationStatus: "implemented",
    source: townSource("stronghold")
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
    // "At the beginning of your turn, you can draw 1 Neutral Unit card from
    // decks corresponding to the Dwellings in your Town and pay the
    // Recruitment cost to Recruit this unit."
    effect: { type: "TURN_START_PORTAL_SUMMON" },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },
  "dungeon.mana_vortex": {
    id: "dungeon.mana_vortex",
    name: "Mana Vortex",
    faction: "dungeon",
    cost: { gold: 6, buildingMaterials: 4, valuables: 1 },
    // "At the beginning of your turn, discard 1 card from your hand to
    // shuffle your discard pile back into your deck of Might and Magic.
    // Then Search(3) from it."
    effect: { type: "TURN_START_MANA_VORTEX" },
    implementationStatus: "implemented",
    source: townSource("dungeon")
  },

  // ---- Tower (expansion) -------------------------------------------------
  "tower.city_hall": {
    id: "tower.city_hall",
    name: "City Hall",
    faction: "tower",
    cost: { gold: 10, buildingMaterials: 4 },
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 4 gold", gold: 4 },
        { label: "Draw 1 card from your deck", drawCards: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.citadel": {
    id: "tower.citadel",
    name: "Citadel",
    faction: "tower",
    cost: { gold: 8, buildingMaterials: 5, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.mage_guild": {
    id: "tower.mage_guild",
    name: "Mage Guild",
    faction: "tower",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.dwelling_bronze": {
    id: "tower.dwelling_bronze",
    name: "Alchemical Workshop",
    faction: "tower",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.dwelling_silver": {
    id: "tower.dwelling_silver",
    name: "Enchanted Towers",
    faction: "tower",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["tower.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.dwelling_gold": {
    id: "tower.dwelling_gold",
    name: "Golden Temples",
    faction: "tower",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["tower.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.artifact_merchants": {
    id: "tower.artifact_merchants",
    name: "Artifact Merchants",
    faction: "tower",
    cost: { gold: 8, buildingMaterials: 6, valuables: 1 },
    // "During your turn, choose one: 1. Pay 7 gold to Search(2) Artifacts.
    // 2. Remove an Artifact card from your hand to gain 2 gold." Also the
    // artifact source that unlocks the BINH Major/Relic decks at hero level 4/6.
    effect: { type: "ARTIFACT_SMITH", searchCost: 7, sellGold: 2 },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  "tower.wall_of_knowledge": {
    id: "tower.wall_of_knowledge",
    name: "Wall of Knowledge",
    faction: "tower",
    cost: { gold: 6, buildingMaterials: 4, valuables: 1 },
    // "At the beginning of each Astrologers' round, you can take 1 Knowledge
    // or 1 Power Statistic card from your discard pile to your hand."
    effect: { type: "ASTROLOGERS_TAKE_STATISTIC" },
    implementationStatus: "implemented",
    source: townSource("tower")
  },
  // ---- Fortress (expansion) ----------------------------------------------
  "fortress.city_hall": {
    id: "fortress.city_hall",
    name: "City Hall",
    faction: "fortress",
    cost: { gold: 10, buildingMaterials: 4 },
    // "At the beginning of each Resource round, choose: 5 gold — OR — exchange
    // resources like in the Trading Post."
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 5 gold", gold: 5 },
        { label: "Exchange resources (Trading Post)", tradingPost: true }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.citadel": {
    id: "fortress.citadel",
    name: "Citadel",
    faction: "fortress",
    cost: { gold: 8, buildingMaterials: 5, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.mage_guild": {
    id: "fortress.mage_guild",
    name: "Mage Guild",
    faction: "fortress",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.dwelling_bronze": {
    id: "fortress.dwelling_bronze",
    name: "Den",
    faction: "fortress",
    cost: { gold: 5, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.dwelling_silver": {
    id: "fortress.dwelling_silver",
    name: "Swamp Lairs",
    faction: "fortress",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["fortress.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.dwelling_gold": {
    id: "fortress.dwelling_gold",
    name: "Nest upon the Pond",
    faction: "fortress",
    cost: { gold: 10, buildingMaterials: 9, valuables: 4 },
    prerequisites: ["fortress.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.blood_obelisk": {
    id: "fortress.blood_obelisk",
    name: "Blood Obelisk",
    faction: "fortress",
    cost: { gold: 6, buildingMaterials: 6 },
    // "At the beginning of each Resource round or instantly, after your Town
    // has been sieged, you can Search(4) your discard pile." The recurring
    // Resource-round Search is wired; the post-siege instant is noted only.
    effect: { type: "RESOURCE_ROUND_SEARCH_DISCARD", count: 4 },
    implementationStatus: "implemented",
    source: townSource("fortress")
  },
  "fortress.cage_of_warlords": {
    id: "fortress.cage_of_warlords",
    name: "Cage of Warlords",
    faction: "fortress",
    cost: { gold: 6, buildingMaterials: 4, valuables: 1 },
    // "When built and at the beginning of each Resource round, place a faction
    // cube here (to a maximum of 2). During any Combat, a player can remove
    // them to gain +1 attack or +1 defense per 1 cube."
    effect: { type: "COMBAT_CUBES", max: 2, gainOn: "resource", spend: "attack-or-defense" },
    implementationStatus: "implemented",
    source: townSource("fortress")
  }
};

// Classic town-screen renders for every building (heroes.thelazy.net);
// bronze/silver/gold dwellings use a fitting low/mid/high PC dwelling.
for (const building of Object.values(coreBuildingDefinitions)) {
  const [faction, key] = building.id.split(".");
  const image = TOWN_BUILDING_IMAGES[faction]?.[key];
  if (image) {
    building.assets = { ...building.assets, image };
  }
}

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
    portrait: "/assets/hero_boardart-catherine.webp",
    boardScan: "/assets/heroes-castle-might-catherine.webp",
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
    portrait: "/assets/hero_boardart-rion.webp",
    boardScan: "/assets/heroes-castle-magic-rion.webp",
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
    portrait: "/assets/hero_boardart-sandro.webp",
    boardScan: "/assets/heroes-necropolis-magic-sandro.webp",
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
    portrait: "/assets/hero_boardart-tamika.webp",
    boardScan: "/assets/heroes-necropolis-might-tamika.webp",
    source: heroSource("tamika")
  },
  moandor: {
    id: "moandor",
    name: "Moandor",
    faction: "necropolis",
    class: "Death Knight",
    type: "might",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.necromancy",
    specialtyCardIds: {
      1: "specialty.moandor.1",
      4: "specialty.moandor.4",
      6: "specialty.moandor.6"
    },
    // Moandor's printed hero board is not on the fan wiki, so there is no board
    // scan to crop. The portrait is the classic PC hero portrait from
    // heroes.thelazy.net (upscaled, hosted locally).
    portrait: "/assets/hero_portraits-moandor.webp",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit:
        "Hero board data from the fan wiki; the printed board is not on the wiki, so the portrait is the classic PC hero portrait from heroes.thelazy.net (upscaled, hosted locally). Verify against official components before final release.",
      url: "https://heroes.thelazy.net/index.php/Moandor"
    }
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
    portrait: "/assets/hero_boardart-gelu.webp",
    boardScan: "/assets/heroes-rampart-might-gelu.webp",
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
    portrait: "/assets/hero_boardart-gem.webp",
    boardScan: "/assets/heroes-rampart-magic-gem.webp",
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
    portrait: "/assets/hero_boardart-xyron.webp",
    boardScan: "/assets/heroes-inferno-magic-xyron.webp",
    source: heroSource("xyron")
  },
  zydar: {
    id: "zydar",
    name: "Zydar",
    faction: "inferno",
    class: "Heretic",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: {
      1: "specialty.zydar.1",
      4: "specialty.zydar.4",
      6: "specialty.zydar.6"
    },
    portrait: "/assets/hero_boardart-zydar.webp",
    boardScan: "/assets/heroes-inferno-magic-zydar.webp",
    source: heroSource("zydar")
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
    portrait: "/assets/hero_boardart-rashka.webp",
    boardScan: "/assets/heroes-inferno-might-rashka.webp",
    source: heroSource("rashka")
  },
  crag_hack: {
    id: "crag_hack",
    name: "Crag Hack",
    faction: "stronghold",
    class: "Barbarian",
    type: "might",
    startingStats: { attack: 4, defense: 0, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: {
      1: "specialty.crag_hack.1",
      4: "specialty.crag_hack.4",
      6: "specialty.crag_hack.6"
    },
    portrait: "/assets/hero_boardart-crag_hack.webp",
    boardScan: "/assets/heroes-stronghold-might-crag_hack.webp",
    source: heroSource("crag_hack")
  },
  dessa: {
    id: "dessa",
    name: "Dessa",
    faction: "stronghold",
    class: "Battle Mage",
    type: "magic",
    startingStats: { attack: 2, defense: 1, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.logistics",
    specialtyCardIds: {
      1: "specialty.dessa.1",
      4: "specialty.dessa.4",
      6: "specialty.dessa.6"
    },
    portrait: "/assets/hero_boardart-dessa.webp",
    boardScan: "/assets/heroes-stronghold-magic-dessa.webp",
    source: heroSource("dessa")
  },
  gundula: {
    id: "gundula",
    name: "Gundula",
    faction: "stronghold",
    class: "Battle Mage",
    type: "magic",
    startingStats: { attack: 2, defense: 1, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.gundula.1",
      4: "specialty.gundula.4",
      6: "specialty.gundula.6"
    },
    portrait: "/assets/hero_boardart-gundula.webp",
    boardScan: "/assets/heroes-stronghold-magic-gundula.webp",
    source: heroSource("gundula")
  },
  shiva: {
    id: "shiva",
    name: "Shiva",
    faction: "stronghold",
    class: "Barbarian",
    type: "might",
    startingStats: { attack: 4, defense: 0, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.scouting",
    specialtyCardIds: {
      1: "specialty.shiva.1",
      4: "specialty.shiva.4",
      6: "specialty.shiva.6"
    },
    portrait: "/assets/hero_boardart-shiva.webp",
    boardScan: "/assets/heroes-stronghold-might-shiva.webp",
    source: heroSource("shiva")
  },
  tarnum_stronghold: {
    id: "tarnum_stronghold",
    name: "Tarnum",
    faction: "stronghold",
    class: "Barbarian",
    type: "might",
    startingStats: { attack: 4, defense: 0, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: {
      1: "specialty.tarnum_stronghold.1",
      4: "specialty.tarnum_stronghold.4",
      6: "specialty.tarnum_stronghold.6"
    },
    portrait: "/assets/hero_boardart-tarnum_stronghold.webp",
    boardScan: "/assets/heroes-stronghold-might-tarnum_stronghold.webp",
    source: heroSource("tarnum_stronghold")
  },
  yog: {
    id: "yog",
    name: "Yog",
    faction: "stronghold",
    class: "Barbarian",
    type: "might",
    startingStats: { attack: 4, defense: 0, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: {
      1: "specialty.yog.1",
      4: "specialty.yog.4",
      6: "specialty.yog.6"
    },
    portrait: "/assets/hero_boardart-yog.webp",
    boardScan: "/assets/heroes-stronghold-might-yog.webp",
    source: heroSource("yog")
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
    portrait: "/assets/hero_boardart-alamar.webp",
    boardScan: "/assets/heroes-dungeon-magic-alamar.webp",
    source: heroSource("alamar")
  },
  // Deemer (Dungeon Warlock): the Meteor Shower specialist — see
  // specialty.deemer.1/4/6 in src/data/cards/adventure.ts.
  deemer: {
    id: "deemer",
    name: "Deemer",
    faction: "dungeon",
    class: "Warlock",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 3, knowledge: 2 },
    startingAbilityCardId: "ability.scouting",
    specialtyCardIds: {
      1: "specialty.deemer.1",
      4: "specialty.deemer.4",
      6: "specialty.deemer.6"
    },
    portrait: "/assets/hero_boardart-deemer.webp",
    boardScan: "/assets/heroes-dungeon-magic-deemer.webp",
    source: heroSource("deemer")
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
    portrait: "/assets/hero_boardart-mutare.webp",
    boardScan: "/assets/heroes-dungeon-might-mutare.webp",
    source: heroSource("mutare")
  },

  // ---- Tower (expansion) -------------------------------------------------
  dracon: {
    id: "dracon",
    name: "Dracon",
    faction: "tower",
    class: "Wizard",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 2, knowledge: 3 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.dracon.1",
      4: "specialty.dracon.4",
      6: "specialty.dracon.6"
    },
    portrait: "/assets/hero_boardart-dracon.webp",
    boardScan: "/assets/heroes-tower-magic-dracon.webp",
    source: towerHeroSource("dracon")
  },
  iona: {
    id: "iona",
    name: "Iona",
    faction: "tower",
    class: "Alchemist",
    type: "might",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.intelligence",
    specialtyCardIds: {
      1: "specialty.iona.1",
      4: "specialty.iona.4",
      6: "specialty.iona.6"
    },
    portrait: "/assets/hero_boardart-iona.webp",
    boardScan: "/assets/heroes-tower-might-iona.webp",
    source: towerHeroSource("iona")
  },
  josephine: {
    id: "josephine",
    name: "Josephine",
    faction: "tower",
    class: "Alchemist",
    type: "might",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: {
      1: "specialty.josephine.1",
      4: "specialty.josephine.4",
      6: "specialty.josephine.6"
    },
    portrait: "/assets/hero_boardart-josephine.webp",
    boardScan: "/assets/heroes-tower-might-josephine.webp",
    source: towerHeroSource("josephine")
  },
  solmyr: {
    id: "solmyr",
    name: "Solmyr",
    faction: "tower",
    class: "Wizard",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 2, knowledge: 3 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: {
      1: "specialty.solmyr.1",
      4: "specialty.solmyr.4",
      6: "specialty.solmyr.6"
    },
    portrait: "/assets/hero_boardart-solmyr.webp",
    boardScan: "/assets/heroes-tower-magic-solmyr.webp",
    source: towerHeroSource("solmyr")
  },
  cyra: {
    id: "cyra",
    name: "Cyra",
    faction: "tower",
    class: "Wizard",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 2, knowledge: 3 },
    startingAbilityCardId: "ability.diplomacy",
    specialtyCardIds: {
      1: "specialty.cyra.1",
      4: "specialty.cyra.4",
      6: "specialty.cyra.6"
    },
    portrait: "/assets/hero_portraits-cyra.webp",
    source: towerPcPortraitHeroSource("cyra", "Cyra")
  },
  torosar: {
    id: "torosar",
    name: "Torosar",
    faction: "tower",
    class: "Wizard",
    type: "might",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.mysticism",
    specialtyCardIds: {
      1: "specialty.torosar.1",
      4: "specialty.torosar.4",
      6: "specialty.torosar.6"
    },
    portrait: "/assets/hero_portraits-torosar.webp",
    source: towerPcPortraitHeroSource("torosar", "Torosar")
  },
  bron: {
    id: "bron",
    name: "Bron",
    faction: "fortress",
    class: "Beastmaster",
    type: "might",
    startingStats: { attack: 0, defense: 4, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.resistance",
    specialtyCardIds: {
      1: "specialty.bron.1",
      4: "specialty.bron.4",
      6: "specialty.bron.6"
    },
    portrait: "/assets/hero_boardart-bron.webp",
    boardScan: "/assets/heroes-fortress-might-bron.webp",
    source: heroSource("bron")
  },
  wystan: {
    id: "wystan",
    name: "Wystan",
    faction: "fortress",
    class: "Beastmaster",
    type: "might",
    startingStats: { attack: 0, defense: 4, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.archery",
    specialtyCardIds: {
      1: "specialty.wystan.1",
      4: "specialty.wystan.4",
      6: "specialty.wystan.6"
    },
    portrait: "/assets/hero_boardart-wystan.webp",
    boardScan: "/assets/heroes-fortress-might-wystan.webp",
    source: heroSource("wystan")
  },

  // ---- Additional heroes (fan-wiki "Regular Stretch Goals 2024") ---------
  // Each ships with its real printed board scan + cropped portrait + the three
  // specialty card faces (see scripts/fetch-extra-heroes-art.py). Stats and
  // starting ability transcribed from each hero's wiki page.
  fiona: {
    id: "fiona",
    name: "Fiona",
    faction: "inferno",
    class: "Demoniac",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.scouting",
    specialtyCardIds: {
      1: "specialty.fiona.1",
      4: "specialty.fiona.4",
      6: "specialty.fiona.6"
    },
    portrait: "/assets/hero_boardart-fiona.webp",
    boardScan: "/assets/heroes-inferno-might-fiona.webp",
    source: stretchGoalHeroSource("fiona")
  },
  mephala: {
    id: "mephala",
    name: "Mephala",
    faction: "rampart",
    class: "Ranger",
    type: "might",
    startingStats: { attack: 1, defense: 3, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: {
      1: "specialty.mephala.1",
      4: "specialty.mephala.4",
      6: "specialty.mephala.6"
    },
    portrait: "/assets/hero_boardart-mephala.webp",
    boardScan: "/assets/heroes-rampart-might-mephala.webp",
    source: stretchGoalHeroSource("mephala")
  },
  clancy: {
    id: "clancy",
    name: "Clancy",
    faction: "rampart",
    class: "Ranger",
    type: "might",
    startingStats: { attack: 1, defense: 3, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.pathfinding",
    specialtyCardIds: {
      1: "specialty.clancy.1",
      4: "specialty.clancy.4",
      6: "specialty.clancy.6"
    },
    portrait: "/assets/hero_boardart-clancy.webp",
    boardScan: "/assets/heroes-rampart-might-clancy.webp",
    source: stretchGoalHeroSource("clancy")
  },
  adelaide: {
    id: "adelaide",
    name: "Adelaide",
    faction: "castle",
    class: "Cleric",
    type: "magic",
    startingStats: { attack: 1, defense: 0, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.adelaide.1",
      4: "specialty.adelaide.4",
      6: "specialty.adelaide.6"
    },
    portrait: "/assets/hero_boardart-adelaide.webp",
    boardScan: "/assets/heroes-castle-magic-adelaide.webp",
    source: stretchGoalHeroSource("adelaide")
  },

  // ---- Additional heroes, batch 2 (fan-wiki, real board art) -------------
  // Each ships with its printed board scan + cropped portrait + three specialty
  // card faces (scripts/fetch-extra-heroes-art-batch2.py). Stats, class and
  // starting ability transcribed from each hero's wiki page. Every I/IV/VI
  // specialty runs in the engine (extra-heroes-batch2-specialties.test.ts).
  lord_haart: {
    id: "lord_haart",
    name: "Lord Haart",
    faction: "castle",
    class: "Knight",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.estates",
    specialtyCardIds: {
      1: "specialty.lord_haart.1",
      4: "specialty.lord_haart.4",
      6: "specialty.lord_haart.6"
    },
    portrait: "/assets/hero_boardart-lord_haart.webp",
    boardScan: "/assets/heroes-castle-might-lord_haart.webp",
    source: wikiBoardHeroSource("lord_haart_castle")
  },
  jeddite: {
    id: "jeddite",
    name: "Jeddite",
    faction: "dungeon",
    class: "Warlock",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 3, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: {
      1: "specialty.jeddite.1",
      4: "specialty.jeddite.4",
      6: "specialty.jeddite.6"
    },
    portrait: "/assets/hero_boardart-jeddite.webp",
    boardScan: "/assets/heroes-dungeon-magic-jeddite.webp",
    source: wikiBoardHeroSource("jeddite")
  },
  tazar: {
    id: "tazar",
    name: "Tazar",
    faction: "fortress",
    class: "Beastmaster",
    type: "might",
    startingStats: { attack: 0, defense: 4, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.armorer",
    specialtyCardIds: {
      1: "specialty.tazar.1",
      4: "specialty.tazar.4",
      6: "specialty.tazar.6"
    },
    portrait: "/assets/hero_boardart-tazar.webp",
    boardScan: "/assets/heroes-fortress-might-tazar.webp",
    source: wikiBoardHeroSource("tazar")
  },
  adrienne: {
    id: "adrienne",
    name: "Adrienne",
    faction: "fortress",
    class: "Witch",
    type: "magic",
    startingStats: { attack: 0, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: {
      1: "specialty.adrienne.1",
      4: "specialty.adrienne.4",
      6: "specialty.adrienne.6"
    },
    portrait: "/assets/hero_boardart-adrienne.webp",
    boardScan: "/assets/heroes-fortress-magic-adrienne.webp",
    source: wikiBoardHeroSource("adrienne")
  },
  vidomina: {
    id: "vidomina",
    name: "Vidomina",
    faction: "necropolis",
    class: "Necromancer",
    type: "magic",
    startingStats: { attack: 1, defense: 0, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.necromancy",
    specialtyCardIds: {
      1: "specialty.vidomina.1",
      4: "specialty.vidomina.4",
      6: "specialty.vidomina.6"
    },
    portrait: "/assets/hero_boardart-vidomina.webp",
    boardScan: "/assets/heroes-necropolis-magic-vidomina.webp",
    source: wikiBoardHeroSource("vidomina")
  },

  // ---- Additional heroes, batch 3 ---------------------------------------
  // Four "Regular Stretch Goals 2024" heroes whose fan-wiki pages still show the
  // deck-back placeholder, so they ship the classic PC portrait (heroes.thelazy.net,
  // like Moandor/Cyra/Torosar). Lord Haart (Necropolis) IS on the wiki with his
  // real printed board + specialty faces. Every I/IV/VI specialty runs in the
  // engine and is mutation-checked (extra-heroes-batch3-specialties.test.ts).
  valeska: {
    id: "valeska",
    name: "Valeska",
    faction: "castle",
    class: "Knight",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.archery",
    specialtyCardIds: {
      1: "specialty.valeska.1",
      4: "specialty.valeska.4",
      6: "specialty.valeska.6"
    },
    portrait: "/assets/hero_portraits-valeska.webp",
    source: stretchGoalPcPortraitHeroSource("valeska", "Valeska")
  },
  ingham: {
    id: "ingham",
    name: "Ingham",
    faction: "castle",
    class: "Cleric",
    type: "magic",
    startingStats: { attack: 1, defense: 0, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.mysticism",
    specialtyCardIds: {
      1: "specialty.ingham.1",
      4: "specialty.ingham.4",
      6: "specialty.ingham.6"
    },
    portrait: "/assets/hero_portraits-ingham.webp",
    source: stretchGoalPcPortraitHeroSource("ingham", "Ingham")
  },
  lorelei: {
    id: "lorelei",
    name: "Lorelei",
    faction: "dungeon",
    class: "Overlord",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.scouting",
    specialtyCardIds: {
      1: "specialty.lorelei.1",
      4: "specialty.lorelei.4",
      6: "specialty.lorelei.6"
    },
    portrait: "/assets/hero_portraits-lorelei.webp",
    source: stretchGoalPcPortraitHeroSource("lorelei", "Lorelei")
  },
  septienna: {
    id: "septienna",
    name: "Septienna",
    faction: "necropolis",
    class: "Necromancer",
    type: "magic",
    startingStats: { attack: 1, defense: 0, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.necromancy",
    specialtyCardIds: {
      1: "specialty.septienna.1",
      4: "specialty.septienna.4",
      6: "specialty.septienna.6"
    },
    portrait: "/assets/hero_portraits-septienna.webp",
    source: stretchGoalPcPortraitHeroSource("septienna", "Septienna")
  },
  // Lord Haart (Necropolis): the undead Death Knight version of Lord Haart, a
  // separate hero from the Castle Knight (id `lord_haart`). His real printed board
  // and the three Dread Knights specialty faces are on the fan wiki.
  lord_haart_necropolis: {
    id: "lord_haart_necropolis",
    name: "Lord Haart",
    faction: "necropolis",
    class: "Death Knight",
    type: "might",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.necromancy",
    specialtyCardIds: {
      1: "specialty.lord_haart_necropolis.1",
      4: "specialty.lord_haart_necropolis.4",
      6: "specialty.lord_haart_necropolis.6"
    },
    portrait: "/assets/hero_boardart-lord_haart_necropolis.webp",
    boardScan: "/assets/heroes-necropolis-might-lord_haart_necropolis.webp",
    source: wikiBoardHeroSource("lord_haart_necropolis")
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
    heroes: ["catherine", "rion", "adelaide", "lord_haart", "valeska", "ingham"],
    buildings: buildingsOfFaction("castle"),
    units: unitsOfFaction("castle"),
    townImage: "/assets/towns-castle-empty.webp",
    source: townSource("castle")
  },
  rampart: {
    id: "rampart",
    name: "Rampart",
    color: "#2e9e57",
    startingTileId: "S4",
    heroes: ["gelu", "gem", "clancy", "mephala"],
    buildings: buildingsOfFaction("rampart"),
    units: unitsOfFaction("rampart"),
    townImage: "/assets/towns-rampart-empty.webp",
    source: townSource("rampart")
  },
  inferno: {
    id: "inferno",
    name: "Inferno",
    color: "#e07020",
    startingTileId: "S6",
    heroes: ["xyron", "rashka", "zydar", "fiona"],
    buildings: buildingsOfFaction("inferno"),
    units: unitsOfFaction("inferno"),
    townImage: "/assets/towns-inferno-empty.webp",
    source: townSource("inferno")
  },
  stronghold: {
    id: "stronghold",
    name: "Stronghold",
    color: "#b06a2d",
    startingTileId: "S7",
    heroes: ["crag_hack", "dessa", "gundula", "shiva", "tarnum_stronghold", "yog"],
    buildings: buildingsOfFaction("stronghold"),
    units: unitsOfFaction("stronghold"),
    townImage: "/assets/towns-stronghold-empty.webp",
    source: townSource("stronghold")
  },
  necropolis: {
    id: "necropolis",
    name: "Necropolis",
    color: "#7c4dbe",
    startingTileId: "S1",
    heroes: ["sandro", "tamika", "moandor", "vidomina", "septienna", "lord_haart_necropolis"],
    buildings: buildingsOfFaction("necropolis"),
    units: unitsOfFaction("necropolis"),
    ignoresMorale: true,
    townImage: "/assets/towns-necropolis-empty.webp",
    source: townSource("necropolis")
  },
  dungeon: {
    id: "dungeon",
    name: "Dungeon",
    color: "#c0392b",
    startingTileId: "S2",
    heroes: ["alamar", "deemer", "mutare", "jeddite", "lorelei"],
    buildings: buildingsOfFaction("dungeon"),
    units: unitsOfFaction("dungeon"),
    townImage: "/assets/towns-dungeon-empty.webp",
    source: townSource("dungeon")
  },
  tower: {
    id: "tower",
    name: "Tower",
    color: "#2bb3c0",
    startingTileId: "#S1",
    heroes: ["cyra", "dracon", "iona", "josephine", "solmyr", "torosar"],
    buildings: buildingsOfFaction("tower"),
    units: unitsOfFaction("tower"),
    townImage: "/assets/towns-tower-empty.webp",
    source: townSource("tower")
  },
  fortress: {
    id: "fortress",
    name: "Fortress",
    color: "#6b8e23",
    startingTileId: "S5",
    heroes: ["bron", "wystan", "tazar", "adrienne"],
    buildings: buildingsOfFaction("fortress"),
    units: unitsOfFaction("fortress"),
    source: townSource("fortress")
  }
};

/** Neutral unit definition ids grouped by tier, used to build the four neutral decks. */
export const neutralUnitIdsByTier: Record<"bronze" | "silver" | "gold" | "azure", string[]> = {
  bronze: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "bronze" && Boolean(unit.neutral))
    .map((unit) => unit.id),
  silver: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "silver" && Boolean(unit.neutral))
    .map((unit) => unit.id),
  gold: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "gold" && Boolean(unit.neutral))
    .map((unit) => unit.id),
  azure: Object.values(coreUnitDefinitions)
    .filter((unit) => unit.faction === "neutral" && unit.tier === "azure" && Boolean(unit.neutral))
    .map((unit) => unit.id)
};

/**
 * Which starting tile faces which faction, derived from the faction
 * definitions so the public faction data and the runtime setup map can never
 * drift apart. S1 = Necropolis, S2 = Dungeon, S3 = Castle (core box dirt/
 * cursed/subterranean tiles); S4 = Rampart, S6 = Inferno, S7 = Stronghold
 * (expansion tiles). S5 is the Fortress tile — that faction is not playable
 * yet, so no seat draws it.
 */
export const startingTileByFaction: Record<string, string> = Object.fromEntries(
  Object.values(coreFactionDefinitions).map((faction) => [faction.id, faction.startingTileId])
);
