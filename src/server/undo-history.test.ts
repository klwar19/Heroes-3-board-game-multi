/**
 * OPTIONAL "Undo moves" mode (debug/testing) — the shared undo-history module
 * and its built-in-store integration. The PartyKit edge wiring (which reuses
 * these SAME helpers verbatim) is covered end-to-end in
 * `undo-history-edge.test.ts`.
 *
 * Every claim here has a CONTROL that fails if the guardrail wiring is removed:
 * default OFF keeps zero history and rejects UNDO_MOVE; history is bounded;
 * restore is an EXACT prior-state swap; the restored state leaks no history into
 * a player view.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import {
  closeRoom,
  createRoom,
  getRoomSnapshot,
  restoreRoom,
  submitRoomAction
} from "./game-room-store";
import {
  __resetUndoHistoriesForTests,
  actorIsRoomParticipant,
  applyUndoMove,
  popUndoSnapshot,
  recordUndoSnapshot,
  undoDepth,
  UNDO_HISTORY_LIMIT,
  undoModeEnabled
} from "./undo-history";

beforeEach(() => {
  __resetUndoHistoriesForTests();
});

function uniqueRoom(name: string): string {
  return `undo-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fully started 2-human adventure with the undo option ON or OFF. */
function startedGame(seed: string, undoMoves: boolean): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    rollFirstPlayer: false,
    undoMoves
  });
}

/** Seed a started game into the built-in store (over a fresh setup lobby). */
function seedRoom(roomId: string, undoMoves: boolean): GameState {
  createRoom({ roomId });
  restoreRoom(roomId, startedGame(roomId, undoMoves));
  return getRoomSnapshot(roomId).state;
}

/** A legal action for `playerId` on this state, fully formed for dispatch. */
function firstLegalAction(state: GameState, playerId: PlayerId): GameAction {
  const offers = getLegalActions(state, playerId);
  const refresh = offers.find((legal) => legal.action.type === "REFRESH_HAND");
  if (refresh && refresh.action.type === "REFRESH_HAND") {
    const player = state.players[playerId]!;
    const limit = player.needsHandRefresh ? 4 : 5;
    const over = Math.max(0, player.hand.length - limit);
    return { ...refresh.action, discardCardIds: player.hand.slice(0, over) };
  }
  const first = offers[0];
  if (!first) {
    throw new Error(`no legal action for ${playerId}`);
  }
  return first.action;
}

/** Deep-clone helper for state comparisons (drops server-only wrappers). */
function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

describe("undo-history module", () => {
  it("undoModeEnabled reads the frozen adventure flag (on) / rejects when absent (CONTROL)", () => {
    expect(undoModeEnabled(startedGame("mod-on", true))).toBe(true);
    expect(undoModeEnabled(startedGame("mod-off", false))).toBe(false);
    expect(undoModeEnabled(null)).toBe(false);
  });

  it("records pre-action snapshots when ON, no-ops when OFF (CONTROL), and caps the stack", () => {
    const on = startedGame("rec-on", true);
    const roomId = "rec-on-room";
    // OFF control: nothing is recorded.
    recordUndoSnapshot(roomId, startedGame("rec-off", false));
    expect(undoDepth(roomId)).toBe(0);
    // ON: each push grows the stack, bounded by the limit (oldest dropped).
    for (let i = 0; i < UNDO_HISTORY_LIMIT + 3; i += 1) {
      recordUndoSnapshot(roomId, on);
    }
    expect(undoDepth(roomId)).toBe(UNDO_HISTORY_LIMIT);
  });

  it("popUndoSnapshot returns clones LIFO and null when empty", () => {
    const roomId = "pop-room";
    const a = startedGame("pop-a", true);
    a.round = 3;
    const b = startedGame("pop-b", true);
    b.round = 7;
    recordUndoSnapshot(roomId, a);
    recordUndoSnapshot(roomId, b);
    expect(popUndoSnapshot(roomId)?.round).toBe(7);
    expect(popUndoSnapshot(roomId)?.round).toBe(3);
    expect(popUndoSnapshot(roomId)).toBeNull();
  });

  it("applyUndoMove rejects with mode off / empty history, else restores + stamps a feed event", () => {
    const roomId = "apply-room";
    const off = startedGame("apply-off", false);
    expect(applyUndoMove(roomId, off, "p1")).toEqual({ undone: false, reason: "Undo mode is off for this game." });

    const on = startedGame("apply-on", true);
    // Nothing recorded yet → nothing to undo.
    const empty = applyUndoMove(roomId, on, "p1");
    expect(empty).toEqual({ undone: false, reason: "There is nothing to undo." });

    // Record a prior state, then undo restores it and appends ONE MOVES_UNDONE.
    const prior = clone(on);
    prior.round = 5;
    recordUndoSnapshot(roomId, prior);
    const result = applyUndoMove(roomId, on, "p1");
    expect(result.undone).toBe(true);
    if (!result.undone) return;
    expect(result.count).toBe(1);
    expect(result.state.round).toBe(5);
    const tail = result.state.eventLog[result.state.eventLog.length - 1];
    expect(tail.type).toBe("MOVES_UNDONE");
  });

  it("actorIsRoomParticipant: open table = anyone; hosted = members only", () => {
    const open = startedGame("part-open", true); // no room → open table
    expect(actorIsRoomParticipant(open, "stranger")).toBe(true);

    const hosted = startedGame("part-hosted", true);
    hosted.room = {
      hosted: true,
      hostClientId: "host-c",
      members: [{ clientId: "host-c", name: "Host", seat: "p1", isHost: true }]
    };
    expect(actorIsRoomParticipant(hosted, "host-c")).toBe(true);
    expect(actorIsRoomParticipant(hosted, "stranger")).toBe(false);
    // Verified userId also matches.
    hosted.room.members[0].userId = "acct-1";
    expect(actorIsRoomParticipant(hosted, "other-client", "acct-1")).toBe(true);
  });
});

