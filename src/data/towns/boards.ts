/**
 * Town BOARD manifest: the physical board-game town boards, as rendered by the
 * Town window's default "board" view (src/components/adventure/town-board.tsx).
 *
 * Two kinds of board ship today:
 *
 *  - SCAN boards (castle, rampart, inferno, necropolis, dungeon, tower,
 *    fortress): the real printed board photographed on en.homm3bg.wiki, as an
 *    `emptyImage` (name plates + costs in the seven bars) and a `fullImage`
 *    (all eight building tiles slotted in). The view overlays per-bar crops of
 *    the full scan onto the empty scan as buildings go up — the crop geometry
 *    lives in `geometry` as fractions of the scan size, measured once from the
 *    shared Archon die-cut. Stronghold has a fan-made empty board scan but no
 *    fully-built scan, so its built bars use the designed tile fill instead.
 *
 *  - DESIGNED boards (stronghold's fills, conflux, cove, bulwark, factory): no
 *    printed board is published, so the view draws the same die-cut layout in
 *    CSS (bars over a fully-built PC townscape panorama, definition cards in
 *    the bottom-left corner, the resource-gain tracks and the three
 *    build/population/spell token wells bottom-right). Per-building tile art
 *    can be dropped in later (see `townBoardTileArt` and
 *    public/assets/town-board/README.md) without touching any code.
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
};

export type TownBoardSpec = {
  factionId: string;
  /** Real printed-board scan of the empty board (bars show plates + costs). */
  emptyImage?: string;
  /** Real printed-board scan with every building tile slotted in. */
  fullImage?: string;
  /** Designed boards: fully-built PC townscape drawn behind the bars. */
  panoramaImage?: string;
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
    // exists, so built bars use the designed tile fill.
    emptyImage: "/assets/towns-stronghold-board.webp",
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
    // towns-conflux-empty.webp is the fully-built PC townscape (older fetch
    // script naming), not a board scan — it backs the designed board here.
    panoramaImage: "/assets/towns-conflux-empty.webp",
    bars: [
      ["conflux.city_hall"],
      ["conflux.dwelling_bronze"],
      ["conflux.dwelling_silver", "conflux.magic_university"],
      ["conflux.citadel"],
      ["conflux.garden_of_life"],
      ["conflux.dwelling_gold"],
      ["conflux.mage_guild"]
    ],
    geometry: WIKI_GEOMETRY
  },
  cove: {
    factionId: "cove",
    panoramaImage: "/assets/towns-cove-town.webp",
    bars: [
      ["cove.city_hall"],
      ["cove.dwelling_bronze"],
      ["cove.dwelling_silver", "cove.pub"],
      ["cove.citadel"],
      ["cove.thieves_guild"],
      ["cove.dwelling_gold"],
      ["cove.mage_guild"]
    ],
    geometry: WIKI_GEOMETRY
  },
  bulwark: {
    factionId: "bulwark",
    panoramaImage: "/assets/towns-bulwark-empty.webp",
    bars: [
      ["bulwark.city_hall"],
      ["bulwark.dwelling_bronze"],
      ["bulwark.dwelling_silver", "bulwark.altar"],
      ["bulwark.citadel"],
      ["bulwark.sieidi"],
      ["bulwark.dwelling_gold"],
      ["bulwark.mage_guild"]
    ],
    geometry: WIKI_GEOMETRY
  },
  factory: {
    factionId: "factory",
    panoramaImage: "/assets/towns-factory-empty.webp",
    bars: [
      ["factory.city_hall"],
      ["factory.dwelling_bronze"],
      ["factory.dwelling_silver", "factory.bank"],
      ["factory.citadel"],
      ["factory.artifact_merchants"],
      ["factory.dwelling_gold"],
      ["factory.mage_guild"]
    ],
    geometry: WIKI_GEOMETRY
  }
};

/**
 * Conventional per-building tile art slot for designed boards (and the
 * stronghold scan, which has no fully-built photo): drop a
 * `public/assets/town-board/<faction>-<building>.webp` in and the board picks
 * it up (the view falls back to a styled plaque while the file is missing).
 */
export function townBoardTileArt(buildingId: string): string {
  return `/assets/town-board/${buildingId.replace(".", "-")}.webp`;
}

/** The bar index (0-6) a building occupies on its faction board, or -1. */
export function townBoardBarIndex(spec: TownBoardSpec, buildingId: string): number {
  return spec.bars.findIndex((bar) => bar.includes(buildingId));
}
