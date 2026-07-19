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

// Type-only import (erased at build/test time, so it adds no runtime coupling):
// ties the Creature Bank art table below to the canonical bank-id union.
import type { CreatureBankId } from "@/data/map/creature-banks";

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
  },
  cove: {
    // Cove town-screen renders (heroes.thelazy.net Cove page, fetched verbatim by
    // scripts/fetch-cove-town-art.py). Board dwellings map to the matching PC
    // creature dwelling: Bay → Nymph Waterfall, Nests Towering the Seas → Nest,
    // Redoubled Vortex → Maelstrom; the Thieves' Guild and Pub use their own
    // Cove structures.
    city_hall: "/assets/town/cove_city_hall_large.gif",
    citadel: "/assets/town/cove_citadel_large.gif",
    mage_guild: "/assets/town/cove_mage_guild_level_1_large.gif",
    dwelling_bronze: "/assets/town/cove_nymph_waterfall.gif",
    dwelling_silver: "/assets/town/cove_nest.gif",
    dwelling_gold: "/assets/town/cove_maelstrom.gif",
    thieves_guild: "/assets/town/cove_thieves_guild.gif",
    pub: "/assets/town/cove_pub.gif"
  },
  bulwark: {
    // Bulwark (HotA fan-faction) town-screen renders, fetched from
    // heroes.thelazy.net by scripts/fetch-bulwark-art.py. Board dwellings map
    // bronze/silver/gold to the Colliery / Mountain Embassy / Frosthome PC
    // dwellings; the Sieidi and its Altar upgrade drive the Runes mechanic.
    city_hall: "/assets/town/bulwark_city_hall.webp",
    citadel: "/assets/town/bulwark_citadel.webp",
    mage_guild: "/assets/town/bulwark_mage_guild.webp",
    dwelling_bronze: "/assets/town/bulwark_dwelling_bronze.webp",
    dwelling_silver: "/assets/town/bulwark_dwelling_silver.webp",
    dwelling_gold: "/assets/town/bulwark_dwelling_gold.webp",
    sieidi: "/assets/town/bulwark_sieidi.webp",
    altar: "/assets/town/bulwark_altar.webp"
  },
  factory: {
    // Factory (HotA expansion) town-screen renders, fetched from
    // heroes.thelazy.net by scripts/fetch-factory-art.py. Board dwellings map
    // bronze/silver/gold to the Halfling Adobe / Ranch / Gantry PC dwellings;
    // unique buildings: Bank, Mana Generator, Artifact Merchants, Pen,
    // Lightning Rod.
    city_hall: "/assets/town/factory_city_hall.webp",
    citadel: "/assets/town/factory_citadel.webp",
    mage_guild: "/assets/town/factory_mage_guild.webp",
    blacksmith: "/assets/town/factory_blacksmith.webp",
    dwelling_bronze: "/assets/town/factory_dwelling_bronze.webp",
    dwelling_silver: "/assets/town/factory_dwelling_silver.webp",
    dwelling_gold: "/assets/town/factory_dwelling_gold.webp",
    bank: "/assets/town/factory_bank.webp",
    mana_generator: "/assets/town/factory_mana_generator.webp",
    artifact_merchants: "/assets/town/factory_artifact_merchants.webp",
    pen: "/assets/town/factory_pen.webp",
    lightning_rod: "/assets/town/factory_lightning_rod.webp",
    tavern: "/assets/town/factory_tavern.webp",
    marketplace: "/assets/town/factory_marketplace.webp",
    resource_silo: "/assets/town/factory_resource_silo.webp"
  }
};

/**
 * Resource-bar icons. The board game's three resources now use the REAL
 * board-game token art (github.com/Heegu-sama/Homm3BG, assets/images →
 * gold.png / building_materials.png / valuables.png), converted to webp and
 * hosted locally under /assets/icons: gold → the coin stack, building
 * materials → the grey stone pile, valuables → the red crystal cluster.
 * wood/gems/mercury/sulfur (PC-only extras, no board-game token) keep the
 * classic HoMM3 leather icons.
 */
export const RESOURCE_ICONS = {
  gold: "/assets/icons/resource-gold.webp",
  buildingMaterials: "/assets/icons/resource-building_materials.webp",
  valuables: "/assets/icons/resource-valuables.webp",
  wood: "/assets/icons/wood_leather.gif",
  gems: "/assets/icons/gem_leather.gif",
  mercury: "/assets/icons/mercury_leather.gif",
  sulfur: "/assets/icons/sulfur_leather.gif"
} as const;

