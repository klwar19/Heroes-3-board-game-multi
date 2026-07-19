// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MapDesigner, planBackArt, planBackLabel } from "./map-designer";
import { nearestGateDragCandidate, nearestGateHexPair, type GateDragCandidate, type GateHexPair } from "./gate-drag";
import { allTileDefinitions } from "@/data/map/tiles";
import { registerFieldOverrideDefinitions } from "@/data/map/field-overrides";
import {
  canonicalTileEdgeCode,
  hexNeighbor,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  legalGateHexPairs,
  legalTokenSlotsForTileDef,
  planSubterraneanGates,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  type CustomHexEvent,
  type CustomMapObject,
  type CustomMapTilePlan,
  type HexCoord
} from "@/engine";

afterEach(cleanup);

// Every SHIPPED Field Override kind now has hex art (2026-07), so the art-less
// glyph fallback is pinned via a TEST-ONLY registered kind.
registerFieldOverrideDefinitions({
  test_glyph_kind: {
    id: "test_glyph_kind",
    locationId: "anime.test_glyph_kind",
    name: "Test Glyph Kind",
    package: "anime-xianxia",
    tileGroups: ["far"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Test-only art-less kind pinning the designer glyph fallback.",
    glyph: "🧪"
  }
});

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

describe("MapDesigner — tier-band outline colours + legend", () => {
  // Outline colours mirror the creature-tier ladder (Ⅰ bronze, Ⅱ–Ⅲ silver,
  // Ⅳ–Ⅴ gold, Ⅵ–Ⅶ azure) with a light-blue sea and the kept purple underground.
  // jsdom leaves an inline SVG `stroke` hex un-normalised, so we assert the raw hex.
  const BAND_STROKE: Record<string, string> = {
    starting: "#b46f33",
    far: "#c7ccd6",
    near: "#e7b73c",
    center: "#3f7fd6",
    sea: "#8fd8ff",
    subterranean: "#7a5a9e"
  };

  // jsdom normalises the CSS `background` shorthand hex to `rgb(...)`.
  const hexToRgb = (hex: string): string => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  it("strokes each tile's outline in its creature-tier band colour", () => {
    const town = { row: 10, col: 10 };
    const spots = tileLatticeNeighbors(town);
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true },
      { row: spots[1].row, col: spots[1].col, group: "near", faceDown: true },
      { row: spots[2].row, col: spots[2].col, group: "center", faceDown: true },
      { row: spots[3].row, col: spots[3].col, group: "sea", faceDown: true, seaBand: "iv-v" },
      { row: spots[4].row, col: spots[4].col, group: "subterranean", faceDown: true, subBand: "iv-v" }
    ]);
    for (const [group, hex] of Object.entries(BAND_STROKE)) {
      const outline = container.querySelector(
        `.designerFlowerOutline[data-band-group="${group}"]`
      ) as SVGElement | null;
      expect(outline, `outline path for the ${group} band`).toBeTruthy();
      expect((outline as SVGElement).style.stroke, `${group} band stroke`).toBe(hex);
    }
  });

  it("a selected tile's outline override beats its band colour (control)", () => {
    const town = { row: 10, col: 10 };
    const spots = tileLatticeNeighbors(town);
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ]);
    const before = container.querySelector(
      '.designerFlowerOutline[data-band-group="near"]'
    ) as SVGElement;
    // CONTROL: unselected, it wears the Near band gold.
    expect(before.style.stroke, "unselected Near band gold").toBe("#e7b73c");
    // Select plan 1 (its click opens the docked options panel).
    openTilePopover(container, 1);
    const after = container.querySelector(
      '.designerFlowerOutline[data-band-group="near"]'
    ) as SVGElement;
    expect(after.classList.contains("selected"), "selected modifier applied").toBe(true);
    expect(after.style.stroke, "selection gold overrides the band gold").toBe("#ffd766");
  });

  it("renders a band-colour legend with the six group swatches + labels", () => {
    const container = renderDesigner([{ row: 10, col: 10, group: "starting", faceDown: false }]);
    const legend = container.querySelector(".designerBandLegend");
    expect(legend, "band legend present").toBeTruthy();
    const items = legend!.querySelectorAll(".designerBandLegendItem");
    expect(items.length, "one entry per DesignGroup").toBe(6);
    const seen: string[] = [];
    for (const item of Array.from(items)) {
      const group = item.getAttribute("data-band-group")!;
      seen.push(group);
      const swatch = item.querySelector(".designerBandLegendSwatch") as HTMLElement;
      expect(swatch.style.background, `${group} swatch colour`).toBe(hexToRgb(BAND_STROKE[group]));
    }
    expect(seen, "legend order weakest → sea/underground").toEqual([
      "starting",
      "far",
      "near",
      "center",
      "sea",
      "subterranean"
    ]);
    // Labels read from the shared engine band-label map (TILE_GROUP_BAND_LABELS).
    for (const label of ["Ⅰ", "Ⅱ–Ⅲ", "Ⅳ–Ⅴ", "Ⅵ–Ⅶ", "Sea", "Underground"]) {
      expect(legend!.textContent, `legend shows ${label}`).toContain(label);
    }
  });
});

