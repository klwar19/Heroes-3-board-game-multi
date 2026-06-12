/**
 * Classic HoMM3 imagery for a non-profit fan project, downloaded from
 * heroes.thelazy.net (town pages like /index.php/Castle, resource and morale
 * icons) and hosted locally under /assets/town and /assets/icons — the wiki
 * blocks hot-linking in some browsers, so nothing is loaded remotely anymore.
 * Re-download with the filenames below if the art needs a refresh. Replace
 * with owned scans before any wider release.
 *
 * Hero portraits are handled the same way: the classic PC portraits
 * (heroes.thelazy.net/index.php/Hero_portraits, `Hero_<Name>.png`) are
 * upscaled and hosted locally as /assets/hero_portraits-<id>.webp, wired
 * through `HeroDefinition.portrait` in src/data/factions/core.ts.
 */

/**
 * Town-screen building renders per faction (heroes.thelazy.net town pages).
 * Dwellings map bronze/silver/gold to a fitting low/mid/high PC dwelling.
 */
export const TOWN_BUILDING_IMAGES: Record<string, Record<string, string>> = {
  castle: {
    city_hall: "/assets/town/castle_city_hall_large.gif",
    citadel: "/assets/town/castle_citadel_large.gif",
    mage_guild: "/assets/town/castle_mage_guild_level_1_large.gif",
    blacksmith: "/assets/town/castle_blacksmith_large.gif",
    dwelling_bronze: "/assets/town/castle_archers__tower.gif",
    dwelling_silver: "/assets/town/castle_monastery.gif",
    dwelling_gold: "/assets/town/castle_portal_of_glory.gif",
    brotherhood_of_the_sword: "/assets/town/castle_brotherhood_of_the_sword.gif"
  },
  rampart: {
    city_hall: "/assets/town/rampart_city_hall_large.gif",
    citadel: "/assets/town/rampart_citadel_large.gif",
    mage_guild: "/assets/town/rampart_mage_guild_level_1_large.gif",
    blacksmith: "/assets/town/rampart_blacksmith_large.gif",
    dwelling_bronze: "/assets/town/rampart_centaur_stables.gif",
    dwelling_silver: "/assets/town/rampart_dendroid_arches.gif",
    dwelling_gold: "/assets/town/rampart_dragon_cliffs.gif",
    mystic_pond: "/assets/town/rampart_mystic_pond.gif",
    saplings: "/assets/town/rampart_homestead.gif"
  },
  inferno: {
    city_hall: "/assets/town/inferno_city_hall_large.gif",
    citadel: "/assets/town/inferno_citadel_large.gif",
    mage_guild: "/assets/town/inferno_mage_guild_level_1_large.gif",
    blacksmith: "/assets/town/inferno_blacksmith_large.gif",
    dwelling_bronze: "/assets/town/inferno_imp_crucible.gif",
    dwelling_silver: "/assets/town/inferno_demon_gate.gif",
    dwelling_gold: "/assets/town/inferno_forsaken_palace.gif",
    castle_gate: "/assets/town/inferno_castle_gate.gif",
    brimstone_stormclouds: "/assets/town/inferno_kennels.gif"
  },
  necropolis: {
    city_hall: "/assets/town/necropolis_city_hall_large.gif",
    citadel: "/assets/town/necropolis_citadel_large.gif",
    mage_guild: "/assets/town/necropolis_mage_guild_level_1_large.gif",
    blacksmith: "/assets/town/necropolis_blacksmith_large.gif",
    dwelling_bronze: "/assets/town/necropolis_cursed_temple.gif",
    dwelling_silver: "/assets/town/necropolis_tomb_of_souls.gif",
    dwelling_gold: "/assets/town/necropolis_dragon_vault.gif",
    necromancy_amplifier: "/assets/town/necropolis_necromancy_amplifier.gif",
    cover_of_darkness: "/assets/town/necropolis_cover_of_darkness.gif"
  },
  dungeon: {
    city_hall: "/assets/town/dungeon_city_hall_large.gif",
    citadel: "/assets/town/dungeon_citadel_large.gif",
    mage_guild: "/assets/town/dungeon_mage_guild_level_1_large.gif",
    blacksmith: "/assets/town/dungeon_blacksmith_large.gif",
    dwelling_bronze: "/assets/town/dungeon_warren.gif",
    dwelling_silver: "/assets/town/dungeon_labyrinth.gif",
    dwelling_gold: "/assets/town/dungeon_dragon_cave.gif",
    portal_of_summoning: "/assets/town/dungeon_portal_of_summoning.gif",
    mana_vortex: "/assets/town/dungeon_mana_vortex.gif"
  }
};

/**
 * Classic resource-bar icons. The board game's three resources map to:
 * gold → gold pile, building materials → ore, valuables → crystal (per the
 * table owner's mapping of the uploaded reference image).
 */
export const RESOURCE_ICONS = {
  gold: "/assets/icons/gold_leather.gif",
  buildingMaterials: "/assets/icons/ore_leather.gif",
  valuables: "/assets/icons/crystal_leather.gif",
  wood: "/assets/icons/wood_leather.gif",
  gems: "/assets/icons/gem_leather.gif",
  mercury: "/assets/icons/mercury_leather.gif",
  sulfur: "/assets/icons/sulfur_leather.gif"
} as const;

/** Morale birds (good +1 / poor −1), as in the uploaded sprite reference. */
export const MORALE_ICONS = {
  positive: "/assets/icons/morale.gif",
  negative: "/assets/icons/morale-1.gif",
  neutral: "/assets/icons/moralen.gif"
} as const;

/**
 * The four hero statistics, cropped straight from the printed hero board
 * scans (crossed swords / shield / spell book / tomes) so the digital board
 * shows the exact same iconography.
 */
export const HERO_STAT_ICONS = {
  attack: "/assets/hero_board-stat-attack.webp",
  defense: "/assets/hero_board-stat-defense.webp",
  power: "/assets/hero_board-stat-power.webp",
  knowledge: "/assets/hero_board-stat-knowledge.webp"
} as const;
