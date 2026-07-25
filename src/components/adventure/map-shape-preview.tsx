"use client";

/**
 * Read-only map-shape preview: the tile flowers of a scenario sheet or a
 * designed map as one small SVG — the REAL printed tile graphics (face scans for
 * pinned face-up tiles, the physical tile BACKS for seat / face-down slots)
 * under band-coloured outlines (the designer's tier-ladder hues), numbered seat
 * tiles and dashed underground-layer tiles. Art is drawn with the SAME geometry
 * the live board and the map designer use (a 3·hexWidth × 5·hexSize box per
 * flower, `preserveAspectRatio="none"`, face-up scans rotated 60°·rotation), so
 * the preview and the table can never disagree about what a map looks like.
 *
 * Also the home of the designer's shared tile primitives (`GROUP_COLORS`,
 * `flowerOutline`, `planBackLabel` / `planBackArt` / `planTileArt`) so the map
 * designer and this preview render tiles from ONE source.
 */
import { TILE_BACK_IMAGES, tileBackImage } from "@/data/assets/homm-assets";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  hexNeighbors,
  hexToPixel,
  tileFootprint,
  type CustomMapTilePlan,
  type HexCoord,
  type ScenarioDefinition
} from "@/engine";
import { assetUrl } from "@/lib/asset-url";

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

/** Sea tiles ship two guard bands behind one wave back; each has its own art. */
type PreviewSeaBand = NonNullable<CustomMapTilePlan["seaBand"]>;

/** Underground tiles likewise span two guard bands (Ⅳ–Ⅴ and a Ⅵ–Ⅶ boss tier). */
type PreviewSubBand = NonNullable<CustomMapTilePlan["subBand"]>;

/** The printed numerals for a sea tile's guard band. */
export const SEA_BAND_NUMERAL: Record<PreviewSeaBand, string> = { "iv-v": "Ⅳ–Ⅴ", "vi-vii": "Ⅵ–Ⅶ" };

/** The printed numerals for an underground tile's guard band. */
export const SUB_BAND_NUMERAL: Record<PreviewSubBand, string> = { "iv-v": "Ⅳ–Ⅴ", "vi-vii": "Ⅵ–Ⅶ" };

/** A plan-shaped band descriptor — everything the printed BACK art depends on. */
type BandPlan = { group: PreviewTileGroup; seaBand?: PreviewSeaBand; subBand?: PreviewSubBand };

/**
 * Printed roman band on the physical tile BACK (matches `tile.backLabel` in play).
 * Sea / underground MUST pass their band so Ⅵ–Ⅶ never wears the Ⅳ–Ⅴ back art.
 */
export function planBackLabel(plan: BandPlan): string {
  if (plan.group === "sea") {
    return SEA_BAND_NUMERAL[plan.seaBand ?? "iv-v"];
  }
  if (plan.group === "subterranean") {
    return SUB_BAND_NUMERAL[plan.subBand ?? "iv-v"];
  }
  switch (plan.group) {
    case "starting":
      return "Ⅰ";
    case "far":
      return "Ⅱ–Ⅲ";
    case "center":
      return "Ⅵ–Ⅶ";
    case "near":
    default:
      return "Ⅳ–Ⅴ";
  }
}

/** Correct printed back art for a designed plan (band-aware for sea / underground). */
export function planBackArt(plan: BandPlan): string {
  return tileBackImage(plan.group, planBackLabel(plan));
}

/**
 * The printed art a designed tile PLAN shows on a board: a seat tile and every
 * face-DOWN slot wear the physical tile BACK (band-correct), a face-UP slot its
 * own printed face scan (a face-up "one of these tiles" slot shows its first
 * candidate as a representative). Undefined only when a face-up slot has no tile
 * pinned yet (a plain random slot) — the caller then shows the band colour alone.
 *
 * ONE source shared by the map designer's board and this read-only preview.
 */
export function planTileArt(plan: CustomMapTilePlan): string | undefined {
  if (plan.group === "starting") {
    return TILE_BACK_IMAGES.starting;
  }
  if (plan.faceDown) {
    return planBackArt(plan);
  }
  const pinned = plan.tileDefId ?? plan.oneOfTileDefIds?.[0];
  return pinned ? allTileDefinitions[pinned]?.assets?.tileImage : undefined;
}

/**
 * Orientation of a plan's art in sixths of a turn. Face-down BACKS and seat tiles
 * are orientation-independent (the printed numeral sits upright on the physical
 * back), so only a face-up scan carries the plan's rotation.
 */
