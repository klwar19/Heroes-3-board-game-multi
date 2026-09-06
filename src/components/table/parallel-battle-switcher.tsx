"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeftRight, Eye, RotateCcw, Shield, Swords } from "lucide-react";
import { parallelContextOptions } from "@/engine/parallel-combats";
import type { GameAction, GameState, PlayerId } from "@/engine/state";
import styles from "./parallel-battle-switcher.module.css";

const POSITION_STORAGE_KEY = "heroes3.parallelBattleSwitcher.position";

export function ParallelBattleSwitcher({ state, playerId, onAction }: {
  state: GameState;
  playerId: PlayerId;
  onAction: (action: GameAction) => unknown;
}) {
  const [switching, setSwitching] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const positionLoadedRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    baseLeft: number;
    baseTop: number;
    width: number;
    height: number;
  } | null>(null);
  const options = parallelContextOptions(state, playerId);

  // Context switching can replace the adventure tree with the combat tree and
  // remount this component. Keep a player's chosen position for this browser
  // tab, but clamp it on restore so a resized window can never strand it.
  useEffect(() => {
    if (!positionLoadedRef.current) {
      positionLoadedRef.current = true;
      try {
        const saved = JSON.parse(sessionStorage.getItem(POSITION_STORAGE_KEY) ?? "null") as unknown;
        if (
          saved &&
          typeof saved === "object" &&
          "x" in saved &&
          "y" in saved &&
          typeof saved.x === "number" &&
          typeof saved.y === "number"
        ) {
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) {
            const edge = 6;
            const minX = edge - rect.left;
            const minY = edge - rect.top;
            setOffset({
              x: Math.min(Math.max(saved.x, minX), Math.max(minX, window.innerWidth - edge - rect.width - rect.left)),
              y: Math.min(Math.max(saved.y, minY), Math.max(minY, window.innerHeight - edge - rect.height - rect.top)),
            });
          }
        }
      } catch {
        // Storage may be unavailable or contain a value from an older build.
      }
      return;
    }
    try {
      sessionStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(offset));
    } catch {
      // Moving the panel still works when browser storage is unavailable.
    }
  }, [offset]);

  // The desktop adventure chrome is fixed to the viewport. Publish the real
  // amount of space occupied by this optional row so those rails can begin
  // below it. Measuring the next grid row also includes margins and the grid
  // gap, avoiding a brittle hard-coded switcher height.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const table = root?.closest<HTMLElement>(".tableRoot");
    if (!root || !table) return;

    const publishOffset = () => {
      const next = root.nextElementSibling as HTMLElement | null;
      const measured = next
        ? Math.max(0, next.offsetTop - root.offsetTop)
        : Math.ceil(root.getBoundingClientRect().height);
      table.style.setProperty("--parallel-battle-offset", `${measured}px`);
    };

    publishOffset();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(publishOffset);
    observer?.observe(root);
    window.addEventListener("resize", publishOffset);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publishOffset);
      table.style.removeProperty("--parallel-battle-offset");
    };
  }, [options.length]);

  if (options.length < 2) return null;
  const selected = state.parallelCombatOwnerId ?? playerId;
  const current = options.find(option => option.ownerPlayerId === selected);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = root.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      baseLeft: rect.left - offset.x,
      baseTop: rect.top - offset.y,
      width: rect.width,
      height: rect.height,
    };
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const edge = 6;
    const x = drag.originX + event.clientX - drag.startX;
    const y = drag.originY + event.clientY - drag.startY;
    setOffset({
      x: Math.min(
        Math.max(x, edge - drag.baseLeft),
        Math.max(edge - drag.baseLeft, window.innerWidth - edge - drag.width - drag.baseLeft),
      ),
      y: Math.min(
        Math.max(y, edge - drag.baseTop),
        Math.max(edge - drag.baseTop, window.innerHeight - edge - drag.height - drag.baseTop),
      ),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be gone after a cancelled touch gesture.
    }
  };

  return (
    <section
      className={`${styles.root} parallelBattleSwitcher${dragging ? ` ${styles.dragging}` : ""}`}
      aria-label="Parallel battles"
      ref={rootRef}
      style={offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
    >
      <div className={styles.heading}>
        <span><ArrowLeftRight size={16} /> Your battle windows</span>
        <div className={styles.headingActions}>
          <small>Switch freely · each battle keeps its progress</small>
          <button
            aria-label="Move battle windows"
            className={styles.moveHandle}
            onPointerCancel={endDrag}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            title="Drag to move this panel"
            type="button"
          >
            <ArrowLeftRight size={14} /> Move
          </button>
          <button
            aria-label="Reset battle-window position"
            className={styles.resetPosition}
            disabled={offset.x === 0 && offset.y === 0}
            onClick={() => setOffset({ x: 0, y: 0 })}
            title="Return this panel to its safe default position"
            type="button"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>
      <div className={styles.windows} role="group" aria-label="Choose battle">
        {options.map(option => (
          <button type="button" key={option.ownerPlayerId}
            className={`${styles.window} ${option.role === "neutrals" ? styles.neutrals : ""}`}
            aria-pressed={selected === option.ownerPlayerId}
            disabled={switching}
            onClick={async () => {
              if (selected === option.ownerPlayerId) return;
              setSwitching(true);
              try { await onAction({ type: "SELECT_PARALLEL_CONTEXT", playerId, ownerPlayerId: option.ownerPlayerId }); }
              finally { setSwitching(false); }
            }}>
            {option.role === "hero" ? <Swords size={22} /> : option.role === "watch" ? <Eye size={22} /> : <Shield size={22} />}
            <span className={styles.text}>
              <strong>{option.role === "hero"
                ? option.hasCombat ? "My battle" : "My adventure"
                : option.role === "watch" ? `Watch ${option.fighterName}` : `Neutrals vs ${option.fighterName}`}</strong>
              <small>{option.role === "hero"
                ? option.controllerName ? `${option.controllerName} controls your opponents` : "Your hero, cards and rewards"
                : option.role === "watch" ? "Read-only — you have no decision here" : "You command the neutral army"}</small>
              <span className={option.needsInput ? styles.ready : styles.waiting}>{option.needsInput ? "● " : "◷ "}{option.waitingFor}</span>
            </span>
          </button>
        ))}
      </div>
      <p className={styles.role} role="status">
        {switching ? "Opening battle…" : current?.role === "neutrals"
          ? `You are commanding neutrals against ${current.fighterName}. Return to ${options[0].hasCombat ? "My battle" : "My adventure"} for your own hero.`
          : current?.role === "watch"
            ? `You are watching ${current.fighterName}'s battle — read-only. Return to ${options[0].hasCombat ? "My battle" : "My adventure"} to play your own turn.`
            : "You are playing your own hero. Check the neutral window when it needs your action."}
      </p>
    </section>
  );
}
