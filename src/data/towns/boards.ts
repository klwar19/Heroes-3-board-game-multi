/**
 * Town BOARD manifest: the physical board-game town boards, as rendered by the
 * Town window's default "board" view (src/components/adventure/town-board.tsx).
 *
 * Two kinds of board ship today:
 *
 *  - SCAN boards (castle, rampart, inferno, necropolis, dungeon, tower,
 *    fortress, cove, conflux): the real printed board photographed on
 *    en.homm3bg.wiki (or, for cove/conflux, the physical Polish board assembled
 *    with English definitions by the assets-to-translate pipeline), as an
 *    `emptyImage` (name plates + costs in the seven bars) and a `fullImage`
 *    (all eight building tiles slotted in). The view overlays per-bar crops of
 *    the full scan onto the empty scan as buildings go up — the crop geometry
 *    lives in `geometry` as fractions of the scan size, measured once from the
 *    shared Archon die-cut. Stronghold has a fan-made empty board scan but no
 *    fully-built scan, so its built bars use the designed tile fill instead.
 *
 *  - DESIGNED boards (stronghold's fills, bulwark, factory): no
 *    printed board is published, so the view draws the same die-cut layout in
 *    CSS: bars over the empty PC townscape (built bars reveal the fully-built
 *    slice and overlay per-building tile art where a file exists — see
 *    `townBoardTileArt` and public/assets/town-board/README.md), definition
 *    cards in the bottom-left corner, and the AUTHENTIC printed resource-track
 *    + token-well panel (`panelImage`, cropped from the Stronghold fan scan by
 *    scripts/crop-town-tracks-panel.py) pasted bottom-right at the exact
 *    fractional rectangle it was cut from.
 *
 * The `bars` arrays transcribe the printed boards plate-by-plate (verified
 * against the wiki scans): seven bars for eight buildings, so exactly one bar
 * carries two buildings. While only one of the pair is built, the view blurs
 * and outlines that bar and notes which half is missing.
 */

export type TownTrackResource = "gold" | "buildingMaterials" | "valuables";

export type TownBoardGeometry = {
  /** Native scan size the fractions were measured on (aspect ratio source). */
  aspect: readonly [number, number];
  /** The townscape window holding the seven building bars. */
  window: { left: number; top: number; bottom: number; barPitch: number };
  /** The printed building-definition corner (bottom left). */
  definitions: { left: number; top: number; right: number; bottom: number };
  /** The three resource-gain tracks (bottom right): 8 cells each, zigzag. */
  tracks: {
    firstCellX: number;
    cellPitchX: number;
    /** Odd cells print slightly lower than even ones. */
    zigzagDy: number;
    /** Where the row's resource icon prints (drawn only on designed boards). */
    iconX: number;
    rows: readonly { resource: TownTrackResource; y: number; values: readonly number[] }[];
  };
  /** The build / population / spell-book token wells (bottom right). */
  tokens: {
    radius: number;
    slots: readonly { kind: "build" | "population" | "spellBook"; x: number; y: number }[];
  };
  /**
   * Where the authentic printed tracks/tokens panel (`panelImage`) sits —
   * designed boards paste the Stronghold-scan crop back at the exact
   * fractional rectangle it was cut from (scripts/crop-town-tracks-panel.py),
   * so the tracks/tokens fractions above stay pixel-true to the print.
   */
  panel?: { left: number; top: number; right: number; bottom: number };
};

