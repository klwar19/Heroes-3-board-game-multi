import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  driveAfkDrop,
  getAfkState,
  TURN_TIME_LIMIT_MS,
  turnClockPausedFor,
  turnClockRunningSeats,
  type GameAction,
  type GameState
} from "./index";
import { getMainHero } from "./adventure";
import { pumpAdventureQueues, startNeutralEncounter, startPlayerCombat } from "./adventure-reducer";
import type { MapFieldState, PlayerId } from "./state";

/** Reads the open visit's owner (a function boundary resets TS narrowing). */
function visitOwner(state: GameState): PlayerId | null {
  return state.adventure?.pendingVisit?.playerId ?? null;
}

/**
 * 10-minute TURN TIMER (multiplayer house rule, engine-enforced): even a player
 * who keeps clicking — so is never "idle" for the AFK vote — gets at most
 * TURN_TIME_LIMIT_MS per open turn. A battle PAUSES (resets) that clock, so the
 * timer never counts combat time. Any live seat then fires FORCE_TURN_TIMEOUT
 * (the server re-checks its own clock) and the driver force-ends the turn:
 * pending inputs default-resolved, any still-open fight retreated (a safety
 * net — a battle pauses the clock, so a timeout cannot normally arm mid-fight),
 * then a normal END_TURN. The player is NOT kicked or eliminated — play shifts on.
 * Every behaviour below fails if its wiring is removed (CLAUDE.md #1), with
 * too-early / paused-clock / wrong-seat CONTROLs.
 */

const T0 = 1_000_000_000;
const LIMIT = T0 + TURN_TIME_LIMIT_MS;

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

function makeGame(seed: string, options: { players?: 2 | 3; parallelTurns?: number } = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Inert Astrologers proclamations so round wraps resolve without a choice.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  // The 10-minute turn timer runs only on a CLOSED (hosted) table.
  state.room = { hosted: true, hostClientId: "host", members: [] };
  return state;
}

/** Seed the open turn's clock directly (as the first stamped action would). */
function seedTurnClock(state: GameState, at: number): void {
  const afk = getAfkState(state);
  afk.turnOpenSince = {};
  for (const seat of turnClockRunningSeats(state)) {
    afk.turnOpenSince[seat] = at;
  }
}

describe("turn clock bookkeeping — stamps ride the real action pipeline", () => {
  it("stamps the ACTIVE seat's clock on a stamped action, moves it when the turn passes, and restarts the budget", () => {
    const state = makeGame("turn-clock-stamp", { players: 3 });
    expect(state.activePlayerId).toBe("p1");

    // p1's first stamped action opens p1's clock (nobody else's — ordered play
    // has a single open turn).
    const after = applyOk(state, { type: "END_TURN", playerId: "p1" }, T0);
    // …and END_TURN itself hands the turn to p2: the stamp follows the turn.
    expect(after.afk?.turnOpenSince).toEqual({ p2: T0 });

    // p2 ends much later: p3's fresh clock starts AT THAT MOMENT — each turn
    // gets a full fresh budget, nothing accumulates across turns.
    const later = applyOk(after, { type: "END_TURN", playerId: "p2" }, T0 + 123_456);
    expect(later.afk?.turnOpenSince).toEqual({ p3: T0 + 123_456 });
  });

  it("CONTROL: an OPEN (non-hosted) table runs NO turn clock at all", () => {
    const state = makeGame("turn-clock-open", { players: 3 });
    // Reopen the table: the casual mode has no per-turn timer.
    state.room = { hosted: false, hostClientId: null, members: [] };
    expect(turnClockRunningSeats(state)).toEqual([]);
    const after = applyOk(state, { type: "END_TURN", playerId: "p1" }, T0);
    // No clock is stamped, and FORCE_TURN_TIMEOUT has nothing to time out.
    expect(after.afk?.turnOpenSince ?? {}).toEqual({});
    expect(
      expectRejected(after, { type: "FORCE_TURN_TIMEOUT", playerId: "p1", targetPlayerId: "p2" }, LIMIT)
    ).toContain("no open turn");
  });

  it("parallel mode: EVERY open turn's clock runs; ending your own turn drops only your stamp", () => {
    const state = makeGame("turn-clock-parallel", { players: 3, parallelTurns: 3 });
    expect(state.turn.mode).toBe("parallel");

    const after = applyOk(state, { type: "END_TURN", playerId: "p1" }, T0);
    // p1 completed (no clock); p2 and p3 still owe their turns.
    expect(after.afk?.turnOpenSince).toEqual({ p2: T0, p3: T0 });
  });

  it("the clock PAUSES (re-stamps) while another seat owns the exclusive interaction — own windows keep burning", () => {
    const state = makeGame("turn-clock-pause", { players: 3 });
    seedTurnClock(state, T0);

    // Another seat's pending choice freezes p1: the clock reads paused, and a
    // later stamped action re-stamps p1's clock to that moment.
    state.pendingChoice = {
      id: "choice_x",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "test",
      options: [{ label: "a" }]
    } as GameState["pendingChoice"];
    expect(turnClockPausedFor(state, "p1")).toBe(true);
    const rearmed = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "choice_x", optionIndex: 0 }, LIMIT);
    expect(rearmed.afk?.turnOpenSince?.p1).toBe(LIMIT);

    // CONTROL: the seat's OWN pending choice does not pause its clock.
    const own = makeGame("turn-clock-pause-own", { players: 3 });
    own.pendingChoice = {
      id: "choice_y",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "test",
      options: [{ label: "a" }]
    } as GameState["pendingChoice"];
    expect(turnClockPausedFor(own, "p1")).toBe(false);
  });
});

