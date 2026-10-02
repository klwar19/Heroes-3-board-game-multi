/**
 * The Forge mini-game (Order & Chaos): forging a hero's next rank is real
 * smithing in three steps.
 *
 * 1. Heat — pump the bellows (hold) to keep the bar's heat inside the glowing
 *    band until it has soaked long enough; past white-hot it scorches.
 * 2. Hammer — a marker swings across the anvil; strike while it is over the
 *    bright spot. A perfect strike shapes the blade twice as far as a good one;
 *    a miss shapes nothing. The spot moves after every strike.
 * 3. Quench — the blade cools; plunge it while it glows in the quench band.
 *
 * Forging always finishes (no failure, no lost resources); how well it went
 * sets the quality, and a Fine or Masterwork result hands part of the Ore back.
 * The blade is paid for the moment it is finished (lib/order-chaos-forge.ts
 * temperBlade): only an unfinished one can be left with nothing spent.
 * Higher ranks forge harder: a narrower heat band and a faster hammer marker.
 *
 * Pure: every step takes the state and returns the next one.
 */

export type ForgePhase = "heat" | "hammer" | "quench" | "done";
export type ForgeGrade = "perfect" | "good" | "miss";

export type ForgeGame = {
  phase: ForgePhase;
  /** The rank being forged (2..5): sets the difficulty. */
  rank: number;
  rng: number;
  // Heat
  heat: number;
  soak: number;
  scorch: number;
  // Hammer
  marker: number;
  dir: 1 | -1;
  spot: number;
  shaped: number;
  strikes: ForgeGrade[];
  /** Seconds until the hammer can fall again. */
  recoil: number;
  // Quench
  temp: number;
  quench: ForgeGrade | null;
  /** The last strike or plunge, for the screen to flash (`age` in seconds). */
  flash: { grade: ForgeGrade; age: number } | null;
};

export const FORGE = {
  heatRise: 0.62,
  heatFall: 0.42,
  heatMid: 0.72,
  soakNeed: 2.2,
  scorchAt: 0.95,
  scorchPenalty: 40,
  shapeNeed: 8,
  perfectBand: 0.045,
  goodBand: 0.12,
  recoil: 0.25,
  coolRate: 0.42,
  quenchMid: 0.45,
  quenchPerfect: 0.05,
  quenchGood: 0.13
} as const;

/** The glowing band the heat must stay in (narrower at higher ranks). */
export function heatBand(rank: number): { lo: number; hi: number } {
  const half = (0.22 - 0.02 * (Math.max(2, Math.min(5, rank)) - 2)) / 2;
  return { lo: FORGE.heatMid - half, hi: FORGE.heatMid + half };
}

/** How far the hammer marker travels a second (faster at higher ranks). */
export function markerSpeed(rank: number): number {
  return 1.5 + 0.22 * (Math.max(2, Math.min(5, rank)) - 2);
}

/** mulberry32: the next random number in [0, 1) and the next seed. */
function next(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) >>> 0;
  const out = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, out];
}

function newSpot(rng: number): [number, number] {
  const [r, seed] = next(rng);
  return [0.2 + r * 0.6, seed];
}

export function newForgeGame(rank: number, seed: number): ForgeGame {
  const [spot, rng] = newSpot(seed >>> 0);
  return {
    phase: "heat", rank, rng,
    heat: 0, soak: 0, scorch: 0,
    marker: 0, dir: 1, spot, shaped: 0, strikes: [], recoil: 0,
    temp: 1, quench: null, flash: null
  };
}

