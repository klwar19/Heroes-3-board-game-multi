import { isComputerPlayer } from "./computer/control";
import { parallelStateForPlayer } from "./parallel-combats";
import { appendEvent } from "./events";
import { combatUnitDecisionOwnerId } from "./neutral-control";
import {
  isRoundStartEventBarrierActive,
  parallelTurnsActive,
  roundStartEventResolver
} from "./parallel-turns";
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
/**
 * A seat idle this long (ms) is CERTAINLY kicked — no vote needed. Any live
 * seat's client fires `FORCE_AFK_KICK` once the target has been away this long
 * ("after 30 minutes the AFK player is certainly kicked"). CLOSED tables only
 * (see `timeControlsActive`).
 */
export const AFK_AUTO_KICK_MS = 30 * 60_000;
/**
 * Hard per-TURN budget (multiplayer adventure, CLOSED tables only — see
 * `timeControlsActive`): a player — even one actively clicking, so never "idle"
 * for the AFK vote — gets at most this long per open turn before any live seat's
 * client may fire `FORCE_TURN_TIMEOUT` and the server force-ends the turn
 * (pending inputs default-resolved, an open fight retreated, then a normal
 * END_TURN — the player is NOT eliminated; play simply shifts to the others).
 * The clock pauses (and thereby RESETS) while the seat is in a battle, blocked by
 * someone ELSE'S exclusive interaction, or held by the round-start event barrier,
 * so only time the player could actually spend on the map counts against them.
 */
export const TURN_TIME_LIMIT_MS = 10 * 60_000;

/**
 * The turn/AFK time controls — the idle vote-kick, the 30-minute certain
 * auto-kick, and the 10-minute per-turn timer — run ONLY on a CLOSED (hosted)
 * table, the ranked/serious mode where seats are identity-bound and someone is
 * genuinely kept waiting. An OPEN table is the casual/single-browser mode and
 * carries NO time pressure at all: nobody is voted out, auto-kicked or
 * force-shifted for taking their time (user rule: "remove all time constraint in
 * open game, keep it in closed game"). A table that is later hosted picks the
 * clocks up on its next action; one un-hosted drops them.
 */
export function timeControlsActive(state: GameState): boolean {
  return Boolean(state.room?.hosted);
}

/** The AFK slice, created on demand (absent on legacy snapshots and solo games). */
export function getAfkState(state: GameState): AfkState {
  if (!state.afk) {
    state.afk = { lastActionAt: {}, vote: null };
  }
  return state.afk;
}

/**
 * Live HUMAN seats (turnOrder already drops eliminated players).
 *
 * CO-OP step 2 — a COMPUTER seat is filtered out here, which is the single seam
 * that keeps every time control off the AI: it is never a vote target, never
 * auto-kickable, never counted among the voters whose unanimity a kick vote
 * needs (a computer never votes, so an AI seat in the list made an otherwise
 * legitimate vote against an absent HUMAN impossible to resolve), and never has
 * a running per-turn clock — the server pump is the AI's clock. Every human
 * seat's time controls are untouched. No-op on a table with no computer seat,
 * and single-player never reaches any of these paths at all (the sessionMode
 * guards above them).
 */
function liveSeats(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (id) =>
      id !== NEUTRAL_PLAYER_ID &&
      !state.players[id]?.eliminated &&
      !isComputerPlayer(state, id)
  );
}

function gameIsOver(state: GameState): boolean {
  // Combat end temporarily parks phase at "game-over" while the notice is up;
  // only a declared adventure winner (or a cleared combat) is a real end.
  if (state.adventure?.winnerPlayerId) {
    return true;
  }
  return state.phase === "game-over" && !state.combat;
}

/** The AFK/timeout meta-actions themselves never count as "activity". */
function isAfkMetaAction(action: GameAction): boolean {
  return (
    action.type === "START_AFK_VOTE" ||
    action.type === "CAST_AFK_VOTE" ||
    action.type === "RESOLVE_AFK_DROP" ||
    action.type === "FORCE_AFK_KICK" ||
    action.type === "FORCE_TURN_TIMEOUT" ||
    action.type === "RESOLVE_TURN_TIMEOUT"
  );
}

