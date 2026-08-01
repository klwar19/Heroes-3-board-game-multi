import type { CustomMapPreset, CustomMapTilePlan } from "@/engine/state";

export type ErathiaScenarioMap = {
  name: string;
  tiles: CustomMapTilePlan[];
  preset: CustomMapPreset;
};

type CampaignTileGroup = "starting" | "far" | "near" | "center" | "subterranean";
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
      ...(group === "subterranean" ? { subBand: "iv-v" as const } : {})
    };
  });
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
  [-1, 1, "subterranean"], [0, 2, "subterranean"], [2, 3, "subterranean"]
]);
homecomingTiles = replaceTile(homecomingTiles, "center", 0, {
  underground: true,
  viiField: "town",
  centerHex: {
    guard: { level: 6, levelArmy: "packs", packFaction: "dungeon" },
    reward: { gold: 8, buildingMaterials: 2 },
    vp: 3
  }
});

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
    vp: 3
  }
});

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
    vp: 2
  }
});

// 4. A forked river march: Catherine and the Nighon vanguard race along two
// banks toward the bridge town, with a southern Kreegan relief column.
let steadwickRoadTiles = campaignGeometry([
  [-4, 0, "starting"], [3, -1, "starting"], [2, 3, "starting"],
  [-3, 0, "far"], [-3, 1, "far"], [2, -1, "far"], [1, 3, "far"],
  [-2, 0, "near"], [-2, 1, "near"], [-1, 0, "near"], [-1, 1, "near"],
  [0, 0, "near"], [0, 1, "near"], [1, 0, "near"], [1, 1, "near"],
  [1, 2, "near"], [2, 1, "near"], [2, 2, "near"],
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
  [0, 0, "center"]
]);
liberationTiles = replaceTile(liberationTiles, "center", 0, {
  viiField: "town",
  centerHex: {
    guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" },
    reward: { gold: 15, searchArtifact: 4, morale: 1 },
    vp: 5
  }
});

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
      startingUnits: [{ level: 1, side: "pack" }, { level: 2, side: "few" }],
      randomTowns: { guard: { level: 6, levelArmy: "packs", packFaction: "dungeon" }, captureReward: { gold: 10, buildingMaterials: 2 }, incomeGold: 10 },
      mines: { guard: { level: 3 }, breakField: true, persistentGuard: true },
      customWinConditions: [{ kind: "control-towns", count: 2 }],
      timedEvents: [
        { round: 2, effect: { kind: "note", text: "Scouts found Nighon's invasion road beneath the coast." } },
        { round: 4, effect: { kind: "note", text: "Terraneus is beyond the last cavern gate." } },
        { round: 6, repeatEveryRounds: 4, effect: { kind: "resources", buildingMaterials: 1 } }
      ],
      roundLimit: 16,
      notes: "A new asymmetric coast-to-cavern map. Establish the beachhead, open the underground road, and capture Terraneus."
    }
  },
  "guardian-angels": {
    name: "Guardian Angels — The Fair Feather Valley",
    tiles: guardianTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "normal", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 10, buildingMaterials: 2, valuables: 1 },
      startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "few" }],
      randomTowns: { guard: { level: 5, levelArmy: "packs", packFaction: "inferno" }, incomeGold: 12 },
      mines: { guard: { level: 4 }, breakField: true },
      timedEvents: [
        { round: 1, effect: { kind: "morale", amount: 1 } },
        { round: 3, effect: { kind: "note", text: "Three cavern fronts feed the siege. Fair Feather cannot hold forever." } },
        { round: 5, repeatEveryRounds: 4, effect: { kind: "movement", amount: 1 } }
      ],
      roundLimit: 14,
      notes: "A new open-valley map with Fair Feather at its center and three detached underground invasion fronts."
    }
  },
  "griffin-cliff": {
    name: "Griffin Cliff — The Seven Aeries",
    tiles: griffinTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "normal", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 16, buildingMaterials: 4, valuables: 2 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 2, side: "pack" }, { level: 4, side: "few" }],
      mines: { guard: { level: 4, levelArmy: "packs", packFaction: "random" }, breakField: true, persistentGuard: true },
      settlements: { guard: { level: 5, levelArmy: "packs", packFaction: "random" }, vp: 1 },
      customWinConditions: [{ kind: "flag-mines", count: 7 }],
      timedEvents: [
        { round: 1, effect: { kind: "note", text: "Liberate seven mines or settlements to free every Griffin Tower." } },
        { round: 5, repeatEveryRounds: 5, effect: { kind: "resources", buildingMaterials: -1 } },
        { round: 7, effect: { kind: "search", deck: "abilities", count: 3 } }
      ],
      roundLimit: 18,
      notes: "A new three-arm highland map. Seven flaggable sites form the occupied Griffin Tower network."
    }
  },
  "road-to-steadwick": {
    name: "Road to Steadwick — The Twin Banks",
    tiles: steadwickRoadTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "normal", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 18, buildingMaterials: 4, valuables: 2 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "pack" }, { level: 5, side: "few" }],
      randomTowns: { guard: { level: 6, levelArmy: "packs", packFaction: "random" }, captureReward: { gold: 8 }, incomeGold: 12 },
      customWinConditions: [{ kind: "control-towns", count: 3 }],
      timedEvents: [
        { round: 2, effect: { kind: "note", text: "The enemy relief columns are moving along both river banks." } },
        { round: 6, repeatEveryRounds: 4, effect: { kind: "movement", amount: 1 } }
      ],
      roundLimit: 18,
      notes: "A forked river race with two bridge objectives. Control three towns before both enemy columns converge."
    }
  },
  "liberation-day": {
    name: "Liberation Day — The Siege Ring",
    tiles: liberationTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "hard", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 22, buildingMaterials: 5, valuables: 3 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 2, side: "pack" }, { level: 4, side: "pack" }, { level: 6, side: "few" }],
      randomTowns: { guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" }, captureReward: { gold: 12, buildingMaterials: 2 }, incomeGold: 15 },
      customWinConditions: [{ kind: "control-towns", count: 3 }],
      timedEvents: [
        { round: 1, effect: { kind: "morale", amount: 1 } },
        { round: 4, effect: { kind: "note", text: "Steadwick's inner wall is breached. The capital can now be assaulted." } },
        { round: 8, repeatEveryRounds: 3, effect: { kind: "resources", gold: -2 } }
      ],
      roundLimit: 20,
      notes: "A new siege-ring map. Break the inner defenses, capture Steadwick, and hold enough surrounding towns to secure it."
    }
  },
  "throne-of-ash": {
    name: "Throne of Ash — The Black Citadel",
    tiles: throneOfAshTiles,
    preset: {
      ...sharedCastleOpening,
      victoryMode: "conquest", difficulty: "hard", farTileOpening: false, farTilesPerPlayer: 0,
      startingResources: { gold: 28, buildingMaterials: 6, valuables: 4 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver", "dwelling_gold"],
      startingUnits: [{ level: 3, side: "pack" }, { level: 5, side: "pack" }, { level: 7, side: "few" }],
      randomTowns: { guard: { level: 7, levelArmy: "packs", packFaction: "inferno" }, captureReward: { gold: 15, valuables: 2 }, incomeGold: 15 },
      objectives: { utopiaGuards: "four", utopiaBonusSearch: 3 },
      timedEvents: [
        { round: 1, effect: { kind: "note", text: "The final march has begun. Break the Ash Gate before taking the Black Citadel." } },
        { round: 5, repeatEveryRounds: 4, effect: { kind: "morale", amount: -1 } },
        { round: 10, effect: { kind: "search", deck: "artifacts", count: 4 } }
      ],
      roundLimit: 22,
      notes: "A new escalating spearhead map. Break through the Utopia strongpoint, then capture the Black Citadel's marked objective to win."
    }
  }
};
