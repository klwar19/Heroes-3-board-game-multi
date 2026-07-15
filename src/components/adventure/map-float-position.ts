/**
 * Pure math for positioning the hex-map's floating control cards (move-confirm,
 * draw-reminder, gate-hint, tile-rotate) as plain HTML absolutely positioned
 * inside the map container — instead of as SVG `<foreignObject>` nodes.
 *
 * WHY this exists: mobile WebKit (every iPhone browser) silently fails to paint
 * `<foreignObject>` HTML that sits under ancestor SVG/CSS transforms, so the old
 * camera-transformed floats showed NOTHING on phones. Rendering the cards as HTML
 * siblings of the `<svg>` sidesteps the bug entirely; this module reproduces the
 * exact map→screen coordinate mapping the SVG performs so the HTML overlay lands
 * on the same pixel it did before, on desktop AND phones.
 *
 * The map is an SVG with a `viewBox` and an inner group transformed by
 * `translate(camera.x camera.y) scale(camera.scale)` (camera lives in viewBox
 * units). Browsers render the viewBox under the default
 * `preserveAspectRatio="xMidYMid meet"` — a uniform scale k = min(rect/viewBox),
 * letterboxed and centered. So mapping a map point to a CSS pixel of the rendered
 * `<svg>` element composes two steps:
 *   1. map → camera space:  cam = camera.{x,y} + camera.scale * point
 *   2. viewBox → CSS px:     css = offset + k * (cam - viewBox.min)
 * with offset = (elementSize - k * viewBoxSize) / 2 (the centering letterbox).
 *
 * Everything here is side-effect-free so it is unit-testable without a real
 * layout engine (jsdom has no SVG geometry / element size).
 */

export type MapFloatViewBox = { minX: number; minY: number; width: number; height: number };
export type MapFloatCamera = { x: number; y: number; scale: number };
export type MapFloatPoint = { x: number; y: number };

/**
 * Map a point in viewBox units to CSS pixels relative to the rendered `<svg>`
 * element's top-left corner, reproducing `xMidYMid meet` letterboxing exactly.
 *
 * Returns {0,0} when the geometry is degenerate (a zero-size viewBox or an
 * unlaid-out element, as in jsdom) so the caller still renders the card — its
 * exact position is irrelevant until real layout exists.
 */
export function mapPointToCssPx(
  viewBox: MapFloatViewBox,
  elementWidth: number,
  elementHeight: number,
  camera: MapFloatCamera,
  mapPoint: MapFloatPoint
): MapFloatPoint {
  if (viewBox.width <= 0 || viewBox.height <= 0 || elementWidth <= 0 || elementHeight <= 0) {
    return { x: 0, y: 0 };
  }
  const k = Math.min(elementWidth / viewBox.width, elementHeight / viewBox.height);
  if (!Number.isFinite(k) || k <= 0) {
    return { x: 0, y: 0 };
  }
  const offsetX = (elementWidth - k * viewBox.width) / 2;
  const offsetY = (elementHeight - k * viewBox.height) / 2;
  const camX = camera.x + camera.scale * mapPoint.x;
  const camY = camera.y + camera.scale * mapPoint.y;
  return {
    x: offsetX + k * (camX - viewBox.minX),
    y: offsetY + k * (camY - viewBox.minY)
  };
}

export type MapFloatPlacement = { left: number; top: number; above: boolean };

/**
 * Final CSS left/top (px, relative to the `<svg>` top-left) for a card of the
 * given size that "points at" an anchor pixel.
 *
 * - The card is centered horizontally on the anchor, and sits `gap` px above it
 *   (bottom edge = anchor.y - gap) when there is room in real screen space,
 *   otherwise it flips below (top edge = anchor.y + gap).
 * - It is then CLAMPED to stay fully on-screen within the element bounds (minus
 *   `margin`), so on a small phone a card whose anchor hugs an edge is never
 *   pushed off-screen. A card wider/taller than the element is centered instead.
 *
 * With a degenerate element size (jsdom) clamping is skipped and the card
 * defaults to "above" — position is moot with no layout.
 */
export function placeMapFloatCard(params: {
  anchor: MapFloatPoint;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  elementWidth: number;
  elementHeight: number;
  margin?: number;
}): MapFloatPlacement {
  const { anchor, cardWidth, cardHeight, gap, elementWidth, elementHeight } = params;
  const margin = params.margin ?? 6;

  // Flip below only when there isn't real screen room above the anchor.
  const roomAbove = anchor.y - (cardHeight + gap) - margin;
  const above = elementHeight <= 0 || roomAbove >= 0;

  let top = above ? anchor.y - gap - cardHeight : anchor.y + gap;
  let left = anchor.x - cardWidth / 2;

  if (elementWidth > 0) {
    if (cardWidth + 2 * margin >= elementWidth) {
      left = (elementWidth - cardWidth) / 2;
    } else {
      left = Math.min(Math.max(left, margin), elementWidth - cardWidth - margin);
    }
  }
  if (elementHeight > 0) {
    if (cardHeight + 2 * margin >= elementHeight) {
      top = (elementHeight - cardHeight) / 2;
    } else {
      top = Math.min(Math.max(top, margin), elementHeight - cardHeight - margin);
    }
  }

  return { left, top, above };
}

/**
 * Convenience: map an anchor point through the camera/viewBox and place a card of
 * the given size at it in one call. Returns the final CSS box plus the resolved
 * anchor pixel (handy for arrows/debugging).
 */
export function computeMapFloatPosition(params: {
  viewBox: MapFloatViewBox;
  elementWidth: number;
  elementHeight: number;
  camera: MapFloatCamera;
  mapPoint: MapFloatPoint;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  margin?: number;
}): MapFloatPlacement & { anchor: MapFloatPoint } {
  const anchor = mapPointToCssPx(
    params.viewBox,
    params.elementWidth,
    params.elementHeight,
    params.camera,
    params.mapPoint
  );
  const placement = placeMapFloatCard({
    anchor,
    cardWidth: params.cardWidth,
    cardHeight: params.cardHeight,
    gap: params.gap,
    elementWidth: params.elementWidth,
    elementHeight: params.elementHeight,
    margin: params.margin
  });
  return { ...placement, anchor };
}
