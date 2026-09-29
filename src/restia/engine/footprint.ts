import type { BattleUnit } from "./types";
import { cellOf, colRow, hexDistance, inBoard } from "./hex";

/**
 * Two-hex (wide) creatures, like the double-wide units of Heroes III: `cell` is
 * the HEAD hex and the TAIL is the hex directly behind it in the same row —
 * one column east for enemies, one column west for allies — fixed for the whole
 * battle. Both hexes must be free, standable and level for it to stand. For a
 * one-hex unit every helper here reduces to the plain single-cell logic.
 */
type Body = Pick<BattleUnit, "cell" | "side" | "wide">;

export function tailDir(unit: Pick<BattleUnit, "side">): 1 | -1 {
  return unit.side === "enemy" ? 1 : -1;
}

/** The tail hex if the head stood on `head` (null: one-hex unit, or it would hang off the board). */
export function tailAt(unit: Body, head: number): number | null {
  if (!unit.wide) return null;
  const { col, row } = colRow(head);
  const tail = col + tailDir(unit);
  return inBoard(tail, row) ? cellOf(tail, row) : null;
}

/** Hexes the unit would cover with its head on `head` (a wide unit hanging off the board covers only the head). */
export function cellsAt(unit: Body, head: number): number[] {
  const tail = tailAt(unit, head);
  return tail === null ? [head] : [head, tail];
}

export function cellsOf(unit: Body): number[] {
  return cellsAt(unit, unit.cell);
}

export function occupies(unit: Body, cell: number): boolean {
  return unit.cell === cell || (!!unit.wide && tailAt(unit, unit.cell) === cell);
}

/** Closest pair of hexes between two footprints: [from a, from b]. */
export function nearestPair(a: number[], b: number[]): [number, number] {
  let best: [number, number] = [a[0]!, b[0]!];
  let distance = Infinity;
  for (const x of a) {
    for (const y of b) {
      const d = hexDistance(x, y);
      if (d < distance) {
        distance = d;
        best = [x, y];
      }
    }
  }
  return best;
}

/** Hexes from the unit (head on `head`) to `cell`, counting from its nearer hex. */
export function distanceTo(unit: Body, cell: number, head = unit.cell): number {
  return Math.min(...cellsAt(unit, head).map((own) => hexDistance(own, cell)));
}

/** Hexes between two units' nearest hexes (`aHead`: where a's head would be). */
export function unitDistance(a: Body, b: Body, aHead = a.cell): number {
  const [x, y] = nearestPair(cellsAt(a, aHead), cellsOf(b));
  return hexDistance(x, y);
}
