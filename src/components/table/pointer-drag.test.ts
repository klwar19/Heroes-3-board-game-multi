// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginUnitPointerDrag } from "./pointer-drag";

/**
 * The deployment drag is pointer-based (not the old mouse-only HTML5 DnD) so it
 * works on touch screens. These tests pin the EFFECT: a drag that crosses the
 * activation threshold and is released over a `data-drop-cell` cell dispatches a
 * placement for that cell; a stationary press (a tap) does NOT; and a release
 * away from any drop cell does NOT. They fail if the drop wiring or the
 * tap-vs-drag threshold is broken.
 */

afterEach(() => {
  // A drag that ended installs a one-shot window capture-click suppressor; fire
  // a click so it consumes itself and can't eat the next test's click.
  window.dispatchEvent(new Event("click"));
  document.body.innerHTML = "";
});

/** A synthetic React pointer-down on the drag source. */
function pointerDownEvent(target: HTMLElement, x: number, y: number) {
  return {
    currentTarget: target,
    isPrimary: true,
    pointerType: "touch",
    button: 0,
    clientX: x,
    clientY: y
  } as unknown as React.PointerEvent;
}

function firePointer(type: "pointermove" | "pointerup" | "pointercancel", x: number, y: number): void {
  const event = new Event(type);
  Object.assign(event, { clientX: x, clientY: y, isPrimary: true, button: 0 });
  window.dispatchEvent(event);
}

/** jsdom has no layout, so stand in for elementFromPoint's hit-test result. */
function stubElementFromPoint(element: Element | null): void {
  (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => element;
}

/** A real droppable cell the elementFromPoint stub can "hit". */
function makeDropCell(cellIndex: number): HTMLElement {
  const cell = document.createElement("div");
  cell.setAttribute("data-drop-cell", "true");
  cell.setAttribute("data-fx-cell", String(cellIndex));
  document.body.appendChild(cell);
  return cell;
}

describe("beginUnitPointerDrag", () => {
  it("drops a placement on the cell under the pointer after a real drag", () => {
    stubElementFromPoint(makeDropCell(14));
    const source = document.createElement("button");
    document.body.appendChild(source);

    const onDrop = vi.fn();
    beginUnitPointerDrag(pointerDownEvent(source, 0, 0), { onDrop });

    // Move past the 6px activation threshold, then release over the cell.
    firePointer("pointermove", 40, 40);
    firePointer("pointerup", 40, 40);

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(14);
    // The follow-pointer ghost is cleaned up on release.
    expect(document.querySelector(".unitDragGhost")).toBeNull();
  });

  it("does NOT drop on a stationary press (a tap falls through to onClick)", () => {
    stubElementFromPoint(makeDropCell(14));
    const source = document.createElement("button");
    document.body.appendChild(source);

    const onDrop = vi.fn();
    beginUnitPointerDrag(pointerDownEvent(source, 10, 10), { onDrop });

    // Release within the threshold of where it started: never became a drag.
    firePointer("pointermove", 12, 12);
    firePointer("pointerup", 12, 12);

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does NOT drop when released away from any drop cell", () => {
    // elementFromPoint lands on a non-droppable element (no data-drop-cell).
    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);
    stubElementFromPoint(elsewhere);
    const source = document.createElement("button");
    document.body.appendChild(source);

    const onDrop = vi.fn();
    beginUnitPointerDrag(pointerDownEvent(source, 0, 0), { onDrop });

    firePointer("pointermove", 40, 40);
    firePointer("pointerup", 40, 40);

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("suppresses the click the drag source fires right after a real drop", () => {
    stubElementFromPoint(makeDropCell(5));
    const source = document.createElement("button");
    document.body.appendChild(source);
    const onClick = vi.fn();
    source.addEventListener("click", onClick);

    beginUnitPointerDrag(pointerDownEvent(source, 0, 0), { onDrop: vi.fn() });
    firePointer("pointermove", 40, 40);
    firePointer("pointerup", 40, 40);

    // The browser fires a click on the source after the drag — it must be eaten.
    source.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
