import { getLegalActions } from "../legal-actions";
import { getPlayerView } from "../player-view";
import type { GameState, PlayerId } from "../state";
import { getComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";

/**
 * The only supported input to strategy code. Legality is generated from the
 * authoritative state, while scoring sees the same redacted snapshot as the seat.
 * Policy memory is this seat's own notes (not opponent-visible).
 */
export function observeForComputer(
  state: GameState,
  playerId: PlayerId,
): ComputerObservation {
  return {
    playerId,
    state: getPlayerView(state, playerId),
    legalActions: getLegalActions(state, playerId),
    memory: getComputerMemory(state, playerId),
  };
}
