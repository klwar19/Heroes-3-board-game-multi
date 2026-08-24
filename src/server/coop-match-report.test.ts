/**
 * CO-OP MODE — step 4: MATCH REPORT & RANKING.
 *
 * Two USER RULES are pinned here, each with a clash / no-AI CONTROL on the
 * IDENTICAL fixture (the control is what proves an assertion measures the new
 * gate rather than some unrelated "not enough accounts" refusal):
 *
 *  1. **Co-op has no ranked play for now** — a finished `gameMode === "coop"`
 *     game is never reported AT ALL: no match record, no Elo, no "abandon" mark
 *     for a leaver, whatever `room.ranked` says.
 *  2. **A clash table may hold computer enemies, but rank counts for HUMANS
 *     ONLY** — an AI seat never enters the participant list nor the Elo maths,
 *     and an AI seat WINNING a clash yields no human result at all (never a
 *     synthetic human-vs-human record).
 *
 * The fixture is `match-report.test.ts`'s minimal cast (a hand-built GameState
 * shaped exactly as the detector reads it) plus the two fields this step cares
 * about: `gameMode` and `controllers`. The account-store integration uses the
 * same isolated tmpdir + dynamic-import recipe, for the same hoisting reason.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureLobbyState,
  type GameState,
  type PlayerController,
  type PlayerId,
  type RoomMember,
  type RoomMembershipState
} from "@/engine";
import { detectFinishedMatch } from "./match-report";

const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-coop-match-report-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;

async function loadReporter() {
  return (await import("./match-report-trigger")).reportFinishedMatch;
}

function member(partial: Partial<RoomMember> & { clientId: string }): RoomMember {
  return { name: partial.clientId, seat: "observer", isHost: false, ...partial };
}

function computerController(): PlayerController {
  return { kind: "computer", difficulty: "standard", policyVersion: 1 };
}

function stateWith(options: {
  over?: boolean;
  winnerSeat?: string | null;
  members?: RoomMember[];
  seed?: string;
  matchSeats?: RoomMembershipState["matchSeats"];
  /** Seats driven by the computer — the clash-with-AI / co-op invaders. */
  computerSeats?: PlayerId[];
  coop?: boolean;
  ranked?: boolean;
}): GameState {
  const over = options.over ?? false;
  const controllers = Object.fromEntries((options.computerSeats ?? []).map((seat) => [seat, computerController()]));
  return {
    seed: options.seed ?? "coop-room-r1-nonce42",
    phase: over ? "game-over" : "adventure",
    ...(options.coop ? { gameMode: "coop" } : {}),
    ...((options.computerSeats?.length ?? 0) > 0 ? { controllers } : {}),
    adventure: { winnerPlayerId: over ? (options.winnerSeat === null ? undefined : (options.winnerSeat ?? "p1")) : undefined },
    room: options.members
      ? {
          hosted: true,
          hostClientId: options.members[0]?.clientId ?? null,
          members: options.members,
          ...(options.ranked === undefined ? {} : { ranked: options.ranked }),
          ...(options.matchSeats ? { matchSeats: options.matchSeats } : {})
        }
      : null
  } as unknown as GameState;
}

/** Two verified humans on p1/p2; the AI invader (when present) sits on p3. */
const TWO_HUMANS: RoomMember[] = [
  member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true }),
  member({ clientId: "c2", name: "Roland", seat: "p2", userId: "u_rol" })
];

