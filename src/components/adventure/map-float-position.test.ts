import { describe, expect, it } from "vitest";
import {
  computeMapFloatPosition,
  mapPointToCssPx,
  placeMapFloatCard,
  type MapFloatViewBox
} from "./map-float-position";

const SQUARE: MapFloatViewBox = { minX: 0, minY: 0, width: 100, height: 100 };

describe("mapPointToCssPx — map point → CSS pixel of the rendered <svg>", () => {
  it("maps to the element centre with an identity camera and a square, unlettered viewport", () => {
    // 100×100 viewBox rendered into 200×200 → uniform k=2, no letterbox.
    const p = mapPointToCssPx(SQUARE, 200, 200, { x: 0, y: 0, scale: 1 }, { x: 50, y: 50 });
    expect(p).toEqual({ x: 100, y: 100 });
  });

  it("adds the horizontal letterbox offset when the element is wider than the viewBox aspect", () => {
    // 100×100 into 400×200 → k = min(4, 2) = 2, scaled width 200, so a 100px
    // letterbox bar sits on each side; the map's centre lands at x=200 (element
    // centre), y=100.
    const p = mapPointToCssPx(SQUARE, 400, 200, { x: 0, y: 0, scale: 1 }, { x: 50, y: 50 });
    expect(p).toEqual({ x: 200, y: 100 });
    // A left-edge map point (x=0) lands on the letterbox offset, NOT at x=0.
    const edge = mapPointToCssPx(SQUARE, 400, 200, { x: 0, y: 0, scale: 1 }, { x: 0, y: 0 });
    expect(edge).toEqual({ x: 100, y: 0 });
  });

  it("adds the vertical letterbox offset when the element is taller than the viewBox aspect", () => {
    // 100×100 into 200×400 → k = min(2, 4) = 2; vertical letterbox of 100px each.
    const p = mapPointToCssPx(SQUARE, 200, 400, { x: 0, y: 0, scale: 1 }, { x: 50, y: 50 });
    expect(p).toEqual({ x: 100, y: 200 });
  });

  it("composes the camera translate+scale before the viewBox mapping", () => {
    // cam = (10,-20) + 1.5*(40,30) = (70, 25); k=2 (200 square); css = 2*cam.
    const p = mapPointToCssPx(SQUARE, 200, 200, { x: 10, y: -20, scale: 1.5 }, { x: 40, y: 30 });
    expect(p).toEqual({ x: 140, y: 50 });
  });

  it("honours a non-zero viewBox origin (minX/minY) by subtracting it", () => {
    const vb: MapFloatViewBox = { minX: -50, minY: -50, width: 100, height: 100 };
    // map point == viewBox origin → element top-left (0,0) with identity camera.
    expect(mapPointToCssPx(vb, 200, 200, { x: 0, y: 0, scale: 1 }, { x: -50, y: -50 })).toEqual({
      x: 0,
      y: 0
    });
    // map point == viewBox centre → element centre.
    expect(mapPointToCssPx(vb, 200, 200, { x: 0, y: 0, scale: 1 }, { x: 0, y: 0 })).toEqual({
      x: 100,
      y: 100
    });
  });

  it("returns {0,0} for degenerate geometry (jsdom: zero-size element)", () => {
    expect(mapPointToCssPx(SQUARE, 0, 0, { x: 0, y: 0, scale: 1 }, { x: 50, y: 50 })).toEqual({
      x: 0,
      y: 0
    });
    expect(
      mapPointToCssPx({ minX: 0, minY: 0, width: 0, height: 0 }, 200, 200, { x: 0, y: 0, scale: 1 }, { x: 1, y: 1 })
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("placeMapFloatCard — card box + above/below flip + on-screen clamp", () => {
  const base = { cardWidth: 200, cardHeight: 100, gap: 20, elementWidth: 800, elementHeight: 600, margin: 6 };

  it("centres the card horizontally on its anchor and sits it above with room", () => {
    const p = placeMapFloatCard({ anchor: { x: 400, y: 300 }, ...base });
    expect(p.above).toBe(true);
    expect(p.left).toBe(400 - 100); // anchor.x - cardWidth/2
    expect(p.top).toBe(300 - 20 - 100); // anchor.y - gap - cardHeight
  });

  it("flips below when there isn't screen room above the anchor", () => {
    // anchor near the top: roomAbove = 40 - (100+20) - 6 < 0 → below.
    const p = placeMapFloatCard({ anchor: { x: 400, y: 40 }, ...base });
    expect(p.above).toBe(false);
    expect(p.top).toBe(40 + 20); // anchor.y + gap
  });

  it("clamps a card whose anchor hugs the right edge fully back on-screen", () => {
    const p = placeMapFloatCard({ anchor: { x: 790, y: 300 }, ...base });
    // Uncapped left would be 690, pushing the 200-wide card to 890 (> 800).
    // Clamp keeps its right edge at elementWidth - margin = 794.
    expect(p.left).toBe(800 - 200 - 6);
    expect(p.left + base.cardWidth).toBeLessThanOrEqual(800);
  });

  it("clamps a card whose anchor hugs the left edge back on-screen", () => {
    const p = placeMapFloatCard({ anchor: { x: 5, y: 300 }, ...base });
    expect(p.left).toBe(6); // margin
  });

  it("clamps the flipped-below card vertically so it never runs off the bottom", () => {
    // Short element: anchor near the top forces a below-flip, and the naive
    // below position (top=60) would run off a 150px-tall element.
    const p = placeMapFloatCard({
      anchor: { x: 400, y: 40 },
      cardWidth: 200,
      cardHeight: 100,
      gap: 20,
      elementWidth: 800,
      elementHeight: 150,
      margin: 6
    });
    expect(p.above).toBe(false);
    expect(p.top).toBe(150 - 100 - 6); // clamped to elementHeight - cardHeight - margin
    expect(p.top + 100).toBeLessThanOrEqual(150);
  });

  it("centres a card too wide/tall to fit within the element instead of pinning an edge", () => {
    const p = placeMapFloatCard({
      anchor: { x: 100, y: 100 },
      cardWidth: 300,
      cardHeight: 250,
      gap: 20,
      elementWidth: 250,
      elementHeight: 200,
      margin: 6
    });
    expect(p.left).toBe((250 - 300) / 2); // -25, centred (unavoidable overflow shared)
    expect(p.top).toBe((200 - 250) / 2); // -25
  });

  it("defaults to above and skips clamping when the element size is unknown (jsdom)", () => {
    const p = placeMapFloatCard({
      anchor: { x: 0, y: 0 },
      cardWidth: 200,
      cardHeight: 100,
      gap: 20,
      elementWidth: 0,
      elementHeight: 0
    });
    expect(p.above).toBe(true);
    expect(p.left).toBe(-100);
    expect(p.top).toBe(-120);
  });
});

describe("computeMapFloatPosition — the map-point-to-card-box convenience", () => {
  it("maps through the camera then places+clamps in one call", () => {
    const r = computeMapFloatPosition({
      viewBox: SQUARE,
      elementWidth: 200,
      elementHeight: 200,
      camera: { x: 0, y: 0, scale: 1 },
      mapPoint: { x: 50, y: 50 },
      cardWidth: 80,
      cardHeight: 40,
      gap: 10
    });
    expect(r.anchor).toEqual({ x: 100, y: 100 });
    expect(r.above).toBe(true);
    expect(r.left).toBe(100 - 40); // centred on anchor
    expect(r.top).toBe(100 - 10 - 40);
  });
});
