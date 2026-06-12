"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { allTileDefinitions } from "@/data/map/tiles";
import { TILE_BACK_IMAGES } from "@/data/assets/homm-assets";
import {
  hexDistance,
  hexToPixel,
  scenarioDefinitions,
  tileFootprintsTouch,
  type CustomMapTilePlan,
  type HexCoord
} from "@/engine";
import { titleCase } from "@/components/table/utils";

export const TILE_GROUP_LABELS: Record<"far" | "near" | "center", string> = {
  far: "Far Ⅱ–Ⅲ",
  near: "Near Ⅳ–Ⅴ",
  center: "Center Ⅵ–Ⅶ"
};

/**
 * Centers whose 7-field flower would touch the flower at `center`: every
 * position at hex distance 3 with adjacent footprints (the same contact rule
 * the engine uses for Far-tile placement).
 */
function neighborTileCenters(center: HexCoord): HexCoord[] {
  const result: HexCoord[] = [];
  for (let dRow = -3; dRow <= 3; dRow += 1) {
    for (let dCol = -5; dCol <= 5; dCol += 1) {
      const candidate = { row: center.row + dRow, col: center.col + dCol };
      if (hexDistance(center, candidate) === 3 && tileFootprintsTouch(center, candidate)) {
        result.push(candidate);
      }
    }
  }
  return result;
}

/**
 * Map designer board: build the map tile by tile around the fixed starting
 * tiles. Each added tile is face-down random from its group's pool ("down
 * means random") or a hand-picked face-up tile at a chosen rotation.
 * Face-down slots show the printed tile back, face-up slots the tile scan.
 */
