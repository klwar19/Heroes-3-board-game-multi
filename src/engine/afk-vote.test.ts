import { describe, expect, it } from "vitest";
import {
  AFK_AUTO_KICK_MS,
  AFK_IDLE_MS,
  AFK_REASK_MS,
  applyAction,
  createAdventureGameState,
  driveAfkDrop,
  getAfkState,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { getMainHero, startAdventureRound } from "./adventure";

/** Reads the open visit's owner (a function boundary resets TS narrowing). */
function visitOwner(state: GameState): PlayerId | null {
  return state.adventure?.pendingVisit?.playerId ?? null;
}
import { pumpAdventureQueues, startPlayerCombat } from "./adventure-reducer";
import { EVENTS_DECK_ID } from "./adventure";

/**
 * AFK vote-kick (multiplayer): a seat idle for 10 minutes can be put to a
 * kick-or-wait vote; one "wait" closes the vote (re-askable 10 minutes later),
 * unanimous "kick" force-drops the seat through the NORMAL pipeline — pending
 * choices default-resolved, an open combat conceded to the opponent, then the
 * elimination + turn/round machinery every other removal already uses. Every
 * behaviour below fails if its wiring is removed (CLAUDE.md #1), with idle-
 * window and wrong-actor CONTROLs.
 */

const T0 = 1_000_000_000;

function applyOk(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, now?: number): string {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(
  seed: string,
  options: { players?: 2 | 3; parallelTurns?: number; events?: boolean } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: options.events ?? false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Inert Astrologers proclamations so even rounds resolve without a choice.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** Seed every seat's last-action clock (as the first stamped action would). */
function stampClocks(state: GameState, at: number): void {
  const afk = getAfkState(state);
  for (const playerId of state.turnOrder) {
    afk.lastActionAt[playerId] = at;
  }
}

const IDLE = T0 + AFK_IDLE_MS;

describe("AFK vote — opening, waiting, cancelling", () => {
  it("opens only against the awaited seat idle 10 minutes (younger idle AND a non-active seat are CONTROLs)", () => {
    const state = makeGame("afk-open", { players: 3 });
    stampClocks(state, T0);
    // Ordered play: p1 is on turn, so p1 is the only kickable seat.
    expect(state.activePlayerId).toBe("p1");

    // CONTROL 1 (younger idle): the awaited seat has not been away long enough yet.
    expect(
      expectRejected(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE - 1)
    ).toContain("has not been away");

    // CONTROL 2 (not their turn): p3 is equally idle, but it is not p3's turn in
    // ordered play — a seat waiting for its turn is not kickable.
    expect(
      expectRejected(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p3" }, IDLE)
    ).toContain("on their own turn");

    const open = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    expect(open.afk?.vote).toMatchObject({
      targetPlayerId: "p1",
      startedByPlayerId: "p2",
      votes: { p2: "kick" }
    });
    expect(open.eventLog.some((event) => event.type === "AFK_VOTE_STARTED")).toBe(true);
  });

  it("stamps the idle clock from real actions and bootstraps every seat on the first one", () => {
    const state = makeGame("afk-stamp", { players: 3 });
    // p1's END_TURN at T0 is the game's first stamped action: every live seat's
    // clock starts, so a player who never acts still becomes kickable later.
    const after = applyOk(state, { type: "END_TURN", playerId: "p1" }, T0);
    expect(after.afk?.lastActionAt).toMatchObject({ p1: T0, p2: T0, p3: T0 });

    // p2 acts again much later: p2's clock moves, p3's does not.
    const later = applyOk(after, { type: "END_TURN", playerId: "p2" }, T0 + 5_000);
    expect(later.afk?.lastActionAt.p2).toBe(T0 + 5_000);
    expect(later.afk?.lastActionAt.p3).toBe(T0);
  });

  it("one 'wait' closes the vote; the re-ask cooldown gates the next one for 10 minutes", () => {
    const state = makeGame("afk-wait", { players: 3 });
    stampClocks(state, T0);
    // p1 is the awaited (active) seat; p2/p3 vote on kicking them.
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);

    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p3", vote: "wait" }, IDLE + 1_000);
    expect(current.afk?.vote).toBeNull();
    expect(current.afk?.droppingPlayerId ?? null).toBeNull();
    expect(
      current.eventLog.some((event) => event.type === "AFK_VOTE_RESOLVED" && event.outcome === "wait")
    ).toBe(true);

    // Asking again right away is refused; 10 minutes later it opens again (p1 is
    // still on turn and still idle).
    expect(
      expectRejected(current, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE + 2_000)
    ).toContain("wait");
    const reopened = applyOk(
      current,
      { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" },
      IDLE + 1_000 + AFK_REASK_MS
    );
    expect(reopened.afk?.vote?.targetPlayerId).toBe("p1");
  });

  it("cancels the vote the moment the target acts (another seat's action is the CONTROL)", () => {
    // Parallel mode so every seat's turn is open at once — the non-target CONTROL
    // action is only legal there (in ordered play only the awaited seat may act).
    const state = makeGame("afk-cancel", { players: 3, parallelTurns: 3 });
    stampClocks(state, T0);
    expect(state.turn.mode).toBe("parallel");
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p3" }, IDLE);

    // CONTROL: p1 (not the target) ends their parallel turn — the vote stays open.
    current = applyOk(current, { type: "END_TURN", playerId: "p1" }, IDLE + 1_000);
    expect(current.afk?.vote?.targetPlayerId).toBe("p3");

    // The TARGET p3 takes a turn action: the vote auto-cancels (they are back).
    current = applyOk(current, { type: "END_TURN", playerId: "p3" }, IDLE + 2_000);
    expect(current.afk?.vote).toBeNull();
    expect(
      current.eventLog.some((event) => event.type === "AFK_VOTE_RESOLVED" && event.outcome === "cancelled")
    ).toBe(true);
  });

  it("guards: no self-target, the target cannot vote, an open vote blocks a second one", () => {
    const state = makeGame("afk-guards", { players: 3 });
    stampClocks(state, T0);
    expect(
      expectRejected(state, { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p1" }, IDLE)
    ).toContain("yourself");

    // p1 is the awaited seat; the vote opens against them.
    const open = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    expect(expectRejected(open, { type: "CAST_AFK_VOTE", playerId: "p1", vote: "wait" }, IDLE)).toContain(
      "cannot vote"
    );
    expect(
      expectRejected(open, { type: "START_AFK_VOTE", playerId: "p3", targetPlayerId: "p2" }, IDLE)
    ).toContain("already open");
  });
});

describe("AFK drop — the game continues as intended", () => {
  it("3 players, ordered: unanimous kick removes the awaited seat and the remaining two keep playing full rounds", () => {
    const state = makeGame("afk-kick-3p", { players: 3 });
    stampClocks(state, T0);
    // p1 is on turn (the awaited, kickable seat); p2/p3 unanimously kick them.
    expect(state.activePlayerId).toBe("p1");
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p3", vote: "kick" }, IDLE + 1_000);
    expect(current.afk?.droppingPlayerId).toBe("p1");

    current = driveAfkDrop(current, () => ({ now: IDLE + 2_000 }));
    expect(current.afk?.droppingPlayerId ?? null).toBeNull();
    expect(current.players.p1.eliminated).toBe(true);
    expect(current.players.p1.kickedByVote).toBe(true);
    expect(current.turnOrder).not.toContain("p1");
    expect(
      current.eventLog.some(
        (event) => event.type === "PLAYER_ELIMINATED" && event.playerId === "p1" && /AFK/.test(event.reason)
      )
    ).toBe(true);

    // The rotation continues without the kicked seat: p2 and p3 alone wrap the
    // round (a wrap stuck waiting on p1 would never advance the counter).
    const roundBefore = current.round;
    current = applyOk(current, { type: "END_TURN", playerId: "p2" }, IDLE + 3_000);
    current = applyOk(current, { type: "END_TURN", playerId: "p3" }, IDLE + 4_000);
    expect(current.round).toBe(roundBefore + 1);
    expect(current.phase).not.toBe("game-over");
  });

  it("kick while it is the TARGET's ordered turn hands the turn on like a give-up", () => {
    const state = makeGame("afk-kick-active", { players: 3 });
    stampClocks(state, T0);
    expect(state.activePlayerId).toBe("p1");
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p3", vote: "kick" }, IDLE + 1_000);
    current = driveAfkDrop(current, () => ({ now: IDLE + 2_000 }));

    expect(current.players.p1.eliminated).toBe(true);
    expect(current.activePlayerId).toBe("p2");
    expect(current.phase).not.toBe("game-over");
  });

  it("2 players: the opponent's single voice kicks, and the survivor wins the game (ladder-ready)", () => {
    const state = makeGame("afk-kick-2p");
    stampClocks(state, T0);
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    expect(current.afk?.droppingPlayerId).toBe("p1");

    current = driveAfkDrop(current, () => ({ now: IDLE + 1_000 }));
    expect(current.players.p1.eliminated).toBe(true);
    expect(current.players.p1.kickedByVote).toBe(true);
    expect(current.adventure?.winnerPlayerId).toBe("p2");
    expect(current.phase).toBe("game-over");
  });

  it("parallel turns: the kicked seat's open turn ends and the round wraps without them", () => {
    const state = makeGame("afk-kick-parallel", { players: 3, parallelTurns: 3 });
    stampClocks(state, T0);
    expect(state.turn.mode).toBe("parallel");

    // p1 and p2 end their parallel turns; p3 idles and is voted out.
    let current = applyOk(state, { type: "END_TURN", playerId: "p1" }, T0 + 1_000);
    current = applyOk(current, { type: "END_TURN", playerId: "p2" }, T0 + 2_000);
    const roundBefore = current.round;
    current = applyOk(current, { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p3" }, T0 + AFK_IDLE_MS + 2_000);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p2", vote: "kick" }, T0 + AFK_IDLE_MS + 3_000);
    current = driveAfkDrop(current, () => ({ now: T0 + AFK_IDLE_MS + 4_000 }));

    // p3 was the only open turn left: dropping them wraps the round for the
    // two live players and the next parallel round starts.
    expect(current.players.p3.eliminated).toBe(true);
    expect(current.round).toBe(roundBefore + 1);
    expect(current.phase).not.toBe("game-over");
  });

  it("kick resolves the target's open pending CHOICE with the default (skip) option first", () => {
    const state = makeGame("afk-kick-choice", { players: 3 });
    stampClocks(state, T0);
    const moraleBefore = state.players.p3.morale;

    // A real queued interaction for p3: a visit-step choice with a skip arm.
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    state.adventure!.rewardQueue.push({
      playerId: "p3",
      kind: "visit-steps",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Test offer",
          options: [
            { label: "Gain morale", steps: [{ type: "GAIN_MORALE", amount: 1 }] },
            { label: "Skip", steps: [] }
          ]
        }
      ]
    });
    pumpAdventureQueues(state);
    // The CHOOSE_ONE opens as p3's pending visit step (their choice to answer).
    expect(visitOwner(state)).toBe("p3");

    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p3" }, IDLE);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p2", vote: "kick" }, IDLE + 1_000);
    current = driveAfkDrop(current, () => ({ now: IDLE + 2_000 }));

    expect(current.pendingChoice).toBeNull();
    expect(visitOwner(current)).toBeNull();
    expect(current.players.p3.eliminated).toBe(true);
    // The default pick was the do-nothing arm: no morale was gained.
    expect(current.players.p3.morale).toBe(moraleBefore);
  });

  it("kick mid-PvP-combat concedes the battle to the opponent, then eliminates the kicked seat", () => {
    const state = makeGame("afk-kick-combat", { players: 3 });
    stampClocks(state, T0);
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p3")!;
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    expect(state.combat?.context.kind).toBe("player");

    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p3" }, IDLE);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p2", vote: "kick" }, IDLE + 1_000);
    current = driveAfkDrop(current, () => ({ now: IDLE + 2_000 }));

    // The battle ended with p1 the winner (give-up consequences), THEN p3 left.
    const ended = current.eventLog.find((event) => event.type === "COMBAT_ENDED");
    expect(ended).toMatchObject({ winnerPlayerId: "p1", defeatedPlayerId: "p3" });
    expect(current.combat).toBeNull();
    expect(current.players.p3.eliminated).toBe(true);
    expect(current.phase).not.toBe("game-over");
  });

  it("kick of the round-start Event resolver default-resolves their step and the barrier lifts", () => {
    const state = makeGame("afk-kick-event", { players: 3, events: true });
    stampClocks(state, T0);
    // Stables on top of the Event deck; wrap to a Resource round to draw it.
    const deck = state.decks[EVENTS_DECK_ID];
    deck.drawPile = deck.drawPile.filter((id) => id !== "event.stables");
    deck.drawPile.push("event.stables");
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    state.round = 3;
    startAdventureRound(state);
    pumpAdventureQueues(state);

    // p1 drew and resolves first — the whole table is frozen behind them.
    expect(visitOwner(state)).toBe("p1");
    expect(state.adventure?.eventResolution).toBeTruthy();

    // The frozen table votes the absent resolver out (votes bypass the freeze).
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p3", vote: "kick" }, IDLE + 1_000);
    current = driveAfkDrop(current, () => ({ now: IDLE + 2_000 }));

    expect(current.players.p1.eliminated).toBe(true);
    // p1's event step was default-resolved and the resolution moved on — the
    // table is no longer stuck on the kicked seat.
    expect(visitOwner(current)).not.toBe("p1");
    expect(current.pendingChoice?.playerId ?? null).not.toBe("p1");
  });
});

