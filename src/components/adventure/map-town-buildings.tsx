"use client";

/* eslint-disable @next/next/no-img-element -- small UI glyph, not a content image */

// ---------------------------------------------------------------------------
// Map town-buildings dock — a MAP-screen shortcut for USING a controlled town's
// special building actions WITHOUT opening the whole town view. The engine
// already offers these away from town (USE_TOWN_BUILDING for Cover of Darkness /
// Castle Gate, SPELL_BOOK_ACTION for the Mage Guild, BLACKSMITH_ACTION for the
// artifact smith, the City Hall round CHOOSE_OPTION, the Thieves' Guild, …), but
// those buttons only ever lived inside the Town window, so on the map they were
// a hunt. This dock surfaces exactly the buildings that are ACTIONABLE right now
// and reuses the town view's own BuildingDetailPanel so each one behaves — and
// stays tested — identically to the town window.
//
// Everything is READ from the live legal-action list via the shared
// `activeBuildingActions` / `buildingPanelReachable` helpers (never re-derived),
// so a building appears here IFF the engine is actually offering a use for it to
// this seat this instant. When nothing is actionable, the dock renders nothing —
// never an empty window.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Landmark, Minus, X } from "lucide-react";

import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import type { TownBuildingDefinition } from "@/data/factions/types";
import type { GameAction, GameState, LegalAction, PlayerId } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import {
  BuildingDetailPanel,
  activeBuildingActions,
  buildingPanelReachable
} from "./town-sections";

const TOWN_BUILDINGS_ICON = "/assets/ui/town-buildings-use.webp";

/**
 * The controlled town's buildings that offer a live USE action right now, in a
 * stable order (built buildings first, in the town's own build order, then any
 * faction building an effect has waived into reach — e.g. the Astrologers'
 * "Mages" card enabling the Spell Book token without a Mage Guild). A building
 * qualifies only when `buildingPanelReachable` AND it has a non-empty
 * `activeBuildingActions` — i.e. the engine is offering something to click.
 */
function actionableTownBuildings(
  state: GameState,
  viewerPlayerId: PlayerId,
  legalActions: LegalAction[]
): TownBuildingDefinition[] {
  const town = Object.values(state.towns).find(
    (candidate) => candidate.controllerId === viewerPlayerId
  );
  if (!town) {
    return [];
  }
  const faction = state.players[viewerPlayerId]?.factionId
    ? coreFactionDefinitions[state.players[viewerPlayerId]!.factionId!]
    : undefined;
  // The town's own built buildings first (they may include cross-faction ids the
  // faction catalogue does not list), then the faction catalogue for any waived
  // unbuilt building. De-duplicated, order preserved.
  const candidateIds: string[] = [];
  const seen = new Set<string>();
  for (const id of [...town.buildings, ...(faction?.buildings ?? [])]) {
    if (!seen.has(id)) {
      seen.add(id);
      candidateIds.push(id);
    }
  }
  const result: TownBuildingDefinition[] = [];
  for (const id of candidateIds) {
    const building = coreBuildingDefinitions[id];
    if (!building) {
      continue;
    }
    if (!buildingPanelReachable(state, viewerPlayerId, legalActions, building)) {
      continue;
    }
    if (activeBuildingActions(state, viewerPlayerId, legalActions, id).length === 0) {
      continue;
    }
    result.push(building);
  }
  return result;
}

