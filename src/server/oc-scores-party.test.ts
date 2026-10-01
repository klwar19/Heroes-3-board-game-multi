import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OcScoresServer from "../../party/oc-scores";
import { sec } from "@/engine/garrison/clock";
import { ocMinTicksForWave, ocPublicId, type OcRunSummary } from "@/engine/garrison/order-chaos/scores";

/**
 * The Order & Chaos tally-board Durable Object (party/oc-scores.ts) over a
 * Map-backed stand-in for its storage. PartyKit's types are `import type`
 * only, so the class runs under plain vitest.
 */

type RoomCtor = ConstructorParameters<typeof OcScoresServer>[0];
type ScoreRequest = Parameters<OcScoresServer["onRequest"]>[0];

function makeFakeRoom() {
  const store = new Map<string, unknown>();
  const room = {
    id: "global",
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return store.has(key) ? (structuredClone(store.get(key)) as T) : undefined;
      },
      async put(key: string, value: unknown): Promise<void> {
        store.set(key, structuredClone(value));
      },
      async delete(key: string | string[]): Promise<boolean | number> {
        if (Array.isArray(key)) return key.filter((k) => store.delete(k)).length;
        return store.delete(key);
      },
      async list<T>(options: { prefix?: string } = {}): Promise<Map<string, T>> {
        const out = new Map<string, T>();
        for (const [key, value] of [...store.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          if (!options.prefix || key.startsWith(options.prefix)) out.set(key, structuredClone(value) as T);
        }
        return out;
      }
    }
  };
  return { room: room as unknown as RoomCtor, store };
}

const BASE = "https://heroes3bg-rooms.partykit.dev/parties/ocscores/global";
const TODAY = "2026-10-01";
const ALICE = "oc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "oc_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function siege(wave: number, kills: number, over: Partial<OcRunSummary> = {}): OcRunSummary {
  return { mode: "endless", won: false, wave, kills, ticks: ocMinTicksForWave(wave) + sec(60), lost: 2, placed: 15, hero: "catherine", ...over };
}

