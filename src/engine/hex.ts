import type { MapSpaceId } from "./state";

/**
 * Adventure-map hex math. The map is one global pointy-top hex grid using
 * odd-r offset coordinates (odd rows are shifted half a hex to the right),
 * the same convention as the community scenario editor
 * (https://zedero.github.io/HoMM3BoardgameScenarioEditor/), so tile data can
 * be cross-checked against it. Every physical map tile is a "flower" of
 * 7 hexes: one center field plus a ring of 6 fields.
 */
export type HexCoord = { row: number; col: number };

/** Ring directions in clockwise order, starting north-east. */
export const HEX_DIRECTIONS = ["NE", "E", "SE", "SW", "W", "NW"] as const;
export type HexDirection = (typeof HEX_DIRECTIONS)[number];

const EVEN_ROW_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // NE
  [0, 1], // E
  [1, 0], // SE
  [1, -1], // SW
  [0, -1], // W
  [-1, -1] // NW
];

const ODD_ROW_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1], // NE
  [0, 1], // E
  [1, 1], // SE
  [1, 0], // SW
  [0, -1], // W
  [-1, 0] // NW
];

export function hexSpaceId(coord: HexCoord): MapSpaceId {
  return `h:${coord.row}:${coord.col}`;
}

export function parseHexSpaceId(spaceId: MapSpaceId): HexCoord | null {
  const match = /^h:(-?\d+):(-?\d+)$/.exec(spaceId);
  if (!match) {
    return null;
  }

  return { row: Number(match[1]), col: Number(match[2]) };
}

export function hexNeighbor(coord: HexCoord, direction: number): HexCoord {
  const offsets = coord.row % 2 === 0 ? EVEN_ROW_OFFSETS : ODD_ROW_OFFSETS;
  const offset = offsets[((direction % 6) + 6) % 6];
  return { row: coord.row + offset[0], col: coord.col + offset[1] };
}

/** All six neighbours in ring order NE, E, SE, SW, W, NW. */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map((_, direction) => hexNeighbor(coord, direction));
}

export function hexEquals(left: HexCoord, right: HexCoord): boolean {
  return left.row === right.row && left.col === right.col;
}

type CubeCoord = { q: number; r: number; s: number };

export function offsetToCube(coord: HexCoord): CubeCoord {
  const q = coord.col - (coord.row - (coord.row & 1)) / 2;
  const r = coord.row;
  return { q, r, s: -q - r };
}

function axialToOffset(q: number, r: number): HexCoord {
  return { row: r, col: q + (r - (r & 1)) / 2 };
}

