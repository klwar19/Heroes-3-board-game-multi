// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MapDesigner, planBackArt, planBackLabel } from "./map-designer";
import { nearestGateHexPair, type GateHexPair } from "./gate-drag";
import {
  hexSpaceId,
  hexToPixel,
  legalGateHexPairs,
  planSubterraneanGates,
  tileLatticeNeighbors,
  type CustomMapObject,
  type CustomMapTilePlan
} from "@/engine";

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

describe("MapDesigner — center Ⅶ-field designation", () => {
  it("the center-tile popover Ⅶ picker writes the plan's viiField", () => {
    const onChange = vi.fn();
    const container = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 9, col: 4, group: "center", faceDown: true }
      ],
      onChange
    );
    const popover = openTilePopover(container, 1); // plan 1 = the center tile
    const picker = popover.querySelector(".popoverViiField");
    expect(picker, "Ⅶ-field picker shown for a center tile").toBeTruthy();

    fireEvent.click(within(picker as HTMLElement).getByRole("button", { name: "Grail" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ group: "center", viiField: "grail" })])
    );
  });

  it("does NOT show the Ⅶ picker for a non-center tile", () => {
    const container = renderDesigner([
      { row: 8, col: 2, group: "starting", faceDown: false },
      { row: 9, col: 4, group: "far", faceDown: true }
    ]);
    const popover = openTilePopover(container, 1);
    expect(popover.querySelector(".popoverViiField")).toBeNull();
  });

  it("stamps a badge on a center slot with a Ⅶ designation", () => {
    const container = renderDesigner([
      { row: 8, col: 2, group: "starting", faceDown: false },
      { row: 9, col: 4, group: "center", faceDown: true, viiField: "dragon_utopia" }
    ]);
    const badge = container.querySelector(".designerViiBadge");
    expect(badge, "Ⅶ badge rendered").toBeTruthy();
    expect(badge!.textContent).toMatch(/Utopia/);
  });

  it("renders a win-condition conflict warning when the design fights the victory mode", () => {
    // Grail victory + a centre slot designated away from a Grail, no Near/Far
    // overflow → no Grail dig capacity → the same message the start will BLOCK.
    const { container } = render(
      <MapDesigner
        scenarioId="skirmish"
        victoryMode="grail"
        customMap={[
          { row: 8, col: 2, group: "starting", faceDown: false },
          { row: 10, col: 7, group: "starting", faceDown: false },
          { row: 9, col: 4, group: "center", faceDown: false, tileDefId: "C1", viiField: "town" }
        ]}
        onChange={() => {}}
      />
    );
    const conflict = container.querySelector(".designerVictoryConflict");
    expect(conflict, "victory conflict warning shown").toBeTruthy();
    expect(conflict!.textContent).toMatch(/Grail dig sites/i);

    // CONTROL: the same map under Conquest raises no conflict.
    cleanup();
    const { container: ok } = render(
      <MapDesigner
        scenarioId="skirmish"
        victoryMode="conquest"
        customMap={[
          { row: 8, col: 2, group: "starting", faceDown: false },
          { row: 10, col: 7, group: "starting", faceDown: false },
          { row: 9, col: 4, group: "center", faceDown: false, tileDefId: "C1", viiField: "town" }
        ]}
        onChange={() => {}}
      />
    );
    expect(ok.querySelector(".designerVictoryConflict")).toBeNull();
  });
});

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