async function post(server: OcScoresServer, cid: string, name: string, run: unknown, ip = "1.1.1.1") {
  const request = new Request(BASE, { method: "POST", headers: { "Content-Type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ cid, name, run }) });
  const response = await server.onRequest(request as unknown as ScoreRequest);
  return { status: response.status, data: (await response.json()) as Record<string, any> };
}

async function board(server: OcScoresServer, query: string) {
  const response = await server.onRequest(new Request(`${BASE}?${query}`) as unknown as ScoreRequest);
  return { status: response.status, data: (await response.json()) as { ok: boolean; rows: Record<string, any>[] } };
}

/** Moves the clock on (past the per-player posting gap). */
const later = (ms = 10_000) => vi.setSystemTime(Date.now() + ms);

describe("Order & Chaos tally boards (party/oc-scores.ts)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-derives the score, keeps a player's best only and never shows their private id", async () => {
    const server = new OcScoresServer(makeFakeRoom().room);
    // A client-sent score is ignored: the server computes it from the run.
    const first = await post(server, ALICE, "Alice", { ...siege(12, 150), score: 999_999_999 });
    expect(first.status).toBe(200);
    expect(first.data.score).toBe(120_150);
    expect(first.data.today.rank).toBe(1);

    later();
    const worse = await post(server, ALICE, "Alice the Bold", siege(9, 400));
    expect(worse.data.today.improved).toBe(false);
    later();
    const better = await post(server, ALICE, "Alice the Bold", siege(15, 10));
    expect(better.data.all.improved).toBe(true);

    const today = await board(server, "mode=endless&view=today");
    expect(today.data.rows).toHaveLength(1);
    expect(today.data.rows[0]).toMatchObject({ rank: 1, name: "Alice the Bold", score: 150_010, wave: 15, kills: 10, pid: ocPublicId(ALICE), day: TODAY });
    expect(JSON.stringify(today.data)).not.toContain(ALICE);
  });

  it("orders the board by score, earlier post first on a tie", async () => {
    const server = new OcScoresServer(makeFakeRoom().room);
    await post(server, BOB, "Bob", siege(10, 50));
    later();
    await post(server, ALICE, "Alice", siege(10, 50));
    later();
    await post(server, "oc_cccccccccccccccccccccccccccccccc", "Cat", siege(11, 0));
    const all = await board(server, "mode=endless&view=all");
    expect(all.data.rows.map((row) => row.name)).toEqual(["Cat", "Bob", "Alice"]);
  });

  it("turns away implausible runs, missing names and rapid reposts", async () => {
    const server = new OcScoresServer(makeFakeRoom().room);
    expect((await post(server, ALICE, "Alice", siege(40, 10, { ticks: sec(60) }))).status).toBe(400);
    expect((await post(server, ALICE, "   ", siege(10, 10))).status).toBe(400);
    expect((await post(server, "short", "Alice", siege(10, 10))).status).toBe(400);
    expect((await post(server, ALICE, "Alice", siege(10, 10))).status).toBe(200);
    expect((await post(server, ALICE, "Alice", siege(11, 10))).status).toBe(429);
    const rows = (await board(server, "mode=endless&view=all")).data.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.wave).toBe(10);
  });

  it("serves a fresh page after a post (the GET cache is dropped when a board changes)", async () => {
    const server = new OcScoresServer(makeFakeRoom().room);
    expect((await board(server, "mode=raid&view=all&raid=r2")).data.rows).toEqual([]);
    const raid: OcRunSummary = { mode: "raid", raid: "r2", won: true, wave: 0, kills: 6, ticks: sec(95), lost: 10, placed: 0 };
    expect((await post(server, BOB, "Bob", raid)).status).toBe(200);
    const rows = (await board(server, "mode=raid&view=all&raid=r2")).data.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticks).toBe(sec(95));
  });

  it("keeps each Daily Siege setup on its own day board, all of them on the all-time board", async () => {
    const server = new OcScoresServer(makeFakeRoom().room);
    const daily = (setup: string, wave: number) => siege(wave, 5, { mode: "daily", day: TODAY, setup });
    await post(server, ALICE, "Alice", daily("0000aaaa", 8));
    later();
    await post(server, BOB, "Bob", daily("0000bbbb", 9));
    expect((await board(server, `mode=daily&view=today&day=${TODAY}&setup=0000aaaa`)).data.rows.map((row) => row.name)).toEqual(["Alice"]);
    expect((await board(server, `mode=daily&view=today&day=${TODAY}&setup=0000bbbb`)).data.rows.map((row) => row.name)).toEqual(["Bob"]);
    expect((await board(server, "mode=daily&view=all")).data.rows.map((row) => row.name)).toEqual(["Bob", "Alice"]);
    // Two days old: closed.
    later();
    expect((await post(server, ALICE, "Alice", siege(20, 5, { mode: "daily", day: "2026-09-29", setup: "0000aaaa" }))).status).toBe(400);
  });

  it("caps a day's Daily Siege variants even when each board was looked at before its first post", async () => {
    const { room, store } = makeFakeRoom();
    const server = new OcScoresServer(room);
    for (let i = 0; i < 12; i += 1) {
      const setup = `0000${String(i).padStart(4, "0")}`;
      // The client opens the day's board (an empty page) before it posts there.
      expect((await board(server, `mode=daily&view=today&day=${TODAY}&setup=${setup}`)).data.rows).toEqual([]);
      later();
      const run = siege(5, 5, { mode: "daily", day: TODAY, setup });
      expect((await post(server, `oc_${String(i).padStart(32, "0")}`, `P${i}`, run)).status).toBe(200);
    }
    const variants = [...store.keys()].filter((key) => key.startsWith(`b:day:${TODAY}:daily:`));
    expect(variants.length).toBe(8);
  });

  it("drops day boards older than yesterday on the first post of a day, and keeps storage per board bounded", async () => {
    const { room, store } = makeFakeRoom();
    store.set("b:day:2026-09-20:endless", [{ cid: BOB, pid: "x", name: "Old", score: 1, wave: 1, kills: 0, ticks: 1, day: "2026-09-20", at: 1 }]);
    store.set("b:day:2026-09-30:endless", [{ cid: BOB, pid: "x", name: "Yesterday", score: 1, wave: 1, kills: 0, ticks: 1, day: "2026-09-30", at: 1 }]);
    const server = new OcScoresServer(room);
    for (let i = 0; i < 105; i += 1) {
      later();
      await post(server, `oc_${String(i).padStart(32, "0")}`, `P${i}`, siege(5 + (i % 7), i), `10.0.${Math.floor(i / 30)}.${i}`);
    }
    expect(store.has("b:day:2026-09-20:endless")).toBe(false);
    expect(store.has("b:day:2026-09-30:endless")).toBe(true);
    expect((store.get(`b:day:${TODAY}:endless`) as unknown[]).length).toBe(100);
    expect((store.get("b:all:endless") as unknown[]).length).toBe(100);
  });
});
