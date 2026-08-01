import { hexNeighbor, tileFootprint } from "@/engine/hex";
import type { CustomMapObject, CustomMapPreset, CustomMapTilePlan, CustomMapTileToken } from "@/engine/state";

export type ErathiaScenarioMap = {
  name: string;
  tiles: CustomMapTilePlan[];
  preset: CustomMapPreset;
};

type CampaignTileGroup = "starting" | "far" | "near" | "center" | "sea" | "subterranean";
type LatticeSlot = readonly [a: number, b: number, group: CampaignTileGroup];

/**
 * Campaign maps live on the engine's gapless seven-hex flower lattice. These
 * coordinates are authored here, not borrowed from any stock scenario sheet:
 * (1,0), (0,1) and (1,1) are the three touching-neighbour axes.
 */
function campaignGeometry(slots: readonly LatticeSlot[]): CustomMapTilePlan[] {
  return slots.map(([a, b, group]) => {
    // Start at offset (30,30) = axial (15,30), walk the two index-7
    // sublattice axes, then convert axial back to the engine's odd-r offset.
    const q = 15 + 2 * a + b;
    const row = 30 + a - 3 * b;
    const col = q + (row - (row & 1)) / 2;
    return {
      row,
      col,
      group,
      faceDown: group !== "starting",
      ...(group === "starting" ? { lockRotation: true } : {}),
      ...(group === "sea" ? { seaBand: "iv-v" as const } : {}),
      ...(group === "subterranean" ? { subBand: "iv-v" as const } : {})
    };
  });
}

function addToken(
  tiles: CustomMapTilePlan[],
  group: CampaignTileGroup,
  occurrence: number,
  token: CustomMapTileToken
): CustomMapTilePlan[] {
  const target = tiles.filter((tile) => tile.group === group)[occurrence];
  return replaceTile(tiles, group, occurrence, { tokens: [...(target?.tokens ?? []), token] });
}

/** A connected off-tile hex two steps beyond one tile edge. The first step is
 * the tile's occupied rim; the second is an adjacent standalone object hex. */
function outsideCoord(
  tiles: CustomMapTilePlan[],
  group: CampaignTileGroup,
  occurrence: number,
  direction: number
): { row: number; col: number } {
  const tile = tiles.filter((candidate) => candidate.group === group)[occurrence];
  if (!tile) throw new Error(`Missing ${group} campaign tile ${occurrence}.`);
  const occupied = new Set(
    tiles.flatMap((plan) => tileFootprint({ row: plan.row, col: plan.col }, 0))
      .map((hex) => `${hex.row}:${hex.col}`)
  );
  for (let turn = 0; turn < 6; turn += 1) {
    const candidateDirection = (direction + turn) % 6;
    const candidate = hexNeighbor(
      hexNeighbor({ row: tile.row, col: tile.col }, candidateDirection),
      candidateDirection
    );
    if (!occupied.has(`${candidate.row}:${candidate.col}`)) return candidate;
  }
  throw new Error(`No connected standalone hex outside ${group} campaign tile ${occurrence}.`);
}

function pairedOutposts(
  tiles: CustomMapTilePlan[],
  tent: [CampaignTileGroup, number, number],
  barrier: [CampaignTileGroup, number, number],
  pair: 1 | 2 | 3 | 4,
  guardLevel: number
): CustomMapObject[] {
  const tentHex = outsideCoord(tiles, tent[0], tent[1], tent[2]);
  const barrierHex = outsideCoord(tiles, barrier[0], barrier[1], barrier[2]);
  return [
    { kind: "keymaster_tent", pair, placement: { type: "standalone", ...tentHex }, guard: { level: guardLevel } },
    { kind: "barrier", pair, placement: { type: "standalone", ...barrierHex } }
  ];
}

function replaceTile(
  tiles: CustomMapTilePlan[],
  group: CampaignTileGroup,
  occurrence: number,
  patch: Partial<CustomMapTilePlan>
): CustomMapTilePlan[] {
  let seen = 0;
  return tiles.map((tile) => {
    if (tile.group !== group) return tile;
    const current = seen++;
    return current === occurrence ? { ...tile, ...patch } : tile;
  });
}

