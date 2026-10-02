/**
 * Order & Chaos Magic Garden: plots where gem-bearing plants grow in real
 * time (wall-clock, also while the game is closed). Every plant grows through
 * three stages; watering a stage makes it grow twice as fast until the next
 * stage begins, and a plant watered at every stage ripens lush (more Gems).
 * Gems pay, with Ore, for forging hero ranks.
 *
 * Pure functions of the stored plot and a timestamp (ms), so growth is the
 * same whenever it is looked at.
 */

import { worldCleared } from "./campaign";

export type OcSeedId = "clover" | "fern" | "rose" | "starfruit";

export type OcSeed = {
  id: OcSeedId;
  name: string;
  /** Growth needed to ripen, in ms at the dry pace (watering halves a stage's time). */
  growMs: number;
  /** Gems at harvest; `lush` when every stage was watered. */
  gems: number;
  lush: number;
  /** World to clear before the seed can be sown (0: from the start). */
  world: number;
  blurb: string;
};

const MIN = 60_000;

export const OC_SEEDS: Readonly<Record<OcSeedId, OcSeed>> = {
  clover: { id: "clover", name: "Gold Clover", growMs: 4 * MIN, gems: 1, lush: 2, world: 0, blurb: "Quick to ripen: tend it while you plan your next battle." },
  fern: { id: "fern", name: "Crystal Fern", growMs: 20 * MIN, gems: 4, lush: 6, world: 2, blurb: "Ripens over a short break." },
  rose: { id: "rose", name: "Gem Rose", growMs: 60 * MIN, gems: 10, lush: 15, world: 4, blurb: "Takes an hour; worth the wait." },
  starfruit: { id: "starfruit", name: "Starfruit Tree", growMs: 240 * MIN, gems: 30, lush: 45, world: 6, blurb: "Plant it before you leave for the day." }
};

export const OC_SEED_ORDER: readonly OcSeedId[] = ["clover", "fern", "rose", "starfruit"];

export const OC_GARDEN_STAGES = 3;
/**
 * The garden's magic runs dry after this many Gems in a (UTC) day: ripe
 * plants then wait in their plots until tomorrow. Gems pace the Forge, so
 * tending the garden all day can't buy every rank at once.
 */
export const OC_GARDEN_DAILY_GEMS = 40;
/** Watered growth runs this much faster. */
const WET_PACE = 2;

/**
 * A sown plot. `grown`: growth credited (ms at the dry pace) as of `at`;
 * `wet`: the current stage has been watered; `watered`: how many stages were.
 */
export type OcPlant = { seed: OcSeedId; grown: number; at: number; wet: boolean; watered: number };
export type OcPlot = OcPlant | null;

/** Plots open: three once the garden opens, one more after worlds 3, 5 and 7. */
export function gardenPlots(cleared: readonly string[]): number {
  if (!gardenOpen(cleared)) return 0;
  return 3 + [3, 5, 7].filter((world) => worldCleared(world, cleared)).length;
}

/** The garden opens with the first world's third battle. */
export function gardenOpen(cleared: readonly string[]): boolean {
  return cleared.includes("w1-3");
}

export function seedOpen(seed: OcSeed, cleared: readonly string[]): boolean {
  return seed.world === 0 || worldCleared(seed.world, cleared);
}

const stageLength = (seed: OcSeed) => seed.growMs / OC_GARDEN_STAGES;

/** The stage (0..2) a growth amount is in; OC_GARDEN_STAGES once ripe. */
export function stageOf(seed: OcSeed, grown: number): number {
  if (grown >= seed.growMs) return OC_GARDEN_STAGES;
  return Math.min(OC_GARDEN_STAGES - 1, Math.floor(grown / stageLength(seed)));
}

/**
 * The plant as of `now`: growth credited for the time since `at` (twice as
 * fast while its stage is watered; a new stage starts dry). A clock that went
 * backwards credits nothing.
 */
export function advancePlant(plant: OcPlant, now: number): OcPlant {
  const seed = OC_SEEDS[plant.seed];
  if (!seed || now <= plant.at) return plant;
  let grown = Math.min(seed.growMs, Math.max(0, plant.grown));
  let wet = plant.wet;
  let time = now - plant.at;
  while (time > 0 && grown < seed.growMs) {
    const stage = stageOf(seed, grown);
    const stageEnd = Math.min(seed.growMs, (stage + 1) * stageLength(seed));
    const pace = wet ? WET_PACE : 1;
    const need = (stageEnd - grown) / pace;
    if (time < need) {
      grown += time * pace;
      time = 0;
    } else {
      grown = stageEnd;
      time -= need;
      wet = false;
    }
  }
  return { ...plant, grown, at: now, wet: grown >= seed.growMs ? false : wet };
}

export function isRipe(plant: OcPlant, now: number): boolean {
  const seed = OC_SEEDS[plant.seed];
  return !!seed && advancePlant(plant, now).grown >= seed.growMs;
}

/** A plant whose current stage still wants water. */
export function isThirsty(plant: OcPlant, now: number): boolean {
  const live = advancePlant(plant, now);
  const seed = OC_SEEDS[plant.seed];
  return !!seed && live.grown < seed.growMs && !live.wet;
}

/** Ms until ripe from `now`, at the plant's present watering. */
export function msToRipe(plant: OcPlant, now: number): number {
  const seed = OC_SEEDS[plant.seed];
  if (!seed) return 0;
  const live = advancePlant(plant, now);
  if (live.grown >= seed.growMs) return 0;
  const stageEnd = Math.min(seed.growMs, (stageOf(seed, live.grown) + 1) * stageLength(seed));
  return (stageEnd - live.grown) / (live.wet ? WET_PACE : 1) + (seed.growMs - stageEnd);
}

export function sow(seed: OcSeedId, now: number): OcPlant {
  return { seed, grown: 0, at: now, wet: false, watered: 0 };
}

/** Water the current stage (no change when it is already watered or the plant is ripe). */
export function water(plant: OcPlant, now: number): OcPlant {
  const live = advancePlant(plant, now);
  const seed = OC_SEEDS[plant.seed];
  if (!seed || live.wet || live.grown >= seed.growMs) return live;
  return { ...live, wet: true, watered: Math.min(OC_GARDEN_STAGES, live.watered + 1) };
}

/** Gems a ripe plant gives (lush when every stage was watered); 0 while it is still growing. */
export function harvestGems(plant: OcPlant, now: number): number {
  const seed = OC_SEEDS[plant.seed];
  if (!seed || !isRipe(plant, now)) return 0;
  return plant.watered >= OC_GARDEN_STAGES ? seed.lush : seed.gems;
}

/** A stored plot, checked (anything malformed is an empty plot). */
export function parsePlot(value: unknown): OcPlot {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<OcPlant>;
  if (typeof p.seed !== "string" || !OC_SEEDS[p.seed as OcSeedId]) return null;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (!finite(p.grown) || !finite(p.at)) return null;
  return {
    seed: p.seed as OcSeedId,
    grown: Math.max(0, Math.min(OC_SEEDS[p.seed as OcSeedId].growMs, p.grown)),
    at: p.at,
    wet: p.wet === true,
    watered: finite(p.watered) ? Math.max(0, Math.min(OC_GARDEN_STAGES, Math.floor(p.watered))) : 0
  };
}
