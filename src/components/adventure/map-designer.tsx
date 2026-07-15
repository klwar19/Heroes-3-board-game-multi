"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl } from "@/lib/asset-url";
import { Lock, Trash2 } from "lucide-react";
import { allTileDefinitions } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
import {
  DESIGNER_UI_ICONS,
  mapTokenImage,
  REWARD_GLYPH_ICONS,
  TILE_BACK_IMAGES,
  tileBackImage,
  subterraneanGateTokenImage
} from "@/data/assets/homm-assets";
import type { TileDefinition } from "@/data/map/types";
import {
  gatePairColor,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  legalGateHexPairs,
  legalTokenSlotsForTileDef,
  mapTokenLabel,
  parseHexSpaceId,
  pixelToHex,
  planSubterraneanGates,
  scenarioDefinitions,
  seaTileBand,
  secretFeatureFullLabel,
  secretFeatureLabel,
  SECRET_TILE_FEATURES,
  subterraneanTileBand,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  tileMatchesSecretFeature,
  unreachableUndergroundCenters,
  validateCustomMapObjects,
  victoryDesignConflicts,
  type CustomMapGateLink,
  type CustomMapObject,
  type CustomMapObjectKind,
  type CustomMapTilePlan,
  type DesignedGateLinkLike,
  type HexCoord,
  type MapTokenKind,
  type PlannedSubterraneanGate,
  type SecretTileFeature,
  type VictoryMode
} from "@/engine";
import { nearestGateHexPair, type GateHexPair } from "@/components/adventure/gate-drag";
import { titleCase } from "@/components/table/utils";
import {
  MAP_SCALE_MAX,
  MAP_SCALE_MIN,
  pinchCamera,
  type PinchStart
} from "@/components/adventure/map-pinch";

/** Board-game glyph / medallion for designer toolbar and mode cards. */
function DesignerGlyph({
  src,
  className = "designerGlyph"
}: {
  src: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- assetUrl CDN path; decorative
    <img alt="" aria-hidden="true" className={className} draggable={false} src={assetUrl(src)} />
  );
}

/** Tile group of a designed plan. */
type DesignGroup = CustomMapTilePlan["group"];

/** Sea tiles ship two guard bands behind one wave back; the designer offers each. */
type SeaBand = NonNullable<CustomMapTilePlan["seaBand"]>;

/** Underground tiles likewise span two guard bands (Ⅳ–Ⅴ and a Ⅵ–Ⅶ boss tier). */
type SubBand = NonNullable<CustomMapTilePlan["subBand"]>;

/** Short printed label per group (the Roman numeral on the tile back). */
export const TILE_GROUP_LABELS: Record<DesignGroup, string> = {
  starting: "Ⅰ Town",
  far: "Ⅱ–Ⅲ",
  near: "Ⅳ–Ⅴ",
  center: "Ⅵ–Ⅶ",
  sea: "Sea",
  subterranean: "Underground"
};

/** The printed numerals for a sea tile's guard band. */
const SEA_BAND_NUMERAL: Record<SeaBand, string> = { "iv-v": "Ⅳ–Ⅴ", "vi-vii": "Ⅵ–Ⅶ" };

/** The printed numerals for an underground tile's guard band. */
const SUB_BAND_NUMERAL: Record<SubBand, string> = { "iv-v": "Ⅳ–Ⅴ", "vi-vii": "Ⅵ–Ⅶ" };

/**
 * Printed roman band on the physical tile BACK (matches `tile.backLabel` in play).
 * Sea / underground MUST pass their band so Ⅵ–Ⅶ never wears the Ⅳ–Ⅴ back art.
 */
export function planBackLabel(plan: {
  group: DesignGroup;
  seaBand?: SeaBand;
  subBand?: SubBand;
}): string {
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
export function planBackArt(plan: {
  group: DesignGroup;
  seaBand?: SeaBand;
  subBand?: SubBand;
}): string {
  return tileBackImage(plan.group, planBackLabel(plan));
}

/** Label for a placed/dragged plan — sea/underground read their band, every other group its numeral. */
function planGroupLabel(plan: { group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand }): string {
  if (plan.group === "sea") {
    return `Sea ${SEA_BAND_NUMERAL[plan.seaBand ?? "iv-v"]}`;
  }
  if (plan.group === "subterranean") {
    return `Underground ${SUB_BAND_NUMERAL[plan.subBand ?? "iv-v"]}`;
  }
  return TILE_GROUP_LABELS[plan.group];
}

const GROUP_COLORS: Record<DesignGroup, string> = {
  starting: "#d9b54a",
  far: "#4f8a4f",
  near: "#b08d2f",
  center: "#a14d4d",
  sea: "#3f7fae",
  subterranean: "#7a5a9e"
};

/** The draggable palette: one entry per tile type the designer can place. */
const PALETTE: {
  key: string;
  group: DesignGroup;
  seaBand?: SeaBand;
  subBand?: SubBand;
  label: string;
  hint: string;
}[] = [
  {
    key: "starting",
    group: "starting",
    label: "Town",
    hint: "A player's starting town. The first one placed is seat 1, the next seat 2, and so on — the tile art comes from each player's faction."
  },
  {
    key: "far",
    group: "far",
    label: "Far",
    hint: "Weak outer tile. Placed face-down (random from the Far pool) — click it to reveal a specific tile."
  },
  {
    key: "near",
    group: "near",
    label: "Near",
    hint: "Mid-strength tile. Placed face-down (random from the Near pool)."
  },
  {
    key: "center",
    group: "center",
    label: "Center",
    hint: "Strong central tile. Placed face-down (random from the Center pool)."
  },
  {
    key: "sea-iv-v",
    group: "sea",
    seaBand: "iv-v",
    label: "Sea Ⅳ–Ⅴ",
    hint: "Weaker sea tile (Ⅳ–Ⅴ guard band). Placed face-down — draws a random Ⅳ–Ⅴ tile from the wave pool."
  },
  {
    key: "sea-vi-vii",
    group: "sea",
    seaBand: "vi-vii",
    label: "Sea Ⅵ–Ⅶ",
    hint: "Stronger sea tile (Ⅵ–Ⅶ guard band). Placed face-down — draws a random Ⅵ–Ⅶ tile from the wave pool."
  },
  {
    key: "sub-iv-v",
    group: "subterranean",
    subBand: "iv-v",
    label: "Underground Ⅳ–Ⅴ",
    hint: "Regular underground tile (Ⅳ–Ⅴ guard band). Placed face-down — draws a random Ⅳ–Ⅴ tile from the underground pool."
  },
  {
    key: "sub-vi-vii",
    group: "subterranean",
    subBand: "vi-vii",
    label: "Underground Ⅵ–Ⅶ",
    hint: "Boss underground tile (Ⅵ–Ⅶ guard band — Cyclops Stockpile or Random Town). Placed face-down — draws a random Ⅵ–Ⅶ tile from the underground pool."
  }
];

/** Groups whose tiles can be flipped face up and chosen exactly. */
const PICKABLE_GROUPS = new Set<DesignGroup>(["far", "near", "center", "sea", "subterranean"]);

/** The physical supply of numbered Whirlpool tokens (+1 / 0 / -1). */
const MAX_WHIRLPOOL_TOKENS = 3;

/**
 * Center-tile Ⅶ-field designations for the popover picker. `undefined` = Default
 * (keep the drawn/chosen tile's printed objective); the others FORCE the
 * difficulty-7 field. Order = picker order.
 */
const VII_FIELD_OPTIONS: { id: CustomMapTilePlan["viiField"]; label: string; hint: string }[] = [
  { id: undefined, label: "Default", hint: "Keep whatever objective the drawn / chosen tile prints." },
  { id: "grail", label: "Grail", hint: "Force the Grail dig site on this slot's Ⅶ field." },
  { id: "dragon_utopia", label: "Dragon Utopia", hint: "Force the Dragon Utopia on this slot's Ⅶ field." },
  { id: "town", label: "Town", hint: "Force a neutral conquerable Random Town on this slot's Ⅶ field." }
];

/**
 * Which token kinds a FACE-DOWN plan of this group may carry (the discovering
 * player places the token on a field of their choosing when the tile is
 * revealed): sea tiles hide Whirlpools, every other non-starting group hides
 * Monoliths (land). Face-up tiles instead offer whichever kinds have a legal
 * printed field on the chosen tile.
 */
function faceDownTokenKinds(group: DesignGroup): MapTokenKind[] {
  if (group === "starting") {
    return [];
  }
  return group === "sea" ? ["whirlpool"] : ["monolith"];
}

/** Ring direction names for slots 1-6, before rotation. */
const SLOT_DIRECTIONS = ["NE", "E", "SE", "SW", "W", "NW"] as const;

/** Human label for a tile-definition slot in the token slot picker. */
function tokenSlotLabel(defId: string | undefined, slot: number, rotation: number): string {
  const def = defId ? allTileDefinitions[defId] : undefined;
  const fieldDef = def?.fields[slot];
  const where = slot === 0 ? "Centre" : `${SLOT_DIRECTIONS[(slot - 1 + rotation) % 6]} edge`;
  const location = fieldDef ? locationDefinitions[fieldDef.location]?.name ?? fieldDef.location : "field";
  return `${where} — ${location}`;
}

/** Short landmark chips shown on a clickable tile card in the designer picker. */
function tileFeatureTags(def: TileDefinition): string[] {
  const tags: string[] = [];
  for (const field of def.fields) {
    if (field.location === "empty_field" || field.location === "blocked_field") {
      continue;
    }
    if (field.location === "mine") {
      const resource =
        field.resource === "gold"
          ? "Gold mine"
          : field.resource === "valuables"
            ? "Valuables mine"
            : field.resource === "buildingMaterials"
              ? "Materials mine"
              : "Mine";
      tags.push(resource);
      continue;
    }
    const name = locationDefinitions[field.location]?.name ?? field.location;
    tags.push(name);
  }
  return tags.length > 0 ? tags : [titleCase(def.terrain)];
}

/**
 * Landmark filters for the clickable tile picker — pick a chip, then click a
 * tile. "all" shows every tile in the slot's pool. Optional `iconSrc` is
 * board-game art for the chip face.
 */
const TILE_PICK_FILTERS: {
  id: string;
  label: string;
  iconSrc?: string;
  match: (def: TileDefinition) => boolean;
}[] = [
  { id: "all", label: "All", match: () => true },
  {
    id: "mine",
    label: "Mine",
    iconSrc: "/assets/glyphs/treasure.svg",
    match: (def) => def.fields.some((field) => field.location === "mine")
  },
  {
    id: "gold",
    label: "Gold",
    iconSrc: "/assets/icons/resource-gold.webp",
    match: (def) => def.fields.some((field) => field.location === "mine" && field.resource === "gold")
  },
  {
    id: "valuables",
    label: "Valuables",
    iconSrc: "/assets/icons/resource-valuables.webp",
    match: (def) => def.fields.some((field) => field.location === "mine" && field.resource === "valuables")
  },
  {
    id: "obelisk",
    label: "Obelisk",
    iconSrc: "/assets/icons/location-obelisk.webp",
    match: (def) => def.fields.some((field) => field.location === "obelisk")
  },
  {
    id: "settlement",
    label: "Settlement",
    iconSrc: "/assets/icons/location-settlement.webp",
    match: (def) => def.fields.some((field) => field.location === "settlement")
  },
  {
    id: "town",
    label: "Town",
    iconSrc: "/assets/glyphs/building_citadel.svg",
    match: (def) => def.fields.some((field) => field.location === "town" || field.location === "random_town")
  },
  {
    id: "objective",
    label: "Grail / Dragons",
    iconSrc: "/assets/icons/location-grail.webp",
    match: (def) =>
      def.fields.some((field) => field.location === "grail" || field.location === "dragon_utopia")
  }
];

/** How a non-starting designed tile is configured for players. */
type TileSlotMode = "random" | "secret" | "faceup";

function tileSlotMode(plan: CustomMapTilePlan): TileSlotMode {
  if (!plan.faceDown) {
    return "faceup";
  }
  // Secret = feature filter OR legacy exact pin (both stay face-down until found).
  return plan.secretFeature || plan.tileDefId ? "secret" : "random";
}

/** Board / title label for a secret slot (feature preferred over exact pin). */
function secretBoardLabel(plan: CustomMapTilePlan): string {
  if (plan.secretFeature) {
    return `🔒 ${secretFeatureLabel(plan.secretFeature)}`;
  }
  if (plan.tileDefId) {
    return `🔒 ${plan.tileDefId}`;
  }
  return "🔒 Secret";
}

/**
 * Revalidates a plan's token against a new face-up tile definition: the slot is
 * kept when still legal, else moved to the first legal slot, else the token is
 * dropped (the chosen tile simply has no field the token may overwrite).
 */
function retargetTokenForDef(
  token: CustomMapTilePlan["token"],
  tileDefId: string | undefined
): CustomMapTilePlan["token"] {
  if (!token) {
    return undefined;
  }
  const def = tileDefId ? allTileDefinitions[tileDefId] : undefined;
  if (!def) {
    return undefined;
  }
  const legal = legalTokenSlotsForTileDef(def, token.kind);
  if (legal.length === 0) {
    return undefined;
  }
  return { kind: token.kind, slot: token.slot !== undefined && legal.includes(token.slot) ? token.slot : legal[0] };
}

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

/** Board-direction labels (0-5) for the designer's yellow-border rose. */
const BORDER_DIRECTION_LABELS = ["NE", "E", "SE", "SW", "W", "NW"] as const;

/**
 * The two endpoints of a hex's edge facing `direction` (0-5), matching the
 * {@link hexCorners} / {@link flowerOutline} corner convention, so a drawn
 * border line sits exactly on the flower's outer edge.
 */
function hexEdgePoints(
  cx: number,
  cy: number,
  size: number,
  direction: number
): { x1: number; y1: number; x2: number; y2: number } {
  const corner = (index: number) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
  };
  const a = corner((direction + 5) % 6);
  const b = corner(direction % 6);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
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
      const a = corners[(direction + 5) % 6];
      const b = corners[direction % 6];
      segments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }
  return segments.join(" ");
}

