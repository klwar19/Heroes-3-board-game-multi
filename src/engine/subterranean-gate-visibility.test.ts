// ---------------------------------------------------------------------------
// Subterranean Gates must be READABLE on the map the way the coloured Teleport
// Gate networks are: both halves of one link wear the SAME pairing label, each
// says which way it goes (down into the Underground / up to the Surface), and a
// half whose partner tile is still face down says so instead of leaking it.
// Every claim below is asserted on the derived marker set, with a CONTROL.
// ---------------------------------------------------------------------------
import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  hexSpaceId,
  legalGateHexPairs,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  subterraneanGateMarkers,
  subterraneanGateMarkersBySpace,
  type CustomMapTilePlan,
  type GameState,
  type HexCoord
} from "./index";
import type { AdventureState } from "./state";

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

const TOWN = { row: 24, col: 12 };
const FAR = tileLatticeNeighbors(TOWN)[0];

/** A cavern position touching FAR (clear of the town) with a legal gate pair. */
function cavernNextToFar(): HexCoord {
  const scan: HexCoord[] = [];
  for (let dRow = -4; dRow <= 4; dRow += 1) {
    for (let dCol = -4; dCol <= 4; dCol += 1) {
      const cand = { row: FAR.row + dRow, col: FAR.col + dCol };
      if (tileFootprintsTouch(FAR, cand) && !tileCentersAdjacent(FAR, cand)) {
        scan.push(cand);
      }
    }
  }
  for (const cand of [...tileLatticeNeighbors(FAR), ...scan]) {
    if (cand.row === TOWN.row && cand.col === TOWN.col) continue;
    if (tileCentersOverlap(cand, TOWN) || tileCentersOverlap(cand, FAR) || tileFootprintsTouch(cand, TOWN)) {
      continue;
    }
    if (legalGateHexPairs(FAR, cand).length >= 1) {
      return cand;
    }
  }
  throw new Error("no suitable cavern next to FAR");
}

function gameWithDesignedGate(cavernFaceDown: boolean): GameState {
  const cavern = cavernNextToFar();
  const customMap: CustomMapTilePlan[] = [
    { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
    { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
    {
      row: cavern.row,
      col: cavern.col,
      group: "subterranean",
      faceDown: cavernFaceDown,
      tileDefId: "U1",
      gateLinks: [{ surface: { row: FAR.row, col: FAR.col } }]
    }
  ];
  return createAdventureGameState({
    seed: "gate-visibility",
    difficulty: "normal",
    rollFirstPlayer: false,
    customMap,
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

describe("Subterranean Gate map markers", () => {
  it("pairs both halves of a face-up designed link with ONE label and opposite directions", () => {
    const state = gameWithDesignedGate(false);
    const markers = subterraneanGateMarkers(adv(state));
    expect(markers, "both halves of the designed link are marked").toHaveLength(2);

    const [labelA, labelB] = markers.map((marker) => marker.label);
    expect(labelA, "both halves carry the SAME pairing label").toBe(labelB);
    expect(labelA).toBe("A");

    const down = markers.find((marker) => marker.direction === "down");
    const up = markers.find((marker) => marker.direction === "up");
    expect(down, "the Surface half is the path DOWN").toBeTruthy();
    expect(up, "the cavern half is the path UP").toBeTruthy();
    expect(down!.role).toBe("gate");
    expect(up!.role).toBe("entrance");
    expect(down!.carved && up!.carved, "a face-up designed link is carved at setup").toBe(true);

    // Each half points at the OTHER half's hex and at the other layer's tile.
    expect(down!.partnerSpaceId).toBe(up!.spaceId);
    expect(up!.partnerSpaceId).toBe(down!.spaceId);
    expect(down!.partnerTileId).toBe(down!.undergroundTileId);
    expect(up!.partnerTileId).toBe(up!.surfaceTileId);
    expect(down!.tooltip).toContain("path DOWN");
    expect(up!.tooltip).toContain("path UP");
    expect(down!.tooltip).toContain("Gate A");

    // The by-hex lookup the board renders through agrees with the list.
    const bySpace = subterraneanGateMarkersBySpace(adv(state));
    expect(bySpace.get(down!.spaceId)?.label).toBe("A");
    expect(bySpace.size).toBe(2);
  });

  it("CONTROL — a plain map with no gates derives nothing, and no adventure derives nothing", () => {
    const plain = createAdventureGameState({
      seed: "gate-visibility-plain",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    // The stock skirmish opening has no carved gate and no pinned gate plan.
    expect(subterraneanGateMarkers(adv(plain))).toEqual([]);
    expect(subterraneanGateMarkers(undefined)).toEqual([]);
  });

  it("never exposes a half on an unrevealed tile — a lone anchor names no partner hex", () => {
    const state = gameWithDesignedGate(false);
    const adventure = adv(state);
    const markers = subterraneanGateMarkers(adventure);
    const up = markers.find((marker) => marker.direction === "up")!;

    // Strip the cavern half (as it stands while that tile is still face down):
    // the remaining Surface anchor is still marked, but names NO partner hex.
    delete adventure.fields[up.spaceId];
    const lone = subterraneanGateMarkers(adventure);
    expect(lone, "the revealed Surface half stays visible").toHaveLength(1);
    expect(lone[0]!.direction).toBe("down");
    expect(lone[0]!.partnerSpaceId, "the hidden half's hex is NOT leaked").toBeUndefined();
    expect(lone[0]!.tooltip).toContain("still face down");
  });

  it("marks a PINNED but uncarved plan hex, and drops one whose tile is not materialized", () => {
    const state = createAdventureGameState({
      seed: "gate-visibility-plan",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    const adventure = adv(state);
    const plain = Object.values(adventure.fields)
      .filter((field) => field.location !== "subterranean_gate")
      .slice(0, 2);
    expect(plain).toHaveLength(2);
    adventure.gatePlans = [
      {
        surfaceTileId: "surface",
        undergroundTileId: "cavern",
        designed: true,
        gateHex: plain[0]!.spaceId,
        entranceHex: plain[1]!.spaceId
      }
    ];
    const marked = subterraneanGateMarkers(adventure);
    expect(marked).toHaveLength(2);
    expect(marked[0]!.label).toBe(marked[1]!.label);
    expect(marked.every((marker) => !marker.carved), "a pinned plan hex is not carved yet").toBe(true);
    expect(marked[0]!.tooltip).toContain("opens once this tile's gate is carved");

    // CONTROL: a plan hex with NO materialized field (its tile is still face
    // down) contributes nothing — the position stays secret.
    adventure.gatePlans[0]!.entranceHex = hexSpaceId({ row: 99, col: 99 });
    const halfMarked = subterraneanGateMarkers(adventure);
    expect(halfMarked).toHaveLength(1);
    expect(halfMarked[0]!.spaceId).toBe(plain[0]!.spaceId);
  });
});
