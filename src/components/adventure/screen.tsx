"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Image as ImageIcon, Minus, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions } from "@/data/map/locations";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import {
  ABILITY_SEARCH_LEVELS,
  EXPERT_USES_BY_LEVEL,
  HAND_LIMIT_BY_LEVEL,
  NEUTRAL_DECK_IDS,
  SPECIALTY_LEVELS,
  effectiveHandLimit,
  getActiveAstrologersCard,
  getMainHero,
  getReachableHeroPaths,
  hexDistance,
  hexToPixel,
  parseHexSpaceId,
  tileFootprint,
  astrologersCardDefinitions,
  type GameAction,
  type GameState,
  type HeroPathTarget,
  type LegalAction,
  type MapSpaceId,
  type MapTileState,
  type PlayerId,
  type PlayerVisibleState
} from "@/engine";
import { actionKey, cardName, formatCost, titleCase } from "@/components/table/utils";
import { useCardZoom } from "@/components/table/zoom";

const HEX_SIZE = 34;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;

const TERRAIN_COLORS: Record<string, string> = {
  grass: "#3c7a39",
  dirt: "#8a6642",
  subterranean: "#4d3f5c",
  cursed: "#6e5d72",
  snow: "#aebcd4",
  swamp: "#5c6e4e",
  lava: "#73392c",
  rough: "#977a4e",
  highlands: "#7c8a4e",
  water: "#2e5d8a"
};

const LOCATION_GLYPHS: Record<string, string> = {
  town: "🏰",
  random_town: "🏰",
  settlement: "🏠",
  mine: "⛏",
  resource_symbol: "🎲",
  treasure_symbol: "💰",
  artifact_symbol: "🗝",
  windmill: "🌀",
  water_wheel: "💧",
  mystical_garden: "🌷",
  learning_stone: "📘",
  tree_of_knowledge: "🌳",
  fountain_of_youth: "⛲",
  temple: "⛪",
  warriors_tomb: "🪦",
  shrine_of_magic_incantation: "🔮",
  shrine_of_magic_gesture: "🔮",
  magic_spring: "✨",
  witch_hut: "🧹",
  scholar: "🎓",
  redwood_observatory: "🗼",
  pandoras_box: "📦",
  stables: "🐎",
  sanctuary: "🕊",
  trading_post: "⚖",
  war_machine_factory: "⚙",
  obelisk: "▲",
  dragon_utopia: "🐉",
  grail: "🏆",
  star_axis: "✴",
  blocked_field: "⛔"
};

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];

function hexCornerPoints(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return corners;
}

function hexCorners(cx: number, cy: number, size: number): string {
  return hexCornerPoints(cx, cy, size)
    .map((corner) => `${corner.x.toFixed(1)},${corner.y.toFixed(1)}`)
    .join(" ");
}

