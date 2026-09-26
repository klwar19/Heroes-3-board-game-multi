import {
  BATTLEFIELD_COLUMNS,
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldPositions,
  getHexDeploymentZone,
  getOrthogonalNeighbors,
  hexPosition,
  HEX_BATTLEFIELD_COLUMNS,
  HEX_BATTLEFIELD_ROWS,
  isHexPosition
} from "./battlefield";
import { createSeededRandom } from "./random";
import { PC_OBSTACLES, type PcObstacleDefinition } from "./hex-pc-obstacles";
import { battlefieldTokenCells, unitCells } from "./hex-footprint";
import type { CombatState, HexBattlefieldId, HexObstacleToken } from "./state";

/**
 * Fixed layouts of the optional hex battlefield (`hex-battlefield` house rule).
 * Import-light on purpose (battlefield + random only) so every combat module can
 * read it. Orientation: the attacker deploys on the left edge (hex columns 0-1),
 * the defender on the right edge (11-12); a 4×5 "row" (distance from an army's
 * edge) is a hex COLUMN, a 4×5 "column" (a line between the armies) a hex ROW.
 */

/**
 * Hex battlefield default Round limit (user ruling 2026-09-26, replacing the
 * 2026-09-25 "3 rounds"): a neutral fight with no designer limit rolls on free
 * for rounds 1 and 2; continuing into round 3 and every later round costs
 * movement points through the usual continue-or-retreat window (the 4×5 board
 * counts it after round 1).
 */
export const HEX_DEFAULT_FREE_COMBAT_ROUNDS = 2;

/** Auto-deployment spreads from the middle row outwards: E, D, F, C, G, B, H, A, I. */
export const HEX_MIDDLE_OUT_ROWS: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/**
 * The PC game's LOOSE formation (Heroes 3 / VCMI `defenderUnitsLoose`), the
 * way wandering monsters stand: one stack per row, spread over the whole
 * height of the field instead of bunched in the middle. The PC rows (0-10 of
 * its 11) are scaled onto this board's 9 rows; counts past the PC's seven
 * fill the rows left over. Index = stack count - 1.
 */
const HEX_LOOSE_FORMATION_ROWS: readonly (readonly number[])[] = [
  [4],
  [2, 6],
  [2, 4, 6],
  [0, 3, 5, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8],
  [0, 2, 3, 4, 5, 6, 8],
  [0, 1, 2, 3, 5, 6, 7, 8],
  [0, 1, 2, 3, 4, 5, 6, 7, 8]
];

/**
 * The rows a side's `count` stacks take in the loose formation, most central
 * first (so the first-placed stack keeps the middle), or null when the count
 * exceeds the board's rows.
 */
export function hexLooseFormationRows(count: number): number[] | null {
  const rows = HEX_LOOSE_FORMATION_ROWS[count - 1];
  return rows ? [...rows].sort((a, b) => HEX_MIDDLE_OUT_ROWS.indexOf(a) - HEX_MIDDLE_OUT_ROWS.indexOf(b)) : null;
}

/** The hexes of one board column, middle row first. */
export function hexColumnCells(column: number): number[] {
  return HEX_MIDDLE_OUT_ROWS.map((row) => hexPosition(column, row)).filter(
    (position): position is number => position !== null
  );
}

/**
 * One line of a side's deployment zone, middle row first: "back" is the board
 * edge column (attacker 0, defender 12), "front" the zone column nearer the
 * enemy (attacker 1, defender 11).
 */
export function hexDeploymentLine(side: "attacker" | "defender", line: "front" | "back"): number[] {
  const column = side === "attacker"
    ? (line === "back" ? 0 : 1)
    : (line === "back" ? HEX_BATTLEFIELD_COLUMNS - 1 : HEX_BATTLEFIELD_COLUMNS - 2);
  return hexColumnCells(column);
}

/**
 * Hex board Tactics: the start-of-combat window lets its holder re-sort their
 * army anywhere within the first FOUR hex columns of their side (the printed
 * deployment zone is two), moving and switching units as often as they like.
 */
export const HEX_TACTICS_SORT_DEPTH = 4;

/** A side's Tactics re-sort zone: its 4 edge columns, every row, ascending. */
export function hexTacticsSortZone(side: "attacker" | "defender"): number[] {
  const zone: number[] = [];
  for (let row = 0; row < HEX_BATTLEFIELD_ROWS; row += 1) {
    for (let depth = 0; depth < HEX_TACTICS_SORT_DEPTH; depth += 1) {
      const position = hexPosition(side === "attacker" ? depth : HEX_BATTLEFIELD_COLUMNS - 1 - depth, row);
      if (position !== null) zone.push(position);
    }
  }
  return zone.sort((a, b) => a - b);
}

