// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MapDesigner } from "./map-designer";
import { tileLatticeNeighbors, type CustomMapTilePlan } from "@/engine";

afterEach(cleanup);

function renderDesigner(customMap: CustomMapTilePlan[]): HTMLElement {
  const { container } = render(
    <MapDesigner scenarioId="skirmish" customMap={customMap} onChange={() => {}} />
  );
  return container;
}

describe("MapDesigner — Subterranean Gates", () => {
  it("draws a gate token + link between a Surface tile and an adjacent cavern", () => {
    const town = { row: 10, col: 10 };
    const cavern = tileLatticeNeighbors(town)[0];
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: cavern.row, col: cavern.col, group: "subterranean", faceDown: true, subBand: "iv-v" }
    ]);

    // Both halves of the Subterranean Gate Token are drawn.
    const surfaceHalf = container.querySelector('image[href*="subterranean-gate-surface"]');
    const entranceHalf = container.querySelector('image[href*="subterranean-gate-underground"]');
    expect(surfaceHalf, "surface gate half rendered").toBeTruthy();
    expect(entranceHalf, "underground entrance half rendered").toBeTruthy();
    // …joined by the gate link line.
    expect(container.querySelector(".designerGateLink"), "gate link line rendered").toBeTruthy();

    // The cavern is reachable, so NO unreachable warning anywhere.
    expect(container.querySelector(".designerCavernAlert")).toBeNull();
    expect(container.querySelector(".designerFlowerOutline.cavernUnreachable")).toBeNull();
  });

  it("warns (banner + red ring) when a cavern touches no Surface tile", () => {
    const town = { row: 10, col: 10 };
    // A cavern far from the town, touching nothing — no gate can form.
    const isolated = { row: town.row + 14, col: town.col + 9 };
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: isolated.row, col: isolated.col, group: "subterranean", faceDown: true, subBand: "iv-v" }
    ]);

    // No gate token at all…
    expect(container.querySelector('image[href*="subterranean-gate-surface"]')).toBeNull();
    // …and the unreachable warning is shown both as a banner and a red ring.
    const banner = container.querySelector(".designerCavernAlert");
    expect(banner, "unreachable banner shown").toBeTruthy();
    expect(banner!.textContent).toMatch(/no Subterranean Gate/i);
    expect(container.querySelector(".designerFlowerOutline.cavernUnreachable"), "red ring on the cavern").toBeTruthy();
  });

  it("clears the warning once the cavern is moved to touch the Surface tile", () => {
    const town = { row: 10, col: 10 };
    const touching = tileLatticeNeighbors(town)[0];
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: touching.row, col: touching.col, group: "subterranean", faceDown: true, subBand: "iv-v" }
    ]);
    expect(container.querySelector(".designerCavernAlert")).toBeNull();
    expect(container.querySelector('image[href*="subterranean-gate-surface"]')).toBeTruthy();
  });
});
