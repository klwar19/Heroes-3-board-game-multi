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

export type BattlefieldCoordinates = {
  row: number;
  column: number;
};

export function isBattlefieldPosition(position: number): boolean {
  return Number.isInteger(position) && position >= 0 && position < BATTLEFIELD_CELL_COUNT;
}

export function getBattlefieldCoordinates(position: number): BattlefieldCoordinates {
  return {
    row: Math.floor(position / BATTLEFIELD_COLUMNS),
    column: position % BATTLEFIELD_COLUMNS
  };
}

export function getBattlefieldTerrain(position: number): BattlefieldTerrain {
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
  const left = getBattlefieldCoordinates(leftPosition);
  const right = getBattlefieldCoordinates(rightPosition);

  // Movement and adjacency are orthogonal in the board game: a diagonal step
  // is not adjacent, so it costs two spaces. Use Manhattan distance, not Chebyshev.
  return Math.abs(left.row - right.row) + Math.abs(left.column - right.column);
}

export function getBattlefieldLabel(position: number): string {
  const { row, column } = getBattlefieldCoordinates(position);
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}

/** Orthogonal adjacency on a `columns`-wide grid (the combat board default). */
export function isAdjacent(leftPosition: number, rightPosition: number, columns = BATTLEFIELD_COLUMNS): boolean {
  const leftRow = Math.floor(leftPosition / columns);
  const leftColumn = leftPosition % columns;
  const rightRow = Math.floor(rightPosition / columns);
  const rightColumn = rightPosition % columns;

  return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn) === 1;
}

export function getOrthogonalNeighbors(position: number): number[] {
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
  ignoresObstacles: boolean
): number[] {
  if (range <= 0 || !isBattlefieldPosition(start)) {
    return [];
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