/** The board centre, E7. */
export const HEX_BOARD_CENTER = hexPosition(6, 4)!;

/** Creature Bank: the attacker forms up within 2 hexes of E7 (19 hexes, centre first). */
export const HEX_CREATURE_BANK_ATTACKER_CELLS: readonly number[] = getBattlefieldPositions("hex")
  .filter((position) => getBattlefieldDistance(position, HEX_BOARD_CENTER) <= 2)
  .sort((left, right) =>
    getBattlefieldDistance(left, HEX_BOARD_CENTER) - getBattlefieldDistance(right, HEX_BOARD_CENTER) || left - right
  );

/** Bank front line: the outer ring of the attacker's centre block (the hexes facing the corners). */
export const HEX_CREATURE_BANK_FRONT_CELLS: readonly number[] = HEX_CREATURE_BANK_ATTACKER_CELLS.filter(
  (position) => getBattlefieldDistance(position, HEX_BOARD_CENTER) === 2
);

/** Creature Bank guards hold the four corners: A1, A13, I1, I13. */
export const HEX_CREATURE_BANK_GUARD_CORNERS: readonly number[] = [
  hexPosition(0, 0)!,
  hexPosition(HEX_BATTLEFIELD_COLUMNS - 1, 0)!,
  hexPosition(0, HEX_BATTLEFIELD_ROWS - 1)!,
  hexPosition(HEX_BATTLEFIELD_COLUMNS - 1, HEX_BATTLEFIELD_ROWS - 1)!
];

/**
 * The 2-hex-deep corner pockets (the two edge columns × the two edge rows at
 * each corner), corner hexes excluded — where a guard party larger than four
 * spills first, then onto any other hex outside the attacker's block.
 */
export const HEX_CREATURE_BANK_GUARD_OVERFLOW_CELLS: readonly number[] = (() => {
  const pockets: number[] = [];
  for (const corner of HEX_CREATURE_BANK_GUARD_CORNERS) {
    const { row, column } = getBattlefieldCoordinates(corner);
    const rowStep = row === 0 ? 1 : -1;
    const columnStep = column === 0 ? 1 : -1;
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1]] as const) {
      const cell = hexPosition(column + dc * columnStep, row + dr * rowStep);
      if (cell !== null) pockets.push(cell);
    }
  }
  const rest = getBattlefieldPositions("hex").filter((position) =>
    !pockets.includes(position) &&
    !HEX_CREATURE_BANK_GUARD_CORNERS.includes(position) &&
    !HEX_CREATURE_BANK_ATTACKER_CELLS.includes(position)
  );
  return [...pockets, ...rest];
})();

/** Graveyard's two extra Zombies: the middle of the left and right edges (E1 / E13). */
export const HEX_GRAVEYARD_EXTRA_GUARD_CELLS: readonly number[] = [
  hexPosition(0, 4)!,
  hexPosition(HEX_BATTLEFIELD_COLUMNS - 1, 4)!
];

/** Black Tower's Dragon: either of the two middle hexes of the defender's back column. */
export const HEX_BLACK_TOWER_GUARD_CELLS: readonly number[] = hexDeploymentLine("defender", "back").slice(0, 2);

/**
 * Ship battle (the Heroes 3 boat battlefield): the open water between the two
 * ships runs down hex column 7 and cannot be walked; the only ground crossings
 * are the two planks, B7 and G7. Flyers pass over it like any obstacle.
 */
export const HEX_SHIP_BATTLE_OBSTACLES: readonly number[] = [0, 2, 3, 4, 5, 7, 8].map((row) => hexPosition(6, row)!);

/**
 * Whether `cell` is the open sea of a hex ship battle: those hexes sit in
 * `combat.obstacles` (so they block like obstacles) but are the water between
 * the ships, not an obstacle token — nothing may move or remove them (Sprite
 * veteran obstacle move, Remove Obstacle, Break Cover). Always false on the
 * 4×5 grid and on every other board.
 */
export function isHexSeaCell(
  combat: Pick<CombatState, "geometry" | "boardArtId"> | null | undefined,
  cell: number
): boolean {
  return combat?.geometry === "hex" && combat.boardArtId === "ship-battle" && HEX_SHIP_BATTLE_OBSTACLES.includes(cell);
}

