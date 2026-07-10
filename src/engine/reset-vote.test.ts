import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  isResetVoteApproved,
  resetVoteAuthorizes,
  resetVoteRequired,
  type GameAction,
  type GameState
} from "./index";
import { eliminatePlayer } from "./adventure";

/**
 * "Start a new adventure" table-consent vote (src/engine/reset-vote.ts).
 *
 * Pressing "New adventure" while a multiplayer game is IN PROGRESS opens this
 * vote instead of wiping the game immediately: EVERY live seat must confirm
 * before the reset may fire. Each behaviour below fails if its wiring is
 * removed (CLAUDE.md #1), with lobby / finished-game / partial-vote CONTROLs.
 */

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function inProgress(seed: string, players?: 2 | 3): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(players === 3 ? { players: THREE_PLAYERS } : {})
  });
}

function applyOk(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

describe("resetVoteRequired — which resets must open the all-players vote", () => {
  it("only an in-progress multiplayer adventure requires it (lobby, finished game and a lone seat are CONTROLs)", () => {
    const live = inProgress("rv-required");
    expect(resetVoteRequired(live)).toBe(true);

    // CONTROL 1: a setup lobby has no running game to protect — reset directly.
    const lobby = createAdventureLobbyState({ seed: "rv-lobby" });
    expect(resetVoteRequired(lobby)).toBe(false);

    // CONTROL 2: a finished game resets directly (start the next adventure).
    const over = inProgress("rv-over");
    over.phase = "game-over";
    expect(resetVoteRequired(over)).toBe(false);

    // CONTROL 3: with only one live seat there is nobody else whose consent is
    // needed — reset directly (the ≥2-live-seats branch).
    const solo = inProgress("rv-solo");
    solo.turnOrder = ["p1"];
    expect(resetVoteRequired(solo)).toBe(false);
  });
});

describe("New adventure vote — request, confirm, cancel", () => {
  it("a request opens the vote as the requester's own confirmation; a lobby request and a non-seat request are rejected", () => {
    // CONTROL: a request in the setup lobby is refused (no game to reset yet).
    const lobby = createAdventureLobbyState({ seed: "req-lobby" });
    expect(
      expectRejected(lobby, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" })
    ).toMatch(/not started|lobby/i);

    const state = inProgress("req-open");
    // CONTROL: a seat not in the game cannot call for a new adventure.
    expect(
      expectRejected(state, { type: "REQUEST_ROOM_RESET", playerId: "ghost", clientId: "cA" })
    ).toMatch(/still in the game/i);

    const opened = applyOk(state, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" }, 1000);
    expect(opened.resetVote).toMatchObject({
      startedByPlayerId: "p1",
      startedByClientId: "cA",
      startedAt: 1000,
      confirmations: { p1: true }
    });
    // The opener's own request already counts — but the second seat still owes a
    // confirm, so it is NOT yet approved (the partial-vote CONTROL).
    expect(isResetVoteApproved(opened)).toBe(false);

    // A second request while one is open is refused.
    expect(
      expectRejected(opened, { type: "REQUEST_ROOM_RESET", playerId: "p2", clientId: "cB" })
    ).toMatch(/already open/i);
  });

  it("the reset is approved ONLY once EVERY live seat has confirmed (3 players — two confirms is the CONTROL)", () => {
    let state = inProgress("confirm-3p", 3);
    state = applyOk(state, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" });
    expect(isResetVoteApproved(state)).toBe(false);

    // p2 confirms — still missing p3 (the CONTROL: a majority is not enough).
    state = applyOk(state, { type: "CONFIRM_ROOM_RESET", playerId: "p2" });
    expect(isResetVoteApproved(state)).toBe(false);

    // p3 confirms — now unanimous, so the reset is approved.
    state = applyOk(state, { type: "CONFIRM_ROOM_RESET", playerId: "p3" });
    expect(isResetVoteApproved(state)).toBe(true);
  });

  it("only the opening browser authorises the approved reset (a different client and a partial vote are CONTROLs)", () => {
    let state = inProgress("authorise");
    state = applyOk(state, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" });

    // CONTROL: not yet approved (p2 has not confirmed) — no client is authorised.
    expect(resetVoteAuthorizes(state, "cA")).toBe(false);

    state = applyOk(state, { type: "CONFIRM_ROOM_RESET", playerId: "p2" });
    expect(isResetVoteApproved(state)).toBe(true);
    // The browser that OPENED the vote is authorised to fire the reset…
    expect(resetVoteAuthorizes(state, "cA")).toBe(true);
    // …a different browser is NOT (only one client completes the reset).
    expect(resetVoteAuthorizes(state, "cB")).toBe(false);
    expect(resetVoteAuthorizes(state, undefined)).toBe(false);
  });

  it("any live seat cancels the vote, and a cancel with no vote open is rejected", () => {
    let state = inProgress("cancel");
    // CONTROL: nothing to cancel yet.
    expect(expectRejected(state, { type: "CANCEL_ROOM_RESET", playerId: "p2" })).toMatch(/no new-adventure vote/i);

    state = applyOk(state, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" });
    expect(state.resetVote).not.toBeNull();
    // The OTHER seat declines — the whole vote is cleared for the table.
    state = applyOk(state, { type: "CANCEL_ROOM_RESET", playerId: "p2" });
    expect(state.resetVote ?? null).toBeNull();
  });

  it("eliminating a player clears an open vote (the live-seat set moved)", () => {
    let state = inProgress("eliminate-3p", 3);
    state = applyOk(state, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" });
    expect(state.resetVote).not.toBeNull();

    // p3 leaves the game: the vote is void (this is the clearResetVote wiring in
    // eliminatePlayer — without it the vote would sit half-approved).
    eliminatePlayer(state, "p3", "conceded", true);
    expect(state.resetVote ?? null).toBeNull();
  });
});
