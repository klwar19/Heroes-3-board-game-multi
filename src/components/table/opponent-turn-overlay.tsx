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
  /** Disable computer-step confirmations for the rest of this match. */
  onSkipConfirmations?: () => void;
};

/**
 * Is the computer-turn recap allowed to be the BLOCKING modal below?
 *
 * USER RULE 2026-09-04, reported from a 1 v 1 + 2 AI multiplayer Clash: "note
 * about AI — not needed, and hides important areas". `.opponentTurnBackdrop`
 * is `position: absolute; inset: 0` over the map stage; it exists to gate the
 * single-player movement REPLAY behind Next / Confirm. On a multiplayer table
 * it had no replay to gate, never auto-dismissed (the auto-recap timer is
 * single-player-only) and its "Skip confirmations" button was a no-op — so it
 * covered the map after every AI battle while the other human was still
 * playing. Multiplayer gets {@link ComputerBattleChip} instead.
 */
export function computerRecapIsBlocking(sessionMode: string | undefined): boolean {
  return sessionMode === "single-player";
}

/**
 * The multiplayer AI battle recap: a small non-covering status pill (no
 * backdrop, no buttons, `pointer-events: none` in CSS), auto-dismissed by the
 * page. It reports the same battle lines the modal did.
 */
export function ComputerBattleChip({ cues }: { cues: ComputerBattleCue[] }) {
  if (cues.length === 0) {
    return null;
  }
  return (
    <div className="computerBattleChip" role="status">
      {cues.map((cue) => (
        <span className="computerBattleChipLine" key={cue.id}>
          <span aria-hidden="true">{cue.won ? "⚔️" : "☠️"}</span> {battleLine(cue)}
        </span>
      ))}
    </div>
  );
}

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
  onSkipConfirmations,
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
            <>
              <button type="button" className="opponentTurnWatch" onClick={onDismiss}>
                Continue
              </button>
              {onSkipConfirmations ? (
                <button type="button" className="opponentTurnSkip" onClick={onSkipConfirmations}>
                  Auto-play this game
                </button>
              ) : null}
            </>
          ) : phase === "idle" ? (
            <>
              <button type="button" className="opponentTurnWatch" onClick={onWatch}>
                Watch moves (step by step) →
              </button>
              <button
                type="button"
                className="opponentTurnSkip"
                onClick={onSkipConfirmations ?? onDismiss}
              >
                Skip confirmations
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
              <button
                type="button"
                className="opponentTurnSkip"
                onClick={onSkipConfirmations ?? onDismiss}
              >
                Skip confirmations
              </button>
            </>
          ) : (
            <>
              <button type="button" className="opponentTurnWatch" onClick={onDismiss}>
                Confirm
              </button>
              {onSkipConfirmations ? (
                <button type="button" className="opponentTurnSkip" onClick={onSkipConfirmations}>
                  Auto-play this game
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
