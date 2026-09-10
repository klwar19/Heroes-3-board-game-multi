import {
  hasOpenAdventureTurn,
  isRoundStartEventBarrierActive,
  parallelInteractionBlocker,
  parallelWaitMessage,
  roundStartEventResolver
} from "./parallel-turns";
import type { GameState, PlayerId } from "./state";

/** Shared timing gate for the grade picker, legal offers and authoritative handler. */
export function heroGradePickBlockReason(state: GameState, playerId: PlayerId): string | null {
  if (state.combat) return "Finish combat before spending Hero Grade points.";
  if (!hasOpenAdventureTurn(state, playerId)) return "Spend Hero Grade points on your own map turn.";
  const resolver = roundStartEventResolver(state);
  if (isRoundStartEventBarrierActive(state) && resolver && resolver !== playerId) {
    return "Wait until every player has resolved the round's Event before spending Hero Grade points.";
  }
  const blocker = parallelInteractionBlocker(state, playerId);
  return blocker ? parallelWaitMessage(state, blocker) : null;
}
