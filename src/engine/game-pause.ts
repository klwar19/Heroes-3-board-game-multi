import { isComputerPlayer } from "./computer/control";
import { appendEvent } from "./events";
import { isRoomMembershipAction } from "./room";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { GameAction, GamePauseState, GameState, PlayerId } from "./state";

/**
 * Table PAUSE (multiplayer adventure only).
 *
 * Any live human seat may press "Pause": that opens a pause REQUEST every other
 * live human seat has to confirm. The moment the last seat confirms, the table
 * is PAUSED — the reducer refuses every gameplay action (only chat, reactions,
 * room membership, the new-adventure vote and the pause actions themselves get
 * through), the server-side computer pump stops, and every time control
 * FREEZES: the 10-minute open-turn inactivity clock and AFK idle clocks stop counting
 * for as long as the pause lasts. Only the seat that asked for the pause
 * resumes the game; on RESUME every AFK/turn stamp is shifted forward by the
 * paused stretch, so a player comes back with exactly the time they had left.
 *
 * Two safety valves keep a pause from becoming a dead table: while a request is
 * still OPEN any live seat may decline it (or the requester withdraw it), and
 * while the game is PAUSED the OTHER live seats may unanimously ask to resume —
 * honoured only once the pause has lasted PAUSE_OVERRIDE_MS, so a short break
 * can never be cut short by the others; any seat resumes at once when the
 * pauser is no longer in the game. The escape hatch for a pauser who never
 * came back.
 *
 * Timing is authoritative on the SERVER: both transports stamp every applied
 * action with `options.now` (wall-clock ms) and the engine never reads
 * Date.now(); the pause stores `pausedAt` from that stamp and every clock read
 * clamps its `now` to it (see `pauseClockNow`).
 */

/**
 * How long (ms) a pause must have lasted before the OTHER seats' unanimous
 * "please resume" is honoured without the pauser (see `resumeGame`).
 */
export const PAUSE_OVERRIDE_MS = 10 * 60_000;

/** Live HUMAN seats — the players whose confirmation a pause needs. */
export function pauseVoters(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (id) => id !== NEUTRAL_PLAYER_ID && !state.players[id]?.eliminated && !isComputerPlayer(state, id)
  );
}

function gameIsOver(state: GameState): boolean {
  if (state.adventure?.winnerPlayerId) {
    return true;
  }
  return state.phase === "game-over" && !state.combat;
}

function playerName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

/** Whether the table is PAUSED right now (every confirmation is in). */
export function gamePaused(state: GameState): boolean {
  return Boolean(state.pause && state.pause.pausedAt !== null && state.pause.pausedAt !== undefined);
}

/** Whether a pause REQUEST is open but not yet confirmed by everyone. */
export function pauseRequestOpen(state: GameState): boolean {
  return Boolean(state.pause) && !gamePaused(state);
}

/**
 * Whether a pause can be requested on this table at all: an in-progress
 * multiplayer adventure (past the setup lobby, not finished) with at least two
 * live human seats. Solo tables, lobbies, the Battle Test sandbox and finished
 * games have nobody to hold a pause for.
 */
export function pauseAvailable(state: GameState): boolean {
  return (
    state.sessionMode !== "single-player" &&
    state.mode === "adventure" &&
    Boolean(state.adventure) &&
    !state.setupLobby &&
    !gameIsOver(state) &&
    pauseVoters(state).length >= 2
  );
}

/**
 * The wall clock every time control must read: `now` while the table runs,
 * frozen at `pausedAt` while it is paused — so no idle or turn time accrues
 * during a pause even before RESUME shifts the stamps.
 */
export function pauseClockNow(state: GameState, now: number): number {
  const pausedAt = state.pause?.pausedAt;
  return pausedAt !== null && pausedAt !== undefined ? Math.min(now, pausedAt) : now;
}

/**
 * Server wall-clock ms from which the other seats' unanimous resume vote is
 * honoured (null when the table is not paused).
 */
export function pauseOverrideAvailableAt(state: GameState): number | null {
  const pausedAt = state.pause?.pausedAt;
  return pausedAt !== null && pausedAt !== undefined ? pausedAt + PAUSE_OVERRIDE_MS : null;
}