/** Outer edge segment of a hex facing ring direction 0-5 (NE,E,SE,SW,W,NW). */
function hexEdgeForDirection(cx: number, cy: number, size: number, direction: number): { x1: number; y1: number; x2: number; y2: number } {
  const corners = hexCornerPoints(cx, cy, size);
  const edgeIndex = (direction + 5) % 6;
  const a = corners[edgeIndex];
  const b = corners[(edgeIndex + 1) % 6];
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function playerColor(state: GameState, playerId: PlayerId | null): string {
  if (!playerId) {
    return "#999";
  }
  const factionId = state.players[playerId]?.factionId;
  return (factionId && coreFactionDefinitions[factionId]?.color) || "#b08d2f";
}

export type TilePlacementSelection = { supplyIndex: number } | null;

export type HeroMoveCue = { id: string; heroId: string; path: MapSpaceId[] };

// ---------------------------------------------------------------------------
// Hex map board: pan/zoom, click-to-move with path arrows, tile art layer,
// reveal/place rotation overlay, printed border lines, hero sprites.
// ---------------------------------------------------------------------------

export function HexMapBoard({
  state,
  view,
  viewerPlayerId,
  legalActions,
  onAction,
  placement,
  moveCue,
  readOnly = false
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  placement: TilePlacementSelection;
  moveCue: HeroMoveCue | null;
  readOnly?: boolean;
}) {
  const adventure = view.adventure;
  const rawAdventure = state.adventure;

  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [showArt, setShowArt] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const isSeated = Boolean(state.players[viewerPlayerId]) && viewerPlayerId !== "observer";
  const myHero = isSeated ? getMainHero(state, viewerPlayerId) : null;
  const myHeroSpaceId = myHero?.spaceId ?? null;
  const myTurn = isSeated && state.activePlayerId === viewerPlayerId;

  const pendingTileChoice = rawAdventure?.pendingTileChoice ?? null;
  const rotatingTile = pendingTileChoice ? rawAdventure?.tiles[pendingTileChoice.tileInstanceId] : null;
  const iAmRotating = Boolean(pendingTileChoice && pendingTileChoice.playerId === viewerPlayerId && !readOnly);

  // Reachable click-to-move targets, computed from the live rules.
  const reachable = useMemo(() => {
    if (!myHero || !myTurn || readOnly || pendingTileChoice || state.combat || rawAdventure?.pendingVisit) {
      return new Map<MapSpaceId, HeroPathTarget>();
    }
    if (state.players[viewerPlayerId]?.needsHandRefresh) {
      return new Map<MapSpaceId, HeroPathTarget>();
    }
    return getReachableHeroPaths(state, myHero);
  }, [state, myHero, myTurn, readOnly, pendingTileChoice, rawAdventure?.pendingVisit, viewerPlayerId]);

  const discoverByTile = useMemo(() => {
    const targets = new Map<string, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "DISCOVER_TILE") {
        targets.set(legal.action.tileInstanceId, legal.action);
      }
    }
    return targets;
  }, [legalActions]);

  const legalRotations = useMemo(() => {
    const rotations = new Set<number>();
    for (const legal of legalActions) {
      if (legal.action.type === "SET_TILE_ROTATION") {
        rotations.add(legal.action.rotation);
      }
    }
    return rotations;
  }, [legalActions]);

  // Rotation preview, reset whenever a different tile starts rotating
  // (state-adjustment-during-render pattern, no effect needed).
  const [rotationPreview, setRotationPreview] = useState<{ tileId: string | null; rotation: number }>({
    tileId: null,
    rotation: 0
  });
  const pendingTileId = pendingTileChoice?.tileInstanceId ?? null;
  if (rotationPreview.tileId !== pendingTileId) {
    const fallback = legalRotations.size > 0 ? Math.min(...legalRotations) : 0;
    setRotationPreview({ tileId: pendingTileId, rotation: fallback });
  }
  const previewRotation = rotationPreview.rotation;
  const setPreviewRotation = (update: (value: number) => number) =>
    setRotationPreview((current) => ({ ...current, rotation: update(current.rotation) }));

  // Selected move target, dropped when the hero moves or the turn changes.
  const [moveSelection, setMoveSelection] = useState<{ key: string; target: HeroPathTarget | null }>({
    key: "",
    target: null
  });
  const moveSelectionKey = `${myHeroSpaceId}|${state.activePlayerId}|${state.round}`;
  if (moveSelection.key !== moveSelectionKey) {
    setMoveSelection({ key: moveSelectionKey, target: null });
  }
  const selectedTarget = moveSelection.target;
  const setSelectedTarget = (target: HeroPathTarget | null) =>
    setMoveSelection({ key: moveSelectionKey, target });

  const placementCenters = useMemo(() => {
    if (!placement || !rawAdventure || !myHeroSpaceId) {
      return [] as { row: number; col: number }[];
    }

    const heroCoord = parseHexSpaceId(myHeroSpaceId);
    if (!heroCoord) {
      return [];
    }

    const existing = Object.values(rawAdventure.tiles).map((tile) => ({ row: tile.centerRow, col: tile.centerCol }));
    const centers: { row: number; col: number }[] = [];
    for (let row = heroCoord.row - 4; row <= heroCoord.row + 4; row += 1) {
      for (let col = heroCoord.col - 4; col <= heroCoord.col + 4; col += 1) {
        const candidate = { row, col };
        if (existing.some((center) => hexDistance(center, candidate) < 3)) {
          continue;
        }
        if (existing.filter((center) => hexDistance(center, candidate) === 3).length < 2) {
          continue;
        }
        // The new tile must sit next to the hero.
        const footprint = tileFootprint(candidate, 0);
        const nextToHero = footprint.some((cell) => hexDistance(cell, heroCoord) === 1);
        if (!nextToHero) {
          continue;
        }
        centers.push(candidate);
      }
    }
    return centers;
  }, [placement, rawAdventure, myHeroSpaceId]);

  if (!adventure || !rawAdventure) {
    return null;
  }

  const artLayer: ReactNode[] = [];
  const cells: ReactNode[] = [];
  const overlays: ReactNode[] = [];
  const heroPawns: ReactNode[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const track = (x: number, y: number) => {
    minX = Math.min(minX, x - HEX_SIZE * 1.6);
    minY = Math.min(minY, y - HEX_SIZE * 1.6);
    maxX = Math.max(maxX, x + HEX_SIZE * 1.6);
    maxY = Math.max(maxY, y + HEX_SIZE * 1.6);
  };

  const heroesBySpace = new Map<string, { playerId: PlayerId; heroId: string; heroDefId?: string }[]>();
  for (const hero of Object.values(state.heroes)) {
    if (hero.spaceId) {
      const list = heroesBySpace.get(hero.spaceId) ?? [];
      list.push({ playerId: hero.controllerId, heroId: hero.id, heroDefId: hero.heroDefId });
      heroesBySpace.set(hero.spaceId, list);
    }
  }

  const sortedTiles = Object.values(adventure.tiles).sort(
    (left, right) => left.centerRow - right.centerRow || left.centerCol - right.centerCol
  );

  const renderTileArt = (tile: MapTileState, rotation: number) => {
    const def = coreTileDefinitions[tile.tileDefId];
    const image = def?.assets?.tileImage;
    if (!image || !showArt) {
      return;
    }

    const center = hexToPixel({ row: tile.centerRow, col: tile.centerCol }, HEX_SIZE);
    const width = 3 * HEX_WIDTH;
    const height = 5 * HEX_SIZE;
    artLayer.push(
      <image
        className="tileArt"
        height={height}
        href={image}
        key={`art-${tile.id}`}
        preserveAspectRatio="xMidYMid meet"
        transform={`rotate(${rotation * 60} ${center.x} ${center.y})`}
        width={width}
        x={center.x - width / 2}
        y={center.y - height / 2}
      />
    );
  };

  for (const tile of sortedTiles) {
    const center = { row: tile.centerRow, col: tile.centerCol };

    // --- Face-down tiles: printed backs with their roman numerals ---------
    if (tile.faceDown) {
      const discover = discoverByTile.get(tile.id);
      const footprint = tileFootprint(center, 0);
      for (const [slot, coord] of footprint.entries()) {
        const { x, y } = hexToPixel(coord, HEX_SIZE);
        track(x, y);
        cells.push(
          <g key={`${tile.id}-${slot}`}>
            <polygon
              className={`hexFaceDown ${discover && !readOnly ? "discoverable" : ""}`}
              onClick={
                discover && !readOnly
                  ? () => {
                      if (!suppressClickRef.current) {
                        onAction(discover);
                      }
                    }
                  : undefined
              }
              points={hexCorners(x, y, HEX_SIZE - 1.2)}
            >
              <title>
                {discover ? `Spend 1 MP to discover this ${tile.backLabel ?? ""} tile` : `Face-down tile ${tile.backLabel ?? ""}`}
              </title>
            </polygon>
          </g>
        );
        if (slot === 0) {
          overlays.push(
            <g key={`${tile.id}-back`}>
              <text className="hexBackNumeral" textAnchor="middle" x={x} y={y + 8}>
                {tile.backLabel ?? "?"}
              </text>
              {discover && !readOnly ? (
                <text className="hexFaceDownLabel" textAnchor="middle" x={x} y={y + HEX_SIZE * 0.78}>
                  1 MP: discover
                </text>
              ) : null}
            </g>
          );
        }
      }
      continue;
    }

    const tileDef = coreTileDefinitions[tile.tileDefId];
    const terrain = TERRAIN_COLORS[tileDef?.terrain ?? "dirt"] ?? TERRAIN_COLORS.dirt;

    // --- Tiles waiting for their rotation: preview from the definition ----
    if (tile.awaitingRotation) {
      const rotation = iAmRotating && rotatingTile?.id === tile.id ? previewRotation : tile.rotation;
      renderTileArt(tile, rotation);
      const footprint = tileFootprint(center, rotation);
      for (const [slot, coord] of footprint.entries()) {
        const fieldDef = tileDef?.fields[slot];
        const { x, y } = hexToPixel(coord, HEX_SIZE);
        track(x, y);
        cells.push(
          <polygon
            className={`hexCell rotating ${showArt && tileDef?.assets?.tileImage ? "withArt" : ""}`}
            fill={terrain}
            key={`${tile.id}-rot-${slot}`}
            points={hexCorners(x, y, HEX_SIZE - 1.2)}
          />
        );
        if (fieldDef) {
          const glyph = LOCATION_GLYPHS[fieldDef.location] ?? "";
          if (glyph && fieldDef.location !== "empty_field") {
            overlays.push(
              <text className="hexGlyph" key={`${tile.id}-rot-glyph-${slot}`} textAnchor="middle" x={x} y={y + 6}>
                {glyph}
              </text>
            );
          }
          if (fieldDef.difficulty) {
            overlays.push(
              <text className="hexDifficulty" key={`${tile.id}-rot-diff-${slot}`} textAnchor="middle" x={x} y={y - HEX_SIZE * 0.45}>
                {ROMAN[fieldDef.difficulty]}
              </text>
            );
          }
        }
        // Printed border lines move with the rotation preview.
        if (slot > 0 && tileDef?.outerImpassable[slot - 1]) {
          const direction = (slot - 1 + rotation) % 6;
          const edge = hexEdgeForDirection(x, y, HEX_SIZE - 1.2, direction);
          overlays.push(<line className="tileBorderLine" key={`${tile.id}-rot-border-${slot}`} {...edge} />);
        }
      }
      const centerPixel = hexToPixel(center, HEX_SIZE);
      overlays.push(
        <circle
          className="rotatingHalo"
          cx={centerPixel.x}
          cy={centerPixel.y}
          key={`${tile.id}-halo`}
          r={HEX_SIZE * 2.6}
        />
      );
      continue;
    }

    // --- Revealed, materialized tiles --------------------------------------
    renderTileArt(tile, tile.rotation);
    const footprint = tileFootprint(center, tile.rotation);
    for (const [slot, coord] of footprint.entries()) {
      const spaceId = `h:${coord.row}:${coord.col}`;
      const field = adventure.fields[spaceId];
      if (!field) {
        continue;
      }

      const { x, y } = hexToPixel(coord, HEX_SIZE);
      track(x, y);

      const location = locationDefinitions[field.location];
      const target = reachable.get(spaceId);
      const guarded = Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
      const glyph = LOCATION_GLYPHS[field.location] ?? "";
      const isSelected = selectedTarget?.spaceId === spaceId;

      cells.push(
        <polygon
          className={[
            "hexCell",
            field.location === "blocked_field" ? "blocked" : "",
            target ? "moveTarget" : "",
            isSelected ? "selectedTarget" : "",
            showArt && tileDef?.assets?.tileImage ? "withArt" : ""
          ].join(" ")}
          fill={terrain}
          key={spaceId}
          onClick={
            target && !readOnly
              ? () => {
                  if (suppressClickRef.current) {
                    return;
                  }
                  setSelectedTarget(selectedTarget?.spaceId === spaceId ? null : target);
                }
              : undefined
          }
          points={hexCorners(x, y, HEX_SIZE - 1.2)}
        >
          <title>
            {`${location?.name ?? field.location}${field.difficulty && guarded ? ` (guard ${ROMAN[field.difficulty]})` : ""}${
              field.flagOwnerId ? ` — flagged by ${state.players[field.flagOwnerId]?.name}` : ""
            }${target ? ` — ${target.cost} MP` : ""}`}
          </title>
        </polygon>
      );

      if (glyph && field.location !== "empty_field") {
        overlays.push(
          <text className="hexGlyph" key={`${spaceId}-glyph`} textAnchor="middle" x={x} y={y + 6}>
            {glyph}
          </text>
        );
      }
      if (field.difficulty && guarded) {
        overlays.push(
          <text className="hexDifficulty" key={`${spaceId}-diff`} textAnchor="middle" x={x} y={y - HEX_SIZE * 0.45}>
            {ROMAN[field.difficulty]}
          </text>
        );
      }
      if (field.blackCube) {
        overlays.push(
          <rect className="blackCube" height={9} key={`${spaceId}-cube`} width={9} x={x + HEX_SIZE * 0.36} y={y - HEX_SIZE * 0.62} />
        );
      }
      if (field.flagOwnerId) {
        overlays.push(
          <g key={`${spaceId}-flag`} transform={`translate(${x - HEX_SIZE * 0.62}, ${y - HEX_SIZE * 0.72})`}>
            <line className="flagPole" x1={0} x2={0} y1={0} y2={16} />
            <path d="M0 1 L11 4.5 L0 8 Z" fill={playerColor(state, field.flagOwnerId)} stroke="#1d1206" strokeWidth={0.7} />
          </g>
        );
      }
      if (field.settlementResource) {
        overlays.push(
          <text className="hexProduction" key={`${spaceId}-prod`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.72}>
            {field.settlementResource === "buildingMaterials" ? "⚒" : field.settlementResource === "gold" ? "🪙" : "♦"}
          </text>
        );
      }
      if (field.resource && field.location === "mine") {
        overlays.push(
          <text className="hexProduction" key={`${spaceId}-mine`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.72}>
            {field.resource === "buildingMaterials" ? "⚒" : field.resource === "gold" ? "🪙" : "♦"}
            {field.amount}
          </text>
        );
      }
      // Printed border lines (solid impassable tile edges).
      if (slot > 0 && tileDef?.outerImpassable[slot - 1]) {
        const direction = (slot - 1 + tile.rotation) % 6;
        const edge = hexEdgeForDirection(x, y, HEX_SIZE - 1.2, direction);
        overlays.push(<line className="tileBorderLine" key={`${spaceId}-border`} {...edge} />);
      }

      // Hero pawns: separate top layer keyed by hero id so moves glide.
      const occupants = heroesBySpace.get(spaceId) ?? [];
      for (const [index, occupant] of occupants.entries()) {
        const heroDef = occupant.heroDefId ? coreHeroDefinitions[occupant.heroDefId] : undefined;
        const portrait = heroDef?.portrait;
        heroPawns.push(
          <g
            className="heroPawn"
            key={occupant.heroId}
            style={{ transform: `translate(${x + index * 10 - 5}px, ${y - 4}px)` }}
          >
            <circle className="heroPawnBase" r={12} />
            {portrait ? (
              <>
                <clipPath id={`heroClip-${occupant.heroId}`}>
                  <circle r={10} />
                </clipPath>
                {/* Hero sprite slot: swap `portrait` for a dedicated map
                    sprite asset when real art lands. */}
                <image
                  className="heroSprite"
                  clipPath={`url(#heroClip-${occupant.heroId})`}
                  height={22}
                  href={portrait}
                  preserveAspectRatio="xMidYMid slice"
                  width={22}
                  x={-11}
                  y={-11}
                />
              </>
            ) : (
              <circle fill={playerColor(state, occupant.playerId)} r={9} />
            )}
            <circle className="heroPawnRing" r={11} stroke={playerColor(state, occupant.playerId)} />
            <line className="heroFlagPole" x1={0} x2={0} y1={-9} y2={-24} />
            <path
              d="M0 -23 L13 -19 L0 -15 Z"
              fill={playerColor(state, occupant.playerId)}
              stroke="#160d04"
              strokeWidth={0.8}
            />
          </g>
        );
      }
    }
  }

  // --- Far-tile placement ghosts: blank Ⅱ–Ⅲ flowers -----------------------
  if (placement && !readOnly) {
    for (const center of placementCenters) {
      const footprint = tileFootprint(center, 0);
      const { x, y } = hexToPixel(center, HEX_SIZE);
      track(x, y);
      cells.push(
        <g
          className="placementGhostFlower"
          key={`ghost-${center.row}-${center.col}`}
          onClick={() => {
            if (suppressClickRef.current || !myHero) {
              return;
            }
            onAction({
              type: "PLACE_TILE",
              playerId: viewerPlayerId,
              heroId: myHero.id,
              supplyIndex: placement.supplyIndex,
              centerRow: center.row,
              centerCol: center.col
            });
          }}
        >
          {footprint.map((cell, index) => {
            const pixel = hexToPixel(cell, HEX_SIZE);
            return <polygon className="ghostHex" key={index} points={hexCorners(pixel.x, pixel.y, HEX_SIZE - 2)} />;
          })}
          <text className="hexBackNumeral ghostNumeral" textAnchor="middle" x={x} y={y + 8}>
            Ⅱ–Ⅲ
          </text>
          <title>Place the Far tile here (1 MP)</title>
        </g>
      );
    }
  }

  // --- Path preview & movement animation -----------------------------------
  const pathOverlay: ReactNode[] = [];
  if (selectedTarget && myHero?.spaceId) {
    const points = [myHero.spaceId, ...selectedTarget.path]
      .map((spaceId) => parseHexSpaceId(spaceId))
      .filter((coord): coord is NonNullable<typeof coord> => Boolean(coord))
      .map((coord) => hexToPixel(coord, HEX_SIZE));
    pathOverlay.push(
      <polyline
        className="pathArrow"
        key="path-preview"
        markerEnd="url(#pathArrowHead)"
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
      />
    );
    const last = points[points.length - 1];
    pathOverlay.push(
      <g key="path-cost" transform={`translate(${last.x + HEX_SIZE * 0.65}, ${last.y - HEX_SIZE * 0.65})`}>
        <circle className="pathCostBadge" r={11} />
        <text className="pathCostText" textAnchor="middle" y={4}>
          {selectedTarget.cost}
        </text>
      </g>
    );
  }
  if (moveCue) {
    const points = moveCue.path
      .map((spaceId) => parseHexSpaceId(spaceId))
      .filter((coord): coord is NonNullable<typeof coord> => Boolean(coord))
      .map((coord) => hexToPixel(coord, HEX_SIZE));
    if (points.length > 1) {
      pathOverlay.push(
        <polyline
          className="pathArrowAnim"
          key={moveCue.id}
          markerEnd="url(#pathArrowHead)"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
      );
    }
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  const rotationConnected =
    rotatingTile && iAmRotating ? legalRotations.size === 0 || legalRotations.has(previewRotation) : true;

  return (
    <div className="hexMapWrap" aria-label="Adventure map">
      <svg
        className={`hexMapSvg ${isDragging ? "dragging" : ""}`}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
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
            setIsDragging(true);
            // Capture only once a real drag starts, so plain clicks keep
            // dispatching to the hex cells underneath.
            (event.currentTarget as Element).setPointerCapture(event.pointerId);
          }
          if (drag.moved) {
            setCamera((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId === event.pointerId) {
            dragRef.current = null;
            setIsDragging(false);
            // Let the click event after this pointerup know it was a drag.
            window.setTimeout(() => {
              suppressClickRef.current = false;
            }, 0);
          }
        }}
        onWheel={(event) => {
          const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
          setCamera((current) => ({ ...current, scale: Math.min(2.6, Math.max(0.45, current.scale * factor)) }));
        }}
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      >
        <defs>
          <marker id="pathArrowHead" markerHeight={7} markerWidth={7} orient="auto-start-reverse" refX={5.4} refY={3}>
            <path d="M0,0 L7,3 L0,6 Z" fill="#ffd766" />
          </marker>
        </defs>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`} transform-origin="center">
          {artLayer}
          {cells}
          {overlays}
          {pathOverlay}
          {heroPawns}
        </g>
      </svg>

      <div className="mapToolbar" aria-label="Map controls">
        <button onClick={() => setCamera((c) => ({ ...c, scale: Math.min(2.6, c.scale * 1.2) }))} title="Zoom in" type="button">
          <Plus size={13} />
        </button>
        <button onClick={() => setCamera((c) => ({ ...c, scale: Math.max(0.45, c.scale / 1.2) }))} title="Zoom out" type="button">
          <Minus size={13} />
        </button>
        <button onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} title="Reset the view" type="button">
          ⤾
        </button>
        <button
          aria-pressed={showArt}
          className={showArt ? "selected" : ""}
          onClick={() => setShowArt((value) => !value)}
          title="Toggle the printed tile art layer (real graphics drop in here)"
          type="button"
        >
          <ImageIcon size={13} />
        </button>
      </div>

      {selectedTarget && myHero && !readOnly ? (
        <div className="moveConfirmBar" role="dialog" aria-label="Confirm movement">
          <span>
            Move {selectedTarget.cost} field{selectedTarget.cost === 1 ? "" : "s"} ({selectedTarget.cost} MP)
          </span>
          <button
            className="commandButton primary"
            onClick={() => {
              onAction({
                type: "MOVE_HERO_PATH",
                playerId: viewerPlayerId,
                heroId: myHero.id,
                path: selectedTarget.path
              });
              setSelectedTarget(null);
            }}
            type="button"
          >
            <Check size={13} /> Move there
          </button>
          <button className="commandButton ghost" onClick={() => setSelectedTarget(null)} type="button">
            <X size={13} /> Cancel
          </button>
        </div>
      ) : null}

      {iAmRotating && rotatingTile ? (
        <div className="rotateBar" role="dialog" aria-label="Rotate the new tile">
          <strong>
            {rotatingTile.tileDefId}: rotate the {pendingTileChoice?.kind === "place" ? "placed" : "revealed"} tile
          </strong>
          <button
            className="commandButton"
            onClick={() => setPreviewRotation((value) => (value + 5) % 6)}
            title="Rotate counter-clockwise"
            type="button"
          >
            <RotateCcw size={14} />
          </button>
          <span className="rotateDegrees">{previewRotation * 60}°</span>
          <button
            className="commandButton"
            onClick={() => setPreviewRotation((value) => (value + 1) % 6)}
            title="Rotate clockwise"
            type="button"
          >
            <RotateCw size={14} />
          </button>
          <button
            className="commandButton primary"
            disabled={!rotationConnected}
            onClick={() =>
              onAction({
                type: "SET_TILE_ROTATION",
                playerId: viewerPlayerId,
                tileInstanceId: rotatingTile.id,
                rotation: previewRotation
              })
            }
            type="button"
          >
            <Check size={13} /> Confirm
          </button>
          {!rotationConnected ? <small>Border lines seal the tile off — keep rotating.</small> : null}
        </div>
      ) : pendingTileChoice && rotatingTile ? (
        <div className="rotateBar passive">
          <small>
            {state.players[pendingTileChoice.playerId]?.name ?? "A player"} is rotating the new tile…
          </small>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD: round, astrologers card, resources, movement
// ---------------------------------------------------------------------------

export function AdventureHud({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const { zoomContent } = useCardZoom();
  const player = state.players[viewerPlayerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === viewerPlayerId && candidate.kind === "main"
  );
  const activeName = state.players[state.activePlayerId]?.name ?? state.activePlayerId;
  const roundKind =
    state.round <= 1 ? "first round" : state.round % 2 === 1 ? "resource round" : "astrologers round";
  const astrologersCard = getActiveAstrologersCard(state);

  const endTurn = legalActions.find((legal) => legal.action.type === "END_TURN");
  const winner = state.adventure?.winnerPlayerId;

  return (
    <div className="advHud" aria-label="Adventure status">
      <div className="advHudCell">
        <strong>Round {state.round}</strong>
        <small>{roundKind}</small>
      </div>
      <div className="advHudCell">
        <strong>{activeName}&apos;s turn</strong>
        <small>{state.phase}</small>
      </div>
      {astrologersCard ? (
        <button
          className="advHudCell astrologers"
          onClick={() =>
            zoomContent({
              title: `Astrologers proclaim: ${astrologersCard.name}`,
              lines: [astrologersCard.text],
              subtitle: "Active until the next Astrologers round"
            })
          }
          title={astrologersCard.text}
          type="button"
        >
          <strong>🔭 {astrologersCard.name}</strong>
          <small>astrologers proclaim</small>
        </button>
      ) : null}
      {player && player.id !== "neutrals" ? (
        <div className="advHudCell resources">
          <span title="Gold">🪙 {player.resources.gold}</span>
          <span title="Building materials">⚒ {player.resources.buildingMaterials}</span>
          <span title="Valuables">♦ {player.resources.valuables}</span>
          <small title="Production each resource round">
            +{player.production.gold}/+{player.production.buildingMaterials}/+{player.production.valuables} income
          </small>
        </div>
      ) : null}
      {hero ? (
        <div className="advHudCell">
          <strong>
            MP {hero.movementPoints}
          </strong>
          <small>
            level {hero.level} ·{" "}
            {player?.morale
              ? `morale ${player.morale > 0 ? "+" : ""}${player.morale}`
              : "no morale"}
          </small>
        </div>
      ) : null}
      {winner ? (
        <div className="advHudCell winner">
          <strong>{state.players[winner]?.name} wins!</strong>
        </div>
      ) : null}
      <div className="advHudButtons">
        {endTurn ? (
          <button className="commandButton" onClick={() => onAction(endTurn.action)} type="button">
            End turn
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero board, army list (unchanged behaviors, kept compact)
// ---------------------------------------------------------------------------

export function HeroBoardPanel({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const player = state.players[playerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
  );
  const heroDef = player?.heroDefId ? coreHeroDefinitions[player.heroDefId] : undefined;
  if (!player || !hero || !heroDef) {
    return null;
  }

  const faction = coreFactionDefinitions[heroDef.faction];

  return (
    <section className="heroBoard" aria-label={`${heroDef.name} hero board`}>
      <header>
        {heroDef.portrait ? (
          <img alt={`${heroDef.name} portrait`} className="heroPortrait" referrerPolicy="no-referrer" src={heroDef.portrait} />
        ) : null}
        <div>
          <strong>{heroDef.name}</strong>
          <small>
            {heroDef.class} · {heroDef.type === "might" ? "Might" : "Magic"} · {faction?.name}
          </small>
          <small>
            A{heroDef.startingStats.attack} D{heroDef.startingStats.defense} P{heroDef.startingStats.power} K
            {heroDef.startingStats.knowledge}
          </small>
        </div>
      </header>
      <div className="levelTrack" aria-label="Level tracker">
        {[1, 2, 3, 4, 5, 6, 7].map((level) => {
          const reached = hero.level >= level;
          const isSpecialty = level === 1 || SPECIALTY_LEVELS.includes(level as 4 | 6);
          return (
            <div className={`levelSlot ${reached ? "reached" : ""} ${isSpecialty ? "gold" : "silver"}`} key={level}>
              <span>{ROMAN[level]}</span>
              <small>
                {HAND_LIMIT_BY_LEVEL[level] !== HAND_LIMIT_BY_LEVEL[level - 1] ? `🂠${HAND_LIMIT_BY_LEVEL[level]}` : ""}
                {EXPERT_USES_BY_LEVEL[level] !== EXPERT_USES_BY_LEVEL[level - 1] ? "👑" : ""}
                {ABILITY_SEARCH_LEVELS.includes(level) ? "🔍" : ""}
                {isSpecialty && level > 1 ? "★" : ""}
              </small>
              {hero.level === level ? (
                <span className="levelCube" style={{ background: faction?.color }} title={`Experience ${hero.experience}/12`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <small className="heroXp">
        Experience {hero.experience}/12 · hand limit {effectiveHandLimit(state, playerId)} · expert effects{" "}
        {player.limits.expertUses}
      </small>
    </section>
  );
}

export function ArmyPanel({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const { zoomContent } = useCardZoom();
  const player = state.players[playerId];
  if (!player || player.army.length === 0) {
    return (
      <section className="armyPanel">
        <h3>Unit deck</h3>
        <small>No units. The scenario&apos;s starting units return after the next combat.</small>
      </section>
    );
  }

  return (
    <section className="armyPanel" aria-label="Unit deck">
      <h3>Unit deck ({player.army.length})</h3>
      <ul>
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const side = unit.side === "few" ? def?.few : def?.pack;
          return (
            <li key={unit.id}>
              <button
                className="armyUnitRow"
                onClick={() =>
                  zoomContent({
                    title: `${unit.side === "few" ? "Few" : "Pack of"} ${def?.name ?? unit.unitDefId}`,
                    image: side?.cardImage,
                    subtitle: def ? `${def.tier} ${def.type}` : undefined,
                    lines: [
                      side ? `Attack ${side.attack} · Defense ${side.defense} · HP ${side.health} · Initiative ${side.initiative}` : "",
                      side?.abilityText ?? ""
                    ].filter(Boolean)
                  })
                }
                title={side?.abilityText ?? `Read ${def?.name ?? unit.unitDefId}`}
                type="button"
              >
                <span className={`tierDot ${def?.tier}`} />
                <strong>
                  {unit.side === "few" ? "Few" : "Pack"} {def?.name ?? unit.unitDefId}
                </strong>
                {side ? (
                  <small>
                    A{side.attack} D{side.defense} HP{side.health} I{side.initiative}
                  </small>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Town panel with a population basket: one token, any number of purchases
// ---------------------------------------------------------------------------

type BasketRecruit = { unitDefId: string; count: number };

export function TownPanel({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [recruits, setRecruits] = useState<BasketRecruit[]>([]);
  const [reinforceIds, setReinforceIds] = useState<string[]>([]);
  // The basket empties when the round advances or the seat changes
  // (state-adjustment-during-render pattern).
  const [basketKey, setBasketKey] = useState("");
  const nextBasketKey = `${state.round}|${viewerPlayerId}`;
  if (basketKey !== nextBasketKey) {
    setBasketKey(nextBasketKey);
    setRecruits([]);
    setReinforceIds([]);
  }

  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;

  if (!player || !town || !faction) {
    return null;
  }

  const buildActions = legalActions.filter((legal) => legal.action.type === "BUILD_STRUCTURE");
  const spellBook = legalActions.find((legal) => legal.action.type === "SPELL_BOOK_ACTION");
  const canPopulate =
    player.townTokens.population && !state.combat && legalActions.some((legal) => legal.action.type === "POPULATION_ACTION");

  const unlockedTiers = new Set(
    town.buildings
      .map((buildingId) => coreBuildingDefinitions[buildingId]?.effect)
      .flatMap((effect) => (effect?.type === "UNLOCK_RECRUIT_TIER" ? [effect.tier] : []))
  );
  const canReinforce = town.buildings.some(
    (buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "UNLOCK_REINFORCE"
  );

  const addRecruit = (unitDefId: string, delta: number) => {
    setRecruits((current) => {
      const next = current.map((entry) => ({ ...entry }));
      const entry = next.find((candidate) => candidate.unitDefId === unitDefId);
      if (entry) {
        entry.count = Math.max(0, entry.count + delta);
      } else if (delta > 0) {
        next.push({ unitDefId, count: 1 });
      }
      return next.filter((candidate) => candidate.count > 0);
    });
  };

  const basketCost: Record<string, number> = {};
  const addCost = (cost: Record<string, number | undefined>, times = 1) => {
    for (const [resource, amount] of Object.entries(cost)) {
      if (amount) {
        basketCost[resource] = (basketCost[resource] ?? 0) + amount * times;
      }
    }
  };
  for (const entry of recruits) {
    const few = coreUnitDefinitions[entry.unitDefId]?.few;
    if (few) {
      addCost(few.cost, entry.count);
    }
  }
  for (const armyUnitId of reinforceIds) {
    const armyUnit = player.army.find((candidate) => candidate.id === armyUnitId);
    const pack = armyUnit ? coreUnitDefinitions[armyUnit.unitDefId]?.pack : undefined;
    if (pack) {
      addCost(pack.cost);
    }
  }
  const basketAffordable =
    (basketCost.gold ?? 0) <= player.resources.gold &&
    (basketCost.buildingMaterials ?? 0) <= player.resources.buildingMaterials &&
    (basketCost.valuables ?? 0) <= player.resources.valuables;
  const basketSize = recruits.reduce((total, entry) => total + entry.count, 0) + reinforceIds.length;

  const submitBasket = () => {
    const purchases: { kind: "recruit" | "reinforce"; unitDefId: string; armyUnitId?: string }[] = [];
    for (const entry of recruits) {
      for (let index = 0; index < entry.count; index += 1) {
        purchases.push({ kind: "recruit", unitDefId: entry.unitDefId });
      }
    }
    for (const armyUnitId of reinforceIds) {
      const armyUnit = player.army.find((candidate) => candidate.id === armyUnitId);
      if (armyUnit) {
        purchases.push({ kind: "reinforce", unitDefId: armyUnit.unitDefId, armyUnitId });
      }
    }
    onAction({ type: "POPULATION_ACTION", playerId: viewerPlayerId, purchases });
    setRecruits([]);
    setReinforceIds([]);
  };

  return (
    <section className="townPanel" aria-label={`${faction.name} town`}>
      <h3>
        {faction.name} town
        <small title="Build / Population / Spell book tokens — each once per round">
          {player.townTokens.build ? "🔨" : "▫"} {player.townTokens.population ? "👥" : "▫"}{" "}
          {player.townTokens.spellBook ? "📖" : "▫"}
        </small>
      </h3>
      <div className="townBuildings">
        {faction.buildings.map((buildingId) => {
          const building = coreBuildingDefinitions[buildingId];
          const built = town.buildings.includes(buildingId);
          const action = buildActions.find(
            (legal) => legal.action.type === "BUILD_STRUCTURE" && legal.action.buildingId === buildingId
          );
          return (
            <div className={`townBuilding ${built ? "built" : ""}`} key={buildingId} title={building?.source.credit}>
              <strong>{building?.name}</strong>
              <small>{built ? "built" : formatCost(building?.cost ?? {})}</small>
              {building?.implementationStatus === "not-implemented" ? <small className="todoTag">data only</small> : null}
              {action ? (
                <button className="commandButton" onClick={() => onAction(action.action)} type="button">
                  Build
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {player.townTokens.population && !state.combat ? (
        <div className="townRecruits" aria-label="Population token basket">
          <h4>Population token — buy any number at once</h4>
          {faction.units.map((unitDefId) => {
            const unit = coreUnitDefinitions[unitDefId];
            if (!unit?.few || !unlockedTiers.has(unit.tier)) {
              return null;
            }
            const inBasket = recruits.find((entry) => entry.unitDefId === unitDefId)?.count ?? 0;
            return (
              <div className="recruitRow" key={unitDefId}>
                <span className={`tierDot ${unit.tier}`} />
                <span className="recruitName">{unit.name}</span>
                <small>{formatCost(unit.few.cost)}</small>
                <div className="recruitCounter">
                  <button disabled={inBasket === 0} onClick={() => addRecruit(unitDefId, -1)} type="button">
                    <Minus size={11} />
                  </button>
                  <span>{inBasket}</span>
                  <button onClick={() => addRecruit(unitDefId, 1)} type="button">
                    <Plus size={11} />
                  </button>
                </div>
              </div>
            );
          })}
          {canReinforce
            ? player.army
                .filter((unit) => {
                  const def = coreUnitDefinitions[unit.unitDefId];
                  return unit.side === "few" && def?.pack && unlockedTiers.has(def.tier);
                })
                .map((unit) => {
                  const def = coreUnitDefinitions[unit.unitDefId];
                  const checked = reinforceIds.includes(unit.id);
                  return (
                    <label className="reinforceRow" key={unit.id}>
                      <input
                        checked={checked}
                        onChange={() =>
                          setReinforceIds((current) =>
                            checked ? current.filter((id) => id !== unit.id) : [...current, unit.id]
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        Reinforce {def?.name ?? unit.unitDefId} <small>({formatCost(def?.pack?.cost ?? {})})</small>
                      </span>
                    </label>
                  );
                })
            : null}
          {basketSize > 0 ? (
            <div className="basketFooter">
              <small>
                Total: {formatCost(basketCost as Record<"gold" | "buildingMaterials" | "valuables", number>)}
                {basketAffordable ? "" : " — not enough resources"}
              </small>
              <button
                className="commandButton primary"
                disabled={!basketAffordable || !canPopulate}
                onClick={submitBasket}
                type="button"
              >
                Buy {basketSize} (1 token)
              </button>
            </div>
          ) : (
            <small className="basketHint">The token flips after one purchase action — stock up in one go.</small>
          )}
        </div>
      ) : null}

      <div className="townFooter">
        {spellBook ? (
          <button className="commandButton" onClick={() => onAction(spellBook.action)} type="button">
            {spellBook.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prompt tray for pending visit steps / choices
// ---------------------------------------------------------------------------

export function PromptTray({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const visit = state.adventure?.pendingVisit;
  const choice = state.pendingChoice;

  const visitActions = legalActions.filter(
    (legal) => legal.action.type === "RESOLVE_VISIT_STEP" || legal.action.type === "TRADE_RESOURCES"
  );
  const optionActions = legalActions.filter((legal) => legal.action.type === "CHOOSE_OPTION");
  const combatGate = legalActions.filter(
    (legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT" || legal.action.type === "RETREAT_FROM_COMBAT"
  );

  let title: string | null = null;
  let body: LegalAction[] = [];

  if (choice?.type === "OPTION_CHOICE" && choice.playerId === viewerPlayerId) {
    title = choice.prompt;
    body = optionActions;
  } else if (visit && visit.playerId === viewerPlayerId && visitActions.length > 0) {
    const step = visit.steps[0];
    const field = state.adventure?.fields[visit.fieldId];
    title =
      step?.type === "CHOOSE_ONE"
        ? step.prompt
        : step?.type === "PAY_TO"
          ? step.prompt
          : `${locationDefinitions[field?.location ?? ""]?.name ?? "Field"}: choose`;
    body = visitActions;
  } else if (combatGate.length > 0) {
    title = "The combat round is over";
    body = combatGate;
  }

  if (!title || body.length === 0) {
    return null;
  }

  return (
    <div className="promptTray" role="dialog" aria-label={title}>
      <strong>{title}</strong>
      <div className="promptOptions">
        {body.map((legal) => (
          <button className="commandButton" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
            {legal.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Far tile tray: face-down Ⅱ–Ⅲ backs in the player's supply
// ---------------------------------------------------------------------------

export function FarTileTray({
  state,
  view,
  viewerPlayerId,
  placement,
  onTogglePlacement
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  placement: TilePlacementSelection;
  onTogglePlacement: (placement: TilePlacementSelection) => void;
}) {
  const tiles = view.adventure?.playerFarTiles[viewerPlayerId] ?? [];
  if (tiles.length === 0 || state.activePlayerId !== viewerPlayerId) {
    return null;
  }

  return (
    <div className="farTileTray" aria-label="Your far tiles">
      <small>Far (Ⅱ–Ⅲ) tiles — 1 MP to place at the border, touching two tiles:</small>
      {tiles.map((_, index) => (
        <button
          className={`farTileBack ${placement?.supplyIndex === index ? "selected" : ""}`}
          key={index}
          onClick={() => onTogglePlacement(placement?.supplyIndex === index ? null : { supplyIndex: index })}
          title="Face-down Far tile — contents stay hidden until placed"
          type="button"
        >
          Ⅱ–Ⅲ
        </button>
      ))}
      {placement ? <small className="farTileHint">Click a glowing spot on the map border.</small> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decks rail and discard piles
// ---------------------------------------------------------------------------

export function AdventureDecksPanel({
  view,
  viewerPlayerId,
  onShowPile
}: {
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  onShowPile: (title: string, cardIds: string[], kind: "cards" | "units" | "astrologers") => void;
}) {
  const player = view.players[viewerPlayerId];

  const sharedDecks: { id: string; name: string }[] = [
    { id: "spells", name: "Spells" },
    { id: "abilities", name: "Abilities" },
    { id: "artifacts", name: "Artifacts" }
  ];

  const astrologers = view.decks.astrologers;

  return (
    <section className="advDecks" aria-label="Decks and discard piles">
      {player ? (
        <div className="advDeckRow own">
          <div className="advDeck" title="Your draw deck (face down)">
            <div className="cardBack small">
              <span>H3</span>
            </div>
            <small>Deck {player.deckCount}</small>
          </div>
          <button
            className="advDiscard"
            onClick={() => onShowPile(`${player.name} — discard pile`, player.discard, "cards")}
            type="button"
          >
            <span>{player.discard.length}</span>
            <small>Discard</small>
          </button>
        </div>
      ) : null}
      {sharedDecks.map((deck) => {
        const deckState = view.decks[deck.id];
        if (!deckState) {
          return null;
        }
        return (
          <div className="advDeckRow" key={deck.id}>
            <div className="advDeck" title={`${deck.name} deck (face down)`}>
              <div className="cardBack small shared">
                <span>{deck.name[0]}</span>
              </div>
              <small>
                {deck.name} {deckState.drawCount}
              </small>
            </div>
            <button
              className="advDiscard"
              onClick={() => onShowPile(`${deck.name} — discard pile`, deckState.discardPile, "cards")}
              type="button"
            >
              <span>{deckState.discardPile.length}</span>
              <small>Discard</small>
            </button>
          </div>
        );
      })}
      {astrologers ? (
        <div className="advDeckRow">
          <div className="advDeck" title="Astrologers Proclaim deck (drawn every even round)">
            <div className="cardBack small astrologers">
              <span>🔭</span>
            </div>
            <small>Astrologers {astrologers.drawCount}</small>
          </div>
          <button
            className="advDiscard"
            onClick={() => onShowPile("Astrologers Proclaim — past rounds", astrologers.discardPile, "astrologers")}
            type="button"
          >
            <span>{astrologers.discardPile.length}</span>
            <small>Past</small>
          </button>
        </div>
      ) : null}
      <div className="advDeckRow neutral">
        {(["bronze", "silver", "gold", "azure"] as const).map((tier) => {
          const deckState = view.decks[NEUTRAL_DECK_IDS[tier]];
          if (!deckState) {
            return null;
          }
          return (
            <button
              className={`neutralDeck ${tier}`}
              key={tier}
              onClick={() => onShowPile(`Neutral ${tier} — discard pile`, deckState.discardPile, "units")}
              title={`Neutral ${tier} deck: ${deckState.drawCount} cards, ${deckState.discardPile.length} discarded`}
              type="button"
            >
              <span>{deckState.drawCount}</span>
              <small>{tier}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PileModal({
  title,
  cardIds,
  kind,
  onClose
}: {
  title: string;
  cardIds: string[];
  kind: "cards" | "units" | "astrologers";
  onClose: () => void;
}) {
  return (
    <div className="pileModalBackdrop" onClick={onClose} role="dialog" aria-label={title}>
      <div className="pileModal" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{title}</strong>
          <button className="commandButton ghost" onClick={onClose} type="button">
            Close
          </button>
        </header>
        {cardIds.length === 0 ? <small>Empty.</small> : null}
        <PileModalCards cardIds={cardIds} kind={kind} />
      </div>
    </div>
  );
}

function PileModalCards({ cardIds, kind }: { cardIds: string[]; kind: "cards" | "units" | "astrologers" }) {
  const { zoomCard, zoomContent } = useCardZoom();

  return (
    <ul>
      {[...cardIds].reverse().map((cardId, index) => {
        const card = kind === "cards" ? cardLibrary[cardId] : undefined;
        const unit = kind === "units" ? coreUnitDefinitions[cardId] : undefined;
        const astro = kind === "astrologers" ? astrologersCardDefinitions[cardId] : undefined;
        const image = card?.assets?.cardImage ?? unit?.neutral?.cardImage;
        const zoom = () =>
          card
            ? zoomCard(cardId)
            : zoomContent({
                title: astro?.name ?? unit?.name ?? cardId,
                image,
                subtitle: astro ? "Astrologers Proclaim" : unit ? `${unit.tier} ${unit.type}` : undefined,
                lines: [astro?.text ?? unit?.neutral?.abilityText ?? ""].filter(Boolean)
              });
        return (
          <li key={`${cardId}-${index}`}>
            <button className="pileCardButton" onClick={zoom} title="Read card" type="button">
              {image ? (
                <img alt={card?.name ?? unit?.name ?? cardId} loading="lazy" referrerPolicy="no-referrer" src={image} />
              ) : (
                <div className="pileFallback">{astro?.name ?? card?.name ?? unit?.name ?? cardName(cardId)}</div>
              )}
              <small>
                {index === 0 ? "top · " : ""}
                {astro?.name ?? card?.name ?? unit?.name ?? cardId}
              </small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Combat deployment panel (unchanged)
// ---------------------------------------------------------------------------

export function PlacementPanel({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const combat = state.combat;
  const setup = combat?.setup;
  const player = state.players[viewerPlayerId];
  if (!combat || !setup || !player) {
    return null;
  }

  const myTurn = setup.pendingPlayerIds[0] === viewerPlayerId;
  const placed = setup.placedUnitIds[viewerPlayerId] ?? [];

  const placeActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }> } =>
      legal.action.type === "PLACE_COMBAT_UNIT"
  );
  const finish = legalActions.find((legal) => legal.action.type === "FINISH_COMBAT_PLACEMENT");
  const unplaceActions = legalActions.filter((legal) => legal.action.type === "UNPLACE_COMBAT_UNIT");

  const cellsForSelected = selectedUnitId
    ? placeActions.filter((legal) => legal.action.armyUnitId === selectedUnitId)
    : [];

  if (!myTurn) {
    const waitingOn = state.players[setup.pendingPlayerIds[0]]?.name ?? "the other side";
    return (
      <div className="placementPanel" aria-label="Combat setup">
        <strong>Combat setup</strong>
        <small>Waiting for {waitingOn} to deploy their army…</small>
      </div>
    );
  }

  return (
    <div className="placementPanel" aria-label="Deploy your units">
      <strong>
        Deploy up to {setup.unitLimit} units ({placed.length} placed)
      </strong>
      <div className="placementUnits">
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const isPlaced = placed.includes(unit.id);
          const canPlace = placeActions.some((legal) => legal.action.armyUnitId === unit.id);
          return (
            <button
              className={`placementUnit ${selectedUnitId === unit.id ? "selected" : ""} ${isPlaced ? "placed" : ""}`}
              disabled={!canPlace && !isPlaced}
              key={unit.id}
              onClick={() => {
                if (isPlaced) {
                  const unplace = unplaceActions.find(
                    (legal) => legal.action.type === "UNPLACE_COMBAT_UNIT" && legal.action.armyUnitId === unit.id
                  );
                  if (unplace) {
                    onAction(unplace.action);
                  }
                  return;
                }
                setSelectedUnitId(selectedUnitId === unit.id ? null : unit.id);
              }}
              type="button"
            >
              <span className={`tierDot ${def?.tier}`} />
              {unit.side} {def?.name ?? unit.unitDefId}
              {isPlaced ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      {selectedUnitId ? (
        <div className="placementCells">
          {cellsForSelected.map((legal) => (
            <button
              className="commandButton"
              key={actionKey(legal.action)}
              onClick={() => {
                onAction(legal.action);
                setSelectedUnitId(null);
              }}
              type="button"
            >
              {legal.label.split(" at ")[1] ?? legal.label}
            </button>
          ))}
          {cellsForSelected.length === 0 ? <small>No free spaces.</small> : null}
        </div>
      ) : (
        <small>Pick a unit, then a deployment space. Back line: row E. Front line: row D.</small>
      )}
      {finish ? (
        <button className="commandButton primary" onClick={() => onAction(finish.action)} type="button">
          Ready for battle
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map-setup lobby: pick a faction and hero, then start the adventure
// ---------------------------------------------------------------------------

export function SetupLobbyScreen({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }

  const mySeat = lobby.seats.find((seat) => seat.playerId === viewerPlayerId);
  const allChosen = lobby.seats.every((seat) => seat.factionId && seat.heroDefId);
  const takenByOthers = new Set(
    lobby.seats.filter((seat) => seat.playerId !== viewerPlayerId).map((seat) => seat.factionId)
  );

  return (
    <section className="setupLobby" aria-label="Map setup">
      <header>
        <h2>Map setup — {lobby.scenarioId}</h2>
        <p>
          Each seat picks a faction and main hero. The starting tile, town, units, resources and income come from the
          scenario sheet; starting tiles sit at fixed map positions and are never rotated.
        </p>
      </header>

      <div className="lobbySeats">
        {lobby.seats.map((seat) => {
          const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
          const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
          return (
            <div className={`lobbySeat ${seat.playerId === viewerPlayerId ? "mine" : ""}`} key={seat.playerId}>
              <strong>{state.players[seat.playerId]?.name ?? seat.name}</strong>
              {faction && hero ? (
                <small>
                  {faction.name} — {hero.name} ({hero.class})
                </small>
              ) : (
                <small>choosing…</small>
              )}
            </div>
          );
        })}
      </div>

      {mySeat ? (
        <div className="factionGrid" aria-label="Pick a faction and hero">
          {Object.values(coreFactionDefinitions).map((faction) => {
            const taken = takenByOthers.has(faction.id);
            return (
              <div className={`factionCard ${taken ? "taken" : ""}`} key={faction.id} style={{ borderColor: faction.color }}>
                <strong style={{ color: faction.color }}>{faction.name}</strong>
                {faction.ignoresMorale ? <small>ignores morale</small> : null}
                <div className="factionHeroes">
                  {faction.heroes.map((heroDefId) => {
                    const hero = coreHeroDefinitions[heroDefId];
                    const selected = mySeat.factionId === faction.id && mySeat.heroDefId === heroDefId;
                    return (
                      <button
                        className={`lobbyHero ${selected ? "selected" : ""}`}
                        disabled={taken}
                        key={heroDefId}
                        onClick={() =>
                          onAction({
                            type: "CHOOSE_FACTION",
                            playerId: viewerPlayerId,
                            factionId: faction.id,
                            heroDefId
                          })
                        }
                        type="button"
                      >
                        {hero?.portrait ? (
                          <img alt={`${hero.name} portrait`} referrerPolicy="no-referrer" src={hero.portrait} />
                        ) : null}
                        <span>{hero?.name ?? heroDefId}</span>
                        <small>
                          {hero?.class} · {hero?.type}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="observerNote">Observer: waiting for the players to finish map setup.</p>
      )}

      {mySeat ? (
        <button
          className="commandButton primary startAdventure"
          disabled={!allChosen}
          onClick={() => onAction({ type: "START_ADVENTURE", playerId: viewerPlayerId })}
          type="button"
        >
          {allChosen ? "Start the adventure" : "Waiting for every seat to pick…"}
        </button>
      ) : null}
    </section>
  );
}

export function titleCaseLocation(location: string): string {
  return titleCase(location);
}
