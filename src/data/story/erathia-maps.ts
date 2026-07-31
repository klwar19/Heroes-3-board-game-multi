import { scenarioDefinitions } from "@/data/map/scenarios";
import type { CustomMapPreset, CustomMapTilePlan } from "@/engine/state";

export type ErathiaScenarioMap = {
  name: string;
  tiles: CustomMapTilePlan[];
  preset: CustomMapPreset;
};

function scenarioTiles(
  scenarioId: keyof typeof scenarioDefinitions,
  players: number
): CustomMapTilePlan[] {
  const layout = scenarioDefinitions[scenarioId].layout;
  return [
    ...layout.starts.slice(0, players).map(({ row, col }) => ({
      row,
      col,
      group: "starting" as const,
      faceDown: false,
      lockRotation: true
    })),
    ...(layout.far ?? []).map(({ row, col }) => ({ row, col, group: "far" as const, faceDown: true })),
    ...layout.near.map(({ row, col }) => ({ row, col, group: "near" as const, faceDown: true })),
    ...layout.center.map(({ row, col }) => ({ row, col, group: "center" as const, faceDown: true })),
    ...(layout.sea ?? []).map(({ row, col, band }) => ({
      row,
      col,
      group: "sea" as const,
      faceDown: true,
      seaBand: band
    })),
    ...(layout.subterranean ?? []).map(({ row, col }) => ({
      row,
      col,
      group: "subterranean" as const,
      faceDown: true,
      subBand: "iv-v" as const
    }))
  ];
}

const homecomingTiles = scenarioTiles("underground-2p", 2).map((plan) =>
  plan.group === "center"
    ? {
        ...plan,
        underground: true,
        viiField: "town" as const,
        centerHex: {
          guard: { level: 6, levelArmy: "packs" as const, packFaction: "dungeon" as const },
          reward: { gold: 8, buildingMaterials: 2 },
          vp: 3
        }
      }
    : plan
);

const guardianTiles = scenarioTiles("underground-2p", 2).map((plan, index) => {
  if (plan.group === "center") {
    return {
      ...plan,
      viiField: "town" as const,
      centerHex: {
        guard: { level: 5, levelArmy: "packs" as const, packFaction: "inferno" as const },
        reward: { searchArtifact: 3, morale: 1 as const },
        vp: 3
      }
    };
  }
  if (plan.group === "subterranean") {
    return {
      ...plan,
      subBand: index % 2 === 0 ? ("iv-v" as const) : ("vi-vii" as const)
    };
  }
  return plan;
});

// A three-front highland built from the same verified flower lattice as the
// symmetric land scenario. Seven resource-bearing regions stand in for the
// seven Griffin Towers: the engine can track their flags exactly, so the
// original scenario objective becomes a real, enforceable win condition.
const GRIFFIN_STARTS = [
  { row: 38, col: 22 },
  { row: 42, col: 32 },
  { row: 26, col: 27 }
];
const GRIFFIN_FAR = [
  { row: 36, col: 24 },
  { row: 39, col: 31 },
  { row: 35, col: 21 },
  { row: 40, col: 34 },
  { row: 34, col: 26 },
  { row: 36, col: 31 }
];
const GRIFFIN_NEAR = [
  { row: 31, col: 32 },
  { row: 27, col: 29 },
  { row: 28, col: 32 },
  { row: 29, col: 27 },
  { row: 33, col: 30 },
  { row: 32, col: 28 }
];

const griffinTiles: CustomMapTilePlan[] = [
  ...GRIFFIN_STARTS.map(({ row, col }) => ({
    row,
    col,
    group: "starting" as const,
    faceDown: false,
    lockRotation: true
  })),
  ...GRIFFIN_FAR.map(({ row, col }) => ({
    row,
    col,
    group: "far" as const,
    faceDown: true,
    secretFeature: "any_mine" as const,
    objectPlans: {
      mine: {
        guard: { level: 4, levelArmy: "packs" as const, packFaction: "inferno" as const },
        reward: { morale: 1 as const },
        vp: 1
      }
    }
  })),
  ...GRIFFIN_NEAR.map(({ row, col }, index) => ({
    row,
    col,
    group: "near" as const,
    faceDown: true,
    ...(index === 0
      ? {
          secretFeature: "settlement" as const,
          settlement: {
            guard: { level: 5, levelArmy: "packs" as const, packFaction: "dungeon" as const },
            reward: { gold: 5, movement: 1 },
            vp: 1
          }
        }
      : { excludeFeatures: ["town" as const] })
  })),
  {
    row: 30,
    col: 30,
    group: "center",
    faceDown: true,
    viiField: "settlement",
    centerHex: {
      guard: { level: 7, levelArmy: "packs", packFaction: "dungeon" },
      reward: { searchArtifact: 4, morale: 1 },
      vp: 2
    }
  }
];

