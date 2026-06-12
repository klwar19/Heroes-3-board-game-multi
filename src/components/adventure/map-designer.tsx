"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { allTileDefinitions } from "@/data/map/tiles";
import { TILE_BACK_IMAGES } from "@/data/assets/homm-assets";
import {
  hexDistance,
  hexNeighbors,
  hexToPixel,
  scenarioDefinitions,
  tileFootprint,
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

const GROUP_COLORS: Record<"far" | "near" | "center", string> = {
  far: "#4f8a4f",
  near: "#b08d2f",
  center: "#a14d4d"
};

/** Designer hex circumradius — the same pointy-top geometry the map uses. */
const DESIGN_HEX = 24;

/** Pointy-top hexagon corner points around a center. */
function hexCorners(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index - 30);
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return points.join(" ");
}

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

/** The outline of a 7-hex flower as one SVG path (outer edges only). */
function flowerOutline(center: HexCoord, size: number): string {
  const cells = tileFootprint(center, 0);
  const cellKeys = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
  const segments: string[] = [];
  for (const cell of cells) {
    const { x, y } = hexToPixel(cell, size);
    const corners: { x: number; y: number }[] = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI / 180) * (60 * index - 30);
      corners.push({ x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) });
    }
    const neighbors = hexNeighbors(cell);
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = neighbors[direction];
      if (cellKeys.has(`${neighbor.row}:${neighbor.col}`)) {
        continue;
      }
      // Edge between corner (direction+5)%6 and (direction)%6 faces `direction`.
      const a = corners[(direction + 5) % 6];
      const b = corners[direction % 6];
      segments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }
  return segments.join(" ");
}

/**
 * Map designer board: a real hex-grid view of the scenario. Pan by dragging,
 * zoom with the wheel or buttons; click a ＋ flower to add a tile, click a
 * tile to select it, then flip it face up/down, choose the exact tile,
 * rotate it in 60° steps or remove it.
 */
