import type { GameDifficulty } from "@/engine/state";

/**
 * Scenario sheets: everything the printed Scenario defines about map setup —
 * tile layout, starting resources and income, starting units and buildings,
 * how many Far (II–III) tiles each player drafts, and the victory rule.
 *
 * Coordinates are odd-r offset hex coordinates of tile centers. Every center
 * sits on the one index-7 flower sublattice (see tileCentersAdjacent /
 * tileLatticeColor in the engine) so the 7-field flowers interlock gaplessly —
 * no field-sized holes ever open between tiles.
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
      "A free-for-all for 2–4 players. Four seats ring a single Center tile, with two Near tiles filling the remaining flanks so every tile interlocks gaplessly. Seats 1 and 2 sit on opposite sides for a classic head-to-head duel; seats 3 and 4 open the other two corners. Flag an enemy town to win.",
    minPlayers: 2,
    maxPlayers: 4,
    difficulty: "normal",
    layout: {
      // A "flower of flowers": the Center tile (9,4) is the hub and the six tiles
      // around it are its gapless neighbours — four seats plus two Near tiles.
      // Seats 1 and 2 are an opposite pair (distance 6) so a 2-player duel has
      // room; seats 3 and 4 fill the other corners. Every center lies on one
      // tiling sublattice, so the map is hole-free for 2, 3 or 4 players and the
      // whole perimeter offers notches to extend with Far tiles. Seat 1 stays at
      // (8,2). Verified: no footprints overlap and all tiles stay connected.
      starts: [
        { row: 8, col: 2 },
        { row: 10, col: 7 },
        { row: 6, col: 4 },
        { row: 12, col: 5 }
      ],
      near: [
        { row: 7, col: 6 },
        { row: 11, col: 2 }
      ],
      center: [{ row: 9, col: 4 }]
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
