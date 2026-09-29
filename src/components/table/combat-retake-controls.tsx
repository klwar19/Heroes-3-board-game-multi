import type { GameAction, GameState, PlayerId } from "@/engine";
import { combatRetakeAvailable, combatRetakeParticipants } from "@/engine/combat-retake";
import { UndoButton } from "./undo-button";

export function CombatRetakeControls({ state, viewerPlayerId, onAction }: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  if (!combatRetakeParticipants(state).includes(viewerPlayerId)) return null;
  const vote = state.combatRetakeVote;
  if (vote) return (
    <div role="group" aria-label="Combat turn retake" className="undoVoteGroup">
      <span>{state.players[vote.requestedBy]?.name} requested a turn retake. </span>
      {vote.opponentId === viewerPlayerId ? <>
        <button type="button" className="commandButton" onClick={() => onAction({ type: "ANSWER_COMBAT_RETAKE", playerId: viewerPlayerId, agree: true })}>Agree: retake turn</button>
        <button type="button" className="commandButton" onClick={() => onAction({ type: "ANSWER_COMBAT_RETAKE", playerId: viewerPlayerId, agree: false })}>Decline</button>
      </> : <button type="button" className="commandButton" onClick={() => onAction({ type: "ANSWER_COMBAT_RETAKE", playerId: viewerPlayerId, agree: false })}>Cancel request</button>}
    </div>
  );
  const available = state.combatRetakeAvailable ?? combatRetakeAvailable(state);
  // Shared undo look (undo-button.tsx); behaviour unchanged — the request
  // still needs the other combat participant's agreement.
  return <UndoButton label="Request turn retake"
    disabledReason={available ? null : "A retake becomes available after the first combat action is saved."}
    title="Restart this unit's activation only if the other combat participant agrees."
    onClick={() => onAction({ type: "REQUEST_COMBAT_RETAKE", playerId: viewerPlayerId })} />;
}