export function hexDistance(left: HexCoord, right: HexCoord): number {
  const a = offsetToCube(left);
  const b = offsetToCube(right);
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

/**
 * Tile field slots: slot 0 is the tile's center hex, slots 1-6 are the ring
 * hexes in the unrotated tile's NE, E, SE, SW, W, NW directions.
 */
export const TILE_SLOT_COUNT = 7;

/**
 * The wiki lists every tile's 7 fields in visual reading order
 * (NW, NE / W, C, E / SW, SE). This maps reading-order index -> slot.
 */
export const READING_ORDER_TO_SLOT: readonly number[] = [6, 1, 5, 0, 2, 4, 3];

/**
 * Footprint hexes of a tile placed with its center at `center`, rotated by
 * `rotation` clockwise 60-degree steps. Index 0 is the center; index `slot`
 * (1-6) is where that tile slot ends up on the map after rotation.
 */
export function tileFootprint(center: HexCoord, rotation: number): HexCoord[] {
  const ring = hexNeighbors(center);
  const cells: HexCoord[] = [center];
  for (let slot = 1; slot <= 6; slot += 1) {
    const direction = (slot - 1 + rotation) % 6;
    cells.push(ring[direction]);
  }
  return cells;
}

/**
 * The ring direction (0-5, NE-NW) a tile slot faces after rotation, or null
 * for the center slot.
 */
export function slotDirection(slot: number, rotation: number): number | null {
  if (slot === 0) {
    return null;
  }

  return (slot - 1 + rotation) % 6;
}

/**
 * The ring direction `d` (0-5) for which `hexNeighbor(a, d)` equals `b`, or null
 * when `b` is not one of `a`'s six neighbours — the inverse of {@link hexNeighbor}
 * over a single step, used to name the exact edge two adjacent hexes share.
 */
export function hexDirectionBetween(a: HexCoord, b: HexCoord): number | null {
  for (let direction = 0; direction < 6; direction += 1) {
    const neighbor = hexNeighbor(a, direction);
    if (neighbor.row === b.row && neighbor.col === b.col) {
      return direction;
    }
  }
  return null;
}

/**
 * The reference 7-hex flower footprint (centre at the origin). The flower's
 * INTERNAL adjacency graph — which footprint hex neighbours which, in which
 * direction — is identical at every board position (verified parity-invariant),
 * so this one reference is enough to canonicalise a designer edge code without
 * knowing the real tile centre.
 */
const REFERENCE_FOOTPRINT: readonly HexCoord[] = tileFootprint({ row: 0, col: 0 }, 0);

/**
 * Precomputed canonical form of every possible tile-edge code (0-41). See
 * {@link canonicalTileEdgeCode}. Building it once keeps that lookup an O(1) array
 * read — safe on the movement BFS hot path.
 */
const CANONICAL_TILE_EDGE_CODE: readonly number[] = (() => {
  const table: number[] = [];
  for (let footprintIndex = 0; footprintIndex < TILE_SLOT_COUNT; footprintIndex += 1) {
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = hexNeighbor(REFERENCE_FOOTPRINT[footprintIndex], direction);
      const mirrorIndex = REFERENCE_FOOTPRINT.findIndex((cell) => hexEquals(cell, neighbor));
      const code = footprintIndex * 6 + direction;
      table[code] = mirrorIndex < 0 ? code : Math.min(code, mirrorIndex * 6 + ((direction + 3) % 6));
    }
  }
  return table;
})();

/**
 * Canonical code for ONE hex edge of a tile's footprint, in the rotation-0
 * BOARD-ABSOLUTE frame the map designer's per-edge yellow borders
 * (`CustomMapTilePlan.borderEdges`) use:
 * `code = footprintIndex*6 + absoluteDirection`, footprintIndex 0-6 = index into
 * `tileFootprint(center, 0)` (0 is the centre), absoluteDirection 0-5.
 *
 * An INNER edge (between two footprint hexes) has two equivalent codes — `(i, d)`
 * and `(j, (d+3)%6)` where `tileFootprint(center,0)[j] = hexNeighbor(footprint[i],
 * d)` — and folds onto the SMALLER so one physical edge is stored once; an OUTER
 * edge (facing off the tile) keeps its single code. The 42 codes map to 30
 * distinct canonical values (18 outer + 12 inner). Because the flower's internal
 * adjacency is placement-invariant, the code is rotation- and centre-independent,
 * the same guarantee the whole-arc frame relies on.
 */
export function canonicalTileEdgeCode(footprintIndex: number, absoluteDirection: number): number {
  const fpi = ((footprintIndex % TILE_SLOT_COUNT) + TILE_SLOT_COUNT) % TILE_SLOT_COUNT;
  const dir = ((absoluteDirection % 6) + 6) % 6;
  return CANONICAL_TILE_EDGE_CODE[fpi * 6 + dir];
}

/** Two tiles may not overlap: flower footprints stay apart at distance >= 3. */
export function tileCentersOverlap(left: HexCoord, right: HexCoord): boolean {
  return hexDistance(left, right) < 3;
}

/**
 * Center-to-center vectors (axial, with their negatives) to a tile's six
 * gapless neighbours.
 *
 * Seven-hex flowers tile the plane only on a single index-7 sublattice — the
 * classic hex-of-hexes packing where each flower's protruding fields drop into
 * its neighbours' notches. There are 18 hexes at center-distance 3, but only
 * these 6 interlock with no hole; the other 12 share an edge yet leave a gap
 * the size of a field. Restricting placement to these vectors is what makes the
 * map gapless, and any two tiles reachable through them stay on one sublattice
 * (each vector changes the lattice color 3q+r by a multiple of 7).
 */
