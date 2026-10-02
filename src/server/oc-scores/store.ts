/**
 * Order & Chaos tally-board storage, per ACCOUNT (the way ranked MMR is kept):
 * one best row per (account, board key). The board keys are the engine's
 * (`ocBoardKey`: `all:endless`, `all:raid:r3`, `day:<UTC day>:endless`,
 * `day:<day>:daily:<setup>`, ...), so the boards are exactly the ones the old
 * PartyKit `ocscores` party kept: an all-time and a per-UTC-day board for each
 * mode, a Daily Siege day board per setup fingerprint.
 *
 * Two backends behind one small interface, chosen like the account backend
 * (see instance.ts): the built-in in-memory store below, persisted inside the
 * built-in AccountStore's snapshot (accounts.json), and the Supabase table
 * `homm3bg_oc_scores` (supabase-store.ts). Rules (validation, score formula,
 * board keys) stay in the engine's scores.ts; the request flow lives in
 * service.ts. Kept free of engine imports so the account store can hold one.
 */

type MaybePromise<T> = T | Promise<T>;

/** One account's best on one board. */
export type OcScoreRow = {
  accountId: string;
  boardKey: string;
  /** The account nickname (current one on reads). */
  nickname: string;
  score: number;
  wave: number;
  kills: number;
  ticks: number;
  hero?: string;
  /** The UTC day of the run (the Daily Siege: the day of its orders). */
  day: string;
  /** Posted at (ms since epoch). Equal scores rank by who got there first. */
  at: number;
};

export interface OcScoreStore {
  /**
   * Keep `row` as its account's entry on `row.boardKey` when the account has
   * none there yet or `row.score` beats the one kept. True when it was kept.
   */
  offer(row: OcScoreRow): MaybePromise<boolean>;
  /**
   * A board's top `limit` rows, best first (score, then earliest), with
   * banned and deleted accounts left out and every nickname current.
   */
  top(boardKey: string, limit: number): MaybePromise<OcScoreRow[]>;
  /** Drop every day-board row whose day is before `cutoffDay` ("YYYY-MM-DD"). */
  dropDaysBefore(cutoffDay: string): MaybePromise<void>;
}

/** Board order: higher score first, then whoever posted it first, then a stable tiebreak. */
export function compareOcRows(a: OcScoreRow, b: OcScoreRow): number {
  return b.score - a.score || a.at - b.at || (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0);
}

/** What the built-in store needs to know about an account (null = gone). */
export type OcAccountLookup = (accountId: string) => { nickname: string; banned: boolean } | null;

/**
 * The built-in backend: rows in memory, keyed by board then account. Lives on
 * the built-in AccountStore (so it is saved with it in accounts.json and an
 * account deletion drops its rows); `lookup` reads the account map for current
 * nicknames and bans.
 */
export class OcScoreMemoryStore implements OcScoreStore {
  private readonly boards = new Map<string, Map<string, OcScoreRow>>();

  constructor(private readonly lookup: OcAccountLookup) {}

  offer(row: OcScoreRow): boolean {
    let board = this.boards.get(row.boardKey);
    if (!board) {
      board = new Map();
      this.boards.set(row.boardKey, board);
    }
    const held = board.get(row.accountId);
    if (held && held.score >= row.score) return false;
    board.set(row.accountId, { ...row });
    return true;
  }

  top(boardKey: string, limit: number): OcScoreRow[] {
    const board = this.boards.get(boardKey);
    if (!board) return [];
    const rows: OcScoreRow[] = [];
    for (const row of board.values()) {
      const account = this.lookup(row.accountId);
      if (!account || account.banned) continue;
      rows.push({ ...row, nickname: account.nickname });
    }
    return rows.sort(compareOcRows).slice(0, Math.max(0, limit));
  }

  dropDaysBefore(cutoffDay: string): void {
    for (const key of [...this.boards.keys()]) {
      if (key.startsWith("day:") && key.slice(4, 14) < cutoffDay) this.boards.delete(key);
    }
  }

  /** An account was deleted: its rows go with it. */
  forgetAccount(accountId: string): void {
    for (const [key, board] of this.boards) {
      board.delete(accountId);
      if (board.size === 0) this.boards.delete(key);
    }
  }

  toJSON(): OcScoreRow[] {
    const rows: OcScoreRow[] = [];
    for (const board of this.boards.values()) for (const row of board.values()) rows.push({ ...row });
    return rows;
  }

  loadJSON(rows: readonly OcScoreRow[] | null | undefined): void {
    this.boards.clear();
    for (const row of rows ?? []) {
      if (!row || typeof row.accountId !== "string" || typeof row.boardKey !== "string" || typeof row.score !== "number") continue;
      this.offer(row);
    }
  }
}
