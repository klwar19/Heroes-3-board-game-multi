import type { GameAction, GameState, PlayerId, UndoStatus } from "@/engine";
import {
  actionNeverUndoable,
  appendEvent,
  duelSeats,
  gamePaused,
  duelUndoBlockReason,
  gameProgressKey,
  hiddenInfoKey,
  randomDrawCount,
  undoStatusStamp
} from "@/engine";

/**
 * OPTIONAL "Undo moves" mode (`GameSetupOptions.undoMoves`, default OFF) — a
 * DEBUG / manual-testing aid, NOT a normal-play feature. It lets a player roll
 * the whole game back to the state before a recent action so bugs are easier to
 * reproduce and hunt.
 *
 * DESIGN (validated against the codebase, see CLAUDE.md guardrails):
 * - The undo history is a bounded per-room stack of FULL pre-action GameState
 *   snapshots kept ENTIRELY server-side, in this module's in-memory Map. It is
 *   never part of GameState, never serialized into a room snapshot, never
 *   broadcast, and therefore never reaches a player view (no hidden-info leak,
 *   guardrail 2) and never bloats a broadcast (the map lives here alone).
 * - Both backends share this module. The built-in Next.js store runs many rooms
 *   in one process (keyed by roomId); a PartyKit Durable Object runs one room
 *   per isolate (the Map holds a single entry). Both work with the same code.
 * - Restore is a WHOLE-state swap, so an undo that crosses an open combat /
 *   pending choice / reward queue restores every one of them atomically
 *   (guardrail 5) — no replay, no partial rollback.
 * - Memory is bounded to {@link UNDO_HISTORY_LIMIT}; the oldest snapshot is
 *   dropped once the cap is exceeded (guardrail 3).
 *
 * WHO MAY UNDO: any player of the room (see the server transaction's membership
 * check). Justification: undo is an explicit debug toggle the whole table opted
 * into; letting anyone roll back makes collaborative bug-hunting simple, and the
 * public `MOVES_UNDONE` feed line keeps every rewind visible.
 *
 * WHAT IS ONE UNDO STEP: one human action applied through the server action
 * transaction. Single-player AI pump steps that ran between two human actions
 * are rolled back together with the preceding human action (they are not their
 * own undo points) — documented limit.
 */

/** Bounded depth of the per-room undo stack (oldest dropped past this). */
export const UNDO_HISTORY_LIMIT = 10;

// roomId -> stack of serialized pre-action states (top = most recent).
const undoHistories = new Map<string, GameState[]>();

/** Whether the testing "Undo moves" mode is ON (rewind anything, anyone). */
export function testingUndoEnabled(state: GameState | null | undefined): boolean {
  return Boolean(state?.adventure?.undoMoves);
}

/**
 * Whether ANY undo mode is ON for this game (reads the frozen flags): the
 * testing "Undo moves" mode, or the 1v1 "Undo button" (`adventure.duelUndo`).
 * The transports gate UNDO_MOVE on this; `applyUndoMove` picks the mode.
 */
export function undoModeEnabled(state: GameState | null | undefined): boolean {
  return Boolean(state?.adventure?.undoMoves || state?.adventure?.duelUndo);
}

/**
 * Whether the actor is entitled to act on this room, used to gate UNDO_MOVE
 * (which bypasses the engine's own `roomActionGuard`). On an OPEN / legacy table
 * (no host enforcement) anyone may; on a HOSTED table the actor must be a
 * current member — matched by verified `userId` first, else per-tab `clientId`.
 * A fresh hosted room with no members yet stays permissive (mirrors the
 * store/party seat rules before anyone has joined).
 */
