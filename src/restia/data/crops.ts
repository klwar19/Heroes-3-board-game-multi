import type { CropDef, Debris, Season } from "../engine/types";

/**
 * Crops. `sprite` indexes the 6x6 farm sheet (row-major): each crop has a
 * crop-specific "growing" and "ripe" cell; the first half of growth uses the
 * shared sprout / young-plant cells (FARM_SPRITE).
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
      ["manaBlossom", "Mana Blossom", ["spring", "summer", "autumn"], 10, undefined, [1, 1], 10, 20],
      ["moonberry", "Moonberry", ["autumn", "winter"], 12, 4, [1, 2], 9, 22]
    ] as [string, string, Season[], number, number | undefined, [number, number], number, number][]
  ).map(([id, name, seasons, days, regrow, yieldRange, xp, cell]) => [
    id,
    {
      id,
      name,
      seed: `seed-${id}`,
      produce: id,
      seasons,
      days,
      ...(regrow ? { regrow } : {}),
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
