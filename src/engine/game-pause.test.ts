import { describe, expect, it } from "vitest";
import {
  AFK_IDLE_MS,
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  gamePaused,
  getAfkState,
  idleMillis,
  pauseAvailable,
  pauseClockNow,
  PAUSE_OVERRIDE_MS,
  pauseRequestOpen,
  TURN_TIME_LIMIT_MS,
  turnClockRunningSeats,
  turnElapsedMillis,
  type GameAction,
  type GameState,
  type PlayerController
} from "./index";
import { eliminatePlayer } from "./adventure";
import { computerPumpOwed, computerWorkPending } from "@/server/computer-runner";

/**
 * Table PAUSE (src/engine/game-pause.ts): any live seat asks, EVERY other live
 * human seat confirms, and the table freezes — no gameplay action runs, the
 * computer pump owes nothing, and the 10-minute turn budget / AFK idle clocks
 * stop counting — until the seat that asked resumes it, at which point every
 * clock stamp is shifted forward by the paused stretch (a player comes back
 * with exactly the time they had left). Every behaviour below fails if its
 * wiring is removed (CLAUDE.md #1), with unpaused / wrong-seat / too-early
 * CONTROLs.
 */

const T0 = 1_000_000_000;
const MINUTE = 60_000;

function applyOk(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, now?: number): string {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors.length, `expected ${action.type} to be refused`).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };

function makeGame(
  seed: string,
  options: { players?: 2 | 3; parallelTurns?: number; hosted?: boolean; computerP3?: boolean } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.players === 3 || options.computerP3 ? { players: THREE_PLAYERS } : {}),
    ...(options.computerP3 ? { controllers: { p3: COMPUTER } } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  // Hosted by default: that is where the turn timer / AFK clocks run, so the
  // freeze has something to prove. The pause itself works on open tables too.
  state.room = { hosted: options.hosted ?? true, hostClientId: "host", members: [] };
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.adventure!.pendingVisit = null;
  return state;
}

/** Seed the idle + open-turn clocks directly (as the first stamped action would). */
function seedClocks(state: GameState, at: number): void {
  const afk = getAfkState(state);
  for (const seat of state.turnOrder) {
    afk.lastActionAt[seat] = at;
  }
  afk.turnOpenSince = {};
  for (const seat of turnClockRunningSeats(state)) {
    afk.turnOpenSince[seat] = at;
  }
}

/** p1 asks, p2 confirms — a two-player table is paused at `at`. */
function pausedTwoPlayer(seed: string, at: number, options: { hosted?: boolean } = {}): GameState {
  const state = makeGame(seed, options);
  seedClocks(state, T0);
  const requested = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p1" }, at - 1_000);
  expect(pauseRequestOpen(requested)).toBe(true);
  expect(gamePaused(requested)).toBe(false);
  const paused = applyOk(requested, { type: "CONFIRM_PAUSE", playerId: "p2" }, at);
  expect(gamePaused(paused)).toBe(true);
  expect(paused.pause?.pausedAt).toBe(at);
  return paused;
}

describe("pauseAvailable — where a pause can be asked for", () => {
  it("only an in-progress multiplayer adventure with two live human seats (lobby, solo, single-player and finished CONTROLs)", () => {
    expect(pauseAvailable(makeGame("pa-live"))).toBe(true);
    // Open tables can pause too — the freeze is about the table, not the clocks.
    expect(pauseAvailable(makeGame("pa-open", { hosted: false }))).toBe(true);

    const lobby = createAdventureLobbyState({ seed: "pa-lobby" });
    expect(pauseAvailable(lobby)).toBe(false);

    const solo = makeGame("pa-solo");
    solo.players.p2!.eliminated = true;
    solo.turnOrder = solo.turnOrder.filter((id) => id !== "p2");
    expect(pauseAvailable(solo)).toBe(false);

    const single = createAdventureGameState({ seed: "pa-single", difficulty: "normal", rollFirstPlayer: false, sessionMode: "single-player" });
    expect(pauseAvailable(single)).toBe(false);
    expect(expectRejected(single, { type: "REQUEST_PAUSE", playerId: "p1" }, T0)).toMatch(/single-player/i);

    const over = makeGame("pa-over");
    over.adventure!.winnerPlayerId = "p1";
    expect(pauseAvailable(over)).toBe(false);
    expect(expectRejected(over, { type: "REQUEST_PAUSE", playerId: "p1" }, T0)).toMatch(/already over/);
  });
});

