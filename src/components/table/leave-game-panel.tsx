"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { isComputerPlayer, NEUTRAL_PLAYER_ID, type GameAction, type GameState, type PlayerId } from "@/engine";

/**
 * Multiplayer "Leave game" + the departure vote it opens (LEAVE_GAME /
 * CAST_AFK_VOTE, src/engine/afk.ts).
 *
 * A player who has to go mid-adventure presses Leave game (two-step confirm).
 * The remaining live HUMAN seats then vote between:
 *  - "Remove player": the seat is removed through the same force-drop a
 *    passed AFK kick uses (open choices default-resolved, an open battle
 *    conceded, then eliminated like a give-up). Needs EVERY voter's vote —
 *    the existing kick rule.
 *  - "AI takes over": a computer player plays the seat from that moment on.
 *    Needs every player's vote, like Remove; a split stays open and voters
 *    may change their answer until the table agrees.
 * Unlike the AFK vote this runs on OPEN and hosted tables alike. The leaver
 * taking any game action before the vote resolves withdraws it (they stayed).
 */

/** Live human seats other than `exceptId` — the departure vote's voters. */
function humanVoters(state: GameState, exceptId: PlayerId): PlayerId[] {
  return state.turnOrder.filter(
    (seat) =>
      seat !== NEUTRAL_PLAYER_ID &&
      seat !== exceptId &&
      !state.players[seat]?.eliminated &&
      !isComputerPlayer(state, seat)
  );
}

/**
 * Why the viewer may NOT press Leave game right now, or null when they may
 * (mirrors the engine's leaveGame legality; the server re-checks on submit).
 */
export function leaveGameBlockReason(state: GameState, viewerPlayerId: PlayerId): string | null {
  if (state.sessionMode === "single-player") return "Single-player games have no table to hand the seat to.";
  if (state.mode !== "adventure" || !state.adventure || state.setupLobby) return "The adventure has not started.";
  if (state.adventure.winnerPlayerId) return "The game is over.";
  const player = state.players[viewerPlayerId];
  if (!player || player.eliminated || !state.turnOrder.includes(viewerPlayerId)) return "You are not playing a seat.";
  if (isComputerPlayer(state, viewerPlayerId)) return "That seat is played by the computer.";
  if (state.afk?.droppingPlayerId) return "A player is being removed — try again in a moment.";
  const vote = state.afk?.vote;
  if (vote && vote.targetPlayerId !== viewerPlayerId) return "Another vote is open — wait for it to finish.";
  if (vote?.kind === "left") return "You already asked to leave — the table is voting.";
  return null;
}

export function LeaveGameButton({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (state.sessionMode === "single-player" || state.mode !== "adventure" || state.setupLobby) {
    return null;
  }
  const player = state.players[viewerPlayerId];
  if (!player || player.eliminated || !state.turnOrder.includes(viewerPlayerId) || isComputerPlayer(state, viewerPlayerId)) {
    return null;
  }
  const blocked = leaveGameBlockReason(state, viewerPlayerId);
  const voters = humanVoters(state, viewerPlayerId).length;
  if (confirming && !blocked) {
    return (
      <>
        <button
          className="commandButton danger"
          type="button"
          title={
            voters > 0
              ? "The other players vote: remove your seat, or let the computer play it from now on."
              : "No other human player remains — your seat is removed."
          }
          onClick={() => {
            setConfirming(false);
            onAction({ type: "LEAVE_GAME", playerId: viewerPlayerId });
          }}
        >
          Confirm: leave game
        </button>
        <button className="commandButton" type="button" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </>
    );
  }
  return (
    <button
      className="commandButton"
      type="button"
      disabled={Boolean(blocked)}
      title={
        blocked ??
        "Leave this game now. The other players vote to remove your seat or to let the computer take it over."
      }
      onClick={() => setConfirming(true)}
    >
      <LogOut aria-hidden="true" size={12} /> Leave game
    </button>
  );
}

export function LeaveGameVotePanel({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const vote = state.afk?.vote;
  if (!vote || vote.kind !== "left" || state.mode !== "adventure") {
    return null;
  }
  const targetName = state.players[vote.targetPlayerId]?.name ?? vote.targetPlayerId;
  const voters = humanVoters(state, vote.targetPlayerId);
  const removes = voters.filter((seat) => vote.votes[seat] === "kick").length;
  const takeovers = voters.filter((seat) => vote.votes[seat] === "ai").length;
  const myVote = vote.votes[viewerPlayerId];
  // Everyone must agree on ONE outcome: once all have voted and the table is
  // split, voters may change their answer.
  const split = removes + takeovers === voters.length && removes > 0 && takeovers > 0;
  const canVote = voters.includes(viewerPlayerId) && (!myVote || split);
  const tally = `${removes + takeovers}/${voters.length} voted · ${removes} remove · ${takeovers} AI`;
  return (
    <div className="afkVotePanel leaveGameVotePanel" role="dialog" aria-label="Player leaving vote">
      <LogOut aria-hidden="true" size={14} />
      <span>
        <strong>{targetName}</strong> has to leave the game. Remove their seat, or let the computer take over from
        now on? <small>({tally})</small>
        <br />
        <small>
          Both choices need every player&apos;s vote.
          {split ? " The table is split — change your vote to agree." : ""}
        </small>
      </span>
      {canVote ? (
        <span className="afkVoteButtons">
          <button
            className="commandButton danger"
            type="button"
            onClick={() => onAction({ type: "CAST_AFK_VOTE", playerId: viewerPlayerId, vote: "kick" })}
          >
            Remove player
          </button>
          <button
            className="commandButton"
            type="button"
            onClick={() => onAction({ type: "CAST_AFK_VOTE", playerId: viewerPlayerId, vote: "ai" })}
          >
            AI takes over
          </button>
        </span>
      ) : (
        <span className="afkVoteWaiting">
          {viewerPlayerId === vote.targetPlayerId
            ? "the table is deciding — take any game action to stay instead"
            : myVote
              ? `you voted ${myVote === "ai" ? "AI takes over" : "remove"} — waiting for the others…`
              : "the remaining players are voting…"}
        </span>
      )}
    </div>
  );
}