/** A live drag of a tile type from the palette, or of an already-placed tile. */
type DesignDrag =
  | { kind: "palette"; group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand; clientX: number; clientY: number }
  | { kind: "move"; index: number; group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand; clientX: number; clientY: number };

/** Stable empty default so the `objects` prop never re-mounts on every render. */
const EMPTY_OBJECTS: CustomMapObject[] = [];

/** The four colored Gate pairs offered in the Objects palette (1 = red … 4 = yellow). */
const GATE_PAIRS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

/** Guard-difficulty picks for a placed object (0 = no guard, 1-7 = Ⅰ-Ⅶ). */
const OBJECT_GUARD_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const ROMAN_NUMERALS = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];

/** A CSS colour for each Gate pair (matches {@link gatePairColor}). */
const GATE_PAIR_CSS: Record<1 | 2 | 3 | 4, string> = {
  1: "#e0483c",
  2: "#3d7fe0",
  3: "#3caf52",
  4: "#e0b93c"
};

/**
 * Map designer board: a real hex-grid view of the scenario. Pan by dragging the
 * empty background, zoom with the wheel (when unlocked), pinch, or toolbar —
 * same camera model as the adventure map (`map-pinch.ts`). Drag a tile type
 * from the palette onto the board to place it; drag a placed tile to move it;
 * click a placed tile to reveal it (face up), flip it back to random, rotate it
 * or remove it. The first Town (Ⅰ) tiles become the player seats.
 */