describe("request → confirm → paused", () => {
  it("the requester's ask counts as their confirmation; the table pauses on the LAST confirmation only", () => {
    const state = makeGame("rc-three", { players: 3 });
    const asked = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p2" }, T0);
    expect(asked.pause).toMatchObject({ requestedByPlayerId: "p2", confirmations: { p2: true }, pausedAt: null });
    expect(asked.eventLog.some((event) => event.type === "PAUSE_REQUESTED")).toBe(true);

    const one = applyOk(asked, { type: "CONFIRM_PAUSE", playerId: "p1" }, T0 + 1_000);
    expect(gamePaused(one)).toBe(false);
    expect(one.eventLog.some((event) => event.type === "GAME_PAUSED")).toBe(false);
    // The un-paused table still plays: p1 (active) can end their turn.
    expect(one.activePlayerId).toBe("p1");
    const played = applyOk(one, { type: "END_TURN", playerId: "p1" }, T0 + 2_000);
    expect(played.activePlayerId).toBe("p2");

    const paused = applyOk(played, { type: "CONFIRM_PAUSE", playerId: "p3" }, T0 + 3_000);
    expect(gamePaused(paused)).toBe(true);
    expect(paused.pause?.pausedAt).toBe(T0 + 3_000);
    expect(paused.eventLog.some((event) => event.type === "GAME_PAUSED")).toBe(true);
  });

  it("a second request while one is open, a confirm from an eliminated seat, and a double-confirm are handled", () => {
    const state = makeGame("rc-guards", { players: 3 });
    const asked = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p1" }, T0);
    expect(expectRejected(asked, { type: "REQUEST_PAUSE", playerId: "p2" }, T0)).toMatch(/already open/);
    // Idempotent re-confirm: no error, no second event.
    const twice = applyOk(applyOk(asked, { type: "CONFIRM_PAUSE", playerId: "p2" }, T0), { type: "CONFIRM_PAUSE", playerId: "p2" }, T0);
    expect(twice.eventLog.filter((event) => event.type === "PAUSE_CONFIRMED")).toHaveLength(1);
    expect(gamePaused(twice)).toBe(false);
    // An eliminated seat neither confirms nor is waited on.
    const dropped = structuredClone(twice);
    eliminatePlayer(dropped, "p3", "test", true);
    expect(expectRejected(dropped, { type: "CONFIRM_PAUSE", playerId: "p3" }, T0)).toMatch(/still in the game|No pause request/);
  });

  it("a request is refused while a forced AFK drop / turn timeout is mid-way", () => {
    const state = makeGame("rc-drop");
    getAfkState(state).turnTimeoutPlayerId = "p1";
    expect(expectRejected(state, { type: "REQUEST_PAUSE", playerId: "p2" }, T0)).toMatch(/being removed or timed out/);
  });
});