// 1. A narrow coastal landing that bends inland, then descends through a
// separate cavern chain. This is deliberately asymmetric: the occupier starts
// beyond Terraneus while Catherine builds a real beachhead.
let homecomingTiles = campaignGeometry([
  [-3, -1, "starting"], [3, 2, "starting"],
  [-2, -1, "far"], [-2, 0, "far"], [2, 1, "far"], [2, 2, "far"],
  [-1, -1, "near"], [-1, 0, "near"], [0, -1, "near"], [0, 0, "near"],
  [0, 1, "near"], [1, 0, "near"], [1, 1, "near"], [2, 0, "near"],
  [1, 2, "center"],
  [-3, -2, "sea"], [-2, -2, "sea"],
  [-1, 1, "subterranean"], [0, 2, "subterranean"], [2, 3, "subterranean"]
]);
homecomingTiles = replaceTile(homecomingTiles, "center", 0, {
  underground: true,
  viiField: "town",
  centerHex: {
    guard: { level: 6, levelArmy: "packs", packFaction: "dungeon" },
    reward: { gold: 8, buildingMaterials: 2 },
    vp: 3,
    winCondition: true
  }
});
homecomingTiles = addToken(homecomingTiles, "starting", 0, { kind: "monolith", pair: 1, slot: 2 });
homecomingTiles = addToken(homecomingTiles, "subterranean", 2, { kind: "monolith", pair: 1, slot: 5, guard: { level: 4 } });
homecomingTiles = addToken(homecomingTiles, "sea", 0, { kind: "whirlpool", pair: 2, slot: 2 });
homecomingTiles = addToken(homecomingTiles, "sea", 1, { kind: "whirlpool", pair: 2, slot: 5, reward: { gold: 4 }, vp: 1 });

// 2. Fair Feather sits in the eye of a broad valley. The two surface armies
// enter from opposite wings while three detached caverns create invasion gates.
let guardianTiles = campaignGeometry([
  [-3, 1, "starting"], [3, 1, "starting"],
  [-2, 0, "far"], [-2, 1, "far"], [2, 1, "far"], [2, 2, "far"],
  [-1, 0, "near"], [-1, 1, "near"], [-1, 2, "near"], [0, 0, "near"],
  [0, 2, "near"], [1, 0, "near"], [1, 1, "near"], [1, 2, "near"],
  [0, 1, "center"],
  [-2, 3, "subterranean"], [0, 3, "subterranean"], [2, 3, "subterranean"]
]);
guardianTiles = replaceTile(guardianTiles, "center", 0, {
  viiField: "town",
  centerHex: {
    guard: { level: 5, levelArmy: "packs", packFaction: "inferno" },
    reward: { searchArtifact: 3, morale: 1 },
    vp: 3,
    winCondition: true
  }
});
guardianTiles = addToken(guardianTiles, "near", 1, { kind: "gate", pair: 1, slot: 3 });
guardianTiles = addToken(guardianTiles, "subterranean", 1, { kind: "gate", pair: 1, slot: 6, guard: { level: 5 } });

// 3. Three climbing arms meet around the seven highland resource sites. The
// occupied towers are real flaggable landmarks, not a reused symmetric sheet.
let griffinTiles = campaignGeometry([
  [-3, -2, "starting"], [-1, 3, "starting"], [3, 0, "starting"],
  [-2, -2, "far"], [-2, -1, "far"], [-1, 2, "far"], [0, 3, "far"],
  [2, 0, "far"], [2, 1, "far"],
  [-1, -1, "near"], [-1, 0, "near"], [0, 0, "near"], [0, 1, "near"],
  [0, 2, "near"], [1, 0, "near"], [1, 1, "near"], [1, 2, "near"],
  [2, 2, "near"], [1, 3, "near"],
  [1, -1, "center"]
]);
griffinTiles = griffinTiles.map((tile) => tile.group === "far"
  ? {
      ...tile,
      secretFeature: "any_mine",
      objectPlans: {
        mine: {
          guard: { level: 4, levelArmy: "packs", packFaction: "inferno" },
          reward: { morale: 1 },
          vp: 1
        }
      }
    }
  : tile);
