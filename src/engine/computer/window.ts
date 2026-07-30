import { getDraftPhase } from "../adventure-setup";
import { neutralCombatControllerId } from "../neutral-control";
import {
  isRoundStartEventBarrierActive,
  parallelInteractionBlocker,
  roundStartEventResolver,
} from "../parallel-turns";
import { NEUTRAL_PLAYER_ID } from "../state";
import type { GameState, PlayerId } from "../state";
import { controllerOf, isComputerPlayer } from "./control";

function computer(
  state: GameState,
  playerId: PlayerId | null | undefined,
): PlayerId | null {
  return playerId &&
    isComputerPlayer(state, playerId) &&
    !state.players[playerId]?.eliminated
    ? playerId
    : null;
}

/** A seat that still exists and is not eliminated (any controller). */
function liveSeat(state: GameState, playerId: PlayerId | null | undefined): PlayerId | null {
  return playerId && state.players[playerId] && !state.players[playerId]?.eliminated
    ? playerId
    : null;
}

/**
 * Returns only a seat that owns a real required/open action window. This avoids
 * treating off-turn "anytime" card offers as permission for unsolicited bot play.
 *
 * Wait-vs-drive rule: the exclusive interaction machinery (pending choice,
 * reaction window, event barrier, visits, an open combat) is a table-wide
 * singleton. When one is open, either its owner is a computer (drive it) or the
 * function returns null so the runner WAITS for the human — it must never fall
 * through to plain turn ownership, where the blocked seat would have no
 * automatable action and read as a stall.
 *
 * PRECEDENCE MIRRORS getLegalActions. The one invariant that keeps a live
 * table alive is: whenever this function names a computer seat, that seat has
 * legal actions to take — and whenever the only seat with legal actions is a
 * computer, this function names it. The pre-rewrite version checked the MAP
 * windows before the combat dispatcher and returned null unconditionally on a
 * round-start barrier with no resolver, so a window getLegalActions actually
 * gated on (e.g. a computer seat's after-wave Necromancy window behind the
 * round-start barrier — the reported round-6 single-player freeze) was owned
 * by NOBODY: the pump never drove it, the human's legal set was empty, and
 * every click failed "That action is not legal in the current game state."
 * forever. When editing getLegalActions' window order, keep this in lockstep.
 */