/** Advance the forge by `dt` seconds; `pumping`: the bellows are held (the heat step). */
export function forgeStep(g: ForgeGame, dt: number, pumping: boolean): ForgeGame {
  if (g.phase === "done" || !(dt > 0)) return g;
  const step = Math.min(dt, 0.1);
  const flash = g.flash ? (g.flash.age + step > 0.6 ? null : { ...g.flash, age: g.flash.age + step }) : null;
  if (g.phase === "heat") {
    const heat = Math.max(0, Math.min(1, g.heat + (pumping ? FORGE.heatRise : -FORGE.heatFall) * step));
    const band = heatBand(g.rank);
    const soak = g.soak + (heat >= band.lo && heat <= band.hi ? step : 0);
    const scorch = g.scorch + (heat > FORGE.scorchAt ? step : 0);
    if (soak >= FORGE.soakNeed) return { ...g, heat, soak: FORGE.soakNeed, scorch, phase: "hammer", flash };
    return { ...g, heat, soak, scorch, flash };
  }
  if (g.phase === "hammer") {
    let marker = g.marker + g.dir * markerSpeed(g.rank) * step;
    let dir = g.dir;
    if (marker >= 1) { marker = 2 - marker; dir = -1; }
    if (marker <= 0) { marker = -marker; dir = 1; }
    return { ...g, marker: Math.max(0, Math.min(1, marker)), dir, recoil: Math.max(0, g.recoil - step), flash };
  }
  // Quench: the blade cools; left too long, it goes in cold.
  const temp = g.temp - FORGE.coolRate * step;
  if (temp <= 0) return { ...g, temp: 0, quench: "miss", phase: "done", flash: { grade: "miss", age: 0 } };
  return { ...g, temp, flash };
}

/** Strike the hammer (the hammer step) or plunge the blade (the quench step). */
export function forgeAct(g: ForgeGame): ForgeGame {
  if (g.phase === "hammer") {
    if (g.recoil > 0) return g;
    const off = Math.abs(g.marker - g.spot);
    const grade: ForgeGrade = off <= FORGE.perfectBand ? "perfect" : off <= FORGE.goodBand ? "good" : "miss";
    const shaped = g.shaped + (grade === "perfect" ? 2 : grade === "good" ? 1 : 0);
    const [spot, rng] = newSpot(g.rng);
    const done = shaped >= FORGE.shapeNeed;
    return {
      ...g, shaped: Math.min(FORGE.shapeNeed, shaped), strikes: [...g.strikes, grade], recoil: FORGE.recoil, spot, rng,
      phase: done ? "quench" : "hammer", flash: { grade, age: 0 }
    };
  }
  if (g.phase === "quench") {
    const off = Math.abs(g.temp - FORGE.quenchMid);
    const grade: ForgeGrade = off <= FORGE.quenchPerfect ? "perfect" : off <= FORGE.quenchGood ? "good" : "miss";
    return { ...g, quench: grade, phase: "done", flash: { grade, age: 0 } };
  }
  return g;
}

export type ForgeQuality = "masterwork" | "fine" | "rough";

/** The finished blade's score (0..100): heat 25%, hammer 50%, quench 25%. */
export function forgeScore(g: ForgeGame): number {
  const heat = Math.max(0, 100 - g.scorch * FORGE.scorchPenalty);
  const points = (grade: ForgeGrade | null) => (grade === "perfect" ? 100 : grade === "good" ? 60 : 0);
  const hammer = g.strikes.length ? g.strikes.reduce((sum, grade) => sum + points(grade), 0) / g.strikes.length : 0;
  const quench = g.quench === "miss" && g.temp > 0 ? 20 : points(g.quench);
  return Math.round(0.25 * heat + 0.5 * hammer + 0.25 * quench);
}

export function forgeQuality(score: number): ForgeQuality {
  return score >= 90 ? "masterwork" : score >= 65 ? "fine" : "rough";
}

/** Ore handed back for the quality: half for a Masterwork, a quarter for Fine. */
export function forgeRefund(quality: ForgeQuality, ore: number): number {
  return quality === "masterwork" ? Math.floor(ore / 2) : quality === "fine" ? Math.floor(ore / 4) : 0;
}

export const FORGE_QUALITY_NAME: Record<ForgeQuality, string> = { masterwork: "Masterwork", fine: "Fine", rough: "Rough" };
