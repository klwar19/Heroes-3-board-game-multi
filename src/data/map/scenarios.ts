import type { GameDifficulty } from "@/engine/state";

/**
 * Scenario sheets: everything the printed Scenario defines about map setup —
 * tile layout, starting resources and income, starting units and buildings,
 * how many Far (II–III) tiles each player drafts, and the victory rule.
 *
 * Coordinates are odd-r offset hex coordinates of tile centers. Neighbouring
 * tile centers sit at hex distance 3 so the 7-field flowers touch
 * edge-to-edge (see tileFootprintsTouch in the engine).
 *
 * The exact numbers of the printed Mission Book scenarios are not publicly
 * transcribed on the fan wiki, so the default skirmish below is a faithful
 * structure with development values. Replace the numbers when importing the
 * real sheets; nothing else has to change.
 */

export type ScenarioStartingUnits = {
  /** One "few" card of every faction unit of these tiers. */
  tiers: ("bronze" | "silver" | "gold")[];
};

export type ScenarioDefinition = {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  difficulty: GameDifficulty;
  layout: {
    /** Starting-tile centers by seat order. The tile itself comes from the faction. */
    starts: { row: number; col: number }[];
    /** Face-down Near (IV–V) tiles. */
    near: { row: number; col: number }[];
    /** Face-down Center (VI–VII) tiles. */
    center: { row: number; col: number }[];
  };
  startingResources: { gold: number; buildingMaterials: number; valuables: number };
  startingProduction: { gold: number; buildingMaterials: number; valuables: number };
  startingUnits: ScenarioStartingUnits;
  /** Building ids (without faction prefix) already standing at setup. */
  startingBuildings: string[];
  farTiles: {
    /** Far (II–III) tiles drafted into each player's supply at setup. */
    perPlayer: number;
    /**
     * Mission Book draft rule: if no drafted tile contains a Settlement,
     * keep redrawing the last one until it does.
     */
    guaranteeSettlement: boolean;
  };
  victory: { type: "flag-enemy-town" };
  source: { product: string; credit: string; url?: string };
};

export const scenarioDefinitions: Record<string, ScenarioDefinition> = {
  skirmish: {
    id: "skirmish",
    name: "Border Skirmish",
    description:
      "A head-to-head duel. Starting tiles sit in opposite corners, two Near tiles bridge the middle of the map, and a Center tile guards the deep north. Flag the enemy town to win.",
    minPlayers: 2,
    maxPlayers: 3,
    difficulty: "normal",
    layout: {
      // Chain: start1 (8,2) — near (5,3) — near (5,6) — start2 (8,8);
      // the Center tile (2,5) touches both Near tiles from the north.
      starts: [
        { row: 8, col: 2 },
        { row: 8, col: 8 },
        { row: 11, col: 5 }
      ],
      near: [
        { row: 5, col: 3 },
        { row: 5, col: 6 }
      ],
      center: [{ row: 2, col: 5 }]
    },
    // Development values until the printed Mission Book sheets are imported.
    startingResources: { gold: 10, buildingMaterials: 5, valuables: 2 },
    // Base resource gain each Resource Round: 10 gold, no materials, no
    // valuables. Mines, settlements and buildings add on top; the map-setup
    // lobby can change the base.
    startingProduction: { gold: 10, buildingMaterials: 0, valuables: 0 },
    startingUnits: { tiers: ["bronze"] },
    startingBuildings: [],
    farTiles: { perPlayer: 2, guaranteeSettlement: true },
    victory: { type: "flag-enemy-town" },
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Core Game)",
      credit:
        "Structure per the rulebook's Scenario sheets; tile counts and the Far-tile settlement draft per the Mission Book. Resource numbers are development defaults."
    }
  }
};

export const DEFAULT_SCENARIO_ID = "skirmish";
