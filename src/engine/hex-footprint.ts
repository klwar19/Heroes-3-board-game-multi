import {
  combatGeometry,
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldPositions,
  getOrthogonalNeighbors,
  HEX_BATTLEFIELD_COLUMNS,
  hexFootprintTail,
  hexPosition,
  isAdjacent,
  isHexPosition,
  type BattlefieldGeometry
} from "./battlefield";

/**
 * Two-hex (double-wide) creatures on the optional hex battlefield, "like the PC
 * game" (user ruling 2026-09-25). A unit CARD is double-wide for the whole
 * combat when its creatures are double-wide in Heroes III (VCMI / HotA
 * `doubleWide`, checked 2026-09-25); Neutral cards follow the town card of the
 * same name. Every Few/Pack pair shares its size except Angel / Archangel, as on
 * the PC: the Angels card is ONE hex on its Few side (Angel, and the Neutral
 * Angels, which always show the Angel) and TWO hexes on its Pack side
 * (Archangel) — user ruling 2026-09-26, replacing "two hexes on both sides".
 *
 * `unit.position` stays the HEAD hex; the TAIL is the hex directly behind it
 * in the same row — attacker side one column west, defender side one column
 * east — fixed for the combat. On the 4×5 grid (and for every one-hex unit)
 * each helper here reduces EXACTLY to the old single-position logic.
 *
 * Dependency-light on purpose (battlefield.ts only) so every combat module,
 * the AI and the UI can import it without cycles.
 */
export const HEX_DOUBLE_WIDE_UNIT_IDS: ReadonlySet<string> = new Set([
  "castle.griffins",
  "castle.champions",
  "castle.archangels",
  "rampart.centaurs",
  "rampart.pegasi",
  "rampart.unicorns",
  "rampart.gold_dragons",
  "tower.nagas",
  "inferno.cerberi",
  "necropolis.dread_knights",
  "necropolis.ghost_dragons",
  "dungeon.medusas",
  "dungeon.manticores",
  "dungeon.black_dragons",
  "stronghold.wolf_raiders",
  "stronghold.thunderbirds",
  "stronghold.behemoths",
  "fortress.basilisks",
  "fortress.gorgons",
  "fortress.wyverns",
  "fortress.hydras",
  "conflux.ice_elementals",
  "conflux.phoenixes",
  "conflux.water_elementals",
  "neutral.griffins",
  "neutral.champions",
  "neutral.centaurs",
  "neutral.pegasi",
  "neutral.unicorns",
  "neutral.gold_dragons",
  "neutral.nagas",
  "neutral.cerberi",
  "neutral.dread_knights",
  "neutral.ghost_dragons",
  "neutral.medusas",
  "neutral.manticores",
  "neutral.black_dragons",
  "neutral.wolf_raiders",
  "neutral.thunderbirds",
  "neutral.behemoths",
  "neutral.basilisks",
  "neutral.gorgons",
  "neutral.wyverns",
  "neutral.hydras",
  "neutral.ice_elementals",
  "neutral.phoenixes",
  "neutral.water_elementals",
  "neutral.azure_dragons",
  "neutral.crystal_dragons",
  "neutral.faerie_dragons",
  "neutral.rust_dragons",
  "neutral.boars",
  "neutral.nomads",
  "neutral.ayssids",
  "neutral.haspids",
  "neutral.cyberbrutes",
  "wog.nightmare",
  "wog.hell_steed",
  "wog.gorynych",
  "wog.dracolich",
  "wog.sylvan_centaur",
  // Horn of the Abyss towns (VCMI HotA mod `doubleWide` of the upgraded creature)
  "cove.ayssids",
  "cove.haspids",
  "factory.armadillos",
  "factory.automatons",
  "factory.sandworms",
  "factory.couatls",
  "factory.dreadnoughts",
  "bulwark.mountain_rams",
  "bulwark.yetis",
  "bulwark.mammoths",
  "bulwark.jotunns",
  // Forge (no PC original): the tracked Tank and the hulking Cyberbrute are long bodies
  "forge.tanks",
  "forge.cyberbrutes"
]);

