/**
 * Hot-linked classic HoMM3 imagery for a non-profit fan project.
 * Source: heroes.thelazy.net (town buildings, resource and morale icons —
 * all URLs verified). Replace with owned scans before any wider release.
 *
 * Hero portraits are no longer hot-linked: the classic PC portraits
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
    city_hall: "https://heroes.thelazy.net/images/a/ad/Castle_City_Hall_large.gif",
    citadel: "https://heroes.thelazy.net/images/1/1c/Castle_Citadel_large.gif",
    mage_guild: "https://heroes.thelazy.net/images/5/5a/Castle_Mage_Guild_level_1_large.gif",
    blacksmith: "https://heroes.thelazy.net/images/c/cd/Castle_Blacksmith_large.gif",
    dwelling_bronze: "https://heroes.thelazy.net/images/f/f5/Castle_Archers%27_Tower.gif",
    dwelling_silver: "https://heroes.thelazy.net/images/9/95/Castle_Monastery.gif",
    dwelling_gold: "https://heroes.thelazy.net/images/4/43/Castle_Portal_of_Glory.gif",
    brotherhood_of_the_sword: "https://heroes.thelazy.net/images/e/e5/Castle_Brotherhood_of_the_Sword.gif"
  },
  rampart: {
    city_hall: "https://heroes.thelazy.net/images/e/ee/Rampart_City_Hall_large.gif",
    citadel: "https://heroes.thelazy.net/images/b/b8/Rampart_Citadel_large.gif",
    mage_guild: "https://heroes.thelazy.net/images/9/99/Rampart_Mage_Guild_level_1_large.gif",
    blacksmith: "https://heroes.thelazy.net/images/c/c9/Rampart_Blacksmith_large.gif",
    dwelling_bronze: "https://heroes.thelazy.net/images/2/26/Rampart_Centaur_Stables.gif",
    dwelling_silver: "https://heroes.thelazy.net/images/f/fc/Rampart_Dendroid_Arches.gif",
    dwelling_gold: "https://heroes.thelazy.net/images/1/19/Rampart_Dragon_Cliffs.gif",
    mystic_pond: "https://heroes.thelazy.net/images/4/40/Rampart_Mystic_Pond.gif",
    saplings: "https://heroes.thelazy.net/images/2/2f/Rampart_Homestead.gif"
  },
  inferno: {
    city_hall: "https://heroes.thelazy.net/images/9/95/Inferno_City_Hall_large.gif",
    citadel: "https://heroes.thelazy.net/images/d/db/Inferno_Citadel_large.gif",
    mage_guild: "https://heroes.thelazy.net/images/5/5b/Inferno_Mage_Guild_level_1_large.gif",
    blacksmith: "https://heroes.thelazy.net/images/7/7a/Inferno_Blacksmith_large.gif",
    dwelling_bronze: "https://heroes.thelazy.net/images/9/93/Inferno_Imp_Crucible.gif",
    dwelling_silver: "https://heroes.thelazy.net/images/d/d1/Inferno_Demon_Gate.gif",
    dwelling_gold: "https://heroes.thelazy.net/images/4/41/Inferno_Forsaken_Palace.gif",
    castle_gate: "https://heroes.thelazy.net/images/8/8e/Inferno_Castle_Gate.gif",
    brimstone_stormclouds: "https://heroes.thelazy.net/images/7/71/Inferno_Kennels.gif"
  },
  necropolis: {
    city_hall: "https://heroes.thelazy.net/images/7/72/Necropolis_City_Hall_large.gif",
    citadel: "https://heroes.thelazy.net/images/a/a0/Necropolis_Citadel_large.gif",
    mage_guild: "https://heroes.thelazy.net/images/1/11/Necropolis_Mage_Guild_level_1_large.gif",
    blacksmith: "https://heroes.thelazy.net/images/c/ce/Necropolis_Blacksmith_large.gif",
    dwelling_bronze: "https://heroes.thelazy.net/images/e/e8/Necropolis_Cursed_Temple.gif",
    dwelling_silver: "https://heroes.thelazy.net/images/9/91/Necropolis_Tomb_of_Souls.gif",
    dwelling_gold: "https://heroes.thelazy.net/images/5/5d/Necropolis_Dragon_Vault.gif",
    necromancy_amplifier: "https://heroes.thelazy.net/images/d/d4/Necropolis_Necromancy_Amplifier.gif",
    cover_of_darkness: "https://heroes.thelazy.net/images/d/d8/Necropolis_Cover_of_Darkness.gif"
  },
  dungeon: {
    city_hall: "https://heroes.thelazy.net/images/c/c1/Dungeon_City_Hall_large.gif",
    citadel: "https://heroes.thelazy.net/images/4/48/Dungeon_Citadel_large.gif",
    mage_guild: "https://heroes.thelazy.net/images/2/26/Dungeon_Mage_Guild_level_1_large.gif",
    blacksmith: "https://heroes.thelazy.net/images/2/2c/Dungeon_Blacksmith_large.gif",
    dwelling_bronze: "https://heroes.thelazy.net/images/a/a1/Dungeon_Warren.gif",
    dwelling_silver: "https://heroes.thelazy.net/images/e/e0/Dungeon_Labyrinth.gif",
    dwelling_gold: "https://heroes.thelazy.net/images/a/af/Dungeon_Dragon_Cave.gif",
    portal_of_summoning: "https://heroes.thelazy.net/images/1/1e/Dungeon_Portal_of_Summoning.gif",
    mana_vortex: "https://heroes.thelazy.net/images/f/f4/Dungeon_Mana_Vortex.gif"
  }
};

/**
 * Classic resource-bar icons. The board game's three resources map to:
 * gold → gold pile, building materials → ore, valuables → crystal (per the
 * table owner's mapping of the uploaded reference image).
 */
export const RESOURCE_ICONS = {
  gold: "https://heroes.thelazy.net/images/9/9f/Gold_%28leather%29.gif",
  buildingMaterials: "https://heroes.thelazy.net/images/6/6f/Ore_%28leather%29.gif",
  valuables: "https://heroes.thelazy.net/images/1/14/Crystal_%28leather%29.gif",
  wood: "https://heroes.thelazy.net/images/a/a5/Wood_%28leather%29.gif",
  gems: "https://heroes.thelazy.net/images/c/cb/Gem_%28leather%29.gif",
  mercury: "https://heroes.thelazy.net/images/5/56/Mercury_%28leather%29.gif",
  sulfur: "https://heroes.thelazy.net/images/6/67/Sulfur_%28leather%29.gif"
} as const;

/** Morale birds (good +1 / poor −1), as in the uploaded sprite reference. */
export const MORALE_ICONS = {
  positive: "https://heroes.thelazy.net/images/3/36/Morale.gif",
  negative: "https://heroes.thelazy.net/images/8/87/Morale-1.gif",
  neutral: "https://heroes.thelazy.net/images/a/a7/MoraleN.gif"
} as const;
