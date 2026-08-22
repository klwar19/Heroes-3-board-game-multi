/**
 * THE one ordering of the Hall of Fame (the rank board at /hall-of-fame).
 *
 * USER RULE (2026-08-22): "rank board: should prioritize showing those with
 * more win first." WINS are therefore the PRIMARY key, descending — a player
 * with more wins outranks a higher-rated player with fewer. Ties fall through
 * to rating (desc), then the cleaner record (fewer losses), then nickname so
 * the board is stable and never order-dependent on insertion.
 *
 * Both account backends serve the SAME order from this one table: the
 * file/memory `AccountStore` sorts in JS with `compareHallOfFame`, the Supabase
 * store hands `HALL_OF_FAME_ORDER_CLAUSE` to PostgREST. Keeping the JS field
 * and the SQL column in ONE row per key is what stops the two surfaces from
 * silently disagreeing (pinned in leaderboard-order.test.ts).
 */

/** The subset of an account profile the board is ranked by. */
export type HallOfFameRankable = {
  nickname: string;
  mmr: number;
  wins: number;
  losses: number;
};

type NumericField = "mmr" | "wins" | "losses";

export type HallOfFameSortKey =
  | { field: NumericField; column: string; direction: "asc" | "desc" }
  | { field: "nickname"; column: string; direction: "asc" | "desc" };

/** Primary key first. Wins lead — see the USER RULE above. */
export const HALL_OF_FAME_SORT_KEYS: readonly HallOfFameSortKey[] = [
  { field: "wins", column: "wins", direction: "desc" },
  { field: "mmr", column: "mmr", direction: "desc" },
  { field: "losses", column: "losses", direction: "asc" },
  { field: "nickname", column: "nickname", direction: "asc" }
] as const;

/** The PostgREST `order=` clause for the same ordering, e.g. "wins.desc,…". */
export const HALL_OF_FAME_ORDER_CLAUSE = HALL_OF_FAME_SORT_KEYS.map(
  (key) => `${key.column}.${key.direction}`
).join(",");

/** Comparator for `Array.prototype.sort` — best (top of the board) first. */
export function compareHallOfFame(a: HallOfFameRankable, b: HallOfFameRankable): number {
  for (const key of HALL_OF_FAME_SORT_KEYS) {
    const sign = key.direction === "desc" ? -1 : 1;
    let cmp: number;
    if (key.field === "nickname") {
      cmp = a.nickname.localeCompare(b.nickname);
    } else {
      cmp = a[key.field] - b[key.field];
    }
    if (cmp !== 0) {
      return sign * cmp;
    }
  }
  return 0;
}
