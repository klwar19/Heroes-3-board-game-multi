import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Stage the built-in store in a throwaway dir BEFORE the route module (and its
// singleton) loads.
const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-match-route-"));
const REPLAY_DIR = mkdtempSync(join(tmpdir(), "homm3bg-replay-route-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;
process.env.HOMM3BG_REPLAY_DIR = REPLAY_DIR;

/**
 * The /api/matches/report route — the PartyKit edge's only way to write ladder
 * results. The shared HOMM3BG_MATCH_REPORT_KEY is the entire trust boundary,
 * so the gate is what this suite pins hardest.
 */

function report(body: unknown, key?: string): Request {
  return new Request("http://x/api/matches/report", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-homm3bg-report-key": key } : {}) },
    body: JSON.stringify(body)
  });
}

describe("/api/matches/report", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
    rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
    rmSync(REPLAY_DIR, { recursive: true, force: true });
    delete process.env.HOMM3BG_MATCH_REPORT_KEY;
  });
  afterAll(() => {
    delete process.env.HOMM3BG_MATCH_REPORT_KEY;
    rmSync(ACCOUNT_DIR, { recursive: true, force: true });
    rmSync(REPLAY_DIR, { recursive: true, force: true });
  });

  it("is a hard 403 with the env key unset — even a 'correct-looking' header never matches", async () => {
    const { POST } = await import("./route");
    const res = await POST(report({ matchId: "m1", participants: [] }, ""));
    expect(res.status).toBe(403);
    const res2 = await POST(report({ matchId: "m1", participants: [] }, "guessed-key"));
    expect(res2.status).toBe(403);
  });

  it("rejects a wrong key and accepts the configured one exactly once per matchId", async () => {
    process.env.HOMM3BG_MATCH_REPORT_KEY = "shared-secret-9";
    const { POST } = await import("./route");
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@erathia.io", password: "swordsman1" });
    const payload = {
      matchId: "room-9:seed-1",
      participants: [
        { accountId: cat.id, result: "win" },
        { accountId: rol.id, result: "loss" }
      ],
      replay: {
        format: "homm3bg-ranked-replay-v1",
        schemaVersion: 1,
        engineSignature: "test-engine",
        matchId: "room-9:seed-1",
        startedAt: new Date(0).toISOString(),
        initialState: {},
        entries: [],
        byteLength: 256,
        truncated: false
      }
    };

    expect((await POST(report(payload, "wrong"))).status).toBe(403);
    expect(store.getProfileById(cat.id)!.mmr).toBe(1200); // gate held

    const ok = await POST(report(payload, "shared-secret-9"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ applied: true, replayStored: true });
    expect(existsSync(join(REPLAY_DIR, "room-9_3Aseed-1.json"))).toBe(true);
    expect(store.getProfileById(cat.id)!.mmr).toBe(1216);
    expect(store.getProfileById(rol.id)!.mmr).toBe(1184);
    expect(store.getProfileById(cat.id)!.wins).toBe(1);

    // Redelivery (the edge retrying, a duplicate action broadcast) is a no-op.
    const dup = await POST(report(payload, "shared-secret-9"));
    expect((await dup.json()).applied).toBe(false);
    expect(store.getProfileById(cat.id)!.mmr).toBe(1216);
  });

  it("a casual (ranked:false) report records the win/loss but leaves MMR at 1200", async () => {
    process.env.HOMM3BG_MATCH_REPORT_KEY = "shared-secret-9";
    const { POST } = await import("./route");
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@erathia.io", password: "swordsman1" });

    const ok = await POST(
      report(
        {
          matchId: "casual-9:seed-1",
          ranked: false,
          participants: [
            { accountId: cat.id, result: "win" },
            { accountId: rol.id, result: "loss" }
          ]
        },
        "shared-secret-9"
      )
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).applied).toBe(true);
    // W/L counted (the give-up / quit shows up), MMR untouched — the CONTROL is
    // the ranked test above where the same result moved MMR to 1216/1184.
    expect(store.getProfileById(cat.id)!.wins).toBe(1);
    expect(store.getProfileById(rol.id)!.losses).toBe(1);
    expect(store.getProfileById(cat.id)!.mmr).toBe(1200);
    expect(store.getProfileById(rol.id)!.mmr).toBe(1200);
  });

  it("rejects malformed payloads (missing matchId, fewer than two valid participants)", async () => {
    process.env.HOMM3BG_MATCH_REPORT_KEY = "shared-secret-9";
    const { POST } = await import("./route");
    expect((await POST(report({ participants: [{ accountId: "u_x", result: "win" }, { accountId: "u_y", result: "loss" }] }, "shared-secret-9"))).status).toBe(400);
    expect((await POST(report({ matchId: "m", participants: [{ accountId: "u_x", result: "win" }] }, "shared-secret-9"))).status).toBe(400);
    expect(
      (
        await POST(
          report({ matchId: "m", participants: [{ accountId: "u_x", result: "banana" }, { accountId: "u_y", result: "loss" }] }, "shared-secret-9")
        )
      ).status
    ).toBe(400);
  });

  it("rejects an oversized replay request before JSON ingestion can grow unbounded", async () => {
    process.env.HOMM3BG_MATCH_REPORT_KEY = "shared-secret-9";
    const { POST } = await import("./route");
    const response = await POST(report({ matchId: "huge", participants: [], padding: "x".repeat(1_700_001) }, "shared-secret-9"));
    expect(response.status).toBe(413);
  });
});