export type TownBoardSpec = {
  factionId: string;
  /** Real printed-board scan of the empty board (bars show plates + costs). */
  emptyImage?: string;
  /** Real printed-board scan with every building tile slotted in. */
  fullImage?: string;
  /** Designed boards: fully-built PC townscape drawn behind the bars. */
  panoramaImage?: string;
  /**
   * Seven pre-sliced construction tiles cut from one continuous fully-built
   * panorama.  Each image is the exact left-to-right counterpart of the same
   * strip in `panoramaImage`, so any mixture of built and unbuilt bars still
   * reads as one town instead of seven unrelated illustrations.
   */
  barTileImages?: readonly string[];
  /** Designed boards: the authentic printed tracks/tokens panel (a crop of the
   *  Stronghold fan scan) pasted at `geometry.panel` instead of CSS cells. */
  panelImage?: string;
  /**
   * Real printed BUILDING-TILE art per slot (the physical Factory board): each
   * building has a full-bleed built-art tile (`townBoardTileArt`) and an unbuilt
   * name/cost plaque tile (`townBoardUnbuiltTileArt`). When set, the board view
   * shows those portrait tiles directly (built = art, unbuilt = plaque) instead
   * of the panorama-reveal + CSS plate — so the slots read like the real board.
   */
  realTileArt?: boolean;
  /**
   * The SHARED (two-in-one) bar ships a dedicated printed DOUBLE-SIDED tile
   * instead of splitting into two half-slots: one printed face for "exactly one
   * of the pair built", one for "both built". The physical Stronghold board
   * flips this tile when the second building goes up, so the view shows the
   * matching face CRISP (never blurred) and — while only one is up — labels
   * which building is built and which is not. Applies to the unique length-2
   * bar (there is exactly one per board, enforced in boards.test.ts).
   */
  combinedTile?: {
    /** Printed face shown when exactly ONE of the pair is built. */
    oneBuiltImage: string;
    /** Printed face shown when BOTH of the pair are built. */
    bothBuiltImage: string;
  };
  /** Seven bars, left to right; the one two-entry bar is the shared bar. */
  bars: readonly (readonly string[])[];
  geometry: TownBoardGeometry;
};

/** The printed production values, shared by every board. */
export const TOWN_TRACK_VALUES: Record<TownTrackResource, readonly number[]> = {
  gold: [10, 15, 20, 25, 30, 35, 40, 45],
  buildingMaterials: [0, 2, 4, 6, 8, 10, 12, 14],
  valuables: [0, 1, 2, 3, 4, 5, 6, 7]
};

/**
 * The Archon die-cut all seven wiki scans share, measured on the 2265x1651
 * scans (tile seams sit at x = 93 + 296.9·i; the tile faces span y 70–765;
 * the tracks/token geometry comes from the printed bottom-right section).
 * Designed boards draw themselves to the same fractions.
 */
const WIKI_GEOMETRY: TownBoardGeometry = {
  aspect: [2265, 1651],
  window: { left: 0.0411, top: 0.0424, bottom: 0.4634, barPitch: 0.13107 },
  definitions: { left: 0.028, top: 0.482, right: 0.585, bottom: 0.985 },
  tracks: {
    firstCellX: 0.6322,
    cellPitchX: 0.04194,
    zigzagDy: 0.0097,
    iconX: 0.605,
    rows: [
      { resource: "gold", y: 0.52, values: TOWN_TRACK_VALUES.gold },
      { resource: "buildingMaterials", y: 0.6196, values: TOWN_TRACK_VALUES.buildingMaterials },
      { resource: "valuables", y: 0.7249, values: TOWN_TRACK_VALUES.valuables }
    ]
  },
  tokens: {
    radius: 0.0442,
    slots: [
      { kind: "build", x: 0.6291, y: 0.872 },
      { kind: "population", x: 0.7594, y: 0.872 },
      { kind: "spellBook", x: 0.8963, y: 0.872 }
    ]
  }
};

/** The fan-made Stronghold empty board (1800x1319) uses its own layout. */
const STRONGHOLD_GEOMETRY: TownBoardGeometry = {
  aspect: [1800, 1319],
  window: { left: 0.039, top: 0.036, bottom: 0.4701, barPitch: 0.1325 },
  definitions: { left: 0.025, top: 0.482, right: 0.536, bottom: 0.96 },
  tracks: {
    firstCellX: 0.625,
    cellPitchX: 0.0439,
    zigzagDy: 0.009,
    iconX: 0.575,
    rows: [
      { resource: "gold", y: 0.5292, values: TOWN_TRACK_VALUES.gold },
      { resource: "buildingMaterials", y: 0.6338, values: TOWN_TRACK_VALUES.buildingMaterials },
      { resource: "valuables", y: 0.7377, values: TOWN_TRACK_VALUES.valuables }
    ]
  },
  tokens: {
    radius: 0.0572,
    slots: [
      { kind: "build", x: 0.6356, y: 0.8703 },
      { kind: "population", x: 0.7594, y: 0.8703 },
      { kind: "spellBook", x: 0.8878, y: 0.8674 }
    ]
  }
};

