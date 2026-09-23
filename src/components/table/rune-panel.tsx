"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, GripHorizontal, Lock, PictureInPicture2, PanelRightClose } from "lucide-react";
import { getRuneTrack, isBulwarkPlayer, RUNE_THRESHOLD } from "@/engine/runes";
import { NEUTRAL_PLAYER_ID, type GameState, type PlayerId } from "@/engine/state";
import { assetUrl } from "@/lib/asset-url";

/**
 * Bulwark Rune tracker for the combat surface. One panel for every Bulwark
 * player in the current fight (the viewer's own first), fed only by the tested
 * engine `getRuneTrack`, drawn as the printed tracker board with pieces on it:
 * the Rune cube sits on the main-track slot (1-8) matching the Runes on the
 * track, a gold seal covers each "9" threshold box whose Rune Level is earned
 * (the next one to climb is lit, ones beyond the Sieidi/Altar cap are locked),
 * and the spendable reserve is a tray of cubes under the board.
 *
 * It lives in the right rail (docked) and can be popped out into a floating,
 * draggable window or minimized to a one-line readout; on the phone layout it
 * is always floating and starts minimized so it never covers the board. The
 * dock/float/minimize state and the floating position persist per browser.
 */

const PREF_KEY = "homm3bg.runePanel";
const CUBE_ART = "/game-tokens/rune-cube.webp";
const SEAL_ART = "/game-tokens/rune-level-seal.webp";
const BOARD_ART = "/assets/rune-tracker-bulwark.webp";

/**
 * Piece positions on the 800x428 printed board, as % of its width / height
 * (measured from the art): the centres of the numbered track slots 1-8 (the
 * trough steps, so odd and even slots sit at different heights), the rune
 * emblem past slot 8 where a full nine-Rune track rests once the top Level is
 * earned, and the three "9" threshold boxes (Level 1, 2, 3).
 */
const BOARD_SLOTS: readonly (readonly [number, number])[] = [
  [16.56, 79.44], [25.94, 81.54], [35.31, 79.44], [44.69, 81.54],
  [54.06, 79.44], [63.44, 81.54], [72.81, 79.44], [82.19, 81.54]
];
const BOARD_FULL_SLOT = [91.38, 79.44] as const;
const BOARD_LEVEL_BOXES: readonly (readonly [number, number])[] = [
  [46.0, 42.06], [64.04, 42.06], [81.91, 42.06]
];
/** Pointer travel before a header press becomes a drag (and pops a docked panel out). */
const DRAG_THRESHOLD_PX = 6;
/** Reserve cubes drawn individually before the tray collapses the rest into "+N". */
const RESERVE_CUBES_SHOWN = 15;

type PanelPos = { x: number; y: number };
type PanelPrefs = {
  /** Desktop: collapsed to the one-line readout. */
  minimized: boolean;
  /** Phone: collapsed to the pill (starts true so the board stays uncovered). */
  phoneMinimized: boolean;
  /** Desktop: popped out of the rail as a movable window (phone is always floating). */
  floating: boolean;
  pos: PanelPos | null;
};

const DEFAULT_PREFS: PanelPrefs = { minimized: false, phoneMinimized: true, floating: false, pos: null };

// ---- tiny external store: hydrates from localStorage on the client only, so
// the server render and the first client render agree (both see `null`) and
// no effect has to call setState to load the saved preference.
let prefsCache: PanelPrefs | null = null;
const listeners = new Set<() => void>();

function readPrefs(): PanelPrefs {
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    const pos =
      parsed.pos && Number.isFinite(parsed.pos.x) && Number.isFinite(parsed.pos.y)
        ? { x: parsed.pos.x, y: parsed.pos.y }
        : null;
    return {
      minimized: Boolean(parsed.minimized),
      phoneMinimized: parsed.phoneMinimized === undefined ? true : Boolean(parsed.phoneMinimized),
      floating: Boolean(parsed.floating),
      pos
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPrefsSnapshot(): PanelPrefs {
  if (!prefsCache) prefsCache = readPrefs();
  return prefsCache;
}

function getPrefsServerSnapshot(): PanelPrefs | null {
  return null;
}

function setPrefs(patch: Partial<PanelPrefs>, persist = true): void {
  prefsCache = { ...getPrefsSnapshot(), ...patch };
  if (persist) {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(prefsCache));
    } catch {
      // private mode / storage blocked: the panel still works for this session
    }
  }
  for (const listener of listeners) listener();
}

