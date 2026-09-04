// @vitest-environment jsdom
/**
 * A designed Subterranean Gate is CARVED only once both its tiles are revealed,
 * so at game start it is invisible. The board marks every PLANNED (uncarved)
 * gate hex with a translucent gate token so designer-placed gates are visible
 * from the start — "the player knows where to find them". A hex already carved
 * as a real gate is skipped (the field loop draws that), and a map with no gate
 * plans shows nothing extra.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  legalGateHexPairs,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  type GameState
} from "@/engine";

afterEach(cleanup);

function board(state: GameState) {
  return render(
    <HexMapBoard
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={() => {}}
      placement={null}
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />
  );
}

describe("designed gates are visible on the map from the start", () => {
  it("marks each planned, uncarved gate hex — but skips a carved one and an empty plan set", () => {
    const state = createAdventureGameState({ seed: "gate-visible", difficulty: "normal", rollFirstPlayer: false });
    const adventure = state.adventure!;
    const plain = Object.values(adventure.fields).filter((field) => field.location !== "subterranean_gate").slice(0, 2);
    expect(plain.length).toBe(2);
    const [gateField, entranceField] = plain;
    adventure.gatePlans = [
      {
        surfaceTileId: "surface",
        undergroundTileId: "cavern",
        designed: true,
        gateHex: gateField!.spaceId,
        entranceHex: entranceField!.spaceId
      }
    ];

    // Both planned hexes are uncarved → two markers, drawn with the gate token art.
    const { container } = board(state);
    const markers = container.querySelectorAll(".gatePlanMarker");
    expect(markers).toHaveLength(2);
    expect(markers[0]!.querySelector("image")?.getAttribute("href")).toContain("gate");
    cleanup();

    // CONTROL A (skip carved): once a planned hex IS carved, the field loop draws
    // the real gate and the marker is skipped — only the still-uncarved half marks.
    adventure.fields[gateField!.spaceId]!.location = "subterranean_gate";
    adventure.fields[gateField!.spaceId]!.gateToTileId = "cavern";
    expect(board(state).container.querySelectorAll(".gatePlanMarker")).toHaveLength(1);
    cleanup();

    // CONTROL B (no plans): a plain map shows nothing extra.
    adventure.gatePlans = [];
    expect(board(state).container.querySelectorAll(".gatePlanMarker")).toHaveLength(0);
  });
});

/**
 * Pairing badges: BOTH halves of a Subterranean Gate wear the same letter and a
 * direction arrow, always — not only while a hero is within reach — so a player
 * reads the crossings off the map like the coloured Teleport-Gate networks.
 * jsdom cannot compute CSS, so this pins the DOM contract only (element,
 * label text, tooltip); the look is a real-browser concern with no e2e spec.
 */
describe("Subterranean Gate pairing badges on the board", () => {
  const TOWN = { row: 24, col: 12 };
  const FAR = tileLatticeNeighbors(TOWN)[0];

  function cavernNextToFar() {
    const scan = [] as { row: number; col: number }[];
    for (let dRow = -4; dRow <= 4; dRow += 1) {
      for (let dCol = -4; dCol <= 4; dCol += 1) {
        const cand = { row: FAR.row + dRow, col: FAR.col + dCol };
        if (tileFootprintsTouch(FAR, cand) && !tileCentersAdjacent(FAR, cand)) scan.push(cand);
      }
    }
    for (const cand of [...tileLatticeNeighbors(FAR), ...scan]) {
      if (cand.row === TOWN.row && cand.col === TOWN.col) continue;
      if (tileCentersOverlap(cand, TOWN) || tileCentersOverlap(cand, FAR) || tileFootprintsTouch(cand, TOWN)) continue;
      if (legalGateHexPairs(FAR, cand).length >= 1) return cand;
    }
    throw new Error("no suitable cavern next to FAR");
  }

  it("draws ↧A / ↥A on the two halves with direction tooltips — and nothing on a gateless map", () => {
    const cavern = cavernNextToFar();
    const state = createAdventureGameState({
      seed: "gate-badge",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [
        { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
        { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
        {
          row: cavern.row,
          col: cavern.col,
          group: "subterranean",
          faceDown: false,
          tileDefId: "U1",
          gateLinks: [{ surface: { row: FAR.row, col: FAR.col } }]
        }
      ],
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });

    const { container } = board(state);
    const badges = [...container.querySelectorAll(".hexGateLink")];
    expect(badges, "one badge per known gate half").toHaveLength(2);
    // The nested <title> is part of textContent; the badge glyph is the LAST child node.
    const texts = badges.map((badge) => badge.lastChild?.textContent ?? "").sort();
    expect(texts, "same pairing letter, opposite arrows").toEqual(["↥A", "↧A"]);
    const tooltips = badges.map((badge) => badge.querySelector("title")?.textContent ?? "");
    expect(tooltips.some((tip) => tip.includes("path DOWN"))).toBe(true);
    expect(tooltips.some((tip) => tip.includes("path UP"))).toBe(true);
    expect(tooltips.every((tip) => tip.includes("Gate A"))).toBe(true);
    cleanup();

    // CONTROL: the stock skirmish map carves no gate, so no hex wears a badge.
    const plain = createAdventureGameState({ seed: "gate-badge-plain", difficulty: "normal", rollFirstPlayer: false });
    expect(board(plain).container.querySelectorAll(".hexGateLink")).toHaveLength(0);
  });
});
