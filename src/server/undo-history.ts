import type { GameState, PlayerId } from "@/engine";
import { appendEvent } from "@/engine";

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

/** Whether the OPTIONAL undo mode is ON for this game (reads the frozen flag). */
export function undoModeEnabled(state: GameState | null | undefined): boolean {
  return Boolean(state?.adventure?.undoMoves);
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
  if (!undoModeEnabled(preActionState)) {
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
}

/** Test-only: wipe every room's undo history so specs start from a clean slate. */
export function __resetUndoHistoriesForTests(): void {
  undoHistories.clear();
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
  playerId: PlayerId
): UndoOutcome {
  if (!undoModeEnabled(state)) {
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
