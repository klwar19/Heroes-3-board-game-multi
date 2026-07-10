import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, type GameState, type RoomMember, type RoomMembershipState } from "@/engine";
import { detectFinishedMatch, gameIsOver } from "./match-report";

// Isolate the built-in account store used by the integration tests below. The
// trigger module is imported DYNAMICALLY inside the tests: a static import
// would hoist account-store-instance's module-level persist path above this
// env assignment and silently point the store at the shared default tmpdir.
const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-match-report-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;

async function loadReporter() {
  return (await import("./match-report-trigger")).reportFinishedMatch;
}

/**
 * Automatic match reporting (plan Phase 6): the pure game-over detector both
 * backends share, and the built-in trigger writing real W/L + Elo through
 * `recordMatchResult`. Every rule has a control that diverges when the wiring
 * is removed or loosened.
 */

function member(partial: Partial<RoomMember> & { clientId: string }): RoomMember {
  return { name: partial.clientId, seat: "observer", isHost: false, ...partial };
}

function stateWith(options: {
  over?: boolean;
  winnerSeat?: string | null;
  members?: RoomMember[];
  seed?: string;
  matchSeats?: RoomMembershipState["matchSeats"];
}): GameState {
  const over = options.over ?? false;
  return {
    seed: options.seed ?? "room-r1-nonce42",
    phase: over ? "game-over" : "adventure",
    adventure: { winnerPlayerId: over ? (options.winnerSeat === null ? undefined : (options.winnerSeat ?? "p1")) : undefined },
    room: options.members
      ? {
          hosted: true,
          hostClientId: options.members[0]?.clientId ?? null,
          members: options.members,
          ...(options.matchSeats ? { matchSeats: options.matchSeats } : {})
        }
      : null
  } as unknown as GameState;
}

const TWO_ACCOUNT_MEMBERS: RoomMember[] = [
  member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true }),
  member({ clientId: "c2", name: "Roland", seat: "p2", userId: "u_rol" }),
  member({ clientId: "c3", name: "Lurker", seat: "observer", userId: "u_lurk" }),
  member({ clientId: "c4", name: "Guest", seat: "p3" }) // no account
];