export function MapDesigner({
  scenarioId,
  customMap,
  onChange,
  hexSize = 9
}: {
  scenarioId: string;
  customMap: CustomMapTilePlan[];
  onChange: (next: CustomMapTilePlan[]) => void;
  /** Designer slot spacing — the setup lobby uses 9, the designer page more. */
  hexSize?: number;
}) {
  const scenario = scenarioDefinitions[scenarioId];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const starts = useMemo<HexCoord[]>(
    () => (scenario ? scenario.layout.starts.map((start) => ({ ...start })) : []),
    [scenario]
  );

  const placed = useMemo<HexCoord[]>(
    () => [...starts, ...customMap.map((plan) => ({ row: plan.row, col: plan.col }))],
    [starts, customMap]
  );

  // Empty lattice slots touching the current board.
  const candidates = useMemo<HexCoord[]>(() => {
    const seen = new Map<string, HexCoord>();
    for (const center of placed) {
      for (const neighbor of neighborTileCenters(center)) {
        const key = `${neighbor.row}:${neighbor.col}`;
        if (seen.has(key)) {
          continue;
        }
        if (placed.some((existing) => hexDistance(existing, neighbor) < 3)) {
          continue;
        }
        if (placed.some((existing) => tileFootprintsTouch(existing, neighbor))) {
          seen.set(key, neighbor);
        }
      }
    }
    return [...seen.values()];
  }, [placed]);

  if (!scenario) {
    return null;
  }

  // Pixel layout: project every visible center, then normalize into the box.
  const everything = [...placed, ...candidates];
  const pixels = everything.map((coord) => hexToPixel(coord, hexSize));
  const minX = Math.min(...pixels.map((pixel) => pixel.x)) - hexSize * 2.4;
  const minY = Math.min(...pixels.map((pixel) => pixel.y)) - hexSize * 2.4;
  const width = Math.max(...pixels.map((pixel) => pixel.x)) - minX + hexSize * 4.8;
  const height = Math.max(...pixels.map((pixel) => pixel.y)) - minY + hexSize * 4.8;
  const place = (coord: HexCoord) => {
    const pixel = hexToPixel(coord, hexSize);
    return { left: pixel.x - minX, top: pixel.y - minY };
  };

  const selected = selectedIndex !== null ? customMap[selectedIndex] : null;
  const usedFaceUpIds = new Set(
    customMap.filter((plan) => !plan.faceDown && plan.tileDefId).map((plan) => plan.tileDefId as string)
  );
  const pickableTiles = Object.values(allTileDefinitions)
    .filter((tile) => tile.group === (selected?.group ?? "near"))
    .sort((left, right) => left.id.localeCompare(right.id));
  const selectedTileDef = selected?.tileDefId ? allTileDefinitions[selected.tileDefId] : undefined;

  const updateSelected = (changes: Partial<CustomMapTilePlan>) => {
    if (selectedIndex === null) {
      return;
    }
    onChange(customMap.map((plan, index) => (index === selectedIndex ? { ...plan, ...changes } : plan)));
  };

  return (
    <div className="mapDesigner" aria-label="Map designer">
      <div className="designerBoard" style={{ width, height }}>
        {starts.map((start, index) => (
          <span
            className="designerTile start"
            key={`start-${index}`}
            style={place(start)}
            title={`Starting tile of seat ${index + 1} (fixed by faction)`}
          >
            <img alt="" aria-hidden="true" className="designerTileBack" src={TILE_BACK_IMAGES.starting} />
            <b>S{index + 1}</b>
          </span>
        ))}
        {customMap.map((plan, index) => {
          const art = !plan.faceDown && plan.tileDefId ? allTileDefinitions[plan.tileDefId]?.assets?.tileImage : undefined;
          return (
            <button
              className={`designerTile plan ${plan.group} ${selectedIndex === index ? "selected" : ""}`}
              key={`plan-${index}`}
              onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
              style={place({ row: plan.row, col: plan.col })}
              title={
                plan.faceDown
                  ? `Face-down ${TILE_GROUP_LABELS[plan.group]} tile (random from the pool)`
                  : `Face-up ${plan.tileDefId ?? "?"} (rotation ${(plan.rotation ?? 0) * 60}°)`
              }
              type="button"
            >
              {plan.faceDown ? (
                <img alt="" aria-hidden="true" className="designerTileBack" src={TILE_BACK_IMAGES[plan.group]} />
              ) : art ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="designerTileBack"
                  src={art}
                  style={{ transform: `rotate(${(plan.rotation ?? 0) * 60}deg)` }}
                />
              ) : null}
              <b>{plan.faceDown ? "" : (plan.tileDefId ?? "?")}</b>
            </button>
          );
        })}
        {candidates.map((candidate) => (
          <button
            className="designerTile add"
            key={`add-${candidate.row}:${candidate.col}`}
            onClick={() => {
              onChange([...customMap, { row: candidate.row, col: candidate.col, group: "near", faceDown: true }]);
              setSelectedIndex(customMap.length);
            }}
            style={place(candidate)}
            title="Add a tile here (face-down Near by default — click it after to change)"
            type="button"
          >
            <Plus aria-hidden="true" size={12} />
          </button>
        ))}
      </div>

      {selected ? (
        <div className="designerEditor" aria-label="Selected tile settings">
          <div className="optionButtons">
            {(["far", "near", "center"] as const).map((group) => (
              <button
                aria-pressed={selected.group === group}
                className={selected.group === group ? "selected" : ""}
                key={group}
                onClick={() => updateSelected({ group, tileDefId: undefined })}
                type="button"
              >
                {TILE_GROUP_LABELS[group]}
              </button>
            ))}
          </div>
          <div className="optionButtons">
            <button
              aria-pressed={selected.faceDown}
              className={selected.faceDown ? "selected" : ""}
              onClick={() => updateSelected({ faceDown: true, tileDefId: undefined })}
              title="Face-down: a random tile of the group is drawn when the adventure starts"
              type="button"
            >
              Face down (random)
            </button>
            <button
              aria-pressed={!selected.faceDown}
              className={!selected.faceDown ? "selected" : ""}
              onClick={() =>
                updateSelected({
                  faceDown: false,
                  tileDefId:
                    selected.tileDefId ?? pickableTiles.find((tile) => !usedFaceUpIds.has(tile.id))?.id
                })
              }
              title="Face-up: choose the exact tile, visible from the start"
              type="button"
            >
              Face up (choose tile)
            </button>
          </div>
          {!selected.faceDown ? (
            <>
              <div className="designerTilePick">
                <select
                  aria-label="Tile"
                  onChange={(event) => updateSelected({ tileDefId: event.target.value })}
                  value={selected.tileDefId ?? ""}
                >
                  {pickableTiles.map((tile) => (
                    <option
                      disabled={usedFaceUpIds.has(tile.id) && tile.id !== selected.tileDefId}
                      key={tile.id}
                      value={tile.id}
                    >
                      {tile.id} — {titleCase(tile.terrain)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 5) % 6 })}
                  title="Rotate the tile 60° counterclockwise"
                  type="button"
                >
                  <RotateCcw size={12} />
                </button>
                <button
                  onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 1) % 6 })}
                  title="Rotate the tile 60° clockwise"
                  type="button"
                >
                  <RotateCw size={12} /> {(selected.rotation ?? 0) * 60}°
                </button>
              </div>
              {selectedTileDef?.assets?.tileImage ? (
                <img
                  alt={`Tile ${selectedTileDef.id}`}
                  className="designerTilePreview"
                  src={selectedTileDef.assets.tileImage}
                  style={{ transform: `rotate(${(selected.rotation ?? 0) * 60}deg)` }}
                />
              ) : null}
            </>
          ) : null}
          <button
            className="designerRemove"
            onClick={() => {
              onChange(customMap.filter((_, index) => index !== selectedIndex));
              setSelectedIndex(null);
            }}
            type="button"
          >
            <X size={12} /> Remove this tile
          </button>
        </div>
      ) : (
        <small className="optionHint">
          Click a ＋ slot to add a tile next to the board; click a placed tile to flip it up or down, pick the exact
          tile, rotate it or remove it. Face-down tiles draw randomly from their pool when the adventure starts.
        </small>
      )}
    </div>
  );
}
