import type { BattleProp, BattleState, BattleUnit, BattleWeather, Element, PropKind, RestiaState, TileKind } from "./types";
import { LAYOUTS, PALETTES, PROP_HP, battlefieldOf, type Biome } from "../data/battlefields";
import { chance, pick, randInt } from "./core";
import { BOARD_COLS, BOARD_ROWS, cellOf, hexLine, neighbors } from "./hex";

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
};

export type Field = Pick<BattleState, "tiles" | "tileTimers" | "props" | "weather">;

/** Deployment hexes (columns 0-1 allies, 9-10 enemies) are never covered. */
function deployColumn(col: number): boolean {
  return col <= 1 || col >= BOARD_COLS - 2;
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
  const layoutId = spec.layout ?? pick(state, palette.layouts) ?? "open";
  const rows = LAYOUTS[layoutId] ?? LAYOUTS.open!;
  // Vertical mirror keeps the odd-row offset intact (row r <-> 6 - r have the same parity).
  const mirror = !spec.layout && chance(state, 0.5);
  const tiles: Record<number, TileKind> = {};
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
        tiles[cell] = "high";
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
  for (let r = 0; r < BOARD_ROWS; r++) {
    const line = rows[mirror ? BOARD_ROWS - 1 - r : r] ?? "";
    for (let i = 0; i < 7; i++) {
      const col = i + 2;
      if (deployColumn(col)) continue;
      const symbol = line[i] ?? ".";
      // Boss boards skip the random extras so the arena stays readable.
      if (symbol === "." || (symbol === "?" && spec.boss)) continue;
      place(symbol, cellOf(col, r), field.biome);
    }
  }
  return { tiles, tileTimers: {}, props, weather: weatherFor(state, spec.backdrop) };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function tileAt(battle: BattleState, cell: number): TileKind | null {
  return battle.tiles[cell] ?? null;
}

export function heightOf(battle: BattleState, cell: number): number {
  return battle.tiles[cell] === "high" ? 1 : 0;
}

export function propAt(battle: BattleState, cell: number): BattleProp | undefined {
  return battle.props.find((prop) => prop.cell === cell && (prop.kind === "rock" || prop.hp > 0));
}

/** Part of the board a unit can ever stand on (not void or water). */
export function standable(battle: BattleState, cell: number): boolean {
  const tile = battle.tiles[cell];
  return tile !== "void" && tile !== "water" && !propAt(battle, cell);
}

export function blocksSight(prop: BattleProp): boolean {
  return prop.kind === "rock" || prop.kind === "pillar" || prop.kind === "totem";
}

/**
 * Clear line from `from` to `to`: no rock/pillar/totem in between. A shooter on
 * high ground sees over blockers right next to it.
 */
export function hasLineOfSight(battle: BattleState, from: number, to: number): boolean {
  const line = hexLine(from, to);
  const high = heightOf(battle, from) > 0;
  for (const cell of line.slice(1, -1)) {
    const prop = propAt(battle, cell);
    if (!prop || !blocksSight(prop)) continue;
    if (high && neighbors(from).includes(cell)) continue;
    return false;
  }
  return true;
}

/** Cost to step onto `cell` for this unit (Infinity = can't). Units are handled by the caller. */
export function stepCost(battle: BattleState, unit: BattleUnit, cell: number, sureFooted: boolean): number {
  const tile = battle.tiles[cell];
  if (tile === "void") return Infinity;
  if (propAt(battle, cell) && !unit.flying) return Infinity;
  if (tile === "water") return unit.flying ? 1 : Infinity;
  if (unit.flying || sureFooted) return 1;
  if (tile === "high" || tile === "ice" || tile === "mud") return 2;
  return 1;
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