export function computerDecisionOwner(state: GameState): PlayerId | null {
  // A combat that just ended ALSO parks the game in the "game-over" phase until
  // a participant acknowledges the end-of-combat notice — only then does the
  // engine finalize XP / unit flips / the field visit and return to the map. A
  // computer fighter must still drive that acknowledgment, so a game-over with
  // an un-acknowledged (non-sandbox) combat notice falls through to the combat
  // block below. A TRULY finished game (winner declared) owes nobody a decision.
  if (state.adventure?.winnerPlayerId) {
    return null;
  }
  const combatAwaitingAck = Boolean(
    state.combat?.outcome &&
      state.combat.context.kind !== "sandbox" &&
      !state.combat.endAcknowledged,
  );
  if (state.phase === "game-over" && !combatAwaitingAck) {
    return null;
  }

  if (state.pendingChoice) {
    return computer(state, state.pendingChoice.playerId);
  }
  if (state.reactionWindow) {
    return computer(state, state.reactionWindow.priorityPlayerId);
  }
  // Round-start Event/Astrologers barrier: while a RESOLVER is named, that
  // seat is the only one who may act at the whole table. When the resolver
  // read is null — an open combat (a Calamity Wave assault), or a barrier
  // interaction the read does not cover (a wave winner's Necromancy window, a
  // tile-rotation choice) — getLegalActions lets play fall through to its
  // normal window gates, so this function MUST fall through too. The old
  // unconditional `return computer(state, resolver)` turned every such state
  // into "nobody owes a decision" and froze the table.
  if (isRoundStartEventBarrierActive(state)) {
    const resolver = roundStartEventResolver(state);
    if (resolver) {
      return computer(state, resolver);
    }
  }

  const combat = state.combat;
  if (combat) {
    // Mirror getCombatInteractionActions' gate order exactly.

    // 1. End-of-combat acknowledgment (also reachable in the "game-over" phase
    //    via combatAwaitingAck above).
    if (combat.outcome && !combat.endAcknowledged) {
      return (
        computer(state, combat.attackerPlayerId) ??
        computer(state, combat.defenderPlayerId)
      );
    }

    // 2. PvP pre-battle prep gate. While `combat.prep` is open, legal-actions
    // offers ONLY a not-yet-accepted participant its Accept/town actions and
    // RETURNS EARLY — deployment, tactics and activation are legal for NOBODY
    // until both sides have accepted. So drive a computer that still owes an
    // accept; if the only pending acceptor is the human, the whole table WAITS.
    if (combat.prep) {
      for (const owner of [combat.attackerPlayerId, combat.defenderPlayerId]) {
        if (combat.prep.accepted.includes(owner)) continue;
        const result = computer(state, owner);
        if (result) return result;
      }
      return null;
    }

    // Cover of Darkness / Shackles owners resolve through their paired
    // pendingChoice (handled above); these queues track who still owes one.
    for (const owner of combat.pendingCoverOfDarkness ?? []) {
      const result = computer(state, owner);
      if (result) return result;
    }
    for (const owner of combat.pendingShackles ?? []) {
      const result = computer(state, owner);
      if (result) return result;
    }

    // 3. Neutral Control's pre-battle formation SORT. The guards remain
    // controllerId=NEUTRAL_PLAYER_ID, so the active-unit lookup below cannot
    // see that a computer controller owns the window.
    if (combat.pendingNeutralPlacement) {
      return computer(state, combat.pendingNeutralPlacement);
    }

    // 4. Start-of-combat Tactics window: the queue head acts, everyone else
    // waits (legal-actions returns early for the whole table).
    if (combat.pendingTacticsSwaps && combat.pendingTacticsSwaps.length > 0) {
      return computer(state, combat.pendingTacticsSwaps[0]);
    }

    // 5. WOG Commanders pre-combat SORT window. Today the window opener skips
    // computer seats (openCommanderPlacementWindow), so the head is always a
    // human — but legal-actions gates the WHOLE table on it, so this branch
    // must exist (and wait on the human head) or a future computer head would
    // freeze the table unseen.
    if (combat.pendingCommanderPlacement && combat.pendingCommanderPlacement.length > 0) {
      return computer(state, combat.pendingCommanderPlacement[0]);
    }

    // 6. Deployment placement: the placement head acts, everyone else waits.
    // An empty queue with `setup` still standing means placement is over —
    // fall through to the fight (real states null `setup` out then; some
    // legacy snapshots/fixtures keep the empty shell).
    if (combat.setup && combat.setup.pendingPlayerIds.length > 0) {
      return computer(state, combat.setup.pendingPlayerIds[0]);
    }

    // 7. Pre-activation reaction pause / guard-walk pause: the reactor (the
    // attacking fighter when the pause names nobody — legal-actions' own
    // default) owns the continue-or-react decision that gates the (possibly
    // computer-owned) active unit. Crucially, do NOT fall through to the
    // active unit's owner while the pause holds — that unit has no legal
    // action yet. When a computer attacks the HUMAN in single-player, the
    // human holds this pre-activation pause while the active unit belongs to
    // the COMPUTER: falling through claimed the computer owed a move it could
    // not make, so the paced pump stalled.
    if (combat.pendingNeutralStep) {
      return computer(
        state,
        combat.pendingNeutralStep.reactingPlayerId ?? combat.attackerPlayerId,
      );
    }

    // 8. The neutral-combat continue-or-retreat window belongs to the
    // fighting hero's controller (legal-actions reads the hero, not the
    // attacker seat — mirror that read).
    if (combat.awaitingContinue) {
      if (combat.context.kind !== "neutral") {
        return null;
      }
      return computer(state, state.heroes[combat.context.heroId]?.controllerId ?? null);
    }

    // 9. The active fight: the active unit's controller (or, for a Neutral
    // guard, the seat Neutral Control assigned it to).
    const activeController = combat.activeUnitId
      ? combat.units[combat.activeUnitId]?.controllerId
      : null;
    const activeOwner = computer(state, activeController);
    if (activeOwner) return activeOwner;
    if (activeController === NEUTRAL_PLAYER_ID) {
      const neutralOwner = computer(state, neutralCombatControllerId(state, combat));
      if (neutralOwner) return neutralOwner;
    }

    // An open combat is an exclusive interaction: while no computer-owned slot
    // inside it is required, every seat (fighters and bystanders alike) waits.
    return null;
  }

  const adventure = state.adventure;
  if (adventure) {
    // Exclusive map interactions, in getLegalActions' own gate order — the
    // FIRST open window decides who may act; everyone else waits. Returning
    // "any computer among the owners" here (the old shape) could name a seat
    // whose window is shadowed by an earlier gate, which stalls the pump.
    const gatedWindows: (PlayerId | null | undefined)[] = [
      adventure.pendingTileChoice?.playerId,
      adventure.pendingVisit?.playerId,
      adventure.pendingCommanderFirstAid?.playerId,
      adventure.pendingNecromancy?.playerId,
    ];
    for (const owner of gatedWindows) {
      if (!owner) continue;
      // A window orphaned on an eliminated seat gates nothing in
      // legal-actions (its gate serves only the owner, who is gone) — do not
      // let it freeze the whole table here either.
      if (!liveSeat(state, owner)) continue;
      return computer(state, owner);
    }
    // Windows that always ride a paired pendingChoice/tile choice (handled
    // above) but may momentarily stand alone between pumps: same rule.
    const pairedWindows: (PlayerId | null | undefined)[] = [
      adventure.pendingFarTileFlip?.playerId,
      adventure.pendingGarrison?.defenderPlayerId,
      adventure.pendingTokenTeleport?.playerId,
    ];
    for (const owner of pairedWindows) {
      if (!owner || !liveSeat(state, owner)) continue;
      return computer(state, owner);
    }
  }

  const lobby = state.setupLobby;
  if (state.phase === "setup" && lobby) {
    const phase = getDraftPhase(lobby);
    const banner = computer(state, phase.currentBannerPlayerId);
    if (banner) return banner;
    // Faction/town picks are contended (a taken faction is gone): the human
    // gets first dibs, so a bot never snipes the faction the human wanted.
    // Computers complete their seats only once every human seat has passed
    // the contended stage — the full pick in open/random/random-choice, the
    // town lock in draft (hero picks there come from each seat's own town).
    const humanSeats = lobby.seats.filter(
      (seat) =>
        seat.playerId !== NEUTRAL_PLAYER_ID &&
        controllerOf(state, seat.playerId).kind === "human",
    );
    const humansPicked = humanSeats.every((seat) =>
      phase.format === "draft"
        ? Boolean(seat.factionId)
        : Boolean(seat.factionId && seat.heroDefId),
    );
    if (!humansPicked) {
      return null;
    }
    for (const seat of lobby.seats) {
      if (seat.playerId === NEUTRAL_PLAYER_ID) continue;
      if (seat.factionId && seat.heroDefId) continue;
      // Draft format: a seat with a locked town can only act in its own ban
      // turn (handled above) or once the pick phase opens; in between it is
      // waiting on the other seats and owes nothing.
      if (phase.format === "draft" && seat.factionId && !phase.pickPhaseOpen) {
        continue;
      }
      const result = computer(state, seat.playerId);
      if (result) return result;
    }
    return null;
  }

  if (state.turn.mode === "parallel") {
    for (const playerId of state.turnOrder) {
      if (state.turn.completedPlayerIds.includes(playerId)) continue;
      // A bystander blocked by another seat's exclusive interaction has only
      // optional quiet actions — nothing a policy is required to take.
      if (parallelInteractionBlocker(state, playerId)) continue;
      const result = computer(state, playerId);
      if (result) return result;
    }
  } else {
    const activeOwner = computer(state, state.activePlayerId);
    if (activeOwner) return activeOwner;
  }

  return null;
}
