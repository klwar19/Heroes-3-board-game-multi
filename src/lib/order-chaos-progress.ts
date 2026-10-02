/**
 * Order & Chaos progress: cleared levels, stars (goals met), Seals and unit
 * levels, the chosen hero and artifacts, last seed packets, best Endless run,
 * broken raids and tally-board bests, Ore and Gems, forged hero ranks and the
 * Magic Garden's plots. Browser storage only (the mode runs on the client); every
 * read and write tolerates blocked storage. Unlocks are derived from `cleared`.
 */

import type { BlessingId, SpellId } from "@/engine/garrison/content";
import { OC_ARTIFACTS, OC_HERO_MAX_RANK, OC_HERO_ORDER, OC_LEVELS, OC_MAX_LEVEL, OC_MERCENARIES, OC_SPELLS, OC_WORLDS, type OcHeroId } from "@/engine/garrison/order-chaos/campaign";
import { parsePlot, type OcPlot } from "@/engine/garrison/order-chaos/garden";
import { OC_PACK_SLOTS, isOcItem, parseSummonLog, type OcAttendance, type OcItemId, type OcPity, type OcSummonRecord } from "@/engine/garrison/order-chaos/treasury";
import { setItemMakingRoom } from "./storage-space";

export type OcProgress = {
  cleared: string[];
  /** Per level: the indices of the goals met at least once. */
  stars: Record<string, number[]>;
  seals: number;
  /** Barracks levels by unit kind (missing = 1). */
  levels: Record<string, number>;
  hero: OcHeroId;
  artifacts: BlessingId[];
  loadouts: Record<string, string[]>;
  bestEndless: number;
  raids: string[];
  /** Mercenary Camp units hired with Seals. */
  hired: string[];
  /** General spells packed into the spellbook (empty: the first ones found). */
  spellbook: SpellId[];
  /** Testing only: everything unlocked (password-gated in the menu). */
  testAll: boolean;
  /** Story scenes already shown ("prologue:v3", "world:3", "level:w1-2", "after:w1-2", "epilogue"). */
  seen: string[];
  /** Tally-board bests kept on this device: "endless", "daily:YYYY-MM-DD", "raid:r3" (boards: ../engine/garrison/order-chaos/scores). */
  bests: Record<string, OcLocalBest>;
  /** Forge materials: Ore from battles, Gems from the Magic Garden. */
  ore: number;
  gems: number;
  /** Hero ranks forged at the Forge (missing: the rank the hero joined at; campaign heroRankOf). */
  heroRanks: Record<string, number>;
  /** The Magic Garden's plots, by plot index (null: empty). */
  garden: OcPlot[];
  /** The campaign score last accepted by the online campaign board (0: never posted). */
  campaignPosted: number;
  /** Today's capped takings (UTC day): Gems harvested and Ore from replayed battles. */
  daily: OcDailyTakings;
  /** The treasury (engine/garrison/order-chaos/treasury.ts): Crystals, Stardust, the Satchel and the Portal. */
  crystals: number;
  stardust: number;
  /** Satchel items by id (count). */
  items: Partial<Record<OcItemId, number>>;
  /** Boost items packed for the next battles (each used there up to its perMatch, one copy spent a use; stays packed while owned). */
  packed: OcItemId[];
  pity: OcPity;
  /** The Portal's history: the latest summons, oldest first (at most OC_SUMMON_LOG_KEPT). */
  summonLog: OcSummonRecord[];
  /** Permanent Portal prizes owned: gacha-only units, Chaos raid units, artifacts, heroes. */
  gacha: { units: string[]; chaos: string[]; artifacts: string[]; heroes: string[] };
  attendance: OcAttendance;
  /** The UTC day whose first Daily Siege run already paid its Crystals. */
  dailyCrystalsDay: string;
};

export type OcDailyTakings = { day: string; gardenGems: number; replayOre: number };

/** Ore from replayed (already won) battles stops after this much in a UTC day; first victories and new stars always pay. */
export const OC_REPLAY_ORE_DAILY = 6;

/** Today's takings ("YYYY-MM-DD", UTC): yesterday's count resets. */
export function takingsToday(p: OcProgress, day: string): OcDailyTakings {
  return p.daily.day === day ? p.daily : { day, gardenGems: 0, replayOre: 0 };
}

