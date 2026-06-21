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
    city_hall: "/assets/town/inferno_city_hall_hd.webp",
    citadel: "/assets/town/inferno_citadel_hd.webp",
    mage_guild: "/assets/town/inferno_mage_guild_hd.webp",
    dwelling_bronze: "/assets/town/inferno_crucible_of_sins_hd.webp",
    dwelling_silver: "/assets/town/inferno_gates_of_abyss_hd.webp",
    dwelling_gold: "/assets/town/inferno_hellfire_palace_hd.webp",
    castle_gate: "/assets/town/inferno_castle_gate_hd.webp",
    brimstone_stormclouds: "/assets/town/inferno_brimstone_stormclouds_hd.webp"
  },
  stronghold: {
    city_hall: "/assets/town/stronghold_city_hall_wide_hd.webp",
    citadel: "/assets/town/stronghold_citadel_wide_hd.webp",
    mage_guild: "/assets/town/stronghold_mage_guild_wide_hd.webp",
    dwelling_bronze: "/assets/town/stronghold_barracks_tower_hd.webp",
    dwelling_silver: "/assets/town/stronghold_fort_under_the_nest_wide_hd.webp",
    dwelling_gold: "/assets/town/stronghold_mountain_caves_wide_hd.webp",
    hall_of_valhalla: "/assets/town/stronghold_hall_of_valhalla_wide_hd.webp",
    freelancers_guild: "/assets/town/stronghold_freelancers_guild_wide_hd.webp"
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
    city_hall: "/assets/town/dungeon_city_hall_hd.webp",
    citadel: "/assets/town/dungeon_citadel_hd.webp",
    mage_guild: "/assets/town/dungeon_mage_guild_hd.webp",
    blacksmith: "/assets/town/dungeon_blacksmith_large.gif",
    dwelling_bronze: "/assets/town/dungeon_warrens_hd.webp",
    dwelling_silver: "/assets/town/dungeon_inner_labyrinths_hd.webp",
    dwelling_gold: "/assets/town/dungeon_ancient_lairs_hd.webp",
    portal_of_summoning: "/assets/town/dungeon_portal_of_summoning_hd.webp",
    mana_vortex: "/assets/town/dungeon_mana_vortex_hd.webp"
  },
  fortress: {
    city_hall: "/assets/town/fortress_city_hall_large.gif",
    citadel: "/assets/town/fortress_citadel_large.gif",
    mage_guild: "/assets/town/fortress_mage_guild_level_1_large.gif",
    // Board dwellings (Den / Swamp Lairs / Nest upon the Pond) map to a fitting
    // low/mid/high PC Fortress dwelling; the two faction buildings use the
    // matching PC structures.
    dwelling_bronze: "/assets/town/fortress_lizard_den.gif",
    dwelling_silver: "/assets/town/fortress_gorgon_lair.gif",
    dwelling_gold: "/assets/town/fortress_hydra_pond.gif",
    blood_obelisk: "/assets/town/fortress_blood_obelisk.gif",
    cage_of_warlords: "/assets/town/fortress_cage_of_warlords.gif"
  },
  tower: {
    city_hall: "/assets/town/tower_city_hall_large.gif",
    citadel: "/assets/town/tower_citadel_large.gif",
    mage_guild: "/assets/town/tower_mage_guild_level_1_large.gif",
    dwelling_bronze: "/assets/town/tower_workshop.gif",
    dwelling_silver: "/assets/town/tower_mage_tower.gif",
    dwelling_gold: "/assets/town/tower_cloud_temple.gif",
    artifact_merchants: "/assets/town/tower_artifact_merchants.gif",
    wall_of_knowledge: "/assets/town/tower_wall_of_knowledge.gif"
  },
  conflux: {
    // Conflux town-screen renders (heroes.thelazy.net Conflux page, converted to
    // webp by scripts/fetch-conflux-town-art.py). Dwellings map bronze/silver/
    // gold to the Altar of Air / Altar of Fire / Pyre PC structures.
    city_hall: "/assets/town/conflux_city_hall.webp",
    citadel: "/assets/town/conflux_citadel.webp",
    mage_guild: "/assets/town/conflux_mage_guild.webp",
    dwelling_bronze: "/assets/town/conflux_altar_of_air.webp",
    dwelling_silver: "/assets/town/conflux_altar_of_fire.webp",
    dwelling_gold: "/assets/town/conflux_pyre.webp",
    garden_of_life: "/assets/town/conflux_garden_of_life.webp",
    magic_university: "/assets/town/conflux_magic_university.webp"
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

/**
 * Morale birds, the classic Heroes III IMRL42 sprite set (one frame per track
 * step, −3 … +3): the gold bird soaring with wings spread for high morale down
 * through the tarnished, grounded bird for low morale, with the stone bird at
 * neutral. Decoded straight from the original def by
 * scripts/convert-h3-ui-defs.py so the symbols match the game exactly.
 */
export const MORALE_STATE_ICONS: Record<string, string> = {
  "3": "/assets/icons/morale-h3-p3.png",
  "2": "/assets/icons/morale-h3-p2.png",
  "1": "/assets/icons/morale-h3-p1.png",
  "0": "/assets/icons/morale-h3-0.png",
  "-1": "/assets/icons/morale-h3-m1.png",
  "-2": "/assets/icons/morale-h3-m2.png",
  "-3": "/assets/icons/morale-h3-m3.png"
};

/** Icon for a morale value, clamped to the morale-bird track (−3 … +3). */
export function moraleIcon(morale: number): string {
  const clamped = Math.max(-3, Math.min(3, Math.round(morale)));
  return MORALE_STATE_ICONS[String(clamped)] ?? MORALE_STATE_ICONS["0"];
}

/**
 * Face-down map tile backs by tile group: the four rulebook backs (starry
 * night with the printed roman numerals) extracted from the official
 * rulebook PDF, plus sea (golden waves, Ⅳ–Ⅴ) and subterranean (cavern
 * teeth, Ⅴ–Ⅵ) backs drawn in the same style after the expansion photos.
 */
export const TILE_BACK_IMAGES: Record<string, string> = {
  starting: "/assets/board/backs/back-starting.webp",
  far: "/assets/board/backs/back-far.webp",
  near: "/assets/board/backs/back-near.webp",
  center: "/assets/board/backs/back-center.webp",
  sea: "/assets/board/backs/back-sea.webp",
  subterranean: "/assets/board/backs/back-subterranean.webp"
};

/**
 * Subterranean Gate Token art, cropped from the rulebook's page-35
 * "Subterranean Gate Tokens" illustration, which shows the two connecting
 * halves of one Token. They are drawn on top of the tile scan, on the field
 * each half sacrifices:
 * - `surface`: the surface gate — the dirt approach/path hex (placed first,
 *   when the Surface tile is discovered).
 * - `subterranean`: the underground entrance — the cave-mouth-with-skull hex
 *   (added when a hero opens the gate and the Subterranean tile is revealed).
 */
export const SUBTERRANEAN_GATE_TOKEN_IMAGES = {
  surface: "/assets/board/tokens/subterranean-gate-surface.webp",
  subterranean: "/assets/board/tokens/subterranean-gate-underground.webp"
} as const;

/** The gate-half art for a field, chosen by the layer of the tile it sits on. */
export function subterraneanGateTokenImage(layer: "surface" | "subterranean"): string {
  return SUBTERRANEAN_GATE_TOKEN_IMAGES[layer];
}

/** Creature Bank field token art (Naval Battles), shown on a placed bank's hex. */
export const CREATURE_BANK_FIELD_IMAGE = "/assets/locations-creature_bank.webp";

export function creatureBankFieldImage(): string {
  return CREATURE_BANK_FIELD_IMAGE;
}

/** Back image for a tile, from its group or its printed back label. */
export function tileBackImage(group: string | undefined, backLabel: string | undefined): string {
  if (group && TILE_BACK_IMAGES[group]) {
    return TILE_BACK_IMAGES[group];
  }
  switch (backLabel) {
    case "Ⅰ":
      return TILE_BACK_IMAGES.starting;
    case "Ⅱ–Ⅲ":
      return TILE_BACK_IMAGES.far;
    case "Ⅵ–Ⅶ":
      return TILE_BACK_IMAGES.center;
    default:
      return TILE_BACK_IMAGES.near;
  }
}

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
