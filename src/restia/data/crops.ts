import type { BuildingId, Condition, CropDef, Debris, Season } from "../engine/types";

/** One single-harvest crop per season can fuse into a giant crop (engine/farm.ts). */
const GIANT_CROPS = new Set(["potato", "melon", "pumpkin", "snowRadish"]);

const building = (id: BuildingId, level: number): Condition => ({ kind: "building", id, level });
const all = (...of: Condition[]): Condition => ({ kind: "all", of });

/** Optional per-crop extras: a produce item other than the crop id, and when its seeds go on sale. */
type Extra = { produce?: string; unlock?: Condition };

/**
 * Crops. `sprite` indexes the farm sheets (row-major 6x6; 0-35 = sheet 1,
 * 36-71 = sheet 2): each crop has a crop-specific "growing" and "ripe" cell;
 * the first half of growth uses the shared sprout / young-plant cells (FARM_SPRITE).
 * `unlock` gates the seed shops (data/shops.ts) and guild delivery requests;
 * some seeds also turn up earlier in dungeon chests, forage or monster drops.
 */
export const CROPS: Record<string, CropDef> = Object.fromEntries(
  (
    [
      ["turnip", "Turnip", ["spring"], 4, undefined, [1, 1], 4, 0],
      ["potato", "Potato", ["spring"], 6, undefined, [1, 2], 6, 2],
      ["strawberry", "Strawberry", ["spring"], 8, 3, [1, 2], 5, 4],
      ["tomato", "Tomato", ["summer"], 8, 3, [1, 2], 5, 6],
      ["corn", "Corn", ["summer", "autumn"], 10, 4, [1, 1], 6, 8],
      ["melon", "Melon", ["summer"], 11, undefined, [1, 1], 10, 10],
      ["pumpkin", "Pumpkin", ["autumn"], 12, undefined, [1, 1], 12, 12],
      ["eggplant", "Eggplant", ["autumn"], 7, 3, [1, 2], 5, 14],
      ["sweetPotato", "Sweet Potato", ["autumn"], 8, undefined, [1, 2], 7, 16],
      ["snowRadish", "Snow Radish", ["winter"], 7, undefined, [1, 2], 7, 18],
      ["manaBlossom", "Mana Blossom", ["spring", "summer", "autumn"], 10, undefined, [1, 1], 10, 20, { unlock: building("store", 2) }],
      ["moonberry", "Moonberry", ["autumn", "winter"], 12, 4, [1, 2], 9, 22, { unlock: building("store", 2) }],
      // Second sheet (hv14).
      ["cabbage", "Cabbage", ["spring"], 9, undefined, [1, 1], 8, 36],
      ["pinkCat", "Pink Cat", ["spring"], 6, undefined, [1, 1], 5, 38],
      ["toyherb", "Toyherb", ["spring", "summer"], 4, undefined, [1, 2], 3, 40],
      ["windbell", "Windbell", ["spring"], 12, undefined, [1, 2], 10, 42, { produce: "windCrystal", unlock: { kind: "rank", rank: "C" } }],
      ["goldenTurnip", "Golden Turnip", ["spring"], 8, undefined, [1, 1], 20, 44, { unlock: all(building("store", 3), { kind: "skill", skill: "farming", level: 7 }) }],
      ["onion", "Onion", ["summer"], 7, undefined, [1, 2], 5, 46],
      ["greenPepper", "Green Pepper", ["summer"], 7, 3, [1, 2], 4, 48],
      ["pineapple", "Pineapple", ["summer"], 15, 7, [1, 1], 12, 50, { unlock: building("store", 2) }],
      ["lampGrass", "Lamp Grass", ["summer"], 8, undefined, [1, 1], 7, 52, { unlock: building("atelier", 2) }],
      ["hotHotFruit", "Hot-Hot Fruit", ["summer"], 9, 4, [1, 2], 8, 54, { unlock: { kind: "floor", n: 11 } }],
      ["emberbloom", "Emberbloom", ["summer"], 12, undefined, [1, 2], 10, 56, { produce: "fireCrystal", unlock: all(building("atelier", 2), { kind: "floor", n: 15 }) }],
      ["carrot", "Carrot", ["autumn"], 7, undefined, [1, 2], 5, 58],
      ["spinach", "Spinach", ["autumn"], 5, undefined, [1, 1], 4, 60],
      ["ironleaf", "Ironleaf", ["autumn"], 6, 3, [2, 3], 5, 62, { unlock: building("smithy", 2) }],
      ["stonepetal", "Stonepetal", ["autumn"], 12, undefined, [1, 2], 10, 64, { produce: "earthCrystal", unlock: all(building("atelier", 2), { kind: "floor", n: 5 }) }],
      ["leek", "Leek", ["winter"], 8, undefined, [1, 2], 6, 66],
      ["noelGrass", "Noel Grass", ["winter"], 7, undefined, [1, 1], 6, 68, { unlock: building("shrine", 1) }],
      ["frostglass", "Frostglass Lily", ["winter"], 12, undefined, [1, 2], 10, 70, { produce: "iceCrystal", unlock: all(building("atelier", 2), { kind: "floor", n: 10 }) }]
    ] as [string, string, Season[], number, number | undefined, [number, number], number, number, Extra?][]
  ).map(([id, name, seasons, days, regrow, yieldRange, xp, cell, extra]) => [
    id,
    {
      id,
      name,
      seed: `seed-${id}`,
      produce: extra?.produce ?? id,
      seasons,
      days,
      ...(regrow ? { regrow } : {}),
      ...(GIANT_CROPS.has(id) ? { giant: true } : {}),
      ...(extra?.unlock ? { unlock: extra.unlock } : {}),
      yield: yieldRange,
      xp,
      sprite: { growing: cell, ripe: cell + 1 }
    } satisfies CropDef
  ])
);

export const FARM_SPRITE = {
  sprout: 24,
  young: 25,
  tilled: 26,
  watered: 27,
  debris: { weed: 28, stone: 29, stump: 30, branch: 31, boulder: 32, withered: 34 } satisfies Record<Debris, number>
} as const;

/** 0 sprout, 1 young, 2 growing, 3 ripe. */
export function cropStage(def: CropDef, growth: number): 0 | 1 | 2 | 3 {
  if (growth >= def.days) return 3;
  const ratio = growth / def.days;
  if (ratio < 0.25) return 0;
  if (ratio < 0.5) return 1;
  return 2;
}

export function cropDef(id: string): CropDef {
  const def = CROPS[id];
  if (!def) throw new Error(`Unknown Restia crop ${id}`);
  return def;
}