const TILE_NEIGHBOR_VECTORS_AXIAL: ReadonlyArray<readonly [number, number]> = [
  [2, 1],
  [1, -3],
  [3, -2],
  [-2, -1],
  [-1, 3],
  [-3, 2]
];

/** The six tile-center positions whose flowers interlock gaplessly with `center`. */
export function tileLatticeNeighbors(center: HexCoord): HexCoord[] {
  const { q, r } = offsetToCube(center);
  return TILE_NEIGHBOR_VECTORS_AXIAL.map(([dq, dr]) => axialToOffset(q + dq, r + dr));
}

/**
 * True when two tile centers are gapless neighbours on the flower sublattice —
 * i.e. their 7-field footprints interlock edge-to-edge with no hole between
 * them. This is the placement-adjacency relation: a tile may only be added next
 * to tiles it is gapless-adjacent to.
 */
export function tileCentersAdjacent(left: HexCoord, right: HexCoord): boolean {
  const a = offsetToCube(left);
  const b = offsetToCube(right);
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  return TILE_NEIGHBOR_VECTORS_AXIAL.some(([vq, vr]) => vq === dq && vr === dr);
}

/**
 * True when two tiles physically TOUCH — at least one hex of `left`'s footprint
 * shares an edge with a hex of `right`'s footprint. This is a WEAKER relation
 * than {@link tileCentersAdjacent}: the 6 interlocking sublattice neighbours all
 * touch, but so do 12 further distance-3 positions that share an edge yet leave a
 * field-sized hole elsewhere (so they are not "gapless" neighbours).
 *
 * A Subterranean Gate only needs ONE edge-adjacent hex pair to bridge a Surface
 * and a Subterranean tile, so gate placement keys off this touch relation, not
 * the stricter interlocking one — otherwise a hand-placed cavern that visibly
 * abuts a Surface tile (but lands on one of those 12 non-interlocking offsets)
 * would never receive a gate and stay forever unreachable.
 */
export function tileFootprintsTouch(left: HexCoord, right: HexCoord): boolean {
  // Far-apart centres can't touch; cheap reject before the footprint scan.
  if (hexDistance(left, right) > 5) {
    return false;
  }
  const rightHexes = new Set(tileFootprint(right, 0).map(hexSpaceId));
  for (const cell of tileFootprint(left, 0)) {
    for (const neighbor of hexNeighbors(cell)) {
      if (rightHexes.has(hexSpaceId(neighbor))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The tile's sublattice class (0-6). Every tile center of one connected,
 * gapless map shares a single color; mixing colors would leave field-sized
 * holes. Useful for validating that a layout actually tiles.
 */
export function tileLatticeColor(center: HexCoord): number {
  const { q, r } = offsetToCube(center);
  return (((3 * q + r) % 7) + 7) % 7;
}

/**
 * Pixel coordinates for rendering (pointy-top): `size` is the hex circumradius.
 * Returns the hex center.
 */
export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  const width = Math.sqrt(3) * size;
  return {
    x: width * (coord.col + (coord.row & 1) * 0.5),
    y: size * 1.5 * coord.row
  };
}

/**
 * Nearest hex to a pixel point (pointy-top, odd-r) — the inverse of
 * `hexToPixel` with the same `size` circumradius. The map designer uses this to
 * drop a tile freely on whatever hex the pointer is over, instead of snapping to
 * a fixed lattice slot.
 */
export function pixelToHex(x: number, y: number, size: number): HexCoord {
  const r = y / (size * 1.5);
  const q = x / (Math.sqrt(3) * size) - r / 2;
  return cubeRound(q, r);
}

/** Rounds fractional axial coordinates to the nearest whole hex (offset form). */
function cubeRound(qf: number, rf: number): HexCoord {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  // Snap the coordinate that drifted most back onto the q+r+s=0 plane.
  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  }
  // Math.round and the negations above can produce -0; fold it to +0 so hex
  // coordinates compare and serialize cleanly.
  return axialToOffset(q === 0 ? 0 : q, r === 0 ? 0 : r);
}
