import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  driveAfkDrop,
  getAfkState,
  isComputerPlayer,
  AFK_IDLE_MS,
  type GameAction,
  type GameState
} from "./index";

/**
 * Multiplayer "Leave game" (LEAVE_GAME) + the departure vote, and the "AI takes
 * over" answer added to the AFK vote (src/engine/afk.ts). A leaving seat is
 * either REMOVED (unanimous "kick" — the existing kick rule, through the same
 * force-drop driver) or handed to the COMPUTER (unanimous "ai"; a split stays
 * open — USER RULING 2026-09-29). Each case has
 * a CONTROL where the other outcome / no outcome must happen, so removing the
 * new branch fails the test.
 */

const T0 = 1_000_000_000;

function applyOk(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function rejected(state: GameState, action: GameAction, now?: number): string {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(seed: string, options: { players?: 2 | 3; hosted?: boolean } = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: 0,
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  state.room = options.hosted
    ? {
        hosted: true,
        hostClientId: "c1",
        members: [
          { clientId: "c1", name: "Catherine", seat: "p1", isHost: true },
          { clientId: "c2", name: "Sandro", seat: "p2", isHost: false },
          ...(options.players === 3 ? [{ clientId: "c3", name: "Alamar", seat: "p3", isHost: false }] : [])
        ]
      }
    : { hosted: false, hostClientId: null, members: [] };
  return state;
}

describe("Leave game — departure vote", () => {
  it("opens a departure vote on an OPEN table (no idle window needed) and unanimous Remove drops the seat", () => {
    const state = makeGame("leave-remove", { players: 3 });
    let current = applyOk(state, { type: "LEAVE_GAME", playerId: "p2" }, T0);
    expect(current.afk?.vote).toMatchObject({ targetPlayerId: "p2", kind: "left", votes: {} });
    expect(current.players.p2.leftGame).toBe(true);

    // CONTROL: one of two voters is not enough — nothing happens yet.
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p1", vote: "kick" }, T0 + 1);
    expect(current.afk?.vote?.targetPlayerId).toBe("p2");
    expect(current.afk?.droppingPlayerId ?? null).toBeNull();

    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p3", vote: "kick" }, T0 + 2);
    expect(current.afk?.vote).toBeNull();
    expect(current.afk?.droppingPlayerId).toBe("p2");
    current = driveAfkDrop(current, () => ({ now: T0 + 3 }));
    expect(current.players.p2.eliminated).toBe(true);
    expect(current.players.p2.kickedByVote).toBe(true);
    expect(current.turnOrder).not.toContain("p2");
    // Removed, NOT handed to the computer.
    expect(isComputerPlayer(current, "p2")).toBe(false);
  });

  it("a split vote stays open; a UNANIMOUS 'AI takes over' hands the seat to the computer", () => {
    const state = makeGame("leave-ai", { players: 3, hosted: true });
    let current = applyOk(state, { type: "LEAVE_GAME", playerId: "p2" }, T0);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p1", vote: "kick" }, T0 + 1);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p3", vote: "ai" }, T0 + 2);
    // CONTROL: one Remove + one AI — nothing is decided yet (all votes needed).
    expect(current.afk?.vote).not.toBeNull();
    expect(isComputerPlayer(current, "p2")).toBe(false);
    // p1 changes their answer to AI → unanimous.
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p1", vote: "ai" }, T0 + 3);

    expect(current.afk?.vote).toBeNull();
    expect(current.afk?.droppingPlayerId ?? null).toBeNull();
    expect(isComputerPlayer(current, "p2")).toBe(true);
    expect(current.controllers?.p2?.kind).toBe("computer");
    expect(current.players.p2.eliminated ?? false).toBe(false);
    expect(current.players.p2.replacedByComputer).toBe(true);
    expect(current.turnOrder).toContain("p2");
    // The leaving human's membership steps down to observer; the others keep theirs.
    expect(current.room?.members.find((member) => member.clientId === "c2")?.seat).toBe("observer");
    expect(current.room?.members.find((member) => member.clientId === "c3")?.seat).toBe("p3");
    expect(
      current.eventLog.some((event) => event.type === "AFK_VOTE_RESOLVED" && event.outcome === "ai")
    ).toBe(true);
  });

  it("a departure vote has no 'wait', and the leaver cannot vote on their own seat", () => {
    const state = makeGame("leave-no-wait", { players: 3 });
    const current = applyOk(state, { type: "LEAVE_GAME", playerId: "p2" }, T0);
    expect(rejected(current, { type: "CAST_AFK_VOTE", playerId: "p1", vote: "wait" }, T0 + 1)).toContain(
      "chose to leave"
    );
    expect(rejected(current, { type: "CAST_AFK_VOTE", playerId: "p2", vote: "ai" }, T0 + 1)).toContain(
      "cannot vote"
    );
  });

  it("the leaver acting again withdraws the vote (they stayed); another seat's vote is the CONTROL", () => {
    const state = makeGame("leave-stay", { players: 3 });
    expect(state.activePlayerId).toBe("p1");
    let current = applyOk(state, { type: "LEAVE_GAME", playerId: "p1" }, T0);
    // CONTROL: a voter's own vote leaves the departure vote open.
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p2", vote: "kick" }, T0 + 1);
    expect(current.afk?.vote?.kind).toBe("left");
    // The leaver takes a real action: vote cancelled, flag cleared.
    current = applyOk(current, { type: "END_TURN", playerId: "p1" }, T0 + 2);
    expect(current.afk?.vote).toBeNull();
    expect(current.players.p1.leftGame).toBe(false);
    expect(current.players.p1.eliminated ?? false).toBe(false);
  });

  it("2 players: the lone opponent decides — AI takes over keeps the game running", () => {
    const state = makeGame("leave-duel", { players: 2 });
    let current = applyOk(state, { type: "LEAVE_GAME", playerId: "p2" }, T0);
    current = applyOk(current, { type: "CAST_AFK_VOTE", playerId: "p1", vote: "ai" }, T0 + 1);
    expect(isComputerPlayer(current, "p2")).toBe(true);
    expect(current.adventure?.winnerPlayerId ?? null).toBeNull();
  });

  it("single-player games refuse Leave game", () => {
    const state = makeGame("leave-solo", { players: 2 });
    state.sessionMode = "single-player";
    expect(rejected(state, { type: "LEAVE_GAME", playerId: "p1" }, T0)).toContain("single-player");
  });
});

describe("AFK vote — 'AI takes over' answer", () => {
  it("2-player hosted table: the starter's own 'ai' vote hands the idle seat to the computer (default 'kick' is the CONTROL)", () => {
    const base = makeGame("afk-ai", { players: 2, hosted: true });
    const afk = getAfkState(base);
    afk.lastActionAt = { p1: T0, p2: T0 };
    expect(base.activePlayerId).toBe("p1");

    const ai = applyOk(
      base,
      { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1", vote: "ai" },
      T0 + AFK_IDLE_MS
    );
    expect(isComputerPlayer(ai, "p1")).toBe(true);
    expect(ai.afk?.droppingPlayerId ?? null).toBeNull();

    // CONTROL: the default starter vote is still "kick" → force-drop, no computer.
    const kick = applyOk(base, { type: "START_AFK_VOTE", playerId: "p2", targetPlayerId: "p1" }, T0 + AFK_IDLE_MS);
    expect(kick.afk?.droppingPlayerId).toBe("p1");
    expect(isComputerPlayer(kick, "p1")).toBe(false);
  });
});