export function MapDesigner({
  scenarioId,
  customMap,
  onChange,
  hexSize = DESIGN_HEX
}: {
  scenarioId: string;
  customMap: CustomMapTilePlan[];
  onChange: (next: CustomMapTilePlan[]) => void;
  /** Hex circumradius of the design board (the lobby embeds it smaller). */
  hexSize?: number;
}) {
  const scenario = scenarioDefinitions[scenarioId];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

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

  const size = hexSize;
  const hexWidth = Math.sqrt(3) * size;

  // Project every visible flower cell to find the viewBox.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const center of [...placed, ...candidates]) {
    for (const cell of tileFootprint(center, 0)) {
      const { x, y } = hexToPixel(cell, size);
      minX = Math.min(minX, x - hexWidth);
      minY = Math.min(minY, y - size * 1.8);
      maxX = Math.max(maxX, x + hexWidth);
      maxY = Math.max(maxY, y + size * 1.8);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

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

  const rotateSelected = (steps: number) => {
    if (!selected || selected.faceDown) {
      return;
    }
    updateSelected({ rotation: (((selected.rotation ?? 0) + steps) % 6 + 6) % 6 });
  };

  const clickGuard = () => suppressClickRef.current;

  // --- SVG layers ----------------------------------------------------------
  const artLayer: React.ReactNode[] = [];
  const cellLayer: React.ReactNode[] = [];
  const outlineLayer: React.ReactNode[] = [];
  const labelLayer: React.ReactNode[] = [];

  const renderFlowerCells = (center: HexCoord, className: string, key: string, onClick?: () => void, title?: string) => {
    for (const [slot, cell] of tileFootprint(center, 0).entries()) {
      const { x, y } = hexToPixel(cell, size);
      cellLayer.push(
        <polygon
          className={className}
          key={`${key}-${slot}`}
          onClick={
            onClick
              ? () => {
                  if (!clickGuard()) {
                    onClick();
                  }
                }
              : undefined
          }
          points={hexCorners(x, y, size - 0.8)}
        >
          {title ? <title>{title}</title> : null}
        </polygon>
      );
    }
  };

  // Fixed starting tiles.
  for (const [index, start] of starts.entries()) {
    const centerPixel = hexToPixel(start, size);
    const width = 3 * hexWidth;
    const height = 5 * size;
    artLayer.push(
      <image
        height={height}
        href={TILE_BACK_IMAGES.starting}
        key={`start-art-${index}`}
        preserveAspectRatio="none"
        width={width}
        x={centerPixel.x - width / 2}
        y={centerPixel.y - height / 2}
      />
    );
    renderFlowerCells(start, "designerHexFixed", `start-${index}`, undefined, `Starting tile of seat ${index + 1} (fixed by faction)`);
    labelLayer.push(
      <text className="designerStartLabel" key={`start-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 5}>
        S{index + 1}
      </text>
    );
    outlineLayer.push(
      <path className="designerFlowerOutline fixed" d={flowerOutline(start, size)} key={`start-outline-${index}`} />
    );
  }

  // Designed tiles.
  for (const [index, plan] of customMap.entries()) {
    const center = { row: plan.row, col: plan.col };
    const centerPixel = hexToPixel(center, size);
    const isSelected = selectedIndex === index;
    const art = !plan.faceDown && plan.tileDefId ? allTileDefinitions[plan.tileDefId]?.assets?.tileImage : undefined;
    const width = 3 * hexWidth;
    const height = 5 * size;

    if (plan.faceDown) {
      artLayer.push(
        <image
          height={height}
          href={TILE_BACK_IMAGES[plan.group]}
          key={`plan-back-${index}`}
          preserveAspectRatio="none"
          width={width}
          x={centerPixel.x - width / 2}
          y={centerPixel.y - height / 2}
        />
      );
    } else if (art) {
      artLayer.push(
        <image
          height={height}
          href={art}
          key={`plan-art-${index}`}
          preserveAspectRatio="none"
          transform={`rotate(${(plan.rotation ?? 0) * 60} ${centerPixel.x} ${centerPixel.y})`}
          width={width}
          x={centerPixel.x - width / 2}
          y={centerPixel.y - height / 2}
        />
      );
    }

    renderFlowerCells(
      center,
      `designerHexPlan ${plan.faceDown ? "down" : "up"}`,
      `plan-${index}`,
      () => setSelectedIndex(isSelected ? null : index),
      plan.faceDown
        ? `Face-down ${TILE_GROUP_LABELS[plan.group]} tile — drawn randomly from its pool when the adventure starts. Click to edit.`
        : `${plan.tileDefId ?? "?"} rotated ${(plan.rotation ?? 0) * 60}°. Click to edit.`
    );

    outlineLayer.push(
      <path
        className={`designerFlowerOutline ${isSelected ? "selected" : ""}`}
        d={flowerOutline(center, size)}
        key={`plan-outline-${index}`}
        style={{ stroke: isSelected ? "#ffd766" : GROUP_COLORS[plan.group] }}
      />
    );

    if (plan.faceDown || !art) {
      labelLayer.push(
        <text className="designerTileLabel" key={`plan-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 4}>
          {plan.faceDown ? TILE_GROUP_LABELS[plan.group] : (plan.tileDefId ?? "?")}
        </text>
      );
    }
  }

  // Add-slots.
  for (const candidate of candidates) {
    const centerPixel = hexToPixel(candidate, size);
    renderFlowerCells(
      candidate,
      "designerHexAdd",
      `add-${candidate.row}:${candidate.col}`,
      () => {
        onChange([...customMap, { row: candidate.row, col: candidate.col, group: "near", faceDown: true }]);
        setSelectedIndex(customMap.length);
      },
      "Add a tile here (face-down Near by default — click it afterwards to change group, flip it face up, pick the exact tile or rotate it)"
    );
    outlineLayer.push(
      <path className="designerFlowerOutline add" d={flowerOutline(candidate, size)} key={`add-outline-${candidate.row}:${candidate.col}`} />
    );
    labelLayer.push(
      <text className="designerAddPlus" key={`add-plus-${candidate.row}:${candidate.col}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 7}>
        ＋
      </text>
    );
  }

  return (
    <div className="mapDesigner" aria-label="Map designer">
      <div className="designerBoardWrap">
        <svg
          className="designerSvg"
          onPointerCancel={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) {
              dragRef.current = null;
              window.setTimeout(() => {
                suppressClickRef.current = false;
              }, 0);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            suppressClickRef.current = false;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: camera.x,
              originY: camera.y,
              moved: false
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) {
              return;
            }
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 6) {
              drag.moved = true;
              suppressClickRef.current = true;
              (event.currentTarget as Element).setPointerCapture(event.pointerId);
            }
            if (drag.moved) {
              setCamera((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
            }
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) {
              dragRef.current = null;
              window.setTimeout(() => {
                suppressClickRef.current = false;
              }, 0);
            }
          }}
          onWheel={(event) => {
            const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
            setCamera((current) => ({ ...current, scale: Math.min(3, Math.max(0.4, current.scale * factor)) }));
          }}
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        >
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`} style={{ transformOrigin: "center" }}>
            {artLayer}
            {cellLayer}
            {outlineLayer}
            {labelLayer}
          </g>
        </svg>
        <div className="mapToolbar designerToolbarFloat" aria-label="Designer view controls">
          <button onClick={() => setCamera((c) => ({ ...c, scale: Math.min(3, c.scale * 1.2) }))} title="Zoom in" type="button">
            <Plus size={13} />
          </button>
          <button onClick={() => setCamera((c) => ({ ...c, scale: Math.max(0.4, c.scale / 1.2) }))} title="Zoom out" type="button">
            <Minus size={13} />
          </button>
          <button onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} title="Reset the view" type="button">
            ⤾
          </button>
        </div>
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
                <button onClick={() => rotateSelected(-1)} title="Rotate the tile 60° counterclockwise" type="button">
                  <RotateCcw size={12} />
                </button>
                <button onClick={() => rotateSelected(1)} title="Rotate the tile 60° clockwise" type="button">
                  <RotateCw size={12} /> {(selected.rotation ?? 0) * 60}°
                </button>
              </div>
              {selectedTileDef?.assets?.tileImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
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
          Drag to pan, scroll to zoom. Click a ＋ flower to add a tile next to the board; click a placed tile to flip
          it face up or down, pick the exact tile, rotate it in 60° steps or remove it. Face-down tiles draw randomly
          from their pool when the adventure starts.
        </small>
      )}
    </div>
  );
}
