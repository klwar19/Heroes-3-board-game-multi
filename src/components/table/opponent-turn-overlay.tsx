"use client";

import type { ComputerBattleCue } from "./computer-battle-report";

/**
 * The single-player "opponents finished their turn" prompt. Their battles
 * already resolved off-screen; this overlay reports each win/loss and its
 * reward, and gates the cell-by-cell movement replay behind explicit Next /
 * Confirm presses so nothing on the board animates before the human is ready.
 * Pure presentation: every value comes from the already-authoritative state.
 */
export type OpponentTurnOverlayProps = {
  cues: ComputerBattleCue[];
  /** True when the opponents also walked and a replay is queued / in progress. */
  hasReplay: boolean;
  /**
   * Replay phase:
   * - idle: not started (Watch / Start)
   * - stepping: frames remain (Next)
   * - done: last cell shown (Confirm)
   */
  replayPhase?: "idle" | "stepping" | "done";
  /** Remaining map steps after the current pawn position. */
  remainingSteps?: number;
  /** Start the movement replay (idle → first hold). */
  onWatch: () => void;
  /** Advance one cell of the walk. */
  onStepNext?: () => void;
  /** Finish / dismiss (confirm after walk, or skip). */
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
  replayPhase = "idle",
  remainingSteps = 0,
  onWatch,
  onStepNext,
  onDismiss,
}: OpponentTurnOverlayProps) {
  const phase = hasReplay ? replayPhase : "idle";

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
          <p className="opponentTurnNoBattles">
            {phase === "stepping" || phase === "done"
              ? "Watching opponent moves…"
              : "Your opponents made their moves."}
          </p>
        )}
        <div className="opponentTurnActions">
          {!hasReplay ? (
            <button type="button" className="opponentTurnWatch" onClick={onDismiss}>
              Continue
            </button>
          ) : phase === "idle" ? (
            <>
              <button type="button" className="opponentTurnWatch" onClick={onWatch}>
                Watch moves (step by step) →
              </button>
              <button type="button" className="opponentTurnSkip" onClick={onDismiss}>
                Skip
              </button>
            </>
          ) : phase === "stepping" ? (
            <>
              <button
                type="button"
                className="opponentTurnWatch"
                onClick={onStepNext}
              >
                Next step
                {remainingSteps > 0 ? ` (${remainingSteps} left)` : ""} →
              </button>
              <button type="button" className="opponentTurnSkip" onClick={onDismiss}>
                Skip to end
              </button>
            </>
          ) : (
            <button type="button" className="opponentTurnWatch" onClick={onDismiss}>
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