describe("co-op step 4 — a finished CO-OP game is never reported", () => {
  it("returns null for a co-op win, where the identical CLASH fixture reports a normal win/loss", () => {
    const prev = (coop: boolean) => stateWith({ over: false, members: TWO_HUMANS, coop, computerSeats: ["p3"] });
    const next = (coop: boolean) =>
      stateWith({ over: true, winnerSeat: "p1", members: TWO_HUMANS, coop, computerSeats: ["p3"] });

    // Catherine's seat is the declared winner; Roland is her LIVING ALLY. The
    // old scoring would have reported him as a loss — the whole reason co-op is
    // excluded wholesale.
    expect(detectFinishedMatch(prev(true), next(true))).toBeNull();

    // CONTROL: byte-identical fixture with gameMode absent (clash) — the same
    // two accounts and the same AI seat DO produce a record.
    const clash = detectFinishedMatch(prev(false), next(false));
    expect(clash).not.toBeNull();
    expect(clash!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "loss" }
    ]);
  });

  it("a co-op table sitting on room.ranked TRUE is still not reported (the flag is irrelevant)", () => {
    // SET_ROOM_RANKED is deliberately UNCHANGED by this step: a co-op lobby may
    // still carry ranked:true (no UI hides it until step 5). Enforcement lives
    // at this one chokepoint, so the stale flag is harmless.
    for (const ranked of [true, false, undefined]) {
      expect(
        detectFinishedMatch(
          stateWith({ over: false, members: TWO_HUMANS, coop: true, computerSeats: ["p3"], ranked }),
          stateWith({ over: true, winnerSeat: "p1", members: TWO_HUMANS, coop: true, computerSeats: ["p3"], ranked })
        )
      ).toBeNull();
    }
    // CONTROL: the same ranked flags on a CLASH table behave exactly as before —
    // ranked:true/absent rank, ranked:false records casually.
    const clashRanked = detectFinishedMatch(
      stateWith({ over: false, members: TWO_HUMANS, computerSeats: ["p3"], ranked: true }),
      stateWith({ over: true, winnerSeat: "p1", members: TWO_HUMANS, computerSeats: ["p3"], ranked: true })
    );
    expect(clashRanked!.ranked).toBe(true);
    const clashCasual = detectFinishedMatch(
      stateWith({ over: false, members: TWO_HUMANS, computerSeats: ["p3"], ranked: false }),
      stateWith({ over: true, winnerSeat: "p1", members: TWO_HUMANS, computerSeats: ["p3"], ranked: false })
    );
    expect(clashCasual!.ranked).toBe(false);
  });

  it("a co-op LEAVER is never marked 'abandon' — quitting a co-op game costs nothing", () => {
    const matchSeats = {
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" }
    };
    // Roland left the room entirely; only Catherine's member row survives, and
    // her seat won. On a CLASH table that is the documented quit-loses-points
    // path; in co-op it must attribute nothing at all.
    const staying = [member({ clientId: "c1", name: "Catherine", seat: "p1", userId: "u_cat", isHost: true })];
    expect(
      detectFinishedMatch(
        stateWith({ over: false, members: staying, matchSeats, coop: true, computerSeats: ["p3"] }),
        stateWith({ over: true, winnerSeat: "p1", members: staying, matchSeats, coop: true, computerSeats: ["p3"] })
      )
    ).toBeNull();

    // CONTROL: the identical desertion on a clash table still reports the
    // abandon — proving the null above is the co-op gate, not a missing snapshot.
    const clash = detectFinishedMatch(
      stateWith({ over: false, members: staying, matchSeats, computerSeats: ["p3"] }),
      stateWith({ over: true, winnerSeat: "p1", members: staying, matchSeats, computerSeats: ["p3"] })
    );
    expect(clash!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "abandon" }
    ]);
  });

  it("co-op nulls the report even when the AI ALLIANCE wins (the invaders wiped the humans)", () => {
    // The other co-op terminal: a computer seat is the declared winner. Nothing
    // is attributed — the humans are not farmed for losses by the AI.
    expect(
      detectFinishedMatch(
        stateWith({ over: false, members: TWO_HUMANS, coop: true, computerSeats: ["p3"] }),
        stateWith({ over: true, winnerSeat: "p3", members: TWO_HUMANS, coop: true, computerSeats: ["p3"] })
      )
    ).toBeNull();
  });
});

