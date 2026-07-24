"use client";

/**
 * Read-only map-shape preview: the tile flowers of a scenario sheet or a
 * designed map as one small SVG — band-coloured outlines (the designer's
 * tier-ladder hues), numbered seat tiles, dashed underground-layer tiles.
 * Pure geometry over the engine hex helpers; no interaction, no state.
 *
 * Also the home of the designer's shared outline primitives (`GROUP_COLORS`,
 * `flowerOutline`) so the map designer and this preview render tiles from one
 * source.
 */
import {
  hexNeighbors,
  hexToPixel,
  tileFootprint,
  type CustomMapTilePlan,
  type HexCoord,
  type ScenarioDefinition
} from "@/engine";

/** Tile band groups (the designer vocabulary). */
export type PreviewTileGroup = CustomMapTilePlan["group"];

/**
 * Tile-outline colours mirror the creature-tier ladder, so a designer instantly
 * reads the band's MAX recruitable unit tier from the ring: Ⅰ = bronze, Ⅱ–Ⅲ =
 * silver, Ⅳ–Ⅴ = gold, Ⅵ–Ⅶ = azure. The land hues reuse the app's canonical grade
 * colours (`.tierDot.*` / `.neutralDeck.*` in globals.css). Sea is a light blue
 * and Underground keeps its purple. This is the MAP-EDITOR/preview outline only —
 * the in-game yellow movement borders (screen.tsx / borders.ts) are untouched.
 */
export const GROUP_COLORS: Record<PreviewTileGroup, string> = {
  starting: "#b46f33", // bronze — Ⅰ tiles guard bronze units only
  far: "#c7ccd6", // silver — Ⅱ–Ⅲ tiles top out at silver
  near: "#e7b73c", // gold — Ⅳ–Ⅴ tiles top out at gold
  center: "#3f7fd6", // azure — Ⅵ–Ⅶ tiles reach azure
  sea: "#8fd8ff", // light blue — water
  subterranean: "#7a5a9e" // purple — underground (kept, per the design brief)
};

/** The outline of a 7-hex flower as one SVG path (outer edges only). */
export function flowerOutline(center: HexCoord, size: number): string {
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
      const a = corners[(direction + 5) % 6];
      const b = corners[direction % 6];
      segments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }
  return segments.join(" ");
}

/** One preview tile: a flower center + its band (and seat / underground marks). */
export type PreviewTile = {
  row: number;
  col: number;
  group: PreviewTileGroup;
  /** Seat number rendered on starting tiles (1-based). */
  seat?: number;
  /** Underground LAYER (dashed outline) — cavern group or a flagged plan. */
  underground?: boolean;
};

/** Flatten a built-in scenario sheet's layout into preview tiles. */
export function scenarioToTilePlans(scenario: ScenarioDefinition): PreviewTile[] {
  const tiles: PreviewTile[] = [];
  scenario.layout.starts.forEach((start, index) => {
    tiles.push({ row: start.row, col: start.col, group: "starting", seat: index + 1 });
  });
  for (const tile of scenario.layout.far ?? []) {
    tiles.push({ row: tile.row, col: tile.col, group: "far" });
  }
  for (const tile of scenario.layout.near) {
    tiles.push({ row: tile.row, col: tile.col, group: "near" });
  }
  for (const tile of scenario.layout.center) {
    tiles.push({ row: tile.row, col: tile.col, group: "center" });
  }
  for (const tile of scenario.layout.sea ?? []) {
    tiles.push({ row: tile.row, col: tile.col, group: "sea" });
  }
  for (const tile of scenario.layout.subterranean ?? []) {
    tiles.push({ row: tile.row, col: tile.col, group: "subterranean", underground: true });
  }
  return tiles;
}

/** Flatten a designed map's tile plans into preview tiles (seats in array order). */
export function designedTilesToPreview(tiles: CustomMapTilePlan[]): PreviewTile[] {
  let seat = 0;
  return tiles.map((plan) => {
    const isStart = plan.group === "starting";
    if (isStart) {
      seat += 1;
    }
    return {
      row: plan.row,
      col: plan.col,
      group: plan.group,
      seat: isStart ? seat : undefined,
      underground: plan.group === "subterranean" || plan.underground === true
    };
  });
}

const HEX_SIZE = 10;

export function MapShapePreview({ tiles, className }: { tiles: PreviewTile[]; className?: string }) {
  if (!tiles.length) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tile of tiles) {
    for (const cell of tileFootprint(tile, 0)) {
      const { x, y } = hexToPixel(cell, HEX_SIZE);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const pad = HEX_SIZE * 1.6;
  const viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  return (
    <svg
      aria-hidden="true"
      className={`mapShapePreviewSvg${className ? ` ${className}` : ""}`}
      preserveAspectRatio="xMidYMid meet"
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      {tiles.map((tile, index) => {
        const color = GROUP_COLORS[tile.group];
        const center = hexToPixel(tile, HEX_SIZE);
        return (
          <g key={`${tile.row}:${tile.col}:${index}`}>
            {tileFootprint(tile, 0).map((cell) => {
              const { x, y } = hexToPixel(cell, HEX_SIZE);
              const corners: string[] = [];
              for (let corner = 0; corner < 6; corner += 1) {
                const angle = (Math.PI / 180) * (60 * corner - 30);
                corners.push(`${x + HEX_SIZE * Math.cos(angle)},${y + HEX_SIZE * Math.sin(angle)}`);
              }
              return (
                <polygon
                  fill={color}
                  fillOpacity={tile.group === "starting" ? 0.28 : 0.16}
                  key={`${cell.row}:${cell.col}`}
                  points={corners.join(" ")}
                  stroke="none"
                />
              );
            })}
            <path
              d={flowerOutline(tile, HEX_SIZE)}
              fill="none"
              stroke={color}
              strokeDasharray={tile.underground ? "4 3" : undefined}
              strokeLinecap="round"
              strokeWidth={1.6}
            />
            {tile.seat ? (
              <text
                dominantBaseline="central"
                fill={color}
                fontSize={HEX_SIZE * 1.2}
                fontWeight={700}
                textAnchor="middle"
                x={center.x}
                y={center.y}
              >
                {tile.seat}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
