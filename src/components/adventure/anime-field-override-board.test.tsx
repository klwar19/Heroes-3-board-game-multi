// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import { instantiateTile } from "@/engine/adventure";
import { carveFieldOverride } from "@/engine/field-overrides";
import { fieldOverrideGlyph, getFieldOverrideDefinition, registerFieldOverrideDefinitions } from "@/data/map/field-overrides";
// Register the Wake of Gods package too so a WOG carve resolves on the board.
import "@/data/wog/field-overrides";
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

/**
 * Every WOG + anime Field Override hex must TELL the player what it does — via
 * the hover tooltip (name + summary) and a click-to-inspect float (art, name,
 * mod tag, summary, guard line), plus a corner glyph badge for kinds that carry
 * one. Data-driven from the registry, so future kinds are covered too.
 */
describe("Field Override hexes explain themselves (tooltip + inspect float + glyph badge)", () => {
  function titleFor(container: HTMLElement, spaceId: string): string {
    const poly = container.querySelector(`polygon[data-space-id="${spaceId}"]`);
    return poly?.querySelector("title")?.textContent ?? "";
  }

  it("ANIME: the hex tooltip includes the override's summary", () => {
    const { state, spaceId } = boardWithCarve("bi_canh");
    const summary = getFieldOverrideDefinition("bi_canh")!.summary;
    const container = renderBoard(state);
    expect(titleFor(container, spaceId)).toContain(summary);
  });

  it("WOG: the hex tooltip includes the override's summary and the guard level", () => {
    const { state, spaceId } = boardWithCarve("emerald_tower");
    const summary = getFieldOverrideDefinition("emerald_tower")!.summary;
    const container = renderBoard(state);
    const title = titleFor(container, spaceId);
    expect(title).toContain(summary);
    // emerald_tower carves a difficulty-3 guard → the guard clause shows too
    // (ROMAN uses the Unicode numeral Ⅲ, U+2162).
    expect(title).toContain("guard Ⅲ");
  });

  it("clicking an ANIME override hex opens the inspect float (name + mod tag + summary); clicking again closes it", () => {
    const { state, spaceId } = boardWithCarve("bi_canh");
    const def = getFieldOverrideDefinition("bi_canh")!;
    const container = renderBoard(state);
    const poly = container.querySelector(`polygon[data-space-id="${spaceId}"]`)!;

    fireEvent.click(poly);
    const float = container.querySelector(`[data-field-override="${def.locationId}"]`);
    expect(float, "the inspect float opened").toBeTruthy();
    expect(float!.querySelector(".fieldOverrideInspectName")?.textContent).toContain(def.name);
    expect(float!.querySelector(".fieldOverrideInspectTag")?.textContent).toContain("Anime");
    expect(float!.querySelector(".fieldOverrideInspectSummary")?.textContent).toBe(def.summary);

    // Second click on the same hex toggles the float closed.
    fireEvent.click(poly);
    expect(container.querySelector(`[data-field-override="${def.locationId}"]`)).toBeNull();
  });

  it("WOG: the inspect float shows the WOG tag, the summary, and a guard line", () => {
    const { state, spaceId } = boardWithCarve("emerald_tower");
    const def = getFieldOverrideDefinition("emerald_tower")!;
    const container = renderBoard(state);
    fireEvent.click(container.querySelector(`polygon[data-space-id="${spaceId}"]`)!);

    const float = container.querySelector(`[data-field-override="${def.locationId}"]`);
    expect(float, "the WOG inspect float opened").toBeTruthy();
    expect(float!.querySelector(".fieldOverrideInspectName")?.textContent).toContain("Emerald Tower");
    expect(float!.querySelector(".fieldOverrideInspectTag")?.textContent).toContain("WOG");
    expect(float!.querySelector(".fieldOverrideInspectSummary")?.textContent).toBe(def.summary);
    // A live guard (difficulty 3) → the "defeat the guard" line appears.
    expect(float!.querySelector(".designedGuardInspectUnits")?.textContent).toMatch(/defeat the guard/i);
  });

  it("shows the registry glyph as a corner badge for a kind that has one (song_bac_quan 🀄)", () => {
    const { state } = boardWithCarve("song_bac_quan");
    const glyph = getFieldOverrideDefinition("song_bac_quan")!.glyph!;
    expect(glyph, "song_bac_quan carries a glyph").toBeTruthy();
    const container = renderBoard(state);
    const badges = [...container.querySelectorAll(".fieldOverrideGlyphBadge text")].map((n) => n.textContent);
    expect(badges).toContain(glyph);
  });

  it("CONTROL: a kind with NO glyph shows no corner badge (art carries it)", () => {
    // bi_canh ships art and carries no glyph → no corner badge is drawn.
    expect(getFieldOverrideDefinition("bi_canh")!.glyph).toBeUndefined();
    const { state } = boardWithCarve("bi_canh");
    const container = renderBoard(state);
    expect(container.querySelector(".fieldOverrideGlyphBadge")).toBeNull();
  });

  it("CONTROL: a plain (non-override) map never shows an override float or glyph badge, and clicking a plain field opens no float", () => {
    let state = createAdventureGameState({ seed: "fo-plain-control", difficulty: "normal", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const container = renderBoard(state);
    expect(container.querySelector(".fieldOverrideGlyphBadge")).toBeNull();
    expect(container.querySelector(".fieldOverrideInspectFloat")).toBeNull();

    // Click any plain field hex — no override float should ever appear.
    const anyHex = container.querySelector("polygon[data-space-id]");
    if (anyHex) {
      fireEvent.click(anyHex);
    }
    expect(container.querySelector(".fieldOverrideInspectFloat")).toBeNull();
  });
});
