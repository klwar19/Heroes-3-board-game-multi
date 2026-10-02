import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sec } from "@/engine/garrison/clock";
import { ocMinTicksForWave, type OcRunSummary } from "@/engine/garrison/order-chaos/scores";
import { ocAccountPid } from "@/lib/oc-account-pid";

// The built-in account backend in a throwaway dir, accounts confirmed at once,
// set BEFORE the route (and its singletons) is imported.
const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-oc-scores-route-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;
process.env.HOMM3BG_MAIL_TRANSPORT = "capture";
process.env.HOMM3BG_REQUIRE_EMAIL_CONFIRMATION = "0";
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const URL_BASE = "http://x/api/order-chaos/scores";

function siege(wave: number, kills: number): OcRunSummary {
  return { mode: "endless", won: false, wave, kills, ticks: ocMinTicksForWave(wave) + sec(60), lost: 0, placed: 12, hero: "catherine" };
}

function postRequest(body: unknown, cookie?: string): Request {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}

async function signedIn(nickname: string): Promise<{ cookie: string; id: string }> {
  const { getAccountStore } = await import("@/server/accounts/account-store-instance");
  const store = getAccountStore();
  const { profile } = store.register({ nickname, email: `${nickname.toLowerCase()}@erathia.io`, password: "griffins7" });
  const { token } = store.login({ identifier: nickname, password: "griffins7" });
  return { cookie: `homm3bg_session=${encodeURIComponent(token)}`, id: profile.id };
}

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  g.__homm3bgAccountStore = undefined;
  g.__homm3bgOcPostLimiter = undefined;
  rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
});
afterEach(() => rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true }));

describe("/api/order-chaos/scores", () => {
  it("refuses a post without a signed-in account and keeps the board empty", async () => {
    const route = await import("./route");
    const response = await route.POST(postRequest({ name: "Guest", run: siege(4, 4) }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, signedOut: true });
    const board = await route.GET(new Request(`${URL_BASE}?mode=endless&view=all`));
    expect(board.status).toBe(200);
    expect(board.headers.get("cache-control")).toBe("public, max-age=10");
    expect((await board.json()).rows).toEqual([]);
  });

  it("posts under the account nickname, persists with the accounts, and serves the row to everyone", async () => {
    const route = await import("./route");
    const alice = await signedIn("Alice");
    const response = await route.POST(postRequest({ name: "Not Alice", run: siege(7, 30) }, alice.cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      score: 70_030,
      name: "Alice",
      pid: ocAccountPid(alice.id),
      today: { rank: 1, improved: true },
      all: { rank: 1, improved: true, best: { name: "Alice", score: 70_030 } }
    });
    // Saved in the built-in store's snapshot, under the account.
    const file = join(ACCOUNT_DIR, "accounts.json");
    expect(existsSync(file)).toBe(true);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { ocScores?: { accountId: string; boardKey: string }[] };
    expect(saved.ocScores?.map((r) => [r.accountId, r.boardKey]).sort()).toEqual([
      [alice.id, "all:endless"],
      [alice.id, expect.stringMatching(/^day:\d{4}-\d{2}-\d{2}:endless$/)]
    ]);
    // Anyone (no cookie) reads it, with the nickname and the account's public id.
    const board = await route.GET(new Request(`${URL_BASE}?mode=endless&view=all`));
    expect((await board.json()).rows).toMatchObject([{ rank: 1, name: "Alice", score: 70_030, pid: ocAccountPid(alice.id), hero: "catherine" }]);
  });

  it("holds one account to one post every 5 s and turns away implausible runs", async () => {
    const route = await import("./route");
    const bob = await signedIn("Bob");
    expect((await route.POST(postRequest({ run: { ...siege(9, 9), ticks: 10 } }, bob.cookie))).status).toBe(400);
    expect((await route.POST(postRequest({ run: siege(2, 2) }, bob.cookie))).status).toBe(200);
    const again = await route.POST(postRequest({ run: siege(3, 3) }, bob.cookie));
    expect(again.status).toBe(429);
    expect((await route.POST(postRequest("not json at all", bob.cookie))).status).toBe(400);
    const unknown = await route.GET(new Request(`${URL_BASE}?mode=nope&view=all`));
    expect(unknown.status).toBe(400);
  });
});
