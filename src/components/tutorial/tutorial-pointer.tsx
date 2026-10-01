"use client";

import { useEffect, useState } from "react";
import css from "./tutorial-coach.module.css";

type Box = { left: number; top: number; width: number; height: number; aimX: number; aimY: number };

/** Floating panels that can sit on top of a target (their close/minimize buttons are fallback targets). */
const COVERING_PANELS =
  ".cardGamesNotice, .merchantNotice, .tbPanelBackdrop, .townWindowBackdrop, .spellBookBackdrop, [role='dialog'], [aria-modal='true']";

/** Where on a control to aim, as fractions of its box (centre first). */
const AIM_POINTS: readonly [number, number][] = [
  [0.5, 0.5],
  [0.25, 0.5],
  [0.75, 0.5],
  [0.5, 0.3],
  [0.5, 0.7],
  [0.15, 0.5],
  [0.85, 0.5],
  [0.2, 0.25],
  [0.8, 0.75],
];

type Reach = { point: { x: number; y: number } } | { blockedBy: Element | null };

/**
 * The first aim point on the element that really receives a click (another
 * element may overlap part of it — e.g. a small floating chip). Sandro's own
 * panel never counts as a blocker (it moves out of the way). An element
 * scrolled out of view is aimed at its centre.
 */
function reach(node: HTMLElement, rect: DOMRect): Reach {
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  if (centre.x < 0 || centre.y < 0 || centre.x >= window.innerWidth || centre.y >= window.innerHeight) return { point: centre };
  let blockedBy: Element | null = null;
  for (const [fx, fy] of AIM_POINTS) {
    const x = rect.left + rect.width * fx;
    const y = rect.top + rect.height * fy;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit) continue;
    if (hit === node || node.contains(hit) || hit.closest("[data-tutorial-coach]")) return { point: { x, y } };
    blockedBy ??= hit;
  }
  return { blockedBy };
}

export type TutorialPick = {
  node: HTMLElement;
  /** Index into [...selectors, ...closers]. */
  selector: number;
  index: number;
  /** Viewport point to aim at / click. */
  point: { x: number; y: number };
};

/**
 * The element to point at: the first selector (in order) with an on-screen
 * match, aimed at a part of it that really takes the click. When a floating
 * panel hides the whole control, its close / minimize button is picked
 * instead of falling back to an earlier step of the flow. Returns the element,
 * the selector / match index that found it and the aim point (the clip
 * recorder clicks exactly there).
 */
export function pickTutorialTarget(
  selectors: readonly string[],
  closers: readonly string[] = TUTORIAL_PANEL_CLOSERS,
): TutorialPick | null {
  const matches = (selector: string) => {
    try {
      return Array.from(document.querySelectorAll<HTMLElement>(selector));
    } catch {
      return [];
    }
  };
  const openCloser = (): TutorialPick | null => {
    for (const [closerIndex, selector] of closers.entries()) {
      for (const [index, node] of matches(selector).entries()) {
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const reached = reach(node, rect);
        if ("point" in reached) return { node, selector: selectors.length + closerIndex, index, point: reached.point };
      }
    }
    return null;
  };
  for (const [selectorIndex, selector] of selectors.entries()) {
    for (const [index, node] of matches(selector).entries()) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const reached = reach(node, rect);
      if ("point" in reached) return { node, selector: selectorIndex, index, point: reached.point };
      const panel = reached.blockedBy?.closest(COVERING_PANELS);
      if (panel && !panel.contains(node)) {
        // The next click exists but a floating panel sits on it: tuck the
        // panel away first.
        const closer = openCloser();
        if (closer) return closer;
      }
      // Hidden under something we cannot dismiss: still show where it is.
      return { node, selector: selectorIndex, index, point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } };
    }
  }
  return null;
}

export function findTutorialTarget(selectors: readonly string[]): HTMLElement | null {
  return pickTutorialTarget(selectors)?.node ?? null;
}

/** Last-resort targets: dismiss whatever floating panel covers the real target. */
export const TUTORIAL_PANEL_CLOSERS = [
  ".cardGamesNotice button.cardGamesMinimize",
  ".merchantNotice button.merchantNoticeMinimize",
  // The pre-battle window may be tucked away to play cards / buy troops first.
  ".preBattlePanel:not(.minimized) button.preBattleMinimize",
] as const;

function sameBox(a: Box | null, b: Box | null) {
  return (
    a === b ||
    (!!a &&
      !!b &&
      Math.abs(a.left - b.left) < 0.5 &&
      Math.abs(a.top - b.top) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5 &&
      Math.abs(a.height - b.height) < 0.5 &&
      Math.abs(a.aimX - b.aimX) < 0.5 &&
      Math.abs(a.aimY - b.aimY) < 0.5)
  );
}

export type TutorialTargetBox = { left: number; top: number; width: number; height: number };

/**
 * Animated pointing hand + pulsing ring over the element the player should use
 * next. Tracks the element every frame (maps pan, panels open, combat boards
 * animate) and hides itself when nothing matches — the coach text still says
 * what to do, so a missing target never blocks the lesson. Pointer events pass
 * straight through, so the highlighted control stays clickable.
 */
export function TutorialPointer({
  selectors,
  onFound,
}: {
  selectors: readonly string[];
  /** The target's on-screen box (null when nothing matches), for the coach to stay clear of it. */
  onFound?: (box: TutorialTargetBox | null) => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const key = selectors.join("|");

  useEffect(() => {
    if (!key) {
      onFound?.(null);
      return;
    }
    let frame = 0;
    let last: Box | null = null;

    let tick = 0;
    let target: HTMLElement | null = null;
    // Aim point as a fraction of the element (kept between re-picks).
    let aim = { fx: 0.5, fy: 0.5 };
    const list = key.split("|");
    const update = () => {
      tick += 1;
      // Re-pick a few times a second (or when the element left the DOM);
      // measure the cached element every frame in between.
      if (!target || !target.isConnected || tick % 12 === 0) {
        const picked = pickTutorialTarget(list);
        target = picked?.node ?? null;
        if (picked) {
          const rect = picked.node.getBoundingClientRect();
          aim = {
            fx: rect.width ? (picked.point.x - rect.left) / rect.width : 0.5,
            fy: rect.height ? (picked.point.y - rect.top) / rect.height : 0.5,
          };
        }
      }
      const rect = target?.getBoundingClientRect() ?? null;
      const next = rect
        ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            aimX: rect.left + rect.width * aim.fx,
            aimY: rect.top + rect.height * aim.fy,
          }
        : null;
      if (!sameBox(last, next) || tick === 1) {
        last = next;
        setBox(next);
        onFound?.(next ? { left: next.left, top: next.top, width: next.width, height: next.height } : null);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [key, onFound]);

  if (!key || !box) return null;
  const pad = 6;
  return (
    <div aria-hidden className={css.pointerLayer}>
      <div
        className={css.pointerRing}
        style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
      />
      <div className={css.pointerHand} style={{ left: box.aimX, top: box.aimY }}>
        <svg height="40" viewBox="0 0 24 24" width="40">
          <path
            d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4a1.5 1.5 0 0 1 3 0v6m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4.5a6.5 6.5 0 0 1-6.5 6.5h-1.3a6.5 6.5 0 0 1-5.3-2.8L4.6 16a1.6 1.6 0 0 1 2.4-2.1L9 15.5"
            fill="#fff6dc"
            stroke="#3a2708"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      </div>
    </div>
  );
}
