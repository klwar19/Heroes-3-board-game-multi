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
     * Face-down Subterranean tiles (the underground layer). A Subterranean Gate
     * Token is carved (recomputeSubterraneanGates) wherever a Surface tile is
     * gapless-adjacent to one — its GATE half on the Surface tile, its ENTRANCE
     * half on the cavern — subject to the one-gate-per-tile rule (a tile already
     * hosting a Gate never accepts a second). The 2-player underground map uses
     * this to keep only Ⅱ–Ⅲ land on the surface and bury the Ⅳ–Ⅴ/Ⅵ–Ⅶ tiles
     * behind the caverns, so the deep tiles are reached ONLY by delving.
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

// Underground-only geometry. The homes keep only their Ⅱ–Ⅲ land ring (OUTER +
// FLANK); the high-value tiles form a DEEP CORE reached ONLY by delving:
//   UG_NEAR  — the two Ⅳ–Ⅴ tiles "at top" (rows 27/28, above the hub).
//   HUB_POS  — the Ⅵ–Ⅶ tile "in the middle"; it has NO direct Gate (a fair,
//              mirror-symmetric Gate onto the self-mirror hub is geometrically
//              impossible — the hub's neighbours come only in mirror pairs), so
//              it is reached by rising to either Ⅳ–Ⅴ and walking one tile in.
//   UG_CAVERNS — a single CONNECTED underground network (9 caverns). Each home
//              descends through a Gate on its Ⅱ–Ⅲ tile; the network bridges the
//              two sides (35,28) and rises to each Ⅳ–Ⅴ through one more Gate.
// Verified mirror-symmetric, gapless, single-colour and connected by
// symmetric-scenarios.test.ts; the per-tile Gate matching is 1:1 so the
// one-gate-per-tile rule never has to drop a gate here.
const UG_NEAR = [
  { row: 27, col: 29 },
  { row: 28, col: 32 }
];
const UG_CAVERNS = [
  { row: 26, col: 27 }, // rises to the left Ⅳ–Ⅴ (27,29)
  { row: 29, col: 34 }, // rises to the right Ⅳ–Ⅴ (28,32)
  { row: 28, col: 25 }, // upper connectors …
  { row: 32, col: 35 },
  { row: 31, col: 25 }, // … mid connectors …
  { row: 34, col: 33 },
  { row: 34, col: 26 }, // descends from the left home Ⅱ–Ⅲ (36,24)
  { row: 36, col: 31 }, // descends from the right home Ⅱ–Ⅲ (39,31)
  { row: 35, col: 28 } // central bridge linking both sides (self-mirror)
];

type Terrain = "land" | "sea" | "underground";

function symmetricScenario(spec: { id: string; name: string; description: string; terrain: Terrain }): ScenarioDefinition {
  const { terrain } = spec;
  // Ⅱ–Ⅲ land is the "land first" band on every terrain. For land it also lines
  // the deep SUBPOS tiles; sea turns SUBPOS into water and underground replaces
  // it with its own cavern network, so both keep only OUTER + FLANK as land.
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
            // underground: only the Ⅱ–Ⅲ home ring sits on the surface at the
            // start. The Ⅳ–Ⅴ pair (top) and the Ⅵ–Ⅶ hub (middle) are a deep
            // core reached ONLY by delving through the connected Subterranean
            // network — descend on a home Ⅱ–Ⅲ tile, cross underground, rise to a
            // Ⅳ–Ⅴ, then step to the hub. No Ⅳ–Ⅴ/Ⅵ–Ⅶ is walkable on the surface.
            starts: STARTS,
            far: landII,
            near: UG_NEAR,
            center: [HUB_POS],
            subterranean: UG_CAVERNS
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
      "A mirror-symmetric 2-player underground clash. Only Ⅱ–Ⅲ land sits on the surface around each home — everything richer is below. Descend through a Subterranean Gate on your Ⅱ–Ⅲ tile into a CONNECTED cavern network that bridges both homes, then rise through another Gate to one of the two Ⅳ–Ⅴ tiles at the top and step in to the Ⅵ–Ⅶ hub in the middle. Each tile takes at most ONE Gate. Flag the enemy town to win.",
    terrain: "underground"
  })
};

export const DEFAULT_SCENARIO_ID = "skirmish";
