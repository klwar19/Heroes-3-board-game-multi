import { isFieldGuarded } from "../adventure";
import type { GameState, LegalAction, PlayerId } from "../state";
import { canBeatGuardedField, distanceFromHeroTo } from "./map-navigation";
import { getComputerMemory, writeComputerMemory } from "./memory";
import { observeForComputer } from "./observation";
import { chooseComputerAction } from "./policy";
import { hasCommittedIncomeRoute } from "./premium-approach";
import type { ComputerDecision } from "./types";

/** Re-score a stale destination before wasting a turn, without erasing lessons. */
export function reconsiderComputerPlan(
  state: GameState,
  playerId: PlayerId,
  available: LegalAction[],
  decision: ComputerDecision | null,
): { state: GameState; decision: ComputerDecision } | null {
  if (state.combat || !state.adventure ||
      (decision && decision.action.type !== "END_TURN" &&
        decision.action.type !== "COMPLETE_SIMULTANEOUS_TURN")) return null;
  const memory = getComputerMemory(state, playerId);
  if (!memory.stickyObjectiveSpaceId) return null;
  const heroes = Object.values(state.heroes).filter(hero => hero.controllerId === playerId);
  // Waiting for renewed movement to take an income guard is deliberate.
  if (heroes.some(hero => hasCommittedIncomeRoute(state, hero.id, memory))) return null;
  // The same holds for ANY staged guarded target (creature bank, ordinary
  // mine): an END_TURN reserving next turn's attack budget for a beatable,
  // reachable sticky fight is not a stale plan to clear.
  const stickyField = state.adventure.fields[memory.stickyObjectiveSpaceId];
  if (stickyField && isFieldGuarded(stickyField) &&
      heroes.some(hero => hero.spaceId && canBeatGuardedField(state, hero, stickyField) &&
        distanceFromHeroTo(state, hero, memory.stickyObjectiveSpaceId!, true) !== undefined)) return null;
  if (!heroes.some(hero => hero.movementPoints > 0)) return null;

  const reconsidered = writeComputerMemory(state, playerId, {
    ...memory,
    stickyObjectiveSpaceId: null,
    stickySinceRound: state.round,
  });
  // Keep failed-fight, route, visit, market and spending memory. Regenerate the
  // seat view too: some scorers read memory from state rather than observation.
  const candidate = chooseComputerAction({
    ...observeForComputer(reconsidered, playerId),
    legalActions: available,
  });
  if (!candidate || candidate.score <= Math.max(300, decision?.score ?? 300) ||
      candidate.action.type === "END_TURN" ||
      candidate.action.type === "COMPLETE_SIMULTANEOUS_TURN") return null;
  return {
    state: reconsidered,
    decision: { ...candidate, policy: `recovery.reconsider:${candidate.policy}` },
  };
}
