import { describe, expect, it } from "vitest";
import { sec } from "@/engine/garrison/clock";
import { OC_BOARD_SIZE, ocMinTicksForWave, type OcRunSummary } from "@/engine/garrison/order-chaos/scores";
import { ocAccountPid } from "@/lib/oc-account-pid";
import { AccountStore } from "@/server/accounts/account-store";
import { FakePostgrest } from "@/server/accounts/__fixtures__/fake-postgrest";
import { CaptureMailer } from "@/server/accounts/mailer";
import { OcPostLimiter, postOcRunForAccount, readOcBoard } from "./service";
import { OcScoreMemoryStore, type OcScoreRow, type OcScoreStore } from "./store";
import { OC_SCORES_TABLE, SupabaseOcScoreStore } from "./supabase-store";

/**
 * Order & Chaos tally boards stored per account: the rules every backend must
 * keep (best-only rows, board order, banned/deleted accounts hidden, current
 * nicknames, old day boards dropped), run against the built-in store and the
 * Supabase store (over the in-memory PostgREST emulator), plus the request
 * flow in service.ts (validation, account nickname, rate limit, placings).
 */

const TODAY = "2026-10-02";
const T0 = Date.parse(`${TODAY}T12:00:00Z`);

function siege(wave: number, kills: number, over: Partial<OcRunSummary> = {}): OcRunSummary {
  return { mode: "endless", won: false, wave, kills, ticks: ocMinTicksForWave(wave) + sec(60), lost: 2, placed: 15, hero: "catherine", ...over };
}

function row(accountId: string, boardKey: string, score: number, at: number, over: Partial<OcScoreRow> = {}): OcScoreRow {
  return { accountId, boardKey, nickname: `stored-${accountId}`, score, wave: 1, kills: 0, ticks: 100, day: TODAY, at, ...over };
}

type Harness = {
  store: OcScoreStore;
  addAccount(id: string, nickname: string): void;
  ban(id: string): void;
  rename(id: string, nickname: string): void;
  remove(id: string): void;
};

function memoryHarness(): Harness {
  const accounts = new Map<string, { nickname: string; banned: boolean }>();
  const store = new OcScoreMemoryStore((id) => accounts.get(id) ?? null);
  return {
    store,
    addAccount: (id, nickname) => void accounts.set(id, { nickname, banned: false }),
    ban: (id) => void (accounts.get(id)!.banned = true),
    rename: (id, nickname) => void (accounts.get(id)!.nickname = nickname),
    remove: (id) => {
      accounts.delete(id);
      store.forgetAccount(id);
    }
  };
}

function supabaseHarness(db = new FakePostgrest()): Harness & { db: FakePostgrest } {
  const store = new SupabaseOcScoreStore({ url: "https://project.supabase.co", serviceRoleKey: "service-role-secret", fetchImpl: db.fetch });
  const accounts = () => db.rows("homm3bg_accounts");
  return {
    db,
    store,
    addAccount: (id, nickname) => void accounts().push({ id, nickname, nickname_key: nickname.toLowerCase(), email: `${id}@x.io`, banned_at: null }),
    ban: (id) => void (accounts().find((a) => a.id === id)!.banned_at = "2026-10-01T00:00:00Z"),
    rename: (id, nickname) => void (accounts().find((a) => a.id === id)!.nickname = nickname),
    remove: (id) => {
      // ON DELETE CASCADE in the real schema.
      db.tables.set("homm3bg_accounts", accounts().filter((a) => a.id !== id));
      db.tables.set(OC_SCORES_TABLE, db.rows(OC_SCORES_TABLE).filter((r) => r.account_id !== id));
    }
  };
}

const BACKENDS: [string, () => Harness][] = [
  ["built-in", memoryHarness],
  ["supabase", () => supabaseHarness()]
];

