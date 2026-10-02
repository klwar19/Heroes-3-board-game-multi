import type * as Party from "partykit/server";
import {
  OC_BOARD_SIZE,
  cleanOcName,
  isOcDay,
  ocBoardKey,
  ocDayKey,
  ocPublicId,
  ocScore,
  ocShiftDay,
  ocSummaryProblem,
  type OcBoardEntry,
  type OcBoardMode,
  type OcBoardView,
  type OcRunSummary
} from "@/engine/garrison/order-chaos/scores";

/**
 * Order & Chaos tally boards: one fixed singleton Durable Object at
 * `/parties/ocscores/global` holding every board (Endless Siege, Daily Siege,
 * each Chaos Raid), each as an all-time board and a per-UTC-day board of the
 * top OC_BOARD_SIZE entries. One entry per player per board (their best), keyed
 * by an anonymous id the browser keeps; rows go out with a hash of it only.
 *
 * Every score is re-derived here from the run summary (ocScore), and the
 * summary must pass ocSummaryProblem's plausibility checks. That stops typos
 * and lazy edits, NOT a determined cheat: the client simulates the run, so a
 * forged summary within the rules' bounds is accepted. Submissions are
 * rate-limited per player id and per IP.
 *
 * Cheap by design: each board is one small bounded array under its own key
 * (`b:<board>`, at most OC_BOARD_SIZE rows, ~20 KB), read once and then served
 * from memory; a GET never scans storage, and its JSON is reused until the
 * board changes (or GET_CACHE_MS passes) and may be cached by the browser for
 * a few seconds. Only today's and yesterday's day boards are kept (the older
 * ones are dropped by one listing of the day keys, once per UTC day, on the
 * first post of the day); a day keeps at most MAX_DAILY_VARIANTS Daily Siege
 * boards (one per distinct setup fingerprint, i.e. game version).
 *
 * Known limitation: the server cannot check a Daily Siege fingerprint (rolling
 * the day's orders needs the game engine, which stays out of this bundle), so a
 * client can open made-up variants, and enough of them can push the real day's
 * board out (the variant with the fewest runs is the one dropped). Likewise any
 * raid id r0–r99 is accepted (bounded: at most one all-time board per id).
 */

const KEY_PREFIX = "b:";
/** Day boards kept: today and yesterday (a Daily Siege begun before midnight UTC still posts to its day). */
const KEEP_DAYS = 1;
const MAX_DAILY_VARIANTS = 8;
/** Boards held in memory at once (a flood of odd board ids can't grow it past this). */
const MAX_CACHED_BOARDS = 200;
/** A GET's serialized board is reused this long (or until the board changes). */
const GET_CACHE_MS = 15_000;
const MAX_BODY = 4096;
const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;
/** One post per player id every few seconds, and a cap per IP. */
const PLAYER_GAP_MS = 5_000;
const IP_WINDOW_MS = 10 * 60_000;
const IP_MAX_POSTS = 40;

type Stored = OcBoardEntry & { cid: string };

const MODES: readonly OcBoardMode[] = ["endless", "daily", "raid", "campaign"];

function publicRow(entry: Stored, rank: number): OcBoardEntry & { rank: number } {
  const { cid: _cid, ...row } = entry;
  return { ...row, rank };
}

function sortBoard(list: Stored[]): Stored[] {
  return list.sort((a, b) => b.score - a.score || a.at - b.at);
}

export default class OcScoresServer implements Party.Server {
  private readonly boards = new Map<string, Stored[]>();
  /** Serialized GET bodies by board key. */
  private readonly served = new Map<string, { body: string; at: number }>();
  private readonly lastPost = new Map<string, number>();
  private readonly ipPosts = new Map<string, number[]>();
  private trimmedFor = "";

  constructor(readonly room: Party.Room) {}

  private async board(key: string): Promise<Stored[]> {
    const cached = this.boards.get(key);
    if (cached) return cached;
    const stored = await this.room.storage.get<Stored[]>(KEY_PREFIX + key);
    const list = Array.isArray(stored) ? stored.filter((row) => row && typeof row.cid === "string" && typeof row.score === "number") : [];
    sortBoard(list);
    if (list.length > OC_BOARD_SIZE) list.length = OC_BOARD_SIZE;
    if (this.boards.size >= MAX_CACHED_BOARDS) {
      this.boards.clear();
      this.served.clear();
    }
    this.boards.set(key, list);
    return list;
  }