describe("a PAUSED table refuses gameplay and keeps table talk", () => {
  it("END_TURN, the AFK machinery and the computer watchdog are refused with the pauser's name; chat and the room reset vote pass", () => {
    const paused = pausedTwoPlayer("pz-block", T0 + MINUTE);
    expect(paused.activePlayerId).toBe("p1");
    expect(expectRejected(paused, { type: "END_TURN", playerId: "p1" }, T0 + 2 * MINUTE)).toMatch(/paused by Catherine/);
    expect(expectRejected(paused, { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p2" }, T0 + 30 * MINUTE)).toMatch(/paused/);
    expect(expectRejected(paused, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, T0 + 30 * MINUTE)).toMatch(/paused/);
    expect(expectRejected(paused, { type: "ADVANCE_COMPUTER", playerId: "p2" }, T0 + 2 * MINUTE)).toMatch(/paused/);
    expect(expectRejected(paused, { type: "CANCEL_PAUSE", playerId: "p2" }, T0 + 2 * MINUTE)).toMatch(/already paused/);

    const chatted = applyOk(paused, { type: "SEND_CHAT", clientId: "c1", text: "brb", at: T0 + 2 * MINUTE }, T0 + 2 * MINUTE);
    expect(gamePaused(chatted)).toBe(true);
    const reset = applyOk(chatted, { type: "REQUEST_ROOM_RESET", playerId: "p2", clientId: "c2" }, T0 + 2 * MINUTE);
    expect(reset.resetVote?.startedByPlayerId).toBe("p2");

    // CONTROL: the same END_TURN passes once resumed.
    const resumed = applyOk(paused, { type: "RESUME_GAME", playerId: "p1" }, T0 + 5 * MINUTE);
    expect(gamePaused(resumed)).toBe(false);
    expect(applyOk(resumed, { type: "END_TURN", playerId: "p1" }, T0 + 5 * MINUTE + 1_000).activePlayerId).toBe("p2");
  });

  it("parallel turns: every seat's open turn is frozen, not just the active one", () => {
    const state = makeGame("pz-parallel", { players: 3, parallelTurns: 3 });
    seedClocks(state, T0);
    let s = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p3" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p1" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p2" }, T0 + 1_000);
    expect(gamePaused(s)).toBe(true);
    for (const seat of ["p1", "p2", "p3"]) {
      expect(expectRejected(s, { type: "END_TURN", playerId: seat }, T0 + 2_000)).toMatch(/paused/);
    }
  });

  it("the server computer pump owes nothing while paused and picks the AI seat back up on resume", () => {
    const state = makeGame("pz-pump", { computerP3: true });
    state.activePlayerId = "p3";
    state.turn.completedPlayerIds = ["p1", "p2"];
    expect(computerWorkPending(state)).toBe(true);
    expect(computerPumpOwed(state)).toBe(true);
    let s = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p1" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p2" }, T0 + 1_000);
    expect(gamePaused(s)).toBe(true);
    expect(computerWorkPending(s)).toBe(false);
    expect(computerPumpOwed(s)).toBe(false);
    const resumed = applyOk(s, { type: "RESUME_GAME", playerId: "p1" }, T0 + 2 * MINUTE);
    expect(computerPumpOwed(resumed)).toBe(true);
  });
});

describe("time controls freeze while paused and pick up where they stopped", () => {
  it("the turn budget: 1 minute spent before the pause, none during it, the remaining 9 after resume", () => {
    const paused = pausedTwoPlayer("tc-turn", T0 + MINUTE);
    expect(turnClockRunningSeats(paused)).toEqual(["p1"]);
    // Twenty minutes into the pause the clock still reads one minute.
    const deep = T0 + 21 * MINUTE;
    expect(pauseClockNow(paused, deep)).toBe(T0 + MINUTE);
    expect(turnElapsedMillis(paused, "p1", deep)).toBe(MINUTE);

    const resumed = applyOk(paused, { type: "RESUME_GAME", playerId: "p1" }, deep);
    expect(resumed.pause ?? null).toBeNull();
    // Stamps moved forward by the 20 paused minutes: elapsed is still 1 minute.
    expect(resumed.afk?.turnOpenSince?.p1).toBe(T0 + 20 * MINUTE);
    expect(turnElapsedMillis(resumed, "p1", deep)).toBe(MINUTE);
    // p2's last activity was their confirm at the pause moment: after the shift
    // it reads as "just now" — the paused stretch never made them look away.
    expect(resumed.afk?.lastActionAt?.p2).toBe(deep);
    expect(idleMillis(resumed, "p2", deep)).toBe(0);
    const resumedEvent = resumed.eventLog.find((event) => event.type === "GAME_RESUMED");
    expect(resumedEvent && "pausedMs" in resumedEvent ? resumedEvent.pausedMs : null).toBe(20 * MINUTE);

    // The budget expires 9 minutes after the resume, not before.
    const limitAt = deep + TURN_TIME_LIMIT_MS - MINUTE;
    expect(expectRejected(resumed, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, limitAt - 1_000)).toMatch(/still has turn time/);
    const expired = applyOk(resumed, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, limitAt + 1_000);
    expect(expired.afk?.turnTimeoutPlayerId).toBe("p1");

    // CONTROL: an un-paused table burns the whole stretch.
    const control = makeGame("tc-turn-control");
    seedClocks(control, T0);
    expect(turnElapsedMillis(control, "p1", deep)).toBe(21 * MINUTE);
  });

  it("the AFK idle clock: a seat is not 'away' for the paused stretch (an un-paused CONTROL is)", () => {
    const at = T0 + MINUTE;
    const paused = pausedTwoPlayer("tc-idle", at);
    // The ask itself stamps p1 as active; back-date it so p1 reads as idle for
    // the minute before the pause (what a seat that asked and then walked away
    // looks like once its stamp ages).
    paused.afk!.lastActionAt.p1 = T0;
    // Deep into the pause p1 is still only ONE minute idle: frozen.
    expect(idleMillis(paused, "p1", at + AFK_IDLE_MS + MINUTE)).toBe(MINUTE);

    // p2 resumes without the pauser once the override window has passed (the
    // pauser's own resume would stamp p1 active, hiding what we measure here).
    const later = at + PAUSE_OVERRIDE_MS;
    const resumed = applyOk(paused, { type: "RESUME_GAME", playerId: "p2" }, later);
    expect(gamePaused(resumed)).toBe(false);
    // p1's stamp moved forward by the paused stretch: still one minute idle.
    expect(resumed.afk?.lastActionAt?.p1).toBe(later - MINUTE);
    expect(idleMillis(resumed, "p1", later)).toBe(MINUTE);
    expect(expectRejected(resumed, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, later)).toMatch(/not been away/);
    // …and p1 (the awaited, active seat) becomes callable exactly AFK_IDLE_MS
    // of real idle time later — the paused minutes never counted.
    const votable = later + AFK_IDLE_MS - MINUTE + 1_000;
    const vote = applyOk(resumed, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, votable);
    // A two-player vote resolves on the starter's own "kick" at once.
    expect(vote.afk?.vote?.targetPlayerId ?? vote.afk?.droppingPlayerId).toBe("p1");

    const control = makeGame("tc-idle-control");
    seedClocks(control, T0);
    expect(idleMillis(control, "p1", later)).toBe(later - T0);
  });
});

describe("who resumes", () => {
  it("only the pauser resumes at once; the other seat's ask is a vote that is honoured after PAUSE_OVERRIDE_MS", () => {
    const paused = pausedTwoPlayer("wr-pauser", T0 + MINUTE);
    // p2 asks to resume 2 minutes in: recorded, not honoured.
    const asked = applyOk(paused, { type: "RESUME_GAME", playerId: "p2" }, T0 + 3 * MINUTE);
    expect(gamePaused(asked)).toBe(true);
    expect(asked.pause?.resumeVotes).toEqual({ p2: true });
    expect(asked.eventLog.some((event) => event.type === "RESUME_VOTE_CAST")).toBe(true);
    // Asking again too early is refused with the time still to go.
    expect(expectRejected(asked, { type: "RESUME_GAME", playerId: "p2" }, T0 + 4 * MINUTE)).toMatch(/to go/);
    // Once the pause has lasted the override window, the unanimous ask resumes.
    const overrideAt = T0 + MINUTE + PAUSE_OVERRIDE_MS;
    const forced = applyOk(asked, { type: "RESUME_GAME", playerId: "p2" }, overrideAt);
    expect(gamePaused(forced)).toBe(false);
    expect(forced.afk?.turnOpenSince?.p1).toBe(T0 + PAUSE_OVERRIDE_MS);

    // CONTROL: the pauser resumes at any moment.
    const own = applyOk(paused, { type: "RESUME_GAME", playerId: "p1" }, T0 + 2 * MINUTE);
    expect(gamePaused(own)).toBe(false);
  });

  it("three players: BOTH other seats must ask before the override counts", () => {
    const state = makeGame("wr-three", { players: 3 });
    seedClocks(state, T0);
    let s = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p1" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p2" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p3" }, T0);
    const late = T0 + PAUSE_OVERRIDE_MS + MINUTE;
    const one = applyOk(s, { type: "RESUME_GAME", playerId: "p2" }, late);
    expect(gamePaused(one)).toBe(true);
    // A not-yet-unanimous ask is no activity on a frozen clock: p2's idle stamp
    // stays where the pause froze it (their confirm at T0)…
    expect(one.afk?.lastActionAt?.p2).toBe(T0);
    const both = applyOk(one, { type: "RESUME_GAME", playerId: "p3" }, late + 1_000);
    expect(gamePaused(both)).toBe(false);
    // …and after the resume every stamp is shifted by the paused stretch, never
    // pushed AHEAD of the wall clock: p2 reads as idle since the resume, not as
    // "active" for the next eleven minutes.
    expect(both.afk?.lastActionAt?.p2).toBe(late + 1_000);
    expect(idleMillis(both, "p2", late + 1_000)).toBe(0);
    expect(idleMillis(both, "p2", late + 1_000 + AFK_IDLE_MS)).toBe(AFK_IDLE_MS);
  });

  it("an observer / eliminated seat cannot resume; once the pauser is gone any live seat resumes at once", () => {
    const state = makeGame("wr-gone", { players: 3 });
    seedClocks(state, T0);
    let s = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p1" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p2" }, T0);
    s = applyOk(s, { type: "CONFIRM_PAUSE", playerId: "p3" }, T0);
    expect(expectRejected(s, { type: "RESUME_GAME", playerId: "p9" }, T0 + MINUTE)).toMatch(/still in the game/);
    eliminatePlayer(s, "p1", "test", true);
    // The ACTIVE pause survives the elimination…
    expect(gamePaused(s)).toBe(true);
    // …and p2 resumes it straight away, no vote, no waiting.
    const resumed = applyOk(s, { type: "RESUME_GAME", playerId: "p2" }, T0 + MINUTE);
    expect(gamePaused(resumed)).toBe(false);
  });
});

