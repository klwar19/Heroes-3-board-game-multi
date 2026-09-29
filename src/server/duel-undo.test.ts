/**
 * 1v1 Undo (`adventure.duelUndo`, lobby option "Undo button for 1v1 games") —
 * the server-side safe-undo history (src/server/undo-history.ts) and its
 * safety rules (src/engine/undo-safety.ts): own latest moves only, never past
 * randomness or a hidden-information reveal, never across the opponent's
 * action. Each rule has a CONTROL where it must refuse, so deleting the check
 * makes the test fail.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  createSeededRandom,
  duelUndoButtonState,
  gameProgressKey,
  getLegalActions,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import { createRoom, getRoomSnapshot, restoreRoom, submitRoomAction } from "./game-room-store";
import { __resetUndoHistoriesForTests, applyUndoMove, trackDuelUndo, undoTrackingMark } from "./undo-history";

beforeEach(() => {
  __resetUndoHistoriesForTests();
});

let roomSeq = 0;
function uniqueRoom(name: string): string {
  roomSeq += 1;
  return `duel-undo-${name}-${roomSeq}-${Date.now().toString(36)}`;
}

function duelGame(seed: string, options: { duelUndo?: boolean; ranked?: boolean } = {}): GameState {
  const state = createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    rollFirstPlayer: false,
    duelUndo: options.duelUndo ?? true
  });
  // A Normal (unranked) open table by default; ranked tables allow it too.
  state.room = { hosted: false, hostClientId: null, members: [], ranked: options.ranked ?? false };
  return state;
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** A deterministic, reveal-free change standing in for a hero/unit move. */
function safeMove(state: GameState, playerId: PlayerId): GameState {
  const post = clone(state);
  post.players[playerId].resources.gold += 1;
  return post;
}

const move = (playerId: PlayerId): GameAction => ({ type: "END_TURN", playerId });

