// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MapDesigner, planBackArt, planBackLabel } from "./map-designer";
import {
  hexSpaceId,
  legalGateHexPairs,
  planSubterraneanGates,
  tileLatticeNeighbors,
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
