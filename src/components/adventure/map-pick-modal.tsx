"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * The Setup Hub's Map window: every playable map (built-in scenario sheets +
 * designed maps from the shared library) in one filterable list, a read-only
 * MAP SHAPE preview + info panel for the highlighted map, and the difficulty
 * bar as four chess pieces (Pawn = Easy … King = Impossible). Picking a map /
 * difficulty dispatches the SAME SET_GAME_OPTIONS payloads the classic
 * Map & Setup controls send — one engine wiring, two surfaces.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Hammer, Search } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { fetchSharedMaps, type SharedMapRecord } from "@/lib/shared-maps";
import {
  describeCustomMapPresetEntries,
  scenarioDefinitions,
  validateCustomMapPlan,
  type GameAction,
  type GameSetupOptions,
  type GameState,
  type PlayerId,
  type ScenarioDefinition
} from "@/engine";
import { DIFFICULTY_CHESS_ICONS } from "@/data/assets/homm-assets";
import { DIFFICULTY_CHOICES } from "./setup-hub-summary";
import { designedTilesToPreview, MapShapePreview, scenarioToTilePlans } from "./map-shape-preview";
import { SetupHubWindow } from "./setup-hub-window";

type MapEntry =
  | { kind: "builtin"; key: string; scenario: ScenarioDefinition }
  | { kind: "designed"; key: string; record: SharedMapRecord; problems: string[] };

type SourceFilter = "all" | "builtin" | "designed";

/**
 * The difficulty bar: Easy = Pawn, Normal = Knight, Hard = Rook,
 * Impossible = King. Same `SET_GAME_OPTIONS { difficulty }` dispatch as the
 * classic text-chip row on the Map & Setup tab.
 */
