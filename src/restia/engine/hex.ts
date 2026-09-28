/**
 * Offset hex grid ("odd-r": odd rows are shifted half a hex to the right), the
 * Heroes 3 battlefield layout. Cells are numbered row-major.
 */
export const BOARD_COLS = 11;
export const BOARD_ROWS = 7;

export function cellOf(col: number, row: number): number {
  return row * BOARD_COLS + col;
}

export function colRow(cell: number): { col: number; row: number } {
  return { col: cell % BOARD_COLS, row: Math.floor(cell / BOARD_COLS) };
}

export function inBoard(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < BOARD_COLS && row < BOARD_ROWS;
}

export function neighbors(cell: number): number[] {
  const { col, row } = colRow(cell);
  const odd = row & 1;
  const deltas = odd
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const out: number[] = [];
  for (const [dc, dr] of deltas) {
    const c = col + dc!;
    const r = row + dr!;
    if (inBoard(c, r)) out.push(cellOf(c, r));
  }
  return out;
}

function cube(cell: number): [number, number, number] {
  const { col, row } = colRow(cell);
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  return [x, -x - z, z];
}

export function hexDistance(a: number, b: number): number {
  const [ax, ay, az] = cube(a);
  const [bx, by, bz] = cube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/**
 * Breadth-first reach from `start` within `steps`. `passable(cell)` says a cell
 * can be walked through; `stoppable(cell)` says the unit may end there.
 * Returns each reachable end cell with its path (excluding start).
 */
export function reach(
  start: number,
  steps: number,
  passable: (cell: number) => boolean,
  stoppable: (cell: number) => boolean
): Map<number, number[]> {
  const result = new Map<number, number[]>();
  const previous = new Map<number, number>();
  const distance = new Map<number, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.shift()!;
    const d = distance.get(cell)!;
    if (d >= steps) continue;
    for (const next of neighbors(cell)) {
      if (distance.has(next) || !passable(next)) continue;
      distance.set(next, d + 1);
      previous.set(next, cell);
      queue.push(next);
    }
  }
  for (const cell of distance.keys()) {
    if (cell === start || !stoppable(cell)) continue;
    const path: number[] = [];
    let at = cell;
    while (at !== start) {
      path.unshift(at);
      at = previous.get(at)!;
    }
    result.set(cell, path);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Lines, directions and weighted movement (battle terrain)
// ---------------------------------------------------------------------------

function fromCube(x: number, z: number): { col: number; row: number } {
  return { col: x + (z - (z & 1)) / 2, row: z };
}

function cubeRound(x: number, y: number, z: number): [number, number, number] {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, ry, rz];
}

/** Board cell for cube coordinates, or null when off the board. */
function cellOfCube(x: number, z: number): number | null {
  const { col, row } = fromCube(x, z);
  return inBoard(col, row) ? cellOf(col, row) : null;
}

/**
 * Hexes on the straight line from `a` to `b` (both included). A tiny nudge
 * keeps lines that run exactly along hex edges deterministic.
 */
export function hexLine(a: number, b: number): number[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const [ax, ay, az] = cube(a);
  const [bx, by, bz] = cube(b);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, , z] = cubeRound(ax + (bx - ax) * t + 1e-6, ay + (by - ay) * t + 2e-6, az + (bz - az) * t - 3e-6);
    const cell = cellOfCube(x, z);
    if (cell !== null && out[out.length - 1] !== cell) out.push(cell);
  }
  return out;
}

/**
 * The hexes a shot from `from` through `toward` crosses, continued to `length`
 * hexes from `from` (excluding `from`). Stops at the board edge.
 */
export function hexRay(from: number, toward: number, length: number): number[] {
  const d = hexDistance(from, toward);
  if (d === 0) return [];
  const [ax, ay, az] = cube(from);
  const [bx, by, bz] = cube(toward);
  const k = length / d;
  const [ex, ey, ez] = [ax + (bx - ax) * k, ay + (by - ay) * k, az + (bz - az) * k];
  const out: number[] = [];
  for (let i = 1; i <= length; i++) {
    const t = i / length;
    const [x, , z] = cubeRound(ax + (ex - ax) * t + 1e-6, ay + (ey - ay) * t + 2e-6, az + (ez - az) * t - 3e-6);
    const cell = cellOfCube(x, z);
    if (cell === null) break;
    if (out[out.length - 1] !== cell && cell !== from) out.push(cell);
  }
  return out;
}

/** The hex one step further from `from` beyond `target` (knockback direction), or null off-board. */
export function stepAway(from: number, target: number): number | null {
  const d = hexDistance(from, target);
  if (d === 0) return null;
  const [ax, ay, az] = cube(from);
  const [bx, by, bz] = cube(target);
  const k = (d + 1) / d;
  const [x, , z] = cubeRound(ax + (bx - ax) * k + 1e-6, ay + (by - ay) * k + 2e-6, az + (bz - az) * k - 3e-6);
  const cell = cellOfCube(x, z);
  return cell !== null && hexDistance(cell, target) === 1 ? cell : null;
}

/**
 * Cheapest-path reach with per-hex entry costs (Infinity = can't enter).
 * `stoppable(cell)` says the unit may end there. Returns end cell -> path (excluding start).
 */
export function reachWeighted(start: number, budget: number, cost: (cell: number) => number, stoppable: (cell: number) => boolean): Map<number, number[]> {
  const best = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, number>();
  const open: number[] = [start];
  while (open.length) {
    // Small boards: a linear scan for the cheapest open hex is plenty.
    let index = 0;
    for (let i = 1; i < open.length; i++) if (best.get(open[i]!)! < best.get(open[index]!)!) index = i;
    const cell = open.splice(index, 1)[0]!;
    const spent = best.get(cell)!;
    for (const next of neighbors(cell)) {
      const step = cost(next);
      if (!Number.isFinite(step)) continue;
      const total = spent + step;
      if (total > budget || total >= (best.get(next) ?? Infinity)) continue;
      best.set(next, total);
      previous.set(next, cell);
      open.push(next);
    }
  }
  const result = new Map<number, number[]>();
  for (const cell of best.keys()) {
    if (cell === start || !stoppable(cell)) continue;
    const path: number[] = [];
    let at = cell;
    while (at !== start) {
      path.unshift(at);
      at = previous.get(at)!;
    }
    result.set(cell, path);
  }
  return result;
}
