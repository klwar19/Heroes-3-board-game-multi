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
