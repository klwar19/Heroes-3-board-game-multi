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
  hazardSpaces: ReadonlySet<number>
): number[] | null {
  if (start === destination || !isBattlefieldPosition(start) || !isBattlefieldPosition(destination)) {
    return null;
  }

  type Cost = { steps: number; hazards: number };
  const isBetter = (a: Cost, b: Cost): boolean =>
    a.steps < b.steps || (a.steps === b.steps && a.hazards < b.hazards);

  const best = new Map<number, Cost>([[start, { steps: 0, hazards: 0 }]]);
  const parent = new Map<number, number>();
  const visited = new Set<number>();

  // Uniform-cost search over the 20-cell board: cost is (steps, hazards entered)
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
      if (visited.has(neighbor) || (blockedSpaces.has(neighbor) && neighbor !== destination)) {
        continue;
      }
      const stepCost: Cost = {
        steps: currentCost.steps + 1,
        // The chosen destination is a fixed stop, so its own hazard never sways
        // which route is taken; only intermediate hazards are weighed.
        hazards: currentCost.hazards + (neighbor !== destination && hazardSpaces.has(neighbor) ? 1 : 0)
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