describe("MapDesigner — clustered pre-board chrome", () => {
  const loneTown = [{ row: 10, col: 10, group: "starting" as const, faceDown: false }];

  it("renders three labeled clusters in order (Tiles → Objects & teleporters → Tools)", () => {
    const container = renderDesigner(loneTown);
    const clusters = [...container.querySelectorAll(".designerCluster")] as HTMLElement[];
    expect(clusters.length, "three clusters").toBe(3);
    const labels = clusters.map((c) => c.querySelector(".designerClusterLabel")?.textContent?.trim());
    expect(labels, "labels in reading order").toEqual(["Tiles", "Objects & teleporters", "Tools"]);

    const [tiles, objects, tools] = clusters;
    // The tile palette lives in the Tiles cluster.
    expect(tiles.querySelector(".designerPalette"), "tile palette in Tiles cluster").toBeTruthy();
    // Placeable objects / teleporters live in the Objects cluster.
    expect(objects.querySelector(".designerObjectPalette"), "object palette in Objects cluster").toBeTruthy();
    expect(
      objects.querySelector('.designerObjectButton[data-gate-pair="1"]'),
      "a Teleport Gate button in Objects cluster"
    ).toBeTruthy();
    // Mode-arming tools live in the Tools cluster.
    expect(tools.querySelector(".designerObjectButton.borderPaint"), "border tool in Tools cluster").toBeTruthy();
    expect(
      tools.querySelector('[data-testid="designer-mod-panel-toggle"]'),
      "Mod toggle in Tools cluster"
    ).toBeTruthy();
    // …and are NOT cross-contaminated between clusters.
    expect(objects.querySelector(".designerObjectButton.borderPaint"), "border tool NOT in Objects cluster").toBeNull();
    expect(tools.querySelector(".designerObjectPalette"), "object palette NOT in Tools cluster").toBeNull();
    expect(tiles.querySelector(".designerObjectPalette"), "object palette NOT in Tiles cluster").toBeNull();
  });

  it("integrates the band legend inside the Tiles cluster (same card as the palette)", () => {
    const container = renderDesigner(loneTown);
    const tiles = container.querySelector(".designerClusterTiles");
    expect(tiles, "Tiles cluster present").toBeTruthy();
    const body = tiles!.querySelector(".designerClusterBody");
    expect(body!.querySelector(".designerPalette"), "palette in the Tiles card body").toBeTruthy();
    expect(body!.querySelector(".designerBandLegend"), "band legend in the same Tiles card body").toBeTruthy();
    // The legend no longer floats between the two palettes at the designer root.
    expect(
      [...container.children].some((c) => c.classList.contains("designerBandLegend")),
      "band legend is not a bare mapDesigner child"
    ).toBe(false);
  });

  it("collapses the walkthrough help into a closed <details> that keeps the verbatim text", () => {
    const container = renderDesigner(loneTown);
    const help = container.querySelector("details.designerHelp") as HTMLDetailsElement | null;
    expect(help, "help details present").toBeTruthy();
    expect(help!.open, "collapsed by default").toBe(false);
    expect(help!.querySelector(".designerHelpSummary")?.textContent).toContain("How the designer works");
    // The original walkthrough is preserved verbatim inside .optionHint.
    const hint = help!.querySelector(".optionHint");
    expect(hint, "optionHint kept inside the details").toBeTruthy();
    expect(hint!.textContent).toContain("Drag a tile from the palette onto the board");
    expect(hint!.textContent).toContain("Subterranean Gate");
  });

  it("arming the border tool flips its button to the armed styling class (behavior, not decoration)", () => {
    const container = renderDesigner(loneTown);
    const btn = container.querySelector(".designerObjectButton.borderPaint") as HTMLElement;
    expect(btn, "border tool button present").toBeTruthy();
    // It carries the shared tool-button class that gives the outlined tool look.
    expect(btn.classList.contains("designerToolButton"), "border tool tagged designerToolButton").toBe(true);
    expect(btn.classList.contains("armed"), "not armed at rest").toBe(false);
    fireEvent.click(btn);
    expect(btn.classList.contains("armed"), "armed after click").toBe(true);
    fireEvent.click(btn);
    expect(btn.classList.contains("armed"), "disarmed after a second click").toBe(false);
  });
});

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
    const picker = popover.querySelector(".popoverCenterHex");
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
    // Settlement customization may still appear; the center Ⅶ block must not.
    expect(popover.querySelector(".popoverCenterHex")).toBeNull();
  });

  it("a pinned Field Override with NO art draws its fallback glyph on the map", () => {
    // Art-less kinds (test-only registered — all shipped kinds have art now)
    // must still show a glyph marker so the pin is a visible hex, not skipped.
    const container = renderDesigner([
      { row: 8, col: 2, group: "starting", faceDown: false },
      { row: 9, col: 4, group: "far", faceDown: false, tileDefId: "F1", fieldOverrides: [{ kind: "test_glyph_kind", slot: 0 }] }
    ]);
    const glyph = container.querySelector('[data-testid="designer-fo-glyph-test_glyph_kind"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("CONTROL: a wave-1 kind WITH art draws its image, not the glyph fallback", () => {
    const container = renderDesigner([
      { row: 8, col: 2, group: "starting", faceDown: false },
      { row: 9, col: 4, group: "far", faceDown: false, tileDefId: "F1", fieldOverrides: [{ kind: "kiem_trung", slot: 0 }] }
    ]);
    // No glyph marker for an art-backed kind…
    expect(container.querySelector('[data-testid="designer-fo-glyph-kiem_trung"]')).toBeNull();
    // …and its art image IS drawn.
    const art = Array.from(container.querySelectorAll(".designerMapTokenArt")).some((img) =>
      (img.getAttribute("href") ?? "").includes("kiem_trung.webp")
    );
    expect(art).toBe(true);
  });

  it("edits the center-hex reward + Victory Points on a PLAIN center (no objective forced) and writes centerHex", () => {
    const onChange = vi.fn();
    const container = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 9, col: 4, group: "center", faceDown: true }
      ],
      onChange
    );
    const popover = openTilePopover(container, 1);

    // The editor is visible WITHOUT any objective designation (the old build
    // hid it behind one — "click on tile VI-VII … BUT NOTHING THERE").
    fireEvent.change(within(popover as HTMLElement).getByLabelText(/Center hex reward Gold/i), {
      target: { value: "7" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ centerHex: { reward: { gold: 7 } } })])
    );

    // A flexible reward kind (Treasure dice) rides the same reward object…
    fireEvent.change(within(popover as HTMLElement).getByLabelText(/Center hex reward Treasure dice/i), {
      target: { value: "2" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ centerHex: { reward: { treasureDice: 2 } } })])
    );

    // …and a Victory-Points value writes centerHex.vp.
    fireEvent.change(within(popover as HTMLElement).getByLabelText(/Center hex reward victory points/i), {
      target: { value: "4" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ centerHex: { vp: 4 } })])
    );
  });

  it("edits the center-hex guard: a level chip writes {level}, Exact army collects unit ids", () => {
    const onChange = vi.fn();
    const container = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 9, col: 4, group: "center", faceDown: true }
      ],
      onChange
    );
    const popover = openTilePopover(container, 1);
    const centerBlock = popover.querySelector(".popoverCenterHex") as HTMLElement;

    // A level chip writes a level guard (scoped to the center block — settlement has its own).
    fireEvent.click(within(centerBlock).getByRole("button", { name: "Ⅲ" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ centerHex: { guard: { level: 3 } } })])
    );

    // Exact army mode + adding a unit writes a units guard.
    const armed = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 9, col: 4, group: "center", faceDown: true, centerHex: { guard: { units: [] } } }
      ],
      onChange
    );
    const armyPopover = openTilePopover(armed, 1);
    fireEvent.change(within(armyPopover as HTMLElement).getByLabelText(/Add a named guard unit/i), {
      target: { value: "neutral.cyclopes" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ centerHex: { guard: { units: ["neutral.cyclopes"] } } })])
    );

    // Quick +Gold appends a random-tier slot (controlled re-render for each add).
    let armyUnits: string[] = [];
    const addGold = () => {
      const mixed = renderDesigner(
        [
          { row: 8, col: 2, group: "starting", faceDown: false },
          {
            row: 9,
            col: 4,
            group: "center",
            faceDown: true,
            centerHex: { guard: { units: [...armyUnits] } }
          }
        ],
        onChange
      );
      const mixedPopover = openTilePopover(mixed, 1);
      fireEvent.click(within(mixedPopover as HTMLElement).getByRole("button", { name: "+ Gold" }));
      const last = onChange.mock.calls.at(-1)![0] as { centerHex?: { guard?: { units?: string[] } } }[];
      armyUnits = last.find((p) => p.centerHex)?.centerHex?.guard?.units ?? [];
    };
    addGold();
    addGold();
    addGold();
    expect(armyUnits).toEqual(["random:gold", "random:gold", "random:gold"]);
  });

  it("center-hex reward Times × Search(X) writes search size and times", () => {
    const onChange = vi.fn();
    const container = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 9, col: 4, group: "center", faceDown: true }
      ],
      onChange
    );
    const popover = openTilePopover(container, 1);
    fireEvent.change(within(popover as HTMLElement).getByLabelText(/Center hex reward Artifacts Search size/i), {
      target: { value: "5" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ centerHex: { reward: { searchArtifact: 5 } } })])
    );

    // Controlled re-render with size already set so Times is enabled.
    const withSize = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        {
          row: 9,
          col: 4,
          group: "center",
          faceDown: true,
          centerHex: { reward: { searchArtifact: 5 } }
        }
      ],
      onChange
    );
    const sizedPopover = openTilePopover(withSize, 1);
    fireEvent.change(within(sizedPopover as HTMLElement).getByLabelText(/Center hex reward Artifacts Search times/i), {
      target: { value: "2" }
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          centerHex: { reward: { searchArtifact: 5, searchArtifactTimes: 2 } }
        })
      ])
    );
  });

  it("picking Default clears only the objective — the center-hex customization stays", () => {
    const onChange = vi.fn();
    const container = renderDesigner(
      [
        { row: 8, col: 2, group: "starting", faceDown: false },
        { row: 9, col: 4, group: "center", faceDown: true, viiField: "grail", centerHex: { reward: { gold: 5 }, vp: 3 } }
      ],
      onChange
    );
    const popover = openTilePopover(container, 1);
    fireEvent.click(within(popover as HTMLElement).getByRole("button", { name: "Default" }));
    const lastPlans = onChange.mock.calls.at(-1)![0] as { group: string; viiField?: unknown; centerHex?: unknown }[];
    const center = lastPlans.find((plan) => plan.group === "center")!;
    expect(center.viiField).toBeUndefined();
    expect(center.centerHex, "customization survives an objective reset").toEqual({ reward: { gold: 5 }, vp: 3 });
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

    // Switch to Secret → mode handler sets a default landmark SET; re-render to see cards.
    fireEvent.click(scope.getByRole("button", { name: /Secret/i }));
    expect(latest[1]?.secretFeatures?.length, "Secret mode sets a default landmark").toBeGreaterThan(0);

    cleanup();
    const secretMap: CustomMapTilePlan[] = [
      latest[0],
      { ...latest[1], faceDown: true, secretFeatures: latest[1].secretFeatures }
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

  it("One of mode: builds a random tile list (multi-select), placed face-up", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);

    // A fourth mode card offers "One of these tiles".
    fireEvent.click(within(popover).getByRole("button", { name: /One of/i }));
    // The slot becomes a face-up "one of" list seeded with one tile.
    expect(latest[1]?.faceDown, "one-of is a face-up slot").toBe(false);
    expect(latest[1]?.tileDefId, "no exact pin").toBeUndefined();
    expect(latest[1]?.oneOfTileDefIds?.length, "seeded with one tile").toBe(1);
    const firstId = latest[1].oneOfTileDefIds![0];

    // Re-render in one-of mode and add a SECOND tile from the grid (multi-select).
    cleanup();
    const container2 = renderDesigner([latest[0], { ...latest[1] }], onChange);
    const popover2 = openTilePopover(container2, 1);
    const cards = [...popover2.querySelectorAll(".popoverTileCard")] as HTMLButtonElement[];
    const another = cards.find((card) => !card.disabled && !card.className.includes("selected"));
    expect(another, "a second selectable tile card exists").toBeTruthy();
    fireEvent.click(another!);
    expect(latest[1]?.oneOfTileDefIds?.length, "second tile added to the set").toBe(2);
    expect(latest[1]?.oneOfTileDefIds, "keeps the first tile").toContain(firstId);
    expect(latest[1]?.tileDefId, "still no exact pin in a 2-tile set").toBeUndefined();
  });

  it("Secret mode multi-selects landmarks (valuables OR gold), and re-tapping removes one", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: spots[0].row, col: spots[0].col, group: "near", faceDown: true, secretFeatures: ["gold_mine"] }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const container = renderDesigner(latest, onChange);
    const popover = openTilePopover(container, 1);
    // Tap a SECOND landmark → both are allowed (an OR set).
    const valuablesCard = [...popover.querySelectorAll(".popoverFeatureCard")].find((card) =>
      /Valuables mine/i.test(card.textContent ?? "")
    ) as HTMLElement;
    expect(valuablesCard, "Valuables mine card listed").toBeTruthy();
    fireEvent.click(valuablesCard);
    expect(new Set(latest[1]?.secretFeatures)).toEqual(new Set(["gold_mine", "valuables_mine"]));

    // Re-render with both, then re-tap gold → only valuables remains.
    cleanup();
    const both: CustomMapTilePlan[] = [
      latest[0],
      { ...latest[1], secretFeatures: ["gold_mine", "valuables_mine"] }
    ];
    const container2 = renderDesigner(both, onChange);
    const popover2 = openTilePopover(container2, 1);
    const goldCard = [...popover2.querySelectorAll(".popoverFeatureCard")].find((card) =>
      /Gold mine/i.test(card.textContent ?? "")
    ) as HTMLElement;
    fireEvent.click(goldCard);
    expect(latest[1]?.secretFeatures).toEqual(["valuables_mine"]);
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
    // Mode cards use Homm3BG glyphs too (Random / Secret / Face-up / One of).
    expect(popover.querySelectorAll(".popoverModeGlyph").length).toBe(4);
  });

  it("clicking Secret then a landmark stores the secretFeatures set (not a specific tile)", () => {
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
    // setSelectedSlotMode already sets a default landmark set; re-render if needed.
    const afterMode = latest[1] ?? onChange.mock.calls.at(-1)?.[0]?.[1];
    expect(afterMode?.faceDown).toBe(true);
    expect(afterMode?.secretFeatures?.length, "default feature set on Secret mode").toBeGreaterThan(0);
    expect(afterMode?.tileDefId).toBeUndefined();

    // Tapping Obelisk toggles it into the allowed set (re-open with current state).
    cleanup();
    const withFeature: CustomMapTilePlan[] = [
      map[0],
      { ...map[1], faceDown: true, secretFeatures: afterMode!.secretFeatures }
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
    expect(featureLatest[1]?.secretFeatures).toContain("obelisk");
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

describe("MapDesigner — cross-surface gate drag (pick the connected tile)", () => {
  // The core fix: a cavern touching SEVERAL Surface tiles auto-pairs its gate to
  // one, but a drag can carry the gate onto a DIFFERENT touching tile — the user
  // picks the connected tile by direct manipulation, not just slides it along the
  // one surface. Uses two ADJACENT touching Surface tiles (they share a cavern
  // entrance hex, so the collision case below is real).
  const HEX = 24;
  const cavern = { row: 10, col: 10 };
  const neighbors = tileLatticeNeighbors(cavern);
  const surfaceA = neighbors[0]; // { row: 11, col: 12 }
  const surfaceB = neighbors[2]; // { row: 8, col: 12 } — adjacent to surfaceA

  const sameCoord = (a: { row: number; col: number }, b: { row: number; col: number }): boolean =>
    a.row === b.row && a.col === b.col;
  const midpointOf = (pair: GateHexPair) => {
    const gate = hexToPixel(pair.gateHex, HEX);
    const entrance = hexToPixel(pair.entranceHex, HEX);
    return { x: (gate.x + entrance.x) / 2, y: (gate.y + entrance.y) / 2 };
  };

  // The single automatic gate this two-surface layout carves, and the surface it
  // lands on (so a test can drop on the OTHER, free surface).
  const autoGate = planSubterraneanGates(
    [
      { row: surfaceA.row, col: surfaceA.col, group: "starting" },
      { row: surfaceB.row, col: surfaceB.col, group: "far" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ],
    []
  );
  const autoSurface = { row: autoGate[0].surfaceCenter.row, col: autoGate[0].surfaceCenter.col };
  const freeSurface = sameCoord(autoSurface, surfaceA) ? surfaceB : surfaceA;

  const CAVERN_INDEX = 2;
  const twoSurfaceMap = (cavernExtra: Partial<CustomMapTilePlan> = {}): CustomMapTilePlan[] => [
    { row: surfaceA.row, col: surfaceA.col, group: "starting", faceDown: false },
    { row: surfaceB.row, col: surfaceB.col, group: "far", faceDown: true },
    { row: cavern.row, col: cavern.col, group: "subterranean", faceDown: true, subBand: "iv-v", ...cavernExtra }
  ];

  /** The gate-token <image> drawn at a given hex (matches its x/y attributes). */
  const gateTokenAt = (container: HTMLElement, hex: HexCoord): Element | undefined => {
    const px = hexToPixel(hex, HEX);
    const tokenWidth = Math.sqrt(3) * HEX;
    return [...container.querySelectorAll(".designerGateToken")].find(
      (img) =>
        Math.abs(parseFloat(img.getAttribute("x") ?? "NaN") - (px.x - tokenWidth / 2)) < 0.5 &&
        Math.abs(parseFloat(img.getAttribute("y") ?? "NaN") - (px.y - HEX)) < 0.5
    );
  };

  it("preconditions: one cavern, two touching surfaces, exactly one auto gate on one of them", () => {
    expect(tileFootprintsTouch(surfaceA, cavern)).toBe(true);
    expect(tileFootprintsTouch(surfaceB, cavern)).toBe(true);
    expect(autoGate.length).toBe(1);
    expect(sameCoord(autoSurface, surfaceA) || sameCoord(autoSurface, surfaceB)).toBe(true);
    expect(sameCoord(freeSurface, autoSurface)).toBe(false);
  });

  it("dragging the AUTO gate onto the OTHER surface RE-TARGETS the link there (S1 pairing gone)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const target = legalGateHexPairs(freeSurface, cavern)[0];
      // Sanity: over the FULL cross-surface candidate set, the freeSurface target's
      // own midpoint snaps to exactly it and keeps its surface (pinned in gate-drag.test.ts).
      const allCandidates: GateDragCandidate[] = [
        ...legalGateHexPairs(surfaceA, cavern).map((pair) => ({ ...pair, surfaceCenter: surfaceA })),
        ...legalGateHexPairs(surfaceB, cavern).map((pair) => ({ ...pair, surfaceCenter: surfaceB }))
      ];
      expect(sameCoord(nearestGateDragCandidate(midpointOf(target), allCandidates, HEX)!.surfaceCenter, freeSurface)).toBe(true);

      let latest = twoSurfaceMap();
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />);
      const token = container.querySelector(".designerGateToken");
      expect(token!.classList.contains("designed"), "starts as an automatic gate").toBe(false);
      const grabAt = midpointOf({ gateHex: autoGate[0].gateHex, entranceHex: autoGate[0].entranceHex });
      const dropAt = midpointOf(target);
      fireEvent.pointerDown(token!, { button: 0, pointerId: 3, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 3, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 3 });

      // The link now points at the FREE surface — the automatic pairing is gone.
      expect(latest[CAVERN_INDEX].gateLinks).toEqual([
        {
          surface: { row: freeSurface.row, col: freeSurface.col },
          gateHex: hexSpaceId(target.gateHex),
          entranceHex: hexSpaceId(target.entranceHex)
        }
      ]);
    } finally {
      restore();
    }
  });

  it("CONTROL: dropping the auto gate on a pair of its OWN surface pins that surface (today's behavior)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const autoPairs = legalGateHexPairs(autoSurface, cavern);
      const start = { gateHex: autoGate[0].gateHex, entranceHex: autoGate[0].entranceHex };
      const target = autoPairs.find(
        (pair) =>
          hexSpaceId(pair.gateHex) !== hexSpaceId(start.gateHex) ||
          hexSpaceId(pair.entranceHex) !== hexSpaceId(start.entranceHex)
      )!;
      let latest = twoSurfaceMap();
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />);
      const token = container.querySelector(".designerGateToken")!;
      fireEvent.pointerDown(token, { button: 0, pointerId: 3, clientX: midpointOf(start).x, clientY: midpointOf(start).y });
      fireEvent.pointerMove(window, { pointerId: 3, clientX: midpointOf(target).x, clientY: midpointOf(target).y });
      fireEvent.pointerUp(window, { pointerId: 3 });
      expect(latest[CAVERN_INDEX].gateLinks).toEqual([
        {
          surface: { row: autoSurface.row, col: autoSurface.col },
          gateHex: hexSpaceId(target.gateHex),
          entranceHex: hexSpaceId(target.entranceHex)
        }
      ]);
    } finally {
      restore();
    }
  });

  it("dragging a DESIGNED gate to another surface REPLACES the link (not appended alongside)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const designedGate = planSubterraneanGates(
        [
          { row: surfaceA.row, col: surfaceA.col, group: "starting" },
          { row: surfaceB.row, col: surfaceB.col, group: "far" },
          { row: cavern.row, col: cavern.col, group: "subterranean" }
        ],
        [{ surfaceCenter: surfaceA, cavernCenter: cavern }]
      )[0];
      const target = legalGateHexPairs(surfaceB, cavern)[0];

      let latest = twoSurfaceMap({ gateLinks: [{ surface: { row: surfaceA.row, col: surfaceA.col } }] });
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />);
      const token = container.querySelector(".designerGateToken.designed");
      expect(token, "the designed surfaceA gate token").toBeTruthy();
      fireEvent.pointerDown(token!, {
        button: 0,
        pointerId: 4,
        clientX: midpointOf({ gateHex: designedGate.gateHex, entranceHex: designedGate.entranceHex }).x,
        clientY: midpointOf({ gateHex: designedGate.gateHex, entranceHex: designedGate.entranceHex }).y
      });
      fireEvent.pointerMove(window, { pointerId: 4, clientX: midpointOf(target).x, clientY: midpointOf(target).y });
      fireEvent.pointerUp(window, { pointerId: 4 });

      // Exactly ONE link, now to surfaceB — the surfaceA entry is replaced, not kept.
      expect(latest[CAVERN_INDEX].gateLinks).toEqual([
        {
          surface: { row: surfaceB.row, col: surfaceB.col },
          gateHex: hexSpaceId(target.gateHex),
          entranceHex: hexSpaceId(target.entranceHex)
        }
      ]);
    } finally {
      restore();
    }
  });

  it("with designed links to BOTH surfaces, dragging one now OFFERS the other surface — minus the pairs that collide with its pinned hexes", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const pairsA = legalGateHexPairs(surfaceA, cavern);
      const pairsB = legalGateHexPairs(surfaceB, cavern);
      const entA = new Set(pairsA.map((pair) => hexSpaceId(pair.entranceHex)));
      // surfaceB pinned to the pair sharing a cavern entrance with surfaceA — so a
      // surfaceA pair reusing that entrance is a REAL collision the filter must drop.
      const pinnedB = pairsB.find((pair) => entA.has(hexSpaceId(pair.entranceHex)))!;
      expect(pinnedB, "a surfaceB pair sharing a cavern entrance with surfaceA exists").toBeTruthy();
      const sharedEntrance = hexSpaceId(pinnedB.entranceHex);
      expect(pairsA.some((pair) => hexSpaceId(pair.entranceHex) === sharedEntrance), "the colliding surfaceA pair exists").toBe(true);
      const pinnedA = pairsA.find((pair) => hexSpaceId(pair.entranceHex) !== sharedEntrance)!;

      let latest = twoSurfaceMap({
        gateLinks: [
          { surface: { row: surfaceA.row, col: surfaceA.col }, gateHex: hexSpaceId(pinnedA.gateHex), entranceHex: hexSpaceId(pinnedA.entranceHex) },
          { surface: { row: surfaceB.row, col: surfaceB.col }, gateHex: hexSpaceId(pinnedB.gateHex), entranceHex: hexSpaceId(pinnedB.entranceHex) }
        ]
      });
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />);

      // Grab the surfaceA gate specifically (there are two designed gates now).
      const token = gateTokenAt(container, pinnedA.gateHex);
      expect(token, "the surfaceA gate token").toBeTruthy();
      fireEvent.pointerDown(token!, { button: 0, pointerId: 5, clientX: midpointOf(pinnedA).x, clientY: midpointOf(pinnedA).y });
      fireEvent.pointerMove(window, { pointerId: 5, clientX: midpointOf(pinnedB).x, clientY: midpointOf(pinnedB).y });

      const ghosts = [...container.querySelectorAll(".designerGateGhost")];
      const ghostSurfaces = new Set(ghosts.map((ghost) => ghost.getAttribute("data-ghost-surface")));
      // NEW RULE: the ALREADY-LINKED other surface is offered too (a second gate
      // there is legal now) — the claimed-surface exclusion is gone.
      expect(ghostSurfaces.has(`${surfaceA.row}:${surfaceA.col}`), "surfaceA is offered").toBe(true);
      expect(ghostSurfaces.has(`${surfaceB.row}:${surfaceB.col}`), "surfaceB is now offered too").toBe(true);
      // KEPT: no offered pair reuses surfaceB's OWN pinned hexes (two gates can't
      // share a board hex), so the surfaceA gate can never land on surfaceB's spot.
      expect(new Set(ghosts.map((ghost) => ghost.getAttribute("data-ghost-entrance"))).has(sharedEntrance)).toBe(false);
      expect(new Set(ghosts.map((ghost) => ghost.getAttribute("data-ghost-gate"))).has(hexSpaceId(pinnedB.gateHex))).toBe(false);

      fireEvent.pointerUp(window, { pointerId: 5 });
      // The pointer sat on surfaceB's excluded pin, so the snap went to some OTHER
      // offered pair; whatever it is, the surfaceA entry MOVED (index 0 rewritten),
      // surfaceB's pin is untouched, and the two gates still never share a hex.
      const links = latest[CAVERN_INDEX].gateLinks!;
      expect(links.length).toBe(2);
      const bLink = links[1];
      expect(bLink, "surfaceB's pinned link is untouched").toEqual({
        surface: { row: surfaceB.row, col: surfaceB.col },
        gateHex: hexSpaceId(pinnedB.gateHex),
        entranceHex: hexSpaceId(pinnedB.entranceHex)
      });
      const movedLink = links[0];
      expect(movedLink.gateHex).not.toBe(bLink.gateHex);
      expect(movedLink.entranceHex).not.toBe(bLink.entranceHex);
    } finally {
      restore();
    }
  });

  it("renders ghost candidate markers for BOTH surfaces during a live drag, gone on pointerup", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      let latest = twoSurfaceMap();
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />);
      expect(container.querySelectorAll(".designerGateGhost").length, "no ghosts before a drag").toBe(0);

      const token = container.querySelector(".designerGateToken")!;
      const grabAt = midpointOf({ gateHex: autoGate[0].gateHex, entranceHex: autoGate[0].entranceHex });
      const dropAt = midpointOf(legalGateHexPairs(freeSurface, cavern)[0]);
      fireEvent.pointerDown(token, { button: 0, pointerId: 6, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 6, clientX: dropAt.x, clientY: dropAt.y });

      const ghosts = [...container.querySelectorAll(".designerGateGhost")];
      const surfaces = new Set(ghosts.map((ghost) => ghost.getAttribute("data-ghost-surface")));
      expect(surfaces.has(`${surfaceA.row}:${surfaceA.col}`), "surfaceA ghosted").toBe(true);
      expect(surfaces.has(`${surfaceB.row}:${surfaceB.col}`), "surfaceB ghosted too").toBe(true);
      // Two circles per candidate across both surfaces.
      const totalPairs = legalGateHexPairs(surfaceA, cavern).length + legalGateHexPairs(surfaceB, cavern).length;
      expect(ghosts.length).toBe(2 * totalPairs);
      expect(container.querySelector(".designerGateGhost.hover"), "the snapped pair is highlighted").toBeTruthy();

      fireEvent.pointerUp(window, { pointerId: 6 });
      expect(container.querySelectorAll(".designerGateGhost").length, "ghosts vanish on release").toBe(0);
    } finally {
      restore();
    }
  });

  it("Escape mid-drag clears the ghost candidate markers", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={twoSurfaceMap()} onChange={() => {}} hexSize={HEX} />);
      const token = container.querySelector(".designerGateToken")!;
      const grabAt = midpointOf({ gateHex: autoGate[0].gateHex, entranceHex: autoGate[0].entranceHex });
      const dropAt = midpointOf(legalGateHexPairs(freeSurface, cavern)[0]);
      fireEvent.pointerDown(token, { button: 0, pointerId: 6, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 6, clientX: dropAt.x, clientY: dropAt.y });
      expect(container.querySelectorAll(".designerGateGhost").length).toBeGreaterThan(0);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(container.querySelectorAll(".designerGateGhost").length, "Escape clears the ghosts").toBe(0);
    } finally {
      restore();
    }
  });

  it("the AUTOMATIC gate wears the `automatic` class (a visible default), replaced by `designed` once pinned", () => {
    const auto = renderDesigner(twoSurfaceMap());
    expect(auto.querySelector(".designerGateToken.automatic"), "auto gate token marked automatic").toBeTruthy();
    expect(auto.querySelector(".designerGateLink.automatic"), "auto gate link marked automatic").toBeTruthy();
    expect(auto.querySelector(".designerGateToken.designed"), "not designed while automatic").toBeNull();
    expect(auto.querySelector(".designerGatePin"), "no pin while automatic").toBeNull();

    cleanup();
    // Link the auto surface → the same gate now reads designed, no longer automatic.
    const pinned = renderDesigner(twoSurfaceMap({ gateLinks: [{ surface: { row: autoSurface.row, col: autoSurface.col } }] }));
    expect(pinned.querySelector(".designerGateToken.designed"), "pinned gate token marked designed").toBeTruthy();
    expect(pinned.querySelector(".designerGateToken.automatic"), "no longer automatic once designed").toBeNull();
    expect(pinned.querySelector(".designerGatePin"), "pin present once designed").toBeTruthy();
  });
});