  /** Drop day boards older than KEEP_DAYS (once per UTC day). */
  private async trimDays(today: string): Promise<void> {
    if (this.trimmedFor === today) return;
    this.trimmedFor = today;
    const cutoff = ocShiftDay(today, -KEEP_DAYS);
    const keys = await this.room.storage.list({ prefix: `${KEY_PREFIX}day:` });
    const stale: string[] = [];
    for (const key of keys.keys()) {
      const day = key.slice(`${KEY_PREFIX}day:`.length, `${KEY_PREFIX}day:`.length + 10);
      if (!isOcDay(day) || day < cutoff) stale.push(key);
    }
    for (let i = 0; i < stale.length; i += 128) await this.room.storage.delete(stale.slice(i, i + 128));
    for (const key of stale) this.forget(key.slice(KEY_PREFIX.length));
    // Boards read for days now gone (e.g. yesterday's endless page) leave memory too.
    for (const key of [...this.boards.keys()]) if (key.startsWith("day:") && key.slice(4, 14) < cutoff) this.forget(key);
  }

  private forget(key: string): void {
    this.boards.delete(key);
    this.served.delete(key);
  }

  /** A new Daily Siege variant for `day`: make room by dropping the variant with the fewest runs. */
  private async roomForDailyVariant(key: string, day: string): Promise<void> {
    // A GET of a board nobody posted to caches an empty list in memory: that is not a stored variant.
    if ((this.boards.get(key)?.length ?? 0) > 0 || (await this.room.storage.get(KEY_PREFIX + key)) !== undefined) return;
    const prefix = `${KEY_PREFIX}day:${day}:daily:`;
    const variants = await this.room.storage.list<Stored[]>({ prefix });
    if (variants.size < MAX_DAILY_VARIANTS) return;
    let smallest: string | null = null;
    let size = Number.MAX_SAFE_INTEGER;
    for (const [k, list] of variants) {
      const n = Array.isArray(list) ? list.length : 0;
      if (n < size) {
        size = n;
        smallest = k;
      }
    }
    if (smallest) {
      await this.room.storage.delete(smallest);
      this.forget(smallest.slice(KEY_PREFIX.length));
    }
  }

  /** Put the player's run on a board if it beats their entry there; their name is refreshed either way. */
  private async post(key: string, entry: Stored): Promise<{ rank: number | null; best: (OcBoardEntry & { rank: number }) | null; improved: boolean }> {
    const list = await this.board(key);
    const i = list.findIndex((row) => row.cid === entry.cid);
    let improved = false;
    let changed = false;
    if (i < 0) {
      list.push(entry);
      improved = true;
      changed = true;
    } else if (entry.score > list[i]!.score) {
      list[i] = entry;
      improved = true;
      changed = true;
    } else if (list[i]!.name !== entry.name) {
      list[i] = { ...list[i]!, name: entry.name };
      changed = true;
    }
    sortBoard(list);
    if (list.length > OC_BOARD_SIZE) list.length = OC_BOARD_SIZE;
    if (changed) {
      await this.room.storage.put(KEY_PREFIX + key, list);
      this.served.delete(key);
    }
    const at = list.findIndex((row) => row.cid === entry.cid);
    return { rank: at >= 0 ? at + 1 : null, best: at >= 0 ? publicRow(list[at]!, at + 1) : null, improved };
  }