function clampPos(pos: PanelPos, width: number, height: number): PanelPos {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, pos.x)),
    y: Math.min(maxY, Math.max(margin, pos.y))
  };
}

/** Bulwark seats taking part in this combat, viewer first, stable otherwise. */
function runePlayersInCombat(state: GameState, viewerPlayerId: PlayerId): PlayerId[] {
  const combat = state.combat;
  if (!combat) return [];
  const ids = new Set<PlayerId>();
  // The two fighting seats count from deployment on, before any unit is placed
  // or the Rune pool is seeded, so the tracker is on screen for the whole fight.
  for (const id of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (id && id !== NEUTRAL_PLAYER_ID && isBulwarkPlayer(state, id)) ids.add(id);
  }
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== NEUTRAL_PLAYER_ID && isBulwarkPlayer(state, unit.controllerId)) ids.add(unit.controllerId);
  }
  for (const id of Object.keys(combat.runes ?? {})) {
    if (id !== NEUTRAL_PLAYER_ID && isBulwarkPlayer(state, id)) ids.add(id);
  }
  return [...ids].sort((a, b) => Number(b === viewerPlayerId) - Number(a === viewerPlayerId) || a.localeCompare(b));
}

function levelHint(status: string, bonusLabel: string, level: number): string {
  const base = `Rune Level ${level}: ${bonusLabel} for all your units`;
  if (status === "active") return `${base} — earned this combat`;
  if (status === "pending") return `${base} — fill the nine-Rune track to earn it`;
  return `${base} — locked (build the ${level === 2 ? "Sieidi" : "Altar"} of the Runes)`;
}

const pct = (value: number) => `${value}%`;

