"use client";

/**
 * The map designer's saved-map library, moved out of a permanent right-hand
 * column into a click-to-open popup so the board can dominate the page. Reuses
 * the SetupHubWindow shell (portal, backdrop, Escape/✕ close) and the lobby
 * Map window's list/preview styling. Carries the exact function set of the old
 * `.designerSaved` aside: browse, load, ownership-gated delete (a lock chip for
 * a map you can't modify), the "current" highlight, and loading/empty states —
 * plus a read-only shape preview of the highlighted map and a "New map" reset.
 */
import { useMemo, useState } from "react";
import { FilePlus2, Hammer, Lock, Trash2 } from "lucide-react";
import { scenarioDefinitions } from "@/engine";
import { actorMayModifyMap, type MapActor } from "@/server/map-registry";
import type { SharedMapRecord } from "@/lib/shared-maps";
import { designedTilesToPreview, MapShapePreview } from "./map-shape-preview";
import { SetupHubWindow } from "./setup-hub-window";

export function DesignerMapLibraryModal({
  records,
  loading,
  currentId,
  actor,
  onLoad,
  onDelete,
  onNew,
  onClose
}: {
  records: SharedMapRecord[];
  loading: boolean;
  currentId: string | null;
  actor: MapActor;
  onLoad: (record: SharedMapRecord) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(currentId);

  const selected = useMemo(
    () => records.find((record) => record.id === (selectedId ?? currentId)) ?? null,
    [records, selectedId, currentId]
  );

  return (
    <SetupHubWindow className="setupHubWindow--map designerLibraryModal" eyebrow="Map designer" label="Map library" onClose={onClose}>
      <div className="designerLibraryTop">
        <button
          className="commandButton primary"
          onClick={() => {
            onNew();
            onClose();
          }}
          type="button"
        >
          <FilePlus2 aria-hidden="true" size={13} /> New blank map
        </button>
        <small className="optionHint">
          Everyone shares this library — open, edit, play or delete any map here or in the map-setup lobby.
        </small>
      </div>

      <div className="mapPickLayout">
        <div className="mapPickList designerLibraryList" role="listbox" aria-label="Saved maps">
          {loading ? (
            <small className="optionHint">Loading the shared library…</small>
          ) : records.length === 0 ? (
            <small className="optionHint">Nothing saved yet — design a map and press Save.</small>
          ) : (
            records.map((record) => {
              const highlighted = (selectedId ?? currentId) === record.id;
              return (
                <button
                  aria-selected={highlighted}
                  className={`mapPickRow ${highlighted ? "highlighted" : ""} ${record.id === currentId ? "applied" : ""}`}
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  onDoubleClick={() => onLoad(record)}
                  role="option"
                  type="button"
                >
                  <span className="mapPickRowName">🗺 {record.name}</span>
                  <small className="mapPickRowMeta">
                    {scenarioDefinitions[record.scenarioId]?.name ?? record.scenarioId} · {record.players}P ·{" "}
                    {record.tiles.length} tile{record.tiles.length === 1 ? "" : "s"}
                    {record.preset ? " · conditions" : ""}
                    {record.createdByName ? ` · by ${record.createdByName}` : ""}
                    {record.id === currentId ? " · open now" : ""}
                  </small>
                </button>
              );
            })
          )}
        </div>

        <div className="mapPickDetail">
          {selected ? (
            <>
              <div className="mapPickDetailScroll">
                <MapShapePreview tiles={designedTilesToPreview(selected.tiles)} />
                <div className="mapPickInfo">
                  <strong>{selected.name}</strong>
                  <small>
                    Built on {scenarioDefinitions[selected.scenarioId]?.name ?? selected.scenarioId} ·{" "}
                    {selected.players} player{selected.players === 1 ? "" : "s"} · {selected.tiles.length} tile
                    {selected.tiles.length === 1 ? "" : "s"}
                    {selected.preset ? " · has conditions" : ""}
                  </small>
                  {selected.createdByName ? <small>by {selected.createdByName}</small> : null}
                </div>
              </div>
              <div className="mapPickApplyBar">
                <button
                  className="mapPickUseButton"
                  onClick={() => onLoad(selected)}
                  type="button"
                >
                  <Hammer aria-hidden="true" size={13} /> Open in the designer
                </button>
                {actorMayModifyMap(selected, actor) ? (
                  <button
                    aria-label={`Delete ${selected.name}`}
                    className="savedMapDelete"
                    onClick={() => onDelete(selected.id)}
                    title="Delete this saved map for everyone"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                ) : (
                  <span
                    className="savedMapLock"
                    title={`Only ${selected.createdByName ?? "the owner"} or an admin can edit or delete this map`}
                  >
                    <Lock aria-hidden="true" size={14} />
                  </span>
                )}
              </div>
            </>
          ) : (
            <small className="optionHint">Pick a saved map on the left to preview its shape and open it.</small>
          )}
        </div>
      </div>
    </SetupHubWindow>
  );
}