/** A personal best on one tally board; `sent` once the online board has it. */
export type OcLocalBest = { score: number; wave: number; kills: number; ticks: number; day: string; at: number; sent: boolean; hero?: string; setup?: string };

/** Daily Siege bests are kept this many days. */
const DAILY_BESTS_KEPT = 14;

export const OC_PROGRESS_KEY = "order-chaos:progress:v1";
const KEY = OC_PROGRESS_KEY;

export function emptyOcProgress(): OcProgress {
  return { cleared: [], stars: {}, seals: 0, levels: {}, hero: "catherine", artifacts: [], loadouts: {}, bestEndless: 0, raids: [], hired: [], spellbook: [], testAll: false, seen: [], bests: {}, ore: 0, gems: 0, heroRanks: {}, garden: [], campaignPosted: 0, daily: { day: "", gardenGems: 0, replayOre: 0 },
    crystals: 0, stardust: 0, items: {}, packed: [], pity: { pulls: 0, sinceSsr: 0, sinceUr: 0 }, summonLog: [], gacha: { units: [], chaos: [], artifacts: [], heroes: [] },
    attendance: { lastDay: "", claimed: 0 }, dailyCrystalsDay: "" };
}

/** Parse stored bests, keeping only well-formed ones and the last DAILY_BESTS_KEPT days of Daily Siege. */
function parseBests(value: unknown): Record<string, OcLocalBest> {
  const out: Record<string, OcLocalBest> = {};
  if (!value || typeof value !== "object") return out;
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null);
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || !/^(endless|daily:\d{4}-\d{2}-\d{2}|raid:r\d{1,2})$/.test(key)) continue;
    const b = raw as Partial<OcLocalBest>;
    const score = num(b.score);
    const wave = num(b.wave);
    const kills = num(b.kills);
    const ticks = num(b.ticks);
    const at = num(b.at);
    if (score === null || wave === null || kills === null || ticks === null || at === null || typeof b.day !== "string") continue;
    out[key] = {
      score, wave, kills, ticks, at, day: b.day, sent: b.sent === true,
      ...(typeof b.hero === "string" ? { hero: b.hero } : {}),
      ...(typeof b.setup === "string" ? { setup: b.setup } : {})
    };
  }
  return pruneDailyBests(out);
}