/** How long (ms) the table has been paused at `now` (0 when not paused). */
export function pausedMillis(state: GameState, now: number): number {
  const pausedAt = state.pause?.pausedAt;
  return pausedAt !== null && pausedAt !== undefined ? Math.max(0, now - pausedAt) : 0;
}

/** The pause request / resume actions themselves. */
export function isPauseAction(action: GameAction): boolean {
  return (
    action.type === "REQUEST_PAUSE" ||
    action.type === "CONFIRM_PAUSE" ||
    action.type === "CANCEL_PAUSE" ||
    action.type === "RESUME_GAME"
  );
}

/**
 * The actions a PAUSED table still accepts: the pause actions (RESUME_GAME,
 * plus the request/confirm/cancel handlers, which refuse themselves while
 * paused), table chat and emotes, room membership (a player reconnecting must
 * still be able to JOIN; the host may still manage the room), the
 * new-adventure vote (a table decision that changes no game state until the
 * reset RPC runs) and the pure view switch between parallel contexts. Every
 * gameplay action — moves, cards, combat, END_TURN, the AFK/turn-timeout
 * machinery, the computer watchdog — is refused until the pauser resumes.
 */
export function actionAllowedWhilePaused(action: GameAction): boolean {
  return (
    isPauseAction(action) ||
    isRoomMembershipAction(action) ||
    action.type === "SEND_CHAT" ||
    action.type === "SEND_TABLE_REACTION" ||
    action.type === "REQUEST_ROOM_RESET" ||
    action.type === "CONFIRM_ROOM_RESET" ||
    action.type === "CANCEL_ROOM_RESET" ||
    action.type === "SELECT_PARALLEL_CONTEXT"
  );
}

/** The reducer's refusal for a gameplay action on a paused table. */
export function pausedRefusalMessage(state: GameState): string {
  const pause = state.pause;
  if (!pause) {
    return "The game is paused.";
  }
  const pauser = playerName(state, pause.requestedByPlayerId);
  return `The game is paused by ${pauser} — wait for them to resume it.`;
}

/** Live seats whose confirmation the open request still lacks. */
export function pauseConfirmationsMissing(state: GameState): PlayerId[] {
  const pause = state.pause;
  if (!pause) {
    return [];
  }
  return pauseVoters(state).filter((seat) => pause.confirmations[seat] !== true);
}

/** Shared legality for every pause action. */
function assertPauseContext(state: GameState): void {
  if (state.sessionMode === "single-player") {
    throw new Error("A single-player game needs no pause — nobody is waiting on you.");
  }
  if (state.setupLobby) {
    throw new Error("The game has not started yet.");
  }
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("The pause exists only in adventure games.");
  }
  if (gameIsOver(state)) {
    throw new Error("The game is already over.");
  }
}

/**
 * Whether a forced resolution (a passed AFK kick, an expired turn) is mid-way:
 * the driver must finish its default picks before the table can freeze,
 * otherwise the half-removed seat would sit in limbo for the whole pause.
 */
function forcedResolutionInFlight(state: GameState): boolean {
  return Boolean(state.afk?.droppingPlayerId || state.afk?.turnTimeoutPlayerId);
}

/** REQUEST_PAUSE: open the request; the requester's own request is a confirm. */
export function requestPause(
  state: GameState,
  action: Extract<GameAction, { type: "REQUEST_PAUSE" }>,
  now: number | undefined
): void {
  assertPauseContext(state);
  if (gamePaused(state)) {
    throw new Error("The game is already paused.");
  }
  if (state.pause) {
    throw new Error("A pause request is already open.");
  }
  const voters = pauseVoters(state);
  if (voters.length < 2) {
    throw new Error("A pause needs at least two players still in the game.");
  }
  if (!voters.includes(action.playerId)) {
    throw new Error("Only a player still in the game can pause it.");
  }
  if (forcedResolutionInFlight(state)) {
    throw new Error("A player is being removed or timed out — the game can be paused once that settles.");
  }
  state.pause = {
    requestedByPlayerId: action.playerId,
    requestedAt: now ?? 0,
    confirmations: { [action.playerId]: true },
    pausedAt: null
  };
  appendEvent(state, {
    type: "PAUSE_REQUESTED",
    byPlayerId: action.playerId,
    message: `${playerName(state, action.playerId)} asks to pause the game — everyone must confirm.`
  });
  maybeActivatePause(state, now);
}