describe("AFK certain auto-kick (30 minutes) — no vote", () => {
  const AUTO = T0 + AFK_AUTO_KICK_MS;

  it("removes a seat idle 30 minutes with no vote (younger idle is the CONTROL)", () => {
    const state = makeGame("afk-auto", { players: 3 });
    stampClocks(state, T0);
    // p3 is NOT the seat on turn — the vote could not target it, but the hard
    // 30-minute timeout certainly can.
    expect(state.activePlayerId).toBe("p1");

    // CONTROL: one second short of 30 minutes is refused.
    expect(
      expectRejected(state, { type: "FORCE_AFK_KICK", playerId: "p1", targetPlayerId: "p3" }, AUTO - 1)
    ).toContain("has not been away for 30 minutes");

    const dropping = applyOk(state, { type: "FORCE_AFK_KICK", playerId: "p1", targetPlayerId: "p3" }, AUTO);
    expect(dropping.afk?.droppingPlayerId).toBe("p3");
    expect(dropping.eventLog.some((event) => event.type === "AFK_AUTO_KICKED")).toBe(true);

    const done = driveAfkDrop(dropping, () => ({ now: AUTO + 1_000 }));
    expect(done.players.p3.eliminated).toBe(true);
    expect(done.players.p3.kickedByVote).toBe(true);
    expect(done.turnOrder).not.toContain("p3");
    expect(done.phase).not.toBe("game-over");
  });

  it("2 players: the survivor wins once the 30-minute-AFK opponent is auto-kicked", () => {
    const state = makeGame("afk-auto-2p");
    stampClocks(state, T0);
    const dropping = applyOk(state, { type: "FORCE_AFK_KICK", playerId: "p2", targetPlayerId: "p1" }, AUTO);
    const done = driveAfkDrop(dropping, () => ({ now: AUTO + 1_000 }));
    expect(done.players.p1.eliminated).toBe(true);
    expect(done.adventure?.winnerPlayerId).toBe("p2");
    expect(done.phase).toBe("game-over");
  });

  it("an open vote about the target is superseded by the hard timeout", () => {
    const state = makeGame("afk-auto-vote", { players: 3 });
    stampClocks(state, T0);
    // Vote about the on-turn seat p1 opens first…
    let current = applyOk(state, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, IDLE);
    expect(current.afk?.vote?.targetPlayerId).toBe("p1");
    // …then the 30-minute timeout fires and takes over.
    current = applyOk(current, { type: "FORCE_AFK_KICK", playerId: "p2", targetPlayerId: "p1" }, AUTO);
    expect(current.afk?.vote ?? null).toBeNull();
    expect(current.afk?.droppingPlayerId).toBe("p1");
  });
});