/** `combat.obstacles` minus the hex ship battle's sea hexes (the movable/removable obstacles). */
export function movableObstacleCells(combat: CombatState): number[] {
  return (combat.obstacles ?? []).filter((cell) => !isHexSeaCell(combat, cell));
}

/**
 * The hex that plays the role of a 4×5 cell in scripted/preset layouts: the
 * grid row (0 = defender edge … 4 = attacker edge) becomes the hex column
 * (12, 9, 6, 3, 0) and the grid column (A–D) the hex row (B, D, F, H).
 */
export function hexEquivalentOfGridCell(cell: number): number | null {
  if (!Number.isInteger(cell) || cell < 0 || cell >= BATTLEFIELD_COLUMNS * 5) {
    return null;
  }
  const row = Math.floor(cell / BATTLEFIELD_COLUMNS);
  const column = cell % BATTLEFIELD_COLUMNS;
  return hexPosition(HEX_BATTLEFIELD_COLUMNS - 1 - row * 3, column * 2 + 1);
}

/**
 * Each Heroes 3 battlefield's obstacle pool: an ordinary battlefield takes the
 * obstacles allowed on its terrain; a special battlefield (beach, cursed ground,
 * magic clouds, ...) only the obstacles listed for it — the VCMI rule.
 */
const HEX_BATTLEFIELD_TERRAIN: Readonly<Record<HexBattlefieldId, { terrain?: string; special?: string }>> = {
  bch: { special: "sand_shore" },
  boat: { special: "ship" },
  cf: { special: "clover_field" },
  cur: { special: "cursed_ground" },
  deck: { special: "ship" },
  des: { terrain: "sand" },
  drdd: { terrain: "dirt" },
  drmt: { terrain: "dirt" },
  drtr: { terrain: "dirt" },
  ef: { special: "evil_fog" },
  ff: { special: "fiery_fields" },
  grmt: { terrain: "grass" },
  grtr: { terrain: "grass" },
  hg: { special: "holy_ground" },
  lava: { terrain: "lava" },
  lp: { special: "lucid_pools" },
  mag: { special: "magic_plains" },
  mc: { special: "magic_clouds" },
  rgh: { terrain: "rough" },
  rk: { special: "rocklands" },
  snmt: { terrain: "snow" },
  sntr: { terrain: "snow" },
  sub: { terrain: "subterra" },
  swmp: { terrain: "swamp" }
};

export function hexBattlefieldObstacles(battlefield: HexBattlefieldId): PcObstacleDefinition[] {
  // An unknown id (a client and room server on different builds) must not throw on every render.
  const entry = HEX_BATTLEFIELD_TERRAIN[battlefield];
  if (!entry) return [];
  const { terrain, special } = entry;
  return PC_OBSTACLES.filter((obstacle) =>
    special ? obstacle.special.includes(special) : Boolean(terrain && obstacle.terrains.includes(terrain))
  );
}

/**
 * The hexes an obstacle covers when anchored on `anchor`: its footprint steps
 * are measured from an even-row anchor, so they are applied as a cube
 * translation (an odd-row anchor shifts exactly as the PC game shifts it).
 */
export function pcObstacleCells(obstacle: PcObstacleDefinition, anchor: number): number[] | null {
  const toCube = (column: number, row: number) => {
    const q = column - (row + (row & 1)) / 2;
    return { q, r: row };
  };
  const base = getBattlefieldCoordinates(anchor);
  const baseCube = toCube(base.column, base.row);
  const cells: number[] = [];
  for (const [dx, dy] of obstacle.tiles) {
    const delta = toCube(dx, dy);
    const q = baseCube.q + delta.q;
    const r = baseCube.r + delta.r;
    const cell = hexPosition(q + (r + (r & 1)) / 2, r);
    if (cell === null) {
      return null;
    }
    cells.push(cell);
  }
  return cells.sort((a, b) => a - b);
}

/**
 * The PC game's obstacle budget (VCMI BattleInfo): 5-12 hexes blocked by usual
 * obstacles on its open field — the 11 columns × 11 rows between the two
 * deployment strips. This board scales that density to its own open area.
 */
const PC_OBSTACLE_BUDGET_MIN = 5;
const PC_OBSTACLE_BUDGET_MAX = 12;
const PC_OPEN_FIELD_HEXES = 11 * 11;

