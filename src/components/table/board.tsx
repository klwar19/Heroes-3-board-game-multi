"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronDown, ChevronUp, Crown, Hourglass, Mountain, Plus, ScrollText, Shield, Sparkles, Swords } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { COMBAT_TOKEN_IMAGES } from "@/data/assets/homm-assets";
import { UNIT_RANK_NAMES, unitRankBadgeImage } from "@/data/units/experience";
import { cardLibrary } from "@/data/cards/library";
import { getFxSheet } from "@/data/fx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  effectiveInitiative,
  getActivationOrder,
  getActiveDefenseBonus,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  getDisplayAttackBonus,
  getUnitAbilityDefinitions,
  getUnitMoveRange,
  getUnitTokens,
  hasUnitAbilityEffect,
  inCombatPrep,
  isAdjacent,
  isArrowTowerUnit,
  isUnitAlive,
  NEUTRAL_PLAYER_ID,
  parseFortificationTargetId,
  pickCombatBoardArtId,
  placementCellsFor,
  neutralFormationCellsFor,
  commanderDeploymentCellsFor,
  commanderUnitId,
  neutralFormationCellsForGuard,
  playerSpellCastsIgnoreLimit,
  unitHasUnlimitedRetaliationEffect,
  unitIsBerserk,
  type BattlefieldTokenState,
  type CombatBoardArtId,
  type CombatTokenState,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { beginUnitPointerDrag } from "@/components/table/pointer-drag";
import { CommanderCardFace } from "@/components/commander-card";
import { COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION, commanderStatValue } from "@/data/commanders";
import type { CommanderGrade, CommanderSlug } from "@/data/commanders";
import {
  actionKey,
  formatEvent,
  getTacticsSwapActions,
  isBoardTargetCardAction,
  sameCardSelection,
  swapPartnerActions,
  swapSelectableUnitIds,
  tacticsSetupActiveFor,
  unitName,
  type CardBoardAction
} from "./utils";
import { useCardZoom } from "./zoom";

/** Short label for a Creature Bank defender's Stack Token (+1 stat, +2 initiative). */
const STACK_TOKEN_LABELS: Record<NonNullable<CombatUnitState["stackToken"]>, string> = {
  attack: "+1 ATK",
  defense: "+1 DEF",
  health: "+1 HP",
  initiative: "+2 INI"
};

/**
 * Where a unit stands with its once-per-round Retaliation — the same reading the
 * engine's `shouldRetaliate` uses (reducer.ts): a unit counter-attacks a melee
 * blow unless it has already spent its retaliation this round, and unlimited
 * retaliation (Griffins' ability or the Counterstrike active effect) never runs
 * out. Surfaced so a player can tell at a glance whether striking a unit now will
 * draw a counter-attack.
 *  - "unlimited": always counters this round (ability or Counterstrike effect).
 *  - "used": already retaliated this round → will NOT counter again.
 *  - "ready": has not retaliated yet → will counter a melee hit.
 */
export type RetaliationStatus = "unlimited" | "used" | "ready";

export function retaliationStatus(state: GameState, unit: CombatUnitState): RetaliationStatus {
  if (hasUnitAbilityEffect(unit, "ALLOW_UNLIMITED_RETALIATION") || unitHasUnlimitedRetaliationEffect(state, unit)) {
    return "unlimited";
  }
  return unit.retaliatedThisRound ? "used" : "ready";
}

/**
 * Seat-relative orientation: your rows should sit nearest your hand. The
 * sandbox seats p1 in the top rows (flip for p1); adventure combats seat the
 * attacker in the bottom rows, so only the defender's view flips.
 */
export function isBoardFlipped(state: GameState, viewerPlayerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return viewerPlayerId === "p1";
  }

  if (combat.context.kind === "sandbox") {
    return viewerPlayerId === "p1";
  }

  return viewerPlayerId === combat.defenderPlayerId;
}

export type CombatBoardArtVariant = {
  id: CombatBoardArtId;
  label: string;
  terrain: string;
  scenery: string;
};

export const COMBAT_BOARD_ART_VARIANTS: readonly CombatBoardArtVariant[] = [
  {
    id: "classic",
    label: "Classic grass and dirt battlefield",
    terrain: "/assets/board/battlefield-4x5-pro.webp",
    scenery: "/assets/board/battlefield-4x5-pro-scenery.webp"
  },
  {
    id: "frozen",
    label: "Frozen ice and snow battlefield",
    terrain: "/assets/board/battlefield-4x5-frozen.webp",
    scenery: "/assets/board/battlefield-4x5-frozen-scenery.webp"
  },
  {
    id: "hell-necro",
    label: "Hellish necropolis battlefield",
    terrain: "/assets/board/battlefield-4x5-hell-necro.webp",
    scenery: "/assets/board/battlefield-4x5-hell-necro-scenery.webp"
  },
  {
    id: "jungle-fortress",
    label: "Tropical fortress battlefield",
    terrain: "/assets/board/battlefield-4x5-jungle-fortress.webp",
    scenery: "/assets/board/battlefield-4x5-jungle-fortress-scenery.webp"
  },
  {
    id: "creature-bank-dungeon",
    label: "Creature bank dungeon battlefield",
    terrain: "/assets/board/battlefield-4x5-creature-bank-dungeon.webp",
    scenery: "/assets/board/battlefield-4x5-creature-bank-dungeon-scenery.webp"
  },
  {
    id: "castle-siege",
    label: "Castle siege battlefield",
    terrain: "/assets/board/battlefield-4x5-castle-siege.webp",
    scenery: "/assets/board/battlefield-4x5-castle-siege-scenery.webp"
  },
  {
    id: "ship-battle",
    label: "Ship battle battlefield",
    terrain: "/assets/board/battlefield-4x5-ship-battle.webp",
    scenery: "/assets/board/battlefield-4x5-ship-battle-scenery.webp"
  }
];

export function pickCombatBoardArt(state: GameState): CombatBoardArtVariant {
  const id = pickCombatBoardArtId(state, state.combat);
  return COMBAT_BOARD_ART_VARIANTS.find((variant) => variant.id === id) ?? COMBAT_BOARD_ART_VARIANTS[0];
}

/**
 * Horizontal battlefield view. The engine models combat on a logical grid that
 * is {@link BATTLEFIELD_COLUMNS} wide and {@link BATTLEFIELD_ROWS} tall
 * (position 0-19, `row = position / 4`, `column = position % 4`), but Heroes 3
 * battles face off LEFT↔RIGHT, so the board is drawn transposed: each engine
 * ROW (defender back · defender front · crossing · attacker front · attacker
 * back) becomes a vertical COLUMN of the field, and each engine COLUMN becomes
 * a horizontal ROW.
 *
 * The seat flip is a pure horizontal MIRROR (left↔right), not a 180° turn:
 * unflipped the attacker's columns are on the left; flipped they swap to the
 * right so the viewing player's own army sits on their left. Rows keep their
 * order either way, so unit cards always stand upright and readable — no side
 * is ever shown upside-down, and every attack/projectile animation plays in
 * plain screen space.
 *
 * Returns 1-indexed `gridColumn` / `gridRow`, ready to drop into a CSS grid.
 * The engine coordinates are never touched — this is purely on-screen layout.
 */
export function battlefieldCellPlacement(
  position: number,
  flipped: boolean
): { gridColumn: number; gridRow: number } {
  const engineRow = Math.floor(position / BATTLEFIELD_COLUMNS);
  const engineColumn = position % BATTLEFIELD_COLUMNS;
  return {
    // Unflipped: high engine rows (attacker) on the left. Flipped: mirror so the
    // viewer's own army sits on the left. Either way the field reads, from the
    // viewer's side inward, own army → crossing → enemy.
    gridColumn: flipped ? engineRow + 1 : BATTLEFIELD_ROWS - engineRow,
    gridRow: engineColumn + 1
  };
}

/**
 * On-card combat-token art: the real printed board-game tokens
 * (COMBAT_TOKEN_IMAGES — the crossed-swords Attack disc, the silver-swords
 * Weakness disc, the prohibited-shield Corrosion disc, the gorgon-head
 * Paralysis disc) drawn as a small disc. The engine's LIVE signed amount is
 * overlaid because the printed denomination varies (+1/+2, −1/−2, −1), so the
 * number is authored from state — never trust the baked art number. `describe`
 * drives the hover tooltip.
 */
const TOKEN_VIEW: Record<
  CombatTokenState["kind"],
  { image: string; showAmount: boolean; describe: (token: CombatTokenState) => string }
> = {
  attack: {
    image: COMBAT_TOKEN_IMAGES.attack,
    showAmount: true,
    describe: (token) => `Attack token: ${token.amount >= 0 ? "+" : ""}${token.amount} attack (${token.sourceName})`
  },
  weakness: {
    image: COMBAT_TOKEN_IMAGES.weakness,
    showAmount: true,
    describe: (token) => `Weakness token: ${token.amount} attack (${token.sourceName})`
  },
  corrosion: {
    image: COMBAT_TOKEN_IMAGES.corrosion,
    showAmount: true,
    describe: (token) => `Corrosion token: ${token.amount} defense, minimum 0, until the end of combat (${token.sourceName})`
  },
  paralysis: {
    image: COMBAT_TOKEN_IMAGES.paralysis,
    showAmount: false,
    describe: (token) => `Paralysis: skips its next activation; removed when it takes damage (${token.sourceName})`
  }
};

/** Token chips drawn on a unit card (attack/weakness/corrosion/paralysis, poison cubes). */
function TokenChips({ unit }: { unit: CombatUnitState }) {
  const tokens = getUnitTokens(unit);
  const poisonCubes = unit.poisonCubes ?? 0;
  if (tokens.length === 0 && poisonCubes <= 0) {
    return null;
  }

  return (
    <span className="tokenChips" aria-label="Combat tokens">
      {tokens.map((token) => {
        const view = TOKEN_VIEW[token.kind];
        return (
          <span className={`tokenChip ${token.kind}`} key={token.id} title={view.describe(token)}>
            <img alt="" aria-hidden="true" className="tokenChipArt" draggable={false} src={assetUrl(view.image)} />
            {view.showAmount ? (
              <b className="tokenChipAmount">
                {token.amount > 0 ? "+" : ""}
                {token.amount}
              </b>
            ) : null}
          </span>
        );
      })}
      {poisonCubes > 0 ? (
        <span
          className="tokenChip poison"
          title={`Poison: ${poisonCubes} faction cube${poisonCubes === 1 ? "" : "s"} — 1 damage at the start of each of this unit's activations`}
        >
          <b className="tokenChipAmount">{poisonCubes}🟢</b>
        </span>
      ) : null}
    </span>
  );
}

/**
 * How each battlefield token draws on the board: each maps to a converted Heroes
 * III .def sprite sheet (see fx-manifest), with `glyph` as a last-ditch emoji if
 * the sheet is missing. Force Field is the blue energy barrier (C15SPE);
 * Quicksand the sandy bubbling pit (C17SPE) — these two were swapped in the
 * original conversion and are corrected here. Quicksand / Land Mine show this
 * art only to their controller; the opponent sees a face-down token back (the
 * armed/decoy state is secret).
 *
 * The Land Mine uses `land-mine-b`, the single static placed-mine frame (C09SPF1)
 * — NOT `land-mine-a`/`-c`, which are the igniting/detonation animations. A
 * dormant mine sitting on the board must not loop its own explosion; the real
 * blast (`land-mine-hit`, C09SPF3) plays once, off BATTLEFIELD_TOKEN_TRIGGERED,
 * only when an armed mine is sprung (see page.tsx). Traps render a static idle
 * frame (see `BattlefieldTokenMark` / `TokenSprite` `animate`).
 */
const BATTLEFIELD_TOKEN_VIEW: Record<
  BattlefieldTokenState["kind"],
  { sprite: string; glyph: string; label: string }
> = {
  force_field: { sprite: "force-field", glyph: "🛡️", label: "Force Field" },
  fire_wall: { sprite: "fire-wall-e", glyph: "🔥", label: "Fire Wall" },
  quicksand: { sprite: "quicksand", glyph: "🌀", label: "Quicksand" },
  land_mine: { sprite: "land-mine-b", glyph: "💣", label: "Land Mine" }
};

