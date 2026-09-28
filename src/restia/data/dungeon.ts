import type { GuildRank, ItemId, MonsterId } from "../engine/types";

export type EncounterEntry = { species: MonsterId; weight: number; minFloor?: number; minRank?: GuildRank };

export type ThemeDef = {
  id: string;
  name: string;
  floors: [number, number];
  /** Battlefield id (data/battlefields.ts). */
  backdrop: string;
  /** CSS filter applied to the dungeon tiles for this theme. */
  tint: string;
  music: string;
  encounters: EncounterEntry[];
  boss: { floor: number; species: MonsterId; minions: MonsterId[]; scene: string; winScene: string; flag: string };
  chest: { item: ItemId; n: number; weight: number }[];
  ore: { item: ItemId; weight: number }[];
  herb: { item: ItemId; weight: number }[];
};

export const THEMES: ThemeDef[] = [
  {
    id: "catacombs",
    name: "Old Temple Ruins: the Frozen Nave",
    floors: [1, 5],
    backdrop: "nave",
    tint: "hue-rotate(185deg) saturate(0.55) brightness(1.08)",
    music: "snow",
    encounters: [
      { species: "skeleton", weight: 3 },
      { species: "zombie", weight: 3 },
      { species: "kobold", weight: 3 },
      { species: "troglodyte", weight: 2, minFloor: 2 },
      { species: "wight", weight: 1, minFloor: 3 },
      { species: "minotaurGuard", weight: 1, minFloor: 4 }
    ],
    boss: { floor: 5, species: "minotaurLord", minions: ["minotaurGuard", "kobold"], scene: "floor5Boss", winScene: "floor5Win", flag: "boss5" },
    chest: [
      { item: "potion", n: 2, weight: 4 },
      { item: "antidote", n: 2, weight: 2 },
      { item: "ether", n: 1, weight: 2 },
      { item: "ironOre", n: 3, weight: 3 },
      { item: "silverOre", n: 1, weight: 1 },
      { item: "manaCrystal", n: 1, weight: 1 },
      { item: "returnScroll", n: 1, weight: 1 }
    ],
    ore: [
      { item: "stone", weight: 3 },
      { item: "ironOre", weight: 4 },
      { item: "clay", weight: 1 },
      { item: "silverOre", weight: 1 },
      { item: "earthCrystal", weight: 1 }
    ],
    herb: [
      { item: "glowcap", weight: 2 },
      { item: "medicinalHerb", weight: 3 },
      { item: "mushroom", weight: 2 }
    ]
  },
  {
    id: "flooded",
    name: "Old Temple Ruins: the Drowned Cloister",
    floors: [6, 10],
    backdrop: "cloister",
    tint: "hue-rotate(160deg) saturate(0.85)",
    music: "water",
    encounters: [
      { species: "lizardman", weight: 3 },
      { species: "lizardWarrior", weight: 3 },
      { species: "serpentFly", weight: 2 },
      { species: "basilisk", weight: 2 },
      { species: "nix", weight: 2 },
      { species: "medusa", weight: 1, minFloor: 8 },
      { species: "waterElemental", weight: 1, minFloor: 8 }
    ],
    boss: { floor: 10, species: "goblinKing", minions: ["hobgoblin", "hobgoblin", "wolfRider"], scene: "floor10Boss", winScene: "floor10Win", flag: "boss10" },
    chest: [
      { item: "hiPotion", n: 1, weight: 3 },
      { item: "ether", n: 2, weight: 2 },
      { item: "silverOre", n: 2, weight: 3 },
      { item: "iceCrystal", n: 1, weight: 2 },
      { item: "manaCrystal", n: 1, weight: 2 },
      { item: "lightCrystal", n: 1, weight: 1 },
      { item: "phoenixFeather", n: 1, weight: 1 }
    ],
    ore: [
      { item: "ironOre", weight: 3 },
      { item: "silverOre", weight: 3 },
      { item: "iceCrystal", weight: 1 },
      { item: "manaCrystal", weight: 1 }
    ],
    herb: [
      { item: "glowcap", weight: 3 },
      { item: "medicinalHerb", weight: 2 }
    ]
  },
  {
    id: "ember",
    name: "Old Temple Ruins: the Ember Vaults",
    floors: [11, 15],
    backdrop: "ember",
    tint: "sepia(0.5) hue-rotate(-25deg) saturate(1.8) brightness(0.9)",
    music: "stronghold",
    encounters: [
      { species: "imp", weight: 3 },
      { species: "hellHound", weight: 3 },
      { species: "magog", weight: 2 },
      { species: "fireElemental", weight: 2 },
      { species: "demon", weight: 2 },
      { species: "efreet", weight: 1, minFloor: 13 },
      { species: "lich", weight: 1, minFloor: 14 }
    ],
    boss: { floor: 15, species: "vesper", minions: ["lich", "lich"], scene: "floor15Boss", winScene: "floor15Win", flag: "boss15" },
    chest: [
      { item: "hiPotion", n: 2, weight: 3 },
      { item: "elixir", n: 1, weight: 1 },
      { item: "goldOre", n: 2, weight: 2 },
      { item: "fireCrystal", n: 2, weight: 2 },
      { item: "mythrilOre", n: 1, weight: 1 },
      { item: "lightCrystal", n: 1, weight: 2 },
      { item: "phoenixFeather", n: 1, weight: 1 }
    ],
    ore: [
      { item: "silverOre", weight: 3 },
      { item: "goldOre", weight: 2 },
      { item: "fireCrystal", weight: 2 },
      { item: "mythrilOre", weight: 1 },
      { item: "lightCrystal", weight: 1 }
    ],
    herb: [
      { item: "glowcap", weight: 2 },
      { item: "medicinalHerb", weight: 2 }
    ]
  },
  {
    id: "abyss",
    name: "Old Temple Ruins: the Rift",
    floors: [16, 999],
    backdrop: "rift",
    tint: "grayscale(0.35) hue-rotate(230deg) brightness(0.85)",
    music: "necro-town",
    encounters: [
      { species: "blackKnight", weight: 3 },
      { species: "vampireLord", weight: 2 },
      { species: "beholder", weight: 2 },
      { species: "demon", weight: 2 },
      { species: "lich", weight: 2 },
      { species: "boneDragon", weight: 1, minFloor: 18 },
      { species: "greenDragon", weight: 1, minFloor: 19 }
    ],
    boss: { floor: 20, species: "erebosAvatar", minions: ["blackKnight", "vampireLord"], scene: "floor20Boss", winScene: "ending", flag: "boss20" },
    chest: [
      { item: "elixir", n: 1, weight: 2 },
      { item: "hiPotion", n: 2, weight: 3 },
      { item: "mythrilOre", n: 2, weight: 2 },
      { item: "lightCrystal", n: 1, weight: 2 },
      { item: "darkCrystal", n: 1, weight: 2 },
      { item: "dragonScale", n: 1, weight: 1 }
    ],
    ore: [
      { item: "goldOre", weight: 3 },
      { item: "mythrilOre", weight: 2 },
      { item: "lightCrystal", weight: 1 },
      { item: "darkCrystal", weight: 1 }
    ],
    herb: [
      { item: "glowcap", weight: 2 },
      { item: "medicinalHerb", weight: 1 }
    ]
  }
];

