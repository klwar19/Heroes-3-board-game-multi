import type { BattleWeather, PropKind, TileKind } from "../engine/types";

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
  extras: ("O" | "C" | "Z" | "G" | "B" | "R")[];
  layouts: string[];
};

export const PALETTES: Record<Biome, BiomePalette> = {
  meadow: { obstacle: ["rock"], hazard: ["thorns", "mud"], goodie: ["spring", "crystal"], extras: ["O", "C", "Z", "G"], layouts: ["open", "hills", "plateau", "ring", "hazards"] },
  frost: { obstacle: ["pillar", "rock"], hazard: ["ice", "thorns"], goodie: ["crystal", "spring"], extras: ["O", "C", "Z", "G"], layouts: ["open", "hills", "plateau", "pass", "ring", "hazards"] },
  village: { obstacle: ["rock", "crates"], hazard: ["ice", "mud"], goodie: ["spring"], extras: ["O", "C", "B", "R"], layouts: ["open", "barrels", "ring", "hills"] },
  cellar: { obstacle: ["crates"], hazard: ["mud"], goodie: ["crystal"], extras: ["R", "B", "Z"], layouts: ["barrels", "open"] },
  nave: { obstacle: ["rock", "pillar"], hazard: ["ice"], goodie: ["crystal", "spring"], extras: ["O", "C", "Z", "G"], layouts: ["ring", "pass", "plateau", "open", "hazards"] },
  cloister: { obstacle: ["rock"], hazard: ["mud", "ice"], goodie: ["spring"], extras: ["O", "Z", "G"], layouts: ["river", "ring", "open", "hazards"] },
  ember: { obstacle: ["rock"], hazard: ["fire"], goodie: ["crystal"], extras: ["O", "Z", "B"], layouts: ["barrels", "hazards", "plateau", "pass"] },
  rift: { obstacle: ["rock", "totem"], hazard: ["thorns", "fire"], goodie: ["crystal"], extras: ["O", "G", "Z"], layouts: ["islands", "ring", "plateau"] }
};

/**
 * Board layouts: 7 rows of the 7 middle columns (2..8); columns 0-1 and 9-10
 * stay clear for deployment. Symbols: '.' ground, 'O' obstacle, 'C' cover,
 * 'H' high ground, 'Z' hazard, 'G' goodie, 'W' water, 'X' void (off the board),
 * 'B' barrel, 'R' crates, 'T' enemy ward totem, '?' maybe something.
 */
export const LAYOUTS: Record<string, string[]> = {
  open: ["?..?..?", ".......", "..?.?..", ".?...?.", "..?.?..", ".......", "?..?..?"],
  hills: [".......", ".H...H.", ".HC.CH.", "...G...", ".HC.CH.", ".H...H.", "......."],
  plateau: ["..O.O..", ".C...C.", "..HHH..", ".?HHH?.", "..HHH..", ".C...C.", "..O.O.."],
  ring: ["...?...", "..C.C..", ".H.O.H.", "..OOO..", ".H.O.H.", "..C.C..", "...?..."],
  pass: ["XXX.XXX", ".O...O.", ".......", "..Z.Z..", ".......", ".O...O.", "XXX.XXX"],
  river: ["...W...", ".......", ".C.W.C.", "..?W?..", ".C.W.C.", ".......", "...W..."],
  barrels: ["..R.R..", ".B...B.", "..R?R..", "...B...", "..R?R..", ".B...B.", "..R.R.."],
  hazards: ["..Z.Z..", ".Z...Z.", "Z..G..Z", "..Z.Z..", "Z..O..Z", ".Z...Z.", "..Z.Z.."],
  islands: ["X..X..X", ".X...X.", "..X.X..", "?..H..?", "..X.X..", ".X...X.", "X..X..X"],
  /** Boss arenas: a clear centre with a ward totem on the boss side. */
  arena: ["..O...O", ".......", "..H...T", ".......", "..H...T", ".......", "..O...O"]
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
  high: "Costs 2 move to climb. +15% damage against lower foes; ranged attacks reach 1 further.",
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
export const WEATHER_TEXT: Record<BattleWeather, string> = {
  clear: "Clear",
  snow: "Snow: ice +20%, fire -15%",
  blizzard: "Blizzard: ice +30%, fire -25%, ranged reach -1",
  rain: "Rain: fire -25%, wind +15%, ice +10%",
  storm: "Storm: wind +30%, ranged reach -1",
  heat: "Heat: fire +25%, ice -25%",
  gloom: "Gloom: dark +25%, light +10%"
};
