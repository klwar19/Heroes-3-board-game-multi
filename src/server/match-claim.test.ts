import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  matchClaimFingerprint,
  parkDualClaim,
  PendingMatchClaimBoard,
  validateMatchClaim
} from "./match-claim";

const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-match-claim-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;

describe("validateMatchClaim", () => {
  it("accepts a 2-player claim when the claimer is a participant", () => {
    const result = validateMatchClaim("u_cat", {
      matchId: "room-r1-nonce1",
      ranked: true,
      participants: [
        { accountId: "u_cat", result: "win" },
        { accountId: "u_rol", result: "loss" }
      ]
    });
    expect(result).toEqual({
      ok: true,
      claim: {
        matchId: "room-r1-nonce1",
        ranked: true,
        participants: [
          { accountId: "u_cat", result: "win" },
          { accountId: "u_rol", result: "loss" }
        ]
      }
    });
  });

  it("rejects a claimer who is not a participant (CONTROL)", () => {
    const result = validateMatchClaim("u_lurk", {
      matchId: "room-r1-nonce1",
      participants: [
        { accountId: "u_cat", result: "win" },
        { accountId: "u_rol", result: "loss" }
      ]
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a claim with no loser", () => {
    const result = validateMatchClaim("u_cat", {
      matchId: "room-r1-nonce1",
      participants: [
        { accountId: "u_cat", result: "win" },
        { accountId: "u_rol", result: "win" }
      ]
    });
    expect(result.ok).toBe(false);
  });
});

describe("parkDualClaim", () => {
  it("parks the first claim and is ready on the second agreeing participant", () => {
    const board = new PendingMatchClaimBoard();
    const claim = {
      matchId: "room-r1-nonce1",
      ranked: true,
      participants: [
        { accountId: "u_cat", result: "win" as const },
        { accountId: "u_rol", result: "loss" as const }
      ]
    };
    expect(parkDualClaim("u_cat", claim, board)).toMatchObject({ status: "pending", claimers: 1 });
    expect(parkDualClaim("u_rol", claim, board)).toMatchObject({ status: "ready", claimers: 2 });
  });

  it("rejects a conflicting payload from a second claimer (CONTROL)", () => {
    const board = new PendingMatchClaimBoard();
    const winCat = {
      matchId: "room-r1-nonce1",
      ranked: true,
      participants: [
        { accountId: "u_cat", result: "win" as const },
        { accountId: "u_rol", result: "loss" as const }
      ]
    };
    const winRol = {
      matchId: "room-r1-nonce1",
      ranked: true,
      participants: [
        { accountId: "u_cat", result: "loss" as const },
        { accountId: "u_rol", result: "win" as const }
      ]
    };
    expect(parkDualClaim("u_cat", winCat, board).status).toBe("pending");
    expect(parkDualClaim("u_rol", winRol, board).status).toBe("rejected");
    expect(matchClaimFingerprint(winCat)).not.toBe(matchClaimFingerprint(winRol));
  });
});

describe("AccountStore.claimMatchResult — records only after two claims", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
    rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
  });
  afterAll(() => rmSync(ACCOUNT_DIR, { recursive: true, force: true }));

  it("first claim parks; second agreeing claim records W/L (give-up style)", async () => {
    const { getAccountStore } = await import("./accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@claim.io", password: "password1" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@claim.io", password: "password1" });
    const participants = [
      { accountId: cat.id, result: "win" as const },
      { accountId: rol.id, result: "loss" as const }
    ];

    const first = store.claimMatchResult({
      claimerAccountId: cat.id,
      matchId: "room-giveup-claim-1",
      ranked: true,
      participants
    });
    expect(first.status).toBe("pending");
    expect(store.getProfileById(cat.id)!.matches).toBe(0);

    const second = store.claimMatchResult({
      claimerAccountId: rol.id,
      matchId: "room-giveup-claim-1",
      ranked: true,
      participants
    });
    expect(second.status).toBe("recorded");
    expect(store.getProfileById(cat.id)!.wins).toBe(1);
    expect(store.getProfileById(rol.id)!.losses).toBe(1);
    expect(store.getProfileById(cat.id)!.matches).toBe(1);

    // Third claim (or redelivery) is already-recorded.
    const third = store.claimMatchResult({
      claimerAccountId: cat.id,
      matchId: "room-giveup-claim-1",
      ranked: true,
      participants
    });
    expect(third.status).toBe("already-recorded");
    expect(store.getProfileById(cat.id)!.wins).toBe(1);
  });

  it("CONTROL: a single claimer never moves W/L alone", async () => {
    const { getAccountStore } = await import("./accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "SoloCat", email: "solo@claim.io", password: "password1" });
    const rol = store.ensureAdminAccount({ nickname: "SoloRol", email: "solor@claim.io", password: "password1" });
    const once = store.claimMatchResult({
      claimerAccountId: cat.id,
      matchId: "room-solo-claim",
      participants: [
        { accountId: cat.id, result: "win" },
        { accountId: rol.id, result: "loss" }
      ]
    });
    expect(once.status).toBe("pending");
    expect(store.getProfileById(cat.id)!.wins).toBe(0);
    expect(store.getProfileById(rol.id)!.losses).toBe(0);
  });
});
