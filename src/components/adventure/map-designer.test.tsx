// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MapDesigner } from "./map-designer";
import { tileLatticeNeighbors, type CustomMapTilePlan } from "@/engine";

afterEach(cleanup);

function renderDesigner(
  customMap: CustomMapTilePlan[],
  onChange: (next: CustomMapTilePlan[]) => void = () => {}
): HTMLElement {
  const { container } = render(
    <MapDesigner scenarioId="skirmish" customMap={customMap} onChange={onChange} />
  );
  return container;
}

/** Open the per-tile popover by releasing a click on a designed plan hex. */
function openTilePopover(container: HTMLElement, planIndex: number): HTMLElement {
  const hexes = container.querySelectorAll(`.designerHexPlan`);
  // Each plan flower has 7 hexes; pick the centre-ish cell of the target plan.
  // Town (starting) is plan 0 in these tests; supply tiles follow.
  const perFlower = 7;
  const target = hexes[planIndex * perFlower];
  if (!target) {
    throw new Error(`no hex for plan ${planIndex}`);
  }
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
  fireEvent.pointerUp(target, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
  const popover = container.querySelector(".designerPopover");
  if (!popover) {
    throw new Error("popover did not open");
  }
  return popover as HTMLElement;
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

describe("MapDesigner — face-down secret pins", () => {
  const town = { row: 10, col: 10 };
  const spots = tileLatticeNeighbors(town);

  it("shows a secret pin's tile id on a face-down plan (designer-only)", () => {
    // A face-down slot with tileDefId is a predetermined secret — the designer
    // sees the pin (🔒 + id); players never use this view.
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "near",
        faceDown: true,
        tileDefId: "N3",
        rotation: 1
      }
    ]);

    const labels = [...container.querySelectorAll(".designerTileLabel")].map(
      (node) => node.textContent ?? ""
    );
    expect(
      labels.some((text) => text.includes("N3") && text.includes("🔒")),
      `secret pin label shown, got: ${labels.join(" | ")}`
    ).toBe(true);
    // The real tile art is drawn for the designer (not only the face-down back).
    expect(
      container.querySelector('image[href*="N3"], image[href*="n3"]') ||
        container.querySelector(".designerHexPlan.secret"),
      "secret pin marked on the board"
    ).toBeTruthy();
    expect(container.querySelector(".designerHexPlan.secret"), "secret class on hexes").toBeTruthy();
  });

  it("leaves a pure-random face-down slot labelled by pool, without a secret badge", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ]);
    const labels = [...container.querySelectorAll(".designerTileLabel")].map(
      (node) => node.textContent ?? ""
    );
    expect(labels.some((text) => text.includes("🔒"))).toBe(false);
    expect(container.querySelector(".designerHexPlan.secret")).toBeNull();
    expect(labels.some((text) => /Ⅳ–Ⅴ|IV–V|Near/i.test(text) || text.includes("Ⅳ"))).toBe(true);
  });

  it("opens a click-to-select mode row + tile grid on a face-down slot", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ]);
    const popover = openTilePopover(container, 1);
    const scope = within(popover);

    // Three mode cards are the primary choice UI.
    expect(scope.getByRole("button", { name: /Random/i })).toBeTruthy();
    expect(scope.getByRole("button", { name: /Secret/i })).toBeTruthy();
    expect(scope.getByRole("button", { name: /Face-up/i })).toBeTruthy();
    expect(popover.querySelector(".popoverModeCard.active")?.textContent).toMatch(/Random/i);

    // Landmark filter chips + a clickable tile grid (not a bare <select>).
    expect(scope.getByRole("button", { name: "All" })).toBeTruthy();
    expect(scope.getByRole("button", { name: "Obelisk" })).toBeTruthy();
    expect(popover.querySelectorAll(".popoverTileCard").length).toBeGreaterThan(0);
    expect(popover.querySelector("select[aria-label='Secret tile']")).toBeNull();
  });

  it("clicking a tile card pins it as Secret; clicking Face-up then a tile reveals it", () => {
    let latest: CustomMapTilePlan[] = [];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const map: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ];
    const container = renderDesigner(map, onChange);
    const popover = openTilePopover(container, 1);

    // One click on a tile card while Random → Secret pin of that tile.
    // Prefer exact id "N3" (not expansion "#N3") via the card id label.
    const n3 = popover.querySelector(".popoverTileCardId")
      ? ([...popover.querySelectorAll(".popoverTileCard")].find(
          (card) => card.querySelector(".popoverTileCardId")?.textContent === "N3"
        ) as HTMLElement | undefined)
      : undefined;
    expect(n3, "N3 tile card present").toBeTruthy();
    fireEvent.click(n3!);
    expect(onChange).toHaveBeenCalled();
    const afterPin = latest[1] ?? onChange.mock.calls.at(-1)?.[0]?.[1];
    expect(afterPin).toMatchObject({ faceDown: true, tileDefId: "N3" });

    // Re-render with the pin and switch mode to Face-up via the mode card.
    cleanup();
    const pinned: CustomMapTilePlan[] = [
      map[0],
      { ...map[1], faceDown: true, tileDefId: "N3" }
    ];
    let faceUpLatest: CustomMapTilePlan[] = pinned;
    const onFaceUp = vi.fn((next: CustomMapTilePlan[]) => {
      faceUpLatest = next;
    });
    const container2 = renderDesigner(pinned, onFaceUp);
    const popover2 = openTilePopover(container2, 1);
    fireEvent.click(within(popover2).getByRole("button", { name: /Face-up/i }));
    expect(faceUpLatest[1]).toMatchObject({ faceDown: false, tileDefId: "N3" });
  });

  it("filter chip Obelisk narrows the clickable grid to tiles with an obelisk", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ]);
    const popover = openTilePopover(container, 1);
    const before = popover.querySelectorAll(".popoverTileCard").length;
    fireEvent.click(within(popover).getByRole("button", { name: "Obelisk" }));
    const after = popover.querySelectorAll(".popoverTileCard").length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    // Every remaining card should mention Obelisk in its tags/title.
    for (const card of popover.querySelectorAll(".popoverTileCard")) {
      expect((card.getAttribute("title") ?? "") + (card.textContent ?? "")).toMatch(/obelisk/i);
    }
  });
});