export const ERATHIA_SCENARIO_MAPS: Record<string, ErathiaScenarioMap> = {
  homecoming: {
    name: "Homecoming — The Road to Terraneus",
    tiles: homecomingTiles,
    preset: {
      victoryMode: "conquest",
      difficulty: "easy",
      farTileOpening: false,
      farTilesPerPlayer: 0,
      startingResources: { gold: 15, buildingMaterials: 3, valuables: 1 },
      startingProduction: { gold: 10, buildingMaterials: 2, valuables: 1 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 2, side: "few" }],
      randomTowns: {
        guard: { level: 6, levelArmy: "packs", packFaction: "dungeon" },
        captureReward: { gold: 10, buildingMaterials: 2 },
        incomeGold: 10
      },
      mines: { guard: { level: 3 }, breakField: true, persistentGuard: true },
      customWinConditions: [{ kind: "control-towns", count: 2 }],
      timedEvents: [
        { round: 2, effect: { kind: "note", text: "Scouts report Mirham under Nighon and Kreegan occupation." } },
        { round: 4, effect: { kind: "note", text: "The invasion road leads below ground. Terraneus lies at its end." } },
        { round: 6, repeatEveryRounds: 4, effect: { kind: "resources", buildingMaterials: 1 } }
      ],
      roundLimit: 16,
      notes: "Capture a second town. Terraneus is the guarded underground objective; the surface route teaches expansion before the descent."
    }
  },
  "guardian-angels": {
    name: "Guardian Angels — Fair Feather",
    tiles: guardianTiles,
    preset: {
      victoryMode: "conquest",
      difficulty: "normal",
      farTileOpening: false,
      farTilesPerPlayer: 0,
      startingResources: { gold: 10, buildingMaterials: 2, valuables: 1 },
      startingProduction: { gold: 8, buildingMaterials: 2, valuables: 1 },
      startingBuildings: ["citadel", "dwelling_bronze"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "few" }],
      randomTowns: { guard: { level: 5, levelArmy: "packs", packFaction: "inferno" }, incomeGold: 12 },
      mines: { guard: { level: 4 }, breakField: true },
      timedEvents: [
        { round: 1, effect: { kind: "morale", amount: 1 } },
        { round: 3, effect: { kind: "note", text: "Four cave mouths feed the siege. Break the underground strongholds before Fair Feather falls." } },
        { round: 5, repeatEveryRounds: 4, effect: { kind: "movement", amount: 1 } }
      ],
      roundLimit: 14,
      notes: "Defeat the Nighon–Kreegan host. Fair Feather is the central white city; the underground network creates four approach fronts."
    }
  },
  "griffin-cliff": {
    name: "Griffin Cliff — Seven Towers",
    tiles: griffinTiles,
    preset: {
      victoryMode: "conquest",
      difficulty: "normal",
      farTileOpening: false,
      farTilesPerPlayer: 0,
      startingResources: { gold: 16, buildingMaterials: 4, valuables: 2 },
      startingProduction: { gold: 10, buildingMaterials: 2, valuables: 1 },
      startingBuildings: ["citadel", "mage_guild", "dwelling_bronze", "dwelling_silver"],
      startingUnits: [{ level: 1, side: "pack" }, { level: 2, side: "pack" }, { level: 4, side: "few" }],
      mines: { guard: { level: 4, levelArmy: "packs", packFaction: "random" }, breakField: true, persistentGuard: true },
      settlements: { guard: { level: 5, levelArmy: "packs", packFaction: "random" }, vp: 1 },
      customWinConditions: [{ kind: "flag-mines", count: 7 }],
      timedEvents: [
        { round: 1, effect: { kind: "note", text: "Seven Griffin Towers remain occupied. Flag seven mines or settlements to free every breeding ground." } },
        { round: 5, repeatEveryRounds: 5, effect: { kind: "resources", buildingMaterials: -1 } },
        { round: 7, effect: { kind: "search", deck: "abilities", count: 3 } }
      ],
      roundLimit: 18,
      notes: "Flag seven resource sites to represent the seven Griffin Towers. Two enemy fronts pressure the road while the high center holds the strongest guard."
    }
  }
};