/**
 * Whether the table is currently WAITING ON `playerId` to act — the only seat a
 * kick VOTE may target in ordered play. In parallel-turn mode every live seat's
 * turn is open at once, so everyone is "awaited". In ordered play only the seat
 * the table is blocked on is: the active player, a participant of an open
 * battle, or the holder of an open pending interaction / reaction priority. A
 * player simply waiting for their turn is idle BY DESIGN and must not be
 * kickable ("if it's another player's turn, you can't vote-kick the others").
 */
export function seatIsAwaitedInOrderedPlay(state: GameState, playerId: PlayerId): boolean {
  if (state.turn?.mode === "parallel") {
    // ...except a seat that already ENDED its parallel turn: it cannot act at
    // all until the round wraps, so it is idle BY DESIGN like a seat waiting
    // for its ordered turn. (The 30-minute FORCE_AFK_KICK ignores this gate,
    // so a truly gone seat is still removable.)
    return !state.turn.completedPlayerIds.includes(playerId);
  }
  if (state.activePlayerId === playerId) {
    return true;
  }
  const combat = state.combat;
  if (
    combat &&
    !combat.outcome &&
    combat.context.kind !== "sandbox" &&
    (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId)
  ) {
    return true;
  }
  const activeCombatUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : null;
  if (combat && activeCombatUnit && combatUnitDecisionOwnerId(state, combat, activeCombatUnit) === playerId) {
    return true;
  }
  if (state.pendingChoice?.playerId === playerId) {
    return true;
  }
  if (state.reactionWindow?.priorityPlayerId === playerId) {
    return true;
  }
  const adventure = state.adventure;
  return Boolean(
    adventure &&
      (adventure.pendingVisit?.playerId === playerId ||
        adventure.pendingTileChoice?.playerId === playerId ||
        adventure.pendingNecromancy?.playerId === playerId ||
        adventure.pendingFarTileFlip?.playerId === playerId ||
        adventure.pendingGarrison?.defenderPlayerId === playerId)
  );
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
  if (state.sessionMode === "single-player" || state.mode !== "adventure" || now === undefined || isAfkMetaAction(action)) {
    return;
  }
  const actorId =
    "playerId" in action && typeof (action as { playerId?: unknown }).playerId === "string"
      ? (action as { playerId: PlayerId }).playerId
      : null;
  if (!actorId || actorId === NEUTRAL_PLAYER_ID || !state.players[actorId]) {
    return;
  }
  // CO-OP step 2: a COMPUTER seat's action is the server pump's, not a player's
  // activity — it must not stamp an idle clock (the seat is not kickable at all,
  // see liveSeats) and must not cancel a vote about somebody else.
  if (isComputerPlayer(state, actorId)) {
    return;
  }
  // Actions the SERVER driver takes on a seat's behalf (answering the pending
  // choices of a passed kick vote or an expired turn with default picks) are
  // not the player's own activity: they must neither refresh the idle clock
  // (the 30-minute auto-kick would never fire for a seat that times out every
  // turn) nor cancel a kick vote as "they are back".
  if (state.afk && (state.afk.droppingPlayerId === actorId || state.afk.turnTimeoutPlayerId === actorId)) {
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

/**
 * CO-OP step 2 — a COMPUTER seat is never a time-control TARGET. `liveSeats`
 * already excludes it, so every call site would refuse anyway; this raises the
 * misleading "must still be in the game" message into an honest one and makes
 * the rule a single named read the tests can point at.
 */
function assertNotComputerTarget(state: GameState, targetPlayerId: PlayerId): void {
  if (isComputerPlayer(state, targetPlayerId)) {
    throw new Error("A computer seat is played by the server — it is never AFK.");
  }
}

/** Shared legality for both vote actions. */
function assertVoteContext(state: GameState): AfkState {
  if (state.sessionMode === "single-player") throw new Error("AFK votes do not exist in single-player games.");
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
  if (!timeControlsActive(state)) {
    throw new Error("AFK votes run only on a closed (hosted) table.");
  }
  assertNotComputerTarget(state, action.targetPlayerId);
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
  // Ordered play: a seat can only be voted out while the table is actually
  // waiting on it (its turn / its battle / its choice). Someone idling through
  // another player's turn is not holding anything up and must not be kickable.
  if (!seatIsAwaitedInOrderedPlay(state, action.targetPlayerId)) {
    throw new Error(`You can only call an AFK vote against ${playerName(state, action.targetPlayerId)} on their own turn.`);
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

/**
 * FORCE_AFK_KICK: certain auto-kick of a seat idle past AFK_AUTO_KICK_MS (30
 * minutes) — no vote. Unlike the vote, this is NOT restricted to the awaited
 * seat: a seat gone 30 minutes has abandoned the game and is removed whatever
 * the turn state. Any live seat's client fires it; the server re-checks the
 * idle time against its own clock, then begins the shared force-drop
 * (`afk.droppingPlayerId`) the passed vote uses, so the drop runs through the
 * exact same tested pipeline (pending choices default-resolved, open combat
 * conceded, elimination + turn/round machinery).
 */
export function forceAfkKick(
  state: GameState,
  action: Extract<GameAction, { type: "FORCE_AFK_KICK" }>,
  now: number | undefined
): void {
  const afk = assertVoteContext(state);
  if (!timeControlsActive(state)) {
    throw new Error("The AFK auto-kick runs only on a closed (hosted) table.");
  }
  assertNotComputerTarget(state, action.targetPlayerId);
  const seats = liveSeats(state);
  if (seats.length < 2) {
    throw new Error("An AFK kick needs at least two players still in the game.");
  }
  if (!seats.includes(action.playerId) || !seats.includes(action.targetPlayerId)) {
    throw new Error("Both the actor and the target must still be in the game.");
  }
  if (action.playerId === action.targetPlayerId) {
    throw new Error("You cannot auto-kick yourself.");
  }
  if (afk.droppingPlayerId) {
    throw new Error("A player is already being removed.");
  }
  if (now === undefined) {
    throw new Error("AFK timing is unavailable on this table.");
  }
  if (idleMillis(state, action.targetPlayerId, now) < AFK_AUTO_KICK_MS) {
    throw new Error(`${playerName(state, action.targetPlayerId)} has not been away for 30 minutes yet.`);
  }

  // A vote about this seat is now moot — the hard timeout overrides it.
  if (afk.vote && afk.vote.targetPlayerId === action.targetPlayerId) {
    afk.vote = null;
  }
  (afk.lastVoteEndedAt ??= {})[action.targetPlayerId] = now;
  afk.droppingPlayerId = action.targetPlayerId;
  appendEvent(state, {
    type: "AFK_AUTO_KICKED",
    targetPlayerId: action.targetPlayerId,
    byPlayerId: action.playerId,
    message: `${playerName(state, action.targetPlayerId)} was away for 30 minutes and is removed from the game (AFK).`
  });
}

// ---------------------------------------------------------------------------
// Per-turn time budget (TURN_TIME_LIMIT_MS): even an ACTIVE player's turn ends
// after 10 minutes — force-shifted to the others, never eliminated.
// ---------------------------------------------------------------------------

/**
 * The seats whose per-turn clock is running right now: in ordered play the
 * active seat, in parallel mode every live seat whose turn is still open.
 * Empty outside multiplayer adventures (solo tables, setup lobbies, sandbox,
 * finished games) — the turn budget exists only where someone is kept waiting.
 *
 * CO-OP step 2: `liveSeats` excludes COMPUTER seats, so an AI seat's open turn
 * never has a running clock (nothing can be timed out on it) and a table with
 * fewer than two HUMAN seats carries no turn budget at all.
 */
export function turnClockRunningSeats(state: GameState): PlayerId[] {
  if (state.sessionMode === "single-player" || state.mode !== "adventure" || !state.adventure || state.setupLobby || gameIsOver(state)) {
    return [];
  }
  // Closed (hosted) tables only — an open table carries no per-turn timer.
  if (!timeControlsActive(state)) {
    return [];
  }
  const seats = liveSeats(state);
  if (seats.length < 2) {
    return [];
  }
  if (parallelTurnsActive(state)) {
    return seats.filter((seat) => !state.turn.completedPlayerIds.includes(seat));
  }
  const active = state.activePlayerId;
  return active && seats.includes(active) ? [active] : [];
}

/**
 * Whether `playerId`'s turn clock is PAUSED: the seat cannot meaningfully spend
 * its 10-minute budget right now (or should not have to), so the time must not
 * count against it. A pause is also a soft RESET: because the clock is re-stamped
 * on every action while paused AND on the action that lifts the pause (see
 * `applyTurnClockBookkeeping`), a seat that comes out of a pause resumes with a
 * fresh, full budget. Paused while
 *  - ANY (non-sandbox) battle is open and this seat is IN it — the fighter's own
 *    neutral combat, a PvP battle (both sides), or a PvP-Neutral-Control guard
 *    slot they are waiting on another human to play. A battle can run long and is
 *    its own timed context; the player-facing rule is "the 10-minute limit resets
 *    when in battle", so combat time never eats the map-turn budget. In ordered
 *    play bystanders also wait; independent parallel actors keep their clocks;
 *  - the round-start Event/Astrologers barrier freezes the table for everyone
 *    but the current resolver;
 *  - the table's exclusive interaction (choice, reaction priority, visit, tile
 *    rotation, Necromancy window, far-tile flip, garrison prompt) is owned by
 *    ANOTHER seat. The player's own open windows keep the clock running — the
 *    budget covers everything they themselves are deciding.
 */
export function turnClockPausedFor(state: GameState, playerId: PlayerId): boolean {
  // Independent work by another player does not pause or reset this turn's
  // clock. Shared round-start work remains visible through the projection.
  state = parallelStateForPlayer(state, playerId, playerId);
  const combat = state.combat;
  // A battle in this player's view pauses the map clock. In parallel mode
  // unrelated battles have already been projected out above.
  if (combat && !combat.outcome && combat.context.kind !== "sandbox") {
    return true;
  }
  if (isRoundStartEventBarrierActive(state) && roundStartEventResolver(state) !== playerId) {
    return true;
  }
  if (state.pendingChoice && state.pendingChoice.playerId !== playerId) {
    return true;
  }
  if (state.reactionWindow && state.reactionWindow.priorityPlayerId !== playerId) {
    return true;
  }
  const adventure = state.adventure;
  if (adventure) {
    if (adventure.pendingVisit && adventure.pendingVisit.playerId !== playerId) {
      return true;
    }
    if (adventure.pendingTileChoice && adventure.pendingTileChoice.playerId !== playerId) {
      return true;
    }
    if (adventure.pendingNecromancy && adventure.pendingNecromancy.playerId !== playerId) {
      return true;
    }
    // The two after-combat twins of the Necromancy window block bystanders
    // identically (parallelInteractionBlocker), so they pause the clock too.
    if (
      adventure.pendingCompanionRecruitment &&
      adventure.pendingCompanionRecruitment.playerId !== playerId
    ) {
      return true;
    }
    if (adventure.pendingCommanderFirstAid && adventure.pendingCommanderFirstAid.playerId !== playerId) {
      return true;
    }
    if (adventure.pendingFarTileFlip && adventure.pendingFarTileFlip.playerId !== playerId) {
      return true;
    }
    if (adventure.pendingGarrison && adventure.pendingGarrison.defenderPlayerId !== playerId) {
      return true;
    }
  }
  return false;
}

/**
 * How long (ms) `playerId`'s open turn has been burning its budget at `now`.
 * 0 when their clock is not running (no open turn / stamps not bootstrapped).
 */
export function turnElapsedMillis(state: GameState, playerId: PlayerId, now: number): number {
  const since = state.afk?.turnOpenSince?.[playerId];
  return since === undefined ? 0 : Math.max(0, now - since);
}

/**
 * Post-action bookkeeping for the per-turn clock, called from applyAction's
 * success path for EVERY stamped action (unlike the idle stamps it must run on
 * other players' and driver actions too — those are exactly what opens/closes
 * turns). Stamps a seat's clock when its turn opens, RE-stamps it while the
 * seat is paused (so paused time never accrues — see turnClockPausedFor), and
 * drops the stamp when the turn closes. Also clears a stale timeout flag once
 * the timed-out seat's turn is gone.
 *
 * `pausedBefore` lists the seats whose clock was paused in the PRE-action
 * state: the action that LIFTS a pause (the blocker resolving their choice)
 * leaves the post-action state un-paused, so without it the whole blocked
 * stretch would land on the innocent seat's clock. A re-stamp on either side
 * of the action keeps paused time forgiven.
 */
export function applyTurnClockBookkeeping(
  state: GameState,
  now: number | undefined,
  pausedBefore: readonly PlayerId[] = []
): void {
  if (state.mode !== "adventure" || now === undefined) {
    return;
  }
  const open = turnClockRunningSeats(state);
  const afk = state.afk;
  if (open.length === 0) {
    // No running clocks (solo table, setup, game over): drop any stale stamps
    // without creating the AFK slice on tables that never needed it.
    if (afk?.turnOpenSince && Object.keys(afk.turnOpenSince).length > 0) {
      afk.turnOpenSince = {};
    }
    if (afk?.turnTimeoutPlayerId) {
      afk.turnTimeoutPlayerId = null;
    }
    return;
  }
  const slice = getAfkState(state);
  const clock = (slice.turnOpenSince ??= {});
  for (const seat of Object.keys(clock)) {
    if (!open.includes(seat)) {
      delete clock[seat];
    }
  }
  for (const seat of open) {
    if (clock[seat] === undefined || pausedBefore.includes(seat) || turnClockPausedFor(state, seat)) {
      clock[seat] = now;
    }
  }
  if (slice.turnTimeoutPlayerId && !open.includes(slice.turnTimeoutPlayerId)) {
    slice.turnTimeoutPlayerId = null;
  }
}

/**
 * FORCE_TURN_TIMEOUT: any live seat's client fires this once `targetPlayerId`'s
 * open turn has burned its full TURN_TIME_LIMIT_MS budget (the server re-checks
 * everything against its own clock). It only ARMS the force-shift
 * (`afk.turnTimeoutPlayerId`); the server-side driver (src/engine/afk-drop.ts)
 * then default-resolves the seat's pending inputs, retreats it from an open
 * neutral fight and ends the turn through the normal END_TURN machinery.
 */
export function forceTurnTimeout(
  state: GameState,
  action: Extract<GameAction, { type: "FORCE_TURN_TIMEOUT" }>,
  now: number | undefined
): void {
  const afk = assertVoteContext(state);
  // CO-OP step 2: the SERVER-side re-validation of the client-fired trigger must
  // refuse a computer-seat target outright — the pump is that seat's clock and a
  // forced turn end would fight it.
  assertNotComputerTarget(state, action.targetPlayerId);
  const seats = liveSeats(state);
  if (seats.length < 2) {
    throw new Error("The turn timer runs only with at least two players still in the game.");
  }
  if (!seats.includes(action.playerId) || !seats.includes(action.targetPlayerId)) {
    throw new Error("Both the actor and the target must still be in the game.");
  }
  if (afk.droppingPlayerId) {
    throw new Error("A player is already being removed.");
  }
  if (afk.turnTimeoutPlayerId) {
    throw new Error("A turn is already being timed out.");
  }
  if (now === undefined) {
    throw new Error("Turn timing is unavailable on this table.");
  }
  if (!turnClockRunningSeats(state).includes(action.targetPlayerId)) {
    throw new Error(`${playerName(state, action.targetPlayerId)} has no open turn to time out.`);
  }
  if (turnClockPausedFor(state, action.targetPlayerId)) {
    throw new Error(`${playerName(state, action.targetPlayerId)}'s turn clock is paused right now.`);
  }
  if (turnElapsedMillis(state, action.targetPlayerId, now) < TURN_TIME_LIMIT_MS) {
    throw new Error(`${playerName(state, action.targetPlayerId)} still has turn time left.`);
  }

  afk.turnTimeoutPlayerId = action.targetPlayerId;
  appendEvent(state, {
    type: "TURN_TIME_EXPIRED",
    targetPlayerId: action.targetPlayerId,
    byPlayerId: action.playerId,
    message: `${playerName(state, action.targetPlayerId)}'s 10 minutes are up — their turn ends and play shifts on.`
  });
}