describe("undo-history built-in store integration", () => {
  it("undo restores the EXACT prior state (deep-equal minus the undo feed event)", () => {
    const roomId = uniqueRoom("restore");
    const before = seedRoom(roomId, true);

    const action = firstLegalAction(before, "p1");
    const applied = submitRoomAction(roomId, action);
    expect(applied.result.errors).toEqual([]);
    // A snapshot was recorded for this action.
    expect(undoDepth(roomId)).toBe(1);

    const undo = submitRoomAction(roomId, { type: "UNDO_MOVE", playerId: "p1" });
    expect(undo.result.errors).toEqual([]);
    const after = undo.snapshot.state;

    // The restored state equals `before` except for the appended MOVES_UNDONE
    // event (and its event-counter bump).
    const tail = after.eventLog[after.eventLog.length - 1];
    expect(tail.type).toBe("MOVES_UNDONE");

    const afterCmp = { ...clone(after), eventLog: after.eventLog.slice(0, -1) };
    delete afterCmp.eventCounter;
    const beforeCmp = { ...clone(before) };
    delete beforeCmp.eventCounter;
    expect(afterCmp).toEqual(beforeCmp);

    // The stack is empty again (one undo consumed one snapshot).
    expect(undoDepth(roomId)).toBe(0);
  });

  it("CONTROL: with the option OFF nothing is recorded and UNDO_MOVE is rejected (state untouched)", () => {
    const roomId = uniqueRoom("off");
    const before = seedRoom(roomId, false);
    const beforeVersion = getRoomSnapshot(roomId).version;

    const applied = submitRoomAction(roomId, firstLegalAction(before, "p1"));
    expect(applied.result.errors).toEqual([]);
    // No history kept in the default (off) mode.
    expect(undoDepth(roomId)).toBe(0);

    const undo = submitRoomAction(roomId, { type: "UNDO_MOVE", playerId: "p1" });
    expect(undo.result.errors.map((error) => error.message)).toEqual(["Undo mode is off for this game."]);
    // The rejection left the (post-action) game exactly as it was — the version
    // did not advance past the one real action.
    expect(getRoomSnapshot(roomId).version).toBe(beforeVersion + 1);
  });

  it("history stays bounded to the cap across many store actions (invariant)", () => {
    const roomId = uniqueRoom("cap");
    let state = seedRoom(roomId, true);
    let applied = 0;
    for (let i = 0; i < UNDO_HISTORY_LIMIT + 8; i += 1) {
      let action: GameAction;
      try {
        action = firstLegalAction(state, state.activePlayerId);
      } catch {
        break; // ran out of legal actions for the active seat — stop driving
      }
      const result = submitRoomAction(roomId, action);
      if (result.result.errors.length > 0) {
        break;
      }
      state = result.snapshot.state;
      applied += 1;
      // The bound holds after EVERY recorded action (the store never exceeds it;
      // the precise oldest-dropped behaviour is pinned in the module cap test).
      expect(undoDepth(roomId)).toBeLessThanOrEqual(UNDO_HISTORY_LIMIT);
    }
    expect(applied).toBeGreaterThan(0);
    expect(undoDepth(roomId)).toBeLessThanOrEqual(UNDO_HISTORY_LIMIT);
  });

  it("a player view of the restored state carries NO undo history and still masks opponents", () => {
    const roomId = uniqueRoom("mask");
    const before = seedRoom(roomId, true);
    submitRoomAction(roomId, firstLegalAction(before, "p1"));
    const undo = submitRoomAction(roomId, { type: "UNDO_MOVE", playerId: "p1" });
    const restored = undo.snapshot.state;

    // No undo-history-shaped field ever reaches state (it lives only server-side).
    expect("undoHistory" in restored).toBe(false);
    const serialized = JSON.stringify(restored);
    expect(serialized).not.toContain("undoHistory");

    // Standard masking still holds: p1's view hides p2's hand (draw pile masked
    // to a count), proving the restored state is a normal, maskable GameState.
    const p1View = getPlayerView(restored, "p1");
    expect(p1View.decks).toBeDefined();
    const p2Hand = p1View.players.p2?.hand;
    // Opponent hand is masked to hidden ids (or omitted) in another seat's view.
    if (Array.isArray(p2Hand)) {
      expect(p2Hand.every((cardId) => cardId === "hidden" || cardId.length === 0)).toBe(true);
    }
  });

  it("closing the room clears the undo history", () => {
    const roomId = uniqueRoom("close");
    const before = seedRoom(roomId, true);
    submitRoomAction(roomId, firstLegalAction(before, "p1"));
    expect(undoDepth(roomId)).toBe(1);
    // Open table: anyone may close it → forceCloseRoom clears the undo stack.
    closeRoom(roomId);
    expect(undoDepth(roomId)).toBe(0);
  });
});
