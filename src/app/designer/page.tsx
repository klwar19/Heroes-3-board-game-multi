"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FilePlus2, Save, Trash2 } from "lucide-react";
import { MapDesigner } from "@/components/adventure/map-designer";
import {
  scenarioDefinitions,
  validateCustomMapPlan,
  type CustomMapTilePlan
} from "@/engine";
import { clampMapPlayers, MAX_MAP_PLAYERS, MIN_MAP_PLAYERS, newSharedMapId } from "@/server/map-registry";
import {
  deleteSharedMap,
  fetchSharedMaps,
  saveSharedMap,
  type SharedMapRecord
} from "@/lib/shared-maps";
import { getClientId, getDisplayName } from "@/lib/identity";

/**
 * Standalone map designer: build a map around the scenario's fixed starting
 * tiles — choose any tile, flip it face up or down, rotate it, set how many
 * players it opens for — and save the design to the SHARED server library. Saved
 * maps are visible to every player: anyone can open, edit, play, or delete them
 * (from here or the map-setup lobby).
 */
export default function MapDesignerPage() {
  const [saved, setSaved] = useState<SharedMapRecord[]>([]);
  const [scenarioId, setScenarioId] = useState("skirmish");
  const [tiles, setTiles] = useState<CustomMapTilePlan[]>([]);
  const [name, setName] = useState("My map");
  const [players, setPlayers] = useState(2);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The library lives on the server now (shared by everyone), so re-fetch on
  // mount and whenever the tab regains focus — a map saved in another tab or by
  // another player then shows up here. setState rides in the .then() callback
  // (not synchronously in the effect) so it's a normal external subscription.
  const refresh = useCallback(() => {
    void fetchSharedMaps().then((maps) => {
      setSaved(maps);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const scenario = scenarioDefinitions[scenarioId];
  const problems = useMemo(
    () => (scenario ? validateCustomMapPlan(tiles, scenario).problems : []),
    [tiles, scenario]
  );

  // Seat counts this scenario can open (skirmish 2–4, the symmetric duels 2).
  const playerCounts = useMemo(() => {
    if (!scenario) {
      return [MIN_MAP_PLAYERS];
    }
    const min = Math.max(MIN_MAP_PLAYERS, scenario.minPlayers);
    const max = Math.min(scenario.maxPlayers, scenario.layout.starts.length, MAX_MAP_PLAYERS);
    const counts: number[] = [];
    for (let count = min; count <= max; count += 1) {
      counts.push(count);
    }
    return counts;
  }, [scenario]);

  // A new scenario may allow fewer seats — keep `players` inside its range.
  const changeScenario = (next: string) => {
    setScenarioId(next);
    setPlayers((current) => clampMapPlayers(next, current));
  };

  const startNew = () => {
    setCurrentId(null);
    setTiles([]);
    setName("My map");
    setPlayers(clampMapPlayers(scenarioId, players));
    setSaveError(null);
  };

  const loadRecord = (record: SharedMapRecord) => {
    setCurrentId(record.id);
    setScenarioId(scenarioDefinitions[record.scenarioId] ? record.scenarioId : "skirmish");
    setTiles(record.tiles);
    setName(record.name);
    setPlayers(clampMapPlayers(record.scenarioId, record.players));
    setSaveError(null);
  };

  const save = async (asNew: boolean) => {
    const id = asNew || !currentId ? newSharedMapId() : currentId;
    const trimmed = name.trim() || "Unnamed map";
    setName(trimmed);
    setSaveError(null);
    const outcome = await saveSharedMap({
      id,
      name: trimmed,
      scenarioId,
      players: clampMapPlayers(scenarioId, players),
      tiles,
      createdByClientId: getClientId(),
      createdByName: getDisplayName() || null
    });
    if (!outcome.ok) {
      setSaveError(outcome.error);
      return;
    }
    setCurrentId(outcome.map.id);
    setSaved(outcome.maps);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const remove = async (id: string) => {
    const next = await deleteSharedMap(id);
    if (next) {
      setSaved(next);
    } else {
      void refresh();
    }
    if (currentId === id) {
      startNew();
    }
  };

  return (
    <main className="tableRoot designerRoot">
      <header className="designerHeader">
        <Link className="commandButton ghost" href="/">
          <ArrowLeft aria-hidden="true" size={13} /> Back to the table
        </Link>
        <h1>Map designer</h1>
        <p>
          Build a map around the starting tiles, dropping tiles wherever you like — they can interlock, leave gaps,
          touch at a corner or sit apart on their own. Pick how many players it opens for (2–4), flip a tile face up
          (choose the exact tile and rotation) or face down (random from its pool), then save the design. Saved maps are
          shared with everyone — anyone can open, edit, play, or delete them, here or in the map-setup lobby under “Map
          design”.
        </p>
      </header>

      <div className="designerLayout">
        <section className="designerMain" aria-label="Design">
          <div className="designerToolbar">
            <label>
              <small>Map name</small>
              <input
                aria-label="Map name"
                maxLength={48}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              <small>Scenario (starting tiles)</small>
              <select
                aria-label="Scenario"
                onChange={(event) => changeScenario(event.target.value)}
                value={scenarioId}
              >
                {Object.values(scenarioDefinitions).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <small>Players</small>
              <select
                aria-label="Players"
                onChange={(event) => setPlayers(Number(event.target.value))}
                value={players}
              >
                {playerCounts.map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
            </label>
            <button className="commandButton primary" onClick={() => void save(false)} type="button">
              <Save aria-hidden="true" size={13} /> {savedFlash ? "Saved!" : currentId ? "Save" : "Save map"}
            </button>
            {currentId ? (
              <button className="commandButton" onClick={() => void save(true)} title="Keep the loaded map and save this design as a copy" type="button">
                Save as copy
              </button>
            ) : null}
            <button className="commandButton ghost" onClick={startNew} type="button">
              <FilePlus2 aria-hidden="true" size={13} /> New map
            </button>
          </div>

          {saveError ? (
            <div className="designerProblems" aria-label="Save error" role="alert">
              <strong>Couldn’t save: {saveError}</strong>
            </div>
          ) : null}

          {problems.length > 0 ? (
            <div className="designerProblems" aria-label="Design problems">
              <strong>
                {problems.length} tile{problems.length === 1 ? "" : "s"} won&apos;t make it into the game:
              </strong>
              {problems.slice(0, 4).map((problem) => (
                <small key={problem}>{problem}</small>
              ))}
            </div>
          ) : null}

          <MapDesigner customMap={tiles} onChange={setTiles} scenarioId={scenarioId} />
          <small className="optionHint">
            {tiles.length} tile{tiles.length === 1 ? "" : "s"} placed · opens {players} seat{players === 1 ? "" : "s"} ·
            face-down tiles draw randomly from their Far/Near/Center pool when the adventure starts.
          </small>
        </section>

        <aside className="designerSaved" aria-label="Saved maps">
          <h2>Shared maps</h2>
          {loading ? <small>Loading the shared library…</small> : null}
          {!loading && saved.length === 0 ? (
            <small>Nothing saved yet — design a map and press Save. Everyone shares this library.</small>
          ) : null}
          <ul>
            {saved.map((record) => (
              <li className={record.id === currentId ? "current" : ""} key={record.id}>
                <button className="savedMapLoad" onClick={() => loadRecord(record)} title="Open this map in the designer" type="button">
                  <strong>{record.name}</strong>
                  <small>
                    {scenarioDefinitions[record.scenarioId]?.name ?? record.scenarioId} · {record.players}P ·{" "}
                    {record.tiles.length} tile{record.tiles.length === 1 ? "" : "s"}
                    {record.createdByName ? ` · by ${record.createdByName}` : ""}
                  </small>
                </button>
                <button
                  aria-label={`Delete ${record.name}`}
                  className="savedMapDelete"
                  onClick={() => void remove(record.id)}
                  title="Delete this saved map for everyone"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