describe("MapDesigner — zoom toolbar (map-style)", () => {
  it("exposes zoom in/out, wheel-lock and reset with board-game icons + a scale readout", () => {
    const container = renderDesigner([]);
    const toolbar = container.querySelector('.mapToolbar[aria-label="Designer view controls"]');
    expect(toolbar, "designer toolbar present").toBeTruthy();
    const buttons = toolbar!.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    // Ornate medallions / glyphs — not bare lucide SVGs as the only affordance.
    expect(toolbar!.querySelectorAll("img.designerToolIcon").length).toBeGreaterThanOrEqual(4);
    expect(toolbar!.querySelector(".designerZoomReadout")?.textContent).toMatch(/%/);
    // Wheel-zoom toggle is pressed by default (designer board is the main surface).
    const wheelBtn = [...buttons].find((btn) => /wheel zoom/i.test(btn.getAttribute("title") ?? ""));
    expect(wheelBtn, "wheel zoom toggle").toBeTruthy();
    expect(wheelBtn!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(wheelBtn!);
    expect(wheelBtn!.getAttribute("aria-pressed")).toBe("false");
  });

  it("zoom-in button raises the scale readout above 100%", () => {
    const container = renderDesigner([]);
    const toolbar = container.querySelector('.mapToolbar[aria-label="Designer view controls"]')!;
    const zoomIn = [...toolbar.querySelectorAll("button")].find((btn) => btn.getAttribute("title") === "Zoom in");
    expect(zoomIn).toBeTruthy();
    fireEvent.click(zoomIn!);
    const readout = toolbar.querySelector(".designerZoomReadout")?.textContent ?? "";
    expect(Number.parseInt(readout, 10)).toBeGreaterThan(100);
  });
});

describe("MapDesigner — face-down secret pins", () => {
  const town = { row: 10, col: 10 };
  const spots = tileLatticeNeighbors(town);

  it("shows an exact secret pin's tile id on a face-down plan (designer-only)", () => {
    // A face-down slot with tileDefId is a predetermined exact secret — the
    // designer sees the pin (🔒 + id) on the printed BACK (same art players see).
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
    // Face-down always uses the printed near back, not the face-up tile scan.
    expect(container.querySelector('image[href*="back-near"]'), "near back art").toBeTruthy();
    expect(container.querySelector(".designerHexPlan.secret"), "secret class on hexes").toBeTruthy();
  });

  it("shows a feature secret as 🔒 + landmark on the board (not a specific tile id)", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "near",
        faceDown: true,
        secretFeature: "gold_mine"
      }
    ]);
    const labels = [...container.querySelectorAll(".designerTileLabel")].map(
      (node) => node.textContent ?? ""
    );
    expect(
      labels.some((text) => text.includes("🔒") && /gold/i.test(text)),
      `feature secret label shown, got: ${labels.join(" | ")}`
    ).toBe(true);
    expect(container.querySelector(".designerHexPlan.secret"), "secret class").toBeTruthy();
    expect(container.querySelector(".designerHexPlan.featureSecret"), "feature secret class").toBeTruthy();
    // Feature secrets keep the face-down back — no specific tile art yet.
    expect(container.querySelector('image[href*="back-near"]'), "near back art").toBeTruthy();
  });

  it("draws pure-random face-down slots with the printed back only — no II–III text overlay", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ]);
    const labels = [...container.querySelectorAll(".designerTileLabel")].map(
      (node) => node.textContent ?? ""
    );
    expect(labels.some((text) => text.includes("🔒"))).toBe(false);
    expect(container.querySelector(".designerHexPlan.secret")).toBeNull();
    // Numeral lives ON the printed back graphic — no redundant text box.
    expect(labels.some((text) => /Ⅳ–Ⅴ|II–III|Ⅱ–Ⅲ|Near|Sea|Underground/i.test(text))).toBe(false);
    expect(container.querySelector('image[href*="back-near"]'), "near back art on board").toBeTruthy();
  });

  it("assigns the real Ⅵ–Ⅶ sea and underground backs (not the Ⅳ–Ⅴ art)", () => {
    const seaSpot = spots[0];
    const subSpot = spots[1] ?? tileLatticeNeighbors(town)[1];
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: seaSpot.row,
        col: seaSpot.col,
        group: "sea",
        faceDown: true,
        seaBand: "vi-vii"
      },
      {
        row: subSpot.row,
        col: subSpot.col,
        group: "subterranean",
        faceDown: true,
        subBand: "vi-vii"
      }
    ]);
    expect(
      container.querySelector('image[href*="back-sea-vi-vii"]'),
      "sea Ⅵ–Ⅶ printed back"
    ).toBeTruthy();
    expect(
      container.querySelector('image[href*="back-subterranean-vi-vii"]'),
      "underground Ⅵ–Ⅶ printed back"
    ).toBeTruthy();
    // CONTROL: the weaker band backs must not be used for these Ⅵ–Ⅶ plans.
    // (There is still a starting back, so we only assert the VI-VII keys exist.)
    expect(planBackArt({ group: "sea", seaBand: "vi-vii" })).toContain("back-sea-vi-vii");
    expect(planBackArt({ group: "subterranean", subBand: "vi-vii" })).toContain(
      "back-subterranean-vi-vii"
    );
    expect(planBackArt({ group: "sea", seaBand: "iv-v" })).toContain("back-sea.webp");
    expect(planBackLabel({ group: "center" })).toBe("Ⅵ–Ⅶ");
  });

  it("palette thumbs use band-correct backs for every supply type", () => {
    const container = renderDesigner([]);
    const thumbs = [...container.querySelectorAll(".paletteThumb")].map((node) =>
      (node as HTMLElement).style.backgroundImage
    );
    // Eight palette entries: Town, Far, Near, Center, Sea×2, Underground×2.
    expect(thumbs.length).toBe(8);
    expect(thumbs.some((bg) => bg.includes("back-starting"))).toBe(true);
    expect(thumbs.some((bg) => bg.includes("back-far"))).toBe(true);
    expect(thumbs.some((bg) => bg.includes("back-near"))).toBe(true);
    expect(thumbs.some((bg) => bg.includes("back-center"))).toBe(true);
    expect(thumbs.some((bg) => bg.includes("back-sea-vi-vii"))).toBe(true);
    expect(thumbs.some((bg) => bg.includes("back-subterranean-vi-vii"))).toBe(true);
    // Sea/underground Ⅳ–Ⅴ use the un-suffixed backs (not the vi-vii ones only).
    expect(thumbs.some((bg) => /back-sea\.webp|back-sea"/i.test(bg) || bg.includes("back-sea.webp"))).toBe(
      true
    );
    expect(
      thumbs.some(
        (bg) =>
          bg.includes("back-subterranean.webp") ||
          (bg.includes("back-subterranean") && !bg.includes("vi-vii"))
      )
    ).toBe(true);
  });

  it("opens mode cards; Secret mode shows landmark feature cards", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);
    const scope = within(popover);

    // Three mode cards are the primary choice UI.
    expect(scope.getByRole("button", { name: /Random/i })).toBeTruthy();
    expect(scope.getByRole("button", { name: /Secret/i })).toBeTruthy();
    expect(scope.getByRole("button", { name: /Face-up/i })).toBeTruthy();
    expect(popover.querySelector(".popoverModeCard.active")?.textContent).toMatch(/Random/i);

    // Switch to Secret → mode handler sets a feature; re-render to see cards.
    fireEvent.click(scope.getByRole("button", { name: /Secret/i }));
    expect(latest[1]?.secretFeature, "Secret mode sets a default landmark").toBeTruthy();

    cleanup();
    const secretMap: CustomMapTilePlan[] = [
      latest[0],
      { ...latest[1], faceDown: true, secretFeature: latest[1].secretFeature }
    ];
    const container2 = renderDesigner(secretMap);
    const popover2 = openTilePopover(container2, 1);
    const featureCards = popover2.querySelectorAll(".popoverFeatureCard");
    expect(featureCards.length).toBeGreaterThan(0);
    expect(
      [...featureCards].some((card) => /Gold mine/i.test(card.textContent ?? "")),
      "Gold mine feature card listed"
    ).toBe(true);
    expect(popover2.querySelector(".popoverFeatureCard.selected")).toBeTruthy();
  });

  it("secret landmark cards render board-game icon art (not emoji-only)", () => {
    const map: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "near",
        faceDown: true,
        secretFeature: "gold_mine"
      }
    ];
    const container = renderDesigner(map);
    const popover = openTilePopover(container, 1);
    const featureGlyphs = popover.querySelectorAll(".popoverFeatureGlyph");
    expect(featureGlyphs.length, "landmark chips show art").toBeGreaterThan(0);
    for (const img of featureGlyphs) {
      const src = (img as HTMLImageElement).getAttribute("src") ?? "";
      expect(src, "feature art path").toMatch(/\/assets\//);
    }
    // Mode cards use Homm3BG glyphs too.
    expect(popover.querySelectorAll(".popoverModeGlyph").length).toBe(3);
  });

  it("clicking Secret then a landmark stores secretFeature (not a specific tile)", () => {
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

    fireEvent.click(within(popover).getByRole("button", { name: /Secret/i }));
    // setSelectedSlotMode already sets a default feature; re-render if needed.
    const afterMode = latest[1] ?? onChange.mock.calls.at(-1)?.[0]?.[1];
    expect(afterMode?.faceDown).toBe(true);
    expect(afterMode?.secretFeature, "default feature set on Secret mode").toBeTruthy();
    expect(afterMode?.tileDefId).toBeUndefined();

    // Explicitly pick Obelisk if available (re-open with current state).
    cleanup();
    const withFeature: CustomMapTilePlan[] = [
      map[0],
      { ...map[1], faceDown: true, secretFeature: afterMode!.secretFeature }
    ];
    let featureLatest: CustomMapTilePlan[] = withFeature;
    const onFeature = vi.fn((next: CustomMapTilePlan[]) => {
      featureLatest = next;
    });
    const container2 = renderDesigner(withFeature, onFeature);
    const popover2 = openTilePopover(container2, 1);
    const obelisk = [...popover2.querySelectorAll(".popoverFeatureCard")].find((card) =>
      /obelisk/i.test(card.textContent ?? "")
    ) as HTMLElement | undefined;
    expect(obelisk, "Obelisk feature card present for near pool").toBeTruthy();
    fireEvent.click(obelisk!);
    expect(featureLatest[1]?.faceDown).toBe(true);
    expect(featureLatest[1]?.secretFeature).toBe("obelisk");
    expect(featureLatest[1]?.tileDefId).toBeUndefined();
  });

  it("clicking an exact tile under Secret pins tileDefId (advanced) and clears feature", () => {
    let latest: CustomMapTilePlan[] = [];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const map: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "near",
        faceDown: true,
        secretFeature: "gold_mine"
      }
    ];
    const container = renderDesigner(map, onChange);
    const popover = openTilePopover(container, 1);

    const n3 = [...popover.querySelectorAll(".popoverTileCard")].find(
      (card) => card.querySelector(".popoverTileCardId")?.textContent === "N3"
    ) as HTMLElement | undefined;
    expect(n3, "N3 tile card present").toBeTruthy();
    fireEvent.click(n3!);
    expect(onChange).toHaveBeenCalled();
    const afterPin = latest[1] ?? onChange.mock.calls.at(-1)?.[0]?.[1];
    expect(afterPin).toMatchObject({ faceDown: true, tileDefId: "N3" });
    expect(afterPin.secretFeature).toBeUndefined();
  });

  it("clicking Face-up then a tile reveals that exact tile", () => {
    let faceUpLatest: CustomMapTilePlan[] = [];
    const onFaceUp = vi.fn((next: CustomMapTilePlan[]) => {
      faceUpLatest = next;
    });
    const pinned: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "near",
        faceDown: true,
        secretFeature: "gold_mine"
      }
    ];
    const container = renderDesigner(pinned, onFaceUp);
    const popover = openTilePopover(container, 1);
    fireEvent.click(within(popover).getByRole("button", { name: /Face-up/i }));
    // Face-up mode needs a concrete tile — falls back to a free pickable id.
    expect(faceUpLatest[1]?.faceDown).toBe(false);
    expect(faceUpLatest[1]?.tileDefId).toBeTruthy();
    expect(faceUpLatest[1]?.secretFeature).toBeUndefined();
  });

  it("filter chip Obelisk narrows the exact-tile grid to tiles with an obelisk", () => {
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

describe("MapDesigner — designer-chosen gate links", () => {
  const town = { row: 10, col: 10 };
  const cavern = tileLatticeNeighbors(town)[0];

  it("links the cavern to a touching Surface tile via the popover (onChange carries gateLinks)", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: cavern.row, col: cavern.col, group: "subterranean", faceDown: true, subBand: "iv-v" }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);
    const toggle = popover.querySelector(".popoverGateLinkToggle");
    expect(toggle, "gate-link toggle listed for a touching cavern").toBeTruthy();

    fireEvent.click(toggle!);
    expect(onChange).toHaveBeenCalled();
    // The cavern plan now carries a designer link to the touching town tile.
    expect(latest[1].gateLinks).toEqual([{ surface: { row: town.row, col: town.col } }]);
  });

  it("adds a yellow border on a direction chip (onChange carries extraBorders), draws it, then removes it", () => {
    const town = { row: 10, col: 10 };
    const far = tileLatticeNeighbors(town)[1];
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    let container = renderDesigner(latest, onChange);
    // No border drawn yet.
    expect(container.querySelector(".designerBorderLine")).toBeNull();

    const popover = openTilePopover(container, 1);
    const chip = popover.querySelector('.popoverBorderChip[data-direction="1"]'); // E edge
    expect(chip, "yellow-border direction chip present").toBeTruthy();
    fireEvent.click(chip!);
    expect(onChange).toHaveBeenCalled();
    // The far plan now carries the absolute direction 1 (E).
    expect(latest[1].extraBorders).toEqual([1]);

    // Re-render with the updated plan: the preview now draws the designed border
    // (a full three-edge arc) and the chip reads pressed.
    cleanup();
    container = renderDesigner(latest, onChange);
    expect(container.querySelectorAll(".designerBorderLine").length).toBe(3);

    // Toggling the same chip off round-trips back to no extraBorders.
    const popover2 = openTilePopover(container, 1);
    const chipOn = popover2.querySelector('.popoverBorderChip[data-direction="1"]');
    expect(chipOn!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chipOn!);
    expect(latest[1].extraBorders).toBeUndefined();
  });

  it("un-links on a second toggle (round-trips back to no gateLinks)", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: true,
        subBand: "iv-v",
        gateLinks: [{ surface: { row: town.row, col: town.col } }]
      }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);
    fireEvent.click(popover.querySelector(".popoverGateLinkToggle")!);
    expect(latest[1].gateLinks).toBeUndefined();
  });

  it("slides the gate to the next legal boundary pair with the ↻ cycle button", () => {
    const pairs = legalGateHexPairs(town, cavern);
    expect(pairs.length, "the interlocking pair has ≥2 legal boundary positions").toBeGreaterThanOrEqual(2);
    const [defaultGate] = planSubterraneanGates(
      [
        { row: town.row, col: town.col, group: "starting" },
        { row: cavern.row, col: cavern.col, group: "subterranean" }
      ],
      []
    );
    const defaultIndex = pairs.findIndex(
      (pair) =>
        hexSpaceId(pair.gateHex) === hexSpaceId(defaultGate.gateHex) &&
        hexSpaceId(pair.entranceHex) === hexSpaceId(defaultGate.entranceHex)
    );
    const expectedNext = pairs[(defaultIndex + 1) % pairs.length];

    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: true,
        subBand: "iv-v",
        gateLinks: [{ surface: { row: town.row, col: town.col } }] // linked, unpinned
      }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);
    const cycle = popover.querySelector(".popoverGateLinkCycle");
    expect(cycle, "cycle button present for a linked cavern").toBeTruthy();

    fireEvent.click(cycle!);
    // The link is now pinned to the pair AFTER the automatic nearest default.
    expect(latest[1].gateLinks![0]).toEqual({
      surface: { row: town.row, col: town.col },
      gateHex: hexSpaceId(expectedNext.gateHex),
      entranceHex: hexSpaceId(expectedNext.entranceHex)
    });
    // …which is a genuinely DIFFERENT position from the default (it moved).
    expect(hexSpaceId(expectedNext.gateHex) === hexSpaceId(defaultGate.gateHex) &&
      hexSpaceId(expectedNext.entranceHex) === hexSpaceId(defaultGate.entranceHex)).toBe(false);
  });

  it("clicking a designer gate token selects the cavern and opens its link options", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: true,
        subBand: "iv-v",
        gateLinks: [{ surface: { row: town.row, col: town.col } }]
      }
    ]);
    // No popover yet.
    expect(container.querySelector(".designerPopover")).toBeNull();
    const token = container.querySelector(".designerGateToken.designed");
    expect(token, "a clickable designed gate token").toBeTruthy();
    fireEvent.click(token!);
    // The cavern's popover opens, showing its gate-link controls.
    const popover = container.querySelector(".designerPopover");
    expect(popover, "clicking the gate opened the cavern popover").toBeTruthy();
    expect(popover!.querySelector(".popoverGateLinks"), "the gate-link section is shown").toBeTruthy();
    // It is already linked to the town — the toggle reads Linked.
    expect(popover!.querySelector(".popoverGateLinkToggle.linked")).toBeTruthy();
  });

  it("renders a designer-linked gate distinct from an automatic one (pin marker + class)", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: true,
        subBand: "iv-v",
        gateLinks: [{ surface: { row: town.row, col: town.col } }]
      }
    ]);
    // A designer-committed gate carries the lock pin and the "designed" marker.
    expect(container.querySelector(".designerGatePin"), "designer gate pin marker").toBeTruthy();
    expect(container.querySelector(".designerGateToken.designed"), "designed gate token class").toBeTruthy();
    expect(container.querySelector(".designerGateLink.designed"), "designed gate link class").toBeTruthy();

    // CONTROL: the same layout WITHOUT a designed link draws the automatic gate —
    // no pin, no "designed" marker — proving the distinction is the link, not the
    // mere presence of a gate.
    cleanup();
    const auto = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: cavern.row, col: cavern.col, group: "subterranean", faceDown: true, subBand: "iv-v" }
    ]);
    expect(auto.querySelector('image[href*="subterranean-gate-surface"]'), "the automatic gate still renders").toBeTruthy();
    expect(auto.querySelector(".designerGatePin"), "no pin on an automatic gate").toBeNull();
    expect(auto.querySelector(".designerGateToken.designed"), "no designed class on an automatic gate").toBeNull();
  });
});

