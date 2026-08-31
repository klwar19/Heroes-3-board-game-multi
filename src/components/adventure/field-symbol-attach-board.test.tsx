// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameState
} from "@/engine";
import { allTileDefinitions } from "@/data/map/tiles";

afterEach(cleanup);

/**
 * `assets.attachFieldSymbols` draws the shared HoMM3 field-symbol modules over an
 * ATMOSPHERE-ONLY tile image (art with no baked resource / treasure / mine icons).
 * D-S1 (Heavenly Demon seat) is the only tile that opts in, so this is the ONLY
 * render coverage that path has — a data-flag test alone would pass while the
 * icons never appeared, which is exactly the bug the flag was added to fix.
 */
function boardWithTile(tileDefId: string, seed: string): HTMLElement {
  let state: GameState = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  instantiateTile(state.adventure!, tileDefId, { row: 26, col: 13 }, 0, false);
  const { container } = render(
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
  return container;
}

describe("attachFieldSymbols draws the shared symbol modules on an atmosphere-only tile", () => {
  it("D-S1 shows its resource, treasure and mine symbols (with the mine's ↻2)", () => {
    expect(allTileDefinitions["D-S1"].assets?.attachFieldSymbols).toBe(true);
    const container = boardWithTile("D-S1", "d-s1-symbols");

    const kinds = [...container.querySelectorAll("image.fieldSymbolModule")].map((node) =>
      node.getAttribute("data-symbol-kind")
    );
    expect(kinds.sort()).toEqual(["mine", "resource", "treasure"]);
    // Every module resolves to a real asset URL, not an empty href.
    for (const node of container.querySelectorAll("image.fieldSymbolModule")) {
      expect(node.getAttribute("href")).toMatch(/\.(webp|png|svg)$/);
    }
    // The mine's printed production count rides along with its module.
    expect(
      [...container.querySelectorAll("text.hexProduction")].some((node) =>
        node.textContent?.includes("↻2")
      )
    ).toBe(true);
  });

  it("CONTROL: A-S1 bakes its icons into the art, so it attaches NO module", () => {
    expect(allTileDefinitions["A-S1"].assets?.attachFieldSymbols).toBeFalsy();
    const container = boardWithTile("A-S1", "a-s1-symbols");
    expect(container.querySelectorAll("image.fieldSymbolModule")).toHaveLength(0);
  });

  it("IM-S1 uses Castle S3's field order and attaches exactly its three printed modules", () => {
    const tile = allTileDefinitions["IM-S1"];
    expect(tile.fields.map((field) => field.location)).toEqual([
      "town",
      "empty_field",
      "resource_symbol",
      "empty_field",
      "mine",
      "treasure_symbol",
      "blocked_field"
    ]);
    expect(tile.outerImpassable).toEqual(allTileDefinitions.S3.outerImpassable);
    const container = boardWithTile("IM-S1", "imperium-s3-format");
    const kinds = [...container.querySelectorAll("image.fieldSymbolModule")].map((node) => node.getAttribute("data-symbol-kind"));
    expect(kinds.sort()).toEqual(["mine", "resource", "treasure"]);
    expect([...container.querySelectorAll("text.hexProduction")].some((node) => node.textContent?.includes("↻2"))).toBe(true);
  });
});
