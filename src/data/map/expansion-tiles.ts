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
  "A-S1": {
    id: "A-S1",
    group: "starting",
    content: "regular_stretch_goals",
    // EXACT Rampart S4 hex map (art is an S4 retheme). Slot order = NE,E,SE,SW,W,NW:
    //   0 center town (fuyuki)
    //   1 NE  resource_symbol     (campfire + cream tools)
    //   2 E   blocked_field       (rock wall; full yellow ring)
    //   3 SE  empty_field
    //   4 SW  treasure_symbol I   (cart + chest)
    //   5 W   mine materials ↻2 I
    //   6 NW  empty_field
    // outerImpassable [NE,E,SE,SW,W,NW] = open, sealed, open, sealed, sealed, sealed
    // (blocked E + three starting-seat outer arcs) — identical to S4.
    terrain: "highlands",
    fields: [
      { location: "town", faction: "fuyuki" },
      { location: "resource_symbol" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" }
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Anime Realms module",
      credit:
        "Fuyuki City starting tile. Hex roles and yellow outer borders copy Rampart S4; art is the board image."
    },
    assets: { tileImage: "/assets/anime/tiles/a-s1.webp" }
  },
  "W-S1": {
    id: "W-S1",
    group: "starting",
    content: "regular_stretch_goals",
    // EXACT same S4 hex map as A-S1 (art is an S4 retheme to wuxia). See A-S1.
    terrain: "highlands",
    fields: [
      { location: "town", faction: "azure_breeze" },
      { location: "resource_symbol" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" }
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Anime Realms module",
      credit:
        "Azure Breeze Sect starting tile. Hex roles and yellow outer borders copy Rampart S4; art is the board image."
    },
    assets: { tileImage: "/assets/anime/tiles/w-s1.webp" }
  },
  "L-S1": {
    id: "L-S1",
    group: "starting",
    content: "regular_stretch_goals",
    // EXACT same S4 hex map as A-S1 (art is an S4 retheme to the Hidden Leaf
    // Village). See A-S1.
    terrain: "highlands",
    fields: [
      { location: "town", faction: "hidden_leaf" },
      { location: "resource_symbol" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" }
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Anime Realms module",
      credit:
        "Hidden Leaf Village starting tile. Hex roles and yellow outer borders copy Rampart S4; art is the board image."
    },
    assets: { tileImage: "/assets/anime/tiles/l-s1.webp" }
  },
  "P-S1": {
    id: "P-S1",
    group: "starting",
    content: "regular_stretch_goals",
    // EXACT same S4 hex map as A-S1 (art is an S4 retheme to the Azur Lane Naval
    // Base). See A-S1.
    terrain: "highlands",
    fields: [
      { location: "town", faction: "azur_lane" },
      { location: "resource_symbol" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" }
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Anime Realms module",
      credit:
        "Azur Lane Naval Base starting tile. Hex roles and yellow outer borders copy Rampart S4; art is the board image."
    },
    assets: { tileImage: "/assets/anime/tiles/p-s1.webp" }
  },
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
    // Factory starting tile "&S1" — the real "&"-prefixed desert scan (sf1.webp),
    // NOT a Stronghold composite. Like the other Factory "&" tiles it is not on
    // the fan wiki, so the field TYPES are read from the printed art, and the ring
    // rotation follows the scanned icon POSITIONS (slots 1-6 = NE, E, SE, SW, W,
    // NW): centre domed foundry = the Factory town; the "&S1" tar-chasm anchor
    // (NW) = blocked_field; a mine cart "↻2" + stone pile + guard I (W) = a
    // buildingMaterials mine (loop 2); a treasure cabin + guard I (SW) =
    // treasure_symbol; a campfire + crossed-pick tools (NE) = a resource_symbol;
    // the pine-dotted desert (E) and the rocky outcrop (SE) are open ground. The
    // outerImpassable edges are a best-fit from the art (rocky SE, mine pit W,
    // treasure SW and the chasm NW seal their outer edges). Verify against the
    // physical tile before final release.
    fields: [
      { location: "town", faction: "factory" },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, true, true, true, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory starting tile &S1 — fields transcribed from the physical tile scan (sf1.webp; not on the wiki, field types assigned from the printed art, ring rotation from the scanned icon positions, outer borders a best-fit). Verify against physical tiles before final release.",
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
  // Conflux Near tiles N14–N21 are Elemental terrain (wiki): combat on ANY hex
  // of the tile grants +1 Power to Spells of the matching School. See
  // combatElementalSchool / elementalTileSpellPowerBonus in engine/permanents.ts.
  N14: {
    id: "N14",
    group: "near",
    content: "conflux_expansion",
    terrain: "elemental_fire",
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
    terrain: "elemental_fire",
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
    terrain: "elemental_water",
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
    terrain: "elemental_water",
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
    terrain: "elemental_air",
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
    terrain: "elemental_air",
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
    terrain: "elemental_earth",
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
    terrain: "elemental_earth",
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
  // Factory "&" tiles — field types re-verified against the Factory rulebook
  // (p.7–8 location art: Derrick, Prospector, Warlock's Lab, Grave, Watering
  // Hole, Trailblazer, Airship Yard) and each tile's scan (nf/ff/cf/sf). Slot
  // order is centre + NE,E,SE,SW,W,NW matching the art orientation (same as
  // core tiles). Guard difficulties are the printed Roman numerals.
  "&N1": {
    id: "&N1",
    group: "near",
    content: "regular_stretch_goals",
    terrain: "rough",
    // &N1 (nf1.webp) vs Factory rulebook art, slots 1-6 = NE,E,SE,SW,W,NW:
    // centre turquoise Obelisk; NE Derrick +3 gold; E blocked (&N1 tar-pit);
    // SE mine ↻1 valuables V; SW "?" cabin treasure; W shrine IV "pay 3 gold →
    // Spell"; NW Excavation shovel. Guards IV-V.
    fields: [
      { location: "obelisk" },
      { location: "derrick" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "treasure_symbol" },
      { location: "shrine_of_magic_gesture", difficulty: 4 },
      { location: "artifact_dig" },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory near tile &N1 — fields matched to nf1.webp + Factory rulebook location art (Derrick, Excavation). Verify against physical tiles before final release.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
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
    // &N2 (nf2.webp) vs Factory rulebook: centre Tree of Knowledge; NE "?" treehouse
    // treasure; E empty; SE Warlock's Lab IV (golden planetarium — NOT Mystical
    // Garden); SW blocked (&N2 chasm); W mine ↻5 gold V; NW Fountain of Youth
    // (waterfall with bird+horse icons — NOT Magic Spring). Guards IV-V.
    fields: [
      { location: "tree_of_knowledge" },
      { location: "treasure_symbol" },
      { location: "empty_field" },
      { location: "warlock_lab", difficulty: 4 },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "fountain_of_youth" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory near tile &N2 — fields matched to nf2.webp + Factory rulebook (Warlock's Lab art). Fountain of Youth by bird+horse icons. Verify against physical tiles before final release.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
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
    // &F1 (ff1.webp) vs Factory rulebook: centre blocked rocks; NE empty; E Temple
    // III; SE stilt-hut treasure II; SW Derrick +3 gold; W Trailblazer teepee
    // (NOT Stables — rulebook p.8 Trailblazer art); NW Obelisk. Guards II-III.
    fields: [
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "temple", difficulty: 3 },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "derrick" },
      { location: "trailblazer" },
      { location: "obelisk" },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory far tile &F1 — fields matched to ff1.webp + Factory rulebook (Derrick, Trailblazer teepee). Verify against physical tiles before final release.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
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
    // &F2 (ff2.webp) vs Factory rulebook: centre Prospector +1 valuables (NOT
    // resource-die); NE Redwood Observatory — a lookout hut on a tall tree with a
    // "?" marker, byte-identical in style to the F24 observatory (tower-on-tree +
    // "?"); it was wrongly treasure_symbol, so visits rolled the treasure die /
    // experience instead of revealing an adjacent tile. There is NO treasure
    // chest anywhere on this tile (a treasure_symbol draws a CHEST with an "N→1"
    // reward, cf. F24). E cabin Trading Post (same cabin art as core trading
    // posts — also once wrongly treasure_symbol); SE blocked scrub (&F2 anchor);
    // SW Factory Grave II (skeleton — Factory rulebook Grave, not the Cove
    // Grave); W empty; NW mine ↻5 gold III. Guards II-III.
    fields: [
      { location: "prospector" },
      { location: "redwood_observatory" },
      { location: "trading_post" },
      { location: "blocked_field" },
      { location: "factory_grave", difficulty: 2 },
      { location: "empty_field" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory far tile &F2 — fields matched to ff2.webp + Factory rulebook (Prospector, Redwood Observatory lookout-tower, Trading Post cabin, Factory Grave). Verify against physical tiles before final release.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
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
    // &F3 (ff3.webp) vs Factory rulebook: centre Temple; NE Excavation shovel;
    // E empty; SE Watering Hole (well pool — NOT Magic Spring; rulebook p.8 art);
    // SW treasure chest II "2→1"; W mine ↻1 valuables III; NW blocked canyon
    // (&F3 anchor). Guards II-III.
    fields: [
      { location: "temple" },
      { location: "artifact_dig" },
      { location: "empty_field" },
      { location: "watering_hole" },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory far tile &F3 — fields matched to ff3.webp + Factory rulebook (Watering Hole well, Excavation). Verify against physical tiles before final release.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
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
    // &C1 (cf1.webp) vs Factory rulebook p.8: centre Airship Yard VII (airship +
    // steamer — NOT War Machine Factory); NE Temple; E Shrine of Magic Incantation
    // VI; SE blocked crag (&C1 anchor); SW Prospector +1 valuables; W Magic Spring
    // (waterfall face); NW Tree of Knowledge VI. Guards VI-VII.
    fields: [
      { location: "airship_yard", difficulty: 7 },
      { location: "temple" },
      { location: "shrine_of_magic_incantation", difficulty: 6 },
      { location: "blocked_field" },
      { location: "prospector" },
      { location: "magic_spring" },
      { location: "tree_of_knowledge", difficulty: 6 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit:
        "Factory center tile &C1 — fields matched to cf1.webp + Factory rulebook p.8 Airship Yard art (was wrongly War Machine Factory). Verify against physical tiles before final release.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
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
