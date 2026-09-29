import type { BattlePoint, BattleWeather, BoardSize, ItemId, PropKind, TileKind } from "../engine/types";

/**
 * Battle boards. A battlefield is painted art (public/assets/restia/battlefields/<id>.webp)
 * plus a biome that decides which board layouts, obstacles and ground appear.
 * Older H3 backdrop codes still work (they map to a biome below).
 */
export type Biome = "meadow" | "frost" | "village" | "cellar" | "nave" | "cloister" | "ember" | "rift";

export type BattlefieldDef = {
  id: string;
  name: string;
  biome: Biome;
  /** Outdoors: the day's weather applies. Otherwise this weather is fixed. */
  outdoor: boolean;
  weather?: BattleWeather;
};

export const BATTLEFIELDS: Record<string, BattlefieldDef> = {
  eos: { id: "eos", name: "Eos Meadow", biome: "meadow", outdoor: false, weather: "clear" },
  pocket: { id: "pocket", name: "Pocket Haven", biome: "meadow", outdoor: false, weather: "clear" },
  frostwood: { id: "frostwood", name: "The Frostwood", biome: "frost", outdoor: true },
  village: { id: "village", name: "Frostbitten", biome: "village", outdoor: true },
  cellar: { id: "cellar", name: "The Woodshed", biome: "cellar", outdoor: false, weather: "clear" },
  nave: { id: "nave", name: "Frozen Nave", biome: "nave", outdoor: false, weather: "clear" },
  cloister: { id: "cloister", name: "Drowned Cloister", biome: "cloister", outdoor: false, weather: "rain" },
  ember: { id: "ember", name: "Ember Vaults", biome: "ember", outdoor: false, weather: "heat" },
  rift: { id: "rift", name: "The Rift", biome: "rift", outdoor: false, weather: "gloom" }
};

/** H3 battlefield codes used before the Restia battlefields existed. */
const LEGACY_BIOME: Record<string, Biome> = { grtr: "meadow", snmt: "frost", sntr: "frost", sn: "frost" };

export function battlefieldOf(backdrop: string): BattlefieldDef {
  return BATTLEFIELDS[backdrop] ?? { id: backdrop, name: "Battlefield", biome: LEGACY_BIOME[backdrop] ?? "meadow", outdoor: true };
}

/** What the generic layout symbols become in each biome. */
export type BiomePalette = {
  /** Solid obstacles ('O'). */
  obstacle: PropKind[];
  /** Ground that slows or hurts ('Z'). */
  hazard: TileKind[];
  /** Friendly pickups ('G'). */
  goodie: TileKind[];
  /** What '?' may become (besides nothing). */
  extras: ("O" | "C" | "Z" | "G" | "B" | "R" | "M")[];
  layouts: string[];
};

export const PALETTES: Record<Biome, BiomePalette> = {
  meadow: { obstacle: ["rock"], hazard: ["thorns", "mud"], goodie: ["spring", "crystal"], extras: ["O", "C", "Z", "G", "M"], layouts: ["open", "hills", "plateau", "ring", "hazards", "mound", "peaks"] },
  frost: { obstacle: ["pillar", "rock"], hazard: ["ice", "thorns"], goodie: ["crystal", "spring"], extras: ["O", "C", "Z", "G", "M"], layouts: ["open", "hills", "plateau", "pass", "ring", "hazards", "mound", "peaks"] },
  village: { obstacle: ["rock", "crates"], hazard: ["ice", "mud"], goodie: ["spring"], extras: ["O", "C", "B", "R", "M"], layouts: ["open", "barrels", "ring", "hills", "mound"] },
  cellar: { obstacle: ["crates"], hazard: ["mud"], goodie: ["crystal"], extras: ["R", "B", "Z"], layouts: ["barrels", "open"] },
  nave: { obstacle: ["rock", "pillar"], hazard: ["ice"], goodie: ["crystal", "spring"], extras: ["O", "C", "Z", "G"], layouts: ["ring", "pass", "plateau", "open", "hazards", "mound"] },
  cloister: { obstacle: ["rock"], hazard: ["mud", "ice"], goodie: ["spring"], extras: ["O", "Z", "G"], layouts: ["river", "ring", "open", "hazards"] },
  ember: { obstacle: ["rock"], hazard: ["fire"], goodie: ["crystal"], extras: ["O", "Z", "B"], layouts: ["barrels", "hazards", "plateau", "pass", "peaks"] },
  rift: { obstacle: ["rock", "totem"], hazard: ["thorns", "fire"], goodie: ["crystal"], extras: ["O", "G", "Z"], layouts: ["islands", "ring", "plateau", "mound"] }
};