describe.each(BACKENDS)("O&C score store (%s)", (_name, make) => {
  it("keeps one row per account and board, replaced only by a higher score", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    expect(await h.store.offer(row("u_a", "all:endless", 50_000, 1))).toBe(true);
    // CONTROL: a lower and an equal score leave the best alone.
    expect(await h.store.offer(row("u_a", "all:endless", 40_000, 2))).toBe(false);
    expect(await h.store.offer(row("u_a", "all:endless", 50_000, 3))).toBe(false);
    expect((await h.store.top("all:endless", 10)).map((r) => [r.score, r.at])).toEqual([[50_000, 1]]);
    expect(await h.store.offer(row("u_a", "all:endless", 60_000, 4, { wave: 6, hero: "gem" }))).toBe(true);
    const [best] = await h.store.top("all:endless", 10);
    expect(best).toMatchObject({ accountId: "u_a", score: 60_000, at: 4, wave: 6, hero: "gem" });
    expect(await h.store.top("all:endless", 10)).toHaveLength(1);
    // Another board is separate.
    expect(await h.store.offer(row("u_a", "all:raid:r1", 10, 5))).toBe(true);
    expect(await h.store.top("all:raid:r1", 10)).toHaveLength(1);
  });

  it("orders by score, then earliest post; shows current nicknames; hides banned and deleted accounts", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    h.addAccount("u_b", "Bob");
    h.addAccount("u_c", "Cid");
    h.addAccount("u_d", "Dee");
    await h.store.offer(row("u_a", "all:endless", 30_000, 30));
    await h.store.offer(row("u_b", "all:endless", 30_000, 10));
    await h.store.offer(row("u_c", "all:endless", 90_000, 50));
    await h.store.offer(row("u_d", "all:endless", 20_000, 5));
    expect((await h.store.top("all:endless", 10)).map((r) => r.nickname)).toEqual(["Cid", "Bob", "Alice", "Dee"]);
    expect((await h.store.top("all:endless", 2)).map((r) => r.accountId)).toEqual(["u_c", "u_b"]);
    h.rename("u_b", "Bobby");
    h.ban("u_c");
    h.remove("u_d");
    expect((await h.store.top("all:endless", 10)).map((r) => r.nickname)).toEqual(["Bobby", "Alice"]);
  });

  it("drops day-board rows older than the cutoff and never touches all-time rows", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    await h.store.offer(row("u_a", "day:2026-09-30:endless", 10, 1, { day: "2026-09-30" }));
    await h.store.offer(row("u_a", "day:2026-10-01:endless", 20, 2, { day: "2026-10-01" }));
    await h.store.offer(row("u_a", "day:2026-10-02:daily:0a1b2c3d", 30, 3));
    await h.store.offer(row("u_a", "all:endless", 40, 4, { day: "2026-09-01" }));
    await h.store.dropDaysBefore("2026-10-01");
    expect(await h.store.top("day:2026-09-30:endless", 10)).toEqual([]);
    expect(await h.store.top("day:2026-10-01:endless", 10)).toHaveLength(1);
    expect(await h.store.top("day:2026-10-02:daily:0a1b2c3d", 10)).toHaveLength(1);
    expect(await h.store.top("all:endless", 10)).toHaveLength(1);
  });
});

describe("O&C scores in the built-in account store", () => {
  it("are saved in the account snapshot, restored from it, and dropped with a deleted account", () => {
    const source = new AccountStore({ mailer: new CaptureMailer(), autoConfirmNewAccounts: true });
    const alice = source.register({ nickname: "Alice", email: "alice@erathia.io", password: "griffins7" }).profile;
    expect(source.toJSON().ocScores).toBeUndefined();
    source.ocScores.offer(row(alice.id, "all:endless", 70_000, 1));
    const snapshot = JSON.parse(JSON.stringify(source.toJSON()));
    expect(snapshot.ocScores).toHaveLength(1);

    const restored = new AccountStore({ mailer: new CaptureMailer() });
    restored.loadJSON(snapshot);
    expect(restored.ocScores.top("all:endless", 10)).toMatchObject([{ accountId: alice.id, nickname: "Alice", score: 70_000 }]);
    restored.banAccount(alice.id);
    expect(restored.ocScores.top("all:endless", 10)).toEqual([]);
    restored.unbanAccount(alice.id);
    restored.deleteAccount(alice.id);
    expect(restored.toJSON().ocScores).toBeUndefined();
  });
});

