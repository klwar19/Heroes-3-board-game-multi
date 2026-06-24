import type { PointerEvent as ReactPointerEvent } from "react";
import { assetUrl } from "@/lib/asset-url";

/**
 * Cross-device drag for combat deployment.
 *
 * The original deployment drag used the HTML5 native Drag-and-Drop API
 * (`draggable` + `dataTransfer`). That API is mouse-only: touch screens never
 * fire `dragstart` / `drop`, so on a tablet, phone or touch laptop the unit
 * could not be dragged onto the battlefield at all — the player was silently
 * forced onto the click-to-place fallback. (This is why deployment "drags on one
 * computer but not another": the second computer is a touch device.)
 *
 * This re-implements the same gesture with Pointer Events, which fire
 * identically for mouse, touch and pen, so a deployment drag works on every
 * device. A drop cell is any element carrying `data-drop-cell="true"` — the
 * board marks each legal, empty deployment cell with it (driven by the same
 * `dropTarget` computation that already highlights them), so the board stays the
 * single source of truth for what is droppable and this helper only hit-tests
 * for that marker.
 *
 * The gesture only becomes a drag once the pointer travels past
 * `DRAG_ACTIVATE_PX`; a stationary press is left to the element's own `onClick`
 * (tap a tile to select/take-back, tap a board unit to inspect). A completed
 * drag swallows the click that the browser fires afterwards so a drop never also
 * triggers that click.
 */

const DRAG_ACTIVATE_PX = 6;
const DROP_CELL_SELECTOR = '[data-drop-cell="true"]';
const DRAG_HOVER_CLASS = "dropHover";
/** Safety net: drop the post-drag click suppressor if no click ever arrives. */
const CLICK_SUPPRESS_MS = 350;

export type UnitPointerDragOptions = {
  /** Small square portrait painted as the drag ghost (optional). */
  portraitUrl?: string;
  /** Dispatch the placement for the deployment cell the pointer is released over. */
  onDrop: (cellIndex: number) => void;
};

function dropCellAt(x: number, y: number): Element | null {
  if (typeof document === "undefined") {
    return null;
  }
  // The ghost is `pointer-events:none`, so elementFromPoint sees through it to
  // the cell underneath.
  const hit = document.elementFromPoint(x, y);
  return hit?.closest(DROP_CELL_SELECTOR) ?? null;
}

function cellIndexOf(cell: Element | null): number | null {
  const raw = cell?.getAttribute("data-fx-cell");
  if (raw === null || raw === undefined) {
    return null;
  }
  const index = Number(raw);
  return Number.isInteger(index) ? index : null;
}

function makeGhost(portraitUrl: string | undefined): HTMLElement {
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.className = "unitDragGhost";
  let css =
    "position:fixed;z-index:10000;width:58px;height:58px;border-radius:8px;pointer-events:none;" +
    "transform:translate(-50%,-50%);opacity:0.9;border:1px solid rgba(20,12,4,0.85);" +
    "box-shadow:0 5px 14px rgba(0,0,0,0.6);background:#0a0704;";
  if (portraitUrl) {
    const safeSrc = (assetUrl(portraitUrl) ?? "").replace(/["\\]/g, "\\$&");
    css += `background-image:url("${safeSrc}");background-size:cover;background-position:top center;`;
  }
  ghost.style.cssText = css;
  return ghost;
}

/**
 * Swallow the lone click the browser fires after a pointerup that ended a real
 * drag, so a drop never also triggers the source tile's own onClick (select /
 * take-back / inspect). The listener is on `window` in the CAPTURE phase so it
 * runs before the click reaches the source's own handler, and self-removes on
 * that first click; a timeout fallback clears it if no click ever arrives (a
 * touch tap may not synthesize one). In practice the synthetic click lands
 * almost immediately, so the suppressor is live only for that instant.
 */
function suppressNextClick(): void {
  if (typeof window === "undefined") {
    return;
  }
  let timer = 0;
  const swallow = (event: Event): void => {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener("click", swallow, true);
    window.clearTimeout(timer);
  };
  window.addEventListener("click", swallow, true);
  timer = window.setTimeout(() => window.removeEventListener("click", swallow, true), CLICK_SUPPRESS_MS);
}

/**
 * Begin a pointer-driven deployment drag from `event.currentTarget`. Wire it to
 * a draggable unit tile / board card via `onPointerDown`. The element should set
 * `touch-action: none` (see the `.unitDraggable` CSS) so a touch-drag does not
 * scroll the page.
 */
export function beginUnitPointerDrag(event: ReactPointerEvent, options: UnitPointerDragOptions): void {
  // Primary pointer only; for a mouse, ignore anything but the left button.
  // (`isPrimary`/`pointerType` may be undefined under jsdom — only bail on an
  // explicit non-primary / non-left signal.)
  if (event.isPrimary === false || (event.pointerType === "mouse" && event.button > 0)) {
    return;
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const startX = event.clientX;
  const startY = event.clientY;
  let activated = false;
  let ghost: HTMLElement | null = null;
  let hovered: Element | null = null;

  const setHover = (cell: Element | null): void => {
    if (hovered === cell) {
      return;
    }
    hovered?.classList.remove(DRAG_HOVER_CLASS);
    hovered = cell;
    hovered?.classList.add(DRAG_HOVER_CLASS);
  };

  const placeGhost = (x: number, y: number): void => {
    if (ghost) {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    }
  };

  const cleanup = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    setHover(null);
    ghost?.remove();
    ghost = null;
  };

  function onMove(moveEvent: PointerEvent): void {
    if (!activated) {
      if (
        Math.abs(moveEvent.clientX - startX) < DRAG_ACTIVATE_PX &&
        Math.abs(moveEvent.clientY - startY) < DRAG_ACTIVATE_PX
      ) {
        return;
      }
      activated = true;
      ghost = makeGhost(options.portraitUrl);
      document.body.appendChild(ghost);
    }
    placeGhost(moveEvent.clientX, moveEvent.clientY);
    setHover(dropCellAt(moveEvent.clientX, moveEvent.clientY));
  }

  function onUp(upEvent: PointerEvent): void {
    const wasDragging = activated;
    const index = wasDragging ? cellIndexOf(dropCellAt(upEvent.clientX, upEvent.clientY)) : null;
    cleanup();
    if (wasDragging) {
      // A real drag's trailing click (select/take-back/inspect) must not also fire.
      suppressNextClick();
      if (index !== null) {
        options.onDrop(index);
      }
    }
  }

  function onCancel(): void {
    const wasDragging = activated;
    cleanup();
    if (wasDragging) {
      suppressNextClick();
    }
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}
