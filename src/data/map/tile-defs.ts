import type { TileDefinition } from "./types";

/**
 * Core-box map tiles. Field contents transcribed from the fan wiki tile pages
 * (https://en.homm3bg.wiki/tiles/) and cross-checked against the community
 * scenario editor tile geometry (https://github.com/Zedero/HoMM3BoardgameScenarioEditor).
 * Slot order: 0 = center, 1-6 = ring NE, E, SE, SW, W, NW (unrotated).
 * `outerImpassable` marks ring directions whose outer tile edge cannot be
 * crossed (solid yellow border on the physical tile, or a blocked field).
 * Mine incomes follow the wiki mine table: +5 gold, +2 materials, +1 valuables.
 *
 * Yellow-border verification (tile scans, color analysis + visual check of
 * all 41 tiles): the printed lines appear exactly as (1) complete rings
 * around every blocked field and (2) full three-edge outer arcs on the
 * directions listed in `outerImpassable` — starting tiles seal three
 * passable ring fields plus the blocked field, every other tile only seals
 * its blocked field. No internal border between two passable fields exists
 * on any core/Rampart/Inferno tile, so no tile declares `internalBorders`
 * (the engine supports them for future expansion tiles).
 */
export const coreTileDefinitions: Record<string, TileDefinition> = {
  S1: {
    id: "S1",
    group: "starting",
    content: "core_game",
    terrain: "dirt",
    fields: [
      { location: "town", faction: "necropolis" },
      { location: "empty_field" },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, true, true, true, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s1.webp"
    }
  },
  S2: {
    id: "S2",
    group: "starting",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "town", faction: "dungeon" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "resource_symbol" },
      { location: "empty_field" },
    ],
    outerImpassable: [true, false, true, true, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s2.webp"
    }
  },
  S3: {
    id: "S3",
    group: "starting",
    content: "core_game",
    terrain: "grass",
    fields: [
      { location: "town", faction: "castle" },
      { location: "empty_field" },
      { location: "resource_symbol" },
      { location: "empty_field" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, true, true, true, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s3.webp"
    }
  },
  S4: {
    id: "S4",
    group: "starting",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "town", faction: "rampart" },
      { location: "resource_symbol" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" },
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s4.webp"
    }
  },
  S5: {
    id: "S5",
    group: "starting",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "town", faction: "fortress" },
      { location: "empty_field" },
      { location: "resource_symbol" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "empty_field" },
      { location: "blocked_field" },
      { location: "treasure_symbol", difficulty: 1 },
    ],
    outerImpassable: [true, true, true, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s5.webp"
    }
  },
  S6: {
    id: "S6",
    group: "starting",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "town", faction: "inferno" },
      { location: "mine", difficulty: 1, resource: "buildingMaterials", amount: 2 },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 1 },
      { location: "empty_field" },
      { location: "resource_symbol" },
    ],
    outerImpassable: [false, true, false, true, true, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/s6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/s6.webp"
    }
  },
  F1: {
    id: "F1",
    group: "far",
    content: "core_game",
    terrain: "dirt",
    fields: [
      { location: "empty_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "stables" },
      { location: "trading_post" },
      { location: "blocked_field" },
      { location: "settlement", difficulty: 3, faction: "necropolis" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f1.webp"
    }
  },
  F2: {
    id: "F2",
    group: "far",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "empty_field" },
      { location: "settlement", difficulty: 3, faction: "dungeon" },
      { location: "magic_spring" },
      { location: "artifact_symbol" },
      { location: "blocked_field" },
      { location: "shrine_of_magic_incantation" },
      { location: "trading_post" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f2.webp"
    }
  },
  F3: {
    id: "F3",
    group: "far",
    content: "core_game",
    terrain: "grass",
    fields: [
      { location: "artifact_symbol", difficulty: 2 },
      { location: "learning_stone" },
      { location: "stables" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "settlement", difficulty: 3, faction: "castle" },
      { location: "water_wheel", resource: "gold", amount: 3 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f3.webp"
    }
  },
  F4: {
    id: "F4",
    group: "far",
    content: "core_game",
    terrain: "dirt",
    fields: [
      { location: "blocked_field" },
      { location: "magic_spring", difficulty: 2 },
      { location: "trading_post" },
      { location: "empty_field" },
      { location: "temple" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f4.webp"
    }
  },
  F5: {
    id: "F5",
    group: "far",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "redwood_observatory" },
      { location: "mystical_garden", difficulty: 2 },
      { location: "blocked_field" },
      { location: "learning_stone" },
      { location: "trading_post" },
      { location: "empty_field" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f5.webp"
    }
  },
  F6: {
    id: "F6",
    group: "far",
    content: "core_game",
    terrain: "grass",
    fields: [
      { location: "blocked_field" },
      { location: "trading_post" },
      { location: "shrine_of_magic_incantation" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "empty_field" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "artifact_symbol", difficulty: 2 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f6.webp"
    }
  },
  F7: {
    id: "F7",
    group: "far",
    content: "core_game",
    terrain: "dirt",
    fields: [
      { location: "shrine_of_magic_gesture" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "redwood_observatory" },
      { location: "learning_stone" },
      { location: "treasure_symbol", difficulty: 2 },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f7.webp"
    }
  },
  F8: {
    id: "F8",
    group: "far",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "empty_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "blocked_field" },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "temple" },
      { location: "stables" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f8/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f8.webp"
    }
  },
  F9: {
    id: "F9",
    group: "far",
    content: "core_game",
    terrain: "grass",
    fields: [
      { location: "redwood_observatory" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "fountain_of_youth" },
      { location: "learning_stone" },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "blocked_field" },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f9/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f9.webp"
    }
  },
  F10: {
    id: "F10",
    group: "far",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "trading_post" },
      { location: "magic_spring", difficulty: 2 },
      { location: "learning_stone" },
      { location: "empty_field" },
      { location: "blocked_field" },
      { location: "settlement", difficulty: 3, faction: "rampart" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f10/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f10.webp"
    }
  },
  F11: {
    id: "F11",
    group: "far",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "mystical_garden", difficulty: 2 },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "temple" },
      { location: "blocked_field" },
      { location: "empty_field" },
      { location: "trading_post" },
      { location: "shrine_of_magic_gesture" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f11/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f11.webp"
    }
  },
  F12: {
    id: "F12",
    group: "far",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "war_machine_factory" },
      { location: "blocked_field" },
      { location: "mystical_garden" },
      { location: "empty_field" },
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "artifact_symbol" },
      { location: "witch_hut", difficulty: 2 },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f12/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f12.webp"
    }
  },
  F13: {
    id: "F13",
    group: "far",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "scholar" },
      { location: "blocked_field" },
      { location: "learning_stone" },
      { location: "settlement", difficulty: 3, faction: "fortress" },
      { location: "empty_field" },
      { location: "treasure_symbol", difficulty: 2 },
      { location: "water_wheel", resource: "gold", amount: 3 },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f13/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f13.webp"
    }
  },
  F14: {
    id: "F14",
    group: "far",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "blocked_field" },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "stables" },
      { location: "treasure_symbol" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "empty_field" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f14/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f14.webp"
    }
  },
  F15: {
    id: "F15",
    group: "far",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "witch_hut" },
      { location: "scholar", difficulty: 2 },
      { location: "empty_field" },
      { location: "blocked_field" },
      { location: "redwood_observatory" },
      { location: "trading_post" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f15/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f15.webp"
    }
  },
  F16: {
    id: "F16",
    group: "far",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "empty_field" },
      { location: "settlement", difficulty: 3, faction: "inferno" },
      { location: "artifact_symbol", difficulty: 2 },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "blocked_field" },
      { location: "learning_stone" },
      { location: "shrine_of_magic_incantation" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f16/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f16.webp"
    }
  },
  F17: {
    id: "F17",
    group: "far",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "star_axis" },
      { location: "magic_spring", difficulty: 2 },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "blocked_field" },
      { location: "stables" },
      { location: "mine", difficulty: 3, resource: "gold", amount: 5 },
      { location: "empty_field" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f17/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f17.webp"
    }
  },
  F18: {
    id: "F18",
    group: "far",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "mine", difficulty: 3, resource: "valuables", amount: 1 },
      { location: "blocked_field" },
      { location: "tree_of_knowledge" },
      { location: "trading_post" },
      { location: "empty_field" },
      { location: "witch_hut", difficulty: 2 },
      { location: "windmill", resource: "valuables", amount: 1 },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/f18/"
    },
    assets: {
      tileImage: "/assets/board/tiles/f18.webp"
    }
  },
  N1: {
    id: "N1",
    group: "near",
    content: "core_game",
    terrain: "dirt",
    fields: [
      { location: "witch_hut", difficulty: 4 },
      { location: "windmill", resource: "valuables", amount: 1 },
      { location: "sanctuary" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "trading_post" },
      { location: "tree_of_knowledge" },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n1.webp"
    }
  },
  N2: {
    id: "N2",
    group: "near",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "witch_hut" },
      { location: "blocked_field" },
      { location: "sanctuary" },
      { location: "shrine_of_magic_gesture" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "warriors_tomb", difficulty: 4 },
      { location: "tree_of_knowledge" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n2.webp"
    }
  },
  N3: {
    id: "N3",
    group: "near",
    content: "core_game",
    terrain: "grass",
    fields: [
      { location: "obelisk" },
      { location: "blocked_field" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "tree_of_knowledge" },
      { location: "pandoras_box", difficulty: 4 },
      { location: "trading_post" },
      { location: "witch_hut" },
    ],
    outerImpassable: [true, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n3.webp"
    }
  },
  N4: {
    id: "N4",
    group: "near",
    content: "core_game",
    terrain: "dirt",
    fields: [
      { location: "obelisk" },
      { location: "magic_spring" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "blocked_field" },
      { location: "warriors_tomb" },
      { location: "shrine_of_magic_gesture", difficulty: 4 },
      { location: "water_wheel", resource: "gold", amount: 3 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n4.webp"
    }
  },
  N5: {
    id: "N5",
    group: "near",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "obelisk" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "warriors_tomb" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "blocked_field" },
      { location: "magic_spring", difficulty: 4 },
      { location: "shrine_of_magic_gesture" },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n5.webp"
    }
  },
  N6: {
    id: "N6",
    group: "near",
    content: "core_game",
    terrain: "grass",
    fields: [
      { location: "pandoras_box", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "fountain_of_youth" },
      { location: "blocked_field" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "magic_spring" },
      { location: "trading_post" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n6/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n6.webp"
    }
  },
  N7: {
    id: "N7",
    group: "near",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "obelisk" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "tree_of_knowledge" },
      { location: "blocked_field" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "magic_spring", difficulty: 4 },
      { location: "trading_post" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n7/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n7.webp"
    }
  },
  N8: {
    id: "N8",
    group: "near",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "treasure_symbol", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "temple" },
      { location: "blocked_field" },
      { location: "redwood_observatory" },
      { location: "empty_field" },
      { location: "war_machine_factory" },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n8/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n8.webp"
    }
  },
  N9: {
    id: "N9",
    group: "near",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "obelisk" },
      { location: "tree_of_knowledge" },
      { location: "shrine_of_magic_incantation" },
      { location: "trading_post" },
      { location: "scholar", difficulty: 4 },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n9/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n9.webp"
    }
  },
  N10: {
    id: "N10",
    group: "near",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "shrine_of_magic_gesture" },
      { location: "fountain_of_youth" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "warriors_tomb" },
      { location: "blocked_field" },
      { location: "witch_hut" },
      { location: "magic_spring", difficulty: 4 },
    ],
    outerImpassable: [false, false, false, true, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n10/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n10.webp"
    }
  },
  N11: {
    id: "N11",
    group: "near",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "obelisk" },
      { location: "shrine_of_magic_gesture" },
      { location: "mine", difficulty: 5, resource: "valuables", amount: 1 },
      { location: "star_axis", difficulty: 4 },
      { location: "trading_post" },
      { location: "fountain_of_youth" },
      { location: "blocked_field" },
    ],
    outerImpassable: [false, false, false, false, false, true],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n11/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n11.webp"
    }
  },
  N12: {
    id: "N12",
    group: "near",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "blocked_field" },
      { location: "redwood_observatory" },
      { location: "trading_post" },
      { location: "mine", difficulty: 5, resource: "gold", amount: 5 },
      { location: "treasure_symbol" },
      { location: "water_wheel", resource: "gold", amount: 3 },
      { location: "mystical_garden", difficulty: 4 },
    ],
    outerImpassable: [false, false, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/n12/"
    },
    assets: {
      tileImage: "/assets/board/tiles/n12.webp"
    }
  },
  C1: {
    id: "C1",
    group: "center",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "dragon_utopia", difficulty: 7 },
      { location: "fountain_of_youth" },
      { location: "blocked_field" },
      { location: "shrine_of_magic_gesture", difficulty: 6 },
      { location: "mystical_garden" },
      { location: "warriors_tomb" },
      { location: "pandoras_box", difficulty: 6 },
    ],
    outerImpassable: [false, true, false, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/c1/"
    },
    assets: {
      tileImage: "/assets/board/tiles/c1.webp"
    }
  },
  C2: {
    id: "C2",
    group: "center",
    content: "core_game",
    terrain: "subterranean",
    fields: [
      { location: "grail", difficulty: 7 },
      { location: "shrine_of_magic_gesture" },
      { location: "temple" },
      { location: "blocked_field" },
      { location: "pandoras_box", difficulty: 6 },
      { location: "mystical_garden" },
      { location: "tree_of_knowledge", difficulty: 6 },
    ],
    outerImpassable: [false, false, true, false, false, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/c2/"
    },
    assets: {
      tileImage: "/assets/board/tiles/c2.webp"
    }
  },
  C3: {
    id: "C3",
    group: "center",
    content: "rampart_expansion",
    terrain: "grass",
    fields: [
      { location: "dragon_utopia", difficulty: 7 },
      { location: "warriors_tomb" },
      { location: "trading_post" },
      { location: "magic_spring", difficulty: 6 },
      { location: "pandoras_box", difficulty: 6 },
      { location: "blocked_field" },
      { location: "war_machine_factory" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/c3/"
    },
    assets: {
      tileImage: "/assets/board/tiles/c3.webp"
    }
  },
  C4: {
    id: "C4",
    group: "center",
    content: "fortress_expansion",
    terrain: "swamp",
    fields: [
      { location: "grail", difficulty: 7 },
      { location: "scholar", difficulty: 6 },
      { location: "trading_post" },
      { location: "temple", difficulty: 6 },
      { location: "mystical_garden" },
      { location: "blocked_field" },
      { location: "sanctuary" },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/c4/"
    },
    assets: {
      tileImage: "/assets/board/tiles/c4.webp"
    }
  },
  C5: {
    id: "C5",
    group: "center",
    content: "inferno_expansion",
    terrain: "dirt",
    fields: [
      { location: "random_town", difficulty: 7 },
      { location: "warriors_tomb" },
      { location: "temple" },
      { location: "sanctuary" },
      { location: "star_axis", difficulty: 6 },
      { location: "blocked_field" },
      { location: "tree_of_knowledge", difficulty: 6 },
    ],
    outerImpassable: [false, false, false, false, true, false],
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Inferno Expansion)",
      credit: "Field list from the fan wiki; tile geometry from the fan scenario editor; art from the community HD tile remake (rescaled). Verify against physical tiles before final release.",
      url: "https://en.homm3bg.wiki/tiles/c5/"
    },
    assets: {
      tileImage: "/assets/board/tiles/c5.webp"
    }
  },
};