/**
 * Combat-token art (github.com/Heegu-sama/Homm3BG, assets/images), the real
 * printed tokens: the crossed-swords Attack token (red), the silver-swords
 * Weakness token (black), the prohibited-shield Corrosion token (green) and the
 * gorgon-head Paralysis token. `damage`/`defense` are the extra printed tokens,
 * staged for later use. Keyed to match `CombatTokenKind` in the engine — the
 * board renders these instead of an emoji glyph, with the engine's live signed
 * amount overlaid (the printed number varies by denomination). All local webp.
 */
export const COMBAT_TOKEN_IMAGES = {
  attack: "/assets/board/tokens/combat-attack.webp",
  weakness: "/assets/board/tokens/combat-weakness.webp",
  corrosion: "/assets/board/tokens/combat-corrosion.webp",
  paralysis: "/assets/board/tokens/combat-paralysis.webp",
  damage: "/assets/board/tokens/combat-damage.webp",
  defense: "/assets/board/tokens/combat-defense.webp"
} as const;

/**
 * Board symbol art for the core statistics and counters (attack, defense, HP,
 * power, knowledge, initiative, experience, population, morale). Real
 * board-game glyphs (github.com/Heegu-sama/Homm3BG, assets/images), converted
 * to local webp. Registered here for later use across the hero/unit boards.
 */
export const STAT_SYMBOL_ICONS = {
  attack: "/assets/icons/symbol-attack.webp",
  defense: "/assets/icons/symbol-defense.webp",
  hp: "/assets/icons/symbol-hp.webp",
  power: "/assets/icons/symbol-power.webp",
  knowledge: "/assets/icons/symbol-knowledge.webp",
  initiative: "/assets/icons/symbol-initiative.webp",
  experience: "/assets/icons/symbol-experience.webp",
  population: "/assets/icons/symbol-population.webp",
  moralePositive: "/assets/icons/symbol-morale-positive.webp",
  moraleNegative: "/assets/icons/symbol-morale-negative.webp"
} as const;

/**
 * Secondary-skill emblems (github.com/Heegu-sama/Homm3BG, assets/skills) used
 * as the main-menu button icons — a logical skill per destination (swords for
 * a solo campaign, the leadership banner for multiplayer, the war machine for
 * the battle arena, the map for the designer, and so on). Local webp; each key
 * here is wired to exactly one menu button.
 */
export const SKILL_ICONS = {
  attack: "/assets/skills/attack.webp",
  leadership: "/assets/skills/leadership.webp",
  artillery: "/assets/skills/artillery.webp",
  pathfinding: "/assets/skills/pathfinding.webp",
  luck: "/assets/skills/luck.webp",
  wisdom: "/assets/skills/wisdom.webp",
  intelligence: "/assets/skills/intelligence.webp",
  interference: "/assets/skills/interference.webp",
  logistics: "/assets/skills/logistics.webp"
} as const;

/**
 * Map-designer chrome: toolbar medallions (zoom / wheel lock / reset) plus the
 * official Homm3BG glyphs used as mode & landmark chips. Glyphs come from
 * github.com/Heegu-sama/Homm3BG `assets/glyphs`; location chips reuse the board
 * resource tokens and small generated landmark icons where Homm3BG has no
 * dedicated glyph (obelisk, settlement).
 */
export const DESIGNER_UI_ICONS = {
  zoomIn: "/assets/icons/ui-zoom-in.webp",
  zoomOut: "/assets/icons/ui-zoom-out.webp",
  zoomReset: "/assets/icons/ui-zoom-reset.webp",
  wheelLock: "/assets/icons/ui-wheel-lock.webp",
  wheelUnlock: "/assets/icons/ui-wheel-unlock.webp",
  /** Generated exact-hex placement emblem used by the live token legend. */
  tokenPlace: "/assets/icons/ui-token-place.webp",
  /** Random tile-pool mode — treasure dice glyph. */
  modeRandom: "/assets/glyphs/2_treasure_die.svg",
  /** Secret landmark mode — permanent/hidden glyph. */
  modeSecret: "/assets/glyphs/permanent.svg",
  /** Face-up exact tile — yellow map glyph. */
  modeFaceUp: "/assets/glyphs/map-yellow.svg",
  /** Rotate tile. */
  rotate: "/assets/glyphs/movement.svg",
  /** Map glyph (header / branding). */
  map: "/assets/glyphs/map.svg",
  /** Hidden hex event — designer-only violet hex + spark glyph (never in game). */
  hexEvent: "/assets/glyphs/hex-event.svg"
} as const;

