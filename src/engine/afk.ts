import { appendEvent } from "./events";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { AfkState, GameAction, GameState, PlayerId } from "./state";

/**
 * AFK vote-kick (multiplayer adventure only).
 *
 * A player idle for AFK_IDLE_MS can be put to a kick-or-wait vote by any other
 * live player. Every live seat except the target answers: one "wait" closes
 * the vote (it can be re-opened AFK_REASK_MS later — "asked again every 10
 * minutes"), unanimous "kick" force-drops the target. The drop itself runs
 * through the normal action pipeline: the server-side driver
 * (src/engine/afk-drop.ts) auto-resolves the target's pending interactions
 * with default picks, concedes their open combat, and finally eliminates them
 * exactly like a give-up — so turns, rounds, battles and the last-faction-
 * standing win all continue through the existing, tested machinery.
 *
 * Timing is authoritative on the SERVER: both transports stamp every applied
 * action with `options.now` (wall-clock ms), which is the only clock the
 * legality checks read. The engine itself never calls Date.now(), so tests
 * stay deterministic by passing `now` explicitly.
 */

/** A seat must be idle this long (ms) before a kick vote can target it. */
export const AFK_IDLE_MS = 10 * 60_000;
/** After a vote ends in "wait", the next vote may start this much later (ms). */
export const AFK_REASK_MS = 10 * 60_000;

/** The AFK slice, created on demand (absent on legacy snapshots and solo games). */
export function getAfkState(state: GameState): AfkState {
  if (!state.afk) {
    state.afk = { lastActionAt: {}, vote: null };
  }
  return state.afk;
}

/** Live human seats (turnOrder already drops eliminated players). */
function liveSeats(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID && !state.players[id]?.eliminated);
}

function gameIsOver(state: GameState): boolean {
  return state.phase === "game-over" || Boolean(state.adventure?.winnerPlayerId);
}

/** The three AFK meta-actions themselves never count as "activity". */
function isAfkMetaAction(action: GameAction): boolean {
  return action.type === "START_AFK_VOTE" || action.type === "CAST_AFK_VOTE" || action.type === "RESOLVE_AFK_DROP";
}

function playerName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

/**
 * How long (ms) a seat has been idle at `now`. A seat with no stamp yet (the
 * table's very first actions) reads as freshly active — the bookkeeping below
 * bootstraps every live seat's clock on the first stamped action.
 */
export function idleMillis(state: GameState, playerId: PlayerId, now: number): number {
  const last = state.afk?.lastActionAt?.[playerId];
  return last === undefined ? 0 : Math.max(0, now - last);
}

/**
 * Post-action bookkeeping, called from applyAction's success path only:
 * bootstrap + stamp the actor's last-action clock, and cancel an open vote the
 * moment its target acts (they are clearly back). No-op without a server
 * `now`, outside adventure games, and for the AFK meta-actions themselves.
 */
export function applyAfkBookkeeping(state: GameState, action: GameAction, now: number | undefined): void {
  if (state.mode !== "adventure" || now === undefined || isAfkMetaAction(action)) {
    return;
  }
  const actorId =
    "playerId" in action && typeof (action as { playerId?: unknown }).playerId === "string"
      ? (action as { playerId: PlayerId }).playerId
      : null;
  if (!actorId || actorId === NEUTRAL_PLAYER_ID || !state.players[actorId]) {
    return;
  }

  const afk = getAfkState(state);
  // First stamped action of the game: start EVERY live seat's clock now, so a
  // player who never acts still becomes kickable once the window passes.
  if (Object.keys(afk.lastActionAt).length === 0) {
    for (const seat of liveSeats(state)) {
      afk.lastActionAt[seat] = now;
    }
  }
  afk.lastActionAt[actorId] = now;

  // The accused seat took a real action: the vote is moot — cancel it.
  if (afk.vote && afk.vote.targetPlayerId === actorId) {
    const target = afk.vote.targetPlayerId;
    afk.vote = null;
    appendEvent(state, {
      type: "AFK_VOTE_RESOLVED",
      targetPlayerId: target,
      outcome: "cancelled",
      message: `${playerName(state, target)} is back — the AFK vote was cancelled.`
    });
  }
}

/** Shared legality for both vote actions. */
function assertVoteContext(state: GameState): AfkState {
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("AFK votes exist only in adventure games.");
  }
  if (gameIsOver(state)) {
    throw new Error("The game is already over.");
  }
  return getAfkState(state);
}