  private rateLimited(cid: string, ip: string, now: number): boolean {
    const last = this.lastPost.get(cid) ?? 0;
    if (now - last < PLAYER_GAP_MS) return true;
    const hits = (this.ipPosts.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    if (hits.length >= IP_MAX_POSTS) {
      this.ipPosts.set(ip, hits);
      return true;
    }
    hits.push(now);
    this.ipPosts.set(ip, hits);
    this.lastPost.set(cid, now);
    if (this.lastPost.size > 5000) this.lastPost.clear();
    if (this.ipPosts.size > 5000) this.ipPosts.clear();
    return false;
  }

  /**
   * - GET  ?mode=endless|daily|raid|campaign&view=today|all[&raid=r3][&day=YYYY-MM-DD&setup=xxxxxxxx]
   *        → `{ ok, key, today, rows }` (the top entries, ranked)
   * - POST `{ cid, name, run }` → `{ ok, score, today: {rank, best, improved}, all: {...} }`
   */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    const today = ocDayKey();

    if (request.method === "GET") {
      const url = new URL(request.url);
      const mode = url.searchParams.get("mode") as OcBoardMode | null;
      const view = (url.searchParams.get("view") === "all" ? "all" : "today") as OcBoardView;
      if (!mode || !MODES.includes(mode)) return json({ ok: false, error: "Unknown board." }, 400);
      const day = mode === "daily" ? url.searchParams.get("day") ?? today : today;
      // Only today's and yesterday's day boards exist.
      if (view === "today" && day !== today && day !== ocShiftDay(today, -1)) return json({ ok: true, key: "", today, rows: [] });
      const key = ocBoardKey({ mode, view, day, raid: url.searchParams.get("raid") ?? undefined, setup: url.searchParams.get("setup") ?? undefined });
      if (!key) return json({ ok: false, error: "Unknown board." }, 400);
      const now = Date.now();
      const hit = this.served.get(key);
      if (hit && now - hit.at < GET_CACHE_MS) return new Response(hit.body, { headers: GET_HEADERS });
      const list = await this.board(key);
      const body = JSON.stringify({ ok: true, key, today, rows: list.map((row, i) => publicRow(row, i + 1)) });
      this.served.set(key, { body, at: now });
      return new Response(body, { headers: GET_HEADERS });
    }

    if (request.method === "POST") {
      // Refuse an oversized body before reading it into memory.
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, error: "Bad request." }, 413);
      const text = await request.text().catch(() => "");
      if (!text || text.length > MAX_BODY) return json({ ok: false, error: "Bad request." }, 400);
      type PostBody = { cid?: unknown; name?: unknown; run?: unknown };
      let body: PostBody | null = null;
      try {
        body = JSON.parse(text) as PostBody | null;
      } catch {
        body = null;
      }
      const cid = typeof body?.cid === "string" && CLIENT_ID.test(body.cid) ? body.cid : null;
      if (!cid) return json({ ok: false, error: "Bad player id." }, 400);
      const name = cleanOcName(body?.name);
      if (!name) return json({ ok: false, error: "A name is needed for the tally board." }, 400);
      const problem = ocSummaryProblem(body?.run, today);
      if (problem) return json({ ok: false, error: problem }, 400);
      const run = body!.run as OcRunSummary;
      const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
      const now = Date.now();
      if (this.rateLimited(cid, ip, now)) return json({ ok: false, error: "Easy there: one post every few seconds." }, 429);

      await this.trimDays(today);
      const score = ocScore(run);
      const day = run.mode === "daily" ? run.day! : today;
      const entry: Stored = {
        cid, pid: ocPublicId(cid), name, score, wave: run.wave, kills: run.kills, ticks: run.ticks,
        ...(run.hero ? { hero: run.hero } : {}), day, at: now
      };
      const dayKey = ocBoardKey({ mode: run.mode, view: "today", day, raid: run.raid, setup: run.setup });
      const allKey = ocBoardKey({ mode: run.mode, view: "all", raid: run.raid });
      if (!dayKey || !allKey) return json({ ok: false, error: "Unknown board." }, 400);
      if (run.mode === "daily") await this.roomForDailyVariant(dayKey, day);
      const todayResult = await this.post(dayKey, { ...entry });
      const allResult = await this.post(allKey, { ...entry });
      return json({ ok: true, score, pid: entry.pid, today: todayResult, all: allResult });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
}

/** Public boards (no credentials), so a wildcard origin is safe. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

/** Board pages: JSON, and the browser may reuse one for a few seconds. */
const GET_HEADERS: Record<string, string> = { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "public, max-age=10" };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

OcScoresServer satisfies Party.Worker;