describe("cancelling an open request", () => {
  it("any live seat declines, the requester withdraws, and an elimination voids it", () => {
    const state = makeGame("cx-three", { players: 3 });
    const asked = applyOk(state, { type: "REQUEST_PAUSE", playerId: "p1" }, T0);
    const declined = applyOk(asked, { type: "CANCEL_PAUSE", playerId: "p3" }, T0);
    expect(declined.pause ?? null).toBeNull();
    const declinedEvent = declined.eventLog.find((event) => event.type === "PAUSE_CANCELLED");
    expect(declinedEvent && "withdrawn" in declinedEvent ? declinedEvent.withdrawn : null).toBe(false);

    const withdrawn = applyOk(asked, { type: "CANCEL_PAUSE", playerId: "p1" }, T0);
    const withdrawnEvent = withdrawn.eventLog.find((event) => event.type === "PAUSE_CANCELLED");
    expect(withdrawnEvent && "withdrawn" in withdrawnEvent ? withdrawnEvent.withdrawn : null).toBe(true);
    // A cancelled request can be re-opened.
    expect(applyOk(withdrawn, { type: "REQUEST_PAUSE", playerId: "p2" }, T0).pause?.requestedByPlayerId).toBe("p2");

    const voided = structuredClone(asked);
    eliminatePlayer(voided, "p2", "test", true);
    expect(voided.pause ?? null).toBeNull();

    expect(expectRejected(state, { type: "CANCEL_PAUSE", playerId: "p1" }, T0)).toMatch(/No pause request/);
  });
});