/** CONFIRM_PAUSE: this seat agrees; the table pauses once every live seat has. */
export function confirmPause(
  state: GameState,
  action: Extract<GameAction, { type: "CONFIRM_PAUSE" }>,
  now: number | undefined
): void {
  assertPauseContext(state);
  const pause = state.pause;
  if (!pause) {
    throw new Error("No pause request is open.");
  }
  if (gamePaused(state)) {
    throw new Error("The game is already paused.");
  }
  if (!pauseVoters(state).includes(action.playerId)) {
    throw new Error("Only a player still in the game can confirm a pause.");
  }
  if (pause.confirmations[action.playerId] === true) {
    // Idempotent: a double-click or a re-sent confirm changes nothing.
    return;
  }
  pause.confirmations[action.playerId] = true;
  const voters = pauseVoters(state);
  appendEvent(state, {
    type: "PAUSE_CONFIRMED",
    playerId: action.playerId,
    confirmed: voters.filter((seat) => pause.confirmations[seat] === true).length,
    needed: voters.length
  });
  maybeActivatePause(state, now);
}

/** Every live human seat confirmed → freeze the table. */
function maybeActivatePause(state: GameState, now: number | undefined): void {
  const pause = state.pause;
  if (!pause || gamePaused(state)) {
    return;
  }
  if (pauseConfirmationsMissing(state).length > 0) {
    return;
  }
  if (now === undefined) {
    throw new Error("Pause timing is unavailable on this table.");
  }
  if (forcedResolutionInFlight(state)) {
    throw new Error("A player is being removed or timed out — the game can be paused once that settles.");
  }
  pause.pausedAt = now;
  appendEvent(state, {
    type: "GAME_PAUSED",
    byPlayerId: pause.requestedByPlayerId,
    message: `The game is paused (asked by ${playerName(state, pause.requestedByPlayerId)}) — turn timers and AFK clocks are frozen until they resume it.`
  });
}

/** CANCEL_PAUSE: the requester withdraws / any live seat declines the OPEN request. */
export function cancelPause(
  state: GameState,
  action: Extract<GameAction, { type: "CANCEL_PAUSE" }>
): void {
  const pause = state.pause;
  if (!pause) {
    throw new Error("No pause request is open.");
  }
  if (gamePaused(state)) {
    throw new Error("The game is already paused — only resuming ends it.");
  }
  if (!pauseVoters(state).includes(action.playerId)) {
    throw new Error("Only a player still in the game can cancel a pause request.");
  }
  const withdrawn = action.playerId === pause.requestedByPlayerId;
  state.pause = null;
  appendEvent(state, {
    type: "PAUSE_CANCELLED",
    byPlayerId: action.playerId,
    withdrawn,
    message: withdrawn
      ? `${playerName(state, action.playerId)} withdrew the pause request.`
      : `${playerName(state, action.playerId)} declined the pause — the game goes on.`
  });
}

/**
 * RESUME_GAME: the pauser resumes the table. Any other live seat instead casts
 * a "please resume" vote; once EVERY live seat other than the pauser has asked
 * AND the pause has lasted PAUSE_OVERRIDE_MS, the table resumes without them
 * (at once, from any seat, when the pauser is no longer in the game).
 */
