"use client";

/* eslint-disable @next/next/no-img-element -- battlefield art layers, not content images */

// ---------------------------------------------------------------------------
// Hex Battlefield (Battlefield Expansion board, PC-style presentation).
//
// Only presentation lives here: the engine owns positions, legality and every
// action; BattlefieldBoard keeps rendering one button per hex with the same
// interaction branches as the 4x5 board, and asks this module for the hex
// placement, the unit figure and the art layers.
//
// Layout is a virtual 800x556 space (the PC combat backdrop): 13x9 pointy-top
// hexes shaped like the PC's (taller than a regular hex), even rows shifted
// half a hex right, attacker zone on the left. The seat flip mirrors x. Hit testing is by hex (as in the PC game): each cell's
// hex face takes the clicks, creature sprites never do.
// ---------------------------------------------------------------------------

import { useMemo, useState, type CSSProperties } from "react";
import { assetUrl } from "@/lib/asset-url";
import {
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldPositions,
  getHexDeploymentZone,
  isHexPosition
} from "@/engine/battlefield";
import { hexBattlefieldsForBoardArt } from "@/engine/combat-board-art";
import { HEX_SHIP_BATTLE_OBSTACLES, hexBattlefieldObstacles } from "@/engine/hex-battlefield";
import { PC_OBSTACLES, type PcObstacleDefinition } from "@/engine/hex-pc-obstacles";
import type { CombatBoardArtId, CombatState, CombatUnitState, GameAction, GameEvent, GameState, LegalAction, PlayerId } from "@/engine";
import { effectiveInitiative, polishSpellBookEnabled, spellBookRuleEnabled } from "@/engine";
import { isSpellCard } from "@/engine/ruleset";
import { isArrowTowerUnit } from "@/engine/siege";
import { cardLibrary } from "@/data/cards/library";
import { hexMoveDurationMs } from "@/data/battle-hex/creature-sprites";
import { getFxSheet } from "@/data/fx";
import siegeArt from "@/data/battle-hex/siege-art.json";
import { formatEvent } from "./utils";

export const HEX_BOARD_WIDTH = 800;
export const HEX_BOARD_HEIGHT = 556;
/**
 * The PC board, pixel for pixel (user ruling 2026-09-26: "make it close to PC",
 * replacing the enlarged 52/55-unit hexes): the board is the PC's 800x556
 * battlefield, and H3 draws its combat hexes 44 px wide and 52 px tall (tip to
 * tip) on a 42 px row step — taller than a regular hex, with long upright
 * sides. The Battlefield Expansion's 13x9 hexes sit on the PC grid's columns
 * 2-14 and rows 1-9 (PC hex rect: x = 14 + 44·col (+22 on indented rows), y =
 * 86 + 42·row) — the PC's 15x11 field less its outer ring, starting right
 * under the heroes — so every hex, creature, obstacle and hero stands at the
 * PC's size against the whole field.
 */
const HEX_WIDTH = 44;
const PC_SCALE = HEX_WIDTH / 44;
const PC_SCALE_X = PC_SCALE;
const PC_SCALE_Y = PC_SCALE;
/** Tip-to-tip height, half of it (centre to top tip), the row step and the height of a pointed cap. */
const HEX_HEIGHT = 52 * PC_SCALE;
const HEX_RADIUS = HEX_HEIGHT / 2;
const HEX_ROW_STEP = 42 * PC_SCALE;
const HEX_CAP = HEX_HEIGHT - HEX_ROW_STEP;
/** PC column 2, row 1 (the board indents its even rows). */
const GRID_LEFT = 14 + 2 * 44;
const GRID_TOP = 86 + 42;

/**
 * Creature / hero art scale on the hex board: exactly the PC's — one H3 pixel
 * per PC pixel of hex (user ruling 2026-09-26, replacing the earlier "10%
 * smaller"), so creatures, heroes, obstacles and spell effects stand against
 * the hexes exactly as on the PC and a two-hex creature spans its two hexes.
 */
export const HEX_SPRITE_SCALE = PC_SCALE;

const PC_OBSTACLE_BY_ID = new Map(PC_OBSTACLES.map((obstacle) => [obstacle.id, obstacle]));

/** Generic single-hex rocks for an obstacle hex that has no Heroes 3 obstacle of its own. */
const LOOSE_OBSTACLE_ART = "/assets/battle-hex/obstacles/rocks.webp";

