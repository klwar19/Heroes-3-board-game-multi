import { getDraftPhase } from "../adventure-setup";
import {
  isRoundStartEventBarrierActive,
  parallelInteractionBlocker,
  roundStartEventResolver,
} from "../parallel-turns";
import { NEUTRAL_PLAYER_ID } from "../state";
import type { GameState, PlayerId } from "../state";
import { isComputerPlayer } from "./control";

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
 */
export function computerDecisionOwner(state: GameState): PlayerId | null {
  if (state.phase === "game-over") {
    return null;
  }

  if (state.pendingChoice) {
    return computer(state, state.pendingChoice.playerId);
  }
  if (state.reactionWindow) {
    return computer(state, state.reactionWindow.priorityPlayerId);
  }
  // Round-start Event/Astrologers barrier: the resolver is the ONLY seat that
  // may act at the whole table until the barrier lifts.
  if (isRoundStartEventBarrierActive(state)) {
    return computer(state, roundStartEventResolver(state));
  }

  const adventure = state.adventure;
  const interactionOwners = [
    adventure?.pendingVisit?.playerId,
    adventure?.pendingTileChoice?.playerId,
    adventure?.pendingNecromancy?.playerId,
    adventure?.pendingFarTileFlip?.playerId,
    adventure?.pendingGarrison?.defenderPlayerId,
    adventure?.pendingTokenTeleport?.playerId,
  ].filter((owner): owner is PlayerId => Boolean(owner));
  for (const owner of interactionOwners) {
    const result = computer(state, owner);
    if (result) return result;
  }
  if (interactionOwners.length > 0) {
    // A human-owned exclusive map interaction: everyone else waits.
    return null;
  }

  const combat = state.combat;
  if (combat) {
    const pausedOwner = computer(
      state,
      combat.pendingNeutralStep?.reactingPlayerId,
    );
    if (pausedOwner) return pausedOwner;

    for (const owner of combat.pendingCoverOfDarkness ?? []) {
      const result = computer(state, owner);
      if (result) return result;
    }
    for (const owner of combat.pendingShackles ?? []) {
      const result = computer(state, owner);
      if (result) return result;
    }
    if (combat.prep) {
      for (const owner of [combat.attackerPlayerId, combat.defenderPlayerId]) {
        if (!combat.prep.accepted.includes(owner)) {
          const result = computer(state, owner);
          if (result) return result;
        }
      }
    }
    const placementOwner = computer(state, combat.setup?.pendingPlayerIds[0]);
    if (placementOwner) return placementOwner;

    const tacticsOwner = computer(state, combat.pendingTacticsSwaps?.[0]);
    if (tacticsOwner) return tacticsOwner;

    const activeController = combat.activeUnitId
      ? combat.units[combat.activeUnitId]?.controllerId
      : null;
    const activeOwner = computer(state, activeController);
    if (activeOwner) return activeOwner;

    // The neutral-combat continue-or-retreat window belongs to the attacking
    // fighter (a neutral fight's attacker is always the player seat).
    if (combat.awaitingContinue) {
      return computer(state, combat.attackerPlayerId);
    }

    if (combat.outcome && !combat.endAcknowledged) {
      return (
        computer(state, combat.attackerPlayerId) ??
        computer(state, combat.defenderPlayerId)
      );
    }

    // An open combat is an exclusive interaction: while no computer-owned slot
    // inside it is required, every seat (fighters and bystanders alike) waits.
    return null;
  }

  const lobby = state.setupLobby;
  if (state.phase === "setup" && lobby) {
    const phase = getDraftPhase(lobby);
    const banner = computer(state, phase.currentBannerPlayerId);
    if (banner) return banner;
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