describe("MapDesigner — several gates on ONE Surface tile (+ Gate, per-gate move/unlink)", () => {
  const HEX = 24;
  const town = { row: 10, col: 10 };
  const cavern = tileLatticeNeighbors(town)[0];
  const CAVERN_INDEX = 1;

  // Two DISJOINT boundary pairs on the shared edge (no shared hex) — so two gates
  // can bridge the SAME town↔cavern edge at once.
  const townPairs = legalGateHexPairs(town, cavern);
  const first = townPairs[0];
  const second = townPairs.find(
    (pair) =>
      new Set([
        hexSpaceId(first.gateHex),
        hexSpaceId(first.entranceHex),
        hexSpaceId(pair.gateHex),
        hexSpaceId(pair.entranceHex)
      ]).size === 4
  )!;

  const midpointOf = (pair: GateHexPair) => {
    const gate = hexToPixel(pair.gateHex, HEX);
    const entrance = hexToPixel(pair.entranceHex, HEX);
    return { x: (gate.x + entrance.x) / 2, y: (gate.y + entrance.y) / 2 };
  };
  const gateTokenAt = (container: HTMLElement, hex: HexCoord): Element | undefined => {
    const px = hexToPixel(hex, HEX);
    const tokenWidth = Math.sqrt(3) * HEX;
    return [...container.querySelectorAll(".designerGateToken")].find(
      (img) =>
        Math.abs(parseFloat(img.getAttribute("x") ?? "NaN") - (px.x - tokenWidth / 2)) < 0.5 &&
        Math.abs(parseFloat(img.getAttribute("y") ?? "NaN") - (px.y - HEX)) < 0.5
    );
  };
  const twoGateMap = (): CustomMapTilePlan[] => [
    { row: town.row, col: town.col, group: "starting", faceDown: false },
    {
      row: cavern.row,
      col: cavern.col,
      group: "subterranean",
      faceDown: true,
      subBand: "iv-v",
      gateLinks: [
        { surface: { row: town.row, col: town.col }, gateHex: hexSpaceId(first.gateHex), entranceHex: hexSpaceId(first.entranceHex) },
        { surface: { row: town.row, col: town.col }, gateHex: hexSpaceId(second.gateHex), entranceHex: hexSpaceId(second.entranceHex) }
      ]
    }
  ];
  const oneLinkMap = (): CustomMapTilePlan[] => [
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

  it("precondition: the shared edge has two DISJOINT boundary pairs", () => {
    expect(second, "two disjoint pairs on the town↔cavern edge").toBeTruthy();
  });

  it("'+ Gate' appends a SECOND pinned gate to an already-linked surface (distinct pair)", () => {
    const { container, get } = renderStatefulDesigner(oneLinkMap());
    const popover = openTilePopover(container, CAVERN_INDEX);
    const add = popover.querySelector(".popoverGateLinkAdd") as HTMLButtonElement | null;
    expect(add, "'+ Gate' button shown for a linked surface").toBeTruthy();
    expect(add!.disabled, "enabled while a free pair remains").toBe(false);

    // The first (unpinned) link renders at this auto-nearest pair.
    const [defaultGate] = planSubterraneanGates(
      [
        { row: town.row, col: town.col, group: "starting" },
        { row: cavern.row, col: cavern.col, group: "subterranean" }
      ],
      []
    );
    fireEvent.click(add!);
    const links = get()[CAVERN_INDEX].gateLinks!;
    expect(links.length, "a second gate appended").toBe(2);
    expect(links.every((link) => link.surface.row === town.row && link.surface.col === town.col), "both to the town").toBe(true);
    expect(links[1].gateHex, "the appended gate is PINNED").toBeTruthy();
    expect(links[1].entranceHex).toBeTruthy();
    // Distinct pair — the appended pin dodged the first gate's rendered hexes.
    for (const hex of [hexSpaceId(defaultGate.gateHex), hexSpaceId(defaultGate.entranceHex)]) {
      expect(links[1].gateHex).not.toBe(hex);
      expect(links[1].entranceHex).not.toBe(hex);
    }
  });

  it("'+ Gate' disables once no free boundary pair remains on the edge", () => {
    const { container, get } = renderStatefulDesigner(oneLinkMap());
    openTilePopover(container, CAVERN_INDEX);
    let add = container.querySelector(".popoverGateLinkAdd") as HTMLButtonElement | null;
    let guard = 0;
    while (add && !add.disabled && guard < townPairs.length + 3) {
      fireEvent.click(add);
      add = container.querySelector(".popoverGateLinkAdd") as HTMLButtonElement | null;
      guard += 1;
    }
    expect(add, "the + Gate button is still present").toBeTruthy();
    expect(add!.disabled, "it disables when the edge has no free pair left").toBe(true);
    expect(get()[CAVERN_INDEX].gateLinks!.length, "never more gates than the edge can host").toBeLessThanOrEqual(townPairs.length);
  });

  // A SECOND Surface tile the cavern also touches, clear of the town — the tight
  // interlocking town↔cavern edge has no third free spot once both its disjoint
  // pairs are taken, so gate #0 is dragged onto this other surface to prove that
  // ONE entry moves while its sibling stays put.
  const surfaceB = tileLatticeNeighbors(cavern).find(
    (neighbor) =>
      !(neighbor.row === town.row && neighbor.col === town.col) &&
      !tileCentersOverlap(neighbor, town) &&
      !tileFootprintsTouch(neighbor, town) &&
      tileFootprintsTouch(neighbor, cavern)
  )!;
  const CAVERN_INDEX_B = 2; // town = 0, surfaceB = 1, cavern = 2
  const twoGateOnTownPlusB = (): CustomMapTilePlan[] => [
    { row: town.row, col: town.col, group: "starting", faceDown: false },
    { row: surfaceB.row, col: surfaceB.col, group: "far", faceDown: true },
    {
      row: cavern.row,
      col: cavern.col,
      group: "subterranean",
      faceDown: true,
      subBand: "iv-v",
      gateLinks: [
        { surface: { row: town.row, col: town.col }, gateHex: hexSpaceId(first.gateHex), entranceHex: hexSpaceId(first.entranceHex) },
        { surface: { row: town.row, col: town.col }, gateHex: hexSpaceId(second.gateHex), entranceHex: hexSpaceId(second.entranceHex) }
      ]
    }
  ];

  it("with two gates on one surface, dragging ONE moves ONLY that entry (the other's pin untouched)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      expect(surfaceB, "a second touching surface clear of the town").toBeTruthy();
      let latest = twoGateOnTownPlusB();
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(<MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />);

      // The candidate set the component offers when dragging gate #0 (index 0):
      // EVERY touching surface's pairs, minus gate #1's (second's) hexes.
      const blocked = new Set([hexSpaceId(second.gateHex), hexSpaceId(second.entranceHex)]);
      const candidates: GateDragCandidate[] = [
        ...legalGateHexPairs(town, cavern).map((pair) => ({ ...pair, surfaceCenter: town })),
        ...legalGateHexPairs(surfaceB, cavern).map((pair) => ({ ...pair, surfaceCenter: surfaceB }))
      ].filter((candidate) => !blocked.has(hexSpaceId(candidate.gateHex)) && !blocked.has(hexSpaceId(candidate.entranceHex)));
      // Target: a pair on the OTHER surface, free of gate #1's hexes.
      const target = candidates.find((candidate) => candidate.surfaceCenter.row === surfaceB.row && candidate.surfaceCenter.col === surfaceB.col)!;
      expect(target, "a free target pair on the other surface exists").toBeTruthy();
      const snapped = nearestGateDragCandidate(midpointOf(target), candidates, HEX)!;
      expect(hexSpaceId(snapped.gateHex), "target midpoint snaps to itself").toBe(hexSpaceId(target.gateHex));

      const token = gateTokenAt(container, first.gateHex);
      expect(token, "the first gate's token").toBeTruthy();
      fireEvent.pointerDown(token!, { button: 0, pointerId: 7, clientX: midpointOf(first).x, clientY: midpointOf(first).y });
      fireEvent.pointerMove(window, { pointerId: 7, clientX: midpointOf(target).x, clientY: midpointOf(target).y });
      fireEvent.pointerUp(window, { pointerId: 7 });

      const links = latest[CAVERN_INDEX_B].gateLinks!;
      expect(links.length, "still exactly two gates").toBe(2);
      // Gate #0 moved to the other surface; gate #1 (second, on the town) is byte-identical.
      expect(links[0]).toEqual({
        surface: { row: surfaceB.row, col: surfaceB.col },
        gateHex: hexSpaceId(target.gateHex),
        entranceHex: hexSpaceId(target.entranceHex)
      });
      expect(links[1]).toEqual({
        surface: { row: town.row, col: town.col },
        gateHex: hexSpaceId(second.gateHex),
        entranceHex: hexSpaceId(second.entranceHex)
      });
    } finally {
      restore();
    }
  });

  it("unlinking ONE per-gate row removes ONLY that entry (the other survives)", () => {
    const { container, get } = renderStatefulDesigner(twoGateMap());
    const popover = openTilePopover(container, CAVERN_INDEX);
    const linkedToggles = popover.querySelectorAll(".popoverGateLinkToggle.linked");
    expect(linkedToggles.length, "two per-gate rows for the one surface").toBe(2);
    // Remove the FIRST gate's row.
    fireEvent.click(linkedToggles[0]);
    const links = get()[CAVERN_INDEX].gateLinks!;
    expect(links.length, "one gate removed, one remains").toBe(1);
    expect(links[0], "the SECOND gate survives untouched").toEqual({
      surface: { row: town.row, col: town.col },
      gateHex: hexSpaceId(second.gateHex),
      entranceHex: hexSpaceId(second.entranceHex)
    });
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
    onObjectsChange: (next: CustomMapObject[]) => void = () => {},
    onChange: (next: CustomMapTilePlan[]) => void = () => {}
  ): HTMLElement {
    const { container } = render(
      <MapDesigner
        scenarioId="skirmish"
        customMap={customMap}
        onChange={onChange}
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
  const faceDownMap: CustomMapTilePlan[] = [
    { row: town.row, col: town.col, group: "starting", faceDown: false },
    { row: far.row, col: far.col, group: "far", faceDown: true }
  ];

  // The lone-Monolith warning counts ACROSS SOURCES (like the gate warnings):
  // a tile token partnered with a STANDALONE monolith object is a working
  // 2-member network, so no warning — while a single standalone monolith alone
  // (count 1) DOES warn. Regression: the count used to read plan tokens only,
  // so a token+standalone pair warned forever and a lone standalone never did.
  it("does not warn 'only 1 Monolith' when a tile token is partnered with a standalone monolith object", () => {
    const withPair = renderWithObjects(
      [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "far", faceDown: true, token: { kind: "monolith", slot: 0 } }
      ],
      [{ kind: "monolith", placement: { type: "standalone", row: 40, col: 40 } }]
    );
    const warnings = [...withPair.querySelectorAll(".designerCavernAlert")].map((node) => node.textContent ?? "");
    expect(
      warnings.some((text) => /at least 2/i.test(text) && /Monolith/i.test(text)),
      "no lone-monolith warning for a token+standalone pair"
    ).toBe(false);

    cleanup();
    // CONTROL: a single STANDALONE monolith with no tile token is a lone network
    // member — the warning must fire for it too.
    const loneStandalone = renderWithObjects(
      [{ row: town.row, col: town.col, group: "starting", faceDown: false }],
      [{ kind: "monolith", placement: { type: "standalone", row: 40, col: 40 } }]
    );
    const loneWarnings = [...loneStandalone.querySelectorAll(".designerCavernAlert")].map(
      (node) => node.textContent ?? ""
    );
    expect(
      loneWarnings.some((text) => /at least 2/i.test(text) && /Monolith/i.test(text)),
      "lone standalone monolith warns"
    ).toBe(true);
  });

  // CANONICAL forms: an ON-tile teleporter is a plan.token; an OFF-tile one is a
  // standalone object. The designer never writes a tile-slot object any more.
  it("arms a Gate and places a TILE TOKEN on a face-up tile hex (canonical on-tile form)", () => {
    let tiles: CustomMapTilePlan[] = faceUpMap.map((plan) => ({ ...plan }));
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      tiles = next;
    });
    const onObjectsChange = vi.fn();
    const container = renderWithObjects(faceUpMap, [], onObjectsChange, onChange);

    const redButton = container.querySelector('.designerObjectButton[data-gate-pair="1"]');
    expect(redButton?.textContent).toMatch(/0 placed/);
    fireEvent.click(redButton!);
    expect(redButton!.getAttribute("aria-pressed")).toBe("true");

    // A legal tile candidate glows on the face-up F1 tile; clicking it writes the
    // plan.token — NOT a tile-slot object (onObjectsChange stays untouched).
    const slot = container.querySelector(".designerObjectSlot.tileSlot");
    expect(slot, "a legal tile candidate is offered").toBeTruthy();
    fireEvent.click(slot!);

    expect(onChange).toHaveBeenCalled();
    expect(onObjectsChange).not.toHaveBeenCalled();
    // Canonical multi-token form: the write lands in plan.tokens (legacy
    // singular cleared) — the engine folds both via planTokens.
    const f1 = tiles.find((plan) => plan.tileDefId === "F1");
    expect(f1?.token).toBeUndefined();
    expect(f1?.tokens?.[0]?.kind).toBe("gate");
    expect(f1?.tokens?.[0]?.pair).toBe(1);
    expect(typeof f1?.tokens?.[0]?.slot).toBe("number");
  });

  it("arms a Gate and reserves the clicked FACE-DOWN tile hex", () => {
    let tiles: CustomMapTilePlan[] = faceDownMap.map((plan) => ({ ...plan }));
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      tiles = next;
    });
    const onObjectsChange = vi.fn();
    const container = renderWithObjects(faceDownMap, [], onObjectsChange, onChange);

    fireEvent.click(container.querySelector('.designerObjectButton[data-gate-pair="2"]')!);
    // Every face-down footprint hex is an exact physical target.
    const footprintCell = container.querySelector(".designerObjectSlot.faceDownTile");
    expect(footprintCell, "a face-down footprint target is offered").toBeTruthy();
    fireEvent.click(footprintCell!);

    expect(onObjectsChange).not.toHaveBeenCalled();
    const far = tiles.find((plan) => plan.faceDown);
    expect(far?.token).toBeUndefined();
    expect(far?.tokens).toEqual([{ kind: "gate", pair: 2, slot: 0 }]);
  });

  it("arms a Gate and places a STANDALONE object on an off-tile hex", () => {
    let latest: CustomMapObject[] = [];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const onChange = vi.fn();
    const container = renderWithObjects(faceUpMap, [], onObjectsChange, onChange);

    fireEvent.click(container.querySelector('.designerObjectButton[data-gate-pair="3"]')!);
    const standalone = container.querySelector(".designerObjectSlot.standalone");
    expect(standalone, "an off-tile standalone candidate is offered").toBeTruthy();
    fireEvent.click(standalone!);

    expect(onChange).not.toHaveBeenCalled(); // off-tile → object, not a tile token
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ kind: "gate", pair: 3, placement: { type: "standalone" } });
  });

  it("the plain Monolith is RETIRED from the palette; a one-way ENTRANCE writes a TILE TOKEN instead", () => {
    let tiles: CustomMapTilePlan[] = faceUpMap.map((plan) => ({ ...plan }));
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      tiles = next;
    });
    const container = renderWithObjects(faceUpMap, [], () => {}, onChange);

    // The old ⛩ Monolith button is gone — every two-way teleporter is a
    // colored Teleport Gate now (legacy saved Monoliths still work in game).
    const monolithButton = [...container.querySelectorAll(".designerObjectButton")].find((btn) =>
      /^⛩ Monolith$/.test(btn.textContent ?? "")
    );
    expect(monolithButton, "no plain Monolith palette button").toBeUndefined();

    // A one-way entrance token placement writes the token WITH its color pair.
    const entranceButton = [...container.querySelectorAll(".designerObjectButton")].find((btn) =>
      /Entrance/i.test(btn.textContent ?? "")
    );
    fireEvent.click(entranceButton!);
    fireEvent.click(container.querySelector(".designerObjectSlot.tileSlot")!);

    const f1 = tiles.find((plan) => plan.tileDefId === "F1");
    expect(f1?.tokens?.[0]?.kind).toBe("oneway_entrance");
    expect(f1?.tokens?.[0]?.pair).toBe(1);
  });

  it("a tile already carrying a token offers only its FREE hexes (multi-token: same slot never stacks)", () => {
    // Multi hex placements: a second token may join the tile on a DIFFERENT
    // slot; the occupied slot itself is never offered.
    let tiles: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 0 } }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      tiles = next;
    });
    const container = renderWithObjects(tiles, [], vi.fn(), onChange);
    fireEvent.click(container.querySelector('.designerObjectButton[data-gate-pair="1"]')!);
    const slots = [...container.querySelectorAll(".designerObjectSlot.tileSlot")];
    expect(slots.length, "free legal hexes are still offered").toBeGreaterThan(0);
    fireEvent.click(slots[0]);
    const f1 = tiles.find((plan) => plan.tileDefId === "F1");
    const tokenList = f1?.tokens ?? [];
    // The legacy monolith folded in + the new gate, on DISTINCT slots.
    expect(tokenList).toHaveLength(2);
    expect(tokenList.some((t) => t.kind === "monolith" && t.slot === 0)).toBe(true);
    const gate = tokenList.find((t) => t.kind === "gate");
    expect(gate?.pair).toBe(1);
    expect(gate?.slot).not.toBe(0);
  });

  it("arms a red Teleport Gate and places a STANDALONE object on an off-tile hex", () => {
    let latest: CustomMapObject[] = [];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, [], onObjectsChange);

    fireEvent.click(container.querySelector('.designerObjectButton[data-gate-pair="1"]')!);

    const standalone = container.querySelector(".designerObjectSlot.standalone");
    expect(standalone, "an off-tile standalone candidate is offered").toBeTruthy();
    fireEvent.click(standalone!);

    expect(latest).toHaveLength(1);
    expect(latest[0].kind).toBe("gate");
    expect(latest[0].pair).toBe(1);
    expect(latest[0].placement.type).toBe("standalone");
  });

  it("outposts: Garrison places standalone-only (no tile targets); a Tent defaults to color 1", () => {
    let latest: CustomMapObject[] = [];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, [], onObjectsChange);

    const garrisonButton = [...container.querySelectorAll(".designerObjectButton")].find((btn) =>
      /Garrison/i.test(btn.textContent ?? "")
    );
    fireEvent.click(garrisonButton!);
    // Standalone candidates only — an outpost never offers a tile slot.
    expect(container.querySelectorAll(".designerObjectSlot.tileSlot").length).toBe(0);
    const standalone = container.querySelector(".designerObjectSlot.standalone");
    expect(standalone, "off-tile candidates offered").toBeTruthy();
    fireEvent.click(standalone!);
    expect(latest[0]).toMatchObject({ kind: "garrison", placement: { type: "standalone" } });

    // A placed Keymaster's Tent defaults to color 1 (red).
    const tentContainer = renderWithObjects(faceUpMap, [], onObjectsChange);
    const tentButton = [...tentContainer.querySelectorAll(".designerObjectButton")].find((btn) =>
      /Keymaster/i.test(btn.textContent ?? "")
    );
    fireEvent.click(tentButton!);
    fireEvent.click(tentContainer.querySelector(".designerObjectSlot.standalone")!);
    expect(latest[0]).toMatchObject({ kind: "keymaster_tent", pair: 1 });
  });

  it("the outpost panel: a Tent's COLOR chips rewrite its pair; a Barrier offers NO guard editor", () => {
    let latest: CustomMapObject[] = [
      { kind: "keymaster_tent", pair: 1, placement: { type: "standalone", row: far.row + 2, col: far.col + 2 } }
    ];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, latest, onObjectsChange);
    fireEvent.click(container.querySelector(".designerObjectToken.standalone")!);
    fireEvent.click(within(container).getByRole("button", { name: /Blue/ }));
    expect(latest[0].pair).toBe(2);

    // A Barrier's panel: color chips yes, guard editor no.
    const barrier = renderWithObjects(
      faceUpMap,
      [{ kind: "barrier", pair: 3, placement: { type: "standalone", row: far.row + 2, col: far.col + 2 } }],
      onObjectsChange
    );
    fireEvent.click(barrier.querySelector(".designerObjectToken.standalone")!);
    const panel = barrier.querySelector(".designerObjectPopover") as HTMLElement;
    expect(within(panel).queryByRole("button", { name: "Exact army" }), "no guard editor on a Barrier").toBeNull();
    expect(panel.textContent).toMatch(/never guarded/i);
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

    // Click the token → its popover opens with the shared guard editor.
    fireEvent.click(container.querySelector(".designerObjectToken")!);
    const guardChip = [...container.querySelectorAll(".popoverGuardChip")].find((chip) => chip.textContent === "Ⅲ");
    expect(guardChip, "guard Ⅲ chip present").toBeTruthy();
    fireEvent.click(guardChip!);
    expect(latest[0].guard).toEqual({ level: 3 });
  });

  it("an EXACT-ARMY guard on a placed object collects unit ids and badges the derived difficulty", () => {
    let latest: CustomMapObject[] = [
      { kind: "monolith", placement: { type: "standalone", row: far.row + 2, col: far.col + 2 } }
    ];
    const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
      latest = next;
    });
    const container = renderWithObjects(faceUpMap, latest, onObjectsChange);
    fireEvent.click(container.querySelector(".designerObjectToken.standalone")!);
    fireEvent.click(within(container).getByRole("button", { name: "Exact army" }));
    expect(latest[0].guard).toEqual({ units: [] });

    // Re-render with the armed army mode and add a unit through the picker.
    const rerendered = renderWithObjects(faceUpMap, latest, onObjectsChange);
    fireEvent.click(rerendered.querySelector(".designerObjectToken.standalone")!);
    fireEvent.change(within(rerendered).getByLabelText(/Add a named guard unit/i), {
      target: { value: "neutral.cyclopes" }
    });
    expect(latest[0].guard).toEqual({ units: ["neutral.cyclopes"] });

    // The board badge shows the tier-derived difficulty (gold Cyclopes → Ⅱ).
    const badged = renderWithObjects(faceUpMap, latest, onObjectsChange);
    expect(badged.querySelector(".designerObjectGuard")?.textContent).toBe("Ⅱ");
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

  it("a LEGACY saved Monolith token still renders and stays editable (retired from the palette only)", () => {
    // A legacy `token` on the tile plan still renders its art…
    const container = renderWithObjects(
      [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 0 } }
      ],
      []
    );
    expect(container.querySelector('image[href*="tokens/monolith"]'), "legacy token art still renders").toBeTruthy();
    // …and clicking it still opens its token panel (edit/remove keep working) —
    // only NEW plain Monoliths can no longer be placed.
    fireEvent.click(container.querySelector(".designerMapToken")!);
    expect(container.querySelector(".designerTokenPopover"), "legacy token panel opens").toBeTruthy();
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

  /**
   * Grab the FIRST rendered draggable token (always the source in these maps),
   * drag its centre from board hex `from` to board hex `to` and release —
   * identity SVG polyfills make client coords == board coords.
   */
  function dragTokenCentre(container: HTMLElement, from: HexCoord, to: HexCoord, pointerId = 20): void {
    const token = container.querySelector(".designerMapToken.draggable");
    if (!token) {
      throw new Error("no draggable token to drag");
    }
    const grabAt = hexToPixel(from, HEX);
    const dropAt = hexToPixel(to, HEX);
    fireEvent.pointerDown(token, { button: 0, pointerId, clientX: grabAt.x, clientY: grabAt.y });
    fireEvent.pointerMove(window, { pointerId, clientX: dropAt.x, clientY: dropAt.y });
    fireEvent.pointerUp(window, { pointerId });
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
    expect(latest[1].tokens).toEqual([{ kind: "monolith", slot: monoSlots[1] }]);
    expect(latest[1].token, "canonical array form — legacy singular cleared").toBeUndefined();

    // Remove clears the token AND closes the panel.
    fireEvent.click(within(panel).getByRole("button", { name: /Remove the Monolith token/i }));
    expect(latest[1].token, "token removed").toBeUndefined();
    expect(latest[1].tokens, "token list removed").toBeUndefined();
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

      expect(latest[1].tokens).toEqual([{ kind: "monolith", slot: toSlot }]);
    } finally {
      restore();
    }
  });

  it("drags freely between exact hexes on the SAME face-down tile and marks the release cell", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const sourceSlot = 0;
      const targetSlot = 2;
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        {
          row: spots[0].row,
          col: spots[0].col,
          group: "far",
          faceDown: true,
          token: { kind: "monolith", slot: sourceSlot }
        }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );
      const footprint = tileFootprint(spots[0], 0);
      const grabAt = hexToPixel(footprint[sourceSlot], HEX);
      const dropAt = hexToPixel(footprint[targetSlot], HEX);
      const token = container.querySelector(".designerMapToken.draggable")!;

      fireEvent.pointerDown(token, { button: 0, pointerId: 61, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 61, clientX: dropAt.x, clientY: dropAt.y });

      const reticle = container.querySelector(".designerTokenDropReticle");
      expect(reticle, "one exact release reticle is shown").toBeTruthy();
      expect(reticle?.getAttribute("data-space-id")).toBe(hexSpaceId(footprint[targetSlot]));

      fireEvent.pointerUp(window, { pointerId: 61 });
      expect(latest[1].tokens).toStrictEqual([{ kind: "monolith", slot: targetSlot }]);
    } finally {
      restore();
    }
  });

  it("keeps a face-down token on the same board hex when the hidden tile preview rotates", () => {
    const centre = spots[0];
    const originalSlot = 2;
    const originalHex = tileFootprint(centre, 0)[originalSlot];
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: centre.row,
        col: centre.col,
        group: "far",
        faceDown: true,
        rotation: 0,
        token: { kind: "monolith", slot: originalSlot }
      }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    const { container } = render(
      <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
    );

    openTilePopover(container, 1);
    const panel = container.querySelector(".designerPopover")!;
    fireEvent.click(panel.querySelector('[title="Rotate 60° clockwise"]')!);

    const rotated = latest[1];
    expect(rotated.rotation).toBe(1);
    expect(tileFootprint(centre, rotated.rotation ?? 0)[rotated.tokens![0].slot!]).toEqual(originalHex);
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
      expect(latest[1].tokens, "source list cleared").toBeUndefined();
      expect(latest[2].tokens, "target tile gained it").toEqual([{ kind: "monolith", slot: 0 }]);
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

  it("dragging a FACE-DOWN badge onto ANOTHER face-down tile is ONE atomic onChange → { kind } (no slot)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      // Source: a face-down FAR tile with a pending Monolith. Target: a face-down
      // NEAR tile (a land group → accepts Monolith), no token.
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } },
        { row: spots[3].row, col: spots[3].col, group: "near", faceDown: true }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );

      const token = container.querySelector(".designerMapToken.draggable");
      expect(token, "the face-down badge is now a DRAGGABLE token").toBeTruthy();
      const callsBefore = onChange.mock.calls.length;
      dragTokenCentre(container, spots[0], spots[3], 11);

      expect(onChange.mock.calls.length - callsBefore, "exactly one atomic emission").toBe(1);
      expect(latest[1].token, "source face-down tile lost its token").toBeUndefined();
      expect(latest[1].tokens, "source list cleared").toBeUndefined();
      // Pending shape only — NO slot key (toStrictEqual rejects a stray slot: undefined).
      expect(latest[2].tokens, "target gained the exact centre slot").toStrictEqual([{ kind: "monolith", slot: 0 }]);
    } finally {
      restore();
    }
  });

  it("a FACE-DOWN target's OCCUPIED hex refuses the drop; a second token may join on a free hex", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      // Multi-token tiles: the target's pinned CENTRE hex (slot 0) is occupied,
      // so dropping exactly there is refused — never stacked on one hex.
      const onChange = vi.fn();
      const { container } = render(
        <MapDesigner
          scenarioId="skirmish"
          customMap={[
            { row: town.row, col: town.col, group: "starting", faceDown: false },
            { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith", slot: 0 } },
            { row: spots[3].row, col: spots[3].col, group: "near", faceDown: true, token: { kind: "monolith", slot: 0 } }
          ]}
          onChange={onChange}
          hexSize={HEX}
        />
      );
      dragTokenCentre(container, spots[0], spots[3], 12);
      expect(onChange, "occupied face-down hex refused").not.toHaveBeenCalled();
      cleanup();

      // Control (the multi-token feature): a FREE hex of the same occupied tile
      // accepts the drop — the tile then carries BOTH tokens on distinct slots.
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith", slot: 0 } },
        { row: spots[3].row, col: spots[3].col, group: "near", faceDown: true, token: { kind: "monolith", slot: 0 } }
      ];
      const accept = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const ok = render(<MapDesigner scenarioId="skirmish" hexSize={HEX} onChange={accept} customMap={latest} />);
      const freeHex = tileFootprint(spots[3], 0)[2];
      dragTokenCentre(ok.container, spots[0], freeHex, 13);
      expect(latest[1].tokens ?? latest[1].token, "source cleared").toBeUndefined();
      expect(latest[2].tokens).toStrictEqual([
        { kind: "monolith", slot: 0 },
        { kind: "monolith", slot: 2 }
      ]);
    } finally {
      restore();
    }
  });

  it("dragging a FACE-DOWN badge onto a FACE-UP tile's legal slot lands as { kind, slot }", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const monoSlots = legalTokenSlotsForTileDef(allTileDefinitions["F1"], "monolith");
      const toSlot = monoSlots[0];
      // Source face-down badge → target face-up F1 (no token).
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } },
        { row: spots[3].row, col: spots[3].col, group: "far", faceDown: false, tileDefId: "F1" }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );

      const dropHex = tileFootprint(spots[3], 0)[toSlot];
      dragTokenCentre(container, spots[0], dropHex, 13);

      expect(latest[1].token, "source face-down tile cleared").toBeUndefined();
      expect(latest[2].tokens, "landed on the face-up slot WITH a slot key").toStrictEqual([
        { kind: "monolith", slot: toSlot }
      ]);
    } finally {
      restore();
    }
  });

  it("dragging a FACE-UP token onto a face-down tile preserves the exact dropped slot", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      // Source face-up F1 (Monolith on slot 0) → target face-down NEAR (land), no token.
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
        { row: spots[3].row, col: spots[3].col, group: "near", faceDown: true }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const { container } = render(
        <MapDesigner scenarioId="skirmish" customMap={latest} onChange={onChange} hexSize={HEX} />
      );

      dragTokenCentre(container, spots[0], spots[3], 14);

      expect(latest[1].token, "source face-up tile cleared").toBeUndefined();
      expect(latest[2].tokens, "centre slot reserved on the face-down target").toStrictEqual([
        { kind: "monolith", slot: 0 }
      ]);
    } finally {
      restore();
    }
  });

  it("kind/group gate: a WHIRLPOOL offers no LAND face-down target, but DOES a sea one", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      // Refused: a LAND (Monolith-group) face-down tile is incompatible with a whirlpool.
      const refuse = vi.fn();
      const refused = render(
        <MapDesigner
          scenarioId="skirmish"
          hexSize={HEX}
          onChange={refuse}
          customMap={[
            { row: town.row, col: town.col, group: "starting", faceDown: false },
            {
              row: spots[0].row,
              col: spots[0].col,
              group: "sea",
              faceDown: true,
              seaBand: "iv-v",
              token: { kind: "whirlpool" }
            },
            { row: spots[3].row, col: spots[3].col, group: "far", faceDown: true }
          ]}
        />
      );
      dragTokenCentre(refused.container, spots[0], spots[3], 15);
      expect(refuse, "whirlpool refuses a LAND face-down target").not.toHaveBeenCalled();
      cleanup();

      // Control: a SEA face-down tile IS a whirlpool target.
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        {
          row: spots[0].row,
          col: spots[0].col,
          group: "sea",
          faceDown: true,
          seaBand: "iv-v",
          token: { kind: "whirlpool" }
        },
        { row: spots[3].row, col: spots[3].col, group: "sea", faceDown: true, seaBand: "iv-v" }
      ];
      const accept = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const ok = render(<MapDesigner scenarioId="skirmish" hexSize={HEX} onChange={accept} customMap={latest} />);
      dragTokenCentre(ok.container, spots[0], spots[3], 16);
      expect(latest[1].token, "whirlpool left the source").toBeUndefined();
      expect(latest[2].tokens, "whirlpool landed on the sea face-down tile").toStrictEqual([
        { kind: "whirlpool", slot: 0 }
      ]);
    } finally {
      restore();
    }
  });

  it("kind/group gate: a MONOLITH offers no SEA face-down target, but DOES a land one", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      // Refused: a SEA (Whirlpool-group) face-down tile is incompatible with a monolith.
      const refuse = vi.fn();
      const refused = render(
        <MapDesigner
          scenarioId="skirmish"
          hexSize={HEX}
          onChange={refuse}
          customMap={[
            { row: town.row, col: town.col, group: "starting", faceDown: false },
            { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } },
            { row: spots[3].row, col: spots[3].col, group: "sea", faceDown: true, seaBand: "iv-v" }
          ]}
        />
      );
      dragTokenCentre(refused.container, spots[0], spots[3], 17);
      expect(refuse, "monolith refuses a SEA face-down target").not.toHaveBeenCalled();
      cleanup();

      // Control: a LAND face-down tile IS a monolith target.
      let latest: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } },
        { row: spots[3].row, col: spots[3].col, group: "near", faceDown: true }
      ];
      const accept = vi.fn((next: CustomMapTilePlan[]) => {
        latest = next;
      });
      const ok = render(<MapDesigner scenarioId="skirmish" hexSize={HEX} onChange={accept} customMap={latest} />);
      dragTokenCentre(ok.container, spots[0], spots[3], 18);
      expect(latest[1].token, "monolith left the source").toBeUndefined();
      expect(latest[2].tokens, "monolith landed on the land face-down tile").toStrictEqual([
        { kind: "monolith", slot: 0 }
      ]);
    } finally {
      restore();
    }
  });

  it("a live drag highlights the whole footprint of every face-down candidate tile, cleared on release", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const { container } = render(
        <MapDesigner
          scenarioId="skirmish"
          hexSize={HEX}
          onChange={() => {}}
          customMap={[
            { row: town.row, col: town.col, group: "starting", faceDown: false },
            { row: spots[0].row, col: spots[0].col, group: "far", faceDown: true, token: { kind: "monolith" } },
            { row: spots[3].row, col: spots[3].col, group: "near", faceDown: true }
          ]}
        />
      );
      const token = container.querySelector(".designerMapToken.draggable")!;
      const grabAt = hexToPixel(spots[0], HEX);
      const dropAt = hexToPixel(spots[3], HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 19, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 19, clientX: dropAt.x, clientY: dropAt.y });
      // Source and destination both expose all seven exact physical slots.
      expect(
        container.querySelectorAll(".designerObjectSlot.faceDownTile").length,
        "face-down candidate footprint highlighted"
      ).toBe(14);
      fireEvent.pointerUp(window, { pointerId: 19 });
      expect(
        container.querySelectorAll(".designerObjectSlot.faceDownTile").length,
        "highlight cleared on release"
      ).toBe(0);
    } finally {
      restore();
    }
  });

  it("a plain click (no drag) on a FACE-DOWN badge still opens the compact token panel; Remove works", () => {
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

    const token = container.querySelector(".designerMapToken.draggable");
    expect(token, "face-down badge is draggable AND clickable").toBeTruthy();

    // A plain click (no pointer movement) opens the exact-hex editor.
    fireEvent.click(token!);
    const panel = container.querySelector(".designerTokenPopover") as HTMLElement;
    expect(panel, "token panel opens for a face-down badge").toBeTruthy();
    expect(within(panel).getByText(/exact map hex/i), "reserved-hex hint shown").toBeTruthy();
    expect(within(panel).getByLabelText("Token hex"), "face-down exact-slot selector").toBeTruthy();

    // Remove still clears the token.
    fireEvent.click(within(panel).getByRole("button", { name: /Remove the Monolith token/i }));
    expect(latest[1].token, "face-down token removed").toBeUndefined();
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

describe("MapDesigner — per-tile UNDERGROUND designation", () => {
  const town = { row: 10, col: 10 };
  const far = tileLatticeNeighbors(town)[0]; // touches the town (Surface) tile

  it("the far-tile popover toggles plan.underground, reveals the gate-link section, and offers NO toggle on a starting tile", () => {
    let latest: CustomMapTilePlan[] = [
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true }
    ];
    const onChange = vi.fn((next: CustomMapTilePlan[]) => {
      latest = next;
    });
    let container = renderDesigner(latest, onChange);

    // The far popover offers the Underground toggle (unpressed); a plain far tile
    // shows NO gate-link section (it is Surface).
    const popover = openTilePopover(container, 1);
    const toggle = popover.querySelector('[data-testid="underground-toggle"]');
    expect(toggle, "far popover offers the underground toggle").toBeTruthy();
    expect(toggle!.getAttribute("aria-pressed")).toBe("false");
    expect(popover.querySelector(".popoverGateLinks"), "no gate links while Surface").toBeNull();

    // Flip it ON → onChange carries underground:true, keeping the band group.
    fireEvent.click(toggle!);
    expect(latest[1]).toMatchObject({ group: "far", underground: true });

    // Re-render flagged: the toggle reads pressed AND the cavern gate-link
    // section now appears (the tile is on the Underground layer).
    cleanup();
    container = renderDesigner(latest, onChange);
    const popover2 = openTilePopover(container, 1);
    expect(popover2.querySelector('[data-testid="underground-toggle"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(popover2.querySelector(".popoverGateLinks"), "gate-link section appears once flagged").toBeTruthy();
    // …and the touching town Surface tile is offered as a link target.
    expect(popover2.querySelector(".popoverGateLinkToggle"), "a Surface link target is listed").toBeTruthy();

    // Toggling OFF round-trips back to no flag.
    fireEvent.click(popover2.querySelector('[data-testid="underground-toggle"]')!);
    expect(latest[1].underground).toBeUndefined();

    // CONTROL: a STARTING seat tile never offers the underground toggle.
    cleanup();
    container = renderDesigner(latest, onChange);
    const startPopover = openTilePopover(container, 0);
    expect(startPopover.querySelector('[data-testid="underground-toggle"]'), "no underground toggle on a seat tile").toBeNull();
  });

  it("a flagged tile's outline flips to the Underground layer (data-underground) while keeping its band group", () => {
    const flagged = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true, underground: true }
    ]);
    const outline = flagged.querySelector('.designerFlowerOutline[data-band-group="far"]');
    expect(outline, "the far tile keeps its band group attribute").toBeTruthy();
    expect(outline!.getAttribute("data-underground"), "the outline is marked underground").toBe("true");

    // CONTROL: the same plain far tile carries no underground marker.
    cleanup();
    const plain = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: true }
    ]);
    const plainOutline = plain.querySelector('.designerFlowerOutline[data-band-group="far"]');
    expect(plainOutline!.getAttribute("data-underground"), "no marker on a Surface tile").toBeNull();
  });

  it("a flagged tile far from any Surface tile draws the unreachable red ring (CONTROL: a plain far tile does not)", () => {
    const isolated = { row: town.row + 14, col: town.col + 9 };
    const flagged = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: isolated.row, col: isolated.col, group: "far", faceDown: true, underground: true }
    ]);
    // No gate can form → the unreachable warning fires for the flagged tile too.
    expect(flagged.querySelector(".designerFlowerOutline.cavernUnreachable"), "red ring on an unreachable flagged tile").toBeTruthy();

    // CONTROL: the same tile without the flag is a plain Surface far tile — no ring.
    cleanup();
    const plain = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: isolated.row, col: isolated.col, group: "far", faceDown: true }
    ]);
    expect(plain.querySelector(".designerFlowerOutline.cavernUnreachable"), "no ring on a Surface tile").toBeNull();
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
    const gate = container.querySelector('.designerObjectButton[data-gate-pair="1"]') as HTMLElement;
    const paint = paintButton(container);

    // Arm the red Teleport Gate → its candidate cells glow, no edge zones yet.
    fireEvent.click(gate);
    expect(gate.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".designerObjectSlot").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBe(0);

    // Arm border paint → the gate disarms (no candidate cells), edge zones appear.
    fireEvent.click(paint);
    expect(paint.getAttribute("aria-pressed")).toBe("true");
    expect(gate.getAttribute("aria-pressed"), "gate disarmed").toBe("false");
    expect(container.querySelectorAll(".designerObjectSlot").length, "no object candidates").toBe(0);
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBeGreaterThan(0);

    // Arm the gate again → border paint disarms, zones vanish.
    fireEvent.click(gate);
    expect(gate.getAttribute("aria-pressed")).toBe("true");
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

  it("the brush works on a STANDALONE object hex too: zones appear, a click writes/erases object.borderEdges", () => {
    // A detached object far from the tile → its 6 edges are all object-owned.
    const objectHex = { row: town.row + 12, col: town.col + 12 };
    let latest: CustomMapObject[] = [
      { kind: "monolith", placement: { type: "standalone", row: objectHex.row, col: objectHex.col } }
    ];
    function Harness() {
      const [objectsState, setObjects] = useState(latest);
      return (
        <MapDesigner
          scenarioId="skirmish"
          customMap={[{ row: town.row, col: town.col, group: "starting", faceDown: false }]}
          onChange={() => {}}
          objects={objectsState}
          onObjectsChange={(next) => {
            latest = next;
            setObjects(next);
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    fireEvent.click(paintButton(container));

    // 30 tile zones + 6 object-hex zones (nothing shared: the object is detached).
    expect(container.querySelectorAll(".designerBorderEdgeZone").length).toBe(36);
    const objectZone = container.querySelector(
      ".designerBorderEdgeZone[data-border-index='object-0'][data-edge-code='3']"
    ) as HTMLElement;
    expect(objectZone, "object-owned edge zone present").toBeTruthy();

    // Draw: the direction lands on the OBJECT (not any tile plan).
    fireEvent.pointerDown(objectZone, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(objectZone, { pointerId: 1 });
    expect(latest[0].borderEdges).toEqual([3]);

    // The zone re-renders active, and the bold border line is drawn on the hex.
    const activeZone = container.querySelector(
      ".designerBorderEdgeZone[data-border-index='object-0'][data-edge-code='3']"
    ) as HTMLElement;
    expect(activeZone.classList.contains("active")).toBe(true);
    expect(container.querySelector(".designerBorderLine"), "border line rendered").toBeTruthy();

    // Erase: clicking again clears it from the object.
    fireEvent.pointerDown(activeZone, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(activeZone, { pointerId: 1 });
    expect(latest[0].borderEdges).toBeUndefined();
  });
});

describe("MapDesigner — canonical teleporter conversions (token ⇄ standalone) + gate art", () => {
  const town = { row: 10, col: 10 };
  const far = tileLatticeNeighbors(town)[1];
  const HEX = 24;
  const monoSlots = legalTokenSlotsForTileDef(allTileDefinitions["F1"], "monolith");

  /** An off-tile hex adjacent to the F1 far tile (a standalone candidate). */
  function offTileHexNearFar(): HexCoord {
    const townIds = new Set(tileFootprint(town, 0).map(hexSpaceId));
    const farIds = new Set(tileFootprint(far, 0).map(hexSpaceId));
    for (const cell of tileFootprint(far, 0)) {
      for (const nb of hexNeighbors(cell)) {
        const id = hexSpaceId(nb);
        if (!townIds.has(id) && !farIds.has(id)) {
          return nb;
        }
      }
    }
    throw new Error("no off-tile hex near F1");
  }

  function renderConv(
    customMap: CustomMapTilePlan[],
    objects: CustomMapObject[] = [],
    onChange: (next: CustomMapTilePlan[]) => void = () => {},
    onObjectsChange: (next: CustomMapObject[]) => void = () => {}
  ): HTMLElement {
    const { container } = render(
      <MapDesigner
        scenarioId="skirmish"
        customMap={customMap}
        onChange={onChange}
        objects={objects}
        onObjectsChange={onObjectsChange}
        hexSize={HEX}
      />
    );
    return container;
  }

  it("token → standalone: dragging a tile token off every tile deletes the token AND appends a standalone object", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const off = offTileHexNearFar();
      const customMap: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: monoSlots[0] } }
      ];
      let tiles = customMap.map((plan) => ({ ...plan }));
      let objs: CustomMapObject[] = [];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        tiles = next;
      });
      const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
        objs = next;
      });
      const container = renderConv(customMap, [], onChange, onObjectsChange);

      const token = container.querySelector(".designerMapToken.draggable")!;
      const grabAt = hexToPixel(tileFootprint(far, 0)[monoSlots[0]], HEX);
      const dropAt = hexToPixel(off, HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 30, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 30, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 30 });

      // Both commits fire in one release: the plan's token is cleared…
      expect(onChange).toHaveBeenCalled();
      expect(tiles.find((plan) => plan.tileDefId === "F1")?.token, "token removed from the plan").toBeUndefined();
      // …and a standalone object is appended at the dropped hex.
      expect(onObjectsChange).toHaveBeenCalled();
      expect(objs).toHaveLength(1);
      expect(objs[0]).toMatchObject({ kind: "monolith", placement: { type: "standalone", row: off.row, col: off.col } });
    } finally {
      restore();
    }
  });

  it("CONTROL: a Whirlpool token has NO off-tile target (sea slots only) — the drag commits nothing", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const off = offTileHexNearFar();
      const seaSlots = legalTokenSlotsForTileDef(allTileDefinitions["W2"], "whirlpool");
      const customMap: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "sea", faceDown: false, tileDefId: "W2", token: { kind: "whirlpool", slot: seaSlots[0] } }
      ];
      const onChange = vi.fn();
      const onObjectsChange = vi.fn();
      const container = renderConv(customMap, [], onChange, onObjectsChange);

      const token = container.querySelector(".designerMapToken.draggable")!;
      const grabAt = hexToPixel(tileFootprint(far, 0)[seaSlots[0]], HEX);
      const dropAt = hexToPixel(off, HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 31, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 31, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 31 });

      // No standalone conversion for a Whirlpool → nothing committed either way.
      expect(onObjectsChange).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("object → tile: dragging a standalone object onto a face-up tile hex removes the object AND writes the tile token (pair kept)", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const off = offTileHexNearFar();
      const customMap: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1" }
      ];
      const objects: CustomMapObject[] = [
        { kind: "gate", pair: 1, placement: { type: "standalone", row: off.row, col: off.col } }
      ];
      let tiles = customMap.map((plan) => ({ ...plan }));
      let objs = objects.map((object) => ({ ...object }));
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        tiles = next;
      });
      const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
        objs = next;
      });
      const container = renderConv(customMap, objects, onChange, onObjectsChange);

      const token = container.querySelector(".designerObjectToken")!;
      const grabAt = hexToPixel(off, HEX);
      const dropAt = hexToPixel(tileFootprint(far, 0)[monoSlots[0]], HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 32, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 32, clientX: dropAt.x, clientY: dropAt.y });
      fireEvent.pointerUp(window, { pointerId: 32 });

      // The object is removed…
      expect(onObjectsChange).toHaveBeenCalled();
      expect(objs).toHaveLength(0);
      // …and the canonical on-tile token is written, pair preserved (never a tile-slot object).
      expect(onChange).toHaveBeenCalled();
      expect(tiles.find((plan) => plan.tileDefId === "F1")?.tokens?.[0]).toMatchObject({ kind: "gate", pair: 1 });
    } finally {
      restore();
    }
  });

  it("CONTROL: an object dropped on a tile's OCCUPIED hex is refused; a FREE slot appends a second token", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const off = offTileHexNearFar();
      // Multi-token tiles: the occupied HEX refuses (never stacked)…
      const refuseChange = vi.fn();
      const refuseObjects = vi.fn();
      const refused = renderConv(
        [
          { row: town.row, col: town.col, group: "starting", faceDown: false },
          { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: monoSlots[0] } }
        ],
        [{ kind: "monolith", placement: { type: "standalone", row: off.row, col: off.col } }],
        refuseChange,
        refuseObjects
      );
      const refusedToken = refused.querySelector(".designerObjectToken")!;
      const grabAt = hexToPixel(off, HEX);
      const occupiedAt = hexToPixel(tileFootprint(far, 0)[monoSlots[0]], HEX);
      fireEvent.pointerDown(refusedToken, { button: 0, pointerId: 33, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 33, clientX: occupiedAt.x, clientY: occupiedAt.y });
      fireEvent.pointerUp(window, { pointerId: 33 });
      expect(refuseChange).not.toHaveBeenCalled();
      expect(refuseObjects).not.toHaveBeenCalled();
      cleanup();

      // …while a FREE legal slot converts the object into a SECOND tile token.
      let tiles: CustomMapTilePlan[] = [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: monoSlots[0] } }
      ];
      let objs: CustomMapObject[] = [
        { kind: "monolith", placement: { type: "standalone", row: off.row, col: off.col } }
      ];
      const onChange = vi.fn((next: CustomMapTilePlan[]) => {
        tiles = next;
      });
      const onObjectsChange = vi.fn((next: CustomMapObject[]) => {
        objs = next;
      });
      const container = renderConv(tiles, objs, onChange, onObjectsChange);
      const token = container.querySelector(".designerObjectToken")!;
      const freeAt = hexToPixel(tileFootprint(far, 0)[monoSlots[1] ?? monoSlots[0]], HEX);
      fireEvent.pointerDown(token, { button: 0, pointerId: 34, clientX: grabAt.x, clientY: grabAt.y });
      fireEvent.pointerMove(window, { pointerId: 34, clientX: freeAt.x, clientY: freeAt.y });
      fireEvent.pointerUp(window, { pointerId: 34 });
      expect(objs, "the standalone object converted").toHaveLength(0);
      expect(tiles[1].tokens).toStrictEqual([
        { kind: "monolith", slot: monoSlots[0] },
        { kind: "monolith", slot: monoSlots[1] ?? monoSlots[0] }
      ]);
    } finally {
      restore();
    }
  });

  it("a Gate TILE TOKEN renders its PER-COLOR portal art plus the color ring + pair badge (designer)", () => {
    const container = renderConv([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: far.row, col: far.col, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "gate", pair: 2, slot: monoSlots[0] } }
    ]);
    const gateToken = container.querySelector(".designerMapToken.gate")!;
    expect(gateToken, "gate token rendered").toBeTruthy();
    // The Teleport Gate wears its own per-color portal (blue for pair 2) — the
    // tinted-monolith rendering is retired…
    expect(gateToken.querySelector('image[href*="tokens/teleport-gate-blue"]'), "blue portal art href").toBeTruthy();
    // …plus a readable pair badge naming its color.
    expect(gateToken.querySelector(".designerMapTokenPair")?.textContent).toBe("2");
  });

  it("a Gate STANDALONE object also renders the per-color portal art + pair badge (designer)", () => {
    const container = renderConv(
      [{ row: town.row, col: town.col, group: "starting", faceDown: false }],
      [{ kind: "gate", pair: 4, placement: { type: "standalone", row: town.row - 3, col: town.col } }]
    );
    const gate = container.querySelector(".designerObjectToken.gate")!;
    expect(gate.querySelector('image[href*="tokens/teleport-gate-violet"]'), "violet portal art").toBeTruthy();
    expect(gate.querySelector(".designerObjectPair")?.textContent).toBe("4");
  });
});

