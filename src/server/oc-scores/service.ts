/**
 * The Order & Chaos tally-board requests, independent of the storage backend
 * (store.ts) and of Next (the route in src/app/api/order-chaos/scores only
 * resolves the session and hands over). Mirrors what the old `ocscores`
 * PartyKit party did, keyed by ACCOUNT instead of an anonymous browser id:
 *
 *  - every score is re-derived from the run summary (ocScore) and the summary
 *    must pass the engine's ocSummaryProblem checks (plausibility only: the
 *    client simulates the run, so a forged summary inside the rules' bounds is
 *    still accepted);
 *  - a run goes on its day board (today; the Daily Siege: the day of its
 *    orders, per setup fingerprint) and its all-time board, each keeping the
 *    account's best only;
 *  - the name shown is the account nickname, never anything the client sends;
 *  - one post per account every 5 s, and at most 40 per IP in 10 minutes
 *    (per server instance, like the login brake);
 *  - only today's and yesterday's day boards are kept (older day rows are
 *    dropped on the first post of a UTC day).
 *
 * Unlike the party there is no cap on Daily Siege variants per day: every
 * account holds one row per board, so made-up setup fingerprints can no longer
 * push the real day's board out of a bounded store.
 */
import { ocAccountPid } from "@/lib/oc-account-pid";
import {
  OC_BOARD_SIZE,
  ocBoardKey,
  ocDayKey,
  ocScore,
  ocShiftDay,
  ocSummaryProblem,
  type OcBoardEntry,
  type OcBoardMode,
  type OcBoardView,
  type OcRunSummary
} from "@/engine/garrison/order-chaos/scores";
import type { OcScoreRow, OcScoreStore } from "./store";

/** Day boards kept: today and yesterday (a Daily Siege begun before midnight UTC still posts to its day). */
const KEEP_DAYS = 1;
/** Largest POST body read. */
export const OC_MAX_BODY = 4096;
export const OC_POST_GAP_MS = 5_000;
const IP_WINDOW_MS = 10 * 60_000;
const IP_MAX_POSTS = 40;

const MODES: readonly OcBoardMode[] = ["endless", "daily", "raid", "campaign"];

export type OcPublicRow = OcBoardEntry & { rank: number };
export type OcPlacingBody = { rank: number | null; best: OcPublicRow | null; improved: boolean };
export type OcServiceResponse = { status: number; body: Record<string, unknown> };

/** A stored row as everyone sees it: the account nickname and a hash of the account id. */
export function ocPublicRow(row: OcScoreRow, rank: number): OcPublicRow {
  return {
    pid: ocAccountPid(row.accountId),
    name: row.nickname,
    score: row.score,
    wave: row.wave,
    kills: row.kills,
    ticks: row.ticks,
    ...(row.hero ? { hero: row.hero } : {}),
    day: row.day,
    at: row.at,
    rank
  };
}

/** Posting brakes, per server instance: one post per account every OC_POST_GAP_MS, and a cap per IP. */
export class OcPostLimiter {
  private readonly lastPost = new Map<string, number>();
  private readonly ipPosts = new Map<string, number[]>();