/**
 * Secret-landmark chip art for the designer (and any UI that lists
 * `SECRET_TILE_FEATURES`). Paths only — render through `assetUrl()`.
 */
export const SECRET_FEATURE_ICONS = {
  gold_mine: RESOURCE_ICONS.gold,
  valuables_mine: RESOURCE_ICONS.valuables,
  materials_mine: RESOURCE_ICONS.buildingMaterials,
  any_mine: "/assets/glyphs/treasure.svg",
  obelisk: "/assets/icons/location-obelisk.webp",
  settlement: "/assets/icons/location-settlement.webp",
  town: "/assets/glyphs/building_citadel.svg",
  objective: "/assets/icons/location-grail.webp"
} as const;

/**
 * Board-game reward / status glyphs used to label the map-designer preset
 * surfaces (Obelisk fixed-bonus kinds, Victory-Point objective rows) and the
 * live Victory-Points dock / scoring overlay, plus the designer's win-condition
 * warning (red cross) and all-clear (green tick). The monochrome symbol glyphs
 * (`fill="currentColor"`) match the designer's existing `DESIGNER_UI_ICONS`
 * chrome; the tick/cross carry their own green/red fills so they read as status
 * regardless of context. Paths only — render through `assetUrl()`.
 *
 * Source/credit: the print-and-play glyph set from the Heegu-sama/Homm3BG
 * community rulebook project (`assets/glyphs`), the same source as the town/
 * resource/stat art above. https://github.com/Heegu-sama/Homm3BG
 */
export const REWARD_GLYPH_ICONS = {
  moralePositive: "/assets/glyphs/morale_positive.svg",
  moraleNegative: "/assets/glyphs/morale_negative.svg",
  movement: "/assets/glyphs/movement.svg",
  experience: "/assets/glyphs/experience.svg",
  artifact: "/assets/glyphs/artifact.svg",
  gold: "/assets/glyphs/gold.svg",
  materials: "/assets/glyphs/building_materials.svg",
  treasure: "/assets/glyphs/treasure.svg",
  resourceDie: "/assets/glyphs/resource_die.svg",
  attack: "/assets/glyphs/attack.svg",
  defense: "/assets/glyphs/defense.svg",
  ok: "/assets/glyphs/green_tick.svg",
  conflict: "/assets/glyphs/red_cross.svg"
} as const;

/**
 * Polished HD UI icons (origin-faithful Homm3BG silhouettes / board tools art).
 * Prefer these over the raw SVG glyphs for trays, notices and house-rule chips.
 */
