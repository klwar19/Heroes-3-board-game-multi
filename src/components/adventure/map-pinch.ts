/**
 * Pure math for the hex-map two-finger pinch gesture (zoom + pan).
 *
 * The map is an SVG with a `viewBox` and an inner group transformed by
 * `translate(camera.x camera.y) scale(camera.scale)` — the camera lives in
 * viewBox units. Browsers render the viewBox with the default
 * `preserveAspectRatio="xMidYMid meet"` (uniform scale, letterboxed and
 * centered), so mapping a client-pixel touch point into viewBox units must
 * reproduce exactly that: scale by min(rect/viewBox) and undo the centering
 * offsets. Everything here is side-effect-free so the gesture math is
 * unit-testable without a real layout engine (jsdom has no SVG geometry).
 *
 * Invariant the tests pin: the map point under the pinch midpoint stays under
 * the midpoint while the fingers move — zooming never "slides" the map away
 * from the fingers, and a two-finger drag pans 1:1.
 */

export type PinchCamera = { x: number; y: number; scale: number };
export type PinchPoint = { x: number; y: number };
export type PinchViewBox = { minX: number; minY: number; width: number; height: number };
export type PinchRect = { left: number; top: number; width: number; height: number };

/** Camera scale clamps — one source of truth shared with the map toolbar. */
export const MAP_SCALE_MIN = 0.45;
export const MAP_SCALE_MAX = 2.6;

/**
 * Two fingers closer than this (client px) give a meaningless distance ratio,
 * so the gesture degrades to a pure two-finger pan instead of a zoom spike.
 */
export const MIN_PINCH_DISTANCE_PX = 12;

/**
 * Map a client-pixel point into viewBox coordinates under `xMidYMid meet`.
 * Returns null when the rect or viewBox is degenerate (unlaid-out element).
 */
export function clientToViewBox(
  rect: PinchRect,
  viewBox: PinchViewBox,
  clientX: number,
  clientY: number
): PinchPoint | null {
  if (rect.width <= 0 || rect.height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
    return null;
  }
  const k = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  if (!Number.isFinite(k) || k <= 0) {
    return null;
  }
  const offsetX = (rect.width - k * viewBox.width) / 2;
  const offsetY = (rect.height - k * viewBox.height) / 2;
  return {
    x: viewBox.minX + (clientX - rect.left - offsetX) / k,
    y: viewBox.minY + (clientY - rect.top - offsetY) / k
  };
}

function distance(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PinchPoint, b: PinchPoint): PinchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export type PinchStart = {
  camera: PinchCamera;
  /** The two finger positions (client px) when the second finger landed. */
  a: PinchPoint;
  b: PinchPoint;
};

/**
 * Camera for the current finger positions of an active pinch.
 *
 * scale' = clamp(scale0 × currentDistance / startDistance)
 * camera' keeps the map point that started under the pinch midpoint glued to
 * the CURRENT midpoint: camera' = q1 − (scale'/scale0) × (q0 − camera0), where
 * q0/q1 are the start/current midpoints in viewBox units. With unmoving
 * fingers this returns the start camera unchanged.
 *
 * Falls back to the start camera when geometry is degenerate (zero-size rect),
 * and to pan-only (ratio 1) when the fingers are too close to measure.
 */
export function pinchCamera(
  start: PinchStart,
  currentA: PinchPoint,
  currentB: PinchPoint,
  rect: PinchRect,
  viewBox: PinchViewBox
): PinchCamera {
  const q0 = clientToViewBox(rect, viewBox, (start.a.x + start.b.x) / 2, (start.a.y + start.b.y) / 2);
  const mid1 = midpoint(currentA, currentB);
  const q1 = clientToViewBox(rect, viewBox, mid1.x, mid1.y);
  if (!q0 || !q1) {
    return start.camera;
  }

  const d0 = distance(start.a, start.b);
  const d1 = distance(currentA, currentB);
  const ratio = d0 >= MIN_PINCH_DISTANCE_PX && d1 >= MIN_PINCH_DISTANCE_PX ? d1 / d0 : 1;

  const scale0 = start.camera.scale;
  const scale1 = Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, scale0 * ratio));

  return {
    scale: scale1,
    x: q1.x - (scale1 / scale0) * (q0.x - start.camera.x),
    y: q1.y - (scale1 / scale0) * (q0.y - start.camera.y)
  };
}
