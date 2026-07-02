"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Check, Hammer, Info, Users, X } from "lucide-react";

import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import {
  townBoardSpecs,
  townBoardTileArt,
  type TownBoardSpec,
  type TownTrackResource
} from "@/data/towns/boards";
import type { TownBuildingDefinition } from "@/data/factions/types";
import { RESOURCE_ICONS } from "@/data/assets/homm-assets";
import {
  inCombatPrep,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { formatCost } from "@/components/table/utils";
import {
  BuildingDetailPanel,
  HireHeroesSection,
  TownRecruitSection,
  hasBuildingEffectPanel
} from "@/components/adventure/town-sections";
import { TownPanel } from "@/components/adventure/screen";

/**
 * The default Town window view: the physical board-game town board. Seven
 * building bars over the townscape (the real Archon scans where published,
 * a designed board in the same die-cut elsewhere), the printed definition
 * corner, the three resource-gain tracks with live production markers, and
 * the build / population / spell-book token wells as working buttons.
 *
 * Everything routes through the same legal actions as the classic TownPanel
 * (the "Buildings" toggle in the window), so the two views are always rule-
 * equivalent — this one just looks like the table.
 */

const RESOURCE_LABELS: Record<TownTrackResource, string> = {
  gold: "Gold",
  buildingMaterials: "Building materials (ore)",
  valuables: "Valuables (crystal)"
};

type OpenPanel =
  | { kind: "bar"; index: number }
  | { kind: "build" }
  | { kind: "recruit" }
  | { kind: "spell" }
  | { kind: "definitions" };

const pct = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;

/** The board-relative rectangle of a bar (fractions of the board box). */
function barRect(spec: TownBoardSpec, index: number) {
  const { window } = spec.geometry;
  return {
    left: window.left + index * window.barPitch,
    top: window.top,
    width: window.barPitch,
    height: window.bottom - window.top
  };
}

/**
 * A crop of the fully-built scan showing one bar, rendered by stretching the
 * full image inside an overflow-hidden window (no pre-cut image files: the
 * geometry fractions do the dividing).
 */
function FullScanCrop({ spec, index }: { spec: TownBoardSpec; index: number }) {
  const rect = barRect(spec, index);
  const style: CSSProperties = {
    position: "absolute",
    width: `${(1 / rect.width) * 100}%`,
    height: `${(1 / rect.height) * 100}%`,
    left: `${(-rect.left / rect.width) * 100}%`,
    top: `${(-rect.top / rect.height) * 100}%`,
    maxWidth: "none"
  };
  return <img alt="" aria-hidden="true" draggable={false} src={assetUrl(spec.fullImage!)} style={style} />;
}

/** Compact printed-style cost line: resource icon + amount pairs. */
function CostLine({ cost }: { cost: TownBuildingDefinition["cost"] }) {
  const parts = (
    [
      ["gold", cost.gold],
      ["buildingMaterials", cost.buildingMaterials],
      ["valuables", cost.valuables]
    ] as const
  ).filter((entry): entry is [TownTrackResource, number] => Boolean(entry[1]));
  if (parts.length === 0) {
    return <small className="tbCost">free</small>;
  }
  return (
    <small className="tbCost" title={formatCost(cost)}>
      {parts.map(([resource, amount]) => (
        <span key={resource}>
          {amount}
          <img alt={RESOURCE_LABELS[resource]} src={assetUrl(RESOURCE_ICONS[resource])} />
        </span>
      ))}
    </small>
  );
}

/**
 * An overlay image that stays invisible until it actually loads and unmounts
 * on error — no broken-image flash while a fallback chain resolves.
 */
function LoadedImg({ src, className, style }: { src: string; className: string; style?: CSSProperties }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  if (status === "failed") {
    return null;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
      onError={() => setStatus("failed")}
      onLoad={() => setStatus("ready")}
      src={assetUrl(src)}
      style={{ ...style, visibility: status === "ready" ? "visible" : "hidden" }}
    />
  );
}

/**
 * Designed tile fill for one built building. Art fallback chain:
 *  1. dedicated tile art (public/assets/town-board/, see its README — the
 *     drop-in slot for future generated art),
 *  2. the PC-game building render already shipped for the classic town panel
 *     (building.assets.image), floating over the bar,
 *  3. nothing — the plaque alone marks the build.
 * A bright slice of the fully-built townscape panorama backs whichever art
 * wins (the empty window is dimmed, so a built bar visibly lights up).
 */
function DesignedTile({
  building,
  spec,
  barIndex,
  factionColor,
  compact
}: {
  building: TownBuildingDefinition;
  spec: TownBoardSpec;
  barIndex: number;
  factionColor: string;
  compact: boolean;
}) {
  return (
    <div className={`tbDesignedTile ${compact ? "compact" : ""}`} style={{ "--tb-faction": factionColor } as CSSProperties}>
      {spec.panoramaImage ? (
        // The bar's slice of the panorama: an image sized to the whole window
        // (7 bars wide) shifted left by the bar index — the same cover crop as
        // the dimmed backdrop, shown at full brightness.
        <img
          alt=""
          aria-hidden="true"
          className="tbPanoramaSlice"
          draggable={false}
          src={assetUrl(spec.panoramaImage)}
          style={{ width: "700%", left: `${-barIndex * 100}%` }}
        />
      ) : null}
      {building.assets?.image ? <LoadedImg className="tbTilePcArt" src={building.assets.image} /> : null}
      {/* Custom tile art renders above the PC fallback and covers it fully. */}
      <LoadedImg className="tbTileArt" src={townBoardTileArt(building.id)} />
      <span className="tbTilePlaque">
        <Check aria-hidden="true" size={compact ? 10 : 12} />
        {building.name}
      </span>
    </div>
  );
}

/** The empty-bar plate (name + cost) drawn on designed boards. */
function DesignedPlate({ building }: { building: TownBuildingDefinition }) {
  return (
    <span className="tbPlate">
      <b>{building.name}</b>
      <CostLine cost={building.cost} />
    </span>
  );
}

export function TownBoardView({
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
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  // Panels close when the round advances or the seat changes.
  const [panelKey, setPanelKey] = useState("");
  const nextPanelKey = `${state.round}|${viewerPlayerId}`;
  if (panelKey !== nextPanelKey) {
    setPanelKey(nextPanelKey);
    setOpenPanel(null);
  }

  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  const spec = faction ? townBoardSpecs[faction.id] : undefined;

  if (!player || !town || !faction || !spec) {
    return null;
  }

  const geometry = spec.geometry;
  const isScan = Boolean(spec.emptyImage);
  const built = (buildingId: string) => town.buildings.includes(buildingId);

  const buildActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "BUILD_STRUCTURE" }> } =>
      legal.action.type === "BUILD_STRUCTURE"
  );
  const buildActionFor = (buildingId: string) =>
    buildActions.find((legal) => legal.action.buildingId === buildingId);

  // Population purchases stay open during this player's own pre-battle prep.
  const populationOpen = player.townTokens.population && (!state.combat || inCombatPrep(state, viewerPlayerId));

  const mageGuild = faction.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "MAGE_GUILD");

  const tokenStates: Record<"build" | "population" | "spellBook", { spent: boolean; note: string }> = {
    build: {
      spent: !player.townTokens.build,
      note: player.townTokens.build
        ? "Build token ready — construct one structure this round."
        : "Build token spent — it refreshes next round."
    },
    population: {
      spent: !populationOpen,
      note: populationOpen
        ? "Population token ready — recruit & reinforce while the window is open."
        : player.townTokens.population
          ? "Recruiting is paused during combat."
          : "Population window closed — it reopens next round."
    },
    spellBook: {
      spent: !player.townTokens.spellBook,
      note: player.townTokens.spellBook
        ? mageGuild && built(mageGuild.id)
          ? `Spell Book token ready — buy spells at the ${mageGuild.name}.`
          : `Spell Book token ready — build the ${mageGuild?.name ?? "Mage Guild"} to buy spells.`
        : "Spell Book token spent — it refreshes next round."
    }
  };

  const closePanel = () => setOpenPanel(null);
  const togglePanel = (panel: OpenPanel) =>
    setOpenPanel((current) => (JSON.stringify(current) === JSON.stringify(panel) ? null : panel));

  // ---- panels ---------------------------------------------------------------

  const buildRequirementNote = (building: TownBuildingDefinition): string => {
    const prerequisites = (building.prerequisites ?? [])
      .map((prerequisite) => coreBuildingDefinitions[prerequisite]?.name ?? prerequisite)
      .filter((name) => name.length > 0);
    const parts = [formatCost(building.cost) || "free"];
    if (prerequisites.length > 0) {
      parts.push(`needs ${prerequisites.join(", ")}`);
    }
    return parts.join(" · ");
  };

  const buildingRow = (buildingId: string): ReactNode => {
    const building = coreBuildingDefinitions[buildingId];
    if (!building) {
      return null;
    }
    const legal = buildActionFor(buildingId);
    const isBuilt = built(buildingId);
    const missingPrereq = (building.prerequisites ?? []).some((prerequisite) => !built(prerequisite));
    return (
      <div className={`tbBuildRow ${isBuilt ? "built" : ""}`} key={buildingId}>
        <span className="tbBuildName">
          {isBuilt ? <Check aria-hidden="true" size={12} /> : <Hammer aria-hidden="true" size={12} />}
          <b>{building.name}</b>
        </span>
        <small>{isBuilt ? "built" : buildRequirementNote(building)}</small>
        {!isBuilt && legal ? (
          <button className="commandButton primary" onClick={() => onAction(legal.action)} type="button">
            Build
          </button>
        ) : null}
        {!isBuilt && !legal ? (
          <small className="tbBuildBlocked">
            {!player.townTokens.build
              ? "build token spent"
              : missingPrereq
                ? "prerequisite missing"
                : "not available now"}
          </small>
        ) : null}
      </div>
    );
  };

  const panelDock = (() => {
    if (!openPanel) {
      return null;
    }
    if (openPanel.kind === "bar") {
      const bar = spec.bars[openPanel.index] ?? [];
      return (
        <PanelShell onClose={closePanel} title={bar.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(" & ")}>
          {bar.map((buildingId) => {
            const building = coreBuildingDefinitions[buildingId];
            if (!building) {
              return null;
            }
            if (!built(buildingId)) {
              return (
                <div className="tbPanelSection" key={buildingId}>
                  {buildingRow(buildingId)}
                  <p className="buildingDetailText">{describeBuildingEffect(building)}</p>
                </div>
              );
            }
            return (
              <div className="tbPanelSection" key={buildingId}>
                {hasBuildingEffectPanel(building) ? (
                  <BuildingDetailPanel
                    building={building}
                    legalActions={legalActions}
                    onAction={onAction}
                    state={state}
                    viewerPlayerId={viewerPlayerId}
                  />
                ) : (
                  <div className="townActions townBuildingDetail" aria-label={`${building.name} effect`}>
                    <h4>
                      {building.name}
                      <small>built</small>
                    </h4>
                    <p className="buildingDetailText">{describeBuildingEffect(building)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </PanelShell>
      );
    }
    if (openPanel.kind === "build") {
      return (
        <PanelShell onClose={closePanel} title="Construction — build a structure">
          <small className="tbPanelHint">
            The Build token raises one structure per round: pay the cost, prerequisites first. A finished building
            fills its bar on the board above.
          </small>
          {faction.buildings.map((buildingId) => buildingRow(buildingId))}
        </PanelShell>
      );
    }
    if (openPanel.kind === "recruit") {
      return (
        <PanelShell onClose={closePanel} title="Population — recruit & reinforce">
          {populationOpen ? (
            <TownRecruitSection
              legalActions={legalActions}
              onAction={onAction}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : (
            <small className="tbPanelHint">{tokenStates.population.note}</small>
          )}
        </PanelShell>
      );
    }
    if (openPanel.kind === "spell") {
      return (
        <PanelShell onClose={closePanel} title={`Spell Book — ${mageGuild?.name ?? "Mage Guild"}`}>
          {mageGuild && built(mageGuild.id) ? (
            <BuildingDetailPanel
              building={mageGuild}
              legalActions={legalActions}
              onAction={onAction}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : (
            <>
              <small className="tbPanelHint">{tokenStates.spellBook.note}</small>
              {mageGuild ? buildingRow(mageGuild.id) : null}
            </>
          )}
        </PanelShell>
      );
    }
    // definitions
    return (
      <PanelShell onClose={closePanel} title={`${faction.name} — building definitions`}>
        {faction.buildings.map((buildingId) => {
          const building = coreBuildingDefinitions[buildingId];
          if (!building) {
            return null;
          }
          const timing = buildingTimingLabel(building);
          return (
            <div className="tbDefinitionCard" key={buildingId}>
              <h4>
                {building.name}
                <small>
                  {formatCost(building.cost) || "free"}
                  {timing ? ` · ${timing}` : ""}
                </small>
              </h4>
              <p>{describeBuildingEffect(building)}</p>
            </div>
          );
        })}
      </PanelShell>
    );
  })();

  // ---- board ----------------------------------------------------------------

  return (
    <section className="tbRoot" aria-label={`${faction.name} town board`}>
      <div
        className={`tbBoard ${isScan ? "scan" : "designed"}`}
        style={{ aspectRatio: `${geometry.aspect[0]} / ${geometry.aspect[1]}`, "--tb-faction": faction.color } as CSSProperties}
      >
        {isScan ? (
          <img alt={`${faction.name} town board`} className="tbBoardBase" draggable={false} src={assetUrl(spec.emptyImage!)} />
        ) : (
          <div className="tbBoardBase tbDesignedBase">
            <div
              className="tbDesignedWindow"
              style={{
                left: pct(geometry.window.left),
                top: pct(geometry.window.top),
                width: pct(7 * geometry.window.barPitch),
                height: pct(geometry.window.bottom - geometry.window.top)
              }}
            >
              {spec.panoramaImage ? (
                <img alt="" aria-hidden="true" draggable={false} src={assetUrl(spec.panoramaImage)} />
              ) : null}
            </div>
            <span className="tbDesignedTitle">{faction.name}</span>
          </div>
        )}

        {/* --- building bars ------------------------------------------------ */}
        {spec.bars.map((bar, index) => {
          const rect = barRect(spec, index);
          const builtIds = bar.filter((buildingId) => built(buildingId));
          const missingIds = bar.filter((buildingId) => !built(buildingId));
          const partial = builtIds.length > 0 && missingIds.length > 0;
          const anyBuildable = bar.some((buildingId) => buildActionFor(buildingId));
          const style: CSSProperties = {
            left: pct(rect.left),
            top: pct(rect.top),
            width: pct(rect.width),
            height: pct(rect.height)
          };
          const label = bar
            .map((buildingId) => {
              const name = coreBuildingDefinitions[buildingId]?.name ?? buildingId;
              return `${name} (${built(buildingId) ? "built" : "not built"})`;
            })
            .join(", ");
          return (
            <div className={`tbBar ${partial ? "partial" : ""}`} key={index} style={style}>
              {builtIds.length > 0 ? (
                spec.fullImage ? (
                  <div className={`tbFill ${partial ? "partial" : ""}`}>
                    <FullScanCrop index={index} spec={spec} />
                  </div>
                ) : (
                  <div className={`tbFill designed ${partial ? "partial" : ""}`}>
                    {builtIds.map((buildingId) => {
                      const building = coreBuildingDefinitions[buildingId];
                      return building ? (
                        <DesignedTile
                          barIndex={index}
                          building={building}
                          compact={bar.length > 1}
                          factionColor={faction.color}
                          key={buildingId}
                          spec={spec}
                        />
                      ) : null;
                    })}
                  </div>
                )
              ) : !isScan ? (
                // Designed empty bar: the printed-style plates.
                <div className="tbEmptyBar">
                  {bar.map((buildingId) => {
                    const building = coreBuildingDefinitions[buildingId];
                    return building ? <DesignedPlate building={building} key={buildingId} /> : null;
                  })}
                </div>
              ) : null}
              {partial ? (
                <span className="tbPartialNote" title={`${missingIds.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(", ")} shares this bar and is not built yet`}>
                  <Hammer aria-hidden="true" size={10} />
                  {missingIds.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(", ")} not built
                </span>
              ) : null}
              <button
                aria-expanded={openPanel?.kind === "bar" && openPanel.index === index}
                aria-label={`Bar ${index + 1}: ${label}`}
                className={`tbBarHit ${anyBuildable ? "buildable" : ""}`}
                onClick={() => togglePanel({ kind: "bar", index })}
                title={label}
                type="button"
              >
                {anyBuildable ? (
                  <span className="tbBuildBadge">
                    <Hammer aria-hidden="true" size={11} />
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}

        {/* --- building definitions corner ----------------------------------- */}
        {isScan ? (
          <button
            aria-label="Building definitions"
            className="tbDefsHit"
            onClick={() => togglePanel({ kind: "definitions" })}
            style={{
              left: pct(geometry.definitions.left),
              top: pct(geometry.definitions.top),
              width: pct(geometry.definitions.right - geometry.definitions.left),
              height: pct(geometry.definitions.bottom - geometry.definitions.top)
            }}
            title="Read every building's engine-true definition"
            type="button"
          >
            <span className="tbDefsBadge">
              <Info aria-hidden="true" size={12} /> definitions
            </span>
          </button>
        ) : (
          <button
            aria-label="Building definitions"
            className="tbDefsHit designed"
            onClick={() => togglePanel({ kind: "definitions" })}
            style={{
              left: pct(geometry.definitions.left),
              top: pct(geometry.definitions.top),
              width: pct(geometry.definitions.right - geometry.definitions.left),
              height: pct(geometry.definitions.bottom - geometry.definitions.top)
            }}
            title="Read every building's engine-true definition"
            type="button"
          >
            <span className="tbDesignedDefs">
              {[
                ...new Set(
                  [
                    faction.buildings.find((id) => coreBuildingDefinitions[id]?.effect?.type === "RESOURCE_ROUND_CHOICE"),
                    faction.buildings.find((id) => coreBuildingDefinitions[id]?.effect?.type === "UNLOCK_REINFORCE"),
                    mageGuild?.id,
                    ...faction.buildings.filter(
                      (id) =>
                        !coreBuildingDefinitions[id]?.effect ||
                        !["RESOURCE_ROUND_CHOICE", "UNLOCK_REINFORCE", "MAGE_GUILD", "UNLOCK_RECRUIT_TIER"].includes(
                          coreBuildingDefinitions[id]?.effect?.type ?? ""
                        )
                    )
                  ].filter((id): id is string => Boolean(id))
                )
              ]
                .slice(0, 5)
                .map((buildingId) => {
                  const building = coreBuildingDefinitions[buildingId];
                  return building ? (
                    <span className="tbMiniCard" key={buildingId}>
                      <b>{building.name}</b>
                      <small>{describeBuildingEffect(building)}</small>
                    </span>
                  ) : null;
                })}
              <span className="tbMiniMore">
                <Info aria-hidden="true" size={11} /> all definitions
              </span>
            </span>
          </button>
        )}

        {/* --- resource-gain tracks ------------------------------------------ */}
        {geometry.tracks.rows.map((row) => {
          const production = player.production[row.resource] ?? 0;
          const step = row.values[1] - row.values[0];
          const rawIndex = Math.floor((production - row.values[0]) / step);
          const index = Math.min(Math.max(rawIndex, 0), row.values.length - 1);
          const x = geometry.tracks.firstCellX + index * geometry.tracks.cellPitchX;
          const y = row.y + (index % 2 === 1 ? geometry.tracks.zigzagDy : 0);
          return (
            <div key={row.resource}>
              {!isScan ? (
                <div className="tbTrackRow" aria-hidden="true">
                  <img
                    alt=""
                    className="tbTrackIcon"
                    src={assetUrl(RESOURCE_ICONS[row.resource])}
                    style={{ left: pct(geometry.tracks.iconX), top: pct(row.y) }}
                  />
                  {row.values.map((value, cellIndex) => (
                    <span
                      className="tbTrackCell"
                      key={value}
                      style={{
                        left: pct(geometry.tracks.firstCellX + cellIndex * geometry.tracks.cellPitchX),
                        top: pct(row.y + (cellIndex % 2 === 1 ? geometry.tracks.zigzagDy : 0))
                      }}
                    >
                      {value}
                    </span>
                  ))}
                </div>
              ) : null}
              <span
                className={`tbMarker ${row.resource}`}
                style={{ left: pct(x), top: pct(y) }}
                title={`${RESOURCE_LABELS[row.resource]}: +${production} every Resource round`}
              >
                {production}
              </span>
            </div>
          );
        })}

        {/* --- build / population / spell-book token wells --------------------- */}
        {geometry.tokens.slots.map((slot) => {
          const tokenState = tokenStates[slot.kind];
          const panel: OpenPanel =
            slot.kind === "build" ? { kind: "build" } : slot.kind === "population" ? { kind: "recruit" } : { kind: "spell" };
          const label =
            slot.kind === "build" ? "Construction" : slot.kind === "population" ? "Population" : "Spell Book";
          const icon =
            slot.kind === "build" ? (
              <Hammer aria-hidden="true" />
            ) : slot.kind === "population" ? (
              <Users aria-hidden="true" />
            ) : (
              <BookOpen aria-hidden="true" />
            );
          return (
            <button
              aria-label={`${label} — ${tokenState.note}`}
              className={`tbToken ${slot.kind} ${tokenState.spent ? "spent" : "ready"} ${!isScan ? "designed" : ""}`}
              key={slot.kind}
              onClick={() => togglePanel(panel)}
              style={{
                left: pct(slot.x),
                top: pct(slot.y),
                width: pct(2 * geometry.tokens.radius),
                aspectRatio: "1 / 1"
              }}
              title={tokenState.note}
              type="button"
            >
              {!isScan ? icon : null}
              {tokenState.spent ? <X aria-hidden="true" className="tbTokenSpent" /> : null}
            </button>
          );
        })}
      </div>

      {panelDock}

      <HireHeroesSection legalActions={legalActions} onAction={onAction} />
    </section>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="tbPanel" role="region" aria-label={title}>
      <header>
        <strong>{title}</strong>
        <button aria-label="Close panel" className="tbPanelClose" onClick={onClose} type="button">
          <X aria-hidden="true" size={14} />
        </button>
      </header>
      <div className="tbPanelBody">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Town window: a popup over the map hosting the board view (default) and
// the classic PC-art buildings view (TownPanel) behind a toggle.
// ---------------------------------------------------------------------------

const TOWN_VIEW_STORAGE_KEY = "h3bg-town-view";

export function TownWindow({
  open,
  onClose,
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  open: boolean;
  onClose: () => void;
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  // The last-used view persists across sessions. Reading localStorage in the
  // lazy initializer is hydration-safe here: the window renders nothing until
  // the player opens it, well after mount.
  const [view, setView] = useState<"board" | "buildings">(() => {
    try {
      const stored = typeof window === "undefined" ? null : window.localStorage.getItem(TOWN_VIEW_STORAGE_KEY);
      return stored === "buildings" ? "buildings" : "board";
    } catch {
      return "board";
    }
  });
  const pickView = (next: "board" | "buildings") => {
    setView(next);
    try {
      window.localStorage.setItem(TOWN_VIEW_STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only.
    }
  };

  // Esc closes the window (while open).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;

  if (!open || !player || !town || !faction) {
    return null;
  }

  return (
    <div aria-label={`${faction.name} town`} aria-modal="true" className="modalBackdrop townWindowBackdrop" onClick={onClose} role="dialog">
      <div className="townWindow" onClick={(event) => event.stopPropagation()}>
        <header className="townWindowHeader">
          <strong>{faction.name} town</strong>
          <small
            className="townWindowTokens"
            title="Build / Population / Spell book tokens — each once per round"
          >
            {player.townTokens.build ? "🔨" : "▫"} {player.townTokens.population ? "👥" : "▫"}{" "}
            {player.townTokens.spellBook ? "📖" : "▫"}
          </small>
          <div className="townWindowViews" role="tablist" aria-label="Town view">
            <button
              aria-selected={view === "board"}
              className={view === "board" ? "selected" : ""}
              onClick={() => pickView("board")}
              role="tab"
              type="button"
            >
              Board
            </button>
            <button
              aria-selected={view === "buildings"}
              className={view === "buildings" ? "selected" : ""}
              onClick={() => pickView("buildings")}
              role="tab"
              type="button"
            >
              Buildings
            </button>
          </div>
          <button aria-label="Close the town window" className="townWindowClose" onClick={onClose} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </header>
        <div className="townWindowBody">
          {view === "board" ? (
            <TownBoardView legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />
          ) : (
            <TownPanel legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />
          )}
        </div>
      </div>
    </div>
  );
}