/**
 * On-board sprite art for a battlefield obstacle, drawn from a converted Heroes
 * III .def sheet (see fx-manifest). The element is sized to one frame's aspect
 * ratio and loops through the sheet's frames by scrubbing `background-position`
 * via requestAnimationFrame — no React re-renders, so it is cheap and never
 * fights the test renderer. Falls back to nothing when the sheet is missing
 * (the caller then shows its emoji), and to a static first frame off-DOM.
 *
 * `animate` defaults on for the visible, living obstacles (Force Field shimmer,
 * Fire Wall flames). It is turned OFF for dormant traps so they hold their idle
 * frame instead of looping — a Land Mine must not perpetually spark and a
 * Quicksand pit must not endlessly bubble while it sits waiting to be sprung.
 */
function TokenSprite({
  fxKey,
  animate = true,
  frameRange
}: {
  fxKey: string;
  animate?: boolean;
  /**
   * Loop only frames [first, last] (inclusive) instead of the whole sheet — used
   * to skip a sprite's fade tail (e.g. the Force Field frames where the barrier
   * dissolves to nothing and reads as a blink). Defaults to the whole sheet, and
   * also fixes the resting frame so the sprite never sits on a faded-out edge.
   */
  frameRange?: [number, number];
}) {
  const sheet = getFxSheet(fxKey);
  const ref = useRef<HTMLSpanElement | null>(null);

  const denominator = sheet && sheet.cols > 1 ? sheet.cols - 1 : 1;
  const firstFrame = frameRange ? Math.max(0, frameRange[0]) : 0;
  const lastFrame = sheet
    ? Math.min(sheet.frames - 1, frameRange ? frameRange[1] : sheet.frames - 1)
    : 0;

  useEffect(() => {
    const element = ref.current;
    if (!animate || !element || !sheet || sheet.frames <= 1 || sheet.rows !== 1) {
      return;
    }
    if (typeof requestAnimationFrame !== "function") {
      return;
    }
    const count = Math.max(1, lastFrame - firstFrame + 1);
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    let raf = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      const frame = firstFrame + (Math.floor((elapsed / 1000) * sheet.fps) % count);
      element.style.backgroundPositionX = `${(frame / denominator) * 100}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [sheet, animate, firstFrame, lastFrame, denominator]);

  if (!sheet) {
    return null;
  }
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="battlefieldTokenSprite"
      style={{
        backgroundImage: `url(${assetUrl(sheet.src)})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
        backgroundPositionX: `${(firstFrame / denominator) * 100}%`,
        backgroundPositionY: "center",
        aspectRatio: `${sheet.frameWidth} / ${sheet.frameHeight}`
      }}
    />
  );
}

/**
 * Spell token sitting on a board space (Force Field / Fire Wall / Quicksand /
 * Land Mine). Force Field and Fire Wall are visible obstacles, drawn with their
 * animated H3 sprite. Quicksand and Land Mine are traps: everyone sees the
 * token's KIND (its normal icon sits on the board), but only its controller sees
 * whether it is armed or a decoy — the opponent gets the same icon WITHOUT that
 * armed/decoy label. A sprung trap is removed by the engine, so it never lingers
 * on the board.
 */