/**
 * Cards whose Pack side only is double-wide (Archangel; the Few side's Angel is
 * one hex). A Pack flipping to Few mid-combat drops its tail; a Few reinforced
 * to a Pack mid-combat takes its tail only when that hex is free, otherwise it
 * stays one hex for the rest of the combat (`hexSingleHex`).
 */
export const HEX_PACK_ONLY_DOUBLE_WIDE_UNIT_IDS: ReadonlySet<string> = new Set(["castle.archangels"]);

/** Whether a unit card is (or, for a Pack-only card, can be) double-wide on the hex battlefield. */
export function isHexDoubleWide(unitDefId: string | null | undefined): boolean {
  return typeof unitDefId === "string" && HEX_DOUBLE_WIDE_UNIT_IDS.has(unitDefId);
}

/** The combat fields the footprint needs (structural, so any CombatState fits). */
export type FootprintCombat = {
  geometry?: BattlefieldGeometry;
  attackerPlayerId: string;
};

/** The unit fields the footprint needs (structural, so any CombatUnitState fits). */
export type FootprintUnit = {
  position: number;
  controllerId: string;
  unitDefId?: string;
  heroUnit?: boolean;
  commanderSlug?: string;
  /** The card's current side (a Pack-only double-wide card is one hex on its Few side). */
  variant?: string;
  /** Set when a mid-combat Few→Pack reinforce found no free tail hex: stays one hex. */
  hexSingleHex?: boolean;
};

/**
 * Whether `unit` occupies two hexes in this combat: hex board only, never a
 * hero body, a commander or the off-board Arrow Tower.
 */
export function unitIsDoubleWide(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit
): boolean {
  // The head need not be placed yet (auto-placement asks before it lands);
  // every cell helper below still requires a hex head.
  return Boolean(combat) &&
    combatGeometry(combat) === "hex" &&
    !unit.heroUnit &&
    !unit.commanderSlug &&
    isHexDoubleWide(unit.unitDefId) &&
    (!HEX_PACK_ONLY_DOUBLE_WIDE_UNIT_IDS.has(unit.unitDefId!) || (unit.variant === "pack" && !unit.hexSingleHex));
}

/**
 * Column step from a double-wide unit's head to its tail: attacker side -1
 * (tail west, facing the defender on the right), defender side +1. 0 for every
 * one-hex unit and on the 4×5 grid — pass it to getReachableDestinations /
 * planMovePath as their `tailOffset`.
 */
export function unitTailOffset(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit
): number {
  if (!combat || !unitIsDoubleWide(combat, unit)) return 0;
  return unit.controllerId === combat.attackerPlayerId ? -1 : 1;
}

/**
 * The cells `unit` would cover with its head on `head`, or null when that
 * footprint does not fit on the board (a double-wide tail off the edge). A
 * one-hex unit / the 4×5 grid: `[head]`.
 */
export function footprintAt(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  head: number
): number[] | null {
  const offset = unitTailOffset(combat, unit);
  if (offset === 0 || !isHexPosition(head)) return [head];
  const tail = hexFootprintTail(head, offset);
  return tail === null ? null : [head, tail];
}

/**
 * Like footprintAt but never null: an off-board tail is dropped, leaving the
 * head alone (only reachable through a path that skipped the footprint check).
 */
export function unitCellsAt(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  head: number
): number[] {
  return footprintAt(combat, unit, head) ?? [head];
}

/** The cells `unit` covers now: head first, then its tail (double-wide only). */
export function unitCells(combat: FootprintCombat | null | undefined, unit: FootprintUnit): number[] {
  return unitCellsAt(combat, unit, unit.position);
}

/** A double-wide unit's current tail hex, or null (one-hex unit / 4×5 grid). */
export function unitTailCell(combat: FootprintCombat | null | undefined, unit: FootprintUnit): number | null {
  const offset = unitTailOffset(combat, unit);
  return offset === 0 ? null : hexFootprintTail(unit.position, offset);
}