/**
 * "Place Obstacles" for a hex combat, the PC way: roll how many hexes the
 * obstacles block (the PC's 5-12, scaled to this fight's open area — 3-6 on
 * the standard board), then keep drawing a random obstacle of the fight's
 * Heroes 3 battlefield (repeats allowed, as on the PC) on a random valid spot
 * until that many hexes are blocked. An obstacle that would overshoot the
 * remaining budget by more than one hex is skipped for a smaller one, so a
 * fight never gets a wall of rock nor a bare field. No obstacle hex may lie on
 * or next to another obstacle or a `keepClear` hex (the deployment zones), nor
 * on an `occupied` hex (units, existing obstacles, fortifications).
 * Deterministic in `seed` (pass the combat's baked dice seed), so every client
 * agrees.
 */
export function generateHexObstacleTokens(
  seed: string,
  keepClear: Iterable<number>,
  occupied: Iterable<number>,
  battlefield: HexBattlefieldId = "grmt"
): HexObstacleToken[] {
  const random = createSeededRandom(`${seed}#hex-obstacles`, { salt: false });
  const kinds = hexBattlefieldObstacles(battlefield);
  const clear = new Set(keepClear);
  const taken = new Set(occupied);
  const tooClose = (cell: number): boolean =>
    taken.has(cell) || clear.has(cell) || getOrthogonalNeighbors(cell).some((neighbor) => clear.has(neighbor));
  const openHexes = getBattlefieldPositions("hex").filter((cell) => !tooClose(cell)).length;
  const pcBudget = random.nextInt(PC_OBSTACLE_BUDGET_MIN, PC_OBSTACLE_BUDGET_MAX);
  let budget = Math.max(2, Math.round((pcBudget * openHexes) / PC_OPEN_FIELD_HEXES));
  // The last obstacle may overshoot the rolled budget by one hex, never the
  // scaled PC maximum (12 hexes -> 6 on the standard board).
  const blockedCap = Math.max(2, Math.round((PC_OBSTACLE_BUDGET_MAX * openHexes) / PC_OPEN_FIELD_HEXES));
  let blocked = 0;
  const tokens: HexObstacleToken[] = [];
  // Every draw either places an obstacle or drops a kind that no longer fits.
  let pool = [...kinds];
  while (budget > 0 && pool.length > 0) {
    const fitting = pool.filter((obstacle) => obstacle.tiles.length <= budget + 1 && blocked + obstacle.tiles.length <= blockedCap);
    if (fitting.length === 0) {
      break;
    }
    const obstacle = random.pick(fitting);
    const candidates: Array<{ anchor: number; cells: number[] }> = [];
    for (const anchor of getBattlefieldPositions("hex")) {
      const cells = pcObstacleCells(obstacle, anchor);
      if (cells && !cells.some(tooClose)) {
        candidates.push({ anchor, cells });
      }
    }
    if (candidates.length === 0) {
      pool = pool.filter((kind) => kind !== obstacle);
      continue;
    }
    const { anchor, cells } = random.pick(candidates);
    tokens.push({ id: `hex-obstacle-${tokens.length + 1}`, kind: obstacle.id, cells, anchor });
    budget -= cells.length;
    blocked += cells.length;
    // Later tokens keep clear of this one too (no two obstacles adjacent).
    for (const cell of cells) {
      clear.add(cell);
    }
  }
  return tokens;
}

/**
 * Places the random obstacle tokens of a hex combat once (idempotent through
 * `combat.hexObstacleTokens`). `keepClear` = every deployment hex of this fight
 * (both zones, or a bank's centre block and guard corners).
 */
export function placeHexObstacleTokens(
  combat: CombatState,
  keepClear: Iterable<number>,
  occupied: Iterable<number> = []
): void {
  if (combat.geometry !== "hex" || combat.hexObstacleTokens) {
    return;
  }
  const blocked = new Set<number>([...(combat.obstacles ?? []), ...occupied]);
  for (const unit of Object.values(combat.units)) {
    // Both hexes of a double-wide unit.
    for (const cell of unitCells(combat, unit)) if (isHexPosition(cell)) blocked.add(cell);
  }
  for (const token of combat.battlefieldTokens ?? []) {
    for (const cell of battlefieldTokenCells(token)) blocked.add(cell);
  }
  const tokens = generateHexObstacleTokens(combat.dice.seed, keepClear, blocked, combat.hexBattlefield ?? "grmt");
  combat.hexObstacleTokens = tokens;
  if (tokens.length > 0) {
    combat.obstacles = [...new Set([...(combat.obstacles ?? []), ...tokens.flatMap((token) => token.cells)])]
      .sort((left, right) => left - right);
  }
}

/** Both sides' standard deployment zones (the hexes obstacles keep clear of). */
export function hexStandardDeploymentZones(): number[] {
  return [...getHexDeploymentZone("attacker"), ...getHexDeploymentZone("defender")];
}
