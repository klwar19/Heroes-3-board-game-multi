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

/** A face-down sea tile slot: a Surface water tile drawn from the matching wave band. */
export type ScenarioSeaSlot = { row: number; col: number; band: "iv-v" | "vi-vii" };

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
    /** Face-down Far (II–III) tiles placed in the fixed layout. */
    far?: { row: number; col: number }[];
    /** Face-down Near (IV–V) tiles. */
    near: { row: number; col: number }[];
    /** Face-down Center (VI–VII) tiles. */
    center: { row: number; col: number }[];
    /**
     * Face-down sea tiles (Cove waves). Surface layer; `band` picks the Ⅳ–Ⅴ or
     * Ⅵ–Ⅶ sea pool. Heroes reach them across an open coastline edge exactly like
     * any other Surface tile (a land→sea step embarks and halts).
     */
    sea?: ScenarioSeaSlot[];
    /**
     * Face-down Subterranean tiles (the underground layer). They are placed so
     * that every Surface tile touching one is a Ⅱ–Ⅲ land tile, so the
     * Subterranean Gate Token always carves its GATE half on the Ⅱ–Ⅲ Surface
     * tile and its ENTRANCE half on the cavern (recomputeSubterraneanGates).
     */
    subterranean?: { row: number; col: number }[];
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

const SYMMETRIC_SOURCE = {
  product: "Heroes of Might and Magic III: The Board Game — community symmetric maps",
  credit:
    "Mirror-symmetric 2-player clash maps on the engine's index-7 flower sublattice (homes on the OUTER EDGE, tier rising inward to a Ⅵ–Ⅶ hub). Layout principle from the Fan-Made Mission Book (pp. 26 & 36). Resource numbers are development defaults."
};

// Mirror-symmetric 2-player geometry (verified by symmetric-scenarios.test.ts).
// The map reflects onto itself across the axis through the hub, so both homes are
// identical. Roles, from the centre outward:
//   HUB        — the central Ⅵ–Ⅶ tile (sea hub for sea maps).
//   INNER (6)  — the ring touching the hub.
//   SUBPOS (2) — the two "deep" tiles (a cavern for underground, sea for sea).
//   OUTER (2)  — Ⅱ–Ⅲ land buffering the deep tiles toward the homes.
//   FLANK (2)  — each home's adjacent Ⅱ–Ⅲ land (its NE/NW), so EVERY faction has
//                an open edge to march in from (no faction is ever walled in).
//   STARTS (2) — the two homes, on the outer edge.
const HUB_POS = { row: 30, col: 30 };
const INNER = [
  { row: 31, col: 32 },
  { row: 27, col: 29 },
  { row: 28, col: 32 },
  { row: 29, col: 27 },
  { row: 33, col: 30 },
  { row: 32, col: 28 }
];
const SUBPOS = [
  { row: 34, col: 26 },
  { row: 36, col: 31 }
];
const OUTER = [
  { row: 36, col: 24 },
  { row: 39, col: 31 }
];
const FLANK = [
  { row: 35, col: 21 },
  { row: 40, col: 34 }
];
const STARTS = [
  { row: 38, col: 22 },
  { row: 42, col: 32 }
];

type Terrain = "land" | "sea" | "underground";

function symmetricScenario(spec: { id: string; name: string; description: string; terrain: Terrain }): ScenarioDefinition {
  const { terrain } = spec;
  // Ⅱ–Ⅲ land is the "land first" band on every terrain. For land it also lines
  // the deep tiles; for sea/underground those deep tiles are water/cavern.
  const landII = terrain === "land" ? [...OUTER, ...FLANK, ...SUBPOS] : [...OUTER, ...FLANK];
  const layout: ScenarioDefinition["layout"] =
    terrain === "land"
      ? { starts: STARTS, far: landII, near: INNER, center: [HUB_POS] }
      : terrain === "sea"
        ? {
            starts: STARTS,
            far: landII,
            near: [],
            center: [],
            sea: [
              { ...HUB_POS, band: "vi-vii" as const },
              ...INNER.map((m) => ({ ...m, band: "iv-v" as const })),
              ...SUBPOS.map((m) => ({ ...m, band: "iv-v" as const }))
            ]
          }
        : {
            // underground: Ⅵ–Ⅶ LAND hub, a Ⅱ–Ⅲ inner ring, two caverns (SUBPOS),
            // all buffered so a cavern only ever touches Ⅱ–Ⅲ land.
            starts: STARTS,
            far: [...INNER, ...OUTER, ...FLANK],
            near: [],
            center: [HUB_POS],
            subterranean: SUBPOS
          };

  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    minPlayers: 2,
    maxPlayers: 2,
    difficulty: "normal",
    layout,
    startingResources: { gold: 10, buildingMaterials: 5, valuables: 2 },
    startingProduction: { gold: 10, buildingMaterials: 0, valuables: 0 },
    startingUnits: { tiers: ["bronze"] },
    startingBuildings: [],
    farTiles: { perPlayer: 2, guaranteeSettlement: true },
    victory: { type: "flag-enemy-town" },
    source: SYMMETRIC_SOURCE
  };
}

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
    startingResources: { gold: 10, buildingMaterials: 5, valuables: 2 },
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
  },

  "land-2p": symmetricScenario({
    id: "land-2p",
    name: "Twin Kingdoms (2P Land)",
    description:
      "A mirror-symmetric 2-player land clash. Both homes sit on the outer edge and march inward — Ⅱ–Ⅲ then Ⅳ–Ⅴ — to the contested Ⅵ–Ⅶ hub. Flag the enemy town to win.",
    terrain: "land"
  }),
  "sea-2p": symmetricScenario({
    id: "sea-2p",
    name: "Strait of Mirrors (2P Sea)",
    description:
      "A mirror-symmetric 2-player sea clash. Each home stands on a Ⅱ–Ⅲ land coast; the land then gives way to OPEN SEA — a Ⅳ–Ⅴ wave ring around a Ⅵ–Ⅶ wave hub. Sail out from the coast (a land→sea step embarks and ends the move) and fight for the centre. Flag the enemy town to win.",
    terrain: "sea"
  }),
  "underground-2p": symmetricScenario({
    id: "underground-2p",
    name: "Twin Caverns (2P Underground)",
    description:
      "A mirror-symmetric 2-player underground clash. Both homes start on the LAND surface; two Subterranean caverns sit in the middle, each touching ONLY Ⅱ–Ⅲ land so the Subterranean Gate carves its gate on the land tile and its entrance in the cavern. Descend through a cavern and climb back up to the central Ⅵ–Ⅶ LAND hub. Flag the enemy town to win.",
    terrain: "underground"
  })
};

export const DEFAULT_SCENARIO_ID = "skirmish";
