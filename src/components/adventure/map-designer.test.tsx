// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MapDesigner, planBackArt, planBackLabel } from "./map-designer";
import { nearestGateHexPair, type GateHexPair } from "./gate-drag";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  canonicalTileEdgeCode,
  hexNeighbor,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  legalGateHexPairs,
  legalTokenSlotsForTileDef,
  planSubterraneanGates,
  tileFootprint,
  tileLatticeNeighbors,
  type CustomMapObject,
  type CustomMapTilePlan,
  type HexCoord
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

/**
 * Renders the designer with REAL React state, so an onChange re-renders the
 * board (as production does). Needed for multi-step border strokes / re-toggles
 * that must see the previous edit before applying the next. `get()` reads the
 * live plan array.
 */
function renderStatefulDesigner(initial: CustomMapTilePlan[]): {
  container: HTMLElement;
  get: () => CustomMapTilePlan[];
} {
  const box: { current: CustomMapTilePlan[] } = { current: initial };
  function Harness() {
    const [plans, setPlans] = useState(initial);
    box.current = plans;
    return (
      <MapDesigner
        scenarioId="skirmish"
        customMap={plans}
        onChange={(next) => {
          box.current = next;
          setPlans(next);
        }}
      />
    );
  }
  const { container } = render(<Harness />);
  return { container, get: () => box.current };
}

