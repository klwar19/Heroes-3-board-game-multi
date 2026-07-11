import { getDraftPhase } from "../adventure-setup";
import { roundStartEventResolver } from "../parallel-turns";
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
 */
export function computerDecisionOwner(state: GameState): PlayerId | null {
  if (state.phase === "game-over") {
    return null;
  }

  const choiceOwner = computer(state, state.pendingChoice?.playerId);
  if (choiceOwner) return choiceOwner;

  const reactionOwner = computer(state, state.reactionWindow?.priorityPlayerId);
  if (reactionOwner) return reactionOwner;

  const eventOwner = computer(state, roundStartEventResolver(state));
  if (eventOwner) return eventOwner;

  const adventure = state.adventure;
  const interactionOwners = [
    adventure?.pendingVisit?.playerId,
    adventure?.pendingTileChoice?.playerId,
    adventure?.pendingNecromancy?.playerId,
    adventure?.pendingFarTileFlip?.playerId,
    adventure?.pendingGarrison?.defenderPlayerId,
    adventure?.pendingTokenTeleport?.playerId,
  ];
  for (const owner of interactionOwners) {
    const result = computer(state, owner);
    if (result) return result;
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

    if (combat.outcome && !combat.endAcknowledged) {
      return (
        computer(state, combat.attackerPlayerId) ??
        computer(state, combat.defenderPlayerId)
      );
    }
  }

  if (state.turn.mode === "parallel") {
    for (const playerId of state.turnOrder) {
      if (!state.turn.completedPlayerIds.includes(playerId)) {
        const result = computer(state, playerId);
        if (result) return result;
      }
    }
  } else {
    const activeOwner = computer(state, state.activePlayerId);
    if (activeOwner) return activeOwner;
  }

  const lobby = state.setupLobby;
  if (state.phase === "setup" && lobby) {
    const phase = getDraftPhase(lobby);
    const banner = computer(state, phase.currentBannerPlayerId);
    if (banner) return banner;
    for (const seat of lobby.seats) {
      if (
        (!seat.factionId || !seat.heroDefId) &&
        seat.playerId !== NEUTRAL_PLAYER_ID
      ) {
        const result = computer(state, seat.playerId);
        if (result) return result;
      }
    }
  }

  return null;
}
