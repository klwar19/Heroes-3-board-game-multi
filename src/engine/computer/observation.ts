import { getLegalActions } from "../legal-actions";
import { getPlayerView } from "../player-view";
import type { GameState, PlayerId } from "../state";
import type { ComputerObservation } from "./types";

/**
 * The only supported input to strategy code. Legality is generated from the
 * authoritative state, while scoring sees the same redacted snapshot as the seat.
 */
export function observeForComputer(
  state: GameState,
  playerId: PlayerId,
): ComputerObservation {
  return {
    playerId,
    state: getPlayerView(state, playerId),
    legalActions: getLegalActions(state, playerId),
  };
}
