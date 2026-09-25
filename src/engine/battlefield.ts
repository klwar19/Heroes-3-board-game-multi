export const BATTLEFIELD_COLUMNS = 4;
export const BATTLEFIELD_ROWS = 5;
export const BATTLEFIELD_CELL_COUNT = BATTLEFIELD_COLUMNS * BATTLEFIELD_ROWS;
export const BATTLEFIELD_CROSSING_ROW = 2;

/**
 * The physical combat attack die from Heroes 3: The Board Game.
 * It has six faces: two showing -1, two showing 0, and two showing +1.
 * Each face modifies the attacking unit's attack value before defense is applied.
 * Source: https://en.homm3bg.wiki/keywords/dice/
 */
export const ATTACK_DIE_FACES: readonly number[] = [-1, -1, 0, 0, 1, 1];

export type BattlefieldTerrain = "grass" | "crossing" | "dirt";

/**
 * Battlefield Expansion hex board (optional "hex-battlefield" mode): 13 hexes
 * per row, 9 rows, pointy-top, EVEN rows shifted half a hex to the right (the
 * printed board: its top row starts half a hex in). Attacker deploys in the two
 * left-most hexes of every row, defender in the two right-most.
 *
 * Hex positions are offset by HEX_POSITION_BASE so every geometry helper here
 * can tell which board a position belongs to from the number alone — no hex
 * position ever collides with a 4×5 square (0..19) or the off-board Arrow Tower
 * (-1). Mixing the two geometries is never adjacent and never in range.
 */
export const HEX_BATTLEFIELD_COLUMNS = 13;
export const HEX_BATTLEFIELD_ROWS = 9;
export const HEX_BATTLEFIELD_CELL_COUNT = HEX_BATTLEFIELD_COLUMNS * HEX_BATTLEFIELD_ROWS;
export const HEX_POSITION_BASE = 100;
/** Deployment zone depth (hexes per row) on each side. */
export const HEX_DEPLOYMENT_DEPTH = 2;
/** Battlefield rulebook: ranged units suffer the penalty at 8 or more hexes. */
export const HEX_RANGED_PENALTY_DISTANCE = 8;
/** Distance reported between positions of different boards (never in range). */
const CROSS_GEOMETRY_DISTANCE = 99;

export type BattlefieldGeometry = "grid" | "hex";

export function isHexPosition(position: number): boolean {
  return Number.isInteger(position) &&
    position >= HEX_POSITION_BASE &&
    position < HEX_POSITION_BASE + HEX_BATTLEFIELD_CELL_COUNT;
}

function isGridPosition(position: number): boolean {
  return Number.isInteger(position) && position >= 0 && position < BATTLEFIELD_CELL_COUNT;
}

/** Hex position for (column, row), or null when off the board. */
export function hexPosition(column: number, row: number): number | null {
  if (!Number.isInteger(column) || !Number.isInteger(row) ||
    column < 0 || column >= HEX_BATTLEFIELD_COLUMNS || row < 0 || row >= HEX_BATTLEFIELD_ROWS) {
    return null;
  }
  return HEX_POSITION_BASE + row * HEX_BATTLEFIELD_COLUMNS + column;
}

/** The geometry a combat is fought on (absent = the classic 4×5 grid). */
export function combatGeometry(combat: { geometry?: BattlefieldGeometry } | null | undefined): BattlefieldGeometry {
  return combat?.geometry === "hex" ? "hex" : "grid";
}

/** Every position of a board, in ascending order. */
export function getBattlefieldPositions(geometry: BattlefieldGeometry): number[] {
  return geometry === "hex"
    ? Array.from({ length: HEX_BATTLEFIELD_CELL_COUNT }, (_, index) => HEX_POSITION_BASE + index)
    : Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, index) => index);
}

type Cube = { q: number; r: number; s: number };

