import type { BattlePoint, BattleProp, BattleState, BattleUnit, BattleWeather, BoardSize, Element, ItemId, PropKind, RestiaState, TileKind } from "./types";
import { CACHE_LOOT, CACHE_SUPPLIES, ELEVATIONS, LAYOUTS, PALETTES, PROP_HP, battlefieldOf, type Biome } from "../data/battlefields";
import { chance, pick, randInt, random } from "./core";
import { BOARD_COLS, BOARD_ROWS, cellOf, colRow, hexDistance, hexLine, neighbors } from "./hex";

/**
 * Battle terrain: board layouts, ground tiles, props, line of sight, movement
 * costs and weather. Pure helpers over BattleState; battle.ts owns the rules.
 */

export type FieldSpec = {
  backdrop: string;
  /** A named layout from data/battlefields.ts (default: one the biome allows). */
  layout?: string;
  boss: boolean;
  /** Level used to scale destructible props. */
  level: number;
  /** Board size (hexes outside it are void). */
  cols: number;
  rows: number;
  /** Random fights (field and dungeon, no fixed layout): the board may get objectives (BattleState.points). */
  objectives?: boolean;
  /** A two-hex walker takes part: a randomly picked authored layout must leave it a way across. */
  wide?: boolean;
};

export type Field = Pick<BattleState, "tiles" | "tileTimers" | "props" | "weather" | "heights" | "points">;

/** Ground heights run 0 (level) to 2 (hilltop). */
export const MAX_HEIGHT = 2;
/**
 * A rock crag in `heights`: a sheer column nobody can stand on or climb
 * (flyers pass over but can't stop), that blocks line of sight, can't be
 * reshaped, and slams whoever is knocked into it.
 */
export const CRAG_HEIGHT = 3;

/** Board sizes: small boards use the authored layouts, medium and large are generated. */
export const BOARD_SIZES: Record<BoardSize, { cols: number; rows: number }> = {
  small: { cols: 11, rows: 7 },
  medium: { cols: 15, rows: 9 },
  large: { cols: 19, rows: 11 }
};

export function isCrag(battle: Pick<BattleState, "heights">, cell: number): boolean {
  return (battle.heights?.[cell] ?? 0) >= CRAG_HEIGHT;
}

/** Deployment hexes (the two columns at each end) are never covered. */
function deployColumn(col: number, cols: number): boolean {
  return col <= 1 || col >= cols - 2;
}

export function weatherFor(state: RestiaState, backdrop: string): BattleWeather {
  const field = battlefieldOf(backdrop);
  if (!field.outdoor) return field.weather ?? "clear";
  switch (state.weather) {
    case "snow":
      return field.biome === "frost" ? "blizzard" : "snow";
    case "storm":
      return "storm";
    case "rain":
      return field.biome === "frost" || field.biome === "village" ? "snow" : "rain";
    default:
      return field.biome === "frost" || field.biome === "village" ? "snow" : "clear";
  }
}