export function MapDesigner({
  scenarioId,
  customMap,
  onChange,
  objects = EMPTY_OBJECTS,
  onObjectsChange,
  victoryMode,
  hexSize = DESIGN_HEX
}: {
  scenarioId: string;
  customMap: CustomMapTilePlan[];
  onChange: (next: CustomMapTilePlan[]) => void;
  /** Designer one-hex objects (Monolith/Whirlpool tokens + colored Gate pairs). */
  objects?: CustomMapObject[];
  /** Persist an edited object list (lives on the map PRESET, held by the page). */
  onObjectsChange?: (next: CustomMapObject[]) => void;
  /** The map's victory mode (from the preset) — drives the win-condition conflict warning. */
  victoryMode?: VictoryMode;
  hexSize?: number;
}) {
  const scenario = scenarioDefinitions[scenarioId];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [popoverAt, setPopoverAt] = useState<{ x: number; y: number } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  // Wheel-zoom defaults ON here (the designer board is the main surface). The
  // lock button matches the adventure map: when locked, the wheel scrolls the page.
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);
  const [drag, setDrag] = useState<DesignDrag | null>(null);
  const [hoverSlot, setHoverSlot] = useState<HexCoord | null>(null);
  /** Landmark chip filter for the clickable tile picker (All / Mine / …). */
  const [tilePickFilter, setTilePickFilter] = useState("all");
  /**
   * A live drag of a DESIGNED gate token along its two tiles' shared boundary:
   * pointermove snaps the token pair to the nearest legal boundary position
   * (pure math in gate-drag.ts) as a preview; pointerup commits the pin through
   * the same update path as the ↻ cycle button; pointercancel/Escape discards
   * (the plan is never touched mid-drag, so cancel restores the previous pin by
   * construction). `moved` gates commit AND the click-suppression, so a plain
   * click on the token still opens the cavern popover.
   */
  const [gateDrag, setGateDrag] = useState<{
    cavernCenter: HexCoord;
    surfaceCenter: HexCoord;
    pairs: GateHexPair[];
    hover: GateHexPair | null;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  // Set when a gate drag actually moved, so the trailing click never also
  // opens the popover.
  const gateClickSuppressRef = useRef(false);

  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  // A pending press on a placed tile: a small move promotes it to a drag, a
  // release in place opens its popover.
  const pressRef = useRef<{ pointerId: number; index: number; group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand; startX: number; startY: number; promoted: boolean } | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Touch pinch (zoom + two-finger pan) — same pure math as the adventure map.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ aId: number; bId: number; start: PinchStart } | null>(null);

  // --- Designer objects (Monolith/Whirlpool tokens + colored Gate pairs) ------
  // Click-to-arm placement: arm a kind from the Objects palette, then click a
  // legal candidate cell (a face-up tile slot → tile-slot object, an off-tile
  // empty hex → standalone). A placed object opens its own popover (guard/delete).
  const [armedObject, setArmedObject] = useState<{ kind: CustomMapObjectKind; pair?: 1 | 2 | 3 | 4 } | null>(null);
  const [selectedObjectIndex, setSelectedObjectIndex] = useState<number | null>(null);
  const [objectPopoverAt, setObjectPopoverAt] = useState<{ x: number; y: number } | null>(null);
  // Border paint mode: armed from the Objects palette, it turns every placed
  // tile's six outer-edge ring hexes into clickable zones that seal/unseal a
  // designer yellow border directly on the board (one armed mode at a time).
  const [borderPaint, setBorderPaint] = useState(false);

  const starts = useMemo<HexCoord[]>(
    () => (scenario ? scenario.layout.starts.map((start) => ({ ...start })) : []),
    [scenario]
  );

  // Once the designer places its own Town (Ⅰ) tiles, those become the seats and
  // the scenario's default seats step aside — mirroring the engine, whose map
  // connectivity then anchors on the designed towns.
  const hasDesignerStarts = customMap.some((plan) => plan.group === "starting");
  const startingPlanIndexes = customMap
    .map((plan, index) => (plan.group === "starting" ? index : -1))
    .filter((index) => index >= 0);

  /** Tile centers currently anchoring the board (seeds + placed), minus one. */
  const placedCenters = useCallback(
    (excludeIndex?: number): HexCoord[] => [
      ...(hasDesignerStarts ? [] : starts),
      ...customMap.filter((_, index) => index !== excludeIndex).map((plan) => ({ row: plan.row, col: plan.col }))
    ],
    [customMap, hasDesignerStarts, starts]
  );

  /**
   * Every empty gapless slot bordering the current board (optionally ignoring
   * one tile): the union of each placed tile's six lattice neighbours, minus any
   * that overlaps a tile already down. These are the positions where a tile
   * interlocks with no hole — shown as faint guides while dragging — but a tile
   * may now be dropped freely on any non-overlapping hex, not only these.
   */
  const candidatesFor = useCallback(
    (excludeIndex?: number): HexCoord[] => {
      const placed = placedCenters(excludeIndex);
      const seen = new Map<string, HexCoord>();
      for (const center of placed) {
        for (const neighbor of tileLatticeNeighbors(center)) {
          const key = `${neighbor.row}:${neighbor.col}`;
          if (seen.has(key)) {
            continue;
          }
          if (placed.some((existing) => tileCentersOverlap(existing, neighbor))) {
            continue;
          }
          seen.set(key, neighbor);
        }
      }
      return [...seen.values()];
    },
    [placedCenters]
  );

  const activeCandidates = useMemo<HexCoord[]>(
    () => (drag ? candidatesFor(drag.kind === "move" ? drag.index : undefined) : []),
    [drag, candidatesFor]
  );

  // Every tile the gate planner sees: the placed plans plus the scenario's
  // default seats (Surface tiles) when the designer hasn't placed its own Town
  // tiles — a cavern may descend from a seat, so the seats must count as surface.
  const gatePlacements = useMemo(
    () => [
      ...(hasDesignerStarts ? [] : starts.map((seat) => ({ row: seat.row, col: seat.col, group: "starting" as const }))),
      ...customMap.map((plan) => ({ row: plan.row, col: plan.col, group: plan.group }))
    ],
    [customMap, hasDesignerStarts, starts]
  );

  // Monolith/Whirlpool token bookkeeping: counts for the "needs at least 2 to
  // work" warnings and the plan-order Whirlpool numbers (+1, 0, -1 — the same
  // order the engine assigns at setup, so the preview matches the game).
  const tokenCounts = useMemo(() => {
    let monolith = 0;
    let whirlpool = 0;
    for (const plan of customMap) {
      if (plan.token?.kind === "monolith") {
        monolith += 1;
      } else if (plan.token?.kind === "whirlpool") {
        whirlpool += 1;
      }
    }
    return { monolith, whirlpool };
  }, [customMap]);
  const whirlpoolNumberByIndex = useMemo(() => {
    const numbers = new Map<number, -1 | 0 | 1>();
    const order: (-1 | 0 | 1)[] = [1, 0, -1];
    let next = 0;
    customMap.forEach((plan, index) => {
      if (plan.token?.kind === "whirlpool" && next < order.length) {
        numbers.set(index, order[next++]);
      }
    });
    return numbers;
  }, [customMap]);

  // Designer-chosen gate links, decoded from the cavern plans, so the preview
  // draws the designer's connections (and pinned hexes) exactly as the engine
  // will carve them — including one cavern linked to several Surface tiles.
  const designedLinks = useMemo<DesignedGateLinkLike[]>(() => {
    const links: DesignedGateLinkLike[] = [];
    for (const plan of customMap) {
      if (plan.group !== "subterranean" || !plan.gateLinks) {
        continue;
      }
      for (const link of plan.gateLinks) {
        links.push({
          surfaceCenter: { row: link.surface.row, col: link.surface.col },
          cavernCenter: { row: plan.row, col: plan.col },
          gateHex: link.gateHex ? parseHexSpaceId(link.gateHex) ?? undefined : undefined,
          entranceHex: link.entranceHex ? parseHexSpaceId(link.entranceHex) ?? undefined : undefined
        });
      }
    }
    return links;
  }, [customMap]);

  // The Subterranean Gates this layout will carve (same touch rule + one-gate-
  // per-tile + designer links as the engine) and the caverns it leaves with no
  // way in (designer links only ever ADD reachability, so the touch-graph warning
  // never wrongly fires on a linked cavern).
  const plannedGates = useMemo(
    () => planSubterraneanGates(gatePlacements, designedLinks),
    [gatePlacements, designedLinks]
  );
  const unreachableCaverns = useMemo(() => unreachableUndergroundCenters(gatePlacements), [gatePlacements]);
  const unreachableKeys = useMemo(
    () => new Set(unreachableCaverns.map((center) => `${center.row}:${center.col}`)),
    [unreachableCaverns]
  );

  // Map a screen point into the board's drawing space (accounts for viewBox,
  // pan and zoom through the rendered group's live transform matrix).
  const clientToLocal = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const group = gRef.current;
    const ctm = group?.getScreenCTM();
    if (!ctm) {
      return null;
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  }, []);

  const clampScale = useCallback(
    (scale: number) => Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, scale)),
    []
  );

  const zoomBy = useCallback(
    (factor: number) => {
      setCamera((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
    },
    [clampScale]
  );

  // Wheel-to-zoom as a native non-passive listener (React's root wheel is
  // passive — preventDefault from onWheel is ignored and the page would scroll).
  // Only attached while unlocked, matching HexMapBoard.
  useEffect(() => {
    if (!wheelZoomEnabled) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setCamera((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [wheelZoomEnabled, clampScale]);

  // The hex a drop would land on: simply the one under the pointer, free to be
  // any hex on the grid. Only a position whose flower would overlap an existing
  // tile is rejected (overlapping tiles can't share fields) — holes, tip-only
  // contact and fully detached tiles are all allowed.
  const slotAt = useCallback(
    (clientX: number, clientY: number, excludeIndex?: number): HexCoord | null => {
      const local = clientToLocal(clientX, clientY);
      if (!local) {
        return null;
      }
      const target = pixelToHex(local.x, local.y, hexSize);
      const placed = placedCenters(excludeIndex);
      if (placed.some((existing) => tileCentersOverlap(existing, target))) {
        return null;
      }
      return target;
    },
    [clientToLocal, hexSize, placedCenters]
  );

  const closePopover = useCallback(() => {
    setSelectedIndex(null);
    setPopoverAt(null);
    setTilePickFilter("all");
  }, []);

  // Close the docked object panel. A single stable callback (mirroring
  // `closePopover`) keeps every clear site — the ✕ button, the mutual-exclusivity
  // clears — a stable ref rather than a fresh inline closure (which the React
  // Compiler otherwise can't reconcile with the object hooks' manual deps).
  const closeObjectPopover = useCallback(() => {
    setSelectedObjectIndex(null);
    setObjectPopoverAt(null);
  }, []);

  const addTile = useCallback(
    (group: DesignGroup, center: HexCoord, seaBand?: SeaBand, subBand?: SubBand) => {
      const plan: CustomMapTilePlan =
        group === "starting"
          ? { row: center.row, col: center.col, group, faceDown: false }
          : {
              row: center.row,
              col: center.col,
              group,
              faceDown: true,
              ...(group === "sea" && seaBand ? { seaBand } : {}),
              ...(group === "subterranean" && subBand ? { subBand } : {})
            };
      onChange([...customMap, plan]);
    },
    [customMap, onChange]
  );

  const moveTile = useCallback(
    (index: number, center: HexCoord) => {
      onChange(customMap.map((plan, planIndex) => (planIndex === index ? { ...plan, row: center.row, col: center.col } : plan)));
    },
    [customMap, onChange]
  );

  const updateTile = useCallback(
    (index: number, changes: Partial<CustomMapTilePlan>) => {
      onChange(
        customMap.map((plan, planIndex) => {
          if (planIndex !== index) {
            return plan;
          }
          const next = { ...plan, ...changes };
          // Explicit `undefined` clears an optional field (secret pin / feature / token / gate links).
          if (changes.tileDefId === undefined && "tileDefId" in changes) {
            delete next.tileDefId;
          }
          if (changes.secretFeature === undefined && "secretFeature" in changes) {
            delete next.secretFeature;
          }
          if (changes.token === undefined && "token" in changes) {
            delete next.token;
          }
          if (changes.gateLinks === undefined && "gateLinks" in changes) {
            delete next.gateLinks;
          }
          if (changes.extraBorders === undefined && "extraBorders" in changes) {
            delete next.extraBorders;
          }
          if (changes.lockRotation === undefined && "lockRotation" in changes) {
            delete next.lockRotation;
          }
          if (changes.viiField === undefined && "viiField" in changes) {
            delete next.viiField;
          }
          return next;
        })
      );
    },
    [customMap, onChange]
  );

  const removeTile = useCallback(
    (index: number) => {
      onChange(customMap.filter((_, planIndex) => planIndex !== index));
      closePopover();
    },
    [customMap, onChange, closePopover]
  );

  /**
   * The ONE write path for a designer yellow border on any plan at an ABSOLUTE
   * board direction (0-5): add/remove + sort, dropping the field when empty.
   * Both the tile-panel edge rose and the on-board paint zones call this, so
   * both always write the identical plan shape (a stable callback so the paint
   * zones' hook chain stays memoizable).
   */
  const toggleBorderAt = useCallback(
    (index: number, direction: number) => {
      const plan = customMap[index];
      if (!plan) {
        return;
      }
      const current = plan.extraBorders ?? [];
      const next = current.includes(direction)
        ? current.filter((entry) => entry !== direction)
        : [...current, direction].sort((a, b) => a - b);
      updateTile(index, { extraBorders: next.length > 0 ? next : undefined });
    },
    [customMap, updateTile]
  );

  /**
   * Arm / disarm the on-board border paint tool. Only one interaction mode runs
   * at a time, so arming it clears any armed object and closes the docked panels
   * (mirrored by `armObject`, which clears border paint). Disarming just leaves
   * those already-clear.
   */
  const toggleBorderPaint = useCallback(() => {
    setArmedObject(null);
    closePopover();
    closeObjectPopover();
    setBorderPaint((current) => !current);
  }, [closePopover, closeObjectPopover]);

  // --- Designer object geometry + edit helpers -------------------------------
  /** The board hex a placed object sits on (tile-slot honours the tile rotation). */
  const objectHexOf = useCallback(
    (object: CustomMapObject): string => {
      if (object.placement.type === "standalone") {
        return hexSpaceId({ row: object.placement.row, col: object.placement.col });
      }
      const plan = customMap.find((p) => p.row === object.placement.row && p.col === object.placement.col);
      const footprint = tileFootprint({ row: object.placement.row, col: object.placement.col }, plan?.rotation ?? 0);
      return hexSpaceId(footprint[object.placement.slot] ?? footprint[0]);
    },
    [customMap]
  );
  const objectHexSet = useMemo(() => new Set(objects.map(objectHexOf)), [objects, objectHexOf]);
  const objectValidation = useMemo(
    () => validateCustomMapObjects(customMap, objects, starts),
    [customMap, objects, starts]
  );
  // Win-condition conflicts: a design whose tiles make the chosen victory mode's
  // objective (Grail dig sites / a Dragon Utopia) impossible. Shown live here so
  // the designer sees exactly what the game start will BLOCK.
  const victoryConflicts = useMemo(
    () => victoryDesignConflicts(customMap, victoryMode),
    [customMap, victoryMode]
  );
  // The Grail / Dragon victory modes need supporting tiles; when one is chosen
  // and the design already provides them (no conflicts), show an all-clear so
  // the designer knows the win condition is satisfied, not merely un-warned.
  const victoryModeNeedsDesign =
    victoryMode === "grail" || victoryMode === "dragon-hunt" || victoryMode === "dragon-conqueror";
  const showVictoryAllClear =
    victoryModeNeedsDesign && victoryConflicts.length === 0 && customMap.length > 0;
  const gatePairPlaced = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const object of objects) {
      if (object.kind === "gate" && object.pair !== undefined) {
        counts[object.pair] = (counts[object.pair] ?? 0) + 1;
      }
    }
    return counts;
  }, [objects]);
  /** Every tile footprint hex (rotation-invariant) — for standalone candidates. */
  const occupiedTileHexes = useMemo(() => {
    const set = new Set<string>();
    for (const plan of customMap) {
      for (const cell of tileFootprint({ row: plan.row, col: plan.col }, 0)) {
        set.add(hexSpaceId(cell));
      }
    }
    return set;
  }, [customMap]);
  /** Legal FACE-UP tile-slot cells for the armed kind (a Gate uses land legality). */
  const tileSlotCandidates = useMemo(() => {
    if (!armedObject) {
      return [] as { hex: HexCoord; row: number; col: number; slot: number }[];
    }
    const legalKind: MapTokenKind = armedObject.kind === "gate" ? "monolith" : armedObject.kind;
    const out: { hex: HexCoord; row: number; col: number; slot: number }[] = [];
    for (const plan of customMap) {
      if (plan.faceDown || !plan.tileDefId) {
        continue;
      }
      const def = allTileDefinitions[plan.tileDefId];
      if (!def) {
        continue;
      }
      for (const slot of legalTokenSlotsForTileDef(def, legalKind)) {
        const hex = tileFootprint({ row: plan.row, col: plan.col }, plan.rotation ?? 0)[slot];
        if (objectHexSet.has(hexSpaceId(hex))) {
          continue;
        }
        out.push({ hex, row: plan.row, col: plan.col, slot });
      }
    }
    return out;
  }, [armedObject, customMap, objectHexSet]);
  /** Empty OFF-tile hexes adjacent to a tile — standalone candidates (land only). */
  const standaloneCandidates = useMemo<HexCoord[]>(() => {
    if (!armedObject || armedObject.kind === "whirlpool") {
      return [];
    }
    const out: HexCoord[] = [];
    const seen = new Set<string>();
    for (const hexId of occupiedTileHexes) {
      const coord = parseHexSpaceId(hexId);
      if (!coord) {
        continue;
      }
      for (const neighbor of hexNeighbors(coord)) {
        const id = hexSpaceId(neighbor);
        if (occupiedTileHexes.has(id) || objectHexSet.has(id) || seen.has(id)) {
          continue;
        }
        seen.add(id);
        out.push(neighbor);
      }
    }
    return out;
  }, [armedObject, occupiedTileHexes, objectHexSet]);

  const armObject = useCallback((kind: CustomMapObjectKind, pair?: 1 | 2 | 3 | 4) => {
    setSelectedObjectIndex(null);
    setObjectPopoverAt(null);
    // One armed mode at a time: arming an object disarms border paint.
    setBorderPaint(false);
    setArmedObject((current) => (current && current.kind === kind && current.pair === pair ? null : { kind, pair }));
  }, []);
  const placeArmedObject = useCallback(
    (placement: CustomMapObject["placement"]) => {
      if (!armedObject) {
        return;
      }
      if (placement.type === "standalone" && armedObject.kind === "whirlpool") {
        return; // a standalone Whirlpool is out of scope (sea-slots only)
      }
      const object: CustomMapObject = {
        kind: armedObject.kind,
        ...(armedObject.kind === "gate" && armedObject.pair ? { pair: armedObject.pair } : {}),
        placement
      };
      onObjectsChange?.([...objects, object]);
    },
    [armedObject, objects, onObjectsChange]
  );
  const setObjectGuard = useCallback(
    (index: number, guard: number) => {
      onObjectsChange?.(
        objects.map((object, i) => {
          if (i !== index) {
            return object;
          }
          const next = { ...object };
          if (guard > 0) {
            next.guard = guard;
          } else {
            delete next.guard;
          }
          return next;
        })
      );
    },
    [objects, onObjectsChange]
  );
  const removeObject = useCallback(
    (index: number) => {
      onObjectsChange?.(objects.filter((_, i) => i !== index));
      setSelectedObjectIndex(null);
      setObjectPopoverAt(null);
    },
    [objects, onObjectsChange]
  );

  /**
   * Pin a designed gate link (cavern ↔ Surface) to an exact boundary pair — the
   * ONE commit path shared by the ↻ cycle button and the gate-token drag, so
   * both always write the same plan shape.
   */
  const pinGateLink = useCallback(
    (cavernCenter: HexCoord, surface: { row: number; col: number }, pair: GateHexPair) => {
      const index = customMap.findIndex(
        (plan) => plan.group === "subterranean" && plan.row === cavernCenter.row && plan.col === cavernCenter.col
      );
      const plan = index >= 0 ? customMap[index] : null;
      if (!plan) {
        return;
      }
      const nextLinks: CustomMapGateLink[] = (plan.gateLinks ?? []).map((candidate) =>
        candidate.surface.row === surface.row && candidate.surface.col === surface.col
          ? { surface: candidate.surface, gateHex: hexSpaceId(pair.gateHex), entranceHex: hexSpaceId(pair.entranceHex) }
          : candidate
      );
      updateTile(index, { gateLinks: nextLinks });
    },
    [customMap, updateTile]
  );

  // Drag lifecycle: a palette press or a promoted tile press registers window
  // listeners so the ghost follows the pointer anywhere and the drop lands even
  // if it ends outside the board.
  useEffect(() => {
    if (!drag) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      setDrag((current) => (current ? { ...current, clientX: event.clientX, clientY: event.clientY } : current));
      setHoverSlot(slotAt(event.clientX, event.clientY, drag.kind === "move" ? drag.index : undefined));
    };
    const onUp = (event: PointerEvent) => {
      const slot = slotAt(event.clientX, event.clientY, drag.kind === "move" ? drag.index : undefined);
      if (slot) {
        if (drag.kind === "palette") {
          addTile(drag.group, slot, drag.seaBand, drag.subBand);
        } else {
          moveTile(drag.index, slot);
        }
      }
      setDrag(null);
      setHoverSlot(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, slotAt, addTile, moveTile]);

  // Designed-gate token drag lifecycle: pointermove maps the pointer into board
  // space and snap-previews the token pair at the nearest legal boundary
  // position; pointerup commits the pin (same path as the ↻ cycle button);
  // pointercancel/Escape discards — the plan is never touched mid-drag, so
  // cancelling restores the previous pin by construction.
  useEffect(() => {
    if (!gateDrag) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const local = clientToLocal(event.clientX, event.clientY);
      const snapped = local ? nearestGateHexPair(local, gateDrag.pairs, hexSize) : null;
      setGateDrag((current) =>
        current
          ? {
              ...current,
              // A small threshold keeps a plain click (open the popover) from
              // registering as a slide, mirroring the tile-press promotion.
              moved:
                current.moved ||
                Math.abs(event.clientX - current.startX) > 3 ||
                Math.abs(event.clientY - current.startY) > 3,
              hover: snapped ?? current.hover
            }
          : current
      );
    };
    const onUp = () => {
      if (gateDrag.moved && gateDrag.hover) {
        pinGateLink(gateDrag.cavernCenter, gateDrag.surfaceCenter, gateDrag.hover);
        // The browser still fires a click after the release — swallow it so a
        // finished slide does not also pop the cavern's options.
        gateClickSuppressRef.current = true;
      }
      setGateDrag(null);
    };
    const onCancel = () => setGateDrag(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGateDrag(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [gateDrag, clientToLocal, hexSize, pinGateLink]);

  if (!scenario) {
    return null;
  }

  const size = hexSize;
  const hexWidth = Math.sqrt(3) * size;

  // Project every visible flower cell to find the viewBox.
  const allCenters = [...placedCenters(), ...candidatesFor()];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const center of allCenters) {
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
  // A tile id may only be used once — face-up OR exact secret face-down pin.
  const usedPinnedIds = new Set(
    customMap.filter((plan) => plan.tileDefId).map((plan) => plan.tileDefId as string)
  );
  const pickableTiles = selected
    ? Object.values(allTileDefinitions)
        .filter((tile) => tile.group === selected.group)
        // Sea slots only reveal tiles from their own guard band (Ⅳ–Ⅴ vs Ⅵ–Ⅶ);
        // legacy slots without a band still see every sea tile.
        .filter((tile) => selected.group !== "sea" || !selected.seaBand || seaTileBand(tile) === selected.seaBand)
        // Underground slots likewise reveal only their own band (Ⅳ–Ⅴ vs the
        // Ⅵ–Ⅶ boss tier); legacy bandless slots still see every underground tile.
        .filter(
          (tile) =>
            selected.group !== "subterranean" || !selected.subBand || subterraneanTileBand(tile) === selected.subBand
        )
        .sort((left, right) => left.id.localeCompare(right.id))
    : [];
  const selectedTileDef = selected?.tileDefId ? allTileDefinitions[selected.tileDefId] : undefined;
  const selectedMode = selected && selected.group !== "starting" ? tileSlotMode(selected) : null;
  const selectedToken = selected?.token;

  // Landmark chips that match at least one tile in this slot's pool. Tiles the
  // designer pinned by exact id on OTHER slots are spliced out of the random
  // pool at setup, so they can never satisfy this slot's secret — subtract them
  // (the selected slot's own pin would be freed by switching to a feature).
  const availablePickFilters =
    selected && PICKABLE_GROUPS.has(selected.group)
      ? TILE_PICK_FILTERS.filter(
          (filter) => filter.id === "all" || pickableTiles.some((tile) => filter.match(tile))
        )
      : TILE_PICK_FILTERS.slice(0, 1);
  const activePickFilter =
    availablePickFilters.find((entry) => entry.id === tilePickFilter) ?? availablePickFilters[0] ?? TILE_PICK_FILTERS[0];
  const filteredPickableTiles = pickableTiles.filter((tile) => activePickFilter.match(tile));

  // Secret-feature cards that have at least one match in this slot's pool.
  const pinnedElsewhere = new Set(
    customMap
      .filter((plan, index) => plan.tileDefId && index !== selectedIndex)
      .map((plan) => plan.tileDefId as string)
  );
  const availableSecretFeatures = SECRET_TILE_FEATURES.map((feature) => ({
    ...feature,
    matchCount: pickableTiles.filter(
      (tile) => !pinnedElsewhere.has(tile.id) && tileMatchesSecretFeature(tile, feature.id)
    ).length
  })).filter((feature) => feature.matchCount > 0);

  /** Apply Random / Secret / Face-up in one click. */
  const setSelectedSlotMode = (mode: TileSlotMode) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    const fallbackId =
      selected.tileDefId ??
      pickableTiles.find((tile) => !usedPinnedIds.has(tile.id))?.id ??
      pickableTiles[0]?.id;
    const faceDownToken =
      selected.token && faceDownTokenKinds(selected.group).includes(selected.token.kind)
        ? { kind: selected.token.kind }
        : undefined;

    if (mode === "random") {
      updateTile(selectedIndex, {
        faceDown: true,
        tileDefId: undefined,
        secretFeature: undefined,
        token: faceDownToken
      });
      return;
    }
    if (mode === "secret") {
      // Prefer a landmark filter over pinning one tile. Keep an existing
      // feature when it still matches the pool; otherwise first available.
      const keptFeature =
        selected.secretFeature &&
        availableSecretFeatures.some((entry) => entry.id === selected.secretFeature)
          ? selected.secretFeature
          : undefined;
      const feature: SecretTileFeature | undefined = keptFeature ?? availableSecretFeatures[0]?.id;
      updateTile(selectedIndex, {
        faceDown: true,
        // Feature secrets clear an exact pin so the pool can still vary.
        tileDefId: feature ? undefined : selected.tileDefId ?? fallbackId,
        secretFeature: feature,
        token: faceDownToken
      });
      return;
    }
    // Face-up needs a concrete tile.
    if (!fallbackId) {
      return;
    }
    updateTile(selectedIndex, {
      faceDown: false,
      tileDefId: fallbackId,
      secretFeature: undefined,
      token: retargetTokenForDef(selected.token, fallbackId)
    });
  };

  /** Secret mode: pick a landmark — game start draws any matching tile. */
  const pickSecretFeature = (feature: SecretTileFeature) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    updateTile(selectedIndex, {
      faceDown: true,
      tileDefId: undefined,
      secretFeature: feature,
      token:
        selected.token && faceDownTokenKinds(selected.group).includes(selected.token.kind)
          ? { kind: selected.token.kind }
          : undefined
    });
  };

  /**
   * Click a tile card. Face-up stays face-up with that exact tile. From Random
   * or Secret, pinning an exact id is an advanced exact secret (clears feature).
   */
  const pickTileForSelected = (tileDefId: string) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    if (usedPinnedIds.has(tileDefId) && selected.tileDefId !== tileDefId) {
      return;
    }
    const nextFaceDown = selectedMode !== "faceup";
    updateTile(selectedIndex, {
      faceDown: nextFaceDown,
      tileDefId,
      secretFeature: undefined,
      token: nextFaceDown
        ? selected.token && faceDownTokenKinds(selected.group).includes(selected.token.kind)
          ? { kind: selected.token.kind }
          : undefined
        : retargetTokenForDef(selected.token, tileDefId)
    });
  };
  // Token kinds this tile may carry: a face-down tile hides its group's kind
  // (sea → Whirlpool, land groups → Monolith); a revealed tile offers whichever
  // kinds still have a legal printed field on it (an island hex on a sea tile
  // can host a Monolith, the water hexes a Whirlpool).
  const selectedTokenKinds: MapTokenKind[] =
    !selected || selected.group === "starting"
      ? []
      : selected.faceDown
        ? faceDownTokenKinds(selected.group)
        : selectedTileDef
          ? (["monolith", "whirlpool"] as MapTokenKind[]).filter(
              (kind) => legalTokenSlotsForTileDef(selectedTileDef, kind).length > 0
            )
          : [];

  const rotateSelected = (steps: number) => {
    // Every tile rotates freely in the designer, whether face up or face down.
    // For a STARTING tile the stored rotation only takes effect in game when its
    // orientation is Fixed (locked, below); otherwise the faction art is placed at
    // the classic rotation 0 and the seat rotates it in the opening ceremony.
    if (selectedIndex === null || !selected) {
      return;
    }
    updateTile(selectedIndex, { rotation: ((((selected.rotation ?? 0) + steps) % 6) + 6) % 6 });
  };

  /**
   * Toggle a STARTING tile's Fixed orientation: when on, its home tile is placed
   * at the chosen rotation in game and the seat owes NO opening free-rotation.
   * Off restores the classic rotation-0 + opening-ceremony flow. Starting-only,
   * exactly like the engine honours `lockRotation` only on a starting plan.
   */
  const toggleLockRotation = () => {
    if (selectedIndex === null || !selected || selected.group !== "starting") {
      return;
    }
    updateTile(selectedIndex, { lockRotation: selected.lockRotation ? undefined : true });
  };

  const seatNumberOf = (index: number) => startingPlanIndexes.indexOf(index) + 1;

  // --- Designer Subterranean Gate links ------------------------------------
  // Every Surface tile (or seat) the selected cavern physically touches, so the
  // designer can toggle a link to any of them (and connect one cavern to several).
  const selectedCavernSurfaces =
    selected && selected.group === "subterranean"
      ? gatePlacements.filter(
          (tile) =>
            tile.group !== "subterranean" &&
            tileFootprintsTouch({ row: selected.row, col: selected.col }, { row: tile.row, col: tile.col })
        )
      : [];
  const isGateLinked = (surface: { row: number; col: number }): boolean =>
    Boolean(selected?.gateLinks?.some((link) => link.surface.row === surface.row && link.surface.col === surface.col));

  /**
   * Toggle a designer-placed yellow border on the SELECTED tile at an ABSOLUTE
   * board direction (0-5). The border seals that outer arc in game — identical
   * to a printed one — regardless of any face-down draw or later rotation.
   * Legal on every tile group, so no group gate here. Delegates to the shared
   * `toggleBorderAt` write path so the panel rose and the on-board paint zones
   * always produce the identical plan shape.
   */
  const toggleBorder = (direction: number) => {
    if (selectedIndex === null || !selected) {
      return;
    }
    toggleBorderAt(selectedIndex, direction);
  };

  /** Toggle a designer gate link between the selected cavern and a touching Surface tile. */
  const toggleGateLink = (surface: { row: number; col: number }) => {
    if (selectedIndex === null || !selected || selected.group !== "subterranean") {
      return;
    }
    const links = selected.gateLinks ?? [];
    const nextLinks = isGateLinked(surface)
      ? links.filter((link) => !(link.surface.row === surface.row && link.surface.col === surface.col))
      : [...links, { surface: { row: surface.row, col: surface.col } }];
    updateTile(selectedIndex, { gateLinks: nextLinks.length > 0 ? nextLinks : undefined });
  };

  /**
   * Slide a designed gate to the next legal boundary hex pair (the non-drag
   * affordance): pins the link to the pair after its current one — pinned pair,
   * else the automatic nearest default — so each click walks the gate along the
   * shared edge.
   */
  const cycleGateLinkPosition = (surface: { row: number; col: number }) => {
    if (selectedIndex === null || !selected || selected.group !== "subterranean") {
      return;
    }
    const cavernCenter = { row: selected.row, col: selected.col };
    const pairs = legalGateHexPairs(surface, cavernCenter);
    if (pairs.length === 0) {
      return;
    }
    const link = selected.gateLinks?.find(
      (candidate) => candidate.surface.row === surface.row && candidate.surface.col === surface.col
    );
    const pinnedIndex =
      link?.gateHex && link?.entranceHex
        ? pairs.findIndex((pair) => hexSpaceId(pair.gateHex) === link.gateHex && hexSpaceId(pair.entranceHex) === link.entranceHex)
        : -1;
    // Unpinned: start from the nearest default the preview shows, so the first
    // click still visibly MOVES the gate.
    let currentIndex = pinnedIndex;
    if (currentIndex < 0) {
      const [defaultGate] = planSubterraneanGates(
        [
          { row: surface.row, col: surface.col, group: "starting" },
          { row: cavernCenter.row, col: cavernCenter.col, group: "subterranean" }
        ],
        []
      );
      currentIndex = defaultGate
        ? Math.max(
            0,
            pairs.findIndex(
              (pair) =>
                hexSpaceId(pair.gateHex) === hexSpaceId(defaultGate.gateHex) &&
                hexSpaceId(pair.entranceHex) === hexSpaceId(defaultGate.entranceHex)
            )
          )
        : 0;
    }
    const nextPair = pairs[(currentIndex + 1) % pairs.length];
    pinGateLink(cavernCenter, surface, nextPair);
  };

  /** Select the cavern that owns a designed gate and open its options popover. */
  const selectCavernForGate = (cavernCenter: HexCoord, clientX: number, clientY: number) => {
    const index = customMap.findIndex(
      (plan) => plan.group === "subterranean" && plan.row === cavernCenter.row && plan.col === cavernCenter.col
    );
    if (index >= 0) {
      // Opening the docked tile panel closes any open object panel (never both).
      closeObjectPopover();
      setSelectedIndex(index);
      setPopoverAt({ x: clientX, y: clientY });
    }
  };

  /** Start dragging a designed gate token along its two tiles' shared boundary. */
  const beginGateDrag = (gate: PlannedSubterraneanGate) => (event: React.PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    // Take the press for the gate so neither a board pan nor a tile press starts.
    event.stopPropagation();
    // Keep mid-drag moves flowing even when the pointer leaves the token; jsdom
    // has no pointer-capture implementation, hence the optional call.
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    const pairs = legalGateHexPairs(gate.surfaceCenter, gate.cavernCenter);
    if (pairs.length === 0) {
      return;
    }
    setGateDrag({
      cavernCenter: gate.cavernCenter,
      surfaceCenter: gate.surfaceCenter,
      pairs,
      hover: null,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    });
  };

  // --- SVG layers ----------------------------------------------------------
  const artLayer: React.ReactNode[] = [];
  const cellLayer: React.ReactNode[] = [];
  const outlineLayer: React.ReactNode[] = [];
  const labelLayer: React.ReactNode[] = [];
  // Subterranean Gate tokens + the "no way in" warnings, drawn above the tiles.
  const gateLayer: React.ReactNode[] = [];
  // Designer-placed yellow borders, drawn above the tiles so the designer sees
  // exactly the impassable edges players will see.
  const borderLayer: React.ReactNode[] = [];

  const renderFlowerCells = (
    center: HexCoord,
    className: string,
    key: string,
    handlers?: {
      onPointerDown?: (event: React.PointerEvent) => void;
    },
    title?: string
  ) => {
    for (const [slot, cell] of tileFootprint(center, 0).entries()) {
      const { x, y } = hexToPixel(cell, size);
      cellLayer.push(
        <polygon
          className={className}
          key={`${key}-${slot}`}
          onPointerDown={handlers?.onPointerDown}
          points={hexCorners(x, y, size - 0.8)}
        >
          {title ? <title>{title}</title> : null}
        </polygon>
      );
    }
  };

  // Scenario default seats — only while the designer has not placed its own
  // Town tiles (then the designed towns are the seats).
  if (!hasDesignerStarts) {
    for (const [index, start] of starts.entries()) {
      const centerPixel = hexToPixel(start, size);
      const width = 3 * hexWidth;
      const height = 5 * size;
      artLayer.push(
        <image
          height={height}
          href={assetUrl(TILE_BACK_IMAGES.starting)}
          key={`start-art-${index}`}
          opacity={0.85}
          preserveAspectRatio="none"
          width={width}
          x={centerPixel.x - width / 2}
          y={centerPixel.y - height / 2}
        />
      );
      renderFlowerCells(start, "designerHexFixed", `start-${index}`, undefined, `Default seat ${index + 1} (used unless you drag a Town tile in)`);
      labelLayer.push(
        <text className="designerStartLabel" key={`start-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 5}>
          S{index + 1}
        </text>
      );
      outlineLayer.push(
        <path className="designerFlowerOutline fixed" d={flowerOutline(start, size)} key={`start-outline-${index}`} />
      );
    }
  }

  // Designed tiles (Town seats + supply tiles).
  for (const [index, plan] of customMap.entries()) {
    const center = { row: plan.row, col: plan.col };
    const centerPixel = hexToPixel(center, size);
    const isSelected = selectedIndex === index;
    const isDragging = drag?.kind === "move" && drag.index === index;
    const isStart = plan.group === "starting";
    // Designer-only secret markers. All face-down slots use the printed BACK
    // (band-correct for sea / underground Ⅵ–Ⅶ) — the numeral is ON the art,
    // so we never overlay a second "Ⅱ–Ⅲ" text box. Secrets keep a 🔒 badge.
    const secretPin = plan.faceDown && Boolean(plan.tileDefId || plan.secretFeature);
    const featureSecret = plan.faceDown && Boolean(plan.secretFeature) && !plan.tileDefId;
    const art = isStart
      ? TILE_BACK_IMAGES.starting
      : plan.faceDown
        ? planBackArt(plan)
        : plan.tileDefId
          ? allTileDefinitions[plan.tileDefId]?.assets?.tileImage
          : undefined;
    const width = 3 * hexWidth;
    const height = 5 * size;

    if (art) {
      artLayer.push(
        <image
          height={height}
          href={assetUrl(art)}
          key={`plan-art-${index}`}
          opacity={isDragging ? 0.3 : secretPin ? 0.88 : 1}
          preserveAspectRatio="none"
          // Face-down backs are orientation-independent (printed numeral sits
          // upright on the physical back); only face-up scans rotate.
          transform={
            !isStart && !plan.faceDown
              ? `rotate(${(plan.rotation ?? 0) * 60} ${centerPixel.x} ${centerPixel.y})`
              : undefined
          }
          width={width}
          x={centerPixel.x - width / 2}
          y={centerPixel.y - height / 2}
        />
      );
    }

    const onPointerDown = (event: React.PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      // Take this press for the tile so the background pan does not start.
      event.stopPropagation();
      // Still track the pointer so a second finger can pinch-zoom the board.
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size >= 2) {
        suppressClickRef.current = true;
        pressRef.current = null;
        panRef.current = null;
        if (pointersRef.current.size === 2) {
          const [[aId, a], [bId, b]] = [...pointersRef.current.entries()];
          pinchRef.current = { aId, bId, start: { camera, a: { ...a }, b: { ...b } } };
        }
        return;
      }
      suppressClickRef.current = false;
      pressRef.current = {
        pointerId: event.pointerId,
        index,
        group: plan.group,
        seaBand: plan.seaBand,
        subBand: plan.subBand,
        startX: event.clientX,
        startY: event.clientY,
        promoted: false
      };
    };

    renderFlowerCells(
      center,
      `designerHexPlan ${isStart ? "starting" : plan.faceDown ? "down" : "up"} ${secretPin ? "secret" : ""} ${featureSecret ? "featureSecret" : ""} ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`,
      `plan-${index}`,
      { onPointerDown },
      isStart
        ? `Town — seat ${seatNumberOf(index)}. Drag to move, click for options.`
        : plan.faceDown && plan.secretFeature
          ? `Secret ${secretFeatureFullLabel(plan.secretFeature)} (${planGroupLabel(plan)}) — at game start a random tile with that landmark is drawn face-down. Drag to move, click for options.`
          : plan.faceDown && plan.tileDefId
            ? `Face-down exact secret ${plan.tileDefId} (${planGroupLabel(plan)}) — players see only the tile back until discovery. Drag to move, click for options.`
            : plan.faceDown
              ? `Face-down ${planGroupLabel(plan)} tile (random). Drag to move, click to set a secret landmark / reveal / rotate / remove.`
              : `${plan.tileDefId ?? "?"} rotated ${(plan.rotation ?? 0) * 60}°. Drag to move, click for options.`
    );

    outlineLayer.push(
      <path
        className={`designerFlowerOutline ${isSelected ? "selected" : ""} ${secretPin ? "secret" : ""}`}
        d={flowerOutline(center, size)}
        key={`plan-outline-${index}`}
        style={{ stroke: isSelected ? "#ffd766" : secretPin ? "#9ad0ff" : GROUP_COLORS[plan.group] }}
      />
    );

    // Designer-placed yellow borders — drawn at their ABSOLUTE board direction
    // (independent of rotation), so the designer sees exactly the impassable
    // edge players will get. `tileFootprint(center, 0)[d+1]` is the ring hex
    // facing absolute direction d; each border seals its three outward edges.
    if (plan.extraBorders && plan.extraBorders.length > 0) {
      const flower = tileFootprint(center, 0);
      for (const absolute of plan.extraBorders) {
        if (!Number.isInteger(absolute) || absolute < 0 || absolute > 5) {
          continue;
        }
        const { x, y } = hexToPixel(flower[absolute + 1], size);
        for (const edge of [absolute - 1, absolute, absolute + 1]) {
          const direction = ((edge % 6) + 6) % 6;
          borderLayer.push(
            <line
              className="designerBorderLine"
              key={`plan-border-${index}-${absolute}-${direction}`}
              {...hexEdgePoints(x, y, size - 0.8, direction)}
            />
          );
        }
      }
    }

    // Center Ⅶ-field designation badge — the forced objective is public info.
    if (plan.group === "center" && plan.viiField) {
      const viiBadge =
        plan.viiField === "grail" ? "🏆 Grail" : plan.viiField === "dragon_utopia" ? "🐉 Utopia" : "🏰 Town";
      const viiFull =
        plan.viiField === "dragon_utopia"
          ? "Dragon Utopia"
          : plan.viiField === "grail"
            ? "Grail dig site"
            : "Random Town";
      labelLayer.push(
        <text
          className="designerViiBadge"
          key={`plan-vii-${index}`}
          textAnchor="middle"
          x={centerPixel.x}
          y={centerPixel.y - size * 0.7}
        >
          <title>{`Ⅶ field forced to ${viiFull}`}</title>
          {viiBadge}
        </text>
      );
    }

    if (isStart) {
      labelLayer.push(
        <text className="designerStartLabel" key={`plan-seat-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 5}>
          S{seatNumberOf(index)}
        </text>
      );
      // Fixed-orientation seats wear a small lock badge naming the forced angle —
      // the faction art is unknown at design time, so the degrees are the signal.
      if (plan.lockRotation) {
        labelLayer.push(
          <text
            className="designerStartLockBadge"
            key={`plan-lock-${index}`}
            textAnchor="middle"
            x={centerPixel.x}
            y={centerPixel.y - size * 0.7}
          >
            <title>{`Fixed orientation ${(plan.rotation ?? 0) * 60}° — no opening rotation`}</title>
            {`🔒 ${(plan.rotation ?? 0) * 60}°`}
          </text>
        );
      }
    } else if (plan.faceDown && secretPin) {
      // Only secret badges stay as text — random face-down slots rely on the
      // printed back graphic alone (no redundant Ⅱ–Ⅲ / Sea / Underground box).
      labelLayer.push(
        <text className="designerTileLabel" key={`plan-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 4}>
          {secretBoardLabel(plan)}
        </text>
      );
      if (featureSecret && plan.secretFeature) {
        const featureMeta = SECRET_TILE_FEATURES.find((entry) => entry.id === plan.secretFeature);
        if (featureMeta) {
          const iconSize = size * 0.95;
          labelLayer.push(
            <image
              className="designerTileFeatureIcon"
              height={iconSize}
              href={assetUrl(featureMeta.iconSrc)}
              key={`plan-feature-icon-${index}`}
              preserveAspectRatio="xMidYMid meet"
              width={iconSize}
              x={centerPixel.x - iconSize / 2}
              y={centerPixel.y - iconSize - 4}
            >
              <title>{featureMeta.label}</title>
            </image>
          );
        }
      }
    } else if (!plan.faceDown && !art) {
      // Face-up with no art yet (shouldn't happen after pick) — show id fallback.
      labelLayer.push(
        <text className="designerTileLabel" key={`plan-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 4}>
          {plan.tileDefId ?? "?"}
        </text>
      );
    }
  }

  // Subterranean Gate tokens: one half on the Surface tile (the gate) and one on
  // the cavern (the entrance), exactly where the engine will carve them, joined
  // by a link line — so the designer can SEE the only Surface↔Underground
  // crossing each cavern gets. (The gate hex is hidden until the Surface tile is
  // revealed in play, but the designer shows the whole connection up front.)
  for (const [index, gate] of plannedGates.entries()) {
    // While THIS designed gate is being dragged, draw its token pair at the
    // snapped hover position instead of the committed one (live preview; the
    // plan itself only changes on release).
    const draggingThis = Boolean(
      gateDrag?.moved &&
        gateDrag.hover &&
        gateDrag.cavernCenter.row === gate.cavernCenter.row &&
        gateDrag.cavernCenter.col === gate.cavernCenter.col &&
        gateDrag.surfaceCenter.row === gate.surfaceCenter.row &&
        gateDrag.surfaceCenter.col === gate.surfaceCenter.col
    );
    const drawGateHex = draggingThis ? gateDrag!.hover!.gateHex : gate.gateHex;
    const drawEntranceHex = draggingThis ? gateDrag!.hover!.entranceHex : gate.entranceHex;
    const gatePixel = hexToPixel(drawGateHex, size);
    const entrancePixel = hexToPixel(drawEntranceHex, size);
    const tokenWidth = hexWidth;
    const tokenHeight = 2 * size;
    // A DESIGNER-chosen gate is drawn distinct from an automatic one — a brighter
    // link + a pin glyph — draggable along the shared edge, and clicking either
    // half selects the cavern that owns it (connect controls one click away).
    const designedClass = `${gate.designed ? " designed" : ""}${draggingThis ? " dragging" : ""}`;
    const gateTitle = gate.designed
      ? "Designer Subterranean Gate — drag it along the shared edge, or click to edit its links."
      : "Automatic Subterranean Gate — heroes descend here from the Surface tile.";
    const onGatePointerDown = gate.designed ? beginGateDrag(gate) : undefined;
    const onGateClick = gate.designed
      ? (event: React.MouseEvent) => {
          event.stopPropagation();
          // A finished slide fires a trailing click — that one never opens the popover.
          if (gateClickSuppressRef.current) {
            gateClickSuppressRef.current = false;
            return;
          }
          selectCavernForGate(gate.cavernCenter, event.clientX, event.clientY);
        }
      : undefined;
    gateLayer.push(
      <line
        className={`designerGateLink${designedClass}`}
        key={`gate-link-${index}`}
        x1={gatePixel.x}
        x2={entrancePixel.x}
        y1={gatePixel.y}
        y2={entrancePixel.y}
      />
    );
    gateLayer.push(
      <image
        className={`designerGateToken${designedClass}`}
        height={tokenHeight}
        href={assetUrl(subterraneanGateTokenImage("surface"))}
        key={`gate-surface-${index}`}
        onClick={onGateClick}
        onPointerDown={onGatePointerDown}
        preserveAspectRatio="none"
        style={gate.designed ? { cursor: "grab" } : undefined}
        width={tokenWidth}
        x={gatePixel.x - tokenWidth / 2}
        y={gatePixel.y - size}
      >
        <title>{gateTitle}</title>
      </image>
    );
    gateLayer.push(
      <image
        className={`designerGateToken${designedClass}`}
        height={tokenHeight}
        href={assetUrl(subterraneanGateTokenImage("subterranean"))}
        key={`gate-entrance-${index}`}
        onClick={onGateClick}
        onPointerDown={onGatePointerDown}
        preserveAspectRatio="none"
        style={gate.designed ? { cursor: "grab" } : undefined}
        width={tokenWidth}
        x={entrancePixel.x - tokenWidth / 2}
        y={entrancePixel.y - size}
      >
        <title>Subterranean Gate entrance — the cavern side of the crossing.</title>
      </image>
    );
    if (gate.designed) {
      // A small lock pin at the link midpoint marks the designer-committed gate.
      gateLayer.push(
        <circle
          className="designerGatePin"
          cx={(gatePixel.x + entrancePixel.x) / 2}
          cy={(gatePixel.y + entrancePixel.y) / 2}
          key={`gate-pin-${index}`}
          r={Math.max(2, size * 0.3)}
        >
          <title>Designer-locked gate</title>
        </circle>
      );
    }
  }

  // Monolith/Whirlpool tokens: a face-up tile shows the token on the exact hex
  // it overwrites; a face-down tile shows it as a centred badge (the discovering
  // player will pick the hex in play). Whirlpool art carries the plan-order
  // number (+1/0/-1) the engine will assign at setup.
  for (const [index, plan] of customMap.entries()) {
    const token = plan.token;
    if (!token) {
      continue;
    }
    const center = { row: plan.row, col: plan.col };
    const fixedSlot = !plan.faceDown && plan.tileDefId && token.slot !== undefined;
    const cell = fixedSlot ? tileFootprint(center, plan.rotation ?? 0)[token.slot as number] : center;
    const pixel = hexToPixel(cell ?? center, size);
    const tokenWidth = hexWidth * (fixedSlot ? 1 : 0.9);
    const tokenHeight = 2 * size * (fixedSlot ? 1 : 0.9);
    gateLayer.push(
      <image
        height={tokenHeight}
        href={assetUrl(mapTokenImage(token.kind, whirlpoolNumberByIndex.get(index)))}
        key={`map-token-${index}`}
        opacity={plan.faceDown ? 0.9 : 1}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: "none" }}
        width={tokenWidth}
        x={pixel.x - tokenWidth / 2}
        y={pixel.y - tokenHeight / 2}
      >
        <title>
          {plan.faceDown
            ? `${mapTokenLabel(token.kind)} token — placed on a field of the discoverer's choosing when this tile is revealed.`
            : `${mapTokenLabel(token.kind)} token — overwrites this field.`}
        </title>
      </image>
    );
  }

  // A cavern with no gate at all can never be entered: ring it in red and stamp a
  // warning so the designer knows to nudge it against a Surface (or chained
  // cavern) tile until a gate appears.
  for (const plan of customMap) {
    if (plan.group !== "subterranean" || !unreachableKeys.has(`${plan.row}:${plan.col}`)) {
      continue;
    }
    const center = { row: plan.row, col: plan.col };
    const centerPixel = hexToPixel(center, size);
    gateLayer.push(
      <path
        className="designerFlowerOutline cavernUnreachable"
        d={flowerOutline(center, size)}
        key={`cavern-warn-${plan.row}-${plan.col}`}
      />
    );
    gateLayer.push(
      <text
        className="designerCavernWarning"
        key={`cavern-warn-label-${plan.row}-${plan.col}`}
        textAnchor="middle"
        x={centerPixel.x}
        y={centerPixel.y - size * 1.1}
      >
        <title>This cavern has no Subterranean Gate — heroes cannot reach it. Place it touching a Surface tile (or a cavern that has a gate).</title>
        ⚠ no gate — unreachable
      </text>
    );
  }

  // While dragging: faint guides at the gapless interlock slots, plus a solid
  // preview at the hex the tile will actually land on — anywhere, hole or not.
  if (drag) {
    const hoverKey = hoverSlot ? `${hoverSlot.row}:${hoverSlot.col}` : null;
    for (const candidate of activeCandidates) {
      const key = `${candidate.row}:${candidate.col}`;
      if (key === hoverKey) {
        continue; // the live preview already covers this slot
      }
      renderFlowerCells(candidate, "designerHexDrop", `drop-${key}`);
      outlineLayer.push(
        <path className="designerFlowerOutline drop" d={flowerOutline(candidate, size)} key={`drop-outline-${key}`} />
      );
    }
    if (hoverSlot) {
      renderFlowerCells(hoverSlot, "designerHexDrop hover", "drop-hover");
      outlineLayer.push(
        <path className="designerFlowerOutline drop hover" d={flowerOutline(hoverSlot, size)} key="drop-outline-hover" />
      );
    }
  }

  const beginPaletteDrag = (group: DesignGroup, seaBand?: SeaBand, subBand?: SubBand) => (event: React.PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    closePopover();
    setDrag({ kind: "palette", group, seaBand, subBand, clientX: event.clientX, clientY: event.clientY });
    setHoverSlot(slotAt(event.clientX, event.clientY));
  };

  // --- Designer objects overlay: candidate placement cells + placed tokens ----
  const selectedObject = selectedObjectIndex !== null ? objects[selectedObjectIndex] : undefined;
  const objectLayer: React.ReactNode[] = [];
  const armedLabel = armedObject
    ? armedObject.kind === "gate"
      ? `${gatePairColor(armedObject.pair ?? 1)} gate`
      : mapTokenLabel(armedObject.kind as MapTokenKind)
    : "";
  if (armedObject) {
    for (const candidate of tileSlotCandidates) {
      const { x, y } = hexToPixel(candidate.hex, size);
      objectLayer.push(
        <polygon
          className="designerObjectSlot tileSlot"
          key={`obj-slot-${candidate.row}-${candidate.col}-${candidate.slot}`}
          onClick={() =>
            placeArmedObject({ type: "tile-slot", row: candidate.row, col: candidate.col, slot: candidate.slot })
          }
          points={hexCorners(x, y, size - 1.6)}
        >
          <title>Place the {armedLabel} on this tile hex</title>
        </polygon>
      );
    }
    if (armedObject.kind !== "whirlpool") {
      for (const candidate of standaloneCandidates) {
        const { x, y } = hexToPixel(candidate, size);
        objectLayer.push(
          <polygon
            className="designerObjectSlot standalone"
            key={`obj-standalone-${candidate.row}-${candidate.col}`}
            onClick={() => placeArmedObject({ type: "standalone", row: candidate.row, col: candidate.col })}
            points={hexCorners(x, y, size - 1.6)}
          >
            <title>Place a standalone {armedLabel} hex here</title>
          </polygon>
        );
      }
    }
  }
  for (const [index, object] of objects.entries()) {
    const coord = parseHexSpaceId(objectHexOf(object));
    if (!coord) {
      continue;
    }
    const { x, y } = hexToPixel(coord, size);
    const isGate = object.kind === "gate";
    const color = isGate && object.pair ? GATE_PAIR_CSS[object.pair] : "#c9a24b";
    objectLayer.push(
      <g
        className={`designerObjectToken${isGate ? " gate" : ""}${object.placement.type === "standalone" ? " standalone" : ""}${
          selectedObjectIndex === index ? " selected" : ""
        }`}
        data-object-index={index}
        key={`obj-token-${index}`}
        onClick={(event) => {
          const rect = wrapRef.current?.getBoundingClientRect();
          setSelectedIndex(null);
          setSelectedObjectIndex(index);
          setObjectPopoverAt(
            rect
              ? { x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 8)), y: event.clientY - rect.top }
              : { x: 8, y: 0 }
          );
        }}
      >
        <circle className="designerObjectRing" cx={x} cy={y} r={size * 0.62} stroke={color} />
        {isGate ? (
          <text className="designerObjectPair" fill={color} textAnchor="middle" x={x} y={y + size * 0.28}>
            {object.pair}
          </text>
        ) : (
          <image
            height={size}
            href={assetUrl(mapTokenImage(object.kind as MapTokenKind, object.kind === "whirlpool" ? 0 : undefined))}
            preserveAspectRatio="xMidYMid meet"
            style={{ pointerEvents: "none" }}
            width={size}
            x={x - size * 0.5}
            y={y - size * 0.5}
          />
        )}
        {object.guard ? (
          <text className="designerObjectGuard" textAnchor="middle" x={x} y={y - size * 0.6}>
            {ROMAN_NUMERALS[object.guard]}
          </text>
        ) : null}
      </g>
    );
  }

  // --- Designer yellow-border paint zones -------------------------------------
  // While the paint tool is armed (and no tile is being dragged), every placed
  // plan shows six clickable ring hexes — one per ABSOLUTE board direction 0-5.
  // Clicking one seals/unseals that tile's yellow border on that edge through
  // the SAME `toggleBorderAt` path as the panel rose. `tileFootprint(center,0)
  // [d+1]` is exactly the ring hex whose three outward edges the border draws
  // (see the border DRAWING loop above), so the click target sits on the sealed
  // edge. Drawn on top of the objects so the zones stay clickable while armed.
  const borderPaintLayer: React.ReactNode[] = [];
  if (borderPaint && !drag) {
    for (const [index, plan] of customMap.entries()) {
      const flower = tileFootprint({ row: plan.row, col: plan.col }, 0);
      const tileName =
        plan.group === "starting" ? `Town seat ${seatNumberOf(index)}` : `${planGroupLabel(plan)} tile`;
      // `.entries()` gives a fresh per-iteration direction const (no mutated
      // loop counter captured in the JSX closures — the React Compiler forbids
      // that). Direction d's ring hex is flower[d+1], per the border DRAW loop.
      for (const [direction, label] of BORDER_DIRECTION_LABELS.entries()) {
        const { x, y } = hexToPixel(flower[direction + 1], size);
        const on = Boolean(plan.extraBorders?.includes(direction));
        borderPaintLayer.push(
          <polygon
            className={`designerBorderPaintZone${on ? " active" : ""}`}
            data-border-index={index}
            data-direction={direction}
            key={`border-paint-${index}-${direction}`}
            // Take the press so the tile press/drag and board pan never start.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => toggleBorderAt(index, direction)}
            points={hexCorners(x, y, size - 1.6)}
          >
            <title>
              {on
                ? `Remove the ${label} edge's yellow border — ${tileName}`
                : `Seal the ${label} edge (yellow border) — ${tileName}`}
            </title>
          </polygon>
        );
      }
    }
  }

  return (
    <div className="mapDesigner" aria-label="Map designer">
      <div className="designerPalette" aria-label="Tile palette">
        <small className="palettePrompt">Drag a tile onto the map</small>
        {PALETTE.map((entry) => (
          <button
            className={`paletteTile group-${entry.group}`}
            key={entry.key}
            onPointerDown={beginPaletteDrag(entry.group, entry.seaBand, entry.subBand)}
            style={{ borderColor: GROUP_COLORS[entry.group] }}
            title={entry.hint}
            type="button"
          >
            <span
              aria-hidden="true"
              className="paletteThumb"
              style={{
                backgroundImage: `url(${assetUrl(
                  planBackArt({ group: entry.group, seaBand: entry.seaBand, subBand: entry.subBand })
                )})`
              }}
            />
            <span className="paletteLabel">{entry.label}</span>
          </button>
        ))}
      </div>

      <div className="designerObjectPalette" aria-label="Objects palette">
        <small className="palettePrompt">
          {borderPaint
            ? "Painting yellow borders — click a tile's edge hex to seal or unseal that edge"
            : armedObject
              ? `Placing a ${armedLabel} — click a glowing cell (tile hex or off-tile), or the button again to stop`
              : "Click an object, then click a board cell to place it"}
        </small>
        <div className="designerObjectPaletteRow">
          {GATE_PAIRS.map((pair) => {
            const placed = gatePairPlaced[pair] ?? 0;
            const armed = armedObject?.kind === "gate" && armedObject.pair === pair;
            return (
              <button
                aria-label={`${gatePairColor(pair)} gate pair`}
                aria-pressed={armed}
                className={`designerObjectButton gate${armed ? " armed" : ""}`}
                data-gate-pair={pair}
                key={`gate-${pair}`}
                onClick={() => armObject("gate", pair)}
                style={{ borderColor: GATE_PAIR_CSS[pair] }}
                title={`${gatePairColor(pair)} Gate pair — two-way teleport (${placed}/2 placed)`}
                type="button"
              >
                <span className="designerObjectSwatch" style={{ background: GATE_PAIR_CSS[pair] }}>
                  {pair}
                </span>
                <span className="designerObjectCount">{placed}/2</span>
              </button>
            );
          })}
          <button
            aria-pressed={armedObject?.kind === "monolith"}
            className={`designerObjectButton${armedObject?.kind === "monolith" ? " armed" : ""}`}
            onClick={() => armObject("monolith")}
            title="Monolith token — two-way teleport network (needs at least 2)"
            type="button"
          >
            ⛩ Monolith
          </button>
          <button
            aria-pressed={armedObject?.kind === "whirlpool"}
            className={`designerObjectButton${armedObject?.kind === "whirlpool" ? " armed" : ""}`}
            onClick={() => armObject("whirlpool")}
            title="Whirlpool token — sea-tile slots only (needs at least 2)"
            type="button"
          >
            🌀 Whirlpool
          </button>
          <button
            aria-pressed={borderPaint}
            className={`designerObjectButton borderPaint${borderPaint ? " armed" : ""}`}
            onClick={toggleBorderPaint}
            title="Yellow border — click a tile's edge hex on the board to seal (or unseal) that impassable edge, exactly like the tile panel's edge chips"
            type="button"
          >
            🖌 Yellow border
          </button>
        </div>
      </div>

      <div className="designerBoardWrap" ref={wrapRef}>
        <svg
          className={`designerSvg ${drag ? "dragging" : ""}`}
          ref={svgRef}
          onPointerCancel={(event) => {
            pointersRef.current.delete(event.pointerId);
            if (pinchRef.current && (pinchRef.current.aId === event.pointerId || pinchRef.current.bId === event.pointerId)) {
              pinchRef.current = null;
            }
            if (panRef.current?.pointerId === event.pointerId) {
              panRef.current = null;
            }
            if (pressRef.current?.pointerId === event.pointerId) {
              pressRef.current = null;
            }
          }}
          onPointerDown={(event) => {
            // Background press → pan. Tile presses stopPropagation above.
            if (event.button !== 0 || drag) {
              return;
            }
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointersRef.current.size >= 2) {
              // Multi-touch: cancel pan / tile press and hand off to pinch.
              suppressClickRef.current = true;
              pressRef.current = null;
              panRef.current = null;
              if (pointersRef.current.size === 2) {
                const [[aId, a], [bId, b]] = [...pointersRef.current.entries()];
                pinchRef.current = { aId, bId, start: { camera, a: { ...a }, b: { ...b } } };
                try {
                  (event.currentTarget as Element).setPointerCapture(aId);
                  (event.currentTarget as Element).setPointerCapture(bId);
                } catch {
                  // jsdom / detached — gesture still works uncaptured.
                }
              }
              return;
            }
            if (popoverAt) {
              closePopover();
            }
            suppressClickRef.current = false;
            panRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: camera.x,
              originY: camera.y,
              moved: false
            };
          }}
          onPointerMove={(event) => {
            const tracked = pointersRef.current.get(event.pointerId);
            if (tracked) {
              tracked.x = event.clientX;
              tracked.y = event.clientY;
            }
            const pinch = pinchRef.current;
            if (pinch) {
              if (event.pointerId !== pinch.aId && event.pointerId !== pinch.bId) {
                return;
              }
              const a = pointersRef.current.get(pinch.aId);
              const b = pointersRef.current.get(pinch.bId);
              const svg = svgRef.current;
              if (!a || !b || !svg) {
                return;
              }
              const rect = svg.getBoundingClientRect();
              setCamera(
                pinchCamera(pinch.start, a, b, rect, {
                  minX,
                  minY,
                  width: maxX - minX,
                  height: maxY - minY
                })
              );
              return;
            }
            // Promote a tile press into a move-drag once it travels far enough.
            const press = pressRef.current;
            if (press && press.pointerId === event.pointerId && !press.promoted) {
              if (Math.abs(event.clientX - press.startX) + Math.abs(event.clientY - press.startY) > 6) {
                press.promoted = true;
                pressRef.current = null;
                closePopover();
                setDrag({ kind: "move", index: press.index, group: press.group, seaBand: press.seaBand, subBand: press.subBand, clientX: event.clientX, clientY: event.clientY });
                setHoverSlot(slotAt(event.clientX, event.clientY, press.index));
              }
              return;
            }
            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) {
              return;
            }
            const dx = event.clientX - pan.startX;
            const dy = event.clientY - pan.startY;
            if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 6) {
              pan.moved = true;
              suppressClickRef.current = true;
              (event.currentTarget as Element).setPointerCapture(event.pointerId);
            }
            if (pan.moved) {
              setCamera((current) => ({ ...current, x: pan.originX + dx, y: pan.originY + dy }));
            }
          }}
          onPointerUp={(event) => {
            pointersRef.current.delete(event.pointerId);
            if (pinchRef.current && (pinchRef.current.aId === event.pointerId || pinchRef.current.bId === event.pointerId)) {
              pinchRef.current = null;
              // Remaining finger can resume pan if still down.
              if (pointersRef.current.size === 1) {
                const [[id, pt]] = [...pointersRef.current.entries()];
                panRef.current = {
                  pointerId: id,
                  startX: pt.x,
                  startY: pt.y,
                  originX: camera.x,
                  originY: camera.y,
                  moved: false
                };
              }
              return;
            }
            // A tile press that never became a drag is a click → open options.
            const press = pressRef.current;
            if (press && press.pointerId === event.pointerId && !press.promoted) {
              pressRef.current = null;
              setSelectedIndex(press.index);
              setTilePickFilter("all");
              // Opening the docked tile panel closes any open object panel so the
              // two are never shown at once (mutual exclusivity).
              closeObjectPopover();
              // `popoverAt` is now just an OPEN flag — the panel docks top-right
              // via CSS, so the click coords no longer drive layout. Kept as an
              // object to avoid churning every open/close call site.
              setPopoverAt({ x: event.clientX, y: event.clientY });
              return;
            }
            if (panRef.current?.pointerId === event.pointerId) {
              panRef.current = null;
            }
          }}
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        >
          <g ref={gRef} transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`} style={{ transformOrigin: "center" }}>
            {artLayer}
            {cellLayer}
            {outlineLayer}
            {labelLayer}
            {gateLayer}
            {borderLayer}
            {objectLayer}
            {borderPaintLayer}
          </g>
        </svg>

        <div className="mapToolbar designerToolbarFloat" aria-label="Designer view controls">
          <button onClick={() => zoomBy(1.2)} title="Zoom in" type="button">
            <DesignerGlyph className="designerToolIcon" src={DESIGNER_UI_ICONS.zoomIn} />
          </button>
          <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out" type="button">
            <DesignerGlyph className="designerToolIcon" src={DESIGNER_UI_ICONS.zoomOut} />
          </button>
          <button
            aria-pressed={wheelZoomEnabled}
            className={wheelZoomEnabled ? "selected" : ""}
            onClick={() => setWheelZoomEnabled((value) => !value)}
            title={
              wheelZoomEnabled
                ? "Mouse-wheel zoom is ON — scroll over the board to zoom. Click to lock it (wheel scrolls the page)."
                : "Mouse-wheel zoom is locked. Click to unlock and zoom with the scroll wheel."
            }
            type="button"
          >
            <DesignerGlyph
              className="designerToolIcon"
              src={wheelZoomEnabled ? DESIGNER_UI_ICONS.wheelUnlock : DESIGNER_UI_ICONS.wheelLock}
            />
          </button>
          <button onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} title="Reset the view" type="button">
            <DesignerGlyph className="designerToolIcon" src={DESIGNER_UI_ICONS.zoomReset} />
          </button>
          <span className="designerZoomReadout" title="Current zoom">
            {Math.round(camera.scale * 100)}%
          </span>
        </div>

        {/* Per-tile options panel — docked top-right of the board (always fully
            visible + internally scrollable), so no content is clipped by the
            wrap's overflow no matter where the tile sits. */}
        {selected && popoverAt ? (
          <div
            className={`designerPopover${selected.group !== "starting" && PICKABLE_GROUPS.has(selected.group) ? " wide" : ""}`}
          >
            <header>
              <strong>
                {selected.group === "starting"
                  ? `Town — seat ${seatNumberOf(selectedIndex as number)}`
                  : `${planGroupLabel(selected)} tile`}
              </strong>
              <button
                aria-label="Close tile options"
                className="popoverClose"
                onClick={closePopover}
                title="Close"
                type="button"
              >
                ✕
              </button>
            </header>

            {selected.group === "starting" ? (
              <>
                <small className="popoverHint">A player&apos;s starting town. Drag it to move; its tile art comes from each player&apos;s faction.</small>
                {/* Rotation + Fix-orientation: the faction art is unknown at design
                    time, so the preview shows the orientation as a badge/degrees. */}
                <div className="popoverActions">
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(-1)}
                    title="Rotate 60° counterclockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph flipH" src={DESIGNER_UI_ICONS.rotate} />
                    <span>−60°</span>
                  </button>
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(1)}
                    title="Rotate 60° clockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph" src={DESIGNER_UI_ICONS.rotate} />
                    <span>{(selected.rotation ?? 0) * 60}°</span>
                  </button>
                </div>
                <button
                  aria-pressed={Boolean(selected.lockRotation)}
                  className={`popoverLockToggle${selected.lockRotation ? " active" : ""}`}
                  onClick={toggleLockRotation}
                  type="button"
                >
                  <Lock size={13} />
                  Fix orientation (no opening rotation)
                </button>
                <small className="popoverHint">
                  {selected.lockRotation
                    ? `Locked at ${(selected.rotation ?? 0) * 60}° — this seat's home tile keeps this orientation and skips the opening free-rotation.`
                    : "Unlocked: the tile starts at 0° and this seat rotates it once at the start of their first turn (opening ceremony)."}
                </small>
              </>
            ) : (
              <>
                {/* Step 1 — click a mode */}
                <div className="popoverSectionLabel">What is on this slot?</div>
                <div className="popoverModeRow" role="group" aria-label="Tile slot mode">
                  <button
                    aria-pressed={selectedMode === "random"}
                    className={`popoverModeCard${selectedMode === "random" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("random")}
                    title="Draw a random tile from this pool when the game starts. Players see a face-down back."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeRandom} />
                    <span className="popoverModeTitle">Random</span>
                    <span className="popoverModeSub">Any tile</span>
                  </button>
                  <button
                    aria-pressed={selectedMode === "secret"}
                    className={`popoverModeCard${selectedMode === "secret" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("secret")}
                    title="Guarantee a landmark (gold mine, obelisk, …). At game start a random tile with that feature is drawn face-down."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeSecret} />
                    <span className="popoverModeTitle">Secret</span>
                    <span className="popoverModeSub">Landmark filter</span>
                  </button>
                  <button
                    aria-pressed={selectedMode === "faceup"}
                    className={`popoverModeCard${selectedMode === "faceup" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("faceup")}
                    title="You pick the exact tile and it is visible on the board from the start."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeFaceUp} />
                    <span className="popoverModeTitle">Face-up</span>
                    <span className="popoverModeSub">Visible now</span>
                  </button>
                </div>

                <small className="popoverHint">
                  {selectedMode === "random"
                    ? "Random: any tile from this pool is drawn at game start."
                    : selectedMode === "secret"
                      ? selected.secretFeature
                        ? `Secret: a random ${secretFeatureFullLabel(selected.secretFeature)} tile from this pool will be drawn face-down at game start — players only see the back until discovery.`
                        : selected.tileDefId
                          ? `Exact secret pin: ${selected.tileDefId} stays face-down. Prefer a landmark below so the pool can still vary.`
                          : "Secret: pick a landmark below. The game draws one random tile with that feature from this pool."
                      : "Face-up: click a tile below. Everyone sees it from the start of the game."}
                </small>

                {/* Step 2a — Secret: pick a landmark feature (primary). */}
                {selectedMode === "secret" && PICKABLE_GROUPS.has(selected.group) ? (
                  <div className="popoverFeaturePicker">
                    <div className="popoverSectionLabel">Guarantee this landmark</div>
                    {availableSecretFeatures.length > 0 ? (
                      <div className="popoverFeatureGrid" role="listbox" aria-label="Secret landmarks">
                        {availableSecretFeatures.map((feature) => {
                          const isPicked = selected.secretFeature === feature.id && !selected.tileDefId;
                          return (
                            <button
                              aria-selected={isPicked}
                              className={`popoverFeatureCard${isPicked ? " selected" : ""}`}
                              key={feature.id}
                              onClick={() => pickSecretFeature(feature.id)}
                              role="option"
                              title={feature.description}
                              type="button"
                            >
                              <span className="popoverFeatureIcon" aria-hidden="true">
                                <DesignerGlyph className="popoverFeatureGlyph" src={feature.iconSrc} />
                              </span>
                              <span className="popoverFeatureTitle">{feature.label}</span>
                              <span className="popoverFeatureCount">
                                {feature.matchCount} tile{feature.matchCount === 1 ? "" : "s"} in pool
                              </span>
                              {isPicked ? <span className="popoverFeatureBadge">Chosen</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <small className="popoverHint">
                        No landmark features exist in this pool. Pin an exact tile below, or switch to Random.
                      </small>
                    )}
                    {selected.secretFeature && !selected.tileDefId ? (
                      <div className="popoverSecretSummary" role="status">
                        <span className="popoverSecretSummaryIcon" aria-hidden="true">
                          {(() => {
                            const meta = SECRET_TILE_FEATURES.find((entry) => entry.id === selected.secretFeature);
                            return meta ? (
                              <DesignerGlyph className="popoverFeatureGlyph" src={meta.iconSrc} />
                            ) : (
                              "🔒"
                            );
                          })()}
                        </span>
                        <div>
                          <strong>In game:</strong> opens as a face-down {planGroupLabel(selected)} tile, then
                          reveals a random{" "}
                          <em>{secretFeatureFullLabel(selected.secretFeature)}</em> from the remaining pool.
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Step 2b — Face-up tile grid, or advanced exact secret pin under Secret/Random. */}
                {PICKABLE_GROUPS.has(selected.group) &&
                (selectedMode === "faceup" || selectedMode === "secret" || selectedMode === "random") ? (
                  <div className="popoverTilePicker">
                    <div className="popoverSectionLabel">
                      {selectedMode === "faceup"
                        ? "Click the face-up tile"
                        : selectedMode === "secret"
                          ? "Advanced: pin one exact tile instead"
                          : "Or pin a specific tile as exact Secret"}
                    </div>
                    {selectedMode !== "faceup" ? (
                      <small className="popoverHint">
                        {selectedMode === "secret"
                          ? "Locks one tile id (legacy). Prefer a landmark above so any matching tile can appear."
                          : "Locks one tile face-down. Use Secret + a landmark to keep the pool random."}
                      </small>
                    ) : null}
                    <div className="popoverFilterRow" role="group" aria-label="Filter tiles by landmark">
                      {availablePickFilters.map((filter) => (
                        <button
                          aria-pressed={activePickFilter.id === filter.id}
                          className={`popoverFilterChip${activePickFilter.id === filter.id ? " active" : ""}`}
                          key={filter.id}
                          onClick={() => setTilePickFilter(filter.id)}
                          type="button"
                        >
                          {filter.iconSrc ? (
                            <DesignerGlyph className="popoverFilterGlyph" src={filter.iconSrc} />
                          ) : null}
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <div className="popoverTileGrid" role="listbox" aria-label="Tiles in this pool">
                      {filteredPickableTiles.map((tile) => {
                        const taken = usedPinnedIds.has(tile.id) && selected.tileDefId !== tile.id;
                        const isPicked = selected.tileDefId === tile.id;
                        const tags = tileFeatureTags(tile);
                        const art = tile.assets?.tileImage;
                        return (
                          <button
                            aria-selected={isPicked}
                            className={`popoverTileCard${isPicked ? " selected" : ""}${taken ? " taken" : ""}`}
                            disabled={taken}
                            key={tile.id}
                            onClick={() => pickTileForSelected(tile.id)}
                            role="option"
                            title={
                              taken
                                ? `${tile.id} is already used on another slot`
                                : `${tile.id}: ${tags.join(", ")}`
                            }
                            type="button"
                          >
                            {art ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                alt=""
                                className="popoverTileCardArt"
                                src={assetUrl(art)}
                                style={{ transform: `rotate(${(selected.rotation ?? 0) * 60}deg)` }}
                              />
                            ) : (
                              <span className="popoverTileCardArt placeholder">{tile.id}</span>
                            )}
                            <span className="popoverTileCardId">{tile.id}</span>
                            <span className="popoverTileCardTags">
                              {tags.slice(0, 3).map((tag) => (
                                <span className="popoverTileTag" key={tag}>
                                  {tag}
                                </span>
                              ))}
                              {tags.length > 3 ? (
                                <span className="popoverTileTag more">+{tags.length - 3}</span>
                              ) : null}
                            </span>
                            {isPicked ? (
                              <span className="popoverTileCardBadge">
                                {selectedMode === "faceup" ? "Face-up" : "Exact"}
                              </span>
                            ) : null}
                            {taken ? <span className="popoverTileCardBadge taken">Used</span> : null}
                          </button>
                        );
                      })}
                      {filteredPickableTiles.length === 0 ? (
                        <small className="popoverHint">No tiles match this filter.</small>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="popoverActions">
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(-1)}
                    title="Rotate 60° counterclockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph flipH" src={DESIGNER_UI_ICONS.rotate} />
                    <span>−60°</span>
                  </button>
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(1)}
                    title="Rotate 60° clockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph" src={DESIGNER_UI_ICONS.rotate} />
                    <span>{(selected.rotation ?? 0) * 60}°</span>
                  </button>
                </div>

                {/* Center (Ⅵ–Ⅶ) tiles: force this slot's difficulty-7 objective
                    field, whatever tile lands here. */}
                {selected.group === "center" ? (
                  <div className="popoverViiField">
                    <div className="popoverSectionLabel">Ⅶ objective field</div>
                    <small className="popoverHint">
                      Force this centre slot&apos;s big (difficulty 7) field to a specific objective — whatever tile
                      lands here. Default keeps whatever the drawn / chosen tile prints.
                    </small>
                    <div className="popoverModeRow" role="group" aria-label="Center Ⅶ field">
                      {VII_FIELD_OPTIONS.map((option) => {
                        const active = (selected.viiField ?? undefined) === option.id;
                        return (
                          <button
                            aria-pressed={active}
                            className={`popoverFilterChip${active ? " active" : ""}`}
                            key={String(option.id)}
                            onClick={() =>
                              updateTile(selectedIndex as number, { viiField: option.id })
                            }
                            title={option.hint}
                            type="button"
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Monolith/Whirlpool Location Token on this tile. */}
                {selectedToken ? (
                  <>
                    <small className="popoverHint">
                      {mapTokenLabel(selectedToken.kind)} token on this tile
                      {selected.faceDown
                        ? " — whoever discovers the tile places it on a field of their choosing."
                        : " — it overwrites the chosen field."}
                    </small>
                    {!selected.faceDown && selectedTileDef ? (
                      <select
                        aria-label="Token field"
                        className="popoverSelect"
                        onChange={(event) =>
                          updateTile(selectedIndex as number, {
                            token: { kind: selectedToken.kind, slot: Number(event.target.value) }
                          })
                        }
                        value={selectedToken.slot ?? ""}
                      >
                        {legalTokenSlotsForTileDef(selectedTileDef, selectedToken.kind).map((slot) => (
                          <option key={slot} value={slot}>
                            {tokenSlotLabel(selected.tileDefId, slot, selected.rotation ?? 0)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="popoverActions">
                      <button
                        onClick={() => updateTile(selectedIndex as number, { token: undefined })}
                        title="Remove the token from this tile"
                        type="button"
                      >
                        <Trash2 size={13} /> Remove the {mapTokenLabel(selectedToken.kind)} token
                      </button>
                    </div>
                  </>
                ) : selectedTokenKinds.length > 0 ? (
                  <div className="popoverActions">
                    {selectedTokenKinds.map((kind) => {
                      const capped = kind === "whirlpool" && tokenCounts.whirlpool >= MAX_WHIRLPOOL_TOKENS;
                      return (
                        <button
                          className="popoverTokenButton"
                          disabled={capped}
                          key={kind}
                          onClick={() => {
                            if (capped) {
                              return;
                            }
                            const token = selected.faceDown
                              ? { kind }
                              : retargetTokenForDef({ kind }, selected.tileDefId);
                            if (token) {
                              updateTile(selectedIndex as number, { token });
                            }
                          }}
                          title={
                            capped
                              ? `Only ${MAX_WHIRLPOOL_TOKENS} numbered Whirlpool tokens exist — remove one to place it elsewhere.`
                              : kind === "monolith"
                                ? "Two-Way Monolith (land): heroes entering it teleport to another Monolith. At least 2 needed to work."
                                : "Whirlpool (sea): heroes entering it travel to another Whirlpool and lose 1 unit card. At least 2 needed to work; with 3, the Attack die decides."
                          }
                          type="button"
                        >
                          <DesignerGlyph
                            className="popoverTokenGlyph"
                            src={mapTokenImage(kind, kind === "whirlpool" ? 0 : undefined)}
                          />
                          Add a {mapTokenLabel(kind)} token
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* Designer Subterranean Gate links — cavern tiles only. */}
                {selected.group === "subterranean" ? (
                  <div className="popoverGateLinks">
                    <div className="popoverSectionLabel">Subterranean gate links</div>
                    {selectedCavernSurfaces.length === 0 ? (
                      <small className="popoverHint">
                        Move this cavern so it touches a Surface tile, then link it here to place a Subterranean Gate.
                      </small>
                    ) : (
                      <>
                        <small className="popoverHint">
                          Connect this cavern to any touching Surface tile — link several to give the cavern several gates.
                          Drag a gate token along the shared edge (or use ↻ Move) to place it exactly.
                        </small>
                        <div className="popoverGateLinkList">
                          {selectedCavernSurfaces.map((surface) => {
                            const linked = isGateLinked(surface);
                            return (
                              <div className="popoverGateLinkRow" key={`${surface.row}:${surface.col}`}>
                                <button
                                  aria-pressed={linked}
                                  className={`popoverGateLinkToggle${linked ? " linked" : ""}`}
                                  onClick={() => toggleGateLink(surface)}
                                  title={
                                    linked
                                      ? "Remove this designer gate link"
                                      : "Connect a Subterranean Gate to this Surface tile"
                                  }
                                  type="button"
                                >
                                  {linked ? "🔗 Linked" : "Link"} · {TILE_GROUP_LABELS[surface.group]} @ {surface.row},
                                  {surface.col}
                                </button>
                                {linked ? (
                                  <button
                                    className="popoverGateLinkCycle"
                                    onClick={() => cycleGateLinkPosition(surface)}
                                    title="Slide the gate to the next legal position along the shared edge"
                                    type="button"
                                  >
                                    ↻ Move
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {/* Designer yellow borders — deliberate impassable edges. Legal on
                any tile group, so this shows for starting towns and supply tiles
                alike. Each chip toggles an ABSOLUTE board direction (0-5). */}
            <div className="popoverBorders">
              <div className="popoverSectionLabel">Yellow borders (impassable edges)</div>
              <small className="popoverHint">
                Seal an outer edge of this tile — heroes can&apos;t cross, discover or place across it (only Expert
                Pathfinding does), exactly like a printed yellow line. Borders are drawn on the board, so they stay put
                when the tile is rotated or a face-down slot draws its tile.
              </small>
              <div className="popoverBorderRose" role="group" aria-label="Tile edge yellow borders">
                {BORDER_DIRECTION_LABELS.map((label, direction) => {
                  const on = Boolean(selected.extraBorders?.includes(direction));
                  return (
                    <button
                      aria-label={`${on ? "Remove" : "Add"} yellow border on the ${label} edge`}
                      aria-pressed={on}
                      className={`popoverBorderChip${on ? " active" : ""}`}
                      data-direction={direction}
                      key={direction}
                      onClick={() => toggleBorder(direction)}
                      title={`${label} edge`}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="popoverRemove" onClick={() => removeTile(selectedIndex as number)} type="button">
              <Trash2 size={13} /> Remove
            </button>
          </div>
        ) : null}

        {/* Placed-object panel: guard picker + delete — docked like the tile panel. */}
        {selectedObject && objectPopoverAt ? (
          <div className="designerPopover designerObjectPopover">
            <header>
              <strong>
                {selectedObject.kind === "gate"
                  ? `${titleCase(gatePairColor(selectedObject.pair ?? 1))} Gate`
                  : mapTokenLabel(selectedObject.kind as MapTokenKind)}
                {selectedObject.placement.type === "standalone" ? " · standalone" : ""}
              </strong>
              <button
                aria-label="Close object options"
                className="popoverClose"
                onClick={closeObjectPopover}
                title="Close"
                type="button"
              >
                ✕
              </button>
            </header>
            <div className="popoverSectionLabel">Neutral guard</div>
            <div className="popoverObjectGuards">
              {OBJECT_GUARD_LEVELS.map((level) => (
                <button
                  aria-pressed={(selectedObject.guard ?? 0) === level}
                  className={`popoverGuardChip${(selectedObject.guard ?? 0) === level ? " active" : ""}`}
                  data-guard={level}
                  key={level}
                  onClick={() => setObjectGuard(selectedObjectIndex as number, level)}
                  title={level === 0 ? "No guard" : `Guard ${ROMAN_NUMERALS[level]}`}
                  type="button"
                >
                  {level === 0 ? "None" : ROMAN_NUMERALS[level]}
                </button>
              ))}
            </div>
            <button className="popoverRemove" onClick={() => removeObject(selectedObjectIndex as number)} type="button">
              <Trash2 size={13} /> Remove
            </button>
          </div>
        ) : null}
      </div>

      {victoryConflicts.map((conflict, index) => (
        <div className="designerCavernAlert designerVictoryConflict" key={`victory-conflict-${index}`} role="alert">
          <DesignerGlyph className="designerAlertGlyph" src={REWARD_GLYPH_ICONS.conflict} /> {conflict}
        </div>
      ))}
      {showVictoryAllClear ? (
        <div className="designerCavernAlert designerVictoryOk" role="status">
          <DesignerGlyph className="designerAlertGlyph" src={REWARD_GLYPH_ICONS.ok} /> This design supports the chosen
          win condition — its objective tiles are all in place.
        </div>
      ) : null}
      {objectValidation.problems.map((problem, index) => (
        <div className="designerCavernAlert designerObjectAlert" key={`obj-problem-${index}`} role="alert">
          ⚠ {problem}
        </div>
      ))}
      {objectValidation.warnings.map((warning, index) => (
        <div className="designerCavernAlert designerObjectAlert" key={`obj-warning-${index}`} role="status">
          ⚠ {warning}
        </div>
      ))}

      {unreachableCaverns.length > 0 ? (
        <div className="designerCavernAlert" role="alert">
          ⚠ {unreachableCaverns.length} Underground tile{unreachableCaverns.length > 1 ? "s have" : " has"} no Subterranean
          Gate — heroes can never reach {unreachableCaverns.length > 1 ? "them" : "it"}. Move each red-ringed cavern so it
          touches a Surface tile (or a cavern that already has a gate); a gold gate token appears as soon as it connects.
        </div>
      ) : null}

      {tokenCounts.monolith === 1 ? (
        <div className="designerCavernAlert" role="alert">
          ⚠ Only 1 Monolith token is placed — Monoliths need at least 2 on the map to work. A lone Monolith leads
          nowhere; add a second one (on another tile) to open the teleport route.
        </div>
      ) : null}
      {tokenCounts.whirlpool === 1 ? (
        <div className="designerCavernAlert" role="alert">
          ⚠ Only 1 Whirlpool token is placed — Whirlpools need at least 2 on the map to work. A lone Whirlpool leads
          nowhere; add a second one (on another sea tile) to open the travel route.
        </div>
      ) : null}

      <small className="optionHint">
        Drag a tile from the palette onto the board, then <strong>click it</strong> to configure: choose{" "}
        <strong>Random</strong> (pool draw), <strong>Secret</strong> (landmark filter — mines, obelisks, … stay hidden
        until discovery), or <strong>Face-up</strong> (visible from the start), then click a tile card. Filter chips
        (Mine, Obelisk, …) narrow the grid. <strong>Underground</strong> tiles need a Subterranean Gate (auto when
        touching Surface). Add <strong>Monolith</strong> / <strong>Whirlpool</strong> tokens from the same panel — at
        least 2 of a kind to work. A centre tile can force its <strong>Ⅶ objective field</strong> (Town / Grail /
        Utopia, shown as a badge). Drag a cavern to touch a Surface tile and its <strong>Subterranean Gate</strong>{" "}
        appears — or link and pin the pair in the popover and use <strong>↻</strong> to slide the gate along the shared
        edge. Arm <strong>🖌 Yellow border</strong> in the Objects palette, then click a tile&apos;s{" "}
        <strong>edge hexes</strong> to paint impassable borders (or use the edge chips in the tile panel), and{" "}
        <strong>lock</strong> a starting tile&apos;s orientation so it never opens with a rotation. The{" "}
        <strong>Objects</strong> palette drops
        standalone one-hex pieces — four colored <strong>Gate</strong> pairs and designer-guarded objects. Town (Ⅰ)
        tiles are seats; drag empty background to pan, pinch or use the toolbar to zoom (wheel zoom when unlocked).
      </small>

      {/* Floating drag ghost follows the pointer — band-correct printed back. */}
      {drag ? (
        <div className="designerDragGhost" style={{ left: drag.clientX, top: drag.clientY }}>
          <span
            className="paletteThumb large"
            style={{
              backgroundImage: `url(${assetUrl(
                planBackArt({ group: drag.group, seaBand: drag.seaBand, subBand: drag.subBand })
              )})`
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