function hexToCube(position: number): Cube {
  const { row, column } = getBattlefieldCoordinates(position);
  // even-r offset: even rows are shoved right.
  const q = column - (row + (row & 1)) / 2;
  return { q, r: row, s: -q - row };
}

function cubeToHex(cube: Cube): number | null {
  const row = cube.r;
  const column = cube.q + (row + (row & 1)) / 2;
  return hexPosition(column, row);
}

/** Six hex directions in cube steps: E, NE, NW, W, SW, SE. */
const HEX_CUBE_DIRECTIONS: readonly Cube[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 }
];

function hexDistanceBetween(left: number, right: number): number {
  const a = hexToCube(left);
  const b = hexToCube(right);
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

/**
 * Hexes of one board row, left to right — the hex reading of a battlefield
 * "line" (a 4×5 column runs from one army's edge to the other's, which is a
 * horizontal hex row on this board).
 */
export function getHexRowPositions(row: number): number[] {
  const positions: number[] = [];
  for (let column = 0; column < HEX_BATTLEFIELD_COLUMNS; column += 1) {
    const position = hexPosition(column, row);
    if (position !== null) positions.push(position);
  }
  return positions;
}

/** The deployment zone hexes of one side (attacker: left edge, defender: right edge). */
export function getHexDeploymentZone(side: "attacker" | "defender"): number[] {
  const columns = side === "attacker"
    ? Array.from({ length: HEX_DEPLOYMENT_DEPTH }, (_, index) => index)
    : Array.from({ length: HEX_DEPLOYMENT_DEPTH }, (_, index) => HEX_BATTLEFIELD_COLUMNS - 1 - index);
  const zone: number[] = [];
  for (let row = 0; row < HEX_BATTLEFIELD_ROWS; row += 1) {
    for (const column of columns) {
      const position = hexPosition(column, row);
      if (position !== null) zone.push(position);
    }
  }
  return zone.sort((a, b) => a - b);
}

/**
 * The space directly beyond TARGET seen from FROM (the next space on the
 * same line), or null when it falls off the board. On the hex board it
 * continues the hex direction from FROM towards TARGET (for a non-adjacent
 * FROM, the closest of the six directions; exact ties resolve to the first in
 * E, NE, NW, W, SW, SE order). The 4×5 grid keeps its own callers' logic.
 */
export function getHexCellBehind(from: number, target: number): number | null {
  if (!isHexPosition(from) || !isHexPosition(target) || from === target) return null;
  const a = hexToCube(from);
  const b = hexToCube(target);
  const distance = hexDistanceBetween(from, target);
  const dq = (b.q - a.q) / distance;
  const dr = (b.r - a.r) / distance;
  const ds = (b.s - a.s) / distance;
  let direction = HEX_CUBE_DIRECTIONS[0];
  let bestError = Infinity;
  for (const candidate of HEX_CUBE_DIRECTIONS) {
    const error = Math.abs(candidate.q - dq) + Math.abs(candidate.r - dr) + Math.abs(candidate.s - ds);
    if (error < bestError - 1e-9) {
      bestError = error;
      direction = candidate;
    }
  }
  return cubeToHex({ q: b.q + direction.q, r: b.r + direction.r, s: b.s + direction.s });
}

/**
 * Hex board: `position` shifted by the same hex vector that leads from `from`
 * to `to` (a whole footprint pushed along a line), or null off the board / off
 * the hex board.
 */
export function hexTranslate(position: number, from: number, to: number): number | null {
  if (!isHexPosition(position) || !isHexPosition(from) || !isHexPosition(to)) return null;
  const p = hexToCube(position);
  const a = hexToCube(from);
  const b = hexToCube(to);
  return cubeToHex({ q: p.q + b.q - a.q, r: p.r + b.r - a.r, s: p.s + b.s - a.s });
}

/**
 * The TAIL hex of a two-hex (double-wide) footprint whose HEAD is `head`: the
 * hex `tailOffset` columns away in the same row (-1 = west, +1 = east). Null
 * when `head` is not a hex, the offset is 0, or the tail falls off the board.
 */
export function hexFootprintTail(head: number, tailOffset: number): number | null {
  if (tailOffset === 0 || !isHexPosition(head)) return null;
  const { row, column } = getBattlefieldCoordinates(head);
  return hexPosition(column + tailOffset, row);
}

/**
 * A two-hex mover may put its head on `head` only when its tail is on the
 * board and neither hex is blocked. `tailOffset` 0 (one-hex / 4×5) = the head
 * alone.
 */
function footprintClear(head: number, tailOffset: number, blockedSpaces: ReadonlySet<number>): boolean {
  if (blockedSpaces.has(head)) return false;
  if (tailOffset === 0 || !isHexPosition(head)) return true;
  const tail = hexFootprintTail(head, tailOffset);
  return tail !== null && !blockedSpaces.has(tail);
}

export type BattlefieldCoordinates = {
  row: number;
  column: number;
};

export function isBattlefieldPosition(position: number): boolean {
  return isGridPosition(position) || isHexPosition(position);
}

/** Row/column of a space; hex positions report their hex row and column. */
export function getBattlefieldCoordinates(position: number): BattlefieldCoordinates {
  if (isHexPosition(position)) {
    const index = position - HEX_POSITION_BASE;
    return { row: Math.floor(index / HEX_BATTLEFIELD_COLUMNS), column: index % HEX_BATTLEFIELD_COLUMNS };
  }
  return {
    row: Math.floor(position / BATTLEFIELD_COLUMNS),
    column: position % BATTLEFIELD_COLUMNS
  };
}

export function getBattlefieldTerrain(position: number): BattlefieldTerrain {
  if (isHexPosition(position)) {
    return "grass";
  }
  const { row } = getBattlefieldCoordinates(position);

  if (row < BATTLEFIELD_CROSSING_ROW) {
    return "grass";
  }

  if (row === BATTLEFIELD_CROSSING_ROW) {
    return "crossing";
  }

  return "dirt";
}

export function getBattlefieldDistance(leftPosition: number, rightPosition: number): number {
  if (isHexPosition(leftPosition) || isHexPosition(rightPosition)) {
    return isHexPosition(leftPosition) && isHexPosition(rightPosition)
      ? hexDistanceBetween(leftPosition, rightPosition)
      : CROSS_GEOMETRY_DISTANCE;
  }
  const left = getBattlefieldCoordinates(leftPosition);
  const right = getBattlefieldCoordinates(rightPosition);

  // Movement and adjacency are orthogonal in the board game: a diagonal step
  // is not adjacent, so it costs two spaces. Use Manhattan distance, not Chebyshev.
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column);
}

