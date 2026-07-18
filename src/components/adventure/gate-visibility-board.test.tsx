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
import { createAdventureGameState, getLegalActions, getPlayerView, type GameState } from "@/engine";

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