describe("detectFinishedMatch — the shared game-over → ranked-result detector", () => {
  it("maps the winner seat to a win and every other seated account to a loss, keyed by the game seed", () => {
    const match = detectFinishedMatch(
      stateWith({ over: false, members: TWO_ACCOUNT_MEMBERS }),
      stateWith({ over: true, winnerSeat: "p1", members: TWO_ACCOUNT_MEMBERS })
    );
    expect(match).not.toBeNull();
    expect(match!.matchId).toBe("room-r1-nonce42");
    // Observers and guests are invisible to the ladder.
    expect(match!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "loss" }
    ]);
  });

  it("reports a seat removed by the AFK kick vote as 'abandon' (a loss for Elo, a distinguishable record)", () => {
    // The kicked player stays a seated room member (elimination never unseats),
    // so they still receive their result — as "abandon", which the account
    // store scores exactly like a loss. A 2-account game whose only loser was
    // kicked must still count as ranked (the abandoner IS the loser).
    const prev = stateWith({ over: false, members: TWO_ACCOUNT_MEMBERS });
    const next = stateWith({ over: true, winnerSeat: "p1", members: TWO_ACCOUNT_MEMBERS });
    (next as { players?: unknown }).players = { p2: { eliminated: true, kickedByVote: true } };
    const match = detectFinishedMatch(prev, next);
    expect(match!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "abandon" }
    ]);

    // CONTROL: an ordinary elimination (not kicked) stays a plain loss.
    const fought = stateWith({ over: true, winnerSeat: "p1", members: TWO_ACCOUNT_MEMBERS });
    (fought as { players?: unknown }).players = { p2: { eliminated: true } };
    expect(detectFinishedMatch(prev, fought)!.participants[1]).toEqual({
      accountId: "u_rol",
      nickname: "Roland",
      result: "loss"
    });
  });

  it("CONTROL: fires only on the transition — an already-finished game never re-reports", () => {
    const finished = stateWith({ over: true, winnerSeat: "p1", members: TWO_ACCOUNT_MEMBERS });
    expect(detectFinishedMatch(finished, finished)).toBeNull();
    expect(detectFinishedMatch(stateWith({ over: false, members: TWO_ACCOUNT_MEMBERS }), stateWith({ over: false, members: TWO_ACCOUNT_MEMBERS }))).toBeNull();
    expect(gameIsOver(finished)).toBe(true);
  });

  it("attributes nothing without a human winner seat (bare game-over, neutral winner)", () => {
    const prev = stateWith({ over: false, members: TWO_ACCOUNT_MEMBERS });
    expect(detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: null, members: TWO_ACCOUNT_MEMBERS }))).toBeNull();
    expect(detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: "neutral", members: TWO_ACCOUNT_MEMBERS }))).toBeNull();
  });

  it("requires two distinct verified accounts including a winner AND a loser", () => {
    const prev = stateWith({ over: false });
    // Solo account (opponent is a guest) → not ranked.
    const soloMembers = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat" }),
      member({ clientId: "c4", name: "Guest", seat: "p2" })
    ];
    expect(detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: "p1", members: soloMembers }))).toBeNull();
    // The winner seat holds no account (a guest won) → the losers are not farmed.
    const guestWinner = [
      member({ clientId: "c1", name: "Guest", seat: "p1" }),
      member({ clientId: "c2", name: "Roland", seat: "p2", userId: "u_rol" }),
      member({ clientId: "c3", name: "Xeron", seat: "p3", userId: "u_xer" })
    ];
    expect(detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: "p1", members: guestWinner }))).toBeNull();
    // No room membership at all (solo/local table) → nothing.
    expect(detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: "p1" }))).toBeNull();
  });

  it("a NORMAL (casual) table never counts — ranked === false blocks it (undefined/true is the CONTROL)", () => {
    const prev = stateWith({ over: false, members: TWO_ACCOUNT_MEMBERS });
    const next = stateWith({ over: true, winnerSeat: "p1", members: TWO_ACCOUNT_MEMBERS });
    // Explicit Normal game: no ladder report even with a clean winner and two
    // verified accounts.
    (next.room as { ranked?: boolean }).ranked = false;
    expect(detectFinishedMatch(prev, next)).toBeNull();
    // CONTROL: explicitly Ranked counts, and so does the legacy absent flag.
    (next.room as { ranked?: boolean }).ranked = true;
    expect(detectFinishedMatch(prev, next)).not.toBeNull();
    delete (next.room as { ranked?: boolean }).ranked;
    expect(detectFinishedMatch(prev, next)).not.toBeNull();
  });

  it("QUITTING LOSES POINTS: an account seated at game start that LEFT THE ROOM is reported as 'abandon'", () => {
    const matchSeats = {
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" }
    };
    // Roland rage-quit: his LEAVE_ROOM removed the member row entirely. The
    // start-of-game snapshot still binds his account to seat p2, so he is
    // reported as an abandon (an Elo loss) — and the match STAYS ranked even
    // though only one live member remains.
    const staying = [member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true })];
    const match = detectFinishedMatch(
      stateWith({ over: false, members: staying, matchSeats }),
      stateWith({ over: true, winnerSeat: "p1", members: staying, matchSeats })
    );
    expect(match!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "abandon" }
    ]);

    // Stepping down to OBSERVER mid-game is the same desertion: the member row
    // survives but no longer holds the seat.
    const steppedDown = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true }),
      member({ clientId: "c2", name: "Roland", seat: "observer", userId: "u_rol" })
    ];
    const observed = detectFinishedMatch(
      stateWith({ over: false, members: steppedDown, matchSeats }),
      stateWith({ over: true, winnerSeat: "p1", members: steppedDown, matchSeats })
    );
    expect(observed!.participants).toContainEqual({ accountId: "u_rol", nickname: "Roland", result: "abandon" });

    // CONTROL (legacy games, no snapshot): the leaver is invisible, so this
    // 2-account game degrades to a solo win and is NOT ranked — proving the
    // snapshot is exactly what closes the quit-to-dodge hole.
    expect(
      detectFinishedMatch(
        stateWith({ over: false, members: staying }),
        stateWith({ over: true, winnerSeat: "p1", members: staying })
      )
    ).toBeNull();
  });

  it("a deserter's replacement gets the seat's real result; the deserter still gets the abandon", () => {
    const matchSeats = {
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" }
    };
    // Roland left; the host seated Xeron (a fresh account) into p2, who then
    // fought the game to the end and lost it normally.
    const withReplacement = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true }),
      member({ clientId: "c9", name: "Xeron", seat: "p2", userId: "u_xer" })
    ];
    const match = detectFinishedMatch(
      stateWith({ over: false, members: withReplacement, matchSeats }),
      stateWith({ over: true, winnerSeat: "p1", members: withReplacement, matchSeats })
    );
    expect(match!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_xer", nickname: "Xeron", result: "loss" },
      { accountId: "u_rol", nickname: "Roland", result: "abandon" }
    ]);
  });

  it("a snapshot account whose SEAT ends up winning still gets the win, and finishers are never double-reported", () => {
    const matchSeats = {
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" }
    };
    // Catherine disconnected and left the room, but every rival got eliminated
    // and her seat won by last-faction-standing: her seat's result is a win.
    const onlyRoland = [member({ clientId: "c2", name: "Roland", seat: "p2", userId: "u_rol" })];
    const match = detectFinishedMatch(
      stateWith({ over: false, members: onlyRoland, matchSeats }),
      stateWith({ over: true, winnerSeat: "p1", members: onlyRoland, matchSeats })
    );
    expect(match!.participants).toEqual([
      { accountId: "u_rol", nickname: "Roland", result: "loss" },
      { accountId: "u_cat", nickname: "Catherine", result: "win" }
    ]);

    // CONTROL: with everyone still seated, the snapshot adds NOTHING — one
    // result per account, exactly the live-member attribution.
    const both = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true }),
      member({ clientId: "c2", name: "Roland", seat: "p2", userId: "u_rol" })
    ];
    const clean = detectFinishedMatch(
      stateWith({ over: false, members: both, matchSeats }),
      stateWith({ over: true, winnerSeat: "p1", members: both, matchSeats })
    );
    expect(clean!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "loss" }
    ]);
  });

  it("starting the adventure STAMPS the seat→account snapshot (room.matchSeats) the reporting reads", () => {
    // Real engine flow: a hosted 2-seat lobby with verified members starts via
    // the ready check; the built game must carry the frozen bindings.
    const lobby = createAdventureLobbyState({ seed: "match-seats-stamp", playerCount: 2 });
    const seats = lobby.setupLobby!.seats;
    seats[0].factionId = "castle";
    seats[0].heroDefId = "catherine";
    seats[1].factionId = "necropolis";
    seats[1].heroDefId = "sandro";
    lobby.room = {
      hosted: true,
      hostClientId: "c1",
      members: [
        { clientId: "c1", name: "Catherine", seat: "p1", isHost: true, userId: "u_cat" },
        { clientId: "c2", name: "Roland", seat: "p2", isHost: false, userId: "u_rol" },
        { clientId: "c3", name: "Lurker", seat: "observer", isHost: false, userId: "u_lurk" }
      ]
    };
    const t0 = 1_000_000;
    const opened = applyAction(lobby, { type: "START_ADVENTURE", playerId: "p1" }, { now: t0 });
    expect(opened.errors).toEqual([]);
    const built = applyAction(opened.state, { type: "CONFIRM_START_ADVENTURE", playerId: "p2" }, { now: t0 + 1_000 });
    expect(built.errors).toEqual([]);
    expect(built.state.adventure).not.toBeNull();
    // Observers are not part of the snapshot; both seats are, with their accounts.
    expect(built.state.room?.matchSeats).toEqual({
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" }
    });
  });

  it("an account holding TWO seats disqualifies itself, not the whole match", () => {
    const prev = stateWith({ over: false });
    const selfPlayPlusOne = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat" }),
      member({ clientId: "c1b", name: "Catherine", seat: "p2", userId: "u_cat" }), // second tab
      member({ clientId: "c2", name: "Roland", seat: "p3", userId: "u_rol" }),
      member({ clientId: "c3", name: "Xeron", seat: "p4", userId: "u_xer" })
    ];
    const match = detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: "p3", members: selfPlayPlusOne }));
    expect(match!.participants.map((p) => p.accountId).sort()).toEqual(["u_rol", "u_xer"]);
    // CONTROL: pure self-play (the duplicated account was the only opponent) → null.
    const pureSelfPlay = selfPlayPlusOne.slice(0, 3);
    expect(detectFinishedMatch(prev, stateWith({ over: true, winnerSeat: "p3", members: pureSelfPlay }))).toBeNull();
  });
});