describe("1v1 Undo — setup gate", () => {
  it("freezes only for a 2-player game (a 3-player table is the CONTROL)", () => {
    expect(duelGame("gate-2").adventure?.duelUndo).toBe(true);
    const three = createAdventureGameState({
      seed: "gate-3",
      rollFirstPlayer: false,
      duelUndo: true,
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p3", name: "C", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });
    expect(three.adventure?.duelUndo ?? false).toBe(false);
  });
});

describe("1v1 Undo — safe-undo history", () => {
  it("takes back the actor's own safe move and restores the exact prior position", () => {
    const roomId = uniqueRoom("safe");
    const pre = duelGame(roomId);
    const mark = undoTrackingMark();
    const post = safeMove(pre, "p1");
    trackDuelUndo(roomId, pre, move("p1"), post, mark);
    expect(post.undoStatus).toMatchObject({ playerId: "p1", depth: 1 });
    expect(duelUndoButtonState(post, "p1")).toMatchObject({ visible: true, disabledReason: null, depth: 1 });

    // CONTROL: the opponent may not take back p1's move.
    const refused = applyUndoMove(roomId, post, "p2");
    expect(refused.undone).toBe(false);

    const undone = applyUndoMove(roomId, post, "p1");
    expect(undone.undone).toBe(true);
    if (!undone.undone) return;
    expect(gameProgressKey(undone.state)).toBe(gameProgressKey(pre));
    expect(undone.state.players.p1.resources.gold).toBe(pre.players.p1.resources.gold);
    expect(undone.state.eventLog.at(-1)?.type).toBe("MOVES_UNDONE");
  });

  it("CONTROL — randomness: a transaction that drew a random number locks the history", () => {
    const roomId = uniqueRoom("rng");
    const pre = duelGame(roomId);
    const mark = undoTrackingMark();
    createSeededRandom("a die roll").next();
    const post = safeMove(pre, "p1");
    trackDuelUndo(roomId, pre, move("p1"), post, mark);
    expect(post.undoStatus?.depth).toBe(0);
    expect(post.undoStatus?.lockedReason).toMatch(/random/i);
    expect(applyUndoMove(roomId, post, "p1").undone).toBe(false);
  });

  it("CONTROL — hidden information: a card leaving a draw pile locks the history", () => {
    const roomId = uniqueRoom("reveal");
    const pre = duelGame(roomId);
    const deckId = Object.keys(pre.decks).find((id) => pre.decks[id].drawPile.length > 0)!;
    const mark = undoTrackingMark();
    const post = safeMove(pre, "p1");
    post.decks[deckId].drawPile.pop();
    trackDuelUndo(roomId, pre, move("p1"), post, mark);
    expect(post.undoStatus?.depth).toBe(0);
    expect(post.undoStatus?.lockedReason).toMatch(/hidden/i);
    expect(applyUndoMove(roomId, post, "p1").undone).toBe(false);
  });

  it("CONTROL — opponent acted: their move locks the earlier move for good", () => {
    const roomId = uniqueRoom("opponent");
    const s0 = duelGame(roomId);
    const s1 = safeMove(s0, "p1");
    trackDuelUndo(roomId, s0, move("p1"), s1, undoTrackingMark());
    const s2 = safeMove(s1, "p2");
    trackDuelUndo(roomId, s1, move("p2"), s2, undoTrackingMark());
    expect(s2.undoStatus).toMatchObject({ playerId: "p2", depth: 1 });
    // p1 can no longer reach back behind p2's move.
    expect(applyUndoMove(roomId, s2, "p1").undone).toBe(false);
    const undone = applyUndoMove(roomId, s2, "p2");
    expect(undone.undone).toBe(true);
    if (!undone.undone) return;
    // ...and after p2 took theirs back, p1's older move is still locked.
    expect(applyUndoMove(roomId, undone.state, "p1").undone).toBe(false);
  });

  it("CONTROL — the game moved on (an unrecorded step): undo is refused", () => {
    const roomId = uniqueRoom("stale");
    const pre = duelGame(roomId);
    const post = safeMove(pre, "p1");
    trackDuelUndo(roomId, pre, move("p1"), post, undoTrackingMark());
    const drifted = safeMove(post, "p2");
    expect(applyUndoMove(roomId, drifted, "p1").undone).toBe(false);
  });

  it("works on ranked tables too (USER RULING 2026-09-29)", () => {
    const roomId = uniqueRoom("ranked");
    const pre = duelGame(roomId, { ranked: true });
    const post = safeMove(pre, "p1");
    trackDuelUndo(roomId, pre, move("p1"), post, undoTrackingMark());
    expect(post.undoStatus?.depth ?? 0).toBeGreaterThan(0);
    expect(applyUndoMove(roomId, post, "p1").undone).toBe(true);
  });
});

describe("1v1 Undo — audit 2026-09-29 (peeks, reactions, folded beats, pause)", () => {
  it("CONTROL — a private peek (Rogues scout) locks: the top card can never be seen then taken back", () => {
    const roomId = uniqueRoom("rogues");
    const pre = duelGame(roomId);
    const active = pre.activePlayerId as PlayerId;
    pre.players[active].canMulligan = false;
    pre.players[active].needsHandRefresh = false;
    pre.players[active].army.push({ id: "army_rg", unitDefId: "neutral.rogues", side: "neutral" });
    const deckId = Object.keys(pre.decks).find((id) => pre.decks[id].drawPile.length >= 2)!;
    createRoom({ roomId });
    restoreRoom(roomId, pre);
    const applied = submitRoomAction(roomId, { type: "ROGUES_SCOUT_DECK", playerId: active, deckId });
    expect(applied.result.errors).toEqual([]);
    // The deck itself did not change (the card stays on top) — only the peek.
    expect(applied.snapshot.state.decks[deckId].drawPile).toEqual(pre.decks[deckId].drawPile);
    expect(applied.snapshot.state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(applied.snapshot.state.undoStatus?.depth ?? 0).toBe(0);
    expect(applied.snapshot.state.undoStatus?.lockedReason).toMatch(/hidden/i);
    expect(submitRoomAction(roomId, { type: "UNDO_MOVE", playerId: active }).result.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL — a reaction window opening (the opponent holds an instant) locks the declaration", () => {
    const roomId = uniqueRoom("reaction");
    const pre = duelGame(roomId);
    const mark = undoTrackingMark();
    const post = safeMove(pre, "p1");
    post.reactionWindow = {
      id: "reaction_evt_1",
      triggerEvent: { id: "evt_1", type: "TURN_ENDED", playerId: "p1" } as unknown as NonNullable<GameState["reactionWindow"]>["triggerEvent"],
      allowedPlayerIds: ["p2"],
      priorityPlayerId: "p2",
      legalReactions: { p2: [] },
      passedPlayerIds: [],
      closesWhen: "all-pass"
    };
    trackDuelUndo(roomId, pre, move("p1"), post, mark);
    expect(post.undoStatus?.depth).toBe(0);
    expect(post.undoStatus?.lockedReason).toMatch(/hidden|reaction/i);
    expect(applyUndoMove(roomId, post, "p1").undone).toBe(false);
  });

  it("CONTROL — a computer opponent's beat folded into the same transaction locks the move", () => {
    const roomId = uniqueRoom("folded");
    const pre = duelGame(roomId);
    const mark = undoTrackingMark();
    const reducerState = safeMove(pre, "p1");
    // The live settle answered with the opponent's (computer's) own beat.
    const settled = safeMove(reducerState, "p2");
    trackDuelUndo(roomId, pre, move("p1"), settled, mark, reducerState);
    expect(settled.undoStatus?.depth).toBe(0);
    expect(settled.undoStatus?.lockedReason).toMatch(/opponent/i);
    expect(applyUndoMove(roomId, settled, "p1").undone).toBe(false);

    // CONTROL: the settle changed nothing (same object) — the move stays undoable.
    const roomId2 = uniqueRoom("folded-control");
    const pre2 = duelGame(roomId2);
    const post2 = safeMove(pre2, "p1");
    trackDuelUndo(roomId2, pre2, move("p1"), post2, undoTrackingMark(), post2);
    expect(post2.undoStatus).toMatchObject({ playerId: "p1", depth: 1 });
  });

  it("a game change no duel seat made drops the recorded steps (no live-looking button)", () => {
    const roomId = uniqueRoom("seatless");
    const s0 = duelGame(roomId);
    const s1 = safeMove(s0, "p1");
    trackDuelUndo(roomId, s0, move("p1"), s1, undoTrackingMark());
    expect(s1.undoStatus?.depth).toBe(1);
    const s2 = safeMove(s1, "p2");
    trackDuelUndo(roomId, s1, { type: "SEND_CHAT", clientId: "c9", text: "hi" }, s2, undoTrackingMark());
    expect(s2.undoStatus?.depth).toBe(0);
    expect(duelUndoButtonState(s2, "p1").disabledReason).toBeTruthy();
    expect(applyUndoMove(roomId, s2, "p1").undone).toBe(false);
  });

  it("a paused table refuses the undo until it resumes (the unpaused table is the CONTROL)", () => {
    const roomId = uniqueRoom("paused");
    const pre = duelGame(roomId);
    const post = safeMove(pre, "p1");
    trackDuelUndo(roomId, pre, move("p1"), post, undoTrackingMark());
    const paused = clone(post);
    paused.pause = { requestedByPlayerId: "p2", requestedAt: 1, confirmations: { p1: true, p2: true }, pausedAt: 2 };
    expect(duelUndoButtonState(paused, "p1").disabledReason).toMatch(/paused/i);
    expect(applyUndoMove(roomId, paused, "p1").undone).toBe(false);
    expect(applyUndoMove(roomId, post, "p1").undone).toBe(true);
  });

  it("a real, reveal-free hero step through the store is undoable and restores the position", () => {
    const base = duelGame("real-step");
    const active = base.activePlayerId as PlayerId;
    for (const player of Object.values(base.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    const moves = getLegalActions(base, active)
      .map((legal) => legal.action)
      .filter((action) => action.type === "MOVE_HERO");
    expect(moves.length).toBeGreaterThan(0);
    let undoneOnce = false;
    for (const action of moves) {
      const roomId = uniqueRoom("real-step");
      createRoom({ roomId });
      restoreRoom(roomId, clone(base));
      const before = getRoomSnapshot(roomId).state;
      const applied = submitRoomAction(roomId, action);
      if (applied.result.errors.length > 0 || (applied.snapshot.state.undoStatus?.depth ?? 0) === 0) continue;
      const undone = submitRoomAction(roomId, { type: "UNDO_MOVE", playerId: active });
      expect(undone.result.errors).toEqual([]);
      expect(gameProgressKey(undone.snapshot.state)).toBe(gameProgressKey(before));
      undoneOnce = true;
      break;
    }
    // At least one plain map step must stay undoable (the option is not inert).
    expect(undoneOnce).toBe(true);
  });
});

describe("1v1 Undo — built-in store wiring", () => {
  function firstLegalAction(state: GameState, playerId: PlayerId): GameAction {
    const offers = getLegalActions(state, playerId);
    const refresh = offers.find((legal) => legal.action.type === "REFRESH_HAND");
    if (refresh && refresh.action.type === "REFRESH_HAND") {
      const player = state.players[playerId]!;
      const limit = player.needsHandRefresh ? 4 : 5;
      const over = Math.max(0, player.hand.length - limit);
      return { ...refresh.action, discardCardIds: player.hand.slice(0, over) };
    }
    return offers[0]!.action;
  }

  it("stamps the public undoStatus on every committed action (option OFF is the CONTROL)", () => {
    const onId = uniqueRoom("store-on");
    createRoom({ roomId: onId });
    restoreRoom(onId, duelGame(onId));
    const on = getRoomSnapshot(onId).state;
    const applied = submitRoomAction(onId, firstLegalAction(on, "p1"));
    expect(applied.result.errors).toEqual([]);
    expect(applied.snapshot.state.undoStatus).toBeTruthy();

    const offId = uniqueRoom("store-off");
    createRoom({ roomId: offId });
    restoreRoom(offId, duelGame(offId, { duelUndo: false }));
    const off = getRoomSnapshot(offId).state;
    const offApplied = submitRoomAction(offId, firstLegalAction(off, "p1"));
    expect(offApplied.result.errors).toEqual([]);
    expect(offApplied.snapshot.state.undoStatus ?? null).toBeNull();
    expect(submitRoomAction(offId, { type: "UNDO_MOVE", playerId: "p1" }).result.errors.length).toBeGreaterThan(0);
  });
});