export function getBattlefieldLabel(position: number): string {
  const { row, column } = getBattlefieldCoordinates(position);
  if (isHexPosition(position)) {
    return `${String.fromCharCode(65 + row)}${column + 1}`;
  }
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}

/**
 * Adjacency: orthogonal on a `columns`-wide grid (the combat board default),
 * or the six surrounding hexes on the hex battlefield.
 */
export function isAdjacent(leftPosition: number, rightPosition: number, columns = BATTLEFIELD_COLUMNS): boolean {
  if (isHexPosition(leftPosition) || isHexPosition(rightPosition)) {
    return isHexPosition(leftPosition) && isHexPosition(rightPosition) &&
      hexDistanceBetween(leftPosition, rightPosition) === 1;
  }
  const leftRow = Math.floor(leftPosition / columns);
  const leftColumn = leftPosition % columns;
  const rightRow = Math.floor(rightPosition / columns);
  const rightColumn = rightPosition % columns;

  return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn) === 1;
}

/**
 * The spaces adjacent to `position`: the four orthogonal squares on the 4×5
 * grid, the (up to) six surrounding hexes on the hex battlefield.
 */
export function getOrthogonalNeighbors(position: number): number[] {
  if (isHexPosition(position)) {
    const cube = hexToCube(position);
    return HEX_CUBE_DIRECTIONS
      .map((d) => cubeToHex({ q: cube.q + d.q, r: cube.r + d.r, s: cube.s + d.s }))
      .filter((neighbor): neighbor is number => neighbor !== null)
      .sort((a, b) => a - b);
  }
  const { row, column } = getBattlefieldCoordinates(position);
  const neighbors: number[] = [];

  if (row > 0) neighbors.push(position - BATTLEFIELD_COLUMNS);
  if (row < BATTLEFIELD_ROWS - 1) neighbors.push(position + BATTLEFIELD_COLUMNS);
  if (column > 0) neighbors.push(position - 1);
  if (column < BATTLEFIELD_COLUMNS - 1) neighbors.push(position + 1);

  return neighbors;
}

