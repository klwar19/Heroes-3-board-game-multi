import { appendEvent } from "./events";
import { neutralCombatControllerId } from "./neutral-control";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { GameState, PlayerId } from "./state";

/**
 * Parallel turns (OPTIONAL adventure rule, multiplayer only).
 *
 * While `state.turn.mode === "parallel"`, every live player's turn is open at
 * once: each may move, act and end their own turn independently, and the round
 * wraps once everyone has ended (`turn.completedPlayerIds`). The engine's
 * exclusive interaction machinery stays a strict singleton — one combat, one
 * pending choice, one visit, one tile rotation at a time — so while one is open
 * for player A, every other player is limited to actions that provably cannot
 * touch it (quiet hero movement over trigger-free fields; everything else says
 * "wait"). Shared-deck draws therefore resolve strictly in action-arrival
 * order: whoever acts first draws first, and no card can be handed out twice.
 *
 * The mode stops — with a `PARALLEL_TURNS_STOPPED` warning to the whole table —
 * the moment a PvP battle starts, a serious PvP interaction resolves (taking a
 * mine/settlement/town flag from a live player, e.g. the View Earth capture;
 * hand discards are deliberately NOT serious), or the chosen period ends. Play
 * then continues in the normal one-at-a-time rotation, starting with the player
 * whose action stopped the mode.
 */

/** Upper bound for the parallel-turn period pickable in the lobby. */
export const MAX_PARALLEL_TURN_ROUNDS = 12;

/**
 * Round-start Event / Astrologers barrier (applies in BOTH ordered and parallel
 * play, despite living in this module). Whether the round's Event or Astrologers
 * proclamation is still being resolved by the table: while this holds, the ONLY
 * player who may act is the one whose event choice is currently open — everyone
 * else waits (no quiet moves, no start-of-turn draw, no town/morale actions, no
 * ending the turn). Set in `startAdventureRound` (`beginRoundStartEventBarrier`)
 * and cleared by the trailing sentinel reward in `pumpAdventureQueues`.
 */
export function isRoundStartEventBarrierActive(state: GameState): boolean {
  const barrier = state.adventure?.eventResolution;
  return state.mode === "adventure" && !!barrier && barrier.round === state.round;
}

/**
 * While the round-start event barrier is up, the single player permitted to act
 * — the owner of the currently-open event choice (a `pendingChoice`, else the
 * `pendingVisit`). `null` when the barrier is down, or (defensively) up with no
 * interaction open, in which case the pump is mid-drain and no player action can
 * interleave anyway.
 */
export function roundStartEventResolver(state: GameState): PlayerId | null {
  if (!isRoundStartEventBarrierActive(state)) {
    return null;
  }
  return state.pendingChoice?.playerId ?? state.adventure?.pendingVisit?.playerId ?? null;
}

/** Normalizes a lobby `parallelTurns` value to an integer 0..MAX (0 = off). */
export function normalizeParallelTurnRounds(value: unknown): number {
  const rounds = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(MAX_PARALLEL_TURN_ROUNDS, rounds));
}

/** Whether the optional parallel-turn mode is currently running. */
export function parallelTurnsActive(state: GameState): boolean {
  return state.mode === "adventure" && state.turn.mode === "parallel";
}

/**
 * Whether `playerId` has an OPEN parallel turn right now: parallel mode is
 * running and they have not ended their turn this round. Neutral seats and
 * eliminated players never qualify.
 */
export function isParallelActor(state: GameState, playerId: PlayerId): boolean {
  if (!parallelTurnsActive(state) || playerId === NEUTRAL_PLAYER_ID) {
    return false;
  }
  if (!state.turnOrder.includes(playerId)) {
    return false;
  }
  if (state.players[playerId]?.eliminated) {
    return false;
  }
  return !state.turn.completedPlayerIds.includes(playerId);
}

/**
 * Whether `playerId` may take map-turn actions right now: it is their ordered
 * turn, or their parallel turn is open. THE parallel-aware replacement for
 * `state.activePlayerId === playerId` on the adventure map.
 */
