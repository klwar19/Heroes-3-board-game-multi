export const BATTLEFIELD_COLUMNS = 4;
export const BATTLEFIELD_ROWS = 5;
export const BATTLEFIELD_CELL_COUNT = BATTLEFIELD_COLUMNS * BATTLEFIELD_ROWS;
export const BATTLEFIELD_CROSSING_ROW = 2;

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

  return Math.max(Math.abs(left.row - right.row), Math.abs(left.column - right.column));
}

export function getBattlefieldLabel(position: number): string {
  const { row, column } = getBattlefieldCoordinates(position);
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}