/**
 * DESIGNED boards (bulwark, factory) borrow the Stronghold fan
 * layout wholesale and paste the AUTHENTIC printed tracks/tokens panel — a
 * crop of that very scan (scripts/crop-town-tracks-panel.py) — back at the
 * exact rectangle it was cut from, so every track/token fraction above stays
 * pixel-true to the print instead of being redrawn as CSS cells.
 */
const DESIGNED_GEOMETRY: TownBoardGeometry = {
  ...STRONGHOLD_GEOMETRY,
  panel: { left: 0.545, top: 0.4735, right: 0.9745, bottom: 0.9665 }
};

const DESIGNED_PANEL_IMAGE = "/assets/town-tracks-panel.webp";

/**
 * Cove and Conflux ship REAL printed English board scans (the pipeline under
 * assets-to-translate/cove-conflux-town-boards/ assembled the physical Polish
 * boards with English definition panels + building tiles): an `emptyImage` with
 * the seven name/cost bars and a `fullImage` with every building tile seated, so
 * they render like the other scan boards (castle…fortress) — the definitions,
 * resource tracks and token wells are all PRINTED on the scan, no CSS panel.
 *
 * The two boards share one printed lower panel (definitions bottom-left, the
 * three resource-gain tracks + build/population/spell-book token wells
 * bottom-right); only the top tile-window aspect differs slightly between the
 * two photographed boards. Track fractions are CENTRES of the printed cells on
 * the shipped scans (towns-{cove,conflux}-board-*.webp, ~820×606) — NOT the
 * wiki 2265×1651 die-cut (`WIKI_GEOMETRY`). Markers/wells use
 * translate(-50%,-50%), so track/token x,y are cell centres.
 *
 * Recalibrated against the printed number centres on both empty scans (the
 * earlier firstCellX 0.598 / materials y 0.637 / zigzagDy 0.02 sat ~half a cell
 * left and a full cell low of the gold/ore/valuable tracks). Token wells were
 * already correct and are left per-board below.
 */
// The definitions corner and the three resource-gain tracks print at the same
// fractions on both photographed boards (same die-cut, same tight crop); only
// the token wells sit a few thousandths apart, so each board carries its own.
const COVE_CONFLUX_DEFS_TRACKS: Pick<TownBoardGeometry, "definitions" | "tracks"> = {
  definitions: { left: 0.045, top: 0.485, right: 0.545, bottom: 0.945 },
  tracks: {
    // Cell 0 centre ≈ 0.640; cell 7 centre ≈ 0.934 → pitch 0.042.
    firstCellX: 0.64,
    cellPitchX: 0.042,
    // Odd cells sit one notch lower than even ones (same order of magnitude as
    // the wiki board's 0.0097, scaled to this tighter crop).
    zigzagDy: 0.0105,
    iconX: 0.575,
    rows: [
      { resource: "gold", y: 0.514, values: TOWN_TRACK_VALUES.gold },
      { resource: "buildingMaterials", y: 0.612, values: TOWN_TRACK_VALUES.buildingMaterials },
      { resource: "valuables", y: 0.713, values: TOWN_TRACK_VALUES.valuables }
    ]
  }
};

/** Cove printed board (towns-cove-board-*.webp, 820x606). */
const COVE_GEOMETRY: TownBoardGeometry = {
  aspect: [820, 606],
  window: { left: 0.045, top: 0.05, bottom: 0.42, barPitch: 0.13 },
  ...COVE_CONFLUX_DEFS_TRACKS,
  tokens: {
    radius: 0.05,
    slots: [
      { kind: "build", x: 0.636, y: 0.855 },
      { kind: "population", x: 0.771, y: 0.855 },
      { kind: "spellBook", x: 0.901, y: 0.855 }
    ]
  }
};