/**
 * Spaces a unit can end a move on, following the printed movement rules:
 * units step orthogonally up to `range` spaces. Other unit cards and obstacle
 * tokens are Combat Obstacles — ground and ranged units must path around
 * them, while flying units ignore them along the way. Nobody may end a move
 * on an occupied or obstacle space.
 */
export function getReachableDestinations(
  start: number,
  range: number,
  blockedSpaces: ReadonlySet<number>,
  ignoresObstacles: boolean,
  tailOffset = 0
): number[] {
  if (range <= 0 || !isBattlefieldPosition(start)) {
    return [];
  }
  // Two-hex (double-wide) mover on the hex board: every step and the stop
  // need head AND tail clear (the tail trails the head at a fixed offset);
  // flyers only need the landing footprint clear. The 4×5 grid / one-hex
  // path below is unchanged (tailOffset 0).
  if (tailOffset !== 0 && isHexPosition(start)) {
    const reachedWide = new Map<number, number>([[start, 0]]);
    let wideFrontier = [start];
    for (let step = 1; step <= range && wideFrontier.length > 0; step += 1) {
      const next: number[] = [];
      for (const position of wideFrontier) {
        for (const neighbor of getOrthogonalNeighbors(position)) {
          if (reachedWide.has(neighbor)) continue;
          if (!ignoresObstacles && !footprintClear(neighbor, tailOffset, blockedSpaces)) continue;
          reachedWide.set(neighbor, step);
          next.push(neighbor);
        }
      }
      wideFrontier = next;
    }
    reachedWide.delete(start);
    return [...reachedWide.keys()]
      .filter((position) => footprintClear(position, tailOffset, blockedSpaces))
      .sort((a, b) => a - b);
  }

  const reached = new Map<number, number>([[start, 0]]);
  let frontier = [start];

  for (let step = 1; step <= range && frontier.length > 0; step += 1) {
    const next: number[] = [];

    for (const position of frontier) {
      for (const neighbor of getOrthogonalNeighbors(position)) {
        if (reached.has(neighbor)) {
          continue;
        }

        // Flying units pass over obstacles freely; everyone else must walk
        // through empty spaces only.
        if (!ignoresObstacles && blockedSpaces.has(neighbor)) {
          continue;
        }

        reached.set(neighbor, step);
        next.push(neighbor);
      }
    }

    frontier = next;
  }

  reached.delete(start);
  return [...reached.keys()].filter((position) => !blockedSpaces.has(position)).sort((a, b) => a - b);
}

/**
 * The orthogonal step path a NON-FLYING unit walks from `start` to
 * `destination`, as the list of spaces it ENTERS (start exclusive, destination
 * inclusive). It routes around `blockedSpaces` (other units, obstacles, Force
 * Fields, fortifications) in the fewest steps and — among equally short routes —
 * through the fewest `hazardSpaces` (the visible Fire Walls and the mover's own
 * known traps), so a unit never needlessly steps into a hazard it can see while
 * blind enemy traps still get a chance to bite. Returns null when `destination`
 * is unreachable within `range`. Flyers do not "enter" the spaces they pass
 * over, so callers route them straight to the destination instead of here.
 */