/** Rotation-0 footprint index of a board hex within a tile centred at `center`. */
function footprintIndexOf(center: HexCoord, coord: HexCoord): number {
  return tileFootprint(center, 0).findIndex((cell) => cell.row === coord.row && cell.col === coord.col);
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

/**
 * jsdom implements neither getScreenCTM nor DOMPoint, so any drag's client →
 * board mapping needs identity polyfills (client coords == board coords).
 * Returns the restore function; always call it in a finally.
 */
function installIdentitySvgPolyfills(): () => void {
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
    // The warning is tagged with the red-cross board glyph.
    expect(conflict!.querySelector('img[src*="red_cross"]'), "red-cross glyph on the conflict").toBeTruthy();

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

  it("shows a green all-clear (tick glyph) when a Grail design already supports the win condition", () => {
    // A forced-Grail centre plus a face-down Far overflow slot → capacity ≥ 2 →
    // no conflict → the all-clear appears for the design-requiring victory mode.
    const { container } = render(
      <MapDesigner
        scenarioId="skirmish"
        victoryMode="grail"
        customMap={[
          { row: 8, col: 2, group: "starting", faceDown: false },
          { row: 9, col: 4, group: "center", faceDown: false, tileDefId: "C1", viiField: "grail" },
          { row: 6, col: 4, group: "far", faceDown: true }
        ]}
        onChange={() => {}}
      />
    );
    expect(container.querySelector(".designerVictoryConflict"), "no conflict").toBeNull();
    const allClear = container.querySelector(".designerVictoryOk");
    expect(allClear, "victory all-clear shown").toBeTruthy();
    expect(allClear!.querySelector('img[src*="green_tick"]'), "green-tick glyph on the all-clear").toBeTruthy();

    // CONTROL: Conquest needs no supporting tiles, so no all-clear is shown.
    cleanup();
    const { container: plain } = render(
      <MapDesigner
        scenarioId="skirmish"
        victoryMode="conquest"
        customMap={[{ row: 8, col: 2, group: "starting", faceDown: false }]}
        onChange={() => {}}
      />
    );
    expect(plain.querySelector(".designerVictoryOk"), "no all-clear under Conquest").toBeNull();
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

  it("the tile panel reports the border-edge count and Clear wipes both border fields", () => {
    const town = { row: 10, col: 10 };
    const far = tileLatticeNeighbors(town)[1];
    // A plan carrying a legacy whole-arc AND a per-edge border: the panel counts
    // the union (arc expands to 3 edges) and Clear must wipe BOTH fields.
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true, extraBorders: [1], borderEdges: [0] }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);
    const summary = popover.querySelector(".popoverBorderSummary");
    expect(summary, "border summary present").toBeTruthy();
    // Arc [1] → 3 edges, plus the per-edge [0] (distinct) → 4 border edges.
    expect(summary!.textContent).toContain("4 border edges");

    fireEvent.click(within(popover).getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalled();
    expect(latest[1].extraBorders, "legacy arc wiped").toBeUndefined();
    expect(latest[1].borderEdges, "per-edge borders wiped").toBeUndefined();
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

describe("MapDesigner — AUTOMATIC gate token interactivity", () => {
  // No gateLinks on the cavern → the gate is the AUTOMATIC touch pairing. This
  // used to be inert (pointer-events: none, no handlers): a click fell through to
  // the tile and the token could not be dragged. Now every gate token is
  // clickable + draggable, and dragging an automatic gate CONVERTS it to a pinned
  // designer link at the dropped spot. Mirrors the designed-drag describe above.
  const town = { row: 10, col: 10 };
  const cavern = tileLatticeNeighbors(town)[0];
  const HEX = 24;

  /** jsdom has no getScreenCTM / DOMPoint — identity polyfills (client == board). */
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

  /** A cavern touching the town but carrying NO gateLinks → an automatic gate. */
  const autoMap = (): CustomMapTilePlan[] => [
    { row: town.row, col: town.col, group: "starting", faceDown: false },
    { row: cavern.row, col: cavern.col, group: "subterranean", faceDown: true, subBand: "iv-v" }
  ];

  /** The automatic gate renders at the nearest-default boundary pair. */
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

  it("clicking an AUTOMATIC gate token opens the owning cavern's panel (used to be impossible)", () => {
    const container = renderDesigner(autoMap());
    // Precondition: an automatic gate renders, WITHOUT the designed marker/pin.
    const token = container.querySelector(".designerGateToken");
    expect(token, "an automatic gate token renders").toBeTruthy();
    expect(token!.classList.contains("designed"), "the gate is automatic, not designer-pinned").toBe(false);
    expect(container.querySelector(".designerGatePin"), "no pin on an automatic gate").toBeNull();
    // No popover yet — the flip under test is that clicking now opens one.
    expect(container.querySelector(".designerPopover")).toBeNull();

    fireEvent.click(token!);
    const popover = container.querySelector(".designerPopover");
    expect(popover, "clicking the automatic gate opened the cavern popover").toBeTruthy();
    // …the cavern panel, with its gate-link section (Link toggle, not yet linked).
    expect(popover!.querySelector(".popoverGateLinks"), "the gate-link section is shown").toBeTruthy();
    expect(popover!.querySelector(".popoverGateLinkToggle.linked"), "not linked yet").toBeNull();
  });

  it("dragging an AUTOMATIC gate token COMMITS a designer link, then renders it pinned", () => {
    const restore = installSvgPolyfills();
    try {
      const pairs = legalGateHexPairs(town, cavern);
      const start = defaultPair();
      const target = pairs.find(
        (pair) =>
          hexSpaceId(pair.gateHex) !== hexSpaceId(start.gateHex) ||
          hexSpaceId(pair.entranceHex) !== hexSpaceId(start.entranceHex)
      )!;
      expect(target, "a different legal boundary pair to drop on").toBeTruthy();
      const grabAt = midpointOf(start);
      const dropAt = midpointOf(target);
      // The drop point snaps to exactly the target pair (pinned in gate-drag.test.ts).
      const snapped = nearestGateHexPair(dropAt, pairs, HEX)!;
      expect(hexSpaceId(snapped.gateHex)).toBe(hexSpaceId(target.gateHex));

      let latest = autoMap();
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );
      const token = container.querySelector(".designerGateToken");
      expect(token!.classList.contains("designed"), "starts as an automatic gate").toBe(false);

      fireEvent.pointerDown(token!, { button: 0, pointerId: 9, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 9, clientX: dropAt.x, clientY: dropAt.y });
      // The automatic token carries the live drag class mid-slide (no `.designed`).
      expect(container.querySelector(".designerGateToken.dragging"), "live drag preview").toBeTruthy();
      fireEvent.pointerUp(window, { pointerId: 9 });

      // Release ADDED a gateLinks entry (the automatic gate had none) at the
      // snapped pair — a member of legalGateHexPairs, the same shape ↻/designed
      // drags write.
      expect(onChange).toHaveBeenCalled();
      expect(latest[1].gateLinks).toEqual([
        {
          surface: { row: town.row, col: town.col },
          gateHex: hexSpaceId(target.gateHex),
          entranceHex: hexSpaceId(target.entranceHex)
        }
      ]);
      const committed = latest[1].gateLinks![0];
      expect(
        pairs.some(
          (pair) =>
            hexSpaceId(pair.gateHex) === committed.gateHex && hexSpaceId(pair.entranceHex) === committed.entranceHex
        ),
        "the pinned pair is a legal boundary pair"
      ).toBe(true);

      // Re-render with the committed plan: the gate now reads as DESIGNER-pinned
      // (the designed marker + the lock pin), proving the automatic → pinned flip.
      cleanup();
      const pinned = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={() => {}} hexSize={HEX} />
      );
      expect(pinned.container.querySelector(".designerGateToken.designed"), "now a designed token").toBeTruthy();
      expect(pinned.container.querySelector(".designerGatePin"), "now carries the lock pin").toBeTruthy();
    } finally {
      restore();
    }
  });

  it("Escape mid-drag on an AUTOMATIC gate commits nothing (control)", () => {
    const restore = installSvgPolyfills();
    try {
      const pairs = legalGateHexPairs(town, cavern);
      const start = defaultPair();
      const target = pairs.find((pair) => hexSpaceId(pair.gateHex) !== hexSpaceId(start.gateHex))!;
      const onChange = vi.fn();
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={autoMap()} onChange={onChange} hexSize={HEX} />
      );
      const token = container.querySelector(".designerGateToken")!;
      const grabAt = midpointOf(start);
      const dropAt = midpointOf(target);
      fireEvent.pointerDown(token, { button: 0, pointerId: 9, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 9, clientX: dropAt.x, clientY: dropAt.y });
      expect(container.querySelector(".designerGateToken.dragging"), "preview while dragging").toBeTruthy();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(container.querySelector(".designerGateToken.dragging")).toBeNull();
      fireEvent.pointerUp(window, { pointerId: 9 });
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

describe("MapDesigner — placed object drag-to-move (direct manipulation)", () => {
  const town = { row: 10, col: 10 };
  const HEX = 24;
  const townMap: CustomMapTilePlan[] = [{ row: town.row, col: town.col, group: "starting", faceDown: false }];

  /** The off-tile hexes adjacent to the town flower — its standalone-candidate ring. */
  function offTileRing(): { row: number; col: number }[] {
    const footprint = tileFootprint(town, 0);
    const ids = new Set(footprint.map((cell) => hexSpaceId(cell)));
    const out: { row: number; col: number }[] = [];
    const seen = new Set<string>();
    for (const cell of footprint) {
      for (const nb of hexNeighbors(cell)) {
        const id = hexSpaceId(nb);
        if (ids.has(id) || seen.has(id)) {
          continue;
        }
        seen.add(id);
        out.push(nb);
      }
    }
    return out;
  }

  function renderObjects(objects: CustomMapObject[], onObjectsChange: (next: CustomMapObject[]) => void = () => {}) {
    return render(
      <MapDesigner
        scenarioId="skirmish"
        customMap={townMap}
        onChange={() => {}}
        objects={objects}
        onObjectsChange={onObjectsChange}
        hexSize={HEX}
      />
    );
  }

  it("dragging a placed standalone Monolith onto a candidate moves it (kind + guard intact)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const ring = offTileRing();
      const origin = ring[0];
      const target = ring[1];
      let latest: CustomMapObject[] = [
        { kind: "monolith", guard: 2, placement: { type: "standalone", row: origin.row, col: origin.col } }
      ];
      const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
        latest = next;
      });
      const { container } = renderObjects(latest, onObjectsChange);

      const token = container.querySelector(".designerObjectToken")!;
      const grabAt = hexToPixel(origin, HEX);
      const dropAt = hexToPixel(target, HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 5, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 5, clientX: dropAt.x, clientY: dropAt.y });
      // Mid-drag: the token carries `.dragging` and a candidate glows under it.
      expect(container.querySelector(".designerObjectToken.dragging"), "live drag preview").toBeTruthy();
      expect(container.querySelector(".designerObjectSlot.standalone.hover"), "drop target highlighted").toBeTruthy();
      fireEvent.pointerUp(window, { pointerId: 5 });

      expect(onObjectsChange).toHaveBeenCalled();
      expect(latest).toHaveLength(1);
      expect(latest[0].kind).toBe("monolith");
      expect(latest[0].guard, "guard preserved").toBe(2);
      expect(latest[0].placement).toEqual({ type: "standalone", row: target.row, col: target.col });
    } finally {
      restore();
    }
  });

  it("releasing on a NON-candidate hex makes no change (control)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const ring = offTileRing();
      const origin = ring[0];
      const objects: CustomMapObject[] = [
        { kind: "monolith", placement: { type: "standalone", row: origin.row, col: origin.col } }
      ];
      const onObjectsChange = vi.fn();
      const { container } = renderObjects(objects, onObjectsChange);

      const token = container.querySelector(".designerObjectToken")!;
      const grabAt = hexToPixel(origin, HEX);
      // A hex far from every tile is no candidate → the release is a no-op.
      const farAt = hexToPixel({ row: town.row + 40, col: town.col + 40 }, HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 5, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 5, clientX: farAt.x, clientY: farAt.y });
      fireEvent.pointerUp(window, { pointerId: 5 });

      expect(onObjectsChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("a plain click (no move) still opens the object panel — unchanged behaviour", () => {
    const ring = offTileRing();
    const origin = ring[0];
    const { container } = renderObjects([
      { kind: "monolith", placement: { type: "standalone", row: origin.row, col: origin.col } }
    ]);
    fireEvent.click(container.querySelector(".designerObjectToken")!);
    expect(container.querySelector(".designerObjectPopover"), "object panel opened by a plain click").toBeTruthy();
  });

  it("dragging ONE half of a Gate pair moves only that entry; `pair` + the other half untouched", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const ring = offTileRing();
      const [a, b, c] = ring;
      let latest: CustomMapObject[] = [
        { kind: "gate", pair: 1, placement: { type: "standalone", row: a.row, col: a.col } },
        { kind: "gate", pair: 1, placement: { type: "standalone", row: b.row, col: b.col } }
      ];
      const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
        latest = next;
      });
      const { container } = renderObjects(latest, onObjectsChange);

      const tokens = container.querySelectorAll(".designerObjectToken");
      expect(tokens.length, "both gate halves rendered").toBe(2);
      const grabAt = hexToPixel(a, HEX);
      const dropAt = hexToPixel(c, HEX);
      fireEvent.pointerDown(tokens[0], { button: 0, pointerId: 8, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 8, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 8 });

      expect(latest[0]).toEqual({ kind: "gate", pair: 1, placement: { type: "standalone", row: c.row, col: c.col } });
      // The OTHER half is byte-for-byte unchanged.
      expect(latest[1]).toEqual({ kind: "gate", pair: 1, placement: { type: "standalone", row: b.row, col: b.col } });
    } finally {
      restore();
    }
  });

  it("Escape mid-drag commits nothing", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const ring = offTileRing();
      const origin = ring[0];
      const target = ring[1];
      const onObjectsChange = vi.fn();
      const { container } = renderObjects(
        [{ kind: "monolith", placement: { type: "standalone", row: origin.row, col: origin.col } }],
        onObjectsChange
      );

      const token = container.querySelector(".designerObjectToken")!;
      const grabAt = hexToPixel(origin, HEX);
      const dropAt = hexToPixel(target, HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 5, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 5, clientX: dropAt.x, clientY: dropAt.y });
      expect(container.querySelector(".designerObjectToken.dragging"), "preview while dragging").toBeTruthy();
      fireEvent.keyDown(window, { key: "Escape" });
      // The preview is gone and a later release commits nothing.
      expect(container.querySelector(".designerObjectToken.dragging")).toBeNull();
      fireEvent.pointerUp(window, { pointerId: 5 });
      expect(onObjectsChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("MapDesigner — tile-carried token direct manipulation (click + drag)", () => {
  const town = { row: 10, col: 10 };
  const spots = tileLatticeNeighbors(town);
  const HEX = 24;

  /** A face-up F1 tile carrying a Monolith token on slot 0 (a legal monolith slot). */
  function faceUpTokenMap(): CustomMapTilePlan[] {
    return [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: spots[0].row,
        col: spots[0].col,
        group: "far",
        faceDown: false,
        tileDefId: "F1",
        token: { kind: "monolith", slot: 0 }
      }
    ];
  }

  it("clicking a face-up tile token opens the compact TOKEN panel, not the giant tile panel", () => {
    const { container } = render(
      <MapDesigner scenarioId="skirmish" customMap={faceUpTokenMap()} onChange={() => {}} hexSize={HEX} />
    );
    const tokenImg = container.querySelector(".designerMapToken.draggable")!;
    expect(tokenImg, "the face-up token is a draggable image").toBeTruthy();
    fireEvent.click(tokenImg);

    const panel = container.querySelector(".designerTokenPopover") as HTMLElement;
    expect(panel, "token panel opened").toBeTruthy();
    expect(panel.querySelector("header strong")?.textContent, "token panel header").toMatch(/Monolith token/i);
    // The behaviour-flip control: the old bug fell through and opened the WIDE
    // tile panel (mode cards). None of that shows now.
    expect(container.querySelector(".popoverModeRow"), "no tile mode cards").toBeNull();
    expect(container.querySelectorAll(".designerPopover").length, "exactly one panel").toBe(1);
  });

  it("the token panel's slot select + Remove edit plan.token; ✕ closes it", () => {
    let latest: CustomMapTilePlan[] = faceUpTokenMap();
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const { container } = render(
      <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
    );
    fireEvent.click(container.querySelector(".designerMapToken.draggable")!);
    const panel = container.querySelector(".designerTokenPopover") as HTMLElement;

    // The slot select offers F1's legal monolith slots and re-picking writes the plan.
    const select = within(panel).getByLabelText("Token field") as HTMLSelectElement;
    const monoSlots = legalTokenSlotsForTileDef(allTileDefinitions["F1"], "monolith");
    expect(monoSlots.length, "F1 has >1 monolith slot").toBeGreaterThan(1);
    fireEvent.change(select, { target: { value: String(monoSlots[1]) } });
    expect(latest[1].token).toEqual({ kind: "monolith", slot: monoSlots[1] });

    // Remove clears the token AND closes the panel.
    fireEvent.click(within(panel).getByRole("button", { name: /Remove the Monolith token/i }));
    expect(latest[1].token, "token removed").toBeUndefined();
    expect(container.querySelector(".designerTokenPopover"), "panel closed after remove").toBeNull();
  });

  it("the ✕ button closes the token panel", () => {
    const { container } = render(
      <MapDesigner scenarioId="skirmish" customMap={faceUpTokenMap()} onChange={() => {}} hexSize={HEX} />
    );
    fireEvent.click(container.querySelector(".designerMapToken.draggable")!);
    const panel = container.querySelector(".designerTokenPopover") as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Close token options" }));
    expect(container.querySelector(".designerTokenPopover"), "panel closed by ✕").toBeNull();
  });

  it("opening the tile panel closes the token panel (mutual exclusivity)", () => {
    const { container } = render(
      <MapDesigner scenarioId="skirmish" customMap={faceUpTokenMap()} onChange={() => {}} hexSize={HEX} />
    );
    // Open the token panel first.
    fireEvent.click(container.querySelector(".designerMapToken.draggable")!);
    expect(container.querySelector(".designerTokenPopover"), "token panel open").toBeTruthy();
    // Click the tile → the tile panel opens and the token panel closes (never both).
    openTilePopover(container, 1);
    expect(container.querySelector(".designerTokenPopover"), "token panel now closed").toBeNull();
    expect(container.querySelectorAll(".designerPopover").length, "exactly one panel").toBe(1);
  });

  it("dragging a token to another slot on the SAME tile updates plan.token.slot", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const monoSlots = legalTokenSlotsForTileDef(allTileDefinitions["F1"], "monolith");
      const fromSlot = monoSlots[0];
      const toSlot = monoSlots[1];
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        {
          row: spots[0].row,
          col: spots[0].col,
          group: "far",
          faceDown: false,
          tileDefId: "F1",
          token: { kind: "monolith", slot: fromSlot }
        }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );

      const token = container.querySelector(".designerMapToken.draggable")!;
      const grabAt = hexToPixel(tileFootprint(spots[0], 0)[fromSlot], HEX);
      const dropAt = hexToPixel(tileFootprint(spots[0], 0)[toSlot], HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 6, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 6, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 6 });

      expect(latest[1].token).toEqual({ kind: "monolith", slot: toSlot });
    } finally {
      restore();
    }
  });

  it("dragging a token to ANOTHER face-up tile is ONE atomic onChange (source clears, target gains)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      // town + F1 (token slot 0) + F2 (no token), F1/F2 on opposite lattice spots.
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        {
          row: spots[0].row,
          col: spots[0].col,
          group: "far",
          faceDown: false,
          tileDefId: "F1",
          token: { kind: "monolith", slot: 0 }
        },
        { row: spots[3].row, col: spots[3].col, group: "far", faceDown: false, tileDefId: "F2" }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );

      const token = container.querySelectorAll(".designerMapToken")[0]; // F1's token
      const grabAt = hexToPixel(spots[0], HEX); // F1 slot 0 = its centre
      const dropAt = hexToPixel(spots[3], HEX); // F2 slot 0 = its centre (a legal monolith slot)
      const callsBefore = onChange.mock.calls.length;
      fireEvent.pointerDown(token, { button: 0, pointerId: 7, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 7, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 7 });

      expect(onChange.mock.calls.length - callsBefore, "exactly one atomic emission").toBe(1);
      expect(latest[1].token, "source tile lost its token").toBeUndefined();
      expect(latest[2].token, "target tile gained it").toEqual({ kind: "monolith", slot: 0 });
    } finally {
      restore();
    }
  });

  it("a target tile that already carries a token is refused — no move (control)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const onChange = vi.fn();
      // Both F1 and F2 carry a token → F2 is never a drop candidate.
      const { container } = render(
        <MapDesigner
          scenarioId="skirmish"
          customMap={[
            { row: town.row, col: town.col, group: "starting", faceDown: false },
            {
              row: spots[0].row,
              col: spots[0].col,
              group: "far",
              faceDown: false,
              tileDefId: "F1",
              token: { kind: "monolith", slot: 0 }
            },
            {
              row: spots[3].row,
              col: spots[3].col,
              group: "far",
              faceDown: false,
              tileDefId: "F2",
              token: { kind: "monolith", slot: 0 }
            }
          ]}
          onChange={onChange}
          hexSize={HEX}
        />
      );

      const token = container.querySelectorAll(".designerMapToken")[0]; // F1's token
      const grabAt = hexToPixel(spots[0], HEX);
      const dropAt = hexToPixel(spots[3], HEX); // over F2, which already has a token
      fireEvent.pointerDown(token, { button: 0, pointerId: 9, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 9, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 9 });

      expect(onChange, "occupied target refused").not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("a FACE-DOWN badge token: click opens the panel, pointer-move does NOT start a drag, Remove works", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );

      const token = container.querySelector(".designerMapToken")!;
      expect(token.classList.contains("draggable"), "face-down badge is not draggable").toBe(false);

      // A press + move must NOT start a drag (no candidate slots, no `.dragging`).
      fireEvent.pointerDown(token, { button: 0, pointerId: 3, clientX: 40, clientY: 40 });
      fireEvent.pointerMove(window, { pointerId: 3, clientX: 160, clientY: 160 });
      expect(container.querySelector(".designerMapToken.dragging"), "no drag from a face-down badge").toBeNull();
      expect(container.querySelectorAll(".designerObjectSlot").length, "no candidate slots").toBe(0);
      fireEvent.pointerUp(window, { pointerId: 3 });
      expect(onChange, "no move committed").not.toHaveBeenCalled();

      // Click opens the panel with the discoverer hint (the hex is picked at reveal).
      fireEvent.click(token);
      const panel = container.querySelector(".designerTokenPopover") as HTMLElement;
      expect(panel, "token panel opens for a face-down badge").toBeTruthy();
      expect(within(panel).getByText(/discover/i), "discoverer hint shown").toBeTruthy();
      expect(within(panel).queryByLabelText("Token field"), "no slot select for a face-down badge").toBeNull();

      // Remove still clears the token.
      fireEvent.click(within(panel).getByRole("button", { name: /Remove the Monolith token/i }));
      expect(latest[1].token, "face-down token removed").toBeUndefined();
    } finally {
      restore();
    }
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

