"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type Point = { x: number; y: number };
type Size = { width: number; height: number };

const EDGE_MARGIN = 6;
const MIN_WIDTH = 150;
const MIN_HEIGHT = 54;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Window chrome shared by every transient map card. The card keeps its normal
 * map-anchored starting position, but can then be dragged, resized smaller or
 * collapsed so it never has to hide the field the player is choosing.
 */
export function MovableMapFloat({
  above,
  boundsHeight,
  boundsWidth,
  children,
  initialHeight,
  initialWidth,
  left,
  top,
}: {
  above: boolean;
  boundsHeight: number;
  boundsWidth: number;
  children: ReactNode;
  initialHeight: number;
  initialWidth: number;
  left: number;
  top: number;
}) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [size, setSize] = useState<Size | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [moving, setMoving] = useState<"drag" | "resize" | null>(null);
  const gesture = useRef<{
    kind: "drag" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    originOffset: Point;
    originSize: Size;
  } | null>(null);

  const measuredSize = (): Size => {
    const rect = windowRef.current?.getBoundingClientRect();
    return {
      width: rect?.width || size?.width || initialWidth,
      height: rect?.height || size?.height || initialHeight,
    };
  };

  const begin = (
    kind: "drag" | "resize",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: offset,
      originSize: measuredSize(),
    };
    setMoving(kind);
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (active.kind === "drag") {
      const width = size?.width ?? active.originSize.width;
      const height = size?.height ?? active.originSize.height;
      setOffset({
        x:
          boundsWidth > 0
            ? clamp(
                active.originOffset.x + dx,
                EDGE_MARGIN - left,
                boundsWidth - EDGE_MARGIN - width - left,
              )
            : active.originOffset.x + dx,
        y:
          boundsHeight > 0
            ? clamp(
                active.originOffset.y + dy,
                EDGE_MARGIN - top,
                boundsHeight - EDGE_MARGIN - height - top,
              )
            : active.originOffset.y + dy,
      });
      return;
    }

    const availableWidth =
      boundsWidth > 0
        ? boundsWidth - EDGE_MARGIN - left - offset.x
        : Number.POSITIVE_INFINITY;
    const availableHeight =
      boundsHeight > 0
        ? boundsHeight - EDGE_MARGIN - top - offset.y
        : Number.POSITIVE_INFINITY;
    setSize({
      width: clamp(active.originSize.width + dx, MIN_WIDTH, availableWidth),
      height: clamp(active.originSize.height + dy, MIN_HEIGHT, availableHeight),
    });
  };

  const end = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = null;
    setMoving(null);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may already have released capture after a cancelled touch.
    }
  };

  const style: CSSProperties = {
    left,
    top,
    width: minimized ? 62 : (size?.width ?? initialWidth),
    height: minimized ? 28 : size?.height,
    // Only emit a transform once the player has actually dragged. An
    // always-present `translate(0px, 0px)` is an INLINE transform, so it beats
    // the phone-mode `.rotateFloat.above/.below` nudges in globals.css (which
    // carry no !important) and the notice sat over the hex it describes.
    ...(offset.x || offset.y
      ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
      : {}),
  };

  return (
    <div
      className={`mapFloatOuter movableMapFloat ${above ? "above" : "below"}${minimized ? " minimized" : ""}${size ? " resized" : ""}${moving === "drag" ? " dragging" : moving === "resize" ? " resizing" : ""}`}
      ref={windowRef}
      style={style}
    >
      <div className="movableMapFloatControls">
        <button
          aria-label="Move notice"
          className="movableMapFloatMove"
          onPointerCancel={end}
          onPointerDown={(event) => begin("drag", event)}
          onPointerMove={move}
          onPointerUp={end}
          title="Drag to move"
          type="button"
        >
          ≡
        </button>
        <button
          aria-label={minimized ? "Restore notice" : "Minimize notice"}
          className="movableMapFloatMinimize"
          onClick={(event) => {
            event.stopPropagation();
            setMinimized((value) => !value);
          }}
          title={minimized ? "Restore" : "Minimize"}
          type="button"
        >
          {minimized ? "□" : "−"}
        </button>
      </div>
      <div className="movableMapFloatBody" hidden={minimized}>
        {children}
      </div>
      {!minimized ? (
        <button
          aria-label="Resize notice"
          className="movableMapFloatResize"
          onPointerCancel={end}
          onPointerDown={(event) => begin("resize", event)}
          onPointerMove={move}
          onPointerUp={end}
          title="Drag to resize"
          type="button"
        >
          ↘
        </button>
      ) : null}
    </div>
  );
}