function BattlefieldTokenMark({
  token,
  viewerPlayerId,
  state
}: {
  token: BattlefieldTokenState;
  viewerPlayerId: PlayerId;
  state: GameState;
}) {
  const view = BATTLEFIELD_TOKEN_VIEW[token.kind];
  const isTrap = token.kind === "quicksand" || token.kind === "land_mine";
  // A trap's KIND is public (its icon sits on the board), but its armed/decoy
  // state is the caster's secret. So an enemy trap shows the same icon, just
  // WITHOUT the armed/decoy label. Masking by ownership is robust whether or not
  // the upstream player-view already stripped the `armed` flag (the live board is
  // fed the RAW state, so this masking is what actually hides it).
  const hideArmedState = isTrap && token.controllerId !== viewerPlayerId;
  const owner = state.players[token.controllerId]?.name ?? token.controllerId;
  const spriteSheet = getFxSheet(view.sprite);

  let detail: React.ReactNode = null;
  if (token.kind === "fire_wall") {
    detail = <small>{token.damage ?? 0}</small>;
  } else if (token.kind === "force_field") {
    detail = (
      <small>{token.expiresAtCombatRoundEnd === undefined ? "combat" : `r${token.expiresAtCombatRoundEnd}`}</small>
    );
  } else if (hideArmedState) {
    // The opponent sees the trap's icon but not whether it is armed or a decoy.
    detail = null;
  } else if (token.armed) {
    // Armed traps: the sprite alone is enough — no tiny "armed" label.
    detail = null;
  } else {
    // Empty decoy: a subtle circle-with-cross (not text) so the owner can tell
    // which half of the shuffle is inert without reading a small label.
    detail = (
      <span aria-hidden="true" className="trapDecoyMark" title="empty decoy">
        <svg viewBox="0 0 16 16" focusable="false">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <line x1="4.2" y1="4.2" x2="11.8" y2="11.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  const describe =
    token.kind === "fire_wall"
      ? `Fire Wall (${owner}) — ${token.damage ?? 0} damage to a unit stopping here or a ground/ranged unit passing through`
      : token.kind === "force_field"
        ? `Force Field (${owner}) — an obstacle; blocks non-flying movement${token.expiresAtCombatRoundEnd === undefined ? " for this combat" : ` until the end of combat round ${token.expiresAtCombatRoundEnd}`}`
        : hideArmedState
          ? `${view.label} (${owner}) — an enemy trap; you cannot see whether it is armed or a decoy`
          : `${view.label} (${owner}) — your token: ${token.armed ? "armed" : "empty decoy"}`;

  let art: React.ReactNode;
  if (spriteSheet) {
    if (token.kind === "force_field") {
      // The barrier shimmers, but its sprite fades to nothing at both ends of
      // the sheet (frames 0–2 fade in, 12–14 fade out) — that fade reads as the
      // field blinking out, so loop only the solid middle frames.
      art = <TokenSprite fxKey={view.sprite} frameRange={[3, 11]} />;
    } else {
      // The Fire Wall animates (its flames flicker); dormant traps (Quicksand /
      // Land Mine) hold a single idle frame and never loop.
      art = <TokenSprite fxKey={view.sprite} animate={token.kind === "fire_wall"} />;
    }
  } else {
    art = <b aria-hidden="true">{view.glyph}</b>;
  }

  return (
    <span
      aria-label={describe}
      className={`battlefieldToken ${token.kind} ${hideArmedState ? "hiddenTrap" : ""} ${
        !hideArmedState && isTrap && !token.armed ? "decoy" : ""
      } ${token.controllerId === viewerPlayerId ? "own" : "enemy"}`}
      title={describe}
    >
      {art}
      {detail}
    </span>
  );
}

/**
 * Arrow Tower fallback art. The real printed Arrow Tower scan
 * (structures-arrow_tower.webp) is the tower's `cardImage`; this hand-drawn
 * SVG (a battlemented tower with an arrow slit) only shows if that asset is
 * missing. The Wall and Gate cells render their own printed-card scans
 * (structures-wall / structures-gate .webp) directly. Purely decorative: the
 * `<small>` label and the cell `title` carry the meaning.
 */
function ArrowTowerArt() {
  return (
    <svg className="arrowTowerArt" viewBox="0 0 34 46" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <path d="M3 13 V6 h5 v7 h4 V6 h5 v7 h4 V6 h5 v7 Z" fill="#7e6a46" stroke="#2f2516" strokeWidth="1.2" />
      <rect x="3" y="13" width="28" height="30" fill="#6c5a3c" stroke="#2f2516" strokeWidth="1.2" />
      <g stroke="#4a3c26" strokeWidth="1">
        <line x1="3" y1="21" x2="31" y2="21" />
        <line x1="3" y1="29" x2="31" y2="29" />
        <line x1="3" y1="37" x2="31" y2="37" />
      </g>
      <rect x="15" y="23" width="4" height="13" rx="2" fill="#241a0f" />
      <g stroke="#ffd766" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="8" y1="18" x2="26" y2="18" />
        <path d="M26 18 l-4 -2.5 M26 18 l-4 2.5" />
      </g>
    </svg>
  );
}

/** The Arrow Tower card beside the board during sieges. */
function ArrowTowerCard({
  state,
  tower,
  legalActions,
  onAction,
  onInspect
}: {
  state: GameState;
  tower: CombatUnitState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  onInspect: (unitId: string) => void;
}) {
  const health = Math.max(0, tower.maxHealth - tower.damage);
  const attackAction = legalActions.find(
    (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.defenderId === tower.id
  );
  const demolishAction = legalActions.find(
    (legal) => legal.action.type === "ATTACK_FORTIFICATION" && legal.action.target.kind === "arrow-tower"
  );
  const isActive = state.combat?.activeUnitId === tower.id;

  return (
    <div className={`arrowTower ${isActive ? "active" : ""}`} aria-label="Arrow Tower">
      <button className="arrowTowerBody" onClick={() => onInspect(tower.id)} title="Arrow Tower — shoots without positioning penalties; only ranged attacks and card effects can hit it; collapses when all Walls and the Gate fall." type="button">
        {tower.assets?.cardImage ? (
          <img
            alt={tower.assets.imageAlt ?? "Arrow Tower card"}
            className="arrowTowerCardImg"
            loading="eager"
            referrerPolicy="no-referrer"
            src={assetUrl(tower.assets.cardImage)}
          />
        ) : (
          <span aria-hidden="true" className="arrowTowerIcon"><ArrowTowerArt /></span>
        )}
        {/* The static card prints the base stats; this line carries the LIVE health. */}
        <small>
          ⚔ {tower.attack} · <Shield aria-hidden="true" size={10} /> {tower.defense} · ♥ {health}/{tower.maxHealth} · init {tower.initiative}
        </small>
      </button>
      {attackAction ? (
        <button className="commandButton" onClick={() => onAction(attackAction.action)} type="button">
          Shoot the tower
        </button>
      ) : null}
      {demolishAction ? (
        <button className="commandButton" onClick={() => onAction(demolishAction.action)} type="button">
          {demolishAction.label}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Ghost + arrow preview of a pending reposition — a Tactics swap or a Necklace
 * of Swiftness one-space move. Rendered inside the rotating `.battlefield`, so
 * its cell coordinates match the cards. Decorative only: `pointer-events` are
 * off so the cells beneath stay clickable. For a swap the arrow is two-headed
 * and a second ghost shows the partner returning to the source cell.
 */
function RepositionPreview({
  kind,
  sourcePosition,
  destinationPosition,
  movingImage,
  swapBackImage,
  flipped
}: {
  kind: "move" | "swap";
  sourcePosition: number;
  destinationPosition: number;
  movingImage?: string;
  swapBackImage?: string;
  flipped: boolean;
}) {
  // The field renders horizontally (engine rows → visual columns); this overlay
  // shares the same transposed, flip-aware map as the cells. Visual grid:
  // BATTLEFIELD_ROWS columns wide, BATTLEFIELD_COLUMNS rows tall.
  const cols = BATTLEFIELD_ROWS;
  const rows = BATTLEFIELD_COLUMNS;
  const visualCell = (position: number) => {
    const { gridColumn, gridRow } = battlefieldCellPlacement(position, flipped);
    return { col: gridColumn - 1, row: gridRow - 1 };
  };
  const center = (position: number) => {
    const { col, row } = visualCell(position);
    return { x: col + 0.5, y: row + 0.5 };
  };
  const ghostStyle = (position: number): React.CSSProperties => {
    const { col, row } = visualCell(position);
    return {
      left: `${(col / cols) * 100}%`,
      top: `${(row / rows) * 100}%`,
      width: `${100 / cols}%`,
      height: `${100 / rows}%`
    };
  };
  const from = center(sourcePosition);
  const to = center(destinationPosition);
  return (
    <div className="repositionOverlay" aria-hidden="true">
      <svg className="repositionArrowSvg" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none">
        <defs>
          <marker
            id="repositionArrowHead"
            markerUnits="userSpaceOnUse"
            markerWidth="0.6"
            markerHeight="0.6"
            refX="0.45"
            refY="0.3"
            orient="auto"
          >
            <path d="M0,0 L0.6,0.3 L0,0.6 Z" fill="currentColor" />
          </marker>
        </defs>
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          markerEnd="url(#repositionArrowHead)"
          markerStart={kind === "swap" ? "url(#repositionArrowHead)" : undefined}
        />
      </svg>
      {movingImage ? (
        <div className="repositionGhost" style={ghostStyle(destinationPosition)}>
          <img alt="" referrerPolicy="no-referrer" src={assetUrl(movingImage)} />
        </div>
      ) : null}
      {kind === "swap" && swapBackImage ? (
        <div className="repositionGhost" style={ghostStyle(sourcePosition)}>
          <img alt="" referrerPolicy="no-referrer" src={assetUrl(swapBackImage)} />
        </div>
      ) : null}
    </div>
  );
}

export function BattlefieldBoard({
  state,
  viewerPlayerId,
  legalActions,
  selectedCardAction,
  flippedUnitIds,
  tintedUnits,
  damageDisplay,
  onAction,
  onInspect
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  selectedCardAction: CardBoardAction | null;
  /** Units that just turned to their Few side; plays a flip animation. */
  flippedUnitIds?: ReadonlySet<string>;
  /** unitId -> tint key ("bloodlust") while a palette-style effect plays. */
  tintedUnits?: ReadonlyMap<string, string>;
  /**
   * unitId -> the damage value to *show* instead of the unit's real one, while
   * an attack's dice + strike animation play out. Lets a struck unit hold its
   * pre-hit health (and a slain unit stay on the board) until the blow visibly
   * lands, so damage never resolves before the roll it came from.
   */
  damageDisplay?: ReadonlyMap<string, number>;
  onAction: (action: GameAction) => void;
  onInspect: (unitId: string) => void;
}) {
  const combat = state.combat;
  const flipped = isBoardFlipped(state, viewerPlayerId);
  const boardArt = useMemo(() => pickCombatBoardArt(state), [state]);
  // Repositioning UI state (Tactics swap / Necklace of Swiftness move):
  //  - swapSelection: the first unit picked for a Tactics swap (click-to-select).
  //  - hoverDestination: the candidate cell under the cursor, for the ghost+arrow.
  //  - flashCells: cells to flash briefly the moment a reposition is confirmed.
  const [swapSelection, setSwapSelection] = useState<string | null>(null);
  // Expert Tactics is opt-in: the player arms it from a single board control,
  // then switches two units by clicking — it never floods the command menu with
  // one verbose button per pair.
  const [expertSwapArmed, setExpertSwapArmed] = useState(false);
  const [hoverDestination, setHoverDestination] = useState<number | null>(null);
  const [flashCells, setFlashCells] = useState<readonly number[]>([]);
  // The Neutral guard currently being drag-sorted (Manual guard control): while
  // it is held, only that guard's legal cells light up — a shooter shows just
  // the back row, so a shooter can never be dropped onto the front line.
  const [sortDragUnitId, setSortDragUnitId] = useState<string | null>(null);
  // Route-planner state: when the player chooses to hand-pick a move route
  // (to brave or dodge a Fire Wall) this holds the active unit and the waypoints
  // chosen so far. A plan left over from a different unit is ignored at render
  // time (the `routePlan.unitId === activeMover.id` guard below), so no reset
  // effect is needed.
  const [routePlan, setRoutePlan] = useState<{ unitId: string; path: number[] } | null>(null);
  const activeUnitId = combat?.activeUnitId ?? null;
  useEffect(() => {
    if (flashCells.length === 0) {
      return;
    }
    const timer = setTimeout(() => setFlashCells([]), 750);
    return () => clearTimeout(timer);
  }, [flashCells]);
  // Health to render for a unit: a deferred value during an attack animation,
  // otherwise its true damage. A unit reads as alive while its shown damage is
  // below its max, so a killing blow keeps the card on the board until impact.
  const shownDamage = (unit: CombatUnitState) => damageDisplay?.get(unit.id) ?? unit.damage;
  const unitsByPosition = new Map<number, CombatUnitState>();
  const obstacles = new Set(combat?.obstacles ?? []);
  const moveActionsByDestination = new Map<number, GameAction>();
  const attackActionsByDefender = new Map<string, GameAction>();
  const cardActionsByTarget = new Map<string, GameAction>();
  const spaceCardActionsByPosition = new Map<number, GameAction>();
  const abilityTargetActions = new Map<string, GameAction>();
  // A tied Initiative slot is a spatial choice too. Keep the text buttons in
  // PromptTray for accessibility, but also bind each offered stack to its
  // CHOOSE_OPTION action so the units being considered glow and can be picked
  // directly on the battlefield.
  const activationOrderActionsByUnit = new Map<string, GameAction>();
  // First Aid Tent: clicking a wounded friendly unit mends it (the basic, free
  // heal). Populated from the USE_ACTIVE_EFFECT heal offers — on your turn AND
  // inside the attack reaction window, so you can heal the instant you're hit.
  const healActionsByTarget = new Map<string, GameAction>();
  const fortificationActionsByPosition = new Map<number, LegalAction>();
  // Catapult bombardment: a CHOOSE_ABILITY_TARGET aimed at a Wall/Gate (a
  // pseudo-id, not a unit), keyed by board position so the cell is clickable.
  const fortAbilityTargetByPosition = new Map<number, LegalAction>();

  const siege = combat?.siege ?? null;
  const wallPositions = new Set(siege?.walls ?? []);
  const gatePosition = siege?.gatePosition ?? null;
  const arrowTower = siege?.arrowTowerUnitId ? combat?.units[siege.arrowTowerUnitId] : null;

  if (combat) {
    for (const unit of Object.values(combat.units)) {
      if (shownDamage(unit) < unit.maxHealth && unit.position >= 0) {
        unitsByPosition.set(unit.position, unit);
      }
    }
  }

  // Empty-space destination pickers: the Teleport Spell (combat-teleport),
  // Necklace of Swiftness's one-space move (combat-step) and the BINH house-rule
  // neutral move-to-attack destination (neutral-destination) all ask the
  // controller to pick an empty space. Map each offered position to its
  // CHOOSE_OPTION so the empty cell lights up and lands the unit when clicked
  // (works in both views).
  const teleportActionsByPosition = new Map<number, GameAction>();
  const teleportChoice = state.pendingChoice;
  if (combat && teleportChoice?.type === "OPTION_CHOICE" && teleportChoice.playerId === viewerPlayerId) {
    const destinationPositions =
      teleportChoice.context === "combat-teleport"
        ? teleportChoice.teleport?.positions
        : teleportChoice.context === "combat-step"
          ? teleportChoice.step?.positions
          : teleportChoice.context === "neutral-destination"
            ? teleportChoice.neutralDestination?.positions
            : undefined;
    destinationPositions?.forEach((position, optionIndex) => {
      teleportActionsByPosition.set(position, {
        type: "CHOOSE_OPTION",
        playerId: viewerPlayerId,
        choiceId: teleportChoice.id,
        optionIndex
      });
    });
  }
  // A neutral move-to-attack destination is a walk, not a blink — label it "Move".
  const teleportIsNeutralMove =
    combat &&
    teleportChoice?.type === "OPTION_CHOICE" &&
    teleportChoice.context === "neutral-destination" &&
    teleportChoice.playerId === viewerPlayerId;

  // Spell tokens on the board (Force Field / Fire Wall / Quicksand / Land Mine).
  const battlefieldTokensByPosition = new Map<number, BattlefieldTokenState>();
  for (const token of combat?.battlefieldTokens ?? []) {
    battlefieldTokensByPosition.set(token.position, token);
  }

  // Quicksand / Land Mine placement: the caster drops the rest of the set one
  // space at a time. Each offered empty space lights up like a cast target; the
  // trailing "stop placing" option (no position) is surfaced as a banner button.
  const placeTokenActionsByPosition = new Map<number, GameAction>();
  let stopPlacingTokensAction: GameAction | null = null;
  let placeTokensPrompt: string | null = null;
  const placeChoice = state.pendingChoice;
  if (
    combat &&
    placeChoice?.type === "OPTION_CHOICE" &&
    placeChoice.context === "place-battlefield-tokens" &&
    placeChoice.playerId === viewerPlayerId &&
    placeChoice.placeTokens
  ) {
    placeChoice.placeTokens.positions.forEach((position, optionIndex) => {
      placeTokenActionsByPosition.set(position, {
        type: "CHOOSE_OPTION",
        playerId: viewerPlayerId,
        choiceId: placeChoice.id,
        optionIndex
      });
    });
    // The "stop placing" option is the last one, after every space option.
    stopPlacingTokensAction = {
      type: "CHOOSE_OPTION",
      playerId: viewerPlayerId,
      choiceId: placeChoice.id,
      optionIndex: placeChoice.placeTokens.positions.length
    };
    placeTokensPrompt = placeChoice.prompt;
  }

  for (const legal of legalActions) {
    if (legal.action.type === "MOVE_UNIT") {
      moveActionsByDestination.set(legal.action.destination, legal.action);
    }
    if (legal.action.type === "ATTACK_UNIT") {
      attackActionsByDefender.set(legal.action.defenderId, legal.action);
    }
    if (legal.action.type === "CHOOSE_ABILITY_TARGET") {
      abilityTargetActions.set(legal.action.targetUnitId, legal.action);
      const fort = parseFortificationTargetId(legal.action.targetUnitId);
      if (fort) {
        fortAbilityTargetByPosition.set(fort.position, legal);
      }
    }
    if (
      legal.action.type === "CHOOSE_OPTION" &&
      state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "combat-activation-order" &&
      state.pendingChoice.activationOrder &&
      legal.action.choiceId === state.pendingChoice.id
    ) {
      const unitId = state.pendingChoice.activationOrder.unitIds[legal.action.optionIndex];
      if (unitId) {
        activationOrderActionsByUnit.set(unitId, legal.action);
      }
    }
    if (legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.target.type === "unit") {
      // Bind the click to the basic heal (no crown); never let an expert-volley
      // variant overwrite it, so a plain click is always the simple mend.
      const unitId = legal.action.target.unitId;
      if (legal.action.mode !== "expert" || !healActionsByTarget.has(unitId)) {
        healActionsByTarget.set(unitId, legal.action);
      }
    }
    if (legal.action.type === "ATTACK_FORTIFICATION" && legal.action.target.kind !== "arrow-tower") {
      fortificationActionsByPosition.set(legal.action.target.position, legal);
    }
    if (selectedCardAction && isBoardTargetCardAction(legal.action) && sameCardSelection(selectedCardAction, legal.action)) {
      if (legal.action.target.type === "unit") {
        cardActionsByTarget.set(legal.action.target.unitId, legal.action);
      } else if (legal.action.target.type === "space") {
        // Space-target casts: the empty space a Summon elemental appears on, and
        // the centre of an area blast (Inferno, Frost Ring, Xyron's Inferno),
        // which may be an OCCUPIED space — keyed by position so a stack of units
        // standing on the chosen cell is still a legal centre.
        spaceCardActionsByPosition.set(legal.action.target.position, legal.action);
      }
    }
  }

  // Drag-and-drop deployment: while it is the viewer's turn to place, the
  // two own rows accept army-unit drops (fresh placements and repositions).
  // Not during the PvP `prep` window — the engine rejects placement until both
  // sides accept (and the deploy panel hides itself then), so the board must not
  // advertise drop targets yet.
  const setup = combat?.setup;
  const placing = Boolean(setup && !combat?.prep && setup.pendingPlayerIds[0] === viewerPlayerId);
  // PvP Neutral Control: the controller SORTS the revealed Neutral formation
  // before battle — the guards are draggable within their formation zone
  // (any cell on the defender's two rows on a field, four corners on a Creature
  // Bank), exactly like a defender repositioning their own line.

  const sorting = Boolean(combat && combat.pendingNeutralPlacement === viewerPlayerId);
  // WOG Commanders pre-combat sort: the head owner may drag their own commander
  // to any empty cell of its deployment zone (or swap it with one of their own
  // units), exactly like a deployment reposition, then press "Ready for battle".
  const commanderSorting = Boolean(combat && combat.pendingCommanderPlacement?.[0] === viewerPlayerId);
  // Manual guard control restricts a shooter to the back row: while such a guard
  // is being dragged, narrow the droppable cells to that guard's legal set so the
  // front line simply does not accept it (the engine also rejects an illegal drop).
  const sortDraggedGuard = sorting && sortDragUnitId ? combat?.units[sortDragUnitId] : undefined;
  const sortCells = sorting
    ? sortDraggedGuard
      ? neutralFormationCellsForGuard(state, sortDraggedGuard)
      : neutralFormationCellsFor(state)
    : [];
  const ownRows = placing
    ? new Set(placementCellsFor(state, viewerPlayerId))
    : sorting
      ? new Set(sortCells)
      : commanderSorting
        ? new Set(commanderDeploymentCellsFor(state, viewerPlayerId))
        : new Set<number>();

  // Tactics swap: a click-to-select board interaction for BOTH the start-of-combat
  // setup window (Basic) and the mid-combat expert swap (Expert). Basic is always
  // board-driven (the window has no other actions). Expert is opt-in: the player
  // arms it from a single board control (so it never floods the menu with one
  // verbose button per pair), then switches two units by clicking. Either way the
  // pairwise SWAP_COMBAT_UNITS buttons are dropped from CommandDock — the board is
  // the single, clear control.
  const tacticsSetup = Boolean(combat) && tacticsSetupActiveFor(state, viewerPlayerId);
  const expertSwapOffers = !tacticsSetup ? getTacticsSwapActions(legalActions) : [];
  const expertSwapAvailable = expertSwapOffers.length > 0;
  const swapActions = tacticsSetup
    ? getTacticsSwapActions(legalActions)
    : expertSwapArmed
      ? expertSwapOffers
      : [];
  const swapSelectable = swapSelectableUnitIds(swapActions);
  const activeSwapSelection = swapSelection && swapSelectable.has(swapSelection) ? swapSelection : null;
  const swapPartners = activeSwapSelection
    ? swapPartnerActions(swapActions, activeSwapSelection)
    : new Map<string, GameAction>();

  // Auto-disarm expert Tactics once it is no longer offered — most importantly
  // the instant the swap is made (the expert use is spent), but also if the
  // active unit moves/attacks first. The armed banner and the swap offers are
  // both gated on availability above, so this only resets the stored flags —
  // done during render (the documented adjust-state-on-change pattern), not in
  // an effect, so the disarm commits in the same render the offer vanishes.
  if (expertSwapArmed && !expertSwapAvailable) {
    setExpertSwapArmed(false);
    setSwapSelection(null);
  }

  // The unit being repositioned and the cells it may go to, for the ghost+arrow
  // overlay. Either an open one-space move (combat-step choice) or a Tactics swap
  // with the first unit picked.
  const stepChoice = state.pendingChoice;
  const moveContext =
    combat &&
    stepChoice?.type === "OPTION_CHOICE" &&
    stepChoice.context === "combat-step" &&
    stepChoice.step &&
    stepChoice.playerId === viewerPlayerId
      ? { unitId: stepChoice.step.unitId, candidates: stepChoice.step.positions }
      : null;
  const repositionKind: "move" | "swap" | null = moveContext ? "move" : activeSwapSelection ? "swap" : null;
  const repositionSourceUnitId = moveContext ? moveContext.unitId : activeSwapSelection;
  const repositionSourcePosition =
    repositionSourceUnitId && combat ? combat.units[repositionSourceUnitId]?.position ?? null : null;
  const repositionCandidates = moveContext
    ? moveContext.candidates
    : activeSwapSelection && combat
      ? [...swapPartners.keys()]
          .map((unitId) => combat.units[unitId]?.position)
          .filter((position): position is number => position !== undefined)
      : [];
  const repositionGhostImage =
    repositionSourceUnitId && combat ? combat.units[repositionSourceUnitId]?.assets?.cardImage : undefined;
  // A swap also moves the hovered partner back onto the source cell — its art is
  // the second ghost in that exchange.
  const hoveredSwapPartnerUnit =
    repositionKind === "swap" && combat && hoverDestination !== null
      ? Object.values(combat.units).find(
          (candidate) => candidate.position === hoverDestination && swapPartners.has(candidate.id)
        )
      : undefined;

  // Route planner. When the active unit is the viewer's, can move, and a Fire
  // Wall stands on the board, the player may hand-pick the move route (to brave a
  // shortcut through the flames or detour around them) instead of the engine's
  // auto safe path. Valid waypoints reuse the legal move-destination set, so each
  // is a reachable, non-blocked cell (a Fire Wall cell qualifies; a Force Field
  // does not). Flyers ignore routes (they never enter the spaces they cross).
  const activeMover =
    combat && activeUnitId && moveActionsByDestination.size > 0 ? combat.units[activeUnitId] : undefined;
  const routePlanningAvailable =
    !!activeMover &&
    activeMover.controllerId === viewerPlayerId &&
    activeMover.type !== "flying" &&
    !selectedCardAction &&
    (combat?.battlefieldTokens ?? []).some((token) => token.kind === "fire_wall");
  const planning = Boolean(routePlanningAvailable && routePlan && activeMover && routePlan.unitId === activeMover.id);
  const plannedPath = planning && routePlan ? routePlan.path : [];
  const moveRange = activeMover ? getUnitMoveRange(activeMover, state) : 0;
  const routeEnd = plannedPath.length > 0 ? plannedPath[plannedPath.length - 1] : activeMover?.position ?? -1;
  const isRouteNextStep = (cell: number): boolean =>
    planning &&
    plannedPath.length < moveRange &&
    moveActionsByDestination.has(cell) &&
    !plannedPath.includes(cell) &&
    isAdjacent(routeEnd, cell);
  const plannedFireWallDamage = (combat?.battlefieldTokens ?? [])
    .filter((token) => token.kind === "fire_wall" && plannedPath.includes(token.position))
    .reduce((sum, token) => sum + (token.damage ?? 0), 0);
  const walkRoute = () => {
    if (!activeMover || plannedPath.length === 0) {
      return;
    }
    onAction({
      type: "MOVE_UNIT",
      playerId: viewerPlayerId,
      unitId: activeMover.id,
      destination: plannedPath[plannedPath.length - 1],
      path: plannedPath
    });
    setRoutePlan(null);
  };

  return (
    <div className={`boardFelt ${flipped ? "flipped" : ""}`} aria-label="Combat board">
      {stopPlacingTokensAction ? (
        <div className="placeTokensBanner" role="status">
          <span>{placeTokensPrompt ?? "Place a token on an empty space, or stop."}</span>
          <button
            className="commandButton"
            onClick={() => stopPlacingTokensAction && onAction(stopPlacingTokensAction)}
            type="button"
          >
            Stop placing tokens
          </button>
        </div>
      ) : null}
      {expertSwapAvailable ? (
        <div className="tacticsExpertBanner" role="group" aria-label="Expert Tactics">
          {expertSwapArmed ? (
            <>
              <span>Tactics (expert): click one of your units, then another, to switch them.</span>
              <button
                className="commandButton"
                onClick={() => {
                  setExpertSwapArmed(false);
                  setSwapSelection(null);
                }}
                type="button"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="commandButton"
              onClick={() => setExpertSwapArmed(true)}
              type="button"
              title="Switch the positions of two of your units (spends one expert use)."
            >
              Tactics (expert): switch two units
            </button>
          )}
        </div>
      ) : null}
      {routePlanningAvailable ? (
        <div className="routePlanBanner" role="group" aria-label="Move route planner">
          {!planning ? (
            <button
              className="commandButton"
              onClick={() => activeMover && setRoutePlan({ unitId: activeMover.id, path: [] })}
              type="button"
              title="A Fire Wall is on the field — hand-pick this unit's route to brave or dodge it."
            >
              Plan route 🔥
            </button>
          ) : (
            <>
              <span>
                Route: {plannedPath.length} step{plannedPath.length === 1 ? "" : "s"}
                {plannedFireWallDamage > 0 ? ` · 🔥 ${plannedFireWallDamage} damage` : " · clear"} — click cells to extend, click a step to trim.
              </span>
              <button className="commandButton" disabled={plannedPath.length === 0} onClick={walkRoute} type="button">
                Walk route
              </button>
              <button className="commandButton" onClick={() => setRoutePlan(null)} type="button">
                Cancel
              </button>
            </>
          )}
        </div>
      ) : null}
      <div className="battlefieldFrame" data-board-art={boardArt.id} title={boardArt.label}>
        <img
          alt=""
          aria-hidden="true"
          className="battlefieldScenery"
          referrerPolicy="no-referrer"
          src={assetUrl(boardArt.scenery)}
        />
        <div className="battlefield">
          {/* Terrain art is a landscape 5x4 board, so it lines up directly with
              the transposed cells and only mirrors for the seat-relative flip. */}
          <img
            alt=""
            aria-hidden="true"
            className="battlefieldTerrain"
            referrerPolicy="no-referrer"
            src={assetUrl(boardArt.terrain)}
          />
          <div aria-label="Battlefield coordinate guide" className="battlefieldCoordinates">
            {Array.from({ length: BATTLEFIELD_ROWS }, (_, engineRow) => {
              const gridColumn = battlefieldCellPlacement(engineRow * BATTLEFIELD_COLUMNS, flipped).gridColumn;
              const label = String(engineRow + 1);
              return (
                <span
                  className="battlefieldCoordinate number top"
                  data-coordinate-axis="number-top"
                  data-coordinate-value={label}
                  key={`number-top-${label}`}
                  style={{ gridColumn, gridRow: 1 }}
                >
                  {label}
                </span>
              );
            })}
            {Array.from({ length: BATTLEFIELD_ROWS }, (_, engineRow) => {
              const gridColumn = battlefieldCellPlacement(engineRow * BATTLEFIELD_COLUMNS, flipped).gridColumn;
              const label = String(engineRow + 1);
              return (
                <span
                  className="battlefieldCoordinate number bottom"
                  data-coordinate-axis="number-bottom"
                  data-coordinate-value={label}
                  key={`number-bottom-${label}`}
                  style={{ gridColumn, gridRow: BATTLEFIELD_COLUMNS }}
                >
                  {label}
                </span>
              );
            })}
            {Array.from({ length: BATTLEFIELD_COLUMNS }, (_, engineColumn) => {
              const label = String.fromCharCode(65 + engineColumn);
              return (
                <span
                  className="battlefieldCoordinate letter left"
                  data-coordinate-axis="letter-left"
                  data-coordinate-value={label}
                  key={`letter-left-${label}`}
                  style={{ gridColumn: 1, gridRow: engineColumn + 1 }}
                >
                  {label}
                </span>
              );
            })}
            {Array.from({ length: BATTLEFIELD_COLUMNS }, (_, engineColumn) => {
              const label = String.fromCharCode(65 + engineColumn);
              return (
                <span
                  className="battlefieldCoordinate letter right"
                  data-coordinate-axis="letter-right"
                  data-coordinate-value={label}
                  key={`letter-right-${label}`}
                  style={{ gridColumn: BATTLEFIELD_ROWS, gridRow: engineColumn + 1 }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        {Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, index) => {
          const unit = unitsByPosition.get(index);
          const terrain = getBattlefieldTerrain(index);
          const isObstacle = obstacles.has(index);
          const moveAction = moveActionsByDestination.get(index);
          const attackAction = unit ? attackActionsByDefender.get(unit.id) : undefined;
          const cardAction = unit ? cardActionsByTarget.get(unit.id) : undefined;
          // Space-target casts (Inferno / Frost Ring / Xyron's Inferno) may be
          // centred on a space that HOLDS a unit, so this is resolved for every
          // cell — occupied or not — not just empty ones. (Populated only while a
          // space-target card is selected, so it never shadows attack/move.)
          const spaceCardAction = spaceCardActionsByPosition.get(index);
          // Teleport moves a unit to an EMPTY destination space.
          const teleportAction = !unit ? teleportActionsByPosition.get(index) : undefined;
          // Quicksand / Land Mine placement targets an EMPTY space.
          const placeTokenAction = !unit ? placeTokenActionsByPosition.get(index) : undefined;
          const battlefieldToken = battlefieldTokensByPosition.get(index);
          const abilityAction = unit ? abilityTargetActions.get(unit.id) : undefined;
          const activationOrderAction = unit ? activationOrderActionsByUnit.get(unit.id) : undefined;
          // First Aid Tent heal: only a click-to-heal when nothing else is being
          // targeted (a selected spell/ability keeps priority over the mend).
          const healAction = unit && !selectedCardAction ? healActionsByTarget.get(unit.id) : undefined;
          const isActive = Boolean(unit && combat?.activeUnitId === unit.id);
          const isFlipping = Boolean(unit && flippedUnitIds?.has(unit.id));
          // Deployment: empty own-row cells only. Formation sort: empty cells OR
          // a fellow Neutral guard (drop-to-swap) — without the swap targets,
          // drag-sorting two guards could only move into empty spaces and swaps
          // silently failed (PLACE_NEUTRAL_GUARD is board-only, not a command).
          const dropTarget =
            (placing || sorting || commanderSorting) &&
            ownRows.has(index) &&
            !isObstacle &&
            (!unit ||
              (sorting &&
                unit.controllerId === NEUTRAL_PLAYER_ID &&
                !isArrowTowerUnit(unit)) ||
              // Commander sort: an own (non-commander) unit is a swap target.
              (commanderSorting &&
                unit.controllerId === viewerPlayerId &&
                unit.id !== commanderUnitId(viewerPlayerId) &&
                isUnitAlive(unit)));
          // Tactics swap roles for this cell's unit (only during the setup window).
          const isSwapSelected = Boolean(unit && activeSwapSelection === unit.id);
          const isSwapTarget = Boolean(unit && swapPartners.has(unit.id));
          const isSwapSource = Boolean(
            unit && tacticsSetup && swapSelectable.has(unit.id) && !isSwapSelected && !isSwapTarget
          );
          // The unit currently being moved one space (combat-step) — its origin.
          const isRepositionSource = Boolean(unit && repositionKind === "move" && repositionSourceUnitId === unit.id);
          // A candidate cell of the open reposition (empty move destinations, or
          // swap-partner cells), used to drive the ghost+arrow hover.
          const isRepositionCandidate = repositionKind !== null && repositionCandidates.includes(index);
          const isFlashing = flashCells.includes(index);
          const className = `battleCell ${terrain} ${unit?.controllerId ?? ""} ${isActive ? "active" : ""} ${
            isObstacle ? "obstacle" : ""
          } ${moveAction && !selectedCardAction && !planning ? "moveTarget" : ""} ${
            attackAction && !selectedCardAction ? "attackTarget" : ""
          } ${cardAction || spaceCardAction || teleportAction || placeTokenAction ? "cardTarget" : ""} ${abilityAction ? "abilityTarget" : ""} ${activationOrderAction ? "activationOrderTarget" : ""} ${healAction ? "healTarget" : ""} ${dropTarget ? "dropTarget" : ""} ${
            isSwapSource ? "swapSource" : ""
          } ${isSwapTarget ? "swapTarget" : ""} ${isSwapSelected ? "swapSelected" : ""} ${
            isRepositionSource ? "repositionSource" : ""
          } ${isFlashing ? "fxRepositionFlash" : ""}`;
          // Place the cell on the transposed horizontal grid (see
          // `battlefieldCellPlacement`). DOM order stays in engine order so
          // `data-fx-cell` lookups and tests are unaffected.
          const cellStyle = battlefieldCellPlacement(index, flipped);
          const health = unit ? Math.max(0, unit.maxHealth - shownDamage(unit)) : 0;
          // Hovering a candidate cell drives the ghost + arrow toward it.
          const repositionHoverProps = isRepositionCandidate
            ? {
                onMouseEnter: () => setHoverDestination(index),
                onMouseLeave: () => setHoverDestination((current) => (current === index ? null : current))
              }
            : {};

          // Siege fortifications: walls and the gate live in the middle row.
          const isWall = wallPositions.has(index);
          const isGate = gatePosition === index;
          if (isWall || isGate) {
            // An adjacent unit's melee demolish, or — during a Catapult target
            // pick — the bombardment shot. Either makes the Wall/Gate clickable.
            const fortAction = fortificationActionsByPosition.get(index) ?? fortAbilityTargetByPosition.get(index);
            const label = isGate
              ? "Gate — open to the defender, an obstacle to the attacker. Adjacent ground/flying units may tear it down as their attack."
              : "Wall — a combat obstacle. Adjacent ground/flying units may tear it down as their attack; defenders in its column take 1 less ranged damage.";
            const content = (
              <span className={`fortMark ${isGate ? "gate" : "wall"}`}>
                <img
                  alt={isGate ? "Gate card" : "Wall card"}
                  className="fortCardImg"
                  loading="eager"
                  referrerPolicy="no-referrer"
                  src={assetUrl(isGate ? "/assets/structures-gate.webp" : "/assets/structures-wall.webp")}
                />
                <small>{isGate ? "Gate" : "Wall"}</small>
              </span>
            );
            if (fortAction) {
              return (
                <button
                  aria-label={fortAction.label}
                  className={`${className} fortification attackTarget`}
                  data-fx-cell={index}
                  key={index}
                  onClick={() => onAction(fortAction.action)}
                  style={cellStyle}
                  title={`${fortAction.label} — automatically successful, no die, no cards`}
                  type="button"
                >
                  {content}
                </button>
              );
            }
            return (
              <div
                aria-label={label}
                className={`${className} fortification`}
                data-fx-cell={index}
                key={index}
                style={cellStyle}
                title={label}
              >
                {content}
              </div>
            );
          }

          if (isObstacle) {
            return (
              <div
                aria-label={`Obstacle at ${getBattlefieldLabel(index)}: blocks ground and ranged movement`}
                className={className}
                data-fx-cell={index}
                key={index}
                style={cellStyle}
                title="Combat Obstacle — ground and ranged units must go around; flying units pass over"
              >
                <span className="obstacleMark">
                  <Mountain aria-hidden="true" size={26} />
                </span>
              </div>
            );
          }

          const tint = unit ? tintedUnits?.get(unit.id) : undefined;
          const tokenMark = battlefieldToken ? (
            <BattlefieldTokenMark state={state} token={battlefieldToken} viewerPlayerId={viewerPlayerId} />
          ) : null;
          // Clone Spell: a Clone is shown as the cloned unit's own card washed
          // blue (a ghostly "clone" tint) with a Clone badge, so it reads at a
          // glance as a magical copy rather than the real stack.
          const isClone = Boolean(unit?.cloneOfUnitId);
          // Berserk is an active effect, not a token — surface it as a badge so the
          // player can see a unit is forced to attack the nearest on its next turn.
          const isBerserked = Boolean(unit && unitIsBerserk(state.activeEffects, unit));
          // Retaliation spent: flag a unit that has already used its once-per-round
          // counter-attack, so the table can see it will NOT strike back if hit in
          // melee now (a unit with unlimited retaliation is never flagged).
          const retaliationSpent = Boolean(unit && retaliationStatus(state, unit) === "used");
          const content = unit ? (
            <article
              className={`boardCard ${unit.controllerId} ${isFlipping ? "flipping" : ""} ${tint ? `fxTint-${tint}` : ""} ${
                isClone ? "cloneCard" : ""
              }`}
            >
              {unit.assets?.cardImage ? (
                <img
                  alt={unit.assets?.imageAlt ?? unit.cardName}
                  className="boardCardImage"
                  // Suppress the browser's native image drag: a placed unit is
                  // repositioned with a custom pointer-drag (beginUnitPointerDrag),
                  // and a competing native <img> drag swallows the pointer events
                  // so the drop never lands. (The deploy-panel portrait does the
                  // same — see PlacementPanel.)
                  draggable={false}
                  loading="eager"
                  referrerPolicy="no-referrer"
                  src={assetUrl(unit.assets.cardImage)}
                />
              ) : (
                <div className="boardCardImage cardFaceFallback">{unit.name}</div>
              )}
              <div className="boardCardHud">
                <strong>{unit.cardName}</strong>
                <span>
                  {health}/{unit.maxHealth} HP
                  {unit.defenseToken ? " DEF" : ""}
                </span>
              </div>
              <TokenChips unit={unit} />
              {tokenMark}
              {isActive ? (
                <>
                  <span className="activeRing" aria-hidden="true" />
                  <span
                    className="activeTurnArrow"
                    aria-hidden="true"
                    title={`${unit.cardName} is acting now`}
                  >
                    <ChevronDown aria-hidden="true" size={22} strokeWidth={3} />
                  </span>
                </>
              ) : null}
              {isBerserked ? (
                <span
                  className="berserkBadge"
                  title="Berserk — on this unit's next activation it MUST attack the nearest unit (friend or foe), or move toward it and attack. No free move, defend or other target."
                >
                  Berserk
                </span>
              ) : null}
              {isFlipping ? <span className="flipBadge">Flipped to Few</span> : null}
              {isClone ? (
                <span className="cloneBadge" title="Clone Token — a 1-Health copy; destroyed by any damage, by being attacked, or if its original leaves.">
                  Clone
                </span>
              ) : null}
              {unit?.stackToken ? (
                <span
                  className="stackTokenBadge"
                  title={`Stack Token: ${STACK_TOKEN_LABELS[unit.stackToken]}. A Stacked defender absorbs one lethal blow — it discards this token instead of being removed.`}
                >
                  {STACK_TOKEN_LABELS[unit.stackToken]}
                </span>
              ) : null}
              {(unit?.armyStacks ?? 0) > 0 ? (
                <span
                  className={`armyStackBadge combat count-${Math.min(3, unit?.armyStacks ?? 0)} active`}
                  title={`${unit!.armyStacks} Polish Unit Stack${unit!.armyStacks === 1 ? "" : "s"}: +1 Attack; each Stack absorbs one full Pack health bar.`}
                >
                  <img alt="" aria-hidden="true" src={assetUrl("/assets/ui/polish-unit-stacks-coin.webp")} />
                  ×{unit!.armyStacks}
                </span>
              ) : null}
              {(unit?.unitRank ?? 0) > 0 ? (
                <span
                  className={`unitRankBadge combat rank-${unit!.unitRank}`}
                  title={`Veteran rank ${unit!.unitRank} (${
                    UNIT_RANK_NAMES[unit!.unitRank!] ?? ""
                  }) — ${unit!.unitExperience ?? 0} XP. Rank stat and ability bonuses are already folded into this unit.`}
                >
                  {unitRankBadgeImage(unit!.unitRank!) ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="unitRankBadgeArt"
                      src={assetUrl(unitRankBadgeImage(unit!.unitRank!)!)}
                    />
                  ) : unit!.unitRank! >= 4 ? (
                    "★"
                  ) : unit!.unitRank! >= 3 ? (
                    "⚔"
                  ) : (
                    "^".repeat(unit!.unitRank!)
                  )}
                </span>
              ) : null}
              {retaliationSpent ? (
                <span
                  className="retaliationSpentBadge"
                  title="Retaliation spent — this unit already used its once-per-round counter-attack, so a melee hit now will NOT draw a retaliation."
                >
                  <Swords aria-hidden="true" size={9} /> no counter
                </span>
              ) : null}
              {/* Polish Wait: an hourglass marks a unit that has Waited this
                  round — it re-activates after all others, highest token first. */}
              {unit?.waitPending ? (
                <span
                  className="waitBadge"
                  title={`Waited — re-activates after the other units this round${
                    unit.waitToken ? ` (wait token ${unit.waitToken})` : ""
                  }.`}
                >
                  <Hourglass aria-hidden="true" size={9} /> Wait
                </span>
              ) : null}
            </article>
          ) : (
            tokenMark ?? <span className="emptyBoardMark" aria-hidden="true" />
          );

          // During deployment your placed units stay draggable to new spaces.
          // Pointer-based so it works on touch devices, not just a mouse. Under
          // PvP Neutral Control the controller likewise drags the Neutral guards
          // to sort the formation (dropping onto another guard swaps them).
          const deployDraggable = Boolean(placing && unit && unit.controllerId === viewerPlayerId && unit.armyUnitId);
          const sortDraggable = Boolean(
            sorting && unit && unit.controllerId === NEUTRAL_PLAYER_ID && !isArrowTowerUnit(unit)
          );
          // Commander sort: the viewer's own commander is the draggable body.
          const commanderDraggable = Boolean(
            commanderSorting && unit && unit.id === commanderUnitId(viewerPlayerId) && unit.controllerId === viewerPlayerId
          );
          const placedUnitDraggable = deployDraggable || sortDraggable || commanderDraggable;
          const dragProps = placedUnitDraggable
            ? {
                onPointerDown: (event: React.PointerEvent) => {
                  beginUnitPointerDrag(event, {
                    portraitUrl: unit!.assets?.cardImage,
                    onDragStart: sortDraggable ? () => setSortDragUnitId(unit!.id) : undefined,
                    onDragEnd: sortDraggable ? () => setSortDragUnitId(null) : undefined,
                    onDrop: (position) =>
                      onAction(
                        sortDraggable
                          ? { type: "PLACE_NEUTRAL_GUARD", playerId: viewerPlayerId, unitId: unit!.id, position }
                          : commanderDraggable
                            ? { type: "PLACE_COMMANDER", playerId: viewerPlayerId, position }
                            : {
                                type: "PLACE_COMBAT_UNIT",
                                playerId: viewerPlayerId,
                                armyUnitId: unit!.armyUnitId as string,
                                position
                              }
                      )
                  });
                }
              }
            : {};

          // Tactics swap (start-of-combat window): click a unit to select it,
          // then click an ally to switch them. Clicking the selected unit again
          // clears the pick. Takes precedence over plain inspect during setup.
          if (unit && (isSwapSource || isSwapTarget || isSwapSelected)) {
            const swapClick = () => {
              if (isSwapSelected) {
                setSwapSelection(null);
                setHoverDestination(null);
                return;
              }
              if (isSwapTarget) {
                const action = swapPartners.get(unit.id);
                if (action) {
                  setFlashCells(
                    repositionSourcePosition !== null ? [repositionSourcePosition, index] : [index]
                  );
                  setSwapSelection(null);
                  setHoverDestination(null);
                  onAction(action);
                }
                return;
              }
              setSwapSelection(unit.id);
              setHoverDestination(null);
            };
            const swapLabel = isSwapSelected
              ? `Deselect ${unit.name}`
              : isSwapTarget
                ? `Switch ${combat?.units[activeSwapSelection ?? ""]?.name ?? "unit"} with ${unit.name}`
                : `Select ${unit.name} to switch`;
            return (
              <button
                aria-label={swapLabel}
                className={className}
                data-fx-cell={index}
                data-fx-unit={unit.id}
                key={index}
                onClick={swapClick}
                onMouseEnter={() => {
                  onInspect(unit.id);
                  if (isSwapTarget) {
                    setHoverDestination(index);
                  }
                }}
                onMouseLeave={isSwapTarget ? () => setHoverDestination((current) => (current === index ? null : current)) : undefined}
                style={cellStyle}
                title={swapLabel}
                type="button"
              >
                {content}
              </button>
            );
          }

          // Route-planning clicks take precedence: a next-step cell extends the
          // chosen route; clicking a cell already on the route trims it back to
          // there (clicking the last waypoint removes it). The normal one-click
          // auto-move is suppressed while a route is being planned.
          const routeStepIndex = planning ? plannedPath.indexOf(index) : -1;
          const onRoute = routeStepIndex >= 0;
          const nextStep = isRouteNextStep(index);
          if (planning && (onRoute || nextStep)) {
            const stepLabel = onRoute
              ? `Trim route at ${getBattlefieldLabel(index)}`
              : `Extend route to ${getBattlefieldLabel(index)}`;
            return (
              <button
                aria-label={stepLabel}
                className={`${className} routeCell ${onRoute ? "routeStep" : "routeNext"}`}
                data-fx-cell={index}
                data-fx-unit={unit?.id}
                key={index}
                onClick={() =>
                  setRoutePlan((current) =>
                    current
                      ? { ...current, path: onRoute ? current.path.slice(0, routeStepIndex) : [...current.path, index] }
                      : current
                  )
                }
                style={cellStyle}
                title={stepLabel}
                type="button"
              >
                {content}
                {onRoute ? (
                  <span className="routeBadge" aria-hidden="true">
                    {routeStepIndex + 1}
                  </span>
                ) : null}
              </button>
            );
          }

          const interactiveAction =
            activationOrderAction ??
            abilityAction ??
            cardAction ??
            spaceCardAction ??
            teleportAction ??
            placeTokenAction ??
            (unit ? (attackAction ?? healAction) : planning ? undefined : moveAction);

          // Ability-target picks (Magog splash, Lich Death Cloud, …) must stay
          // clickable even while a hand card is still "selected" — otherwise the
          // board silently falls back to inspect-only and friendlies (and every
          // other candidate) cannot be clicked for the splash.
          if (
            interactiveAction &&
            (!selectedCardAction ||
              activationOrderAction ||
              abilityAction ||
              cardAction ||
              spaceCardAction ||
              teleportAction ||
              placeTokenAction)
          ) {
            const label = activationOrderAction
              ? `Choose ${unit?.name} to activate first`
              : abilityAction
              ? `Ability target: ${unit?.name}`
              : cardAction
                ? `Target ${unit?.name}`
                : spaceCardAction
                  ? `Cast on ${getBattlefieldLabel(index)}${unit ? ` (over ${unit.name})` : ""}`
                  : teleportAction
                    ? repositionKind === "move" || teleportIsNeutralMove
                      ? `Move to ${getBattlefieldLabel(index)}`
                      : `Teleport to ${getBattlefieldLabel(index)}`
                    : placeTokenAction
                      ? `Place token on ${getBattlefieldLabel(index)}`
                      : unit
                        ? attackAction
                          ? `Attack ${unit?.name}`
                          : `First Aid Tent: heal ${unit?.name}`
                        : `Move to ${getBattlefieldLabel(index)}`;
            return (
              <button
                aria-label={label}
                className={className}
                data-fx-cell={index}
                data-fx-unit={unit?.id}
                key={index}
                onClick={() => {
                  // A unit arriving on an empty space flashes the destination.
                  if (teleportAction) {
                    setFlashCells([index]);
                    setHoverDestination(null);
                  }
                  onAction(interactiveAction);
                }}
                onMouseEnter={unit ? () => onInspect(unit.id) : undefined}
                {...repositionHoverProps}
                style={cellStyle}
                title={label}
                type="button"
              >
                {content}
              </button>
            );
          }

          if (unit) {
            return (
              <button
                aria-label={`Inspect ${unit.name}`}
                className={`${className}${placedUnitDraggable ? " unitDraggable" : ""}`}
                data-fx-cell={index}
                data-fx-unit={unit.id}
                // During deployment your own placed units are also drop targets:
                // dropping another of your units onto one switches their
                // positions (the engine performs the swap). Enemy-held cells are
                // never drop targets.
                data-drop-cell={placedUnitDraggable ? "true" : undefined}
                key={index}
                onClick={() => onInspect(unit.id)}
                onMouseEnter={() => onInspect(unit.id)}
                title={placedUnitDraggable ? `Drag to move — or drop another unit here to switch (${unit.name})` : `Inspect ${unit.name}`}
                type="button"
                {...dragProps}
                style={cellStyle}
              >
                {content}
              </button>
            );
          }

          return (
            <div
              aria-label={`${terrain} field ${getBattlefieldLabel(index)}${dropTarget ? " — drop a unit here" : ""}`}
              className={className}
              data-drop-cell={dropTarget ? "true" : undefined}
              data-fx-cell={index}
              key={index}
              style={cellStyle}
            >
              {content}
            </div>
          );
        })}
        {repositionKind && repositionSourcePosition !== null && hoverDestination !== null ? (
          <RepositionPreview
            destinationPosition={hoverDestination}
            flipped={flipped}
            kind={repositionKind}
            movingImage={repositionGhostImage}
            sourcePosition={repositionSourcePosition}
            swapBackImage={hoveredSwapPartnerUnit?.assets?.cardImage}
          />
        ) : null}
        </div>
      </div>
      {arrowTower && isUnitAlive(arrowTower) ? (
        <ArrowTowerCard
          legalActions={legalActions}
          onAction={onAction}
          onInspect={onInspect}
          state={state}
          tower={arrowTower}
        />
      ) : null}
    </div>
  );
}

/**
 * The activation order as a row of the actual unit cards, in the exact sequence
 * the round will play out. This uses getActivationOrder, which steps the engine's
 * own selection logic — so it reflects the cross-side ALTERNATION on initiative
 * ties (attacker, defender, attacker, …), not a flat "all attackers, then all
 * defenders" sort that would mis-order a tied defender unit. Visible already
 * during deployment, so both sides see how the placed armies will activate
 * before the combat starts.
 */
export function InitiativeRail({ state }: { state: GameState }) {
  const { zoomUnit } = useCardZoom();
  const units = state.combat ? getActivationOrder(state.combat, state.activeEffects) : [];
  const inSetup = Boolean(state.combat?.setup);
  const bankField =
    state.combat?.context.kind === "neutral"
      ? state.adventure?.fields[state.combat.context.fieldId]
      : undefined;
  const bankSize = bankField?.location === "creature_bank" ? bankField.bankSize : undefined;

  return (
    <div className="initiativeRail" aria-label="Initiative order">
      <span
        className="initLabel"
        title="Units activate in this order (highest initiative first). Same-speed units from opposite sides alternate — attacker, then defender/Neutral, then attacker…"
      >
        <Swords aria-hidden="true" size={14} />
        {inSetup ? "Order" : "Order"}
      </span>
      {bankSize ? (
        <span
          className={`bankSizeCombatChip size-${bankSize}`}
          title={`Polish Creature Bank size ${["", "I", "II", "III", "IV"][bankSize]}: ${bankSize} of the four defenders each carry a Stack Token (reward scaled by X=${bankSize}).`}
        >
          <span className="bankSizeCoin" aria-hidden="true">{bankSize}</span>
          Bank size {["", "I", "II", "III", "IV"][bankSize]} · {bankSize} Stacked
        </span>
      ) : null}
      {units.length === 0 && inSetup ? <small className="initHint">Deploy units — they sort by initiative here.</small> : null}
      {units.map((unit, index) => {
        // Haste/Slow and other lasting effects shift activation order, so the
        // badge shows the *effective* initiative (what actually sorts this rail)
        // rather than the printed base. A shift flags the badge so the table can
        // see at a glance that a spell sped a unit up or slowed it down.
        const init = effectiveInitiative(unit, state.activeEffects);
        const delta = init - unit.initiative;
        // A Waited unit is NOT "done" — getActivationOrder re-queues it later
        // this round, so it stays ungreyed and wears an hourglass here.
        const isDone = unit.activatedThisRound && !unit.waitPending;
        return (
          <button
            className={`initCard ${unit.controllerId} ${state.combat?.activeUnitId === unit.id ? "active" : ""} ${
              isDone ? "done" : ""
            } ${unit.waitPending ? "waited" : ""} ${unit.defenseToken ? "defending" : ""}`}
            key={unit.id}
            onClick={() => zoomUnit(unit)}
            title={`${index + 1}. ${unit.cardName} — initiative ${init}${
              delta !== 0 ? ` (base ${unit.initiative}, ${delta > 0 ? "+" : ""}${delta} from effects)` : ""
            }${isDone ? " (already activated)" : ""}${
              unit.waitPending ? ` (Waited — acts after the others, token ${unit.waitToken ?? "?"})` : ""
            }${unit.defenseToken ? " (Defending — +1 Defense when struck)" : ""}. Click to read the card.`}
            type="button"
          >
            {unit.assets?.cardImage ? (
              <img alt={unit.cardName} loading="lazy" src={assetUrl(unit.assets.cardImage)} />
            ) : (
              <span className="initCardFallback">{unit.name}</span>
            )}
            <b className={`initBadge ${delta > 0 ? "boosted" : delta < 0 ? "slowed" : ""}`}>{init}</b>
            {unit.waitPending ? (
              <span className="initWaitMark" aria-hidden="true" title="Waited">
                <Hourglass size={9} />
                {unit.waitToken ?? ""}
              </span>
            ) : null}
            {unit.defenseToken ? (
              <span className="initDefendMark" aria-hidden="true" title="Defending">
                <Shield size={9} />
              </span>
            ) : null}
          </button>
        );
      })}
      <span className="roundChip">{inSetup ? "Setup" : `Round ${state.combat?.round ?? 0}`}</span>
    </div>
  );
}

/** The controller's MAIN hero level (a commander's level = its hero's level). */
function heroLevelOf(state: GameState, playerId: PlayerId): number {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      return hero.level;
    }
  }
  return 1;
}

export function InspectPanel({ state, unitId }: { state: GameState; unitId: string | null }) {
  const { zoomUnit } = useCardZoom();
  const unit = unitId ? state.combat?.units[unitId] : undefined;

  if (!unit) {
    return (
      <section className="inspectPanel empty" aria-label="Unit inspector">
        <span>Hover a unit to read its card — click it for a big view</span>
      </section>
    );
  }

  const health = Math.max(0, unit.maxHealth - unit.damage);
  const abilities = getUnitAbilityDefinitions(unit);
  // Effective initiative folds in Haste/Slow and other lasting shifts; show that
  // (with the base noted) so the inspector matches the initiative rail.
  const init = effectiveInitiative(unit, state.activeEffects);
  const initDelta = init - unit.initiative;
  // Effective Attack/Defense fold in the army-wide Bulwark Rune buffs (and Bless /
  // Bloodlust / Offense and the like) the same way, so a unit visibly reflects a
  // buff the instant it turns on instead of reading its printed base.
  const attackBonus = getDisplayAttackBonus(state, unit);
  const attack = unit.attack + attackBonus;
  const defenseBonus = getActiveDefenseBonus(state, unit);
  const defense = unit.defense + defenseBonus;
  // Whether this unit will counter-attack a melee blow right now (the same
  // reading the engine's shouldRetaliate uses), surfaced as a plain status line.
  const retaliation = retaliationStatus(state, unit);
  const retaliationText: Record<RetaliationStatus, string> = {
    unlimited: "unlimited — counters every melee hit this round",
    used: "spent — already retaliated, won't counter again this round",
    ready: "ready — counters the next melee hit this round"
  };

  return (
    <section className="inspectPanel" aria-label={`${unit.name} card`}>
      <button
        aria-label={`Read ${unit.cardName} at full size`}
        className="inspectZoom"
        onClick={() => zoomUnit(unit)}
        title="Click to enlarge"
        type="button"
      >
        {unit.commanderSlug && unit.commanderGrades ? (
          // WOG commander: the dynamic card face — real stat numbers (with
          // live buffs folded in) and the unlocked combination skills.
          <div className="inspectImage" style={{ aspectRatio: "auto", background: "transparent" }}>
            <CommanderCardFace
              slug={unit.commanderSlug as CommanderSlug}
              grades={unit.commanderGrades}
              level={heroLevelOf(state, unit.controllerId)}
              dead={unit.damage >= unit.maxHealth}
              statValues={{ attack, defense, health: unit.maxHealth, speed: init }}
            />
          </div>
        ) : unit.assets?.cardImage ? (
          <img
            alt={unit.assets?.imageAlt ?? unit.cardName}
            className="inspectImage"
            loading="eager"
            referrerPolicy="no-referrer"
            src={assetUrl(unit.assets.cardImage)}
          />
        ) : (
          <div className="inspectImage cardFaceFallback">{unit.cardName}</div>
        )}
      </button>
      <div className="inspectBody">
        <strong>{unit.cardName}</strong>
        <span className="inspectKind">
          {isArrowTowerUnit(unit) ? "siege " : ""}
          {unit.grade} {unit.type} · initiative{" "}
          <span className={initDelta > 0 ? "initUp" : initDelta < 0 ? "initDown" : undefined}>{init}</span>
          {initDelta !== 0 ? ` (base ${unit.initiative})` : ""}
        </span>
        <div className="inspectStats">
          <span title={attackBonus !== 0 ? `Attack ${attack} (base ${unit.attack}, ${attackBonus > 0 ? "+" : ""}${attackBonus} from effects)` : "Attack"}>
            ⚔ <span className={attackBonus > 0 ? "statUp" : attackBonus < 0 ? "statDown" : undefined}>{attack}</span>
            {attackBonus !== 0 ? ` (base ${unit.attack})` : ""}
          </span>
          <span title={`${unit.defenseToken ? "Defense (defending: rolls +1 for +1 Defense when struck)" : "Defense"}${defenseBonus !== 0 ? ` — base ${unit.defense}, ${defenseBonus > 0 ? "+" : ""}${defenseBonus} from effects` : ""}`}>
            <Shield aria-hidden="true" size={12} />{" "}
            <span className={defenseBonus > 0 ? "statUp" : defenseBonus < 0 ? "statDown" : undefined}>{defense}</span>
            {defenseBonus !== 0 ? ` (base ${unit.defense})` : ""}
            {unit.defenseToken ? " (defending)" : ""}
          </span>
          <span title="Health">
            ♥ {health}/{unit.maxHealth}
          </span>
        </div>
        <div className={`inspectRetaliation ${retaliation}`} title={`Retaliation ${retaliationText[retaliation]}`}>
          <Swords aria-hidden="true" size={12} /> Retaliation: <b>{retaliation === "used" ? "spent" : retaliation}</b>
        </div>
        {unit.commanderSlug && unit.commanderGrades ? (
          // Commander-only extras: the Might dice (Damage grade) and the Magic
          // Power — the stats the generic row omits. Full detail (grade bonuses,
          // Power ladder, every combo explained) is in the click-to-enlarge view.
          (() => {
            const clamp = (value: number | undefined): CommanderGrade =>
              (value !== undefined && value >= 3 ? 3 : value === 2 ? 2 : value === 1 ? 1 : 0);
            const magicGrade = clamp(unit.commanderGrades.magic);
            const mightDice = commanderStatValue("damage", clamp(unit.commanderGrades.damage));
            const power = commanderStatValue("magic", magicGrade);
            const ward = COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION[magicGrade];
            const immune = magicGrade >= 1;
            const magicTitle = immune
              ? `Magic Power ${power}${ward > 0 ? ` · −${ward} Spell damage taken` : ""} · immune to ongoing effects`
              : "Magic grade 0: cast only — takes full Spell damage, NOT immune to ongoing effects";
            return (
              <div className="inspectStats" style={{ marginTop: 2 }}>
                <span title={`Damage grade (Might): rolls ${mightDice} extra attack ${mightDice === 1 ? "die" : "dice"} on each attack — each “+1” raises Attack, at most one “−1”.`}>
                  🎲 <b>{mightDice}</b> Might {mightDice === 1 ? "die" : "dice"}
                </span>
                <span title={magicTitle}>
                  ✦ Power <b style={{ color: power > 0 ? "#f4d774" : undefined }}>{power}</b>
                </span>
              </div>
            );
          })()
        ) : null}
        {getUnitTokens(unit).length > 0 ? (
          <div className="inspectTokens">
            {getUnitTokens(unit).map((token) => {
              const view = TOKEN_VIEW[token.kind];
              const expiry =
                token.expiresAtCombatRoundEnd !== undefined ? ` · until round ${token.expiresAtCombatRoundEnd} ends` : "";
              // The disc badge already carries the signed amount, so the row
              // text names only the kind (+ any expiry) to avoid a doubled number.
              const label = `${token.kind}${expiry}`;
              return (
                <span className="inspectTokenRow" key={token.id} title={view.describe(token)}>
                  <span className={`tokenChip ${token.kind}`}>
                    <img alt="" aria-hidden="true" className="tokenChipArt" draggable={false} src={assetUrl(view.image)} />
                    {view.showAmount ? (
                      <b className="tokenChipAmount">
                        {token.amount > 0 ? "+" : ""}
                        {token.amount}
                      </b>
                    ) : null}
                  </span>
                  <span className="inspectTokenText">{label}</span>
                </span>
              );
            })}
          </div>
        ) : null}
        {abilities.length > 0 ? (
          <div className="inspectAbilities">
            {abilities.map((ability) => (
              <span
                className={ability.implementationStatus === "implemented" ? "implemented" : "pending"}
                key={ability.id}
                title={ability.text}
              >
                {ability.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function EffectsRail({
  state,
  legalActions,
  onAction
}: {
  state: GameState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const effectActions = legalActions.filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT");

  if (state.activeEffects.length === 0 && effectActions.length === 0) {
    return null;
  }

  return (
    <section className="effectsRail" aria-label="Active effects">
      <header>Table effects</header>
      {state.activeEffects.map((effect) => (
        <div className="effectChip" key={effect.id} title={`${effect.name} (${effect.controllerId})`}>
          <span>{effect.name}</span>
          <small>
            {effect.target?.type === "unit" ? unitName(state, effect.target.unitId) : state.players[effect.controllerId]?.name}
          </small>
        </div>
      ))}
      {effectActions.map((legal) => (
        <button className="effectUse" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
          {legal.label}
        </button>
      ))}
    </section>
  );
}

// Exported so `activated-ability-commands.test.tsx` can assert — statically,
// against the REAL dock set — that every engine-offered activated-unit-ability
// action renders a command button. A new activated ability whose offer action
// type is missing here is exactly the "engine offer with no UI surface" bug.
export const COMMAND_ACTION_TYPES = new Set<GameAction["type"]>([
  "DEFEND_UNIT",
  // Polish Wait (house rule): offered at the start of the active unit's
  // activation; the unit re-activates after all other units, highest token
  // first. Never offered with the rule off (legal-actions gates it).
  "WAIT_UNIT",
  "END_ACTIVATION",
  "END_COMBAT_ROUND",
  "USE_UNIT_ABILITY",
  // Tactics: the start-of-combat swap window and the expert mid-combat swap both
  // surface as command buttons (their legal-action labels name the two units).
  "SWAP_COMBAT_UNITS",
  "FINISH_TACTICS",
  // PvP Neutral Control: the "Ready for battle" button that ends the pre-battle
  // formation sort (the moves/swaps themselves are board drag/click, like
  // deployment, so PLACE_NEUTRAL_GUARD is intentionally NOT a command button).
  "FINISH_NEUTRAL_PLACEMENT",
  // WOG Commanders: the "Ready for battle" button that ends the pre-combat
  // commander sort (PLACE_COMMANDER is board drag/click, like deployment).
  "FINISH_COMMANDER_PLACEMENT",
  // Manual guard control: "Let the AI place them" — reset the pre-battle
  // formation to the rulebook AI's auto-placement (return to AI auto control).
  "AUTO_NEUTRAL_PLACEMENT",
  "SUMMON_DEMONS",
  "USE_GENIE_DECK_DRAW",
  // Anime Hero Grades (§3.11): War Cry — a combat active on the active unit,
  // surfaced as a labelled command button (like a unit ability).
  "USE_HERO_SKILL",
  "COMPLETE_SIMULTANEOUS_TURN",
  "CONTINUE_NEUTRAL_COMBAT",
  // Manual guard control: "Let <guard> act (automatic)" — hands the active
  // guard's activation back to the rulebook AI, next to the manual commands.
  "AUTO_NEUTRAL_ACTIVATION",
  // Retreat is the single in-combat escape button. RETREAT_FROM_COMBAT is the
  // no-casualties flee shown before any unit acts; GIVE_UP_COMBAT is the in-fight
  // concede shown after fighting begins — both labelled "Retreat" (legal-actions).
  // Surrender is normally a before-battle option shown only in the prep panel
  // (the battle board is not rendered during prep, so this entry is inert
  // then). With the polish-reduced-surrender house rule, legal-actions ALSO
  // offers it mid-fight — the dropping per-round toll is the point — and this
  // command button is that offer's only in-combat surface.
  "SURRENDER_COMBAT",
  "RETREAT_FROM_COMBAT",
  "GIVE_UP_COMBAT",
  "ACKNOWLEDGE_COMBAT_END",
  // After-combat Necromancy is a now-or-never window: the player either plays the
  // ability from hand or clicks this Skip button (the field reward is withheld
  // until they decide).
  "SKIP_NECROMANCY",
  "BUILD_STRUCTURE",
  "MOVE_HERO",
  "END_TURN"
]);

function commandLabel(legal: LegalAction): string {
  const action = legal.action;
  switch (action.type) {
    case "DEFEND_UNIT":
      return "Defend";
    case "WAIT_UNIT":
      return "Wait (re-activate after the other units)";
    case "END_ACTIVATION":
      return "Hold position";
    case "END_COMBAT_ROUND":
      return "Next combat round";
    case "COMPLETE_SIMULTANEOUS_TURN":
      return "Ready";
    case "ACKNOWLEDGE_COMBAT_END":
      return "Return to the adventure map";
    case "END_TURN":
      return "End turn";
    case "USE_UNIT_ABILITY":
      return legal.label;
    case "USE_HERO_SKILL":
      return legal.label;
    case "MOVE_HERO":
      return legal.label;
    case "BUILD_STRUCTURE":
      return `Build ${action.buildingId}`;
    default:
      return legal.label;
  }
}

// Combat test mode: every implemented hand-playable card, for the "Add card"
// picker. Mirrors SANDBOX_ADDABLE_KINDS in the reducer.
const SANDBOX_PICKER_KINDS = new Set(["spell", "ability", "artifact", "statistic", "hero-specialty", "war-machine"]);
const SANDBOX_PICKER_CARDS = Object.values(cardLibrary)
  .filter((card) => card.implementationStatus === "implemented" && SANDBOX_PICKER_KINDS.has(card.kind))
  .sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));

/**
 * Sandbox-only: drop any card straight into your hand to test its mechanic,
 * instead of Searching a well for it. Dispatches SANDBOX_ADD_CARD.
 *
 * The card list renders in a portal to <body> as a fixed overlay, so it can't
 * be clipped or mispositioned by the command dock's grid/overflow context the
 * way an in-tree absolute panel was (it appeared off-screen).
 */
function SandboxCardPicker({
  viewerPlayerId,
  onAction
}: {
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const matches = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return SANDBOX_PICKER_CARDS;
    }
    return SANDBOX_PICKER_CARDS.filter(
      (card) => card.name.toLowerCase().includes(query) || card.id.toLowerCase().includes(query)
    );
  }, [filter]);

  return (
    <>
      <button
        className="commandButton ghost"
        onClick={() => setOpen(true)}
        title="Add any card straight to your hand (sandbox test mode)"
        type="button"
      >
        <Plus aria-hidden="true" size={12} /> Add card
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              onClick={() => setOpen(false)}
              role="presentation"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2000,
                background: "rgba(0,0,0,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16
              }}
            >
              <div
                aria-label="Add a card to your hand"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                style={{
                  width: "min(420px, 92vw)",
                  maxHeight: "78vh",
                  display: "flex",
                  flexDirection: "column",
                  background: "#1b1b22",
                  color: "#eee",
                  border: "1px solid #555",
                  borderRadius: 10,
                  padding: 14,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong>Add a card to your hand ({matches.length})</strong>
                  <button
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                    style={{ background: "transparent", border: "none", color: "#bbb", cursor: "pointer", fontSize: 20, lineHeight: 1 }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <input
                  aria-label="Filter cards"
                  autoFocus
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter cards…"
                  style={{
                    width: "100%",
                    marginBottom: 10,
                    padding: "6px 8px",
                    boxSizing: "border-box",
                    background: "#11131a",
                    color: "#eee",
                    border: "1px solid #555",
                    borderRadius: 6
                  }}
                  value={filter}
                />
                <ul style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto" }}>
                  {matches.map((card) => (
                    <li key={card.id}>
                      <button
                        onClick={() => onAction({ type: "SANDBOX_ADD_CARD", playerId: viewerPlayerId, cardId: card.id })}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 8px",
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid #2a2d36",
                          color: "inherit",
                          cursor: "pointer",
                          display: "flex",
                          gap: 8,
                          alignItems: "baseline"
                        }}
                        type="button"
                      >
                        <span style={{ fontSize: 10, opacity: 0.55, minWidth: 78, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          {card.kind}
                        </span>
                        <span>{card.name}</span>
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 ? <li style={{ padding: "6px 8px", opacity: 0.6 }}>No matching cards.</li> : null}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function CommandDock({
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
  // Tactics swaps are ALWAYS driven on the board (click a unit, then another) —
  // Basic in the start-of-combat window, Expert via the board's opt-in control.
  // So the pairwise SWAP_COMBAT_UNITS buttons never appear in the command menu
  // (they used to flood it with one verbose button per pair). "Keep positions"
  // (FINISH_TACTICS) stays as the Basic-window decline.
  // PvP pre-battle preparation runs on the adventure map (PreBattlePanel), which
  // owns every prep control (build / recruit / buy spells / Accept / Retreat),
  // so the battlefield dock stays out of its way while the window is open.
  const inBattlePrep = inCombatPrep(state, viewerPlayerId);
  const commands = inBattlePrep
    ? []
    : legalActions.filter(
        (legal) =>
          COMMAND_ACTION_TYPES.has(legal.action.type) && legal.action.type !== "SWAP_COMBAT_UNITS"
      );
  // First Aid Tent heal, surfaced right by the commands (not only in the
  // under-board effects rail). One button per wounded friendly unit; also
  // present inside the attack reaction window, so you can mend the instant
  // you're hit. The basic heal comes first so it reads as the simple default.
  const healCommands = inBattlePrep
    ? []
    : legalActions
        .filter((legal) => legal.action.type === "USE_ACTIVE_EFFECT")
        .sort((left, right) => Number(left.action.type === "USE_ACTIVE_EFFECT" && left.action.mode === "expert") -
          Number(right.action.type === "USE_ACTIVE_EFFECT" && right.action.mode === "expert"));
  const activeUnitId = state.combat?.activeUnitId;
  const activeUnit = activeUnitId ? state.combat?.units[activeUnitId] : undefined;
  const outcome = state.combat?.outcome;
  const waitingOn =
    state.pendingChoice?.playerId ?? state.reactionWindow?.priorityPlayerId ?? state.activePlayerId;
  // A ranged unit that just fired may still take its 1-space step.
  const postShotMove = Boolean(
    activeUnit &&
      activeUnit.controllerId === viewerPlayerId &&
      activeUnit.attackedThisActivation &&
      !activeUnit.activatedThisRound &&
      activeUnit.type === "ranged"
  );
  const prepOpen = Boolean(state.combat?.prep);
  const status = outcome
    ? `${state.players[outcome.winnerPlayerId]?.name ?? outcome.winnerPlayerId} wins`
    : inBattlePrep
      ? "Prepare for battle on the map"
      : prepOpen
        ? "Both sides are preparing for battle on the map…"
        : waitingOn === viewerPlayerId
          ? activeUnit && activeUnit.controllerId === viewerPlayerId
            ? postShotMove
              ? `${activeUnit.name} fired — step 1 space or hold`
              : `${activeUnit.name} is active`
            : "Your move"
          : `Waiting for ${state.players[waitingOn]?.name ?? waitingOn}`;

  const player = state.players[viewerPlayerId];
  // Expert Intelligence "ignores the limit": casts still tick the counter, so
  // show the cap as ∞ and never mark it spent while that effect is held.
  const ignoreSpellLimit = Boolean(player) && playerSpellCastsIgnoreLimit(state, viewerPlayerId);
  const spellLimit = 1 + (player?.combatStats.spellLimitBonusThisRound ?? 0);
  const spellLimitLabel = ignoreSpellLimit ? "∞" : String(spellLimit);
  const spellsCast = player?.combatStats.spellsCastThisRound ?? 0;
  const crownsLeft = player
    ? player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound
    : 0;

  return (
    <div className="commandDock" aria-label="Commands">
      <span className="dockStatus">{status}</span>
      {state.combat && !outcome ? (
        <div className="dockLimits" aria-label="Per-round limits">
          <span
            className={!ignoreSpellLimit && spellsCast >= spellLimit ? "limitSpent" : ""}
            title={
              ignoreSpellLimit
                ? "Intelligence (expert): your spells no longer count toward the per-combat-round limit."
                : `One spell per combat round${spellLimit > 1 ? ` (+${spellLimit - 1} from Knowledge)` : ""}. Hero specialties never count against it.`
            }
          >
            <Sparkles aria-hidden="true" size={12} /> Spell {spellsCast}/{spellLimitLabel}
          </span>
          <span title="Expert-effect crowns left this combat round">
            <Crown aria-hidden="true" size={12} /> {crownsLeft} crown{crownsLeft === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
      {commands.map((legal) => (
        <button
          className={`commandButton ${legal.action.type === "DEFEND_UNIT" ? "defendButton" : ""}`.trimEnd()}
          key={actionKey(legal.action)}
          onClick={() => onAction(legal.action)}
          type="button"
        >
          {legal.action.type === "DEFEND_UNIT" ? (
            <img alt="" aria-hidden="true" className="defendButtonIcon" src={assetUrl("/assets/ui/defend-button.png")} />
          ) : null}
          {commandLabel(legal)}
        </button>
      ))}
      {healCommands.map((legal) => (
        <button
          className="commandButton healCommandButton"
          key={actionKey(legal.action)}
          onClick={() => onAction(legal.action)}
          title="First Aid Tent — remove damage from your unit (once per combat round; usable the instant you're attacked, before the hit lands)"
          type="button"
        >
          <Plus aria-hidden="true" size={12} /> {legal.label}
        </button>
      ))}
      {state.combat?.context.kind === "sandbox" ? (
        <SandboxCardPicker onAction={onAction} viewerPlayerId={viewerPlayerId} />
      ) : null}
    </div>
  );
}

/** How many events the single-player history drawer renders (newest kept). */
const SINGLE_PLAYER_HISTORY_LIMIT = 500;

export function LogDrawer({ state, viewerPlayerId }: { state: GameState; viewerPlayerId?: PlayerId }) {
  const singlePlayer = state.sessionMode === "single-player";
  const [open, setOpen] = useState(singlePlayer);
  const [filter, setFilter] = useState<"all" | "dice" | "cards" | "events">("all");
  const logState = useMemo(() => {
    if (singlePlayer || !viewerPlayerId) {
      return state;
    }
    // Open multiplayer tables carry the shared state to the browser. Keep the
    // new exact draw/discard details private there too; hosted rooms are
    // already redacted by the server, but this protects the open-table path.
    return {
      ...state,
      eventLog: state.eventLog.map((event) => {
        if (event.type === "CARDS_DRAWN" && event.cardIds) {
          return { ...event, cardIds: event.cardIds.map(() => "hidden" as const) };
        }
        if (event.type === "DECK_SEARCH_RESOLVED") {
          return { ...event, discardedCardIds: event.discardedCardIds.map(() => "hidden" as const) };
        }
        if (
          (event.type === "HAND_REFRESHED" || event.type === "HAND_MULLIGAN") &&
          event.discardedCardIds
        ) {
          return { ...event, discardedCardIds: event.discardedCardIds.map(() => "hidden" as const) };
        }
        return event;
      })
    };
  }, [singlePlayer, state, viewerPlayerId]);
  const events = useMemo(() => {
    // Single-player history goes deep but stays bounded: a late-game log holds
    // thousands of events, and rendering them all janks the drawer open/close.
    const source = singlePlayer ? logState.eventLog.slice(-SINGLE_PLAYER_HISTORY_LIMIT) : logState.eventLog.slice(-30);
    const reversed = [...source].reverse();
    if (filter === "all") {
      return reversed;
    }
    const groups: Record<Exclude<typeof filter, "all">, Set<string>> = {
      dice: new Set([
        "ADVENTURE_DICE_ROLLED",
        "ATTACK_ROLLED",
        "ATTACK_REROLLED",
        "ATTACK_DIE_SETTLED",
        "SPELL_DICE_ROLLED",
        "FIRST_PLAYER_ROLLED",
        "CULTIVATION_TRIBULATION_ROLLED"
      ]),
      cards: new Set([
        "CARDS_DRAWN",
        "DECK_SEARCH_RESOLVED",
        "HAND_REFRESHED",
        "HAND_MULLIGAN",
        "CARD_PLAYED",
        "PERMANENT_PLAYED",
        "PERMANENT_DISCARDED",
        "SPELL_MOVED_TO_SPELL_BOOK",
        "ASTROLOGERS_DRAWN",
        "ASTROLOGERS_DISCARDED",
        "EVENT_CARD_DRAWN",
        "EVENT_AUCTION_RESOLVED",
        "ARTIFACT_DUG"
      ]),
      events: new Set(["EVENT_CARD_DRAWN", "EVENT_AUCTION_BID_PLACED", "EVENT_AUCTION_RESOLVED", "EVENT_NOTE", "ASTROLOGERS_DRAWN", "ASTROLOGERS_DISCARDED"]),
    };
    return reversed.filter((event) => groups[filter].has(event.type));
  }, [filter, logState.eventLog, singlePlayer]);
  const latest = logState.eventLog.at(-1);
  const truncated = singlePlayer && logState.eventLog.length > SINGLE_PLAYER_HISTORY_LIMIT;

  return (
    <section className={`logDrawer ${open ? "open" : ""}${singlePlayer ? " singlePlayerHistory" : ""}`} aria-label={singlePlayer ? "Single-player history" : "Game log"}>
      <button className="logToggle" onClick={() => setOpen(!open)} type="button">
        <ScrollText aria-hidden="true" size={14} />
        <span>{latest ? formatEvent(latest, logState) : "Game log"}</span>
        {open ? <ChevronDown aria-hidden="true" size={14} /> : <ChevronUp aria-hidden="true" size={14} />}
      </button>
      {open ? (
        <>
          {singlePlayer ? (
            <div className="historyFilters" role="group" aria-label="History filters">
              {(["all", "dice", "cards", "events"] as const).map((entry) => (
                <button
                  aria-pressed={filter === entry}
                  className={filter === entry ? "selected" : ""}
                  key={entry}
                  onClick={() => setFilter(entry)}
                  type="button"
                >
                  {entry === "all" ? "All" : entry === "dice" ? "Dice" : entry === "cards" ? "Draws & discards" : "Events"}
                </button>
              ))}
              <small>
                {events.length} entr{events.length === 1 ? "y" : "ies"}
                {truncated ? ` (last ${SINGLE_PLAYER_HISTORY_LIMIT})` : ""}
              </small>
            </div>
          ) : null}
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                <span className="logEventMeta">
                  {event.id}{"round" in event && typeof event.round === "number" ? ` · R${event.round}` : ""}
                </span>
                {formatEvent(event, logState)}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
