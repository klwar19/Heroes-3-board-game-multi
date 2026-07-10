import { NEUTRAL_PLAYER_ID } from "./state";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * "Start a new adventure" table-consent vote (multiplayer adventure only).
 *
 * Pressing "New adventure" while a game is IN PROGRESS opens this vote instead
 * of wiping the game immediately: EVERY live seat must confirm before the reset
 * proceeds — "must be confirmed by all available, on an open table or a closed
 * (hosted) game". The actual reset stays the existing, tested server RPC (with
 * all its client-side cleanup); this module only gates it.
 *
 * Once every live seat has confirmed, the browser that opened the vote
 * (`startedByClientId`) fires the reset — exactly one client resets the room —
 * and the server honours that reset as vote-authorised even in a hosted room
 * where the requester is NOT the host (see resetVoteAuthorizes, wired into both
 * transport backends' reset handlers).
 *
 * Like chat and the AFK vote, the three actions self-validate (they live in the
 * reducer's HANDLER_VALIDATED_ACTIONS) and carry a seat `playerId`, so
 * `roomActionGuard` binds each confirm to its own seat in a hosted room. The
 * whole vote lives in the public `state.resetVote`; the reset it triggers
 * naturally clears it, and an elimination cancels it (the live-seat set moved).
 */

/** Live human seats (turnOrder already drops eliminated players and neutral). */
function liveSeats(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID && !state.players[id]?.eliminated);
}

function gameIsOver(state: GameState): boolean {
  return state.phase === "game-over" || Boolean(state.adventure?.winnerPlayerId);
}

/**
 * Whether pressing "New adventure" must open the all-players vote rather than
 * resetting directly: an in-progress adventure (past the setup lobby, not yet
 * finished) with two or more live seats. A setup lobby, a solo game, a finished
 * game and every non-adventure table (Battle Test sandbox) reset directly, as
 * before — there is nobody else whose consent is needed.
 */
export function resetVoteRequired(state: GameState): boolean {
  return (
    state.mode === "adventure" && !state.setupLobby && !gameIsOver(state) && liveSeats(state).length >= 2
  );
}

/**
 * Whether the open vote has been confirmed by EVERY live seat (so the reset may
 * fire). False when no vote is open, when the requester's seat is no longer live
 * (they were eliminated mid-vote), or when any live seat has not confirmed yet.
 */
export function isResetVoteApproved(state: GameState): boolean {
  const vote = state.resetVote;
  if (!vote) {
    return false;
  }
  const seats = liveSeats(state);
  if (seats.length === 0 || !seats.includes(vote.startedByPlayerId)) {
    return false;
  }
  return seats.every((seat) => vote.confirmations[seat] === true);
}

/**
 * Whether a reset requested by `actorClientId` is authorised by a passed vote —
 * the server-side gate that lets the requesting browser complete the reset and
 * bypass the host-only rule in a hosted room. Requires the vote to be approved
 * AND opened by this same browser.
 */
export function resetVoteAuthorizes(state: GameState, actorClientId: string | undefined): boolean {
  return (
    Boolean(actorClientId) &&
    state.resetVote?.startedByClientId === actorClientId &&
    isResetVoteApproved(state)
  );
}

/** Shared legality: a reset vote only exists in an in-progress multiplayer adventure. */
function assertVoteContext(state: GameState): void {
  if (state.setupLobby) {
    throw new Error("The game has not started yet — start a new adventure from the map setup.");
  }
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("A new-adventure vote exists only in adventure games.");
  }
  if (gameIsOver(state)) {
    throw new Error("The game is already over — start a new adventure directly.");
  }
}

/** REQUEST_ROOM_RESET: open the vote; the requester's own request is a confirm. */
export function requestRoomReset(
  state: GameState,
  action: Extract<GameAction, { type: "REQUEST_ROOM_RESET" }>,
  now: number | undefined
): void {
  assertVoteContext(state);
  if (!action.clientId) {
    throw new Error("A client id is required to start a new-adventure vote.");
  }
  const seats = liveSeats(state);
  if (seats.length < 2) {
    throw new Error("A new-adventure vote needs at least two players still in the game.");
  }
  if (!seats.includes(action.playerId)) {
    throw new Error("Only a player still in the game can call for a new adventure.");
  }
  if (state.resetVote) {
    throw new Error("A new-adventure vote is already open.");
  }
  state.resetVote = {
    startedByPlayerId: action.playerId,
    startedByClientId: action.clientId,
    startedAt: now ?? 0,
    confirmations: { [action.playerId]: true }
  };
}

/** CONFIRM_ROOM_RESET: mark this seat's confirmation on the open vote. */
export function confirmRoomReset(
  state: GameState,
  action: Extract<GameAction, { type: "CONFIRM_ROOM_RESET" }>
): void {
  assertVoteContext(state);
  const vote = state.resetVote;
  if (!vote) {
    throw new Error("No new-adventure vote is open.");
  }
  if (!liveSeats(state).includes(action.playerId)) {
    throw new Error("Only a player still in the game can confirm a new adventure.");
  }
  vote.confirmations[action.playerId] = true;
}

/** CANCEL_ROOM_RESET: any live seat withdraws / declines the open vote. */
export function cancelRoomReset(
  state: GameState,
  action: Extract<GameAction, { type: "CANCEL_ROOM_RESET" }>
): void {
  const vote = state.resetVote;
  if (!vote) {
    throw new Error("No new-adventure vote is open.");
  }
  if (!liveSeats(state).includes(action.playerId)) {
    throw new Error("Only a player still in the game can cancel a new adventure.");
  }
  state.resetVote = null;
}

/**
 * Drop an open reset vote — called when a player is eliminated (the live-seat
 * set changed, so a vote in flight is void and must be re-opened). Safe to call
 * unconditionally.
 */
export function clearResetVote(state: GameState): void {
  if (state.resetVote) {
    state.resetVote = null;
  }
}
