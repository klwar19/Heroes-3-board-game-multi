// @vitest-environment jsdom
/**
 * The read-only map-shape preview: a scenario sheet / designed map's tile
 * flowers as one SVG. These pin the DERIVATION (every layout band becomes a
 * preview tile of the right group, seats numbered in order), the REAL printed
 * tile GRAPHIC each tile shows (`planTileArt` — face scans for pinned face-up
 * tiles, band-correct BACKS for seat / face-down slots, at the board's own art
 * geometry), and that the rendered SVG really draws one band-coloured outline per
 * tile — the designer and this preview share `flowerOutline` / `GROUP_COLORS` /
 * `planTileArt`, so a regression in either surfaces here.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { allTileDefinitions } from "@/data/map/tiles";
import { scenarioDefinitions, type CustomMapTilePlan } from "@/engine";
import {
  designedTilesToPreview,
  flowerOutline,
  GROUP_COLORS,
  MapShapePreview,
  planBackArt,
  planTileArt,
  planTileArtRotation,
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
      // EVERY tile carries the printed BACK of its own band — a scenario sheet
      // pins only the shape, so the honest graphic is the physical laid-out board.
      for (const tile of tiles) {
        expect(tile.art, `${scenario.id} ${tile.group} back art`).toBe(planBackArt({ group: tile.group }));
      }
    }
  });

  it("gives each band its OWN back art (a Ⅱ–Ⅲ tile never wears the Ⅳ–Ⅴ back)", () => {
    const backs = new Map<string, string>();
    for (const scenario of Object.values(scenarioDefinitions)) {
      for (const tile of scenarioToTilePlans(scenario)) {
        backs.set(tile.group, tile.art ?? "");
      }
    }
    // The four land bands are the ones every sheet has; each must be a distinct
    // file (the mutation control for a single hardcoded back).
    const land = ["starting", "far", "near", "center"].map((group) => backs.get(group));
    expect(land.every(Boolean)).toBe(true);
    expect(new Set(land).size, "one back art per band").toBe(4);
    expect(backs.get("far")).toContain("back-far");
    expect(backs.get("center")).toContain("back-center");
  });
});

describe("planTileArt (shared with the map designer)", () => {
  const plan = (over: Partial<CustomMapTilePlan>): CustomMapTilePlan =>
    ({ row: 0, col: 0, group: "far", faceDown: true, ...over }) as CustomMapTilePlan;
  // A real face-up tile with printed art, taken from the data (never hardcoded).
  const [faceUpId, faceUpArt] = (() => {
    const hit = Object.entries(allTileDefinitions).find(([, def]) => def.assets?.tileImage);
    if (!hit) throw new Error("no tile definition ships face art");
    return [hit[0], hit[1].assets!.tileImage as string] as const;
  })();

  it("shows the band-correct BACK for a seat / face-down slot", () => {
    expect(planTileArt(plan({ group: "starting", faceDown: false }))).toBe(planBackArt({ group: "starting" }));
    expect(planTileArt(plan({ group: "far" }))).toBe(planBackArt({ group: "far" }));
    // Sea / underground Ⅵ–Ⅶ must not wear the Ⅳ–Ⅴ back.
    expect(planTileArt(plan({ group: "sea", seaBand: "vi-vii" }))).toContain("back-sea-vi-vii");
    expect(planTileArt(plan({ group: "sea", seaBand: "iv-v" }))).toContain("back-sea.webp");
  });

  it("shows a pinned face-up tile's own face scan (and the first 'one of' candidate)", () => {
    expect(planTileArt(plan({ faceDown: false, tileDefId: faceUpId }))).toBe(faceUpArt);
    expect(planTileArt(plan({ faceDown: false, oneOfTileDefIds: [faceUpId] }))).toBe(faceUpArt);
    // A plain random face-up slot has no tile yet — no art, the band colour alone.
    expect(planTileArt(plan({ faceDown: false }))).toBeUndefined();
  });

  it("rotates ONLY a face-up scan (backs are orientation-independent)", () => {
    expect(planTileArtRotation(plan({ faceDown: false, tileDefId: faceUpId, rotation: 3 }))).toBe(3);
    expect(planTileArtRotation(plan({ faceDown: true, rotation: 3 })), "a printed back never rotates").toBe(0);
    expect(planTileArtRotation(plan({ group: "starting", faceDown: false, rotation: 3 }))).toBe(0);
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
    // Each plan carries exactly the graphic the designer board draws for it.
    expect(tiles.map((tile) => tile.art)).toEqual(plans.map((plan) => planTileArt(plan)));
    expect(tiles.map((tile) => tile.artRotation)).toEqual(plans.map((plan) => planTileArtRotation(plan)));
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

  it("draws each tile's REAL printed graphic, in one background layer before every outline", () => {
    const scenario = scenarioDefinitions["land-2p"];
    const tiles = scenarioToTilePlans(scenario);
    const { container } = render(<MapShapePreview tiles={tiles} />);
    const svg = container.querySelector("svg") as SVGElement;

    const images = Array.from(svg.querySelectorAll("image"));
    expect(images, "one printed graphic per tile").toHaveLength(tiles.length);
    for (const [index, tile] of tiles.entries()) {
      expect(images[index].getAttribute("href")).toBe(tile.art);
      // The board's own art geometry: a flower's exact bounding box, unstretched
      // aspect (3·√3·size wide, 5·size tall at size 10).
      expect(Number(images[index].getAttribute("width"))).toBeCloseTo(3 * Math.sqrt(3) * 10, 6);
      expect(images[index].getAttribute("height")).toBe("50");
      expect(images[index].getAttribute("preserveAspectRatio")).toBe("none");
    }
    // Every image precedes every outline path, so no neighbouring art box can
    // paint over an already-drawn ring.
    const drawn = Array.from(svg.children).flatMap((node) =>
      node.tagName === "image" ? ["image"] : node.tagName === "g" ? ["g"] : []
    );
    expect(drawn).toEqual([...tiles.map(() => "image"), ...tiles.map(() => "g")]);
    // The band tint drops back so the scan reads through it (it is the ONLY fill
    // when a tile has no art — see the control below).
    expect(svg.querySelector("polygon")?.getAttribute("fill-opacity")).toBe("0.14");
  });

  it("dashes an underground tile's outline, keeps the full fill with NO art, and renders nothing for an empty map", () => {
    const { container } = render(
      <MapShapePreview tiles={[{ row: 0, col: 0, group: "near", underground: true }]} />
    );
    expect((container.querySelector("path") as SVGElement).getAttribute("stroke-dasharray")).toBe("4 3");
    // CONTROL — an art-less tile draws no image and keeps the original band fill.
    expect(container.querySelectorAll("image")).toHaveLength(0);
    expect(container.querySelector("polygon")?.getAttribute("fill-opacity")).toBe("0.16");
    cleanup();

    const empty = render(<MapShapePreview tiles={[]} />);
    expect(empty.container.querySelector("svg")).toBeNull();
  });

  it("rotates a face-up designed scan and never a printed back", () => {
    const faceUpId = Object.entries(allTileDefinitions).find(([, def]) => def.assets?.tileImage)![0];
    const plans: CustomMapTilePlan[] = [
      { row: 0, col: 0, group: "far", faceDown: false, tileDefId: faceUpId, rotation: 2 },
      { row: 6, col: 3, group: "far", faceDown: true, rotation: 2 }
    ] as CustomMapTilePlan[];
    const { container } = render(<MapShapePreview tiles={designedTilesToPreview(plans)} />);
    const images = Array.from(container.querySelectorAll("image"));

    expect(images[0].getAttribute("transform")).toMatch(/^rotate\(120 /);
    expect(images[1].getAttribute("transform"), "a printed back is upright").toBeNull();
  });
});