griffinTiles = replaceTile(griffinTiles, "near", 0, {
  secretFeature: "settlement",
  settlement: {
    guard: { level: 5, levelArmy: "packs", packFaction: "dungeon" },
    reward: { gold: 5, movement: 1 },
    vp: 1
  }
});
griffinTiles = replaceTile(griffinTiles, "center", 0, {
  viiField: "settlement",
  centerHex: {
    guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" },
    reward: { searchArtifact: 4, morale: 1 },
    vp: 2,
    winCondition: true
  }
});
griffinTiles = addToken(griffinTiles, "near", 2, { kind: "oneway_entrance", pair: 2, slot: 3, exitMode: "certain", guard: { level: 4 } });
griffinTiles = addToken(griffinTiles, "center", 0, { kind: "oneway_exit", pair: 2, slot: 6, alwaysPickable: true });

// 4. A forked river march: Catherine and the Nighon vanguard race along two
// banks toward the bridge town, with a southern Kreegan relief column.
let steadwickRoadTiles = campaignGeometry([
  [-4, 0, "starting"], [3, -1, "starting"], [2, 3, "starting"],
  [-3, 0, "far"], [-3, 1, "far"], [2, -1, "far"], [1, 3, "far"],
  [-2, 0, "near"], [-2, 1, "near"], [-1, 0, "near"], [-1, 1, "near"],
  [0, 0, "near"], [0, 1, "near"], [1, 0, "near"], [1, 1, "near"],
  [1, 2, "near"], [2, 1, "near"], [2, 2, "near"],
  [-4, -1, "sea"], [-3, -1, "sea"], [1, 4, "sea"],
  [0, 2, "center"], [0, 3, "center"]
]);
steadwickRoadTiles = replaceTile(steadwickRoadTiles, "center", 0, {
  viiField: "town",
  centerHex: {
    guard: { level: 6, levelArmy: "packs", packFaction: "dungeon" },
    reward: { gold: 10, movement: 1 },
    vp: 3
  }
});
steadwickRoadTiles = addToken(steadwickRoadTiles, "sea", 0, { kind: "whirlpool", pair: 3, slot: 2 });
steadwickRoadTiles = addToken(steadwickRoadTiles, "sea", 2, { kind: "whirlpool", pair: 3, slot: 5, guard: { level: 6 }, vp: 2 });
steadwickRoadTiles = addToken(steadwickRoadTiles, "near", 2, { kind: "monolith", pair: 4, slot: 3 });
steadwickRoadTiles = addToken(steadwickRoadTiles, "center", 1, { kind: "monolith", pair: 4, slot: 6 });
steadwickRoadTiles = replaceTile(steadwickRoadTiles, "center", 1, {
  viiField: "settlement",
  centerHex: {
    guard: { level: 6, levelArmy: "packs", packFaction: "inferno" },
    reward: { buildingMaterials: 3, morale: 1 },
    vp: 2
  }
});

// 5. A siege ring around Steadwick. Three attackers occupy the outer arc; the
// inner ring offers several breaches and a single heavily guarded capital.
let liberationTiles = campaignGeometry([
  [-3, -2, "starting"], [0, 4, "starting"], [4, 1, "starting"],
  [-2, -2, "far"], [-2, -1, "far"], [-1, 3, "far"], [0, 3, "far"],
  [3, 0, "far"], [3, 1, "far"],
  [-1, -1, "near"], [-1, 0, "near"], [-1, 1, "near"], [-1, 2, "near"],
  [0, -1, "near"], [0, 1, "near"], [0, 2, "near"], [1, 0, "near"],
  [1, 1, "near"], [1, 2, "near"], [2, 0, "near"], [2, 1, "near"],
  [-3, -3, "sea"], [-2, -3, "sea"],
  [0, 0, "center"]
]);
liberationTiles = replaceTile(liberationTiles, "center", 0, {
  viiField: "town",
  centerHex: {
    guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" },
    reward: { gold: 15, searchArtifact: 4, morale: 1 },
    vp: 5,
    winCondition: true
  }
});
liberationTiles = addToken(liberationTiles, "near", 0, { kind: "gate", pair: 2, slot: 5 });
liberationTiles = addToken(liberationTiles, "near", 9, { kind: "gate", pair: 2, slot: 2, guard: { level: 6 }, vp: 2 });
liberationTiles = addToken(liberationTiles, "sea", 0, { kind: "whirlpool", pair: 1, slot: 3 });
liberationTiles = addToken(liberationTiles, "sea", 1, { kind: "whirlpool", pair: 1, slot: 6 });