export function isHexCombat(combat: Pick<CombatState, "geometry"> | null | undefined): boolean {
  return combat?.geometry === "hex";
}

/** Hex centre in board units (flip mirrors x). */
export function hexCellCenter(position: number, flipped: boolean): { x: number; y: number } {
  const { row, column } = getBattlefieldCoordinates(position);
  const x = GRID_LEFT + HEX_WIDTH / 2 + column * HEX_WIDTH + (row % 2 === 0 ? HEX_WIDTH / 2 : 0);
  const y = GRID_TOP + HEX_RADIUS + row * HEX_ROW_STEP;
  return { x: flipped ? HEX_BOARD_WIDTH - x : x, y };
}

/** The absolutely positioned hex box of a cell (percent of the board). */
export function hexCellStyle(position: number, flipped: boolean): CSSProperties {
  const { x, y } = hexCellCenter(position, flipped);
  const { row } = getBattlefieldCoordinates(position);
  return {
    position: "absolute",
    left: `${((x - HEX_WIDTH / 2) / HEX_BOARD_WIDTH) * 100}%`,
    top: `${((y - HEX_RADIUS) / HEX_BOARD_HEIGHT) * 100}%`,
    width: `${(HEX_WIDTH / HEX_BOARD_WIDTH) * 100}%`,
    height: `${(HEX_HEIGHT / HEX_BOARD_HEIGHT) * 100}%`,
    // Lower rows stand in front (their sprites overlap the rows behind).
    zIndex: 10 + row
  };
}

/** The PC hex outline around a centre: pointed caps, long upright sides. */
function hexPoints(x: number, y: number): string {
  const w = HEX_WIDTH / 2;
  const h = HEX_RADIUS;
  const side = h - HEX_CAP;
  return [
    [x, y - h], [x + w, y - side], [x + w, y + side], [x, y + h], [x - w, y + side], [x - w, y - side]
  ].map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ");
}

