import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  hexSpaceId,
  legalGateHexPairs,
  planSubterraneanGates,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  unreachableUndergroundCenters,
  type CustomMapGateLink,
  type CustomMapTilePlan,
  type DesignedGateLinkLike,
  type GameState,
  type HexCoord,
  type TilePlacementLike
} from "./index";

function adv(state: GameState) {
  if (!state.adventure) throw new Error("no adventure");
  return state.adventure;
}

/** Build a face-up custom map and read back the gates the engine actually carved. */
function engineGateHexes(tiles: { center: HexCoord; group: CustomMapTilePlan["group"]; tileDefId: string }[]): Set<string> {
  const customMap: CustomMapTilePlan[] = [
    { row: 24, col: 12, group: "starting", faceDown: false },
    ...tiles.map((t) => ({ row: t.center.row, col: t.center.col, group: t.group, faceDown: false, tileDefId: t.tileDefId, rotation: 0 }))
  ];
  const state = createAdventureGameState({
    seed: "gate-plan",
    difficulty: "normal",
    rollFirstPlayer: false,
    customMap,
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  return new Set(
    Object.values(adv(state).fields)
      .filter((f) => f.location === "subterranean_gate")
      .map((f) => f.spaceId)
  );
}

describe("planSubterraneanGates matches the engine's carved gates", () => {
  it("a touching (non-interlocking) Surface↔cavern pair: preview == engine", () => {
    const far = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    // a touching, non-interlocking cavern position next to the far tile
    let cavern: HexCoord | null = null;
    for (let dRow = -4; dRow <= 4 && !cavern; dRow += 1) {
      for (let dCol = -4; dCol <= 4; dCol += 1) {
        const cand = { row: far.row + dRow, col: far.col + dCol };
        if (Math.abs(cand.row - 24) < 3 && Math.abs(cand.col - 12) < 3) continue;
        if (tileFootprintsTouch(far, cand) && !tileCentersAdjacent(far, cand)) {
          cavern = cand;
          break;
        }
      }
    }
    expect(cavern).not.toBeNull();

    const placements: TilePlacementLike[] = [
      { row: 24, col: 12, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: cavern!.row, col: cavern!.col, group: "subterranean" }
    ];
    const planned = planSubterraneanGates(placements);
    expect(planned).toHaveLength(1);

    const previewHexes = new Set([
      `h:${planned[0].gateHex.row}:${planned[0].gateHex.col}`,
      `h:${planned[0].entranceHex.row}:${planned[0].entranceHex.col}`
    ]);
    const engineHexes = engineGateHexes([
      { center: far, group: "far", tileDefId: "F1" },
      { center: cavern!, group: "subterranean", tileDefId: "U1" }
    ]);
    expect(engineHexes.size).toBe(2);
    expect(previewHexes).toEqual(engineHexes);
  });

  it("interlocking pair: preview == engine", () => {
    const far = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    const cavern = tileLatticeNeighbors(far)[0];
    expect(tileCentersAdjacent(far, cavern)).toBe(true);

    const planned = planSubterraneanGates([
      { row: 24, col: 12, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ]);
    expect(planned).toHaveLength(1);
    const previewHexes = new Set([
      `h:${planned[0].gateHex.row}:${planned[0].gateHex.col}`,
      `h:${planned[0].entranceHex.row}:${planned[0].entranceHex.col}`
    ]);
    const engineHexes = engineGateHexes([
      { center: far, group: "far", tileDefId: "F1" },
      { center: cavern, group: "subterranean", tileDefId: "U1" }
    ]);
    expect(previewHexes).toEqual(engineHexes);
  });
});

describe("planSubterraneanGates matches the engine when a Surface tile touches TWO caverns", () => {
  it("both pick the SAME single gate (interlocking-first, one per tile)", () => {
    const far = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    const interlockingCavern = tileLatticeNeighbors(far)[0]; // gapless neighbour of far
    // A second cavern that merely touches far (not interlocking) and is clear of
    // the town and the first cavern.
    let touchingCavern: HexCoord | null = null;
    for (let dRow = -4; dRow <= 4 && !touchingCavern; dRow += 1) {
      for (let dCol = -4; dCol <= 4; dCol += 1) {
        const cand = { row: far.row + dRow, col: far.col + dCol };
        const clearOf = [{ row: 24, col: 12 }, interlockingCavern];
        if (clearOf.some((o) => Math.abs(o.row - cand.row) < 3 && Math.abs(o.col - cand.col) < 3)) continue;
        if (tileFootprintsTouch(far, cand) && !tileCentersAdjacent(far, cand)) {
          touchingCavern = cand;
          break;
        }
      }
    }
    expect(touchingCavern).not.toBeNull();

    const placements: TilePlacementLike[] = [
      { row: 24, col: 12, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: interlockingCavern.row, col: interlockingCavern.col, group: "subterranean" },
      { row: touchingCavern!.row, col: touchingCavern!.col, group: "subterranean" }
    ];
    const planned = planSubterraneanGates(placements);
    // The far tile hosts exactly one gate; the interlocking cavern wins it.
    expect(planned).toHaveLength(1);
    expect(planned[0].cavernCenter).toEqual({ row: interlockingCavern.row, col: interlockingCavern.col });

    const previewHexes = new Set([
      `h:${planned[0].gateHex.row}:${planned[0].gateHex.col}`,
      `h:${planned[0].entranceHex.row}:${planned[0].entranceHex.col}`
    ]);
    const engineHexes = engineGateHexes([
      { center: far, group: "far", tileDefId: "F1" },
      { center: interlockingCavern, group: "subterranean", tileDefId: "U1" },
      { center: touchingCavern!, group: "subterranean", tileDefId: "U2" }
    ]);
    expect(previewHexes).toEqual(engineHexes);
  });
});

// ---------------------------------------------------------------------------
// Designer-chosen gate links: the pure `planSubterraneanGates` preview must
// match the engine's carve when the design pins pairings / hexes, so the
// designer draws exactly what the game builds — INCLUDING the 1-cavern↔2-surface
// case that the automatic one-gate-per-tile pass never produces.
// ---------------------------------------------------------------------------

type GateLinkTile = { center: HexCoord; group: CustomMapTilePlan["group"]; tileDefId: string; gateLinks?: CustomMapGateLink[] };

/** Build a face-up custom map (with designer gate links) and read the carved gate hexes. */
function engineGateHexesLinked(tiles: GateLinkTile[]): Set<string> {
  const customMap: CustomMapTilePlan[] = [
    { row: 24, col: 12, group: "starting", faceDown: false },
    ...tiles.map((tile) => ({
      row: tile.center.row,
      col: tile.center.col,
      group: tile.group,
      faceDown: false,
      tileDefId: tile.tileDefId,
      rotation: 0,
      ...(tile.gateLinks ? { gateLinks: tile.gateLinks } : {})
    }))
  ];
  const state = createAdventureGameState({
    seed: "gate-plan-designed",
    difficulty: "normal",
    rollFirstPlayer: false,
    customMap,
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  if (!state.adventure) {
    throw new Error("no adventure");
  }
  return new Set(
    Object.values(state.adventure.fields)
      .filter((field) => field.location === "subterranean_gate")
      .map((field) => field.spaceId)
  );
}

function previewHexes(placements: TilePlacementLike[], links: DesignedGateLinkLike[]): Set<string> {
  return new Set(
    planSubterraneanGates(placements, links).flatMap((gate) => [hexSpaceId(gate.gateHex), hexSpaceId(gate.entranceHex)])
  );
}

type HexPair = { gateHex: HexCoord; entranceHex: HexCoord };

/** Two boundary pairs sharing NO hex (so both carve their own gate), or null. */
function twoDisjointPairs(pairs: HexPair[]): [HexPair, HexPair] | null {
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const hexes = new Set([
        hexSpaceId(pairs[i].gateHex),
        hexSpaceId(pairs[i].entranceHex),
        hexSpaceId(pairs[j].gateHex),
        hexSpaceId(pairs[j].entranceHex)
      ]);
      if (hexes.size === 4) {
        return [pairs[i], pairs[j]];
      }
    }
  }
  return null;
}

/** A cavern next to `far`, clear of the town, with ≥2 legal boundary pairs. */
function cavernNextTo(far: HexCoord): HexCoord {
  const town = { row: 24, col: 12 };
  const scan: HexCoord[] = [];
  for (let dRow = -4; dRow <= 4; dRow += 1) {
    for (let dCol = -4; dCol <= 4; dCol += 1) {
      const cand = { row: far.row + dRow, col: far.col + dCol };
      if (tileFootprintsTouch(far, cand) && !tileCentersAdjacent(far, cand)) {
        scan.push(cand);
      }
    }
  }
  for (const cand of [...tileLatticeNeighbors(far), ...scan]) {
    if (cand.row === town.row && cand.col === town.col) {
      continue;
    }
    if (tileCentersOverlap(cand, town) || tileCentersOverlap(cand, far) || tileFootprintsTouch(cand, town)) {
      continue;
    }
    if (legalGateHexPairs(far, cand).length >= 2) {
      return cand;
    }
  }
  throw new Error("no suitable cavern");
}

describe("planSubterraneanGates matches the engine with DESIGNER gate links", () => {
  it("a pinned link carves at the DESIGNED (non-default) hex — preview == engine", () => {
    const far = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    const cavern = cavernNextTo(far);

    // The auto default hex (no link), and a legal boundary pair that differs.
    const autoGateId = hexSpaceId(
      planSubterraneanGates([
        { row: 24, col: 12, group: "starting" },
        { row: far.row, col: far.col, group: "far" },
        { row: cavern.row, col: cavern.col, group: "subterranean" }
      ])[0].gateHex
    );
    const pinned = legalGateHexPairs(far, cavern).find((pair) => hexSpaceId(pair.gateHex) !== autoGateId)!;
    const gateHexId = hexSpaceId(pinned.gateHex);
    const entranceHexId = hexSpaceId(pinned.entranceHex);

    const links: DesignedGateLinkLike[] = [
      { surfaceCenter: far, cavernCenter: cavern, gateHex: pinned.gateHex, entranceHex: pinned.entranceHex }
    ];
    const preview = previewHexes(
      [
        { row: 24, col: 12, group: "starting" },
        { row: far.row, col: far.col, group: "far" },
        { row: cavern.row, col: cavern.col, group: "subterranean" }
      ],
      links
    );
    const engine = engineGateHexesLinked([
      { center: far, group: "far", tileDefId: "F1" },
      {
        center: cavern,
        group: "subterranean",
        tileDefId: "U1",
        gateLinks: [{ surface: { row: far.row, col: far.col }, gateHex: gateHexId, entranceHex: entranceHexId }]
      }
    ]);
    // USER RULE: the editor pin is DECORATIVE. The designer PREVIEW still renders
    // the gate where drawn (so the editor "shows them as now"), but the ENGINE
    // carves at the automatic position at play — so preview and engine now DIFFER.
    expect(engine.size).toBe(2);
    // The engine carves at the AUTO default, NOT the decorative pin.
    expect(engine.has(autoGateId)).toBe(true);
    expect(engine.has(gateHexId)).toBe(false);
    void entranceHexId;
    // The preview still shows the drawn pin (editor rendering only).
    expect(preview.has(gateHexId)).toBe(true);
    expect(preview.has(autoGateId)).toBe(false);
  });

  it("one cavern linked to TWO Surface tiles: both gates — preview == engine (4 hexes)", () => {
    // Anchor the cluster clear of the helper's fixed starting tile at 24,12.
    const cavern = { row: 34, col: 20 };
    const [surfA, surfB] = tileLatticeNeighbors(cavern);
    expect(tileFootprintsTouch(cavern, { row: 24, col: 12 })).toBe(false);
    expect(tileFootprintsTouch(cavern, surfA) && tileFootprintsTouch(cavern, surfB)).toBe(true);

    const links: DesignedGateLinkLike[] = [
      { surfaceCenter: surfA, cavernCenter: cavern },
      { surfaceCenter: surfB, cavernCenter: cavern }
    ];
    const placements: TilePlacementLike[] = [
      { row: surfA.row, col: surfA.col, group: "far" },
      { row: surfB.row, col: surfB.col, group: "far" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ];
    const preview = previewHexes(placements, links);

    const cavernGateLinks: CustomMapGateLink[] = [
      { surface: { row: surfA.row, col: surfA.col } },
      { surface: { row: surfB.row, col: surfB.col } }
    ];
    const engine = engineGateHexesLinked([
      { center: surfA, group: "far", tileDefId: "F1" },
      { center: surfB, group: "far", tileDefId: "F2" },
      { center: cavern, group: "subterranean", tileDefId: "U1", gateLinks: cavernGateLinks }
    ]);
    // Two full gates → four distinct sacrificed hexes.
    expect(engine.size).toBe(4);
    expect(preview).toEqual(engine);
  });

  it("one cavern linked to FIVE Surface tiles: all five gates — preview == engine (10 hexes)", () => {
    // A cavern far from the helper's fixed town, linking five of its interlocking
    // neighbours (over the old cap of 4). Preview must match the carve exactly.
    const cavern = { row: 40, col: 24 };
    const town = { row: 24, col: 12 };
    const neighbors = tileLatticeNeighbors(cavern).filter(
      (neighbor) => !tileCentersOverlap(neighbor, town) && !tileFootprintsTouch(neighbor, town)
    );
    expect(neighbors.length).toBeGreaterThanOrEqual(5);
    const surfaces = neighbors.slice(0, 5);

    const links: DesignedGateLinkLike[] = surfaces.map((surface) => ({ surfaceCenter: surface, cavernCenter: cavern }));
    const placements: TilePlacementLike[] = [
      ...surfaces.map((surface) => ({ row: surface.row, col: surface.col, group: "far" as const })),
      { row: cavern.row, col: cavern.col, group: "subterranean" as const }
    ];
    const preview = previewHexes(placements, links);

    const engine = engineGateHexesLinked([
      ...surfaces.map((surface, index) => ({ center: surface, group: "far" as const, tileDefId: `F${index + 1}` })),
      {
        center: cavern,
        group: "subterranean" as const,
        tileDefId: "U1",
        gateLinks: surfaces.map((surface) => ({ surface: { row: surface.row, col: surface.col } }))
      }
    ]);
    expect(engine.size).toBe(10); // five gates × two sacrificed hexes each
    expect(preview).toEqual(engine);
  });

  it("the SAME surface linked TWICE collapses to ONE gate in the engine (preview still renders both drawn)", () => {
    const far = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    const cavern = cavernNextTo(far);
    const disjoint = twoDisjointPairs(legalGateHexPairs(far, cavern));
    expect(disjoint, "the shared edge has two disjoint boundary pairs").toBeTruthy();
    const [first, second] = disjoint!;

    const links: DesignedGateLinkLike[] = [
      { surfaceCenter: far, cavernCenter: cavern, gateHex: first.gateHex, entranceHex: first.entranceHex },
      { surfaceCenter: far, cavernCenter: cavern, gateHex: second.gateHex, entranceHex: second.entranceHex }
    ];
    const placements: TilePlacementLike[] = [
      { row: 24, col: 12, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ];
    const preview = previewHexes(placements, links);

    const engine = engineGateHexesLinked([
      { center: far, group: "far", tileDefId: "F1" },
      {
        center: cavern,
        group: "subterranean",
        tileDefId: "U1",
        gateLinks: [
          { surface: { row: far.row, col: far.col }, gateHex: hexSpaceId(first.gateHex), entranceHex: hexSpaceId(first.entranceHex) },
          { surface: { row: far.row, col: far.col }, gateHex: hexSpaceId(second.gateHex), entranceHex: hexSpaceId(second.entranceHex) }
        ]
      }
    ]);
    // USER RULE: a gate connects two TILES, so two links to the SAME pair collapse
    // to ONE gate in the engine (2 sacrificed hexes). The designer preview still
    // renders BOTH drawn gates (4 hexes) — editor rendering only.
    expect(engine.size).toBe(2);
    expect(preview.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Per-tile UNDERGROUND designation: a far/near/center/sea plan flagged
// `underground` is on the cavern layer for gate planning, so the pure preview
// must mirror the engine's carve bit-for-bit — exactly like a printed cavern.
// ---------------------------------------------------------------------------
describe("planSubterraneanGates matches the engine with a FLAGGED underground tile", () => {
  /** Build a face-up custom map whose far tiles may carry the underground flag. */
  function engineGateHexesFlagged(
    tiles: { center: HexCoord; group: CustomMapTilePlan["group"]; tileDefId: string; underground?: boolean }[]
  ): Set<string> {
    const customMap: CustomMapTilePlan[] = [
      { row: 24, col: 12, group: "starting", faceDown: false },
      ...tiles.map((t) => ({
        row: t.center.row,
        col: t.center.col,
        group: t.group,
        faceDown: false,
        tileDefId: t.tileDefId,
        rotation: 0,
        ...(t.underground ? { underground: true as const } : {})
      }))
    ];
    const state = createAdventureGameState({
      seed: "gate-plan-flagged",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap,
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    return new Set(
      Object.values(adv(state).fields)
        .filter((f) => f.location === "subterranean_gate")
        .map((f) => f.spaceId)
    );
  }

  it("a flagged FAR tile auto-pairs a gate with a touching Surface tile — preview == engine", () => {
    const surface = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    const flagged = tileLatticeNeighbors(surface)[0]; // interlocking neighbour of the surface tile
    expect(tileCentersAdjacent(surface, flagged)).toBe(true);

    // Preview: the flagged tile is `underground: true`, so it reads as a cavern.
    const planned = planSubterraneanGates([
      { row: 24, col: 12, group: "starting" },
      { row: surface.row, col: surface.col, group: "far" },
      { row: flagged.row, col: flagged.col, group: "far", underground: true }
    ]);
    expect(planned).toHaveLength(1);
    const preview = new Set([hexSpaceId(planned[0].gateHex), hexSpaceId(planned[0].entranceHex)]);

    const engine = engineGateHexesFlagged([
      { center: surface, group: "far", tileDefId: "F1" },
      { center: flagged, group: "far", tileDefId: "F3", underground: true }
    ]);
    expect(engine.size).toBe(2);
    expect(preview).toEqual(engine);
  });

  it("CONTROL: WITHOUT the flag the two far tiles are one Surface layer — no gate in preview OR engine", () => {
    const surface = tileLatticeNeighbors({ row: 24, col: 12 })[0];
    const other = tileLatticeNeighbors(surface)[0];
    const planned = planSubterraneanGates([
      { row: 24, col: 12, group: "starting" },
      { row: surface.row, col: surface.col, group: "far" },
      { row: other.row, col: other.col, group: "far" } // no underground flag
    ]);
    expect(planned).toHaveLength(0);
    const engine = engineGateHexesFlagged([
      { center: surface, group: "far", tileDefId: "F1" },
      { center: other, group: "far", tileDefId: "F3" }
    ]);
    expect(engine.size).toBe(0);
  });

  it("unreachableUndergroundCenters flags an isolated flagged tile, and clears it once it touches a Surface tile", () => {
    const start = { row: 24, col: 12 };
    const far = tileLatticeNeighbors(start)[0];
    const isolated = { row: far.row + 12, col: far.col + 8 };
    expect(tileFootprintsTouch(far, isolated)).toBe(false);

    // A flagged far tile with no surface neighbour is unreachable, like a cavern.
    const isolatedResult = unreachableUndergroundCenters([
      { row: start.row, col: start.col, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: isolated.row, col: isolated.col, group: "far", underground: true }
    ]);
    expect(isolatedResult).toEqual([{ row: isolated.row, col: isolated.col }]);

    // Move the same flagged tile against the far (surface) tile → reachable.
    const touching = tileLatticeNeighbors(far)[0];
    const reachableResult = unreachableUndergroundCenters([
      { row: start.row, col: start.col, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: touching.row, col: touching.col, group: "far", underground: true }
    ]);
    expect(reachableResult).toEqual([]);

    // CONTROL: without the flag it is a plain Surface far tile — never flagged.
    const controlResult = unreachableUndergroundCenters([
      { row: start.row, col: start.col, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: isolated.row, col: isolated.col, group: "far" }
    ]);
    expect(controlResult).toEqual([]);
  });
});

describe("unreachableUndergroundCenters", () => {
  it("flags a cavern that touches no surface tile (and clears it once it does)", () => {
    const start = { row: 24, col: 12 };
    const far = tileLatticeNeighbors(start)[0];
    // A cavern far away from any surface tile.
    const isolated = { row: far.row + 12, col: far.col + 8 };
    expect(tileFootprintsTouch(far, isolated)).toBe(false);

    const isolatedResult = unreachableUndergroundCenters([
      { row: start.row, col: start.col, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: isolated.row, col: isolated.col, group: "subterranean" }
    ]);
    expect(isolatedResult).toEqual([{ row: isolated.row, col: isolated.col }]);

    // Now a cavern that touches the far tile is reachable (not flagged).
    const touching = tileLatticeNeighbors(far)[0];
    const reachableResult = unreachableUndergroundCenters([
      { row: start.row, col: start.col, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: touching.row, col: touching.col, group: "subterranean" }
    ]);
    expect(reachableResult).toEqual([]);
  });

  it("a cavern chain reaches the surface through one gated cavern", () => {
    const start = { row: 24, col: 12 };
    const far = tileLatticeNeighbors(start)[0];
    const gatedCavern = tileLatticeNeighbors(far)[0]; // touches the surface
    const deepCavern = tileLatticeNeighbors(gatedCavern).find(
      (c) => !tileFootprintsTouch(far, c) && !(c.row === far.row && c.col === far.col)
    )!;
    // deepCavern touches gatedCavern but not the surface far tile.
    expect(tileFootprintsTouch(gatedCavern, deepCavern)).toBe(true);
    expect(tileFootprintsTouch(far, deepCavern)).toBe(false);

    const result = unreachableUndergroundCenters([
      { row: start.row, col: start.col, group: "starting" },
      { row: far.row, col: far.col, group: "far" },
      { row: gatedCavern.row, col: gatedCavern.col, group: "subterranean" },
      { row: deepCavern.row, col: deepCavern.col, group: "subterranean" }
    ]);
    // Both reachable: the chain bridges deepCavern to the surface.
    expect(result).toEqual([]);
  });
});
