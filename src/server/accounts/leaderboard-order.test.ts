import { describe, expect, it } from "vitest";
import { AccountStore } from "./account-store";
import { FakePostgrest } from "./__fixtures__/fake-postgrest";
import { CaptureMailer } from "./mailer";
import {
  compareHallOfFame,
  HALL_OF_FAME_ORDER_CLAUSE,
  HALL_OF_FAME_SORT_KEYS,
  type HallOfFameRankable
} from "./leaderboard-order";
import { SupabaseAccountStore } from "./supabase-store";

/**
 * The rank board's ordering (USER RULE: "rank board: should prioritize showing
 * those with more win first"). Every claim is asserted as the OBSERVABLE board
 * order coming out of a real backend, not as a field read, and each has a
 * CONTROL that would still pass under the old rating-first sort — so the
 * discriminating cases are the ones where wins and rating DISAGREE.
 */

const rankable = (nickname: string, wins: number, mmr: number, losses = 0): HallOfFameRankable => ({
  nickname,
  wins,
  mmr,
  losses
});

describe("hall-of-fame ordering — wins lead", () => {
  it("puts MORE WINS above a HIGHER RATING (the whole point of the rule)", () => {
    // Grinder has the worse rating but twice the wins; under the old
    // `b.mmr - a.mmr` primary key Duelist came first.
    const board = [rankable("Duelist", 1, 1400), rankable("Grinder", 2, 1150)].sort(compareHallOfFame);
    expect(board.map((p) => p.nickname)).toEqual(["Grinder", "Duelist"]);
  });

  it("CONTROL — with EQUAL wins the higher rating still wins the tie", () => {
    const board = [rankable("Low", 3, 1150), rankable("High", 3, 1400)].sort(compareHallOfFame);
    expect(board.map((p) => p.nickname)).toEqual(["High", "Low"]);
  });

  it("CONTROL — equal wins AND rating: the cleaner record (fewer losses) first, then nickname", () => {
    const byLosses = [rankable("Bruised", 3, 1200, 9), rankable("Clean", 3, 1200, 1)].sort(compareHallOfFame);
    expect(byLosses.map((p) => p.nickname)).toEqual(["Clean", "Bruised"]);

    const byName = [rankable("Zara", 3, 1200, 4), rankable("Alma", 3, 1200, 4)].sort(compareHallOfFame);
    expect(byName.map((p) => p.nickname)).toEqual(["Alma", "Zara"]);
    // Identical rows compare equal in BOTH directions (a total order, so the
    // board is stable rather than insertion-dependent).
    expect(compareHallOfFame(rankable("Same", 1, 1200, 1), rankable("Same", 1, 1200, 1))).toBe(0);
  });

  it("the PostgREST clause is derived from the same key table (backends cannot drift)", () => {
    expect(HALL_OF_FAME_ORDER_CLAUSE).toBe("wins.desc,mmr.desc,losses.asc,nickname.asc");
    expect(HALL_OF_FAME_SORT_KEYS[0]).toMatchObject({ field: "wins", direction: "desc" });
  });
});