export function themeForFloor(floor: number): ThemeDef {
  return THEMES.find((theme) => floor >= theme.floors[0] && floor <= theme.floors[1]) ?? THEMES[THEMES.length - 1]!;
}

export function floorLevel(floor: number): number {
  return floor + 2;
}

/** Floors you may start from once reached (after each guardian). */
export const CHECKPOINTS = [1, 6, 11, 16];

export const FOREST_ENCOUNTERS: EncounterEntry[] = [
  { species: "frostWolf", weight: 4 },
  { species: "frostRat", weight: 2 },
  { species: "goblin", weight: 3 },
  { species: "boar", weight: 3 },
  { species: "sprite", weight: 3 },
  { species: "ram", weight: 2 },
  { species: "hobgoblin", weight: 1 },
  { species: "harpy", weight: 2, minRank: "E" },
  { species: "wolfRider", weight: 2, minRank: "E" },
  { species: "argali", weight: 2, minRank: "E" },
  { species: "dendroid", weight: 1, minRank: "E" },
  { species: "leprechaun", weight: 1, minRank: "E" },
  { species: "centaur", weight: 2, minRank: "D" }
];

export type EventEncounter = {
  id: string;
  /** Battlefield id (data/battlefields.ts). */
  backdrop: string;
  /** Board layout (data/battlefields.ts LAYOUTS); default: one the biome allows. */
  layout?: string;
  enemies: { species: MonsterId; level: number }[];
  /** Dain spar: a special rival unit instead of monsters. */
  rival?: boolean;
  soft: boolean;
  canFlee: boolean;
  winScene?: string;
  loseScene?: string;
  winFlag?: string;
};

export const EVENT_ENCOUNTERS: Record<string, EventEncounter> = {
  // --- Story battles ---
  eosTrial: {
    id: "eosTrial",
    backdrop: "eos",
    layout: "open",
    enemies: [
      { species: "eosGoblin", level: 1 },
      { species: "eosGoblin", level: 1 }
    ],
    soft: true,
    canFlee: false,
    winScene: "p6EosWin",
    loseScene: "p6EosLose"
  },
  havenWolf: {
    id: "havenWolf",
    backdrop: "frostwood",
    layout: "open",
    enemies: [{ species: "frostWolf", level: 1 }],
    soft: true,
    canFlee: false,
    winScene: "h1WolfWin",
    loseScene: "h1WolfLose"
  },
  woodshedRats: {
    id: "woodshedRats",
    backdrop: "cellar",
    layout: "barrels",
    enemies: [
      { species: "frostRat", level: 2 },
      { species: "frostRat", level: 2 },
      { species: "frostRat", level: 3 }
    ],
    soft: true,
    canFlee: false,
    winScene: "logWin",
    loseScene: "logLose"
  },
  catWolves: {
    id: "catWolves",
    backdrop: "frostwood",
    layout: "hills",
    enemies: [
      { species: "frostWolf", level: 3 },
      { species: "frostWolf", level: 3 }
    ],
    soft: true,
    canFlee: false,
    winScene: "catWin",
    loseScene: "catLose"
  },
  doorway: {
    id: "doorway",
    backdrop: "village",
    layout: "open",
    enemies: [
      { species: "buyersThug", level: 4 },
      { species: "buyersThug", level: 3 }
    ],
    soft: true,
    canFlee: false,
    winScene: "dinnerDoorWin",
    loseScene: "dinnerDoorLose"
  },
  // --- Guild exams ---
  examF: {
    id: "examF",
    backdrop: "village",
    layout: "plateau",
    enemies: [
      { species: "goblinChief", level: 4 },
      { species: "goblin", level: 3 },
      { species: "goblin", level: 3 }
    ],
    soft: true,
    canFlee: false,
    winScene: "examFWin"
  },
  examE: {
    id: "examE",
    backdrop: "village",
    layout: "ring",
    enemies: [],
    rival: true,
    soft: true,
    canFlee: false,
    winScene: "examEWin",
    loseScene: "examELose"
  }
};