// 6. A final spearhead over scorched ground. Two hostile wings feed the black
// fortress while the royal army advances through a sequence of escalating gates.
let throneOfAshTiles = campaignGeometry([
  [-4, 0, "starting"], [2, -2, "starting"], [3, 3, "starting"],
  [-3, 0, "far"], [-2, -1, "far"], [1, -2, "far"], [2, 2, "far"], [3, 2, "far"],
  [-2, 0, "near"], [-1, -1, "near"], [-1, 0, "near"], [0, -1, "near"],
  [0, 0, "near"], [0, 1, "near"], [1, -1, "near"], [1, 0, "near"],
  [1, 1, "near"], [1, 2, "near"], [2, 0, "near"], [2, 1, "near"],
  [2, 3, "near"],
  [3, 0, "center"], [3, 1, "center"]
]);
throneOfAshTiles = replaceTile(throneOfAshTiles, "center", 0, {
  viiField: "dragon_utopia",
  centerHex: {
    guard: { level: 7, levelArmy: "packs", packFaction: "inferno" },
    reward: { searchArtifact: 4, gold: 10 },
    vp: 4
  }
});
throneOfAshTiles = replaceTile(throneOfAshTiles, "center", 1, {
  viiField: "town",
  centerHex: {
    guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" },
    reward: { searchArtifact: 4, gold: 20, morale: 1 },
    vp: 6,
    winCondition: true
  }
});
throneOfAshTiles = addToken(throneOfAshTiles, "near", 1, { kind: "oneway_entrance", pair: 4, slot: 2, exitMode: "mix", guard: { level: 7 } });
throneOfAshTiles = addToken(throneOfAshTiles, "near", 10, { kind: "oneway_exit", pair: 4, slot: 5, alwaysPickable: true });
throneOfAshTiles = addToken(throneOfAshTiles, "center", 0, { kind: "oneway_exit", pair: 4, slot: 3 });

const sharedCastleOpening: Pick<CustomMapPreset, "startingProduction" | "startingBuildings"> = {
  startingProduction: { gold: 10, buildingMaterials: 2, valuables: 1 },
  startingBuildings: ["citadel", "mage_guild", "dwelling_bronze"]
};

