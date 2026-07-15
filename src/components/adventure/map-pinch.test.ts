import { describe, expect, it } from "vitest";
import {
  clientToViewBox,
  MAP_SCALE_MAX,
  MAP_SCALE_MIN,
  MIN_PINCH_DISTANCE_PX,
  pinchCamera,
  type PinchCamera,
  type PinchRect,
  type PinchViewBox
} from "./map-pinch";

/**
 * Hand-computed fixtures (no reuse of the implementation): rect 800×600 over a
 * 1600×1200 viewBox → uniform scale k = 0.5 with NO letterboxing, so a client
 * point maps to viewBox coords as v = min + client/0.5 = min + 2·client.
 */
const RECT: PinchRect = { left: 0, top: 0, width: 800, height: 600 };
const VIEW: PinchViewBox = { minX: -100, minY: -50, width: 1600, height: 1200 };
const CAMERA: PinchCamera = { x: 40, y: -30, scale: 1 };

describe("clientToViewBox (xMidYMid meet mapping)", () => {
  it("maps client pixels through the uniform scale and viewBox origin", () => {
    // k = min(800/1600, 600/1200) = 0.5; no letterbox offsets.
    expect(clientToViewBox(RECT, VIEW, 0, 0)).toEqual({ x: -100, y: -50 });
    expect(clientToViewBox(RECT, VIEW, 400, 300)).toEqual({ x: 700, y: 550 });
  });

  it("undoes `meet` letterboxing when the aspect ratios differ", () => {
    // rect 800×600 over an 800×800 viewBox: k = min(1, 0.75) = 0.75,
    // rendered content is 600px wide → 100px letterbox bands left and right.
    const rect: PinchRect = { left: 0, top: 0, width: 800, height: 600 };
    const square: PinchViewBox = { minX: 0, minY: 0, width: 800, height: 800 };
    // The rect center must land on the viewBox center.
    expect(clientToViewBox(rect, square, 400, 300)).toEqual({ x: 400, y: 400 });
    // The left content edge sits at client x=100 (after the band).
    expect(clientToViewBox(rect, square, 100, 300)).toEqual({ x: 0, y: 400 });
  });

  it("honours a rect offset (the SVG does not sit at the page origin)", () => {
    const rect: PinchRect = { left: 20, top: 10, width: 800, height: 600 };
    expect(clientToViewBox(rect, VIEW, 20, 10)).toEqual({ x: -100, y: -50 });
  });

  it("returns null for degenerate geometry", () => {
    expect(clientToViewBox({ ...RECT, width: 0 }, VIEW, 10, 10)).toBeNull();
    expect(clientToViewBox(RECT, { ...VIEW, height: 0 }, 10, 10)).toBeNull();
  });
});

describe("pinchCamera", () => {
  it("is the identity while the fingers do not move", () => {
    const start = { camera: CAMERA, a: { x: 300, y: 300 }, b: { x: 500, y: 300 } };
    expect(pinchCamera(start, start.a, start.b, RECT, VIEW)).toEqual(CAMERA);
  });

  it("scales by the finger-distance ratio and keeps the midpoint's map point anchored", () => {
    // Fingers 200px apart spread to 400px symmetrically about (400, 300):
    // ratio 2, midpoint unchanged.
    const start = { camera: CAMERA, a: { x: 300, y: 300 }, b: { x: 500, y: 300 } };
    const next = pinchCamera(start, { x: 200, y: 300 }, { x: 600, y: 300 }, RECT, VIEW);
    expect(next.scale).toBeCloseTo(2);
    // Anchor invariant, computed by hand: the midpoint (400,300) is viewBox
    // point q = (700, 550). The map point under it is p = (q − c)/s =
    // (660, 580). After the zoom it must still render at q: c' = q − s'·p =
    // (700 − 2·660, 550 − 2·580) = (−620, −610).
    expect(next.x).toBeCloseTo(-620);
    expect(next.y).toBeCloseTo(-610);
  });

  it("pans 1:1 in viewBox units when both fingers translate together", () => {
    const start = { camera: CAMERA, a: { x: 300, y: 300 }, b: { x: 500, y: 300 } };
    // Both fingers +50px right, +25px down → midpoint moves (50, 25) client px
    // = (100, 50) viewBox units at k = 0.5. Scale must stay 1.
    const next = pinchCamera(start, { x: 350, y: 325 }, { x: 550, y: 325 }, RECT, VIEW);
    expect(next.scale).toBeCloseTo(1);
    expect(next.x).toBeCloseTo(CAMERA.x + 100);
    expect(next.y).toBeCloseTo(CAMERA.y + 50);
  });

  it("clamps the scale to the shared map limits (and anchors with the CLAMPED scale)", () => {
    const start = { camera: { x: 0, y: 0, scale: 2 }, a: { x: 300, y: 300 }, b: { x: 500, y: 300 } };
    // Ratio 4 would give scale 8 — clamps to MAP_SCALE_MAX.
    const zoomedIn = pinchCamera(start, { x: 0, y: 300 }, { x: 800, y: 300 }, RECT, VIEW);
    expect(zoomedIn.scale).toBe(MAP_SCALE_MAX);
    // q = (700, 550); p = (q − 0)/2 = (350, 275); c' = q − 2.6·p = (−210, −165).
    expect(zoomedIn.x).toBeCloseTo(700 - MAP_SCALE_MAX * 350);
    expect(zoomedIn.y).toBeCloseTo(550 - MAP_SCALE_MAX * 275);

    // Pinching almost closed clamps at the minimum instead of collapsing.
    const zoomedOut = pinchCamera(
      { camera: { x: 0, y: 0, scale: 0.5 }, a: { x: 0, y: 300 }, b: { x: 800, y: 300 } },
      { x: 380, y: 300 },
      { x: 420, y: 300 },
      RECT,
      VIEW
    );
    expect(zoomedOut.scale).toBe(MAP_SCALE_MIN);
  });

  it("degrades to pan-only when the fingers are too close to measure a ratio", () => {
    const tight = MIN_PINCH_DISTANCE_PX / 2;
    const start = { camera: CAMERA, a: { x: 400, y: 300 }, b: { x: 400 + tight, y: 300 } };
    // Fingers stay tight but drift 10px right: no zoom spike, just the pan.
    const next = pinchCamera(start, { x: 410, y: 300 }, { x: 410 + tight, y: 300 }, RECT, VIEW);
    expect(next.scale).toBeCloseTo(CAMERA.scale);
    expect(next.x).toBeCloseTo(CAMERA.x + 20);
    expect(next.y).toBeCloseTo(CAMERA.y);
  });

  it("returns the start camera untouched on degenerate geometry", () => {
    const start = { camera: CAMERA, a: { x: 300, y: 300 }, b: { x: 500, y: 300 } };
    expect(pinchCamera(start, { x: 200, y: 300 }, { x: 600, y: 300 }, { ...RECT, width: 0 }, VIEW)).toEqual(
      CAMERA
    );
  });
});
