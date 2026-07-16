import { hexSpaceId, hexToPixel, type HexCoord } from "@/engine";

/**
 * Pure math for dragging a designed Subterranean Gate token along the shared
 * boundary of its two tiles (map designer). Split out of the component so the
 * snap rule is unit-testable head-on, the `map-pinch.ts` pattern.
 */

/** One legal boundary position: the Surface gate hex + its adjacent cavern entrance hex. */
export type GateHexPair = { gateHex: HexCoord; entranceHex: HexCoord };

/**
 * A boundary pair tagged with the Surface tile it would connect the cavern to.
 * Lets a gate drag offer positions across EVERY touching Surface tile at once, so
 * dropping the token on another tile's edge RE-TARGETS the gate to that tile —
 * not merely slides it along the one surface it started on.
 */
export type GateDragCandidate = GateHexPair & { surfaceCenter: { row: number; col: number } };

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
 * Surface-aware identity of a cross-surface candidate: two candidates on
 * different Surface tiles can never tie-collide even in the (impossible on a
 * valid layout) event they shared a hex pair, so the snap stays deterministic.
 */
export function gateDragCandidateKey(candidate: GateDragCandidate): string {
  return `${candidate.surfaceCenter.row}:${candidate.surfaceCenter.col}|${gateHexPairKey(candidate)}`;
}

/**
 * The item nearest to a board-space point (the drag pointer) by pair midpoint:
 * smallest squared distance wins; exact ties break on the ascending `keyOf`, so
 * the snap is deterministic for any input. Returns null only for an empty list.
 */
function nearestByMidpoint<T extends GateHexPair>(
  local: { x: number; y: number },
  items: ReadonlyArray<T>,
  hexSize: number,
  keyOf: (item: T) => string
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const item of items) {
    const midpoint = pairMidpoint(item, hexSize);
    const distance = (midpoint.x - local.x) ** 2 + (midpoint.y - local.y) ** 2;
    const key = keyOf(item);
    if (distance < bestDistance || (distance === bestDistance && (best === null || key < bestKey))) {
      best = item;
      bestDistance = distance;
      bestKey = key;
    }
  }
  return best;
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
  return nearestByMidpoint(local, pairs, hexSize, gateHexPairKey);
}

/**
 * The nearest boundary pair ACROSS surfaces — the drag-time snap that can carry
 * the gate onto a DIFFERENT Surface tile. Same midpoint-distance rule as
 * {@link nearestGateHexPair}, but the winner keeps its `surfaceCenter`, so the
 * caller knows which tile the drop should connect the cavern to. Ties break on
 * the surface-aware key; null only for an empty candidate list.
 */
export function nearestGateDragCandidate(
  local: { x: number; y: number },
  candidates: ReadonlyArray<GateDragCandidate>,
  hexSize: number
): GateDragCandidate | null {
  return nearestByMidpoint(local, candidates, hexSize, gateDragCandidateKey);
}
