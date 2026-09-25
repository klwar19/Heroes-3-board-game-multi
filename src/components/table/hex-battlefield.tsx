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
// hexes, even rows shifted half a hex right, attacker zone on the left. The
// seat flip mirrors x. Hit testing is by hex (as in the PC game): each cell's
// hex face takes the clicks, creature sprites never do.
// ---------------------------------------------------------------------------

import { useMemo, useState, type CSSProperties } from "react";
import { assetUrl } from "@/lib/asset-url";
import {
  HEX_BATTLEFIELD_COLUMNS,
  HEX_BATTLEFIELD_ROWS,
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldPositions,
  getHexDeploymentZone,
  hexPosition,
  isHexPosition
} from "@/engine/battlefield";
import { hexBattlefieldsForBoardArt } from "@/engine/combat-board-art";
import { HEX_SHIP_BATTLE_OBSTACLES, hexBattlefieldObstacles } from "@/engine/hex-battlefield";
import { PC_OBSTACLES, type PcObstacleDefinition } from "@/engine/hex-pc-obstacles";
import type { CombatBoardArtId, CombatState, CombatUnitState, GameAction, GameEvent, GameState, LegalAction, PlayerId } from "@/engine";
import { effectiveInitiative, polishSpellBookEnabled, spellBookRuleEnabled } from "@/engine";
import { isSpellCard } from "@/engine/ruleset";
import { cardLibrary } from "@/data/cards/library";
import { hexMoveDurationMs } from "@/data/battle-hex/creature-sprites";
import { getFxSheet } from "@/data/fx";
import { formatEvent } from "./utils";

export const HEX_BOARD_WIDTH = 800;
export const HEX_BOARD_HEIGHT = 556;
/**
 * Flat-to-flat hex width in board units. 55 (was 52, user ruling 2026-09-25:
 * bigger hexes, the creatures a little smaller against them).
 */
const HEX_WIDTH = 55;
/** Centre-to-corner radius of a regular pointy-top hex. */
const HEX_RADIUS = HEX_WIDTH / Math.sqrt(3);
const HEX_ROW_STEP = HEX_RADIUS * 1.5;
const GRID_LEFT = (HEX_BOARD_WIDTH - HEX_WIDTH * (HEX_BATTLEFIELD_COLUMNS + 0.5)) / 2;
const GRID_TOP = HEX_BOARD_HEIGHT - (HEX_ROW_STEP * (HEX_BATTLEFIELD_ROWS - 1) + 2 * HEX_RADIUS) - 20;

/**
 * Creature / hero art scale on the hex board. The PC proportion (an H3 pixel
 * at the mean stretch of its 44 px hexes and 42 px rows onto a 52-unit hex)
 * times 0.96, so on the 55-unit hexes a creature stands about 10% smaller
 * against its hex than on the PC while a two-hex creature still spans its two
 * hexes. Obstacles keep the exact PC proportion of the hexes they block.
 */
export const HEX_SPRITE_SCALE = Math.sqrt((52 / 44) * ((52 / Math.sqrt(3)) * 1.5 / 42)) * 0.96;

/** PC art scale onto this board: H3 hexes are 44 px wide with a 42 px row step. */
const PC_SCALE_X = HEX_WIDTH / 44;
const PC_SCALE_Y = HEX_ROW_STEP / 42;

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
    height: `${((2 * HEX_RADIUS) / HEX_BOARD_HEIGHT) * 100}%`,
    // Lower rows stand in front (their sprites overlap the rows behind).
    zIndex: 10 + row
  };
}

