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
  clampSeatCount,
  describeCustomMapPresetEntries,
  scenarioDefinitions,
  singlePlayerMapDeployment,
  validateCustomMapPlan,
  type GameAction,
  type GameSetupOptions,
  type GameState,
  type PlayerId,
  type ScenarioDefinition
} from "@/engine";
import { DIFFICULTY_CHESS_ICONS } from "@/data/assets/homm-assets";
import { DIFFICULTY_CHOICES, designedMapBlockers, designedMapInPlay } from "./setup-hub-summary";
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
  send,
  mapDifficulty = null
}: {
  options: GameSetupOptions;
  send: (next: Partial<GameSetupOptions>) => void;
  /**
   * Difficulty the currently PREVIEWED map authors, marked with a "map" tag so
   * clicking through the list visibly moves something even before "Play this map"
   * commits it (the gold `selected` ring follows the LIVE lobby value only).
   */
  mapDifficulty?: GameSetupOptions["difficulty"] | null;
}) {
  return (
    <div className="difficultyChessBar" role="group" aria-label="Neutral difficulty">
      {DIFFICULTY_CHOICES.map((choice) => {
        const selected = options.difficulty === choice.id;
        const mapSet = mapDifficulty === choice.id && !selected;
        return (
          <button
            aria-pressed={selected}
            className={`difficultyChessBtn ${selected ? "selected" : ""} ${mapSet ? "mapSet" : ""}`}
            key={choice.id}
            onClick={() => send({ difficulty: choice.id })}
            title={mapSet ? `${choice.hint} — this map sets it` : choice.hint}
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
        problems: designedMapBlockers(
          record.tiles.length,
          scenario ? validateCustomMapPlan(record.tiles, scenario, record.players).problems : ["Unknown scenario."]
        )
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

  // "In play" must mean what the ENGINE will build (designedMapInPlay), or a
  // designed plan the game ignores would be marked applied while the Map box
  // still named the scenario sheet.
  const usingScenarioSheet = !designedMapInPlay(options);
  const singlePlayer = state.sessionMode === "single-player";
  const seatsForEntry = (entry: MapEntry): number => {
    const scenario =
      entry.kind === "builtin" ? entry.scenario : scenarioDefinitions[entry.record.scenarioId];
    if (!scenario) {
      return lobby.seats.length;
    }
    if (entry.kind === "builtin") {
      return clampSeatCount(scenario, singlePlayer ? scenario.minPlayers : lobby.seats.length);
    }
    const deployment = singlePlayer
      ? singlePlayerMapDeployment(
          entry.record.tiles,
          Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1
        )
      : null;
    return clampSeatCount(
      scenario,
      deployment ? 1 + deployment.computers.length : entry.record.players
    );
  };
  const isApplied = (entry: MapEntry) =>
    entry.kind === "builtin"
      ? usingScenarioSheet && options.scenarioId === entry.scenario.id
      : designedMapInPlay(options) &&
        options.customMapName === entry.record.name &&
        options.customMap?.length === entry.record.tiles.length;

  const appliedEntry = entries.find(isApplied) ?? null;
  const selected = (selectedKey ? entries.find((entry) => entry.key === selectedKey) : null) ?? appliedEntry;
  // What applying the highlighted map would do to the SEATS. A map pick resizes
  // the lobby (a designed map to the count it was built for, a sheet down to its
  // own ceiling) and closed seats take their faction/hero picks with them — a
  // cross-box consequence the Heroes & Draft box could not warn about.
  const seatChange = (() => {
    // Only for a map that is about to be APPLIED — the one already in play has
    // nothing to warn about (its "Play this map" button is disabled anyway).
    if (!selected || isApplied(selected)) {
      return null;
    }
    const scenario =
      selected.kind === "builtin" ? selected.scenario : scenarioDefinitions[selected.record.scenarioId];
    if (!scenario) {
      return null;
    }
    const now = lobby.seats.length;
    const next = seatsForEntry(selected);
    if (next === now) {
      return null;
    }
    const losingPicks = lobby.seats.slice(next).filter((seat) => seat.factionId || seat.heroDefId).length;
    return { now, next, losingPicks };
  })();
  const selectedName = selected
    ? selected.kind === "builtin"
      ? selected.scenario.name
      : selected.record.name
    : "";
  // A map carries a difficulty only when its AUTHOR set one in the designer (a
  // built-in scenario sheet never does — every sheet ships the same setup).
  const selectedMapDifficulty =
    selected?.kind === "designed" ? selected.record.preset?.difficulty ?? null : null;

  // Picking a map NEVER writes `customMode`: that key belongs to the Game-mode
  // box alone (it is what makes its Custom card active and what the Advanced
  // box reports). Sending it here used to silently throw the table into
  // "Custom — your saved setup" on every designed-map pick, and to drop a
  // deliberately chosen Custom mode on every built-in pick — the table's mode
  // choice disappearing behind a map choice.
  const applyEntry = (entry: MapEntry) => {
    if (entry.kind === "builtin") {
      // Picking a scenario sheet uses its own face-down layout and drops any
      // designed map (sent together so the engine never leaves a stale map
      // attached to a different scenario).
      send({
        scenarioId: entry.scenario.id,
        ...(singlePlayer ? { playerCount: entry.scenario.minPlayers } : {}),
        customMap: null,
        customMapName: null
      });
      return;
    }
    // A saved map carries the seat count it was designed for; switch the
    // scenario first (so playerCount clamps to the new scenario), open that
    // many seats, then apply the map — same payload as the classic picker.
    send({
      ...(entry.record.scenarioId !== options.scenarioId ? { scenarioId: entry.record.scenarioId } : {}),
      playerCount: seatsForEntry(entry),
      customMap: entry.record.tiles,
      customMapName: entry.record.name,
      customMapPreset: entry.record.preset ?? null
    });
  };

  return (
    <SetupHubWindow
      className="setupHubWindow--map"
      eyebrow="Map setup"
      label="Choose a map"
      onClose={onClose}
    >
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
              {/* Scrolls on its own; the apply bar below NEVER scrolls away —
                  "Play this map" must be visible without hunting for it. */}
              <div className="mapPickDetailScroll">
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
                    {singlePlayer ? (
                      <small className="mapPickSoloSetup">
                        Solo setup: {Math.max(1, selected.scenario.minPlayers - 1)} computer opponent
                        {selected.scenario.minPlayers === 2 ? "" : "s"} · standard starting positions
                      </small>
                    ) : null}
                    <small>{selected.scenario.description}</small>
                    <small className="mapPickCredit">{selected.scenario.source.product}</small>
                  </>
                ) : (
                  <>
                    <small>
                      Designed map · by {selected.record.createdByName?.trim() || "a player"} ·{" "}
                      {selected.record.players} {singlePlayer ? "multiplayer seats" : "players"} · {selected.record.tiles.length} tiles
                    </small>
                    {singlePlayer ? (() => {
                      const selectedScenario = scenarioDefinitions[selected.record.scenarioId];
                      const deployment = singlePlayerMapDeployment(
                        selected.record.tiles,
                        selectedScenario
                          ? Math.min(selectedScenario.maxPlayers, selectedScenario.layout.starts.length) - 1
                          : 0
                      );
                      const enemies = deployment
                        ? deployment.computers.length
                        : Math.max(1, selected.record.players - 1);
                      const startPlans = selected.record.tiles.filter((plan) => plan.group === "starting");
                      const humanStart = deployment ? startPlans.indexOf(deployment.human) + 1 : 1;
                      return (
                        <small className="mapPickSoloSetup">
                          Solo setup: {enemies} computer opponent{enemies === 1 ? "" : "s"} · you start at S{humanStart}
                          {deployment ? " (authored)" : " (standard seat order)"}
                        </small>
                      );
                    })() : null}
                    <small>
                      Built on {scenarioDefinitions[selected.record.scenarioId]?.name ?? selected.record.scenarioId}
                    </small>
                    {selected.problems.length > 0 ? (
                      <small className="mapPickProblem">Needs fixing in the designer: {selected.problems[0]}</small>
                    ) : null}
                    {/* Entries include the Ⅶ Grail / Utopia reward-stacking line,
                        which rides the TILES — so the banner shows even when the
                        map carries no other special condition. */}
                    {describeCustomMapPresetEntries(selected.record.preset, selected.record.tiles).length >
                    0 ? (
                      <div className="mapPresetLobbyBanner" role="status">
                        <strong>📜 This map has special conditions</strong>
                        <ul className="mapPresetEntryList">
                          {describeCustomMapPresetEntries(
                            selected.record.preset,
                            selected.record.tiles
                          ).map((entry) => (
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
              </div>
              </div>
              <div className="mapPickApplyBar">
                {seatChange ? (
                  <small className="mapPickSeatChange">
                    {`Playing it opens ${seatChange.next} seats (the table has ${seatChange.now} now)${
                      seatChange.losingPicks > 0
                        ? ` — ${seatChange.losingPicks} seat${
                            seatChange.losingPicks === 1 ? " closes" : "s close"
                          }, and their town & hero picks go with them.`
                        : "."
                    }`}
                  </small>
                ) : null}
                <button
                  className="mapPickUseButton"
                  disabled={isApplied(selected) || (selected.kind === "designed" && selected.problems.length > 0)}
                  onClick={() => applyEntry(selected)}
                  type="button"
                >
                  {isApplied(selected) ? "✓ In play" : `▶ Play this map — ${selectedName}`}
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
        <DifficultyChessBar mapDifficulty={selectedMapDifficulty} options={options} send={send} />
        {/*
          Why the bar does not move when you click through the list: only a map
          whose AUTHOR set a difficulty brings one, and it is applied by "Play this
          map", never by merely previewing. Say which of the two the selected map
          is, so an unchanged bar reads as an answer instead of a dead control.
        */}
        <small className="mapPickDifficultyNote">
          {!selected
            ? "Pick a map to see whether it brings a difficulty of its own."
            : selectedMapDifficulty
              ? `${selectedName} sets ${
                  DIFFICULTY_CHOICES.find((choice) => choice.id === selectedMapDifficulty)?.label ??
                  selectedMapDifficulty
                } — “Play this map” applies it, and you can still change it afterwards.`
              : `${selectedName} brings no difficulty of its own, so this stays on your pick. A map's author sets one in the map designer.`}
        </small>
      </div>

      <small className="optionHint designerLink">
        <Link href="/designer" target="_blank">
          <Hammer aria-hidden="true" size={11} /> Open the map designer
        </Link>{" "}
        to create, edit and save your own maps (shared with everyone), then pick one above. {singlePlayer
          ? "In single-player, the map chooses your start, AI starts and opponent count; multiplayer still uses its ordinary seats."
          : "Picking a designed map opens the multiplayer seat count it was designed for."}
      </small>
    </SetupHubWindow>
  );
}
