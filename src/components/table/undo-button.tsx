"use client";

import { Undo2 } from "lucide-react";
import {
  DUEL_UNDO_RULE_TEXT,
  duelUndoButtonState,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";

/**
 * ONE look for every undo-style control in the app (testing "Undo moves",
 * the 1v1 Undo, the combat turn retake request, the map editor's undo): the
 * same command-button chrome, the same ↶ icon, the same label placement, a
 * real `disabled` state whose REASON is the tooltip, and an optional step
 * count. Purely presentational — each caller keeps its own action/behaviour.
 */
export function UndoButton({
  label = "Undo",
  onClick,
  disabledReason = null,
  title,
  className,
  count,
  ariaLabel
}: {
  label?: string;
  onClick: () => void;
  /** Non-null disables the button; the reason becomes its tooltip. */
  disabledReason?: string | null;
  /** Tooltip while enabled (what the undo does / its rule). */
  title?: string;
  /** Extra classes (layout hooks such as `combatUndoMove`). */
  className?: string;
  /** Steps available (shown as ×N when more than one). */
  count?: number;
  ariaLabel?: string;
}) {
  const disabled = Boolean(disabledReason);
  return (
    <button
      aria-label={ariaLabel}
      className={`commandButton undoControl${className ? ` ${className}` : ""}`}
      data-disabled-reason={disabledReason ?? undefined}
      disabled={disabled}
      onClick={onClick}
      title={disabledReason ?? title}
      type="button"
    >
      <Undo2 aria-hidden="true" className="undoControlIcon" size={13} />
      <span className="undoControlLabel">{label}</span>
      {count !== undefined && count > 1 ? (
        <span aria-hidden="true" className="undoControlCount">
          ×{count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The 1v1 Undo button (`adventure.duelUndo`). Renders nothing unless the
 * option is on and the viewer holds one of the two seats; otherwise it is
 * always visible, disabled with the precise reason (opponent's move, a die
 * roll or reveal locked it, ranked table…) whenever an undo is not possible.
 * The server re-checks everything (src/server/undo-history.ts).
 */
export function DuelUndoButton({
  state,
  viewerPlayerId,
  onAction,
  className
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  className?: string;
}) {
  const view = duelUndoButtonState(state, viewerPlayerId);
  if (!view.visible) {
    return null;
  }
  return (
    <UndoButton
      className={className ? `duelUndo ${className}` : "duelUndo"}
      count={view.depth}
      disabledReason={view.disabledReason}
      onClick={() => onAction({ type: "UNDO_MOVE", playerId: viewerPlayerId })}
      title={`Take back your last move. ${DUEL_UNDO_RULE_TEXT}`}
    />
  );
}