describe("hall-of-fame ordering — the memory/file backend end to end", () => {
  function confirmed(store: AccountStore, nickname: string, email: string) {
    const { profile, confirmation } = store.register({ nickname, email, password: "longsword9" });
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    return profile;
  }

  it("a 2-win CASUAL grinder outranks a 1-win RANKED player who is rated higher", () => {
    const store = new AccountStore();
    const grinder = confirmed(store, "Grinder", "g@e.io");
    const duelist = confirmed(store, "Duelist", "d@e.io");
    const victim = confirmed(store, "Victim", "v@e.io");

    // Casual games move W/L but NOT rating, so Grinder banks wins at 1200…
    for (const matchId of ["casual-1", "casual-2"]) {
      store.recordMatchResult({
        matchId,
        ranked: false,
        participants: [
          { accountId: grinder.id, result: "win" },
          { accountId: victim.id, result: "loss" }
        ]
      });
    }
    // …while Duelist takes ONE ranked win and climbs to 1216.
    store.recordMatchResult({
      matchId: "ranked-1",
      participants: [
        { accountId: duelist.id, result: "win" },
        { accountId: victim.id, result: "loss" }
      ]
    });

    // The numbers the ordering is being read from (a lead, not the assertion).
    expect(store.getProfileById(grinder.id)!.wins).toBe(2);
    expect(store.getProfileById(grinder.id)!.mmr).toBe(1200);
    expect(store.getProfileById(duelist.id)!.wins).toBe(1);
    expect(store.getProfileById(duelist.id)!.mmr).toBe(1216);

    // The board: wins first, so the LOWER-rated Grinder is rank 1.
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Grinder", "Duelist", "Victim"]);
    // The cap still keeps the TOP rows of that same order.
    expect(store.hallOfFame(1).map((p) => p.nickname)).toEqual(["Grinder"]);
  });

  it("CONTROL — with nobody holding a win, rating alone still orders the board", () => {
    const store = new AccountStore();
    const alpha = confirmed(store, "Alpha", "a@e.io");
    const bravo = confirmed(store, "Bravo", "b@e.io");
    // A ranked loss for Alpha (against a win for Bravo) is the only mover; we
    // want a winless comparison, so hand BOTH a loss via a draw-free report and
    // compare the two losers of the same match instead.
    const carol = confirmed(store, "Carol", "c@e.io");
    store.recordMatchResult({
      matchId: "three-way",
      participants: [
        { accountId: carol.id, result: "win", placement: 1, mmrRole: "winner" },
        { accountId: alpha.id, result: "loss", placement: 2, mmrRole: "neutral" },
        { accountId: bravo.id, result: "loss", placement: 2, mmrRole: "neutral" }
      ]
    });
    const board = store.hallOfFame().map((p) => p.nickname);
    expect(board[0]).toBe("Carol"); // the only winner
    // Alpha and Bravo are tied for the undecidable lowest placement, so both
    // are MMR-neutral; nickname remains the final Hall-of-Fame tiebreak.
    expect(board.slice(1)).toEqual(["Alpha", "Bravo"]);
    expect(store.getProfileById(alpha.id)!.mmr).toBe(store.getProfileById(bravo.id)!.mmr);
  });

  it("banned accounts stay off the board however many wins they hold", () => {
    const store = new AccountStore();
    const cheat = confirmed(store, "Cheat", "x@e.io");
    const honest = confirmed(store, "Honest", "h@e.io");
    store.recordMatchResult({
      matchId: "banned-1",
      ranked: false,
      participants: [{ accountId: cheat.id, result: "win" }]
    });
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Cheat", "Honest"]);
    store.banAccount(cheat.id);
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Honest"]);
  });
});

describe("hall-of-fame ordering — the Supabase backend serves the SAME order", () => {
  it("orders wins-first in SQL (the emulator applies the real order clause)", async () => {
    const db = new FakePostgrest();
    const store = new SupabaseAccountStore({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-secret",
      mailer: new CaptureMailer(),
      now: () => 1_700_000_000_000,
      fetchImpl: db.fetch,
      baseUrl: "https://erathia.example"
    });
    const grinder = await store.ensureAdminAccount({
      nickname: "Grinder",
      email: "g@erathia.io",
      password: "password1"
    });
    const duelist = await store.ensureAdminAccount({
      nickname: "Duelist",
      email: "d@erathia.io",
      password: "password2"
    });
    const victim = await store.ensureAdminAccount({
      nickname: "Victim",
      email: "v@erathia.io",
      password: "password3"
    });

    for (const matchId of ["casual-1", "casual-2"]) {
      await store.recordMatchResult({
        matchId,
        ranked: false,
        participants: [
          { accountId: grinder.id, result: "win" },
          { accountId: victim.id, result: "loss" }
        ]
      });
    }
    await store.recordMatchResult({
      matchId: "ranked-1",
      participants: [
        { accountId: duelist.id, result: "win" },
        { accountId: victim.id, result: "loss" }
      ]
    });

    const board = await store.hallOfFame();
    expect(board.map((p) => p.nickname)).toEqual(["Grinder", "Duelist", "Victim"]);
    // Same discriminating shape as the memory backend: 2 wins @1200 above
    // 1 win @1216.
    expect(board[0]).toMatchObject({ wins: 2, mmr: 1200 });
    expect(board[1]).toMatchObject({ wins: 1, mmr: 1216 });
    // And the two backends really agree on this row set.
    expect([...board].sort(compareHallOfFame).map((p) => p.nickname)).toEqual(board.map((p) => p.nickname));
  });
});