// ---------------------------------------------------------------------------
// SPECIFIC per-tile object plans + pick mode + hex-event markers (2026-07).
// ---------------------------------------------------------------------------
describe("MapDesigner — specific object plans & hex events", () => {
  // N15 prints BOTH an obelisk and a mine (near tile).
  const town = { row: 8, col: 2 };
  const n15 = { row: 12, col: 6 };

  it("the popover shows the Mine/Obelisk sections ONLY for an eligible tile, and the winCondition tick writes objectPlans", () => {
    const onChange = vi.fn();
    const container = renderDesigner(
      [
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: n15.row, col: n15.col, group: "near", faceDown: false, tileDefId: "N15" }
      ],
      onChange
    );
    const popover = openTilePopover(container, 1);
    expect(within(popover).getByLabelText("Special mine (this tile)")).toBeTruthy();
    expect(within(popover).getByLabelText("Special obelisk (this tile)")).toBeTruthy();

    fireEvent.click(within(popover).getByLabelText("First clear of this mine wins the game"));
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ group: "starting" }),
      expect.objectContaining({
        tileDefId: "N15",
        objectPlans: { mine: { winCondition: true } }
      })
    ]);
  });

  it("CONTROL: a tile whose def has no mine/obelisk shows neither section", () => {
    // F1 is a far tile without an obelisk (far pool never carries one).
    const farNoObelisk = Object.values(allTileDefinitions).find(
      (def) =>
        def.group === "far" &&
        !def.fields.some((field) => field.location === "obelisk") &&
        !def.fields.some((field) => field.location === "mine")
    );
    if (!farNoObelisk) {
      // Every far tile carries a mine — the mine section may show; obelisk must not.
      const anyFar = Object.values(allTileDefinitions).find(
        (def) => def.group === "far" && !def.fields.some((field) => field.location === "obelisk")
      )!;
      const container = renderDesigner([
        { row: town.row, col: town.col, group: "starting", faceDown: false },
        { row: n15.row, col: n15.col, group: "far", faceDown: false, tileDefId: anyFar.id }
      ]);
      const popover = openTilePopover(container, 1);
      expect(within(popover).queryByLabelText("Special obelisk (this tile)")).toBeNull();
      return;
    }
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      { row: n15.row, col: n15.col, group: "far", faceDown: false, tileDefId: farNoObelisk.id }
    ]);
    const popover = openTilePopover(container, 1);
    expect(within(popover).queryByLabelText("Special mine (this tile)")).toBeNull();
    expect(within(popover).queryByLabelText("Special obelisk (this tile)")).toBeNull();
  });

  it("pick mode highlights eligible tiles, resolves on an eligible click, and ignores ineligible tiles", () => {
    const onPickResolved = vi.fn();
    const { container } = render(
      <MapDesigner
        customMap={[
          { row: town.row, col: town.col, group: "starting", faceDown: false },
          { row: n15.row, col: n15.col, group: "near", faceDown: false, tileDefId: "N15" }
        ]}
        onChange={() => {}}
        onPickResolved={onPickResolved}
        pickRequest={{ kind: "object-plan", objectKind: "mine" }}
        scenarioId="skirmish"
      />
    );
    // The banner + highlight classes render.
    expect(container.querySelector(".designerPickBanner")).toBeTruthy();
    expect(container.querySelector(".designerFlowerOutline.pickEligible")).toBeTruthy();
    expect(container.querySelector(".designerFlowerOutline.pickDim")).toBeTruthy();

    // Clicking the INELIGIBLE starting tile does nothing.
    const hexes = container.querySelectorAll(".designerHexPlan");
    fireEvent.pointerDown(hexes[0], { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(hexes[0], { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
    expect(onPickResolved).not.toHaveBeenCalled();

    // Clicking the ELIGIBLE N15 tile resolves the pick and opens its popover.
    fireEvent.pointerDown(hexes[7], { button: 0, pointerId: 2, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(hexes[7], { button: 0, pointerId: 2, clientX: 40, clientY: 40 });
    expect(onPickResolved).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".designerPopover")).toBeTruthy();
  });

  it("a tile with a specific plan wears the ⚔ badge (🏁⚔ when a win condition is set)", () => {
    const container = renderDesigner([
      { row: town.row, col: town.col, group: "starting", faceDown: false },
      {
        row: n15.row,
        col: n15.col,
        group: "near",
        faceDown: false,
        tileDefId: "N15",
        objectPlans: { mine: { guard: { level: 5 }, winCondition: true } }
      }
    ]);
    const badge = container.querySelector(".designerSpecificBadge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain("🏁⚔");
    expect(badge!.querySelector("title")!.textContent).toContain("mine");
    expect(badge!.querySelector("title")!.textContent).toContain("WIN on clear");
  });

  it("hex events render a designer-only image-hex marker with the full hover tooltip", () => {
    const { container } = render(
      <MapDesigner
        customMap={[{ row: town.row, col: town.col, group: "starting", faceDown: false }]}
        hexEvents={[
          {
            id: "e1",
            placement: { row: town.row, col: town.col },
            message: "Boo!",
            reward: { gold: 3 }
          }
        ]}
        onChange={() => {}}
        scenarioId="skirmish"
      />
    );
    const token = container.querySelector(".designerHexEventToken");
    expect(token).toBeTruthy();
    // Rich hover explanation: what it is, that players never see it, how to use it.
    const title = token!.querySelector("title")!.textContent!;
    expect(title).toContain("Hidden event");
    expect(title).toContain("invisible in the real game");
    expect(title).toContain("3 gold");
    expect(title).toContain("Click to edit");
    expect(title).toContain("drag to move");
    // The marker wears the event glyph image on a subtle hex outline.
    expect(token!.querySelector("image.designerHexEventImage")?.getAttribute("href")).toContain(
      "hex-event"
    );
    expect(token!.querySelector("polygon.designerHexEventHex")).toBeTruthy();
  });

  /**
   * Stateful harness with LIVE hex events (and optional standalone objects), so
   * placing / editing / dragging re-renders like production. `get()` reads the
   * live event list.
   */
  function renderHexEventDesigner(
    customMap: CustomMapTilePlan[],
    initialEvents: CustomHexEvent[],
    objects: CustomMapObject[] = []
  ): { container: HTMLElement; get: () => CustomHexEvent[] } {
    const box: { current: CustomHexEvent[] } = { current: initialEvents };
    function Harness() {
      const [events, setEvents] = useState(initialEvents);
      box.current = events;
      return (
        <MapDesigner
          scenarioId="skirmish"
          customMap={customMap}
          onChange={() => {}}
          objects={objects}
          onObjectsChange={() => {}}
          hexEvents={events}
          onHexEventsChange={(next) => {
            box.current = next;
            setEvents(next);
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    return { container, get: () => box.current };
  }

  it("the palette 'Hidden event' button arms placement; candidate cells cover tile hexes AND a standalone object hex, and a click places + opens the editor", () => {
    // A tile (7 candidate hexes) plus a standalone garrison off the tile — the
    // event may sit on ANY of them (it is invisible in game, so it stacks on
    // whatever the hex prints).
    const garrisonHex = { row: town.row, col: town.col + 4 };
    const { container, get } = renderHexEventDesigner(
      [{ row: town.row, col: town.col, group: "starting", faceDown: false }],
      [],
      [{ kind: "garrison", placement: { type: "standalone", row: garrisonHex.row, col: garrisonHex.col } }]
    );
    const button = within(container).getByRole("button", { name: /Hidden event/ });
    // Hover explanation on the palette button itself.
    expect(button.getAttribute("title")).toContain("INVISIBLE");
    expect(button.getAttribute("title")).toContain("never shows in the real game");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const slots = container.querySelectorAll(".designerHexEventSlot");
    // 7 tile-footprint hexes + the garrison's standalone hex.
    expect(slots.length).toBe(8);
    // Set-insertion order puts the standalone object hex LAST (tiles first).
    fireEvent.click(slots[slots.length - 1]);
    const events = get();
    expect(events).toHaveLength(1);
    expect(events[0].placement).toEqual({ row: garrisonHex.row, col: garrisonHex.col });
    // Placement disarms and opens the new event's docked editor right away.
    const popover = container.querySelector(".designerHexEventPopover");
    expect(popover).toBeTruthy();
    expect(
      (within(popover as HTMLElement).getByLabelText("Hidden event message") as HTMLInputElement).value
    ).toContain("Something stirs");
  });

  it("clicking a placed marker opens the editor: message edits, option chips and Remove all write through", () => {
    const { container, get } = renderHexEventDesigner(
      [{ row: town.row, col: town.col, group: "starting", faceDown: false }],
      [{ id: "e1", placement: { row: town.row, col: town.col }, message: "Boo!", reward: { gold: 3 } }]
    );
    fireEvent.click(container.querySelector(".designerHexEventToken")!);
    const popover = container.querySelector(".designerHexEventPopover");
    expect(popover).toBeTruthy();
    // Edit the message.
    const input = within(popover as HTMLElement).getByLabelText("Hidden event message");
    fireEvent.change(input, { target: { value: "An ancient trap!" } });
    expect(get()[0].message).toBe("An ancient trap!");
    // Flip to every-player mode via the chip.
    fireEvent.click(within(container.querySelector(".designerHexEventPopover") as HTMLElement).getByRole("button", { name: "Every player once" }));
    expect(get()[0].mode).toBe("each-player");
    // Remove deletes the event and closes the editor.
    fireEvent.click(within(container.querySelector(".designerHexEventPopover") as HTMLElement).getByRole("button", { name: /Remove event/ }));
    expect(get()).toHaveLength(0);
    expect(container.querySelector(".designerHexEventPopover")).toBeNull();
  });

  it("dragging a marker moves the event to another hex (id + settings preserved); the trailing click never opens the editor", () => {
    const restore = installIdentitySvgPolyfills();
    try {
      const target = tileFootprint(town, 0)[3];
      const { container, get } = renderHexEventDesigner(
        [{ row: town.row, col: town.col, group: "starting", faceDown: false }],
        [{ id: "e1", placement: { row: town.row, col: town.col }, message: "Boo!", vp: 2 }]
      );
      const token = container.querySelector(".designerHexEventToken")!;
      const from = hexToPixel(town, 24);
      const to = hexToPixel(target, 24);
      fireEvent.pointerDown(token, { button: 0, pointerId: 5, clientX: from.x, clientY: from.y });
      fireEvent.pointerMove(window, { pointerId: 5, clientX: to.x, clientY: to.y });
      fireEvent.pointerUp(window, { pointerId: 5 });
      expect(get()).toEqual([
        { id: "e1", placement: { row: target.row, col: target.col }, message: "Boo!", vp: 2 }
      ]);
      // The release's trailing click is suppressed — no editor pops open.
      fireEvent.click(container.querySelector(".designerHexEventToken")!);
      expect(container.querySelector(".designerHexEventPopover")).toBeNull();
      // A REAL click afterwards still opens it.
      fireEvent.click(container.querySelector(".designerHexEventToken")!);
      expect(container.querySelector(".designerHexEventPopover")).toBeTruthy();
    } finally {
      restore();
    }
  });
});