export function MapTownBuildingsDock({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [open, setOpen] = useState(false);
  // A map-screen utility window, not a blocking modal: the player keeps the map
  // visible, can drag it out of the way (desktop) and minimize it to a title bar
  // so a long action list never sits on top of the board.
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  const windowRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const buildings = actionableTownBuildings(state, viewerPlayerId, legalActions);

  // Phone layout is a fixed bottom sheet (CSS-driven), so drag is disabled and
  // inline positioning is skipped there. Guarded for jsdom, where matchMedia is
  // absent. Registered unconditionally so hook order never depends on `open`.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsPhone(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // Esc closes the window (matches the game's other dialogs).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Drag the window by its title bar (desktop only). Ignores drags that begin on
  // a control button so the minimize / close hit-targets still click. Position is
  // clamped so the bar can never be dragged fully off-screen.
  const onBarPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (isPhone || (event.target as HTMLElement).closest("button")) {
        return;
      }
      const el = windowRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      setPos({ x: rect.left, y: rect.top });
      const onMove = (moveEvent: PointerEvent) => {
        if (!dragRef.current) {
          return;
        }
        const width = el.offsetWidth;
        const maxX = Math.max(6, window.innerWidth - width - 6);
        const x = Math.min(Math.max(6, moveEvent.clientX - dragRef.current.dx), maxX);
        const y = Math.min(
          Math.max(6, moveEvent.clientY - dragRef.current.dy),
          Math.max(6, window.innerHeight - 44)
        );
        setPos({ x, y });
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      event.preventDefault();
    },
    [isPhone]
  );

  // Nothing to use right now → no button (never an empty window). If a window was
  // left open when the last action was spent, it closes on the next render.
  if (buildings.length === 0) {
    if (open) {
      setOpen(false);
    }
    return null;
  }

  const label =
    buildings.length === 1
      ? `Use ${buildings[0].name}`
      : `Use town buildings (${buildings.length})`;

  // Desktop: honour the dragged position and drop the CSS bottom-right anchor.
  // Phone / un-dragged: let CSS place it.
  const windowStyle: CSSProperties =
    !isPhone && pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : {};

  return (
    <section aria-label="Town building actions" className="heroActionsDock mapTownBuildingsDock">
      <header>Town buildings</header>
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        className="heroActionButton mapTownBuildingsButton actionable"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        title="Use your town's special building actions from the map — Cover of Darkness, Castle Gate, the Blacksmith, the Mage Guild, the City Hall choice, and more"
        type="button"
      >
        <img
          alt=""
          aria-hidden="true"
          className="mapTownBuildingsIcon"
          src={assetUrl(TOWN_BUILDINGS_ICON)}
          width={18}
          height={18}
        />
        <span className="heroActionLabelEn">{label}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <section
              aria-label="Town building actions"
              className={`mapTownBuildingsWindow${minimized ? " minimized" : ""}${isPhone ? " phone" : ""}`}
              ref={windowRef}
              role="dialog"
              style={windowStyle}
            >
              <header
                className="mapTownBuildingsBar"
                onPointerDown={onBarPointerDown}
                title={isPhone ? undefined : "Drag to move"}
              >
                <span className="mapTownBuildingsBarTitle">
                  <Landmark aria-hidden size={16} />
                  Town buildings
                  {buildings.length > 1 ? (
                    <em className="mapTownBuildingsCount">{buildings.length}</em>
                  ) : null}
                </span>
                <span className="mapTownBuildingsBarControls">
                  <button
                    aria-label={minimized ? "Expand" : "Minimize"}
                    className="mapTownBuildingsBarBtn"
                    onClick={() => setMinimized((value) => !value)}
                    title={minimized ? "Expand" : "Minimize"}
                    type="button"
                  >
                    {minimized ? <ChevronUp size={15} /> : <Minus size={15} />}
                  </button>
                  <button
                    aria-label="Close"
                    className="mapTownBuildingsBarBtn"
                    onClick={() => setOpen(false)}
                    title="Close"
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </span>
              </header>
              {minimized ? null : (
                <div className="mapTownBuildingsBody">
                  <p className="objectiveRuleSummary mapTownBuildingsIntro">
                    Special actions your town offers right now — trigger them here without opening the town window.
                  </p>
                  <div className="mapTownBuildingsList">
                    {buildings.map((building) => (
                      <BuildingDetailPanel
                        building={building}
                        key={building.id}
                        legalActions={legalActions}
                        onAction={onAction}
                        state={state}
                        viewerPlayerId={viewerPlayerId}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>,
            document.body
          )
        : null}
    </section>
  );
}
