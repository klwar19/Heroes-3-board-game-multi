import type { GameAction, GameState, PlayerId } from "@/engine";
import { combatRetakeParticipants } from "@/engine/combat-retake";

export function CombatRetakeControls({ state, viewerPlayerId, onAction }: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  if (!combatRetakeParticipants(state).includes(viewerPlayerId)) return null;
  const vote = state.combatRetakeVote;
  if (vote) return (
    <div role="group" aria-label="Combat turn retake">
      <span>{state.players[vote.requestedBy]?.name} requested a turn retake. </span>
      {vote.opponentId === viewerPlayerId ? <>
        <button type="button" onClick={() => onAction({ type: "ANSWER_COMBAT_RETAKE", playerId: viewerPlayerId, agree: true })}>Agree: retake turn</button>
        <button type="button" onClick={() => onAction({ type: "ANSWER_COMBAT_RETAKE", playerId: viewerPlayerId, agree: false })}>Decline</button>
      </> : <button type="button" onClick={() => onAction({ type: "ANSWER_COMBAT_RETAKE", playerId: viewerPlayerId, agree: false })}>Cancel request</button>}
    </div>
  );
  return <button type="button" className="commandButton" title="Restart this unit's activation only if the other combat participant agrees."
    onClick={() => onAction({ type: "REQUEST_COMBAT_RETAKE", playerId: viewerPlayerId })}>Request turn retake</button>;
}