/** Whether `unit` covers `cell` (its head, or its tail when double-wide). */
export function unitOccupiesCell(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  cell: number
): boolean {
  if (unit.position === cell) return true;
  const tail = unitTailCell(combat, unit);
  return tail !== null && tail === cell;
}

/**
 * The unit covering `cell` (head OR tail), among `units` (default: every unit
 * of the combat; pass a pre-filtered list, e.g. the living ones). On the grid
 * this is exactly `units.find((unit) => unit.position === cell)`.
 */
export function unitAtCell<U extends FootprintUnit>(
  combat: (FootprintCombat & { units?: Record<string, U> }) | null | undefined,
  cell: number,
  units?: Iterable<U>
): U | undefined {
  const pool = units ?? (combat?.units ? Object.values(combat.units) : []);
  for (const unit of pool) {
    if (unitOccupiesCell(combat, unit, cell)) return unit;
  }
  return undefined;
}

/** Every cell covered by `units` (heads and tails), for one O(1)-lookup set. */
export function occupiedCellsOf(
  combat: FootprintCombat | null | undefined,
  units: Iterable<FootprintUnit>
): Set<number> {
  const cells = new Set<number>();
  for (const unit of units) {
    for (const cell of unitCells(combat, unit)) cells.add(cell);
  }
  return cells;
}

/**
 * Whether `unit` could put its head on `head`: the footprint fits on the board
 * and none of its cells is in `blocked` (callers leave the unit's own cells
 * out of `blocked`). One-hex / grid: `!blocked.has(head)`.
 */
export function footprintFits(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  head: number,
  blocked: ReadonlySet<number>
): boolean {
  const cells = footprintAt(combat, unit, head);
  return cells !== null && cells.every((cell) => !blocked.has(cell));
}

/** Any of `leftCells` adjacent to any of `rightCells` (the cell lists never overlap). */
function cellsAdjacent(leftCells: readonly number[], rightCells: readonly number[]): boolean {
  for (const left of leftCells) {
    for (const right of rightCells) {
      if (isAdjacent(left, right)) return true;
    }
  }
  return false;
}

/**
 * Adjacency between two units: any cell of `a` next to any cell of `b`. On the
 * grid / one-hex units: `isAdjacent(a.position, b.position)`.
 */
export function unitsAdjacent(
  combat: FootprintCombat | null | undefined,
  a: FootprintUnit,
  b: FootprintUnit
): boolean {
  if (combatGeometry(combat) !== "hex") return isAdjacent(a.position, b.position);
  if (a === b) return false;
  return cellsAdjacent(unitCells(combat, a), unitCells(combat, b));
}

/**
 * Adjacency between `unit` standing with its head on `head` (a move/attack
 * landing) and `other`. Grid / one-hex: `isAdjacent(head, other.position)`.
 */
export function unitsAdjacentAt(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  head: number,
  other: FootprintUnit
): boolean {
  if (combatGeometry(combat) !== "hex") return isAdjacent(head, other.position);
  if (unit === other) return false;
  return cellsAdjacent(unitCellsAt(combat, unit, head), unitCells(combat, other));
}

/**
 * Whether a cell touches `unit` (any of its cells adjacent to `cell`; a cell
 * the unit itself covers is not "adjacent"). Grid: `isAdjacent(unit.position, cell)`.
 */
export function unitAdjacentToCell(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  cell: number
): boolean {
  if (combatGeometry(combat) !== "hex") return isAdjacent(unit.position, cell);
  const cells = unitCells(combat, unit);
  if (cells.length > 1 && cells.includes(cell)) return false;
  return cells.some((own) => isAdjacent(own, cell));
}

/** Distance between two units: the minimum over their cells (grid: position distance). */
export function unitDistance(
  combat: FootprintCombat | null | undefined,
  a: FootprintUnit,
  b: FootprintUnit
): number {
  if (combatGeometry(combat) !== "hex") return getBattlefieldDistance(a.position, b.position);
  return cellsDistance(unitCells(combat, a), unitCells(combat, b));
}