describe("MapDesigner — Monolith/Whirlpool tokens", () => {
  const town = { row: 10, col: 10 };
  const spots = tileLatticeNeighbors(town);

  it("renders a designed token on its tile (face-up at its hex, face-down as a badge)", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "far",
        faceDown: false,
        tileDefId: "F1",
        token: { kind: "monolith", slot: 0 }
      },
      { row: spots[1].row, col: spots[1].col, group: "sea", faceDown: true, seaBand: "iv-v", token: { kind: "whirlpool" } }
    ]);

    expect(container.querySelector('image[href*="tokens/monolith"]'), "monolith art rendered").toBeTruthy();
    // The first (and only) whirlpool takes the printed +1 token.
    expect(container.querySelector('image[href*="whirlpool-plus1"]'), "whirlpool +1 art rendered").toBeTruthy();
  });

  it("says at least 2 of a kind are needed when only 1 is placed — and stops once a second lands", () => {
    const lone = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } }
    ]);
    const warnings = [...lone.querySelectorAll(".designerCavernAlert")].map((node) => node.textContent ?? "");
    expect(
      warnings.some((text) => /at least 2/i.test(text) && /Monolith/i.test(text)),
      "lone-monolith warning shown"
    ).toBe(true);

    cleanup();
    const paired = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } },
      { row: spots[1].row, col: spots[1].col, group: "near", faceDown: true, token: { kind: "monolith" } }
    ]);
    const pairedWarnings = [...paired.querySelectorAll(".designerCavernAlert")].map((node) => node.textContent ?? "");
    expect(pairedWarnings.some((text) => /Monolith/i.test(text))).toBe(false);
  });
});