export function hasOpenAdventureTurn(state: GameState, playerId: PlayerId): boolean {
  return state.activePlayerId === playerId || isParallelActor(state, playerId);
}

/** Live players whose parallel turn is still open this round. */
export function remainingParallelPlayerIds(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (playerId) =>
      playerId !== NEUTRAL_PLAYER_ID &&
      !state.players[playerId]?.eliminated &&
      !state.turn.completedPlayerIds.includes(playerId)
  );
}

/**
 * Who owns the exclusive interaction currently open, from `playerId`'s point
 * of view: `null` when nothing is open or everything open belongs to
 * `playerId` (they resolve it through the normal flow); another player's id
 * when THEY must finish first; `"table"` when the blocker has no single owner
 * (a mid-resolution stack). Combats block everyone but their two participants.
 */
export function parallelInteractionBlocker(state: GameState, playerId: PlayerId): PlayerId | "table" | null {
  if (!parallelTurnsActive(state)) {
    return null;
  }

  const combat = state.combat;
  if (combat) {
    if (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId) {
      return null;
    }
    // PvP Neutral Control: the player controlling the Neutral side IS a
    // participant of this fight — they drive the guards' activations and
    // answer the Neutral side's choices, so their inputs are the interaction's
    // own, never a bystander intrusion. While the fight is open their legal
    // actions come exclusively from the combat branches (unit commands, choice
    // options), so this cannot leak any non-quiet map action to them.
    if (neutralCombatControllerId(state, combat) === playerId) {
      return null;
    }
    // Report the human fighter (a neutral-guard fight's defender is the
    // neutral seat, which reads poorly in a "wait for …" message).
    return combat.attackerPlayerId !== NEUTRAL_PLAYER_ID ? combat.attackerPlayerId : combat.defenderPlayerId;
  }

  if (state.stack.length > 0) {
    return "table";
  }

  const choice = state.pendingChoice;
  if (choice && choice.playerId !== playerId) {
    return choice.playerId;
  }

  const window = state.reactionWindow;
  if (window && window.priorityPlayerId !== playerId) {
    return window.priorityPlayerId;
  }

  const adventure = state.adventure;
  const visit = adventure?.pendingVisit;
  if (visit && visit.playerId !== playerId) {
    return visit.playerId;
  }

  const tile = adventure?.pendingTileChoice;
  if (tile && tile.playerId !== playerId) {
    return tile.playerId;
  }

  const necromancy = adventure?.pendingNecromancy;
  if (necromancy && necromancy.playerId !== playerId) {
    return necromancy.playerId;
  }

  const farFlip = adventure?.pendingFarTileFlip;
  if (farFlip && farFlip.playerId !== playerId) {
    return farFlip.playerId;
  }

  const garrison = adventure?.pendingGarrison;
  if (garrison && garrison.defenderPlayerId !== playerId && garrison.attackerPlayerId !== playerId) {
    return garrison.defenderPlayerId;
  }

  return null;
}

/** Human-readable "wait for …" explanation for a blocked parallel action. */
export function parallelWaitMessage(state: GameState, blocker: PlayerId | "table"): string {
  const name = blocker === "table" ? "another player" : (state.players[blocker]?.name ?? blocker);
  const what = state.combat ? "battle" : "interaction";
  return `Parallel turns: wait until ${name}'s ${what} is resolved — only quiet moves are possible meanwhile.`;
}

/**
 * Guard for parallel-mode actions that would open or touch the (singleton)
 * interaction machinery: throws the friendly wait message while it is busy
 * with someone other than `playerId`. A no-op outside parallel mode.
 */
export function assertParallelInteractionFree(state: GameState, playerId: PlayerId): void {
  const blocker = parallelInteractionBlocker(state, playerId);
  if (blocker) {
    throw new Error(parallelWaitMessage(state, blocker));
  }
}