/**
 * START_AFK_VOTE: open a kick-or-wait vote against an idle seat. The starter's
 * own vote is an implicit "kick", so in a 2-player game this alone resolves
 * the vote.
 */
export function startAfkVote(
  state: GameState,
  action: Extract<GameAction, { type: "START_AFK_VOTE" }>,
  now: number | undefined
): void {
  const afk = assertVoteContext(state);
  const seats = liveSeats(state);
  if (seats.length < 2) {
    throw new Error("An AFK vote needs at least two players still in the game.");
  }
  if (!seats.includes(action.playerId) || !seats.includes(action.targetPlayerId)) {
    throw new Error("Both the voter and the target must still be in the game.");
  }
  if (action.playerId === action.targetPlayerId) {
    throw new Error("You cannot open an AFK vote against yourself.");
  }
  if (afk.vote) {
    throw new Error("An AFK vote is already open.");
  }
  if (afk.droppingPlayerId) {
    throw new Error("A player is already being removed.");
  }
  if (now === undefined) {
    throw new Error("AFK timing is unavailable on this table.");
  }
  if (idleMillis(state, action.targetPlayerId, now) < AFK_IDLE_MS) {
    throw new Error(`${playerName(state, action.targetPlayerId)} has not been away for 10 minutes yet.`);
  }
  const lastEnded = afk.lastVoteEndedAt?.[action.targetPlayerId];
  if (lastEnded !== undefined && now - lastEnded < AFK_REASK_MS) {
    throw new Error("The table chose to wait — the next AFK vote opens 10 minutes after the last one.");
  }

  afk.vote = {
    targetPlayerId: action.targetPlayerId,
    startedByPlayerId: action.playerId,
    startedAt: now,
    votes: { [action.playerId]: "kick" }
  };
  appendEvent(state, {
    type: "AFK_VOTE_STARTED",
    targetPlayerId: action.targetPlayerId,
    byPlayerId: action.playerId,
    message:
      `${playerName(state, action.playerId)} calls a vote: ${playerName(state, action.targetPlayerId)} ` +
      "seems to be away — kick them from the game, or keep waiting?"
  });
  maybeResolveAfkVote(state, now);
}

/** CAST_AFK_VOTE: answer the open vote. Any "wait" closes it immediately. */
export function castAfkVote(
  state: GameState,
  action: Extract<GameAction, { type: "CAST_AFK_VOTE" }>,
  now: number | undefined
): void {
  const afk = assertVoteContext(state);
  const vote = afk.vote;
  if (!vote) {
    throw new Error("No AFK vote is open.");
  }
  if (action.playerId === vote.targetPlayerId) {
    throw new Error("The player the vote is about cannot vote.");
  }
  if (!liveSeats(state).includes(action.playerId)) {
    throw new Error("Only players still in the game vote.");
  }

  vote.votes[action.playerId] = action.vote;
  appendEvent(state, { type: "AFK_VOTE_CAST", playerId: action.playerId, vote: action.vote });

  if (action.vote === "wait") {
    // One voice for patience is enough: close the vote; it can be re-opened
    // AFK_REASK_MS from now.
    afk.vote = null;
    (afk.lastVoteEndedAt ??= {})[vote.targetPlayerId] = now ?? vote.startedAt;
    appendEvent(state, {
      type: "AFK_VOTE_RESOLVED",
      targetPlayerId: vote.targetPlayerId,
      outcome: "wait",
      message: `The table waits for ${playerName(state, vote.targetPlayerId)} — the vote can be repeated in 10 minutes.`
    });
    return;
  }

  maybeResolveAfkVote(state, now);
}

/** Unanimous "kick" among every live non-target seat → begin the force-drop. */
function maybeResolveAfkVote(state: GameState, now: number | undefined): void {
  const afk = state.afk;
  const vote = afk?.vote;
  if (!afk || !vote) {
    return;
  }
  const voters = liveSeats(state).filter((seat) => seat !== vote.targetPlayerId);
  if (voters.length === 0 || !voters.every((seat) => vote.votes[seat] === "kick")) {
    return;
  }
  afk.vote = null;
  (afk.lastVoteEndedAt ??= {})[vote.targetPlayerId] = now ?? vote.startedAt;
  afk.droppingPlayerId = vote.targetPlayerId;
  appendEvent(state, {
    type: "AFK_VOTE_RESOLVED",
    targetPlayerId: vote.targetPlayerId,
    outcome: "kick",
    message: `The vote passed — ${playerName(state, vote.targetPlayerId)} is removed from the game (AFK).`
  });
}
