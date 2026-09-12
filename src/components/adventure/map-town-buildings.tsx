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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Landmark, X } from "lucide-react";

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
  const buildings = actionableTownBuildings(state, viewerPlayerId, legalActions);

  // Esc closes the window (matches the game's other modals). Registered
  // unconditionally so hook order never depends on `open`.
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

  return (
    <section aria-label="Town building actions" className="heroActionsDock mapTownBuildingsDock">
      <header>Town buildings</header>
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        className="heroActionButton mapTownBuildingsButton actionable"
        onClick={() => setOpen(true)}
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
            <div
              aria-label="Town building actions"
              aria-modal="true"
              className="modalBackdrop mapTownBuildingsBackdrop"
              onClick={() => setOpen(false)}
              role="dialog"
            >
              <section
                className="objectiveModal mapTownBuildingsModal"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  className="heroInfoClose"
                  onClick={() => setOpen(false)}
                  title="Close"
                  type="button"
                >
                  <X size={16} />
                </button>
                <header className="objectiveModalHead mapTownBuildingsHead">
                  <Landmark aria-hidden size={22} />
                  <div>
                    <span>TOWN BUILDINGS</span>
                    <h2>Use a building</h2>
                  </div>
                </header>
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
              </section>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
