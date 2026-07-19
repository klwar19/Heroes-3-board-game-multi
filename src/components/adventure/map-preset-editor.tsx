"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpDown, Clock3, Copy, Plus, Trash2 } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { DESIGNER_UI_ICONS, REWARD_GLYPH_ICONS, SECRET_FEATURE_ICONS } from "@/data/assets/homm-assets";
import { listStoryScenes } from "@/data/story/scenes";
import {
  CUSTOM_WIN_CONDITION_OPTIONS,
  DEFAULT_VICTORY_CONDITION_VP,
  defaultCustomWinCondition,
  defaultObeliskBonusForKind,
  defaultTimedEffect,
  defaultTimedEvent,
  defaultVictoryPointObjective,
  describeCustomMapPresetEntries,
  describeObjectivesConfig,
  describeVictoryPointsConfig,
  describeTimedMapEffect,
  describeTimedEventSchedule,
  MAX_CUSTOM_WIN_CONDITIONS,
  MAX_OBELISK_BONUSES,
  MAX_TIMED_EVENTS,
  MAX_VICTORY_POINT_OBJECTIVES,
  MAP_PRESET_BUILDING_OPTIONS,
  MAP_PRESET_DIFFICULTY_OPTIONS,
  MAP_PRESET_OBELISK_BONUS_KINDS,
  MAP_PRESET_OBELISK_ROLE_OPTIONS,
  MAP_PRESET_VICTORY_OPTIONS,
  TIMED_EFFECT_KIND_LABELS,
  TIMED_EFFECT_KINDS,
  VICTORY_POINT_OBJECTIVE_OPTIONS,
  MAX_HEX_EVENTS,
  type CustomGuardSpec,
  type CustomMapObeliskBonus,
  type CustomMapObeliskConfig,
  type CustomMapSettlementConfig,
  type CustomMapPreset,
  type CustomMapStartingBonus,
  type CustomMapTilePlan,
  type CustomMapTimedEffect,
  type CustomMapTimedEvent,
  type CustomStartingUnit,
  type CustomWinCondition,
  type TimedEffectKind,
  type UnitLevel,
  type VictoryMode,
  type VictoryPointObjective
} from "@/engine";
import { GuardSpecEditor } from "./guard-spec-editor";
import {
  describeTileSpecificPlan,
  planEligibleForPick,
  type SpecificPickKind
} from "./map-designer";

/**
 * Map designer panel: mission-book style conditions (resources, army, buildings,
 * victory, timed events, notes). All map-only — applied when the map is picked.
 */

/**
 * Win-condition kinds the editor OFFERS for new rows. The object-scoped kinds
 * (control-towns / flag-mines / obelisks / defeat-dragon-utopia) moved to the
 * Map objects group as per-object "first clear wins" ticks — legacy maps that
 * already carry one keep rendering and stay engine-supported; the picker just
 * no longer offers the duplicates.
 */
const OFFERED_WIN_CONDITION_OPTIONS = CUSTOM_WIN_CONDITION_OPTIONS.filter(
  (entry) =>
    entry.id !== "control-towns" &&
    entry.id !== "flag-mines" &&
    entry.id !== "obelisks" &&
    entry.id !== "defeat-dragon-utopia"
);

/** Plain-words tile label for the SPECIFIC lists ("Ⅱ–Ⅲ tile N15 @4,6"). */
function specificTileLabel(plan: CustomMapTilePlan): string {
  const band =
    plan.group === "far"
      ? "Ⅱ–Ⅲ"
      : plan.group === "near"
        ? "Ⅳ–Ⅴ"
        : plan.group === "center"
          ? "Ⅵ–Ⅶ"
          : plan.group;
  const id = plan.tileDefId ? ` ${plan.tileDefId}` : plan.faceDown ? " (face-down)" : "";
  return `${band}${id} @${plan.row},${plan.col}`;
}

/**
 * The SPECIFIC half of a Global | Specific object section: lists the tiles
 * that carry a per-tile setting for this kind (with a plain-words summary) and
 * arms the on-map pick. Warns — instead of a dead button — when the map has no
 * eligible tile yet. Editing happens in the tile's own options panel (the pick
 * opens it); this list is the overview + jump-off.
 */
function SpecificModePanel({
  kind,
  tiles,
  onPickOnMap,
  pickArmed,
  emptyWarning
}: {
  kind: SpecificPickKind;
  tiles: CustomMapTilePlan[];
  onPickOnMap: (request: { kind: "object-plan"; objectKind: SpecificPickKind }) => void;
  pickArmed: boolean;
  emptyWarning: string;
}) {
  const withPlans = tiles
    .map((plan) => ({ plan, summary: describeTileSpecificPlan(plan, kind) }))
    .filter((entry) => entry.summary.length > 0);
  const eligible = tiles.some((plan) => planEligibleForPick(plan, kind));
  return (
    <div className="mapPresetSpecificPanel" data-specific-kind={kind}>
      {withPlans.length > 0 ? (
        <ul className="mapPresetEntryList mapPresetSpecificList">
          {withPlans.map(({ plan, summary }) => (
            <li key={`${plan.row},${plan.col}`}>
              <strong>{specificTileLabel(plan)}</strong> — {summary}
            </li>
          ))}
        </ul>
      ) : (
        <small className="mapPresetHint">
          No tile carries a specific {kind === "center" ? "center-objective" : kind} setting yet.
        </small>
      )}
      {eligible ? (
        <button
          aria-pressed={pickArmed}
          className={`mapPresetChip mapPresetPickChip${pickArmed ? " active" : ""}`}
          onClick={() => onPickOnMap({ kind: "object-plan", objectKind: kind })}
          title="Highlights the eligible tiles on the map above — click one to open its options."
          type="button"
        >
          📍 {pickArmed ? "Picking… (click a highlighted tile)" : "Pick a tile on the map"}
        </button>
      ) : (
        <small className="mapPresetHint mapPresetPickWarning" role="status">
          ⚠ {emptyWarning}
        </small>
      )}
      <small className="mapPresetHint">
        A specific setting overrides the map-wide one for that tile; fields left unset fall back to it.
      </small>
    </div>
  );
}