describe("co-op step 4 — computer seats are invisible to the ladder in CLASH", () => {
  it("an AI seat WINNING a clash reports nothing (no synthetic human-vs-human result)", () => {
    const prev = stateWith({ over: false, members: TWO_HUMANS, computerSeats: ["p3"] });
    const aiWon = stateWith({ over: true, winnerSeat: "p3", members: TWO_HUMANS, computerSeats: ["p3"] });
    // Both humans lost to the computer. There is no human winner, so the
    // winner-AND-loser rule nulls the whole match rather than recording two
    // losses with nobody credited.
    expect(detectFinishedMatch(prev, aiWon)).toBeNull();

    // CONTROL: the very same three seats with a HUMAN winner DO report.
    const humanWon = stateWith({ over: true, winnerSeat: "p2", members: TWO_HUMANS, computerSeats: ["p3"] });
    expect(detectFinishedMatch(prev, humanWon)!.participants.map((p) => p.result)).toEqual(["loss", "win"]);
  });

  it("a matchSeats row on a COMPUTER seat is never abandon-marked (forged / legacy snapshot)", () => {
    // A computer seat holds no member and no account, so this row cannot arise
    // from the shipped freeze — it is the forged/legacy case the explicit
    // isComputerPlayer filter exists for. Without the filter u_bot would be
    // reported as an abandon (a free Elo loss for a real account id).
    const matchSeats = {
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" },
      p3: { userId: "u_bot", name: "Computer 1" }
    };
    const match = detectFinishedMatch(
      stateWith({ over: false, members: TWO_HUMANS, matchSeats, computerSeats: ["p3"] }),
      stateWith({ over: true, winnerSeat: "p1", members: TWO_HUMANS, matchSeats, computerSeats: ["p3"] })
    );
    expect(match!.participants).toEqual([
      { accountId: "u_cat", nickname: "Catherine", result: "win" },
      { accountId: "u_rol", nickname: "Roland", result: "loss" }
    ]);

    // CONTROL: the SAME row on a seat that is NOT computer-controlled is a
    // deserter and does get the abandon — so the filter keys off the
    // controller, not off the seat id or the name.
    const asHuman = detectFinishedMatch(
      stateWith({ over: false, members: TWO_HUMANS, matchSeats }),
      stateWith({ over: true, winnerSeat: "p1", members: TWO_HUMANS, matchSeats })
    );
    expect(asHuman!.participants).toContainEqual({ accountId: "u_bot", nickname: "Computer 1", result: "abandon" });
  });

  it("a member row forged ONTO a computer seat is not a participant either", () => {
    // `assignSeat` refuses a computer seat, so this cannot happen live; the
    // live-member loop filters it anyway. With three humans and the third one
    // sitting on the AI seat, only the two real seats are attributed.
    const forged = [
      ...TWO_HUMANS,
      member({ clientId: "c3", name: "Ghost", seat: "p3", userId: "u_ghost" })
    ];
    const match = detectFinishedMatch(
      stateWith({ over: false, members: forged, computerSeats: ["p3"] }),
      stateWith({ over: true, winnerSeat: "p1", members: forged, computerSeats: ["p3"] })
    );
    expect(match!.participants.map((p) => p.accountId)).toEqual(["u_cat", "u_rol"]);

    // CONTROL: with p3 NOT computer-controlled, Ghost is an ordinary loser.
    const allHuman = detectFinishedMatch(
      stateWith({ over: false, members: forged }),
      stateWith({ over: true, winnerSeat: "p1", members: forged })
    );
    expect(allHuman!.participants.map((p) => p.accountId)).toEqual(["u_cat", "u_rol", "u_ghost"]);
  });

  it("the FREEZE never stamps a computer seat: a real multiplayer lobby with an AI seat", () => {
    // The other half of the invariant — the report-side filter above is
    // belt-and-braces over this. Real engine flow: two verified members, one
    // computer opponent added through SET_COMPUTER_OPPONENTS, ready check, build.
    const lobby = createAdventureLobbyState({ seed: "coop-match-seats-stamp", playerCount: 2 });
    lobby.room = {
      hosted: true,
      hostClientId: "c1",
      members: [
        { clientId: "c1", name: "Catherine", seat: "p1", isHost: true, userId: "u_cat" },
        { clientId: "c2", name: "Roland", seat: "p2", isHost: false, userId: "u_rol" }
      ]
    };
    const withAi = applyAction(lobby, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
    expect(withAi.errors).toEqual([]);
    const seats = withAi.state.setupLobby!.seats;
    expect(seats).toHaveLength(3);
    expect(withAi.state.controllers?.p3?.kind).toBe("computer");
    seats[0].factionId = "castle";
    seats[0].heroDefId = "catherine";
    seats[1].factionId = "necropolis";
    seats[1].heroDefId = "sandro";
    seats[2].factionId = "tower";
    seats[2].heroDefId = "solmyr";

    const t0 = 1_000_000;
    const opened = applyAction(withAi.state, { type: "START_ADVENTURE", playerId: "p1" }, { now: t0 });
    expect(opened.errors).toEqual([]);
    const built = applyAction(opened.state, { type: "CONFIRM_START_ADVENTURE", playerId: "p2" }, { now: t0 + 1_000 });
    expect(built.errors).toEqual([]);
    expect(built.state.adventure).not.toBeNull();
    // The AI seat is absent from the snapshot the reporting reads — only the
    // two human seats are frozen.
    expect(built.state.room?.matchSeats).toEqual({
      p1: { userId: "u_cat", name: "Catherine" },
      p2: { userId: "u_rol", name: "Roland" }
    });
  });
});

describe("co-op step 4 — the account backend: humans only, co-op writes nothing", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
    rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
  });
  afterAll(() => rmSync(ACCOUNT_DIR, { recursive: true, force: true }));

  it("a RANKED clash with an AI seat moves Elo for the two humans only, exactly as if the AI were absent", async () => {
    const reportFinishedMatch = await loadReporter();
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@erathia.io", password: "swordsman1" });

    const members = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: cat.id, isHost: true }),
      member({ clientId: "c2", name: "Roland", seat: "p2", userId: rol.id })
    ];
    const prev = stateWith({ over: false, members, computerSeats: ["p3", "p4"] });
    const next = stateWith({ over: true, winnerSeat: "p1", members, computerSeats: ["p3", "p4"] });

    // The record itself carries no AI seat…
    const match = detectFinishedMatch(prev, next);
    expect(match!.participants).toHaveLength(2);
    expect(match!.participants.map((p) => p.accountId).sort()).toEqual([cat.id, rol.id].sort());

    await reportFinishedMatch(prev, next);
    // …and the observable outcome is the plain 1v1 Elo swing (1200 → 1216/1184),
    // i.e. the two AI seats did not dilute the winner-takes-field sum.
    expect(store.getProfileById(cat.id)!.mmr).toBe(1216);
    expect(store.getProfileById(rol.id)!.mmr).toBe(1184);
    expect(store.getProfileById(cat.id)!.wins).toBe(1);
    expect(store.getProfileById(rol.id)!.losses).toBe(1);
    expect(store.getProfileById(rol.id)!.matches).toBe(1);
    // And the AI seats bought nobody a phantom extra match.
    expect(store.getProfileById(cat.id)!.matches).toBe(1);
  });

  it("a CASUAL clash with an AI seat is still RECORDED among the humans, with no rating movement", async () => {
    const reportFinishedMatch = await loadReporter();
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@erathia.io", password: "swordsman1" });
    const members = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: cat.id, isHost: true }),
      member({ clientId: "c2", name: "Roland", seat: "p2", userId: rol.id })
    ];
    const prev = stateWith({ over: false, members, computerSeats: ["p3"], ranked: false, seed: "casual-ai-seed" });
    const next = stateWith({
      over: true,
      winnerSeat: "p2",
      members,
      computerSeats: ["p3"],
      ranked: false,
      seed: "casual-ai-seed"
    });

    await reportFinishedMatch(prev, next);
    expect(store.getProfileById(rol.id)!.wins).toBe(1);
    expect(store.getProfileById(cat.id)!.losses).toBe(1);
    expect(store.getProfileById(cat.id)!.matches).toBe(1);
    // Casual: the W/L shows on the profile, the rating does not move.
    expect(store.getProfileById(cat.id)!.mmr).toBe(1200);
    expect(store.getProfileById(rol.id)!.mmr).toBe(1200);
  });

  it("CONTROL: the same two accounts in a CO-OP game write nothing at all", async () => {
    const reportFinishedMatch = await loadReporter();
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const cat = store.ensureAdminAccount({ nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" });
    const rol = store.ensureAdminAccount({ nickname: "Roland", email: "rol@erathia.io", password: "swordsman1" });
    const members = [
      member({ clientId: "c1", name: "Catherine", seat: "p1", userId: cat.id, isHost: true }),
      member({ clientId: "c2", name: "Roland", seat: "p2", userId: rol.id })
    ];
    const prev = stateWith({ over: false, members, computerSeats: ["p3"], coop: true, seed: "coop-write-seed" });
    const next = stateWith({
      over: true,
      winnerSeat: "p1",
      members,
      computerSeats: ["p3"],
      coop: true,
      seed: "coop-write-seed"
    });

    // Not even a pending write is created.
    expect(reportFinishedMatch(prev, next)).toBeNull();
    expect(store.getProfileById(cat.id)!.matches).toBe(0);
    expect(store.getProfileById(rol.id)!.matches).toBe(0);
    expect(store.getProfileById(cat.id)!.mmr).toBe(1200);
  });
});