describe("reportFinishedMatch — writes real W/L + Elo through the account backend", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
    rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
  });
  afterAll(() => rmSync(ACCOUNT_DIR, { recursive: true, force: true }));

  it("records the finished game once — ratings move, tallies bump, duplicates no-op", async () => {
    const reportFinishedMatch = await loadReporter();
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@erathia.io", password: "swordsman1" });

    const members = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: cat.id, isHost: true }),
      member({ clientId: "c2", name: "Roland", seat: "p2", userId: rol.id })
    ];
    const prev = stateWith({ over: false, members });
    const next = stateWith({ over: true, winnerSeat: "p1", members });

    await reportFinishedMatch(prev, next);
    // The observable outcome, not an intermediate: MMR moved 1200 → 1216/1184
    // and the W/L/match counters advanced.
    expect(store.getProfileById(cat.id)!.mmr).toBe(1216);
    expect(store.getProfileById(rol.id)!.mmr).toBe(1184);
    expect(store.getProfileById(cat.id)!.wins).toBe(1);
    expect(store.getProfileById(rol.id)!.losses).toBe(1);
    expect(store.getProfileById(cat.id)!.matches).toBe(1);

    // CONTROL: the same game reported again (duplicate broadcast, both
    // transports racing) changes nothing.
    await reportFinishedMatch(prev, next);
    expect(store.getProfileById(cat.id)!.mmr).toBe(1216);
    expect(store.getProfileById(cat.id)!.wins).toBe(1);

    // A NEW game (fresh seed after reset) does rank again.
    const members2 = members.map((m) => ({ ...m }));
    await reportFinishedMatch(
      stateWith({ over: false, members: members2, seed: "room-r1-nonce43" }),
      stateWith({ over: true, winnerSeat: "p2", members: members2, seed: "room-r1-nonce43" })
    );
    expect(store.getProfileById(rol.id)!.wins).toBe(1);
    expect(store.getProfileById(cat.id)!.losses).toBe(1);
  });

  it("CONTROL: a game with no ranked participants writes nothing", async () => {
    const reportFinishedMatch = await loadReporter();
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const members = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: cat.id }),
      member({ clientId: "c2", name: "Guest", seat: "p2" })
    ];
    const pending = reportFinishedMatch(stateWith({ over: false, members }), stateWith({ over: true, winnerSeat: "p1", members }));
    expect(pending).toBeNull();
    expect(store.getProfileById(cat.id)!.matches).toBe(0);
  });
});
