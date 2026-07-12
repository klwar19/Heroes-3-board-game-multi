"use client";

import type { ComputerBattleCue } from "./computer-battle-report";

/**
 * The single-player "opponents finished their turn" prompt. Their battles
 * already resolved off-screen (see settleComputerWork); this overlay reports
 * each win/loss and its reward, and — when they also moved on the map — gates
 * the slow, cell-by-cell movement replay behind an explicit "Watch their moves"
 * click, so nothing on the board animates before the human is ready. Pure
 * presentation: every value comes from the already-authoritative state.
 */
export type OpponentTurnOverlayProps = {
  cues: ComputerBattleCue[];
  /** True when the opponents also walked and a replay is queued. */
  hasReplay: boolean;
  /** Start the movement replay (only meaningful when hasReplay). */
  onWatch: () => void;
  /** Dismiss without watching (or when there is nothing to watch). */
  onDismiss: () => void;
};

function battleLine(cue: ComputerBattleCue): string {
  if (cue.won) {
    const verb = cue.quick ? "swept aside" : "defeated";
    return `${cue.playerName} ${verb} ${cue.opponentLabel}`;
  }
  return `${cue.playerName} was defeated by ${cue.opponentLabel}`;
}

export function OpponentTurnOverlay({
  cues,
  hasReplay,
  onWatch,
  onDismiss,
}: OpponentTurnOverlayProps) {
  return (
    <div className="opponentTurnBackdrop" role="dialog" aria-modal="true" aria-label="Opponents' turn">
      <div className="opponentTurnCard">
        <h2 className="opponentTurnTitle">Opponents’ turn</h2>
        {cues.length > 0 ? (
          <ul className="opponentTurnBattles">
            {cues.map((cue) => (
              <li
                key={cue.id}
                className={cue.won ? "opponentBattleWon" : "opponentBattleLost"}
              >
                <span className="opponentBattleIcon" aria-hidden="true">
                  {cue.won ? "⚔️" : "☠️"}
                </span>
                <span className="opponentBattleBody">
                  <span className="opponentBattleLine">{battleLine(cue)}</span>
                  {cue.rewardText ? (
                    <span className="opponentBattleReward">{cue.rewardText}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="opponentTurnNoBattles">Your opponents made their moves.</p>
        )}
        <div className="opponentTurnActions">
          {hasReplay ? (
            <>
              <button type="button" className="opponentTurnWatch" onClick={onWatch}>
                Watch their moves →
              </button>
              <button type="button" className="opponentTurnSkip" onClick={onDismiss}>
                Skip
              </button>
            </>
          ) : (
            <button type="button" className="opponentTurnWatch" onClick={onDismiss}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
