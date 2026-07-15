import { hexSpaceId, hexToPixel, type HexCoord } from "@/engine";

/**
 * Pure math for dragging a designed Subterranean Gate token along the shared
 * boundary of its two tiles (map designer). Split out of the component so the
 * snap rule is unit-testable head-on, the `map-pinch.ts` pattern.
 */

/** One legal boundary position: the Surface gate hex + its adjacent cavern entrance hex. */
export type GateHexPair = { gateHex: HexCoord; entranceHex: HexCoord };

/** Pixel midpoint of a pair's two hexes — where the dragged token pair "is". */
function pairMidpoint(pair: GateHexPair, hexSize: number): { x: number; y: number } {
  const gate = hexToPixel(pair.gateHex, hexSize);
  const entrance = hexToPixel(pair.entranceHex, hexSize);
  return { x: (gate.x + entrance.x) / 2, y: (gate.y + entrance.y) / 2 };
}

/** Stable identity of a pair, used for the deterministic tie-break. */
export function gateHexPairKey(pair: GateHexPair): string {
  return `${hexSpaceId(pair.gateHex)}|${hexSpaceId(pair.entranceHex)}`;
}

/**
 * The legal boundary pair nearest to a board-space point (the drag pointer):
 * smallest squared distance from the point to the pair's midpoint wins; exact
 * ties break on the pair key, so the snap is deterministic for any input.
 * Returns null only for an empty pair list.
 */
export function nearestGateHexPair(
  local: { x: number; y: number },
  pairs: ReadonlyArray<GateHexPair>,
  hexSize: number
): GateHexPair | null {
  let best: GateHexPair | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const pair of pairs) {
    const midpoint = pairMidpoint(pair, hexSize);
    const distance = (midpoint.x - local.x) ** 2 + (midpoint.y - local.y) ** 2;
    const key = gateHexPairKey(pair);
    if (distance < bestDistance || (distance === bestDistance && (best === null || key < bestKey))) {
      best = pair;
      bestDistance = distance;
      bestKey = key;
    }
  }
  return best;
}