export function DifficultyChessBar({
  options,
  send
}: {
  options: GameSetupOptions;
  send: (next: Partial<GameSetupOptions>) => void;
}) {
  return (
    <div className="difficultyChessBar" role="group" aria-label="Neutral difficulty">
      {DIFFICULTY_CHOICES.map((choice) => {
        const selected = options.difficulty === choice.id;
        return (
          <button
            aria-pressed={selected}
            className={`difficultyChessBtn ${selected ? "selected" : ""}`}
            key={choice.id}
            onClick={() => send({ difficulty: choice.id })}
            title={choice.hint}
            type="button"
          >
            <img alt="" aria-hidden="true" decoding="async" src={assetUrl(DIFFICULTY_CHESS_ICONS[choice.id])} />
            <span>{choice.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MapPickModal({
  state,
  viewerPlayerId,
  onAction,
  onClose
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  onClose: () => void;
}) {
  const lobby = state.setupLobby;
  const options = lobby?.options;
  const [savedMaps, setSavedMaps] = useState<SharedMapRecord[]>([]);
  const [source, setSource] = useState<SourceFilter>("all");
  const [seatFilter, setSeatFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // The shared map library — fetched only while this window is open (same
  // effect as the classic MapPicker, incl. the focus re-fetch).
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchSharedMaps().then((maps) => {
        if (!cancelled) {
          setSavedMaps(maps);
        }
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const entries = useMemo<MapEntry[]>(() => {
    const builtins: MapEntry[] = Object.values(scenarioDefinitions).map((scenario) => ({
      kind: "builtin",
      key: `builtin:${scenario.id}`,
      scenario
    }));
    const designed: MapEntry[] = savedMaps.map((record) => {
      const scenario = scenarioDefinitions[record.scenarioId];
      return {
        kind: "designed",
        key: `designed:${record.id}`,
        record,
        problems: scenario ? validateCustomMapPlan(record.tiles, scenario).problems : ["Unknown scenario."]
      };
    });
    return [...builtins, ...designed];
  }, [savedMaps]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (source !== "all" && entry.kind !== source) {
        return false;
      }
      if (seatFilter !== null) {
        if (entry.kind === "builtin") {
          if (seatFilter < entry.scenario.minPlayers || seatFilter > entry.scenario.maxPlayers) {
            return false;
          }
        } else if (entry.record.players !== seatFilter) {
          return false;
        }
      }
      if (needle) {
        const haystack =
          entry.kind === "builtin"
            ? entry.scenario.name
            : `${entry.record.name} ${entry.record.createdByName ?? ""}`;
        if (!haystack.toLowerCase().includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, source, seatFilter, query]);

  if (!lobby || !options) {
    return null;
  }

  const send = (next: Partial<GameSetupOptions>) =>
    onAction({ type: "SET_GAME_OPTIONS", playerId: viewerPlayerId, options: next });

  const usingScenarioSheet = !options.customMap;
  const isApplied = (entry: MapEntry) =>
    entry.kind === "builtin"
      ? usingScenarioSheet && options.scenarioId === entry.scenario.id
      : Boolean(options.customMap) &&
        options.customMapName === entry.record.name &&
        options.customMap?.length === entry.record.tiles.length;

  const appliedEntry = entries.find(isApplied) ?? null;
  const selected = (selectedKey ? entries.find((entry) => entry.key === selectedKey) : null) ?? appliedEntry;

  const applyEntry = (entry: MapEntry) => {
    if (entry.kind === "builtin") {
      // Picking a scenario sheet uses its own face-down layout and drops any
      // designed map (sent together so the engine never leaves a stale map
      // attached to a different scenario).
      send({ scenarioId: entry.scenario.id, customMode: false, customMap: null, customMapName: null });
      return;
    }
    // A saved map carries the seat count it was designed for; switch the
    // scenario first (so playerCount clamps to the new scenario), open that
    // many seats, then apply the map — same payload as the classic picker.
    send({
      ...(entry.record.scenarioId !== options.scenarioId ? { scenarioId: entry.record.scenarioId } : {}),
      playerCount: entry.record.players,
      customMode: true,
      customMap: entry.record.tiles,
      customMapName: entry.record.name,
      customMapPreset: entry.record.preset ?? null
    });
  };

  return (
    <SetupHubWindow className="setupHubWindow--map" eyebrow="Map setup" label="Choose a map" onClose={onClose}>
      <div className="mapPickFilters">
        <div className="mapPickFilterChips" role="group" aria-label="Map source">
          {(
            [
              ["all", "All"],
              ["builtin", "Built-in"],
              ["designed", "Designed"]
            ] as const
          ).map(([id, label]) => (
            <button
              aria-pressed={source === id}
              className={source === id ? "selected" : ""}
              key={id}
              onClick={() => setSource(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mapPickFilterChips" role="group" aria-label="Player count">
          {([null, 2, 3, 4] as const).map((count) => (
            <button
              aria-pressed={seatFilter === count}
              className={seatFilter === count ? "selected" : ""}
              key={count ?? "any"}
              onClick={() => setSeatFilter(count)}
              type="button"
            >
              {count === null ? "Any players" : `${count}p`}
            </button>
          ))}
        </div>
        <label className="mapPickSearch">
          <Search aria-hidden="true" size={13} />
          <input
            aria-label="Search maps"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search maps…"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="mapPickLayout">
        <div className="mapPickList" role="listbox" aria-label="Available maps">
          {filtered.length === 0 ? (
            <small className="optionHint">No map matches these filters.</small>
          ) : (
            filtered.map((entry) => {
              const applied = isApplied(entry);
              const highlighted = selected?.key === entry.key;
              const name = entry.kind === "builtin" ? entry.scenario.name : entry.record.name;
              const author =
                entry.kind === "designed" ? entry.record.createdByName?.trim() || "a player" : null;
              return (
                <button
                  aria-selected={highlighted}
                  className={`mapPickRow ${highlighted ? "highlighted" : ""} ${applied ? "applied" : ""}`}
                  key={entry.key}
                  onClick={() => setSelectedKey(entry.key)}
                  role="option"
                  type="button"
                >
                  <span className="mapPickRowName">
                    {entry.kind === "designed" ? "🗺 " : "📜 "}
                    {name}
                  </span>
                  <small className="mapPickRowMeta">
                    {entry.kind === "builtin"
                      ? `built-in · ${entry.scenario.minPlayers}–${entry.scenario.maxPlayers} players`
                      : `by ${author} · ${entry.record.players} players${entry.record.preset ? " · conditions" : ""}`}
                    {applied ? " · in play" : ""}
                  </small>
                </button>
              );
            })
          )}
        </div>

        <div className="mapPickDetail">
          {selected ? (
            <>
              <MapShapePreview
                tiles={
                  selected.kind === "builtin"
                    ? scenarioToTilePlans(selected.scenario)
                    : designedTilesToPreview(selected.record.tiles)
                }
              />
              <div className="mapPickInfo">
                <strong>{selected.kind === "builtin" ? selected.scenario.name : selected.record.name}</strong>
                {selected.kind === "builtin" ? (
                  <>
                    <small>
                      Built-in scenario sheet · {selected.scenario.minPlayers}–{selected.scenario.maxPlayers} players
                    </small>
                    <small>{selected.scenario.description}</small>
                    <small className="mapPickCredit">{selected.scenario.source.product}</small>
                  </>
                ) : (
                  <>
                    <small>
                      Designed map · by {selected.record.createdByName?.trim() || "a player"} ·{" "}
                      {selected.record.players} players · {selected.record.tiles.length} tiles
                    </small>
                    <small>
                      Built on {scenarioDefinitions[selected.record.scenarioId]?.name ?? selected.record.scenarioId}
                    </small>
                    {selected.problems.length > 0 ? (
                      <small className="mapPickProblem">Needs fixing in the designer: {selected.problems[0]}</small>
                    ) : null}
                    {selected.record.preset ? (
                      <div className="mapPresetLobbyBanner" role="status">
                        <strong>📜 This map has special conditions</strong>
                        <ul className="mapPresetEntryList">
                          {describeCustomMapPresetEntries(selected.record.preset).map((entry) => (
                            <li key={entry.text}>
                              <span className="mapPresetEntryIcon" aria-hidden="true">
                                {entry.icon}
                              </span>
                              {entry.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
                <button
                  className="mapPickUseButton"
                  disabled={isApplied(selected) || (selected.kind === "designed" && selected.problems.length > 0)}
                  onClick={() => applyEntry(selected)}
                  type="button"
                >
                  {isApplied(selected) ? "✓ In play" : "Play this map"}
                </button>
              </div>
            </>
          ) : (
            <small className="optionHint">Pick a map on the left to preview its shape.</small>
          )}
        </div>
      </div>

      <div className="mapPickDifficulty">
        <small className="mapPickDifficultyLabel">
          Neutral difficulty —{" "}
          {DIFFICULTY_CHOICES.find((choice) => choice.id === options.difficulty)?.hint ?? ""}
        </small>
        <DifficultyChessBar options={options} send={send} />
      </div>

      <small className="optionHint designerLink">
        <Link href="/designer" target="_blank">
          <Hammer aria-hidden="true" size={11} /> Open the map designer
        </Link>{" "}
        to create, edit and save your own maps (shared with everyone), then pick one above. Picking a designed map
        opens the seat count it was designed for.
      </small>
    </SetupHubWindow>
  );
}
