"use client";

import type { GameAction, LegalAction } from "@/engine";

/**
 * Morale overflow is mandatory, but it cannot interrupt an exclusive engine
 * choice (map-spell Power, Search, a reaction window, and so on). Render only
 * the spend actions the engine currently exposes; once the exclusive choice
 * closes, the normal legal-action list makes this prompt reappear.
 */
export function MoraleOverflowPrompt({
  count,
  legalActions,
  onDraw,
  onRedraw,
  variant = "modal"
}: {
  count: number;
  legalActions: LegalAction[];
  onDraw: (action: Extract<GameAction, { type: "SPEND_MORALE" }>) => void;
  onRedraw: (action: Extract<GameAction, { type: "SPEND_MORALE" }>) => void;
  /**
   * "modal" (default): the full centered dialog used in combat. "map": a
   * compact, non-blocking vertical box anchored to the right of the Far-tile
   * tray, so the mandatory spend never covers the whole map.
   */
  variant?: "modal" | "map";
}) {
  if (count <= 0) {
    return null;
  }

  const draw = legalActions.find(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "SPEND_MORALE" }> } =>
      legal.action.type === "SPEND_MORALE" && legal.action.benefit === "draw"
  )?.action;
  const redraw = legalActions.find(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "SPEND_MORALE" }> } =>
      legal.action.type === "SPEND_MORALE" && legal.action.benefit === "redraw"
  )?.action;

  // An exclusive choice owns the interaction slot. Its legal actions contain
  // no morale spend, so stay out of its way instead of showing dead buttons.
  if (!draw && !redraw) {
    return null;
  }

  const buttons = (
    <div className="handButtons">
      {draw ? (
        <button className="commandButton primary" onClick={() => onDraw(draw)} type="button">
          Draw a card
        </button>
      ) : null}
      {redraw ? (
        <button className="commandButton" onClick={() => onRedraw(redraw)} type="button">
          Discard &amp; draw
        </button>
      ) : null}
    </div>
  );

  if (variant === "map") {
    return (
      <div className="moraleOverflowMap" role="dialog" aria-label="Spend extra morale">
        <strong>Morale maxed (+1)</strong>
        <p>+{count} positive morale — spend it now.</p>
        {buttons}
      </div>
    );
  }

  return (
    <div className="moraleOverflowBackdrop" role="dialog" aria-modal="true" aria-label="Spend extra morale">
      <div className="moraleOverflowPopup">
        <strong>Morale is already at its maximum (+1)</strong>
        <p>
          You gained {count} more positive morale token{count === 1 ? "" : "s"}. It cannot be stored — spend it now.
        </p>
        {buttons}
      </div>
    </div>
  );
}
