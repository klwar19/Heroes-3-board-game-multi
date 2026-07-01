import type { TileDefinition } from "./types";

/**
 * Expansion and stretch-goal map tiles beyond the four boxed sets already in
 * `tile-defs.ts` (core, Rampart, Fortress, Inferno). Field lists, guard
 * difficulties, terrains and content sets are transcribed from the fan wiki
 * tile pages (https://en.homm3bg.wiki/tiles/) and cross-checked against the
 * community rulebook. Standard incomes follow the rulebook mine table
 * (+5 gold / +2 materials / +1 valuables; water wheel +3 gold; windmill
 * +1 valuables - including the corrected #N3 windmill misprint).
 *
 * `outerImpassable` was measured from the high-resolution community tile art
 * by sampling the printed cream border lines along every outer hex edge at
 * the verified canonical orientation; the same detector reproduces the
 * scan-verified borders of all 41 boxed tiles with zero mismatches. The few
 * tiles whose art is not in the asset set yet derive borders from their
 * blocked fields only and say so in their credit line.
 *
 * Sea and Subterranean tiles never enter the default setup pools (they need
 * sailing / gate scenarios); they become draftable once a scenario enables
 * their content set.
 */
export const expansionTileDefinitions: Record<string, TileDefinition> = {
  S7: {
    id: "S7",
    group: "starting",
    content: "stronghold_expansion",
    terrain: "rough",
    fields: [
      { location: "town", faction: "stronghold" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "empty_field" },
      { location: "resource_symbol" },
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s7.webp"
    }
  },
  S8: {
    id: "S8",
    group: "starting",
    content: "conflux_expansion",
    terrain: "grass",
    fields: [
      { location: "town", faction: "conflux" },
      { location: "empty_field" },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "treasure_symbol", difficulty: 1 },
    ],
    outerImpassable: [true, true, true, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s8/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s8.webp"
    }
  },
  S9: {
    id: "S9",
    group: "starting",
    content: "cove_expansion",
    terrain: "highlands",
    fields: [
      { location: "town", faction: "cove" },
      { location: "empty_field" },
      { location: "empty_field" },
      { location: "resource_symbol" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "blocked_field" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
    ],
    outerImpassable: [true, true, true, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s9/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s9.webp"
    }
  },
  "#S1": {
    id: "#S1",
    group: "starting",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "town", faction: "tower" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
    ],
    outerImpassable: [true, false, true, true, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/sx1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/sx1.webp"
    }
  },
  S10: {
    id: "S10",
    group: "starting",
    content: "bulwark_expansion",
    terrain: "snow",
    // The Bulwark town tile is drawn on the SAME snow environment as the Tower
    // starting tile (#S1, /assets/board/tiles/sx1.webp) — only the central town
    // building is repainted as the Bulwark (frozen-Norse) town. Because a tile's
    // field symbols are baked into its art (the engine hides the glyph overlay
    // once `assets.tileImage` is set — see screen.tsx renderTileArt), S10's hexes
    // mirror #S1's EXACTLY so the Tower-derived art lines up with the engine:
    // identical ring arrangement and outer borders, with the town faction swapped
    // to bulwark. Generation prompt: scripts/bulwark-specialty-cards-runbook.md.
    fields: [
      { location: "town", faction: "bulwark" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
    ],
    outerImpassable: [true, false, true, true, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Bulwark Expansion)",
      credit: "Fan-faction starting tile; snow terrain and hex layout mirror the Tower starting tile (#S1), which is the art base. Placeholder art pending; verify against physical tiles before final release.",
      url: "https://heroes.thelazy.net/index.php/Bulwark"
    },
    assets: {
      tileImage: "/assets/board/tiles/s10.webp"
    }
  },
  "&S1": {
    id: "&S1",
    group: "starting",
    content: "regular_stretch_goals",
    terrain: "rough",
    // The Factory starting tile — labelled "&S1" on the tile (the "&" prefix is the
    // Factory set's marker, like "#" is another set's). Its industrial/wasteland
    // theme sits on ROUGH terrain, so the hex layout and outer borders mirror the
    // Stronghold starting tile (S7), which is the art base: scripts composite the
    // Factory town panorama over S7's central town hex and re-label it "&S1"
    // (placeholder art, like Bulwark's S10), keeping S7's ring glyphs so the engine
    // fields line up. Drop in the real &S1 scan to replace it.
    fields: [
      { location: "town", faction: "factory" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "empty_field" },
      { location: "resource_symbol" },
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory starting tile (labelled &S1); rough terrain and hex layout mirror the Stronghold starting tile (S7), the placeholder art base (Factory town composited over the centre, re-labelled &S1). Verify against physical tiles before final release.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/sf1.webp"
    }
  },
  F19: {
    id: "F19",
    group: "far",
    content: "stronghold_expansion",
    terrain: "rough",
    fields: [
      { location: "blocked_field" },
      { location: "learning_stone", difficulty: 2 },
      { location: "stables" },
      { location: "shrine_of_magic_incantation" },
      { location: "settlement", difficulty: 3, faction: "stronghold" },
      { location: "temple" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f19/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f19.webp"
    }
  },
  F20: {
    id: "F20",
    group: "far",
    content: "stronghold_expansion",
    terrain: "rough",
    fields: [
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "tree_of_knowledge" },
      { location: "empty_field" },
      { location: "trading_post" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "artifact_symbol", difficulty: 2 },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f20/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f20.webp"
    }
  },
  F21: {
    id: "F21",
    group: "far",
    content: "stronghold_expansion",
    terrain: "rough",
    fields: [
      { location: "spell_scroll" },
      { location: "empty_field" },
      { location: "mystical_garden", difficulty: 2 },
      { location: "fountain_of_youth" },
      { location: "redwood_observatory" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f21/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f21.webp"
    }
  },
  F22: {
    id: "F22",
    group: "far",
    content: "conflux_expansion",
    terrain: "grass",
    fields: [
      { location: "settlement", difficulty: 3, faction: "conflux" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "trading_post" },
      { location: "learning_stone", difficulty: 2 },
      { location: "witch_hut" },
      { location: "shrine_of_magic_incantation" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f22/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f22.webp"
    }
  },
  F23: {
    id: "F23",
    group: "far",
    content: "conflux_expansion",
    terrain: "grass",
    fields: [
      { location: "faerie_ring" },
      { location: "temple" },
      { location: "tree_of_knowledge" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "empty_field" },
      { location: "elemental_conflux", difficulty: 2 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f23/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f23.webp"
    }
  },
  F24: {
    id: "F24",
    group: "far",
    content: "conflux_expansion",
    terrain: "grass",
    fields: [
      { location: "shrine_of_magic_incantation" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "empty_field" },
      { location: "artifact_symbol" },
      { location: "blocked_field" },
      { location: "redwood_observatory" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f24/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f24.webp"
    }
  },
  F25: {
    id: "F25",
    group: "far",
    content: "cove_expansion",
    terrain: "highlands",
    fields: [
      { location: "artifact_symbol", difficulty: 2 },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "trading_post" },
      { location: "stables" },
      { location: "settlement", difficulty: 3, faction: "cove" },
      { location: "shrine_of_magic_incantation" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f25/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f25.webp"
    }
  },
  F26: {
    id: "F26",
    group: "far",
    content: "cove_expansion",
    terrain: "highlands",
    fields: [
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "grave", difficulty: 2 },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "magic_spring" },
      { location: "shrine_of_magic_incantation" },
      { location: "blocked_field" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f26/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f26.webp"
    }
  },
  F27: {
    id: "F27",
    group: "far",
    content: "cove_expansion",
    terrain: "highlands",
    fields: [
      { location: "empty_field" },
      { location: "trading_post" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "blocked_field" },
      { location: "learning_stone", difficulty: 2 },
      { location: "resource_symbol" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f27/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f27.webp"
    }
  },
  "#F1": {
    id: "#F1",
    group: "far",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "blocked_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "witch_hut" },
      { location: "stables" },
      { location: "settlement", difficulty: 3, faction: "tower" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx1.webp"
    }
  },
  "#F2": {
    id: "#F2",
    group: "far",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "empty_field" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "learning_stone" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "blocked_field" },
      { location: "resource_symbol" },
      { location: "trading_post" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx2.webp"
    }
  },
  "#F3": {
    id: "#F3",
    group: "far",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "redwood_observatory" },
      { location: "shrine_of_magic_incantation" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "empty_field" },
      { location: "mystical_garden", difficulty: 2 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx3.webp"
    }
  },
  "#F4": {
    id: "#F4",
    group: "far",
    content: "tower_expansion",
    terrain: "grass",
    fields: [
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "shrine_of_magic_incantation" },
      { location: "blocked_field" },
      { location: "market_of_time", difficulty: 2 },
      { location: "trading_post" },
      { location: "witch_hut" },
      { location: "water_wheel", resource: "gold", amount: 3 },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx4.webp"
    }
  },
  "#F5": {
    id: "#F5",
    group: "far",
    content: "tower_expansion",
    terrain: "subterranean",
    fields: [
      { location: "treasure_symbol" },
      { location: "black_market" },
      { location: "magic_spring", difficulty: 2 },
      { location: "mystical_garden" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx5.webp"
    }
  },
  "#F6": {
    id: "#F6",
    group: "far",
    content: "tower_expansion",
    terrain: "dirt",
    fields: [
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "blocked_field" },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "redwood_observatory" },
      { location: "library_of_enlightenment" },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "trading_post" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx6.webp"
    }
  },
  "#F7": {
    id: "#F7",
    group: "far",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "hill_fort", difficulty: 2 },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "trading_post" },
      { location: "magic_spring" },
      { location: "blocked_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "stables" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx7.webp"
    }
  },
  "#F8": {
    id: "#F8",
    group: "far",
    content: "tower_expansion",
    terrain: "grass",
    fields: [
      { location: "resource_symbol", difficulty: 2 },
      { location: "stables" },
      { location: "university" },
      { location: "temple" },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "shrine_of_magic_incantation" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx8/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx8.webp"
    }
  },
  "#F9": {
    id: "#F9",
    group: "far",
    content: "tower_expansion",
    terrain: "swamp",
    fields: [
      { location: "redwood_observatory" },
      { location: "temple" },
      { location: "mystical_garden", difficulty: 2 },
      { location: "blocked_field" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "tavern" },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx9/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx9.webp"
    }
  },
  "#F10": {
    id: "#F10",
    group: "far",
    content: "tower_expansion",
    terrain: "dirt",
    fields: [
      { location: "blocked_field" },
      { location: "artifact_symbol" },
      { location: "trading_post" },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "witch_hut" },
      { location: "treasure_symbol" },
      { location: "prison", difficulty: 2 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx10/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx10.webp"
    }
  },
  "#F11": {
    id: "#F11",
    group: "far",
    content: "regular_stretch_goals",
    terrain: "rough",
    fields: [
      { location: "empty_field" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "shrine_of_magic_incantation" },
      { location: "blocked_field" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "trading_post" },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx11/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx11.webp"
    }
  },
  "#F12": {
    id: "#F12",
    group: "far",
    content: "regular_stretch_goals",
    terrain: "grass",
    fields: [
      { location: "blocked_field" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "empty_field" },
      { location: "witch_hut" },
      { location: "stables" },
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "windmill", resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx12/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx12.webp"
    }
  },
  "#F13": {
    id: "#F13",
    group: "far",
    content: "regular_stretch_goals",
    terrain: "grass",
    fields: [
      { location: "mine", difficulty: 3, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "trading_post" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "empty_field" },
      { location: "mystical_garden" },
      { location: "shrine_of_magic_incantation" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/fx13/"
    },
    assets: {
      tileImage: "/assets/board/tiles/fx13.webp"
    }
  },
  N13: {
    id: "N13",
    group: "near",
    content: "stronghold_expansion",
    terrain: "rough",
    fields: [
      { location: "tree_of_knowledge" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "empty_field" },
      { location: "blocked_field" },
      { location: "treasure_symbol", difficulty: 4 },
      { location: "shrine_of_magic_gesture" },
      { location: "spell_scroll" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n13/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n13.webp"
    }
  },
  N14: {
    id: "N14",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "blocked_field" },
      { location: "treasure_symbol" },
      { location: "trading_post" },
      { location: "faerie_ring" },
      { location: "magic_spring", difficulty: 4 },
      { location: "shrine_of_magic_gesture" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n14/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n14.webp"
    }
  },
  N15: {
    id: "N15",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "obelisk" },
      { location: "warriors_tomb" },
      { location: "blocked_field" },
      { location: "trading_post" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "elemental_conflux", difficulty: 4 },
      { location: "mystical_garden" },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n15/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n15.webp"
    }
  },
  N16: {
    id: "N16",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "stables" },
      { location: "elemental_conflux", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "trading_post" },
      { location: "artifact_symbol" },
      { location: "blocked_field" },
      { location: "fountain_of_youth" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n16/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n16.webp"
    }
  },
  N17: {
    id: "N17",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "obelisk" },
      { location: "blocked_field" },
      { location: "redwood_observatory" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "pandoras_box", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "shrine_of_magic_gesture" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n17/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n17.webp"
    }
  },
  N18: {
    id: "N18",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "stables" },
      { location: "magic_spring" },
      { location: "shrine_of_magic_gesture" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "blocked_field" },
      { location: "redwood_observatory" },
      { location: "elemental_conflux", difficulty: 4 },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n18/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n18.webp"
    }
  },
  N19: {
    id: "N19",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "obelisk" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "pandoras_box", difficulty: 4 },
      { location: "blocked_field" },
      { location: "temple" },
      { location: "faerie_ring" },
      { location: "trading_post" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n19/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n19.webp"
    }
  },
  N20: {
    id: "N20",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "warriors_tomb" },
      { location: "blocked_field" },
      { location: "magic_spring" },
      { location: "elemental_conflux", difficulty: 4 },
      { location: "trading_post" },
      { location: "shrine_of_magic_gesture" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n20/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n20.webp"
    }
  },
  N21: {
    id: "N21",
    group: "near",
    content: "conflux_expansion",
    terrain: "dirt",
    fields: [
      { location: "obelisk" },
      { location: "temple" },
      { location: "faerie_ring" },
      { location: "pandoras_box", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "tree_of_knowledge" },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Conflux Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n21/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n21.webp"
    }
  },
  N22: {
    id: "N22",
    group: "near",
    content: "cove_expansion",
    terrain: "highlands",
    fields: [
      { location: "warriors_tomb", difficulty: 4 },
      { location: "sanctuary" },
      { location: "trading_post" },
      { location: "blocked_field" },
      { location: "grave" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n22/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n22.webp"
    }
  },
  // --- Factory "&" tile set (near/far/center) -----------------------------
  // Fields transcribed from the physical Factory tile SCANS (the "&"-prefixed
  // desert tiles). These tiles are NOT on the fan wiki, so the field TYPES are
  // assigned from the printed art: the anchor "&"-label hex = blocked_field, a
  // cart of resources = mine (colour picks gold / buildingMaterials / valuables,
  // "loop N" = amount, the adjacent Roman numeral = guard difficulty), a shovel =
  // artifact_dig (the Factory Excavation), an obelisk = obelisk, a gazebo "pay
  // 3 gold -> Spell" = shrine_of_magic, a "+3 gold" derrick = water_wheel, a "?"
  // reward token = treasure_symbol, and the &C1 centre airship+steamer = the
  // War Machine Factory field. tileImage is the real scan, flower-masked to alpha.
  // Guard difficulties come straight from the Roman numerals; the ring rotation /
  // outerImpassable are a best-fit from the art (see per-tile note).
  "&N1": {
    id: "&N1",
    group: "near",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &N1 scan: centre turquoise Obelisk; ring = Excavation (shovel), a "+3 gold"
    // derrick (water_wheel), a IV gazebo "pay 3 gold -> Spell" (shrine), the
    // &N1 tar-pit anchor (blocked), a "?" cabin (treasure), a V manor mine
    // "loop 1 valuables". Guards IV-V.
    fields: [
      { location: "obelisk" },
      { location: "artifact_dig" },
      { location: "water_wheel" },
      { location: "shrine_of_magic_gesture", difficulty: 4 },
      { location: "blocked_field" },
      { location: "treasure_symbol" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory near tile &N1 — fields transcribed from the physical tile scan (not on the wiki; field types assigned from the printed art). tileImage is the real scan, flower-masked to alpha.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/nf1.webp"
    }
  },
  "&N2": {
    id: "&N2",
    group: "near",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &N2 scan: centre Tree-spirit (tree_of_knowledge); ring = a waterfall face
    // (magic_spring), a "?" treehouse (treasure), a V mine "loop 5 gold", a IV
    // alchemist tower "?" (mystical_garden), the &N2 chasm anchor (blocked), open
    // ground. Guards IV-V.
    fields: [
      { location: "tree_of_knowledge" },
      { location: "magic_spring" },
      { location: "treasure_symbol" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "mystical_garden", difficulty: 4 },
      { location: "blocked_field" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory near tile &N2 — fields transcribed from the physical tile scan (not on the wiki; field types assigned from the printed art). tileImage is the real scan, flower-masked to alpha.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/nf2.webp"
    }
  },
  "&F1": {
    id: "&F1",
    group: "far",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &F1 scan: the &F1 rock+tar anchor sits centre (blocked); ring = an Obelisk
    // (with the star banner), a Teepee+horse (stables), a III cathedral "?"
    // (temple), a "+3 gold" derrick (water_wheel), a II stilt-hut "?" (treasure),
    // open ground. Guards II-III.
    fields: [
      { location: "blocked_field" },
      { location: "obelisk" },
      { location: "stables" },
      { location: "temple", difficulty: 3 },
      { location: "water_wheel" },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory far tile &F1 — fields transcribed from the physical tile scan (not on the wiki; field types assigned from the printed art). tileImage is the real scan, flower-masked to alpha.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/ff1.webp"
    }
  },
  "&F2": {
    id: "&F2",
    group: "far",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &F2 scan: centre Prospector by the river "+1 valuables" (resource_symbol);
    // ring = a III mine "loop 5 gold", a "?" treehouse (treasure), a "?" cabin
    // (treasure), a II skeleton (grave), the &F2 river+scrub anchor (blocked),
    // open ground. Guards II-III.
    fields: [
      { location: "resource_symbol" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "treasure_symbol" },
      { location: "treasure_symbol" },
      { location: "grave", difficulty: 2 },
      { location: "blocked_field" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory far tile &F2 — fields transcribed from the physical tile scan (not on the wiki; field types assigned from the printed art). tileImage is the real scan, flower-masked to alpha.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/ff2.webp"
    }
  },
  "&F3": {
    id: "&F3",
    group: "far",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &F3 scan: centre white Church (temple); ring = the &F3 canyon+river anchor
    // (blocked), a sand-pit shovel (Excavation / artifact_dig), a III gem-pond mine
    // "loop 1 valuables", a II red chest "2 chest -> 1" (treasure), a "?" well
    // (magic_spring), open ground. Guards II-III.
    fields: [
      { location: "temple" },
      { location: "blocked_field" },
      { location: "artifact_dig" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "magic_spring" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory far tile &F3 — fields transcribed from the physical tile scan (not on the wiki; field types assigned from the printed art). tileImage is the real scan, flower-masked to alpha.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/ff3.webp"
    }
  },
  "&C1": {
    id: "&C1",
    group: "center",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &C1 scan (a CENTER tile, guards VI-VII): centre airship + paddle-steamer =
    // the Factory War Machine Factory (buy a war machine cheaply), guarded VII;
    // ring = a VI Tree-spirit (tree_of_knowledge), a temple, a "?" waterfall
    // (magic_spring), a Prospector "+1 valuables" (resource_symbol), a VI gazebo
    // "-> Spell" (shrine), the &C1 crag anchor (blocked).
    fields: [
      { location: "war_machine_factory", difficulty: 7 },
      { location: "tree_of_knowledge", difficulty: 6 },
      { location: "temple" },
      { location: "magic_spring" },
      { location: "resource_symbol" },
      { location: "shrine_of_magic_incantation", difficulty: 6 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory center tile &C1 — fields transcribed from the physical tile scan (not on the wiki; field types assigned from the printed art). tileImage is the real scan, flower-masked to alpha.",
      url: "https://heroes.thelazy.net/index.php/Factory"
    },
    assets: {
      tileImage: "/assets/board/tiles/cf1.webp"
    }
  },
  "#N1": {
    id: "#N1",
    group: "near",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "stables" },
      { location: "magic_spring" },
      { location: "blocked_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "temple" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "tree_of_knowledge" },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx1.webp"
    }
  },
  "#N2": {
    id: "#N2",
    group: "near",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "obelisk" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "trading_post" },
      { location: "witch_hut" },
      { location: "treasure_symbol", difficulty: 4 },
      { location: "blocked_field" },
      { location: "fountain_of_youth" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx2.webp"
    }
  },
  "#N3": {
    id: "#N3",
    group: "near",
    content: "tower_expansion",
    terrain: "grass",
    fields: [
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "trading_post" },
      { location: "fountain_of_youth" },
      { location: "pandoras_box", difficulty: 4 },
      { location: "sanctuary" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx3.webp"
    }
  },
  "#C1": {
    id: "#C1",
    group: "center",
    content: "tower_expansion",
    terrain: "snow",
    fields: [
      { location: "settlement", difficulty: 7, faction: "tower" },
      { location: "mine", difficulty: 6, resource: "buildingMaterials", amount: 2 },
      { location: "sanctuary" },
      { location: "blocked_field" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "warriors_tomb", difficulty: 6 },
      { location: "shrine_of_magic_gesture" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Tower Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/cx1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/cx1.webp"
    }
  },
  U1: {
    id: "U1",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "empty_field" },
      { location: "mine", difficulty: 5, resource: "buildingMaterials", amount: 2 },
      { location: "trading_post" },
      { location: "treasure_symbol", difficulty: 4 },
      { location: "spell_scroll" },
      { location: "learning_stone" },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u1.webp"
    }
  },
  U2: {
    id: "U2",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "mine", difficulty: 5, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "magic_spring" },
      { location: "witch_hut" },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "artifact_symbol", difficulty: 4 },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u2.webp"
    }
  },
  U3: {
    id: "U3",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "spell_scroll" },
      { location: "sanctuary" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "learning_stone", difficulty: 4 },
      { location: "shrine_of_magic_incantation" },
      { location: "blocked_field" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u3.webp"
    }
  },
  U4: {
    id: "U4",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "treasure_symbol", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "blocked_field" },
      { location: "spell_scroll" },
      { location: "empty_field" },
      { location: "tree_of_knowledge" },
      { location: "witch_hut" },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u4.webp"
    }
  },
  U5: {
    id: "U5",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "magic_spring", difficulty: 4 },
      { location: "trading_post" },
      { location: "spell_scroll" },
      { location: "empty_field" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "tree_of_knowledge" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u5.webp"
    }
  },
  U6: {
    id: "U6",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "resource_symbol" },
      { location: "sanctuary" },
      { location: "empty_field" },
      { location: "blocked_field" },
      { location: "artifact_symbol", difficulty: 4 },
      { location: "shrine_of_magic_incantation" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u6.webp"
    }
  },
  U7: {
    id: "U7",
    group: "subterranean",
    content: "stronghold_expansion",
    terrain: "subterranean",
    fields: [
      { location: "cyclops_stockpile", difficulty: 7 },
      { location: "warriors_tomb" },
      { location: "spell_scroll" },
      { location: "sanctuary" },
      { location: "temple" },
      { location: "pandoras_box", difficulty: 6 },
      { location: "magic_spring", difficulty: 6 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Stronghold Expansion)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/u7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/u7.webp"
    }
  },
  "#C2": {
    id: "#C2",
    group: "subterranean",
    content: "regular_stretch_goals",
    terrain: "subterranean",
    fields: [
      { location: "cyclops_stockpile", difficulty: 7 },
      { location: "shrine_of_magic_gesture" },
      { location: "blocked_field" },
      { location: "mystical_garden" },
      { location: "pandoras_box", difficulty: 6 },
      { location: "mine", difficulty: 6, resource: "gold", amount: 5 },
      { location: "sanctuary" },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/cx2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/cx2.webp"
    }
  },
  "#C3": {
    id: "#C3",
    group: "subterranean",
    content: "regular_stretch_goals",
    terrain: "subterranean",
    fields: [
      { location: "random_town", difficulty: 7 },
      { location: "mine", difficulty: 6, resource: "valuables", amount: 1 },
      { location: "pandoras_box", difficulty: 6 },
      { location: "magic_spring" },
      { location: "blocked_field" },
      { location: "temple" },
      { location: "shrine_of_magic_gesture" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/cx3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/cx3.webp"
    }
  },
  "#N4": {
    id: "#N4",
    group: "subterranean",
    content: "regular_stretch_goals",
    terrain: "subterranean",
    fields: [
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 4 },
      { location: "temple" },
      { location: "mine", difficulty: 5, resource: "buildingMaterials", amount: 2 },
      { location: "tree_of_knowledge" },
      { location: "blocked_field" },
      { location: "water_wheel", resource: "gold", amount: 3 },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx4.webp"
    }
  },
  "#N5": {
    id: "#N5",
    group: "subterranean",
    content: "regular_stretch_goals",
    terrain: "subterranean",
    fields: [
      { location: "redwood_observatory" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "buildingMaterials", amount: 2 },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "artifact_symbol", difficulty: 4 },
      { location: "learning_stone" },
      { location: "empty_field" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx5.webp"
    }
  },
  "#N6": {
    id: "#N6",
    group: "subterranean",
    content: "regular_stretch_goals",
    terrain: "subterranean",
    fields: [
      { location: "tree_of_knowledge" },
      { location: "redwood_observatory" },
      { location: "empty_field" },
      { location: "sanctuary" },
      { location: "treasure_symbol", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx6.webp"
    }
  },
  "#N7": {
    id: "#N7",
    group: "subterranean",
    content: "regular_stretch_goals",
    terrain: "subterranean",
    fields: [
      { location: "treasure_symbol" },
      { location: "redwood_observatory" },
      { location: "learning_stone", difficulty: 4 },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "empty_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; tile art cropped from the community subterranean map scans and rescaled to the 1024x985 tile frame; outer borders derived from blocked fields. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx7.webp"
    }
  },
  W1: {
    id: "W1",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W1 art): the learning stone (E), the blocked field (SW)
    // and the mine (NW) sit on green/palm islands; the rest is open sea.
    fields: [
      { location: "shrine_of_magic_incantation" },
      { location: "sea_barrel" },
      { location: "learning_stone", difficulty: 4, terrain: "land" },
      { location: "shipwreck_survivor" },
      { location: "blocked_field", terrain: "land" },
      { location: "empty_field" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5, terrain: "land" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w1.webp"
    }
  },
  W2: {
    id: "W2",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W2 art): the mystical garden (NE) and the mine (E) are
    // green islands; the empty centre, buoy, sea chest, shrine and survivor are
    // all open sea.
    fields: [
      { location: "empty_field" },
      { location: "mystical_garden", terrain: "land" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1, terrain: "land" },
      { location: "buoy" },
      { location: "sea_chest", difficulty: 4 },
      { location: "shrine_of_magic_incantation" },
      { location: "shipwreck_survivor" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w2.webp"
    }
  },
  W3: {
    id: "W3",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W3 art): the tree of knowledge (centre) and the mine (SE)
    // form one green island; the shipwreck, empty rocks, flotsam, shrine and
    // jetsam are open sea.
    fields: [
      { location: "tree_of_knowledge", terrain: "land" },
      { location: "shipwreck", difficulty: 4 },
      { location: "empty_field" },
      { location: "mine", difficulty: 5, resource: "buildingMaterials", amount: 2, terrain: "land" },
      { location: "flotsam" },
      { location: "shrine_of_magic_incantation" },
      { location: "jetsam" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w3.webp"
    }
  },
  W4: {
    id: "W4",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W4 art): the blocked field (NE) and the learning stone
    // (SW) are green/palm islands; the sea chest, mermaid, sea barrel, the
    // floating Pandora's Box and the empty rocks are all open sea.
    fields: [
      { location: "sea_chest" },
      { location: "blocked_field", terrain: "land" },
      { location: "mermaid" },
      { location: "sea_barrel" },
      { location: "learning_stone", difficulty: 4, terrain: "land" },
      { location: "pandoras_box", difficulty: 5 },
      { location: "empty_field" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w4.webp"
    }
  },
  W5: {
    id: "W5",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W5 art): only the witch hut (centre) is a green island;
    // every ring hex — empty rocks, buoy, jetsam, shrine, derelict ship and
    // barrel — is open sea.
    fields: [
      { location: "witch_hut", terrain: "land" },
      { location: "empty_field" },
      { location: "buoy" },
      { location: "jetsam", difficulty: 5 },
      { location: "shrine_of_magic_gesture" },
      { location: "derelict_ship", difficulty: 4 },
      { location: "sea_barrel" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w5.webp"
    }
  },
  W6: {
    id: "W6",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W6 art): only the warriors' tomb (W) is a green/palm
    // island; the mermaid, jetsam, floating Pandora's Box, derelict ship, empty
    // rocks and shrine are all open sea.
    // Guards (W6 art): ONLY two hexes carry a Difficulty numeral — Pandora's Box
    // (E) = Ⅴ and the Derelict Ship (SE) = Ⅳ. The jetsam (NE) shows a bare "?"
    // reward chest with NO numeral, exactly like the unguarded jetsam on W3/#C4
    // and the unguarded sea_chest on W4/#N10 — it is a peaceful open-sea pickup,
    // NOT a fight. It previously carried a bogus `difficulty: 5`, which forced a
    // level-Ⅴ battle on an open-sea hex and then stranded the winner via the
    // sea-combat movement halt. Regression-guarded in sea-tile-guards.test.ts.
    fields: [
      { location: "mermaid" },
      { location: "jetsam" },
      { location: "pandoras_box", difficulty: 5 },
      { location: "derelict_ship", difficulty: 4 },
      { location: "empty_field" },
      { location: "warriors_tomb", terrain: "land" },
      { location: "shrine_of_magic_gesture" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w6.webp"
    }
  },
  W7: {
    id: "W7",
    group: "sea",
    content: "cove_expansion",
    terrain: "water",
    // Per-hex terrain (W7 art): a deep-sea tile — every hex is open ocean,
    // including the blocked field (SW), which is a bare rocky outcrop rising
    // from the water, NOT a green island. No `terrain: "land"` here.
    fields: [
      { location: "temple_of_the_sea", difficulty: 7 },
      { location: "shrine_of_magic_gesture" },
      { location: "pandoras_box", difficulty: 6 },
      { location: "mermaid" },
      { location: "blocked_field" },
      { location: "flotsam" },
      { location: "sea_chest", difficulty: 6 },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Cove Expansion)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/w7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/w7.webp"
    }
  },
  "#C4": {
    id: "#C4",
    group: "sea",
    content: "regular_stretch_goals",
    terrain: "water",
    // Per-hex terrain (#C4 art): only the random town (centre) is a castle
    // island; the floating Pandora's Box, buoy, jetsam, mermaid, derelict ship
    // and barrel are all open sea.
    fields: [
      { location: "random_town", difficulty: 7, terrain: "land" },
      { location: "pandoras_box", difficulty: 6 },
      { location: "buoy" },
      { location: "jetsam" },
      { location: "mermaid" },
      { location: "derelict_ship", difficulty: 6 },
      { location: "sea_barrel" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/cx4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/cx4.webp"
    }
  },
  "#C5": {
    id: "#C5",
    group: "sea",
    content: "regular_stretch_goals",
    terrain: "water",
    // Per-hex terrain (#C5 art): the warriors' tomb (NE) and the tree of
    // knowledge (SW) are green/palm islands; the sea-god temple, the floating
    // Pandora's Box, the derelict ship, the barrel and the survivor are sea.
    fields: [
      { location: "temple_of_the_sea", difficulty: 7 },
      { location: "warriors_tomb", difficulty: 6, terrain: "land" },
      { location: "pandoras_box", difficulty: 6 },
      { location: "derelict_ship", difficulty: 6 },
      { location: "tree_of_knowledge", terrain: "land" },
      { location: "sea_barrel" },
      { location: "shipwreck_survivor" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/cx5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/cx5.webp"
    }
  },
  "#N8": {
    id: "#N8",
    group: "sea",
    content: "regular_stretch_goals",
    terrain: "water",
    // Per-hex terrain (#N8 art): the mine (NE), the shrine of magic (SW, a
    // domed rotunda on green land here — unlike the Cove shrines that stand in
    // open water) and the learning stone (W) are islands; the barrel, flotsam,
    // survivor and empty rocks are sea.
    fields: [
      { location: "sea_barrel" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5, terrain: "land" },
      { location: "flotsam" },
      { location: "shipwreck_survivor", difficulty: 4 },
      { location: "shrine_of_magic_incantation", terrain: "land" },
      { location: "learning_stone", terrain: "land" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx8/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx8.webp"
    }
  },
  "#N9": {
    id: "#N9",
    group: "sea",
    content: "regular_stretch_goals",
    terrain: "water",
    // Per-hex terrain (#N9 art): the mystical garden (E) and the mine (W) are
    // green/palm islands; the empty rocks, barrel, buoy, sea chest and survivor
    // are open sea.
    fields: [
      { location: "empty_field" },
      { location: "sea_barrel" },
      { location: "mystical_garden", terrain: "land" },
      { location: "buoy" },
      { location: "sea_chest", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1, terrain: "land" },
      { location: "shipwreck_survivor" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx9/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx9.webp"
    }
  },
  "#N10": {
    id: "#N10",
    group: "sea",
    content: "regular_stretch_goals",
    terrain: "water",
    // Per-hex terrain (#N10 art): the tree of knowledge (centre) and the mine
    // (NW) form one green island; the shipwreck, empty rocks, sea chest, buoy
    // and mermaid are open sea.
    fields: [
      { location: "tree_of_knowledge", terrain: "land" },
      { location: "shipwreck", difficulty: 4 },
      { location: "empty_field" },
      { location: "sea_chest" },
      { location: "buoy" },
      { location: "mermaid" },
      { location: "mine", difficulty: 5, resource: "buildingMaterials", amount: 2, terrain: "land" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx10/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx10.webp"
    }
  },
  "#N11": {
    id: "#N11",
    group: "sea",
    content: "regular_stretch_goals",
    terrain: "water",
    // Per-hex terrain (#N11 art): the learning stone (SE) is a green island and
    // the resource symbol (NW) is a campfire on a grassy shore; the sea chest,
    // empty rocks, barrel, the floating Pandora's Box and flotsam are sea.
    fields: [
      { location: "sea_chest", difficulty: 4 },
      { location: "empty_field" },
      { location: "sea_barrel" },
      { location: "learning_stone", terrain: "land" },
      { location: "pandoras_box", difficulty: 5 },
      { location: "flotsam" },
      { location: "resource_symbol", terrain: "land" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Regular Stretch Goals)",
      credit: "Fields from the fan wiki; outer borders measured from the tile art. Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/nx11/"
    },
    assets: {
      tileImage: "/assets/board/tiles/nx11.webp"
    }
  },
};