/** Conflux printed board (towns-conflux-board-*.webp, 826x605). */
const CONFLUX_GEOMETRY: TownBoardGeometry = {
  aspect: [826, 605],
  window: { left: 0.043, top: 0.05, bottom: 0.42, barPitch: 0.13 },
  ...COVE_CONFLUX_DEFS_TRACKS,
  tokens: {
    radius: 0.05,
    slots: [
      { kind: "build", x: 0.631, y: 0.855 },
      { kind: "population", x: 0.764, y: 0.855 },
      { kind: "spellBook", x: 0.894, y: 0.855 }
    ]
  }
};

export const townBoardSpecs: Record<string, TownBoardSpec> = {
  castle: {
    factionId: "castle",
    emptyImage: "/assets/towns-castle-empty.webp",
    fullImage: "/assets/towns-castle-full.webp",
    bars: [
      ["castle.brotherhood_of_the_sword"],
      ["castle.city_hall"],
      ["castle.dwelling_bronze", "castle.blacksmith"],
      ["castle.dwelling_gold"],
      ["castle.dwelling_silver"],
      ["castle.citadel"],
      ["castle.mage_guild"]
    ],
    geometry: WIKI_GEOMETRY
  },
  rampart: {
    factionId: "rampart",
    emptyImage: "/assets/towns-rampart-empty.webp",
    fullImage: "/assets/towns-rampart-full.webp",
    bars: [
      ["rampart.dwelling_bronze"],
      ["rampart.citadel", "rampart.saplings"],
      ["rampart.dwelling_silver"],
      ["rampart.mage_guild"],
      ["rampart.city_hall"],
      ["rampart.mystic_pond"],
      ["rampart.dwelling_gold"]
    ],
    geometry: WIKI_GEOMETRY
  },
  inferno: {
    factionId: "inferno",
    emptyImage: "/assets/towns-inferno-empty.webp",
    fullImage: "/assets/towns-inferno-full.webp",
    bars: [
      ["inferno.city_hall"],
      ["inferno.castle_gate"],
      ["inferno.dwelling_bronze", "inferno.brimstone_stormclouds"],
      ["inferno.citadel"],
      ["inferno.dwelling_gold"],
      ["inferno.dwelling_silver"],
      ["inferno.mage_guild"]
    ],
    geometry: WIKI_GEOMETRY
  },
  necropolis: {
    factionId: "necropolis",
    emptyImage: "/assets/towns-necropolis-empty.webp",
    fullImage: "/assets/towns-necropolis-full.webp",
    bars: [
      ["necropolis.dwelling_bronze"],
      ["necropolis.dwelling_silver"],
      ["necropolis.cover_of_darkness"],
      ["necropolis.citadel"],
      ["necropolis.mage_guild", "necropolis.necromancy_amplifier"],
      ["necropolis.city_hall"],
      ["necropolis.dwelling_gold"]
    ],
    geometry: WIKI_GEOMETRY
  },
  dungeon: {
    factionId: "dungeon",
    emptyImage: "/assets/towns-dungeon-empty.webp",
    fullImage: "/assets/towns-dungeon-full.webp",
    bars: [
      ["dungeon.dwelling_bronze"],
      ["dungeon.mage_guild", "dungeon.mana_vortex"],
      ["dungeon.city_hall"],
      ["dungeon.citadel"],
      ["dungeon.dwelling_silver"],
      ["dungeon.portal_of_summoning"],
      ["dungeon.dwelling_gold"]
    ],
    geometry: WIKI_GEOMETRY
  },
  tower: {
    factionId: "tower",
    emptyImage: "/assets/towns-tower-empty.webp",
    fullImage: "/assets/towns-tower-full.webp",
    bars: [
      ["tower.city_hall"],
      ["tower.dwelling_gold"],
      ["tower.dwelling_bronze"],
      ["tower.citadel"],
      ["tower.artifact_merchants"],
      ["tower.dwelling_silver"],
      ["tower.mage_guild", "tower.wall_of_knowledge"]
    ],
    geometry: WIKI_GEOMETRY
  },
  fortress: {
    factionId: "fortress",
    emptyImage: "/assets/towns-fortress-empty.webp",
    fullImage: "/assets/towns-fortress-full.webp",
    bars: [
      ["fortress.mage_guild"],
      ["fortress.dwelling_silver"],
      ["fortress.dwelling_bronze", "fortress.cage_of_warlords"],
      ["fortress.city_hall"],
      ["fortress.citadel"],
      ["fortress.blood_obelisk"],
      ["fortress.dwelling_gold"]
    ],
    geometry: WIKI_GEOMETRY
  },
  stronghold: {
    factionId: "stronghold",
    // Fan-made empty board in the official layout; no fully-built scan
    // exists, so built bars overlay the real printed board-game tile art
    // (public/assets/town-board/stronghold-*.webp) on the empty scan.
    emptyImage: "/assets/towns-stronghold-board.webp",
    // The Barracks Tower + Freelancer's Guild bar is a single printed
    // double-sided tile: `-shared-one` (Barracks Tower up, Freelancer's Guild
    // still a name/cost plate) while only one is built, `-shared-both` once the
    // pair is complete. Shown whole and crisp (no blur), unlike a split bar.
    combinedTile: {
      oneBuiltImage: "/assets/town-board/stronghold-shared-one.webp",
      bothBuiltImage: "/assets/town-board/stronghold-shared-both.webp"
    },
    bars: [
      ["stronghold.city_hall"],
      ["stronghold.dwelling_silver"],
      ["stronghold.hall_of_valhalla"],
      ["stronghold.dwelling_bronze", "stronghold.freelancers_guild"],
      ["stronghold.citadel"],
      ["stronghold.mage_guild"],
      ["stronghold.dwelling_gold"]
    ],
    geometry: STRONGHOLD_GEOMETRY
  },
  conflux: {
    factionId: "conflux",
    // Real printed English board scan (assets-to-translate/cove-conflux-town-
    // boards pipeline). Bars transcribe the PHYSICAL board left-to-right: City
    // Hall, Magic University (solo), Mage Guild, Altars of Fire and Earth
    // (silver), Magical Pyre (gold), Citadel, then the shared bar Altars of Air
    // and Water (bronze) + Garden of Life. Built bars reveal the fully-built
    // scan a slot at a time.
    emptyImage: "/assets/towns-conflux-board-empty.webp",
    fullImage: "/assets/towns-conflux-board-full.webp",
    bars: [
      ["conflux.city_hall"],
      ["conflux.magic_university"],
      ["conflux.mage_guild"],
      ["conflux.dwelling_silver"],
      ["conflux.dwelling_gold"],
      ["conflux.citadel"],
      ["conflux.dwelling_bronze", "conflux.garden_of_life"]
    ],
    geometry: CONFLUX_GEOMETRY
  },
  cove: {
    factionId: "cove",
    // Real printed English board scan (assets-to-translate/cove-conflux-town-
    // boards pipeline). Bars transcribe the PHYSICAL board left-to-right:
    // Thieves' Guild, City Hall, the shared bar Bay (bronze) + Pub, Mage Guild,
    // Redoubled Vortex (gold), Citadel, then Nests Towering the Seas (silver).
    // Built bars reveal the fully-built scan a slot at a time.
    emptyImage: "/assets/towns-cove-board-empty.webp",
    fullImage: "/assets/towns-cove-board-full.webp",
    bars: [
      ["cove.thieves_guild"],
      ["cove.city_hall"],
      ["cove.dwelling_bronze", "cove.pub"],
      ["cove.mage_guild"],
      ["cove.dwelling_gold"],
      ["cove.citadel"],
      ["cove.dwelling_silver"]
    ],
    geometry: COVE_GEOMETRY
  },
  bulwark: {
    factionId: "bulwark",
    // Published empty town background (thelazy.net "Bulwark-in-background"); the
    // built town (fullImage) is revealed a bar-slice at a time as you build.
    panoramaImage: "/assets/towns-bulwark-background.webp",
    fullImage: "/assets/towns-bulwark-empty.webp",
    panelImage: DESIGNED_PANEL_IMAGE,
    bars: [
      ["bulwark.city_hall"],
      ["bulwark.dwelling_bronze"],
      ["bulwark.dwelling_silver", "bulwark.altar"],
      ["bulwark.citadel"],
      ["bulwark.sieidi"],
      ["bulwark.dwelling_gold"],
      ["bulwark.mage_guild"]
    ],
    geometry: DESIGNED_GEOMETRY
  },
  factory: {
    factionId: "factory",
    // The real printed Factory town board: every slot shows its own portrait
    // building tile (public/assets/town-board/factory-<building>{,-unbuilt}.webp,
    // cropped from the physical board scans) — the name/cost plaque while unbuilt,
    // the built illustration once raised. No panorama-reveal, so nothing muddies
    // the tiles; the empty desert only shows in the gaps between slots.
    realTileArt: true,
    panoramaImage: "/assets/towns-factory-background.webp",
    panelImage: DESIGNED_PANEL_IMAGE,
    bars: [
      ["factory.city_hall"],
      ["factory.dwelling_bronze"],
      ["factory.dwelling_silver", "factory.bank"],
      ["factory.citadel"],
      ["factory.artifact_merchants"],
      ["factory.dwelling_gold"],
      ["factory.mage_guild"]
    ],
    geometry: DESIGNED_GEOMETRY
  },
  fuyuki: {
    factionId: "fuyuki",
    panoramaImage: "/assets/anime/towns/fuyuki-city-empty-v2.webp",
    fullImage: "/assets/anime/towns/fuyuki-city-full.webp",
    barTileImages: Array.from({ length: 7 }, (_, index) => `/assets/town-board/fuyuki-bar-${index + 1}.webp`),
    panelImage: DESIGNED_PANEL_IMAGE,
    bars: [
      ["fuyuki.city_hall"],
      ["fuyuki.dwelling_bronze"],
      ["fuyuki.summoning_circle"],
      ["fuyuki.dwelling_silver", "fuyuki.mystic_outfitter"],
      ["fuyuki.mage_guild"],
      ["fuyuki.citadel"],
      ["fuyuki.dwelling_gold"]
    ],
    geometry: DESIGNED_GEOMETRY
  },
  azure_breeze: {
    factionId: "azure_breeze",
    panoramaImage: "/assets/anime/towns/azure-breeze-sect-empty-v2.webp",
    fullImage: "/assets/anime/towns/azure-breeze-sect-full.webp",
    barTileImages: Array.from({ length: 7 }, (_, index) => `/assets/town-board/azure-breeze-bar-${index + 1}.webp`),
    panelImage: DESIGNED_PANEL_IMAGE,
    bars: [
      ["azure_breeze.dwelling_bronze"],
      ["azure_breeze.sword_pavilion"],
      ["azure_breeze.dwelling_silver"],
      ["azure_breeze.mage_guild", "azure_breeze.alchemy_pavilion"],
      ["azure_breeze.city_hall"],
      ["azure_breeze.citadel"],
      ["azure_breeze.dwelling_gold"]
    ],
    geometry: DESIGNED_GEOMETRY
  },
  hidden_leaf: {
    factionId: "hidden_leaf",
    panoramaImage: "/assets/anime/towns/hidden-leaf-village-empty.webp",
    fullImage: "/assets/anime/towns/hidden-leaf-village-full.webp",
    barTileImages: Array.from({ length: 7 }, (_, index) => `/assets/town-board/hidden-leaf-bar-${index + 1}.webp`),
    panelImage: DESIGNED_PANEL_IMAGE,
    // 8 buildings on 7 bars, exactly ONE two-building bar (mirrors Fuyuki):
    // the Chunin Exam Arena shares the LV4 dwelling bar. Bar assignment MUST
    // agree with animeTownBuildingBar in src/data/anime/towns.ts so each
    // building's strip art matches its bar.
    bars: [
      ["hidden_leaf.city_hall"],
      ["hidden_leaf.dwelling_bronze"],
      ["hidden_leaf.summoning_shrine"],
      ["hidden_leaf.dwelling_silver", "hidden_leaf.chunin_arena"],
      ["hidden_leaf.mage_guild"],
      ["hidden_leaf.citadel"],
      ["hidden_leaf.dwelling_gold"]
    ],
    geometry: DESIGNED_GEOMETRY
  },
  azur_lane: {
    factionId: "azur_lane",
    panoramaImage: "/assets/anime/towns/azur-lane-base-empty.webp",
    fullImage: "/assets/anime/towns/azur-lane-base-full.webp",
    barTileImages: Array.from({ length: 7 }, (_, index) => `/assets/town-board/azur-lane-bar-${index + 1}.webp`),
    panelImage: DESIGNED_PANEL_IMAGE,
    // 8 buildings on 7 bars, exactly ONE two-building bar (mirrors Fuyuki):
    // the Munitions Workshop shares the LV4 dwelling bar. Bar assignment MUST
    // agree with animeTownBuildingBar in src/data/anime/towns.ts so each
    // building's strip art matches its bar.
    bars: [
      ["azur_lane.city_hall"],
      ["azur_lane.dwelling_bronze"],
      ["azur_lane.munitions_workshop"],
      ["azur_lane.dwelling_silver", "azur_lane.exercise_waters"],
      ["azur_lane.mage_guild"],
      ["azur_lane.citadel"],
      ["azur_lane.dwelling_gold"]
    ],
    geometry: DESIGNED_GEOMETRY
  },
  heavenly_demon: {
    factionId: "heavenly_demon",
    panoramaImage: "/assets/anime/towns/heavenly-demon-palace-empty.webp",
    fullImage: "/assets/anime/towns/heavenly-demon-palace-full.webp",
    barTileImages: Array.from({ length: 7 }, (_, index) => `/assets/town-board/heavenly-demon-bar-${index + 1}.webp`),
    panelImage: DESIGNED_PANEL_IMAGE,
    // 8 buildings on 7 bars, exactly ONE two-building bar — a DISTINCT order from
    // the other anime boards (the shared bar sits at slot 3, not 4): the Blood
    // Summoning Altar shares the bronze dwelling bar. Bar assignment MUST agree
    // with animeTownBuildingBar in src/data/anime/towns.ts so each building's
    // strip art matches its bar.
    bars: [
      ["heavenly_demon.city_hall"],
      ["heavenly_demon.citadel"],
      ["heavenly_demon.dwelling_bronze", "heavenly_demon.summoning_altar"],
      ["heavenly_demon.dwelling_silver"],
      ["heavenly_demon.mage_guild"],
      ["heavenly_demon.demon_arena"],
      ["heavenly_demon.dwelling_gold"]
    ],
    geometry: DESIGNED_GEOMETRY
  }
};