function RuneTrackBody({ state, playerId, showName }: { state: GameState; playerId: PlayerId; showName: boolean }) {
  const track = getRuneTrack(state, playerId);
  const name = state.players[playerId]?.name ?? playerId;
  const remaining = (track.nextThreshold ?? 0) - track.count;
  const nextLabel = track.nextThreshold === null
    ? track.levelCap < track.levels.length
      ? `Level ${track.level} is your cap — the track now only banks spendable Runes`
      : "Top level earned — the track now only banks spendable Runes"
    : `${remaining} more Rune${remaining === 1 ? "" : "s"} to Level ${track.level + 1}`;
  // The cube marks the track total: slot 1-8, or the emblem past slot 8 when
  // the top Level is earned and the track fills to nine. No Runes, no cube.
  const cubeAt = track.count <= 0
    ? null
    : track.count >= RUNE_THRESHOLD
      ? BOARD_FULL_SLOT
      : BOARD_SLOTS[track.count - 1];
  const reserveShown = Math.min(track.reserve, RESERVE_CUBES_SHOWN);
  return (
    <section
      className="runeSeat"
      data-rune-seat={playerId}
      aria-label={`Runes for ${name}: track ${track.count} of 9, reserve ${track.reserve}, level ${track.level} of ${track.levelCap}`}
    >
      {showName ? <h4 className="runeSeatName">{name}</h4> : null}
      <div className="runeBoard">
        <img alt="" aria-hidden="true" className="runeBoardArt" draggable={false} src={assetUrl(BOARD_ART)} />
        {track.levels.map((lvl, index) => {
          const [x, y] = BOARD_LEVEL_BOXES[index];
          const next = lvl.status === "pending" && lvl.level === track.level + 1;
          return (
            <div
              key={lvl.level}
              className={`runeBoardLevel ${lvl.status}${next ? " next" : ""}`}
              data-rune-level={lvl.level}
              role="img"
              aria-label={levelHint(lvl.status, lvl.bonusLabel, lvl.level)}
              title={levelHint(lvl.status, lvl.bonusLabel, lvl.level)}
              style={{ left: pct(x), top: pct(y) }}
            >
              {lvl.status === "active" ? (
                <img alt="" aria-hidden="true" className="runeBoardSeal" draggable={false} src={assetUrl(SEAL_ART)} />
              ) : lvl.status === "locked" ? (
                <Lock aria-hidden="true" className="runeBoardLock" />
              ) : null}
            </div>
          );
        })}
        {BOARD_SLOTS.map(([x, y], index) =>
          index < track.count - 1 ? (
            <span aria-hidden="true" className="runeBoardPassed" key={index} style={{ left: pct(x), top: pct(y) }} />
          ) : null
        )}
        {cubeAt ? (
          <img
            alt=""
            className="runeBoardCube"
            draggable={false}
            src={assetUrl(CUBE_ART)}
            style={{ left: pct(cubeAt[0]), top: pct(cubeAt[1]) }}
            title={`Main track: ${track.count} of 9 Runes`}
          />
        ) : null}
      </div>
      <div
        className={`runeReserveTray${track.reserve > 0 ? " stocked" : ""}`}
        title={`Reserve: ${track.reserve} spendable Rune${track.reserve === 1 ? "" : "s"} (5 banked each time a Level is earned) — Rune costs spend the reserve before the main track`}
      >
        <span className="runeReserveLabel">Reserve</span>
        <span className="runeReserveCubes" aria-hidden="true">
          {Array.from({ length: reserveShown }, (_, index) => (
            <img alt="" className="runeReserveCube" draggable={false} key={index} src={assetUrl(CUBE_ART)} />
          ))}
          {track.reserve > reserveShown ? <span className="runeReserveMore">+{track.reserve - reserveShown}</span> : null}
        </span>
        <span className="runeReserveCount">{track.reserve}</span>
      </div>
      <p className="runeNext">{nextLabel}</p>
    </section>
  );
}

