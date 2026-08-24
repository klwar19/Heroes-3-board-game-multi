"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FilePlus2, FolderOpen, Lock, Save, Undo2 } from "lucide-react";
import { MapDesigner } from "@/components/adventure/map-designer";
import { MapPresetEditor } from "@/components/adventure/map-preset-editor";
import { DesignerMapLibraryModal } from "@/components/adventure/designer-map-library-modal";
import {
  customMapPresetIsActive,
  scenarioDefinitions,
  secretFeatureDemandWarnings,
  singlePlayerMapDeployment,
  validateCustomMapPlan,
  type CustomMapObject,
  type CustomMapPreset,
  type CustomMapTilePlan
} from "@/engine";
import {
  actorMayModifyMap,
  clampMapPlayers,
  MAX_MAP_PLAYERS,
  MIN_MAP_PLAYERS,
  newSharedMapId,
  type MapActor
} from "@/server/map-registry";
import {
  deleteSharedMap,
  fetchSharedMaps,
  saveSharedMap,
  type SharedMapRecord
} from "@/lib/shared-maps";
import { getAccountIdentity, getClientId, getDisplayName, type AccountIdentity } from "@/lib/identity";
import { assetUrl } from "@/lib/asset-url";
import { DESIGNER_UI_ICONS } from "@/data/assets/homm-assets";

type MapEditorSnapshot = {
  scenarioId: string;
  tiles: CustomMapTilePlan[];
  preset: CustomMapPreset | undefined;
  players: number;
};

