/**
 * Order & Chaos scoring: the Endless Siege, the Daily Siege, the Chaos Raids
 * and the campaign each keep a tally board. The score formula
 * lives here, once: the game shows it on the result screen and keeps local
 * bests with it, and the online tally board (party/oc-scores.ts) re-derives
 * every score from the submitted run summary and turns away implausible runs.
 *
 * Kept free of heavy engine imports (only the clock and types) so the
 * PartyKit bundle stays small.
 */

import { GW_TPS, sec } from "../clock";
import type { GarrisonState } from "../sim";

export type OcBoardMode = "endless" | "daily" | "raid" | "campaign";
export type OcBoardView = "today" | "all";

/** What a finished run hands the tally board. Every number comes from the final simulation state. */
export type OcRunSummary = {
  mode: OcBoardMode;
  /** Raids: which raid (r1, r2, ...). */
  raid?: string;
  /** Daily Siege: the UTC day whose orders were played, and their fingerprint. */
  day?: string;
  setup?: string;
  /** Raids: every lane broken. Sieges never end in a win. */
  won: boolean;
  /** Sieges: the wave reached when the gate fell (0 for raids). The campaign: levels cleared. */
  wave: number;
  /** Foes slain (in a raid: your own Chaos creatures lost). The campaign: stars earned. */
  kills: number;
  /** Battle time in simulation ticks (pausing and fast-forward don't change it). */
  ticks: number;
  lost: number;
  placed: number;
  hero?: string;
};

/** One row of a tally board as everyone sees it (`pid` is an anonymous hash, never the player's id). */
export type OcBoardEntry = {
  pid: string;
  name: string;
  score: number;
  wave: number;
  kills: number;
  ticks: number;
  hero?: string;
  /** The UTC day the run was posted (the Daily Siege: the day of its orders). */
  day: string;
  /** Posted at (ms since epoch). Ties go to whoever got there first. */
  at: number;
};

/** Entries a board keeps (and shows). */
export const OC_BOARD_SIZE = 100;
/** A player's shown name. */
export const OC_NAME_MAX = 20;

/** Sieges: every wave reached is worth this much; foes slain only break ties. */
export const OC_WAVE_POINTS = 10000;
export const OC_KILL_CAP = OC_WAVE_POINTS - 1;
/** Raids: the clock the score counts down from (one hour of battle). */
export const OC_RAID_CLOCK = sec(3600);
/** No real raid breaks every lane faster than this (the fastest foe needs ~10 s to cross the lawn). */
const OC_RAID_MIN_TICKS = sec(5);
/** Longest run the board accepts (six hours of battle time). */
const OC_MAX_RUN_TICKS = sec(6 * 3600);
/** The first wave of a siege marches at 20 s; a wave can come at most every 6 s after the last. */
const SIEGE_FIRST_WAVE = sec(20);
const SIEGE_MIN_GAP = sec(6);
/** The campaign board: levels cleared rank first (each worth this much), stars break ties. */
export const OC_LEVEL_POINTS = 1000;
/** More campaign levels than the game has (a bound for the board's checks). */
export const OC_CAMPAIGN_MAX_LEVELS = 120;
/** Stars a campaign level can give: 1 for the victory, 1 for each of its two goals. */
export const OC_STARS_PER_LEVEL = 3;

