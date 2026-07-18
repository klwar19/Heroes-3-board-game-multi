// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import { carveFieldOverride } from "@/engine/field-overrides";
import { fieldOverrideGlyph, registerFieldOverrideDefinitions } from "@/data/map/field-overrides";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  getTileFootprintSpaceIds,
  type GameState,
  type MapTileState
} from "@/engine";

afterEach(cleanup);

/**
 * The live map board must show SOMETHING for a Field Override kind that has no
 * hex art. Every SHIPPED kind now has art (2026-07), so the art-less fallback
 * path is pinned via a TEST-ONLY registered kind: in icon mode the hexGlyph
 * path draws its `glyph`, so an art-less carve is a visible hex, never a blank
 * field. Art-backed kinds draw their image instead (art wins) — the CONTROL.
 */
registerFieldOverrideDefinitions({
  test_glyph_kind: {
    id: "test_glyph_kind",
    locationId: "anime.test_glyph_kind",
    name: "Test Glyph Kind",
    package: "anime-xianxia",
    tileGroups: ["far"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Test-only art-less kind pinning the glyph fallback.",
    glyph: "🧪"
  }
});

function adv(state: GameState) {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function boardWithCarve(kind: string): { state: GameState; spaceId: string; tile: MapTileState } {
  let state = createAdventureGameState({ seed: `fo-board-${kind}`, difficulty: "normal", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
  }
  const tile = instantiateTile(adv(state), "F3", { row: 24, col: 12 }, 0, false);
  const spaceId = getTileFootprintSpaceIds(tile)[1];
  const field = adv(state).fields[spaceId]!;
  field.location = "empty_field";
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  carveFieldOverride(adv(state), spaceId, kind);
  return { state, spaceId, tile };
}

function renderBoard(state: GameState): HTMLElement {
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

/** Turn off the printed-art layer so icon-mode glyphs render. */
function toggleArtOff(container: HTMLElement): void {
  const artButton = container.querySelector('button[title^="Toggle the printed tile art"]');
  if (!artButton) {
    throw new Error("art toggle button not found");
  }
  fireEvent.click(artButton);
}

describe("live map board — art-less Field Override kinds fall back to a glyph", () => {
  it("draws an art-less kind's glyph on the map (test-only registered kind)", () => {
    const { state } = boardWithCarve("test_glyph_kind");
    const expectedGlyph = fieldOverrideGlyph("anime.test_glyph_kind");
    expect(expectedGlyph, "the art-less kind exposes a glyph").toBeTruthy();

    const container = renderBoard(state);
    toggleArtOff(container);

    const glyphTexts = [...container.querySelectorAll("text.hexGlyph")].map((n) => n.textContent);
    expect(glyphTexts).toContain(expectedGlyph);
  });

  it("CONTROL: a wave-1 kind WITH art draws its image, not a glyph", () => {
    const { state, spaceId } = boardWithCarve("kiem_trung");
    // Art wins → no glyph fallback for this kind.
    expect(fieldOverrideGlyph("anime.kiem_trung")).toBeUndefined();

    const container = renderBoard(state);
    // The location token image for the carved hex uses the kiem_trung art.
    const token = container.querySelector(`image.locationToken[data-space-id="${spaceId}"]`);
    expect(token, "the FO art image is drawn").toBeTruthy();
    expect(token!.getAttribute("href")).toContain("kiem_trung.webp");
  });
});