const MAP_EDITOR_UNDO_LIMIT = 100;

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
  const [preset, setPreset] = useState<CustomMapPreset | undefined>(undefined);
  // SPECIFIC-mode "pick a tile on the map" armed from the objects panel; the
  // MapDesigner highlights eligible tiles and resolves it. (Hidden hex events
  // are placed straight from the board's own Objects palette — no pick flow.)
  const [pickRequest, setPickRequest] = useState<{
    kind: "object-plan";
    objectKind: "obelisk" | "mine" | "settlement" | "center";
  } | null>(null);
  const [name, setName] = useState("My map");
  const [players, setPlayers] = useState(2);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // The signed-in account (if any) — the owner/admin gate for editing & deleting.
  // Read from the client cache on mount and refreshed on focus so signing in
  // (in this or another tab) lights up the controls without a reload. A guest /
  // signed-out visitor gets a null actor: they can still browse, play, and copy,
  // and can edit/delete only UNOWNED (legacy / guest-made) maps — exactly as before.
  const [account, setAccount] = useState<AccountIdentity | null>(null);
  const [undoHistory, setUndoHistory] = useState<MapEditorSnapshot[]>([]);
  // Keep the authoritative draft available synchronously: several designer
  // callbacks can fire inside one React batch, and each undo snapshot must see
  // the immediately preceding edit rather than a stale render.
  const editorSnapshotRef = useRef<MapEditorSnapshot>({ scenarioId, tiles, preset, players });

  const commitEditorChange = (change: Partial<MapEditorSnapshot>) => {
    const current = editorSnapshotRef.current;
    const next = { ...current, ...change };
    if (
      next.scenarioId === current.scenarioId &&
      next.tiles === current.tiles &&
      next.preset === current.preset &&
      next.players === current.players
    ) {
      return;
    }
    setUndoHistory((history) => [...history, current].slice(-MAP_EDITOR_UNDO_LIMIT));
    editorSnapshotRef.current = next;
    if ("scenarioId" in change) setScenarioId(next.scenarioId);
    if ("tiles" in change) setTiles(next.tiles);
    if ("preset" in change) setPreset(next.preset);
    if ("players" in change) setPlayers(next.players);
  };

  const replaceEditorDraft = (next: MapEditorSnapshot) => {
    editorSnapshotRef.current = next;
    setScenarioId(next.scenarioId);
    setTiles(next.tiles);
    setPreset(next.preset);
    setPlayers(next.players);
    setUndoHistory([]);
  };

  const undoEditorChange = () => {
    const previous = undoHistory.at(-1);
    if (!previous) return;
    editorSnapshotRef.current = previous;
    setScenarioId(previous.scenarioId);
    setTiles(previous.tiles);
    setPreset(previous.preset);
    setPlayers(previous.players);
    setPickRequest(null);
    setUndoHistory((history) => history.slice(0, -1));
  };

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

  useEffect(() => {
    const syncAccount = () => setAccount(getAccountIdentity());
    syncAccount();
    window.addEventListener("focus", syncAccount);
    return () => window.removeEventListener("focus", syncAccount);
  }, []);

  const actor = useMemo<MapActor>(
    () => ({ userId: account?.userId ?? null, role: account?.role ?? null }),
    [account]
  );
  // The loaded map, and whether this actor may overwrite it (an owned map only by
  // its owner/admin). A brand-new unsaved design (no currentId) is always saveable.
  const currentRecord = useMemo(
    () => (currentId ? saved.find((record) => record.id === currentId) : undefined),
    [saved, currentId]
  );
  const canModifyCurrent = !currentId || actorMayModifyMap(currentRecord, actor);

  const scenario = scenarioDefinitions[scenarioId];
  const problems = useMemo(
    () => (scenario ? validateCustomMapPlan(tiles, scenario, players).problems : []),
    [tiles, scenario, players]
  );
  const secretWarnings = useMemo(() => secretFeatureDemandWarnings(tiles), [tiles]);
  const soloOpponentLimit = scenario
    ? Math.max(0, Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1)
    : 0;
  const soloDeployment = useMemo(
    () => singlePlayerMapDeployment(tiles, soloOpponentLimit),
    [tiles, soloOpponentLimit]
  );
  const soloMarkedStarts = useMemo(
    () => tiles.filter((tile) => tile.group === "starting" && tile.singlePlayer).length,
    [tiles]
  );

  // Seat counts this scenario can open (skirmish 2–6, the symmetric duels 2).
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
    commitEditorChange({
      scenarioId: next,
      players: clampMapPlayers(next, editorSnapshotRef.current.players)
    });
  };

  const startNew = () => {
    setCurrentId(null);
    replaceEditorDraft({
      scenarioId,
      tiles: [],
      preset: undefined,
      players: clampMapPlayers(scenarioId, players)
    });
    setName("My map");
    setSaveError(null);
  };

  const loadRecord = (record: SharedMapRecord) => {
    setCurrentId(record.id);
    const nextScenarioId = scenarioDefinitions[record.scenarioId] ? record.scenarioId : "skirmish";
    replaceEditorDraft({
      scenarioId: nextScenarioId,
      tiles: record.tiles,
      preset: record.preset,
      players: clampMapPlayers(nextScenarioId, record.players)
    });
    setName(record.name);
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
      ...(preset ? { preset } : {}),
      createdByClientId: getClientId(),
      createdByName: getDisplayName() || null,
      // The server stamps ownership from the AUTHENTICATED actor (cookie on
      // /api/maps; this body on the edge) — sent so the edge can enforce the gate.
      actorUserId: actor.userId,
      actorRole: actor.role
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
    const next = await deleteSharedMap(id, actor);
    if (next) {
      setSaved(next);
      if (currentId === id) {
        startNew();
      }
    } else {
      // A failure (network, or a 403 on an owned map) leaves the map in place;
      // re-sync from the server so the UI reflects reality.
      void refresh();
    }
  };

  return (
    <main className="tableRoot designerRoot">
      <header className="designerHeader">
        <Link className="commandButton ghost" href="/menu">
          <ArrowLeft aria-hidden="true" size={13} /> Back to the menu
        </Link>
        <h1 className="designerTitle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden="true"
            className="designerTitleGlyph"
            draggable={false}
            src={assetUrl(DESIGNER_UI_ICONS.map)}
          />
          Map designer
        </h1>
        <p>
          Build a map around the starting tiles, dropping tiles wherever you like — they can interlock, leave gaps,
          touch at a corner or sit apart on their own. Pick how many multiplayer seats it opens for (2–6), flip a tile face up
          (choose the exact tile and rotation) or face down (random from its pool), then save the design. Saved maps are
          shared with everyone — anyone can open, edit, play, or delete them, here or in the map-setup lobby under “Map
          design”. For single-player, click Town tiles to mark exactly one as You and the others as Enemy AI; those
          solo-only roles, locations and bonuses are ignored when this same map is used in multiplayer.
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
              <small>Multiplayer seats</small>
              <select
                aria-label="Multiplayer seats"
                onChange={(event) => commitEditorChange({ players: Number(event.target.value) })}
                value={players}
              >
                {playerCounts.map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Undo last map edit"
              className="commandButton ghost"
              disabled={undoHistory.length === 0}
              onClick={undoEditorChange}
              title={undoHistory.length > 0 ? "Undo the last map or rules edit" : "Nothing to undo"}
              type="button"
            >
              <Undo2 aria-hidden="true" size={14} /> Undo
            </button>
            {currentId && !canModifyCurrent ? (
              // The loaded map belongs to someone else — you can't overwrite it,
              // only fork it. The primary action becomes "Save as copy".
              <button
                className="commandButton primary"
                onClick={() => void save(true)}
                title="This map belongs to another player — save your changes as your own copy"
                type="button"
              >
                <Save aria-hidden="true" size={13} /> {savedFlash ? "Saved!" : "Save as copy"}
              </button>
            ) : (
              <>
                <button className="commandButton primary" onClick={() => void save(false)} type="button">
                  <Save aria-hidden="true" size={13} /> {savedFlash ? "Saved!" : currentId ? "Save" : "Save map"}
                </button>
                {currentId ? (
                  <button className="commandButton" onClick={() => void save(true)} title="Keep the loaded map and save this design as a copy" type="button">
                    Save as copy
                  </button>
                ) : null}
              </>
            )}
            <button className="commandButton ghost" onClick={startNew} type="button">
              <FilePlus2 aria-hidden="true" size={13} /> New map
            </button>
            <button
              className="commandButton"
              onClick={() => {
                refresh();
                setLibraryOpen(true);
              }}
              title="Browse, open or delete saved maps"
              type="button"
            >
              <FolderOpen aria-hidden="true" size={13} /> Maps{saved.length > 0 ? ` (${saved.length})` : ""}
            </button>
          </div>

          {currentId && !canModifyCurrent ? (
            <div className="designerOwnerNote" role="status">
              <Lock aria-hidden="true" size={12} />
              <small>
                This map belongs to <strong>{currentRecord?.createdByName ?? "another player"}</strong>. You can play
                and copy it, but only its owner or an admin can edit or delete the original — your changes save as
                your own copy.
              </small>
            </div>
          ) : null}

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

          {secretWarnings.length > 0 ? (
            <div className="designerProblems designerWarnings" aria-label="Secret feature warnings" role="status">
              <strong>Secret landmarks may fall back to random in game:</strong>
              {secretWarnings.map((warning) => (
                <small key={warning}>{warning}</small>
              ))}
            </div>
          ) : null}

          {soloMarkedStarts > 0 && !soloDeployment ? (
            <div className="designerProblems designerWarnings" aria-label="Single-player deployment warning" role="status">
              <strong>Single-player deployment is incomplete:</strong>
              <small>Mark exactly one Town as You and 1–{soloOpponentLimit} Town{soloOpponentLimit === 1 ? "" : "s"} as Enemy AI. Until then, solo games fall back to the map&apos;s ordinary seat order.</small>
            </div>
          ) : null}

          <MapDesigner
            customMap={tiles}
            hexEvents={preset?.hexEvents ?? []}
            objectives={preset?.objectives}
            objects={preset?.objects ?? []}
            supportedModes={preset?.supportedModes}
            onChange={(nextTiles) => commitEditorChange({ tiles: nextTiles })}
            onHexEventsChange={(hexEvents) => {
              const next: CustomMapPreset = { ...(editorSnapshotRef.current.preset ?? {}) };
              if (hexEvents.length > 0) {
                next.hexEvents = hexEvents;
              } else {
                delete next.hexEvents;
              }
              commitEditorChange({ preset: customMapPresetIsActive(next) ? next : undefined });
            }}
            onObjectsChange={(objects: CustomMapObject[]) => {
              const next: CustomMapPreset = { ...(editorSnapshotRef.current.preset ?? {}) };
              if (objects.length > 0) {
                next.objects = objects;
              } else {
                delete next.objects;
              }
              commitEditorChange({ preset: customMapPresetIsActive(next) ? next : undefined });
            }}
            onPickResolved={() => setPickRequest(null)}
            pickRequest={pickRequest}
            scenarioId={scenarioId}
            seatCount={players}
            victoryMode={preset?.victoryMode}
          />
          <small className="optionHint">
            {tiles.length} tile{tiles.length === 1 ? "" : "s"} placed · opens {players} multiplayer seat{players === 1 ? "" : "s"}
            {soloDeployment ? ` · solo: you vs ${soloDeployment.computers.length} AI` : ""} ·
            face-down Secret landmarks draw a random matching tile from their pool when the adventure starts (if none
            match, pure random — players are notified).
          </small>

          <MapPresetEditor
            onChange={(nextPreset) => commitEditorChange({ preset: nextPreset })}
            onPickOnMap={(request) => {
              // Arm the on-map pick and bring the board into view ("jump to
              // the map"); a second press on the same button disarms.
              setPickRequest((current) =>
                current && current.objectKind === request.objectKind ? null : request
              );
              document.querySelector(".designerBoardWrap")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            }}
            pickArmed={pickRequest}
            preset={preset}
            tiles={tiles}
          />
        </section>
      </div>

      {libraryOpen ? (
        <DesignerMapLibraryModal
          actor={actor}
          currentId={currentId}
          loading={loading}
          onClose={() => setLibraryOpen(false)}
          onDelete={(id) => void remove(id)}
          onLoad={(record) => {
            loadRecord(record);
            setLibraryOpen(false);
          }}
          onNew={startNew}
          records={saved}
        />
      ) : null}
    </main>
  );
}