const RAID_ID = /^r\d{1,2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SETUP_RE = /^[0-9a-f]{8}$/;
const HERO_RE = /^[a-z][a-z-]{0,23}$/;

/** The one score formula. Higher is always better. */
export function ocScore(run: Pick<OcRunSummary, "mode" | "won" | "wave" | "kills" | "ticks">): number {
  if (run.mode === "campaign") return Math.max(0, Math.floor(run.wave)) * OC_LEVEL_POINTS + Math.max(0, Math.min(OC_LEVEL_POINTS - 1, Math.floor(run.kills)));
  if (run.mode === "raid") {
    if (!run.won) return 0;
    return Math.max(1, OC_RAID_CLOCK - Math.max(0, Math.floor(run.ticks)));
  }
  return Math.max(0, Math.floor(run.wave)) * OC_WAVE_POINTS + Math.min(OC_KILL_CAP, Math.max(0, Math.floor(run.kills)));
}

/** How each board ranks, in plain words (shown next to every score). */
export const OC_SCORE_RULES: Record<OcBoardMode, string> = {
  endless: "Score = the wave you reached × 10,000, plus 1 for every foe slain (up to 9,999). The furthest wave always ranks higher; foes slain only break ties.",
  daily: "Everyone gets the same orders today: same road, same loaned troops, same horde. Score = the wave you reached × 10,000, plus 1 for every foe slain (up to 9,999).",
  raid: "Only a broken raid counts. The faster the horde breaks every lane, the higher you rank. Battle time is measured, so pausing or speeding up changes nothing.",
  campaign: "Campaign progress: the most levels cleared ranks highest; stars (1 for each victory, 1 for each goal met) break ties, then whoever got there first."
};

/** "3:42" from simulation ticks. */
export function ocRunTime(ticks: number): string {
  const total = Math.max(0, Math.floor(ticks / GW_TPS));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** A score in words: "Wave 23 · 412 foes slain" or "Broke every lane in 3:42". */
export function ocScoreText(mode: OcBoardMode, run: Pick<OcBoardEntry, "wave" | "kills" | "ticks">): string {
  if (mode === "raid") return `Broke every lane in ${ocRunTime(run.ticks)}`;
  if (mode === "campaign") return `${run.wave} level${run.wave === 1 ? "" : "s"} cleared · ${run.kills} star${run.kills === 1 ? "" : "s"}`;
  return `Wave ${run.wave} · ${run.kills} foe${run.kills === 1 ? "" : "s"} slain`;
}

/** The summary of a finished run, straight from the final simulation state. */
export function ocRunSummary(
  state: GarrisonState,
  mode: OcBoardMode,
  extra: { raid?: string; day?: string; setup?: string; hero?: string } = {}
): OcRunSummary {
  const raid = mode === "raid";
  return {
    mode,
    ...(raid && extra.raid ? { raid: extra.raid } : {}),
    ...(mode === "daily" ? { day: extra.day, setup: extra.setup } : {}),
    won: state.outcome?.winner === (raid ? "atk" : "def"),
    wave: raid ? 0 : state.director.wave,
    kills: state.stats.kills,
    ticks: state.tick,
    lost: state.stats.lost,
    placed: state.stats.placed,
    ...(extra.hero ? { hero: extra.hero } : {})
  };
}

/** The campaign as a board entry: levels cleared and stars earned (no battle of its own, so no time). */
export function ocCampaignSummary(cleared: number, stars: number, hero?: string): OcRunSummary {
  return { mode: "campaign", won: false, wave: Math.max(0, Math.floor(cleared)), kills: Math.max(0, Math.floor(stars)), ticks: 0, lost: 0, placed: 0, ...(hero ? { hero } : {}) };
}

/** The earliest battle time a siege can reach wave `wave` (a second of slack). */
export function ocMinTicksForWave(wave: number): number {
  return SIEGE_FIRST_WAVE + Math.max(0, wave - 1) * SIEGE_MIN_GAP - sec(1);
}

/** A generous ceiling on foes slain by wave `wave` (summons and raised dead included). */
export function ocMaxKillsForWave(wave: number): number {
  return 300 * Math.max(1, wave) + 100;
}

const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/**
 * Why a run summary cannot go on a board (null = it may). Shape and range
 * checks plus what the rules allow: a siege needs at least 20 s + 6 s a wave
 * to reach its wave, never slays absurdly many foes for it, and never ends in
 * a win; a raid must be won and take a plausible time; a Daily Siege must be
 * today's (or yesterday's, for a run begun before midnight UTC).
 * These are plausibility checks only: a client can still send a made-up run.
 */
export function ocSummaryProblem(run: unknown, today: string): string | null {
  if (!run || typeof run !== "object") return "No run summary.";
  const r = run as Partial<OcRunSummary>;
  if (r.mode !== "endless" && r.mode !== "daily" && r.mode !== "raid" && r.mode !== "campaign") return "Unknown board.";
  if (typeof r.won !== "boolean") return "Bad run summary.";
  if (!isInt(r.ticks, 0, OC_MAX_RUN_TICKS)) return "Run length out of range.";
  if (!isInt(r.kills, 0, 1_000_000) || !isInt(r.lost, 0, 100_000) || !isInt(r.placed, 0, 100_000)) return "Bad run numbers.";
  if (r.hero !== undefined && (typeof r.hero !== "string" || !HERO_RE.test(r.hero))) return "Bad hero.";
  if (r.mode === "campaign") {
    if (r.won || r.ticks !== 0 || r.raid !== undefined || r.day !== undefined) return "Bad campaign summary.";
    if (!isInt(r.wave, 1, OC_CAMPAIGN_MAX_LEVELS)) return "Levels cleared out of range.";
    if (!isInt(r.kills, r.wave, r.wave * OC_STARS_PER_LEVEL)) return "More stars than those levels give.";
    return null;
  }
  if (r.mode === "raid") {
    if (typeof r.raid !== "string" || !RAID_ID.test(r.raid)) return "Unknown raid.";
    if (!r.won) return "Only a broken raid goes on the board.";
    if (r.wave !== 0) return "Bad run numbers.";
    if (r.ticks < OC_RAID_MIN_TICKS) return "That raid was over too fast to be real.";
    if (r.ticks >= OC_RAID_CLOCK) return "Raids slower than an hour don't go on the board.";
    return null;
  }
  if (!isInt(r.wave, 1, 9999)) return "Wave out of range.";
  if (r.won) return "A siege never ends in a win.";
  if (r.ticks < ocMinTicksForWave(r.wave)) return "Too fast for that many waves.";
  if (r.kills > ocMaxKillsForWave(r.wave)) return "More foes slain than that many waves could bring.";
  if (r.mode === "daily") {
    if (typeof r.day !== "string" || !DAY_RE.test(r.day)) return "Bad day.";
    if (r.day !== today && r.day !== ocPrevDay(today)) return "That Daily Siege has closed.";
    if (typeof r.setup !== "string" || !SETUP_RE.test(r.setup)) return "Bad Daily Siege fingerprint.";
  }
  return null;
}

/** Control, zero-width and bidi-override characters: never part of a shown name. */
const INVISIBLE: readonly [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];

/** A name fit for the board (trimmed, no invisible characters, at most OC_NAME_MAX long), or null. */
export function cleanOcName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const visible = [...raw.normalize("NFKC")].filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return !INVISIBLE.some(([lo, hi]) => cp >= lo && cp <= hi);
  });
  const chars = [...visible.join("").replace(/\s+/g, " ").trim()];
  if (chars.length < 1) return null;
  return chars.slice(0, OC_NAME_MAX).join("").trim();
}

