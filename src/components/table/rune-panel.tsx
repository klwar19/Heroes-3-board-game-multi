"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, GripHorizontal, PictureInPicture2, PanelRightClose } from "lucide-react";
import { getRuneTrack, isBulwarkPlayer, RUNE_GAIN_ATTACK, RUNE_GAIN_DEFEND, RUNE_GAIN_RETALIATION } from "@/engine/runes";
import { NEUTRAL_PLAYER_ID, type GameState, type PlayerId } from "@/engine/state";
import { assetUrl } from "@/lib/asset-url";

/**
 * Bulwark Rune tracker for the combat surface. One panel for every Bulwark
 * player in the current fight (the viewer's own first), fed only by the tested
 * engine `getRuneTrack`: the nine-cell main track with real Rune tokens, the
 * three Rune Level plaques, and the spendable reserve pile.
 *
 * It lives in the right rail (docked) and can be popped out into a floating,
 * draggable window or minimized to a one-line readout; on the phone layout it
 * is always floating and starts minimized so it never covers the board. The
 * dock/float/minimize state and the floating position persist per browser.
 */

const PREF_KEY = "homm3bg.runePanel";
const TOKEN_ART = "/game-tokens/rune-token.webp";
const POUCH_ART = "/game-tokens/rune-pouch.webp";
const BOARD_ART = "/assets/rune-tracker-bulwark.webp";

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

function RuneTrackBody({ state, playerId, showName }: { state: GameState; playerId: PlayerId; showName: boolean }) {
  const track = getRuneTrack(state, playerId);
  const name = state.players[playerId]?.name ?? playerId;
  const remaining = (track.nextThreshold ?? 0) - track.count;
  const nextLabel = track.nextThreshold === null
    ? "Top level earned — the track now only banks spendable Runes"
    : `${remaining} more Rune${remaining === 1 ? "" : "s"} to Level ${track.level + 1}`;
  return (
    <section
      className="runeSeat"
      aria-label={`Runes for ${name}: track ${track.count} of 9, reserve ${track.reserve}, level ${track.level} of ${track.levelCap}`}
    >
      {showName ? <h4 className="runeSeatName">{name}</h4> : null}
      <div className="runeLevelRow" role="list">
        {track.levels.map((lvl) => (
          <div
            key={lvl.level}
            className={`runeLevelPlaque ${lvl.status}`}
            role="listitem"
            title={levelHint(lvl.status, lvl.bonusLabel, lvl.level)}
          >
            <span className="runeLevelPlaqueBonus">{lvl.bonusLabel}</span>
            <span className="runeLevelPlaqueNeed">{lvl.status === "active" ? "✓" : lvl.threshold}</span>
          </div>
        ))}
      </div>
      <div className="runeTrackRow">
        <ol className="runeCells" aria-label={`Main track: ${track.count} of 9 Runes`}>
          {Array.from({ length: 9 }, (_, index) => {
            const filled = track.count >= index + 1;
            return (
              <li
                key={index}
                className={`runeCell ${filled ? "filled" : ""}${index === 8 ? " last" : ""}`}
                title={filled ? `Rune ${index + 1} of 9 on the main track` : `Empty slot ${index + 1} of 9`}
              >
                {filled ? <img alt="" aria-hidden="true" className="runeToken" draggable={false} src={assetUrl(TOKEN_ART)} /> : null}
                <span className="runeCellNumber" aria-hidden="true">{index + 1}</span>
              </li>
            );
          })}
        </ol>
        <div
          className={`runeReserve ${track.reserve > 0 ? "stocked" : ""}`}
          title={`Reserve: ${track.reserve} spendable Rune${track.reserve === 1 ? "" : "s"} — Rune costs spend the reserve before the main track`}
        >
          <div className="runeReservePile" aria-hidden="true">
            <img alt="" className="runeReservePouch" draggable={false} src={assetUrl(POUCH_ART)} />
            {Array.from({ length: Math.min(4, track.reserve) }, (_, index) => (
              <img alt="" className={`runeToken reserveToken t${index}`} draggable={false} key={index} src={assetUrl(TOKEN_ART)} />
            ))}
          </div>
          <span className="runeReserveCount">{track.reserve}</span>
          <span className="runeReserveLabel">Reserve</span>
        </div>
      </div>
      <div className="runeFooter">
        <span className="runeNext">{nextLabel}</span>
        <span className="runeGains" title="Runes each of your units' actions earns">
          Attack +{RUNE_GAIN_ATTACK} · Retaliate +{RUNE_GAIN_RETALIATION} · Defend +{RUNE_GAIN_DEFEND}
        </span>
      </div>
    </section>
  );
}

export function RunePanel({ state, viewerPlayerId, phone = false }: { state: GameState; viewerPlayerId: PlayerId; phone?: boolean }) {
  const players = runePlayersInCombat(state, viewerPlayerId);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getPrefsServerSnapshot);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

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

  const onDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !floating) return;
      const el = panelRef.current;
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = el.getBoundingClientRect();
      el.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: rect.left, originY: rect.top };
      setDragging(true);
    },
    [floating]
  );

  const onDragPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = panelRef.current;
    if (!drag || !el || drag.pointerId !== event.pointerId) return;
    const next = clampPos(
      { x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) },
      el.offsetWidth,
      el.offsetHeight
    );
    // Live position only; the drop persists once.
    setPrefs({ pos: next }, false);
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      panelRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    setPrefs({}, true);
  }, []);

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

  return (
    <div
      ref={panelRef}
      className={`runePanel${floating ? " floating" : " docked"}${minimized ? " minimized" : ""}${dragging ? " dragging" : ""}${phone ? " phone" : ""}`}
      style={style}
      onPointerMove={floating ? onDragPointerMove : undefined}
      onPointerUp={floating ? endDrag : undefined}
      onPointerCancel={floating ? endDrag : undefined}
      role="region"
      aria-label="Bulwark Rune tracker"
    >
      <div className="runePanelHead">
        {floating ? (
          <button
            type="button"
            className="runePanelHandle"
            aria-label="Drag the Rune tracker"
            title="Drag to move"
            onPointerDown={onDragPointerDown}
          >
            <GripHorizontal size={14} aria-hidden="true" />
          </button>
        ) : null}
        <img alt="" aria-hidden="true" className="runePanelIcon" draggable={false} src={assetUrl(TOKEN_ART)} />
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
        <div className="runePanelBody" style={{ backgroundImage: `url(${assetUrl(BOARD_ART)})` }}>
          {players.map((playerId) => (
            <RuneTrackBody key={playerId} playerId={playerId} showName={players.length > 1} state={state} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