export function parseCellAnchor(anchor: string | undefined): number | null {
  if (!anchor) return null;
  if (anchor.startsWith("cell:")) {
    const position = Number(anchor.slice(5));
    return Number.isFinite(position) ? position : null;
  }
  if (anchor.startsWith("unit:") && typeof document !== "undefined") {
    const id = anchor.slice(5);
    const el = document.querySelector(`[data-fx-unit="${CSS.escape(id)}"]`);
    const cell = el?.getAttribute("data-fx-cell");
    return cell !== null && cell !== undefined ? Number(cell) : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backdrop, grid and board art
// ---------------------------------------------------------------------------

export function HexBattlefieldBackdrop({
  boardArtId,
  flipped,
  combat,
  siegeTown
}: {
  boardArtId: string;
  flipped: boolean;
  combat: CombatState;
  /** The defending town's siege set (siegeTownOf); only read in a siege. */
  siegeTown?: string;
}) {
  const zones = useMemo(
    () => new Set([...getHexDeploymentZone("attacker"), ...getHexDeploymentZone("defender")]),
    []
  );
  const battlefield = combat.hexBattlefield ?? hexBattlefieldsForBoardArt(boardArtId as CombatBoardArtId)[0];
  const backdrop = `/assets/battle-hex/battlefields/${battlefield}.webp`;
  const obstacleTokens = combat.hexObstacleTokens ?? [];
  const deploying = Boolean(combat.setup);
  const obstacles = new Set(combat.obstacles ?? []);
  // The boat battlefield's water gap is painted by the backdrop itself.
  const paintedWater = new Set(boardArtId === "ship-battle" ? HEX_SHIP_BATTLE_OBSTACLES : []);
  // Obstacles that belong to no random token (sandbox presets, scripted or
  // ability-placed obstacles) still need a visible piece: the cells themselves
  // draw nothing on the hex board. They take this battlefield's own one-hex
  // obstacle (rocks when it has none).
  const looseObstacles = [...obstacles].filter(
    (cell) => isHexPosition(cell) && !paintedWater.has(cell) &&
      !obstacleTokens.some((token) => token.cells.includes(cell))
  );
  const looseKind = hexBattlefieldObstacles(battlefield).find(
    (obstacle) => obstacle.tiles.length === 1 && obstacle.tiles[0][0] === 0 && obstacle.tiles[0][1] === 0
  );
  const siege = combat.siege ?? null;
  const town = siegeArtFor(siegeTown);
  return (
    <>
      <div aria-hidden="true" className={flipped ? "hexBackdropWrap flipped" : "hexBackdropWrap"}>
        {siege ? (
          <HexSiegeBackdrop town={town} />
        ) : (
          <img alt="" className="hexBackdrop" referrerPolicy="no-referrer" src={assetUrl(backdrop)} />
        )}
      </div>
      <svg
        aria-hidden="true"
        className="hexGrid"
        preserveAspectRatio="none"
        viewBox={`0 0 ${HEX_BOARD_WIDTH} ${HEX_BOARD_HEIGHT}`}
      >
        {getBattlefieldPositions("hex").map((position) => {
          const { x, y } = hexCellCenter(position, flipped);
          return (
            <polygon
              // The deployment zones are shaded only while armies deploy (the PC
              // shows a clean grid once the battle is on).
              className={deploying && zones.has(position) ? "hexGridCell deployZone" : "hexGridCell"}
              key={position}
              points={hexPoints(x, y)}
            />
          );
        })}
      </svg>
      <div aria-hidden="true" className="hexBoardArt">
        {obstacleTokens
          .filter((token) => token.cells.every((cell) => obstacles.has(cell)))
          .map((token) => {
            const obstacle = PC_OBSTACLE_BY_ID.get(token.kind);
            return obstacle ? (
              <PcObstacleArt anchor={token.anchor} cells={token.cells} flipped={flipped} key={token.id} obstacle={obstacle} />
            ) : null;
          })}
        {looseObstacles.map((cell) =>
          looseKind ? (
            <PcObstacleArt anchor={cell} cells={[cell]} flipped={flipped} key={`loose-${cell}`} obstacle={looseKind} />
          ) : (
            <HexTokenArt art={LOOSE_OBSTACLE_ART} cells={[cell]} flipped={flipped} key={`loose-${cell}`} kind="rocks" />
          )
        )}
        {siege?.hexTokens ? <HexSiegeScene combat={combat} flipped={flipped} town={town} /> : null}
        {(combat.battlefieldTokens ?? [])
          .filter((token) => (token.extraCells?.length ?? 0) > 0)
          .map((token) => (
            // A multi-hex wall token (Force Field / Fire Wall / Ladybird Wall):
            // the board cell draws its anchor's mark; its further hexes are
            // drawn here so the wall reads across every hex it covers.
            <HexTokenArt
              art={HEX_WALL_TOKEN_ART[token.kind]}
              cells={token.extraCells ?? []}
              flipped={flipped}
              key={token.id}
              kind={`wallToken ${token.kind}`}
              sprite={HEX_WALL_TOKEN_SPRITE[token.kind]}
            />
          ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Siege: the defending town's own PC scene
// ---------------------------------------------------------------------------

/** One piece of a town's siege scene: its PC position (top-left) and size, in board units. */
type SiegeArtPiece = { x: number; y: number; width: number; height: number };

/**
 * Every town's PC siege scene (scripts/build-siege-art.mjs): backdrop, moat,
 * background wall, keep, corner towers, walls (intact / ruin), static wall
 * pieces, gate arch and drawbridge (intact / ruin), at the PC's pixel
 * positions; plus the keep guard's PC creature position and sprite.
 */
const SIEGE_ART = siegeArt as Readonly<
  Record<
    string,
    {
      pieces: Readonly<Record<string, SiegeArtPiece>>;
      /** Top-left of the guard's 450x400 H3 creature canvas (VCMI towers.keep.creature). */
      keepGuard: { x: number; y: number } | null;
      guardSprite: string | null;
    }
  >
>;

/** Towns without a PC siege of their own borrow the nearest one. */
const SIEGE_TOWN_FALLBACK: Readonly<Record<string, string>> = {
  forge: "factory",
  azur_lane: "cove",
  hidden_leaf: "rampart",
  azure_breeze: "rampart",
  heavenly_demon: "inferno",
  blue_archive: "tower",
  imperium: "castle",
  fuyuki: "castle",
  little_busters: "castle",
  mgq: "castle"
};

/**
 * The siege set of the town being defended: the fought-over town field's
 * faction, else the town owner's, else the defender's; Castle when none has a
 * set (a neutral Random Town without a faction).
 */
export function siegeTownOf(state: GameState, combat: CombatState): string {
  const fieldId = "fieldId" in combat.context ? combat.context.fieldId : undefined;
  const faction =
    (fieldId ? state.adventure?.fields[fieldId]?.faction : undefined) ??
    (combat.siege ? state.players[combat.siege.townPlayerId]?.factionId : undefined) ??
    state.players[combat.defenderPlayerId]?.factionId;
  if (faction && SIEGE_ART[faction]) return faction;
  const fallback = faction ? SIEGE_TOWN_FALLBACK[faction] : undefined;
  return fallback && SIEGE_ART[fallback] ? fallback : "castle";
}

function siegeArtFor(town: string | undefined): string {
  return town && SIEGE_ART[town] ? town : "castle";
}

/**
 * The PC draws its wall one hex column further toward the attacker than the
 * rulebook board's Wall column (its gate sits on PC columns 10-11, the board's
 * Gate on 11-12), so the whole scene moves one column (44 px) toward the
 * defender: the drawbridge then lies on the board's Gate hexes and the wall
 * pieces on its Wall hexes. The keep stays where the PC stands it.
 */
const SIEGE_SCENE_SHIFT = HEX_WIDTH;

/** How far the keep moves left to stand wholly on the board (0 when it already does). */
function keepShift(pieces: Readonly<Record<string, SiegeArtPiece>>): number {
  const keep = pieces.keep ?? pieces["keep-ruin"];
  return keep ? Math.min(0, HEX_BOARD_WIDTH - keep.width - keep.x) : 0;
}

/**
 * The keep's guard (the town's siege shooter: Castle Archer, Rampart Wood Elf,
 * Tower Mage…): the creature the Arrow Tower is drawn as, standing on the keep
 * where the PC stands it — its feet where an H3 creature's feet fall on its
 * 450x400 canvas (x 196 mirrored for a left-facing defender, y 266). Board
 * units, unmirrored (the figure mirrors for the flipped seat); null when the
 * town has no guard.
 */
export function siegeKeepGuard(town: string | undefined): { slug: string; x: number; y: number } | null {
  const art = SIEGE_ART[siegeArtFor(town)];
  if (!art?.keepGuard || !art.guardSprite) return null;
  return { slug: art.guardSprite, x: art.keepGuard.x + (450 - 196) + keepShift(art.pieces), y: art.keepGuard.y + 266 };
}

/**
 * The town's siege backdrop, shifted with the scene. The strip it uncovers on
 * the attacker's edge shows the backdrop's own edge mirrored (seamless ground).
 */
function HexSiegeBackdrop({ town }: { town: string }) {
  const src = assetUrl(`/assets/battle-hex/siege/${town}/back.webp`);
  const shift = (SIEGE_SCENE_SHIFT / HEX_BOARD_WIDTH) * 100;
  return (
    <>
      <img
        alt=""
        className="hexBackdrop siegeBackdropFill"
        referrerPolicy="no-referrer"
        src={src}
        style={{ left: `${shift - 100}%` }}
      />
      <img alt="" className="hexBackdrop siegeBackdrop" referrerPolicy="no-referrer" src={src} style={{ left: `${shift}%` }} />
    </>
  );
}

/**
 * The town's siege pieces over the board. Each Wall / Gate token of the
 * printed layout drives the PC piece standing on it (intact while the token
 * stands, its ruin once destroyed); the keep is the Arrow Tower (standing, or
 * its ruin once the tower falls; absent when the siege has no tower). Pieces
 * stack with the hex rows (z 10 + row, like the creatures), so a creature in
 * front of a wall draws over it; the moat and a broken drawbridge lie on the
 * ground under everything.
 */
function HexSiegeScene({ combat, flipped, town }: { combat: CombatState; flipped: boolean; town: string }) {
  const art = (SIEGE_ART[town] ?? SIEGE_ART.castle).pieces;
  const siege = combat.siege;
  if (!siege) return null;
  const standing = new Set((siege.hexTokens ?? []).map((token) => token.id));
  // The engine clears arrowTowerUnitId when the tower falls; its unit stays, so
  // fall back to it to draw the keep ruin.
  const tower = siege.arrowTowerUnitId
    ? combat.units[siege.arrowTowerUnitId]
    : Object.values(combat.units).find(isArrowTowerUnit);
  const towerStands = Boolean(tower && tower.damage < tower.maxHealth);
  const token = (id: string, piece: string) => (standing.has(id) ? piece : `${piece}-ruin`);
  const GROUND = 5;
  const pieces: Array<[name: string, z: number]> = [
    ["moat", GROUND],
    ["moat-bank", GROUND],
    ["background-wall", 10],
    ...(tower
      ? towerStands
        ? // The guard (hex-figures HexKeepGuard, z 11) stands between the two.
          ([["keep", 11], ["keep-battlement", 13]] as Array<[string, number]>)
        : ([["keep-ruin", 11]] as Array<[string, number]>)
      : []),
    // The corner towers are scenery: only the keep's guard shoots.
    ["tower-upper", 10],
    ["tower-upper-battlement", 10],
    [token("wall-1", "wall-upper"), 10],
    ["static-top", 12],
    [token("wall-2", "wall-over-gate"), 13],
    ["gate-arch", 14],
    standing.has("gate") ? ["gate", 14] : ["gate-ruin", GROUND],
    [token("wall-4", "wall-below-gate"), 16],
    ["static-bottom", 17],
    [token("wall-5", "wall-bottom"), 18],
    ["tower-bottom", 18],
    ["tower-bottom-battlement", 18]
  ];
  return (
    <>
      {pieces.map(([name, z]) => {
        const piece = art[name];
        if (!piece) return null;
        const keep = name.startsWith("keep");
        // The keep keeps its PC spot (fully on the board); the rest moves with the scene.
        const x = keep ? piece.x + keepShift(art) : piece.x + SIEGE_SCENE_SHIFT;
        const left = flipped ? HEX_BOARD_WIDTH - x - piece.width : x;
        return (
          <img
            alt=""
            className="hexSiegePiece"
            key={name}
            src={assetUrl(`/assets/battle-hex/siege/${town}/${name}.webp`)}
            style={{
              left: `${(left / HEX_BOARD_WIDTH) * 100}%`,
              top: `${(piece.y / HEX_BOARD_HEIGHT) * 100}%`,
              width: `${(piece.width / HEX_BOARD_WIDTH) * 100}%`,
              height: `${(piece.height / HEX_BOARD_HEIGHT) * 100}%`,
              zIndex: z,
              transform: flipped ? "scaleX(-1)" : undefined
            }}
          />
        );
      })}
    </>
  );
}

/**
 * A Heroes 3 obstacle drawn the way the PC game draws it: its image's left edge
 * on the anchor hex's left edge and its bottom 16 px below the anchor's centre
 * (PC pixels, scaled onto this board), so the art sits on the hexes it blocks.
 */
function PcObstacleArt({
  obstacle,
  anchor,
  cells,
  flipped
}: {
  obstacle: PcObstacleDefinition;
  anchor: number;
  cells: readonly number[];
  flipped: boolean;
}) {
  if (!isHexPosition(anchor)) {
    return null;
  }
  const { x, y } = hexCellCenter(anchor, flipped);
  const width = obstacle.width * PC_SCALE_X;
  const height = obstacle.height * PC_SCALE_Y;
  const bottom = y + 16 * PC_SCALE_Y;
  const left = flipped ? x + 22 * PC_SCALE_X - width : x - 22 * PC_SCALE_X;
  const bottomRow = Math.max(...cells.map((cell) => getBattlefieldCoordinates(cell).row));
  return (
    <img
      alt=""
      className="hexPcObstacle"
      src={assetUrl(`/assets/battle-hex/pc-obstacles/${obstacle.id}.webp`)}
      style={{
        left: `${(left / HEX_BOARD_WIDTH) * 100}%`,
        top: `${((bottom - height) / HEX_BOARD_HEIGHT) * 100}%`,
        width: `${(width / HEX_BOARD_WIDTH) * 100}%`,
        height: `${(height / HEX_BOARD_HEIGHT) * 100}%`,
        zIndex: 10 + bottomRow,
        transform: flipped ? "scaleX(-1)" : undefined
      }}
    />
  );
}

/** Wall tokens drawn from their H3 obstacle sprite (the same sheets the board cell animates). */
const HEX_WALL_TOKEN_SPRITE: Partial<Record<string, string>> = {
  force_field: "force-field",
  fire_wall: "fire-wall-e"
};

/** Wall tokens drawn from a still image (the Ladybird of Luck card lying as a Wall). */
const HEX_WALL_TOKEN_ART: Partial<Record<string, string>> = {
  artifact_wall: "/game-tokens/ladybird-of-luck.webp"
};

/**
 * One multi-hex token's art: a still image stretched over the bounding box of
 * its hexes, or — with `sprite` (an fx sheet key) — one standing frame of that
 * sheet on EACH hex, bottom-anchored like the board cell's token sprite.
 */
function HexTokenArt({
  art,
  cells,
  flipped,
  kind,
  sprite
}: {
  art: string | undefined;
  cells: readonly number[];
  flipped: boolean;
  kind: string;
  sprite?: string;
}) {
  const sheet = sprite ? getFxSheet(sprite) : undefined;
  if (sheet) {
    // A solid middle frame (the Force Field sheet fades in/out at its ends).
    const frame = Math.floor(sheet.frames / 2);
    const column = frame % sheet.cols;
    const row = Math.floor(frame / sheet.cols);
    const width = HEX_WIDTH * 0.8;
    const height = (width * sheet.frameHeight) / sheet.frameWidth;
    return (
      <>
        {cells.filter(isHexPosition).map((cell) => {
          const { x, y } = hexCellCenter(cell, flipped);
          const bottom = y + HEX_RADIUS * 0.6;
          return (
            <span
              className={`hexTokenArt ${kind}`}
              key={cell}
              style={{
                left: `${((x - width / 2) / HEX_BOARD_WIDTH) * 100}%`,
                top: `${((bottom - height) / HEX_BOARD_HEIGHT) * 100}%`,
                width: `${(width / HEX_BOARD_WIDTH) * 100}%`,
                height: `${(height / HEX_BOARD_HEIGHT) * 100}%`,
                zIndex: 10 + getBattlefieldCoordinates(cell).row,
                backgroundImage: `url(${assetUrl(sheet.src)})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
                backgroundPosition: `${sheet.cols > 1 ? (column / (sheet.cols - 1)) * 100 : 0}% ${
                  sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0
                }%`
              }}
            />
          );
        })}
      </>
    );
  }
  const centers = cells.filter(isHexPosition).map((cell) => hexCellCenter(cell, flipped));
  if (!art || centers.length === 0) {
    return null;
  }
  const minX = Math.min(...centers.map((c) => c.x)) - HEX_WIDTH / 2;
  const maxX = Math.max(...centers.map((c) => c.x)) + HEX_WIDTH / 2;
  const minY = Math.min(...centers.map((c) => c.y)) - HEX_RADIUS;
  const maxY = Math.max(...centers.map((c) => c.y)) + HEX_RADIUS;
  const bottomRow = Math.max(...cells.map((cell) => getBattlefieldCoordinates(cell).row));
  return (
    <img
      alt=""
      className={`hexTokenArt ${kind}`}
      src={assetUrl(art)}
      style={{
        left: `${(minX / HEX_BOARD_WIDTH) * 100}%`,
        top: `${(minY / HEX_BOARD_HEIGHT) * 100}%`,
        width: `${((maxX - minX) / HEX_BOARD_WIDTH) * 100}%`,
        height: `${((maxY - minY) / HEX_BOARD_HEIGHT) * 100}%`,
        zIndex: 10 + bottomRow
      }}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Unit figure + its animation controller
// ---------------------------------------------------------------------------

/**
 * A presentation cue handed from the FX stage to a hex unit (see fx.tsx
 * `dispatchHexUnitCue`). `done` must be called exactly once when the unit has
 * finished playing it.
 */
export type HexUnitCueDetail = {
  cue:
    | {
        kind: "move";
        from: string;
        toPosition?: number;
        teleport?: boolean;
        path?: number[];
        holdMs?: number;
        /** The cue timeline's slot for this move (hexMoveEventDurationMs): the walk is paced to fill it. */
        durationMs?: number;
      }
    | { kind: "lunge"; to: string; attackKind: "melee" | "ranged"; releaseMs?: number }
    /** A creature casting (Ogre Magi Bloodlust, Enchanters, ...): H3 cast groups toward `to`. */
    | { kind: "cast"; to?: string; releaseMs?: number }
    | { kind: "shake" }
    | { kind: "pose"; pose: "defend" };
  done: () => void;
  /** Set by the figure that takes the cue (an unanswered cue resolves at once). */
  accepted?: boolean;
};

export const HEX_UNIT_CUE_EVENT = "hexunitcue";
/** Sent to a figure as soon as a move cue for it is queued (it keeps holding on its old hex). */
export const HEX_UNIT_PENDING_MOVE_EVENT = "hexunitpendingmove";
/** Sent to a figure when the mouse comes to rest on it: it plays its H3 mouse-over row, as on the PC. */
export const HEX_UNIT_HOVER_EVENT = "hexunithover";

/** Board metrics the figure layer positions creatures with (board units). */
export const hexBoardMetrics = {
  hexWidth: HEX_WIDTH,
  /** Half the tip-to-tip height (the PC hex is taller than it is wide). */
  hexRadius: HEX_RADIUS,
  rowStep: HEX_ROW_STEP,
  gridTop: GRID_TOP
} as const;

// ---------------------------------------------------------------------------
// PC-style command bar
// ---------------------------------------------------------------------------

/** Private-information events the table log redacts; never echoed in the bar. */
const PRIVATE_LOG_EVENTS = new Set<GameEvent["type"]>(["CARDS_DRAWN", "DECK_SEARCH_RESOLVED", "HAND_REFRESHED", "HAND_MULLIGAN"]);

/** Ask the hand fan to open one card's menu (the normal cast flow). */
export const HAND_OPEN_CARD_EVENT = "hand:open-card";
/** Ask the hand fan to open the real Spell Book (the same grimoire as the shelf icon). */
export const HAND_OPEN_SPELL_BOOK_EVENT = "hand:open-spell-book";

export function HexCommandBar({
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
  const [bookOpen, setBookOpen] = useState(false);
  const own = legalActions.filter((legal) => "playerId" in legal.action && legal.action.playerId === viewerPlayerId);
  const first = (...types: GameAction["type"][]) => own.find((legal) => types.includes(legal.action.type));
  const surrender = first("SURRENDER_COMBAT");
  const retreat = first("RETREAT_FROM_COMBAT", "GIVE_UP_COMBAT");
  const wait = first("WAIT_UNIT");
  const defend = first("DEFEND_UNIT");
  const hold = first("END_ACTIVATION");

  // Castable hand Spells: the same offers the hand fan shows (hand casts only;
  // scroll / Spell Book casts keep their own shelf icons).
  const hand = state.players[viewerPlayerId]?.hand ?? [];
  const castable = Array.from(
    new Set(
      own
        .map((legal) => legal.action)
        .filter(
          (action): action is Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }> =>
            (action.type === "CAST_SPELL" || action.type === "PLAY_CARD") &&
            !("fromScroll" in action && action.fromScroll) &&
            !action.fromSpellBook
        )
        .map((action) => (action.type === "CAST_SPELL" && action.fromSpellDeck ? action.fromSpellDeck : action.cardId))
        .filter((cardId) => hand.includes(cardId) && isSpellCard(cardLibrary, cardId))
    )
  );
  // The Spell Book (standard or Polish) is the game's own grimoire: the bar
  // opens that very window, never a copy of it.
  const spellBookOn = spellBookRuleEnabled(state) || polishSpellBookEnabled(state);

  const lines = useMemo(() => {
    const out: string[] = [];
    for (let index = state.eventLog.length - 1; index >= 0 && out.length < 2; index -= 1) {
      const event = state.eventLog[index];
      if (PRIVATE_LOG_EVENTS.has(event.type)) continue;
      const text = formatEvent(event, state);
      if (typeof text === "string" && text.trim()) out.unshift(text);
    }
    return out;
  }, [state]);

  const button = (
    key: string,
    label: string,
    icon: string,
    legal: LegalAction | undefined,
    onClick?: () => void,
    disabledReason = "Not available right now"
  ) => (
    <button
      aria-label={legal?.label ?? label}
      className={`hexBarButton ${key}`}
      disabled={!legal && !onClick}
      onClick={onClick ?? (() => legal && onAction(legal.action))}
      title={legal?.label ?? (onClick ? label : `${label} — ${disabledReason}`)}
      type="button"
    >
      <img alt="" aria-hidden="true" src={assetUrl(icon)} />
    </button>
  );

  return (
    <div className="hexCommandBar" role="toolbar" aria-label="Battle commands">
      <div className="hexBarGroup">
        {button("surrender", "Surrender", "/assets/battle-hex/ui/surrender.webp", surrender)}
        {button("retreat", "Retreat", "/assets/battle-hex/ui/retreat.webp", retreat)}
      </div>
      <div className="hexBarLog" aria-live="polite">
        {lines.map((line, index) => (
          <span key={index}>{line}</span>
        ))}
      </div>
      <div className="hexBarGroup">
        <span className="hexBarBook">
          {button(
            "spellbook",
            "Cast a spell",
            "/assets/battle-hex/ui/spellbook.webp",
            undefined,
            castable.length > 0 || spellBookOn ? () => setBookOpen((open) => !open) : undefined,
            "no Spell in your hand can be cast right now"
          )}
          {bookOpen && (castable.length > 0 || spellBookOn) ? (
            <span className="hexBookMenu" role="menu" aria-label="Castable Spells">
              {spellBookOn ? (
                <button
                  onClick={() => {
                    setBookOpen(false);
                    window.dispatchEvent(new CustomEvent(HAND_OPEN_SPELL_BOOK_EVENT));
                  }}
                  role="menuitem"
                  type="button"
                >
                  Open Spell Book…
                </button>
              ) : null}
              {castable.map((cardId) => (
                <button
                  key={cardId}
                  onClick={() => {
                    setBookOpen(false);
                    window.dispatchEvent(new CustomEvent(HAND_OPEN_CARD_EVENT, { detail: { cardId } }));
                  }}
                  role="menuitem"
                  type="button"
                >
                  {cardLibrary[cardId]?.name ?? cardId}
                </button>
              ))}
            </span>
          ) : null}
        </span>
        {button("wait", "Wait", "/assets/battle-hex/ui/wait.webp", wait)}
        {button("defend", "Defend", "/assets/battle-hex/ui/defend.webp", defend)}
        {button("hold", "Hold position", "/assets/battle-hex/ui/end.webp", hold)}
      </div>
    </div>
  );
}

/**
 * Turn-arounds a walk needs: before setting off backwards (away from the enemy
 * side), at every point where the route's heading flips (the figure stops and
 * turns there instead of snapping), and after arriving facing away — the figure
 * turns back to face the enemy, as in the PC game. Teleports never turn. Every
 * hex step moves sideways, so each leg has a left/right heading.
 */
export function hexWalkTurns(combat: CombatState, unit: CombatUnitState, route: readonly number[]): number {
  if (route.length < 2) return 0;
  const forwardRight = unit.controllerId === combat.attackerPlayerId;
  const x = (position: number) => hexCellCenter(position, false).x;
  const headings: boolean[] = [];
  for (let index = 1; index < route.length; index += 1) {
    const dx = x(route[index]) - x(route[index - 1]);
    if (dx !== 0) headings.push(dx > 0);
  }
  if (headings.length === 0) return 0;
  let turns = headings[0] !== forwardRight ? 1 : 0;
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index] !== headings[index - 1]) turns += 1;
  }
  return turns + (headings[headings.length - 1] !== forwardRight ? 1 : 0);
}

/** Live Initiative minus printed (Haste, Slow, auras): a hex figure's animation tempo input. */
export function hexInitiativeDelta(
  unit: CombatUnitState,
  activeEffects: GameState["activeEffects"],
  combat: CombatState | null | undefined
): number {
  return effectiveInitiative(unit, activeEffects, combat) - unit.initiative;
}

/** Walk time the hex board needs for a move event (page.tsx timeline). */
export function hexMoveEventDurationMs(
  combat: CombatState | null | undefined,
  event: { unitId: string; from: number; to: number; path?: number[] },
  teleport = false,
  /** The snapshot's active effects: Haste / Slow set the unit's animation tempo. */
  activeEffects: GameState["activeEffects"] = []
): number | null {
  if (!isHexCombat(combat) || !isHexPosition(event.from) || !isHexPosition(event.to)) {
    return null;
  }
  const unit = combat?.units[event.unitId];
  const walked = event.path && event.path.length > 0;
  const route = walked ? [event.from, ...event.path!] : [event.from, event.to];
  return hexMoveDurationMs({
    unitDefId: unit?.unitDefId,
    variant: unit?.variant,
    commanderSlug: unit?.commanderSlug,
    initiative: unit?.initiative,
    initiativeDelta: unit && combat ? hexInitiativeDelta(unit, activeEffects, combat) : 0,
    flyer: unit?.type === "flying",
    steps: walked ? event.path!.length : getBattlefieldDistance(event.from, event.to),
    distance: getBattlefieldDistance(event.from, event.to),
    flying: unit?.type === "flying" && !walked,
    teleport,
    turns: teleport || !combat || !unit ? 0 : hexWalkTurns(combat, unit, route)
  });
}