describe("FORCE_TURN_TIMEOUT — arming the force-shift", () => {
  it("arms only once the full budget is burned (one second short is the CONTROL) and logs the expiry", () => {
    const state = makeGame("turn-force-arm", { players: 3 });
    seedTurnClock(state, T0);

    expect(
      expectRejected(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT - 1)
    ).toContain("still has turn time left");

    const armed = applyOk(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT);
    expect(armed.afk?.turnTimeoutPlayerId).toBe("p1");
    expect(armed.eventLog.some((event) => event.type === "TURN_TIME_EXPIRED")).toBe(true);
  });

  it("guards: no open turn, an already-armed timeout, and a paused clock are all refused", () => {
    const state = makeGame("turn-force-guards", { players: 3 });
    seedTurnClock(state, T0);

    // p3 has no open turn in ordered play.
    expect(
      expectRejected(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p3" }, LIMIT)
    ).toContain("no open turn");

    // A PvP battle pauses the participants' clocks — the arm is refused.
    const pvp = makeGame("turn-force-pvp", { players: 3 });
    seedTurnClock(pvp, T0);
    const attacker = getMainHero(pvp, "p1")!;
    const defender = getMainHero(pvp, "p3")!;
    startPlayerCombat(pvp, attacker, defender, defender.spaceId ?? "0,0");
    expect(pvp.combat?.context.kind).toBe("player");
    expect(turnClockPausedFor(pvp, "p1")).toBe(true);
    expect(
      expectRejected(pvp, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT)
    ).toContain("paused");

    // A second arm while one is resolving is refused.
    const armed = applyOk(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT);
    expect(
      expectRejected(armed, { type: "FORCE_TURN_TIMEOUT", playerId: "p3", targetPlayerId: "p1" }, LIMIT + 1)
    ).toContain("already being timed out");
  });

  it("RESOLVE_TURN_TIMEOUT is driver-only: rejected when no timeout is resolving", () => {
    const state = makeGame("turn-resolve-guard", { players: 3 });
    expect(expectRejected(state, { type: "RESOLVE_TURN_TIMEOUT", playerId: "p1" })).toContain("No expired turn");
  });
});

describe("the force-shift — the turn ends, the player stays in the game", () => {
  it("ordered: the expired turn ends, the NEXT player starts, nobody is eliminated — and the next round gives a fresh budget", () => {
    const state = makeGame("turn-shift-ordered", { players: 3 });
    seedTurnClock(state, T0);

    let current = applyOk(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT);
    current = driveAfkDrop(current, () => ({ now: LIMIT + 1_000 }));

    expect(current.afk?.turnTimeoutPlayerId ?? null).toBeNull();
    expect(current.activePlayerId).toBe("p2");
    // The whole point vs the AFK kick: p1 is NOT eliminated and keeps playing.
    expect(current.players.p1.eliminated ?? false).toBe(false);
    expect(current.turnOrder).toContain("p1");
    expect(current.phase).not.toBe("game-over");
    expect(current.eventLog.some((event) => event.type === "TURN_ENDED" && event.playerId === "p1")).toBe(true);

    // The rotation reaches p1 again with a FRESH stamp — the old burn is gone.
    current = applyOk(current, { type: "END_TURN", playerId: "p2" }, LIMIT + 2_000);
    current = applyOk(current, { type: "END_TURN", playerId: "p3" }, LIMIT + 3_000);
    expect(current.activePlayerId).toBe("p1");
    expect(current.afk?.turnOpenSince?.p1).toBe(LIMIT + 3_000);
  });

  it("default-resolves the seat's open pending CHOICE (skip arm) first, and the auto-answers do NOT refresh their AFK idle clock", () => {
    const state = makeGame("turn-shift-choice", { players: 3 });
    const moraleBefore = state.players.p1.morale;
    // Real idle stamps: p1 has been idle since T0 and must STILL read as idle
    // after the driver acts on their behalf.
    const afk = getAfkState(state);
    for (const seat of state.turnOrder) {
      afk.lastActionAt[seat] = T0;
    }
    seedTurnClock(state, T0);

    // A real queued interaction for p1: a visit-step choice with a skip arm.
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    state.adventure!.rewardQueue.push({
      playerId: "p1",
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
    expect(visitOwner(state)).toBe("p1");

    let current = applyOk(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT);
    current = driveAfkDrop(current, () => ({ now: LIMIT + 1_000 }));

    // The choice was answered with the do-nothing arm and the turn ended.
    expect(current.adventure?.pendingVisit ?? null).toBeNull();
    expect(current.players.p1.morale).toBe(moraleBefore);
    expect(current.activePlayerId).toBe("p2");
    expect(current.players.p1.eliminated ?? false).toBe(false);
    // The driver's auto-answers did not count as p1 "acting": the idle clock
    // still shows T0, so the AFK vote/auto-kick machinery keeps its teeth.
    expect(current.afk?.lastActionAt.p1).toBe(T0);
  });

  it("a NEUTRAL fight PAUSES (resets) the turn clock — the timer never expires mid-battle", () => {
    const state = makeGame("turn-neutral-pause", { players: 3 });
    const hero = getMainHero(state, "p1")!;
    const fieldId = "99,9";
    const field: MapFieldState = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "empty_field",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[fieldId] = field;
    hero.spaceId = fieldId;
    startNeutralEncounter(state, hero, field);
    expect(state.combat?.context.kind).toBe("neutral");
    seedTurnClock(state, T0);

    // House rule "the 10-minute limit resets when in battle": the player's OWN
    // neutral combat now pauses their turn clock, so the arm is refused even far
    // past the limit — combat time can never expire the map-turn budget.
    expect(turnClockPausedFor(state, "p1")).toBe(true);
    expect(
      expectRejected(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT + 5 * 60_000)
    ).toContain("paused");

    // CONTROL: remove the battle from the SAME state (the fighter is back on the
    // map) — now the clock runs and the very same seat DOES time out past the
    // limit, proving the pause was specifically the open battle.
    state.combat = null;
    expect(turnClockPausedFor(state, "p1")).toBe(false);
    const armed = applyOk(state, { type: "FORCE_TURN_TIMEOUT", playerId: "p2", targetPlayerId: "p1" }, LIMIT);
    expect(armed.afk?.turnTimeoutPlayerId).toBe("p1");
  });

  it("parallel mode: the expired turn is marked done; force-ending the LAST open turn wraps the round WITHOUT eating the fresh one", () => {
    const state = makeGame("turn-shift-parallel", { players: 3, parallelTurns: 3 });
    expect(state.turn.mode).toBe("parallel");

    // p1 and p2 end their turns; p3 stalls out the clock.
    let current = applyOk(state, { type: "END_TURN", playerId: "p1" }, T0);
    current = applyOk(current, { type: "END_TURN", playerId: "p2" }, T0 + 1_000);
    expect(current.afk?.turnOpenSince?.p3).toBe(T0);
    const roundBefore = current.round;

    current = applyOk(current, { type: "FORCE_TURN_TIMEOUT", playerId: "p1", targetPlayerId: "p3" }, LIMIT);
    current = driveAfkDrop(current, () => ({ now: LIMIT + 1_000 }));

    // The round wrapped (p3 was the last open turn) and p3 is still in the game
    // with their NEW parallel turn open — the flag must not consume it.
    expect(current.round).toBe(roundBefore + 1);
    expect(current.players.p3.eliminated ?? false).toBe(false);
    expect(current.afk?.turnTimeoutPlayerId ?? null).toBeNull();
    expect(current.turn.completedPlayerIds).not.toContain("p3");
    expect(current.phase).not.toBe("game-over");
  });
});
