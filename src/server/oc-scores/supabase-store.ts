/**
 * The Supabase/Postgres backend of the Order & Chaos tally boards: table
 * `homm3bg_oc_scores` (supabase/migrations/20261002120000_order_chaos_scores.sql),
 * one row per (account_id, board_key), reached over PostgREST with the
 * server-only service-role key like every other homm3bg table.
 *
 * "Keep it only if it beats the held best" is two single-statement writes, so
 * two instances racing on one account can't lower a best: an insert that
 * ignores an existing (account, board) row, then an update guarded by
 * `score < new score`. Nicknames and bans are read from homm3bg_accounts on
 * every board read (the stored nickname is only a fallback), and the rows of a
 * deleted account go with it (ON DELETE CASCADE).
 */
import { PostgrestClient } from "@/server/accounts/postgrest";
import { ACCOUNTS_TABLE } from "@/server/accounts/supabase-store";
import type { OcScoreRow, OcScoreStore } from "./store";

export const OC_SCORES_TABLE = "homm3bg_oc_scores";

/** Extra rows read past the board size, so a few banned accounts don't shorten a board. */
const BANNED_SLACK = 25;

type OcScoreDbRow = {
  account_id: string;
  board_key: string;
  nickname: string;
  score: number;
  wave: number;
  kills: number;
  ticks: number;
  hero: string | null;
  day: string;
  posted_at: number;
};

function toDb(row: OcScoreRow): OcScoreDbRow {
  return {
    account_id: row.accountId,
    board_key: row.boardKey,
    nickname: row.nickname,
    score: row.score,
    wave: row.wave,
    kills: row.kills,
    ticks: row.ticks,
    hero: row.hero ?? null,
    day: row.day,
    posted_at: row.at
  };
}

function fromDb(row: OcScoreDbRow): OcScoreRow {
  return {
    accountId: row.account_id,
    boardKey: row.board_key,
    nickname: row.nickname,
    score: Number(row.score),
    wave: Number(row.wave),
    kills: Number(row.kills),
    ticks: Number(row.ticks),
    ...(row.hero ? { hero: row.hero } : {}),
    day: row.day,
    at: Number(row.posted_at)
  };
}

export class SupabaseOcScoreStore implements OcScoreStore {
  private readonly db: PostgrestClient;

  constructor(options: { url: string; serviceRoleKey: string; fetchImpl?: typeof fetch }) {
    this.db = new PostgrestClient(options.url, options.serviceRoleKey, options.fetchImpl ?? fetch);
  }

  async offer(row: OcScoreRow): Promise<boolean> {
    const record = toDb(row);
    const inserted = await this.db.insert<OcScoreDbRow>(OC_SCORES_TABLE, record, { ignoreDuplicates: true });
    if (inserted.length > 0) return true;
    const { account_id: _a, board_key: _b, ...patch } = record;
    const updated = await this.db.update<OcScoreDbRow>(
      OC_SCORES_TABLE,
      patch,
      { account_id: row.accountId, board_key: row.boardKey },
      { filters: [`score=lt.${Math.floor(row.score)}`] }
    );
    return updated.length > 0;
  }

  async top(boardKey: string, limit: number): Promise<OcScoreRow[]> {
    const want = Math.max(0, limit);
    if (want === 0) return [];
    const rows = await this.db.select<OcScoreDbRow>(
      OC_SCORES_TABLE,
      { board_key: boardKey },
      { order: "score.desc,posted_at.asc,account_id.asc", limit: want + BANNED_SLACK }
    );
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((row) => row.account_id))];
    const accounts = await this.db.select<{ id: string; nickname: string; banned_at: string | null }>(
      ACCOUNTS_TABLE,
      {},
      { filters: ["select=id,nickname,banned_at", `id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`] }
    );
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const out: OcScoreRow[] = [];
    for (const row of rows) {
      const account = byId.get(row.account_id);
      if (!account || account.banned_at) continue;
      out.push({ ...fromDb(row), nickname: account.nickname || row.nickname });
      if (out.length >= want) break;
    }
    return out;
  }

  async dropDaysBefore(cutoffDay: string): Promise<void> {
    await this.db.delete(OC_SCORES_TABLE, {}, {
      filters: ["board_key=like.day:*", `day=lt.${encodeURIComponent(cutoffDay)}`],
      returnRepresentation: false
    });
  }
}