/**
 * Board layouts: 7 rows of the 7 middle columns (2..8); columns 0-1 and 9-10
 * stay clear for deployment. Symbols: '.' ground, 'O' obstacle, 'C' cover,
 * 'H' a one-level rise, 'Z' hazard, 'G' goodie, 'W' water, 'X' void (off the board),
 * 'B' barrel, 'R' crates, 'T' enemy ward totem, '?' maybe something ('M' = a mound).
 * Hills and mounds are drawn with ELEVATIONS below.
 */
export const LAYOUTS: Record<string, string[]> = {
  open: ["?..?..?", ".......", "..?.?..", ".?...?.", "..?.?..", ".......", "?..?..?"],
  hills: ["...?...", "..C....", "......?", "...G...", "?......", "....C..", "...?..."],
  plateau: ["..O.O..", ".C...C.", ".......", ".?...?.", ".......", ".C...C.", "..O.O.."],
  ring: ["...?...", "..C.C..", ".H.O.H.", "..OOO..", ".H.O.H.", "..C.C..", "...?..."],
  pass: ["XXX.XXX", ".O...O.", ".......", "..Z.Z..", ".......", ".O...O.", "XXX.XXX"],
  river: ["...W...", ".......", ".C.W.C.", "..?W?..", ".C.W.C.", ".......", "...W..."],
  barrels: ["..R.R..", ".B...B.", "..R?R..", "...B...", "..R?R..", ".B...B.", "..R.R.."],
  hazards: ["..Z.Z..", ".Z...Z.", "Z..G..Z", "..Z.Z..", "Z..O..Z", ".Z...Z.", "..Z.Z.."],
  islands: ["X..X..X", ".X...X.", "..X.X..", "?.....?", "..X.X..", ".X...X.", "X..X..X"],
  /** One big central hill with a summit. */
  mound: ["?.....?", "..C....", ".......", "?.....?", ".......", "....C..", "?.....?"],
  /** A hill with a summit on each side of a low middle. */
  peaks: ["...?...", ".......", "...C...", "?..G..?", "...C...", ".......", "...?..."],
  /** Boss arenas: a clear centre with a ward totem on the boss side. */
  arena: ["..O...O", ".......", "..H...T", ".......", "..H...T", ".......", "..O...O"]
};

/**
 * Ground heights per layout, same grid as LAYOUTS: '.' level, '1' a rise, '2' a
 * summit. Every summit touches a '1' so walkers can climb it (a two-level step
 * is a cliff), and the shapes are mirrored so neither side starts favoured.
 */
export const ELEVATIONS: Record<string, string[]> = {
  hills: [".......", "11.....", "121....", "11..11.", "....121", "....11.", "......."],
  plateau: [".......", ".......", "..111..", "..121..", "..111..", ".......", "......."],
  islands: [".......", ".......", ".......", "..121..", ".......", ".......", "......."],
  mound: [".......", ".......", "...11..", "..121..", "...11..", ".......", "......."],
  peaks: [".......", ".......", ".11..11", "121.121", ".11..11", ".......", "......."]
};

/** Hit points of destructible props (scaled by the battle's level where noted). */
export const PROP_HP: Record<PropKind, { base: number; perLevel: number }> = {
  rock: { base: 0, perLevel: 0 },
  pillar: { base: 30, perLevel: 3 },
  crates: { base: 18, perLevel: 2 },
  barrel: { base: 1, perLevel: 0 },
  totem: { base: 40, perLevel: 5 }
};

