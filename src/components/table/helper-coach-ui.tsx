"use client";

/**
 * On-screen helper coach UI:
 *  - Lobby opt-in/out popup (asked once until the player chooses)
 *  - Floating next-step panel (center of screen, draggable, blinks for attention)
 *  - Compact "Show tips" chip when tips are OFF so veterans can re-enable
 */
import { CircleHelp, Eye, EyeOff, GripHorizontal, Lightbulb, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  useHelperCoachPreference,
  type HelperCoachPreference
} from "@/lib/helper-coach-preference";
import { buildCoachTip, type CoachTip } from "./helper-coach";
import type { GameState, LegalAction, PlayerId } from "@/engine";

const POSITION_KEY = "binh-helper-coach-pos";

type PanelPos = { x: number; y: number };

function readSavedPos(): PanelPos | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(POSITION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PanelPos;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number" && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function savePos(pos: PanelPos): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

/** Center of the viewport, in fixed-pixel coordinates (top-left of panel). */
function defaultCenterPos(panelWidth: number, panelHeight: number): PanelPos {
  if (typeof window === "undefined") {
    return { x: 80, y: 160 };
  }
  return {
    x: Math.max(12, (window.innerWidth - panelWidth) / 2),
    y: Math.max(12, (window.innerHeight - panelHeight) / 2)
  };
}

function clampPos(pos: PanelPos, width: number, height: number): PanelPos {
  if (typeof window === "undefined") {
    return pos;
  }
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - height - 8);
  return {
    x: Math.min(maxX, Math.max(8, pos.x)),
    y: Math.min(maxY, Math.max(8, pos.y))
  };
}

export function HelperCoachLobbyPrompt({
  /** When true, also show if preference is already set (re-open from a button). */
  force = false,
  onClose
}: {
  force?: boolean;
  onClose?: () => void;
}) {
  const { preference, setPreference, ready } = useHelperCoachPreference();

  if (!ready) {
    return null;
  }
  if (!force && preference !== null) {
    return null;
  }

  const choose = (value: HelperCoachPreference) => {
    setPreference(value);
    onClose?.();
  };

  return (
    <div
      className="helperCoachBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="On-screen helper tips"
      onMouseDown={(event) => {
        // Clicking the backdrop does NOT dismiss without a choice — force a pick.
        event.stopPropagation();
      }}
    >
      <section className="helperCoachCard" onMouseDown={(event) => event.stopPropagation()}>
        <div className="helperCoachCardIcon" aria-hidden="true">
          <Lightbulb size={28} />
        </div>
        <div className="helperCoachCardBody">
          <span className="helperCoachEyebrow">New to the table?</span>
          <h2 className="helperCoachTitle">On-screen helper tips</h2>
          <p className="helperCoachLede">
            When tips are on, a short panel tells you <strong>what to do next</strong>, and cards you
            cannot play show <strong>why</strong> (wrong phase, spell limit, not your turn…). Drag the
            panel anywhere; hide it anytime.
          </p>
          <ul className="helperCoachList">
            <li>Next-step coach on the map and in combat</li>
            <li>Plain-language reasons on greyed-out hand cards</li>
            <li>You can turn tips off anytime from the panel</li>
          </ul>
          <div className="helperCoachActions">
            <button className="helperCoachPrimary" onClick={() => choose("on")} type="button">
              <Eye size={15} aria-hidden="true" /> Keep tips on
            </button>
            <button className="helperCoachSecondary" onClick={() => choose("off")} type="button">
              <EyeOff size={15} aria-hidden="true" /> Turn tips off
            </button>
          </div>
          <small className="helperCoachFoot">Your choice is saved in this browser. Change it later from the tips panel.</small>
        </div>
      </section>
    </div>
  );
}

export function HelperCoachStrip({
  state,
  viewerPlayerId,
  legalActions
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
}) {
  const { enabled, preference, setPreference, ready } = useHelperCoachPreference();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const tip: CoachTip | null = useMemo(() => {
    if (!ready || !enabled) {
      return null;
    }
    return buildCoachTip(state, viewerPlayerId, legalActions);
  }, [ready, enabled, state, viewerPlayerId, legalActions]);

  // Place in the center (or restore last drag) once the panel exists.
  useEffect(() => {
    if (!ready || !enabled || !tip) {
      return;
    }
    const el = panelRef.current;
    const width = el?.offsetWidth ?? 420;
    const height = el?.offsetHeight ?? 110;
    const saved = readSavedPos();
    setPos(clampPos(saved ?? defaultCenterPos(width, height), width, height));
  }, [ready, enabled, tip?.id]);

  // Keep on-screen if the window is resized.
  useEffect(() => {
    if (!pos) {
      return;
    }
    const onResize = () => {
      const el = panelRef.current;
      const width = el?.offsetWidth ?? 420;
      const height = el?.offsetHeight ?? 110;
      setPos((current) => (current ? clampPos(current, width, height) : current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  const onDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Only primary button / touch; ignore Hide tips clicks (they are not on the handle).
      if (event.button !== 0) {
        return;
      }
      const el = panelRef.current;
      if (!el || !pos) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      el.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pos.x,
        originY: pos.y
      };
      setDragging(true);
    },
    [pos]
  );

  const onDragPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const el = panelRef.current;
    const width = el?.offsetWidth ?? 420;
    const height = el?.offsetHeight ?? 110;
    const next = clampPos(
      {
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY)
      },
      width,
      height
    );
    setPos(next);
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    try {
      panelRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    setPos((current) => {
      if (current) {
        savePos(current);
      }
      return current;
    });
  }, []);

  if (!ready) {
    return null;
  }

  // Tips off: fixed chip so players can turn them back on.
  if (preference === "off") {
    return (
      <div className="helperCoachChip" role="status">
        <button
          className="helperCoachChipButton"
          onClick={() => setPreference("on")}
          title="Show next-step tips and card reasons"
          type="button"
        >
          <CircleHelp size={13} aria-hidden="true" />
          Tips off — click to show
        </button>
      </div>
    );
  }

  // Unset: lobby prompt owns the decision; no strip yet.
  if (!enabled || !tip) {
    return null;
  }

  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, transform: "none" }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      ref={panelRef}
      className={`helperCoachStrip tone-${tip.tone} ${dragging ? "dragging" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Helper tip: ${tip.headline}`}
      style={style}
      onPointerMove={onDragPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <button
        type="button"
        className="helperCoachDragHandle"
        aria-label="Drag helper tip"
        title="Drag to move"
        onPointerDown={onDragPointerDown}
      >
        <GripHorizontal size={16} aria-hidden="true" />
        <span>Drag</span>
      </button>
      <span className="helperCoachStripIcon" aria-hidden="true">
        <Lightbulb size={18} />
      </span>
      <div className="helperCoachStripText">
        <span className="helperCoachStripLabel">Next step</span>
        <strong>{tip.headline}</strong>
        <small>{tip.detail}</small>
      </div>
      <button
        className="helperCoachStripHide"
        onClick={() => setPreference("off")}
        title="Hide helper tips (you can turn them back on anytime)"
        type="button"
      >
        <X size={14} aria-hidden="true" />
        <span>Hide tips</span>
      </button>
    </div>
  );
}

/** Hook for child components that only need the enabled flag. */
export { useHelperCoachPreference };