export function planMovePath(
  start: number,
  destination: number,
  range: number,
  blockedSpaces: ReadonlySet<number>,
  hazardSpaces: ReadonlySet<number>,
  tailOffset = 0
): number[] | null {
  if (start === destination || !isBattlefieldPosition(start) || !isBattlefieldPosition(destination)) {
    return null;
  }
  // Two-hex mover (hex board only): a step is open when the whole footprint
  // (head + trailing tail) is clear. 0 keeps the one-cell test exactly.
  const wide = tailOffset !== 0 && isHexPosition(start);
  const stepBlocked = (position: number): boolean =>
    wide ? !footprintClear(position, tailOffset, blockedSpaces) : blockedSpaces.has(position);
  // Hazards a step newly ENTERS. One-cell mover: the entered space. Two-hex
  // mover: every hex of the new footprint (head AND tail) that the previous
  // footprint did not cover — the hexes walkMoveThroughTokens springs tokens
  // under (it also skips hexes covered earlier in the walk; per-step is the
  // route-independent reading this search can weigh).
  const stepHazards = (from: number, to: number): number => {
    if (!wide) return hazardSpaces.has(to) ? 1 : 0;
    const previous = [from, hexFootprintTail(from, tailOffset)];
    let count = 0;
    for (const cell of [to, hexFootprintTail(to, tailOffset)]) {
      if (cell !== null && !previous.includes(cell) && hazardSpaces.has(cell)) count += 1;
    }
    return count;
  };

  type Cost = { steps: number; hazards: number };
  const isBetter = (a: Cost, b: Cost): boolean =>
    a.steps < b.steps || (a.steps === b.steps && a.hazards < b.hazards);

  const best = new Map<number, Cost>([[start, { steps: 0, hazards: 0 }]]);
  const parent = new Map<number, number>();
  const visited = new Set<number>();

  // Uniform-cost search over the board (20 squares or 117 hexes): cost is (steps, hazards entered)
  // compared lexicographically, so the route is shortest first and least-hazard
  // second. Linear scans are trivially cheap at this size.
  for (;;) {
    let current = -1;
    let currentCost: Cost | null = null;
    for (const [position, cost] of best) {
      if (visited.has(position)) {
        continue;
      }
      // Ties (same steps and hazards) break toward the lower position for a
      // stable, deterministic path — which equal route shows is immaterial.
      if (currentCost === null || isBetter(cost, currentCost) || (!isBetter(currentCost, cost) && position < current)) {
        current = position;
        currentCost = cost;
      }
    }
    if (current === -1 || currentCost === null || current === destination) {
      break;
    }
    visited.add(current);
    if (currentCost.steps >= range) {
      continue;
    }

    for (const neighbor of getOrthogonalNeighbors(current)) {
      if (visited.has(neighbor) || (stepBlocked(neighbor) && neighbor !== destination)) {
        continue;
      }
      const stepCost: Cost = {
        steps: currentCost.steps + 1,
        // The chosen destination is a fixed stop, so its own hazard never sways
        // which route is taken; only intermediate hazards are weighed.
        hazards: currentCost.hazards + (neighbor === destination ? 0 : stepHazards(current, neighbor))
      };
      const existing = best.get(neighbor);
      if (!existing || isBetter(stepCost, existing)) {
        best.set(neighbor, stepCost);
        parent.set(neighbor, current);
      }
    }
  }

  const reached = best.get(destination);
  if (!reached || reached.steps > range) {
    return null;
  }

  const path: number[] = [];
  let node = destination;
  while (node !== start) {
    path.push(node);
    const previous = parent.get(node);
    if (previous === undefined) {
      return null;
    }
    node = previous;
  }
  return path.reverse();
}