/**
 * Conventional per-building tile art slot for designed boards (and the
 * stronghold scan, which has no fully-built photo): drop a
 * `public/assets/town-board/<faction>-<building>.webp` in and the board picks
 * it up (the view falls back to the panorama slice / a styled plaque while
 * the file is missing).
 */
export function townBoardTileArt(buildingId: string): string {
  return `/assets/town-board/${buildingId.replace(".", "-")}.webp`;
}

/**
 * The UNBUILT printed slot tile (name + cost plaque) for a `realTileArt` board.
 * File convention `<faction>-<building>-unbuilt.webp` alongside the built art.
 */
export function townBoardUnbuiltTileArt(buildingId: string): string {
  return `/assets/town-board/${buildingId.replace(".", "-")}-unbuilt.webp`;
}

/**
 * The authentic build / population / spell-book token icons, cropped from the
 * printed board scan. Used wherever a token state is shown outside a printed
 * board: the town-window header and the adventure town dock.
 */
export const TOWN_TOKEN_ICONS: Record<"build" | "population" | "spellBook", string> = {
  build: "/assets/token-build.webp",
  population: "/assets/token-population.webp",
  spellBook: "/assets/token-spellbook.webp"
};

/**
 * The town's Adventure-Map capitol sprite (thelazy.net, `Adventure_Map_<Town>
 * _capitol`), used at the top of the town window and in the adventure town/hero
 * dock. Every faction — including Bulwark — has one; the TownIcon component
 * still falls back to a plaque if a file is ever missing.
 */
export function townIconUrl(factionId: string): string {
  return `/assets/town-icon-${factionId}.webp`;
}

/** The bar index (0-6) a building occupies on its faction board, or -1. */
export function townBoardBarIndex(spec: TownBoardSpec, buildingId: string): number {
  return spec.bars.findIndex((bar) => bar.includes(buildingId));
}