export function planTileArtRotation(plan: CustomMapTilePlan): number {
  return plan.group !== "starting" && !plan.faceDown ? plan.rotation ?? 0 : 0;
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
  /**
   * Printed tile graphic (an unprefixed `/assets/...` path — the component runs
   * it through `assetUrl`). Absent for a slot with no printed art to show; the
   * band-coloured flower then stands alone.
   */
  art?: string;
  /** Art orientation in sixths of a turn (face-up designed scans only). */
  artRotation?: number;
};

/**
 * Flatten a built-in scenario sheet's layout into preview tiles.
 *
 * A scenario sheet pins only the SHAPE — which tile lands in which slot is drawn
 * at setup (and a seat's home tile depends on the faction picked) — so every tile
 * wears its printed BACK, exactly what the physical board looks like when the map
 * is laid out. Sea / underground slots carry no band in the layout, so they take
 * the Ⅳ–Ⅴ back (`planBackArt`'s default).
 */
export function scenarioToTilePlans(scenario: ScenarioDefinition): PreviewTile[] {
  const tiles: PreviewTile[] = [];
  const back = (group: PreviewTileGroup) => planBackArt({ group });
  scenario.layout.starts.forEach((start, index) => {
    tiles.push({ row: start.row, col: start.col, group: "starting", seat: index + 1, art: back("starting") });
  });
  for (const tile of scenario.layout.far ?? []) {
    tiles.push({ row: tile.row, col: tile.col, group: "far", art: back("far") });
  }
  for (const tile of scenario.layout.near) {
    tiles.push({ row: tile.row, col: tile.col, group: "near", art: back("near") });
  }
  for (const tile of scenario.layout.center) {
    tiles.push({ row: tile.row, col: tile.col, group: "center", art: back("center") });
  }
  for (const tile of scenario.layout.sea ?? []) {
    tiles.push({ row: tile.row, col: tile.col, group: "sea", art: back("sea") });
  }
  for (const tile of scenario.layout.subterranean ?? []) {
    tiles.push({
      row: tile.row,
      col: tile.col,
      group: "subterranean",
      underground: true,
      art: back("subterranean")
    });
  }
  return tiles;
}

/**
 * Flatten a designed map's tile plans into preview tiles (seats in array order),
 * each carrying the SAME printed graphic the map designer draws for that plan
 * (`planTileArt`): a pinned face-up tile shows its face scan at its designed
 * rotation, every seat / face-down slot its band-correct BACK.
 */
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
      underground: plan.group === "subterranean" || plan.underground === true,
      art: planTileArt(plan),
      artRotation: planTileArtRotation(plan)
    };
  });
}

const HEX_SIZE = 10;
/** Pointy-top hex width — the same relation the live board and designer use. */
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
/**
 * The printed tile scan's box: a 7-hex flower's exact bounding box, so the art
 * lands on the flower the same way it does on the live board and in the designer
 * (both `3 · hexWidth` by `5 · hexSize` with `preserveAspectRatio="none"`).
 */
const ART_WIDTH = 3 * HEX_WIDTH;
const ART_HEIGHT = 5 * HEX_SIZE;

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
      {/*
        Printed tile graphics as ONE background layer, drawn before every outline
        so a neighbouring flower's art box can never cover an earlier tile's ring
        (the live board separates its art layer for exactly this reason).
      */}
      {tiles.map((tile, index) =>
        tile.art ? (
          <image
            height={ART_HEIGHT}
            href={assetUrl(tile.art)}
            key={`art-${tile.row}:${tile.col}:${index}`}
            opacity={0.95}
            preserveAspectRatio="none"
            transform={
              tile.artRotation
                ? `rotate(${tile.artRotation * 60} ${hexToPixel(tile, HEX_SIZE).x} ${hexToPixel(tile, HEX_SIZE).y})`
                : undefined
            }
            width={ART_WIDTH}
            x={hexToPixel(tile, HEX_SIZE).x - ART_WIDTH / 2}
            y={hexToPixel(tile, HEX_SIZE).y - ART_HEIGHT / 2}
          />
        ) : null
      )}
      {tiles.map((tile, index) => {
        const color = GROUP_COLORS[tile.group];
        const center = hexToPixel(tile, HEX_SIZE);
        // A band tint over the printed art, faint enough to read the scan through
        // (the board's own `.hexCell.withArt` lens works the same way); without
        // art it is the tile's only fill, so it stays as strong as before.
        const fillOpacity = tile.art
          ? tile.group === "starting"
            ? 0.14
            : 0.1
          : tile.group === "starting"
            ? 0.28
            : 0.16;
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
                  fillOpacity={fillOpacity}
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
                // A dark casing under the glyph so the seat number reads over the
                // printed tile art as clearly as it does over a bare fill.
                paintOrder="stroke"
                stroke="rgba(8, 6, 3, 0.9)"
                strokeWidth={2.4}
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