export function resumeGame(
  state: GameState,
  action: Extract<GameAction, { type: "RESUME_GAME" }>,
  now: number | undefined
): void {
  const pause = state.pause;
  if (!pause || !gamePaused(state)) {
    throw new Error("The game is not paused.");
  }
  const voters = pauseVoters(state);
  if (!voters.includes(action.playerId)) {
    throw new Error("Only a player still in the game can resume it.");
  }
  if (now === undefined) {
    throw new Error("Pause timing is unavailable on this table.");
  }
  const pauserLive = voters.includes(pause.requestedByPlayerId);
  if (action.playerId === pause.requestedByPlayerId || !pauserLive) {
    doResume(state, action.playerId, now);
    return;
  }
  const votes = (pause.resumeVotes ??= {});
  const alreadyAsked = votes[action.playerId] === true;
  votes[action.playerId] = true;
  const others = voters.filter((seat) => seat !== pause.requestedByPlayerId);
  const asked = others.filter((seat) => votes[seat] === true).length;
  const pauserName = playerName(state, pause.requestedByPlayerId);
  if (asked >= others.length) {
    const overrideAt = pauseOverrideAvailableAt(state) ?? now;
    if (now >= overrideAt) {
      appendEvent(state, {
        type: "RESUME_VOTE_CAST",
        playerId: action.playerId,
        votes: asked,
        needed: others.length,
        message: `Every other player asked to resume — the game resumes without ${pauserName}.`
      });
      doResume(state, action.playerId, now);
      return;
    }
    if (alreadyAsked) {
      // The vote is unanimous but the pause is still young: nothing to record.
      throw new Error(
        `The game can resume without ${pauserName} once it has been paused for ${formatPausedDuration(PAUSE_OVERRIDE_MS)} (${formatPausedDuration(overrideAt - now)} to go).`
      );
    }
    appendEvent(state, {
      type: "RESUME_VOTE_CAST",
      playerId: action.playerId,
      votes: asked,
      needed: others.length,
      message: `Every other player asked to resume — the game resumes without ${pauserName} once it has been paused for ${formatPausedDuration(PAUSE_OVERRIDE_MS)}.`
    });
    return;
  }
  if (alreadyAsked) {
    // Idempotent re-ask: still waiting on the other seats.
    return;
  }
  appendEvent(state, {
    type: "RESUME_VOTE_CAST",
    playerId: action.playerId,
    votes: asked,
    needed: others.length,
    message: `${playerName(state, action.playerId)} asks to resume the game (${asked}/${others.length}).`
  });
}

/**
 * Lift the pause: shift every AFK / turn-clock stamp forward by the paused
 * stretch so not a millisecond of it counts against anyone, then clear the
 * pause. The turn-clock bookkeeping that runs after this action keeps the
 * shifted stamps (a seat is only re-stamped when it is blocked by someone
 * else's interaction, exactly as before the pause).
 */
function doResume(state: GameState, byPlayerId: PlayerId, now: number): void {
  const pause = state.pause;
  if (!pause || pause.pausedAt === null || pause.pausedAt === undefined) {
    return;
  }
  const pausedMs = Math.max(0, now - pause.pausedAt);
  shiftTimeControlStamps(state, pausedMs);
  state.pause = null;
  appendEvent(state, {
    type: "GAME_RESUMED",
    byPlayerId,
    pausedMs,
    message: `${playerName(state, byPlayerId)} resumed the game after ${formatPausedDuration(pausedMs)} — the clocks pick up where they stopped.`
  });
}

/** Move every server-stamped time-control clock forward by `deltaMs`. */
function shiftTimeControlStamps(state: GameState, deltaMs: number): void {
  const afk = state.afk;
  if (!afk || deltaMs <= 0) {
    return;
  }
  for (const seat of Object.keys(afk.lastActionAt)) {
    afk.lastActionAt[seat] += deltaMs;
  }
  if (afk.turnOpenSince) {
    for (const seat of Object.keys(afk.turnOpenSince)) {
      afk.turnOpenSince[seat] += deltaMs;
    }
  }
  // `awaitedIdleSince` is a live-stretch START stamp (shift it); `awaitedIdleMs`
  // is banked DURATION, not a clock, so it is left untouched.
  if (afk.awaitedIdleSince) {
    for (const seat of Object.keys(afk.awaitedIdleSince)) {
      afk.awaitedIdleSince[seat] += deltaMs;
    }
  }
  if (afk.lastVoteEndedAt) {
    for (const seat of Object.keys(afk.lastVoteEndedAt)) {
      afk.lastVoteEndedAt[seat] += deltaMs;
    }
  }
  if (afk.vote) {
    afk.vote.startedAt += deltaMs;
  }
}

function formatPausedDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`;
}

/**
 * Elimination hook: an OPEN request is void once the live-seat set changes
 * (the eliminated seat may have been the requester, or the one confirmation
 * still missing), so it is dropped and the table can re-open it. An ACTIVE
 * pause stays — if the pauser is the one who left, `resumeGame` already lets
 * any remaining seat resume, so the table is never stuck.
 */
export function clearPauseOnElimination(state: GameState): void {
  if (state.pause && !gamePaused(state)) {
    state.pause = null;
  }
}

/** The shape lives in state.ts; re-exported here for callers of this module. */
export type { GamePauseState };