export const UI_REWARD_ICONS = {
  /** Scenario starting-bonus "Resource dice" option (normal + reduced modes). */
  startingBonusResource: "/assets/ui/starting-bonus-resource.webp",
  /** Scenario starting-bonus "Artifact" option (normal + reduced modes). */
  startingBonusArtifact: "/assets/ui/starting-bonus-artifact.webp",
  /** Polish Rule 111 house-rule / tray medallion (bronze guard swap). */
  rule111: "/assets/ui/rule-111-icon.webp",
  /** Treasure-die face chips on map-visit notices. */
  treasureFaceExperience: "/assets/ui/treasure-face-experience.webp",
  treasureFaceArtifact: "/assets/ui/treasure-face-artifact.webp",
  treasureFaceResourceDie: "/assets/ui/treasure-face-resource-die.webp",
  treasureFaceDoubleResource: "/assets/ui/treasure-face-double-resource.webp"
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
 * Face-down map tile backs by tile group: the REAL printed tile back covers
 * (github.com/Heegu-sama/Homm3BG) — the four land backs from the 2x2
 * `assets/images/maptiles.png` sheet (starry night with the printed roman
 * numerals Ⅰ / Ⅱ–Ⅲ / Ⅳ–Ⅴ / Ⅵ–Ⅶ), plus the golden-wave sea back
 * (`map-tile-sea.png`) and the cavern-teeth subterranean back
 * (`map-tile-sub.png`). Sea and underground each ship TWO band backs
 * (Ⅳ–Ⅴ and Ⅵ–Ⅶ) so a boss tile never wears the weaker numeral — VII fights
 * only sit under a Ⅵ–Ⅶ back. Each printed seven-hex flower is cropped to its
 * tight bounding box and installed by scripts/fetch-map-tile-backs.py.
 */
export const TILE_BACK_IMAGES: Record<string, string> = {
  starting: "/assets/board/backs/back-starting.webp",
  far: "/assets/board/backs/back-far.webp",
  near: "/assets/board/backs/back-near.webp",
  center: "/assets/board/backs/back-center.webp",
  sea: "/assets/board/backs/back-sea.webp",
  "sea-vi-vii": "/assets/board/backs/back-sea-vi-vii.webp",
  subterranean: "/assets/board/backs/back-subterranean.webp",
  "subterranean-vi-vii": "/assets/board/backs/back-subterranean-vi-vii.webp"
};

/**
 * Subterranean Gate Token art, cropped from the two-hex "Subterranean Gate
 * Tokens" illustration (`scripts/crop-subterranean-gate-art.py`). They are drawn
 * on top of the tile scan, on the field each half sacrifices:
 * - `surface`: the surface GATE — the skull cave-mouth you descend into (placed
 *   first, when the Surface tile is discovered). This is the dramatic, readable
 *   half, so it sits on the Surface where the gate is visible on open terrain.
 * - `subterranean`: the underground ENTRANCE / path up — the lighter passage
 *   half (added when a hero opens the gate and the Subterranean tile is revealed).
 *
 * The source hexes are FLAT-top (points left/right); the board renders POINTY-top
 * hexes (see `hexCornerPoints` in `screen.tsx`), so the crop re-masks each upright
 * half into a pointy-top hexagon with transparent corners — no rectangular bleed.
 */
export const SUBTERRANEAN_GATE_TOKEN_IMAGES = {
  surface: "/assets/board/tokens/subterranean-gate-surface.webp",
  subterranean: "/assets/board/tokens/subterranean-gate-underground.webp"
} as const;

/** The gate-half art for a field, chosen by the layer of the tile it sits on. */
export function subterraneanGateTokenImage(layer: "surface" | "subterranean"): string {
  return SUBTERRANEAN_GATE_TOKEN_IMAGES[layer];
}

/**
 * Monolith (Conflux) / Whirlpool (Cove) Location Token art — hex-shaped scans
 * cropped from the rulebook's component pages (alpha-masked to the printed hex).
 * The three Whirlpool tokens carry their printed Attack-die numbers (+1/0/-1);
 * an unnumbered whirlpool (hand-edited saves beyond the printed three) falls
 * back to the "0" face art.
 */
export const MAP_TOKEN_IMAGES = {
  monolith: "/assets/board/tokens/monolith.webp",
  "whirlpool+1": "/assets/board/tokens/whirlpool-plus1.webp",
  whirlpool0: "/assets/board/tokens/whirlpool-zero.webp",
  "whirlpool-1": "/assets/board/tokens/whirlpool-minus1.webp"
} as const;

/** The Two-Way Monolith token art. */
export function monolithTokenImage(): string {
  return MAP_TOKEN_IMAGES.monolith;
}

/** A Whirlpool token's art, picked by its printed die number. */
export function whirlpoolTokenImage(number?: -1 | 0 | 1): string {
  if (number === 1) {
    return MAP_TOKEN_IMAGES["whirlpool+1"];
  }
  if (number === -1) {
    return MAP_TOKEN_IMAGES["whirlpool-1"];
  }
  return MAP_TOKEN_IMAGES.whirlpool0;
}

/** Token art for a Monolith/Whirlpool field or a pending (face-down) token. */
export function mapTokenImage(kind: "monolith" | "whirlpool", number?: -1 | 0 | 1): string {
  return kind === "monolith" ? monolithTokenImage() : whirlpoolTokenImage(number);
}

/**
 * Designer outpost object art (Polish fan-map hex scans): the Garrison
 * fortress, the Keymaster's Tent and the Barrier wall. One image each — a
 * tent/barrier's COLOR (1-4) is shown by the tinted ring + number badge the
 * colored Gates already use, and the Garrison wears its printed light-blue
 * hex frame.
 */
export const OUTPOST_OBJECT_IMAGES = {
  garrison: "/assets/board/tokens/garrison.webp",
  keymaster_tent: "/assets/board/tokens/keymaster-tent.webp",
  barrier: "/assets/board/tokens/barrier.webp"
} as const;

/** The outpost art for a location id, or undefined for every other location. */
export function outpostObjectImage(locationId: string): string | undefined {
  return OUTPOST_OBJECT_IMAGES[locationId as keyof typeof OUTPOST_OBJECT_IMAGES];
}

/**
 * One-way monolith art (fan hex scans, 4 colors): the ENTRANCE arch glows with
 * its portal, the EXIT arch stands empty. Color follows the gate-pair palette
 * (1 red / 2 blue / 3 green / 4 violet).
 */
export const ONEWAY_MONOLITH_IMAGES = {
  "entrance-1": "/assets/board/tokens/oneway-entrance-red.webp",
  "entrance-2": "/assets/board/tokens/oneway-entrance-blue.webp",
  "entrance-3": "/assets/board/tokens/oneway-entrance-green.webp",
  "entrance-4": "/assets/board/tokens/oneway-entrance-violet.webp",
  "exit-1": "/assets/board/tokens/oneway-exit-red.webp",
  "exit-2": "/assets/board/tokens/oneway-exit-blue.webp",
  "exit-3": "/assets/board/tokens/oneway-exit-green.webp",
  "exit-4": "/assets/board/tokens/oneway-exit-violet.webp"
} as const;

/** The art for a one-way monolith half of a color pair. */
export function onewayMonolithImage(direction: "entrance" | "exit", pair: 1 | 2 | 3 | 4 = 1): string {
  return ONEWAY_MONOLITH_IMAGES[`${direction}-${pair}`];
}

/**
 * Two-way Teleport Gate art (fan portal scans) — one glowing portal per color
 * pair (1 red / 2 blue / 3 green / 4 violet). Replaces the old tinted-monolith
 * rendering; the colored ring + number badge stay for colour-blind safety.
 */
export const TELEPORT_GATE_IMAGES = {
  1: "/assets/board/tokens/teleport-gate-red.webp",
  2: "/assets/board/tokens/teleport-gate-blue.webp",
  3: "/assets/board/tokens/teleport-gate-green.webp",
  4: "/assets/board/tokens/teleport-gate-violet.webp"
} as const;

/** The Teleport-Gate portal art of a color pair. */
export function teleportGateImage(pair: 1 | 2 | 3 | 4 = 1): string {
  return TELEPORT_GATE_IMAGES[pair];
}

/**
 * Creature Bank field-tile art (Naval Battles), shown on a placed bank's hex.
 *
 * Each of the twelve banks has its OWN cropped field-tile scan (the Crypt
 * mausoleum, the Pyramid, the sunken Shipwreck, etc.) so every bank hex shows
 * the right structure instead of one shared placeholder. Keyed by CreatureBankId
 * — the `Record<CreatureBankId, string>` type makes the compiler reject a
 * missing or stray bank, keeping this table in lock-step with the bank roster.
 * Downloaded by scripts/fetch-creature-bank-art.py.
 */
export const CREATURE_BANK_FIELD_IMAGES: Record<CreatureBankId, string> = {
  imp_cache: "/assets/locations-imp_cache.webp",
  crypt: "/assets/locations-crypt.webp",
  dwarven_treasury: "/assets/locations-dwarven_treasury.webp",
  medusa_stores: "/assets/locations-medusa_stores.webp",
  dragon_fly_hive: "/assets/locations-dragon_fly_hive.webp",
  shipwreck: "/assets/locations-shipwreck.webp",
  derelict_ship: "/assets/locations-derelict_ship.webp",
  pyramid: "/assets/locations-pyramid.webp",
  griffin_conservatory: "/assets/locations-griffin_conservatory.webp",
  naga_bank: "/assets/locations-naga_bank.webp",
  cyclops_stockpile: "/assets/locations-cyclops_stockpile.webp",
  dragon_utopia: "/assets/locations-dragon_utopia.webp"
};

/**
 * Generic fallback used only when a bank id is missing/unknown — a placed bank
 * always carries its `bankId`, so in practice every hex resolves to its own art
 * above.
 */
export const CREATURE_BANK_FIELD_IMAGE = "/assets/locations-creature_bank.webp";

/** Field-tile art for a specific Creature Bank, falling back to the generic token. */
export function creatureBankFieldImage(bankId?: string): string {
  if (bankId && bankId in CREATURE_BANK_FIELD_IMAGES) {
    return CREATURE_BANK_FIELD_IMAGES[bankId as CreatureBankId];
  }
  return CREATURE_BANK_FIELD_IMAGE;
}

/**
 * Back image for a face-down tile. The printed band numeral on the back MUST
 * match the tile's guard band (`backLabel`): a Ⅵ–Ⅶ underground/sea tile must
 * NEVER show the Ⅳ–Ⅴ cavern/wave art (that was the bug — open "IV-V" back,
 * fight VII). Land groups are uniform; sea/subterranean pick the band-specific
 * asset from `backLabel`.
 */
export function tileBackImage(group: string | undefined, backLabel: string | undefined): string {
  // Band first for the two dual-band groups (sea + underground).
  if (group === "subterranean") {
    return backLabel === "Ⅵ–Ⅶ"
      ? TILE_BACK_IMAGES["subterranean-vi-vii"]
      : TILE_BACK_IMAGES.subterranean;
  }
  if (group === "sea") {
    return backLabel === "Ⅵ–Ⅶ" ? TILE_BACK_IMAGES["sea-vi-vii"] : TILE_BACK_IMAGES.sea;
  }
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

/**
 * The four hero-statistic SYMBOLS as their own standalone icons — the real
 * board-game glyphs (github.com/Heegu-sama/Homm3BG, assets/images/<stat>.png):
 * crossed swords (attack), the quartered shield (defense), the open spell book
 * (power) and the stack of tomes (knowledge). Trimmed and centred on a uniform
 * transparent square by scripts/build-hero-info-icons.py so all four read at
 * the same weight; used by the hero-selection info board's statistics row.
 */
export const HERO_INFO_STAT_ICONS = {
  attack: "/assets/hero-info/stat-attack.webp",
  defense: "/assets/hero-info/stat-defense.webp",
  power: "/assets/hero-info/stat-power.webp",
  knowledge: "/assets/hero-info/stat-knowledge.webp"
} as const;

/**
 * Secondary-skill / ability emblems for the hero-selection info board — the
 * actual printed ability symbol beside a hero's starting ability. Built by
 * scripts/build-hero-info-icons.py: 21 are the repo's clean transparent skill
 * symbols (github.com/Heegu-sama/Homm3BG, assets/skills/<skill>.png); the five
 * board-game abilities missing a standalone symbol there (Diplomacy, Mysticism,
 * Scholar, Scouting, Tactics) are recovered from the top art of their own
 * printed ability card and feathered so the leather margin melts into the chip.
 * Keyed by the ability's short name (the part after `ability.`).
 */
export const ABILITY_SYMBOL_ICONS: Record<string, string> = {
  air_magic: "/assets/ability-symbols/air_magic.webp",
  archery: "/assets/ability-symbols/archery.webp",
  armorer: "/assets/ability-symbols/armorer.webp",
  artillery: "/assets/ability-symbols/artillery.webp",
  attack: "/assets/ability-symbols/attack.webp",
  diplomacy: "/assets/ability-symbols/diplomacy.webp",
  eagle_eye: "/assets/ability-symbols/eagle_eye.webp",
  earth_magic: "/assets/ability-symbols/earth_magic.webp",
  estates: "/assets/ability-symbols/estates.webp",
  fire_magic: "/assets/ability-symbols/fire_magic.webp",
  first_aid: "/assets/ability-symbols/first_aid.webp",
  intelligence: "/assets/ability-symbols/intelligence.webp",
  interference: "/assets/ability-symbols/interference.webp",
  leadership: "/assets/ability-symbols/leadership.webp",
  logistics: "/assets/ability-symbols/logistics.webp",
  luck: "/assets/ability-symbols/luck.webp",
  mysticism: "/assets/ability-symbols/mysticism.webp",
  necromancy: "/assets/ability-symbols/necromancy.webp",
  pathfinding: "/assets/ability-symbols/pathfinding.webp",
  resistance: "/assets/ability-symbols/resistance.webp",
  scholar: "/assets/ability-symbols/scholar.webp",
  scouting: "/assets/ability-symbols/scouting.webp",
  sorcery: "/assets/ability-symbols/sorcery.webp",
  tactics: "/assets/ability-symbols/tactics.webp",
  water_magic: "/assets/ability-symbols/water_magic.webp",
  wisdom: "/assets/ability-symbols/wisdom.webp"
};

/**
 * The ability-symbol icon for a starting-ability card id (e.g. `ability.offense`),
 * or undefined when none is registered. `offense` prints the Attack emblem and a
 * `basic_<school>_magic` ability prints its plain school emblem — matching the
 * printed cards — everything else maps by its own short name.
 */
export function abilitySymbolIcon(cardId: string | undefined): string | undefined {
  if (!cardId) {
    return undefined;
  }
  let name = cardId.startsWith("ability.") ? cardId.slice("ability.".length) : cardId;
  if (name === "offense") {
    name = "attack";
  } else if (name.startsWith("basic_") && name.endsWith("_magic")) {
    name = name.slice("basic_".length);
  }
  return ABILITY_SYMBOL_ICONS[name];
}
