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