/** Distance from `unit` standing with its head on `head` to `other` (min over cells). */
export function unitDistanceAt(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  head: number,
  other: FootprintUnit
): number {
  if (combatGeometry(combat) !== "hex") return getBattlefieldDistance(head, other.position);
  return cellsDistance(unitCellsAt(combat, unit, head), unitCells(combat, other));
}

/** Distance from a unit to a cell: the minimum over the unit's cells (0 when it covers it). */
export function unitCellDistance(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  cell: number
): number {
  if (combatGeometry(combat) !== "hex") return getBattlefieldDistance(unit.position, cell);
  return cellsDistance(unitCells(combat, unit), [cell]);
}

/**
 * Straight-line distance, in hex widths, from the nearest of `centres` to
 * `cell` (pointy-top, even rows shifted half a hex right; rows √3/2 apart).
 */
function hexCentreDistance(centres: readonly number[], cell: number): number {
  const point = (position: number) => {
    const { row, column } = getBattlefieldCoordinates(position);
    return { x: column + (row % 2 === 0 ? 0.5 : 0), y: (row * Math.sqrt(3)) / 2 };
  };
  const target = point(cell);
  let best = Infinity;
  for (const centre of centres) {
    const from = point(centre);
    best = Math.min(best, Math.hypot(target.x - from.x, target.y - from.y));
  }
  return best;
}

function cellsDistance(leftCells: readonly number[], rightCells: readonly number[]): number {
  let best = Infinity;
  for (const left of leftCells) {
    for (const right of rightCells) {
      const distance = left === right ? 0 : getBattlefieldDistance(left, right);
      if (distance < best) best = distance;
    }
  }
  return best;
}

/**
 * The cell of `target` nearest to `from` (its head on ties) — the hex a line
 * from `from` enters the target through ("cell behind the target", knockback).
 * Grid / one-hex: `target.position`.
 */