describe("Supabase O&C store requests", () => {
  it("shares rows across instances and guards the update with the held score", async () => {
    const h1 = supabaseHarness();
    const h2 = supabaseHarness(h1.db);
    h1.addAccount("u_a", "Alice");
    await h1.store.offer(row("u_a", "all:endless", 50_000, 1));
    // A second instance sees the same row and can't lower it.
    expect(await h2.store.offer(row("u_a", "all:endless", 10_000, 2))).toBe(false);
    expect((await h1.store.top("all:endless", 5))[0]!.score).toBe(50_000);
    const update = h1.db.requests.find((r) => r.method === "PATCH");
    expect(update?.url).toContain("score=lt.10000");
    expect(h1.db.rows(OC_SCORES_TABLE)).toHaveLength(1);
  });
});

describe.each(BACKENDS)("O&C board requests (%s)", (_name, make) => {
  const ctx = (limiter: OcPostLimiter, now: number, ip = "1.1.1.1") => ({ limiter, ip, now, today: TODAY });

  it("posts under the account nickname, ranks the run on its day and all-time boards, and serves them", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    h.addAccount("u_b", "Bob");
    const limiter = new OcPostLimiter();
    const bob = await postOcRunForAccount(h.store, { id: "u_b", nickname: "Bob" }, { run: siege(8, 100) }, ctx(limiter, T0));
    expect(bob.status).toBe(200);
    // The client's own name field (if any) is ignored: the account nickname is the name.
    const alice = await postOcRunForAccount(h.store, { id: "u_a", nickname: "Alice" }, { name: "Mallory", run: siege(5, 40) }, ctx(limiter, T0 + 1));
    expect(alice.status).toBe(200);
    expect(alice.body).toMatchObject({
      ok: true,
      score: 50_040,
      pid: ocAccountPid("u_a"),
      name: "Alice",
      today: { rank: 2, improved: true, best: { name: "Alice", score: 50_040, rank: 2, day: TODAY, pid: ocAccountPid("u_a") } },
      all: { rank: 2, improved: true }
    });
    // A worse run later: not improved, the earlier one still stands.
    const worse = await postOcRunForAccount(h.store, { id: "u_a", nickname: "Alice" }, { run: siege(3, 10) }, ctx(limiter, T0 + 10_000));
    expect(worse.body).toMatchObject({ ok: true, score: 30_010, today: { rank: 2, improved: false, best: { score: 50_040 } } });

    const today = await readOcBoard(h.store, new URLSearchParams({ mode: "endless", view: "today" }), TODAY);
    expect(today.status).toBe(200);
    expect(today.body.key).toBe(`day:${TODAY}:endless`);
    expect((today.body.rows as { name: string; rank: number; pid: string }[]).map((r) => [r.rank, r.name, r.pid])).toEqual([
      [1, "Bob", ocAccountPid("u_b")],
      [2, "Alice", ocAccountPid("u_a")]
    ]);
    const all = await readOcBoard(h.store, new URLSearchParams({ mode: "endless", view: "all" }), TODAY);
    expect((all.body.rows as unknown[]).length).toBe(2);
    // Raids have their own boards.
    const raid = await readOcBoard(h.store, new URLSearchParams({ mode: "raid", view: "all", raid: "r1" }), TODAY);
    expect(raid.body.rows).toEqual([]);
  });

  it("refuses runs the rules refuse, and one post per account inside 5 s", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    const limiter = new OcPostLimiter();
    const me = { id: "u_a", nickname: "Alice" };
    expect((await postOcRunForAccount(h.store, me, {}, ctx(limiter, T0))).status).toBe(400);
    const tooFast = await postOcRunForAccount(h.store, me, { run: siege(30, 10, { ticks: sec(30) }) }, ctx(limiter, T0));
    expect(tooFast).toMatchObject({ status: 400, body: { ok: false, error: "Too fast for that many waves." } });
    const lost = await postOcRunForAccount(h.store, me, { run: { ...siege(0, 0), mode: "raid", raid: "r1", won: false, wave: 0 } }, ctx(limiter, T0));
    expect(lost.status).toBe(400);
    // Refused runs don't use up the gap.
    expect((await postOcRunForAccount(h.store, me, { run: siege(4, 10) }, ctx(limiter, T0))).status).toBe(200);
    expect((await postOcRunForAccount(h.store, me, { run: siege(9, 10) }, ctx(limiter, T0 + 4_000))).status).toBe(429);
    expect((await postOcRunForAccount(h.store, me, { run: siege(9, 10) }, ctx(limiter, T0 + 5_000))).status).toBe(200);
    // Another account isn't held up by the first one's gap.
    h.addAccount("u_b", "Bob");
    expect((await postOcRunForAccount(h.store, { id: "u_b", nickname: "Bob" }, { run: siege(2, 1) }, ctx(limiter, T0 + 5_001))).status).toBe(200);
    expect((await h.store.top(`day:${TODAY}:endless`, OC_BOARD_SIZE)).map((r) => r.score)).toEqual([90_010, 20_001]);
  });

  it("keeps Daily Siege runs per day and setup, takes yesterday's orders, and closes older ones", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    const limiter = new OcPostLimiter();
    const me = { id: "u_a", nickname: "Alice" };
    const daily = (day: string, setup: string) => siege(6, 20, { mode: "daily", day, setup });
    expect((await postOcRunForAccount(h.store, me, { run: daily("2026-10-01", "aaaaaaaa") }, ctx(limiter, T0))).status).toBe(200);
    expect((await postOcRunForAccount(h.store, me, { run: daily("2026-09-30", "aaaaaaaa") }, ctx(limiter, T0 + 6_000))).body).toMatchObject({ error: "That Daily Siege has closed." });
    expect((await postOcRunForAccount(h.store, me, { run: daily(TODAY, "bbbbbbbb") }, ctx(limiter, T0 + 12_000))).status).toBe(200);
    const read = (day: string, setup: string) => readOcBoard(h.store, new URLSearchParams({ mode: "daily", view: "today", day, setup }), TODAY);
    expect((await read("2026-10-01", "aaaaaaaa")).body.rows).toHaveLength(1);
    expect((await read(TODAY, "bbbbbbbb")).body.rows).toMatchObject([{ day: TODAY, name: "Alice" }]);
    expect((await read(TODAY, "aaaaaaaa")).body.rows).toEqual([]);
    expect((await read("2026-09-29", "aaaaaaaa")).body).toMatchObject({ ok: true, key: "", rows: [] });
    // The all-time Daily board keeps the best across days.
    expect((await readOcBoard(h.store, new URLSearchParams({ mode: "daily", view: "all" }), TODAY)).body.rows).toHaveLength(1);
    expect((await readOcBoard(h.store, new URLSearchParams({ mode: "nope", view: "all" }), TODAY)).status).toBe(400);
    expect((await readOcBoard(h.store, new URLSearchParams({ mode: "daily", view: "today", day: TODAY, setup: "XYZ" }), TODAY)).status).toBe(400);
  });

  it("drops day boards older than yesterday on the first post of a day", async () => {
    const h = make();
    h.addAccount("u_a", "Alice");
    await h.store.offer(row("u_a", "day:2026-09-30:endless", 10, 1, { day: "2026-09-30" }));
    await h.store.offer(row("u_a", "day:2026-10-01:endless", 10, 1, { day: "2026-10-01" }));
    await postOcRunForAccount(h.store, { id: "u_a", nickname: "Alice" }, { run: siege(2, 2) }, ctx(new OcPostLimiter(), T0));
    expect(await h.store.top("day:2026-09-30:endless", 10)).toEqual([]);
    expect(await h.store.top("day:2026-10-01:endless", 10)).toHaveLength(1);
  });
});