  /** True when this post must wait (nothing is counted then). */
  limited(accountId: string, ip: string, now: number): boolean {
    const last = this.lastPost.get(accountId);
    if (last !== undefined && now - last < OC_POST_GAP_MS) return true;
    const hits = (this.ipPosts.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    if (hits.length >= IP_MAX_POSTS) {
      this.ipPosts.set(ip, hits);
      return true;
    }
    hits.push(now);
    this.ipPosts.set(ip, hits);
    this.lastPost.set(accountId, now);
    if (this.lastPost.size > 5000) this.lastPost.clear();
    if (this.ipPosts.size > 5000) this.ipPosts.clear();
    return false;
  }
}

/**
 * GET ?mode=endless|daily|raid|campaign&view=today|all[&raid=r3][&day=YYYY-MM-DD&setup=xxxxxxxx]
 * → `{ ok, key, today, rows }` (the top OC_BOARD_SIZE, ranked).
 */
export async function readOcBoard(store: OcScoreStore, params: URLSearchParams, today: string = ocDayKey()): Promise<OcServiceResponse> {
  const mode = params.get("mode") as OcBoardMode | null;
  const view: OcBoardView = params.get("view") === "all" ? "all" : "today";
  if (!mode || !MODES.includes(mode)) return { status: 400, body: { ok: false, error: "Unknown board." } };
  const day = mode === "daily" ? params.get("day") ?? today : today;
  // Only today's and yesterday's day boards exist.
  if (view === "today" && day !== today && day !== ocShiftDay(today, -1)) return { status: 200, body: { ok: true, key: "", today, rows: [] } };
  const key = ocBoardKey({ mode, view, day, raid: params.get("raid") ?? undefined, setup: params.get("setup") ?? undefined });
  if (!key) return { status: 400, body: { ok: false, error: "Unknown board." } };
  const rows = await store.top(key, OC_BOARD_SIZE);
  return { status: 200, body: { ok: true, key, today, rows: rows.map((row, i) => ocPublicRow(row, i + 1)) } };
}

/** The UTC day each store was last trimmed for (once per day per instance). */
const trimmedFor = new WeakMap<OcScoreStore, string>();

async function trimDays(store: OcScoreStore, today: string): Promise<void> {
  if (trimmedFor.get(store) === today) return;
  trimmedFor.set(store, today);
  try {
    await store.dropDaysBefore(ocShiftDay(today, -KEEP_DAYS));
  } catch (error) {
    // Cleanup is best-effort: a failed trim must never lose the run being posted.
    trimmedFor.delete(store);
    console.error("[oc-scores] failed to drop old day boards:", error);
  }
}

async function placing(store: OcScoreStore, key: string, accountId: string, improved: boolean): Promise<OcPlacingBody> {
  const rows = await store.top(key, OC_BOARD_SIZE);
  const at = rows.findIndex((row) => row.accountId === accountId);
  return { rank: at >= 0 ? at + 1 : null, best: at >= 0 ? ocPublicRow(rows[at]!, at + 1) : null, improved };
}

/**
 * POST `{ run }` for a signed-in account → `{ ok, score, pid, name, today: {rank, best, improved}, all: {...} }`.
 * The caller has already resolved the session; `account.nickname` is the name shown.
 */
export async function postOcRunForAccount(
  store: OcScoreStore,
  account: { id: string; nickname: string },
  body: unknown,
  context: { limiter: OcPostLimiter; ip: string; now?: number; today?: string }
): Promise<OcServiceResponse> {
  const now = context.now ?? Date.now();
  const today = context.today ?? ocDayKey(new Date(now));
  const raw = body && typeof body === "object" ? (body as { run?: unknown }).run : undefined;
  const problem = ocSummaryProblem(raw, today);
  if (problem) return { status: 400, body: { ok: false, error: problem } };
  const run = raw as OcRunSummary;
  if (context.limiter.limited(account.id, context.ip, now)) {
    return { status: 429, body: { ok: false, error: "Easy there: one post every few seconds." } };
  }
  const day = run.mode === "daily" ? run.day! : today;
  const dayKey = ocBoardKey({ mode: run.mode, view: "today", day, raid: run.raid, setup: run.setup });
  const allKey = ocBoardKey({ mode: run.mode, view: "all", raid: run.raid });
  if (!dayKey || !allKey) return { status: 400, body: { ok: false, error: "Unknown board." } };

  await trimDays(store, today);
  const score = ocScore(run);
  const row: Omit<OcScoreRow, "boardKey"> = {
    accountId: account.id,
    nickname: account.nickname,
    score,
    wave: run.wave,
    kills: run.kills,
    ticks: run.ticks,
    ...(run.hero ? { hero: run.hero } : {}),
    day,
    at: now
  };
  const improvedToday = await store.offer({ ...row, boardKey: dayKey });
  const improvedAll = await store.offer({ ...row, boardKey: allKey });
  return {
    status: 200,
    body: {
      ok: true,
      score,
      pid: ocAccountPid(account.id),
      name: account.nickname,
      today: await placing(store, dayKey, account.id, improvedToday),
      all: await placing(store, allKey, account.id, improvedAll)
    }
  };
}
