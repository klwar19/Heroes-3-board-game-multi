import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  planSubterraneanGates,
  tileCentersAdjacent,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  unreachableUndergroundCenters,
  type CustomMapTilePlan,
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