/**
 * Compact fingerprint of every exclusive-interaction slot (and the global
 * phase/priority the interaction machines steer). Captured before and after a
 * bystander's parallel action: if the fingerprint moved, the action touched
 * machinery it must not, and the whole action is rejected — the transactional
 * backstop that makes "quiet" actions safe by construction rather than by
 * enumeration.
 */
export function parallelSlotSignature(state: GameState): string {
  const adventure = state.adventure;
  return JSON.stringify([
    state.phase,
    state.priorityPlayerId,
    state.combat
      ? [
          state.combat.id,
          Boolean(state.combat.outcome),
          Boolean(state.combat.setup),
          Boolean(state.combat.prep),
          state.combat.pendingNeutralPlacement ?? null
        ]
      : null,
    state.pendingChoice?.id ?? null,
    state.reactionWindow?.id ?? null,
    state.stack.length,
    adventure?.pendingVisit ? [adventure.pendingVisit.playerId, adventure.pendingVisit.fieldId] : null,
    adventure?.pendingTileChoice ? [adventure.pendingTileChoice.playerId, adventure.pendingTileChoice.tileInstanceId] : null,
    adventure?.pendingNecromancy?.playerId ?? null,
    adventure?.pendingFarTileFlip ? adventure.pendingFarTileFlip.playerId : null,
    adventure?.pendingGarrison ? adventure.pendingGarrison.defenderPlayerId : null
  ]);
}

/**
 * Stops parallel turns (idempotent): the table-wide warning is logged, the
 * mode becomes the normal ordered rotation and — for the two PvP reasons — the
 * player whose action stopped it becomes the active player, so the battle /
 * interaction resolves inside their now-ordered turn. Players who had already
 * ended their parallel turn this round stay ended (the ordered rotation skips
 * them until the round wraps); everyone else gets their remaining turn in seat
 * order afterwards.
 *
 * For PvP reasons this also enforces the "one interaction at a time" law:
 * called while the machinery is busy with a THIRD player, it throws instead —
 * rejecting the aggressor's whole action ("wait until the battle finishes").
 */
export function stopParallelTurns(
  state: GameState,
  reason: "pvp-battle" | "pvp-interaction" | "period-ended",
  byPlayerId?: PlayerId,
  detail?: string
): void {
  if (!parallelTurnsActive(state)) {
    return;
  }

  if (reason !== "period-ended" && byPlayerId) {
    assertParallelInteractionFree(state, byPlayerId);
  }

  const byName = byPlayerId ? (state.players[byPlayerId]?.name ?? byPlayerId) : undefined;
  const message =
    reason === "pvp-battle"
      ? `⚔ Parallel turns have STOPPED: ${byName} started a player-vs-player battle${detail ? ` (${detail})` : ""}. The battle resolves now and play continues in normal turn order.`
      : reason === "pvp-interaction"
        ? `⚔ Parallel turns have STOPPED: ${byName} ${detail ?? "resolved a serious interaction against another player"}. Play continues in normal turn order.`
        : `⏳ Parallel turns have ENDED: the agreed period (${state.turn.simultaneousRoundLimit} round${state.turn.simultaneousRoundLimit === 1 ? "" : "s"}) is over. Play continues in normal turn order.`;

  state.turn.mode = "ordered";
  state.turn.parallelStopped = { reason, round: state.round };

  if (byPlayerId && reason !== "period-ended") {
    // The aggressor's open action continues as their ordered turn.
    state.activePlayerId = byPlayerId;
    state.turn.observingPlayerId = byPlayerId;
  }

  appendEvent(state, {
    type: "PARALLEL_TURNS_STOPPED",
    reason,
    ...(byPlayerId ? { byPlayerId } : {}),
    message
  });
}

/**
 * Whether this round already ran `startPlayerTurn` for every live player (a
 * parallel round start, before the mode stopped mid-round). The ordered
 * rotation must then NOT run it again when it hands the turn on — a player
 * would get a second start-of-turn draw and re-queued turn-start effects.
 */
export function parallelTurnStartAlreadyRan(state: GameState): boolean {
  return state.turn.parallelStopped?.round === state.round;
}