describe("MapDesigner — designed gate token drag (pointer slide)", () => {
  const town = { row: 10, col: 10 };
  const cavern = tileLatticeNeighbors(town)[0];
  const HEX = 24; // passed explicitly so the test's pixel math matches the render

  /**
   * jsdom implements neither getScreenCTM nor DOMPoint, so the drag's client →
   * board mapping needs identity polyfills (client coords == board coords).
   * Returns the restore function; always call it in finally.
   */
  function installSvgPolyfills(): () => void {
    const svgProto = SVGElement.prototype as unknown as Record<string, unknown>;
    const hadCTM = Object.prototype.hasOwnProperty.call(svgProto, "getScreenCTM");
    Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
      configurable: true,
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) })
    });
    const globals = globalThis as { DOMPoint?: unknown };
    const previousDOMPoint = globals.DOMPoint;
    globals.DOMPoint = class {
      x: number;
      y: number;
      constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
      }
      matrixTransform(m: { a: number; b: number; c: number; d: number; e: number; f: number }) {
        return { x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f };
      }
    };
    return () => {
      if (!hadCTM) {
        delete svgProto.getScreenCTM;
      }
      if (previousDOMPoint === undefined) {
        delete globals.DOMPoint;
      } else {
        globals.DOMPoint = previousDOMPoint;
      }
    };
  }

  const midpointOf = (pair: GateHexPair) => {
    const gate = hexToPixel(pair.gateHex, HEX);
    const entrance = hexToPixel(pair.entranceHex, HEX);
    return { x: (gate.x + entrance.x) / 2, y: (gate.y + entrance.y) / 2 };
  };

  const linkedMap = (): CustomMapTilePlan[] => [
    { row: town.row, col: town.col, group: "starting", faceDown: false },
    {
      row: cavern.row,
      col: cavern.col,
      group: "subterranean",
      faceDown: true,
      subBand: "iv-v",
      gateLinks: [{ surface: { row: town.row, col: town.col } }] // linked, unpinned
    }
  ];

  /** The unpinned link renders at the automatic nearest default. */
  function defaultPair(): GateHexPair {
    const [defaultGate] = planSubterraneanGates(
      [
        { row: town.row, col: town.col, group: "starting" },
        { row: cavern.row, col: cavern.col, group: "subterranean" }
      ],
      []
    );
    return { gateHex: defaultGate.gateHex, entranceHex: defaultGate.entranceHex };
  }

  it("dragging the designed gate token pins the link to the snapped boundary pair", () => {
    const restore = installSvgPolyfills();
    try {
      const pairs = legalGateHexPairs(town, cavern);
      const start = defaultPair();
      // A DIFFERENT legal boundary pair to drop the token on; a pointer at its
      // midpoint snaps to exactly it (pinned by gate-drag.test.ts).
      const target = pairs.find(
        (pair) =>
          hexSpaceId(pair.gateHex) !== hexSpaceId(start.gateHex) ||
          hexSpaceId(pair.entranceHex) !== hexSpaceId(start.entranceHex)
      )!;
      expect(target).toBeTruthy();
      const grabAt = midpointOf(start);
      const dropAt = midpointOf(target);
      // Sanity: the pointer genuinely travels (beyond the 3px click threshold),
      // and the drop point snaps to the target pair.
      expect(Math.abs(dropAt.x - grabAt.x) + Math.abs(dropAt.y - grabAt.y)).toBeGreaterThan(3);
      const snapped = nearestGateHexPair(dropAt, pairs, HEX)!;
      expect(hexSpaceId(snapped.gateHex)).toBe(hexSpaceId(target.gateHex));

      let latest = linkedMap();
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );
      const token = container.querySelector(".designerGateToken.designed");
      expect(token, "a draggable designed gate token").toBeTruthy();

      fireEvent.pointerDown(token!, { button: 0, pointerId: 7, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 7, clientX: dropAt.x, clientY: dropAt.y });
      // Mid-drag: the live snap preview marks the token pair as dragging.
      expect(container.querySelector(".designerGateToken.designed.dragging"), "live drag preview").toBeTruthy();
      fireEvent.pointerUp(window, { pointerId: 7 });

      // Release committed the pin — the SAME plan shape the ↻ cycle writes.
      expect(onChange).toHaveBeenCalled();
      expect(latest[1].gateLinks![0]).toEqual({
        surface: { row: town.row, col: town.col },
        gateHex: hexSpaceId(target.gateHex),
        entranceHex: hexSpaceId(target.entranceHex)
      });
    } finally {
      restore();
    }
  });

  it("Escape cancels the drag — no commit, the plan keeps its previous pin", () => {
    const restore = installSvgPolyfills();
    try {
      const pairs = legalGateHexPairs(town, cavern);
      const start = defaultPair();
      const target = pairs.find((pair) => hexSpaceId(pair.gateHex) !== hexSpaceId(start.gateHex))!;

      const onChange = vi.fn();
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={linkedMap()} onChange={onChange} hexSize={HEX} />
      );
      const token = container.querySelector(".designerGateToken.designed")!;
      const grabAt = midpointOf(start);
      const dropAt = midpointOf(target);
      fireEvent.pointerDown(token, { button: 0, pointerId: 7, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 7, clientX: dropAt.x, clientY: dropAt.y });
      expect(container.querySelector(".designerGateToken.designed.dragging"), "preview while dragging").toBeTruthy();

      fireEvent.keyDown(window, { key: "Escape" });
      // The preview is gone and a later release commits nothing.
      expect(container.querySelector(".designerGateToken.designed.dragging")).toBeNull();
      fireEvent.pointerUp(window, { pointerId: 7 });
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      restore();
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

describe("MapDesigner — objects palette (gates / monolith / standalone)", () => {
  const town = { row: 10, col: 10 };
  const far = tileLatticeNeighbors(town)[1];

  function renderWithObjects(
    customMap: CustomMapTilePlan[],
    objects: CustomMapObject[],
    onObjectsChange: (next: CustomMapObject[]) => void = () => {}
  ): HTMLElement {
    const { container } = render(
      <MapDesigner
        scenarioId="skirmish"
        customMap={customMap}
        onChange={() => {}}
        objects={objects}
        onObjectsChange={onObjectsChange}
      />
    );
    return container;
  }

  const faceUpMap: CustomMapTilePlan[] = [
    { row: town.row, col: town.col, group: "starting", faceDown: false },
    { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1" }
  ];

  it("arms a Gate pair and places a TILE-SLOT object on a face-up tile hex", () => {
    let latest: CustomMapObject[] = [];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, [], onObjectsChange);

    // Arm the red gate pair (badge shows 0/2).
    const redButton = container.querySelector('.designerObjectButton[data-gate-pair="1"]');
    expect(redButton?.textContent).toMatch(/0\/2/);
    fireEvent.click(redButton!);
    expect(redButton!.getAttribute("aria-pressed")).toBe("true");

    // A legal tile-slot candidate now glows on the face-up F1 tile; click it.
    const slot = container.querySelector(".designerObjectSlot.tileSlot");
    expect(slot, "a legal tile-slot candidate is offered").toBeTruthy();
    fireEvent.click(slot!);

    expect(onObjectsChange).toHaveBeenCalled();
    expect(latest).toHaveLength(1);
    expect(latest[0].kind).toBe("gate");
    expect(latest[0].pair).toBe(1);
    expect(latest[0].placement.type).toBe("tile-slot");
    expect(latest[0].placement).toMatchObject({ row: far.row, col: far.col });
  });

  it("arms a Monolith and places a STANDALONE object on an off-tile hex", () => {
    let latest: CustomMapObject[] = [];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, [], onObjectsChange);

    const monolithButton = [...container.querySelectorAll(".designerObjectButton")].find((btn) =>
      /Monolith/i.test(btn.textContent ?? "")
    );
    fireEvent.click(monolithButton!);

    const standalone = container.querySelector(".designerObjectSlot.standalone");
    expect(standalone, "an off-tile standalone candidate is offered").toBeTruthy();
    fireEvent.click(standalone!);

    expect(latest).toHaveLength(1);
    expect(latest[0].kind).toBe("monolith");
    expect(latest[0].placement.type).toBe("standalone");
  });

  it("the guard picker writes the guard onto a placed object; the pair badge shows its number", () => {
    let latest: CustomMapObject[] = [
      { kind: "gate", pair: 2, placement: { type: "tile-slot", row: far.row, col: far.col, slot: 0 } }
    ];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, latest, onObjectsChange);

    // The board token shows the pair number (colour-blind-safe label).
    expect(container.querySelector(".designerObjectPair")?.textContent).toBe("2");

    // Click the token → its popover opens with a guard picker.
    fireEvent.click(container.querySelector(".designerObjectToken")!);
    const guardChip = container.querySelector('.popoverGuardChip[data-guard="3"]');
    expect(guardChip, "guard Ⅲ chip present").toBeTruthy();
    fireEvent.click(guardChip!);
    expect(latest[0].guard).toBe(3);
  });

  it("renders incomplete-pair and detached-hex warnings", () => {
    const objects: CustomMapObject[] = [
      // A lone red gate → an incomplete colored pair.
      { kind: "gate", pair: 1, placement: { type: "tile-slot", row: far.row, col: far.col, slot: 0 } },
      // A detached standalone Monolith far from every tile → unreachable.
      { kind: "monolith", placement: { type: "standalone", row: town.row + 40, col: town.col + 40 } }
    ];
    const container = renderWithObjects(faceUpMap, objects);
    const alerts = [...container.querySelectorAll(".designerObjectAlert")].map((node) => node.textContent ?? "");
    expect(alerts.some((text) => /red Gate pair/i.test(text) && /one gate/i.test(text)), "incomplete-pair warning").toBe(
      true
    );
    expect(alerts.some((text) => /touches no tile|unreachable/i.test(text)), "detached warning").toBe(true);
  });

  it("legacy per-tile Monolith token UI is untouched (both systems coexist)", () => {
    // A legacy `token` on the tile plan still renders its art…
    const container = renderWithObjects(
      [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 0 } }
      ],
      []
    );
    expect(container.querySelector('image[href*="tokens/monolith"]'), "legacy token art still renders").toBeTruthy();
    // …while the Objects palette also offers its own Monolith button.
    expect(
      [...container.querySelectorAll(".designerObjectButton")].some((btn) => /Monolith/i.test(btn.textContent ?? "")),
      "objects palette present alongside the legacy token"
    ).toBe(true);
  });
});