function hexPoints(x: number, y: number, radius = HEX_RADIUS): string {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 180) * (60 * corner - 90);
    return `${(x + radius * Math.cos(angle)).toFixed(2)},${(y + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
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
  combat
}: {
  boardArtId: string;
  flipped: boolean;
  combat: CombatState;
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
  return (
    <>
      <div aria-hidden="true" className={flipped ? "hexBackdropWrap flipped" : "hexBackdropWrap"}>
        <img
          alt=""
          className={siege ? "hexBackdrop siegeBackdrop" : "hexBackdrop"}
          referrerPolicy="no-referrer"
          src={assetUrl(siege ? SIEGE_BACKDROP : backdrop)}
        />
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
        {siege?.hexTokens ? <HexSiegePieces combat={combat} flipped={flipped} /> : null}
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

/**
 * PC Castle siege art. The backdrop's moat is stretched under the wall line
 * (column 11); its gate road already runs along row E, the Gate's row.
 */
const SIEGE_BACKDROP = "/assets/battle-hex/siege/backdrop.webp";

/** The keep stands just past the grid's right edge (behind the defender's zone). */
const SIEGE_KEEP_X = Math.min(768, GRID_LEFT + HEX_WIDTH * (HEX_BATTLEFIELD_COLUMNS + 0.5) + 4);

/**
 * The printed siege layout (rulebook p.13, defender on the right) — the same
 * five tokens the engine lays out; a token missing from `siege.hexTokens` has
 * been destroyed and shows its rubble piece. Cells are (column, row).
 */
const SIEGE_PIECES: ReadonlyArray<{ id: string; cells: ReadonlyArray<readonly [number, number]>; intact: string; ruin: string }> = [
  { id: "wall-1", cells: [[10, 0], [10, 1]], intact: "wall-1", ruin: "wall-1-ruin" },
  { id: "wall-2", cells: [[10, 2]], intact: "wall-2", ruin: "wall-2-ruin" },
  { id: "gate", cells: [[10, 3], [9, 4], [10, 4], [10, 5]], intact: "drawbridge", ruin: "drawbridge-broken" },
  { id: "wall-4", cells: [[10, 6]], intact: "wall-4", ruin: "wall-4-ruin" },
  { id: "wall-5", cells: [[10, 7], [10, 8]], intact: "wall-5", ruin: "wall-5-ruin" }
];

/** PC art pixel size of each siege piece (1 PC pixel = 1 board unit). */
const SIEGE_PIECE_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  "wall-1": [150, 206], "wall-1-ruin": [150, 206],
  "wall-2": [100, 200], "wall-2-ruin": [100, 200],
  "wall-4": [100, 200], "wall-4-ruin": [100, 200],
  "wall-5": [100, 200], "wall-5-ruin": [100, 200],
  drawbridge: [103, 87], "drawbridge-broken": [103, 87],
  "gate-arch": [65, 225], keep: [80, 300]
};

function SiegePiece({ art, x, bottom, row, flipped }: { art: string; x: number; bottom: number; row: number; flipped: boolean }) {
  const [width, height] = SIEGE_PIECE_SIZE[art] ?? [100, 200];
  const left = (flipped ? HEX_BOARD_WIDTH - x : x) - width / 2;
  return (
    <img
      alt=""
      className="hexSiegePiece"
      src={assetUrl(`/assets/battle-hex/siege/${art}.webp`)}
      style={{
        left: `${(left / HEX_BOARD_WIDTH) * 100}%`,
        top: `${((bottom - height) / HEX_BOARD_HEIGHT) * 100}%`,
        width: `${(width / HEX_BOARD_WIDTH) * 100}%`,
        height: `${(height / HEX_BOARD_HEIGHT) * 100}%`,
        zIndex: 10 + row,
        transform: flipped ? "scaleX(-1)" : undefined
      }}
    />
  );
}

function HexSiegePieces({ combat, flipped }: { combat: CombatState; flipped: boolean }) {
  const standing = new Set((combat.siege?.hexTokens ?? []).map((token) => token.id));
  const towerStands = Boolean(
    combat.siege?.arrowTowerUnitId && (combat.units[combat.siege.arrowTowerUnitId]?.damage ?? 0) <
      (combat.units[combat.siege.arrowTowerUnitId]?.maxHealth ?? 0)
  );
  return (
    <>
      {towerStands ? (
        // The keep the Arrow Tower shoots from, behind the defender's zone.
        <SiegePiece art="keep" bottom={GRID_TOP + HEX_RADIUS + 2.4 * HEX_ROW_STEP} flipped={false} row={0} x={flipped ? HEX_BOARD_WIDTH - SIEGE_KEEP_X : SIEGE_KEEP_X} />
      ) : null}
      {SIEGE_PIECES.map((piece) => {
        const positions = piece.cells
          .map(([column, row]) => hexPosition(column, row))
          .filter((position): position is number => position !== null);
        // Unflipped centres; SiegePiece mirrors x for the flipped seat.
        const centers = positions.map((position) => hexCellCenter(position, false));
        const x = centers.reduce((sum, c) => sum + c.x, 0) / Math.max(1, centers.length);
        const lowest = Math.max(...centers.map((c) => c.y));
        const row = Math.max(...piece.cells.map(([, r]) => r));
        const intact = standing.has(piece.id);
        if (piece.id === "gate") {
          const gateCentre = hexCellCenter(hexPosition(10, 4)!, false);
          const bridgeCentre = hexCellCenter(hexPosition(9, 4)!, false);
          return (
            <span key={piece.id}>
              <SiegePiece art="gate-arch" bottom={lowest + HEX_RADIUS * 0.6} flipped={flipped} row={row} x={gateCentre.x + 8} />
              <SiegePiece
                art={intact ? piece.intact : piece.ruin}
                bottom={bridgeCentre.y + HEX_RADIUS * 0.9}
                flipped={flipped}
                row={4}
                x={bridgeCentre.x}
              />
            </span>
          );
        }
        return (
          <SiegePiece
            art={intact ? piece.intact : piece.ruin}
            bottom={lowest + HEX_RADIUS * 0.7}
            flipped={flipped}
            key={piece.id}
            row={row}
            x={x}
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

/** Board metrics the figure layer positions creatures with (board units). */
export const hexBoardMetrics = {
  hexWidth: HEX_WIDTH,
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