/** Keep only the most recent DAILY_BESTS_KEPT Daily Siege days. */
export function pruneDailyBests(bests: Record<string, OcLocalBest>): Record<string, OcLocalBest> {
  const days = Object.keys(bests).filter((key) => key.startsWith("daily:")).sort().reverse();
  if (days.length <= DAILY_BESTS_KEPT) return bests;
  const out = { ...bests };
  for (const key of days.slice(DAILY_BESTS_KEPT)) delete out[key];
  return out;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * A save from before the story existed: mark the closing scenes of the worlds
 * the player has already moved past (a level of the next world cleared) as
 * seen, so they don't replay as a backlog. The current world's stays owed.
 */
function legacySeen(cleared: readonly string[]): string[] {
  return OC_WORLDS.filter((world) => OC_WORLDS.find((next) => next.id === world.id + 1)?.levels.some((level) => cleared.includes(level.id)))
    .map((world) => `outro:${world.id}`);
}

/**
 * A save from before the Forge: the Ore its battles would have earned (3 for
 * every campaign level cleared and every raid broken, 1 for every goal star)
 * and a first harvest of 2 Gems a level, so its heroes can be forged back up.
 */
function legacyForge(cleared: readonly string[], stars: Record<string, number[]>, raids: readonly string[]): { ore: number; gems: number } {
  const levels = OC_LEVELS.filter((level) => cleared.includes(level.id)).length;
  const goals = Object.values(stars).reduce((sum, list) => sum + list.length, 0);
  return { ore: 3 * levels + goals + 3 * raids.length, gems: 2 * levels };
}

export function loadOcProgress(): OcProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyOcProgress();
    const p = JSON.parse(raw) as Partial<OcProgress>;
    const stars: Record<string, number[]> = {};
    for (const [id, list] of Object.entries(p.stars ?? {})) {
      if (Array.isArray(list)) stars[id] = list.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 4);
    }
    const levels: Record<string, number> = {};
    for (const [kind, level] of Object.entries(p.levels ?? {})) {
      if (Number.isInteger(level)) levels[kind] = Math.max(1, Math.min(OC_MAX_LEVEL, level as number));
    }
    const cleared = strings(p.cleared);
    const loadouts: Record<string, string[]> = {};
    for (const [id, list] of Object.entries(p.loadouts ?? {})) loadouts[id] = strings(list);
    const heroRanks: Record<string, number> = {};
    for (const [id, rank] of Object.entries(p.heroRanks ?? {})) {
      if (OC_HERO_ORDER.includes(id as OcHeroId) && Number.isInteger(rank)) heroRanks[id] = Math.max(1, Math.min(OC_HERO_MAX_RANK, rank as number));
    }
    const raids = strings(p.raids);
    const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null);
    const legacy = count(p.ore) === null ? legacyForge(cleared, stars, raids) : null;
    return {
      cleared,
      stars,
      seals: typeof p.seals === "number" && p.seals >= 0 ? Math.floor(p.seals) : 0,
      levels,
      hero: OC_HERO_ORDER.includes(p.hero as OcHeroId) ? (p.hero as OcHeroId) : "catherine",
      artifacts: strings(p.artifacts).filter((id): id is BlessingId => OC_ARTIFACTS.includes(id as BlessingId)),
      loadouts,
      bestEndless: typeof p.bestEndless === "number" ? p.bestEndless : 0,
      raids,
      hired: strings(p.hired).filter((kind) => OC_MERCENARIES.some((merc) => merc.kind === kind)),
      spellbook: strings(p.spellbook).filter((id): id is SpellId => OC_SPELLS.includes(id as SpellId)),
      testAll: p.testAll === true,
      seen: Array.isArray(p.seen) ? strings(p.seen) : legacySeen(cleared),
      bests: parseBests(p.bests),
      ore: legacy ? legacy.ore : count(p.ore)!,
      gems: legacy ? legacy.gems : count(p.gems) ?? 0,
      heroRanks,
      garden: Array.isArray(p.garden) ? p.garden.slice(0, 8).map(parsePlot) : [],
      campaignPosted: count(p.campaignPosted) ?? 0,
      daily: p.daily && typeof p.daily === "object" && typeof p.daily.day === "string"
        ? { day: p.daily.day, gardenGems: count(p.daily.gardenGems) ?? 0, replayOre: count(p.daily.replayOre) ?? 0 }
        : { day: "", gardenGems: 0, replayOre: 0 },
      // A save from before the treasury: Crystals for what its battles would have paid (20 a level, 10 a goal star).
      crystals: count(p.crystals) ?? 20 * OC_LEVELS.filter((level) => cleared.includes(level.id)).length + 10 * Object.values(stars).reduce((n, list) => n + list.length, 0),
      stardust: count(p.stardust) ?? 0,
      items: Object.fromEntries(Object.entries(p.items ?? {}).filter(([id, n]) => isOcItem(id) && count(n)).map(([id, n]) => [id, count(n)!])),
      packed: strings(p.packed).filter(isOcItem).slice(0, OC_PACK_SLOTS),
      pity: { pulls: count(p.pity?.pulls) ?? 0, sinceSsr: count(p.pity?.sinceSsr) ?? 0, sinceUr: count(p.pity?.sinceUr) ?? 0 },
      summonLog: parseSummonLog(p.summonLog),
      gacha: { units: strings(p.gacha?.units), chaos: strings(p.gacha?.chaos), artifacts: strings(p.gacha?.artifacts), heroes: strings(p.gacha?.heroes) },
      attendance: { lastDay: typeof p.attendance?.lastDay === "string" ? p.attendance.lastDay : "", claimed: count(p.attendance?.claimed) ?? 0 },
      dailyCrystalsDay: typeof p.dailyCrystalsDay === "string" ? p.dailyCrystalsDay : ""
    };
  } catch {
    return emptyOcProgress();
  }
}

/**
 * Persist the progress; false when the browser refused (storage blocked, or
 * still full after the idle multiplayer room caches were freed) — the caller
 * warns the player, since progress then lasts for this visit only.
 */
export function saveOcProgress(progress: OcProgress): boolean {
  return setItemMakingRoom(KEY, JSON.stringify(progress));
}
