// @vitest-environment jsdom
/**
 * The read-only map-shape preview: a scenario sheet / designed map's tile
 * flowers as one SVG. These pin the DERIVATION (every layout band becomes a
 * preview tile of the right group, seats numbered in order) and that the
 * rendered SVG really draws one band-coloured outline per tile — the designer
 * and this preview share `flowerOutline` / `GROUP_COLORS`, so a regression in
 * either surfaces here.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { scenarioDefinitions, type CustomMapTilePlan } from "@/engine";
import {
  designedTilesToPreview,
  flowerOutline,
  GROUP_COLORS,
  MapShapePreview,
  scenarioToTilePlans
} from "./map-shape-preview";

afterEach(cleanup);

describe("scenarioToTilePlans", () => {
  it("flattens every layout band, numbering the seats in order", () => {
    for (const scenario of Object.values(scenarioDefinitions)) {
      const layout = scenario.layout;
      const tiles = scenarioToTilePlans(scenario);
      const counts = (group: string) => tiles.filter((tile) => tile.group === group).length;

      expect(counts("starting"), `${scenario.id} starts`).toBe(layout.starts.length);
      expect(counts("far"), `${scenario.id} far`).toBe((layout.far ?? []).length);
      expect(counts("near"), `${scenario.id} near`).toBe(layout.near.length);
      expect(counts("center"), `${scenario.id} center`).toBe(layout.center.length);
      expect(counts("sea"), `${scenario.id} sea`).toBe((layout.sea ?? []).length);
      expect(counts("subterranean"), `${scenario.id} cavern`).toBe((layout.subterranean ?? []).length);

      // Seat numbers run 1..N in layout order; nothing else is numbered.
      expect(tiles.filter((tile) => tile.seat).map((tile) => tile.seat)).toEqual(
        layout.starts.map((_, index) => index + 1)
      );
      // Cavern tiles are marked as the underground LAYER (dashed outline).
      expect(tiles.filter((tile) => tile.underground).length).toBe((layout.subterranean ?? []).length);
    }
  });
});

describe("designedTilesToPreview", () => {
  it("numbers starting tiles in array order and marks the underground layer", () => {
    const plans: CustomMapTilePlan[] = [
      { row: 0, col: 0, group: "starting", faceDown: false },
      { row: 4, col: 2, group: "near", faceDown: true, underground: true },
      { row: 8, col: 4, group: "starting", faceDown: false },
      { row: 6, col: 6, group: "subterranean", faceDown: true }
    ];
    const tiles = designedTilesToPreview(plans);
    expect(tiles.map((tile) => tile.seat)).toEqual([1, undefined, 2, undefined]);
    // A FLAGGED near tile counts as underground, as does a printed cavern.
    expect(tiles.map((tile) => tile.underground)).toEqual([false, true, false, true]);
  });
});

describe("MapShapePreview", () => {
  it("draws one band-coloured flower outline per tile, plus seat numbers", () => {
    const scenario = scenarioDefinitions["land-2p"];
    const tiles = scenarioToTilePlans(scenario);
    const { container } = render(<MapShapePreview tiles={tiles} />);

    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("viewBox")).toBeTruthy();
    const paths = Array.from(svg.querySelectorAll("path"));
    expect(paths).toHaveLength(tiles.length);
    // Each outline is stroked with its band colour and matches flowerOutline.
    for (const [index, tile] of tiles.entries()) {
      expect(paths[index].getAttribute("stroke")).toBe(GROUP_COLORS[tile.group]);
      expect(paths[index].getAttribute("d")).toBe(flowerOutline(tile, 10));
    }
    // 7 hexes per flower are filled.
    expect(svg.querySelectorAll("polygon")).toHaveLength(tiles.length * 7);
    expect(Array.from(svg.querySelectorAll("text")).map((node) => node.textContent)).toEqual(["1", "2"]);
  });

  it("dashes an underground tile's outline and renders nothing for an empty map", () => {
    const { container } = render(
      <MapShapePreview tiles={[{ row: 0, col: 0, group: "near", underground: true }]} />
    );
    expect((container.querySelector("path") as SVGElement).getAttribute("stroke-dasharray")).toBe("4 3");
    cleanup();

    const empty = render(<MapShapePreview tiles={[]} />);
    expect(empty.container.querySelector("svg")).toBeNull();
  });
});