// ---------------------------------------------------------------------------
// Days, boards, hashes

/** The UTC day, "YYYY-MM-DD". */
export function ocDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function isOcDay(day: unknown): day is string {
  return typeof day === "string" && DAY_RE.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
}

/** The day before `day` (both "YYYY-MM-DD", UTC). */
export function ocPrevDay(day: string): string {
  return ocShiftDay(day, -1);
}

export function ocShiftDay(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) ? day : new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A board's storage id. All-time: `all:endless`, `all:daily`, `all:raid:r3`.
 * Today: `day:<day>:endless`, `day:<day>:raid:r3`, and `day:<day>:daily:<setup>`
 * (a Daily Siege board only holds runs of the very same orders, so two game
 * versions that roll different orders never share one).
 */
export function ocBoardKey(q: { mode: OcBoardMode; view: OcBoardView; day?: string; raid?: string; setup?: string }): string | null {
  if (q.mode === "raid" && (typeof q.raid !== "string" || !RAID_ID.test(q.raid))) return null;
  const tail = q.mode === "raid" ? `raid:${q.raid}` : q.mode;
  if (q.view === "all") return `all:${tail}`;
  if (!isOcDay(q.day)) return null;
  if (q.mode === "daily") return typeof q.setup === "string" && SETUP_RE.test(q.setup) ? `day:${q.day}:daily:${q.setup}` : null;
  return `day:${q.day}:${tail}`;
}

/** FNV-1a (32-bit) of a string. */
export function ocHash32(text: string, basis = 0x811c9dc5): number {
  let h = basis >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const ocHex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

/** The anonymous public id shown with a player's rows (a hash of their private id; used to highlight "you"). */
export function ocPublicId(clientId: string): string {
  return (ocHex8(ocHash32(clientId)) + ocHex8(ocHash32(clientId, 0x01000193))).slice(0, 12);
}