export function buildField(state: RestiaState, spec: FieldSpec): Field {
  const field = battlefieldOf(spec.backdrop);
  const palette = PALETTES[field.biome];
  // Small boards (and any fixed layout) use the authored 7x7 layouts; medium and large boards are generated.
  const authored = spec.layout !== undefined || (spec.cols === BOARD_SIZES.small.cols && spec.rows === BOARD_SIZES.small.rows);
  const layoutId = authored ? spec.layout ?? pick(state, palette.layouts) ?? "open" : "open";
  const rows = LAYOUTS[layoutId] ?? LAYOUTS.open!;
  // Vertical mirror keeps the odd-row offset intact (row r <-> 6 - r have the same parity).
  const mirror = authored && !spec.layout && chance(state, 0.5);
  const tiles: Record<number, TileKind> = {};
  const heights: Record<number, number> = {};
  const props: BattleProp[] = [];
  let serial = 0;
  const addProp = (kind: PropKind, cell: number, side?: "ally" | "enemy") => {
    const hp = kind === "rock" ? 0 : PROP_HP[kind].base + PROP_HP[kind].perLevel * spec.level;
    props.push({ uid: `prop-${serial++}`, kind, cell, hp, maxHp: hp, ...(side ? { side } : {}) });
  };
  const place = (symbol: string, cell: number, biome: Biome) => {
    const set = PALETTES[biome];
    switch (symbol) {
      case "O":
        addProp(pick(state, set.obstacle) ?? "rock", cell);
        break;
      case "C":
        tiles[cell] = "cover";
        break;
      case "H":
      case "M":
        // A lone mound (heights from ELEVATIONS win where a layout has them).
        heights[cell] = Math.max(heights[cell] ?? 0, 1);
        break;
      case "Z":
        tiles[cell] = pick(state, set.hazard) ?? "mud";
        break;
      case "G":
        tiles[cell] = pick(state, set.goodie) ?? "spring";
        break;
      case "W":
        tiles[cell] = "water";
        break;
      case "X":
        tiles[cell] = "void";
        break;
      case "B":
        addProp("barrel", cell);
        break;
      case "R":
        addProp("crates", cell);
        break;
      case "T":
        addProp("totem", cell, "enemy");
        break;
      case "?":
        if (chance(state, 0.45)) place(pick(state, set.extras) ?? "O", cell, biome);
        break;
    }
  };
  const elevation = ELEVATIONS[layoutId];
  // Everything outside this battle's board is off the board.
  for (let r = 0; r < BOARD_ROWS; r++) for (let c = 0; c < BOARD_COLS; c++) if (r >= spec.rows || c >= spec.cols) tiles[cellOf(c, r)] = "void";
  if (!authored) generateBoard(state, spec, field.biome, { tiles, heights, props, place });
  for (let r = 0; authored && r < spec.rows; r++) {
    const line = rows[mirror ? spec.rows - 1 - r : r] ?? "";
    const rise = elevation?.[mirror ? spec.rows - 1 - r : r] ?? "";
    for (let i = 0; i < 7; i++) {
      const col = i + 2;
      const level = Number(rise[i]);
      if (!deployColumn(col, spec.cols) && level > 0) heights[cellOf(col, r)] = Math.min(MAX_HEIGHT, level);
    }
    for (let i = 0; i < 7; i++) {
      const col = i + 2;
      if (deployColumn(col, spec.cols)) continue;
      const symbol = line[i] ?? ".";
      // Boss boards skip the random extras so the arena stays readable.
      if (symbol === "." || (symbol === "?" && spec.boss)) continue;
      place(symbol, cellOf(col, r), field.biome);
    }
  }
  // Water and chasms have no ground to raise.
  for (const key of Object.keys(heights)) {
    const tile = tiles[Number(key)];
    if (tile === "water" || tile === "void") delete heights[Number(key)];
  }
  // A random authored layout gets the generated boards' checks: a '?' can wall the field
  // in two (barrels), and some layouts (barrels, islands) leave two-hex walkers no way
  // across; that lane is bridged or cleared without levelling the layout's hills.
  if (authored && !spec.layout) {
    repairBoard(spec, { tiles, heights, props });
    if (spec.wide) ensureWideLanes(spec, { tiles, heights, props }, true);
  }
  const points = spec.objectives ? placePoints(state, spec, field.biome, { tiles, heights, props }, authored) : [];
  return { tiles, tileTimers: {}, props, weather: weatherFor(state, spec.backdrop), heights, ...(points.length ? { points } : {}) };
}

// ---------------------------------------------------------------------------
// Generated boards (medium and large)
// ---------------------------------------------------------------------------

type Paint = {
  tiles: Record<number, TileKind>;
  heights: Record<number, number>;
  props: BattleProp[];
  place: (symbol: string, cell: number, biome: Biome) => void;
};

type Ground = Omit<Paint, "place">;

/** Where a ground walker can stand on a board under construction, and how high. */
function groundOf(paint: Ground): { h: (cell: number) => number; walkable: (cell: number) => boolean } {
  const h = (cell: number) => paint.heights[cell] ?? 0;
  const walkable = (cell: number) => {
    const tile = paint.tiles[cell];
    return tile !== "void" && tile !== "water" && h(cell) < CRAG_HEIGHT && !paint.props.some((prop) => prop.cell === cell);
  };
  return { h, walkable };
}