/** The Global | Specific mode chips one object section shows at its top. */
function GlobalSpecificTabs({
  mode,
  onMode,
  specificCount
}: {
  mode: "global" | "specific";
  onMode: (mode: "global" | "specific") => void;
  specificCount: number;
}) {
  return (
    <div className="mapPresetChipRow mapPresetModeTabs" role="group" aria-label="Global or specific">
      <button
        aria-pressed={mode === "global"}
        className={`mapPresetChip${mode === "global" ? " active" : ""}`}
        onClick={() => onMode("global")}
        title="One setting for EVERY such object on the map."
        type="button"
      >
        🌍 Global
      </button>
      <button
        aria-pressed={mode === "specific"}
        className={`mapPresetChip${mode === "specific" ? " active" : ""}`}
        onClick={() => onMode("specific")}
        title="Per-tile settings — pick a tile on the map; overrides the global setting there."
        type="button"
      >
        📍 Specific{specificCount > 0 ? ` (${specificCount})` : ""}
      </button>
    </div>
  );
}
export function MapPresetEditor({
  preset,
  onChange,
  tiles,
  onPickOnMap,
  pickArmed = null
}: {
  preset: CustomMapPreset | undefined;
  onChange: (next: CustomMapPreset | undefined) => void;
  /** The designed tiles — lets the object sections list/offer SPECIFIC (per-tile) settings. */
  tiles?: CustomMapTilePlan[];
  /**
   * Arm a "pick on the map" flow (SPECIFIC mode): the page passes this to the
   * MapDesigner, which highlights eligible tiles and resolves the pick.
   * Absent = the specific controls hide (editor used standalone).
   */
  onPickOnMap?: (request: { kind: "object-plan"; objectKind: SpecificPickKind }) => void;
  /** The currently armed pick, so the arming button shows its active state. */
  pickArmed?: { kind: "object-plan"; objectKind: SpecificPickKind } | null;
}) {
  const value = preset ?? {};
  const summary = describeCustomMapPresetEntries(value);
  // Collapsed by default on a fresh/plain map so the tile board stays the
  // page's focus; opens itself when a map WITH conditions is loaded (0 → some),
  // and never fights the designer's own toggle otherwise.
  const [open, setOpen] = useState(summary.length > 0);
  const hadConditions = useRef(summary.length > 0);
  useEffect(() => {
    if (summary.length > 0 && !hadConditions.current) {
      setOpen(true);
    }
    hadConditions.current = summary.length > 0;
  }, [summary.length]);

  // Map objects — Global | Specific mode per object kind. Specific mode lists
  // the per-tile settings and arms the on-map pick; available only when the
  // page wires tiles + onPickOnMap (the standalone editor hides it).
  const specificEnabled = Boolean(tiles && onPickOnMap);
  const [objectModes, setObjectModes] = useState<Partial<Record<SpecificPickKind, "global" | "specific">>>({});
  const objectMode = (kind: SpecificPickKind): "global" | "specific" =>
    specificEnabled ? (objectModes[kind] ?? "global") : "global";
  const setObjectMode = (kind: SpecificPickKind, mode: "global" | "specific") =>
    setObjectModes((current) => ({ ...current, [kind]: mode }));
  const specificCount = (kind: SpecificPickKind): number =>
    (tiles ?? []).filter((plan) => describeTileSpecificPlan(plan, kind).length > 0).length;
  const specificPanel = (kind: SpecificPickKind, emptyWarning: string) =>
    specificEnabled ? (
      <SpecificModePanel
        emptyWarning={emptyWarning}
        kind={kind}
        onPickOnMap={onPickOnMap!}
        pickArmed={pickArmed?.kind === "object-plan" && pickArmed.objectKind === kind}
        tiles={tiles!}
      />
    ) : null;
  const modeTabs = (kind: SpecificPickKind) =>
    specificEnabled ? (
      <GlobalSpecificTabs
        mode={objectMode(kind)}
        onMode={(mode) => setObjectMode(kind, mode)}
        specificCount={specificCount(kind)}
      />
    ) : null;

  // Hidden hex events live on the preset; placement happens via the on-map pick.
  // Hidden hex events are placed AND edited on the board (the Objects palette's
  // "Hidden event" button + the marker's docked editor) — the editor here only
  // reports the count, so the panel stays lean.
  const hexEvents = value.hexEvents ?? [];

  const patch = (partial: Partial<CustomMapPreset> | null) => {
    if (partial === null) {
      onChange(undefined);
      return;
    }
    const next: CustomMapPreset = { ...value, ...partial };
    // Drop empty arrays / cleared optional bags.
    if (partial.startingBuildings && partial.startingBuildings.length === 0) {
      delete next.startingBuildings;
    }
    if (partial.startingUnits && partial.startingUnits.length === 0 && "startingUnits" in partial) {
      next.startingUnits = [];
    }
    if (partial.startingBonuses && partial.startingBonuses.length === 0) {
      delete next.startingBonuses;
    }
    if (partial.timedEvents && partial.timedEvents.length === 0) {
      delete next.timedEvents;
    }
    if (partial.notes === "") {
      delete next.notes;
    }
    if (partial.roundLimit === 0) {
      delete next.roundLimit;
    }
    if ("obelisks" in partial && partial.obelisks === undefined) {
      // "Classic" is the ABSENCE of a config — remove the key entirely.
      delete next.obelisks;
    }
    if (
      "objectives" in partial &&
      (partial.objectives === undefined || Object.keys(partial.objectives).length === 0)
    ) {
      // An empty objectives block means "nothing forced" — drop the key so the
      // preset collapses to undefined when it was the only condition.
      delete next.objectives;
    }
    if ("customWinConditions" in partial && partial.customWinConditions === undefined) {
      // Removing the last condition drops the key so the preset can collapse.
      delete next.customWinConditions;
    }
    if ("victoryPoints" in partial && partial.victoryPoints === undefined) {
      // Toggling Victory Points off removes the block entirely.
      delete next.victoryPoints;
    }
    // Collapse to undefined when nothing is set.
    const keys = Object.keys(next).filter((key) => {
      const v = next[key as keyof CustomMapPreset];
      if (v === undefined || v === null) {
        return false;
      }
      if (Array.isArray(v) && v.length === 0 && key !== "startingUnits") {
        return false;
      }
      return true;
    });
    onChange(keys.length === 0 ? undefined : next);
  };

  const resources = value.startingResources ?? { gold: 10, buildingMaterials: 0, valuables: 0 };
  const production = value.startingProduction ?? { gold: 10, buildingMaterials: 0, valuables: 0 };
  const buildings = new Set(value.startingBuildings ?? []);
  const units = value.startingUnits ?? null;
  const bonuses = value.startingBonuses ?? [];
  const timed = value.timedEvents ?? [];
  const obeliskConfig = value.obelisks;
  const obeliskRole: CustomMapObeliskConfig["role"] | "classic" = obeliskConfig?.role ?? "classic";
  const obeliskGuard = obeliskConfig?.guard;
  // The award list, folding the legacy single `bonus` into a one-item list.
  const obeliskBonuses: CustomMapObeliskBonus[] =
    obeliskConfig?.bonuses && obeliskConfig.bonuses.length > 0
      ? obeliskConfig.bonuses
      : obeliskConfig?.bonus
        ? [obeliskConfig.bonus]
        : [defaultObeliskBonusForKind("morale")];
  const obeliskBonusMode = obeliskConfig?.bonusMode ?? "all";

  // Commit the whole obelisk block from current pieces + explicit overrides.
  // `guardSet` distinguishes "clear the guard" (guard: undefined) from "leave it".
  const commitObelisk = (parts: {
    role?: CustomMapObeliskConfig["role"] | "classic";
    bonuses?: CustomMapObeliskBonus[];
    mode?: "all" | "choose";
    guard?: CustomGuardSpec | undefined;
    guardSet?: boolean;
    breakField?: boolean;
    persistentGuard?: boolean;
    unlimitedRounds?: boolean;
    breakSet?: boolean;
  }) => {
    const role = parts.role ?? obeliskRole;
    if (role === "classic") {
      patch({ obelisks: undefined });
      return;
    }
    const guard = parts.guardSet ? parts.guard : obeliskGuard;
    const breakField = parts.breakSet ? parts.breakField : obeliskConfig?.breakField;
    const persistentGuard = parts.breakSet ? parts.persistentGuard : obeliskConfig?.persistentGuard;
    const unlimitedRounds = parts.breakSet ? parts.unlimitedRounds : obeliskConfig?.unlimitedRounds;
    const breakFlags = {
      ...(breakField ? { breakField: true as const } : {}),
      ...(persistentGuard ? { persistentGuard: true as const } : {}),
      ...(unlimitedRounds ? { unlimitedRounds: true as const } : {})
    };
    if (role !== "bonus") {
      patch({ obelisks: { role, ...(guard ? { guard } : {}), ...breakFlags } });
      return;
    }
    const list = parts.bonuses ?? obeliskBonuses;
    const mode = parts.mode ?? obeliskBonusMode;
    patch({
      obelisks: {
        role: "bonus",
        bonuses: list,
        ...(mode === "choose" && list.length > 1 ? { bonusMode: "choose" as const } : {}),
        ...(guard ? { guard } : {}),
        ...breakFlags
      }
    });
  };
  const setObeliskRole = (role: CustomMapObeliskConfig["role"] | "classic") => commitObelisk({ role });
  const setObeliskGuard = (guard: CustomGuardSpec | undefined) =>
    commitObelisk({ guard, guardSet: true });
  const updateObeliskBonus = (index: number, bonus: CustomMapObeliskBonus) =>
    commitObelisk({ bonuses: obeliskBonuses.map((entry, i) => (i === index ? bonus : entry)) });
  const addObeliskBonus = () => {
    if (obeliskBonuses.length >= MAX_OBELISK_BONUSES) return;
    commitObelisk({ bonuses: [...obeliskBonuses, defaultObeliskBonusForKind("morale")] });
  };
  const removeObeliskBonus = (index: number) => {
    if (obeliskBonuses.length <= 1) return;
    commitObelisk({ bonuses: obeliskBonuses.filter((_, i) => i !== index) });
  };
  const setObeliskBonusMode = (mode: "all" | "choose") => commitObelisk({ mode });

  // Map-wide settlement options (guard + extra VP each).
  const settlementConfig = value.settlements;
  const settlementGuard = settlementConfig?.guard;
  const settlementVp = settlementConfig?.vp ?? 0;
  const commitSettlements = (parts: {
    guard?: CustomGuardSpec | undefined;
    guardSet?: boolean;
    vp?: number;
  }) => {
    const guard = parts.guardSet ? parts.guard : settlementGuard;
    const vp = parts.vp !== undefined ? parts.vp : settlementVp;
    const next: CustomMapSettlementConfig = {};
    if (guard) next.guard = guard;
    if (vp > 0) next.vp = vp;
    patch({ settlements: next.guard || next.vp !== undefined ? next : undefined });
  };
  const setSettlementGuard = (guard: CustomGuardSpec | undefined) =>
    commitSettlements({ guard, guardSet: true });
  const setSettlementVp = (vp: number) => commitSettlements({ vp });

  const objectives = value.objectives ?? {};
  const patchObjectives = (next: NonNullable<CustomMapPreset["objectives"]>) => {
    patch({ objectives: Object.keys(next).length > 0 ? next : undefined });
  };
  const setGrailObelisks = (count: 1 | 2 | 3 | 4 | undefined) => {
    const next = { ...objectives };
    if (count === undefined) {
      delete next.grailObelisksRequired;
    } else {
      next.grailObelisksRequired = count;
    }
    patchObjectives(next);
  };
  const setUtopiaGuards = (guards: "four" | "by-difficulty" | undefined) => {
    const next = { ...objectives };
    if (guards === undefined) {
      delete next.utopiaGuards;
    } else {
      next.utopiaGuards = guards;
    }
    patchObjectives(next);
  };
  const setUtopiaBonusSearch = (count: 1 | 2 | 3 | undefined) => {
    const next = { ...objectives };
    if (count === undefined) {
      delete next.utopiaBonusSearch;
    } else {
      next.utopiaBonusSearch = count;
    }
    patchObjectives(next);
  };

  const victoryPoints = value.victoryPoints;
  const vpOn = Boolean(victoryPoints?.enabled);
  const vpObjectives = victoryPoints?.objectives ?? [];
  const writeVictoryPoints = (patchVp: {
    victoryConditionVp?: number;
    objectives?: VictoryPointObjective[];
  }) => {
    const next: NonNullable<CustomMapPreset["victoryPoints"]> = {
      enabled: true,
      victoryConditionVp:
        patchVp.victoryConditionVp ?? victoryPoints?.victoryConditionVp ?? DEFAULT_VICTORY_CONDITION_VP
    };
    const objectives = patchVp.objectives ?? victoryPoints?.objectives;
    if (objectives && objectives.length > 0) {
      next.objectives = objectives;
    }
    patch({ victoryPoints: next });
  };
  const toggleVictoryPoints = () => {
    if (vpOn) {
      patch({ victoryPoints: undefined });
    } else {
      writeVictoryPoints({});
    }
  };
  const addVpObjective = () => {
    if (vpObjectives.length >= MAX_VICTORY_POINT_OBJECTIVES) {
      return;
    }
    writeVictoryPoints({ objectives: [...vpObjectives, defaultVictoryPointObjective("control-towns")] });
  };
  const updateVpObjective = (index: number, objective: VictoryPointObjective) => {
    writeVictoryPoints({ objectives: vpObjectives.map((entry, i) => (i === index ? objective : entry)) });
  };
  const removeVpObjective = (index: number) => {
    writeVictoryPoints({ objectives: vpObjectives.filter((_, i) => i !== index) });
  };

  const winConditions = value.customWinConditions ?? [];
  const writeWinConditions = (next: CustomWinCondition[]) => {
    patch({ customWinConditions: next.length > 0 ? next : undefined });
  };
  const addWinCondition = () => {
    if (winConditions.length >= MAX_CUSTOM_WIN_CONDITIONS) {
      return;
    }
    writeWinConditions([...winConditions, defaultCustomWinCondition(OFFERED_WIN_CONDITION_OPTIONS[0].id)]);
  };
  const updateWinCondition = (index: number, condition: CustomWinCondition) => {
    writeWinConditions(winConditions.map((entry, i) => (i === index ? condition : entry)));
  };
  const removeWinCondition = (index: number) => {
    writeWinConditions(winConditions.filter((_, i) => i !== index));
  };

  const setTimed = (next: CustomMapTimedEvent[]) => {
    patch({ timedEvents: next });
  };

  const updateTimed = (index: number, next: CustomMapTimedEvent) => {
    setTimed(timed.map((entry, i) => (i === index ? next : entry)));
  };

  const appendTimed = (event: CustomMapTimedEvent) => {
    if (timed.length >= MAX_TIMED_EVENTS) {
      return;
    }
    setTimed([...timed, event]);
  };

  // Active-entry count per collapsible group. Single source of truth: mirrors
  // the per-field entries that `describeCustomMapPresetEntries` produces (the
  // multi-line objectives / Victory-Points blocks reuse the SAME describe
  // helpers so the count can never fork from the summary above). A group with
  // ≥1 active entry starts OPEN; an empty group starts collapsed.
  const groupCounts = {
    matchSetup:
      (value.difficulty ? 1 : 0) +
      (value.farTileOpening !== undefined || value.farTilesPerPlayer !== undefined ? 1 : 0),
    startingPosition:
      (value.startingResources ? 1 : 0) +
      (value.startingProduction ? 1 : 0) +
      (value.startingBuildings && value.startingBuildings.length > 0 ? 1 : 0) +
      (value.startingUnits ? 1 : 0) +
      (value.startingBonuses && value.startingBonuses.length > 0 ? 1 : 0),
    victoryScoring:
      (value.victoryMode ? 1 : 0) +
      (value.roundLimit ? 1 : 0) +
      (value.victoryPoints?.enabled
        ? describeVictoryPointsConfig(value.victoryPoints, value.roundLimit).length
        : 0) +
      (value.customWinConditions?.length ?? 0) +
      // The Grail / Dragon-Utopia objective tuning now lives in this group.
      (value.objectives ? describeObjectivesConfig(value.objectives).length : 0),
    mapLocations:
      (value.obelisks ? 1 : 0) +
      (value.settlements ? 1 : 0) +
      (value.mines ? 1 : 0) +
      (value.randomTowns ? 1 : 0) +
      (value.hexEvents?.length ?? 0) +
      // SPECIFIC per-tile settings count toward the group badge too.
      (tiles ?? []).reduce(
        (total, plan) =>
          total +
          (["obelisk", "mine", "settlement", "center"] as const).filter(
            (kind) => describeTileSpecificPlan(plan, kind).length > 0
          ).length,
        0
      ),
    timedEvents: timed.length,
    designerNote: value.notes ? 1 : 0
  };

  return (
    <details
      className="mapPresetEditor"
      aria-label="Map scenario conditions"
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      open={open}
    >
      <summary className="mapPresetSummaryBar">
        <span className="mapPresetSummaryChevron" aria-hidden="true">
          ▸
        </span>
        <strong>Map conditions</strong>
        <span className={`mapPresetCountBadge${summary.length > 0 ? " active" : ""}`}>
          {summary.length > 0
            ? `${summary.length} active`
            : "optional"}
        </span>
        <small>Mission-book style setup for this map only — players see it when the map is picked.</small>
      </summary>

      {summary.length > 0 ? (
        <div className="mapPresetSummary" role="status">
          <div className="mapPresetSummaryTitle">Active conditions</div>
          <ul className="mapPresetEntryList">
            {summary.map((entry) => (
              <li key={entry.text}>
                <span className="mapPresetEntryIcon" aria-hidden="true">
                  {entry.icon}
                </span>
                {entry.text}
              </li>
            ))}
          </ul>
          <button className="mapPresetClear" onClick={() => patch(null)} type="button">
            Clear all conditions
          </button>
        </div>
      ) : (
        <small className="mapPresetEmpty">No special conditions — pure tile layout.</small>
      )}

      <MapPresetGroup title="Match setup" glyphEmoji="⚙️" count={groupCounts.matchSetup}>
      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Difficulty (preset)</div>
        <div className="mapPresetChipRow" role="group" aria-label="Difficulty">
          {MAP_PRESET_DIFFICULTY_OPTIONS.map((opt) => (
            <button
              aria-pressed={value.difficulty === opt.id}
              className={`mapPresetChip${value.difficulty === opt.id ? " active" : ""}`}
              key={opt.id}
              onClick={() => patch({ difficulty: value.difficulty === opt.id ? undefined : opt.id })}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <small className="mapPresetHint">
          Neutral guard strength (Field Difficulty Level Table) + the printed starting bonus. Seeds the lobby on
          pick; the host can still change it there (their choice wins), and switching maps restores the scenario default.
        </small>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Additional Ⅱ–Ⅲ tiles (preset)</div>
        <div className="mapPresetChipRow" role="group" aria-label="Additional Ⅱ–Ⅲ tile opening">
          {(
            [
              { id: "default", label: "Default" },
              { id: "on", label: "On" },
              { id: "off", label: "Off" }
            ] as const
          ).map((opt) => {
            const active =
              opt.id === "default"
                ? value.farTileOpening === undefined
                : opt.id === "on"
                  ? value.farTileOpening === true
                  : value.farTileOpening === false;
            return (
              <button
                aria-pressed={active}
                className={`mapPresetChip${active ? " active" : ""}`}
                key={opt.id}
                onClick={() =>
                  patch({ farTileOpening: opt.id === "default" ? undefined : opt.id === "on" })
                }
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {value.farTileOpening !== false ? (
          <div className="mapPresetChipRow" role="group" aria-label="Ⅱ–Ⅲ tiles per player">
            {([undefined, 0, 1, 2, 3, 4, 5, 6] as const).map((count) => {
              const active = value.farTilesPerPlayer === count;
              return (
                <button
                  aria-pressed={active}
                  className={`mapPresetChip${active ? " active" : ""}`}
                  key={String(count)}
                  onClick={() => patch({ farTilesPerPlayer: count })}
                  type="button"
                >
                  {count === undefined ? "Default" : count}
                </button>
              );
            })}
          </div>
        ) : null}
        <small className="mapPresetHint">
          Whether players may open their own Ⅱ–Ⅲ Far tiles mid-game, and how many each may add (0–6). Only the
          count of tiles is set here — the Ⅱ–Ⅲ supply pool itself stays the engine default. Seeds the lobby on pick.
        </small>
      </section>
      </MapPresetGroup>

      <MapPresetGroup
        title="Starting position"
        glyphSrc={SECRET_FEATURE_ICONS.town}
        count={groupCounts.startingPosition}
      >
      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Starting resources</div>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Gold"
            value={value.startingResources ? resources.gold : null}
            onChange={(gold) =>
              patch({
                startingResources: { ...resources, gold }
              })
            }
          />
          <ResourceField
            label="Materials"
            value={value.startingResources ? resources.buildingMaterials : null}
            onChange={(buildingMaterials) =>
              patch({
                startingResources: { ...resources, buildingMaterials }
              })
            }
          />
          <ResourceField
            label="Valuables"
            value={value.startingResources ? resources.valuables : null}
            onChange={(valuables) =>
              patch({
                startingResources: { ...resources, valuables }
              })
            }
          />
        </div>
        <button
          className="mapPresetLinkBtn"
          onClick={() => patch({ startingResources: undefined })}
          type="button"
          disabled={!value.startingResources}
        >
          Use scenario default resources
        </button>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Income (per Resource round)</div>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Gold"
            value={value.startingProduction ? production.gold : null}
            onChange={(gold) => patch({ startingProduction: { ...production, gold } })}
          />
          <ResourceField
            label="Materials"
            value={value.startingProduction ? production.buildingMaterials : null}
            onChange={(buildingMaterials) =>
              patch({ startingProduction: { ...production, buildingMaterials } })
            }
          />
          <ResourceField
            label="Valuables"
            value={value.startingProduction ? production.valuables : null}
            onChange={(valuables) => patch({ startingProduction: { ...production, valuables } })}
          />
        </div>
        <button
          className="mapPresetLinkBtn"
          disabled={!value.startingProduction}
          onClick={() => patch({ startingProduction: undefined })}
          type="button"
        >
          Use scenario default income
        </button>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Town buildings at start</div>
        <div className="mapPresetChipRow">
          {MAP_PRESET_BUILDING_OPTIONS.map((opt) => {
            const on = buildings.has(opt.id);
            return (
              <button
                aria-pressed={on}
                className={`mapPresetChip${on ? " active" : ""}`}
                key={opt.id}
                onClick={() => {
                  const next = new Set(buildings);
                  if (on) {
                    next.delete(opt.id);
                  } else {
                    next.add(opt.id);
                  }
                  patch({ startingBuildings: [...next] });
                }}
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Starting army (level 1–7)</div>
        <small className="mapPresetHint">Each player gets their own faction’s unit of that level.</small>
        <div className="mapPresetUnitGrid">
          {([1, 2, 3, 4, 5, 6, 7] as UnitLevel[]).map((level) => {
            const pick = units?.find((u) => u.level === level);
            return (
              <div className="mapPresetUnitRow" key={level}>
                <span>Lv {level}</span>
                <button
                  aria-pressed={!pick}
                  className={!pick ? "active" : ""}
                  onClick={() => {
                    const rest = (units ?? []).filter((u) => u.level !== level);
                    patch({ startingUnits: rest });
                  }}
                  type="button"
                >
                  —
                </button>
                <button
                  aria-pressed={pick?.side === "few"}
                  className={pick?.side === "few" ? "active" : ""}
                  onClick={() => setUnit(units, level, "few", patch)}
                  type="button"
                >
                  Few
                </button>
                <button
                  aria-pressed={pick?.side === "pack"}
                  className={pick?.side === "pack" ? "active" : ""}
                  onClick={() => setUnit(units, level, "pack", patch)}
                  type="button"
                >
                  Pack
                </button>
              </div>
            );
          })}
        </div>
        <button
          className="mapPresetLinkBtn"
          disabled={units === null}
          onClick={() => patch({ startingUnits: undefined })}
          type="button"
        >
          Use scenario default army
        </button>
      </section>

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Additional starting bonus</div>
        <div className="mapPresetChipRow">
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                startingBonuses: [
                  ...bonuses,
                  { kind: "resources", gold: 5, buildingMaterials: 0, valuables: 0 }
                ]
              })
            }
            type="button"
          >
            +5 gold
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                startingBonuses: [...bonuses, { kind: "search", deck: "artifacts", count: 2 }]
              })
            }
            type="button"
          >
            Search(2) Artifacts
          </button>
          <button
            className="mapPresetChip"
            onClick={() =>
              patch({
                startingBonuses: [...bonuses, { kind: "search", deck: "spells", count: 2 }]
              })
            }
            type="button"
          >
            Search(2) Spells
          </button>
          <button
            className="mapPresetChip"
            onClick={() => patch({ startingBonuses: [...bonuses, { kind: "morale", amount: 1 }] })}
            type="button"
          >
            +1 morale
          </button>
        </div>
        {bonuses.length > 0 ? (
          <ul className="mapPresetList">
            {bonuses.map((bonus, index) => (
              <li key={`${bonus.kind}-${index}`}>
                {describeBonusLine(bonus)}
                <button
                  onClick={() =>
                    patch({
                      startingBonuses: bonuses.filter((_, i) => i !== index)
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      </MapPresetGroup>

      <MapPresetGroup title="Victory & scoring" glyphEmoji="🏆" count={groupCounts.victoryScoring}>
      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Victory (preset)</div>
        <div className="mapPresetChipRow" role="group" aria-label="Victory mode">
          {MAP_PRESET_VICTORY_OPTIONS.map((opt) => (
            <button
              aria-pressed={value.victoryMode === opt.id}
              className={`mapPresetChip${value.victoryMode === opt.id ? " active" : ""}`}
              key={opt.id}
              onClick={() =>
                patch({
                  victoryMode: value.victoryMode === opt.id ? undefined : (opt.id as VictoryMode)
                })
              }
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <small className="mapPresetHint">
          Seeds the lobby when the map is picked — the host can still change it there (their choice wins), and
          switching maps restores the scenario default.
        </small>
      </section>

      {/* The Grail / Dragon-Utopia objective tuning lives RIGHT BELOW the Win
          condition — it appears the moment you pick the matching victory mode
          (Grail → Grail dig knobs; a Dragon mode → Dragon Utopia knobs), so the
          objective is set up where you chose the condition. Place the objective
          FIELD on the map via a centre tile's Ⅶ field in the tile popover. */}
      {value.victoryMode === "grail" ? (
        <section className="mapPresetSection" aria-label="Objectives">
          <div className="mapPresetSectionLabel">🏆 Grail objective</div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Grail Obelisks required">
            <span className="mapPresetObjectiveLabel">🏆 Grail dig — Obelisks needed</span>
            <div className="mapPresetChipRow">
              <button
                aria-pressed={objectives.grailObelisksRequired === undefined}
                className={`mapPresetChip${objectives.grailObelisksRequired === undefined ? " active" : ""}`}
                onClick={() => setGrailObelisks(undefined)}
                title="Use the default (2 Obelisks)."
                type="button"
              >
                Default (2)
              </button>
              {([1, 2, 3, 4] as const).map((count) => (
                <button
                  aria-pressed={objectives.grailObelisksRequired === count}
                  className={`mapPresetChip${objectives.grailObelisksRequired === count ? " active" : ""}`}
                  key={count}
                  onClick={() => setGrailObelisks(count)}
                  type="button"
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Grail dig movement cost">
            <span className="mapPresetObjectiveLabel">Dig cost (MP)</span>
            <div className="mapPresetChipRow">
              {([undefined, 0, 1, 2] as const).map((cost) => (
                <button
                  aria-pressed={(objectives.grailDigCost ?? 1) === (cost ?? 1) && (cost === undefined ? objectives.grailDigCost === undefined : objectives.grailDigCost === cost)}
                  className={`mapPresetChip${
                    cost === undefined
                      ? objectives.grailDigCost === undefined
                        ? " active"
                        : ""
                      : objectives.grailDigCost === cost
                        ? " active"
                        : ""
                  }`}
                  key={String(cost)}
                  onClick={() => {
                    const next = { ...objectives };
                    if (cost === undefined) delete next.grailDigCost;
                    else next.grailDigCost = cost;
                    patchObjectives(next);
                  }}
                  title={cost === undefined ? "Classic dig costs 1 MP." : `Dig costs ${cost} movement point(s).`}
                  type="button"
                >
                  {cost === undefined ? "Default (1)" : cost === 0 ? "Free (0)" : String(cost)}
                </button>
              ))}
            </div>
          </div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Grail as Utopia">
            <span className="mapPresetObjectiveLabel">Grail as Utopia</span>
            <div className="mapPresetChipRow">
              {(
                [
                  { id: undefined, label: "Off" },
                  { id: "always" as const, label: "Always" },
                  { id: "after-dig-utopia" as const, label: "After dig → Utopia" },
                  { id: "after-dig-empty" as const, label: "After dig → empty" }
                ] as const
              ).map((opt) => (
                <button
                  aria-pressed={objectives.grailAsUtopia === opt.id}
                  className={`mapPresetChip${objectives.grailAsUtopia === opt.id ? " active" : ""}`}
                  key={String(opt.id)}
                  onClick={() => {
                    const next = { ...objectives };
                    if (opt.id === undefined) delete next.grailAsUtopia;
                    else next.grailAsUtopia = opt.id;
                    patchObjectives(next);
                  }}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Grail dig reward gold">
            <span className="mapPresetObjectiveLabel">Dig reward gold</span>
            <input
              aria-label="Grail dig reward gold"
              className="mapPresetNumber"
              max={50}
              min={0}
              onChange={(e) => {
                const next = { ...objectives };
                const gold = Math.max(0, Math.min(50, Number(e.target.value) || 0));
                const reward = { ...(next.grailDigReward ?? {}), gold };
                if (!reward.gold && !reward.buildingMaterials && !reward.valuables) {
                  delete next.grailDigReward;
                } else {
                  next.grailDigReward = reward;
                }
                patchObjectives(next);
              }}
              type="number"
              value={objectives.grailDigReward?.gold ?? 0}
            />
            <span className="mapPresetObjectiveLabel">valuables</span>
            <input
              aria-label="Grail dig reward valuables"
              className="mapPresetNumber"
              max={30}
              min={0}
              onChange={(e) => {
                const next = { ...objectives };
                const valuables = Math.max(0, Math.min(30, Number(e.target.value) || 0));
                const reward = { ...(next.grailDigReward ?? {}), valuables };
                if (!reward.gold && !reward.buildingMaterials && !reward.valuables) {
                  delete next.grailDigReward;
                } else {
                  next.grailDigReward = reward;
                }
                patchObjectives(next);
              }}
              type="number"
              value={objectives.grailDigReward?.valuables ?? 0}
            />
            <span className="mapPresetObjectiveLabel">stone</span>
            <input
              aria-label="Grail dig reward materials"
              className="mapPresetNumber"
              max={30}
              min={0}
              onChange={(e) => {
                const next = { ...objectives };
                const buildingMaterials = Math.max(0, Math.min(30, Number(e.target.value) || 0));
                const reward = { ...(next.grailDigReward ?? {}), buildingMaterials };
                if (!reward.gold && !reward.buildingMaterials && !reward.valuables) {
                  delete next.grailDigReward;
                } else {
                  next.grailDigReward = reward;
                }
                patchObjectives(next);
              }}
              type="number"
              value={objectives.grailDigReward?.buildingMaterials ?? 0}
            />
          </div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Grail possession VP">
            <span className="mapPresetObjectiveLabel">Possession VP at scoring</span>
            <input
              aria-label="Grail possession VP"
              className="mapPresetNumber"
              max={20}
              min={0}
              onChange={(e) => {
                const next = { ...objectives };
                const vp = Math.max(0, Math.min(20, Number(e.target.value) || 0));
                if (vp > 0) next.grailPossessionVp = vp;
                else delete next.grailPossessionVp;
                patchObjectives(next);
              }}
              type="number"
              value={objectives.grailPossessionVp ?? 0}
            />
          </div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Build Grail at">
            <span className="mapPresetObjectiveLabel">Build Grail at</span>
            <div className="mapPresetChipRow">
              {(
                [
                  { id: undefined, label: "Off" },
                  { id: "town" as const, label: "Town" },
                  { id: "settlement" as const, label: "Settlement" },
                  { id: "both" as const, label: "Both" },
                  { id: "starting-town" as const, label: "Starting town" }
                ] as const
              ).map((opt) => (
                <button
                  aria-pressed={objectives.grailBuildAt === opt.id}
                  className={`mapPresetChip${objectives.grailBuildAt === opt.id ? " active" : ""}`}
                  key={String(opt.id)}
                  onClick={() => {
                    const next = { ...objectives };
                    if (opt.id === undefined) {
                      delete next.grailBuildAt;
                      delete next.grailBuildReward;
                    } else {
                      next.grailBuildAt = opt.id;
                    }
                    patchObjectives(next);
                  }}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {objectives.grailBuildAt ? (
            <div className="mapPresetObjectiveRow" role="group" aria-label="Grail build free building">
              <span className="mapPresetObjectiveLabel">Build reward</span>
              <button
                aria-pressed={Boolean(objectives.grailBuildReward?.freeBuilding)}
                className={`mapPresetChip${objectives.grailBuildReward?.freeBuilding ? " active" : ""}`}
                onClick={() => {
                  const next = { ...objectives };
                  const reward = { ...(next.grailBuildReward ?? {}) };
                  if (reward.freeBuilding) {
                    delete reward.freeBuilding;
                  } else {
                    reward.freeBuilding = true;
                  }
                  if (!reward.freeBuilding && !reward.gold && !reward.buildingMaterials && !reward.valuables && !reward.vp) {
                    delete next.grailBuildReward;
                  } else {
                    next.grailBuildReward = reward;
                  }
                  patchObjectives(next);
                }}
                title="Opens a free Town building picker when the Grail is built."
                type="button"
              >
                Free Building picker
              </button>
            </div>
          ) : null}
          <small className="mapPresetHint">
            Place the Grail dig site on the map via a centre tile&apos;s Ⅶ field in the tile popover. A hero carrying
            the Grail shows a marker; build puts the Grail on that location for possession VP. Contesting a built Grail
            is a siege control fight. Free Building opens a real Town picker (no cost, no Build token).
          </small>
        </section>
      ) : null}

      {value.victoryMode === "dragon-hunt" || value.victoryMode === "dragon-conqueror" ? (
        <section className="mapPresetSection" aria-label="Objectives">
          <div className="mapPresetSectionLabel">🐉 Dragon Utopia objective</div>
          <div className="mapPresetObjectiveRow" role="group" aria-label="Dragon Utopia guards">
            <span className="mapPresetObjectiveLabel">🐉 Dragon Utopia guards</span>
            <div className="mapPresetChipRow">
              <button
                aria-pressed={objectives.utopiaGuards === undefined}
                className={`mapPresetChip${objectives.utopiaGuards === undefined ? " active" : ""}`}
                onClick={() => setUtopiaGuards(undefined)}
                title="Use the lobby / game default."
                type="button"
              >
                Default
              </button>
              <button
                aria-pressed={objectives.utopiaGuards === "by-difficulty"}
                className={`mapPresetChip${objectives.utopiaGuards === "by-difficulty" ? " active" : ""}`}
                onClick={() => setUtopiaGuards("by-difficulty")}
                title="Trim the dragon party to the difficulty-scaled count (Easy 1 … Impossible 4)."
                type="button"
              >
                Scale by difficulty
              </button>
              <button
                aria-pressed={objectives.utopiaGuards === "four"}
                className={`mapPresetChip${objectives.utopiaGuards === "four" ? " active" : ""}`}
                onClick={() => setUtopiaGuards("four")}
                title="The full four-dragon party always stands."
                type="button"
              >
                Four dragons
              </button>
            </div>
          </div>

          <div className="mapPresetObjectiveRow" role="group" aria-label="Dragon Utopia bonus search">
            <span className="mapPresetObjectiveLabel">🐉 Dragon Utopia bonus Search</span>
            <div className="mapPresetChipRow">
              <button
                aria-pressed={objectives.utopiaBonusSearch === undefined}
                className={`mapPresetChip${objectives.utopiaBonusSearch === undefined ? " active" : ""}`}
                onClick={() => setUtopiaBonusSearch(undefined)}
                title="No extra Search on top of the printed reward."
                type="button"
              >
                None
              </button>
              {([1, 2, 3] as const).map((count) => (
                <button
                  aria-pressed={objectives.utopiaBonusSearch === count}
                  className={`mapPresetChip${objectives.utopiaBonusSearch === count ? " active" : ""}`}
                  key={count}
                  onClick={() => setUtopiaBonusSearch(count)}
                  title={`Grant the defeater an extra Search(${count}) of the Artifact deck.`}
                  type="button"
                >
                  Search({count})
                </button>
              ))}
            </div>
          </div>
          <small className="mapPresetHint">
            Place the Dragon Utopia on the map via a centre tile&apos;s Ⅶ field in the tile popover.
          </small>
        </section>
      ) : null}

      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">
          {vpOn ? "Round limit (hard end)" : "Suggested length (rounds)"}
        </div>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Rounds"
            value={value.roundLimit ?? null}
            onChange={(roundLimit) => patch({ roundLimit: roundLimit || undefined })}
          />
        </div>
        <small className="mapPresetHint">
          {vpOn
            ? "With Victory Points on, the game ENDS when this round wraps (then VPs are scored)."
            : "A display-only note today — a suggested length, not a hard end."}
        </small>
      </section>

      <section className="mapPresetSection mapPresetVpSection" aria-label="Victory Points">
        <div className="mapPresetSectionLabel">🎖️ Victory Points</div>
        <label className="mapPresetToggle">
          <input
            aria-label="Victory Points scoring"
            checked={vpOn}
            onChange={toggleVictoryPoints}
            type="checkbox"
          />
          <span>Score Victory Points (rulebook scenario scoring)</span>
        </label>
        {vpOn ? (
          <>
            <small className="mapPresetHint">
              The game ends at the round limit above OR when a player completes the victory condition —
              the most VPs wins. Set a round limit above for a hard cap.
              {value.roundLimit ? "" : " ⚠ No round limit set — completion is the only end trigger."}
            </small>
            <div className="mapPresetResourceRow">
              <ResourceField
                label="Completion VP"
                value={victoryPoints?.victoryConditionVp ?? DEFAULT_VICTORY_CONDITION_VP}
                onChange={(vp) => writeVictoryPoints({ victoryConditionVp: Math.max(0, Math.min(10, vp ?? 0)) })}
              />
            </div>

            <div className="mapPresetVpObjectives" role="group" aria-label="Victory Point objectives">
              <div className="mapPresetTimedSectionHeading">
                <div className="mapPresetSectionLabel">Extra objectives</div>
                <span className={`mapPresetTimedCount${vpObjectives.length >= MAX_VICTORY_POINT_OBJECTIVES ? " full" : ""}`}>
                  {vpObjectives.length}/{MAX_VICTORY_POINT_OBJECTIVES}
                </span>
              </div>
              {vpObjectives.map((objective, index) => (
                <div className="mapPresetVpObjectiveRow" key={index}>
                  <RewardGlyph src={vpObjectiveGlyph(objective.kind)} title={`Objective ${index + 1}`} />
                  <select
                    aria-label={`Objective ${index + 1} kind`}
                    className="mapPresetSelect"
                    onChange={(e) =>
                      updateVpObjective(index, {
                        ...defaultVictoryPointObjective(e.target.value as VictoryPointObjective["kind"]),
                        vp: objective.vp
                      })
                    }
                    value={objective.kind}
                  >
                    {VICTORY_POINT_OBJECTIVE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {objective.kind === "control-towns" || objective.kind === "flag-mines" ? (
                    <ResourceField
                      label="N"
                      value={objective.count}
                      onChange={(count) =>
                        updateVpObjective(index, { ...objective, count: Math.max(1, count ?? 1) })
                      }
                    />
                  ) : null}
                  {objective.kind === "hero-level" ? (
                    <ResourceField
                      label="Level"
                      value={objective.level}
                      onChange={(level) =>
                        updateVpObjective(index, { ...objective, level: Math.max(2, Math.min(7, level ?? 2)) })
                      }
                    />
                  ) : null}
                  <ResourceField
                    label="VP"
                    value={objective.vp}
                    onChange={(vp) => updateVpObjective(index, { ...objective, vp: Math.max(1, Math.min(10, vp ?? 1)) })}
                  />
                  <button
                    aria-label={`Remove objective ${index + 1}`}
                    className="mapPresetTimedRemove"
                    onClick={() => removeVpObjective(index)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                </div>
              ))}
              <button
                className="mapPresetTimedAdd"
                disabled={vpObjectives.length >= MAX_VICTORY_POINT_OBJECTIVES}
                onClick={addVpObjective}
                type="button"
              >
                <Plus aria-hidden="true" size={13} /> Add objective
              </button>
            </div>
          </>
        ) : (
          <small className="mapPresetHint">
            Off — the round limit above stays a mere suggested length.
          </small>
        )}
      </section>

      <section className="mapPresetSection mapPresetVpSection" aria-label="Custom win conditions">
        <div className="mapPresetSectionLabel">🏁 Custom win conditions</div>
        <small className="mapPresetHint">
          Extra early-end triggers on top of the victory mode: the FIRST player to satisfy ANY of these wins
          immediately. Keep the thresholds above what a player already has at setup, or the game ends on the first
          action.
        </small>
        <div className="mapPresetVpObjectives" role="group" aria-label="Custom win condition list">
          <div className="mapPresetTimedSectionHeading">
            <div className="mapPresetSectionLabel">Conditions</div>
            <span className={`mapPresetTimedCount${winConditions.length >= MAX_CUSTOM_WIN_CONDITIONS ? " full" : ""}`}>
              {winConditions.length}/{MAX_CUSTOM_WIN_CONDITIONS}
            </span>
          </div>
          {winConditions.map((condition, index) => {
            const option = CUSTOM_WIN_CONDITION_OPTIONS.find((entry) => entry.id === condition.kind);
            const paramValue =
              condition.kind === "hero-level"
                ? condition.level
                : condition.kind === "gold"
                  ? condition.amount
                  : "count" in condition
                    ? condition.count
                    : null;
            // Object-scoped kinds moved to Map objects (per-object win ticks);
            // legacy conditions of those kinds still render + edit, the select
            // just stops OFFERING them for new rows.
            const rowOptions = OFFERED_WIN_CONDITION_OPTIONS.some((entry) => entry.id === condition.kind)
              ? OFFERED_WIN_CONDITION_OPTIONS
              : [
                  ...OFFERED_WIN_CONDITION_OPTIONS,
                  ...(option ? [option] : [])
                ];
            return (
              <div className="mapPresetVpObjectiveRow" key={index}>
                <RewardGlyph src={winConditionGlyph(condition.kind)} title={`Condition ${index + 1}`} />
                <select
                  aria-label={`Condition ${index + 1} kind`}
                  className="mapPresetSelect"
                  onChange={(e) =>
                    updateWinCondition(index, defaultCustomWinCondition(e.target.value as CustomWinCondition["kind"]))
                  }
                  value={condition.kind}
                >
                  {rowOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                {option?.param && paramValue !== null ? (
                  <ResourceField
                    label={option.param.label}
                    max={option.param.max}
                    min={option.param.min}
                    value={paramValue}
                    onChange={(n) => {
                      const clamped = Math.max(option.param!.min, Math.min(option.param!.max, n ?? option.param!.min));
                      updateWinCondition(index, { ...condition, [option.param!.field]: clamped } as CustomWinCondition);
                    }}
                  />
                ) : null}
                <button
                  aria-label={`Remove condition ${index + 1}`}
                  className="mapPresetTimedRemove"
                  onClick={() => removeWinCondition(index)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              </div>
            );
          })}
          <button
            className="mapPresetTimedAdd"
            disabled={winConditions.length >= MAX_CUSTOM_WIN_CONDITIONS}
            onClick={addWinCondition}
            type="button"
          >
            <Plus aria-hidden="true" size={13} /> Add win condition
          </button>
        </div>
      </section>
      </MapPresetGroup>

      <MapPresetGroup title="Map objects" glyphSrc={DESIGNER_UI_ICONS.map} count={groupCounts.mapLocations}>
      <section className="mapPresetSection" aria-label="Obelisks">
        <div className="mapPresetSectionLabel">⚱ Obelisks</div>
        {modeTabs("obelisk")}
        {objectMode("obelisk") === "specific"
          ? specificPanel("obelisk", "No placed tile carries an Obelisk yet — pin an obelisk tile (or a face-down Secret Obelisk) first.")
          : null}
        <div hidden={objectMode("obelisk") !== "global"}>
        <small className="mapPresetHint">
          What visiting an Obelisk does. The ROLE applies to every Obelisk on the map (face-down tiles
          hide which is which); guard/reward can also be set per tile under 📍 Specific. Each role still
          counts toward the Holy-Grail dig.
        </small>
        <div className="mapPresetChipRow" role="group" aria-label="Obelisk role">
          {MAP_PRESET_OBELISK_ROLE_OPTIONS.map((opt) => (
            <button
              aria-pressed={obeliskRole === opt.id}
              className={`mapPresetChip${obeliskRole === opt.id ? " active" : ""}`}
              key={opt.id}
              onClick={() => setObeliskRole(opt.id)}
              title={opt.hint}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
        {obeliskRole !== "classic" ? (
          <>
            <GuardLevelChips
              ariaLabel="Obelisk guard"
              guard={obeliskGuard}
              label="Guard (fought on first visit)"
              onChange={setObeliskGuard}
            />
            <div className="mapPresetChipRow" role="group" aria-label="Obelisk break options">
              <button
                aria-pressed={Boolean(obeliskConfig?.breakField)}
                className={`mapPresetChip${obeliskConfig?.breakField ? " active" : ""}`}
                onClick={() =>
                  commitObelisk({
                    breakSet: true,
                    breakField: !obeliskConfig?.breakField,
                    persistentGuard: obeliskConfig?.persistentGuard,
                    unlimitedRounds: obeliskConfig?.unlimitedRounds
                  })
                }
                title="Break field: Pathfinding cannot walk through — must fight to enter."
                type="button"
              >
                Break field
              </button>
              <button
                aria-pressed={Boolean(obeliskConfig?.persistentGuard)}
                className={`mapPresetChip${obeliskConfig?.persistentGuard ? " active" : ""}`}
                onClick={() =>
                  commitObelisk({
                    breakSet: true,
                    breakField: obeliskConfig?.breakField,
                    persistentGuard: !obeliskConfig?.persistentGuard,
                    unlimitedRounds: obeliskConfig?.unlimitedRounds
                  })
                }
                title="On lose/retreat, living guards stay for a re-fight (dead stay dead)."
                type="button"
              >
                Persistent army
              </button>
              <button
                aria-pressed={Boolean(obeliskConfig?.unlimitedRounds)}
                className={`mapPresetChip${obeliskConfig?.unlimitedRounds ? " active" : ""}`}
                onClick={() =>
                  commitObelisk({
                    breakSet: true,
                    breakField: obeliskConfig?.breakField,
                    persistentGuard: obeliskConfig?.persistentGuard,
                    unlimitedRounds: !obeliskConfig?.unlimitedRounds
                  })
                }
                title="Fight has no Round limit (bank-style)."
                type="button"
              >
                Unlimited rounds
              </button>
            </div>
          </>
        ) : null}
        {obeliskRole === "bonus" ? (
          <div className="mapPresetObeliskAwards">
            {obeliskBonuses.length > 1 ? (
              <div className="mapPresetChipRow" role="group" aria-label="Obelisk reward mode">
                <button
                  aria-pressed={obeliskBonusMode === "all"}
                  className={`mapPresetChip${obeliskBonusMode === "all" ? " active" : ""}`}
                  onClick={() => setObeliskBonusMode("all")}
                  title="The visitor gets every reward."
                  type="button"
                >
                  Get all
                </button>
                <button
                  aria-pressed={obeliskBonusMode === "choose"}
                  className={`mapPresetChip${obeliskBonusMode === "choose" ? " active" : ""}`}
                  onClick={() => setObeliskBonusMode("choose")}
                  title="The visiting player picks ONE reward."
                  type="button"
                >
                  Player picks one
                </button>
              </div>
            ) : null}
            {obeliskBonuses.map((bonus, index) => (
              <div className="mapPresetObeliskBonus" key={index}>
                <RewardGlyph src={obeliskBonusGlyph(bonus.kind)} title={`Obelisk reward ${index + 1}`} />
                <label className="mapPresetTimedKind">
                  Reward {obeliskBonuses.length > 1 ? index + 1 : ""}
                  <select
                    aria-label={`Obelisk reward ${index + 1} kind`}
                    onChange={(e) =>
                      updateObeliskBonus(index, defaultObeliskBonusForKind(e.target.value as CustomMapObeliskBonus["kind"]))
                    }
                    value={bonus.kind}
                  >
                    {MAP_PRESET_OBELISK_BONUS_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ObeliskBonusFields bonus={bonus} onChange={(next) => updateObeliskBonus(index, next)} />
                {obeliskBonuses.length > 1 ? (
                  <button
                    aria-label={`Remove Obelisk reward ${index + 1}`}
                    className="mapPresetTimedIconButton danger"
                    onClick={() => removeObeliskBonus(index)}
                    title="Remove this reward"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                ) : null}
              </div>
            ))}
            {obeliskBonuses.length < MAX_OBELISK_BONUSES ? (
              <button className="mapPresetTimedAdd" onClick={addObeliskBonus} type="button">
                <Plus aria-hidden="true" size={13} /> Add reward
              </button>
            ) : null}
          </div>
        ) : null}
        </div>
      </section>

      <section className="mapPresetSection" aria-label="Mines">
        <div className="mapPresetSectionLabel">⛏ Mines (all types)</div>
        {modeTabs("mine")}
        {objectMode("mine") === "specific"
          ? specificPanel("mine", "No placed tile carries a Mine yet — pin a mine tile (or a face-down Secret mine) first.")
          : null}
        <div hidden={objectMode("mine") !== "global"}>
        <small className="mapPresetHint">
          Optional guard and PC-style break options on every Mine. Persistent army leaves survivors after a
          lost or retreated fight.
        </small>
        <GuardLevelChips
          ariaLabel="Mine guard"
          guard={value.mines?.guard}
          label="Guard"
          onChange={(guard) => {
            const next = { ...(value.mines ?? {}) };
            if (guard) next.guard = guard;
            else delete next.guard;
            patch({
              mines:
                next.guard || next.breakField || next.persistentGuard || next.unlimitedRounds
                  ? next
                  : undefined
            });
          }}
        />
        <div className="mapPresetChipRow" role="group" aria-label="Mine break options">
          {(
            [
              ["breakField", "Break field"],
              ["persistentGuard", "Persistent army"],
              ["unlimitedRounds", "Unlimited rounds"]
            ] as const
          ).map(([key, label]) => (
            <button
              aria-pressed={Boolean(value.mines?.[key])}
              className={`mapPresetChip${value.mines?.[key] ? " active" : ""}`}
              key={key}
              onClick={() => {
                const next = { ...(value.mines ?? {}) };
                if (next[key]) delete next[key];
                else next[key] = true;
                patch({
                  mines:
                    next.guard || next.breakField || next.persistentGuard || next.unlimitedRounds
                      ? next
                      : undefined
                });
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        </div>
      </section>

      <section className="mapPresetSection" aria-label="Random Town">
        <div className="mapPresetSectionLabel">🏰 Random Town</div>
        {modeTabs("center")}
        {objectMode("center") === "specific"
          ? specificPanel(
              "center",
              "No Ⅵ–Ⅶ center tile is placed yet — the Random Town / Grail / Dragon Utopia live on center tiles."
            )
          : null}
        <div hidden={objectMode("center") !== "global"}>
        <small className="mapPresetHint">
          Override the rolled faction guard army, capture reward, and gold income (default 10). 📍 Specific
          picks a Ⅵ–Ⅶ center tile and customizes ITS objective (guard / reward / VP / win) — shared by
          Random Town, Grail, Dragon Utopia and printed center objects; map-wide Grail &amp; Utopia tuning
          lives under Victory &amp; scoring.
        </small>
        <GuardLevelChips
          ariaLabel="Random Town guard"
          guard={value.randomTowns?.guard}
          label="Guard (replaces default faction Packs when set)"
          onChange={(guard) => {
            const next = { ...(value.randomTowns ?? {}) };
            if (guard) next.guard = guard;
            else delete next.guard;
            patch({
              randomTowns:
                next.guard || next.captureReward || next.incomeGold !== undefined ? next : undefined
            });
          }}
        />
        <div className="mapPresetObjectiveRow" role="group" aria-label="Random Town income">
          <span className="mapPresetObjectiveLabel">Gold income</span>
          <input
            aria-label="Random Town gold income"
            className="mapPresetNumber"
            max={50}
            min={0}
            onChange={(e) => {
              const next = { ...(value.randomTowns ?? {}) };
              const income = Math.max(0, Math.min(50, Number(e.target.value) || 0));
              if (income === 10 && !next.guard && !next.captureReward) {
                patch({ randomTowns: undefined });
                return;
              }
              next.incomeGold = income;
              patch({ randomTowns: next });
            }}
            type="number"
            value={value.randomTowns?.incomeGold ?? 10}
          />
          <span className="mapPresetObjectiveLabel">Capture gold</span>
          <input
            aria-label="Random Town capture gold"
            className="mapPresetNumber"
            max={50}
            min={0}
            onChange={(e) => {
              const next = { ...(value.randomTowns ?? {}) };
              const gold = Math.max(0, Math.min(50, Number(e.target.value) || 0));
              if (gold > 0) next.captureReward = { ...(next.captureReward ?? {}), gold };
              else if (next.captureReward) {
                delete next.captureReward.gold;
                if (!next.captureReward.buildingMaterials && !next.captureReward.valuables) {
                  delete next.captureReward;
                }
              }
              patch({
                randomTowns:
                  next.guard || next.captureReward || next.incomeGold !== undefined ? next : undefined
              });
            }}
            type="number"
            value={value.randomTowns?.captureReward?.gold ?? 0}
          />
        </div>
        </div>
      </section>

      <section className="mapPresetSection" aria-label="Settlements">
        <div className="mapPresetSectionLabel">🏘 Settlements</div>
        {modeTabs("settlement")}
        {objectMode("settlement") === "specific"
          ? specificPanel("settlement", "No placed tile can host a settlement yet — place a Ⅱ–Ⅲ / Ⅳ–Ⅴ tile first.")
          : null}
        <div hidden={objectMode("settlement") !== "global"}>
        <small className="mapPresetHint">
          Make settlements matter: a guard fought the first time each one is flagged, and extra Victory
          Points for every settlement a player controls (VP mode only — on top of the flat 1 VP each).
        </small>
        <GuardLevelChips
          ariaLabel="Settlement guard"
          guard={settlementGuard}
          label="Guard (fought on first flag)"
          onChange={setSettlementGuard}
        />
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Bonus VP each"
            max={10}
            min={0}
            value={settlementVp || null}
            onChange={setSettlementVp}
          />
        </div>
        </div>
      </section>

      <small
        aria-label="Hidden hex events note"
        className="mapPresetHint mapPresetHexEventNote"
        title="Invisible triggers players never see: stepping on one springs an optional ambush fight, then a message, reward and Victory Points."
      >
        ⚡ Hidden hex events ({hexEvents.length}/{MAX_HEX_EVENTS}) live on the board: place them with the
        Objects palette&apos;s &quot;Hidden event&quot; button, click a marker to edit, drag it to move.
      </small>

      </MapPresetGroup>

      <MapPresetGroup title="Timed events" glyphEmoji="⏳" count={groupCounts.timedEvents}>
      <section className="mapPresetSection mapPresetTimedSection" aria-label="Timed events">
        <div className="mapPresetTimedSectionHeading">
          <div>
            <div className="mapPresetSectionLabel">
              <Clock3 aria-hidden="true" size={14} /> Timed events
            </div>
            <small className="mapPresetHint">Which round → what happens</small>
          </div>
          <span className={`mapPresetTimedCount${timed.length >= MAX_TIMED_EVENTS ? " full" : ""}`}>
            {timed.length}/{MAX_TIMED_EVENTS}
          </span>
        </div>
        <small className="mapPresetHint">
          Mission-book style: pick any round (1–30) and any effect, then tweak the numbers. Multiple
          events can share a round. Fires at the start of that round for every player.
        </small>

        <div className="mapPresetTimedTools">
          <button
            className="mapPresetTimedAdd"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() => appendTimed(defaultTimedEvent(suggestNextRound(timed, value.roundLimit)))}
            type="button"
          >
            <Plus aria-hidden="true" size={13} /> Add event
          </button>
          {timed.length > 1 ? (
            <button
              className="mapPresetTimedSort"
              onClick={() =>
                setTimed(
                  timed
                    .map((event, index) => ({ event, index }))
                    .sort((a, b) => a.event.round - b.event.round || a.index - b.index)
                    .map(({ event }) => event)
                )
              }
              type="button"
            >
              <ArrowUpDown aria-hidden="true" size={12} /> Sort by round
            </button>
          ) : null}
        </div>
        <details className="mapPresetTemplates">
          <summary>Quick templates</summary>
          <div className="mapPresetChipRow">
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed(
                {
                  round: 6,
                  effect: {
                    kind: "clear_visitable_cubes",
                    locations: ["windmill", "water_wheel", "mystical_garden"]
                  }
                }
              )
            }
            type="button"
          >
            Template: re-open mills (r6)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed(
                { round: 4, effect: { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 } }
              )
            }
            type="button"
          >
            Template: +3 gold (r4)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed(
                { round: 8, effect: { kind: "search", deck: "artifacts", count: 1 } }
              )
            }
            type="button"
          >
            Template: Search Artifacts (r8)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed({ round: 4, effect: { kind: "movement", amount: 1 } })
            }
            type="button"
          >
            Template: +1 MP (r4)
          </button>
          <button
            className="mapPresetChip"
            disabled={timed.length >= MAX_TIMED_EVENTS}
            onClick={() =>
              appendTimed({ round: 4, effect: { kind: "treasure_roll", count: 1 } })
            }
            type="button"
          >
            Template: Treasure die (r4)
          </button>
          </div>
        </details>
        {timed.length >= MAX_TIMED_EVENTS ? (
          <small className="mapPresetTimedWarning" role="status">
            Event limit reached. Remove an event before adding another.
          </small>
        ) : null}

        {timed.length > 0 ? (
          <ul className="mapPresetTimedList">
            {timed.map((event, index) => (
              <li className="mapPresetTimedCard" key={`timed-${index}`}>
                <span className="mapPresetTimedRail" aria-hidden="true">
                  {event.round}
                </span>
                <div className="mapPresetTimedHeader">
                  <label className="mapPresetTimedRound">
                    Round
                    <ClampedNumberInput
                      aria-label={`Timed event ${index + 1} round`}
                      max={30}
                      min={1}
                      onCommit={(round) => updateTimed(index, { ...event, round })}
                      value={event.round}
                    />
                  </label>
                  <label className="mapPresetTimedKind">
                    What happens
                    <select
                      aria-label={`Timed event ${index + 1} effect type`}
                      onChange={(e) => {
                        const kind = e.target.value as TimedEffectKind;
                        updateTimed(index, {
                          ...event,
                          effect: defaultTimedEffect(kind)
                        });
                      }}
                      value={event.effect.kind}
                    >
                      {TIMED_EFFECT_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {TIMED_EFFECT_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mapPresetTimedRepeat">
                    Repeat
                    <select
                      aria-label={`Timed event ${index + 1} repeat`}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const next: CustomMapTimedEvent = { round: event.round, effect: event.effect };
                        if (n >= 2) {
                          next.repeatEveryRounds = Math.min(10, n);
                        }
                        updateTimed(index, next);
                      }}
                      value={event.repeatEveryRounds ?? 0}
                    >
                      <option value={0}>Once</option>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{`Every ${n} rounds`}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    aria-label={`Duplicate timed event ${index + 1}`}
                    className="mapPresetTimedIconButton"
                    disabled={timed.length >= MAX_TIMED_EVENTS}
                    onClick={() => appendTimed(cloneTimedEvent(event))}
                    title="Duplicate this event"
                    type="button"
                  >
                    <Copy aria-hidden="true" size={13} />
                  </button>
                  <button
                    aria-label={`Remove timed event ${index + 1}`}
                    className="mapPresetTimedIconButton danger"
                    onClick={() => setTimed(timed.filter((_, i) => i !== index))}
                    title="Remove this event"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                </div>
                <TimedEffectFields
                  effect={event.effect}
                  index={index}
                  onChange={(effect) => updateTimed(index, { ...event, effect })}
                />
                <div className="mapPresetTimedPreview" aria-live="polite">
                  {describeTimedEventSchedule(event)}: {describeTimedMapEffect(event.effect)}
                </div>
                {timedEventWarning(event, value.roundLimit) ? (
                  <small className="mapPresetTimedWarning" role="status">
                    {timedEventWarning(event, value.roundLimit)}
                  </small>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <small className="mapPresetEmpty">No timed events yet — add one or pick a template.</small>
        )}
      </section>
      </MapPresetGroup>

      <MapPresetGroup title="Designer note" glyphEmoji="📝" count={groupCounts.designerNote}>
      <section className="mapPresetSection">
        <div className="mapPresetSectionLabel">Designer note (shown when map is picked)</div>
        <textarea
          aria-label="Map designer note"
          className="mapPresetNotes"
          maxLength={400}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="e.g. Cooperative feel — focus on expanding before round 8. Gold mines are secret on the outer ring."
          rows={3}
          value={value.notes ?? ""}
        />
      </section>
      </MapPresetGroup>
    </details>
  );
}

/**
 * One collapsible sub-group inside the map-conditions panel: a glyph + title +
 * active-count badge summary row (the disclosure control) over a body of leaf
 * `.mapPresetSection`s. `open={count > 0}` seeds the group OPEN when it owns at
 * least one set entry and collapsed otherwise — React only writes the `open`
 * attribute when this value CHANGES, so a designer's manual expand/collapse of
 * an empty/active group is preserved between re-renders and is only overridden
 * when the group's active state actually flips.
 */
function MapPresetGroup({
  title,
  glyphSrc,
  glyphEmoji,
  count,
  children
}: {
  title: string;
  glyphSrc?: string;
  glyphEmoji?: string;
  count: number;
  children: ReactNode;
}) {
  // Controlled collapse with STICKY state: `open={count > 0}` alone re-asserted
  // itself on every re-render, so clicking to collapse a group with active
  // settings snapped straight back open (a jarring "jump"). Keep the convenience
  // of auto-opening a group the moment it gains content (0 → >0), but otherwise
  // honour the user's toggle.
  const [open, setOpen] = useState(count > 0);
  const prevCount = useRef(count);
  useEffect(() => {
    if (prevCount.current === 0 && count > 0) {
      setOpen(true);
    }
    prevCount.current = count;
  }, [count]);
  return (
    <details
      aria-label={title}
      className="mapPresetGroup"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="mapPresetGroupHead">
        <span className="mapPresetGroupLead">
          <MapPresetGroupGlyph emoji={glyphEmoji} src={glyphSrc} />
          <span className="mapPresetGroupTitle">{title}</span>
        </span>
        {count > 0 ? <span className="mapPresetGroupCount">{count} active</span> : null}
        <span aria-hidden="true" className="mapPresetGroupChevron">
          ▸
        </span>
      </summary>
      <div className="mapPresetGroupBody">{children}</div>
    </details>
  );
}

/**
 * The group-header glyph: an asset-driven board glyph (rendered through
 * `assetUrl()`) where one fits the group, else an emoji fallback. Decorative —
 * aria-hidden; the visible title text carries the meaning.
 */
function MapPresetGroupGlyph({ emoji, src }: { emoji?: string; src?: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- assetUrl CDN path; decorative
      <img
        alt=""
        aria-hidden="true"
        className="mapPresetGroupGlyph"
        draggable={false}
        src={assetUrl(src)}
      />
    );
  }
  return (
    <span aria-hidden="true" className="mapPresetGroupGlyph mapPresetGroupGlyphEmoji">
      {emoji}
    </span>
  );
}

const CUBE_LOCATION_OPTIONS: {
  id: "windmill" | "water_wheel" | "mystical_garden";
  label: string;
}[] = [
  { id: "windmill", label: "Windmill (+ Prospector)" },
  { id: "water_wheel", label: "Water Wheel (+ Derrick)" },
  { id: "mystical_garden", label: "Mystical Garden" }
];

/** Tile-group chips for the "clear_tile_cubes" event (player-facing bands). */
const TILE_GROUP_OPTIONS: {
  id: "starting" | "far" | "near" | "center" | "sea" | "subterranean";
  label: string;
}[] = [
  { id: "starting", label: "Ⅰ" },
  { id: "far", label: "Ⅱ–Ⅲ" },
  { id: "near", label: "Ⅳ–Ⅴ" },
  { id: "center", label: "Ⅵ–Ⅶ" },
  { id: "sea", label: "Sea" },
  { id: "subterranean", label: "Underground" }
];

function TimedEffectFields({
  effect,
  index,
  onChange
}: {
  effect: CustomMapTimedEffect;
  index: number;
  onChange: (effect: CustomMapTimedEffect) => void;
}) {
  if (effect.kind === "resources") {
    // Negative = every player LOSES that much (floored at 0). The preview line
    // spells out "lose N …" so give-vs-take is unmistakable.
    return (
      <>
        <div className="mapPresetResourceRow">
          <ResourceField
            label="Gold"
            min={-50}
            max={50}
            value={effect.gold ?? 0}
            onChange={(gold) => onChange({ ...effect, gold })}
          />
          <ResourceField
            label="Materials"
            min={-50}
            max={50}
            value={effect.buildingMaterials ?? 0}
            onChange={(buildingMaterials) => onChange({ ...effect, buildingMaterials })}
          />
          <ResourceField
            label="Valuables"
            min={-50}
            max={50}
            value={effect.valuables ?? 0}
            onChange={(valuables) => onChange({ ...effect, valuables })}
          />
        </div>
        <small className="mapPresetHint">
          Positive = every player gains it; negative = every player loses it (never below 0).
        </small>
      </>
    );
  }
  if (effect.kind === "experience") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Experience +"
          max={5}
          min={1}
          value={effect.amount}
          onChange={(amount) => onChange({ kind: "experience", amount: Math.max(1, Math.min(5, amount)) })}
        />
      </div>
    );
  }
  if (effect.kind === "search") {
    return (
      <div className="mapPresetResourceRow">
        <label className="mapPresetResourceField">
          <span>Deck</span>
          <select
            aria-label={`Timed event ${index + 1} search deck`}
            onChange={(e) =>
              onChange({
                ...effect,
                deck: e.target.value as "artifacts" | "spells" | "abilities"
              })
            }
            value={effect.deck}
          >
            <option value="artifacts">Artifacts</option>
            <option value="spells">Spells</option>
            <option value="abilities">Abilities</option>
          </select>
        </label>
        <ResourceField
          label="Search size"
          max={5}
          min={1}
          value={effect.count}
          onChange={(count) => onChange({ ...effect, count: Math.max(1, count) })}
        />
      </div>
    );
  }
  if (effect.kind === "clear_visitable_cubes") {
    const selected = new Set(effect.locations);
    return (
      <div className="mapPresetChipRow" role="group" aria-label={`Timed event ${index + 1} locations`}>
        {CUBE_LOCATION_OPTIONS.map((opt) => {
          const on = selected.has(opt.id);
          return (
            <button
              aria-pressed={on}
              className={`mapPresetChip${on ? " active" : ""}`}
              key={opt.id}
              onClick={() => {
                const next = new Set(selected);
                if (on) {
                  // Keep at least one location so the event stays valid.
                  if (next.size <= 1) {
                    return;
                  }
                  next.delete(opt.id);
                } else {
                  next.add(opt.id);
                }
                onChange({
                  kind: "clear_visitable_cubes",
                  locations: [...next] as ("windmill" | "water_wheel" | "mystical_garden")[]
                });
              }}
              type="button"
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (effect.kind === "clear_tile_cubes") {
    const selected = new Set(effect.groups);
    return (
      <>
        <div className="mapPresetChipRow" role="group" aria-label={`Timed event ${index + 1} tile groups`}>
          {TILE_GROUP_OPTIONS.map((opt) => {
            const on = selected.has(opt.id);
            return (
              <button
                aria-pressed={on}
                className={`mapPresetChip${on ? " active" : ""}`}
                key={opt.id}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) {
                    // Keep at least one group so the event stays valid.
                    if (next.size <= 1) {
                      return;
                    }
                    next.delete(opt.id);
                  } else {
                    next.add(opt.id);
                  }
                  onChange({
                    ...effect,
                    groups: TILE_GROUP_OPTIONS.map((o) => o.id).filter((id) => next.has(id))
                  });
                }}
                type="button"
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <label className="mapPresetToggle">
          <input
            aria-label={`Timed event ${index + 1} skip settlement tiles`}
            checked={effect.excludeSettlementTiles ?? false}
            onChange={(e) => onChange({ ...effect, excludeSettlementTiles: e.target.checked })}
            type="checkbox"
          />
          <span>Skip tiles with a settlement</span>
        </label>
      </>
    );
  }
  if (effect.kind === "morale") {
    return (
      <div className="mapPresetChipRow" role="group" aria-label={`Timed event ${index + 1} morale`}>
        <button
          aria-pressed={effect.amount === 1}
          className={`mapPresetChip${effect.amount === 1 ? " active" : ""}`}
          onClick={() => onChange({ kind: "morale", amount: 1 })}
          type="button"
        >
          +1 morale
        </button>
        <button
          aria-pressed={effect.amount === -1}
          className={`mapPresetChip${effect.amount === -1 ? " active" : ""}`}
          onClick={() => onChange({ kind: "morale", amount: -1 })}
          type="button"
        >
          −1 morale
        </button>
      </div>
    );
  }
  if (effect.kind === "movement") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Movement +"
          max={5}
          min={1}
          value={effect.amount}
          onChange={(amount) => onChange({ kind: "movement", amount: Math.max(1, amount) })}
        />
      </div>
    );
  }
  if (effect.kind === "treasure_roll" || effect.kind === "resource_roll") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Dice"
          max={3}
          min={1}
          value={effect.count}
          onChange={(count) => onChange({ ...effect, count: Math.max(1, count) })}
        />
      </div>
    );
  }
  if (effect.kind === "story") {
    return (
      <div className="mapPresetResourceRow">
        <label className="mapPresetResourceField">
          <span>Scene</span>
          <select
            aria-label={`Timed event ${index + 1} story scene`}
            onChange={(e) => onChange({ kind: "story", sceneId: e.target.value })}
            value={effect.sceneId}
          >
            {listStoryScenes().map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.theme ? `${scene.id} (${scene.theme})` : scene.id}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  // note
  return (
    <textarea
      aria-label={`Timed event ${index + 1} announcement text`}
      className="mapPresetNotes mapPresetTimedNote"
      maxLength={200}
      onChange={(e) => onChange({ kind: "note", text: e.target.value })}
      placeholder="Announcement shown in the feed when this round starts…"
      rows={2}
      value={effect.text}
    />
  );
}

/** Amount controls for the "bonus" Obelisk role (morale is a fixed +1, no fields). */
/**
 * Map-wide guard picker (Obelisks, Settlements, Mines, Random Towns) — full
 * shared editor: level Ⅰ–Ⅶ or exact army with random-tier + named units.
 */
function GuardLevelChips({
  label,
  guard,
  onChange,
  ariaLabel
}: {
  label: string;
  guard: CustomGuardSpec | undefined;
  onChange: (guard: CustomGuardSpec | undefined) => void;
  ariaLabel: string;
}) {
  return (
    <div className="mapPresetObjectiveRow" role="group" aria-label={ariaLabel}>
      <span className="mapPresetObjectiveLabel">⚔ {label}</span>
      <GuardSpecEditor compact guard={guard} noneLabel="None" onChange={onChange} />
    </div>
  );
}

function ObeliskBonusFields({
  bonus,
  onChange
}: {
  bonus: CustomMapObeliskBonus;
  onChange: (bonus: CustomMapObeliskBonus) => void;
}) {
  if (bonus.kind === "search") {
    return (
      <div className="mapPresetResourceRow">
        <label className="mapPresetResourceField">
          <span>Deck</span>
          <select
            aria-label="Obelisk bonus search deck"
            onChange={(e) => onChange({ ...bonus, deck: e.target.value as "artifacts" | "spells" | "abilities" })}
            value={bonus.deck}
          >
            <option value="artifacts">Artifacts</option>
            <option value="spells">Spells</option>
            <option value="abilities">Abilities</option>
          </select>
        </label>
        <ResourceField
          label="Search size"
          max={3}
          min={1}
          value={bonus.count}
          onChange={(count) => onChange({ ...bonus, count: Math.max(1, Math.min(3, count)) })}
        />
      </div>
    );
  }
  if (bonus.kind === "resources") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Gold"
          max={5}
          value={bonus.gold ?? 0}
          onChange={(gold) => onChange({ ...bonus, gold })}
        />
        <ResourceField
          label="Materials"
          max={5}
          value={bonus.buildingMaterials ?? 0}
          onChange={(buildingMaterials) => onChange({ ...bonus, buildingMaterials })}
        />
        <ResourceField
          label="Valuables"
          max={5}
          value={bonus.valuables ?? 0}
          onChange={(valuables) => onChange({ ...bonus, valuables })}
        />
      </div>
    );
  }
  if (bonus.kind === "movement") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Movement +"
          max={3}
          min={1}
          value={bonus.amount}
          onChange={(amount) => onChange({ kind: "movement", amount: Math.max(1, Math.min(3, amount)) })}
        />
      </div>
    );
  }
  if (bonus.kind === "experience") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Experience +"
          max={5}
          min={1}
          value={bonus.amount}
          onChange={(amount) => onChange({ kind: "experience", amount: Math.max(1, Math.min(5, amount)) })}
        />
      </div>
    );
  }
  if (bonus.kind === "dice") {
    return (
      <div className="mapPresetResourceRow">
        <ResourceField
          label="Treasure dice"
          max={2}
          value={bonus.treasure}
          onChange={(treasure) => onChange({ ...bonus, treasure: Math.max(0, Math.min(2, treasure)) })}
        />
        <ResourceField
          label="Resource dice"
          max={2}
          value={bonus.resource}
          onChange={(resource) => onChange({ ...bonus, resource: Math.max(0, Math.min(2, resource)) })}
        />
      </div>
    );
  }
  if (bonus.kind === "ability_token") {
    return <small className="mapPresetHint">Each visitor Searches (1) the Ability deck (Ability token).</small>;
  }
  // morale: a fixed single positive token — nothing to configure.
  return <small className="mapPresetHint">Each visitor gains a single positive morale token.</small>;
}

/**
 * A clearable, clamped numeric input.
 *
 * The classic `value={aNumber}` + `Number(e.target.value) || floor` idiom snaps
 * an emptied field straight back to its floor digit, so a low / single-digit
 * value can never be typed — you cannot delete the leading digit to fix it
 * (the reported timed-event "can't remove the first 1, cannot set below 10"
 * bug). This keeps a local editing draft so the field may be BLANK while the
 * user retypes; it commits a clamped integer only for a non-empty value, and
 * reverts to the last committed value on blur when left blank.
 */
function ClampedNumberInput({
  value,
  min,
  max,
  onCommit,
  className,
  placeholder,
  title,
  "aria-label": ariaLabel
}: {
  value: number | null | undefined;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  "aria-label"?: string;
}) {
  const committed = value == null ? "" : String(value);
  // `draft` is the raw text while editing (null = "show the committed value").
  // An empty-string draft is a valid transient blank the user can type into.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={ariaLabel}
      className={className}
      max={max}
      min={min}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === "") return; // allow blank while editing; commit nothing yet
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        onCommit(Math.max(min, Math.min(max, Math.trunc(n))));
      }}
      placeholder={placeholder}
      title={title}
      type="number"
      value={draft ?? committed}
    />
  );
}

function ResourceField({
  label,
  value,
  onChange,
  min = 0,
  max = 99
}: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="mapPresetResourceField">
      <span>{label}</span>
      <ClampedNumberInput
        max={max}
        min={min}
        onCommit={onChange}
        placeholder="—"
        value={value}
      />
    </label>
  );
}

/**
 * A small board-game reward glyph (Heegu-sama/Homm3BG print-and-play set) that
 * labels a preset row — decorative, so it is aria-hidden and the row text still
 * carries the meaning for screen readers.
 */
function RewardGlyph({ src, title }: { src: string; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- assetUrl CDN path; decorative
    <img
      alt=""
      aria-hidden="true"
      className="mapPresetRowGlyph"
      draggable={false}
      src={assetUrl(src)}
      title={title}
    />
  );
}

/** The reward glyph for an Obelisk fixed-bonus kind. */
function obeliskBonusGlyph(kind: CustomMapObeliskBonus["kind"]): string {
  switch (kind) {
    case "morale":
      return REWARD_GLYPH_ICONS.moralePositive;
    case "search":
      return REWARD_GLYPH_ICONS.treasure;
    case "ability_token":
      return REWARD_GLYPH_ICONS.treasure;
    case "resources":
      return REWARD_GLYPH_ICONS.gold;
    case "movement":
      return REWARD_GLYPH_ICONS.movement;
    case "experience":
      return REWARD_GLYPH_ICONS.experience;
    case "dice":
      return REWARD_GLYPH_ICONS.resourceDie;
  }
}

/** The reward glyph for a Victory-Point objective kind. */
function vpObjectiveGlyph(kind: VictoryPointObjective["kind"]): string {
  switch (kind) {
    case "control-towns":
      return REWARD_GLYPH_ICONS.materials;
    case "flag-mines":
      return REWARD_GLYPH_ICONS.gold;
    case "hero-level":
      return REWARD_GLYPH_ICONS.experience;
    case "defeat-dragon-utopia":
      return REWARD_GLYPH_ICONS.attack;
  }
}

/** The reward glyph for a custom-win-condition kind. */
function winConditionGlyph(kind: CustomWinCondition["kind"]): string {
  switch (kind) {
    case "control-towns":
      return REWARD_GLYPH_ICONS.materials;
    case "flag-mines":
      return REWARD_GLYPH_ICONS.gold;
    case "hero-level":
      return REWARD_GLYPH_ICONS.experience;
    case "gold":
      return REWARD_GLYPH_ICONS.gold;
    case "artifacts":
      return REWARD_GLYPH_ICONS.treasure;
    case "buildings":
      return REWARD_GLYPH_ICONS.materials;
    case "obelisks":
      return REWARD_GLYPH_ICONS.movement;
    case "defeat-heroes":
    case "defeat-dragon-utopia":
      return REWARD_GLYPH_ICONS.attack;
  }
}

function setUnit(
  units: CustomStartingUnit[] | null,
  level: UnitLevel,
  side: "few" | "pack",
  patch: (partial: Partial<CustomMapPreset>) => void
) {
  const rest = (units ?? []).filter((u) => u.level !== level);
  rest.push({ level, side });
  rest.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  patch({ startingUnits: rest });
}

function describeBonusLine(bonus: CustomMapStartingBonus): string {
  if (bonus.kind === "resources") {
    const parts: string[] = [];
    if (bonus.gold) {
      parts.push(`${bonus.gold} gold`);
    }
    if (bonus.buildingMaterials) {
      parts.push(`${bonus.buildingMaterials} materials`);
    }
    if (bonus.valuables) {
      parts.push(`${bonus.valuables} valuables`);
    }
    return `+${parts.join(", ") || "resources"}`;
  }
  if (bonus.kind === "search") {
    return `Search(${bonus.count}) ${bonus.deck}`;
  }
  return bonus.amount > 0 ? "+1 morale" : "−1 morale";
}

/** Suggest a sensible next round when adding a blank timed event. */
function suggestNextRound(existing: CustomMapTimedEvent[], roundLimit?: number): number {
  if (existing.length === 0) {
    return Math.min(6, roundLimit ?? 30);
  }
  const max = Math.max(...existing.map((e) => e.round));
  return Math.min(roundLimit ?? 30, 30, max + 2);
}

function cloneTimedEvent(event: CustomMapTimedEvent): CustomMapTimedEvent {
  const clone: CustomMapTimedEvent = {
    round: event.round,
    effect:
      event.effect.kind === "clear_visitable_cubes"
        ? { ...event.effect, locations: [...event.effect.locations] }
        : { ...event.effect }
  };
  if (event.repeatEveryRounds) {
    clone.repeatEveryRounds = event.repeatEveryRounds;
  }
  return clone;
}

function timedEventWarning(event: CustomMapTimedEvent, roundLimit?: number): string | null {
  if (roundLimit && event.round > roundLimit) {
    return `This fires after the suggested ${roundLimit}-round map length.`;
  }
  if (
    event.effect.kind === "resources" &&
    !event.effect.gold &&
    !event.effect.buildingMaterials &&
    !event.effect.valuables
  ) {
    return "Set at least one resource above 0 or this event will be removed when saved.";
  }
  if (event.effect.kind === "note" && event.effect.text.trim().length === 0) {
    return "Write an announcement or this event will be removed when saved.";
  }
  return null;
}