export function RunePanel({ state, viewerPlayerId, phone = false }: { state: GameState; viewerPlayerId: PlayerId; phone?: boolean }) {
  const players = runePlayersInCombat(state, viewerPlayerId);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getPrefsServerSnapshot);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const floating = phone || Boolean(prefs?.floating);
  const minimized = phone ? Boolean(prefs?.phoneMinimized) : Boolean(prefs?.minimized);
  const pos = prefs?.pos ?? null;

  // Keep a floating window on-screen when the viewport changes.
  useEffect(() => {
    if (!floating || !pos) return;
    const onResize = () => {
      const el = panelRef.current;
      const current = getPrefsSnapshot();
      if (!current.pos) return;
      setPrefs({ pos: clampPos(current.pos, el?.offsetWidth ?? 380, el?.offsetHeight ?? 200) });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [floating, pos]);

  // Re-clamp when the panel's own height changes: expanding from the pill (or
  // mounting with a saved desktop position at phone width) can otherwise put
  // the header past the viewport edge, with no way to drag it back.
  useEffect(() => {
    if (!floating || minimized) return;
    const el = panelRef.current;
    const current = getPrefsSnapshot();
    if (!current.pos || !el) return;
    const next = clampPos(current.pos, el.offsetWidth, el.offsetHeight);
    if (next.x !== current.pos.x || next.y !== current.pos.y) setPrefs({ pos: next });
  }, [floating, minimized]);

  // Drag from anywhere on the header (its buttons excepted). A floating window
  // follows the pointer; the docked panel pops out of the rail once the pointer
  // has travelled a few pixels, so a plain click never undocks it. Movement is
  // tracked on `window`, not by pointer capture, because popping out re-mounts
  // the panel into <body> mid-drag.
  const onHeadPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || dragCleanupRef.current) return;
      if ((event.target as HTMLElement).closest("button")) return;
      const el = panelRef.current;
      if (!el) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        const dx = move.clientX - startX;
        const dy = move.clientY - startY;
        if (!moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          moved = true;
          setDragging(true);
        }
        const current = panelRef.current;
        const next = clampPos(
          { x: rect.left + dx, y: rect.top + dy },
          current?.offsetWidth ?? rect.width,
          current?.offsetHeight ?? rect.height
        );
        // Live position only (popping a desktop panel out if still docked); the
        // drop persists once. The phone panel always floats, so it keeps the
        // desktop dock preference untouched.
        setPrefs(phone ? { pos: next } : { floating: true, pos: next }, false);
      };
      const finish = (end: PointerEvent) => {
        if (end.pointerId !== pointerId) return;
        cleanup();
        if (moved) {
          setDragging(false);
          setPrefs({}, true);
        }
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        dragCleanupRef.current = null;
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      dragCleanupRef.current = cleanup;
    },
    [phone]
  );

  // Drop any in-flight drag listeners if the panel leaves the screen mid-drag.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  if (players.length === 0 || !prefs) return null;
  const summary = players.map((playerId) => {
    const track = getRuneTrack(state, playerId);
    const who = players.length > 1 ? `${state.players[playerId]?.name ?? playerId}: ` : "";
    return `${who}${track.count}/9 · R${track.reserve} · Lv ${track.level}/${track.levelCap}`;
  }).join("  |  ");

  const style: CSSProperties | undefined = floating
    ? pos
      ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
      : phone
        ? { right: 10, bottom: 134, left: "auto", top: "auto" } // above the phone tab bar and the helper-tips chip
        : { right: 16, top: 72, left: "auto", bottom: "auto" }
    : undefined;

  const panel = (
    <div
      ref={panelRef}
      className={`runePanel${floating ? " floating" : " docked"}${minimized ? " minimized" : ""}${dragging ? " dragging" : ""}${phone ? " phone" : ""}`}
      style={style}
      role="region"
      aria-label="Bulwark Rune tracker"
    >
      <div
        className="runePanelHead"
        onPointerDown={onHeadPointerDown}
        title={floating ? "Drag to move" : "Drag out of the rail to pop the tracker out"}
      >
        <span aria-hidden="true" className="runePanelHandle">
          <GripHorizontal size={14} />
        </span>
        <img alt="" aria-hidden="true" className="runePanelIcon" draggable={false} src={assetUrl(CUBE_ART)} />
        <span className="runePanelTitle">Runes</span>
        <span className="runePanelSummary" title="Main track / Reserve / Rune Level">{summary}</span>
        {!phone ? (
          <button
            type="button"
            className="runePanelButton"
            title={floating ? "Dock the tracker back into the side rail" : "Pop the tracker out as a movable window"}
            aria-label={floating ? "Dock the Rune tracker" : "Pop out the Rune tracker"}
            onClick={() => setPrefs({ floating: !floating, minimized: false })}
          >
            {floating ? <PanelRightClose size={14} aria-hidden="true" /> : <PictureInPicture2 size={14} aria-hidden="true" />}
          </button>
        ) : null}
        <button
          type="button"
          className="runePanelButton"
          title={minimized ? "Show the full Rune track" : "Minimize to a one-line readout"}
          aria-label={minimized ? "Expand the Rune tracker" : "Minimize the Rune tracker"}
          aria-expanded={!minimized}
          onClick={() => setPrefs(phone ? { phoneMinimized: !minimized } : { minimized: !minimized })}
        >
          {minimized ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      </div>
      {!minimized ? (
        <div className="runePanelBody">
          {players.map((playerId) => (
            <RuneTrackBody key={playerId} playerId={playerId} showName={players.length > 1} state={state} />
          ))}
        </div>
      ) : null}
    </div>
  );
  // Floating windows live in <body> so no ancestor transform, clip or stacking
  // context can trap or hide them; docked, the panel stays in the rail.
  return floating ? createPortal(panel, document.body) : panel;
}
