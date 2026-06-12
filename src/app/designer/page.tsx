"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FilePlus2, Save, Trash2 } from "lucide-react";
import { MapDesigner } from "@/components/adventure/map-designer";
import {
  scenarioDefinitions,
  validateCustomMapPlan,
  type CustomMapTilePlan
} from "@/engine";
import {
  deleteSavedMap,
  listSavedMaps,
  newSavedMapId,
  saveMapRecord,
  type SavedMapRecord
} from "@/lib/saved-maps";

/**
 * Standalone map designer: build a map around the scenario's fixed starting
 * tiles — choose any tile, flip it face up or down, rotate it — and save the
 * design in this browser. Saved maps are picked during map setup instead of
 * being designed there.
 */
export default function MapDesignerPage() {
  const [saved, setSaved] = useState<SavedMapRecord[]>([]);
  const [scenarioId, setScenarioId] = useState("skirmish");
  const [tiles, setTiles] = useState<CustomMapTilePlan[]>([]);
  const [name, setName] = useState("My map");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // localStorage exists only in the browser; refresh on focus so designs
  // saved in another tab show up here.
  useEffect(() => {
    const refresh = () => setSaved(listSavedMaps());
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const scenario = scenarioDefinitions[scenarioId];
  const problems = useMemo(
    () => (scenario ? validateCustomMapPlan(tiles, scenario).problems : []),
    [tiles, scenario]
  );

  const startNew = () => {
    setCurrentId(null);
    setTiles([]);
    setName("My map");
  };

  const loadRecord = (record: SavedMapRecord) => {
    setCurrentId(record.id);
    setScenarioId(scenarioDefinitions[record.scenarioId] ? record.scenarioId : "skirmish");
    setTiles(record.tiles);
    setName(record.name);
  };

  const save = (asNew: boolean) => {
    const id = asNew || !currentId ? newSavedMapId() : currentId;
    const trimmed = name.trim() || "Unnamed map";
    setName(trimmed);
    setCurrentId(id);
    setSaved(saveMapRecord({ id, name: trimmed, scenarioId, tiles }));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const remove = (id: string) => {
    setSaved(deleteSavedMap(id));
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
          Build a map around the fixed starting tiles: add a slot, flip it face up (choose the exact tile and
          rotation) or face down (random from its pool), then save the design. Saved maps live in this browser and
          are picked in the map-setup lobby under “Map design”.
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
                onChange={(event) => setScenarioId(event.target.value)}
                value={scenarioId}
              >
                {Object.values(scenarioDefinitions).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="commandButton primary" onClick={() => save(false)} type="button">
              <Save aria-hidden="true" size={13} /> {savedFlash ? "Saved!" : currentId ? "Save" : "Save map"}
            </button>
            {currentId ? (
              <button className="commandButton" onClick={() => save(true)} title="Keep the loaded map and save this design as a copy" type="button">
                Save as copy
              </button>
            ) : null}
            <button className="commandButton ghost" onClick={startNew} type="button">
              <FilePlus2 aria-hidden="true" size={13} /> New map
            </button>
          </div>

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
            {tiles.length} tile{tiles.length === 1 ? "" : "s"} placed · face-down tiles draw randomly from their
            Far/Near/Center pool when the adventure starts.
          </small>
        </section>

        <aside className="designerSaved" aria-label="Saved maps">
          <h2>Saved maps</h2>
          {saved.length === 0 ? <small>Nothing saved yet — design a map and press Save.</small> : null}
          <ul>
            {saved.map((record) => (
              <li className={record.id === currentId ? "current" : ""} key={record.id}>
                <button className="savedMapLoad" onClick={() => loadRecord(record)} title="Open this map in the designer" type="button">
                  <strong>{record.name}</strong>
                  <small>
                    {scenarioDefinitions[record.scenarioId]?.name ?? record.scenarioId} · {record.tiles.length} tile
                    {record.tiles.length === 1 ? "" : "s"}
                  </small>
                </button>
                <button
                  aria-label={`Delete ${record.name}`}
                  className="savedMapDelete"
                  onClick={() => remove(record.id)}
                  title="Delete this saved map"
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