export function actorIsRoomParticipant(
  state: GameState,
  actorClientId?: string,
  actorUserId?: string
): boolean {
  const room = state.room;
  if (!room || !room.hosted) {
    return true;
  }
  const members = room.members ?? [];
  if (members.length === 0) {
    return true;
  }
  return members.some(
    (member) =>
      (actorUserId !== undefined && member.userId === actorUserId) ||
      (actorClientId !== undefined && member.clientId === actorClientId)
  );
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * Push the PRE-action state onto the room's undo stack — a no-op unless undo
 * mode is ON for that state. Stores a deep clone so a later reducer that mutates
 * the live state can never corrupt a stored snapshot. Bounded to
 * {@link UNDO_HISTORY_LIMIT} (oldest dropped).
 */
export function recordUndoSnapshot(roomId: string, preActionState: GameState): void {
  if (!testingUndoEnabled(preActionState)) {
    // Also drop any stale history if the option was somehow turned off (e.g. a
    // reset into a non-undo game reusing the room id) so nothing lingers.
    undoHistories.delete(roomId);
    return;
  }
  const stack = undoHistories.get(roomId) ?? [];
  stack.push(clone(preActionState));
  while (stack.length > UNDO_HISTORY_LIMIT) {
    stack.shift();
  }
  undoHistories.set(roomId, stack);
}

/** How many undo steps are currently available for the room. */
export function undoDepth(roomId: string): number {
  return undoHistories.get(roomId)?.length ?? 0;
}

/**
 * Pop the most recent pre-action state and return a fresh clone of it, or null
 * when the stack is empty. The caller broadcasts the restored state.
 */
export function popUndoSnapshot(roomId: string): GameState | null {
  const stack = undoHistories.get(roomId);
  if (!stack || stack.length === 0) {
    return null;
  }
  const restored = stack.pop()!;
  if (stack.length === 0) {
    undoHistories.delete(roomId);
  }
  return clone(restored);
}

/** Forget a room's undo history (room close / reset / ranked force-close). */
export function clearUndoHistory(roomId: string): void {
  undoHistories.delete(roomId);
  duelHistories.delete(roomId);
}

/** Test-only: wipe every room's undo history so specs start from a clean slate. */
export function __resetUndoHistoriesForTests(): void {
  undoHistories.clear();
  duelHistories.clear();
}

// ---------------------------------------------------------------------------
// 1v1 Undo (`adventure.duelUndo`) — a NORMAL-play rule, unlike the testing mode
// above. Safety rules live in src/engine/undo-safety.ts; this is the per-room
// server history that enforces them. Like the testing stack it never enters
// state (only the public `undoStatus` summary does), so no hidden information
// is broadcast.
// ---------------------------------------------------------------------------

/** One undoable step: the pre-action state, who acted, and the resulting position. */
type DuelUndoEntry = { pre: GameState; actorId: PlayerId; postKey: string };

// roomId -> the CURRENT actor's consecutive safe steps (top = most recent).
const duelHistories = new Map<string, DuelUndoEntry[]>();

/** Read before applyAction: the random-draw mark `trackDuelUndo` compares against. */
export function undoTrackingMark(): number {
  return randomDrawCount();
}

function stampUndoStatus(state: GameState, stack: readonly DuelUndoEntry[], lockedReason?: string): void {
  const top = stack.at(-1);
  const status: UndoStatus = {
    playerId: top?.actorId ?? null,
    depth: stack.length,
    atEvent: undoStatusStamp(state),
    ...(lockedReason ? { lockedReason } : {})
  };
  state.undoStatus = status;
}

/** The acting seat of an action, when it names one. */
function actionSeat(action: GameAction): PlayerId | null {
  const candidate = (action as { playerId?: unknown }).playerId;
  return typeof candidate === "string" ? candidate : null;
}

/**
 * Post-commit bookkeeping for the 1v1 Undo, called by every transport right
 * after an action (plus its AFK drive / computer settle) succeeded, BEFORE the
 * settled state is persisted + broadcast. `pre` is the committed state the
 * action ran against, `post` the settled state (its `undoStatus` is stamped
 * here), `mark` the `undoTrackingMark()` read just before applyAction and
 * `reducerState` the bare applyAction result (before the AFK drive / computer
 * settle), when the transport has it.
 *
 *  - No game change (chat, membership, a vote that changes no game state):
 *    the history is left untouched.
 *  - A game change no seat of the duel made (no acting seat): nothing before
 *    it can be undone any more — the history is cleared.
 *  - Randomness drawn, hidden information revealed to the actor, or the
 *    computer / a forced resolution acting inside the same transaction (the
 *    settle after the seat's action changed the game): the history is cleared
 *    and locked with the reason (nothing before it can be undone any more).
 *  - Otherwise the step is pushed; an action by the OTHER seat, or a position
 *    that no longer matches the top entry (an unrecorded computer beat),
 *    first clears the older steps.
 * No-op (and no state change) on games without the option.
 */
export function trackDuelUndo(
  roomId: string,
  pre: GameState,
  action: GameAction,
  post: GameState,
  mark: number,
  reducerState?: GameState
): void {
  if (!pre.adventure?.duelUndo && !post.adventure?.duelUndo) {
    duelHistories.delete(roomId);
    return;
  }
  const blocked = duelUndoBlockReason(post);
  if (blocked) {
    duelHistories.delete(roomId);
    if (blocked !== "off") stampUndoStatus(post, [], blocked);
    return;
  }
  const stack = duelHistories.get(roomId) ?? [];
  const actorId = actionSeat(action);
  const preKey = gameProgressKey(pre);
  const postKey = gameProgressKey(post);
  if (preKey === postKey) {
    // No game change: keep whatever history exists.
    stampUndoStatus(post, stack, stack.length === 0 ? pre.undoStatus?.lockedReason : undefined);
    return;
  }
  if (!actorId || !duelSeats(post)?.includes(actorId)) {
    // The game changed without a duel seat acting: the recorded steps can no
    // longer be reached (applyUndoMove's chain check would refuse them), so
    // drop them and say so instead of showing a live button the server refuses.
    duelHistories.delete(roomId);
    stampUndoStatus(post, [], "The game moved on — nothing to undo.");
    return;
  }
  const randomUsed = randomDrawCount() !== mark;
  const revealed = hiddenInfoKey(pre, actorId) !== hiddenInfoKey(post, actorId);
  const tableDecision = actionNeverUndoable(action.type);
  // The AFK drive / computer settle that rode with this action changed the
  // game (a computer opponent's PvP beat): the opponent acted — rule 3.
  const othersActed =
    reducerState !== undefined && reducerState !== post && gameProgressKey(reducerState) !== postKey;
  if (randomUsed || revealed || tableDecision || othersActed) {
    duelHistories.delete(roomId);
    stampUndoStatus(
      post,
      [],
      randomUsed
        ? "The last action rolled dice or used a random result — it cannot be undone."
        : revealed
          ? "The last action revealed hidden information (a card, tile, trap or a reaction) — it cannot be undone."
          : tableDecision
            ? "The last action was a table decision (leave, vote, concede, retake) — it cannot be undone."
            : "Your opponent has acted since — nothing to undo."
    );
    return;
  }
  const top = stack.at(-1);
  if (top && (top.actorId !== actorId || top.postKey !== preKey)) {
    stack.length = 0;
  }
  stack.push({ pre: clone(pre), actorId, postKey });
  while (stack.length > UNDO_HISTORY_LIMIT) {
    stack.shift();
  }
  duelHistories.set(roomId, stack);
  stampUndoStatus(post, stack);
}

/**
 * Whether the member acting may act for `playerId`'s seat: on a HOSTED table
 * the verified account / tab must be the member seated there; an OPEN table
 * (the single-browser seat switcher model) lets any client act as any seat.
 */
function actorHoldsSeat(state: GameState, playerId: PlayerId, actor: UndoActor): boolean {
  const room = state.room;
  if (!room || !room.hosted) return true;
  const members = room.members ?? [];
  if (members.length === 0) return true;
  return members.some(
    (member) =>
      member.seat === playerId &&
      ((actor.userId !== undefined && member.userId === actor.userId) ||
        (actor.clientId !== undefined && member.clientId === actor.clientId))
  );
}

export type UndoActor = { clientId?: string; userId?: string };

function applyDuelUndo(roomId: string, state: GameState, playerId: PlayerId, actor: UndoActor): UndoOutcome {
  const blocked = duelUndoBlockReason(state);
  if (blocked) {
    return { undone: false, reason: blocked === "off" ? "Undo is off for this game." : blocked };
  }
  if (!duelSeats(state)?.includes(playerId)) {
    return { undone: false, reason: "Only a player of this 1v1 game can undo." };
  }
  if (!actorHoldsSeat(state, playerId, actor)) {
    return { undone: false, reason: "You can only undo for your own seat." };
  }
  // A paused table is frozen for every game change (the engine refuses moves
  // while paused; UNDO_MOVE bypasses the engine, so the same rule lives here).
  if (gamePaused(state)) {
    return { undone: false, reason: "The table is paused — undo once it resumes." };
  }
  const stack = duelHistories.get(roomId);
  const top = stack?.at(-1);
  if (!stack || !top) {
    return { undone: false, reason: state.undoStatus?.lockedReason ?? "There is nothing to undo." };
  }
  if (top.actorId !== playerId) {
    return {
      undone: false,
      reason: `Only ${state.players[top.actorId]?.name ?? top.actorId} can undo — it was their move.`
    };
  }
  if (gameProgressKey(state) !== top.postKey) {
    duelHistories.delete(roomId);
    return { undone: false, reason: "The game has moved on since that action — it can no longer be undone." };
  }
  stack.pop();
  if (stack.length === 0) {
    duelHistories.delete(roomId);
  }
  const restored = clone(top.pre);
  // Table data belongs to the CURRENT timeline: membership/chat, the public
  // feed, AFK clocks, pause, the reset vote and emotes are never rolled back.
  restored.room = state.room;
  restored.eventLog = state.eventLog;
  restored.eventCounter = state.eventCounter;
  restored.afk = state.afk;
  restored.pause = state.pause;
  restored.resetVote = state.resetVote;
  restored.tableReactions = state.tableReactions;
  restored.tableReactionSeq = state.tableReactionSeq;
  const next = clone(restored);
  const name = next.players[playerId]?.name ?? "A player";
  appendEvent(next, {
    type: "MOVES_UNDONE",
    playerId,
    count: 1,
    message: `${name} took back their last move (1v1 undo).`
  });
  stampUndoStatus(next, stack);
  return { undone: true, state: next, count: 1 };
}

export type UndoOutcome =
  | { undone: false; reason: string }
  | { undone: true; state: GameState; count: number };

/**
 * Server-side handler for an `UNDO_MOVE` action, shared by both backends. It is
 * intercepted BEFORE the engine reducer (undo never runs through `applyAction`):
 * validates the mode is on and history exists, pops the prior state, stamps a
 * public `MOVES_UNDONE` feed line onto it, and returns it for the caller to
 * store + broadcast. The membership/seat check is the caller's responsibility
 * (it holds the transport identity).
 */
export function applyUndoMove(
  roomId: string,
  state: GameState,
  playerId: PlayerId,
  /** The transport identity (1v1 Undo: only a seat's own member may undo it). */
  actor: UndoActor = {}
): UndoOutcome {
  if (!testingUndoEnabled(state) && state.adventure?.duelUndo) {
    return applyDuelUndo(roomId, state, playerId, actor);
  }
  if (!testingUndoEnabled(state)) {
    return { undone: false, reason: "Undo mode is off for this game." };
  }
  const restored = popUndoSnapshot(roomId);
  if (!restored) {
    return { undone: false, reason: "There is nothing to undo." };
  }
  const name = restored.players[playerId]?.name ?? "A player";
  appendEvent(restored, {
    type: "MOVES_UNDONE",
    playerId,
    count: 1,
    message: `${name} undid the last action (testing mode).`
  });
  return { undone: true, state: restored, count: 1 };
}