function boardCells(cols: number, rows: number, test: (cell: number) => boolean = () => true): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (test(cellOf(c, r))) out.push(cellOf(c, r));
  return out;
}

/** Turns a blocker back into ground: props go, water and chasms fill in, a crag crumbles to a one-level rise. */
function clearHex(paint: Ground, cell: number): void {
  for (let i = paint.props.length - 1; i >= 0; i--) if (paint.props[i]!.cell === cell) paint.props.splice(i, 1);
  const tile = paint.tiles[cell];
  if (tile === "void" || tile === "water") delete paint.tiles[cell];
  if ((paint.heights[cell] ?? 0) >= CRAG_HEIGHT) paint.heights[cell] = 1;
}

/**
 * A natural board for `spec.cols` x `spec.rows`: water/chasms where the biome
 * has them, several irregular hills (a rim of 1 around summits of 2), rock
 * crags, then the biome's cover, hazards, goodies and props. The two
 * deployment columns at each end stay level and clear. Then it is validated
 * (repairBoard, ensureWideLanes, ensureWideRoom).
 */
function generateBoard(state: RestiaState, spec: FieldSpec, biome: Biome, paint: Paint): void {
  const { cols, rows } = spec;
  const { tiles, heights, props } = paint;
  const { h } = groundOf(paint);
  const interior = (cell: number) => {
    const { col, row } = colRow(cell);
    return col < cols && row < rows && !deployColumn(col, cols);
  };
  const plain = (cell: number) => interior(cell) && !tiles[cell] && h(cell) < CRAG_HEIGHT && !props.some((prop) => prop.cell === cell);
  const colIn = (cell: number, from: number, to: number) => colRow(cell).col >= from && colRow(cell).col <= to;
  const randomCell = (test: (cell: number) => boolean) => pick(state, boardCells(cols, rows, test));
  // Three column bands (west, east, middle) so features spread over both halves.
  const span = cols - 6;
  const inBand = (cell: number, k: number) => colIn(cell, 3 + Math.floor((k * span) / 3), 2 + Math.floor(((k + 1) * span) / 3));
  const bands = chance(state, 0.5) ? [0, 2, 1] : [2, 0, 1];
  const large = cols >= BOARD_SIZES.large.cols;
  /** An irregular connected blob of up to `size` hexes grown from `seed`. */
  const grow = (seed: number, size: number, ok: (cell: number) => boolean): number[] => {
    const blob = [seed];
    for (let tries = 0; blob.length < size && tries < size * 8; tries++) {
      const next = pick(state, neighbors(blob[randInt(state, 0, blob.length - 1)]!));
      if (next !== null && !blob.includes(next) && ok(next)) blob.push(next);
    }
    return blob;
  };

  // Water and chasms, for the biomes that have them.
  if (biome === "cloister" && chance(state, 0.75)) {
    // A stream down the middle with two or three fords.
    let col = randInt(state, Math.floor(cols / 2) - 1, Math.floor(cols / 2) + 1);
    const fords = new Set<number>();
    while (fords.size < (large ? 3 : 2)) fords.add(randInt(state, 0, rows - 1));
    for (let row = 0; row < rows; row++) {
      if (!fords.has(row)) tiles[cellOf(col, row)] = "water";
      // Meander without breaking the stream (odd rows sit half a hex to the right).
      const next = row & 1 ? col + randInt(state, 0, 1) : col - randInt(state, 0, 1);
      col = Math.max(4, Math.min(cols - 5, next));
    }
  }
  if (biome === "rift") {
    const chasms = randInt(state, 2, large ? 5 : 3);
    for (let i = 0; i < chasms; i++) {
      const ok = (cell: number) => plain(cell) && colIn(cell, 4, cols - 5);
      const seed = randomCell((cell) => ok(cell) && inBand(cell, bands[i % 3]!));
      if (seed !== null) for (const cell of grow(seed, randInt(state, 1, 3), ok)) tiles[cell] = "void";
    }
  }
  if ((biome === "frost" || biome === "nave" || biome === "ember") && chance(state, 0.4)) {
    // Broken edges top and bottom, like the authored mountain pass.
    const length = randInt(state, 2, 4);
    const start = randInt(state, 4, cols - 4 - length);
    for (let col = start; col < start + length; col++) {
      tiles[cellOf(col, 0)] = "void";
      tiles[cellOf(col, rows - 1)] = "void";
    }
  }

  // Hills: an irregular rim of 1 with summits of 2 inside it.
  const hills = large ? randInt(state, 3, 5) : randInt(state, 2, 3);
  for (let i = 0; i < hills; i++) {
    const seed = randomCell((cell) => plain(cell) && h(cell) === 0 && inBand(cell, bands[i % 3]!) && colRow(cell).row > 0 && colRow(cell).row < rows - 1);
    if (seed === null) continue;
    const blob = grow(seed, large ? randInt(state, 6, 14) : randInt(state, 5, 11), (cell) => interior(cell) && tiles[cell] !== "water" && tiles[cell] !== "void");
    for (const cell of blob) heights[cell] = Math.max(h(cell), 1);
    // Summits never touch the columns beside deployment, so the deployment zones have no cliffs.
    const inner = blob.filter((cell) => colIn(cell, 3, cols - 4) && neighbors(cell).filter((next) => blob.includes(next) || h(next) >= 1).length >= 4);
    const top = pick(state, inner);
    if (top === null) continue;
    for (const cell of grow(top, randInt(state, 1, 3), (next) => inner.includes(next))) heights[cell] = 2;
  }

  // Crags: small clusters of rock columns, on level ground or hill rims.
  const crags = large ? randInt(state, 3, 5) : randInt(state, 2, 3);
  for (let i = 0; i < crags; i++) {
    const rock = (cell: number) => plain(cell) && colIn(cell, 4, cols - 5) && h(cell) < 2;
    const seed = randomCell((cell) => rock(cell) && inBand(cell, bands[(i + 1) % 3]!));
    if (seed !== null) for (const cell of grow(seed, randInt(state, 1, 3), rock)) heights[cell] = CRAG_HEIGHT;
  }

  // The biome's cover, hazards, goodies and props (what '?' becomes on the authored boards).
  const extras = PALETTES[biome].extras;
  const features = Math.round(boardCells(cols, rows, interior).length * (spec.boss ? 0.07 : 0.13));
  let goodies = 0;
  for (let i = 0; i < features; i++) {
    let symbol: string = pick(state, extras) ?? "O";
    if (symbol === "G" && goodies++ >= 2) symbol = "C";
    // Props stay off the summits so the hilltops remain worth fighting for.
    const solid = symbol === "O" || symbol === "B" || symbol === "R";
    const cell = randomCell((c) => plain(c) && (!solid || h(c) < 2));
    if (cell === null) break;
    paint.place(symbol, cell, biome);
  }

  repairBoard(spec, paint);
  ensureWideLanes(spec, paint);
  ensureWideRoom(state, spec, paint);
}