describe("MapDesigner — docked inspector panel", () => {
  const town = { row: 10, col: 10 };
  const far = tileLatticeNeighbors(town)[1];

  /** A face-up map + one placed Gate object, so both panel kinds are reachable. */
  function renderTileAndObject(): HTMLElement {
    const { container } = render(
      <MapDesigner
        scenarioId="skirmish"
        customMap={[
          { row: town.row, col: town.col, group: "starting", faceDown: false },
          { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1" }
        ]}
        onChange={() => {}}
        objects={[{ kind: "gate", pair: 1, placement: { type: "tile-slot", row: far.row, col: far.col, slot: 0 } }]}
        onObjectsChange={() => {}}
      />
    );
    return container;
  }

  it("docks the tile panel (no inline click-point left/top) and the ✕ button closes it", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true }
    ]);
    const popover = openTilePopover(container, 1);
    // Docked via CSS — NO inline positioning, so nothing anchors the panel to
    // the click point (the old clipping bug's root cause).
    expect((popover as HTMLElement).style.left, "no inline left").toBe("");
    expect((popover as HTMLElement).style.top, "no inline top").toBe("");
    // The header ✕ dismisses the panel.
    fireEvent.click(within(popover).getByRole("button", { name: "Close tile options" }));
    expect(container.querySelector(".designerPopover"), "panel closed").toBeNull();
  });

  it("docks the object panel (no inline left/top) and its ✕ closes it", () => {
    const container = renderTileAndObject();
    fireEvent.click(container.querySelector(".designerObjectToken")!);
    const panel = container.querySelector(".designerObjectPopover") as HTMLElement;
    expect(panel, "object panel open").toBeTruthy();
    expect(panel.style.left, "no inline left on the object panel").toBe("");
    expect(panel.style.top, "no inline top on the object panel").toBe("");
    fireEvent.click(within(panel).getByRole("button", { name: "Close object options" }));
    expect(container.querySelector(".designerObjectPopover"), "object panel closed").toBeNull();
  });

  it("never opens the tile and object panels at once (mutual exclusivity, both ways)", () => {
    const container = renderTileAndObject();

    // Open the OBJECT panel first — no tile panel is open.
    fireEvent.click(container.querySelector(".designerObjectToken")!);
    expect(container.querySelector(".designerObjectPopover"), "object panel open").toBeTruthy();
    expect(container.querySelector(".designerPopover:not(.designerObjectPopover)"), "no tile panel yet").toBeNull();

    // Click a TILE → the tile panel opens and the object panel closes (never both).
    openTilePopover(container, 0);
    expect(container.querySelector(".designerObjectPopover"), "object panel now closed").toBeNull();
    expect(container.querySelector(".designerPopover:not(.designerObjectPopover)"), "tile panel open").toBeTruthy();
    expect(container.querySelectorAll(".designerPopover").length, "exactly one panel").toBe(1);

    // Click the OBJECT again → the object panel re-opens and the tile panel closes.
    fireEvent.click(container.querySelector(".designerObjectToken")!);
    expect(container.querySelector(".designerObjectPopover"), "object panel re-open").toBeTruthy();
    expect(container.querySelector(".designerPopover:not(.designerObjectPopover)"), "tile panel closed").toBeNull();
    expect(container.querySelectorAll(".designerPopover").length, "still exactly one panel").toBe(1);
  });

  it("exposes the yellow-border panel summary for a tile FAR from the board origin", () => {
    // The clipping bug hid the border controls (and everything below the tile
    // grid) for any tile in the lower/right half of the board. jsdom can't
    // compute the clip, so this pins the WIRING — the border panel works for a
    // far-away tile exactly like a near-origin one — while the docked-panel CSS
    // fixes the visible half in the browser.
    const farAway = { row: town.row + 22, col: town.col + 16 };
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: farAway.row, col: farAway.col, group: "far", faceDown: true, borderEdges: [7] }
    ]);
    const popover = openTilePopover(container, 1);
    const summary = within(popover).getByLabelText("Tile yellow border edges");
    expect(summary, "border summary present for a far-away tile").toBeTruthy();
    expect(summary.textContent).toContain("1 border edge");
  });
});