export const PROP_NAMES: Record<PropKind, string> = { rock: "Rock", pillar: "Ice Pillar", crates: "Crates", barrel: "Powder Barrel", totem: "Ward Totem" };
export const TILE_NAMES: Record<TileKind, string> = {
  high: "High ground",
  cover: "Cover",
  ice: "Ice",
  mud: "Mud",
  thorns: "Thorns",
  fire: "Fire",
  spring: "Healing spring",
  crystal: "Mana crystal",
  water: "Water",
  void: "Chasm"
};
export const TILE_HELP: Record<TileKind, string> = {
  high: "Raised ground (one level).",
  cover: "Ranged and magic attacks against a unit here deal 30% less.",
  ice: "Costs 2 move.",
  mud: "Costs 2 move.",
  thorns: "Entering hurts (6% max HP).",
  fire: "Entering or starting a turn here burns.",
  spring: "Heals 10% max HP at the start of each turn here.",
  crystal: "Step on it: restores 30% max MP and +1 AP next turn. Used up.",
  water: "Can't be entered (flyers pass over).",
  void: "Off the board."
};
/** Rules of raised ground, shown when hovering a hill hex. */
export const HEIGHT_HELP =
  "Climbing a level costs 2 extra movement; a 2-level cliff can't be climbed (flyers can) or struck across in melee. Two-hex creatures need two level hexes. " +
  "Striking down: +15% (1 level) / +25% (2); striking up: -10% / -20% and a little less accurate. " +
  "Ranged reach +1 per level. Hills hide what is behind them. Knocked or dropped off a ledge: 10% max HP per level.";

/** Rock crags (height CRAG_HEIGHT in BattleState.heights), shown when hovering one. */
export const CRAG_NAME = "Crag";
export const CRAG_HELP =
  "A sheer rock column: nobody can stand on it or climb it (flyers pass over but can't land). " +
  "Blocks line of sight, can't be reshaped, and anyone knocked into it is slammed.";

export const BOARD_SIZE_NAMES: Record<BoardSize, string> = { small: "Small field (11x7)", medium: "Medium field (15x9)", large: "Large field (19x11)" };

export const POINT_NAMES: Record<BattlePoint["kind"], string> = { shrine: "Healing Shrine", banner: "War Banner", cache: "Supply Cache" };
export const POINT_HELP: Record<BattlePoint["kind"], string> = {
  shrine: "End a turn on it to capture it. Its side heals 5% max HP at the start of each of their turns.",
  banner: "End a turn on it to capture it. Its side gets +10% ATK and MAG.",
  cache: "The first of your party to step on it opens it: bonus loot paid with the victory rewards. A monster stepping on it smashes it."
};

/** What a supply cache may hold besides gold: biome finds (consumables by level are added in the engine). */
export const CACHE_LOOT: Record<Biome, ItemId[]> = {
  meadow: ["medicinalHerb", "wildHerb"],
  frost: ["iceCrystal", "glowcap"],
  village: ["ironOre", "leather"],
  cellar: ["ironOre", "rope"],
  nave: ["iceCrystal", "lightCrystal"],
  cloister: ["lightCrystal", "silverOre"],
  ember: ["fireCrystal", "goldOre"],
  rift: ["darkCrystal", "manaCrystal"]
};
/** Consumables a supply cache may hold, by the battle's level (index 0: below 8, 1: 8-15, 2: 16+). */
export const CACHE_SUPPLIES: ItemId[][] = [
  ["potion", "potion", "antidote", "ether", "fireBomb", "frostBomb"],
  ["hiPotion", "ether", "potion", "fireBomb", "frostBomb", "thunderBomb", "phoenixFeather"],
  ["hiPotion", "hiPotion", "ether", "phoenixFeather", "elixir", "thunderBomb"]
];

export const WEATHER_TEXT: Record<BattleWeather, string> = {
  clear: "Clear",
  snow: "Snow: ice +20%, fire -15%",
  blizzard: "Blizzard: ice +30%, fire -25%, ranged reach -1",
  rain: "Rain: fire -25%, wind +15%, ice +10%",
  storm: "Storm: wind +30%, ranged reach -1",
  heat: "Heat: fire +25%, ice -25%",
  gloom: "Gloom: dark +25%, light +10%"
};
