import type { GamePhase, GameState } from "./state";

/**
 * The phase a NEW pending choice must return to.
 *
 * A choice can open while another choice is still resolving (a Genie deck draw
 * picks a target, and resolving that target triggers a battlefield token that
 * opens an option choice). At that moment `state.phase` is still "choice", so
 * recording it as the return phase would strand the table in "choice" with no
 * pending choice once the inner choice resolves — the seat then only sees map
 * actions the reducer refuses mid-fight ("Finish the current combat first").
 * Inherit the OUTER choice's return phase instead; without one, fall back on
 * the fight that is open.
 */
export function choiceReturnPhase(state: GameState): GamePhase {
  if (state.phase !== "choice") return state.phase;
  // Not every pending-choice variant carries a return phase (dice rerolls do not).
  const outer = (state.pendingChoice as { returnPhase?: GamePhase } | null | undefined)?.returnPhase;
  if (outer && outer !== "choice") return outer;
  return state.combat && !state.combat.outcome ? "combat" : "player-turn";
}

/**
 * Safety net for the same defect class from any other creator: a table in
 * phase "choice" with no pending choice while a fight is mid-activation is
 * unplayable (combat actions are gated on the combat phase, map actions are
 * refused). Restore the combat phase. Returns whether a repair happened.
 */
export function repairOrphanedChoicePhase(state: GameState): boolean {
  if (state.phase !== "choice" || state.pendingChoice) return false;
  const combat = state.combat;
  if (!combat || combat.outcome || !combat.activeUnitId) return false;
  state.phase = "combat";
  return true;
}