export const ERATHIA_SCENARIO_MAPS: Record<string, ErathiaScenarioMap> = {
  homecoming: {
    name: "Homecoming — The Terraneus Descent",
    tiles: homecomingTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "easy", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 15, buildingMaterials: 3, valuables: 1 },
      computerStartingBonus: { gold: 3, buildingMaterials: 1, valuables: 0 },
      startingUnits: [{ level: 1, side: "pack" }, { level: 2, side: "few" }],
      objects: pairedOutposts(homecomingTiles, ["starting", 0, 4], ["starting", 1, 1], 1, 3),
      randomTowns: { guard: { level: 6, levelArmy: "packs", packFaction: "dungeon" }, captureReward: { gold: 10, buildingMaterials: 2 }, incomeGold: 10 },
      mines: { guard: { level: 3 }, breakField: true, persistentGuard: true },
      customWinConditions: [{ kind: "control-towns", count: 2 }],
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 4,
        objectives: [
          { kind: "control-towns", count: 2, vp: 2 },
          { kind: "hero-level", level: 4, vp: 1 }
        ]
      },
      timedEvents: [
        { round: 2, effect: { kind: "note", text: "Scouts found Nighon's invasion road beneath the coast." } },
        { round: 3, effect: { kind: "story", sceneId: "story.erathia.homecoming.cavern-road" } },
        { round: 4, effect: { kind: "note", text: "Terraneus is beyond the last cavern gate." } },
        { round: 6, repeatEveryRounds: 4, effect: { kind: "resources", buildingMaterials: 1 } }
      ],
      roundLimit: 16,
      notes: "Establish the sea-lane beachhead, secure the Keymaster route, cross the underground monolith, and defeat Terraneus's marked garrison. Completing either scenario objective triggers VP scoring."
    }
  },
  "guardian-angels": {
    name: "Guardian Angels — The Fair Feather Valley",
    tiles: guardianTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "normal", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 10, buildingMaterials: 2, valuables: 1 },
      computerStartingBonus: { gold: 4, buildingMaterials: 1, valuables: 0 },
      startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "few" }],
      objects: pairedOutposts(guardianTiles, ["starting", 0, 4], ["starting", 1, 1], 2, 4),
      randomTowns: { guard: { level: 5, levelArmy: "packs", packFaction: "inferno" }, incomeGold: 12 },
      mines: { guard: { level: 4 }, breakField: true },
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 4,
        objectives: [
          { kind: "control-towns", count: 2, vp: 2 },
          { kind: "hero-level", level: 5, vp: 1 }
        ]
      },
      timedEvents: [
        { round: 1, effect: { kind: "morale", amount: 1 } },
        { round: 3, effect: { kind: "story", sceneId: "story.erathia.guardian-angels.cavern-gates" } },
        { round: 3, effect: { kind: "note", text: "Three cavern fronts feed the siege. Fair Feather cannot hold forever." } },
        { round: 5, repeatEveryRounds: 4, effect: { kind: "movement", amount: 1 } }
      ],
      roundLimit: 14,
      notes: "Reach Fair Feather through the paired cavern gates and defeat its marked infernal siege army; the first clear ends the mission and triggers VP scoring."
    }
  },
  "griffin-cliff": {
    name: "Griffin Cliff — The Seven Aeries",
    tiles: griffinTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "normal", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 16, buildingMaterials: 4, valuables: 2 },
      computerStartingBonus: { gold: 5, buildingMaterials: 1, valuables: 0 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 2, side: "pack" }, { level: 4, side: "few" }],
      mines: { guard: { level: 4, levelArmy: "packs", packFaction: "random" }, breakField: true, persistentGuard: true },
      settlements: { guard: { level: 5, levelArmy: "packs", packFaction: "random" }, vp: 1 },
      customWinConditions: [{ kind: "flag-mines", count: 7 }],
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 4,
        objectives: [
          { kind: "flag-mines", count: 7, vp: 4 },
          { kind: "hero-level", level: 6, vp: 2 }
        ]
      },
      timedEvents: [
        { round: 1, effect: { kind: "note", text: "Liberate seven mines or settlements to free every Griffin Tower." } },
        { round: 3, effect: { kind: "story", sceneId: "story.erathia.griffin-cliff.sky-tyrant" } },
        { round: 5, repeatEveryRounds: 5, effect: { kind: "resources", buildingMaterials: -1 } },
        { round: 7, effect: { kind: "search", deck: "abilities", count: 3 } }
      ],
      roundLimit: 18,
      notes: "Liberate seven occupied aerie sites or take the guarded one-way monolith to defeat the marked Sky Tyrant. Either route triggers VP scoring."
    }
  },
  "road-to-steadwick": {
    name: "Road to Steadwick — The Twin Banks",
    tiles: steadwickRoadTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "normal", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 18, buildingMaterials: 4, valuables: 2 },
      computerStartingBonus: { gold: 5, buildingMaterials: 2, valuables: 0 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "pack" }, { level: 5, side: "few" }],
      randomTowns: { guard: { level: 6, levelArmy: "packs", packFaction: "random" }, captureReward: { gold: 8 }, incomeGold: 12 },
      customWinConditions: [{ kind: "control-towns", count: 3 }],
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 4,
        objectives: [
          { kind: "control-towns", count: 3, vp: 4 },
          { kind: "hero-level", level: 6, vp: 2 }
        ]
      },
      timedEvents: [
        { round: 2, effect: { kind: "note", text: "The enemy relief columns are moving along both river banks." } },
        { round: 4, effect: { kind: "story", sceneId: "story.erathia.road-to-steadwick.river-race" } },
        { round: 6, repeatEveryRounds: 4, effect: { kind: "movement", amount: 1 } }
      ],
      roundLimit: 18,
      notes: "Race the twin river banks by road, whirlpool, or paired monolith. Control three towns before both computer relief columns converge; VP decides the winner."
    }
  },
  "liberation-day": {
    name: "Liberation Day — The Siege Ring",
    tiles: liberationTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "hard", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 22, buildingMaterials: 5, valuables: 3 },
      computerStartingBonus: { gold: 7, buildingMaterials: 2, valuables: 1 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 2, side: "pack" }, { level: 4, side: "pack" }, { level: 6, side: "few" }],
      objects: pairedOutposts(liberationTiles, ["starting", 0, 4], ["starting", 1, 1], 3, 5),
      randomTowns: { guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" }, captureReward: { gold: 12, buildingMaterials: 2 }, incomeGold: 15 },
      customWinConditions: [{ kind: "control-towns", count: 3 }],
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 5,
        objectives: [
          { kind: "control-towns", count: 3, vp: 5 },
          { kind: "hero-level", level: 7, vp: 2 }
        ]
      },
      timedEvents: [
        { round: 1, effect: { kind: "morale", amount: 1 } },
        { round: 4, effect: { kind: "story", sceneId: "story.erathia.liberation-day.traitor-court" } },
        { round: 4, effect: { kind: "note", text: "Steadwick's inner wall is breached. The capital can now be assaulted." } },
        { round: 8, repeatEveryRounds: 3, effect: { kind: "resources", gold: -2 } }
      ],
      roundLimit: 20,
      notes: "Break the siege by sea or paired wall gates, secure the Keymaster route, and defeat Steadwick's marked garrison. The first clear triggers final VP scoring."
    }
  },
  "throne-of-ash": {
    name: "Throne of Ash — The Black Citadel",
    tiles: throneOfAshTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "hard", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 28, buildingMaterials: 6, valuables: 4 },
      computerStartingBonus: { gold: 9, buildingMaterials: 3, valuables: 1 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver", "dwelling_gold"],
      startingUnits: [{ level: 3, side: "pack" }, { level: 5, side: "pack" }, { level: 7, side: "few" }],
      objects: pairedOutposts(throneOfAshTiles, ["starting", 0, 4], ["starting", 2, 1], 4, 6),
      randomTowns: { guard: { level: 7, levelArmy: "packs", packFaction: "inferno" }, captureReward: { gold: 15, valuables: 2 }, incomeGold: 15 },
      objectives: { utopiaGuards: "four", utopiaBonusSearch: 3 },
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 6,
        objectives: [
          { kind: "defeat-dragon-utopia", vp: 5 },
          { kind: "hero-level", level: 7, vp: 2 }
        ]
      },
      timedEvents: [
        { round: 1, effect: { kind: "note", text: "The final march has begun. Break the Ash Gate before taking the Black Citadel." } },
        { round: 4, effect: { kind: "story", sceneId: "story.erathia.throne-of-ash.last-gate" } },
        { round: 5, repeatEveryRounds: 4, effect: { kind: "morale", amount: -1 } },
        { round: 10, effect: { kind: "search", deck: "artifacts", count: 4 } }
      ],
      roundLimit: 22,
      notes: "Take the guarded one-way ash route, break the Dragon Utopia strongpoint, then defeat the Black Citadel's marked army. Computer warlords begin with an open war chest; VP decides the crown."
    }
  }
};