describe("MapDesigner — fixed starting-tile orientation (lockRotation)", () => {
  const town = { row: 10, col: 10 };
  const far = tileLatticeNeighbors(town)[1];

  it("rotates + locks a starting tile (onChange carries rotation + lockRotation), draws the lock badge, and offers no toggle on a non-starting tile", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    let container = renderDesigner(latest, onChange);
    // No lock badge on an unlocked starting tile.
    expect(container.querySelector(".designerStartLockBadge")).toBeNull();

    // The starting popover offers the Fix-orientation toggle (unpressed) + rotate.
    const popover = openTilePopover(container, 0);
    const toggle = popover.querySelector(".popoverLockToggle");
    expect(toggle, "starting popover offers the fix-orientation toggle").toBeTruthy();
    expect(toggle!.getAttribute("aria-pressed")).toBe("false");

    // Rotate clockwise → onChange carries rotation 1 on the starting plan.
    fireEvent.click(popover.querySelector('[title="Rotate 60° clockwise"]')!);
    expect(latest[0].rotation).toBe(1);
    expect(latest[0].lockRotation, "rotating alone does not lock").toBeUndefined();

    // Re-render with the rotated plan, then toggle the lock ON → the plan now
    // carries BOTH rotation 1 and lockRotation, and the toggle reads pressed.
    cleanup();
    container = renderDesigner(latest, onChange);
    const popover2 = openTilePopover(container, 0);
    expect(popover2.querySelector(".popoverLockToggle")!.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(popover2.querySelector(".popoverLockToggle")!);
    expect(latest[0]).toMatchObject({ group: "starting", rotation: 1, lockRotation: true });

    // Re-render: the board now draws the lock badge on the fixed starting tile.
    cleanup();
    container = renderDesigner(latest, onChange);
    expect(container.querySelector(".designerStartLockBadge"), "lock badge renders").toBeTruthy();

    // Toggling it OFF again round-trips back to no lockRotation.
    const popover3 = openTilePopover(container, 0);
    expect(popover3.querySelector(".popoverLockToggle")!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(popover3.querySelector(".popoverLockToggle")!);
    expect(latest[0].lockRotation).toBeUndefined();

    // A NON-starting tile's popover offers NO fix-orientation toggle.
    cleanup();
    container = renderDesigner(latest, onChange);
    const farPopover = openTilePopover(container, 1);
    expect(farPopover.querySelector(".popoverLockToggle")).toBeNull();
  });
});