export function nearestUnitCellTo(
  combat: FootprintCombat | null | undefined,
  target: FootprintUnit,
  from: number
): number {
  const cells = unitCells(combat, target);
  if (cells.length === 1) return cells[0];
  let best = cells[0];
  let bestDistance = getBattlefieldDistance(from, best);
  for (const cell of cells.slice(1)) {
    const distance = getBattlefieldDistance(from, cell);
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

/** Whether any cell of `unit` lies in `area` (area spells, a battlefield line). */
export function unitInCells(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  area: ReadonlySet<number> | readonly number[]
): boolean {
  const has = area instanceof Set
    ? (cell: number) => area.has(cell)
    : (cell: number) => (area as readonly number[]).includes(cell);
  if (combatGeometry(combat) !== "hex") return has(unit.position);
  return unitCells(combat, unit).some(has);
}

/**
 * An area around a centre: the cells adjacent to `centre` — a single cell, or
 * a unit's whole footprint (a double-wide unit's ring surrounds both hexes) —
 * plus the centre cell(s) when `includeCentre`. On the 4×5 grid / one-hex
 * units: the centre's orthogonal neighbours (and the centre), in the order
 * `[centre, ...getOrthogonalNeighbors(centre)]`.
 *
 * `radius` (hex board only; default 1): every hex whose distance to the
 * nearest centre cell is 1..radius (the PC-sized area spells, see
 * hex-spell-areas.ts). Radius 1 is exactly the adjacent ring above; the 4×5
 * grid ignores `radius` and always returns the orthogonal ring.
 *
 * A FRACTIONAL radius is a round blast: every hex whose centre lies within
 * `radius` hex-widths (straight-line distance between hex centres) of the
 * nearest centre cell. Hex steps are 1 apart, the six "between the corners"
 * hexes of the second ring are √3 ≈ 1.73 away and its six corners 2 — so
 * radius 1.75 = the 7-hex Fireball area plus those six (13 hexes).
 */
export function areaAround(
  combat: FootprintCombat | null | undefined,
  centre: number | FootprintUnit,
  includeCentre: boolean,
  radius = 1
): Set<number> {
  const centreCells = typeof centre === "number" ? [centre] : unitCells(combat, centre);
  const area = new Set<number>(includeCentre ? centreCells : []);
  if (radius > 1 && combatGeometry(combat) === "hex") {
    // Off-board centre cells (the beside-board Arrow Tower) have no hex
    // distance, so they widen nothing — the centre alone, like its empty ring.
    const hexCentres = centreCells.filter(isHexPosition);
    if (hexCentres.length === 0) return area;
    const round = !Number.isInteger(radius);
    for (const cell of getBattlefieldPositions("hex")) {
      if (centreCells.includes(cell)) continue;
      const distance = round ? hexCentreDistance(hexCentres, cell) : cellsDistance(hexCentres, [cell]);
      if (distance >= 1 - 1e-9 && distance <= radius) area.add(cell);
    }
    return area;
  }
  for (const cell of centreCells) {
    for (const neighbor of getOrthogonalNeighbors(cell)) {
      if (!centreCells.includes(neighbor)) area.add(neighbor);
    }
  }
  return area;
}

/**
 * Formation moves / swaps / placements on the hex board: whether putting each
 * unit of `relocated` (unit id -> new head) there leaves every footprint of
 * `units` on the board, clear of `blocked`, inside `allowed` (when given: the
 * zone the relocated unit may occupy — a double-wide unit needs head AND tail
 * in it) and overlapping no other unit. `units` = the bodies on the board
 * (callers pass the living ones, relocated units included). Always true on
 * the 4×5 grid, where every caller keeps its own single-cell checks.
 */
export function relocationFits<U extends FootprintUnit & { id: string }>(
  combat: FootprintCombat | null | undefined,
  units: Iterable<U>,
  relocated: ReadonlyMap<string, number>,
  blocked: ReadonlySet<number>,
  allowed?: (unit: U, cells: readonly number[]) => boolean
): boolean {
  if (combatGeometry(combat) !== "hex") return true;
  const taken = new Set<number>();
  const moving: U[] = [];
  for (const unit of units) {
    if (relocated.has(unit.id)) {
      moving.push(unit);
      continue;
    }
    for (const cell of unitCells(combat, unit)) taken.add(cell);
  }
  for (const unit of moving) {
    const head = relocated.get(unit.id)!;
    const cells = footprintAt(combat, unit, head);
    if (!cells) return false;
    for (const cell of cells) {
      if (taken.has(cell) || blocked.has(cell)) return false;
    }
    if (allowed && !allowed(unit, cells)) return false;
    for (const cell of cells) taken.add(cell);
  }
  return true;
}

/**
 * The spaces `unit` may step its head onto with a "move 1 space" effect: the
 * orthogonal neighbours of its head whose footprint is clear of `blocked` (its
 * own hexes never block it). On the 4×5 grid / one-hex units: the unblocked
 * orthogonal neighbours, exactly as before.
 */
export function unitStepSpaces(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  blocked: ReadonlySet<number>
): number[] {
  const own = unitCells(combat, unit);
  if (own.length === 1) {
    return getOrthogonalNeighbors(unit.position).filter((position) => !blocked.has(position));
  }
  const others = new Set(blocked);
  for (const cell of own) others.delete(cell);
  return getOrthogonalNeighbors(unit.position).filter((position) =>
    footprintFits(combat, unit, position, others)
  );
}

/**
 * Where a Clone Token of `unit` may go: an empty space orthogonally adjacent to
 * the unit (any of its hexes on the hex board) whose whole footprint — the
 * copy keeps the card, so a double-wide original gives a double-wide copy —
 * is clear of `blocked`. On the 4×5 grid: the unblocked orthogonal neighbours,
 * in getOrthogonalNeighbors order.
 */
export function cloneTokenSpaces(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  blocked: ReadonlySet<number>
): number[] {
  const own = unitCells(combat, unit);
  if (own.length === 1) {
    return getOrthogonalNeighbors(unit.position).filter((position) => !blocked.has(position));
  }
  const spaces = new Set<number>();
  for (const cell of own) {
    for (const position of getOrthogonalNeighbors(cell)) {
      if (!own.includes(position) && footprintFits(combat, unit, position, blocked)) {
        spaces.add(position);
      }
    }
  }
  return [...spaces].sort((a, b) => a - b);
}

/**
 * Safety net after an automatic placement on the hex board (fixed layouts,
 * guard formations, injected commanders/heroes, scripted armies): every
 * double-wide unit whose footprint does not fit (tail off the edge, on an
 * obstacle/`blocked` hex or on another unit) is moved to the nearest head that
 * fits — first one hex forward (its tail then covers the hex it was put on),
 * then by hex distance, own half of the board first, lowest position last.
 * One-hex units never move. No-op on the 4×5 grid. Deterministic.
 */
export function settleHexFootprints<U extends FootprintUnit & { id: string }>(
  combat: FootprintCombat & { units: Record<string, U> },
  blocked: ReadonlySet<number>,
  isOnBoard: (unit: U) => boolean
): void {
  if (combatGeometry(combat) !== "hex") return;
  const units = Object.values(combat.units).filter((unit) => isOnBoard(unit) && isHexPosition(unit.position));
  const wide = units.filter((unit) => unitTailOffset(combat, unit) !== 0);
  if (wide.length === 0) return;
  const taken = new Set<number>();
  for (const unit of units) {
    if (unitTailOffset(combat, unit) === 0) taken.add(unit.position);
  }
  const fits = (unit: U, head: number): number[] | null => {
    const cells = footprintAt(combat, unit, head);
    return cells && cells.every((cell) => !taken.has(cell) && !blocked.has(cell)) ? cells : null;
  };
  for (const unit of wide) {
    const offset = unitTailOffset(combat, unit);
    const head = unit.position;
    let cells = fits(unit, head);
    if (!cells) {
      const forward = hexFootprintTail(head, -offset);
      if (forward !== null) {
        cells = fits(unit, forward);
      }
    }
    if (!cells) {
      const ownHalf = (position: number) => {
        const { column } = getBattlefieldCoordinates(position);
        return offset < 0 ? column <= HEX_BATTLEFIELD_COLUMNS / 2 : column >= HEX_BATTLEFIELD_COLUMNS / 2 - 1;
      };
      const candidates = getBattlefieldPositions("hex")
        .filter((position) => position !== head)
        .sort((left, right) =>
          getBattlefieldDistance(head, left) - getBattlefieldDistance(head, right) ||
          Number(ownHalf(right)) - Number(ownHalf(left)) ||
          left - right
        );
      for (const candidate of candidates) {
        cells = fits(unit, candidate);
        if (cells) break;
      }
    }
    if (!cells) {
      // Nowhere fits (a packed board): keep the head, never stack a tail.
      taken.add(head);
      continue;
    }
    unit.position = cells[0];
    for (const cell of cells) taken.add(cell);
  }
}

/**
 * The heads of `zone` where `unit` fits WHOLLY inside the zone (a deployment
 * zone, a formation block): every zone cell for a one-hex unit / on the 4×5
 * grid (the same array, same order); for a double-wide unit only the heads
 * whose tail is in the zone too (attacker: head in column 1, tail in 0).
 */
export function footprintHeadsIn(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  zone: readonly number[]
): number[] {
  if (unitTailOffset(combat, unit) === 0) return [...zone];
  const inZone = new Set(zone);
  return zone.filter((head) => {
    const cells = footprintAt(combat, unit, head);
    return cells !== null && cells.every((cell) => inZone.has(cell));
  });
}

// ---------------------------------------------------------------------------
// Multi-hex battlefield tokens (wall spells on the hex board)
// ---------------------------------------------------------------------------

/**
 * The battlefield-token fields the wall footprint needs (structural, so any
 * BattlefieldTokenState fits). `extraCells` is set only on the hex board, for a
 * wall that covers more than its anchor hex (`position`).
 */
export type TokenFootprint = { position: number; extraCells?: readonly number[] };

/** Every hex a battlefield token covers: its anchor first, then any extra wall hexes. */
export function battlefieldTokenCells(token: TokenFootprint): number[] {
  return token.extraCells && token.extraCells.length > 0
    ? [token.position, ...token.extraCells]
    : [token.position];
}

/** Whether a battlefield token covers `cell` (grid / one-hex token: its position). */
export function battlefieldTokenCovers(token: TokenFootprint, cell: number): boolean {
  return token.position === cell || Boolean(token.extraCells?.includes(cell));
}

/** Whether `unit` is adjacent to any hex of `token` (grid: to its single space). */
export function unitAdjacentToToken(
  combat: FootprintCombat | null | undefined,
  unit: FootprintUnit,
  token: TokenFootprint
): boolean {
  if (!token.extraCells || token.extraCells.length === 0) {
    return unitAdjacentToCell(combat, unit, token.position);
  }
  const covered = battlefieldTokenCells(token);
  const own = unitCells(combat, unit);
  if (own.some((cell) => covered.includes(cell))) return false;
  return covered.some((cell) => unitAdjacentToCell(combat, unit, cell));
}

/** The wall-type battlefield tokens that take the PC wall footprint on the hex board. */
export type HexWallKind = "force_field" | "fire_wall" | "artifact_wall";

export function isHexWallKind(kind: string): kind is HexWallKind {
  return kind === "force_field" || kind === "fire_wall" || kind === "artifact_wall";
}

/**
 * Hexes a wall token covers on the hex board (user ruling 2026-09-25, PC
 * sizes): Force Field and Fire Wall 2 hexes, 3 when the cast is Expert; the
 * Ladybird of Luck Wall 2. Every other token, and every token on the 4×5
 * grid, is one space.
 */
export function hexWallSize(
  combat: FootprintCombat | null | undefined,
  kind: string,
  expert = false
): number {
  if (combatGeometry(combat) !== "hex" || !isHexWallKind(kind)) return 1;
  if (kind === "artifact_wall") return 2;
  return expert ? 3 : 2;
}

/**
 * The PC-style wall footprint anchored on `anchor`: the wall runs DOWN the hex
 * column from the anchor — the anchor, then the hex directly below it in the
 * same board column, then the next (on this even-r board that zig-zags
 * below-left / below-right, like the PC Force Field and Fire Wall). When that
 * run leaves the board or crosses a blocked hex it runs UP the column instead.
 * Null when neither run of `size` hexes fits (the anchor itself included).
 * Size 1 (and a non-hex anchor): `[anchor]` when the anchor is clear.
 */
export function hexWallCells(
  anchor: number,
  size: number,
  isBlocked: (cell: number) => boolean
): number[] | null {
  if (isBlocked(anchor)) return null;
  if (size <= 1 || !isHexPosition(anchor)) return [anchor];
  const { row, column } = getBattlefieldCoordinates(anchor);
  for (const step of [1, -1]) {
    const cells = [anchor];
    for (let index = 1; index < size; index += 1) {
      const cell = hexPosition(column, row + step * index);
      if (cell === null || isBlocked(cell)) break;
      cells.push(cell);
    }
    if (cells.length === size) return cells;
  }
  return null;
}

/**
 * Resolution-time wall footprint: the largest run that still fits, `size`
 * down to 1 (something may have moved in since the cast was declared), and
 * the anchor alone as the last resort — exactly the old one-space placement.
 */
export function hexWallPlacement(
  anchor: number,
  size: number,
  isBlocked: (cell: number) => boolean
): number[] {
  for (let length = size; length > 1; length -= 1) {
    const cells = hexWallCells(anchor, length, isBlocked);
    if (cells) return cells;
  }
  return [anchor];
}
