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
  tower: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
  conflux: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
  cove: "Heroes of Might and Magic III: The Board Game (Cove Expansion)"
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
 * Source for the Conflux heroes: the fan wiki Conflux hero pages carry the full
 * printed board data (class, statistics, starting ability and the I/IV/VI
 * specialty rules), but no card/board scan yet — only placeholder art — so the
 * portrait is the classic PC hero portrait from heroes.thelazy.net (upscaled,
 * hosted locally), exactly like Moandor and the two PC-portrait Tower heroes.
 */
function confluxHeroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
    credit:
      "Hero class, statistics, starting ability and the I/IV/VI specialty rules transcribed from the fan wiki Conflux hero page. The printed board is not on the wiki yet (placeholder art), so the portrait is the classic PC hero portrait from heroes.thelazy.net (upscaled, hosted locally). Verify against official components before final release.",
    url: `https://en.homm3bg.wiki/heroes/${slug}/`
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
 * Source for the Cove heroes. The fan wiki Cove pages carry the hero roster,
 * class, statistics, starting ability and the I/IV/VI specialty rules, but no
 * printed board art yet, so the portrait is the classic PC hero portrait from
 * heroes.thelazy.net (hosted locally), exactly like the Tower PC-portrait heroes.
 */
function coveHeroSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
    credit:
      "Hero roster, class, statistics, starting ability and specialty rules from the fan wiki Cove pages. The printed board is not on the wiki yet, so the portrait is the classic PC hero portrait from heroes.thelazy.net (hosted locally). Verify against official components before final release.",
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
  // ---- Conflux (expansion) -----------------------------------------------
  "conflux.city_hall": {
    id: "conflux.city_hall",
    name: "City Hall",
    faction: "conflux",
    cost: { gold: 10, buildingMaterials: 3 },
    // "At the beginning of each Resource round, choose: 4 gold — OR — Search(3)
    // the Spell deck and take 1 Spell card to your hand."
    effect: {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Gain 4 gold", gold: 4 },
        { label: "Search(3) the Spell deck", searchSpellDeck: 3 }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.citadel": {
    id: "conflux.citadel",
    name: "Citadel",
    faction: "conflux",
    cost: { gold: 8, buildingMaterials: 4, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.mage_guild": {
    id: "conflux.mage_guild",
    name: "Mage Guild",
    faction: "conflux",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.dwelling_bronze": {
    id: "conflux.dwelling_bronze",
    name: "Altars of Air and Water",
    faction: "conflux",
    cost: { gold: 4, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.dwelling_silver": {
    id: "conflux.dwelling_silver",
    name: "Altars of Fire and Earth",
    faction: "conflux",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["conflux.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.dwelling_gold": {
    id: "conflux.dwelling_gold",
    name: "Magical Pyre",
    faction: "conflux",
    cost: { gold: 9, buildingMaterials: 8, valuables: 4 },
    prerequisites: ["conflux.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.garden_of_life": {
    id: "conflux.garden_of_life",
    name: "Garden of Life",
    faction: "conflux",
    cost: { gold: 2, buildingMaterials: 1, valuables: 1 },
    // "At the beginning of each round, Recruit or Reinforce Sprites for free."
    effect: { type: "ROUND_START_FREE_SPRITE", unitDefId: "conflux.sprites" },
    implementationStatus: "implemented",
    source: townSource("conflux")
  },
  "conflux.magic_university": {
    id: "conflux.magic_university",
    name: "Magic University",
    faction: "conflux",
    cost: { gold: 6, buildingMaterials: 3 },
    // "Once per round (at the start of your turn), choose a School of Magic and
    // discard cards from the top of your deck until you reveal a Spell of that
    // school, then take it to hand." (Magic Arrow, school 'any', matches every
    // school — the engine's standing convention.)
    effect: { type: "MAGIC_UNIVERSITY" },
    implementationStatus: "implemented",
    source: townSource("conflux")
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
  },

  // ---- Cove (expansion) --------------------------------------------------
  "cove.city_hall": {
    id: "cove.city_hall",
    name: "City Hall",
    faction: "cove",
    cost: { gold: 10, buildingMaterials: 4 },
    // "At the beginning of each Astrologers' round, choose: 4 gold — OR — remove
    // 1 Artifact card from your hand to gain 1 experience." The artifact→XP
    // option is only offered when the player actually holds an Artifact card.
    effect: {
      type: "ASTROLOGERS_ROUND_CHOICE",
      options: [
        { label: "Gain 4 gold", gold: 4 },
        {
          label: "Remove 1 Artifact card from your hand to gain 1 experience",
          experience: 1,
          removeArtifactFromHand: true
        }
      ]
    },
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.citadel": {
    id: "cove.citadel",
    name: "Citadel",
    faction: "cove",
    cost: { gold: 8, buildingMaterials: 4, valuables: 1 },
    effect: { type: "UNLOCK_REINFORCE" },
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.mage_guild": {
    id: "cove.mage_guild",
    name: "Mage Guild",
    faction: "cove",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    effect: { type: "MAGE_GUILD" },
    spellBookCost: 5,
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.dwelling_bronze": {
    id: "cove.dwelling_bronze",
    name: "Bay",
    faction: "cove",
    cost: { gold: 4, buildingMaterials: 3, valuables: 1 },
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" },
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.dwelling_silver": {
    id: "cove.dwelling_silver",
    name: "Nests Towering the Seas",
    faction: "cove",
    cost: { gold: 8, buildingMaterials: 6, valuables: 3 },
    prerequisites: ["cove.dwelling_bronze"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.dwelling_gold": {
    id: "cove.dwelling_gold",
    name: "Redoubled Vortex",
    faction: "cove",
    cost: { gold: 10, buildingMaterials: 8, valuables: 4 },
    prerequisites: ["cove.dwelling_silver"],
    effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.thieves_guild": {
    id: "cove.thieves_guild",
    name: "Thieves' Guild",
    faction: "cove",
    cost: { gold: 4, buildingMaterials: 2, valuables: 1 },
    // "Once during your turn, choose any one deck in the game (including another
    // player's M&M deck), look at its top 2 cards, and put one of them on its
    // discard pile and the other back on top of the deck." Wired as a
    // once-per-turn THIEVES_GUILD turn action: the offer lists every eligible
    // deck (each shared deck and each player's M&M deck with ≥2 cards), peeks the
    // top 2 privately, and the player picks which one to discard (the other goes
    // back on top). See thievesGuildAction / the "thieves-guild" OPTION_CHOICE.
    effect: { type: "THIEVES_GUILD" },
    implementationStatus: "implemented",
    source: townSource("cove")
  },
  "cove.pub": {
    id: "cove.pub",
    name: "Pub",
    faction: "cove",
    cost: { gold: 3, buildingMaterials: 2 },
    // "During each Astrologers' round, reduce one reinforcement's cost by 3 gold
    // (to a minimum of 0)." Modelled like the Saplings half-gold reinforce: a
    // once-per-Astrologers'-round CHOOSE_ONE offered at round start to reinforce
    // one owned Few unit (any tier) for 3 less gold, or Skip. The flat discount
    // is non-stacking with a Legion voucher / Stables discount on that unit.
    effect: { type: "ASTROLOGERS_FLAT_GOLD_REINFORCE", discount: 3, tiers: ["bronze", "silver", "gold"] },
    implementationStatus: "implemented",
    source: townSource("cove")
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

  // ---- Conflux (expansion) -----------------------------------------------
  // Four heroes wired: the unit-specialist Planeswalkers (Erdamon, Monere,
  // Pasis) and the Fire Wall Elementalist Luna. Still deferred: Ciele (Magic
  // Arrow) and Tarnum (Conflux, Enchanters) — their specialties need a
  // cast-a-Spell-from-discard / cast-over-the-one-per-round-limit subsystem the
  // engine does not have, and every shipped hero specialty must be implemented.
  erdamon: {
    id: "erdamon",
    name: "Erdamon",
    faction: "conflux",
    class: "Planeswalker",
    type: "might",
    startingStats: { attack: 3, defense: 1, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.estates",
    specialtyCardIds: {
      1: "specialty.erdamon.1",
      4: "specialty.erdamon.4",
      6: "specialty.erdamon.6"
    },
    portrait: "/assets/hero_portraits-erdamon.webp",
    source: confluxHeroSource("erdamon")
  },
  monere: {
    id: "monere",
    name: "Monere",
    faction: "conflux",
    class: "Planeswalker",
    type: "might",
    startingStats: { attack: 3, defense: 1, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.logistics",
    specialtyCardIds: {
      1: "specialty.monere.1",
      4: "specialty.monere.4",
      6: "specialty.monere.6"
    },
    portrait: "/assets/hero_portraits-monere.webp",
    source: confluxHeroSource("monere")
  },
  pasis: {
    id: "pasis",
    name: "Pasis",
    faction: "conflux",
    class: "Planeswalker",
    type: "might",
    startingStats: { attack: 3, defense: 1, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.artillery",
    specialtyCardIds: {
      1: "specialty.pasis.1",
      4: "specialty.pasis.4",
      6: "specialty.pasis.6"
    },
    portrait: "/assets/hero_portraits-pasis.webp",
    source: confluxHeroSource("pasis")
  },
  // Luna — Conflux Elementalist, the Fire Wall specialist (wiki: A0 D0 P2 K3,
  // starting ability Basic Fire Magic). I/IV/VI all engine-wired (Fire Wall
  // token placement + the spell-economy discard/Power choice).
  luna: {
    id: "luna",
    name: "Luna",
    faction: "conflux",
    class: "Elementalist",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 2, knowledge: 3 },
    startingAbilityCardId: "ability.basic_fire_magic",
    specialtyCardIds: {
      1: "specialty.luna.1",
      4: "specialty.luna.4",
      6: "specialty.luna.6"
    },
    portrait: "/assets/hero_portraits-luna.webp",
    source: confluxHeroSource("luna")
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
  },

  // ---- Additional heroes, batch 4 ---------------------------------------
  // Three "Regular Stretch Goals 2024" heroes whose fan-wiki pages still show the
  // deck-back placeholder, so (like Valeska/Ingham/Lorelei/Septienna) they ship
  // the classic PC portrait from heroes.thelazy.net — no board scan, no specialty
  // card faces. Every I/IV/VI specialty runs in the engine and is mutation-checked
  // (extra-heroes-batch4-specialties.test.ts); each introduces a new mechanic.
  ivor: {
    id: "ivor",
    name: "Ivor",
    faction: "rampart",
    class: "Ranger",
    type: "might",
    startingStats: { attack: 1, defense: 3, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: {
      1: "specialty.ivor.1",
      4: "specialty.ivor.4",
      6: "specialty.ivor.6"
    },
    portrait: "/assets/hero_portraits-ivor.webp",
    source: stretchGoalPcPortraitHeroSource("ivor", "Ivor")
  },
  // Tarnum (Castle): the Knight variant of Tarnum. The board game ships six Tarnum
  // heroes (one per Town); this is the Castle Ballista specialist. All six share
  // the one classic PC Tarnum portrait.
  tarnum_castle: {
    id: "tarnum_castle",
    name: "Tarnum",
    faction: "castle",
    class: "Knight",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.artillery",
    specialtyCardIds: {
      1: "specialty.tarnum_castle.1",
      4: "specialty.tarnum_castle.4",
      6: "specialty.tarnum_castle.6"
    },
    portrait: "/assets/hero_portraits-tarnum.webp",
    source: stretchGoalPcPortraitHeroSource("tarnum_castle", "Tarnum")
  },
  merist: {
    id: "merist",
    name: "Merist",
    faction: "fortress",
    class: "Witch",
    type: "magic",
    startingStats: { attack: 0, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.first_aid",
    specialtyCardIds: {
      1: "specialty.merist.1",
      4: "specialty.merist.4",
      6: "specialty.merist.6"
    },
    portrait: "/assets/hero_portraits-merist.webp",
    source: stretchGoalPcPortraitHeroSource("merist", "Merist")
  },

  // ---- Additional heroes, batch 5 ---------------------------------------
  // Eight "Regular Stretch Goals 2024" heroes that complete the roster of every
  // already-playable Town to match the fan wiki's hero list. Each fan-wiki page
  // shows only the deck-back placeholder (no printed board scan, no specialty card
  // faces), so — like Valeska/Ingham/batch-3/batch-4 — they ship the classic PC
  // hero portrait from heroes.thelazy.net and face-less specialty cards. Stats
  // follow the verified per-class board pattern; class, starting ability and the
  // I/IV/VI specialty rules are transcribed from each hero's wiki page. Every
  // specialty runs in the engine (extra-heroes-batch5-specialties.test.ts).
  ash: {
    id: "ash",
    name: "Ash",
    faction: "inferno",
    class: "Heretic",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.eagle_eye",
    specialtyCardIds: {
      1: "specialty.ash.1",
      4: "specialty.ash.4",
      6: "specialty.ash.6"
    },
    portrait: "/assets/hero_portraits-ash.webp",
    source: stretchGoalPcPortraitHeroSource("ash", "Ash")
  },
  gerwulf: {
    id: "gerwulf",
    name: "Gerwulf",
    faction: "fortress",
    class: "Beastmaster",
    type: "might",
    startingStats: { attack: 0, defense: 4, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.armorer",
    specialtyCardIds: {
      1: "specialty.gerwulf.1",
      4: "specialty.gerwulf.4",
      6: "specialty.gerwulf.6"
    },
    portrait: "/assets/hero_portraits-gerwulf.webp",
    source: stretchGoalPcPortraitHeroSource("gerwulf", "Gerwulf")
  },
  // Tarnum (Dungeon): the Overlord variant of Tarnum, the Dragons specialist. Its
  // own class portrait (heroes.thelazy.net Tarnum (Overlord)).
  tarnum_dungeon: {
    id: "tarnum_dungeon",
    name: "Tarnum",
    faction: "dungeon",
    class: "Overlord",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.estates",
    specialtyCardIds: {
      1: "specialty.tarnum_dungeon.1",
      4: "specialty.tarnum_dungeon.4",
      6: "specialty.tarnum_dungeon.6"
    },
    portrait: "/assets/hero_portraits-tarnum_overlord.webp",
    source: stretchGoalPcPortraitHeroSource("tarnum_dungeon", "Tarnum (Overlord)")
  },
  sephinroth: {
    id: "sephinroth",
    name: "Sephinroth",
    faction: "dungeon",
    class: "Warlock",
    type: "magic",
    startingStats: { attack: 0, defense: 0, power: 3, knowledge: 2 },
    startingAbilityCardId: "ability.intelligence",
    specialtyCardIds: {
      1: "specialty.sephinroth.1",
      4: "specialty.sephinroth.4",
      6: "specialty.sephinroth.6"
    },
    portrait: "/assets/hero_portraits-sephinroth.webp",
    source: stretchGoalPcPortraitHeroSource("sephinroth", "Sephinroth")
  },

  // ---- Cove (expansion) --------------------------------------------------
  // Roster, classes, starting stats and specialties from the fan wiki Cove hero
  // pages (Navigator = magic, Captain = might). No printed board art on the wiki
  // yet, so each hero uses its classic PC portrait (added by the Cove art
  // fetch script). Which specialties are engine-wired vs honestly deferred is
  // tracked in cove-content.test.ts and the content tracker.
  astra: {
    id: "astra",
    name: "Astra",
    faction: "cove",
    class: "Navigator",
    type: "magic",
    startingStats: { attack: 2, defense: 0, power: 1, knowledge: 2 },
    startingAbilityCardId: "ability.luck",
    specialtyCardIds: { 1: "specialty.astra.1", 4: "specialty.astra.4", 6: "specialty.astra.6" },
    portrait: "/assets/hero_portraits-astra.webp",
    source: coveHeroSource("astra")
  },
  cassiopeia: {
    id: "cassiopeia",
    name: "Cassiopeia",
    faction: "cove",
    class: "Captain",
    type: "might",
    startingStats: { attack: 3, defense: 0, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.cassiopeia.1", 4: "specialty.cassiopeia.4", 6: "specialty.cassiopeia.6" },
    portrait: "/assets/hero_portraits-cassiopeia.webp",
    source: coveHeroSource("cassiopeia")
  },
  // Jeremy — the Cannon specialist. Buys the Cove Cannon war machine (already in
  // permanents.ts) and fires its 2-damage shot from the specialty; all three
  // levels are engine-wired (see specialty.jeremy.* and cove-content.test.ts).
  jeremy: {
    id: "jeremy",
    name: "Jeremy",
    faction: "cove",
    class: "Captain",
    type: "might",
    startingStats: { attack: 3, defense: 0, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.jeremy.1", 4: "specialty.jeremy.4", 6: "specialty.jeremy.6" },
    portrait: "/assets/hero_portraits-jeremy.webp",
    source: coveHeroSource("jeremy")
  },
  // Zilare — the Forgetfulness specialist. Reuses the engine's FORGETFULNESS
  // effect (the chosen enemy cannot attack on its next activation, grade-gated)
  // with a draw / +2-Power alternative; all three levels are engine-wired (see
  // specialty.zilare.* and cove-content.test.ts).
  zilare: {
    id: "zilare",
    name: "Zilare",
    faction: "cove",
    class: "Navigator",
    type: "magic",
    startingStats: { attack: 2, defense: 0, power: 1, knowledge: 2 },
    startingAbilityCardId: "ability.interference",
    specialtyCardIds: { 1: "specialty.zilare.1", 4: "specialty.zilare.4", 6: "specialty.zilare.6" },
    portrait: "/assets/hero_portraits-zilare.webp",
    source: coveHeroSource("zilare")
  },
  // Miriam — the Scouting specialist. Reuses REMOVE_HAND_CARD_THEN_SEARCH: remove
  // a card from hand to Search its deck, with an optional "remove this Specialty"
  // variant; all three levels are engine-wired (see specialty.miriam.* and
  // cove-content.test.ts).
  miriam: {
    id: "miriam",
    name: "Miriam",
    faction: "cove",
    class: "Captain",
    type: "might",
    startingStats: { attack: 3, defense: 0, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.logistics",
    specialtyCardIds: { 1: "specialty.miriam.1", 4: "specialty.miriam.4", 6: "specialty.miriam.6" },
    portrait: "/assets/hero_portraits-miriam.webp",
    source: coveHeroSource("miriam")
  },
  // Casmetra (Navigator, magic, A2 D0 P1 K2, Wisdom): the Sorceresses specialist.
  // I/IV are the standard creature buffs (doubled for Sorceresses, reusing the
  // shared helpers like Cassiopeia). VI is a CHOICE — place the Cove Sorceresses'
  // −2 Weakness token on any unit for 2 rounds (new PLACE_WEAKNESS_TOKEN effect)
  // OR an instant FLAT +2 attack (no Sorceresses doubling). All three levels are
  // engine-wired and tested (specialty.casmetra.* and casmetra-specialty.test.ts).
  casmetra: {
    id: "casmetra",
    name: "Casmetra",
    faction: "cove",
    class: "Navigator",
    type: "magic",
    startingStats: { attack: 2, defense: 0, power: 1, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.casmetra.1", 4: "specialty.casmetra.4", 6: "specialty.casmetra.6" },
    portrait: "/assets/hero_portraits-casmetra.webp",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit:
        "Hero roster, class, statistics, starting ability and specialty rules from the fan wiki Cove pages. The real PC portrait could not be fetched in this environment (the art hosts block automated requests), so the portrait is a generated placeholder pending scripts/fetch-cove-art.py. Verify against official components before final release.",
      url: "https://en.homm3bg.wiki/heroes/casmetra/"
    }
  }
  // Four more wiki heroes complete the remaining rosters; their PC portraits are
  // already fetched and committed (scripts/fetch-extra-heroes-art-batch5.py:
  // octavia, melodia, tarnum_ranger, tarnum_beastmaster), but they are NOT yet
  // registered here because each has ONE signature specialty that needs an engine
  // subsystem not built yet — kept out rather than shipped as an inert stub:
  //   - Octavia (Inferno, Demoniac): "Gold" — I sets a rolled Resource die to its
  //     gold face reactively (an open resource-roll choice must be re-opened).
  //   - Melodia (Rampart, Druid): "Fortune" — VI increases the number of dice you
  //     roll at locations this turn (no per-turn location-dice modifier exists).
  //   - Tarnum (Rampart, Ranger): "Sharpshooters" — VI summons a Neutral-deck
  //     Sharpshooters into combat for that combat only (temporary-unit post-combat
  //     cleanup is not modelled).
  //   - Tarnum (Fortress, Beastmaster): "Basilisks" — VI makes a unit use its
  //     die-gated special ability regardless of the roll (spans many ability
  //     resolution points; no generic "force ability" hook exists).
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
    heroes: ["catherine", "rion", "adelaide", "lord_haart", "valeska", "ingham", "tarnum_castle"],
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
    heroes: ["gelu", "gem", "clancy", "mephala", "ivor"],
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
    heroes: ["xyron", "rashka", "zydar", "fiona", "ash"],
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
    heroes: ["alamar", "deemer", "mutare", "jeddite", "lorelei", "tarnum_dungeon", "sephinroth"],
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
    heroes: ["bron", "wystan", "tazar", "adrienne", "merist", "gerwulf"],
    buildings: buildingsOfFaction("fortress"),
    units: unitsOfFaction("fortress"),
    source: townSource("fortress")
  },
  conflux: {
    id: "conflux",
    name: "Conflux",
    color: "#d24dae",
    startingTileId: "S8",
    // The three unit-specialist Planeswalkers + Luna (Fire Wall) are wired;
    // Ciele and Tarnum (Conflux) follow once the cast-a-Spell-from-your-discard
    // / cast-over-the-limit subsystem their specialties need is built.
    heroes: ["erdamon", "monere", "pasis", "luna"],
    buildings: buildingsOfFaction("conflux"),
    units: unitsOfFaction("conflux"),
    townImage: "/assets/towns-conflux-empty.webp",
    source: townSource("conflux")
  },
  cove: {
    id: "cove",
    name: "Cove",
    // Deep sea teal — distinct from Castle's blue and Tower's cyan.
    color: "#0f8a99",
    // S9 is the Cove starting tile, already defined in expansion-tiles.ts.
    startingTileId: "S9",
    // All six Cove heroes are now registered (their specialties are fully
    // engine-wired and tested; see coreHeroDefinitions / cove-content.test.ts).
    heroes: ["astra", "cassiopeia", "jeremy", "zilare", "miriam", "casmetra"],
    buildings: buildingsOfFaction("cove"),
    units: unitsOfFaction("cove"),
    source: townSource("cove")
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
 * The Neutral Units deck card that depicts the same creature as a faction-roster
 * unit, recruitable at that faction's Dwelling tier — matched by creature name
 * + tier. The board game prints most town creatures both as a faction unit
 * (Few/Pack sides, recruited at the Dwelling) and as a single-sided Neutral Unit
 * (recruited from the deck at external dwellings). This returns that same-tier
 * neutral counterpart, or undefined when none exists. A faction's signature
 * top-tier creatures — Gold Dragons, Titans, Hydras — DO have a Neutral Unit
 * card, but it sits at the azure tier (neutral.gold_dragons / .titans / .hydras),
 * not the faction's gold tier; that azure card appears only as a high guard and
 * is not the gold-tier counterpart a Dwelling would recruit, so the name+tier
 * match deliberately returns undefined for them.
 */
export function neutralCounterpartId(factionUnitId: string): string | undefined {
  const unit = coreUnitDefinitions[factionUnitId];
  if (!unit) {
    return undefined;
  }
  return Object.values(coreUnitDefinitions).find(
    (candidate) =>
      candidate.faction === "neutral" &&
      Boolean(candidate.neutral) &&
      candidate.name === unit.name &&
      candidate.tier === unit.tier
  )?.id;
}

/**
 * Neutral Units deck cards "associated with" each faction — the same-tier neutral
 * counterpart of every unit on a faction's roster. Used by the Unexpected
 * Reinforcements proclamation, which lets a player search the Neutral Units deck
 * and recruit one neutral unit tied to their faction (added on the single-sided
 * Neutral side, so — like any neutral unit — it can never be reinforced to a
 * Pack). A faction's top-tier signature creature (Gold Dragons, Titans, Hydras)
 * is intentionally absent: its only neutral card is the azure-tier version, and
 * no Dwelling unlocks azure, so it is never recruitable this way (it still shows
 * up as an azure neutral guard via neutralUnitIdsByTier.azure).
 */
export const neutralUnitIdsByFaction: Record<string, string[]> = Object.fromEntries(
  Object.values(coreFactionDefinitions).map((faction) => [
    faction.id,
    faction.units
      .map((unitId) => neutralCounterpartId(unitId))
      .filter((id): id is string => Boolean(id))
  ])
);

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