describe("MapDesigner — on-board per-edge yellow border painting", () => {
  const town = { row: 10, col: 10 };
  const far = tileLatticeNeighbors(town)[1];
  const near = tileLatticeNeighbors(town)[0];

  /** The 🖌 Yellow-border arm/disarm button in the Objects palette. */
  function paintButton(container: HTMLElement): HTMLElement {
    const btn = container.querySelector(".designerObjectButton.borderPaint");
    if (!btn) {
      throw new Error("border-paint button not found");
    }
    return btn as HTMLElement;
  }

  /** A live edge zone by owner plan + canonical code (re-queried each stroke step). */
  function zoneByCode(container: HTMLElement, code: number, planIndex = 0): HTMLElement {
    const zone = container.querySelector(
      `.designerBorderEdgeZone[data-edge-code='${code}'][data-border-index='${planIndex}']`
    );
    if (!zone) {
      throw new Error(`no edge zone for code ${code} on plan ${planIndex}`);
    }
    return zone as HTMLElement;
  }

  it("arming shows exactly 30 per-edge zones for a lone tile; disarmed (default) renders none", () => {
    const container = renderDesigner([{ row: town.row, col: town.col, group: "starting", faceDown: false }]);
    // CONTROL: disarmed (default) → no zones.
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBe(0);

    fireEvent.click(paintButton(container));
    expect(paintButton(container).getAttribute("aria-pressed")).toBe("true");
    // A 7-hex flower has 30 physical edges (18 outer + 12 inner) — one zone each.
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBe(30);
  });

  it("pointerdown on a zone writes exactly ONE canonical code; a second toggles it off", () => {
    const { container, get } = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false }
    ]);
    fireEvent.click(paintButton(container));
    const first = container.querySelector(".designerBorderEdgeZone[data-border-index='0']") as HTMLElement;
    const code = Number(first.getAttribute("data-edge-code"));

    // A click (pointerdown+up) seals exactly that one canonical edge code.
    fireEvent.pointerDown(first, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(first, { pointerId: 1 });
    expect(get()[0].borderEdges).toEqual([code]);

    // The zone now reads active; clicking it again erases it (back to none).
    const again = zoneByCode(container, code);
    expect(again.classList.contains("active"), "sealed edge marked active").toBe(true);
    fireEvent.pointerDown(again, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(again, { pointerId: 1 });
    expect(get()[0].borderEdges).toBeUndefined();
  });

  it("a drag stroke (down, enter, enter) paints several edges; release ends it", () => {
    const { container, get } = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false }
    ]);
    fireEvent.click(paintButton(container));
    const codes = [...container.querySelectorAll(".designerBorderEdgeZone[data-border-index='0']")]
      .slice(0, 3)
      .map((zone) => Number(zone.getAttribute("data-edge-code")));
    const expected = [...codes].sort((a, b) => a - b);

    // Press the first, drag across two more (pointerenter continues the stroke).
    fireEvent.pointerDown(zoneByCode(container, codes[0]), { button: 0, pointerId: 1 });
    fireEvent.pointerEnter(zoneByCode(container, codes[1]), { pointerId: 1 });
    fireEvent.pointerEnter(zoneByCode(container, codes[2]), { pointerId: 1 });
    expect(get()[0].borderEdges).toEqual(expected);

    // Release ends the stroke: a later pointerenter over a fresh edge paints nothing.
    fireEvent.pointerUp(zoneByCode(container, codes[2]), { pointerId: 1 });
    const untouched = [...container.querySelectorAll(".designerBorderEdgeZone[data-border-index='0']")]
      .map((zone) => Number(zone.getAttribute("data-edge-code")))
      .find((code) => !codes.includes(code))!;
    fireEvent.pointerEnter(zoneByCode(container, untouched), { pointerId: 1 });
    expect(get()[0].borderEdges, "no paint after the stroke released").toEqual(expected);
  });

  it("a stroke that STARTS on an active edge erases the active edges it passes", () => {
    const { container, get } = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false }
    ]);
    fireEvent.click(paintButton(container));
    const [codeA, codeB] = [...container.querySelectorAll(".designerBorderEdgeZone[data-border-index='0']")]
      .slice(0, 2)
      .map((zone) => Number(zone.getAttribute("data-edge-code")));

    // Seal two edges first (two separate clicks).
    for (const code of [codeA, codeB]) {
      const zone = zoneByCode(container, code);
      fireEvent.pointerDown(zone, { button: 0, pointerId: 1 });
      fireEvent.pointerUp(zone, { pointerId: 1 });
    }
    expect(get()[0].borderEdges).toEqual([codeA, codeB].sort((a, b) => a - b));

    // Start a stroke ON an active edge (→ ERASE mode) and drag onto the other → both gone.
    fireEvent.pointerDown(zoneByCode(container, codeA), { button: 0, pointerId: 1 });
    fireEvent.pointerEnter(zoneByCode(container, codeB), { pointerId: 1 });
    fireEvent.pointerUp(zoneByCode(container, codeB), { pointerId: 1 });
    expect(get()[0].borderEdges).toBeUndefined();
  });

  it("a plan with legacy extraBorders converts to borderEdges on the first edit (arc folded in)", () => {
    // Legacy arc [1] = the E ring hex (footprint index 2); its three outer edges
    // are absolute directions 0,1,2 → codes 12,13,14.
    const arcCodes = [0, 1, 2].map((edgeDir) => canonicalTileEdgeCode(2, edgeDir));
    const { container, get } = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false, extraBorders: [1] }
    ]);
    fireEvent.click(paintButton(container));
    // Before any edit the legacy arc shows as its 3 ACTIVE expanded edges.
    for (const code of arcCodes) {
      expect(zoneByCode(container, code).classList.contains("active"), `arc edge ${code} active`).toBe(true);
    }

    // Draw a NEW inner edge (code 0 = centre↔ring[0]): the plan converts.
    fireEvent.pointerDown(zoneByCode(container, 0), { button: 0, pointerId: 1 });
    fireEvent.pointerUp(zoneByCode(container, 0), { pointerId: 1 });
    const plan = get()[0];
    expect(plan.extraBorders, "legacy arc cleared on first edit").toBeUndefined();
    // borderEdges now carries the 3 expanded arc codes PLUS the new edge.
    expect(plan.borderEdges).toEqual([...new Set([...arcCodes, 0])].sort((a, b) => a - b));
  });

  it("two adjacent plans share ONE zone for their shared edge; erase works whichever side stores it", () => {
    // Locate the physical shared edge between the town and its near neighbour.
    const townFootprint = tileFootprint(town, 0);
    const nearHexes = new Set(tileFootprint(near, 0).map(hexSpaceId));
    let townHex: HexCoord | undefined;
    let dir = -1;
    for (const hex of townFootprint) {
      for (let d = 0; d < 6; d += 1) {
        if (nearHexes.has(hexSpaceId(hexNeighbor(hex, d)))) {
          townHex = hex;
          dir = d;
          break;
        }
      }
      if (townHex) break;
    }
    if (!townHex) throw new Error("no shared edge between the two adjacent flowers");
    const townCode = canonicalTileEdgeCode(footprintIndexOf(town, townHex), dir);
    const nearHex = hexNeighbor(townHex, dir);
    const nearCode = canonicalTileEdgeCode(footprintIndexOf(near, nearHex), (dir + 3) % 6);

    // ONE zone represents this physical edge, owned by plan 0 (encountered first).
    const first = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: near.row, col: near.col, group: "near", faceDown: true }
    ]);
    fireEvent.click(paintButton(first.container));
    expect(
      first.container.querySelectorAll(`.designerBorderEdgeZone[data-edge-code='${townCode}'][data-border-index='0']`)
        .length,
      "exactly one deduped zone for the shared edge"
    ).toBe(1);
    // Drawing on it stores the code on the OWNER plan (0), leaving plan 1 untouched.
    fireEvent.pointerDown(zoneByCode(first.container, townCode), { button: 0, pointerId: 1 });
    fireEvent.pointerUp(zoneByCode(first.container, townCode), { pointerId: 1 });
    expect(first.get()[0].borderEdges).toEqual([townCode]);
    expect(first.get()[1].borderEdges).toBeUndefined();
    cleanup();

    // Erase-from-the-other-side: seed the SAME edge on the NEAR plan (plan 1).
    const other = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: near.row, col: near.col, group: "near", faceDown: true, borderEdges: [nearCode] }
    ]);
    fireEvent.click(paintButton(other.container));
    const shared = zoneByCode(other.container, townCode);
    // The zone is ACTIVE even though the code lives on the NON-owner plan.
    expect(shared.classList.contains("active"), "shared zone active from the other side").toBe(true);
    // Erasing clears it from whichever plan holds it (plan 1 here).
    fireEvent.pointerDown(shared, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(zoneByCode(other.container, townCode), { pointerId: 1 });
    expect(other.get()[1].borderEdges).toBeUndefined();
    expect(other.get()[0].borderEdges).toBeUndefined();
  });

  it("paints on a STARTING tile and a FACE-DOWN tile alike", () => {
    const startFixture = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false }
    ]);
    fireEvent.click(paintButton(startFixture.container));
    const startZone = startFixture.container.querySelector(
      ".designerBorderEdgeZone[data-border-index='0']"
    ) as HTMLElement;
    const startCode = Number(startZone.getAttribute("data-edge-code"));
    fireEvent.pointerDown(startZone, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(startZone, { pointerId: 1 });
    expect(startFixture.get()[0].group).toBe("starting");
    expect(startFixture.get()[0].borderEdges, "starting tile edge painted").toEqual([startCode]);
    cleanup();

    const downFixture = renderStatefulDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: near.row, col: near.col, group: "near", faceDown: true }
    ]);
    fireEvent.click(paintButton(downFixture.container));
    const downZone = downFixture.container.querySelector(
      ".designerBorderEdgeZone[data-border-index='1']"
    ) as HTMLElement;
    const downCode = Number(downZone.getAttribute("data-edge-code"));
    fireEvent.pointerDown(downZone, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(downZone, { pointerId: 1 });
    expect(downFixture.get()[1].faceDown).toBe(true);
    expect(downFixture.get()[1].borderEdges, "face-down tile edge painted").toEqual([downCode]);
  });

  it("a paint-zone press does not pan the board or open the tile panel (stopPropagation), and still paints", () => {
    // The board pan path calls setPointerCapture, which jsdom does not implement;
    // stub a no-op (restored after) so the CAMERA assertion — not an incidental
    // throw — is what signals a regression if stopPropagation is ever removed.
    const proto = Element.prototype as unknown as Record<string, unknown>;
    const hadCapture = Object.prototype.hasOwnProperty.call(proto, "setPointerCapture");
    const prevCapture = proto.setPointerCapture;
    proto.setPointerCapture = function () {};
    try {
      const { container, get } = renderStatefulDesigner([
        { row: town.row, col: town.col, group: "starting", faceDown: false }
      ]);
      fireEvent.click(paintButton(container));
      const cameraGroup = container.querySelector(".designerSvg > g")!;
      const transformBefore = cameraGroup.getAttribute("transform");
      const zone = container.querySelector(".designerBorderEdgeZone[data-border-index='0']") as HTMLElement;
      const code = Number(zone.getAttribute("data-edge-code"));
      // Press the zone, then move the pointer far enough to pan a BACKGROUND press.
      // `stopPropagation` on the zone's pointerdown keeps that press off the board,
      // so the SVG pan handler never arms — the camera transform is unchanged.
      fireEvent.pointerDown(zone, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
      fireEvent.pointerMove(zone, { pointerId: 1, clientX: 120, clientY: 120 });
      expect(cameraGroup.getAttribute("transform"), "board did not pan from the paint press").toBe(transformBefore);
      fireEvent.pointerUp(zone, { pointerId: 1 });
      // The press painted the edge, and no per-tile panel opened.
      expect(container.querySelector(".designerPopover"), "no tile panel opened").toBeNull();
      expect(get()[0].borderEdges, "the edge was painted by the press").toEqual([code]);
    } finally {
      if (hadCapture) {
        proto.setPointerCapture = prevCapture;
      } else {
        delete proto.setPointerCapture;
      }
    }
  });

  it("arming border paint disarms an armed object — and arming an object disarms border paint", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1" }
    ]);
    const monolith = [...container.querySelectorAll(".designerObjectButton")].find((btn) =>
      /Monolith/i.test(btn.textContent ?? "")
    ) as HTMLElement;
    const paint = paintButton(container);

    // Arm the Monolith → its candidate cells glow, no edge zones yet.
    fireEvent.click(monolith);
    expect(monolith.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".designerObjectSlot").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBe(0);

    // Arm border paint → the Monolith disarms (no candidate cells), edge zones appear.
    fireEvent.click(paint);
    expect(paint.getAttribute("aria-pressed")).toBe("true");
    expect(monolith.getAttribute("aria-pressed"), "monolith disarmed").toBe("false");
    expect(container.querySelectorAll(".designerObjectSlot").length, "no object candidates").toBe(0);
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBeGreaterThan(0);

    // Arm the Monolith again → border paint disarms, zones vanish.
    fireEvent.click(monolith);
    expect(monolith.getAttribute("aria-pressed")).toBe("true");
    expect(paint.getAttribute("aria-pressed"), "border paint disarmed").toBe("false");
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBe(0);
  });

  it("a zone whose edge already carries a per-edge border reads active; a bare edge does not", () => {
    // Seed the plan with one canonical inner-edge code (0 = centre↔ring[0]).
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false, borderEdges: [0] }
    ]);
    fireEvent.click(paintButton(container));
    expect(zoneByCode(container, 0).classList.contains("active"), "seeded edge active").toBe(true);
    // CONTROL: a different edge on the same tile is not active.
    const otherCode = [...container.querySelectorAll(".designerBorderEdgeZone[data-border-index='0']")]
      .map((zone) => Number(zone.getAttribute("data-edge-code")))
      .find((code) => code !== 0)!;
    expect(zoneByCode(container, otherCode).classList.contains("active")).toBe(false);
  });
});
