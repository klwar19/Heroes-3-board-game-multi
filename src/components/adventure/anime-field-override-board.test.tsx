// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import { carveFieldOverride } from "@/engine/field-overrides";
import { fieldOverrideGlyph } from "@/data/map/field-overrides";
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
 * hex art yet (wave-2 kinds ship art-less with a `glyph` fallback). In icon
 * mode the existing hexGlyph path draws that glyph — so an art-less carve is a
 * visible hex, never a blank field. Art-backed kinds (wave 1) draw their image
 * instead (art wins), which is the CONTROL.
 */

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
  it("draws the Gambling Den's glyph on the map when it has no art yet", () => {
    const { state } = boardWithCarve("song_bac_quan");
    const expectedGlyph = fieldOverrideGlyph("anime.song_bac_quan");
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