/**
 * Every standable hex must be reachable by a ground walker from both
 * deployment zones and lead back to them (climbing one level at most; crags,
 * props, water and chasms block). Ground cut off by a cliff becomes a one-level
 * step (height 1 has no cliff with any neighbour); a pocket walled in by
 * blockers gets the shortest run of them cleared. The reachable region only
 * grows, so this ends.
 */
function repairBoard(spec: FieldSpec, paint: Ground): void {
  const { cols, rows } = spec;
  const { h, walkable } = groundOf(paint);
  const inside = (cell: number) => colRow(cell).col < cols && colRow(cell).row < rows;
  const all = boardCells(cols, rows);
  const zone = all.filter((cell) => colRow(cell).col <= 1 && walkable(cell));
  const flood = (step: (from: number, to: number) => boolean) => {
    const seen = new Set(zone);
    const queue = [...zone];
    while (queue.length) {
      const cell = queue.shift()!;
      for (const next of neighbors(cell)) {
        if (seen.has(next) || !walkable(next) || !step(cell, next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };
  for (let guard = 0; guard < all.length * 2; guard++) {
    const back = flood((from, to) => h(from) - h(to) <= 1);
    const good = new Set([...flood((from, to) => h(to) - h(from) <= 1)].filter((cell) => back.has(cell)));
    const bad = all.filter((cell) => walkable(cell) && !good.has(cell));
    if (!bad.length) return;
    const edge = bad.find((cell) => neighbors(cell).some((next) => good.has(next)));
    if (edge !== undefined) {
      if (deployColumn(colRow(edge).col, cols)) {
        // Deployment stays level: bring the cliff side down to a step instead.
        for (const next of neighbors(edge)) if (good.has(next) && Math.abs(h(next) - h(edge)) >= 2) paint.heights[next] = 1;
      } else paint.heights[edge] = 1;
      continue;
    }
    const parent = new Map<number, number>();
    const seen = new Set(good);
    const queue = [...good];
    let found: number | null = null;
    while (queue.length && found === null) {
      const cell = queue.shift()!;
      for (const next of neighbors(cell)) {
        if (seen.has(next) || !inside(next)) continue;
        seen.add(next);
        parent.set(next, cell);
        if (walkable(next)) {
          found = next;
          break;
        }
        queue.push(next);
      }
    }
    if (found === null) return;
    for (let at = parent.get(found); at !== undefined && !good.has(at); at = parent.get(at)) clearHex(paint, at);
  }
}

/** A two-hex walker (tail one column east for monsters, west for allies) can cross from its deployment zone to the other side. */
function wideCrossing(spec: FieldSpec, paint: Ground, dir: 1 | -1): boolean {
  const { cols, rows } = spec;
  const { h, walkable } = groundOf(paint);
  const body = (head: number) => {
    const { col, row } = colRow(head);
    const tail = col + dir;
    if (col >= cols || row >= rows || tail < 0 || tail >= cols) return false;
    return walkable(head) && walkable(cellOf(tail, row)) && h(head) === h(cellOf(tail, row));
  };
  const start = boardCells(cols, rows, (cell) => colRow(cell).col === (dir === 1 ? cols - 2 : 1) && body(cell));
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    const cell = queue.shift()!;
    if (dir === 1 ? colRow(cell).col <= 2 : colRow(cell).col >= cols - 3) return true;
    for (const next of neighbors(cell)) {
      if (seen.has(next) || !body(next) || h(next) - h(cell) > 1) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/**
 * Two-hex creatures need a way across: if there is none, the cheapest row is cleared and levelled into a lane.
 * `keepHills` (authored layouts): raised ground counts as dearer than a blocker, so a row is bridged or
 * cleared rather than a hill levelled.
 */
function ensureWideLanes(spec: FieldSpec, paint: Ground, keepHills = false): void {
  if (wideCrossing(spec, paint, 1) && wideCrossing(spec, paint, -1)) return;
  const { cols, rows } = spec;
  const { h, walkable } = groundOf(paint);
  let lane = 0;
  let cheapest = Infinity;
  for (let row = 0; row < rows; row++) {
    let cost = Math.abs(row - (rows - 1) / 2) * 0.1;
    for (let col = 2; col <= cols - 3; col++) cost += walkable(cellOf(col, row)) ? (h(cellOf(col, row)) ? (keepHills ? 4 : 1) : 0) : 3;
    if (cost < cheapest) {
      cheapest = cost;
      lane = row;
    }
  }
  for (let col = 2; col <= cols - 3; col++) {
    const cell = cellOf(col, lane);
    clearHex(paint, cell);
    delete paint.heights[cell];
  }
  // Cutting the lane can leave cliffs beside it.
  repairBoard(spec, paint);
}

/** Enough level two-hex spots: if under 45% of the open middle has a level partner hex, props are cleared until it does. */
function ensureWideRoom(state: RestiaState, spec: FieldSpec, paint: Ground): void {
  const { cols, rows } = spec;
  const { h, walkable } = groundOf(paint);
  const ratio = () => {
    let open = 0;
    let pairs = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 2; col <= cols - 3; col++) {
        const cell = cellOf(col, row);
        if (!walkable(cell)) continue;
        open += 1;
        const right = cellOf(col + 1, row);
        if (walkable(right) && h(right) === h(cell)) pairs += 1;
      }
    }
    return open ? pairs / open : 1;
  };
  while (ratio() < 0.45) {
    const prop = pick(state, paint.props.filter((entry) => entry.kind !== "totem"));
    if (!prop) break;
    paint.props.splice(paint.props.indexOf(prop), 1);
  }
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

/** What a supply cache holds: gold by level, often a consumable or a biome find. */
function cacheReward(state: RestiaState, level: number, biome: Biome): { gold: number; item?: ItemId } {
  const gold = Math.round((20 + 6 * level) * (0.8 + random(state) * 0.4));
  if (!chance(state, 0.75)) return { gold };
  const item = pick(state, [...CACHE_SUPPLIES[level < 8 ? 0 : level < 16 ? 1 : 2]!, ...CACHE_LOOT[biome]]);
  return item ? { gold, item } : { gold };
}

/**
 * Shrines, banners and supply caches: 1-3 on generated boards, sometimes one on
 * a small random board. Never in the deployment columns; shrines and banners
 * prefer hilltops near the middle, caches the open middle; kept apart.
 */
function placePoints(state: RestiaState, spec: FieldSpec, biome: Biome, paint: Ground, small: boolean): BattlePoint[] {
  const count = small ? (chance(state, 0.2) ? 1 : 0) : randInt(state, 1, 3);
  if (!count) return [];
  const { cols, rows } = spec;
  const { h, walkable } = groundOf(paint);
  const holdable = pick(state, ["shrine", "banner"] as const)!;
  const kinds: BattlePoint["kind"][] =
    count === 1
      ? [pick(state, ["shrine", "banner", "cache"] as const)!]
      : count === 2
        ? [holdable, pick(state, [holdable === "shrine" ? "banner" : "shrine", "cache"] as const)!]
        : ["shrine", "banner", "cache"];
  const low = small ? 3 : 2;
  const high = small ? cols - 4 : cols - 3;
  const middle = (cols - 1) / 2;
  const candidates = boardCells(cols, rows, (cell) => colRow(cell).col >= low && colRow(cell).col <= high && walkable(cell) && (!paint.tiles[cell] || paint.tiles[cell] === "cover"));
  const points: BattlePoint[] = [];
  for (const kind of kinds) {
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const cell of candidates) {
      if (points.some((point) => hexDistance(point.cell, cell) < (small ? 3 : 4))) continue;
      const off = Math.abs(colRow(cell).col - middle);
      const score = (kind === "cache" ? -1.2 * off : h(cell) * 4 - 0.8 * off) + random(state) * 4;
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (best === null) break;
    points.push({ id: `pt-${points.length}`, kind, cell: best, owner: null, ...(kind === "cache" ? { reward: cacheReward(state, spec.level, biome) } : {}) });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function tileAt(battle: BattleState, cell: number): TileKind | null {
  return battle.tiles[cell] ?? null;
}

export function heightOf(battle: BattleState, cell: number): number {
  return battle.heights?.[cell] ?? (battle.tiles[cell] === "high" ? 1 : 0);
}

/** Sets a hex's ground height (0-2), converting an old `high` tile; crags can't be reshaped. Returns the height it had. */
export function setHeight(battle: BattleState, cell: number, height: number): number {
  const before = heightOf(battle, cell);
  if (before >= CRAG_HEIGHT) return before;
  if (battle.tiles[cell] === "high") delete battle.tiles[cell];
  const heights = (battle.heights ??= {});
  const next = Math.max(0, Math.min(MAX_HEIGHT, Math.round(height)));
  if (next > 0) heights[cell] = next;
  else delete heights[cell];
  return before;
}

/** A sheer cliff: two or more levels between neighbouring hexes (a crag is a cliff from every side). */
export function cliffBetween(battle: BattleState, a: number, b: number): boolean {
  return isCrag(battle, a) || isCrag(battle, b) || Math.abs(heightOf(battle, a) - heightOf(battle, b)) >= 2;
}

/** Any raised ground a unit can stand on (old saves: the `high` tile). */
export function hasHighGround(battle: BattleState): boolean {
  return Object.values(battle.heights ?? {}).some((height) => height > 0 && height < CRAG_HEIGHT) || Object.values(battle.tiles).includes("high");
}

export function propAt(battle: BattleState, cell: number): BattleProp | undefined {
  return battle.props.find((prop) => prop.cell === cell && (prop.kind === "rock" || prop.hp > 0));
}

/** Part of the board a unit can ever stand on (not void, water, a crag or a prop). */
export function standable(battle: BattleState, cell: number): boolean {
  const tile = battle.tiles[cell];
  return tile !== "void" && tile !== "water" && !isCrag(battle, cell) && !propAt(battle, cell);
}

export function blocksSight(prop: BattleProp): boolean {
  return prop.kind === "rock" || prop.kind === "pillar" || prop.kind === "totem";
}

/**
 * Clear line from `from` to `to`: no rock/pillar/totem, no crag and no ground
 * higher than both ends in between (a hill hides what is behind it). A shooter
 * above a blocker right next to it sees over it (never over a crag).
 */
export function hasLineOfSight(battle: BattleState, from: number, to: number): boolean {
  const line = hexLine(from, to);
  const eye = heightOf(battle, from);
  const top = Math.max(eye, heightOf(battle, to));
  for (const cell of line.slice(1, -1)) {
    if (isCrag(battle, cell)) return false;
    const ground = heightOf(battle, cell);
    if (ground > top) return false;
    const prop = propAt(battle, cell);
    if (!prop || !blocksSight(prop)) continue;
    if (eye > ground && neighbors(from).includes(cell)) continue;
    return false;
  }
  return true;
}

/**
 * Cost to step from `from` onto `cell` for this unit (Infinity = can't). Units
 * are handled by the caller. Climbing a level costs 2 extra; a cliff of two or
 * more levels can't be climbed (only flyers go up it); stepping down is free.
 * Crags: flyers pass over (they can't stop there: not standable), walkers can't.
 */
export function stepCost(battle: BattleState, unit: BattleUnit, from: number, cell: number, sureFooted: boolean): number {
  const tile = battle.tiles[cell];
  if (tile === "void") return Infinity;
  if (isCrag(battle, cell)) return unit.flying ? 1 : Infinity;
  if (propAt(battle, cell) && !unit.flying) return Infinity;
  if (tile === "water") return unit.flying ? 1 : Infinity;
  if (unit.flying) return 1;
  const climb = heightOf(battle, cell) - heightOf(battle, from);
  if (climb >= 2) return Infinity;
  if (sureFooted) return 1;
  return (tile === "ice" || tile === "mud" ? 2 : 1) + 2 * Math.max(0, climb);
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

const WEATHER_MULT: Record<BattleWeather, Partial<Record<Element, number>>> = {
  clear: {},
  snow: { ice: 1.2, fire: 0.85 },
  blizzard: { ice: 1.3, fire: 0.75 },
  rain: { fire: 0.75, wind: 1.15, ice: 1.1 },
  storm: { wind: 1.3 },
  heat: { fire: 1.25, ice: 0.75 },
  gloom: { dark: 1.25, light: 1.1 }
};

export function weatherMult(weather: BattleWeather, element: Element): number {
  return WEATHER_MULT[weather][element] ?? 1;
}

/** Blizzards and storms shorten ranged reach. */
export function weatherRange(weather: BattleWeather): number {
  return weather === "blizzard" || weather === "storm" ? -1 : 0;
}

/** Hexes suitable for a falling hazard or a reinforcement, avoiding props and void. */
export function openCells(battle: BattleState): number[] {
  const out: number[] = [];
  for (let cell = 0; cell < BOARD_COLS * BOARD_ROWS; cell++) if (standable(battle, cell)) out.push(cell);
  return out;
}

export function randomOpenCell(state: RestiaState, battle: BattleState, filter: (cell: number) => boolean): number | null {
  const cells = openCells(battle).filter(filter);
  return cells.length ? cells[randInt(state, 0, cells.length - 1)]! : null;
}
