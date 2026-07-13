"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Hammer, Info, X } from "lucide-react";

import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import {
  TOWN_TOKEN_ICONS,
  townBoardSpecs,
  townBoardTileArt,
  townBoardUnbuiltTileArt,
  townIconUrl,
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
import { playLibrarySound, playSpellBookOpen } from "@/lib/sound";
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
 * Designed tile fill for one built building. Art layering (top wins):
 *  1. dedicated per-building tile art (public/assets/town-board/, see its
 *     README) — the real printed tile where one exists (all of Factory and
 *     Stronghold); a missing file simply never mounts,
 *  2. this bar's aligned slice of the fully-built townscape (factory, conflux,
 *     cove, bulwark), so the town gains its buildings in place; a shared
 *     (two-in-one) bar blurs its slice to read as the shared tile,
 *  3. the PC-game building render shipped for the classic town panel
 *     (building.assets.image), floating over the bar — only on boards with no
 *     built-town image to reveal (stronghold),
 *  4. nothing — the plaque alone marks the build.
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
  const revealSlice = spec.fullImage;
  return (
    <div className={`tbDesignedTile ${compact ? "compact" : ""}`} style={{ "--tb-faction": factionColor } as CSSProperties}>
      {revealSlice ? (
        // The bar's slice of the built town: an image sized to the whole window
        // (7 bars wide) shifted left by the bar index — cropped and shown at
        // full brightness over the clear empty background.
        <img
          alt=""
          aria-hidden="true"
          className="tbPanoramaSlice"
          draggable={false}
          src={assetUrl(revealSlice)}
          style={{ width: "700%", left: `${-barIndex * 100}%` }}
        />
      ) : null}
      {!revealSlice && building.assets?.image ? (
        <LoadedImg className="tbTilePcArt" src={building.assets.image} />
      ) : null}
      {/* The real printed tile, on top of whatever backdrop the board has —
          unmounts harmlessly where no file exists (conflux/cove/bulwark). */}
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

/**
 * The still-unbuilt half of a SHARED bar whose other building is already up:
 * a dimmed socket showing the plate + a clear "not built" marker, so a
 * two-in-one tile reads unambiguously — one half lit with its art, the other
 * plainly empty (and flagged buildable when it can go up now).
 */
function DesignedTileUnbuilt({
  building,
  compact,
  buildable
}: {
  building: TownBuildingDefinition;
  compact: boolean;
  buildable: boolean;
}) {
  return (
    <div
      className={`tbDesignedTile unbuilt ${compact ? "compact" : ""} ${buildable ? "buildable" : ""}`}
      aria-label={`${building.name} — not built`}
    >
      <DesignedPlate building={building} />
      <span className="tbUnbuiltPlaque">
        <Hammer aria-hidden="true" size={compact ? 10 : 12} />
        not built{buildable ? " · buildable" : ""}
      </span>
    </div>
  );
}

/**
 * A SHARED (two-in-one) bar whose faction ships a dedicated printed
 * DOUBLE-SIDED tile (`spec.combinedTile`) — the physical Stronghold board.
 * Instead of splitting the bar into two half-slots, it fills the whole bar with
 * the printed face that matches how many of the pair are built:
 *  - BOTH built → the `bothBuiltImage` face,
 *  - exactly ONE built → the `oneBuiltImage` face, shown CRISP (never blurred),
 *    plus a label naming which building is built (✓) and which is not (🔨) —
 *    the shared face alone can't say which half went up first.
 * Rendered only once at least one of the pair is built; an all-unbuilt shared
 * bar shows the empty board scan's printed plates through it.
 */
function CombinedTile({
  bar,
  built,
  oneBuiltImage,
  bothBuiltImage
}: {
  bar: readonly string[];
  built: (buildingId: string) => boolean;
  oneBuiltImage: string;
  bothBuiltImage: string;
}) {
  const builtIds = bar.filter((buildingId) => built(buildingId));
  const missingIds = bar.filter((buildingId) => !built(buildingId));
  const bothBuilt = missingIds.length === 0;
  const nameOf = (buildingId: string) => coreBuildingDefinitions[buildingId]?.name ?? buildingId;
  return (
    <div className="tbFill combined">
      <img
        alt=""
        aria-hidden="true"
        className="tbCombinedImg"
        draggable={false}
        src={assetUrl(bothBuilt ? bothBuiltImage : oneBuiltImage)}
      />
      {!bothBuilt ? (
        <span
          className="tbPartialNote split"
          title={`Built: ${builtIds.map(nameOf).join(", ")} · Not built (shares this tile): ${missingIds.map(nameOf).join(", ")}`}
        >
          <span className="tbPartialBuilt">
            <Check aria-hidden="true" size={10} />
            {builtIds.map(nameOf).join(", ")} built
          </span>
          <span className="tbPartialMissing">
            <Hammer aria-hidden="true" size={10} />
            {missingIds.map(nameOf).join(", ")} not built
          </span>
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real printed BUILDING-TILE slots (Factory): the physical portrait tiles show
// directly — the built illustration when raised, the name/cost plaque while
// unbuilt. A building with no printed tile on disk (e.g. the Artifact Merchants
// placeholder) falls back to a desert-styled plaque carrying its name + cost, so
// the slot always reads and a real scan dropped in later upgrades it for free.
// ---------------------------------------------------------------------------

/**
 * A printed tile that shows by default and hides itself only on a real 404, so
 * the name plate BEHIND it becomes the placeholder for any building with no
 * scan on disk yet. (Unlike LoadedImg's load-gating, this survives an image
 * served from cache — onLoad may never fire there, but the tile is visible from
 * the first paint.)
 */
function TileImg({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className="tbRealTileImg"
      draggable={false}
      onError={() => setFailed(true)}
      src={assetUrl(src)}
    />
  );
}

function RealBuiltTile({ building, compact }: { building: TownBuildingDefinition; compact: boolean }) {
  return (
    <div className={`tbRealTile built ${compact ? "compact" : ""}`}>
      {/* Name plate sits behind as the placeholder for a building with no printed
          tile on disk yet; the real tile (when present) loads on top and hides it. */}
      <span className="tbRealPlate" aria-hidden="true">
        <b>{building.name}</b>
        <small className="tbRealBuilt">
          <Check aria-hidden="true" size={compact ? 9 : 12} /> built
        </small>
      </span>
      <TileImg src={townBoardTileArt(building.id)} />
      <span className="tbRealBuiltBadge" aria-hidden="true">
        <Check size={compact ? 9 : 12} />
      </span>
    </div>
  );
}

function RealUnbuiltTile({
  building,
  compact,
  buildable
}: {
  building: TownBuildingDefinition;
  compact: boolean;
  buildable: boolean;
}) {
  return (
    <div
      className={`tbRealTile unbuilt ${compact ? "compact" : ""} ${buildable ? "buildable" : ""}`}
      aria-label={`${building.name} — not built`}
    >
      <span className="tbRealPlate" aria-hidden="true">
        <b>{building.name}</b>
        <CostLine cost={building.cost} />
      </span>
      <TileImg src={townBoardUnbuiltTileArt(building.id)} />
      {buildable ? (
        <span className="tbRealBuildBadge" aria-hidden="true">
          <Hammer size={compact ? 9 : 12} /> Build
        </span>
      ) : null}
    </div>
  );
}

/** One realTileArt bar: every slot as its printed portrait tile (built art or
 *  name/cost plaque). Used for the whole bar whether or not anything is built. */
function RealTileBar({
  bar,
  built,
  buildableOf,
  compact
}: {
  bar: readonly string[];
  built: (buildingId: string) => boolean;
  buildableOf: (buildingId: string) => boolean;
  compact: boolean;
}) {
  return (
    <div className="tbFill designed realTiles">
      {bar.map((buildingId) => {
        const building = coreBuildingDefinitions[buildingId];
        if (!building) {
          return null;
        }
        return built(buildingId) ? (
          <RealBuiltTile building={building} compact={compact} key={buildingId} />
        ) : (
          <RealUnbuiltTile building={building} buildable={buildableOf(buildingId)} compact={compact} key={buildingId} />
        );
      })}
    </div>
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

  // The panel is a real modal dialog, so Escape must dismiss IT first — captured
  // ahead of the Town window's own Escape-to-close so a build/recruit/spell
  // dialog closes without also tearing down the whole town window.
  useEffect(() => {
    if (!openPanel) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.preventDefault();
        playLibrarySound("ui/button", 0.3);
        setOpenPanel(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openPanel]);

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

  // Opening/closing a panel plays a matching cue: the Spell Book riffles, the
  // Population well musters, the rest click; closing gives a soft click so the
  // modal reads as a real, dismissible window.
  const closePanel = () => {
    if (openPanel) {
      playLibrarySound("ui/button", 0.3);
    }
    setOpenPanel(null);
  };
  const openPanelSound = (panel: OpenPanel) => {
    if (panel.kind === "spell") {
      playSpellBookOpen();
    } else if (panel.kind === "recruit") {
      playLibrarySound("adventure/military", 0.4);
    } else {
      playLibrarySound("ui/button", 0.45);
    }
  };
  const togglePanel = (panel: OpenPanel) => {
    const same = openPanel !== null && JSON.stringify(openPanel) === JSON.stringify(panel);
    if (same) {
      closePanel();
      return;
    }
    openPanelSound(panel);
    setOpenPanel(panel);
  };

  // Constructing a building: the H3 build-town cue, then the finished panel
  // closes so the newly-lit bar on the board above is what the player sees.
  const buildStructure = (action: GameAction) => {
    playLibrarySound("adventure/build-town", 0.6);
    onAction(action);
    setOpenPanel(null);
  };

  // ---- panels ---------------------------------------------------------------

  const RESOURCE_ORDER: readonly TownTrackResource[] = ["gold", "buildingMaterials", "valuables"];

  const buildingRow = (buildingId: string): ReactNode => {
    const building = coreBuildingDefinitions[buildingId];
    if (!building) {
      return null;
    }
    const legal = buildActionFor(buildingId);
    const isBuilt = built(buildingId);
    const missingPrereq = (building.prerequisites ?? []).some((prerequisite) => !built(prerequisite));
    const prereqNames = (building.prerequisites ?? []).map(
      (prerequisite) => coreBuildingDefinitions[prerequisite]?.name ?? prerequisite
    );
    const costEntries = RESOURCE_ORDER.map(
      (resource) => [resource, building.cost[resource] ?? 0] as const
    ).filter(([, amount]) => amount > 0);
    const cannotAfford = costEntries.some(([resource, amount]) => (player.resources[resource] ?? 0) < amount);
    return (
      <div className={`tbBuildRow ${isBuilt ? "built" : ""}`} key={buildingId}>
        <div className="tbBuildInfo">
          <span className="tbBuildName">
            {isBuilt ? <Check aria-hidden="true" size={12} /> : <Hammer aria-hidden="true" size={12} />}
            <b>{building.name}</b>
          </span>
          {isBuilt ? (
            <small className="tbBuildDone">built</small>
          ) : (
            // Cost vs. what you actually have, per resource — green when you can
            // cover it, red when you are short, so "can I build this?" is legible.
            <span className="tbBuildCostGrid" aria-label={`cost: ${formatCost(building.cost) || "free"}`}>
              {costEntries.length === 0 ? (
                <small className="tbCostFree">free</small>
              ) : (
                costEntries.map(([resource, amount]) => {
                  const have = player.resources[resource] ?? 0;
                  const enough = have >= amount;
                  return (
                    <span
                      className={`tbCostChip ${enough ? "ok" : "short"}`}
                      key={resource}
                      title={`${RESOURCE_LABELS[resource]}: costs ${amount}, you have ${have}`}
                    >
                      <img alt="" aria-hidden="true" src={assetUrl(RESOURCE_ICONS[resource])} />
                      <b>{amount}</b>
                      <small>have {have}</small>
                    </span>
                  );
                })
              )}
            </span>
          )}
          {!isBuilt && prereqNames.length > 0 ? (
            <small className={`tbBuildPrereq ${missingPrereq ? "missing" : "met"}`}>
              {missingPrereq ? "needs " : "requires "}
              {prereqNames.join(", ")}
            </small>
          ) : null}
        </div>
        {!isBuilt && legal ? (
          <button className="commandButton primary tbBuildGo" onClick={() => buildStructure(legal.action)} type="button">
            <Hammer aria-hidden="true" size={12} /> Build
          </button>
        ) : null}
        {!isBuilt && !legal ? (
          <small className="tbBuildBlocked">
            {!player.townTokens.build
              ? "build token spent this round"
              : missingPrereq
                ? "build the prerequisite first"
                : cannotAfford
                  ? "not enough resources"
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
            The Build token raises one structure per round: pay the cost, prerequisites first. Nothing is spent until
            you press <b>Build</b> — close this window (Esc) to cancel. A finished building lights up its bar on the
            board above.
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
            {/* The authentic printed tracks/tokens panel, pasted back at the
                exact fractional rectangle it was cropped from. */}
            {spec.panelImage && geometry.panel ? (
              <img
                alt=""
                aria-hidden="true"
                className="tbPanelArt"
                draggable={false}
                src={assetUrl(spec.panelImage)}
                style={{
                  left: pct(geometry.panel.left),
                  top: pct(geometry.panel.top),
                  width: pct(geometry.panel.right - geometry.panel.left),
                  height: pct(geometry.panel.bottom - geometry.panel.top)
                }}
              />
            ) : (
              <span className="tbDesignedTitle">{faction.name}</span>
            )}
          </div>
        )}

        {/* --- building bars ------------------------------------------------ */}
        {spec.bars.map((bar, index) => {
          const rect = barRect(spec, index);
          const builtIds = bar.filter((buildingId) => built(buildingId));
          const missingIds = bar.filter((buildingId) => !built(buildingId));
          const partial = builtIds.length > 0 && missingIds.length > 0;
          // The unique two-building bar renders as one printed double-sided tile
          // (no split, no blur) when the board ships a `combinedTile`.
          const combinedBar = Boolean(spec.combinedTile) && bar.length === 2;
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
            <div className={`tbBar ${partial && !combinedBar ? "partial" : ""}`} key={index} style={style}>
              {/* Invisible FX anchors — one per building in this bar — so the
                  construction burst (page.tsx) can land on the bar whichever
                  board render path drew it (designed / scan / real-tile). */}
              {bar.map((buildingId) => (
                <span
                  aria-hidden="true"
                  className="tbFxAnchor"
                  data-fx-anchor={`building:${buildingId}`}
                  key={`fx-${buildingId}`}
                />
              ))}
              {spec.realTileArt ? (
                // Real printed portrait tiles (Factory): each slot shows its own
                // tile — the built illustration or the name/cost plaque — the
                // whole bar, built or not, so it reads exactly like the board.
                <RealTileBar
                  bar={bar}
                  built={built}
                  buildableOf={(buildingId) => Boolean(buildActionFor(buildingId))}
                  compact={bar.length > 1}
                />
              ) : combinedBar && builtIds.length > 0 ? (
                // The printed double-sided shared tile: one crisp face for the
                // whole bar (both-built or one-built), never split or blurred.
                <CombinedTile
                  bar={bar}
                  built={built}
                  oneBuiltImage={spec.combinedTile!.oneBuiltImage}
                  bothBuiltImage={spec.combinedTile!.bothBuiltImage}
                />
              ) : builtIds.length > 0 ? (
                // A real printed board scan crops its one fully-built photo per
                // bar. Designed boards instead reveal the built-town image a
                // slice at a time inside each DesignedTile (below), so they stay
                // in the per-building branch to keep the two-in-one-bar rule.
                isScan && spec.fullImage ? (
                  <div className={`tbFill ${partial ? "partial" : ""}`}>
                    <FullScanCrop index={index} spec={spec} />
                  </div>
                ) : (
                  // Designed board: render EVERY building in the bar as its own
                  // slot — the built one lit with the built-town slice + its tile
                  // art, an unbuilt shared-bar neighbour as a plainly-empty "not
                  // built" socket — so a two-in-one tile's state is never
                  // ambiguous.
                  <div className={`tbFill designed ${partial ? "partial" : ""}`}>
                    {bar.map((buildingId) => {
                      const building = coreBuildingDefinitions[buildingId];
                      if (!building) {
                        return null;
                      }
                      return built(buildingId) ? (
                        <DesignedTile
                          barIndex={index}
                          building={building}
                          compact={bar.length > 1}
                          factionColor={faction.color}
                          key={buildingId}
                          spec={spec}
                        />
                      ) : (
                        <DesignedTileUnbuilt
                          building={building}
                          buildable={Boolean(buildActionFor(buildingId))}
                          compact={bar.length > 1}
                          key={buildingId}
                        />
                      );
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
              {/* Scan boards paint the whole bar from ONE fully-built crop, so a
                  two-in-one bar with just one building up looks like both are
                  built. Name BOTH halves — which is built (✓) and which is not
                  (🔨) — so the player can tell them apart. Designed boards show
                  each half as its own tile/socket, so they need no note. */}
              {partial && !combinedBar && isScan && spec.fullImage ? (
                <span
                  className="tbPartialNote split"
                  title={`Built: ${builtIds.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(", ")} · Not built (shares this bar): ${missingIds.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(", ")}`}
                >
                  <span className="tbPartialBuilt">
                    <Check aria-hidden="true" size={10} />
                    {builtIds.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(", ")} built
                  </span>
                  <span className="tbPartialMissing">
                    <Hammer aria-hidden="true" size={10} />
                    {missingIds.map((id) => coreBuildingDefinitions[id]?.name ?? id).join(", ")} not built
                  </span>
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
              {/* CSS track cells only where no print provides them (neither a
                  board scan nor the authentic pasted panel). */}
              {!isScan && !spec.panelImage ? (
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
          return (
            <button
              aria-label={`${label} — ${tokenState.note}`}
              className={`tbToken ${slot.kind} ${tokenState.spent ? "spent" : "ready"} ${!isScan && !spec.panelImage ? "designed" : ""}`}
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
              {/* Scan boards and the pasted panel already print the tokens; a
                  designed board without either shows the authentic token icon
                  cropped from the real board. */}
              {!isScan && !spec.panelImage ? (
                <img alt="" aria-hidden="true" className="tbTokenImg" draggable={false} src={assetUrl(TOWN_TOKEN_ICONS[slot.kind])} />
              ) : null}
              {tokenState.spent ? <X aria-hidden="true" className="tbTokenSpent" /> : null}
            </button>
          );
        })}
      </div>

      {/* The panel is a real modal dialog centred over the board (not an inline
          strip below it) so a build/recruit/spell action is impossible to miss.
          Backdrop click / the ✕ / Esc all close it. */}
      {panelDock ? (
        <div className="tbPanelBackdrop" role="presentation" onClick={closePanel}>
          <div className="tbPanelModal" onClick={(event) => event.stopPropagation()}>
            {panelDock}
          </div>
        </div>
      ) : null}

      <HireHeroesSection legalActions={legalActions} onAction={onAction} />
    </section>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="tbPanel" role="dialog" aria-modal="true" aria-label={title}>
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
          <LoadedImg className="townWindowIcon" src={townIconUrl(faction.id)} />
          <strong>{faction.name} town</strong>
          {/* Current treasury at a glance — same chips as the adventure HUD so
              build costs on the board can be compared without leaving the window. */}
          <div className="townWindowResources" aria-label="Your resources">
            {(
              [
                { key: "gold" as const, label: "Gold" },
                { key: "buildingMaterials" as const, label: "Building materials (ore)" },
                { key: "valuables" as const, label: "Valuables (crystal)" }
              ] as const
            ).map((resource) => (
              <span
                className="resourceChip townWindowResourceChip"
                key={resource.key}
                title={`${resource.label}: ${player.resources[resource.key]} — income +${player.production[resource.key]} each resource round`}
              >
                <img alt={resource.label} className="resourceIcon" src={assetUrl(RESOURCE_ICONS[resource.key])} />
                <b>{player.resources[resource.key]}</b>
                <small className="incomeTag">+{player.production[resource.key]}</small>
              </span>
            ))}
          </div>
          <small
            className="townWindowTokens"
            title="Build / Population / Spell book tokens — each once per round"
          >
            <img alt="Build token" className={player.townTokens.build ? "on" : "off"} src={assetUrl(TOWN_TOKEN_ICONS.build)} />
            <img
              alt="Population token"
              className={player.townTokens.population ? "on" : "off"}
              src={assetUrl(TOWN_TOKEN_ICONS.population)}
            />
            <img
              alt="Spell Book token"
              className={player.townTokens.spellBook ? "on" : "off"}
              src={assetUrl(TOWN_TOKEN_ICONS.spellBook)}
            />
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
