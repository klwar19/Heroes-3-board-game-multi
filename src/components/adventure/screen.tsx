"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { assetUrl } from "@/lib/asset-url";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ban, Castle, Check, ChevronDown, ChevronsUp, Crown, Dices, Hammer, HelpCircle, Hourglass, Image as ImageIcon, Info, Layers, Lock, Minus, Plus, RotateCcw, RotateCw, Shield, Sparkles, Swords, Unlock, X } from "lucide-react";
import { HelperCoachLobbyPrompt } from "@/components/table/helper-coach-ui";
import { useHelperCoachPreference } from "@/lib/helper-coach-preference";
import { cardLibrary } from "@/data/cards/library";
import { MORALE_NEGATIVE_DECK_ID, MORALE_POSITIVE_DECK_ID } from "@/data/cards/morale";
import { MORALE_CARD_HINTS, moraleCardRulesText } from "@/components/table/morale-card-cue";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import { TOWN_TOKEN_ICONS, townIconUrl } from "@/data/towns/boards";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  isPlayableFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions } from "@/data/map/locations";
import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  stackTokenDelta,
  type CreatureBankId
} from "@/data/map/creature-banks";
import { fieldSymbolOverlayFor } from "@/data/map/field-symbol-modules";
import { allTileDefinitions } from "@/data/map/tiles";
import { pveThemeFieldArt } from "@/engine/pve-content";
import {
  NEUTRAL_DECK_IDS,
  NEUTRAL_PLAYER_ID,
  DEFAULT_WOG_OPTIONS,
  DEFAULT_ANIME_OPTIONS,
  PVP_TROOP_LOSS_DESCRIPTIONS,
  PVP_TROOP_LOSS_LABELS,
  RULESET_DESCRIPTIONS,
  VICTORY_MODE_DESCRIPTIONS,
  VICTORY_MODE_LABELS,
  applyUnitSideRules,
  bannableHeroesForSeat,
  CUSTOM_WIN_CONDITION_OPTIONS,
  deckDisplayName,
  defaultCustomWinCondition,
  describeCardEffect,
  describeCustomMapPresetEntries,
  describeCustomWinCondition,
  expertUsesAvailable,
  expertUsesTotalThisRound,
  mapObjectsModuleActive,
  mapHasAuthoredGrailOrUtopia,
  DRAFT_FORMAT_LABELS,
  getDraftPhase,
  getActiveAstrologersCard,
  getActiveEventCard,
  getReachableHeroPaths,
  getRuleset,
  getSeatIdentity,
  HOUSE_RULES,
  resolveHouseRules,
  resolveTournamentRules,
  getTileBorderSegments,
  gatePairColor,
  describeFieldReward,
  designedGuardPreview,
  isBlockedFieldCarve,
  isFieldGuarded,
  hasOpenAdventureTurn,
  hexDistance,
  hexSpaceId,
  hexToPixel,
  houseRuleEnabled,
  inCombatPrep,
  isMapObjectLocation,
  isParallelActor,
  isRoundStartEventBarrierActive,
  MAX_CUSTOM_WIN_CONDITIONS,
  MAX_PARALLEL_TURN_ROUNDS,
  mergeCustomWinConditions,
  sanitizeManualPlayerOrder,
  parallelInteractionBlocker,
  parallelTurnsActive,
  polishArmyUnitStackCap,
  polishQuickCombatFieldInfo,
  readyCheckConfirmers,
  remainingParallelPlayerIds,
  observatoryRevealTargets,
  parseHexSpaceId,
  seatPickSummary,
  reservedTownIdsForOtherSeats,
  scenarioDefinitions,
  singlePlayerMapDeployment,
  startingBonusDescription,
  tileFootprint,
  tileLayer,
  tierOfLevel,
  UNIT_LEVELS,
  unitAbilities,
  armyUnitRankInfo,
  mapForcedComputerFaction,
  unitExperienceActive,
  unitSideRuleOverrides,
  validateCustomMapPlan,
  astrologersCardDefinitions,
  eventCardDefinitions,
  type CustomStartingUnit,
  type CustomWinCondition,
  type DraftFormat,
  type FactionId,
  type UnitLevel,
  type GameAction,
  type GameSetupOptions,
  type GameState,
  type HouseRuleId,
  type HeroPathTarget,
  type HeroState,
  type LegalAction,
  type MapFieldState,
  type MapSpaceId,
  type MapTileState,
  type PlayerId,
  type PlayerVisibleState,
  type PolishQuickCombatFieldInfo
} from "@/engine";
import {
  abilitySymbolIcon,
  creatureBankFieldImage,
  HERO_INFO_STAT_ICONS,
  mapTokenImage,
  monolithTokenImage,
  ABILITY_EMPOWER_TOKEN_ICON,
  moraleIcon,
  onewayMonolithImage,
  outpostObjectImage,
  teleportGateImage,
  RESOURCE_ICONS,
  REWARD_GLYPH_ICONS,
  UI_REWARD_ICONS,
  subterraneanGateTokenImage,
  tileBackImage,
  TILE_BACK_IMAGES,
  whirlpoolTokenImage
} from "@/data/assets/homm-assets";
import { fieldOverrideGlyph, fieldOverrideImage } from "@/data/map/field-overrides";
import { fieldOverridePresentation, mapObjectPresentation } from "@/data/map/field-override-presentation";
// Side-effect: register Anime + Wake of Gods Field Override kinds into the global
// catalog, so their names/summaries/glyphs resolve for the board tooltip + inspect.
import "@/data/anime/field-overrides";
import "@/data/wog/field-overrides";
import { specialtyIconSrc } from "@/components/specialty-card-data";
import { CommanderCard, CommanderLevelUpOverlay } from "@/components/commander-card";
import { EquipGradeChip, tierToGrade } from "@/components/equip-grade-chip";
import { commanderDefinitions, commanderReviveCost, type CommanderSlug } from "@/data/commanders";
import { COMMANDER_ARTIFACT_SPECS, COMMANDER_ARTIFACT_SPEC_LIST } from "@/data/wog/commander-artifacts";
import { getEquipmentDefinition, equipmentImage } from "@/data/anime/equipment";
import { UNIT_RANK_THRESHOLDS, unitRankBadgeImage } from "@/data/units/experience";
import { factionUiLexicon } from "@/data/faction-theme";
import { CARD_BACK_IMAGES, getDeckBack } from "@/data/decks";
import { actionKey, cardIsEmpoweredFor, cardName, formatCost, titleCase } from "@/components/table/utils";
// Polish Set Artifacts: the ONE badge pair every card-face surface shares — a
// wrapper for a face in normal flow, a bare corner badge for a face that fills
// an already-positioned tile. Both render NOTHING with the rule off / a
// non-member card, so a default table keeps its exact DOM.
import { CardSetCornerBadge, CardSetFrame } from "@/components/table/artifact-set-badge";
import { cardFaceImage } from "@/data/cards/empowered-card-art";
import { resolveCardFaceImage, usePolishBalanceArtEnabled } from "@/components/table/polish-balance-art";
import { beginUnitPointerDrag } from "@/components/table/pointer-drag";
import { MAP_SCALE_MAX, MAP_SCALE_MIN, pinchCamera, type PinchStart } from "@/components/adventure/map-pinch";
import { computeMapFloatPosition } from "@/components/adventure/map-float-position";
import { HeroBoard } from "@/components/hero-board";
import { UnitExperienceWindow, armyUnitPrintedSide } from "@/components/adventure/unit-experience-window";
import { DrillUnitButton } from "@/components/adventure/drill-unit-button";
import { useCardZoom, useOptionalCardZoom, ZoomButton } from "@/components/table/zoom";
import {
  BuildingDetailPanel,
  HeroPortrait,
  HireHeroesSection,
  TownRecruitSection,
  UnitSideCards,
  hasBuildingEffectPanel,
  activeBuildingActions,
  buildingPanelReachable
} from "@/components/adventure/town-sections";
import {
  MgqBattleSpiritPicker,
  MgqCompanionRecruitmentPrompt,
  MgqGoldContractPanel,
  MgqGoldContractSetupPrompt,
  MgqJobControl,
  mgqGoldUnavailable
} from "@/components/adventure/mgq-controls";
import { fetchSharedMaps, type SharedMapRecord } from "@/lib/shared-maps";
import { buildCustomSetupFile, customSetupFileName, parseCustomSetupFile } from "@/lib/custom-setup-file";
import {
  advancedSettingsChanged,
  deriveActiveSetupMode,
  designedMapBlockers,
  designedMapInPlay,
  DIFFICULTY_CHOICES,
  heroesSummary,
  mapSummary,
  MODE_PRESET_PAYLOADS,
  SETUP_HUB_MODE_NAMES,
  type SetupHubBoxId,
  type SetupModeId
} from "@/components/adventure/setup-hub-summary";
import { MapPickModal } from "@/components/adventure/map-pick-modal";
import { SetupSummaryRail } from "@/components/adventure/setup-summary-rail";
import { SetupHubWindow } from "@/components/adventure/setup-hub-window";
import { SetupSceneArt } from "@/components/adventure/setup-scene";
import { DIFFICULTY_CHESS_ICONS, SETUP_HUB_ART } from "@/data/assets/homm-assets";

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
  water: "#2e5d8a",
  // Conflux Elemental Near tiles (N14–N21) — fallback fill when art is off.
  elemental_fire: "#a04a2a",
  elemental_water: "#2a6a9a",
  elemental_air: "#7a9ab8",
  elemental_earth: "#6a5a3a"
};

export const LOCATION_GLYPHS: Record<string, string> = {
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
  blocked_field: "⛔",
  subterranean_gate: "🕳",
  creature_bank: "🏦",
  monolith: "⛩",
  whirlpool: "🌀",
  gate: "⛩",
  // Anime Field Override locations (global FO system content)
  "anime.bi_canh": "🌌",
  "anime.kiem_trung": "⚔",
  "anime.linh_tuyen": "💧",
  "anime.ngo_dao_thach": "🪨",
  "anime.tran_phap_truyen_tong": "⛩"
};

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];

/** Colored Gate pair (1-4) → its colour-blind-safe tint (matches gatePairColor). */
const GATE_PAIR_COLORS: Record<number, string> = {
  1: "#e0483c",
  2: "#3d7fe0",
  3: "#3caf52",
  4: "#b04fd6"
};

/** Teleport-object locations the unified {@link teleportHexMark} renders. */
function isTeleportMarkLocation(locationId: string): boolean {
  return (
    locationId === "gate" ||
    locationId === "monolith" ||
    locationId === "whirlpool" ||
    locationId === "oneway_entrance" ||
    locationId === "oneway_exit"
  );
}

/**
 * Unified teleport-object hex mark — the SAME iconography the map designer
 * draws (user request: the game map should reuse the editor's teleport icons):
 * the object's own UNDISTORTED token art (never stretched into the hex box),
 * an identifying ring, and — for the colored networks — a readable pair-number
 * badge (colour-blind-safe). Teleport Gates and one-way Monoliths ring in
 * their pair colour; Monoliths and Whirlpools wear the designer's gold ring.
 * Used for BOTH tile-carved and standalone fields.
 */
function teleportHexMark(
  spaceId: string,
  x: number,
  y: number,
  field: Pick<MapFieldState, "location" | "gatePair" | "whirlpoolNumber">
): ReactNode {
  const pair = (field.gatePair ?? 1) as 1 | 2 | 3 | 4;
  // Gates and one-way halves belong to a colored network; the plain Monolith /
  // Whirlpool networks are identified by the designer's gold ring instead.
  const colored = field.location !== "monolith" && field.location !== "whirlpool";
  const color = colored ? GATE_PAIR_COLORS[pair] ?? "#c9a24b" : "#c9a24b";
  const image =
    field.location === "gate"
      ? teleportGateImage(pair)
      : field.location === "monolith"
        ? monolithTokenImage()
        : field.location === "whirlpool"
          ? whirlpoolTokenImage(field.whirlpoolNumber)
          : onewayMonolithImage(field.location === "oneway_entrance" ? "entrance" : "exit", pair);
  // A touch smaller than the hex so the token icon sits neatly inside it
  // (the ring + badge keep it identifiable at the reduced size).
  const art = HEX_SIZE * 1.28;
  return (
    <g className="hexGateMark" key={`${spaceId}-gate-mark`} style={{ pointerEvents: "none" }}>
      {/* The object's own token artwork, undistorted (designer parity). */}
      <image
        className="hexGateMonolith"
        height={art * 1.4}
        href={assetUrl(image)}
        preserveAspectRatio="xMidYMid meet"
        width={art}
        x={x - art / 2}
        y={y - art * 0.72}
      />
      {/* Ring identifying the network (pair colour, or the designer gold). */}
      <circle cx={x} cy={y} fill="none" r={HEX_SIZE * 0.62} stroke={color} strokeWidth={3} />
      {colored ? (
        <>
          {/* Small pair-number badge (top-right). */}
          <circle cx={x + HEX_SIZE * 0.46} cy={y - HEX_SIZE * 0.46} fill="rgba(12,8,4,0.85)" r={HEX_SIZE * 0.3} stroke={color} strokeWidth={2} />
          <text
            fill={color}
            fontSize={HEX_SIZE * 0.44}
            fontWeight={700}
            textAnchor="middle"
            x={x + HEX_SIZE * 0.46}
            y={y - HEX_SIZE * 0.3}
          >
            {pair}
          </text>
        </>
      ) : null}
    </g>
  );
}

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

/**
 * Push one bold yellow border line onto `target`: a dark casing UNDER the gold
 * core (both same coords, casing first so it renders beneath). Used for every
 * printed / designed border line so they read boldly on the map art.
 */
function pushBorderLines(
  target: ReactNode[],
  keyBase: string,
  coords: { x1: number; y1: number; x2: number; y2: number }
): void {
  target.push(<line className="tileBorderCasing" key={`${keyBase}-casing`} {...coords} />);
  target.push(<line className="tileBorderLine" key={`${keyBase}-core`} {...coords} />);
}

/** A quiet perimeter around the seven-hex flower of an Underground tile. The
 * three outward edges of each ring hex form the complete outline without
 * drawing noisy internal seams. It is intentionally shown on tile backs too,
 * because the layer is public map structure rather than reveal information. */
function pushUndergroundTileOutline(
  target: ReactNode[],
  tileId: string,
  footprint: readonly { row: number; col: number }[],
  rotation: number
): void {
  for (let slot = 1; slot <= 6; slot += 1) {
    const cell = footprint[slot];
    if (!cell) continue;
    const outward = (slot - 1 + rotation) % 6;
    const pixel = hexToPixel(cell, HEX_SIZE);
    for (const edge of [outward - 1, outward, outward + 1]) {
      const direction = ((edge % 6) + 6) % 6;
      target.push(
        <line
          className="undergroundTileOutline"
          data-underground-tile-id={tileId}
          key={`${tileId}-underground-outline-${slot}-${direction}`}
          {...hexEdgeForDirection(pixel.x, pixel.y, HEX_SIZE - 1.2, direction)}
        />
      );
    }
  }
}

function playerColor(state: GameState, playerId: PlayerId | null): string {
  if (!playerId) {
    return "#999";
  }
  const factionId = state.players[playerId]?.factionId;
  return (factionId && coreFactionDefinitions[factionId]?.color) || "#b08d2f";
}

/**
 * HUD chip for the Ability Empower token (max 1), displayed like morale.
 * Click opens a picker of legal hand-Ability spends when the engine offers them.
 */
function AbilityEmpowerTokenChip({
  player,
  legalActions,
  onAction,
  readOnly
}: {
  player: { abilityEmpowerToken?: number; id: string };
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  readOnly?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const held = (player.abilityEmpowerToken ?? 0) >= 1;
  const offers = legalActions.filter(
    (legal) =>
      legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.playerId === player.id
  );
  const canSpend = !readOnly && held && offers.length > 0;

  return (
    <>
      <button
        type="button"
        className={`statChip abilityEmpowerTokenChip${held ? " hasToken" : ""}${canSpend ? " canSpend" : ""}`}
        disabled={!canSpend}
        title={
          held
            ? canSpend
              ? "Ability Empower token: click to Empower one Ability in your hand (Expert free forever)."
              : "Ability Empower token held (max 1). Spend when you have a non-Empowered Ability in hand."
            : "No Ability Empower token. Win a Dragon Fly Hive or Griffin Conservatory (house rule) to gain one."
        }
        aria-label={
          held
            ? canSpend
              ? "Spend Ability Empower token"
              : "Ability Empower token held"
            : "No Ability Empower token"
        }
        onClick={() => {
          if (!canSpend) {
            return;
          }
          if (offers.length === 1) {
            onAction(offers[0].action);
            return;
          }
          setPicking(true);
        }}
      >
        <img
          alt=""
          className="abilityEmpowerTokenIcon"
          referrerPolicy="no-referrer"
          src={assetUrl(ABILITY_EMPOWER_TOKEN_ICON)}
        />
        <b>{held ? 1 : 0}</b>
        <small>empower</small>
      </button>
      {picking ? (
        <div
          className="moraleOverflowBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Empower an ability with token"
        >
          <div className="moraleOverflowPopup abilityEmpowerTokenPopup">
            <strong>Spend Ability Empower token</strong>
            <p>Empower one Ability in your hand. Its Expert side then costs no crown for the rest of the game. Token max is 1.</p>
            <div className="handButtons abilityEmpowerTokenChoices">
              {offers.map((legal) => (
                <button
                  key={legal.label}
                  className="commandButton primary"
                  type="button"
                  onClick={() => {
                    onAction(legal.action);
                    setPicking(false);
                  }}
                >
                  {legal.label.replace(/^Ability token: /, "")}
                </button>
              ))}
              <button className="commandButton ghost" type="button" onClick={() => setPicking(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export type TilePlacementSelection = { supplyIndex: number } | null;

export type HeroMoveCue = { id: string; heroId: string; path: MapSpaceId[] };

/**
 * Re-export of the engine placement lattice helper so UI call sites keep a
 * stable import path. Implementation lives in `adventure.ts` (also used by
 * legal-actions so the computer can PLACE_TILE the same slots a human clicks).
 * Must also be imported (not only re-exported) so this module can call it.
 */
import { farTilePlacementCenters } from "@/engine/adventure";
export { farTilePlacementCenters };

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
  heroPositionOverrides,
  readOnly = false
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  placement: TilePlacementSelection;
  moveCue: HeroMoveCue | null;
  // Single-player computer-move replay: while a computer opponent's turn is
  // being walked out cell by cell, its hero pawn renders at the OVERRIDE cell
  // instead of its settled spaceId, so the human watches it move step by step.
  heroPositionOverrides?: Record<string, MapSpaceId>;
  readOnly?: boolean;
}) {
  const adventure = view.adventure;
  const rawAdventure = state.adventure;

  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [showArt, setShowArt] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  // Wheel-zoom is OFF by default so scrolling the wheel pans the page (the map
  // lives inside a scrolling layout) instead of fighting it. The toolbar lock
  // button opts into wheel-to-zoom.
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  // Touch pinch (zoom + two-finger pan). Every pressed pointer is tracked; the
  // moment a SECOND one lands the single-pointer pan is cancelled and the two
  // fingers drive the camera through the pure pinch math in map-pinch.ts. A
  // mouse only ever has one pointer, so none of this can affect mouse play.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ aId: number; bId: number; start: PinchStart } | null>(null);

  // A tap on a would-be move target while the MANDATORY start-of-turn draw is
  // still pending shows a brief, single, auto-fading "draw first" note anchored
  // at that hex — a gentle reminder, never a stacked or repeating toast (a fresh
  // tap just re-anchors the one note and restarts its timer).
  const [drawReminderAt, setDrawReminderAt] = useState<MapSpaceId | null>(null);
  // Click-to-inspect a designer-altered object: which hex's guard/reward info
  // float is open (click again / elsewhere closes it).
  const [inspectGuardAt, setInspectGuardAt] = useState<MapSpaceId | null>(null);
  const drawReminderTimer = useRef<number | null>(null);
  const remindToDraw = (spaceId: MapSpaceId) => {
    setDrawReminderAt(spaceId);
    if (drawReminderTimer.current) {
      window.clearTimeout(drawReminderTimer.current);
    }
    drawReminderTimer.current = window.setTimeout(() => setDrawReminderAt(null), 2600);
  };
  useEffect(
    () => () => {
      if (drawReminderTimer.current) {
        window.clearTimeout(drawReminderTimer.current);
      }
    },
    []
  );

  // Tapping a face-down Subterranean tile you can't discover (because you stand on
  // the Surface, or vice versa) explains WHY and HOW — find a Subterranean Gate
  // and step onto it — instead of silently doing nothing.
  const [gateHintAt, setGateHintAt] = useState<MapSpaceId | null>(null);
  const gateHintTimer = useRef<number | null>(null);
  const remindGateAccess = (spaceId: MapSpaceId) => {
    setGateHintAt(spaceId);
    if (gateHintTimer.current) {
      window.clearTimeout(gateHintTimer.current);
    }
    gateHintTimer.current = window.setTimeout(() => setGateHintAt(null), 4200);
  };
  useEffect(
    () => () => {
      if (gateHintTimer.current) {
        window.clearTimeout(gateHintTimer.current);
      }
    },
    []
  );

  // Wheel-to-zoom is wired as a native non-passive listener (React routes wheel
  // through a passive root listener, so preventDefault from onWheel is ignored
  // and the page would still scroll). The listener is only attached while the
  // user has unlocked zoom, so by default the wheel scrolls the page untouched.
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
      setCamera((current) => ({ ...current, scale: Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, current.scale * factor)) }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [wheelZoomEnabled]);

  // The rendered CSS size of the <svg> element, tracked so the floating control
  // cards (rendered as plain HTML overlays, not SVG foreignObject — mobile WebKit
  // silently fails to paint foreignObject under transforms) can be positioned in
  // real screen pixels. The camera is already React state, so overlays reposition
  // on pan/zoom for free; only the element's own size needs observing.
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      setSvgSize((prev) =>
        prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const isSeated = Boolean(state.players[viewerPlayerId]) && viewerPlayerId !== "observer";
  // A player may field a Main Hero and (via Tavern / Prison) one Secondary
  // Hero. The map controls the "active" hero; click a pawn to switch.
  const myHeroes = useMemo(
    () =>
      isSeated
        ? Object.values(state.heroes).filter((candidate) => candidate.controllerId === viewerPlayerId)
        : [],
    [state.heroes, isSeated, viewerPlayerId]
  );
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const myHero =
    myHeroes.find((candidate) => candidate.id === selectedHeroId) ??
    myHeroes.find((candidate) => candidate.kind === "main") ??
    myHeroes[0] ??
    null;
  const hasSecondaryHero = myHeroes.length > 1;
  const myHeroSpaceId = myHero?.spaceId ?? null;
  // Parallel turns: every open parallel turn counts as "my turn" on the map.
  const myTurn = isSeated && hasOpenAdventureTurn(state, viewerPlayerId);
  // Parallel turns: another player's battle/choice is open — I may still take
  // QUIET moves (the engine filters reachable targets to trigger-free fields).
  const parallelBlocker = isSeated ? parallelInteractionBlocker(state, viewerPlayerId) : null;

  const pendingTileChoice = rawAdventure?.pendingTileChoice ?? null;
  const rotatingTile = pendingTileChoice ? rawAdventure?.tiles[pendingTileChoice.tileInstanceId] : null;
  const iAmRotating = Boolean(pendingTileChoice && pendingTileChoice.playerId === viewerPlayerId && !readOnly);

  // The mandatory start-of-turn draw (or the forced over-limit discard) is still
  // unspent on my own quiet map turn — movement is locked until I draw. A
  // foreign interaction (parallelBlocker) does not park my own draw.
  const drawPending = Boolean(
    myTurn &&
      !readOnly &&
      (parallelBlocker || (!state.combat && !pendingTileChoice && !rawAdventure?.pendingVisit)) &&
      (state.players[viewerPlayerId]?.needsHandRefresh || state.players[viewerPlayerId]?.canMulligan)
  );

  // Reachable click-to-move targets, computed from the live rules.
  const reachable = useMemo(() => {
    if (!myHero || !myTurn || readOnly) {
      return new Map<MapSpaceId, HeroPathTarget>();
    }
    // My own pending input locks movement outright; a FOREIGN interaction in
    // parallel mode leaves quiet moves open (getReachableHeroPaths filters).
    if (!parallelBlocker && (pendingTileChoice || state.combat || rawAdventure?.pendingVisit)) {
      return new Map<MapSpaceId, HeroPathTarget>();
    }
    // The mandatory start-of-turn draw (and the forced over-limit discard) must be
    // resolved before moving — withhold every click-to-move target until then so
    // the board matches what the engine will allow.
    if (state.players[viewerPlayerId]?.needsHandRefresh || state.players[viewerPlayerId]?.canMulligan) {
      return new Map<MapSpaceId, HeroPathTarget>();
    }
    return getReachableHeroPaths(state, myHero);
  }, [state, myHero, myTurn, readOnly, pendingTileChoice, rawAdventure?.pendingVisit, viewerPlayerId, parallelBlocker]);

  // While the draw is unspent, the fields the hero COULD step onto once it draws.
  // These render locked (dimmed) and a tap reminds the player to draw first
  // instead of moving — so an attempted move never just silently does nothing.
  const drawReminderTargets = useMemo(() => {
    if (!drawPending || !myHero) {
      return new Map<MapSpaceId, HeroPathTarget>();
    }
    return getReachableHeroPaths(state, myHero);
  }, [drawPending, myHero, state]);

  const discoverByTile = useMemo(() => {
    const targets = new Map<string, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "DISCOVER_TILE") {
        targets.set(legal.action.tileInstanceId, legal.action);
      }
    }
    return targets;
  }, [legalActions]);

  // When the engine is waiting on a "move your hero to a field" choice for the
  // viewer — the Logistics (basic) / Nomads end-of-turn step's "move to an
  // adjacent empty field, or stay" — surface the candidate destinations as
  // highlighted, clickable hexes on the board, not just text buttons in the
  // prompt tray. Every option whose first step teleports the hero maps its
  // destination field to the action that selects it. A Monolith/Whirlpool/Gate
  // travel picker (`step.teleport`) uses ITS OWN affordance (teleportChoice
  // below) — it is skipped here so the two never double-tag the same hex.
  const endTurnMoveTargets = useMemo(() => {
    const targets = new Map<MapSpaceId, GameAction>();
    if (readOnly) {
      return targets;
    }
    const visit = rawAdventure?.pendingVisit;
    const step = visit?.steps[0];
    if (!visit || visit.playerId !== viewerPlayerId || step?.type !== "CHOOSE_ONE" || step.teleport) {
      return targets;
    }
    const actionByOption = new Map<number, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined) {
        actionByOption.set(legal.action.optionIndex, legal.action);
      }
    }
    step.options.forEach((option, optionIndex) => {
      const inner = option.steps[0];
      const action = actionByOption.get(optionIndex);
      if (inner?.type === "TELEPORT_HERO" && action) {
        targets.set(inner.spaceId, action);
      }
    });
    return targets;
  }, [rawAdventure?.pendingVisit, viewerPlayerId, legalActions, readOnly]);

  // Monolith / Whirlpool / colored-Gate travel picker (`step.teleport`): each
  // destination becomes a glowing, clickable EXIT hex on the map — a field
  // destination at its own hex (`TELEPORT_HERO.spaceId`), a still-face-down
  // destination at the token's reserved back hex (or the tile centre). Clicking
  // dispatches the SAME `RESOLVE_VISIT_STEP` the tray button would; the engine
  // CHOOSE_ONE stays authoritative. Owned by the traveller only (others get an
  // empty `steps` from getVisiblePendingVisit, so the memo bails).
  const teleportChoice = useMemo(() => {
    if (readOnly) {
      return null;
    }
    const visit = rawAdventure?.pendingVisit;
    const step = visit?.steps[0];
    if (!visit || visit.playerId !== viewerPlayerId || step?.type !== "CHOOSE_ONE" || !step.teleport) {
      return null;
    }
    const actionByOption = new Map<number, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined) {
        actionByOption.set(legal.action.optionIndex, legal.action);
      }
    }
    // The exit hex each option lands on (field hex, or a face-down tile's token
    // back hex). A hex serving more than one option is ambiguous to click, so it
    // is left to the tray buttons (mirrors pendingMapChoiceTargets) — a stray tap
    // must never pick the wrong exit.
    const hexForOption = step.options.map((option) => {
      const inner = option.steps[0] as { type?: string; spaceId?: string; tileInstanceId?: string } | undefined;
      if (inner?.type === "TELEPORT_HERO" && typeof inner.spaceId === "string") {
        return inner.spaceId;
      }
      if (inner?.type === "TOKEN_TELEPORT_REVEAL" && typeof inner.tileInstanceId === "string") {
        const tile = rawAdventure?.tiles[inner.tileInstanceId] ?? adventure?.tiles[inner.tileInstanceId];
        if (!tile) {
          return null;
        }
        return tile.pendingToken?.preferredSpaceId ?? hexSpaceId({ row: tile.centerRow, col: tile.centerCol });
      }
      return null;
    });
    const optionsPerHex = new Map<MapSpaceId, number>();
    hexForOption.forEach((hex) => {
      if (hex) {
        optionsPerHex.set(hex, (optionsPerHex.get(hex) ?? 0) + 1);
      }
    });
    const targets = new Map<MapSpaceId, { action: GameAction }>();
    hexForOption.forEach((hex, optionIndex) => {
      if (!hex || (optionsPerHex.get(hex) ?? 0) > 1) {
        return;
      }
      const action = actionByOption.get(optionIndex);
      if (action) {
        targets.set(hex, { action });
      }
    });
    return { kind: step.teleport.kind, pair: step.teleport.pair, targets };
  }, [rawAdventure, adventure, viewerPlayerId, legalActions, readOnly]);

  // Map-targeted spell choices belong on the map. Dimension Door and View
  // Earth used to expose only opaque location-code buttons; index-align their
  // legal actions with the destination fields so the glowing hex is clickable.
  // Subterranean Gate placement is NOT instant-confirm on click — the player
  // cycles positions and Confirms (see gatePlacementChoice + the gate float).
  const pendingMapChoiceTargets = useMemo(() => {
    const targets = new Map<MapSpaceId, GameAction>();
    const choice = state.pendingChoice;
    if (readOnly || choice?.type !== "OPTION_CHOICE" || choice.playerId !== viewerPlayerId) {
      return targets;
    }
    if (choice.context === "subterranean-gate-placement") {
      return targets;
    }
    const spaceIds =
      choice.context === "dimension-door"
        ? choice.dimensionDoor?.destinations
        : choice.context === "view-earth"
          ? choice.viewEarth?.mineSpaceIds
          : choice.context === "place-map-token"
            ? choice.mapToken?.candidates
            : choice.context === "place-field-override"
              ? choice.fieldOverride?.candidates
              : undefined;
    if (!spaceIds) {
      return targets;
    }
    const actionByOption = new Map<number, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === choice.id) {
        actionByOption.set(legal.action.optionIndex, legal.action);
      }
    }
    // A hex that stands for more than one option (one field that could serve two
    // different partners — a cavern touching two Surface tiles) is ambiguous to
    // click, so leave it to the prompt buttons; a stray tap must never pick the
    // wrong partner. Distinct hexes stay directly clickable.
    const optionsPerHex = new Map<MapSpaceId, number>();
    spaceIds.forEach((spaceId) => optionsPerHex.set(spaceId, (optionsPerHex.get(spaceId) ?? 0) + 1));
    spaceIds.forEach((spaceId, optionIndex) => {
      if ((optionsPerHex.get(spaceId) ?? 0) > 1) {
        return;
      }
      const action = actionByOption.get(optionIndex);
      if (action) {
        targets.set(spaceId, action);
      }
    });
    return targets;
  }, [state.pendingChoice, viewerPlayerId, legalActions, readOnly]);

  // During the Subterranean Gate pick-on-reveal choice the player cycles between
  // candidate exits and Confirms — only the SELECTED candidate glows. A lone
  // candidate is auto-carved by the engine (never opens this choice).
  const gatePlacementOpen = useMemo(() => {
    const choice = state.pendingChoice;
    if (
      readOnly ||
      choice?.type !== "OPTION_CHOICE" ||
      choice.playerId !== viewerPlayerId ||
      choice.context !== "subterranean-gate-placement" ||
      !choice.subterraneanGate
    ) {
      return null;
    }
    const { candidates } = choice.subterraneanGate;
    const role = candidates[0]?.role ?? "gate";
    return {
      choiceId: choice.id,
      role,
      candidates,
      labels: choice.options.map((option) => option.label)
    };
  }, [state.pendingChoice, viewerPlayerId, readOnly]);

  const [gatePickIndex, setGatePickIndex] = useState(0);
  useEffect(() => {
    setGatePickIndex(0);
  }, [gatePlacementOpen?.choiceId]);

  const gatePlacementChoice = useMemo(() => {
    if (!gatePlacementOpen) {
      return null;
    }
    const count = gatePlacementOpen.candidates.length;
    const index = count > 0 ? ((gatePickIndex % count) + count) % count : 0;
    const selected = gatePlacementOpen.candidates[index];
    if (!selected) {
      return null;
    }
    return {
      role: gatePlacementOpen.role,
      selectedHex: selected.hex as MapSpaceId,
      selectedIndex: index,
      allHexes: new Set<MapSpaceId>(gatePlacementOpen.candidates.map((candidate) => candidate.hex)),
      label: gatePlacementOpen.labels[index] ?? "",
      count
    };
  }, [gatePlacementOpen, gatePickIndex]);

  // During a Monolith/Whirlpool token placement, tag every candidate hex so the
  // map spells out — right on the revealed tile — which field the token would
  // overwrite. Mirrors the Subterranean Gate pick-on-reveal overlay above.
  const tokenPlacementChoice = useMemo(() => {
    const choice = state.pendingChoice;
    if (
      readOnly ||
      choice?.type !== "OPTION_CHOICE" ||
      choice.playerId !== viewerPlayerId ||
      choice.context !== "place-map-token" ||
      !choice.mapToken
    ) {
      return null;
    }
    return { kind: choice.mapToken.kind, hexes: new Set<MapSpaceId>(choice.mapToken.candidates) };
  }, [state.pendingChoice, viewerPlayerId, readOnly]);

  // During a Field Override placement (pool draw / designer pin whose reserved
  // hex became illegal), tag every candidate hex so the placing player sees
  // exactly which field the override would replace — the hex also glows and is
  // clickable via pendingMapChoiceTargets above (the refuse option stays in the
  // prompt tray). Mirrors the Monolith/Whirlpool token placement overlay.
  const fieldOverridePlacementChoice = useMemo(() => {
    const choice = state.pendingChoice;
    if (
      readOnly ||
      choice?.type !== "OPTION_CHOICE" ||
      choice.playerId !== viewerPlayerId ||
      choice.context !== "place-field-override" ||
      !choice.fieldOverride
    ) {
      return null;
    }
    return {
      kind: choice.fieldOverride.kind,
      hexes: new Set<MapSpaceId>(choice.fieldOverride.candidates)
    };
  }, [state.pendingChoice, viewerPlayerId, readOnly]);

  // Redwood Observatory decisions are spatial too: an adjacent face-down tile
  // can be clicked to reveal it, and an empty candidate centre can be clicked to
  // place a new Far tile. Candidate ordering is shared with the engine helper.
  const observatoryTargets = useMemo(() => {
    const revealByTile = new Map<string, GameAction>();
    const placements: { row: number; col: number; action: GameAction }[] = [];
    const visit = rawAdventure?.pendingVisit;
    const step = visit?.steps[0];
    if (readOnly || !visit || visit.playerId !== viewerPlayerId || step?.type !== "DISCOVER_ADJACENT_TILE") {
      return { revealByTile, placements };
    }
    const field = rawAdventure.fields[visit.fieldId];
    const tile = field ? rawAdventure.tiles[field.tileInstanceId] : undefined;
    const hero = state.heroes[visit.heroId];
    const actionByOption = new Map<number, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined) {
        actionByOption.set(legal.action.optionIndex, legal.action);
      } else if (legal.action.type === "PLACE_OBSERVATORY_TILE") {
        placements.push({ row: legal.action.centerRow, col: legal.action.centerCol, action: legal.action });
      }
    }
    if (tile && hero) {
      observatoryRevealTargets(state, hero, tile).forEach((candidate, optionIndex) => {
        const action = actionByOption.get(optionIndex);
        if (action) {
          revealByTile.set(candidate.id, action);
        }
      });
    }
    return { revealByTile, placements };
  }, [rawAdventure, state, viewerPlayerId, legalActions, readOnly]);

  // Obelisk Grail clue: the tile to inspect is picked BY CLICKING IT on the map
  // (user request 2026-08-10 — "choose tiles from map view (much more
  // intuitive)"), replacing the wall of "Tile at row X, col Y" buttons. The
  // engine's option list stays index-aligned and labelled (the AFK driver, the
  // AI scorer and screen readers read it); only the tray stops rendering the
  // per-tile buttons. Detected from the option STEPS, so no protocol field and
  // no new action type: the click dispatches the very RESOLVE_VISIT_STEP the
  // button would have.
  const grailClueTargets = useMemo(() => {
    const byTile = new Map<string, GameAction>();
    const visit = rawAdventure?.pendingVisit;
    const step = visit?.steps[0];
    if (readOnly || !visit || visit.playerId !== viewerPlayerId || step?.type !== "CHOOSE_ONE") {
      return byTile;
    }
    const actionByOption = new Map<number, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined) {
        actionByOption.set(legal.action.optionIndex, legal.action);
      }
    }
    step.options.forEach((option, optionIndex) => {
      const inner = option.steps[0] as { type?: string; tileInstanceId?: string } | undefined;
      if (inner?.type !== "GRAIL_TILE_SCRY" || typeof inner.tileInstanceId !== "string") {
        return;
      }
      const action = actionByOption.get(optionIndex);
      if (action) {
        byTile.set(inner.tileInstanceId, action);
      }
    });
    return byTile;
  }, [rawAdventure, viewerPlayerId, legalActions, readOnly]);

  const legalRotations = useMemo(() => {
    const rotations = new Set<number>();
    for (const legal of legalActions) {
      if (legal.action.type === "SET_TILE_ROTATION") {
        rotations.add(legal.action.rotation);
      }
    }
    return rotations;
  }, [legalActions]);

  // A timed event can clear the Black Cube from beneath a stationary Hero.
  // Index the engine's exact REVISIT_FIELD offers by the occupied hex so the
  // newly reopened field itself becomes the natural click target.
  const revisitActionBySpace = useMemo(() => {
    const actions = new Map<MapSpaceId, GameAction>();
    for (const legal of legalActions) {
      if (legal.action.type !== "REVISIT_FIELD") {
        continue;
      }
      const hero = state.heroes[legal.action.heroId];
      if (!hero?.spaceId) {
        continue;
      }
      if (!actions.has(hero.spaceId) || hero.id === myHero?.id) {
        actions.set(hero.spaceId, legal.action);
      }
    }
    return actions;
  }, [legalActions, state.heroes, myHero?.id]);

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
  // Keyed by the active hero too, so switching heroes (even two standing on the
  // same field) drops a move target picked for the other one.
  const moveSelectionKey = `${myHero?.id ?? "none"}|${myHeroSpaceId}|${state.activePlayerId}|${state.round}`;
  if (moveSelection.key !== moveSelectionKey) {
    setMoveSelection({ key: moveSelectionKey, target: null });
  }
  const selectedTarget = moveSelection.target;
  const setSelectedTarget = (target: HeroPathTarget | null) =>
    setMoveSelection({ key: moveSelectionKey, target });

  const placementCenters = useMemo(() => {
    if (!placement || !rawAdventure || myHeroes.length === 0) {
      return [] as { row: number; col: number; heroId: string }[];
    }
    const tileDefId = rawAdventure.playerFarTiles?.[viewerPlayerId]?.[placement.supplyIndex];
    // A Ⅱ–Ⅲ tile may be laid at the border by EITHER of the player's heroes —
    // each opens beside its OWN field (the engine offers PLACE_TILE per hero).
    // Compute every hero's legal spots and tag each ghost with the hero that can
    // place it, so a SECONDARY Hero's border tiles appear too — not only the
    // Main hero's (the default `myHero`, which was the bug: the Secondary Hero,
    // or a non-selected hero, could never place a Far tile).
    const byKey = new Map<string, { row: number; col: number; heroId: string }>();
    for (const hero of myHeroes) {
      if (hero.movementPoints <= 0) {
        continue; // placing a Far tile costs 1 movement point
      }
      for (const center of farTilePlacementCenters(state, hero, tileDefId)) {
        const key = `${center.row}:${center.col}`;
        if (!byKey.has(key)) {
          byKey.set(key, { row: center.row, col: center.col, heroId: hero.id });
        }
      }
    }
    return [...byKey.values()];
  }, [placement, rawAdventure, myHeroes, state, viewerPlayerId]);

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
    // A replaying computer hero is drawn at its animated cell; every other hero
    // (and every hero when no replay is running) uses its true spaceId.
    const spaceId = heroPositionOverrides?.[hero.id] ?? hero.spaceId;
    if (spaceId) {
      const list = heroesBySpace.get(spaceId) ?? [];
      list.push({ playerId: hero.controllerId, heroId: hero.id, heroDefId: hero.heroDefId });
      heroesBySpace.set(spaceId, list);
    }
  }

  const sortedTiles = Object.values(adventure.tiles).sort(
    (left, right) => left.centerRow - right.centerRow || left.centerCol - right.centerCol
  );

  const renderTileArt = (tile: MapTileState, rotation: number) => {
    const def = allTileDefinitions[tile.tileDefId];
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
        data-fx-anchor={`tile:${tile.id}`}
        height={height}
        href={assetUrl(image)}
        key={`art-${tile.id}`}
        // The shipped tile art is cropped to the exact 3:5*sqrt(3) flower
        // bounding box, so stretching it over the box keeps every hex edge
        // of the art on the logical grid.
        preserveAspectRatio="none"
        transform={`rotate(${rotation * 60} ${center.x} ${center.y})`}
        width={width}
        x={center.x - width / 2}
        y={center.y - height / 2}
      />
    );
  };

  for (const tile of sortedTiles) {
    const center = { row: tile.centerRow, col: tile.centerCol };

    // --- Face-down tiles: the printed starry backs (roman numerals) -------
    if (tile.faceDown) {
      const normalDiscover = discoverByTile.get(tile.id);
      const observatoryDiscover = observatoryTargets.revealByTile.get(tile.id);
      const discover = normalDiscover ?? observatoryDiscover;
      // Obelisk Grail clue pick (see grailClueTargets). Wins over `discover`
      // because an open pendingVisit is exclusive — no movement/discovery offer
      // can coexist with it — and a stray tap must resolve the OPEN prompt.
      const grailClue = grailClueTargets.get(tile.id);
      // Face-down numeral is the tile's REAL guard band (Ⅳ–Ⅴ vs Ⅵ–Ⅶ). Sea and
      // underground used to hide the band behind a single Ⅳ–Ⅴ back + a combined
      // "Ⅳ–Ⅶ" hint — so a boss tile looked IV-V until opened, then sprung VII
      // fights. The back art and this label now match `tile.backLabel`.
      const backLabelDisplay = tile.backLabel ?? "";
      const footprint = tileFootprint(center, 0);
      const centerPixel = hexToPixel(center, HEX_SIZE);
      const backWidth = 3 * HEX_WIDTH;
      const backHeight = 5 * HEX_SIZE;
      artLayer.push(
        <image
          className="tileBackArt"
          height={backHeight}
          href={assetUrl(tileBackImage(tile.group, tile.backLabel))}
          key={`back-${tile.id}`}
          // The back art fills the exact 3:5*sqrt(3) flower bounding box,
          // same as the face-up tile scans.
          preserveAspectRatio="none"
          width={backWidth}
          x={centerPixel.x - backWidth / 2}
          y={centerPixel.y - backHeight / 2}
        />
      );
      // Designed Monolith/Whirlpool/colored-Gate tokens riding this face-down
      // tile are public info — including Whirlpools BEFORE the tile is revealed.
      // Render EVERY pending token (multi-token tiles), not only the legacy
      // singular first entry. Modern tokens carry their exact physical preferred
      // hex; legacy ones without a preference stay centred (stacked slightly).
      const faceDownPendingTokens =
        tile.pendingTokens && tile.pendingTokens.length > 0
          ? tile.pendingTokens
          : tile.pendingToken
            ? [tile.pendingToken]
            : [];
      for (const [pendingIndex, pendingToken] of faceDownPendingTokens.entries()) {
        const tokenBackCoord = pendingToken.preferredSpaceId
          ? parseHexSpaceId(pendingToken.preferredSpaceId) ?? center
          : center;
        const tokenBackPixel = hexToPixel(tokenBackCoord, HEX_SIZE);
        // Legacy multi-token without preferred hex: slight offset so they don't
        // fully stack on the centre.
        const stackOffset =
          !pendingToken.preferredSpaceId && faceDownPendingTokens.length > 1
            ? (pendingIndex - (faceDownPendingTokens.length - 1) / 2) * (HEX_SIZE * 0.35)
            : 0;
        const drawX = tokenBackPixel.x + stackOffset;
        const drawY = tokenBackPixel.y;
        const isGateToken =
          pendingToken.kind === "gate" ||
          pendingToken.kind === "oneway_entrance" ||
          pendingToken.kind === "oneway_exit";
        const gateColor = isGateToken ? GATE_PAIR_COLORS[pendingToken.pair ?? 1] ?? "#c9a24b" : null;
        const tokenBackImage =
          pendingToken.kind === "whirlpool"
            ? mapTokenImage("whirlpool", pendingToken.number)
            : monolithTokenImage();
        const tokenBackWidth = HEX_WIDTH * 0.9;
        const tokenBackHeight = 2 * HEX_SIZE * 0.9;
        artLayer.push(
          <g
            key={`back-token-${tile.id}-${pendingIndex}-${pendingToken.kind}`}
            data-pending-token-kind={pendingToken.kind}
            style={{ pointerEvents: "none" }}
          >
            {pendingToken.preferredSpaceId ? (
              <polygon
                className="tileBackPendingTokenSlot"
                data-space-id={pendingToken.preferredSpaceId}
                points={hexCorners(drawX, drawY, HEX_SIZE - 2.2)}
              />
            ) : null}
            {gateColor ? (
              <circle cx={drawX} cy={drawY} fill={gateColor} opacity={0.3} r={HEX_SIZE * 0.55} />
            ) : null}
            <image
              className={`tileBackPendingToken${pendingToken.kind === "whirlpool" ? " whirlpoolPending" : ""}`}
              height={tokenBackHeight}
              href={assetUrl(tokenBackImage)}
              opacity={0.95}
              preserveAspectRatio="xMidYMid meet"
              width={tokenBackWidth}
              x={drawX - tokenBackWidth / 2}
              y={drawY - tokenBackHeight / 2}
            />
            {gateColor ? (
              <>
                <circle cx={drawX} cy={drawY} fill="none" r={HEX_SIZE * 0.55} stroke={gateColor} strokeWidth={2.5} />
                <text
                  fill={gateColor}
                  fontSize={HEX_SIZE * 0.5}
                  fontWeight={700}
                  textAnchor="middle"
                  x={drawX}
                  y={drawY + HEX_SIZE * 0.66}
                >
                  {pendingToken.pair}
                </text>
              </>
            ) : null}
          </g>
        );
        // If this pending token is a live teleport destination for the viewer,
        // overlay a clickable glowing EXIT hex on its back (pushed to `overlays`,
        // which sit above the face-down discovery hexes). The tile face stays
        // hidden — only the token art shows — and clicking dispatches the SAME
        // RESOLVE_VISIT_STEP the tray button would.
        const tokenBackSpaceId = pendingToken.preferredSpaceId ?? hexSpaceId(center);
        const teleportBackTarget = teleportChoice?.targets.get(tokenBackSpaceId);
        if (teleportBackTarget && !readOnly) {
          overlays.push(
            <g key={`teleport-back-${tile.id}-${pendingIndex}`}>
              <polygon
                className="teleportTargetFaceDown"
                data-space-id={tokenBackSpaceId}
                fill="rgba(34, 96, 74, 0.32)"
                onClick={() => {
                  if (!suppressClickRef.current) {
                    onAction(teleportBackTarget.action);
                  }
                }}
                points={hexCorners(drawX, drawY, HEX_SIZE - 1.2)}
                style={{ pointerEvents: "all" }}
              >
                <title>Click to teleport your hero here (reveals this face-down tile)</title>
              </polygon>
              <text className="hexTeleportCue" textAnchor="middle" x={drawX} y={drawY + HEX_SIZE * 0.92}>
                ⇄ exit here
              </text>
            </g>
          );
        }
      }
      // A still-hidden Subterranean tile can never be discovered from the Surface
      // (or vice versa) — only a hero entering a Subterranean Gate opens it. When
      // it isn't otherwise discoverable, a tap explains that instead of doing
      // nothing, so players aren't left clicking a dead tile.
      // The Underground layer (a printed cavern OR a designer-flagged
      // far/near/center/sea tile) can't be discovered from the Surface — the
      // shared `tileLayer` predicate, so a flagged tile shows the same "needs a
      // Gate" hint as a cavern. `data-underground` is the always-on layer cue
      // (present on every underground tile, absent on a plain Surface tile).
      const undergroundTile = tileLayer(tile) === "subterranean";
      // An open Grail-clue pick owns the tile's click, so it must not also wear
      // the violet "needs a Gate" hint (an underground tile CAN be a candidate).
      const cavernNeedsGate = undergroundTile && !discover && !grailClue && !readOnly;
      if (undergroundTile) {
        pushUndergroundTileOutline(overlays, tile.id, footprint, 0);
      }
      for (const [slot, coord] of footprint.entries()) {
        const { x, y } = hexToPixel(coord, HEX_SIZE);
        track(x, y);
        cells.push(
          <g key={`${tile.id}-${slot}`}>
            <polygon
              className={`hexFaceDown ${discover && !readOnly ? "discoverable" : ""} ${
                grailClue ? "grailClueTarget" : ""
              } ${cavernNeedsGate ? "needsGate" : ""}`}
              data-tile-id={tile.id}
              data-underground={undergroundTile ? "true" : undefined}
              onClick={
                grailClue
                  ? () => {
                      if (!suppressClickRef.current) {
                        onAction(grailClue);
                      }
                    }
                  : discover && !readOnly
                    ? () => {
                        if (!suppressClickRef.current) {
                          onAction(discover);
                        }
                      }
                    : cavernNeedsGate
                      ? () => {
                          if (!suppressClickRef.current) {
                            remindGateAccess(hexSpaceId(coord));
                          }
                        }
                      : undefined
              }
              points={hexCorners(x, y, HEX_SIZE - 1.2)}
            >
              <title>
                {`${
                  grailClue
                    ? `Obelisk Grail clue — click to inspect this ${backLabelDisplay} tile (it hosts a Grail or a Dragon Utopia)`
                    : discover
                      ? normalDiscover
                        ? `Spend 1 movement point to discover this ${backLabelDisplay} tile`
                        : `Reveal this adjacent ${backLabelDisplay} tile with the Observatory`
                      : cavernNeedsGate
                        ? `Underground tile (${backLabelDisplay}) — you can't discover it from the Surface. Enter a Subterranean Gate to open it.`
                        : `Face-down tile ${backLabelDisplay}`
                }${
                  faceDownPendingTokens.length > 0
                    ? ` — carries ${faceDownPendingTokens
                        .map((token) =>
                          token.kind === "gate"
                            ? `${gatePairColor(token.pair ?? 1)} Gate`
                            : token.kind === "whirlpool"
                              ? "Whirlpool"
                              : token.kind === "monolith"
                                ? "Monolith"
                                : token.kind
                        )
                        .join(", ")} token${faceDownPendingTokens.length === 1 ? "" : "s"} (visible before reveal)`
                    : ""
                }`}
              </title>
            </polygon>
          </g>
        );
        if (slot === 0 && (grailClue || (discover && !readOnly))) {
          overlays.push(
            <text
              className="hexFaceDownLabel"
              key={`${tile.id}-back`}
              textAnchor="middle"
              x={x}
              y={y + HEX_SIZE * 0.78}
            >
              {grailClue
                ? "🔮 Grail clue: inspect this tile"
                : normalDiscover
                  ? "🐎 1 movement point: discover"
                  : "Observatory: reveal this tile"}
            </text>
          );
        }
        if (slot === 0 && cavernNeedsGate) {
          overlays.push(
            <text className="hexCavernHint" key={`${tile.id}-cavern-hint`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.78}>
              ⛰ via Subterranean Gate
            </text>
          );
        }
      }
      // Designer yellow borders are public info (a printed line is visible to
      // everyone), so draw them on the tile BACK too — at their ABSOLUTE board
      // direction, so a player sees exactly where the wall will be. `footprint`
      // is rotation-0, so index d+1 is the ring hex facing absolute direction d.
      for (const absolute of tile.extraBorders ?? []) {
        if (!Number.isInteger(absolute) || absolute < 0 || absolute > 5) {
          continue;
        }
        const ringCell = footprint[absolute + 1];
        const ringPixel = hexToPixel(ringCell, HEX_SIZE);
        for (const edge of [absolute - 1, absolute, absolute + 1]) {
          const direction = ((edge % 6) + 6) % 6;
          pushBorderLines(
            overlays,
            `${tile.id}-back-border-${absolute}-${direction}`,
            hexEdgeForDirection(ringPixel.x, ringPixel.y, HEX_SIZE - 1.2, direction)
          );
        }
      }
      // Per-edge designer borders on the back: each code is one hex edge in the
      // rotation-0 absolute frame — hex = footprint[footprintIndex], line on the
      // coded absolute direction. Public info, shown on the tile back like arcs.
      for (const code of tile.borderEdges ?? []) {
        if (!Number.isInteger(code) || code < 0 || code > 41) {
          continue;
        }
        const cell = footprint[Math.floor(code / 6)];
        if (!cell) {
          continue;
        }
        const pixel = hexToPixel(cell, HEX_SIZE);
        pushBorderLines(
          overlays,
          `${tile.id}-back-edge-${code}`,
          hexEdgeForDirection(pixel.x, pixel.y, HEX_SIZE - 1.2, code % 6)
        );
      }
      continue;
    }

    const tileDef = allTileDefinitions[tile.tileDefId];
    const terrain = TERRAIN_COLORS[tileDef?.terrain ?? "dirt"] ?? TERRAIN_COLORS.dirt;

    // --- Tiles waiting for their rotation: preview from the definition ----
    if (tile.awaitingRotation) {
      const rotation = iAmRotating && rotatingTile?.id === tile.id ? previewRotation : tile.rotation;
      renderTileArt(tile, rotation);
      // With the printed art visible the built-in icons are redundant —
      // the scan shows the real locations; only game-state markers stay.
      const artShown = showArt && Boolean(tileDef?.assets?.tileImage);
      // Naval Battles: the Creature Bank this tile drew at reveal is known while
      // it is being rotated. Mark its Blocked Field slot so its border follows the
      // bank rule (border-free by default) and its art + name preview there.
      const reservedBankId = (tile.reservedBankId as CreatureBankId | undefined) ?? undefined;
      const reservedBankOptions = (tile.reservedBankOptions ?? []).filter(
        (candidate): candidate is typeof candidate & { bankId: CreatureBankId } => candidate.bankId in CREATURE_BANKS
      );
      const previewBankOptions =
        reservedBankOptions.length > 0
          ? reservedBankOptions
          : reservedBankId
            ? [{ bankId: reservedBankId }]
            : [];
      const bankPreviewSlot =
        reservedBankId && tileDef ? tileDef.fields.findIndex((field) => field.location === "blocked_field") : -1;
      const previewBankSlots = bankPreviewSlot >= 0 ? new Set([bankPreviewSlot]) : undefined;
      // Designer yellow borders are absolute: pass the SAME `rotation` the draw
      // below re-applies so they stay put on the board as the preview spins.
      const borderSegments = tileDef
        ? getTileBorderSegments(tileDef, previewBankSlots, {
            extraBorders: tile.extraBorders,
            borderEdges: tile.borderEdges,
            rotation
          })
        : [];
      const footprint = tileFootprint(center, rotation);
      for (const [slot, coord] of footprint.entries()) {
        const fieldDef = tileDef?.fields[slot];
        const { x, y } = hexToPixel(coord, HEX_SIZE);
        track(x, y);
        cells.push(
          <polygon
            className={`hexCell rotating ${artShown ? "withArt" : ""}`}
            fill={terrain}
            key={`${tile.id}-rot-${slot}`}
            points={hexCorners(x, y, HEX_SIZE - 1.2)}
          />
        );
        // Preview the reserved Creature Bank right on its Blocked Field: its art
        // fills the hex and its name sits below, so the player sees which bank
        // they are about to carve before they lock the rotation.
        if (slot === bankPreviewSlot && reservedBankId) {
          const clipId = `bankPrevClip-${tile.id}-${slot}`;
          const secondCandidate = previewBankOptions[1];
          overlays.push(
            <g key={`${tile.id}-rot-bank-${slot}`}>
              <clipPath id={clipId}>
                <polygon points={hexCorners(x, y, HEX_SIZE - 1.2)} />
              </clipPath>
              <image
                className="locationToken"
                clipPath={`url(#${clipId})`}
                height={2 * HEX_SIZE}
                href={assetUrl(creatureBankFieldImage(reservedBankId))}
                preserveAspectRatio="xMidYMid slice"
                style={{ pointerEvents: "none" }}
                width={HEX_WIDTH}
                x={x - HEX_WIDTH / 2}
                y={y - HEX_SIZE}
              />
              {secondCandidate ? (
                <>
                  <clipPath id={`${clipId}-second`}>
                    <circle cx={x + HEX_SIZE * 0.43} cy={y - HEX_SIZE * 0.38} r={HEX_SIZE * 0.34} />
                  </clipPath>
                  <circle
                    className="bankPreviewSecondRing"
                    cx={x + HEX_SIZE * 0.43}
                    cy={y - HEX_SIZE * 0.38}
                    r={HEX_SIZE * 0.37}
                  />
                  <image
                    clipPath={`url(#${clipId}-second)`}
                    height={HEX_SIZE * 0.72}
                    href={assetUrl(creatureBankFieldImage(secondCandidate.bankId))}
                    preserveAspectRatio="xMidYMid slice"
                    style={{ pointerEvents: "none" }}
                    width={HEX_SIZE * 0.72}
                    x={x + HEX_SIZE * 0.07}
                    y={y - HEX_SIZE * 0.74}
                  />
                </>
              ) : null}
              {previewBankOptions.map((candidate, index) =>
                "size" in candidate ? (
                  <g
                    className={`bankSizeSvgBadge size-${candidate.size}`}
                    key={`${tile.id}-preview-size-${index}`}
                    transform={`translate(${x + (index === 0 ? -HEX_SIZE * 0.46 : HEX_SIZE * 0.46)} ${y - HEX_SIZE * 0.62})`}
                  >
                    <circle className="coinOuter" r="10" />
                    <circle className="coinInner" r="7.2" />
                    <text textAnchor="middle" y="2.4">{candidate.size}</text>
                  </g>
                ) : null
              )}
              {previewBankOptions.map((candidate, index) => (
                <text
                  className="hexBankLabel"
                  key={`${tile.id}-preview-label-${index}`}
                  textAnchor="middle"
                  x={x}
                  y={y + HEX_SIZE * (index === 0 ? 0.55 : 0.75)}
                >
                  {previewBankOptions.length > 1 ? `${index === 0 ? "A" : "B"} · ` : ""}
                  {CREATURE_BANKS[candidate.bankId]?.name ?? "Creature Bank"}
                  {"size" in candidate ? ` · ${ROMAN[candidate.size]}` : ""}
                </text>
              ))}
            </g>
          );
        }
        if (fieldDef && !artShown) {
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
        // Atmosphere tiles: attach symbol modules during rotation preview too.
        if (fieldDef && artShown && tileDef?.assets?.attachFieldSymbols) {
          const symbol = fieldSymbolOverlayFor(fieldDef);
          if (symbol) {
            const iconScale =
              symbol.kind === "resource" ? 0.62 :
              symbol.kind === "treasure" ? 0.6 :
              0.56;
            const iconSize = HEX_SIZE * iconScale * (tileDef?.assets?.fieldSymbolScale ?? 1);
            overlays.push(
              <image
                className="fieldSymbolModule"
                height={iconSize}
                href={assetUrl(symbol.image)}
                key={`${tile.id}-rot-symbol-${slot}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ pointerEvents: "none" }}
                width={iconSize}
                x={x - iconSize / 2}
                y={y - iconSize * 0.1}
              />
            );
            if (symbol.difficulty) {
              overlays.push(
                <text
                  className="hexDifficulty"
                  key={`${tile.id}-rot-symbol-diff-${slot}`}
                  textAnchor="middle"
                  x={x}
                  y={y - HEX_SIZE * 0.48}
                >
                  {ROMAN[symbol.difficulty]}
                </text>
              );
            }
            if (symbol.amount != null && symbol.amount > 0) {
              overlays.push(
                <text
                  className="hexProduction"
                  key={`${tile.id}-rot-symbol-amt-${slot}`}
                  textAnchor="middle"
                  x={x}
                  y={y + HEX_SIZE * 0.62}
                >
                  {`↻${symbol.amount}`}
                </text>
              );
            }
          }
        }
        // Printed + designed yellow border lines (arcs, blocked-field rings and
        // per-edge lines) move with the rotation preview.
        for (const segment of borderSegments) {
          if (segment.slot !== slot) {
            continue;
          }
          const direction = (segment.edge + rotation) % 6;
          pushBorderLines(
            overlays,
            `${tile.id}-rot-border-${slot}-${segment.edge}`,
            hexEdgeForDirection(x, y, HEX_SIZE - 1.2, direction)
          );
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
    // Always-on layer cue: a printed cavern OR a designer-flagged far/near/
    // center/sea tile reads as underground (the shared `tileLayer` predicate).
    const undergroundTile = tileLayer(tile) === "subterranean";
    // The printed scan already shows the locations, numerals and mine icons:
    // hide the built-in markers and keep only live game state (cubes, flags,
    // settlement production, movement) on top of the art.
    // Atmosphere-only tiles (anime seats) opt into attachFieldSymbols so the
    // shared icon modules are pinned on top without re-baking the whole tile.
    const artShown = showArt && Boolean(tileDef?.assets?.tileImage);
    const attachFieldSymbols = Boolean(tileDef?.assets?.attachFieldSymbols);
    const footprint = tileFootprint(center, tile.rotation);
    if (undergroundTile) {
      pushUndergroundTileOutline(overlays, tile.id, footprint, tile.rotation);
    }
    // A placed Creature Bank is fully border-free: suppress every printed and
    // designer line touching the carved hex.
    const bankSlots = new Set<number>();
    const borderlessOverrideSlots = new Set<number>();
    footprint.forEach((coord, slot) => {
      const location = adventure.fields[`h:${coord.row}:${coord.col}`]?.location;
      if (location === "creature_bank") {
        bankSlots.add(slot);
      }
      // The other Blocked-Field carves (Calamity Gate, Dungeon Gate) are also
      // ALWAYS border-free, matching the
      // open-edge movement/discovery exception they share with the bank
      // (BLOCKED_FIELD_CARVE_LOCATIONS). Without this the printed ring stayed on
      // the hex and the Gate read as impassable.
      if (location && location !== "creature_bank" && isBlockedFieldCarve({ location })) {
        borderlessOverrideSlots.add(slot);
      }
      if (location && fieldOverridePresentation(location)) {
        borderlessOverrideSlots.add(slot);
      }
    });
    const borderSegments = tileDef
      ? getTileBorderSegments(tileDef, bankSlots, {
          extraBorders: tile.extraBorders,
          borderEdges: tile.borderEdges,
          rotation: tile.rotation,
          borderlessSlots: borderlessOverrideSlots
        })
      : [];
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
      const remindMove = drawReminderTargets.get(spaceId);
      const endTurnMove = endTurnMoveTargets.get(spaceId);
      const mapChoice = pendingMapChoiceTargets.get(spaceId);
      const revisitAction = revisitActionBySpace.get(spaceId);
      const teleportTarget = teleportChoice?.targets.get(spaceId);
      const gateCandidateIndex =
        gatePlacementOpen?.candidates.findIndex((candidate) => candidate.hex === spaceId) ?? -1;
      const isGateCandidate = gateCandidateIndex >= 0;
      const isGateSelected = gatePlacementChoice?.selectedHex === spaceId;
      const guarded = Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
      // Designer-ALTERED guard (custom army / level / forced settlement fight):
      // surface what the player will face in the hex tooltip so an altered fight
      // reads clearly on the map (the pre-attack confirm float warns again).
      const alteredGuardPreview = guarded && field.designedGuard ? designedGuardPreview(field) : null;
      const alteredGuardTip = alteredGuardPreview
        ? alteredGuardPreview.units.length > 0
          ? ` — ALTERED by the map designer: ${alteredGuardPreview.units.join(", ")}`
          : " — ALTERED by the map designer"
        : "";
      // Designer first-clear reward (center / object / token / settlement) —
      // public once revealed; hide after the once-only latch fires.
      const designerRewardClaimed = Boolean(
        field.centerHexClaimed || field.viiBonusClaimed || field.designerRewardClaimed
      );
      const designerRewardSummary = !designerRewardClaimed
        ? describeFieldReward({
            ...(field.viiReward ?? {}),
            ...(field.centerHexReward ?? {}),
            ...(field.designerReward ?? {})
          })
        : "";
      const designerVp = !designerRewardClaimed
        ? (field.centerHexVp ?? field.viiVp ?? field.designerRewardVp ?? 0)
        : 0;
      const designerRewardTip =
        designerRewardSummary || designerVp > 0
          ? ` — Reward: ${[designerRewardSummary, designerVp > 0 ? `+${designerVp} VP` : ""]
              .filter(Boolean)
              .join(" · ")}`
          : "";
      // Field Override kinds without hex art yet fall back to their registered
      // glyph so an art-less carve is a visible hex in icon mode (art wins once
      // it ships — fieldOverrideGlyph returns undefined then).
      const glyph = LOCATION_GLYPHS[field.location] ?? fieldOverrideGlyph(field.location) ?? "";
      // Field Override (WOG / anime) hex OR a PvE-module site (Calamity Gate /
      // Rift Lair / The Dungeon): resolve its name + printed summary so the
      // hover tooltip and the click-to-inspect float can tell the player what
      // visiting does — data-driven, so every kind is covered. (The module
      // sites previously showed NO description anywhere — the 2026-08-19
      // "Dungeon shows no description at all" report.)
      const overrideInfo = mapObjectPresentation(field.location, adventure.pveTheme);
      const isSelected = selectedTarget?.spaceId === spaceId;

      cells.push(
        <polygon
          className={[
            "hexCell",
            field.location === "blocked_field" ? "blocked" : "",
            target ? "moveTarget" : "",
            remindMove ? "moveTargetLocked" : "",
            teleportTarget ? "teleportTarget" : "",
            endTurnMove ? "endTurnMoveTarget" : "",
            mapChoice || revisitAction || isGateSelected ? "mapChoiceTarget" : "",
            isGateCandidate && !isGateSelected ? "gateExitCandidate" : "",
            isSelected ? "selectedTarget" : "",
            alteredGuardPreview ? "alteredGuard" : "",
            artShown ? "withArt" : ""
          ].join(" ")}
          data-space-id={spaceId}
          data-altered-guard={alteredGuardPreview ? "true" : undefined}
          data-underground={undergroundTile ? "true" : undefined}
          fill={terrain}
          key={spaceId}
          onClick={
            readOnly
              ? undefined
              : teleportTarget
                ? () => {
                    if (!suppressClickRef.current) {
                      onAction(teleportTarget.action);
                    }
                  }
                : isGateCandidate
                ? () => {
                    if (suppressClickRef.current) {
                      return;
                    }
                    // The visual way to set a Subterranean Gate exit: click the
                    // glowing hex you want and it is placed there right away — no
                    // dependence on a cycle float that could scroll off-screen or
                    // hide behind a die animation (the old "the window disappears
                    // and won't work"). Falls back to just selecting if the engine
                    // did not offer this option (should not happen).
                    const place = gatePlacementOpen
                      ? legalActions.find(
                          (legal) =>
                            legal.action.type === "CHOOSE_OPTION" &&
                            legal.action.choiceId === gatePlacementOpen.choiceId &&
                            legal.action.optionIndex === gateCandidateIndex
                        )?.action
                      : undefined;
                    if (place) {
                      onAction(place);
                    } else {
                      setGatePickIndex(gateCandidateIndex);
                    }
                  }
                : mapChoice
                ? () => {
                    if (!suppressClickRef.current) {
                      onAction(mapChoice);
                    }
                  }
                : endTurnMove
                ? () => {
                    if (suppressClickRef.current) {
                      return;
                    }
                    onAction(endTurnMove);
                  }
                : revisitAction
                  ? () => {
                      if (!suppressClickRef.current) {
                        onAction(revisitAction);
                      }
                    }
                : target
                  ? () => {
                      if (suppressClickRef.current) {
                        return;
                      }
                      setSelectedTarget(selectedTarget?.spaceId === spaceId ? null : target);
                    }
                  : remindMove
                    ? () => {
                        if (suppressClickRef.current) {
                          return;
                        }
                        remindToDraw(spaceId);
                      }
                    : alteredGuardPreview || designerRewardTip || overrideInfo
                      ? () => {
                          // Inspect a designer-altered object OR a Field Override
                          // (WOG / anime) hex: click toggles a float with the
                          // guard army / reward / override summary — the hover
                          // tooltip's touch-friendly, readable twin.
                          if (suppressClickRef.current) {
                            return;
                          }
                          setInspectGuardAt((current) => (current === spaceId ? null : spaceId));
                        }
                      : undefined
          }
          points={hexCorners(x, y, HEX_SIZE - 1.2)}
        >
          <title>
            {`${
              field.location === "creature_bank" && field.bankId
                ? `${CREATURE_BANKS[field.bankId as CreatureBankId]?.name ?? "Creature Bank"} (Creature Bank${field.bankSize ? `, size ${ROMAN[field.bankSize]}` : ""})`
                : (location?.name ?? field.location)
            }${field.difficulty && guarded ? ` (guard ${ROMAN[field.difficulty]})` : ""}${alteredGuardTip}${designerRewardTip}${
              overrideInfo ? ` — ${overrideInfo.summary}` : ""
            }${
              field.flagOwnerId ? ` — flagged by ${state.players[field.flagOwnerId]?.name}` : ""
            }${
              field.location === "subterranean_gate"
                ? undergroundTile
                  ? " — step on to ascend to the Surface (the only crossing; reveals the Surface tile beyond for free)"
                  : " — step on to descend into the Underground (the only crossing; reveals the cavern beyond for free)"
                : ""
            }${
              field.location === "monolith"
                ? " — step on (or Revisit for 1 MP) to teleport to another Monolith; needs at least 2 Monoliths on the map to work"
                : ""
            }${
              field.location === "whirlpool"
                ? `${field.whirlpoolNumber !== undefined ? ` ${field.whirlpoolNumber >= 0 ? "+" : ""}${field.whirlpoolNumber}` : ""} — step on (or Revisit for 1 MP) to travel to another Whirlpool; each travel costs 1 unit card from your army. Needs at least 2 Whirlpools; with 3, the Attack die picks where you surface`
                : ""
            }${target ? ` — ${target.cost} movement point${target.cost === 1 ? "" : "s"}` : ""}${
              teleportTarget
                ? " — click to teleport your hero here"
                : mapChoice
                ? " — click to choose this location"
                : revisitAction
                  ? " — click to resolve this field (1 movement point)"
                : endTurnMove
                  ? " — click to move your hero here"
                  : ""
            }`}
          </title>
        </polygon>
      );

      // Teleport travel picker: mark this destination hex as a glowing exit the
      // traveller can click, matching the tray option they'd otherwise press.
      if (teleportTarget) {
        overlays.push(
          <text className="hexTeleportCue" key={`${spaceId}-teleport-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
            {teleportChoice?.kind === "whirlpool" ? "🌀 exit here" : "⇄ exit here"}
          </text>
        );
      }

      // A reachable Subterranean Gate is the ONLY way across the layer divide, so
      // mark it with a "descend/ascend" cue — otherwise players don't realise the
      // cave-mouth hex is a doorway they can step onto to open the tile beyond.
      if (field.location === "subterranean_gate" && (target || remindMove)) {
        overlays.push(
          <text className="hexGateCue" key={`${spaceId}-gate-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
            {undergroundTile ? "↥ ascend" : "↧ descend"}
          </text>
        );
      }

      // A reachable Monolith/Whirlpool/Gate is a doorway too: cue the teleport so
      // players realise stepping on moves them across the map.
      if ((isMapObjectLocation(field.location) || field.location === "oneway_entrance") && (target || remindMove)) {
        overlays.push(
          <text className="hexGateCue" key={`${spaceId}-token-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
            ⇄ teleport
          </text>
        );
      }
      // A teleport-object hex (Gate / Monolith / Whirlpool / one-way Monolith):
      // the unified designer-parity mark — token art + ring (+ pair badge for
      // the colored networks). Tile-slot placements render here.
      if (isTeleportMarkLocation(field.location)) {
        overlays.push(teleportHexMark(spaceId, x, y, field));
      }

      // Pick-a-field Monolith/Whirlpool token placement: label each candidate
      // hex of the just-revealed tile so the placing player sees exactly which
      // field the token would overwrite (the hex also glows and is clickable
      // via pendingMapChoiceTargets above).
      if (tokenPlacementChoice?.hexes.has(spaceId)) {
        overlays.push(
          <text
            className="hexGateChoiceCue"
            key={`${spaceId}-token-choice-cue`}
            textAnchor="middle"
            x={x}
            y={y + HEX_SIZE * 0.92}
          >
            {tokenPlacementChoice.kind === "monolith"
              ? "⛩ monolith here"
              : tokenPlacementChoice.kind === "gate"
                ? "⛩ gate here"
                : "🌀 whirlpool here"}
          </text>
        );
      }

      // Field Override placement: label each candidate hex of the revealed tile
      // (glows + clickable via pendingMapChoiceTargets, like the token overlay).
      if (fieldOverridePlacementChoice?.hexes.has(spaceId)) {
        overlays.push(
          <text
            className="hexGateChoiceCue"
            key={`${spaceId}-override-choice-cue`}
            textAnchor="middle"
            x={x}
            y={y + HEX_SIZE * 0.92}
          >
            ✨ place here
          </text>
        );
      }

      // Pick-on-reveal Subterranean Gate placement: only the SELECTED exit glows
      // (cycle + Confirm on the map float). Other candidates stay dimly marked so
      // the player sees every legal exit while rotating between them.
      if (gatePlacementChoice?.allHexes.has(spaceId)) {
        const isSelected = gatePlacementChoice.selectedHex === spaceId;
        // Short cue at the hex bottom — keeps the cave-mouth / path art fully
        // visible; the map float carries the full "sacrifices …" detail.
        overlays.push(
          <text
            className={`hexGateChoiceCue${isSelected ? " selected" : " dim"}`}
            key={`${spaceId}-gate-choice-cue`}
            textAnchor="middle"
            x={x}
            y={y + HEX_SIZE * 0.88}
          >
            {isSelected
              ? gatePlacementChoice.role === "gate"
                ? "🕳 gate"
                : "🕳 path up"
              : "·"}
          </text>
        );
      }

      // Location Token art (the Subterranean Gate) sits on top of the tile scan
      // on the field it sacrificed, shown in both art and icon modes. The two
      // halves are distinct: the skull cave-mouth GATE on a Surface tile, the
      // lighter passage ENTRANCE on a Subterranean tile.
      const overrideArt = fieldOverrideImage(field.location);
      // Waves / Raid Bosses / the Dungeon: carved module fields wear painted,
      // theme-aware map-object art generated from the masters documented in
      // docs/raid-dungeon-art.md.
      const moduleFieldArt =
        field.location === "calamity_gate" ||
        field.location === "rift_lair" ||
        field.location === "dungeon_gate"
          ? pveThemeFieldArt(field.location, adventure.pveTheme)
          : null;
      // Monolith / Whirlpool / one-way hexes are NOT in this chain any more —
      // they render through the designer-parity teleportHexMark above (their
      // old full-hex stretch distorted the token art).
      const tokenImage =
        field.location === "subterranean_gate"
          ? subterraneanGateTokenImage(undergroundTile ? "subterranean" : "surface")
          : field.location === "creature_bank"
            ? creatureBankFieldImage(field.bankId)
            : (moduleFieldArt ?? overrideArt);
      if (tokenImage) {
        // Clip landscape/field art to the hex (Creature Banks + Field Override objects).
        if (field.location === "creature_bank" || Boolean(overrideArt) || Boolean(moduleFieldArt)) {
          // The bank's field-tile scan is landscape; clip it to the hex and use
          // "slice" (cover) so the structure fills the cell centred and
          // undistorted — the old "none" stretched it into the tall hex box,
          // which squashed every building into an unrecognisable smear.
          const clipId = `bankClip-${spaceId.replace(/:/g, "-")}`;
          overlays.push(
            <g key={`${spaceId}-token`}>
              <clipPath id={clipId}>
                <polygon points={hexCorners(x, y, HEX_SIZE - 1.2)} />
              </clipPath>
              <image
                className="locationToken"
                clipPath={`url(#${clipId})`}
                data-space-id={spaceId}
                height={2 * HEX_SIZE}
                href={assetUrl(tokenImage)}
                preserveAspectRatio="xMidYMid slice"
                // Decorative art only: it must not eat the click meant for the
                // hex beneath it, or the player cannot select the field to move
                // in (e.g. walking into a Creature Bank to fight it).
                style={{ pointerEvents: "none" }}
                width={HEX_WIDTH}
                x={x - HEX_WIDTH / 2}
                y={y - HEX_SIZE}
              />
            </g>
          );
        } else {
          overlays.push(
            <image
              className="locationToken"
              data-space-id={spaceId}
              height={2 * HEX_SIZE}
              href={assetUrl(tokenImage)}
              key={`${spaceId}-token`}
              preserveAspectRatio="none"
              // Decorative art only — never intercept the hex's move click.
              style={{ pointerEvents: "none" }}
              width={HEX_WIDTH}
              x={x - HEX_WIDTH / 2}
              y={y - HEX_SIZE}
            />
          );
        }
      }
      if (field.location === "dungeon_gate") {
        const floor = Math.max(1, Math.min(10, state.players[viewerPlayerId]?.dungeonFloor ?? 1));
        overlays.push(
          <g
            aria-label={`Your dungeon progress: floor ${floor}`}
            className="dungeonFloorSvgBadge"
            key={`${spaceId}-dungeon-floor`}
            transform={`translate(${x} ${y + HEX_SIZE * 0.66})`}
          >
            <rect height="13" rx="5" width="42" x="-21" y="-9" />
            <text fontSize="6" letterSpacing="0.35" textAnchor="middle" y="0">FLOOR {floor}</text>
          </g>
        );
      }
      if (field.location === "creature_bank" && field.bankSize) {
        overlays.push(
          <g
            aria-label={`Creature Bank size ${ROMAN[field.bankSize]}`}
            className={`bankSizeSvgBadge placed size-${field.bankSize}`}
            key={`${spaceId}-bank-size`}
            transform={`translate(${x + HEX_SIZE * 0.52} ${y - HEX_SIZE * 0.56})`}
          >
            <circle className="coinOuter" r="11" />
            <circle className="coinInner" r="7.9" />
            <text textAnchor="middle" y="2.5">{field.bankSize}</text>
          </g>
        );
      }
      if (!artShown && glyph && field.location !== "empty_field" && !tokenImage && !isTeleportMarkLocation(field.location)) {
        overlays.push(
          <text className="hexGlyph" key={`${spaceId}-glyph`} textAnchor="middle" x={x} y={y + 6}>
            {glyph}
          </text>
        );
      }
      // Modular field icons for atmosphere tiles that ship no baked bonuses
      // (for example anime D-S1). Attached one module per field — never a full-tile
      // image regen. Classic printed tiles leave attachFieldSymbols off.
      if (artShown && attachFieldSymbols && !tokenImage) {
        const symbol = fieldSymbolOverlayFor(field);
        if (symbol) {
          // These overlay the atmosphere art rather than replacing it. Leave
          // enough breathing room to read the Heavenly Demon Palace tile
          // beneath them; the old scale nearly filled the entire hex.
          const iconScale =
            symbol.kind === "resource" ? 0.62 :
            symbol.kind === "treasure" ? 0.6 :
            0.56;
          const iconSize = HEX_SIZE * iconScale * (tileDef?.assets?.fieldSymbolScale ?? 1);
          overlays.push(
            <image
              className="fieldSymbolModule"
              data-symbol-kind={symbol.kind}
              height={iconSize}
              href={assetUrl(symbol.image)}
              key={`${spaceId}-field-symbol`}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: "none" }}
              width={iconSize}
              x={x - iconSize / 2}
              y={y - iconSize * (symbol.kind === "mine" ? 0.15 : 0.05)}
            />
          );
          if (symbol.amount != null && symbol.amount > 0) {
            overlays.push(
              <text
                className="hexProduction"
                key={`${spaceId}-field-symbol-amt`}
                textAnchor="middle"
                x={x}
                y={y + HEX_SIZE * 0.62}
              >
                {`↻${symbol.amount}`}
              </text>
            );
          }
          if (symbol.difficulty && guarded) {
            overlays.push(
              <text
                className="hexDifficulty"
                key={`${spaceId}-field-symbol-diff`}
                textAnchor="middle"
                x={x}
                y={y - HEX_SIZE * 0.48}
              >
                {ROMAN[symbol.difficulty]}
              </text>
            );
          }
        }
      }
      // Designed guards on map-object hexes (teleport tokens / gates / one-way
      // halves) are NOT printed on the tile scan, so their numeral shows even
      // in art mode — otherwise a designed guard would be invisible. The
      // teleport-mark set covers the one-way Monolith halves isMapObjectLocation
      // does not (a guarded tile-carved one-way entrance was numeral-less in
      // art mode).
      const designedGuardHex =
        isMapObjectLocation(field.location) ||
        isTeleportMarkLocation(field.location) ||
        field.location === "subterranean_gate";
      if ((!artShown || designedGuardHex) && field.difficulty && guarded) {
        overlays.push(
          <text className="hexDifficulty" key={`${spaceId}-diff`} textAnchor="middle" x={x} y={y - HEX_SIZE * 0.45}>
            {ROMAN[field.difficulty]}
          </text>
        );
      }
      // A small gear marks a designer-ALTERED guard so an altered fight is
      // spotted at a glance (the tooltip + pre-attack confirm carry the detail).
      if (alteredGuardPreview) {
        overlays.push(
          <text
            className="hexAlteredGuard"
            key={`${spaceId}-altered`}
            textAnchor="middle"
            x={x + HEX_SIZE * 0.52}
            y={y - HEX_SIZE * 0.4}
          >
            ⚙
          </text>
        );
      }
      // A gift mark for an unclaimed designer first-clear reward.
      if (designerRewardTip) {
        overlays.push(
          <text
            className="hexDesignerReward"
            data-designer-reward="true"
            key={`${spaceId}-designer-reward`}
            textAnchor="middle"
            x={x + HEX_SIZE * 0.52}
            y={y + HEX_SIZE * (alteredGuardPreview ? 0.05 : -0.4)}
          >
            ★
          </text>
        );
      }
      // Field Override (WOG / anime) hexes wear distinctive art; this small
      // corner glyph badge flags "this hex is special — hover/tap it" for a
      // zoomed-out player. Shown even over art (registry glyph, not the
      // art-suppressed fieldOverrideGlyph); kinds with no glyph get no badge.
      if (overrideInfo?.glyph) {
        overlays.push(
          <g
            aria-hidden="true"
            className="fieldOverrideGlyphBadge"
            data-space-id={spaceId}
            key={`${spaceId}-fo-glyph`}
            transform={`translate(${x - HEX_SIZE * 0.5} ${y + HEX_SIZE * 0.52})`}
          >
            <circle r="8.4" />
            <text textAnchor="middle" y="3.2">
              {overrideInfo.glyph}
            </text>
          </g>
        );
      }
      if (
        adventure.grail?.status === "built" &&
        adventure.grail.builtFieldId === field.spaceId
      ) {
        overlays.push(
          <g
            aria-label="Grail built here"
            className="mapGrailToken"
            key={`${spaceId}-built-grail`}
            role="img"
            transform={`translate(${x + HEX_SIZE * 0.48} ${y + HEX_SIZE * 0.48})`}
          >
            <circle r={9} />
            <text textAnchor="middle" y={3.5}>🏆</text>
            <title>Grail built here</title>
          </g>
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
      // Obelisks and Star Axes hold one cube per visitor: smaller flags for
      // every player beyond the first.
      for (const [extraIndex, extraOwnerId] of (field.extraFlagOwnerIds ?? []).entries()) {
        overlays.push(
          <g
            key={`${spaceId}-extra-flag-${extraOwnerId}`}
            transform={`translate(${x - HEX_SIZE * 0.62 + (extraIndex + 1) * 9}, ${y - HEX_SIZE * 0.6})`}
          >
            <line className="flagPole" x1={0} x2={0} y1={0} y2={12} />
            <path d="M0 1 L8 3.5 L0 6 Z" fill={playerColor(state, extraOwnerId)} stroke="#1d1206" strokeWidth={0.6} />
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
      if (!artShown && field.resource && field.location === "mine") {
        overlays.push(
          <text className="hexProduction" key={`${spaceId}-mine`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.72}>
            {field.resource === "buildingMaterials" ? "⚒" : field.resource === "gold" ? "🪙" : "♦"}
            {field.amount}
          </text>
        );
      }
      // Yellow border lines: printed outer arcs, blocked-field rings, internal
      // borders, plus designer whole-arc + per-edge lines — all through the one
      // segment list, drawn bold (dark casing under a gold core).
      for (const segment of borderSegments) {
        if (segment.slot !== slot) {
          continue;
        }
        const direction = (segment.edge + tile.rotation) % 6;
        pushBorderLines(
          overlays,
          `${spaceId}-border-${segment.edge}`,
          hexEdgeForDirection(x, y, HEX_SIZE - 1.2, direction)
        );
      }

      // Hero pawns: separate top layer keyed by hero id so moves glide.
      const occupants = heroesBySpace.get(spaceId) ?? [];
      for (const [index, occupant] of occupants.entries()) {
        const heroDef = occupant.heroDefId ? coreHeroDefinitions[occupant.heroDefId] : undefined;
        const portrait = heroDef?.portrait;
        const isOwnHero = occupant.playerId === viewerPlayerId;
        const carriesGrail =
          adventure.grail?.status === "carried" &&
          adventure.grail.carrierHeroId === occupant.heroId;
        // Only offer hero switching when the player actually has a second hero.
        const canSelectHero = isOwnHero && hasSecondaryHero && myTurn && !readOnly;
        const isActiveHero = isOwnHero && hasSecondaryHero && myHero?.id === occupant.heroId;
        heroPawns.push(
          <g
            className="heroPawn"
            data-hero-id={occupant.heroId}
            key={occupant.heroId}
            onClick={
              canSelectHero
                ? (clickEvent) => {
                    clickEvent.stopPropagation();
                    if (suppressClickRef.current) {
                      return;
                    }
                    setSelectedHeroId(occupant.heroId);
                  }
                : undefined
            }
            style={{
              transform: `translate(${x + index * 10 - 5}px, ${y - 4}px)`,
              cursor: canSelectHero ? "pointer" : undefined,
              // The .heroPawn layer is pointer-events:none so map clicks fall
              // through to the hex underneath. Re-enable it on a pawn the viewer
              // may switch to — otherwise its click-to-switch never fires and a
              // Secondary Hero can never be selected.
              pointerEvents: canSelectHero ? "auto" : "none"
            }}
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
                  href={assetUrl(portrait)}
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
            {isActiveHero ? <circle fill="none" r={13.5} stroke="#ffd34d" strokeWidth={2} /> : null}
            <line className="heroFlagPole" x1={0} x2={0} y1={-9} y2={-24} />
            <path
              d="M0 -23 L13 -19 L0 -15 Z"
              fill={playerColor(state, occupant.playerId)}
              stroke="#160d04"
              strokeWidth={0.8}
            />
            {carriesGrail ? (
              <g aria-label="Carrying the Grail" className="mapGrailToken heroGrailToken" role="img" transform="translate(10 8)">
                <circle r={7.5} />
                <text textAnchor="middle" y={3}>🏆</text>
                <title>Carrying the Grail</title>
              </g>
            ) : null}
          </g>
        );
      }
    }
  }

  // --- Standalone map-object hexes: designer objects OFF every tile ----------
  // These are real fields with a reserved (tile-less) instance id, so the tile
  // loop above never draws them. They are public and always visible.
  for (const field of Object.values(adventure.fields)) {
    if (!field.standalone) {
      continue;
    }
    const spaceId = field.spaceId;
    const coord = parseHexSpaceId(spaceId);
    if (!coord) {
      continue;
    }
    const { x, y } = hexToPixel(coord, HEX_SIZE);
    track(x, y);
    const target = reachable.get(spaceId);
    const remindMove = drawReminderTargets.get(spaceId);
    const endTurnMove = endTurnMoveTargets.get(spaceId);
    const mapChoice = pendingMapChoiceTargets.get(spaceId);
    const revisitAction = revisitActionBySpace.get(spaceId);
    const teleportTarget = teleportChoice?.targets.get(spaceId);
    const guarded = Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
    const isSelected = selectedTarget?.spaceId === spaceId;
    cells.push(
      <polygon
        className={[
          "hexCell",
          "standaloneObjectHex",
          target ? "moveTarget" : "",
          remindMove ? "moveTargetLocked" : "",
          teleportTarget ? "teleportTarget" : "",
          endTurnMove ? "endTurnMoveTarget" : "",
          mapChoice || revisitAction ? "mapChoiceTarget" : "",
          isSelected ? "selectedTarget" : ""
        ].join(" ")}
        data-space-id={spaceId}
        fill={TERRAIN_COLORS.dirt}
        key={`standalone-${spaceId}`}
        onClick={
          readOnly
            ? undefined
            : teleportTarget
              ? () => {
                  if (!suppressClickRef.current) {
                    onAction(teleportTarget.action);
                  }
                }
              : mapChoice
              ? () => {
                  if (!suppressClickRef.current) {
                    onAction(mapChoice);
                  }
                }
              : endTurnMove
                ? () => {
                    if (!suppressClickRef.current) {
                      onAction(endTurnMove);
                    }
                  }
                : revisitAction
                  ? () => {
                      if (!suppressClickRef.current) {
                        onAction(revisitAction);
                      }
                    }
                : target
                  ? () => {
                      if (!suppressClickRef.current) {
                        setSelectedTarget(selectedTarget?.spaceId === spaceId ? null : target);
                      }
                    }
                  : remindMove
                    ? () => {
                        if (!suppressClickRef.current) {
                          remindToDraw(spaceId);
                        }
                      }
                    : undefined
        }
        points={hexCorners(x, y, HEX_SIZE - 1.2)}
      >
        <title>
          {`${
            field.location === "gate" ? `Gate (pair ${field.gatePair})` : locationDefinitions[field.location]?.name ?? field.location
          }${guarded && field.difficulty ? ` (guard ${ROMAN[field.difficulty]})` : ""} — a standalone object hex${
            target ? ` — ${target.cost} movement point${target.cost === 1 ? "" : "s"}` : ""
          }${revisitAction ? " — click to resolve this field (1 movement point)" : ""}`}
        </title>
      </polygon>
    );
    if (isTeleportMarkLocation(field.location)) {
      // Teleport objects (Gate / Monolith / one-way halves): the unified
      // designer-parity mark — same undistorted art + ring + pair badge the
      // map editor draws.
      overlays.push(teleportHexMark(spaceId, x, y, field));
    } else if (outpostObjectImage(field.location)) {
      // Designer outposts: the printed hex scan (Garrison / Keymaster's Tent /
      // Barrier). Tents and Barriers add a colored ring + number (their color
      // is the key mechanism); the Garrison wears its printed light-blue frame.
      overlays.push(
        <image
          className="locationToken"
          height={2 * HEX_SIZE}
          href={assetUrl(outpostObjectImage(field.location)!)}
          key={`standalone-${spaceId}-outpost`}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }}
          width={HEX_WIDTH}
          x={x - HEX_WIDTH / 2}
          y={y - HEX_SIZE}
        />
      );
      if (field.location !== "garrison" && field.gatePair) {
        const color = GATE_PAIR_COLORS[field.gatePair];
        overlays.push(
          <g className="hexGateMark" key={`standalone-${spaceId}-outpost-color`} style={{ pointerEvents: "none" }}>
            <circle cx={x} cy={y} fill="none" r={HEX_SIZE * 0.55} stroke={color} strokeWidth={2.4} />
            <circle cx={x + HEX_SIZE * 0.52} cy={y - HEX_SIZE * 0.56} fill={color} r={7} stroke="#160f06" strokeWidth={1} />
            <text
              fill="#fff"
              fontSize={9}
              fontWeight={700}
              textAnchor="middle"
              x={x + HEX_SIZE * 0.52}
              y={y - HEX_SIZE * 0.56 + 3}
            >
              {field.gatePair}
            </text>
          </g>
        );
      }
    }
    // Outposts carry flags (the winner's marker; tents allow several).
    if (field.flagOwnerId) {
      overlays.push(
        <g key={`standalone-${spaceId}-flag`} transform={`translate(${x - HEX_SIZE * 0.62}, ${y - HEX_SIZE * 0.72})`}>
          <line className="flagPole" x1={0} x2={0} y1={0} y2={16} />
          <path d="M0 1 L11 4.5 L0 8 Z" fill={playerColor(state, field.flagOwnerId)} stroke="#1d1206" strokeWidth={0.7} />
        </g>
      );
    }
    for (const [extraIndex, extraOwnerId] of (field.extraFlagOwnerIds ?? []).entries()) {
      overlays.push(
        <g
          key={`standalone-${spaceId}-extra-flag-${extraOwnerId}`}
          transform={`translate(${x - HEX_SIZE * 0.62 + (extraIndex + 1) * 9}, ${y - HEX_SIZE * 0.6})`}
        >
          <line className="flagPole" x1={0} x2={0} y1={0} y2={12} />
          <path d="M0 1 L8 3.5 L0 6 Z" fill={playerColor(state, extraOwnerId)} stroke="#1d1206" strokeWidth={0.6} />
        </g>
      );
    }
    if (
      adventure.grail?.status === "built" &&
      adventure.grail.builtFieldId === field.spaceId
    ) {
      overlays.push(
        <g
          aria-label="Grail built here"
          className="mapGrailToken"
          key={`standalone-${spaceId}-built-grail`}
          role="img"
          transform={`translate(${x + HEX_SIZE * 0.48} ${y + HEX_SIZE * 0.48})`}
        >
          <circle r={9} />
          <text textAnchor="middle" y={3.5}>🏆</text>
          <title>Grail built here</title>
        </g>
      );
    }
    if (guarded && field.difficulty) {
      overlays.push(
        <text className="hexDifficulty" key={`standalone-${spaceId}-diff`} textAnchor="middle" x={x} y={y - HEX_SIZE * 0.45}>
          {ROMAN[field.difficulty]}
        </text>
      );
    }
    // Designer yellow borders on the object hex — same bold casing+core the
    // tile-carried per-edge borders use, so a sealed edge reads identically.
    for (const direction of field.borderEdges ?? []) {
      pushBorderLines(
        overlays,
        `standalone-${spaceId}-border-${direction}`,
        hexEdgeForDirection(x, y, HEX_SIZE - 0.8, direction)
      );
    }
    if ((isMapObjectLocation(field.location) || field.location === "oneway_entrance") && (target || remindMove)) {
      overlays.push(
        <text className="hexGateCue" key={`standalone-${spaceId}-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
          ⇄ teleport
        </text>
      );
    }
    // Teleport travel picker: this standalone object is one of the destinations
    // the traveller may click as an exit.
    if (teleportTarget) {
      overlays.push(
        <text className="hexTeleportCue" key={`standalone-${spaceId}-teleport-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
          {teleportChoice?.kind === "whirlpool" ? "🌀 exit here" : "⇄ exit here"}
        </text>
      );
    }
    // Compact hero pawn(s) standing on the standalone hex. Like the tile-hex
    // pawn, a pawn the viewer may switch to is CLICKABLE (stopPropagation): the
    // standalone hex underneath is a teleport object whose click fires its
    // revisit/travel, so a pointer-events:none pawn made an own hero standing
    // on a Monolith unselectable — every click "selected the monolith" instead.
    for (const [index, occupant] of (heroesBySpace.get(spaceId) ?? []).entries()) {
      const heroDef = occupant.heroDefId ? coreHeroDefinitions[occupant.heroDefId] : undefined;
      const portrait = heroDef?.portrait;
      const isOwnHero = occupant.playerId === viewerPlayerId;
      const carriesGrail =
        adventure.grail?.status === "carried" &&
        adventure.grail.carrierHeroId === occupant.heroId;
      const canSelectHero = isOwnHero && hasSecondaryHero && myTurn && !readOnly;
      const isActiveHero = isOwnHero && hasSecondaryHero && myHero?.id === occupant.heroId;
      heroPawns.push(
        <g
          className="heroPawn"
          data-hero-id={occupant.heroId}
          key={`standalone-pawn-${occupant.heroId}`}
          onClick={
            canSelectHero
              ? (clickEvent) => {
                  clickEvent.stopPropagation();
                  if (suppressClickRef.current) {
                    return;
                  }
                  setSelectedHeroId(occupant.heroId);
                }
              : undefined
          }
          style={{
            transform: `translate(${x + index * 10 - 5}px, ${y - 4}px)`,
            cursor: canSelectHero ? "pointer" : undefined,
            pointerEvents: canSelectHero ? "auto" : "none"
          }}
        >
          <circle className="heroPawnBase" r={12} />
          {portrait ? (
            <>
              <clipPath id={`heroClip-sa-${occupant.heroId}`}>
                <circle r={10} />
              </clipPath>
              <image
                className="heroSprite"
                clipPath={`url(#heroClip-sa-${occupant.heroId})`}
                height={22}
                href={assetUrl(portrait)}
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
          {isActiveHero ? <circle fill="none" r={13.5} stroke="#ffd34d" strokeWidth={2} /> : null}
          <line className="heroFlagPole" x1={0} x2={0} y1={-9} y2={-24} />
          <path d="M0 -23 L13 -19 L0 -15 Z" fill={playerColor(state, occupant.playerId)} stroke="#160d04" strokeWidth={0.8} />
          {carriesGrail ? (
            <g aria-label="Carrying the Grail" className="mapGrailToken heroGrailToken" role="img" transform="translate(10 8)">
              <circle r={7.5} />
              <text textAnchor="middle" y={3}>🏆</text>
              <title>Carrying the Grail</title>
            </g>
          ) : null}
        </g>
      );
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
            // Dispatch as the hero that can actually reach THIS slot (tagged on
            // the ghost by placementCenters), not the currently-selected hero.
            // A Secondary Hero's border slot is only reachable by it, so using
            // `myHero` (which defaults to the Main Hero) made the engine reject
            // the placement — the Secondary Hero could never lay a Ⅱ–Ⅲ tile.
            if (suppressClickRef.current || !center.heroId) {
              return;
            }
            onAction({
              type: "PLACE_TILE",
              playerId: viewerPlayerId,
              heroId: center.heroId,
              supplyIndex: placement.supplyIndex,
              centerRow: center.row,
              centerCol: center.col
            });
          }}
        >
          <image
            className="ghostTileBack"
            height={5 * HEX_SIZE}
            href={assetUrl(TILE_BACK_IMAGES.far)}
            preserveAspectRatio="none"
            width={3 * HEX_WIDTH}
            x={x - (3 * HEX_WIDTH) / 2}
            y={y - (5 * HEX_SIZE) / 2}
          />
          {footprint.map((cell, index) => {
            const pixel = hexToPixel(cell, HEX_SIZE);
            return <polygon className="ghostHex" key={index} points={hexCorners(pixel.x, pixel.y, HEX_SIZE - 2)} />;
          })}
          <title>Place the Far tile here (1 movement point)</title>
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

  for (const placementTarget of observatoryTargets.placements) {
    const { x, y } = hexToPixel({ row: placementTarget.row, col: placementTarget.col }, HEX_SIZE);
    track(x, y);
    overlays.push(
      <g
        aria-label="Place a Far tile here"
        className="observatoryPlacementTarget"
        key={`observatory-place-${placementTarget.row}-${placementTarget.col}`}
        onClick={() => {
          if (!suppressClickRef.current) {
            onAction(placementTarget.action);
          }
        }}
        role="button"
      >
        <circle cx={x} cy={y} r={HEX_SIZE * 1.2} />
        <text textAnchor="middle" x={x} y={y + 5}>
          Place tile
        </text>
      </g>
    );
  }

  if (!Number.isFinite(minX)) {
    return null;
  }

  // Shared teardown for pointerup / pointercancel / lostpointercapture. Ends
  // whichever gesture (pan or pinch) the lifted pointer belonged to; the click
  // suppressor is only re-armed once the LAST pointer lifts, so the tap the
  // browser synthesizes when the second pinch finger releases can never fall
  // through onto a hex (it could move the hero).
  const releaseMapPointer = (pointerId: number) => {
    pointersRef.current.delete(pointerId);
    const pinch = pinchRef.current;
    if (pinch && (pointerId === pinch.aId || pointerId === pinch.bId)) {
      // Lifting either pinch finger ends the gesture; the survivor does NOT
      // resume panning (that would make the camera jump) — a fresh press does.
      pinchRef.current = null;
    }
    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
      setIsDragging(false);
    }
    if (pointersRef.current.size === 0) {
      // Let the click event after this pointerup know it was a drag/pinch.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  // Spell out why click-to-move is locked right now, instead of a map that
  // silently ignores clicks.
  const moveLockReason = (() => {
    if (!isSeated || readOnly || !myHero) {
      return null;
    }
    if (!myTurn) {
      if (parallelTurnsActive(state) && state.turn.completedPlayerIds.includes(viewerPlayerId)) {
        const waiting = remainingParallelPlayerIds(state)
          .map((playerId) => state.players[playerId]?.name ?? playerId)
          .join(", ");
        return `You ended your parallel turn — waiting for ${waiting || "the round to wrap"}`;
      }
      return `${state.players[state.activePlayerId]?.name ?? "Another player"}'s turn — movement unlocks on yours`;
    }
    if (state.players[viewerPlayerId]?.needsHandRefresh) {
      return "Over the hand limit — discard down first (bottom of the screen)";
    }
    if (state.players[viewerPlayerId]?.canMulligan) {
      return "Take your start-of-turn draw first (the banner above your hand)";
    }
    // Parallel turns: a FOREIGN battle/choice leaves quiet moves open — say so
    // instead of claiming the whole map is locked.
    if (parallelBlocker) {
      const name =
        parallelBlocker === "table" ? "another player" : (state.players[parallelBlocker]?.name ?? parallelBlocker);
      return `${name}'s ${state.combat ? "battle" : "interaction"} is resolving — quiet moves only (fields that trigger nothing)`;
    }
    if (state.combat) {
      return "A combat is open — the map unlocks when it closes";
    }
    if (rawAdventure?.pendingVisit) {
      return rawAdventure.pendingVisit.playerId === viewerPlayerId
        ? "Finish the location visit first (see its prompt)"
        : `${state.players[rawAdventure.pendingVisit.playerId]?.name ?? "A player"} is resolving a visit`;
    }
    if (pendingTileChoice && pendingTileChoice.playerId !== viewerPlayerId) {
      return `${state.players[pendingTileChoice.playerId]?.name ?? "A player"} is rotating the new tile`;
    }
    return null;
  })();

  // --- Floating controls anchored at the relevant hex/tile ------------------
  // Move-confirm and rotate controls live *on the map*, right at the clicked
  // destination hex / the tile being rotated, instead of a bar pinned to the
  // bottom of the board. They are rendered as plain HTML overlays absolutely
  // positioned inside `.hexMapWrap` — NOT SVG `<foreignObject>`. Mobile WebKit
  // (every iPhone browser) silently fails to paint foreignObject nested under an
  // ancestor SVG/CSS transform, so under the map's camera transform these cards
  // showed NOTHING on phones. As HTML siblings of the `<svg>` they paint
  // reliably everywhere; their pixel position is derived from the SAME
  // camera/viewBox math the SVG uses (`map-float-position.ts`), so placement is
  // identical on desktop and phones. Being HTML they keep a constant on-screen
  // size at any zoom (no counter-scale needed) and are clamped fully on-screen so
  // a card whose hex hugs a screen edge is never cut off.
  type MapFloat = {
    key: string;
    mapPoint: { x: number; y: number };
    cardWidth: number;
    cardHeight: number;
    gap: number;
    render: () => ReactNode;
  };
  const mapFloats: MapFloat[] = [];

  // Polish strength-based Quick Combat (`polish-quick-combat`): a compact
  // pre-fight readout of the viewer's army strength vs. the field's required
  // strength, shown on the map floats so the player can see BEFORE committing
  // whether a guarded fight can be resolved as a Quick Combat. Only rendered
  // when `polishQuickCombatFieldInfo` returns a value — the rule is on AND the
  // field is an ordinary guarded neutral fight (never a Bank / exact-army /
  // teleport guard) — and the verdict mirrors the engine's own classifier.
  const renderQuickCombatNote = (info: PolishQuickCombatFieldInfo): ReactNode => {
    const verdict =
      info.outcome === "mandatory"
        ? "Covered — resolves as a Quick Combat (auto-win, no Experience)."
        : info.outcome === "choice"
          ? "Covered — you may Quick Combat or fight for Experience."
          : info.covered
            ? "Fight for Experience — your level matches this field."
            : "Army too weak for Quick Combat — you must fight.";
    return (
      <div className={`quickCombatNote quickCombatNote-${info.outcome}`} role="note">
        <strong>
          <span aria-hidden="true">⚡</span> Quick Combat — army strength {info.armyStrength} / needs{" "}
          {info.requiredStrength}
        </strong>
        <span>{verdict}</span>
      </div>
    );
  };

  // Click-to-inspect a designer-altered object OR a Field Override (WOG / anime)
  // hex: ONE readable card with the override's art + name + mod tag + what
  // visiting does, plus (when present) the exact guard army / first-clear reward
  // — the hover tooltip's touch-friendly twin. An override hex that ALSO carries
  // a designer guard/reward shows a single combined card, never two. Closes on a
  // second click, the Close button, or when the field stops being inspectable.
  if (inspectGuardAt) {
    const coord = parseHexSpaceId(inspectGuardAt);
    const field = adventure?.fields[inspectGuardAt];
    const overrideInspect = field ? mapObjectPresentation(field.location, adventure?.pveTheme) : null;
    const preview = designedGuardPreview(field);
    const inspectGuarded = Boolean(field && isFieldGuarded(field));
    const inspectQuickCombat = field && myHero ? polishQuickCombatFieldInfo(state, myHero, field) : null;
    const inspectClaimed = Boolean(
      field && (field.centerHexClaimed || field.viiBonusClaimed || field.designerRewardClaimed)
    );
    const rewardSummary =
      field && !inspectClaimed
        ? describeFieldReward({
            ...(field.viiReward ?? {}),
            ...(field.centerHexReward ?? {}),
            ...(field.designerReward ?? {})
          })
        : "";
    const rewardVp =
      field && !inspectClaimed ? (field.centerHexVp ?? field.viiVp ?? field.designerRewardVp ?? 0) : 0;
    // Guard line for a plain (non-designer) override guard — bi_canh / emerald_tower
    // etc. carry a printed difficulty but no `designedGuard`, so `preview` is null.
    const overrideGuardLevel =
      overrideInspect && !preview && inspectGuarded && field?.difficulty ? field.difficulty : 0;
    if (coord && field && (overrideInspect || preview || rewardSummary || rewardVp > 0)) {
      mapFloats.push({
        key: "designed-guard-inspect-float",
        mapPoint: hexToPixel(coord, HEX_SIZE),
        cardWidth: 258,
        cardHeight:
          (overrideInspect ? 150 : 96) +
          (preview?.units.length ? Math.min(3, preview.units.length) * 14 : 0) +
          (inspectQuickCombat ? 52 : 0),
        gap: HEX_SIZE * 0.62,
        render: () => (
          <div
            aria-label="Map object details"
            className={`mapFloatCard designedGuardInspectFloat${overrideInspect ? " fieldOverrideInspectFloat" : ""}`}
            data-inspect-guard={inspectGuardAt}
            data-field-override={overrideInspect ? field.location : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            {overrideInspect ? (
              <span className="fieldOverrideInspectHead">
                {overrideInspect.image ? (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="fieldOverrideInspectArt"
                    src={assetUrl(overrideInspect.image)}
                  />
                ) : overrideInspect.glyph ? (
                  <span aria-hidden="true" className="fieldOverrideInspectGlyph">
                    {overrideInspect.glyph}
                  </span>
                ) : null}
                <span className="fieldOverrideInspectName">
                  {overrideInspect.name}
                  <span className="fieldOverrideInspectTag">{overrideInspect.packageTag}</span>
                </span>
              </span>
            ) : (
              <span className="mapFloatTitle">
                <span aria-hidden="true">⚔</span>{" "}
                {locationDefinitions[field.location]?.name ?? field.location} — altered by the map designer
              </span>
            )}
            {overrideInspect ? (
              <span className="fieldOverrideInspectSummary">{overrideInspect.summary}</span>
            ) : null}
            {preview ? (
              <span className="designedGuardInspectUnits">
                {preview.units.length > 0
                  ? `Guard: ${preview.units.join(", ")}`
                  : `Guard level ${ROMAN[preview.difficulty] ?? preview.difficulty}`}
                {preview.units.length > 0 && preview.difficulty
                  ? ` (counts as ${ROMAN[preview.difficulty] ?? preview.difficulty})`
                  : ""}
                {overrideInspect ? " — altered by the map designer" : ""}
              </span>
            ) : overrideGuardLevel ? (
              <span className="designedGuardInspectUnits">
                Guarded — defeat the guard ({`level ${ROMAN[overrideGuardLevel] ?? overrideGuardLevel}`}) to visit.
              </span>
            ) : null}
            {rewardSummary || rewardVp > 0 ? (
              <span className="designedGuardInspectReward">
                <span aria-hidden="true">★</span> First-clear reward:{" "}
                {[rewardSummary, rewardVp > 0 ? `+${rewardVp} VP` : ""].filter(Boolean).join(" · ")}
              </span>
            ) : null}
            {inspectQuickCombat ? renderQuickCombatNote(inspectQuickCombat) : null}
            <button
              className="commandButton ghost"
              onClick={() => setInspectGuardAt(null)}
              type="button"
            >
              Close
            </button>
          </div>
        )
      });
    }
  }

  if (selectedTarget && myHero && !readOnly) {
    const coord = parseHexSpaceId(selectedTarget.spaceId);
    if (coord) {
      const cost = selectedTarget.cost;
      // Warn before attacking a neutral fight the MAP DESIGNER altered (a forced
      // settlement fight, a custom level, or an exact custom army): show what the
      // hero will face and require an explicit "Attack" confirmation. A printed
      // guard (or an already-owned field) keeps the plain "Move there".
      const destField = adventure?.fields[selectedTarget.spaceId];
      const alteredGuard =
        destField && isFieldGuarded(destField) && destField.flagOwnerId !== viewerPlayerId
          ? designedGuardPreview(destField)
          : null;
      const quickCombat = destField ? polishQuickCombatFieldInfo(state, myHero, destField) : null;
      mapFloats.push({
        key: "move-confirm-float",
        mapPoint: hexToPixel(coord, HEX_SIZE),
        cardWidth: 236,
        cardHeight:
          (alteredGuard ? 148 + (alteredGuard.units.length > 0 ? 16 : 0) : 104) + (quickCombat ? 52 : 0),
        gap: HEX_SIZE * 0.62,
        render: () => (
          <div
            aria-label="Confirm movement"
            className={`mapFloatCard moveConfirmFloat${alteredGuard ? " alteredGuardConfirm" : ""}`}
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span className="mapFloatLabel">
              <span aria-hidden="true">🐎</span> Move {cost} field{cost === 1 ? "" : "s"} ({cost} MP)
            </span>
            {alteredGuard ? (
              <div className="alteredGuardWarn" role="note">
                <strong>
                  <span aria-hidden="true">⚔</span> Altered guard (map designer)
                </strong>
                {alteredGuard.units.length > 0 ? (
                  <span>
                    You will face {alteredGuard.units.join(", ")}
                    {alteredGuard.difficulty ? ` (guard ${ROMAN[alteredGuard.difficulty] ?? alteredGuard.difficulty})` : ""}.
                  </span>
                ) : (
                  <span>
                    A guard {ROMAN[alteredGuard.difficulty] ?? alteredGuard.difficulty} army defends this field.
                  </span>
                )}
              </div>
            ) : null}
            {quickCombat ? renderQuickCombatNote(quickCombat) : null}
            <div className="mapFloatButtons">
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
                <Check size={13} /> {alteredGuard ? "Attack" : "Move there"}
              </button>
              <button className="commandButton ghost" onClick={() => setSelectedTarget(null)} type="button">
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )
      });
    }
  }

  // The mandatory-draw reminder: a brief, auto-fading note anchored at the hex
  // the player tried to move onto while the draw was still pending.
  if (drawReminderAt && drawPending) {
    const coord = parseHexSpaceId(drawReminderAt);
    if (coord) {
      mapFloats.push({
        key: "draw-reminder-float",
        mapPoint: hexToPixel(coord, HEX_SIZE),
        cardWidth: 224,
        cardHeight: 60,
        gap: HEX_SIZE * 0.62,
        render: () => (
          <div className="mapFloatCard drawReminderFloat" role="status">
            <span className="mapFloatLabel">⚠ Take your start-of-turn draw first</span>
          </div>
        )
      });
    }
  }

  // Tapping a hidden Underground tile from the Surface explains the divide: the
  // only crossing is a Subterranean Gate, entered on foot.
  if (gateHintAt) {
    const coord = parseHexSpaceId(gateHintAt);
    if (coord) {
      mapFloats.push({
        key: "gate-hint-float",
        mapPoint: hexToPixel(coord, HEX_SIZE),
        cardWidth: 268,
        cardHeight: 78,
        gap: HEX_SIZE * 0.62,
        render: () => (
          <div className="mapFloatCard gateHintFloat" role="status">
            <span className="mapFloatLabel">
              ⛰ You can&apos;t discover an Underground tile from the Surface. Reach a Subterranean Gate (the cave-mouth
              hex on a revealed tile) and step onto it — the tile beyond opens for free.
            </span>
          </div>
        )
      });
    }
  }

  // Subterranean Gate exit pick: cycle positions on the selected candidate hex
  // and Confirm — locks the exit for the rest of the game.
  if (gatePlacementChoice && gatePlacementOpen) {
    const coord = parseHexSpaceId(gatePlacementChoice.selectedHex);
    if (coord) {
      const confirmAction = legalActions.find(
        (legal) =>
          legal.action.type === "CHOOSE_OPTION" &&
          legal.action.choiceId === gatePlacementOpen.choiceId &&
          legal.action.optionIndex === gatePlacementChoice.selectedIndex
      )?.action;
      mapFloats.push({
        key: "gate-exit-float",
        mapPoint: hexToPixel(coord, HEX_SIZE),
        // Wider + taller so the multi-line "sacrifices …" label wraps cleanly
        // without clipping (mapFloatLabel is nowrap by default elsewhere).
        cardWidth: 300,
        cardHeight: 148,
        gap: HEX_SIZE * 0.72,
        render: () => (
          <div
            aria-label="Place the Subterranean Gate exit"
            className="mapFloatCard gateExitFloat"
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span className="mapFloatTitle">
              {gatePlacementChoice.role === "gate" ? "Gate exit" : "Path up"} — click a glowing hex
            </span>
            <small className="mapFloatLabel">{gatePlacementChoice.label}</small>
            <div className="mapFloatButtons rotateFloatRow">
              <button
                className="commandButton"
                disabled={gatePlacementChoice.count <= 1}
                onClick={() =>
                  setGatePickIndex(
                    (value) => (value + gatePlacementChoice.count - 1) % gatePlacementChoice.count
                  )
                }
                title="Previous exit position"
                type="button"
              >
                <RotateCcw size={14} />
              </button>
              <span className="rotateDegrees">
                {gatePlacementChoice.selectedIndex + 1}/{gatePlacementChoice.count}
              </span>
              <button
                className="commandButton"
                disabled={gatePlacementChoice.count <= 1}
                onClick={() => setGatePickIndex((value) => (value + 1) % gatePlacementChoice.count)}
                title="Next exit position"
                type="button"
              >
                <RotateCw size={14} />
              </button>
              <button
                className="commandButton primary"
                disabled={!confirmAction}
                onClick={() => {
                  if (confirmAction) {
                    onAction(confirmAction);
                  }
                }}
                type="button"
              >
                <Check size={13} /> Confirm
              </button>
            </div>
          </div>
        )
      });
    }
  }

  if (pendingTileChoice && rotatingTile) {
    mapFloats.push({
      key: "rotate-float",
      mapPoint: hexToPixel({ row: rotatingTile.centerRow, col: rotatingTile.centerCol }, HEX_SIZE),
      cardWidth: iAmRotating ? 272 : 230,
      cardHeight: iAmRotating ? 158 : 70,
      // The rotating tile spans a 5-hex-tall flower; clear its top edge so the
      // card never covers the art it is acting on. Phone CSS adds an extra
      // translate nudge on top of this gap.
      gap: HEX_SIZE * 3.35,
      render: () =>
        iAmRotating ? (
          <div
            aria-label="Rotate the new tile"
            className="mapFloatCard rotateFloat"
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span className="mapFloatTitle">
              Rotate your{" "}
              {pendingTileChoice.kind === "starting"
                ? "home tile (free, before you move)"
                : `${pendingTileChoice.kind === "place" ? "placed" : "revealed"} tile`}
            </span>
            <div className="rotateFloatRow">
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
            </div>
          </div>
        ) : (
          <div className="mapFloatCard passive">
            <small>{state.players[pendingTileChoice.playerId]?.name ?? "A player"} is rotating the new tile…</small>
          </div>
        )
    });
  }

  // Designed Subterranean Gates are CARVED only once BOTH their tiles are
  // revealed, so at game start a designed gate is invisible and the player can't
  // tell where to descend. Mark every planned gate hex that isn't carved yet with
  // a translucent gate token, so designer-placed gates are visible from the
  // start ("player knows where to find them"). A carved hex is skipped — the
  // field loop above already draws the real gate there. Only designer links
  // (and player pick-on-reveal plans, already known to that player) have plans,
  // so a plain random map shows nothing extra.
  for (const plan of adventure.gatePlans ?? []) {
    for (const hex of [plan.gateHex, plan.entranceHex]) {
      if (!hex || adventure.fields[hex]?.location === "subterranean_gate") {
        continue;
      }
      const coord = parseHexSpaceId(hex);
      if (!coord) {
        continue;
      }
      const { x, y } = hexToPixel(coord, HEX_SIZE);
      track(x, y);
      const markWidth = HEX_WIDTH * 0.6;
      const markHeight = 2 * HEX_SIZE * 0.6;
      overlays.push(
        <g key={`gate-plan-${hex}`} className="gatePlanMarker" style={{ pointerEvents: "none" }}>
          <title>A Subterranean Gate opens here — descend/ascend once this tile is revealed.</title>
          <circle cx={x} cy={y} fill="#5b3f24" opacity={0.3} r={HEX_SIZE * 0.52} />
          <circle cx={x} cy={y} fill="none" opacity={0.85} r={HEX_SIZE * 0.52} stroke="#e0b562" strokeDasharray="4 3" strokeWidth={2} />
          <image
            height={markHeight}
            href={assetUrl(subterraneanGateTokenImage("surface"))}
            opacity={0.9}
            preserveAspectRatio="xMidYMid meet"
            width={markWidth}
            x={x - markWidth / 2}
            y={y - markHeight / 2}
          />
        </g>
      );
    }
  }

  return (
    // The outer div is the positioning host for the floating control cards:
    // they must live OUTSIDE .hexMapWrap (whose `isolation: isolate` traps any
    // inner z-index below the Far-tile tray overlay, z-index 6) while anchoring
    // to the exact same box.
    <div className="hexMapOuter">
    <div className="hexMapWrap" aria-label="Adventure map">
      <svg
        ref={svgRef}
        className={`hexMapSvg ${isDragging ? "dragging" : ""}`}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointersRef.current.size === 1) {
            // A fresh press always re-arms clicking: if a previous gesture was
            // cancelled mid-drag (tab switch, touch scroll), the suppress flag
            // must not keep eating every later click on the map.
            suppressClickRef.current = false;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: camera.x,
              originY: camera.y,
              moved: false
            };
            return;
          }
          // A second (or later) finger: this is a multi-touch gesture, never a
          // click — and the single-pointer pan hands over to the pinch.
          suppressClickRef.current = true;
          if (pointersRef.current.size === 2) {
            dragRef.current = null;
            setIsDragging(false);
            const [[aId, a], [bId, b]] = [...pointersRef.current.entries()];
            pinchRef.current = { aId, bId, start: { camera, a: { ...a }, b: { ...b } } };
            const svg = event.currentTarget as Element;
            try {
              svg.setPointerCapture(aId);
              svg.setPointerCapture(bId);
            } catch {
              // jsdom / detached element — the gesture still works uncaptured.
            }
          }
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
        onPointerUp={(event) => releaseMapPointer(event.pointerId)}
        onPointerCancel={(event) => {
          // Browsers cancel pointers on touch-scroll or focus loss; without
          // this the drag state lingered and the map stopped taking clicks.
          releaseMapPointer(event.pointerId);
        }}
        onLostPointerCapture={(event) => releaseMapPointer(event.pointerId)}
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      >
        <defs>
          <marker id="pathArrowHead" markerHeight={7} markerWidth={7} orient="auto-start-reverse" refX={5.4} refY={3}>
            <path d="M0,0 L7,3 L0,6 Z" fill="#ffd766" />
          </marker>
        </defs>
        <g style={{ transformOrigin: "center" }} transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
          {artLayer}
          {cells}
          {overlays}
          {pathOverlay}
          {heroPawns}
        </g>
      </svg>

      <div className="mapToolbar" aria-label="Map controls">
        <button onClick={() => setCamera((c) => ({ ...c, scale: Math.min(MAP_SCALE_MAX, c.scale * 1.2) }))} title="Zoom in" type="button">
          <Plus size={13} />
        </button>
        <button onClick={() => setCamera((c) => ({ ...c, scale: Math.max(MAP_SCALE_MIN, c.scale / 1.2) }))} title="Zoom out" type="button">
          <Minus size={13} />
        </button>
        <button
          aria-pressed={wheelZoomEnabled}
          className={wheelZoomEnabled ? "selected" : ""}
          onClick={() => setWheelZoomEnabled((value) => !value)}
          title={
            wheelZoomEnabled
              ? "Mouse-wheel zoom is ON — scroll over the map to zoom. Click to lock it (wheel scrolls the page)."
              : "Mouse-wheel zoom is locked. Click to unlock and zoom with the scroll wheel."
          }
          type="button"
        >
          {wheelZoomEnabled ? <Unlock size={13} /> : <Lock size={13} />}
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

      {moveLockReason ? (
        <div className="mapLockHint" role="status">
          <span aria-hidden="true">🔒</span> {moveLockReason}
        </div>
      ) : null}

      {hasSecondaryHero && myHero && !readOnly ? (
        <div className="mapLockHint" role="status">
          <span aria-hidden="true">🧭</span> Active: {myHero.kind === "main" ? "Main Hero" : "Secondary Hero"} (
          {myHero.movementPoints} MP) — click a hero to switch
        </div>
      ) : null}

    </div>

      {/* Floating map controls as HTML overlays (see the MapFloat note above):
          positioned in real screen pixels via the shared camera/viewBox math, so
          they paint on phones where SVG foreignObject does not, and are clamped
          fully on-screen. They render as SIBLINGS of .hexMapWrap (inside the
          unisolated .hexMapOuter) so their z-index can beat the Far-tile tray's.
          The wrapper is click-through (pointer-events:none); only the card
          inside takes taps (pointer-events:auto). */}
      {mapFloats.map((float) => {
        const { left, top, above } = computeMapFloatPosition({
          viewBox: { minX, minY, width: maxX - minX, height: maxY - minY },
          elementWidth: svgSize.width,
          elementHeight: svgSize.height,
          camera,
          mapPoint: float.mapPoint,
          cardWidth: float.cardWidth,
          cardHeight: float.cardHeight,
          gap: float.gap
        });
        return (
          <div
            key={float.key}
            className={`mapFloatOuter ${above ? "above" : "below"}`}
            style={{ left, top, width: float.cardWidth }}
          >
            {float.render()}
          </div>
        );
      })}
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
  onAction,
  eventLogControl
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  eventLogControl?: ReactNode;
}) {
  const { zoomContent } = useCardZoom();
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const player = state.players[viewerPlayerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === viewerPlayerId && candidate.kind === "main"
  );
  const secondaryHero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === viewerPlayerId && candidate.kind === "secondary"
  );
  // Crowns (expert uses): remaining / round total, read straight from the engine
  // helpers so the HUD can never diverge from what canPlayExpertMode enforces.
  const crownsRemaining = player ? expertUsesAvailable(player) : 0;
  const crownsThisRound = player ? expertUsesTotalThisRound(player) : 0;
  // Person-first: in a real (roomed) game the active player is the human ("Binh"),
  // with their hero · town on the sub-line; on a solo/open table the seat label
  // already reads "Hero of Town", so no redundant pick line is shown.
  const activeIdentity = getSeatIdentity(state, state.activePlayerId);
  const activeName = activeIdentity.personName ?? activeIdentity.seatName;
  const activePick = activeIdentity.personName ? seatPickSummary(activeIdentity) : null;
  const roundKind =
    state.round <= 1 ? "first round" : state.round % 2 === 1 ? "resource round" : "astrologers round";
  const astrologersCard = getActiveAstrologersCard(state);
  const eventCard = getActiveEventCard(state);

  const endTurn = legalActions.find((legal) => legal.action.type === "END_TURN");
  const giveUp = legalActions.find((legal) => legal.action.type === "GIVE_UP");
  const winner = state.adventure?.winnerPlayerId;

  return (
    <div className="advHud" aria-label="Adventure status">
      <div className="advHudCell">
        <strong>Round {state.round}</strong>
        <small>
          {roundKind}
          {parallelTurnsActive(state) ? ` · parallel (${state.round}/${state.turn.simultaneousRoundLimit})` : ""}
        </small>
      </div>
      {parallelTurnsActive(state) ? (
        <div
          className="advHudCell"
          title="Parallel turns: everyone plays at once. Battles and choices still resolve one at a time; a PvP clash or the period's end returns play to normal turns."
        >
          <strong>
            {isParallelActor(state, viewerPlayerId)
              ? "🔀 Parallel — your turn is open"
              : state.turn.completedPlayerIds.includes(viewerPlayerId)
                ? "🔀 Parallel — you ended your turn"
                : "🔀 Parallel turns"}
          </strong>
          <small>
            {(() => {
              const waiting = remainingParallelPlayerIds(state);
              return waiting.length > 0
                ? `still playing: ${waiting.map((playerId) => state.players[playerId]?.name ?? playerId).join(", ")}`
                : "wrapping the round…";
            })()}
          </small>
        </div>
      ) : (
        <div className="advHudCell">
          <strong>{activeName}&apos;s turn</strong>
          <small>{activePick ? `${activePick} · ${state.phase}` : state.phase}</small>
        </div>
      )}
      {/* The town + hero boards live in the prominent dock above the map now
          (TownHeroDock), not as cramped chips in this status bar. */}
      {astrologersCard ? (
        <button
          className="advHudCell astrologers"
          onClick={() =>
            zoomContent({
              title: `Astrologers proclaim: ${astrologersCard.name}`,
              image: astrologersCard.image,
              lines: [astrologersCard.text],
              subtitle: astrologersCard.ongoing
                ? "Active until the next Astrologers round"
                : "Resolved this round"
            })
          }
          title={astrologersCard.text}
          type="button"
        >
          <strong>🔭 {astrologersCard.name}</strong>
          <small>astrologers proclaim</small>
        </button>
      ) : null}
      {eventCard ? (
        <button
          className="advHudCell astrologers"
          onClick={() =>
            zoomContent({
              title: `Event: ${eventCard.name}`,
              image: eventCard.image,
              lines: [eventCard.text],
              subtitle: "Drawn this Resource round — resolved in clockwise order from the drawer"
            })
          }
          title={eventCard.text}
          type="button"
        >
          <strong>📜 {eventCard.name}</strong>
          <small>event</small>
        </button>
      ) : null}
      {player && player.id !== "neutrals" ? (
        <div className="advHudCell resources" aria-label="Resources and income">
          {(
            [
              { key: "gold" as const, label: "Gold" },
              { key: "buildingMaterials" as const, label: "Building materials (ore)" },
              { key: "valuables" as const, label: "Valuables (crystal)" }
            ]
          ).map((resource) => (
            <span
              className="resourceChip"
              key={resource.key}
              title={`${resource.label}: ${player.resources[resource.key]} — gain +${player.production[resource.key]} every resource round`}
            >
              <img alt={resource.label} className="resourceIcon" src={assetUrl(RESOURCE_ICONS[resource.key])} />
              <b>{player.resources[resource.key]}</b>
              <small className="incomeTag">+{player.production[resource.key]}</small>
            </span>
          ))}
          <small className="incomeNote">income / resource round</small>
        </div>
      ) : null}
      {hero ? (
        <div className="advHudCell moveMoraleCell" aria-label="Movement, morale, ability token and crowns">
          <span
            className="statChip"
            aria-label={`Main Hero movement points: ${hero.movementPoints}`}
            title={`Main Hero: ${hero.movementPoints} movement point${hero.movementPoints === 1 ? "" : "s"} left this turn`}
          >
            <span aria-hidden="true" className="movePointIcon">
              🐎
            </span>
            <b>{hero.movementPoints}</b>
            <small>move</small>
          </span>
          {secondaryHero ? (
            <span
              aria-label={`Secondary Hero movement points: ${secondaryHero.movementPoints}`}
              className="statChip secondaryHeroMoveChip"
              title={`Secondary Hero: ${secondaryHero.movementPoints} movement point${secondaryHero.movementPoints === 1 ? "" : "s"} left this turn`}
            >
              <span aria-hidden="true" className="movePointIcon">
                🐎
              </span>
              <b>{secondaryHero.movementPoints}</b>
              <small>2nd move</small>
            </span>
          ) : null}
          <span
            className={`statChip${(player?.morale ?? 0) <= -2 ? " moraleDiscardPending" : ""}`}
            title={
              (player?.morale ?? 0) <= -2
                ? "Morale −2: if still −2 when you end the turn, your hand is discarded. Gain positive morale this turn to keep your cards."
                : `Morale ${(player?.morale ?? 0) > 0 ? "+" : ""}${player?.morale ?? 0}`
            }
          >
            <img
              alt=""
              className="moraleIcon"
              referrerPolicy="no-referrer"
              src={assetUrl(moraleIcon(player?.morale ?? 0))}
            />
            <b>
              {(player?.morale ?? 0) > 0 ? "+" : ""}
              {player?.morale ?? 0}
            </b>
            <small>{(player?.morale ?? 0) <= -2 ? "fix or dump" : "morale"}</small>
          </span>
          {player ? (
            <AbilityEmpowerTokenChip legalActions={legalActions} onAction={onAction} player={player} />
          ) : null}
          {player ? (
            <span
              className="statChip crownChip"
              title={`Crowns (expert uses) left this round: ${crownsRemaining} of ${crownsThisRound}`}
            >
              <Crown aria-hidden="true" className="crownChipIcon" size={14} />
              <b>
                {crownsRemaining} / {crownsThisRound}
              </b>
              <small>crowns</small>
            </span>
          ) : null}
        </div>
      ) : null}
      {(() => {
        const mode = state.adventure?.victoryMode ?? "conquest";
        let status = "flag an enemy town";
        if (mode === "grail") {
          const grail = state.adventure?.grail;
          if (grail?.status === "carried" && grail.carrierHeroId) {
            status = `Grail carried by ${state.players[state.heroes[grail.carrierHeroId]?.controllerId ?? ""]?.name ?? "a hero"}`;
          } else {
            const viewerId = viewerPlayerId;
            const visited = grail?.obelisksVisited?.[viewerId]?.length ?? 0;
            status =
              visited >= 2
                ? "dig the Grail / beat all heroes"
                : `Obelisks ${visited}/2 · dig the Grail / beat all heroes`;
          }
        } else if (mode === "dragon-hunt") {
          status = "defeat the Dragon Utopia / beat all heroes";
        } else if (mode === "dragon-conqueror") {
          const holder = Object.values(state.adventure?.fields ?? {}).find(
            (field) => field.location === "dragon_utopia" && field.flagOwnerId
          )?.flagOwnerId;
          status = holder ? `Utopia held by ${state.players[holder]?.name ?? "a rival"}` : "capture the Dragon Utopia";
        }
        return (
          <div className="advHudCell">
            <strong>{VICTORY_MODE_LABELS[mode]}</strong>
            <small>{status}</small>
          </div>
        );
      })()}
      {winner ? (
        <div className="advHudCell winner">
          <strong>{state.players[winner]?.name} wins!</strong>
        </div>
      ) : null}
      <div className="advHudButtons">
        {/* OPTIONAL Undo mode (debug/testing): the button shows only when the
            lobby turned the option on (frozen onto adventure.undoMoves). The
            server-side undo history depth is never in state (guardrail: no
            broadcast bloat / hidden-info leak), so the button is offered whenever
            the mode is on; if there is nothing to undo the server replies with a
            harmless "nothing to undo" rejection. */}
        {state.adventure?.undoMoves ? (
          <button
            className="commandButton undoMove"
            onClick={() => onAction({ type: "UNDO_MOVE", playerId: viewerPlayerId })}
            title="Testing aid: roll the game back to before your most recent action. Every undo is announced in the feed."
            type="button"
          >
            ↩ Undo
          </button>
        ) : null}
        {eventLogControl}
        {endTurn ? (
          <button className="commandButton" onClick={() => onAction(endTurn.action)} type="button">
            End turn
          </button>
        ) : null}
        {giveUp ? (
          confirmGiveUp ? (
            <>
              <button
                className="commandButton"
                onClick={() => {
                  setConfirmGiveUp(false);
                  onAction(giveUp.action);
                }}
                type="button"
              >
                Confirm: become observer
              </button>
              <button className="commandButton" onClick={() => setConfirmGiveUp(false)} type="button">
                Cancel
              </button>
            </>
          ) : (
            <button className="commandButton" onClick={() => setConfirmGiveUp(true)} type="button">
              Give up
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Town + hero dock: the two big, obviously-clickable boards sitting just above
// the map. Replaces the cramped town button / hero chip that used to hide in
// the status bar — these are the primary way into the town window and the
// printed hero board.
// ---------------------------------------------------------------------------

/** The painted town portrait (thelazy.net), with a plaque fallback (Bulwark). */
function TownIcon({ factionId, size }: { factionId: string; size: number }) {
  const [failed, setFailed] = useState(false);
  // ONE convention for every faction (anime towns included): the small capitol
  // sprite at town-icon-<faction>.webp — never the wide town panorama, which
  // reads as noise squeezed into a dock-sized square.
  const image = townIconUrl(factionId);
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className="dockTownIconFallback"
        style={{ width: size, height: size, color: playerFactionColor(factionId) }}
      >
        <Castle size={Math.round(size * 0.55)} />
      </span>
    );
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className="dockTownIcon"
      draggable={false}
      onError={() => setFailed(true)}
      src={assetUrl(image)}
      style={{ width: size, height: size }}
    />
  );
}

function CommanderForgePanel({
  state,
  playerId,
  legalActions,
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions: LegalAction[];
  onAction?: (action: GameAction) => void;
}) {
  const commander = state.players[playerId]?.commander;
  if (!commander || !(state.wog?.enabled && state.wog?.commanders)) return null;
  const offers = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "FORGE_COMMANDER_ARTIFACT" }> } =>
      legal.action.type === "FORGE_COMMANDER_ARTIFACT"
  );
  const tiers = ["minor", "major", "relic"] as const;
  return (
    <section className="commanderForgePanel" aria-label="Commander Forge">
      <img alt="" aria-hidden="true" className="commanderForgeIcon" src={assetUrl("/assets/ui/commander-forge.webp")} />
      <div className="commanderForgeContent">
        <header><strong>Commander Forge</strong><small>Two offers · choose one</small></header>
        <p>Grade I: round 2, 5 gold. One Grade II or III purchase: round 7, 8 or 11 gold. Each budget is once per game; only empty slots are offered.</p>
        {tiers.map((tier) => {
          const tierOffers = offers.filter((offer) => offer.action.tier === tier);
          const used = tier === "minor" ? commander.forgeMinorUsed : commander.forgeHighUsed;
          const unlockRound = tier === "minor" ? 2 : 7;
          const cost = tier === "minor" ? 5 : tier === "major" ? 8 : 11;
          return (
            <div className="commanderForgeTier" key={tier}>
              <span><EquipGradeChip grade={tierToGrade(tier)} /> {cost} gold</span>
              {used ? <small>Use spent</small> : state.round < unlockRound ? <small>Unlocks round {unlockRound}</small> : null}
              {tierOffers.map((offer) => {
                const spec = COMMANDER_ARTIFACT_SPECS[offer.action.cardId];
                return (
                  <button key={offer.action.cardId} onClick={() => onAction?.(offer.action)} type="button">
                    {spec ? <img alt="" src={assetUrl(`/assets/wog/artifacts/icons/${spec.slug}.webp`)} /> : null}
                    <span><strong>{spec?.name ?? offer.action.cardId}</strong><small>{spec?.effectText}</small></span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function playerFactionColor(factionId: string | undefined): string {
  return (factionId && coreFactionDefinitions[factionId]?.color) || "#b08d2f";
}

export function TownHeroDock({
  state,
  viewerPlayerId,
  heroSeatIds,
  onOpenTown,
  armySeatId,
  onAction,
  legalActions = []
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  /** Seats whose hero board this dock exposes (own seat, or all for observers). */
  heroSeatIds?: PlayerId[];
  /** Opens the Town window popup (omitted when the viewer has no town). */
  onOpenTown?: () => void;
  /** Seat whose Unit deck this dock exposes as its own big tile (seated viewer). */
  armySeatId?: PlayerId;
  /** Seated viewer's dispatcher (commander grade-up / revive live on the dock). */
  onAction?: (action: GameAction) => void;
  /** Engine-validated actions used by Unit XP and commander equipment controls. */
  legalActions?: LegalAction[];
}) {
  const [openHeroSeat, setOpenHeroSeat] = useState<PlayerId | null>(null);
  const [armyOpen, setArmyOpen] = useState(false);
  const [commanderOpen, setCommanderOpen] = useState(false);
  const [commanderEquipmentOpen, setCommanderEquipmentOpen] = useState(false);
  const [commanderEquipHelpOpen, setCommanderEquipHelpOpen] = useState(false);
  const [draggedCommanderArtifactId, setDraggedCommanderArtifactId] = useState<string | null>(null);
  const player = state.players[viewerPlayerId];
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;

  const heroSeats = (heroSeatIds ?? [viewerPlayerId]).filter((seatId) => {
    const seat = state.players[seatId];
    return seat && seat.id !== "neutrals" && seat.heroDefId;
  });

  const armyPlayer = armySeatId ? state.players[armySeatId] : undefined;
  const army = armyPlayer?.army ?? [];
  const lexicon = factionUiLexicon(armyPlayer?.factionId ?? player?.factionId);

  // WOG Commanders: the seated viewer's commander tile (module on = the state
  // exists). Everything on it is live: grades, level, death, owed grade-ups.
  const commander = armyPlayer?.commander;
  const commanderDef = commander ? commanderDefinitions[commander.slug as CommanderSlug] : undefined;
  const commanderHero = armyPlayer
    ? Object.values(state.heroes).find(
        (candidate) => candidate.controllerId === armyPlayer.id && candidate.kind === "main"
      )
    : undefined;
  const commanderGradeUps = commander?.gradePoints ?? 0;
  const commanderArtifactsEnabled = Boolean(state.wog?.enabled && state.wog?.artifacts && state.wog?.commanders);
  const heldCommanderArtifacts = armyPlayer
    ? armyPlayer.hand
        .filter((cardId) => Boolean(COMMANDER_ARTIFACT_SPECS[cardId]))
        .sort((a, b) => {
          const aa = COMMANDER_ARTIFACT_SPECS[a];
          const bb = COMMANDER_ARTIFACT_SPECS[b];
          return aa.slot.localeCompare(bb.slot) || aa.tier.localeCompare(bb.tier) || aa.name.localeCompare(bb.name);
        })
    : [];

  // Commander level-up notice: when NEW stat points arrive, blink the commander
  // tile hard for a few seconds (the steady gold pulse then stays until every
  // point is spent) AND pop the level-up modal so the owner can spend right away.
  const [commanderBlink, setCommanderBlink] = useState(false);
  // "Not dismissed by the owner" flag for the level-up popup. The popup only
  // RENDERS while there are unspent points on the owner's own map turn (see the
  // render gate), so it auto-hides the moment the last point is spent or combat
  // starts — no separate close effect needed.
  const [commanderLevelUpOpen, setCommanderLevelUpOpen] = useState(true);
  const prevGradeUpsRef = useRef(commanderGradeUps);
  useEffect(() => {
    const previous = prevGradeUpsRef.current;
    prevGradeUpsRef.current = commanderGradeUps;
    if (commanderGradeUps > previous) {
      setCommanderBlink(true);
      // Re-arm the popup so a fresh level-up pops even if a prior one was dismissed.
      setCommanderLevelUpOpen(true);
      const timer = window.setTimeout(() => setCommanderBlink(false), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [commanderGradeUps]);

  if (!onOpenTown && heroSeats.length === 0 && !armyPlayer) {
    return null;
  }

  const tokens = player?.townTokens;

  return (
    <div className={`townHeroDock theme-${lexicon.register}`} aria-label="Town and hero">
      {onOpenTown && faction ? (
        <button
          aria-label={`Open your ${faction.name} town`}
          className="dockTile townDockTile"
          onClick={onOpenTown}
          style={{ "--dock-faction": faction.color } as CSSProperties}
          title="Open your town — build structures, recruit units and buy spells"
          type="button"
        >
          <TownIcon factionId={faction.id} size={64} />
          <span className="dockTileText">
            <strong>{faction.name} town</strong>
            <small>Build · Recruit · Spells</small>
            {tokens ? (
              // The authentic printed token icons; a spent one dims out.
              <span className="dockTokens" aria-hidden="true">
                <img alt="" className={tokens.build ? "on" : "off"} src={assetUrl(TOWN_TOKEN_ICONS.build)} title="Build token" />
                <img
                  alt=""
                  className={tokens.population ? "on" : "off"}
                  src={assetUrl(TOWN_TOKEN_ICONS.population)}
                  title="Population token"
                />
                <img
                  alt=""
                  className={tokens.spellBook ? "on" : "off"}
                  src={assetUrl(TOWN_TOKEN_ICONS.spellBook)}
                  title="Spell Book token"
                />
              </span>
            ) : null}
          </span>
          <span aria-hidden="true" className="dockOpenHint">
            Open ▸
          </span>
        </button>
      ) : null}

      {heroSeats.map((seatId) => {
        const seat = state.players[seatId];
        const seatHero = Object.values(state.heroes).find(
          (candidate) => candidate.controllerId === seatId && candidate.kind === "main"
        );
        const heroDef = seat?.heroDefId ? coreHeroDefinitions[seat.heroDefId] : undefined;
        if (!seat || !heroDef) {
          return null;
        }
        const open = openHeroSeat === seatId;
        return (
          <button
            aria-expanded={open}
            aria-label={`Open ${heroDef.name}'s hero board`}
            className={`dockTile heroDockTile ${open ? "open" : ""}`}
            key={seatId}
            onClick={() => setOpenHeroSeat(open ? null : seatId)}
            style={{ "--dock-faction": playerFactionColor(seat.factionId) } as CSSProperties}
            title={`${heroDef.name} — open the hero board`}
            type="button"
          >
            <HeroPortrait name={heroDef.name} portrait={heroDef.portrait} size={64} />
            <span className="dockTileText">
              <strong>{heroDef.name}</strong>
              <small>
                {heroSeats.length > 1 ? `${seat.name} · ` : ""}level {seatHero?.level ?? 1}
              </small>
              <small className="dockSubtle">Hero board</small>
            </span>
            <span aria-hidden="true" className="dockOpenHint">
              {open ? "Close ▾" : "Open ▸"}
            </span>
          </button>
        );
      })}

      {armyPlayer ? (
        <button
          aria-expanded={armyOpen}
          aria-label="Open your unit deck"
          className={`dockTile unitDockTile ${armyOpen ? "open" : ""}`}
          onClick={() => setArmyOpen((value) => !value)}
          style={{ "--dock-faction": playerFactionColor(armyPlayer.factionId) } as CSSProperties}
          title="Your unit deck — the army your hero carries into battle"
          type="button"
        >
          <span aria-hidden="true" className="dockUnitStack">
            {army.slice(0, 3).map((unit, index) => {
              const def = coreUnitDefinitions[unit.unitDefId];
              const side =
                unit.side === "bank"
                  ? CREATURE_BANK_UNIT_SIDES[unit.unitDefId]
                  : armyUnitPrintedSide(def, unit.side, unit.unitDefId);
              return side?.cardImage ? (
                <img alt="" className="dockUnitThumb" decoding="async" key={unit.id} loading="lazy" src={assetUrl(side.cardImage)} style={{ zIndex: 3 - index }} />
              ) : (
                <span className={`dockUnitThumb fallback tier-${def?.tier ?? "bronze"}`} key={unit.id} style={{ zIndex: 3 - index }} />
              );
            })}
            {army.length === 0 ? (
              <span className="dockUnitThumb fallback">
                <Layers size={22} />
              </span>
            ) : null}
          </span>
          <span className="dockTileText">
            <strong>Unit deck</strong>
            <small>
              {army.length} unit{army.length === 1 ? "" : "s"}
            </small>
            <small className="dockSubtle">Army cards</small>
          </span>
          <span aria-hidden="true" className="dockOpenHint">
            {armyOpen ? "Close ▾" : "Open ▸"}
          </span>
        </button>
      ) : null}

      {commander && commanderDef && armyPlayer ? (
        <button
          aria-expanded={commanderOpen}
          aria-label={`Open your commander, ${commanderDef.name}`}
          className={`dockTile unitDockTile ${commanderOpen ? "open" : ""}${
            commanderGradeUps > 0 && !commander.dead ? " commanderTilePulse" : ""
          }${commanderBlink ? " commanderTileBlink" : ""}`}
          onClick={() => setCommanderOpen((value) => !value)}
          style={{ "--dock-faction": playerFactionColor(armyPlayer.factionId) } as CSSProperties}
          title={`${commanderDef.name} — your WOG commander`}
          type="button"
        >
          <span aria-hidden="true" className="dockUnitStack">
            <img
              alt=""
              className="dockUnitThumb"
              src={assetUrl(commanderDef.cardImage)}
              style={commander.dead ? { filter: "grayscale(0.9) brightness(0.6)" } : undefined}
            />
          </span>
          <span className="dockTileText">
            <strong>{commanderDef.name}</strong>
            <small>
              {commander.dead
                ? `Fallen — revive ${commanderReviveCost(commanderHero?.level ?? 1)} gold`
                : `Commander · Lv ${commanderHero?.level ?? 1}`}
            </small>
            <small className="dockSubtle" style={commanderGradeUps > 0 ? { color: "#f4d774", fontWeight: 700 } : undefined}>
              {commanderGradeUps > 0 ? `Grade up available (x${commanderGradeUps})!` : commanderDef.specialty.name}
            </small>
          </span>
          <span aria-hidden="true" className="dockOpenHint">
            {commanderOpen ? "Close ▾" : "Open ▸"}
          </span>
        </button>
      ) : null}

      {openHeroSeat ? (
        <>
          <div aria-hidden="true" className="heroDropBackdrop" onClick={() => setOpenHeroSeat(null)} />
          <div className="heroDrop" role="dialog" aria-label="Hero board">
            <button
              aria-label="Close the hero board"
              className="heroDropClose"
              onClick={() => setOpenHeroSeat(null)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
            <HeroBoard
              playerId={openHeroSeat}
              state={state}
              legalActions={openHeroSeat === viewerPlayerId ? legalActions : undefined}
              onAction={onAction && openHeroSeat === viewerPlayerId ? onAction : undefined}
            />
          </div>
        </>
      ) : null}

      {commanderLevelUpOpen && commander && commanderDef && armyPlayer && onAction && !state.combat && !commander.dead && commanderGradeUps > 0 ? (
        <CommanderLevelUpOverlay
          slug={commander.slug as CommanderSlug}
          grades={commander.grades}
          level={commanderHero?.level ?? 1}
          gradePoints={commanderGradeUps}
          onGradeUp={(stat) => onAction({ type: "COMMANDER_GRADE_UP", playerId: armyPlayer.id, stat })}
          onClose={() => setCommanderLevelUpOpen(false)}
        />
      ) : null}

      {commanderOpen && commander && commanderDef && armyPlayer ? (
        <>
          <div aria-hidden="true" className="heroDropBackdrop" onClick={() => setCommanderOpen(false)} />
          <div className="heroDrop unitDrop" role="dialog" aria-label="Commander">
            <button
              aria-label="Close the commander card"
              className="heroDropClose"
              onClick={() => setCommanderOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
            {commanderArtifactsEnabled ? (
              <button
                className={`commanderEquipButton${heldCommanderArtifacts.length > 0 ? " attention" : ""}`}
                onClick={() => {
                  setCommanderOpen(false);
                  setCommanderEquipmentOpen(true);
                }}
                type="button"
              >
                <span aria-hidden="true" className="commanderEquipButtonIcon">
                  <img alt="" src={assetUrl("/assets/ui/commander-forge.webp")} />
                </span>
                <span>
                  <small className="commanderEquipEyebrow">Equipment &amp; Forge</small>
                  <strong>Open {lexicon.commanderEquipment}</strong>
                  <small>{Object.keys(commander.artifacts ?? {}).length}/3 equipped · {heldCommanderArtifacts.length} ready to bind</small>
                </span>
                <ChevronDown aria-hidden="true" className="commanderEquipArrow" size={21} />
              </button>
            ) : null}
            <div style={{ maxHeight: "min(78vh, 900px)", overflowY: "auto", padding: 4 }}>
              <CommanderCard
                slug={commander.slug as CommanderSlug}
                grades={commander.grades}
                level={commanderHero?.level ?? 1}
                dead={Boolean(commander.dead)}
                gradePoints={commanderGradeUps}
                goldAvailable={armyPlayer.resources.gold}
                onGradeUp={
                  onAction && !state.combat
                    ? (stat) => onAction({ type: "COMMANDER_GRADE_UP", playerId: armyPlayer.id, stat })
                    : undefined
                }
                onRevive={
                  onAction && !state.combat && commander.dead
                    ? () => onAction({ type: "REVIVE_COMMANDER", playerId: armyPlayer.id })
                    : undefined
                }
                stance={commander.stance}
                onSetStance={
                  onAction && !state.combat
                    ? (stance) => onAction({ type: "COMMANDER_SET_STANCE", playerId: armyPlayer.id, stance })
                    : undefined
                }
                bondedArmyUnitId={commander.bondedArmyUnitId}
                bondOptions={armyPlayer.army.map((unit) => ({
                  id: unit.id,
                  label: coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId
                }))}
                onSetBond={
                  onAction && !state.combat && commander.slug === "sonya"
                    ? (armyUnitId) => onAction({ type: "COMMANDER_SET_BOND", playerId: armyPlayer.id, armyUnitId })
                    : undefined
                }
                artifacts={commander.artifacts}
                showArtifactSlots={commanderArtifactsEnabled}
              />
            </div>
          </div>
        </>
      ) : null}

      {commanderEquipmentOpen && commander && commanderDef && armyPlayer && commanderArtifactsEnabled ? (
        <div className={`commanderEquipmentBackdrop theme-${lexicon.register}`} onMouseDown={() => setCommanderEquipmentOpen(false)}>
          <section
            aria-label={lexicon.commanderEquipment}
            aria-modal="true"
            className="commanderEquipmentWindow"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <small>{commanderDef.name} · permanently bound equipment</small>
                <h2>{lexicon.commanderEquipment}</h2>
              </div>
              <div className="heroSystemHeaderActions">
                <button
                  aria-expanded={commanderEquipHelpOpen}
                  aria-label="How commander equipment works"
                  className={`gradeHelpButton${commanderEquipHelpOpen ? " active" : ""}`}
                  onClick={() => setCommanderEquipHelpOpen((open) => !open)}
                  title="Commander equipment rules"
                  type="button"
                >
                  <HelpCircle size={21} />
                </button>
                <button aria-label="Close commander equipment" onClick={() => setCommanderEquipmentOpen(false)} type="button"><X size={20} /></button>
              </div>
            </header>
            {commanderEquipHelpOpen ? (
              <aside className="gradeHelpPanel" role="note">
                <div><b>1</b><span><strong>Win artifacts</strong><small>Earn them at the Commander Forge, from the shared decks, and as raid-boss and dungeon rewards.</small></span></div>
                <div><b>2</b><span><strong>Bind a slot</strong><small>Drag an artifact in hand onto weapon / armor / trinket, or press Bind. One artifact per slot.</small></span></div>
                <div><b>3</b><span><strong>Permanent</strong><small>Binding cannot be undone or swapped, and it survives the commander falling and being revived.</small></span></div>
                <p><Sparkles size={14} /> The full catalog stays visible for planning; only artifacts in hand can be bound.</p>
              </aside>
            ) : null}
            <div className="commanderEquipmentBody">
              <div className="commanderPaperdoll" aria-label="Commander paperdoll slots">
                {/* Classic: body + card bust. Anime/wuxia: themed body only (no card face). */}
                <img
                  alt=""
                  aria-hidden="true"
                  className="commanderPaperdollBody"
                  src={assetUrl(
                    lexicon.register === "anime"
                      ? "/assets/ui/commander-paperdoll-body-anime.webp"
                      : lexicon.register === "wuxia"
                        ? "/assets/ui/commander-paperdoll-body-wuxia.webp"
                        : "/assets/ui/commander-paperdoll-body.webp"
                  )}
                />
                {lexicon.register === "classic" ? (
                  <div className="commanderPaperdollBust">
                    <img alt="" className="commanderPaperdollPortrait" src={assetUrl(commanderDef.cardImage)} />
                  </div>
                ) : null}
                {(["weapon", "armor", "trinket"] as const).map((slot) => {
                  const cardId = commander.artifacts?.[slot];
                  const spec = cardId ? COMMANDER_ARTIFACT_SPECS[cardId] : undefined;
                  const draggedSpec = draggedCommanderArtifactId
                    ? COMMANDER_ARTIFACT_SPECS[draggedCommanderArtifactId]
                    : undefined;
                  const dropAction = draggedCommanderArtifactId
                    ? legalActions.find(
                        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === draggedCommanderArtifactId
                      )
                    : undefined;
                  const acceptsDrop = Boolean(!spec && draggedSpec?.slot === slot && dropAction && onAction);
                  return (
                    <div
                      aria-label={`${slot} commander artifact slot${spec ? `: ${spec.name}` : ": empty"}`}
                      className={`commanderArtifactSlot slot-${slot} ${spec ? "filled" : "empty"}${acceptsDrop ? " dropReady" : ""}`}
                      key={slot}
                      onDragOver={(event) => {
                        if (acceptsDrop) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!acceptsDrop || !dropAction || !onAction) return;
                        onAction(dropAction.action);
                        setDraggedCommanderArtifactId(null);
                      }}
                    >
                      <div className="commanderArtifactSlotWell">
                        {spec ? (
                          <img alt="" src={assetUrl(`/assets/wog/artifacts/icons/${spec.slug}.webp`)} />
                        ) : (
                          <Shield aria-hidden="true" size={28} />
                        )}
                      </div>
                      <div className="commanderArtifactSlotMeta">
                        <small>
                          {slot}
                          {spec ? <EquipGradeChip grade={tierToGrade(spec.tier)} title={`${spec.tier} · Grade ${tierToGrade(spec.tier)}`} /> : null}
                        </small>
                        <strong>{spec?.name ?? "Empty"}</strong>
                        <span>{spec?.effectText ?? "Drag a matching artifact from the bag"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <aside className="commanderArtifactInventory">
                <div className="commanderInventoryHead">
                  <h3>Artifact bag &amp; complete system</h3>
                  <small>
                    All {COMMANDER_ARTIFACT_SPEC_LIST.length} items shown · {heldCommanderArtifacts.length} in hand ·{" "}
                    {Object.keys(commander.artifacts ?? {}).length}/3 bound
                  </small>
                </div>
                <CommanderForgePanel legalActions={legalActions} onAction={onAction} playerId={armyPlayer.id} state={state} />
                {heldCommanderArtifacts.length === 0 ? (
                  <p className="commanderInventoryEmpty">
                    No commander artifacts in hand. The full catalog remains visible below for inspection.
                  </p>
                ) : null}
                {COMMANDER_ARTIFACT_SPEC_LIST
                  .slice()
                  .sort((a, b) => a.slot.localeCompare(b.slot) || a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name))
                  .map((spec) => {
                    const cardId = spec.cardId;
                    const held = heldCommanderArtifacts.includes(cardId);
                    const bound = Object.values(commander.artifacts ?? {}).includes(cardId);
                    const action = legalActions.find(
                      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
                    );
                    const occupied = Boolean(commander.artifacts?.[spec.slot]);
                    return (
                      <article
                        aria-label={`${spec.name}: ${bound ? "bound" : held ? "in hand" : "not owned"}`}
                        className={`commanderInventoryCard ${occupied && !bound ? "blocked" : ""} ${bound ? "equipped" : held ? "owned" : "unowned"}`}
                        draggable={Boolean(held && action && !occupied && onAction)}
                        key={cardId}
                        onDragEnd={() => setDraggedCommanderArtifactId(null)}
                        onDragStart={(event) => {
                          if (!held || !action || occupied || !onAction) return;
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", cardId);
                          setDraggedCommanderArtifactId(cardId);
                        }}
                      >
                        {cardLibrary[cardId]?.assets?.cardImage ? (
                          <img alt={`${spec.name} card`} src={assetUrl(cardLibrary[cardId].assets!.cardImage!)} />
                        ) : (
                          <img alt="" src={assetUrl(`/assets/wog/artifacts/icons/${spec.slug}.webp`)} />
                        )}
                        <div>
                          <span className="commanderArtifactMeta">
                            <EquipGradeChip grade={tierToGrade(spec.tier)} title={`${spec.tier} · Grade ${tierToGrade(spec.tier)}`} />
                            {spec.slot} · {spec.tier}
                          </span>
                          <strong>{spec.name}</strong>
                          <p>{spec.effectText}</p>
                          <button
                            disabled={!held || !action || occupied || !onAction}
                            onClick={() => action && onAction?.(action.action)}
                            type="button"
                          >
                            {bound
                              ? "Bound"
                              : occupied
                                ? `${spec.slot} already filled`
                                : held && action
                                  ? "Bind permanently"
                                  : held
                                    ? "Unavailable now"
                                    : "Not owned"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </aside>
            </div>
            <footer>Binding is permanent. The artifact remains equipped if the commander falls and is revived.</footer>
          </section>
        </div>
      ) : null}

      {armyOpen && armyPlayer ? (
        <>
          <div aria-hidden="true" className="heroDropBackdrop" onClick={() => setArmyOpen(false)} />
          <div className="heroDrop unitDrop" role="dialog" aria-label="Unit deck">
            <button
              aria-label="Close the unit deck"
              className="heroDropClose"
              onClick={() => setArmyOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
            <ArmyPanel legalActions={legalActions} onAction={onAction} playerId={armyPlayer.id} state={state} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function MoraleCardsDock({ state, viewerPlayerId }: { state: GameState; viewerPlayerId: PlayerId }) {
  const { zoomContent } = useCardZoom();
  const player = state.players[viewerPlayerId];
  if (!state.adventure?.moraleCards || !player) {
    return null;
  }

  const held = player.moraleCards ?? { positive: [], negative: [] };
  const positiveDeck = state.decks[MORALE_POSITIVE_DECK_ID];
  const negativeDeck = state.decks[MORALE_NEGATIVE_DECK_ID];
  // Every player's held Morale cards are public (face-up beside the hero) —
  // list the other seats' cards under the viewer's own.
  const others = Object.values(state.players)
    .filter((candidate) => candidate.id !== viewerPlayerId && !candidate.eliminated)
    .map((candidate) => ({
      playerId: candidate.id,
      name: candidate.name,
      cards: [...(candidate.moraleCards?.positive ?? []), ...(candidate.moraleCards?.negative ?? [])]
    }))
    .filter((entry) => entry.cards.length > 0);

  const showCard = (cardId: string) => {
    const card = cardLibrary[cardId];
    zoomContent({
      title: card?.name ?? cardId,
      image: card?.assets?.cardImage,
      subtitle: cardId.includes(".positive.") ? "Positive Morale" : "Negative Morale",
      lines: [moraleCardRulesText(cardId), MORALE_CARD_HINTS[cardId] ?? ""].filter(Boolean)
    });
  };

  const deckTile = (deckId: string, label: string, count: number, discardCount: number) => {
    const back = getDeckBack(deckId);
    return (
      <div className="moraleDeckTile" title={`${label}: ${count} in deck, ${discardCount} discarded`}>
        {back.image ? <img alt="" aria-hidden="true" decoding="async" loading="lazy" src={assetUrl(back.image)} /> : null}
        <span>
          <strong>{count}</strong>
          <small>{label}</small>
        </span>
      </div>
    );
  };

  const heldCards = (cardIds: string[], polarity: "positive" | "negative") => {
    const visible = cardIds.slice(0, polarity === "positive" ? 3 : 6);
    const extra = Math.max(0, cardIds.length - visible.length);
    return (
      <div className={`moraleHeldCards ${polarity}`}>
        {visible.map((cardId, index) => {
          const card = cardLibrary[cardId];
          const hint = MORALE_CARD_HINTS[cardId];
          return (
            <button
              aria-label={`Inspect ${card?.name ?? cardId}`}
              className="moraleHeldCard"
              key={`${cardId}-${index}`}
              onClick={() => showCard(cardId)}
              title={hint ? `${card?.name ?? cardId} — ${hint}` : card?.name ?? cardId}
              type="button"
            >
              {card?.assets?.cardImage ? <img alt="" decoding="async" loading="lazy" src={assetUrl(card.assets.cardImage)} /> : <span>{polarity[0].toUpperCase()}</span>}
            </button>
          );
        })}
        {extra > 0 ? <span className="moraleExtraCount">+{extra}</span> : null}
        {cardIds.length === 0 ? <span className="moraleEmpty">None</span> : null}
      </div>
    );
  };

  return (
    <section className="moraleCardsDock" aria-label="Morale cards">
      <header>
        <Sparkles aria-hidden="true" size={14} />
        <strong>Morale Cards</strong>
      </header>
      <div className="moraleDeckGrid">
        {deckTile(MORALE_POSITIVE_DECK_ID, "Positive", positiveDeck?.drawPile.length ?? 0, positiveDeck?.discardPile.length ?? 0)}
        {deckTile(MORALE_NEGATIVE_DECK_ID, "Negative", negativeDeck?.drawPile.length ?? 0, negativeDeck?.discardPile.length ?? 0)}
      </div>
      <div className="moraleHeldGroup">
        <span>Positive</span>
        {heldCards(held.positive, "positive")}
      </div>
      <div className="moraleHeldGroup">
        <span>Negative</span>
        {heldCards(held.negative, "negative")}
      </div>
      {others.map((entry) => (
        <div className="moraleOthersRow" key={entry.playerId}>
          <span title={`${entry.name}'s held Morale cards (public)`}>{entry.name}</span>
          {entry.cards.slice(0, 5).map((cardId, index) => {
            const card = cardLibrary[cardId];
            const negative = cardId.includes(".negative.");
            return (
              <button
                aria-label={`Inspect ${entry.name}'s ${card?.name ?? cardId}`}
                className={`moraleHeldCard${negative ? " othersNegative" : ""}`}
                key={`${cardId}-${index}`}
                onClick={() => showCard(cardId)}
                title={card?.name ?? cardId}
                type="button"
              >
                {card?.assets?.cardImage ? <img alt="" decoding="async" loading="lazy" src={assetUrl(card.assets.cardImage)} /> : <span>{negative ? "N" : "P"}</span>}
              </button>
            );
          })}
          {entry.cards.length > 5 ? <span className="moraleExtraCount">+{entry.cards.length - 5}</span> : null}
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Army list (the hero board itself lives in src/components/hero-board.tsx)
// ---------------------------------------------------------------------------

/**
 * The engine's view of a unit side's abilities: the named skills actually
 * wired into combat, with their rules text. Shown alongside the printed card
 * text so a player can always read what the implementation does (e.g. that
 * Few Medusas carry only "Paralyzing Gaze", not the "No Range Penalty").
 */
function implementedAbilityLines(abilityIds: readonly string[] | undefined): string[] {
  return (abilityIds ?? [])
    .map((id) => unitAbilities[id])
    .filter((ability) => Boolean(ability) && ability.implementationStatus === "implemented")
    .map((ability) => `✦ ${ability.name}: ${ability.text}`);
}

/** Short army-card label for a rulebook Stack Token (+1 stat, +2 initiative). */
const ARMY_STACK_TOKEN_LABELS = {
  attack: "+1 ATK",
  defense: "+1 DEF",
  health: "+1 HP",
  initiative: "+2 INI"
} as const;

export function ArmyPanel({
  state,
  playerId,
  legalActions = [],
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions?: LegalAction[];
  onAction?: (action: GameAction) => void;
}) {
  const { zoomContent } = useCardZoom();
  const [xpBoardOpen, setXpBoardOpen] = useState(false);
  const [xpBoardUnitId, setXpBoardUnitId] = useState<string | null>(null);
  const player = state.players[playerId];
  const lexicon = factionUiLexicon(player?.factionId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  // The Unit deck panel shows the player's WHOLE faction roster — owned or not —
  // with printed recruit (Few) / reinforce (Pack) costs, so it reads like a full
  // deck reference (user request "show all units even not available … show cost
  // to recruit or reinforce too"). Recruited Neutrals sit OUTSIDE faction.units
  // and are appended after the roster as their own owned rows (unchanged).
  const roster = faction?.units ?? [];
  if (!player || (roster.length === 0 && player.army.length === 0)) {
    return (
      <section className={`armyPanel theme-${lexicon.register}`}>
        <h3>{lexicon.army}</h3>
        <small>No units. The scenario&apos;s starting units return after the next combat.</small>
      </section>
    );
  }

  const ruleset = getRuleset(state);
  const experienceActive = unitExperienceActive(state);
  // Honour the individual Griffin/Marksman toggles so the roster shows the same
  // live stats the engine will fight with (not just the bundled mode default).
  const sideOverrides = unitSideRuleOverrides(state);

  // Ordered render list: each faction unit in printed order (owned card if the
  // player has it, else an unowned "not recruited" placeholder), then any army
  // cards NOT in the faction roster (recruited Neutrals) as owned rows.
  const renderedArmyIds = new Set<string>();
  type OwnedUnit = (typeof player.army)[number];
  const rosterEntries: (
    | { kind: "owned"; unit: OwnedUnit }
    | { kind: "unowned"; unitDefId: string }
  )[] = [];
  for (const unitDefId of roster) {
    const owned = player.army.find((candidate) => candidate.unitDefId === unitDefId && !renderedArmyIds.has(candidate.id));
    // Once both MGQ Gold Contracts are recorded, the other Gold identities
    // leave this game's roster rather than looking recruitable. The contract
    // panel names the two locks and explains the hidden count.
    if (!owned && mgqGoldUnavailable(player, unitDefId)) {
      continue;
    }
    if (owned) {
      renderedArmyIds.add(owned.id);
      rosterEntries.push({ kind: "owned", unit: owned });
    } else {
      rosterEntries.push({ kind: "unowned", unitDefId });
    }
  }
  for (const unit of player.army) {
    if (!renderedArmyIds.has(unit.id)) {
      rosterEntries.push({ kind: "owned", unit });
    }
  }

  return (
    <section className={`armyPanel theme-${lexicon.register}`} aria-label={lexicon.army}>
      <h3>{lexicon.army} ({player.army.length})</h3>
      {experienceActive && player.army.length > 0 ? (
        // The board itself is a POP-UP WINDOW (like the Hero Grade / Hero
        // Equipment windows): this button opens it with per-unit XP, the
        // rank-by-rank stat changes and the elite-ability rules text.
        <button
          aria-haspopup="dialog"
          className="armyExperienceBoard"
          onClick={() => {
            setXpBoardUnitId(null);
            setXpBoardOpen(true);
          }}
          type="button"
        >
          <span className="armyXpBoardTitle">
            <Crown aria-hidden="true" size={18} />
            <strong>{lexicon.experienceBoard}</strong>
          </span>
          <small>Click a unit below, or open the full picker</small>
        </button>
      ) : null}
      <MgqGoldContractPanel player={player} />
      <ul>
        {rosterEntries.map((entry) => {
          // Unowned roster unit: card faces + name + a "not recruited" note,
          // no zoom row / XP / controls (honest — nothing to act on here). The
          // printed Few/Pack costs still ride the cards so the player can see
          // what recruiting / reinforcing would cost.
          if (entry.kind === "unowned") {
            const rosterDef = coreUnitDefinitions[entry.unitDefId];
            const recruitAction = legalActions.find(
              (legal) =>
                legal.action.type === "POPULATION_ACTION" &&
                legal.action.purchases.some(
                  (purchase) => purchase.kind === "recruit" && purchase.unitDefId === entry.unitDefId
                )
            );
            return (
              <li className="armyRosterUnowned" key={`roster-${entry.unitDefId}`}>
                {rosterDef?.few || rosterDef?.pack ? (
                  <UnitSideCards
                    fewCost={rosterDef?.few?.cost}
                    ownedSide={null}
                    packCost={rosterDef?.pack?.cost}
                    unitDefId={entry.unitDefId}
                  />
                ) : null}
                <span className="armyRosterUnownedMeta">
                  <span className={`tierDot ${rosterDef?.tier}`} />
                  <strong>{rosterDef?.name ?? entry.unitDefId}</strong>
                  <small className="armyRosterState">not recruited</small>
                </span>
                {onAction && recruitAction ? (
                  <div className="armyUnitActions" aria-label={`${rosterDef?.name ?? entry.unitDefId} actions`}>
                    <button
                      aria-label={`Recruit Few ${rosterDef?.name ?? entry.unitDefId}`}
                      onClick={() => onAction(recruitAction.action)}
                      type="button"
                    >
                      <Plus size={13} /> Recruit Few
                    </button>
                  </div>
                ) : null}
              </li>
            );
          }
          const unit = entry.unit;
          const def = coreUnitDefinitions[unit.unitDefId];
          // Few/Pack printed sides, with a recruited Neutral card's own side
          // (it used to fall through to `pack`, hiding a Neutral's stats).
          const printed = armyUnitPrintedSide(def, unit.side, unit.unitDefId);
          // BINH stat tweaks (Griffins, Marksmen) show live values.
          const side = printed
            ? unit.side === "bank"
              ? printed
              : applyUnitSideRules(ruleset, unit.unitDefId, unit.side, printed, sideOverrides)
            : printed;
          const stackAttack =
            sideOverrides.polishUnitStacks &&
            (unit.side === "pack" || unit.side === "neutral") &&
            (unit.stacks ?? 0) > 0
              ? 1
              : 0;
          // Unit Experience (optional rule): show the same rank-folded stats
          // the engine fights with, plus a WoG-style caret/sword rank badge.
          const rankInfo = unitExperienceActive(state) ? armyUnitRankInfo(unit) : null;
          const rankBonus = rankInfo?.bonus ?? { attack: 0, defense: 0, health: 0, initiative: 0 };
          const tokenBonus = (stat: NonNullable<typeof unit.stackToken>) =>
            unit.stackToken === stat ? stackTokenDelta(stat) : 0;
          const shownAttack = side
            ? side.attack + (unit.permanentAttackBonus ?? 0) + stackAttack + rankBonus.attack + tokenBonus("attack")
            : 0;
          const shownDefense = side ? side.defense + rankBonus.defense + tokenBonus("defense") : 0;
          const shownHealth = side ? side.health + rankBonus.health + tokenBonus("health") : 0;
          const shownInitiative = side ? side.initiative + rankBonus.initiative + tokenBonus("initiative") : 0;
          const eliteAbility = rankInfo?.eliteActive && rankInfo.eliteAbilityId ? unitAbilities[rankInfo.eliteAbilityId] : null;
          const elitePreview = rankInfo?.eliteAbilityId ? unitAbilities[rankInfo.eliteAbilityId] : null;
          const thresholds = def ? UNIT_RANK_THRESHOLDS[def.tier] : null;
          const maxXp = thresholds?.[thresholds.length - 1] ?? 1;
          const xpPercent = rankInfo ? Math.min(100, (rankInfo.experience / maxXp) * 100) : 0;
          const drillAction = legalActions.find(
            (legal) => legal.action.type === "DRILL_UNIT" && legal.action.armyUnitId === unit.id
          );
          const populationActions = legalActions.filter(
            (legal) =>
              legal.action.type === "POPULATION_ACTION" &&
              legal.action.purchases.some((purchase) => purchase.armyUnitId === unit.id)
          );
          const bankedReinforceAction = legalActions.find(
            (legal) =>
              legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT" &&
              legal.action.armyUnitId === unit.id &&
              legal.action.kind === "reinforce"
          );
          const bankedStackAction = legalActions.find(
            (legal) =>
              legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT" &&
              legal.action.armyUnitId === unit.id &&
              legal.action.kind === "stack"
          );
          const reinforceAction = bankedReinforceAction ?? populationActions.find(
            (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases.some((purchase) => purchase.kind === "reinforce")
          );
          const stackAction = bankedStackAction ?? populationActions.find(
            (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases.some((purchase) => purchase.kind === "stack")
          );
          const activeRankAbilities = (rankInfo?.rankAbilityIds ?? [])
            .map((id) => unitAbilities[id]?.name)
            .filter(Boolean);
          const rankLine = rankInfo
            ? rankInfo.rank > 0
              ? `${rankInfo.rankName} (rank ${rankInfo.rank}) — ${rankInfo.experience} XP${
                  rankInfo.nextThreshold !== null ? `, next at ${rankInfo.nextThreshold}` : ", max"
                } · ${rankInfo.abilityBudget} ability path${
                  activeRankAbilities.length ? ` · ${activeRankAbilities.join(", ")}` : ""
                }`
              : rankInfo.experience > 0
                ? `${rankInfo.experience} XP — first rank at ${rankInfo.nextThreshold}`
                : ""
            : "";
          const engineLines = implementedAbilityLines(side?.abilities);
          const hoverTitle =
            [rankLine, side?.abilityText, ...engineLines].filter(Boolean).join("\n") || `Read ${def?.name ?? unit.unitDefId}`;
          return (
            <li key={unit.id}>
              {/* Full both-faces card display, identical to the town recruit
                  roster (user request: the Unit deck should show the same full
                  cards). The printed recruit (Few) / reinforce (Pack) costs ride
                  the cards too, so the deck doubles as a cost reference.
                  A recruited Neutral card has no Few/Pack faces, so it keeps the
                  single-face thumb in the row below instead. */}
              {unit.side !== "bank" && (def?.few || def?.pack) ? (
                <UnitSideCards
                  fewCost={def?.few?.cost}
                  ownedSide={unit.side}
                  packCost={def?.pack?.cost}
                  unitDefId={unit.unitDefId}
                />
              ) : null}
              <button
                className="armyUnitRow"
                onClick={() =>
                  zoomContent({
                    title: `${
                      unit.side === "bank"
                        ? "Creature Bank"
                        : unit.side === "few"
                          ? "Few"
                          : unit.side === "neutral"
                            ? "Neutral"
                            : "Pack of"
                    } ${def?.name ?? unit.unitDefId}`,
                    image: side?.cardImage,
                    subtitle: def ? `${def.tier} ${def.type}` : undefined,
                    lines: [
                      side ? `Attack ${shownAttack} · Defense ${shownDefense} · HP ${shownHealth} · Initiative ${shownInitiative}` : "",
                      rankLine,
                      (unit.stacks ?? 0) > 0
                        ? `${unit.stacks} Polish Unit Stack${unit.stacks === 1 ? "" : "s"}: +1 Attack and ${unit.stacks} extra Pack health layer${unit.stacks === 1 ? "" : "s"}.`
                        : "",
                      side?.abilityText ?? "",
                      ...engineLines
                    ].filter(Boolean)
                  })
                }
                title={hoverTitle}
                type="button"
              >
                {/* Neutral-only cards (no Few/Pack faces) keep their single-face
                    thumb here, since the both-faces display above is skipped. */}
                {unit.side === "bank" || (!def?.few && !def?.pack) ? (
                  side?.cardImage ? (
                    <img alt="" aria-hidden="true" className="armyUnitThumb" loading="lazy" src={assetUrl(side.cardImage)} />
                  ) : (
                    <span className={`armyUnitThumb fallback tier-${def?.tier ?? "bronze"}`} />
                  )
                ) : null}
                <span className={`tierDot ${def?.tier}`} />
                <strong>
                  {unit.side === "few"
                    ? "Few"
                    : unit.side === "neutral"
                      ? "Neutral"
                      : unit.side === "bank"
                        ? "Creature Bank"
                        : "Pack"}{" "}
                  {def?.name ?? unit.unitDefId}
                </strong>
                {rankInfo && rankInfo.rank > 0 ? (
                  <span className={`unitRankBadge rank-${rankInfo.rank}`} title={rankLine}>
                    {unitRankBadgeImage(rankInfo.rank) ? (
                      <img
                        alt=""
                        aria-hidden="true"
                        className="unitRankBadgeArt"
                        src={assetUrl(unitRankBadgeImage(rankInfo.rank)!)}
                      />
                    ) : rankInfo.rank >= 4 ? (
                      "★"
                    ) : rankInfo.rank >= 3 ? (
                      "⚔"
                    ) : (
                      "^".repeat(rankInfo.rank)
                    )}
                  </span>
                ) : null}
                {(unit.stacks ?? 0) > 0 ? (
                  <span
                    className={`armyStackBadge count-${Math.min(3, unit.stacks ?? 0)} active`}
                    title={`${unit.stacks} Unit Stack${unit.stacks === 1 ? "" : "s"} · +1 Attack · max ${polishArmyUnitStackCap(unit) || unit.stacks}`}
                  >
                    <img alt="" aria-hidden="true" src={assetUrl("/assets/ui/polish-unit-stacks-coin.webp")} />
                    ×{unit.stacks}
                  </span>
                ) : null}
                {unit.stackToken ? (
                  <span
                    className="armyStackTokenBadge"
                    title={`Stacked: a rulebook Stack Token (${ARMY_STACK_TOKEN_LABELS[unit.stackToken]}) rides this card. It absorbs one lethal blow in combat — the token is discarded (gone forever) instead of the unit being removed.`}
                  >
                    {ARMY_STACK_TOKEN_LABELS[unit.stackToken]}
                  </span>
                ) : null}
                {side ? (
                  <small>
                    A{shownAttack} D{shownDefense} HP{shownHealth} I{shownInitiative}
                  </small>
                ) : null}
              </button>
              <MgqJobControl
                legalActions={legalActions}
                onAction={onAction}
                playerId={playerId}
                state={state}
                unit={unit}
              />
              {rankInfo ? (
                <button
                  className="armyXpPanel"
                  aria-label={`Open ${def?.name ?? unit.unitDefId} experience board`}
                  onClick={() => {
                    setXpBoardUnitId(unit.id);
                    setXpBoardOpen(true);
                  }}
                  type="button"
                >
                  <div className="armyXpHead">
                    <span><img alt="" src={assetUrl("/assets/spell-icons/slayer.png")} /><strong>{rankInfo.rankName || "Recruit"}</strong></span>
                    <b>{rankInfo.experience} / {maxXp} XP</b>
                  </div>
                  <div className="armyXpTrack" aria-label={`${Math.round(xpPercent)} percent to Legend`}>
                    <span className="armyXpFill" style={{ width: `${xpPercent}%` }} />
                    {thresholds?.map((threshold, index) => (
                      <span className={`armyXpMilestone ${rankInfo.rank > index ? "reached" : ""}`} key={threshold} style={{ left: `${(threshold / maxXp) * 100}%` }}>
                        <i>{index + 1}</i><small>{threshold}</small>
                      </span>
                    ))}
                  </div>
                  <div className="armyXpDetails">
                    <span>Bonus: A+{rankBonus.attack} D+{rankBonus.defense} HP+{rankBonus.health} I+{rankBonus.initiative}</span>
                    {rankInfo.rankAbilityIds.length > 0 ? (
                      <span className="eliteAbilityCard active">
                        <Sparkles aria-hidden="true" size={12} />{" "}
                        {rankInfo.rankAbilityIds
                          .map((id) => unitAbilities[id]?.name)
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {elitePreview && !rankInfo.eliteActive ? (
                      <span className="eliteAbilityCard locked">
                        <Sparkles aria-hidden="true" size={12} /> Signature: {elitePreview.name} · unlocks at rank 3
                        <small>{elitePreview.text}</small>
                      </span>
                    ) : null}
                  </div>
                </button>
              ) : null}
              {onAction && (drillAction || reinforceAction || stackAction) ? (
                <div className="armyUnitActions" aria-label={`${def?.name ?? unit.unitDefId} actions`}>
                  {drillAction ? (
                    <DrillUnitButton
                      action={drillAction.action}
                      onAction={onAction}
                      playerId={playerId}
                      state={state}
                      unit={unit}
                      unitName={def?.name ?? unit.unitDefId}
                    />
                  ) : null}
                  {reinforceAction ? <button onClick={() => onAction(reinforceAction.action)} type="button"><ChevronsUp size={13} /> {bankedReinforceAction ? bankedReinforceAction.label : "Reinforce to Pack"}</button> : null}
                  {stackAction ? <button onClick={() => onAction(stackAction.action)} type="button"><Layers size={13} /> {bankedStackAction ? bankedStackAction.label : "Increase Stack"}</button> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {player.army.length === 0 ? (
        <small className="armyEmptyNote">
          No units in your deck yet — the scenario&apos;s starting units return after the next combat.
        </small>
      ) : null}
      {xpBoardOpen && typeof document !== "undefined"
        ? createPortal(
            <UnitExperienceWindow
              initialArmyUnitId={xpBoardUnitId}
              legalActions={legalActions}
              onAction={onAction}
              onClose={() => {
                setXpBoardOpen(false);
                setXpBoardUnitId(null);
              }}
              playerId={playerId}
              state={state}
            />,
            document.body
          )
        : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Town panel: buildings with proper rules tooltips, the one-card-per-type
// recruit basket (recruit Few once → reinforce to Pack → done), and the
// activated building actions (Blacksmith, Cover of Darkness, Castle Gate…).
// ---------------------------------------------------------------------------

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
  /** Which built building's effect / use panel is expanded in place. */
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(null);
  /**
   * Building tooltip. The town panel lives inside scrolling containers
   * (overflow-y: auto), which clipped the old in-flow `.buildingTip`; we render
   * a single fixed-position tip anchored to the hovered building instead so it
   * always shows in full.
   */
  const [buildingTip, setBuildingTip] = useState<{ buildingId: string; left: number; top: number } | null>(null);
  // The open panel closes when the round advances or the seat changes
  // (state-adjustment-during-render pattern).
  const [panelKey, setPanelKey] = useState("");
  const nextPanelKey = `${state.round}|${viewerPlayerId}`;
  if (panelKey !== nextPanelKey) {
    setPanelKey(nextPanelKey);
    setOpenBuildingId(null);
  }

  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;

  if (!player || !town || !faction) {
    return null;
  }

  const buildActions = legalActions.filter((legal) => legal.action.type === "BUILD_STRUCTURE");
  const anchorBuildingTip = (buildingId: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setBuildingTip({ buildingId, left: rect.left + rect.width / 2, top: rect.top - 8 });
  };
  const clearBuildingTip = (buildingId: string) =>
    setBuildingTip((current) => (current?.buildingId === buildingId ? null : current));

  // A building's use panel opens when it is BUILT — or, unbuilt, while the engine
  // offers an action that belongs to it (the Mages proclamation waiving the Mage
  // Guild for the Spell Book token). ONE shared read with the board view.
  const openCandidate = openBuildingId ? coreBuildingDefinitions[openBuildingId] : null;
  const openBuilding =
    openCandidate && buildingPanelReachable(state, viewerPlayerId, legalActions, openCandidate)
      ? openCandidate
      : null;

  return (
    <section className="townPanel" aria-label={`${faction.name} town`}>
      <h3>
        {faction.name} town
        <small title="Build / Population / Spell book tokens — each once per round">
          {player.townTokens.build ? "🔨" : "▫"} {player.townTokens.population ? "👥" : "▫"}{" "}
          {player.townTokens.spellBook ? "📖" : "▫"}
        </small>
      </h3>
      <CommanderForgePanel legalActions={legalActions} onAction={onAction} playerId={viewerPlayerId} state={state} />
      <div className="townBuildings">
        {faction.buildings.map((buildingId) => {
          const building = coreBuildingDefinitions[buildingId];
          if (!building) {
            return null;
          }
          const built = town.buildings.includes(buildingId);
          const action = buildActions.find(
            (legal) => legal.action.type === "BUILD_STRUCTURE" && legal.action.buildingId === buildingId
          );
          const cubes = town.factionCubes?.[buildingId] ?? 0;
          const effectPanel = buildingPanelReachable(state, viewerPlayerId, legalActions, building);
          const open = openBuildingId === buildingId;
          const actionable = effectPanel && activeBuildingActions(state, viewerPlayerId, legalActions, buildingId).length > 0;
          return (
            <div
              className={`townBuilding ${built ? "built" : ""}`}
              key={buildingId}
              onBlur={() => clearBuildingTip(buildingId)}
              onFocus={(event) => anchorBuildingTip(buildingId, event.currentTarget)}
              onMouseEnter={(event) => anchorBuildingTip(buildingId, event.currentTarget)}
              onMouseLeave={() => clearBuildingTip(buildingId)}
              tabIndex={0}
            >
              {/* Building art slot: fills in as soon as assets.image lands.
                  A not-built building keeps its full art, just faintly blurred
                  with a small "not built" tag so it reads as pending at a glance
                  without obscuring the artwork. */}
              {building.assets?.image ? (
                <img
                  alt={`${building.name} building tile`}
                  className="townBuildingArt"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={assetUrl(building.assets.image)}
                />
              ) : null}
              {!built && building.assets?.image ? (
                <span className="townBuildingUnbuilt" aria-hidden="true">
                  not built
                </span>
              ) : null}
              <strong>{building.name}</strong>
              <small>{built ? (cubes > 0 ? `built · ${cubes} cube${cubes === 1 ? "" : "s"}` : "built") : formatCost(building.cost)}</small>
              {building.implementationStatus === "not-implemented" ? <small className="todoTag">data only</small> : null}
              {action ? (
                <button className="commandButton" onClick={() => onAction(action.action)} type="button">
                  Build
                </button>
              ) : null}
              {effectPanel ? (
                <button
                  aria-expanded={open}
                  className={`commandButton buildingEffectButton ${actionable ? "actionable" : ""}`}
                  onClick={() => setOpenBuildingId(open ? null : buildingId)}
                  type="button"
                >
                  {actionable ? "Use ▾" : "Effect ▾"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {/* Rules tooltip rendered fixed (escapes the rail's overflow clip): name,
          cost, prerequisites, timing and the exact effect. */}
      {buildingTip
        ? (() => {
            const building = coreBuildingDefinitions[buildingTip.buildingId];
            if (!building) {
              return null;
            }
            const prerequisites = (building.prerequisites ?? [])
              .map((prerequisite) => coreBuildingDefinitions[prerequisite]?.name ?? prerequisite)
              .join(", ");
            const timing = buildingTimingLabel(building);
            return (
              <div
                className="buildingTip floating"
                role="tooltip"
                style={{ left: buildingTip.left, top: buildingTip.top }}
              >
                <strong>{building.name}</strong>
                <small className="buildingTipCost">
                  {formatCost(building.cost)}
                  {prerequisites ? ` · needs ${prerequisites}` : ""}
                  {timing ? ` · ${timing}` : ""}
                </small>
                <p>{describeBuildingEffect(building)}</p>
              </div>
            );
          })()
        : null}

      {/* In-place effect / use panel for the building whose button is open: the
          exact effect, a live status line, and any action it offers right now
          (Spell Book, Blacksmith, Castle Gate, Cover of Darkness's card picker). */}
      {openBuilding && hasBuildingEffectPanel(openBuilding) ? (
        <BuildingDetailPanel
          building={openBuilding}
          legalActions={legalActions}
          onAction={onAction}
          state={state}
          viewerPlayerId={viewerPlayerId}
        />
      ) : null}

      <TownRecruitSection legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />

      <HireHeroesSection legalActions={legalActions} onAction={onAction} state={state} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prompt tray for pending visit steps / choices
// ---------------------------------------------------------------------------

type VisitRewardArt = {
  image?: string;
  name: string;
  /**
   * The card whose printed face this art IS, when the option really shows one —
   * so the tile can wear its Polish Set Artifacts badge. Deliberately unset for
   * unit portraits, tile scans, resource glyphs and the Legion "which unit"
   * options (whose step carries an artifact `cardId` that is NOT what is drawn).
   */
  cardId?: string;
  /** Compact resource-symbol option rather than a card scan. */
  resource?: boolean;
  /** Map-tile options (Disruption): rotation in 60° turns, for the thumb. */
  tileRotation?: number;
  /** Short caption under the thumb (degrees, unit side, …) when the full legal label is long. */
  caption?: string;
  /**
   * The pick's wired EFFECT text, shown as a second line under the label —
   * Hero Equipment `summary` / commander-artifact `effectText`. These items are
   * icons (not printed card faces), so without this line the buyer picks blind.
   */
  detail?: string;
};

/**
 * Pull the reward identity out of a visit option's steps so the tray can show
 * the actual graphic (Artifact / Spell / Statistic / War Machine / unit / map
 * tile) instead of the Astrologers/Event card scan or a text-only button.
 *
 * Reads every step shape the engine uses for pick-a-reward offers:
 *   - cardId (spells, artifacts, stats, war machines, ability empower)
 *   - unitDefId (Unexpected Reinforcements free recruit)
 *   - recruit.unitDefId (Charlie and his Circus drawn neutral)
 *   - armyUnitId (Isra's Friends reinforce, Terrible Plague flip, Crag Hack, …)
 *   - tileInstanceId (+ optional rotation) (Disruption rotate-tile)
 */
function rewardArtFromVisitSteps(
  state: GameState,
  playerId: PlayerId,
  steps: { type: string; [key: string]: unknown }[] | undefined
): VisitRewardArt | null {
  if (!steps) {
    return null;
  }
  if (steps.length === 1 && steps[0]?.type === "GAIN_RESOURCES") {
    const resourceStep = steps[0] as {
      gold?: unknown;
      buildingMaterials?: unknown;
      valuables?: unknown;
    };
    const rewards = (["gold", "buildingMaterials", "valuables"] as const).filter(
      (kind) => typeof resourceStep[kind] === "number" && (resourceStep[kind] as number) > 0
    );
    if (rewards.length === 1) {
      const kind = rewards[0];
      const amount = resourceStep[kind] as number;
      const name = kind === "buildingMaterials" ? "Building materials" : kind === "gold" ? "Gold" : "Valuables";
      return { image: RESOURCE_ICONS[kind], name, caption: `+${amount}`, resource: true };
    }
  }
  for (const step of steps) {
    if (!step || typeof step !== "object") {
      continue;
    }
    // Obelisk Grail clues must not use the generic tile-art branch below: the
    // initial picker deliberately lists every face-down tile, so previewing an
    // option here would reveal all of their hidden faces before selection.
    if (step.type === "GRAIL_TILE_SCRY") {
      continue;
    }
    // Legion recruit-discount: the step carries the ARTIFACT as `cardId`, but the
    // option is choosing WHICH UNIT the discount applies to — the tile must show
    // that unit's portrait, not the artifact card. This MUST precede the generic
    // `step.cardId` branch below, which would otherwise short-circuit to the
    // artifact image and make every Legion option look identical.
    if (step.type === "BANK_RECRUIT_DISCOUNT") {
      const target = step.target as
        | { kind?: "recruit"; unitDefId?: unknown }
        | { kind?: "reinforce"; armyUnitId?: unknown }
        | undefined;
      if (target?.kind === "recruit" && typeof target.unitDefId === "string" && target.unitDefId) {
        return rewardArtForId(target.unitDefId);
      }
      if (target?.kind === "reinforce" && typeof target.armyUnitId === "string" && target.armyUnitId) {
        const armyUnit = state.players[playerId]?.army.find((unit) => unit.id === target.armyUnitId);
        if (armyUnit) {
          const def = coreUnitDefinitions[armyUnit.unitDefId];
          const side = armyUnitPrintedSide(def, armyUnit.side, armyUnit.unitDefId);
          return {
            image: side?.cardImage ?? def?.few?.cardImage ?? def?.pack?.cardImage ?? def?.neutral?.cardImage,
            name: def?.name ?? armyUnit.unitDefId,
            caption: def?.name ?? armyUnit.unitDefId
          };
        }
      }
    }
    // Hero Equipment offers — every acquisition road (outfitter shop BUY, the
    // Resource-round Grade-I purchase, the Creature-Bank / VI-VII victory
    // GRANT/purchase, a reforge replacement): show the ITEM's icon and its
    // wired effect (`summary`), so the buyer never picks from bare names.
    const equipmentId =
      typeof step.equipmentId === "string" && step.equipmentId
        ? step.equipmentId
        : typeof step.toEquipmentId === "string" && step.toEquipmentId
          ? step.toEquipmentId
          : null;
    if (equipmentId) {
      const def = getEquipmentDefinition(equipmentId);
      if (def) {
        return {
          image: equipmentImage(equipmentId),
          name: def.name.en,
          caption: `${def.name.en} · ${def.slot} · Grade ${def.grade}`,
          detail: def.summary
        };
      }
    }
    if (typeof step.cardId === "string" && step.cardId) {
      return rewardArtForId(step.cardId);
    }
    if (typeof step.unitDefId === "string" && step.unitDefId) {
      return rewardArtForId(step.unitDefId);
    }
    const recruit = step.recruit;
    if (recruit && typeof recruit === "object") {
      const unitDefId = (recruit as { unitDefId?: unknown }).unitDefId;
      if (typeof unitDefId === "string" && unitDefId) {
        return rewardArtForId(unitDefId);
      }
    }
    if (typeof step.armyUnitId === "string" && step.armyUnitId) {
      const armyUnit = state.players[playerId]?.army.find((unit) => unit.id === step.armyUnitId);
      if (armyUnit) {
        const def = coreUnitDefinitions[armyUnit.unitDefId];
        const side = armyUnitPrintedSide(def, armyUnit.side, armyUnit.unitDefId);
        return {
          image: side?.cardImage ?? def?.few?.cardImage ?? def?.pack?.cardImage ?? def?.neutral?.cardImage,
          name: def?.name ?? armyUnit.unitDefId,
          caption: def?.name ?? armyUnit.unitDefId
        };
      }
    }
    if (typeof step.tileInstanceId === "string" && step.tileInstanceId) {
      const tile = state.adventure?.tiles[step.tileInstanceId];
      if (tile) {
        const def = allTileDefinitions[tile.tileDefId];
        const rotation =
          typeof step.rotation === "number" && Number.isFinite(step.rotation)
            ? ((step.rotation % 6) + 6) % 6
            : tile.rotation;
        const degrees = typeof step.rotation === "number" ? `${rotation * 60}°` : undefined;
        return {
          image: def?.assets?.tileImage,
          // TileDefinition has id (no display name); fall back to the instance's def id.
          name: def?.id ?? tile.tileDefId,
          tileRotation: rotation,
          caption: degrees ?? def?.id ?? tile.tileDefId
        };
      }
    }
  }
  return null;
}

/**
 * Representative art for a Scenario starting-bonus option (rulebook p.10). The
 * options are GENERIC actions (roll Resource dice / Search the Artifact deck /
 * reveal until a Minor Artifact / draw-and-choose a Minor Artifact / take a
 * resource package), so there is no single card to show — instead each kind gets
 * its Homm3BG glyph so the pick reads at a glance: an artifact icon for every
 * "get an Artifact" option, a resource-die icon for every resource option.
 */
const STARTING_BONUS_ARTIFACT_STEPS = new Set([
  "STARTING_BONUS_ARTIFACT_SEARCH",
  "REVEAL_UNTIL_MINOR_ARTIFACT",
  "DRAW_CHOOSE_MINOR_ARTIFACTS"
]);
function startingBonusOptionArt(
  steps: { type: string; [key: string]: unknown }[] | undefined
): VisitRewardArt | null {
  if (!steps || steps.length === 0) {
    return null;
  }
  if (steps.some((step) => step && STARTING_BONUS_ARTIFACT_STEPS.has(step.type))) {
    // HD origin-faithful pendant (normal + reduced polish modes share this art).
    return { image: UI_REWARD_ICONS.startingBonusArtifact, name: "Artifact" };
  }
  // Every other starting-bonus option is a resource bonus (dice or a package).
  // Uses the polished tools art so normal + reduced modes both read clearly.
  return { image: UI_REWARD_ICONS.startingBonusResource, name: "Resources" };
}

/** Resolve a card / unit / event id to display art + name. Never the Astrologers card. */
function rewardArtForId(cardId: string): VisitRewardArt {
  const card = cardLibrary[cardId];
  if (card) {
    return { image: card.assets?.cardImage, name: card.name, caption: card.name, cardId };
  }
  const unit = coreUnitDefinitions[cardId];
  if (unit) {
    return {
      image: unit.neutral?.cardImage ?? unit.few?.cardImage ?? unit.pack?.cardImage,
      name: unit.name,
      caption: unit.name
    };
  }
  const eventCard = eventCardDefinitions[cardId];
  if (eventCard) {
    return { image: eventCard.image, name: eventCard.name, caption: eventCard.name };
  }
  // Deliberately NOT falling through to astrologersCardDefinitions: a pick option
  // should never render as the proclamation card itself (that is what this tray
  // used to wrongly show for reinforce / recruit / war-machine offers).
  return { name: cardId, caption: cardId };
}

/** Per-destination art for the Monolith/Whirlpool/Gate travel picker's tray. */
type TeleportOptionArt = {
  image: string;
  /** Colored-Gate ring tint (matches the map's gateHexMark). */
  ring?: string;
  /** Gate pair number, or a Whirlpool's printed die face (+1/0/-1). */
  badge?: string;
  /** The destination still rides a face-down tile (revealed only on arrival). */
  faceDown: boolean;
  label: string;
};

/**
 * Tray art for ONE teleport destination option: the token's OWN art — Monolith,
 * a numbered Whirlpool, or a colored Gate (the Monolith art tinted by its pair
 * ring). It deliberately NEVER reads the destination tile's scan, so a still
 * face-down destination shows only its token art plus a "face-down" hint — the
 * traveller cannot preview a tile they have not yet revealed (which the generic
 * rewardArtFromVisitSteps, keyed off the option's tileInstanceId, otherwise
 * would). The Whirlpool number comes from the destination field / pending token.
 */
function teleportOptionArt(
  state: GameState,
  teleport: { kind: "monolith" | "whirlpool" | "gate" | "oneway"; pair?: 1 | 2 | 3 | 4 },
  option: { label: string; steps: { type: string; [key: string]: unknown }[] }
): TeleportOptionArt {
  const inner = option.steps[0] as { type?: string; spaceId?: string; tileInstanceId?: string } | undefined;
  let faceDown = false;
  let number: -1 | 0 | 1 | undefined;
  if (inner?.type === "TELEPORT_HERO" && typeof inner.spaceId === "string") {
    number = state.adventure?.fields[inner.spaceId]?.whirlpoolNumber;
  } else if (inner?.type === "TOKEN_TELEPORT_REVEAL" && typeof inner.tileInstanceId === "string") {
    faceDown = true;
    number = state.adventure?.tiles[inner.tileInstanceId]?.pendingToken?.number;
  }
  const colored = teleport.kind === "gate" || teleport.kind === "oneway";
  const image = teleport.kind === "whirlpool" ? mapTokenImage("whirlpool", number) : monolithTokenImage();
  const ring = colored ? GATE_PAIR_COLORS[teleport.pair ?? 1] ?? "#c9a24b" : undefined;
  const badge = colored
    ? String(teleport.pair ?? 1)
    : teleport.kind === "whirlpool" && number !== undefined
      ? `${number >= 0 ? "+" : ""}${number}`
      : undefined;
  return { image, ring, badge, faceDown, label: option.label };
}

// ---------------------------------------------------------------------------
// Pandora card decisions: show the CARD, not its name
// ---------------------------------------------------------------------------

/**
 * ONE tile of the Pandora card row: the card whose face is shown, plus every
 * engine offer attached to it. The `legal` action is dispatched VERBATIM — the
 * tray never rebuilds a payload, so a click here is byte-identical to the old
 * text button (that equality is what the tests pin).
 */
type PandoraCardTile = {
  cardId: string;
  actions: { legal: LegalAction; label: string; primary?: boolean }[];
};

/**
 * The two "we drew N cards in front of you, keep one" resolution steps. BOTH
 * carry the whole reveal inside their CHOOSE_ONE option (`drawn` +
 * `keepIndexes`), so the option can show the kept card's REAL FACE instead of
 * the word-only "Keep <name>":
 *   - RESOLVE_PANDORA_SEARCH   — the Polish Pandora Search.
 *   - RESOLVE_DRAW_CHOOSE_MINOR — the Polish reduced-starting-bonus
 *     draw-2-Minor-Artifacts-and-choose-1 (the opening pick every player makes,
 *     which was a pair of look-alike text buttons).
 * The kind only picks the wording; the tile row and the dispatched action are
 * identical for both.
 */
const KEEP_ONE_DRAWN_STEP_KINDS: Record<string, "pandora" | "artifact"> = {
  RESOLVE_PANDORA_SEARCH: "pandora",
  RESOLVE_DRAW_CHOOSE_MINOR: "artifact"
};

/**
 * The card ONE option of such a pick keeps, plus which pick it is. Returns null
 * for any other step shape, which is what keeps every unrelated CHOOSE_ONE on
 * the generic text path.
 */
function keepOneDrawnCard(
  steps: { type: string; [key: string]: unknown }[] | undefined
): { cardId: string; kind: "pandora" | "artifact" } | null {
  for (const step of steps ?? []) {
    const kind = step ? KEEP_ONE_DRAWN_STEP_KINDS[step.type] : undefined;
    if (!kind) {
      continue;
    }
    const drawn = step.drawn;
    const keepIndexes = step.keepIndexes;
    if (!Array.isArray(drawn) || !Array.isArray(keepIndexes)) {
      continue;
    }
    const index = keepIndexes[0];
    if (typeof index !== "number") {
      continue;
    }
    const cardId = drawn[index];
    if (typeof cardId === "string" && cardId) {
      return { cardId, kind };
    }
  }
  return null;
}

export function PromptTray({
  state,
  viewerPlayerId,
  legalActions,
  onAction,
  onSwitchSeat
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  /**
   * Open-table only: jump the local view to the seat that owns the open prompt.
   * Given, the "…is deciding" strip grows a one-click "Play as X" button so the
   * player who must act reaches their own choice without hunting the seat
   * switcher. Absent in hosted rooms, where the seat is fixed to this client.
   */
  onSwitchSeat?: (seat: PlayerId) => void;
}) {
  // Optional so the tray still renders (un-zoomable) outside a CardZoomProvider —
  // both real mount points in page.tsx are inside one; unit tests are not.
  const zoom = useOptionalCardZoom();
  const balanceArt = usePolishBalanceArtEnabled();
  const visit = state.adventure?.pendingVisit;
  const choice = state.pendingChoice;
  const balanceSpellCardId = choice?.type === "OPTION_CHOICE" ? choice.balanceSpellChoice?.cardId : undefined;
  // A Shady Auction: the open lot (an Artifact card) the viewer is bidding on.
  // It is public to every bidder (only the bids are secret), so the tray must
  // show WHICH artifact is on the block — otherwise the player bids blind.
  const auctionLot = state.adventure?.events?.auction ?? null;
  const auctionLotCard = auctionLot ? cardLibrary[auctionLot.lotCardId] : undefined;
  const roundStartEventActive = isRoundStartEventBarrierActive(state);
  const roundStartBarrierKind =
    roundStartEventActive ? (state.round % 2 === 0 ? "astrologers" : "event") : null;
  const visitStep = visit?.steps[0];
  const activeRoundEventCard = roundStartBarrierKind === "event" ? getActiveEventCard(state) : null;
  const activeRoundAstrologersCard =
    roundStartBarrierKind === "astrologers" ? getActiveAstrologersCard(state) : null;
  const roundStartEventCard =
    activeRoundEventCard &&
    visitStep &&
    (visitStep.type.startsWith("EVENT_") ||
      ("prompt" in visitStep &&
        typeof visitStep.prompt === "string" &&
        visitStep.prompt.startsWith(activeRoundEventCard.name)))
      ? activeRoundEventCard
      : null;
  const roundStartAstrologersCard =
    activeRoundAstrologersCard && visit ? activeRoundAstrologersCard : null;

  const visitActions = legalActions.filter(
    (legal) =>
      legal.action.type === "RESOLVE_VISIT_STEP" ||
      legal.action.type === "TRADE_RESOURCES" ||
      legal.action.type === "PLACE_OBSERVATORY_TILE"
  );
  const optionActions = legalActions.filter((legal) => legal.action.type === "CHOOSE_OPTION");
  // Subterranean Gate exit: cycle positions + Confirm (mirrors the map float).
  // Local index — the map board keeps its own copy for the glow.
  const gateExitChoice =
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "subterranean-gate-placement" &&
    choice.playerId === viewerPlayerId &&
    choice.subterraneanGate
      ? choice
      : null;
  const [gateTrayIndex, setGateTrayIndex] = useState(0);
  useEffect(() => {
    setGateTrayIndex(0);
  }, [gateExitChoice?.id]);
  if (gateExitChoice && gateExitChoice.subterraneanGate) {
    const candidates = gateExitChoice.subterraneanGate.candidates;
    const count = Math.max(1, candidates.length);
    const index = ((gateTrayIndex % count) + count) % count;
    const label = gateExitChoice.options[index]?.label ?? `Exit ${index + 1}`;
    const confirm = optionActions.find(
      (legal) =>
        legal.action.type === "CHOOSE_OPTION" &&
        legal.action.choiceId === gateExitChoice.id &&
        legal.action.optionIndex === index
    );
    const role = candidates[0]?.role ?? "gate";
    return (
      <div
        className="promptTray"
        role="dialog"
        aria-label={gateExitChoice.prompt}
      >
        <strong>
          {role === "gate" ? "Subterranean Gate — fix the gate exit" : "Subterranean Gate — fix the path up"}
        </strong>
        <small>
          Click a glowing hex on the map to place the exit (or cycle here and Confirm). It is fixed for the rest of the game.
        </small>
        <div className="promptOptions rotateFloatRow">
          <button
            className="commandButton"
            disabled={count <= 1}
            onClick={() => setGateTrayIndex((value) => (value + count - 1) % count)}
            type="button"
          >
            <RotateCcw size={14} /> Previous
          </button>
          <span className="rotateDegrees">
            {index + 1}/{count}: {label}
          </span>
          <button
            className="commandButton"
            disabled={count <= 1}
            onClick={() => setGateTrayIndex((value) => (value + 1) % count)}
            type="button"
          >
            Next <RotateCw size={14} />
          </button>
          {confirm ? (
            <button className="commandButton primary" onClick={() => onAction(confirm.action)} type="button">
              <Check size={13} /> Confirm
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  const abilityTargetActions = legalActions.filter((legal) => legal.action.type === "CHOOSE_ABILITY_TARGET");
  const combatDiscardActions = legalActions.filter((legal) => legal.action.type === "RESOLVE_COMBAT_DISCARD");
  // WOG Hierophant commander: the after-combat First Aid window (heal 1
  // bronze/silver casualty, or decline). It is its OWN adventure field
  // (pendingCommanderFirstAid), NOT a pendingChoice/pendingVisit, so no surface
  // below claimed it — the owner saw a blank table and the turn froze (no heal,
  // no End turn, no Give up, because the engine gates every other action behind
  // this now-or-never window). This branch renders the window's own actions.
  const firstAidActions = legalActions.filter((legal) => legal.action.type === "COMMANDER_FIRST_AID");
  const firstAidOpen = state.adventure?.pendingCommanderFirstAid?.playerId === viewerPlayerId;
  // After-combat Necromancy is its OWN adventure field (pendingNecromancy), NOT a
  // pendingChoice/pendingVisit — exactly like the First Aid window above. Because
  // combat is already cleared (state.combat === null) by the time the window opens,
  // the battlefield command dock is gone, and no surface here claimed it — so the
  // closing action never rendered on the map and the winner was forced to play
  // the reinforce card. This branch owns the full multi-bonus transaction.
  const necromancyActions = legalActions.filter(
    (legal) =>
      legal.action.type === "SKIP_NECROMANCY" ||
      legal.action.type === "PLAY_CARD" ||
      legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT"
  );
  const necromancyOpen = state.adventure?.pendingNecromancy?.playerId === viewerPlayerId;
  const companionRecruitment = state.adventure?.pendingCompanionRecruitment;
  // "The combat round is over" is ONLY the neutral between-rounds gate: spend
  // 1 MP to fight another round, or retreat. RETREAT_FROM_COMBAT *also* appears
  // in the PvP start-of-combat escape window (offered to both heroes before any
  // unit acts), where it is surfaced as a board command button — not here. Gate
  // strictly on the neutral awaitingContinue state so this prompt no longer pops
  // up during every PvP battle's opening window.
  const combatRoundOver =
    Boolean(state.combat?.awaitingContinue) && state.combat?.context.kind === "neutral";
  const combatGate = combatRoundOver
    ? legalActions.filter(
        (legal) =>
          legal.action.type === "CONTINUE_NEUTRAL_COMBAT" ||
          legal.action.type === "RETREAT_FROM_COMBAT" ||
          // The continue window also offers card plays: Dessa's free-continue
          // and a +Movement top-up (Boots of Speed, Logistics, …) that buys
          // another round. During awaitingContinue these are the ONLY PLAY_CARD
          // actions legal-actions returns, so surface them all as gate buttons.
          legal.action.type === "PLAY_CARD"
      )
    : [];

  // MGQ seals ride their own atomic after-combat field (not pendingChoice), so
  // claim it before generic prompt routing. The dedicated surface shows each
  // defeated card, the exact charged cost, and the explicit decline action.
  if (companionRecruitment?.playerId === viewerPlayerId) {
    return (
      <MgqCompanionRecruitmentPrompt
        legalActions={legalActions}
        onAction={onAction}
        playerId={viewerPlayerId}
        state={state}
      />
    );
  }

  if (
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "mgq-gold-contract" &&
    choice.playerId === viewerPlayerId
  ) {
    return (
      <MgqGoldContractSetupPrompt
        legalActions={legalActions}
        onAction={onAction}
        playerId={viewerPlayerId}
        state={state}
      />
    );
  }

  // Teleport — the Jotunn Warlord ability AND the Teleport Spell — is a simple
  // two-click board flow: click a unit to move, then click an empty slot. The
  // board already highlights the candidate units (abilityTarget) and the empty
  // destination cells (cardTarget) and submits the pick on click, so the tray
  // only shows the instruction (a wall of one-button-per-unit / per-cell options
  // is the "convoluted" UI we are replacing). The optional Jotunn pick keeps its
  // single Skip button.
  if (
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    choice.kind === "jotunn-teleport" &&
    choice.playerId === viewerPlayerId
  ) {
    const skip = abilityTargetActions.find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "skip"
    );
    return (
      <div className="promptTray" role="dialog" aria-label="Teleport a unit">
        <strong>Teleport — click one of your units on the battlefield to move it.</strong>
        <div className="promptOptions">
          {skip ? (
            <button className="commandButton" onClick={() => onAction(skip.action)} type="button">
              {skip.label}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  // Ogres' Attack ("Bloodlust") token / Sorceresses' Weakness token — and the
  // WOG commander's command-ability cast — the same two-click board flow as
  // teleport: the board already highlights the eligible units (abilityTarget)
  // and submits the pick on click, so the tray only shows the instruction and
  // a single Cancel, never a wall of one-button-per-target.
  if (
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    (choice.kind === "place-token" || choice.kind === "commander-cast") &&
    choice.playerId === viewerPlayerId
  ) {
    const cancel = abilityTargetActions.find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "skip"
    );
    return (
      <div className="promptTray" role="dialog" aria-label={choice.prompt}>
        <strong>{choice.prompt} Click a glowing unit on the battlefield.</strong>
        <div className="promptOptions">
          {cancel ? (
            <button className="commandButton" onClick={() => onAction(cancel.action)} type="button">
              {cancel.label}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  // Factory Couatls' invulnerability ("Ethereal Coil") and the Automaton's
  // cube-place ("Overcharge") are a simple yes/no at the unit's OWN activation —
  // the only "target" is the unit itself, so render clean Activate/Skip buttons
  // instead of the "click a glowing unit" hunt (which would ask you to click your
  // own unit). The Couatl Few's activation ends the turn; the Pack's is free.
  if (
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    (choice.kind === "couatl-invulnerability" || choice.kind === "automaton-cube") &&
    choice.playerId === viewerPlayerId
  ) {
    const activate = abilityTargetActions.find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === choice.sourceUnitId
    );
    const skip = abilityTargetActions.find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "skip"
    );
    const activateLabel =
      choice.kind === "couatl-invulnerability" ? `Activate ${choice.abilityName}` : "Place a faction cube";
    return (
      <div className="promptTray" role="dialog" aria-label={choice.prompt}>
        <strong>{choice.prompt}</strong>
        <div className="promptOptions">
          {activate ? (
            <button className="commandButton" onClick={() => onAction(activate.action)} type="button">
              {activateLabel}
            </button>
          ) : null}
          {skip ? (
            <button className="commandButton" onClick={() => onAction(skip.action)} type="button">
              {skip.label}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  // Factory Dreadnoughts' splash allocation: a per-pick board flow (click a
  // glowing adjacent unit to take the next damage value), with a Stop button to
  // end early — the same two-click pattern as the token place / teleport picks.
  if (
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    choice.kind === "dreadnought-splash" &&
    choice.playerId === viewerPlayerId
  ) {
    const stop = abilityTargetActions.find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "skip"
    );
    return (
      <div className="promptTray" role="dialog" aria-label={choice.prompt}>
        <strong>{choice.prompt} Click a glowing adjacent unit.</strong>
        <div className="promptOptions">
          {stop ? (
            <button className="commandButton" onClick={() => onAction(stop.action)} type="button">
              {stop.label}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  if (
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "combat-teleport" &&
    choice.playerId === viewerPlayerId
  ) {
    const movingId = choice.teleport?.unitId;
    const movingName = movingId ? state.combat?.units[movingId]?.name : undefined;
    return (
      <div className="promptTray" role="dialog" aria-label="Teleport destination">
        <strong>
          {movingName
            ? `Teleport — click an empty slot on the battlefield to place ${movingName}.`
            : "Teleport — click an empty slot on the battlefield."}
        </strong>
      </div>
    );
  }
  // BINH house rule: the neutral guard must move to reach its (already-fixed)
  // target and several cells work — click the empty slot it should land on.
  if (
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "neutral-destination" &&
    choice.playerId === viewerPlayerId
  ) {
    const movingId = choice.neutralDestination?.unitId;
    const movingName = movingId ? state.combat?.units[movingId]?.name : undefined;
    const targetId = choice.neutralDestination?.defenderId;
    const targetName = targetId ? state.combat?.units[targetId]?.name : undefined;
    return (
      <div className="promptTray" role="dialog" aria-label="Neutral move destination">
        <strong>
          {movingName && targetName
            ? `${movingName} attacks ${targetName} — click the empty slot it should move to.`
            : "Choose where the neutral moves to attack — click an empty battlefield slot."}
        </strong>
      </div>
    );
  }
  // Dimension Door destination: the traveller was already chosen in the
  // WHO-travels window, so the landing is picked BY CLICKING A GLOWING HEX
  // (pendingMapChoiceTargets above). Rendering the engine's per-destination
  // labels here as well produced the wall of "Teleport to Empty Field (2 fields
  // away)" buttons the user asked to drop — so this tray shows only the hint and
  // the trailing Cancel. The Spell is already spent: Cancel moves nobody and
  // refunds nothing.
  if (
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "dimension-door" &&
    choice.playerId === viewerPlayerId &&
    choice.dimensionDoor
  ) {
    const cancelIndex = choice.dimensionDoor.destinations.length;
    const cancel = optionActions.find(
      (legal) =>
        legal.action.type === "CHOOSE_OPTION" &&
        legal.action.choiceId === choice.id &&
        legal.action.optionIndex === cancelIndex
    );
    return (
      <div className="promptTray" role="dialog" aria-label="Dimension Door destination">
        <strong>{choice.prompt}</strong>
        <small>
          Click one of the glowing hexes on the map to teleport there. The Spell is already spent, so cancelling
          moves nobody and gives nothing back.
        </small>
        {cancel ? (
          <div className="promptOptions">
            <button className="commandButton" onClick={() => onAction(cancel.action)} type="button">
              Cancel (no teleport)
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // Obelisk Grail clue — the tile is picked BY CLICKING IT on the map (see
  // `grailClueTargets` in HexMapBoard). Only tiles that can still host the Ⅶ
  // objective (Grail / Dragon Utopia) are offered, so this tray shows the hint
  // plus the trailing decline; rendering the engine's per-tile labels here as
  // well would bring back the wall of "Tile at row X, col Y" buttons the map
  // pick replaces. Detected from the option STEPS — the follow-up REVEAL step
  // carries no GRAIL_TILE_SCRY option, so it keeps its ordinary tile-art tray.
  const grailCluePicker =
    visit &&
    visit.playerId === viewerPlayerId &&
    visitStep?.type === "CHOOSE_ONE" &&
    visitStep.options.some((option) => option.steps[0]?.type === "GRAIL_TILE_SCRY")
      ? visitStep
      : null;
  if (grailCluePicker) {
    const declineIndex = grailCluePicker.options.findIndex((option) => option.steps.length === 0);
    const decline = visitActions.find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === declineIndex
    );
    const tileCount = grailCluePicker.options.filter(
      (option) => option.steps[0]?.type === "GRAIL_TILE_SCRY"
    ).length;
    return (
      <div className="promptTray" role="dialog" aria-label="Obelisk Grail clue">
        <strong>Obelisk — inspect one hidden Grail / Dragon Utopia tile</strong>
        <small>
          Click one of the {tileCount} glowing face-down tiles on the map to see its real face. Only tiles that can
          still host the Grail or a Dragon Utopia are offered, and you get one look per Obelisk.
        </small>
        {decline ? (
          <div className="promptOptions">
            <button className="commandButton" onClick={() => onAction(decline.action)} type="button">
              Do not inspect a tile
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // Never leave a seat with a blank table while ANOTHER seat's blocking
  // interaction is open. That covers state.pendingChoice (any kind), the
  // adventure pendingVisit — which is how round-start Event-deck / Astrologers
  // steps and every location visit surface — and the pendingTileChoice (tile
  // rotations, incl. round 1's forced home-tile spins). All of them freeze the
  // rest of the table, most totally behind the round-start Event barrier, so an
  // INVISIBLE one reads as "the game is stuck": the strip names the owner, and
  // on an OPEN table offers the one-click "Play as X" jump so whoever must act
  // reaches the prompt from any seat. The server still owns enforcement.
  // Learning has its own waiting strip in LearningOfferModal.
  const tileChoice = state.adventure?.pendingTileChoice;
  const waitingOn =
    companionRecruitment && companionRecruitment.playerId !== viewerPlayerId
      ? { ownerId: companionRecruitment.playerId, doing: "is choosing a Companion..." }
      : choice && choice.playerId !== viewerPlayerId
      ? choice.type === "OPTION_CHOICE" &&
        (choice.context === "learning-level-up" ||
          choice.context === "deck-search-mode" ||
          choice.context === "map-spell-boost" ||
          (choice.context === "deck-pick" && Boolean(choice.deckPick?.upFront)))
        ? null
        : { ownerId: choice.playerId, doing: "is deciding…" }
      : !choice && visit && visit.playerId !== viewerPlayerId
        ? {
            ownerId: visit.playerId,
            doing: roundStartEventActive
              ? roundStartAstrologersCard
                ? "is resolving the Astrologers proclamation…"
                : "is resolving the round's Event…"
              : "is resolving a visit…"
          }
        : !choice && !visit && tileChoice && tileChoice.playerId !== viewerPlayerId
          ? { ownerId: tileChoice.playerId, doing: "is rotating a new tile…" }
          : null;
  if (waitingOn) {
    const ownerName = state.players[waitingOn.ownerId]?.name ?? waitingOn.ownerId;
    // Offer the one-click jump for MAP interactions only (a creature-bank
    // placement, an Event/visit option, a tile pick). Never mid-combat —
    // switching seats during a fight is exactly the disorientation we avoid.
    const canJumpToOwner =
      Boolean(onSwitchSeat) &&
      !state.combat &&
      waitingOn.ownerId !== NEUTRAL_PLAYER_ID &&
      Boolean(state.players[waitingOn.ownerId]);
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>
          {ownerName} {waitingOn.doing}
        </span>
        {canJumpToOwner ? (
          <button className="promptSwitchSeat" onClick={() => onSwitchSeat?.(waitingOn.ownerId)} type="button">
            Play as {ownerName}
          </button>
        ) : null}
      </div>
    );
  }

  let title: string | null = null;
  let body: LegalAction[] = [];
  // Extra card art shown above the buttons (Shady Auction lot, active Event…).
  let preview: ReactNode = null;
  // When the open visit step is CHOOSE_ONE, options can carry reward card ids
  // (buy this Artifact / pick this Event / recruit this unit) — render those
  // as graphic tiles, not text-only buttons.
  let chooseOneOptions: { label: string; steps: { type: string; [key: string]: unknown }[] }[] | null = null;
  // The Monolith/Whirlpool/Gate travel picker (`step.teleport`): the tray shows
  // each destination as a themed token card (art + label + number/pair badge)
  // and a "pick your exit on the map" hint, not a bare numbered option list.
  let teleport: { kind: "monolith" | "whirlpool" | "gate" | "oneway"; pair?: 1 | 2 | 3 | 4 } | null = null;

  if (
    choice?.type === "OPTION_CHOICE" &&
    choice.playerId === viewerPlayerId &&
    // The Learning level-up offer has its own card-showing modal (LearningOfferModal).
    // The Search-or-take-discard prompt AND the one-step spells deck-pick have
    // DeckSearchModeModal (card backs / discard faces / school card faces).
    // The map cast-then-boost Power window has MapSpellBoostModal (the
    // battle-style picker — never the text-button box list again).
    choice.context !== "learning-level-up" &&
    choice.context !== "deck-search-mode" &&
    choice.context !== "map-spell-boost" &&
    !(choice.context === "deck-pick" && choice.deckPick?.upFront)
  ) {
    title = choice.prompt;
    body = optionActions;
  } else if (choice?.type === "ABILITY_TARGET_CHOICE" && choice.playerId === viewerPlayerId) {
    // Magog splash / Cerberi bite / Liches' Death Cloud / neutral target tie:
    // pick from the list here or click a glowing unit on the board.
    title = choice.prompt;
    body = abilityTargetActions;
  } else if (choice?.type === "COMBAT_HAND_DISCARD" && choice.playerId === viewerPlayerId) {
    // Magi Power Drain: discard a chosen Power card or take a random discard.
    title = choice.prompt;
    body = combatDiscardActions;
  } else if (choice?.type === "TARNUM_SEARCH" && choice.playerId === viewerPlayerId) {
    // Tarnum (Conflux) VI's over-limit Spell search: pick WHICH Spell deck to
    // Search (basic or expert). It emits CHOOSE_OPTION actions like an option
    // choice but is its OWN pendingChoice type — without this branch no surface
    // recognised it, so the owner saw a blank table and the choice froze the
    // game ("player sees no choice, can't do anything").
    title = `Tarnum — Search a Spell deck (${choice.remaining} search${choice.remaining === 1 ? "" : "es"} left)`;
    body = optionActions;
  } else if (firstAidOpen && firstAidActions.length > 0) {
    // Hierophant First Aid Master: choose which fallen bronze/silver unit to
    // restore after the combat, or decline. Gated first in the engine, so it
    // must render or the turn is stuck.
    title = "First Aid Master — restore one fallen unit";
    body = firstAidActions;
  } else if (necromancyOpen && necromancyActions.length > 0) {
    // Atomic post-combat purchase: layer Necromancy, Legion, and gold bonuses,
    // redeem any reinforcement offers, then explicitly release the field reward.
    const remaining = state.adventure?.pendingNecromancy?.remaining ?? 1;
    title = `Necromancy — ${remaining} card${remaining === 1 ? "" : "s"} available; add bonuses, reinforce, then Resolve`;
    body = necromancyActions;
  } else if (visit && visit.playerId === viewerPlayerId && visitActions.length > 0) {
    const step = visit.steps[0];
    // The market panel owns the Trading Post / War Machine Factory visits.
    if (step?.type === "TRADING_POST" || step?.type === "WAR_MACHINE_SHOP") {
      return null;
    }
    const field = state.adventure?.fields[visit.fieldId];
    // A Shady Auction bid: keep the lot-naming prompt (not the generic event
    // title) AND show the artifact card, so the bidder knows exactly what is on
    // the block. The auction's only CHOOSE_ONE visit step is the secret bid.
    const isAuctionBid = Boolean(auctionLot) && step?.type === "CHOOSE_ONE";
    if (isAuctionBid) {
      title =
        step?.type === "CHOOSE_ONE"
          ? step.prompt
          : `A Shady Auction: bid for ${auctionLotCard?.name ?? "the lot"}`;
      preview = (
        <div className="auctionLotPreview" data-testid="auction-lot">
          {auctionLotCard?.assets?.cardImage ? (
            <CardSetFrame cardId={auctionLotCard.id}>
              <img
                alt={auctionLotCard.name}
                className="auctionLotCard"
                loading="lazy"
                referrerPolicy="no-referrer"
                src={assetUrl(auctionLotCard.assets.cardImage)}
              />
            </CardSetFrame>
          ) : null}
          <span>{auctionLotCard?.name ?? "Unknown artifact"}</span>
        </div>
      );
    } else {
      // Prefer the step's own prompt when it names the choice (e.g. "Dancing Imp:
      // empower…", "Disruption: rotate…") — fall back to the card name only when
      // the step has no prompt of its own.
      const stepPrompt =
        step?.type === "CHOOSE_ONE" || step?.type === "PAY_TO"
          ? typeof step.prompt === "string"
            ? step.prompt
            : null
          : null;
      title =
        stepPrompt ??
        (roundStartEventCard
          ? `Event: ${roundStartEventCard.name}`
          : roundStartAstrologersCard
            ? `Astrologers Proclaim: ${roundStartAstrologersCard.name}`
            : `${locationDefinitions[field?.location ?? ""]?.name ?? "Field"}: choose`);
      // Face-up shared Event pool (Artifact Merchant / spell markets): show
      // every offered card so the player can pick by art, not just by name.
      // The proclamation/Event card scan itself is deferred until we know whether
      // the options carry their own reward art (unit / artifact / tile / …) —
      // those replace the card scan so the tray shows what you pick, not the
      // trigger card (see hasAnyRewardArt below).
      const pool = state.adventure?.events?.pool ?? [];
      const faceUpPool = pool.filter((entry) => entry.faceUp !== false && entry.cardId);
      if (faceUpPool.length > 0 && !isAuctionBid) {
        preview = (
          <div className="eventPoolPreview" data-testid="event-pool-preview" aria-label="Cards on offer">
            {faceUpPool.map((entry, index) => {
              const art = rewardArtForId(entry.cardId);
              return (
                <div className="eventPoolCard" key={`${entry.cardId}-${index}`}>
                  {art.image ? (
                    <CardSetFrame cardId={entry.cardId}>
                      <img alt={art.name} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(art.image)} />
                    </CardSetFrame>
                  ) : (
                    <span className="marketCardFallback">{art.name}</span>
                  )}
                  <small>{art.name}</small>
                </div>
              );
            })}
          </div>
        );
      }
    }
    if (step?.type === "CHOOSE_ONE") {
      chooseOneOptions = step.options as { label: string; steps: { type: string; [key: string]: unknown }[] }[];
      teleport = step.teleport ?? null;
    }
    body = visitActions;
  } else if (combatGate.length > 0) {
    title = "The combat round is over";
    body = combatGate;
  }

  // Safety net against a frozen table: ANY pending choice OWNED by this viewer
  // that no surface above claimed — and that no sibling modal owns (DECK_SEARCH →
  // SearchModal, ATTACK_DIE_REROLL → RerollModal, learning-level-up →
  // LearningOfferModal, deck-search-mode → DeckSearchModeModal) — still renders
  // its resolving actions here. A pending choice returns ONLY its own resolving
  // actions from getLegalActions, so this can never leak unrelated turn actions.
  // It exists so a new/rare choice type (the Tarnum-search class of bug) can never
  // silently strand its owner with a blank table — the failure the closed-room
  // report described.
  if (!title && choice && choice.playerId === viewerPlayerId) {
    const ownedElsewhere =
      choice.type === "DECK_SEARCH" ||
      choice.type === "ATTACK_DIE_REROLL" ||
      (choice.type === "OPTION_CHOICE" &&
        (choice.context === "learning-level-up" ||
          choice.context === "deck-search-mode" ||
          choice.context === "map-spell-boost" ||
          (choice.context === "deck-pick" && Boolean(choice.deckPick?.upFront))));
    if (!ownedElsewhere && legalActions.length > 0) {
      title = choice.type === "OPTION_CHOICE" ? choice.prompt : "Choose how to resolve this";
      body = legalActions;
    }
  }

  if (!title || body.length === 0) {
    return null;
  }

  // Prefer graphic reward tiles when the open CHOOSE_ONE options carry a real
  // pick (unit, artifact, spell, statistic, war machine, map tile, …). A teleport
  // picker is handled by teleportOptions below (its own themed cards), and MUST
  // be excluded here: rewardArtFromVisitSteps keys a face-down destination off
  // its tileInstanceId and would show the hidden tile's scan (a preview leak).
  // discard-pick (take a card from your discard / refresh a used Book Spell) also
  // shows each candidate's face — same "pick by art" vibe as a market pool.
  const discardPickCards =
    choice?.type === "OPTION_CHOICE" && choice.context === "discard-pick" && choice.playerId === viewerPlayerId
      ? choice.discardPick?.cardIds ?? null
      : null;
  const handDiscardCards =
    choice?.type === "OPTION_CHOICE" && choice.context === "hand-discard" && choice.playerId === viewerPlayerId
      ? choice.handDiscard?.cardIds ?? null
      : null;
  const subterraneanTileCandidates =
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "subterranean-tile-pick" &&
    choice.playerId === viewerPlayerId
      ? choice.subterraneanTilePick?.candidates ?? null
      : null;
  // Rule 111 (Polish house rule): options 1..N each replace a bronze guard, so
  // show that bronze unit's Neutral card face (option 0 keeps — a plain button).
  const rule111Draws =
    choice?.type === "OPTION_CHOICE" && choice.context === "rule-111" && choice.playerId === viewerPlayerId
      ? (state.combat?.pendingNeutralDraws ?? []).filter((draw) => draw.tier === "bronze" && !draw.bankGuard)
      : null;
  // Polish Bank Sizes: rolled bank candidates (+ optional Leave-it-blocked).
  // Each bank option shows the bank's field art above the name + size; Leave
  // blocked is a dedicated X card (not an empty bank face).
  const polishBankCandidates =
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "place-creature-bank" &&
    choice.playerId === viewerPlayerId &&
    choice.creatureBank?.candidates &&
    choice.creatureBank.candidates.length >= 1
      ? choice.creatureBank.candidates
      : null;
  // Diplomacy exposes only cards the player can currently afford. Show those
  // actual neutral card faces beside the recruit buttons instead of a blind
  // text-only list.
  const diplomacyRecruitCards =
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "diplomacy-recruit" &&
    choice.playerId === viewerPlayerId &&
    choice.diplomacyRecruit
      ? choice.diplomacyRecruit.recruitable
      : null;
  // The post-victory / drop commander-artifact purchase offer: its cardIds are
  // index-aligned with the options (the trailing Decline has none), and each is
  // a real deck card with a printed face — show it plus the spec's effect text,
  // matching the Commander Forge panel ("show picture and effect", 2026-08-19).
  const commanderArtifactOfferCards =
    choice?.type === "OPTION_CHOICE" &&
    choice.context === "commander-artifact-offer" &&
    choice.playerId === viewerPlayerId
      ? choice.commanderArtifactOffer?.cardIds ?? null
      : null;
  // A Tome / Eagle Eye dig (EAGLE_EYE_DIG) revealed ONE spell to take-or-discard;
  // the take AND the discard button are about the SAME found card, so both show
  // its face. The Pendant of Second Sight's Search (DECK_DIG_KEEP_ONE) revealed
  // several of the player's OWN deck cards to keep one — each "Keep X" option is
  // index-aligned with that revealed card. Both name the gettable card id(s), so
  // render each option's card face — "SHOW THE ICON OF CARDS THAT U CAN GET"
  // (author): the cards already exist under public/assets and rendered blank.
  const eagleEyeCard =
    choice?.type === "OPTION_CHOICE" && choice.context === "eagle-eye" && choice.playerId === viewerPlayerId
      ? choice.eagleEye?.cardId ?? null
      : null;
  const ownDeckPickCards =
    choice?.type === "OPTION_CHOICE" && choice.context === "own-deck-pick" && choice.playerId === viewerPlayerId
      ? choice.ownDeckPick?.cardIds ?? null
      : null;
  // Scenario starting bonus (rulebook p.10): its options carry no card id, so
  // give each kind a representative glyph (artifact / resource die) — scoped to
  // the "Starting bonus" prompt so no other resource-dice / Search prompt changes.
  const startingBonusStep = visit && visit.playerId === viewerPlayerId ? visit.steps[0] : undefined;
  const startingBonusChoice =
    Boolean(chooseOneOptions) &&
    startingBonusStep?.type === "CHOOSE_ONE" &&
    typeof startingBonusStep.prompt === "string" &&
    /^Starting bonus/i.test(startingBonusStep.prompt);
  // The selected Obelisk clue is deliberately carried on the PRIVATE pending
  // visit, rather than on the initial pick options. That lets its owner see the
  // chosen tile's real face only after committing to that position.
  const grailScry = startingBonusStep?.type === "CHOOSE_ONE" ? startingBonusStep.grailTileScry : undefined;
  // The revealed identity comes from the STEP payload, never from
  // state.adventure.tiles: the owner renders a PLAYER VIEW in which every
  // face-down tile is masked to tileDefId "hidden" (the step is owner-only, so
  // this reveals nothing to other seats). The state read is only a fallback
  // for a legacy in-flight step minted before the payload carried the id.
  const grailScryTile = grailScry ? state.adventure?.tiles[grailScry.tileInstanceId] : undefined;
  const grailScryDefId = grailScry?.tileDefId ?? grailScryTile?.tileDefId;
  const grailScryDef = grailScryDefId ? allTileDefinitions[grailScryDefId] : undefined;
  const grailScryArt: VisitRewardArt | null = grailScry
    ? {
        image: grailScryDef?.assets?.tileImage,
        name: grailScryDef?.id ?? grailScryDefId ?? "hidden",
        tileRotation: grailScry.tileRotation ?? grailScryTile?.rotation,
        caption: grailScryDef?.id ?? grailScryDefId ?? "hidden"
      }
    : null;
  const rewardOptions =
    chooseOneOptions && !teleport
      ? body.map((legal) => {
          const optionIndex =
            legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined
              ? legal.action.optionIndex
              : undefined;
          const option =
            optionIndex !== undefined && chooseOneOptions && optionIndex < chooseOneOptions.length
              ? chooseOneOptions[optionIndex]
              : undefined;
          const art =
            rewardArtFromVisitSteps(state, viewerPlayerId, option?.steps) ??
            grailScryArt ??
            (startingBonusChoice ? startingBonusOptionArt(option?.steps) : null);
          return { legal, art };
        })
      : subterraneanTileCandidates
        ? body.map((legal) => {
            const optionIndex =
              legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                ? legal.action.optionIndex
                : undefined;
            const tileDefId = optionIndex !== undefined ? subterraneanTileCandidates[optionIndex] : undefined;
            const def = tileDefId ? allTileDefinitions[tileDefId] : undefined;
            const art: VisitRewardArt | null = tileDefId
              ? {
                  name: def?.id ?? tileDefId,
                  image: def?.assets?.tileImage,
                  tileRotation: 0,
                  caption: optionIndex === 0 ? "Tile A" : "Tile B"
                }
              : null;
            return { legal, art };
          })
      : handDiscardCards
        ? body.map((legal) => {
            const optionIndex =
              legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                ? legal.action.optionIndex
                : undefined;
            const cardId = optionIndex !== undefined ? handDiscardCards[optionIndex] : undefined;
            const card = cardId ? cardLibrary[cardId] : undefined;
            return {
              legal,
              art: cardId
                ? ({
                    name: card?.name ?? cardId,
                    image: card?.assets?.cardImage,
                    caption: legal.label,
                    cardId
                  } as VisitRewardArt)
                : null
            };
          })
      : discardPickCards
        ? body.map((legal) => {
            const optionIndex =
              legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                ? legal.action.optionIndex
                : undefined;
            const cardId =
              optionIndex !== undefined && optionIndex < discardPickCards.length
                ? discardPickCards[optionIndex]
                : undefined;
            const card = cardId ? cardLibrary[cardId] : undefined;
            const art: VisitRewardArt | null = cardId
              ? {
                  name: card?.name ?? cardId,
                  image: card?.assets?.cardImage,
                  caption: legal.label,
                  cardId
                }
              : null;
            return { legal, art };
          })
        : rule111Draws
          ? body.map((legal) => {
              const optionIndex =
                legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                  ? legal.action.optionIndex
                  : undefined;
              // Option 0 keeps the drawn army (no card); options 1..N each replace
              // the k-th bronze guard, so show that unit's Neutral card face.
              const draw = optionIndex !== undefined && optionIndex > 0 ? rule111Draws[optionIndex - 1] : undefined;
              const art: VisitRewardArt | null = draw
                ? { ...rewardArtForId(draw.unitDefId), caption: legal.label }
                : null;
              return { legal, art };
            })
          : polishBankCandidates
            ? body.map((legal) => {
                const optionIndex =
                  legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                    ? legal.action.optionIndex
                    : undefined;
                const candidate =
                  optionIndex !== undefined ? polishBankCandidates[optionIndex] : undefined;
                if (!candidate) {
                  return { legal, art: null as VisitRewardArt | null };
                }
                const bank = CREATURE_BANKS[candidate.bankId as CreatureBankId];
                const letter = String.fromCharCode(65 + (optionIndex ?? 0));
                const sizeRoman = ROMAN[candidate.size] ?? String(candidate.size);
                return {
                  legal,
                  art: {
                    name: bank?.name ?? "Creature Bank",
                    image: creatureBankFieldImage(candidate.bankId),
                    caption: `${letter} · size ${sizeRoman}`
                  } as VisitRewardArt
                };
              })
            : diplomacyRecruitCards
              ? body.map((legal) => {
                  const optionIndex =
                    legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                      ? legal.action.optionIndex
                      : undefined;
                  const draw = optionIndex !== undefined ? diplomacyRecruitCards[optionIndex] : undefined;
                  return {
                    legal,
                    art: draw ? { ...rewardArtForId(draw.unitDefId), caption: legal.label } : null
                  };
                })
            : ownDeckPickCards
              ? body.map((legal) => {
                  const optionIndex =
                    legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                      ? legal.action.optionIndex
                      : undefined;
                  const cardId =
                    optionIndex !== undefined && optionIndex < ownDeckPickCards.length
                      ? ownDeckPickCards[optionIndex]
                      : undefined;
                  const card = cardId ? cardLibrary[cardId] : undefined;
                  const art: VisitRewardArt | null = cardId
                    ? { name: card?.name ?? cardId, image: card?.assets?.cardImage, caption: legal.label, cardId }
                    : null;
                  return { legal, art };
                })
              : eagleEyeCard
                ? body.map((legal) => {
                    // Both offered actions (Take / Discard) are about the one found
                    // card, so every option button shows that same card face.
                    const card = cardLibrary[eagleEyeCard];
                    const art: VisitRewardArt = {
                      name: card?.name ?? eagleEyeCard,
                      image: card?.assets?.cardImage,
                      caption: legal.label,
                      cardId: eagleEyeCard
                    };
                    return { legal, art };
                  })
                : commanderArtifactOfferCards
                  ? body.map((legal) => {
                      const optionIndex =
                        legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                          ? legal.action.optionIndex
                          : undefined;
                      const cardId =
                        optionIndex !== undefined && optionIndex < commanderArtifactOfferCards.length
                          ? commanderArtifactOfferCards[optionIndex]
                          : undefined;
                      const spec = cardId ? COMMANDER_ARTIFACT_SPECS[cardId] : undefined;
                      const art: VisitRewardArt | null = cardId
                        ? {
                            name: spec?.name ?? cardLibrary[cardId]?.name ?? cardId,
                            image: cardLibrary[cardId]?.assets?.cardImage,
                            caption: legal.label,
                            cardId,
                            detail: spec?.effectText
                          }
                        : null;
                      return { legal, art };
                    })
                : body.map((legal) => ({ legal, art: null as VisitRewardArt | null }));
  const displayedRewardOptions =
    balanceArt && visitStep?.type === "CHOOSE_ONE" && visitStep.prompt.startsWith("Logistics:")
      ? rewardOptions.filter(({ legal }) => /stay/i.test(legal.label))
      : rewardOptions;
  const hasAnyRewardArt = displayedRewardOptions.some((entry) => Boolean(entry.art?.image || entry.art?.name));
  const hasTileRewardArt = displayedRewardOptions.some((entry) => entry.art?.tileRotation !== undefined);

  // ---- Pandora card decisions: the CARD FACE decides, never its name ----
  // Both Pandora surfaces below used to be word-only lists ("Put <name> back on
  // top" / "Discard <name>" / "Keep <name>"), and both are decided by what each
  // card DOES — so they get one shared card row (horizontally scrollable, because
  // late game a Search can put four cards on the table at once).
  //
  // HIDDEN INFO: the scry's revealed identities are masked to "hidden" for every
  // other viewer in player-view.ts, so this is gated on the OWNER. A masked id
  // resolves to no card in the library and therefore renders no face at all.
  const pandoraScry =
    choice?.type === "OPTION_CHOICE" && choice.context === "pandora-scry" && choice.playerId === viewerPlayerId
      ? (choice.pandoraScry ?? null)
      : null;
  const pandoraScryChoiceId = pandoraScry && choice?.type === "OPTION_CHOICE" ? choice.id : null;
  const pandoraScryTiles: PandoraCardTile[] | null =
    pandoraScry && pandoraScryChoiceId
      ? pandoraScry.remaining.map((cardId, index) => {
          // The engine's option order is [keep r0…rN] then [discard r0…rN]
          // (the discard half only while discards remain), so each card's two
          // offers are found by index — never rebuilt.
          const optionFor = (optionIndex: number) =>
            optionActions.find(
              (legal) =>
                legal.action.type === "CHOOSE_OPTION" &&
                legal.action.choiceId === pandoraScryChoiceId &&
                legal.action.optionIndex === optionIndex
            );
          const keep = optionFor(index);
          const discard = optionFor(pandoraScry.remaining.length + index);
          const actions: PandoraCardTile["actions"] = [];
          if (keep) {
            actions.push({ legal: keep, label: "Put back on top", primary: true });
          }
          if (discard) {
            actions.push({ legal: discard, label: "Discard" });
          }
          return { cardId, actions };
        })
      : null;
  // Keep-one-of-the-drawn picks (Polish Pandora Search / reduced-starting-bonus
  // Minor Artifacts): every option keeps one of the cards already on the table,
  // so the row only takes over when EVERY offer resolved to a card of the SAME
  // kind (a mixed or unrelated CHOOSE_ONE keeps the generic text path).
  const keepOneDrawn: { tiles: PandoraCardTile[]; kind: "pandora" | "artifact" } | null = (() => {
    if (!chooseOneOptions || teleport) {
      return null;
    }
    const tiles: PandoraCardTile[] = [];
    let kind: "pandora" | "artifact" | null = null;
    for (const legal of body) {
      const optionIndex =
        legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined
          ? legal.action.optionIndex
          : undefined;
      const option = optionIndex !== undefined ? chooseOneOptions[optionIndex] : undefined;
      const kept = keepOneDrawnCard(option?.steps);
      if (!kept || (kind !== null && kept.kind !== kind)) {
        return null;
      }
      kind = kept.kind;
      tiles.push({
        cardId: kept.cardId,
        actions: [
          { legal, label: kept.kind === "artifact" ? "Keep this Artifact" : "Keep this card", primary: true }
        ]
      });
    }
    return tiles.length > 0 && kind ? { tiles, kind } : null;
  })();
  const pandoraCardTiles = pandoraScryTiles ?? keepOneDrawn?.tiles ?? null;

  // Teleport destination cards: token art + a human "where" label + a Whirlpool
  // number / Gate pair badge, keyed to each option's RESOLVE_VISIT_STEP so a
  // click dispatches exactly what the map hex does.
  const teleportOptions =
    teleport && chooseOneOptions
      ? body.map((legal) => {
          const optionIndex =
            legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined
              ? legal.action.optionIndex
              : undefined;
          const option =
            optionIndex !== undefined && chooseOneOptions && optionIndex < chooseOneOptions.length
              ? chooseOneOptions[optionIndex]
              : undefined;
          // The trailing "Stay here" option (2026-07-24 rule) has empty steps —
          // it is a DECLINE, not a destination, so it carries no token art (a
          // plain ⇄ fallback card), keeping the destination cards distinct.
          const innerType = option?.steps[0]?.type;
          const isTravel = innerType === "TELEPORT_HERO" || innerType === "TOKEN_TELEPORT_REVEAL";
          return { legal, art: option && isTravel ? teleportOptionArt(state, teleport, option) : null };
        })
      : null;

  // Only show the Event / Astrologers card scan when the options themselves have
  // no graphic identity (pure text picks like Stables +1 movement). When the
  // player is picking a unit / reinforce target / war machine / tile, the option
  // tiles ARE the relevant images — the trigger card must not steal the preview.
  if (!hasAnyRewardArt && visit && visit.playerId === viewerPlayerId) {
    const step = visit.steps[0];
    const isAuctionBid = Boolean(auctionLot) && step?.type === "CHOOSE_ONE";
    if (!isAuctionBid) {
      if (roundStartEventCard?.image) {
        preview = (
          <>
            <div className="eventChoicePreview" data-testid="event-choice-card">
              <img
                alt={roundStartEventCard.name}
                className="eventChoiceCard"
                loading="lazy"
                referrerPolicy="no-referrer"
                src={assetUrl(roundStartEventCard.image)}
              />
            </div>
            {preview}
          </>
        );
      } else if (roundStartAstrologersCard?.image) {
        preview = (
          <>
            <div className="eventChoicePreview" data-testid="astrologers-choice-card">
              <img
                alt={roundStartAstrologersCard.name}
                className="eventChoiceCard"
                loading="lazy"
                referrerPolicy="no-referrer"
                src={assetUrl(roundStartAstrologersCard.image)}
              />
            </div>
            {preview}
          </>
        );
      }
    }
  }

  // Pandora card row: one tile per card on the table — its real face, its name,
  // and that card's OWN engine offers as buttons. The row scrolls SIDEWAYS
  // (never wrapping the page wider) because a late-game Pandora Search can put
  // four cards up at once. Returning here is also what excludes both Pandora
  // contexts from the generic text-button path below (the Rule 111 precedent).
  if (pandoraCardTiles) {
    const isScry = Boolean(pandoraScryTiles);
    const kept = pandoraScry?.toReturn ?? [];
    const rowKind = isScry ? "pandora-scry" : (keepOneDrawn?.kind ?? "pandora");
    return (
      <div className="promptTray pandoraCardTray" role="dialog" aria-label={title}>
        <strong>{title}</strong>
        <small className="pandoraCardHint">
          {isScry
            ? "Read each card, then put it back on top of the deck or discard it. Click a card to enlarge it; the row scrolls sideways."
            : rowKind === "artifact"
              ? "Pick the Minor Artifact you want to keep — the other goes back under the Artifact deck. Click a card to enlarge it; the row scrolls sideways."
              : "Pick the Pandora card you want to keep. Click a card to enlarge it; the row scrolls sideways."}
        </small>
        {kept.length > 0 ? (
          <div className="pandoraKeptStrip" data-testid="pandora-kept-strip">
            <small className="pandoraKeptHead">Going back on top (first is drawn next)</small>
            <div className="pandoraKeptCards">
              {kept.map((cardId, index) => {
                const card = cardLibrary[cardId];
                const image = resolveCardFaceImage(balanceArt, cardId, false) ?? card?.assets?.cardImage;
                return image ? (
                  <CardSetFrame cardId={cardId} key={`${cardId}-${index}`}>
                    <img
                      alt={card.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={assetUrl(image)}
                      title={card.name}
                    />
                  </CardSetFrame>
                ) : (
                  <span className="marketCardFallback" key={`${cardId}-${index}`}>
                    {card?.name ?? cardId}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="promptOptions pandoraCardRow" data-row-kind={rowKind} data-testid="pandora-card-row">
          {pandoraCardTiles.map((tile, index) => {
            const card = cardLibrary[tile.cardId];
            const image = resolveCardFaceImage(balanceArt, tile.cardId, false) ?? card?.assets?.cardImage;
            return (
              <div className="pandoraCardTile" data-testid="pandora-card-tile" key={`${tile.cardId}-${index}`}>
                {image ? (
                  <button
                    aria-label={`Enlarge ${card?.name ?? tile.cardId}`}
                    className="pandoraCardArt"
                    onClick={() => zoom?.zoomCard(tile.cardId)}
                    title={card?.name ?? tile.cardId}
                    type="button"
                  >
                    <CardSetFrame cardId={tile.cardId}>
                      <img
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={assetUrl(image)}
                      />
                    </CardSetFrame>
                  </button>
                ) : (
                  <span className="marketCardFallback">{card?.name ?? tile.cardId}</span>
                )}
                <small className="pandoraCardName">{card?.name ?? tile.cardId}</small>
                <div className="pandoraCardActions">
                  {tile.actions.map((entry) => (
                    <button
                      // The engine's own label is the accessible name, so a click
                      // here is provably the same offer the text button carried.
                      aria-label={entry.legal.label}
                      className={`commandButton${entry.primary ? " primary" : ""}`}
                      key={actionKey(entry.legal.action)}
                      onClick={() => onAction(entry.legal.action)}
                      type="button"
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (teleportOptions) {
    return (
      <div className="promptTray withTeleportCards" role="dialog" aria-label={title}>
        <strong>{title}</strong>
        <span className="promptTeleportHint">Pick your exit on the glowing map hex — or choose one below.</span>
        <div className="promptOptions teleportCards">
          {teleportOptions.map(({ legal, art }) => (
            <button
              aria-label={legal.label}
              className="teleportOptionCard"
              key={actionKey(legal.action)}
              onClick={() => onAction(legal.action)}
              title={legal.label}
              type="button"
            >
              <span
                className={`teleportOptionArt${art?.faceDown ? " faceDown" : ""}`}
                style={art?.ring ? ({ ["--teleport-ring" as string]: art.ring } as CSSProperties) : undefined}
              >
                {art?.image ? (
                  <img
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={assetUrl(art.image)}
                  />
                ) : (
                  <span className="marketCardFallback">⇄</span>
                )}
                {art?.badge ? <span className="teleportOptionBadge">{art.badge}</span> : null}
                {art?.faceDown ? <span className="teleportOptionFaceDownTag">face-down</span> : null}
              </span>
              <small>{art?.label ?? legal.label}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Polish Bank Sizes A/B pick: field art ABOVE the name + size coin so the
  // choice is intuitive (which bank am I taking on?). Text labels alone used to
  // force a memory match against the map preview. "Leave it blocked" is a real
  // third option with a clear X mark (not an empty bank card).
  if (polishBankCandidates) {
    return (
      <div className="promptTray withPolishBankCards" role="dialog" aria-label={title}>
        <strong>{title}</strong>
        <span className="promptTeleportHint">
          Pick a bank — art and size show above the name — or leave the field blocked (X).
        </span>
        <div className="promptOptions polishBankCards">
          {body.map((legal) => {
            const optionIndex =
              legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex !== undefined
                ? legal.action.optionIndex
                : undefined;
            const candidate =
              optionIndex !== undefined ? polishBankCandidates[optionIndex] : undefined;
            const isLeaveBlocked = !candidate;
            const bank = candidate
              ? CREATURE_BANKS[candidate.bankId as CreatureBankId]
              : undefined;
            const letter =
              optionIndex !== undefined
                ? isLeaveBlocked
                  ? "X"
                  : String.fromCharCode(65 + optionIndex)
                : "?";
            const size = candidate?.size;
            const sizeRoman = size ? (ROMAN[size] ?? String(size)) : "";
            return (
              <button
                aria-label={legal.label}
                className={`polishBankOptionCard${isLeaveBlocked ? " leaveBlocked" : ""}`}
                data-testid={isLeaveBlocked ? "leave-bank-blocked" : undefined}
                key={actionKey(legal.action)}
                onClick={() => onAction(legal.action)}
                title={legal.label}
                type="button"
              >
                <span className={`polishBankOptionArt${isLeaveBlocked ? " leaveBlockedArt" : ""}`}>
                  {candidate ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={assetUrl(creatureBankFieldImage(candidate.bankId))}
                    />
                  ) : (
                    <span aria-hidden="true" className="polishBankLeaveX">
                      ✕
                    </span>
                  )}
                  {size ? (
                    <span
                      aria-label={`Size ${sizeRoman}`}
                      className={`polishBankSizeCoin size-${size}`}
                    >
                      {size}
                    </span>
                  ) : null}
                </span>
                <strong className="polishBankOptionLetter">{letter}</strong>
                <small className="polishBankOptionName">
                  {isLeaveBlocked ? "Leave it blocked" : (bank?.name ?? "Creature Bank")}
                </small>
                {sizeRoman ? (
                  <small className="polishBankOptionSize">size {sizeRoman}</small>
                ) : isLeaveBlocked ? (
                  <small className="polishBankOptionSize">no bank</small>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Rule 111 (Polish house rule): a purpose-built two-column layout instead of
  // the flat option row — the "replace the Guard" swap sits on the LEFT, and the
  // drawn guard's card face with an "Accept the guard" button on the RIGHT, so
  // the either/or reads at a glance (keep the guard you see, or gamble on a swap).
  if (rule111Draws) {
    const acceptEntry = rewardOptions.find(
      (entry) => entry.legal.action.type === "CHOOSE_OPTION" && entry.legal.action.optionIndex === 0
    );
    const replaceEntries = rewardOptions.filter(
      (entry) =>
        entry.legal.action.type === "CHOOSE_OPTION" &&
        typeof (entry.legal.action as { optionIndex?: number }).optionIndex === "number" &&
        ((entry.legal.action as { optionIndex?: number }).optionIndex ?? 0) > 0
    );
    return (
      <div className="promptTray rule111Tray" role="dialog" aria-label={title}>
        <strong>{title}</strong>
        <div className="rule111Columns">
          <div className="rule111Replace">
            <small className="rule111ColHead">Roll the dice</small>
            {replaceEntries.map(({ legal }) => (
              <button
                className="commandButton rule111ReplaceButton"
                key={actionKey(legal.action)}
                onClick={() => onAction(legal.action)}
                type="button"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className="rule111Icon"
                  draggable={false}
                  src={assetUrl(UI_REWARD_ICONS.rule111)}
                />
                <span>{replaceEntries.length > 1 ? legal.label : "Use Rule 111: replace the Guard"}</span>
              </button>
            ))}
          </div>
          <div className="rule111Accept">
            <small className="rule111ColHead">Keep what you drew</small>
            <div className="rule111GuardArt">
              {rule111Draws.map((draw, index) => {
                const art = rewardArtForId(draw.unitDefId);
                return art.image ? (
                  <img
                    alt={art.name}
                    className="rule111GuardImage"
                    draggable={false}
                    key={index}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={assetUrl(art.image)}
                  />
                ) : (
                  <span className="marketCardFallback" key={index}>
                    {art.name}
                  </span>
                );
              })}
            </div>
            {acceptEntry ? (
              <button
                className="commandButton rule111AcceptButton"
                onClick={() => onAction(acceptEntry.legal.action)}
                type="button"
              >
                Accept the guard
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`promptTray${hasAnyRewardArt ? " withRewardCards" : ""}${hasTileRewardArt ? " withTileCards" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <strong>{title}</strong>
      {balanceSpellCardId && zoom ? (
        <ZoomButton
          label={`Zoom ${cardLibrary[balanceSpellCardId]?.name ?? "Spell"}`}
          onZoom={() => zoom.zoomCard(balanceSpellCardId)}
        />
      ) : null}
      {preview}
      <div className={`promptOptions${hasAnyRewardArt ? " rewardCards" : ""}${hasTileRewardArt ? " tileCards" : ""}`}>
        {displayedRewardOptions.map(({ legal, art }) =>
          art ? (
            <button
              aria-label={legal.label}
              className={`promptRewardCard${art.tileRotation !== undefined ? " tileThumb" : ""}${art.resource ? " resourceReward" : ""}`}
              key={actionKey(legal.action)}
              onClick={() => onAction(legal.action)}
              title={art.detail ? `${legal.label} — ${art.detail}` : legal.label}
              type="button"
            >
              {art.image ? (
                <span
                  className="promptRewardArtWrap"
                  style={
                    art.tileRotation !== undefined
                      ? ({ ["--tile-rot" as string]: `${art.tileRotation * 60}deg` } as CSSProperties)
                      : undefined
                  }
                >
                  <CardSetFrame cardId={art.cardId}>
                    <img
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={assetUrl(
                        art.cardId
                          ? (resolveCardFaceImage(balanceArt, art.cardId, false) ?? art.image)
                          : art.image
                      )}
                    />
                  </CardSetFrame>
                </span>
              ) : (
                <span className="marketCardFallback">{art.name}</span>
              )}
              <small>
                {art.resource || (art.caption && art.caption.endsWith("°")) ? art.caption : legal.label}
              </small>
              {art.detail ? <small className="promptRewardDetail">{art.detail}</small> : null}
            </button>
          ) : (
            <button
              className="commandButton"
              key={actionKey(legal.action)}
              onClick={() => onAction(legal.action)}
              type="button"
            >
              {legal.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Learning offer modal (level-up hook)
// ---------------------------------------------------------------------------

/**
 * Pops in the player's face the instant their Hero crosses an Experience level
 * while holding a Learning card — from ANY source that grants Experience (a
 * Learning Stone, a Tree of Knowledge, a won Combat, …). It shows the Learning
 * card itself and offers the basic play (advance a half level), the expert play
 * (advance a full level, spend an expert use / "crown", then remove the card —
 * only shown when an expert use is available) and a Decline. The engine drives
 * everything; this is purely the surface for the "learning-level-up" choice.
 */
export function LearningOfferModal({
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
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "learning-level-up") {
    return null;
  }

  // Balance Pack: the reprint fires on ANY experience gain (even a half level or
  // at the cap), so the wording is "gaining experience". Classic Learning fires
  // only on a level crossing, so it keeps the byte-identical "about to level up".
  const balance = houseRuleEnabled(state, "polish-card-balance");
  const gainingLabel = balance ? "gaining experience" : "about to level up";

  // While another player is deciding, show a quiet waiting strip instead.
  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <ChevronsUp aria-hidden="true" size={15} />
        <span>{state.players[choice.playerId]?.name ?? choice.playerId} is {gainingLabel}…</span>
      </div>
    );
  }

  const modes = choice.learningLevelUp?.modes ?? [];
  const optionActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "CHOOSE_OPTION" }> } =>
      legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === choice.id
  );
  if (optionActions.length === 0) {
    return null;
  }

  const card = cardLibrary["ability.learning"];
  const cardImage = card?.assets?.cardImage;

  return (
    <div className="modalBackdrop" role="dialog" aria-label={`Learning — ${gainingLabel}`}>
      <div className="searchModal learningOfferModal">
        <header>
          <strong>{balance ? "Your Hero is gaining Experience!" : "Your Hero is about to level up!"}</strong>
          <span>You hold Learning. Play it now to advance even further — or keep it for later.</span>
        </header>
        <div className="learningOfferBody">
          {cardImage ? (
            <img
              alt={card?.name ?? "Learning"}
              className="learningOfferCard"
              loading="lazy"
              referrerPolicy="no-referrer"
              src={assetUrl(cardImage)}
            />
          ) : (
            <span className="marketCardFallback">{card?.name ?? "Learning"}</span>
          )}
          <div className="learningOfferOptions">
            {optionActions.map((legal) => {
              const optionIndex = legal.action.optionIndex;
              const mode = optionIndex < modes.length ? modes[optionIndex] : undefined;
              const isExpert = mode === "expert";
              return (
                <button
                  className={`commandButton ${mode ? "primary" : ""} ${isExpert ? "learningExpert" : ""}`.trim()}
                  key={actionKey(legal.action)}
                  onClick={() => onAction(legal.action)}
                  type="button"
                >
                  {isExpert ? <Crown aria-hidden="true" size={15} /> : null}
                  {legal.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market panel: Trading Post / War Machine Factory visits
// ---------------------------------------------------------------------------

/**
 * The market tab that opens whenever one of the viewer's heroes resolves a
 * Trading Post or War Machine Factory visit. It can be minimized to a corner
 * chip and pops back open on the next visit. The Trading Post offers the
 * printed choose-one menu: resource trades (repeatable, shown with the
 * rulebook's trade table), selling one card for 1 gold, or buying a war
 * machine at its higher price; the Factory only sells machines, cheaper.
 */
export function MarketPanel({
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
  const balanceArt = usePolishBalanceArtEnabled();
  const visit = state.adventure?.pendingVisit;
  const step = visit?.steps[0];
  const isMarket =
    Boolean(visit && step && visit.playerId === viewerPlayerId) &&
    (step?.type === "TRADING_POST" || step?.type === "WAR_MACHINE_SHOP");

  // Pops open in the player's face on every new market visit; the user may
  // minimize it to a corner chip while they look at the map.
  const visitKey = isMarket && visit ? `${visit.fieldId}:${step?.type}:${visit.heroId}` : "";
  const [openState, setOpenState] = useState({ key: "", minimized: false });
  if (openState.key !== visitKey) {
    setOpenState({ key: visitKey, minimized: false });
  }

  if (!isMarket || !visit || !step) {
    // No market is open right now. While one of the viewer's heroes (Main or
    // Secondary) is parked on a Market field, OPEN_MARKET is legal and free —
    // surface it as a persistent, blinking tab so the market is reachable any
    // time without re-walking onto the tile.
    const openAction = legalActions.find(
      (legal): legal is LegalAction & { action: Extract<GameAction, { type: "OPEN_MARKET" }> } =>
        legal.action.type === "OPEN_MARKET"
    );
    if (!openAction) {
      return null;
    }

    const parkedHero = state.heroes[openAction.action.heroId];
    const marketField = parkedHero?.spaceId ? state.adventure?.fields[parkedHero.spaceId] : undefined;
    const marketName = marketField ? (locationDefinitions[marketField.location]?.name ?? "Market") : "Market";
    return (
      <button
        className="marketTab"
        onClick={() => onAction(openAction.action)}
        title={`Open the ${marketName} — your hero is standing here, trade any time`}
        type="button"
      >
        <span className="marketTabIcon">⚖</span>
        {marketName}
      </button>
    );
  }

  const isTradingPost = step.type === "TRADING_POST";
  const traded = isTradingPost && Boolean(step.traded);
  const title = isTradingPost ? "Trading Post" : "War Machine Factory";

  const tradeActions = legalActions.filter((legal) => legal.action.type === "TRADE_RESOURCES");
  const sellActions = legalActions.filter(
    (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.startsWith("Sell ")
  );
  const scrollSellActions = legalActions.filter((legal) => legal.action.type === "SELL_SCROLL_SPELL");
  const buyActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "BUY_WAR_MACHINE" }> } =>
      legal.action.type === "BUY_WAR_MACHINE"
  );
  const done = legalActions.find(
    (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.decline === true
  );

  if (openState.minimized) {
    return (
      <button
        className="marketChip"
        onClick={() => setOpenState({ key: visitKey, minimized: false })}
        title={`Reopen the ${title}`}
        type="button"
      >
        ⚖ {title}
      </button>
    );
  }

  const player = state.players[viewerPlayerId];
  const supply = state.adventure?.warMachineSupply ?? [];
  const pricing = isTradingPost ? "tradingPost" : "factory";

  return (
    <div className="marketPanel" role="dialog" aria-label={title}>
      <header>
        <strong>⚖ {title}</strong>
        <small>
          🪙 {player?.resources.gold ?? 0} · ⚒ {player?.resources.buildingMaterials ?? 0} · ♦{" "}
          {player?.resources.valuables ?? 0}
        </small>
        <div className="marketHeaderButtons">
          <button
            onClick={() => setOpenState({ key: visitKey, minimized: true })}
            title="Minimize — the visit stays open"
            type="button"
          >
            <Minus size={13} />
          </button>
          {done ? (
            <button onClick={() => onAction(done.action)} title="End the visit" type="button">
              <X size={13} />
            </button>
          ) : null}
        </div>
      </header>

      {isTradingPost ? (
        <section className="marketTrades" aria-label="Resource trades">
          <img
            alt="Trade table: 6 gold or 3 building materials buy 1 valuables; 2 gold buys 1 building materials; 1 valuables sells for 3 gold or 2 building materials; 1 building materials sells for 1 gold"
            className="marketTradeTable"
            src={assetUrl("/assets/rulebook-trade_table.webp")}
          />
          <small className="marketCredit">Trade table from the community rulebook rewrite (back cover).</small>
          <div className="marketTradeButtons">
            {tradeActions.length === 0 ? <small>No affordable trades right now.</small> : null}
            {tradeActions.map((legal) => (
              <button className="commandButton" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
                {legal.label.replace(/^Trade /, "")}
              </button>
            ))}
          </div>
          {traded ? (
            <small className="marketLock">
              Resource trading chosen for this visit — keep trading or close the market. Selling cards and buying war
              machines wait for another visit.
            </small>
          ) : null}
        </section>
      ) : null}

      {isTradingPost && !traded ? (
        <section className="marketSell" aria-label="Sell a card">
          <h4>Sell one card from hand → 1 gold</h4>
          <small>
            The card is removed from the game. Specialty, Statistic, your starting Ability and Magic Arrow cannot be
            sold. Selling (or buying a war machine) is this visit&apos;s one action.
          </small>
          <div className="marketSellCards">
            {sellActions.length === 0 ? <small>No sellable cards in hand.</small> : null}
            {sellActions.map((legal) => {
              const cardId =
                legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined
                  ? state.players[viewerPlayerId]?.hand[legal.action.optionIndex]
                  : undefined;
              const card = cardId ? cardLibrary[cardId] : undefined;
              const image = resolveCardFaceImage(balanceArt, cardId, false) ?? card?.assets?.cardImage;
              return (
                <button
                  className="marketSellCard"
                  key={actionKey(legal.action)}
                  onClick={() => onAction(legal.action)}
                  title={legal.label}
                  type="button"
                >
                  {image ? (
                    <img alt={card?.name ?? cardId} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(image)} />
                  ) : (
                    <span className="marketCardFallback">{card?.name ?? cardId}</span>
                  )}
                  {/* `.marketSellCard img` is `width: 100%`, so a content-sized
                      wrapper would blow the face up to its intrinsic size — the
                      button carries the badge instead (it is `position:
                      relative` for exactly this). */}
                  <CardSetCornerBadge cardId={cardId} />
                  <small>Sell → 1 🪙</small>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {isTradingPost && !traded && scrollSellActions.length > 0 ? (
        <section className="marketSell" aria-label="Sell a scroll spell">
          <h4>Sell one Spell Scroll spell → 2 gold</h4>
          <small>The spell is removed from the scroll (and the game). An emptied scroll is discarded.</small>
          <div className="marketSellCards">
            {scrollSellActions.map((legal) => {
              const cardId = legal.action.type === "SELL_SCROLL_SPELL" ? legal.action.cardId : undefined;
              const card = cardId ? cardLibrary[cardId] : undefined;
              const image = resolveCardFaceImage(balanceArt, cardId, false) ?? card?.assets?.cardImage;
              return (
                <button
                  className="marketSellCard"
                  key={actionKey(legal.action)}
                  onClick={() => onAction(legal.action)}
                  title={legal.label}
                  type="button"
                >
                  {image ? (
                    <img alt={card?.name ?? cardId} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(image)} />
                  ) : (
                    <span className="marketCardFallback">📜 {card?.name ?? cardId}</span>
                  )}
                  <small>Sell → 2 🪙</small>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="marketMachines" aria-label="War machines">
        <h4>
          War machines {isTradingPost ? "(Trading Post price)" : "(factory price)"}
        </h4>
        {supply.length === 0 ? <small>The war machine supply is empty.</small> : null}
        <div className="marketMachineRow">
          {supply.map((cardId) => {
            const card = cardLibrary[cardId];
            const cost = card?.warMachineCosts?.[pricing];
            const buy = buyActions.find((legal) => legal.action.cardId === cardId);
            const blocked = traded;
            return (
              <div className={`marketMachine ${buy && !blocked ? "" : "unavailable"}`} key={cardId}>
                {card?.assets?.cardImage ? (
                  <img alt={card.name} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(card.assets.cardImage)} />
                ) : (
                  <span className="marketCardFallback">{card?.name ?? cardId}</span>
                )}
                <strong>{card?.name ?? cardId}</strong>
                <small>{card ? describeCardEffect(card).replace(/^Permanent — /, "") : ""}</small>
                <button
                  className="commandButton"
                  disabled={!buy || blocked}
                  onClick={() => buy && onAction(buy.action)}
                  type="button"
                >
                  Buy for {cost?.gold ?? 0} 🪙
                </button>
              </div>
            );
          })}
        </div>
        <small className="marketNote">
          War machines are permanent cards: the bought card goes to your hand; play it to put it next to your hero
          board. Only one permanent may be in play — playing another discards the first.
        </small>
      </section>
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

  // A Far tile is usable right now if one of this player's heroes still has a
  // movement point AND has a legal slot to drop it (geometry from the full
  // state, since the view masks the def ids). The supply def ids come from the
  // full state for the same reason; the view only tells us how many remain.
  const supplyDefIds = state.adventure?.playerFarTiles[viewerPlayerId] ?? [];
  const myHeroes = Object.values(state.heroes).filter((hero) => hero.controllerId === viewerPlayerId);
  const usableByIndex = tiles.map((_, index) => {
    const tileDefId = supplyDefIds[index];
    return myHeroes.some(
      (hero) => hero.movementPoints > 0 && farTilePlacementCenters(state, hero, tileDefId).length > 0
    );
  });
  const anyUsable = usableByIndex.some(Boolean);

  return (
    <div className={`farTileTray ${anyUsable ? "usable" : ""}`} aria-label="Your far tiles">
      <small>Far (Ⅱ–Ⅲ) tiles — 1 movement point 🐎 to place at the border, touching two tiles:</small>
      {tiles.map((_, index) => {
        const usable = usableByIndex[index];
        const selected = placement?.supplyIndex === index;
        return (
          <button
            aria-disabled={!usable}
            className={`farTileBack ${selected ? "selected" : ""} ${usable ? "usable" : "idle"}`}
            key={index}
            onClick={() => onTogglePlacement(selected ? null : { supplyIndex: index })}
            title={
              usable
                ? "Far tile ready — select it, then click a glowing spot on the map border (1 movement point)"
                : "Far tile — no legal spot right now (move a hero next to a border touching two tiles, with a movement point to spare)"
            }
            type="button"
          >
            <img alt="Far tile back (Ⅱ–Ⅲ)" src={assetUrl(TILE_BACK_IMAGES.far)} />
          </button>
        );
      })}
      {placement ? <small className="farTileHint">Click a glowing spot on the map border.</small> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decks rail and discard piles
// ---------------------------------------------------------------------------

/**
 * The player's own draw deck and discard pile, shown large and highlighted
 * directly above the hand so "your cards" read as one block. The deck shows
 * its face-down back with a live count; the discard opens the full pile.
 */
export function AdventureOwnDeck({
  view,
  viewerPlayerId,
  onShowPile
}: {
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  onShowPile: (
    title: string,
    cardIds: string[],
    kind: "cards" | "units" | "astrologers" | "events",
    empoweredAbilities?: string[]
  ) => void;
}) {
  // Read the Balance-Pack flag BEFORE any early return (rules of hooks), then
  // resolve the face through the shared pure precedence helper.
  const balanceArt = usePolishBalanceArtEnabled();
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  // Top of the discard is face-up — show the actual card graphic (not a bare
  // count); an Empowered ability shows its printed Empowered face (or, under the
  // Polish Balance Pack, the card's reprinted face).
  const topDiscardId = player.discard.length > 0 ? player.discard[player.discard.length - 1] : undefined;
  const topDiscard = topDiscardId ? cardLibrary[topDiscardId] : undefined;
  const topImage =
    resolveCardFaceImage(balanceArt, topDiscardId, cardIsEmpoweredFor(topDiscardId, player.empoweredAbilities)) ??
    topDiscard?.assets?.cardImage;

  return (
    <div className="ownDeckPile" aria-label="Your deck and discard">
      <div
        className="ownDeckSpot"
        data-fx-anchor={`deck:${viewerPlayerId}`}
        title="Your draw deck (face down — reshuffles from the discard when empty)"
      >
        <img alt="Your deck back" className="ownDeckBack" src={assetUrl(getDeckBack("player").image ?? CARD_BACK_IMAGES.mm)} />
        <span className="ownDeckCount">{player.deckCount}</span>
        <small>Deck</small>
      </div>
      <button
        className={`ownDiscardSpot${topDiscardId ? " hasCard" : ""}`}
        data-fx-anchor={`discard:${viewerPlayerId}`}
        onClick={() => onShowPile(`${player.name} — discard pile`, player.discard, "cards", player.empoweredAbilities)}
        title={
          topDiscard
            ? `Discard top: ${topDiscard.name} (${player.discard.length} total) — click to browse`
            : "Open your discard pile"
        }
        type="button"
      >
        {topImage ? (
          <img
            alt={topDiscard?.name ?? "Discard top"}
            className="ownDiscardTop"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={assetUrl(topImage)}
          />
        ) : topDiscardId ? (
          <span className="ownDiscardFallback">{topDiscard?.name ?? topDiscardId}</span>
        ) : (
          <span className="ownDeckCount">0</span>
        )}
        {/* The face is `position: absolute; inset: 0`, so the badge rides the
            already-relative button beside the count — never a wrapper. */}
        <CardSetCornerBadge cardId={topDiscardId} />
        <span className="ownDiscardBadge">{player.discard.length}</span>
        <small>Discard</small>
      </button>
    </div>
  );
}

export function AdventureDecksPanel({
  view,
  viewerPlayerId,
  onShowPile,
  onAction,
  scoutableDeckIds
}: {
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  /** Shared-deck piles have no owner, so no empoweredAbilities is ever passed here. */
  onShowPile: (
    title: string,
    cardIds: string[],
    kind: "cards" | "units" | "astrologers" | "events",
    empoweredAbilities?: string[]
  ) => void;
  onAction?: (action: GameAction) => void;
  /** Deck ids the active player's Rogues may scout this turn. */
  scoutableDeckIds?: Set<string>;
}) {
  const scout = (deckId: string) =>
    onAction?.({ type: "ROGUES_SCOUT_DECK", playerId: viewerPlayerId, deckId });

  // Legacy: Spells / Abilities / Artifacts. BINH: Basic + Expert Spells and
  // the Minor/Major/Relic artifact decks — whatever this game actually has.
  const sharedDeckIds = [
    "spells",
    "spells-expert",
    "abilities",
    "artifacts",
    "artifacts-minor",
    "artifacts-major",
    "artifacts-relic"
  ];
  const sharedDecks = sharedDeckIds
    .filter((deckId) => Boolean(view.decks[deckId]))
    .map((deckId) => ({ id: deckId, name: deckDisplayName(view, deckId) }));

  const astrologers = view.decks.astrologers;
  const eventsDeck = view.decks.events;

  return (
    <section className="advDecks" aria-label="Shared decks and discard piles">
      {sharedDecks.map((deck) => {
        const deckState = view.decks[deck.id];
        if (!deckState) {
          return null;
        }
        const topId =
          deckState.discardPile.length > 0
            ? deckState.discardPile[deckState.discardPile.length - 1]
            : undefined;
        const topCard = topId ? cardLibrary[topId] : undefined;
        const topImage = topCard?.assets?.cardImage;
        return (
          <div className="advDeckRow" key={deck.id}>
            <div className="advDeck" title={`${deck.name} deck (face down)`} data-fx-anchor={`deck:shared-${deck.id}`}>
              {getDeckBack(deck.id).image ? (
                <img alt={`${deck.name} deck back`} className="cardBack small" src={assetUrl(getDeckBack(deck.id).image)} />
              ) : (
                <div className={`cardBack small shared back-${deck.id}`}>
                  <span>{deck.name[0]}</span>
                </div>
              )}
              <small>
                {deck.name} {deckState.drawCount}
              </small>
            </div>
            <button
              className={`advDiscard${topId ? " hasCard" : ""}`}
              data-fx-anchor={`discard:shared-${deck.id}`}
              onClick={() => onShowPile(`${deck.name} — discard pile`, deckState.discardPile, "cards")}
              title={
                topCard
                  ? `${deck.name} discard top: ${topCard.name} (${deckState.discardPile.length}) — click to browse`
                  : `${deck.name} discard pile`
              }
              type="button"
            >
              {topImage ? (
                <img
                  alt={topCard?.name ?? "Discard top"}
                  className="advDiscardTop"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={assetUrl(topImage)}
                />
              ) : topId ? (
                <span className="advDiscardFallback">{topCard?.name ?? "?"}</span>
              ) : (
                <span>{deckState.discardPile.length}</span>
              )}
              {/* The Artifact deck's own discard top — the most-seen set-member
                  face on the map. The face fills the relative button, so this is
                  the bare corner badge. */}
              <CardSetCornerBadge cardId={topId} />
              {topId ? <span className="advDiscardBadge">{deckState.discardPile.length}</span> : null}
              <small>Discard</small>
            </button>
            {scoutableDeckIds?.has(deck.id) ? (
              <button
                className="advScout"
                onClick={() => scout(deck.id)}
                title="Rogues: look at the top card of this deck"
                type="button"
              >
                🔎<small>Scout</small>
              </button>
            ) : null}
          </div>
        );
      })}
      {astrologers ? (
        <div className="advDeckRow">
          <div className="advDeck" title="Astrologers Proclaim deck (drawn every even round)">
            <img alt="Astrologers deck back" className="cardBack small" src={assetUrl(CARD_BACK_IMAGES.astrologers)} />
            <small>Astrologers {astrologers.drawCount}</small>
          </div>
          {(() => {
            const topId =
              astrologers.discardPile.length > 0
                ? astrologers.discardPile[astrologers.discardPile.length - 1]
                : undefined;
            const topCard = topId ? astrologersCardDefinitions[topId] : undefined;
            return (
              <button
                className={`advDiscard${topId ? " hasCard" : ""}`}
                onClick={() => onShowPile("Astrologers Proclaim — past rounds", astrologers.discardPile, "astrologers")}
                aria-label={`Open Astrologers discard pile (${astrologers.discardPile.length} cards)`}
                title={topCard ? `Last proclamation: ${topCard.name}` : "Past Astrologers proclamations"}
                type="button"
              >
                {topCard?.image ? (
                  <img
                    alt={topCard.name}
                    className="advDiscardTop"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={assetUrl(topCard.image)}
                  />
                ) : (
                  <span>{astrologers.discardPile.length}</span>
                )}
                {topId ? <span className="advDiscardBadge">{astrologers.discardPile.length}</span> : null}
                <small>Past</small>
              </button>
            );
          })()}
        </div>
      ) : null}
      {eventsDeck ? (
        <div className="advDeckRow">
          <div className="advDeck" title="Event deck (Fortress expansion, drawn every Resource round)">
            <img alt="Event deck back" className="cardBack small" src={assetUrl(getDeckBack("events").image)} />
            <small>Events {eventsDeck.drawCount}</small>
          </div>
          {(() => {
            const topId =
              eventsDeck.discardPile.length > 0
                ? eventsDeck.discardPile[eventsDeck.discardPile.length - 1]
                : undefined;
            const topCard = topId ? eventCardDefinitions[topId] : undefined;
            return (
              <button
                className={`advDiscard${topId ? " hasCard" : ""}`}
                onClick={() => onShowPile("Events — past rounds", eventsDeck.discardPile, "events")}
                title={topCard ? `Last Event: ${topCard.name}` : "Past Events"}
                type="button"
              >
                {topCard?.image ? (
                  <img
                    alt={topCard.name}
                    className="advDiscardTop"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    src={assetUrl(topCard.image)}
                  />
                ) : (
                  <span>{eventsDeck.discardPile.length}</span>
                )}
                {topId ? <span className="advDiscardBadge">{eventsDeck.discardPile.length}</span> : null}
                <small>Past</small>
              </button>
            );
          })()}
        </div>
      ) : null}
      <div className="advDeckRow neutral">
        {(["bronze", "silver", "gold", "azure"] as const).map((tier) => {
          const deckId = NEUTRAL_DECK_IDS[tier];
          const deckState = view.decks[deckId];
          if (!deckState) {
            return null;
          }
          const canScout = scoutableDeckIds?.has(deckId);
          return (
            <div className="neutralDeckCell" key={tier}>
              <button
                className={`neutralDeck ${tier}`}
                onClick={() => onShowPile(`Neutral ${tier} — discard pile`, deckState.discardPile, "units")}
                style={{ backgroundImage: `url(${assetUrl(CARD_BACK_IMAGES.neutral)})` }}
                title={`Neutral ${tier} deck: ${deckState.drawCount} cards, ${deckState.discardPile.length} discarded`}
                type="button"
              >
                <span>{deckState.drawCount}</span>
                <small>{tier}</small>
              </button>
              {canScout ? (
                <button
                  className="advScout"
                  onClick={() => scout(deckId)}
                  title={`Rogues: look at the top card of the neutral ${tier} deck`}
                  type="button"
                >
                  🔎
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Spell Book (house rule): the real, openable grimoire now lives in its own
// module (spell-book-modal.tsx) so the COMBAT hand-fan shelf can open the same
// full two-page book without importing this whole screen (which itself imports
// table components — a cycle). Re-exported here so existing imports hold.
// ---------------------------------------------------------------------------

export { SpellBookModal } from "./spell-book-modal";

export function PileModal({
  title,
  cardIds,
  kind,
  empoweredAbilities,
  onClose
}: {
  title: string;
  cardIds: string[];
  kind: "cards" | "units" | "astrologers" | "events";
  /** The pile OWNER's empowered ability card ids (absent for shared decks). */
  empoweredAbilities?: string[];
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
        {kind === "astrologers" && cardIds.length > 0 ? (
          <small className="pileModalHint">
            Discarded proclamations are shown newest first. The top card is the last resolved Astrologers event.
          </small>
        ) : null}
        <PileModalCards cardIds={cardIds} kind={kind} empoweredAbilities={empoweredAbilities} />
      </div>
    </div>
  );
}

function PileModalCards({
  cardIds,
  kind,
  empoweredAbilities
}: {
  cardIds: string[];
  kind: "cards" | "units" | "astrologers" | "events";
  empoweredAbilities?: string[];
}) {
  const { zoomCard, zoomContent } = useCardZoom();
  // A row's face is resolved inside the .map() below, where a hook cannot run —
  // so the rule is read once here and passed to the shared pure resolver.
  const balanceArt = usePolishBalanceArtEnabled();

  return (
    <ul>
      {[...cardIds].reverse().map((cardId, index) => {
        const card = kind === "cards" ? cardLibrary[cardId] : undefined;
        const unit = kind === "units" ? coreUnitDefinitions[cardId] : undefined;
        const astro = kind === "astrologers" ? astrologersCardDefinitions[cardId] : undefined;
        const eventCard = kind === "events" ? eventCardDefinitions[cardId] : undefined;
        // Empowered Statistics are intrinsic (flagged from the card alone);
        // Empowered ABILITIES are per-owner — the pile producers pass the
        // owner's empoweredAbilities so a browsed pile shows the printed
        // Empowered face too (shared decks pass nothing: nobody owns those).
        const empowered = kind === "cards" && cardIsEmpoweredFor(cardId, empoweredAbilities);
        const image =
          (kind === "cards" ? resolveCardFaceImage(balanceArt, cardId, empowered) : undefined) ??
          card?.assets?.cardImage ??
          unit?.neutral?.cardImage ??
          astro?.image ??
          eventCard?.image;
        const zoom = () =>
          card
            ? zoomCard(cardId, empowered)
            : zoomContent({
                title: eventCard?.name ?? astro?.name ?? unit?.name ?? cardId,
                image,
                subtitle: eventCard ? "Event" : astro ? "Astrologers Proclaim" : unit ? `${unit.tier} ${unit.type}` : undefined,
                lines: [
                  eventCard?.text ?? astro?.text ?? unit?.neutral?.abilityText ?? "",
                  ...implementedAbilityLines(unit?.neutral?.abilities)
                ].filter(Boolean)
              });
        return (
          <li key={`${cardId}-${index}`}>
            <button className="pileCardButton" onClick={zoom} title="Read card" type="button">
              {image ? (
                <img
                  alt={card?.name ?? unit?.name ?? cardId}
                  className={empowered ? "empoweredCard" : undefined}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={assetUrl(image)}
                />
              ) : (
                <div className={`pileFallback${empowered ? " empoweredCard" : ""}`}>
                  {astro?.name ?? card?.name ?? unit?.name ?? cardName(cardId)}
                </div>
              )}
              {empowered ? (
                <span className="empoweredBadge empoweredBadgeOverlay">
                  <Sparkles aria-hidden="true" size={9} /> Empowered
                </span>
              ) : null}
              {/* Same positioned button as the Empowered overlay above, so the
                  set badge rides it too (browsing a discard pile must show which
                  cards are set pieces). */}
              <CardSetCornerBadge cardId={kind === "cards" ? cardId : undefined} />
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
// Pre-battle preparation notice (shown over the adventure MAP)
// ---------------------------------------------------------------------------

/**
 * The player-vs-player pre-battle preparation notice. When an enemy hero attacks,
 * BOTH sides prepare here — on the map, with their town, resources and army in
 * full view — spending any remaining town actions (build / recruit / buy spells
 * at the town panel to the right) before pressing "Accept the battle". Deployment
 * begins only once both the attacker and the defender have accepted; either side
 * may instead Retreat / Surrender out of the fight. Renders nothing outside an
 * open PvP prep window. It is styled as a fixed non-modal notice, so it does not
 * consume map layout space or block the surrounding controls.
 */
export function PreBattlePanel({
  state,
  viewerPlayerId,
  legalActions,
  onAction,
  onOpenTown
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  /** Opens the Town window so preparation shopping stays one click away. */
  onOpenTown?: () => void;
}) {
  const combat = state.combat;
  const prep = combat?.prep;
  if (!combat || !prep || combat.context.kind !== "player") {
    return null;
  }

  const attackerId = combat.attackerPlayerId;
  const defenderId = combat.defenderPlayerId;
  const attackerName = state.players[attackerId]?.name ?? "Attacker";
  const defenderName = state.players[defenderId]?.name ?? "Defender";
  const siege = combat.context.kind === "player" && combat.context.siege;
  const hasAccepted = (id: PlayerId) => prep.accepted.includes(id);

  const viewerIsParticipant = viewerPlayerId === attackerId || viewerPlayerId === defenderId;
  // A participant who has not yet pressed Accept — still free to spend town actions.
  const viewerPreparing = inCombatPrep(state, viewerPlayerId);
  const opponentId = viewerPlayerId === attackerId ? defenderId : attackerId;

  const accept = legalActions.find((legal) => legal.action.type === "ACCEPT_COMBAT");
  const escapeActions = legalActions.filter(
    (legal) => legal.action.type === "RETREAT_FROM_COMBAT" || legal.action.type === "SURRENDER_COMBAT"
  );
  // The town actions this player may still spend before the fight (build a
  // structure, recruit/reinforce a unit, buy spells). They already work from the
  // town panel on the right, but surfacing them HERE — inside the prep prompt the
  // attacked player is looking at — makes "buy/build before the battle" a single
  // obvious click instead of a hunt across the board. Same engine action either
  // way; this is just a second, in-context entry point.
  const townActions = legalActions.filter(
    (legal) =>
      legal.action.type === "BUILD_STRUCTURE" ||
      legal.action.type === "POPULATION_ACTION" ||
      legal.action.type === "SPELL_BOOK_ACTION"
  );

  const readyChip = (id: PlayerId, name: string, role: string) => (
    <span className={`prepReadyChip ${hasAccepted(id) ? "ready" : "waiting"}`} key={id}>
      {hasAccepted(id) ? <Check aria-hidden="true" size={12} /> : null}
      {name} ({role}) — {hasAccepted(id) ? "ready" : "preparing…"}
    </span>
  );

  return (
    <div aria-label="Prepare for battle" aria-modal="false" className="preBattlePanel" role="dialog">
      <div className="preBattleHeader">
        <Swords aria-hidden="true" size={16} />
        <strong>
          Battle! {attackerName} attacks {defenderName}
          {siege ? " (siege)" : ""}
        </strong>
      </div>
      <div className="prepReadyRow">
        {readyChip(attackerId, attackerName, "attacker")}
        {readyChip(defenderId, defenderName, "defender")}
      </div>
      {viewerPreparing ? (
        <>
          <strong className="prepCardReminder">
            Play artifacts and other available cards from your hand before accepting. Legion discounts apply to troops
            bought in this window.
          </strong>
          <small className="prepNote">
            Prepare before the fight: spend any town actions you have left this round (build, recruit, buy spells) — right
            here below, or in your town window (the Town button). Units you recruit now join your army in time to be
            deployed. When you are ready, accept the battle — deployment begins once both sides accept.
          </small>
          <MgqBattleSpiritPicker
            legalActions={legalActions}
            onAction={onAction}
            playerId={viewerPlayerId}
            state={state}
          />
          {townActions.length > 0 || onOpenTown ? (
            <div className="prepTownActions" aria-label="Spend a town action before the battle">
              <small className="prepNote">Buy / build now:</small>
              <div className="prepButtons">
                {onOpenTown ? (
                  <button
                    className="commandButton"
                    onClick={onOpenTown}
                    title="Open the town window to build, recruit and buy spells before the battle"
                    type="button"
                  >
                    <Castle aria-hidden="true" size={12} /> Open town
                  </button>
                ) : null}
                {townActions.map((legal) => (
                  <button
                    className="commandButton"
                    key={actionKey(legal.action)}
                    onClick={() => onAction(legal.action)}
                    type="button"
                  >
                    {legal.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="prepButtons">
            {accept ? (
              <button
                className="commandButton primary combatReadyButton"
                onClick={() => onAction(accept.action)}
                type="button"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className="combatButtonIcon"
                  src={assetUrl("/assets/ui/combat-button.png")}
                />
                Accept the battle
              </button>
            ) : null}
            {escapeActions.map((legal) => {
              const isSurrender = legal.action.type === "SURRENDER_COMBAT";
              const vpOn = Boolean(state.adventure?.mapPreset?.victoryPoints?.enabled);
              const label =
                isSurrender && vpOn
                  ? `${legal.label} (opponent gains 1 VP)`
                  : legal.label;
              return (
                <button
                  className="commandButton"
                  key={actionKey(legal.action)}
                  onClick={() => onAction(legal.action)}
                  title={
                    isSurrender && vpOn
                      ? "Surrendering awards the opponent 1 Victory Point (not the full 3 VP main-hero defeat)."
                      : undefined
                  }
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      ) : viewerIsParticipant ? (
        <small className="prepNote">
          You are ready. Waiting for {state.players[opponentId]?.name ?? "your opponent"} to accept the battle…
        </small>
      ) : (
        <small className="prepNote">
          {attackerName} and {defenderName} are preparing for battle on the map…
        </small>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combat deployment panel: drag units onto the board (click still works)
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

  // PvP pre-battle preparation happens on the adventure MAP (see PreBattlePanel),
  // not here on the battlefield — so deployment never opens while `prep` is set.
  // This guard only fires on the rare path where the deploy sidebar renders
  // before the map forces itself in front; it keeps stale deploy controls hidden.
  if (combat.prep) {
    return (
      <div className="placementPanel" aria-label="Combat setup">
        <strong>Preparing for battle</strong>
        <small>Both sides are preparing on the map. Deployment opens once both accept the battle.</small>
      </div>
    );
  }

  const myTurn = setup.pendingPlayerIds[0] === viewerPlayerId;
  const placed = setup.placedUnitIds[viewerPlayerId] ?? [];
  const versusNeutrals = combat.context.kind === "neutral";
  // Creature Bank battlefield: guardians hold the corners, you deploy centrally.
  const versusBank =
    combat.context.kind === "neutral" && Boolean(combat.context.bankFormation || combat.context.bankId);

  const placeActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }> } =>
      legal.action.type === "PLACE_COMBAT_UNIT"
  );
  const finish = legalActions.find((legal) => legal.action.type === "FINISH_COMBAT_PLACEMENT");
  const unplaceActions = legalActions.filter((legal) => legal.action.type === "UNPLACE_COMBAT_UNIT");
  // A PvP hero may Retreat while still deploying (before any unit fights). Only
  // present in player-vs-player setups (see addPvpRetreatDuringSetup).
  const retreatDuringSetup = legalActions.find((legal) => legal.action.type === "RETREAT_FROM_COMBAT");

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
      {versusNeutrals ? (
        <small className="placementNote">
          The guard army is drawn and revealed only after you lock your deployment in (rulebook combat setup).
        </small>
      ) : null}
      <MgqBattleSpiritPicker
        legalActions={legalActions}
        onAction={onAction}
        playerId={viewerPlayerId}
        state={state}
      />
      <div className="placementUnits">
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const portrait = armyUnitPrintedSide(def, unit.side, unit.unitDefId)?.cardImage;
          const isPlaced = placed.includes(unit.id);
          const canPlace = placeActions.some((legal) => legal.action.armyUnitId === unit.id);
          const canDrag = canPlace || isPlaced;
          return (
            <button
              className={`placementUnit ${canDrag ? "unitDraggable" : ""} ${selectedUnitId === unit.id ? "selected" : ""} ${isPlaced ? "placed" : ""}`}
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
              onPointerDown={(event) => {
                if (!canDrag) {
                  return;
                }
                // Pointer-based drag works on touch + mouse + pen alike (the old
                // HTML5 native drag was mouse-only). A short press still falls
                // through to onClick (select / take back).
                beginUnitPointerDrag(event, {
                  portraitUrl: portrait,
                  onDrop: (position) =>
                    onAction({ type: "PLACE_COMBAT_UNIT", playerId: viewerPlayerId, armyUnitId: unit.id, position })
                });
              }}
              title={isPlaced ? "Drag to another space, or click to take back" : "Drag onto your two rows (or click, then pick a space)"}
              type="button"
            >
              {portrait ? (
                <img alt="" className="placementUnitPortrait" draggable={false} loading="lazy" src={assetUrl(portrait)} />
              ) : (
                <span className={`tierDot ${def?.tier}`} />
              )}
              {(unit.stacks ?? 0) > 0 ? (
                <span
                  className={`armyStackBadge placement count-${Math.min(3, unit.stacks ?? 0)} active`}
                  title={`${unit.stacks} Polish Unit Stack${unit.stacks === 1 ? "" : "s"}: +1 Attack; each Stack absorbs one full Pack health bar.`}
                >
                  <img alt="" aria-hidden="true" src={assetUrl("/assets/ui/polish-unit-stacks-coin.webp")} />
                  ×{unit.stacks}
                </span>
              ) : null}
              <span className="placementUnitName">
                {unit.side} {def?.name ?? unit.unitDefId}
                {isPlaced ? " ✓" : ""}
              </span>
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
        <small>
          {versusBank
            ? "Drag units into the central six squares — the bank's four guardians hold the corners. Placed units can be dragged around freely until you lock in."
            : "Drag units onto your back and front lines — placed units can be dragged around freely until you lock in."}
        </small>
      )}
      {finish ? (
        <button className="commandButton primary combatReadyButton" onClick={() => onAction(finish.action)} type="button">
          <img alt="" aria-hidden="true" className="combatButtonIcon" src={assetUrl("/assets/ui/combat-button.png")} />
          {versusNeutrals ? "Lock in — reveal the guards" : "Ready for battle"}
        </button>
      ) : null}
      {retreatDuringSetup ? (
        <button className="commandButton" onClick={() => onAction(retreatDuringSetup.action)} type="button">
          {retreatDuringSetup.label}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map-setup lobby: pick a faction and hero, set the game options, start
// ---------------------------------------------------------------------------

// DIFFICULTY_CHOICES lives in setup-hub-summary.ts (shared with the Map window's
// chess-piece difficulty bar).

/** Building ids (without the faction prefix) offered as pre-built options. */
const STARTING_BUILDING_CHOICES: { id: string; label: string }[] = [
  { id: "city_hall", label: "City Hall" },
  { id: "citadel", label: "Citadel (where the faction has one)" },
  { id: "mage_guild", label: "Mage Guild" },
  { id: "dwelling_bronze", label: "Bronze Dwelling" },
  { id: "dwelling_silver", label: "Silver Dwelling" },
  { id: "dwelling_gold", label: "Gold Dwelling" }
];

/**
 * The three quick starting-army choices offered alongside the manual picker
 * (with a Random roll between them): open with two low Packs, one mid Pack, or a
 * single high-tier Few. Applying a preset replaces the whole army selection.
 */
const STARTING_UNIT_PRESETS: {
  key: string;
  label: string;
  hint: string;
  units: CustomStartingUnit[];
}[] = [
  {
    key: "lv12-pack",
    label: "Lv 1 & 2 Pack",
    hint: "Start with a Pack of your level-1 and level-2 units",
    units: [
      { level: 1, side: "pack" },
      { level: 2, side: "pack" }
    ]
  },
  {
    key: "lv3-pack",
    label: "Lv 3 Pack",
    hint: "Start with a Pack of your level-3 unit only",
    units: [{ level: 3, side: "pack" }]
  },
  {
    key: "lv4-few",
    label: "Lv 4 Few",
    hint: "Start with a Few of your level-4 unit only",
    units: [{ level: 4, side: "few" }]
  }
];

/**
 * Starting units, one mode: a few/pack/none pick per unit level 1-7. Every
 * player receives their own faction's unit of each picked level (faction
 * unit lists run level 1 → 7). A preset/Random row above offers the three
 * quick army choices.
 */
function StartingUnitsPicker({
  startingUnits,
  viewerFactionId,
  onChange
}: {
  startingUnits: CustomStartingUnit[];
  viewerFactionId: string | null;
  onChange: (next: CustomStartingUnit[]) => void;
}) {
  const sideOfLevel = new Map<number, "few" | "pack">();
  for (const choice of startingUnits) {
    if (choice.level) {
      sideOfLevel.set(choice.level, choice.side);
    }
  }

  const setLevel = (level: UnitLevel, side: "few" | "pack" | null) => {
    const next: CustomStartingUnit[] = UNIT_LEVELS.flatMap((candidate) => {
      const chosen = candidate === level ? side : (sideOfLevel.get(candidate) ?? null);
      return chosen ? [{ level: candidate, side: chosen }] : [];
    });
    onChange(next);
  };

  const faction = viewerFactionId ? coreFactionDefinitions[viewerFactionId] : null;

  const signature = (units: CustomStartingUnit[]) =>
    units
      .map((unit) => `${unit.level}${unit.side[0]}`)
      .sort()
      .join(",");
  const currentSignature = signature(startingUnits.filter((unit) => unit.level));
  const activePreset = STARTING_UNIT_PRESETS.find((preset) => signature(preset.units) === currentSignature);

  return (
    <div className="startingUnits" aria-label="Starting units by level">
      <div className="startingUnitPresets" aria-label="Quick army presets">
        {STARTING_UNIT_PRESETS.map((preset) => (
          <button
            aria-pressed={activePreset?.key === preset.key}
            className={`startingUnitPreset ${activePreset?.key === preset.key ? "selected" : ""}`}
            key={preset.key}
            onClick={() => onChange(preset.units.map((unit) => ({ ...unit })))}
            title={preset.hint}
            type="button"
          >
            {preset.label}
          </button>
        ))}
        <button
          className="startingUnitPreset random"
          onClick={() => {
            const pick = STARTING_UNIT_PRESETS[Math.floor(Math.random() * STARTING_UNIT_PRESETS.length)];
            onChange(pick.units.map((unit) => ({ ...unit })));
          }}
          title="Roll one of the three starting-army choices at random"
          type="button"
        >
          <Dices size={13} /> Random
        </button>
      </div>
      {UNIT_LEVELS.map((level) => {
        const side = sideOfLevel.get(level) ?? null;
        const tier = tierOfLevel(level);
        const unitName = faction ? coreUnitDefinitions[faction.units[level - 1]]?.name : null;
        return (
          <div className="startingUnitRow" key={level}>
            <span className="startingUnitLevel" title={`Each player gets their faction's level ${level} unit (${tier})`}>
              <span className={`tierDot ${tier}`} />
              Level {level}
              {unitName ? <small> {unitName}</small> : null}
            </span>
            <span className="optionButtons">
              <button
                aria-pressed={side === null}
                className={side === null ? "selected" : ""}
                onClick={() => setLevel(level, null)}
                type="button"
              >
                None
              </button>
              <button
                aria-pressed={side === "few"}
                className={side === "few" ? "selected" : ""}
                onClick={() => setLevel(level, "few")}
                title="Start with the Few side of this level's unit"
                type="button"
              >
                Few
              </button>
              <button
                aria-pressed={side === "pack"}
                className={side === "pack" ? "selected" : ""}
                onClick={() => setLevel(level, "pack")}
                title="Start with the Pack side of this level's unit"
                type="button"
              >
                Pack
              </button>
            </span>
          </div>
        );
      })}
      <small className="optionHint">
        One pick per level — every player receives their own faction&apos;s unit of that level
        {viewerFactionId ? " (names shown for your faction)" : ""}.
      </small>
    </div>
  );
}

/**
 * Unified Map picker. "Starting map" (a built-in scenario sheet) and "Map
 * design" (a designed map saved in the /designer) used to be two separate
 * controls, which let a stale designed map stay attached after the scenario was
 * switched underneath it. They are ONE category — the map you play on — so this
 * single picker lists both, clearly split into the built-in scenario sheets and
 * the designed maps a PERSON made (each tagged with its author). The two groups
 * are mutually exclusive: picking a scenario clears any designed map (and the
 * engine drops a stale one on a bare scenario switch — see setGameOptions), and
 * picking a designed map switches to the scenario it was built on.
 */
function MapPicker({
  options,
  send,
  singlePlayer = false
}: {
  options: GameSetupOptions;
  send: (next: Partial<GameSetupOptions>) => void;
  singlePlayer?: boolean;
}) {
  const [savedMaps, setSavedMaps] = useState<SharedMapRecord[]>([]);

  // The library lives on the SHARED server now, so every player in the lobby
  // sees the same maps. Re-fetch when the tab regains focus so a map saved (by
  // anyone) in the designer shows up here right away.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchSharedMaps().then((maps) => {
        if (!cancelled) {
          setSavedMaps(maps);
        }
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  // A built-in scenario sheet is in play whenever no designed map is loaded —
  // the ENGINE's own reading (designedMapInPlay), shared with the Map window
  // and the Map box so all three can never disagree about what is in play.
  const usingScenarioSheet = !designedMapInPlay(options);

  return (
    <div className="mapPicker">
      <div className="mapPickerGroup">
        <small className="mapPickerGroupLabel">Scenario sheets · built-in</small>
        <div className="optionButtons">
          {Object.values(scenarioDefinitions).map((scenario) => {
            const selected = usingScenarioSheet && options.scenarioId === scenario.id;
            return (
              <button
                aria-pressed={selected}
                className={selected ? "selected" : ""}
                key={scenario.id}
                // Picking a scenario sheet uses its own face-down layout and
                // drops any designed map (sent together so the engine never
                // leaves a stale map attached to a different scenario). It does
                // NOT touch `customMode` — the game MODE belongs to the
                // Game-mode box, and a map pick must never silently drop it.
                onClick={() =>
                  send({
                    scenarioId: scenario.id,
                    ...(singlePlayer ? { playerCount: scenario.minPlayers } : {}),
                    customMap: null,
                    customMapName: null
                  })
                }
                title={scenario.description}
                type="button"
              >
                {scenario.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mapPickerGroup">
        <small className="mapPickerGroupLabel">Designed maps · custom-made by a person</small>
        <div className="optionButtons">
          {savedMaps.length === 0 ? (
            <small className="optionHint">None yet — create one in the map designer below.</small>
          ) : (
            savedMaps.map((record) => {
              const scenario = scenarioDefinitions[record.scenarioId];
              const problems = designedMapBlockers(
                record.tiles.length,
                scenario ? validateCustomMapPlan(record.tiles, scenario, record.players).problems : ["Unknown scenario."]
              );
              const selected =
                designedMapInPlay(options) &&
                options.customMapName === record.name &&
                options.customMap?.length === record.tiles.length;
              const author = record.createdByName?.trim() || null;
              return (
                <button
                  aria-pressed={selected}
                  className={`designedMap ${selected ? "selected" : ""}`}
                  disabled={problems.length > 0}
                  key={record.id}
                  // A saved map carries the seat count it was designed for; switch
                  // the scenario first (so playerCount clamps to the new scenario),
                  // open that many seats, then apply the map. SET_GAME_OPTIONS
                  // processes scenarioId → playerCount → customMap in that order,
                  // and keeps the map because customMap is sent in the same action.
                  // `customMode` is deliberately NOT sent — see applyEntry in
                  // map-pick-modal.tsx: the game MODE is the Game-mode box's.
                  onClick={() =>
                    send({
                      ...(record.scenarioId !== options.scenarioId ? { scenarioId: record.scenarioId } : {}),
                      playerCount: singlePlayer
                        ? 1 +
                          (singlePlayerMapDeployment(
                            record.tiles,
                            scenario ? Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1 : 0
                          )?.computers.length ?? Math.max(1, record.players - 1))
                        : record.players,
                      customMap: record.tiles,
                      customMapName: record.name,
                      customMapPreset: record.preset ?? null
                    })
                  }
                  title={
                    problems.length > 0
                      ? `Needs fixing in the designer: ${problems[0]}`
                      : `${record.tiles.length} tiles on ${scenario?.name ?? record.scenarioId}${
                          author ? ` · made by ${author}` : ""
                        }${record.preset ? " · has map conditions" : ""}`
                  }
                  type="button"
                >
                  🗺 {record.name}
                  <small className="mapAuthor">
                    {" "}
                    {author ? `by ${author}` : "by a player"}
                    {record.preset ? " · conditions" : ""}
                  </small>
                </button>
              );
            })
          )}
        </div>
      </div>

      {designedMapInPlay(options) ? (
        <div className="mapPresetLobbyNote">
          <small className="optionHint">
            Playing the designed map {options.customMapName ? `“${options.customMapName}” ` : ""}with{" "}
            {options.customMap!.length} tile{options.customMap!.length === 1 ? "" : "s"} — face-down Secret landmarks
            draw a random matching tile from their pool.
          </small>
          {(() => {
            const fixedSeats = options.customMap!.filter(
              (plan) => plan.group === "starting" && plan.lockRotation
            ).length;
            return fixedSeats > 0 ? (
              <small className="optionHint">
                🔒 {fixedSeats} starting tile{fixedSeats === 1 ? "" : "s"} {fixedSeats === 1 ? "has" : "have"} a fixed
                orientation — {fixedSeats === 1 ? "that seat skips" : "those seats skip"} the opening free-rotation.
              </small>
            ) : null;
          })()}
          {/* The Ⅶ Grail / Utopia reward-stacking line rides the TILES, so the
              banner can be worth showing even with no preset conditions. */}
          {describeCustomMapPresetEntries(options.customMapPreset, options.customMap).length > 0 ? (
            <div className="mapPresetLobbyBanner" role="status">
              <strong>📜 This map has special conditions</strong>
              <ul className="mapPresetEntryList">
                {describeCustomMapPresetEntries(options.customMapPreset, options.customMap).map((entry) => (
                  <li key={entry.text}>
                    <span className="mapPresetEntryIcon" aria-hidden="true">
                      {entry.icon}
                    </span>
                    {entry.text}
                  </li>
                ))}
              </ul>
              <small className="mapPresetLobbyHint">
                Seeded into the game options — the host can still adjust them before the game starts.
              </small>
            </div>
          ) : null}
        </div>
      ) : null}
      <small className="optionHint designerLink">
        <Link href="/designer" target="_blank">
          <Hammer aria-hidden="true" size={11} /> Open the map designer
        </Link>{" "}
        to create, edit and save your own maps (shared with everyone), then pick one above. Picking a designed map opens
        the seat count it was designed for.
      </small>
    </div>
  );
}

/**
 * "Custom setting" — FILE-based save/load of the lobby's whole map + rules
 * setup (user spec: Save writes the current setting to a file, Load opens a
 * file picker; every player keeps their own files). The loaded options run
 * through the normal SET_GAME_OPTIONS pipeline, so an old file from a previous
 * patch has its unknown fields skipped and any invalid value rejected with the
 * engine's own message instead of corrupting the lobby.
 */
function PersonalCustomSettingsPanel({
  options,
  send
}: {
  options: GameSetupOptions;
  send: (next: Partial<GameSetupOptions>) => void;
}) {
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saveToFile = () => {
    const payload = buildCustomSetupFile(options, name);
    const fileName = customSetupFileName(payload.name);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    // Keep the selected card visibly in Custom mode even when the setting was
    // saved while another mode preset was active.
    send({ customMode: true });
    setNotice(`Saved “${payload.name}” to ${fileName}.`);
  };

  const loadFromFile = async (file: File) => {
    const parsed = parseCustomSetupFile(await file.text());
    if (!parsed.ok) {
      setNotice(parsed.reason);
      return;
    }
    send(parsed.options);
    setNotice(
      `Loaded “${parsed.name}”.${
        parsed.sameEngineVersion
          ? ""
          : " It was saved by a different game version — options a patch changed are skipped or rejected with a message."
      }`
    );
  };

  return (
    <div className="personalCustomSettings" aria-label="Custom setting — save or load a file">
      <div className="mapPickerGroupLabel">
        <strong>Custom setting — file</strong>
        <small>
          Saves <b>every</b> setting from all four tabs — Mode &amp; Rules, Match, Map &amp; Setup and Town &amp; Resources (mode,
          mods, house rules, victory, difficulty, the designed map, and starting resources/units/buildings) — to a file;
          load a file to restore them all. Your faction &amp; hero are picked per game and are not saved. Each player
          keeps their own files.
        </small>
      </div>
      <div className="personalCustomSaveRow">
        <input
          aria-label="Custom setting name"
          maxLength={48}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              saveToFile();
            }
          }}
          placeholder="Setting name (used in the file name)"
          value={name}
        />
        <button onClick={saveToFile} title="Download every setting from all four tabs (not faction/hero) as a file" type="button">
          Save to file
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Choose a saved setting file and apply it to this lobby"
          type="button"
        >
          Load from file…
        </button>
        <input
          accept=".json,application/json"
          aria-label="Choose a custom setting file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Allow re-picking the same file after a failed/edited load.
            event.target.value = "";
            if (file) {
              void loadFromFile(file);
            }
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>
      {notice ? (
        <small className="optionHint" role="status">
          {notice}
        </small>
      ) : null}
      <small className="optionHint">
        Designer maps are shared with the whole table (pick one in the Map box); setting files are only for you.
      </small>
    </div>
  );
}

function ResourceStepper({
  label,
  iconSrc,
  value,
  onChange
}: {
  label: string;
  /** Board-game resource token art (gold coin / materials / valuables). */
  iconSrc?: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="optionStepper">
      <small className="optionStepperLabel">
        {iconSrc ? (
          <img alt="" aria-hidden="true" className="optionStepperIcon" decoding="async" src={assetUrl(iconSrc)} />
        ) : null}
        <span>{label}</span>
      </small>
      <div>
        <button aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, value - 1))} type="button">
          <Minus size={11} />
        </button>
        <span>{value}</span>
        <button aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)} type="button">
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}

type OptionsTabId = "rules" | "play" | "map" | "army";

/** The Game-Setup tab bar. Each tab groups a logical slice of the options. */
const OPTION_TABS: { id: OptionsTabId; label: string; icon: ReactNode }[] = [
  { id: "rules", label: "Mode & Rules", icon: <Swords size={13} /> },
  { id: "play", label: "Match", icon: <Crown size={13} /> },
  { id: "map", label: "Map & Setup", icon: <ImageIcon size={13} /> },
  { id: "army", label: "Town & Resources", icon: <Castle size={13} /> }
];

/** Every binary setup row uses the same convention: On left, Off right. */
const BOOLEAN_OPTION_ORDER = [true, false] as const;

const HOUSE_RULE_CATEGORY_LABELS: Record<string, string> = {
  decks: "Decks",
  units: "Unit buffs",
  abilities: "Abilities & heroes",
  combat: "Combat & map rules",
  global: "Global map rules",
  polish: "Polish house rule type 1"
};

/** Optional crest/icon for a house-rule GROUP header (paths under public/). */
const HOUSE_RULE_CATEGORY_ICONS: Record<string, string | undefined> = {
  global: REWARD_GLYPH_ICONS.map
};

// "global" now lives in its OWN collapsible ("Global map rules"), a peer of the
// BINH / Polish panels (user request) — no longer nested inside BINH house rules.
const BINH_HOUSE_RULE_CATEGORIES = ["decks", "units", "abilities", "combat"] as const;
const GLOBAL_HOUSE_RULE_CATEGORIES = ["global"] as const;

function houseRuleToggleDisabled(
  ruleId: HouseRuleId,
  houseRules: Record<HouseRuleId, boolean>,
  creatureBanksEnabled: boolean
): boolean {
  return (
    (ruleId === "polish-bank-sizes" && !creatureBanksEnabled) ||
    (ruleId === "polish-random-artifacts" && !houseRules["split-decks"])
  );
}

/** Optional crest/icon for individual house-rule toggles (paths under public/). */
const HOUSE_RULE_ICONS: Partial<Record<(typeof HOUSE_RULES)[number]["id"], string>> = {
  "polish-rule-111": UI_REWARD_ICONS.rule111,
  "mine-guard-reinforcement": REWARD_GLYPH_ICONS.treasure,
  "mine-army-defense": REWARD_GLYPH_ICONS.defense
};

function HouseRuleToggleButton({
  rule,
  on,
  disabled,
  lockedOn = false,
  onToggle
}: {
  rule: (typeof HOUSE_RULES)[number];
  on: boolean;
  disabled: boolean;
  lockedOn?: boolean;
  onToggle: () => void;
}) {
  const iconSrc = HOUSE_RULE_ICONS[rule.id];
  return (
    <button
      aria-pressed={on}
      className={`houseRuleToggle ${on ? "on" : "off"} ${disabled ? "disabled" : ""}`}
      disabled={disabled}
      onClick={onToggle}
      title={
        lockedOn
          ? `${rule.description} This rule is always on in BINH.`
          : disabled
          ? rule.id === "polish-random-artifacts"
            ? `${rule.description} Turn Split Spell/Artifact decks on first.`
            : `${rule.description} Turn Creature Banks on in Map & Setup first.`
          : rule.description
      }
      type="button"
    >
      <span aria-hidden="true" className="houseRuleCheck">
        {on ? <Check size={13} /> : null}
      </span>
      <span className="houseRuleText">
        <strong className="houseRuleLabelRow">
          {iconSrc ? (
            <img
              alt=""
              aria-hidden="true"
              className="houseRuleToggleIcon"
              draggable={false}
              src={assetUrl(iconSrc)}
            />
          ) : null}
          {rule.label}
        </strong>
        <small>{rule.description}</small>
      </span>
      <span className={`houseRuleState ${on ? "on" : "off"}`}>
        {lockedOn ? "BINH · ON" : disabled ? "BANKS OFF" : on ? "ON" : "OFF"}
      </span>
    </button>
  );
}

/**
 * Collapsible panel for a bundle of house-rule checkboxes. Stays in place —
 * only the body expands/collapses. Default is minimized so the Mode & Rules
 * tab stays short, with a clear "expand" affordance on the header.
 */
function HouseRuleCollapsible({
  id,
  title,
  subtitle,
  crestSrc,
  crestClassName,
  open,
  onToggle,
  onCount,
  totalCount,
  children,
  variant = "binh"
}: {
  id: string;
  title: string;
  subtitle: string;
  crestSrc?: string;
  crestClassName?: string;
  open: boolean;
  onToggle: () => void;
  onCount: number;
  totalCount: number;
  children: ReactNode;
  variant?: "binh" | "polish" | "tournament";
}) {
  const panelId = `${id}-panel`;
  return (
    <div className={`houseRuleCollapsible ${variant} ${open ? "open" : "collapsed"}`}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="houseRuleCollapsibleHead"
        onClick={onToggle}
        title={open ? `Collapse ${title}` : `Expand ${title} — show all toggles`}
        type="button"
      >
        <span className="houseRuleCollapsibleLead">
          {crestSrc ? (
            <img alt="" aria-hidden="true" className={crestClassName ?? "houseRuleCollapsibleCrest"} src={crestSrc} />
          ) : null}
          <span className="houseRuleCollapsibleTitles">
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
        </span>
        <span className="houseRuleCollapsibleMeta">
          <span className={`houseRuleCollapsibleCount ${onCount > 0 ? "hasOn" : ""}`} title={`${onCount} of ${totalCount} on`}>
            {onCount}/{totalCount} on
          </span>
          <span className={`houseRuleCollapsibleChevron ${open ? "open" : ""}`} aria-hidden="true">
            <ChevronDown size={16} strokeWidth={2.5} />
          </span>
          <span className="houseRuleCollapsibleHint">{open ? "Minimize" : "Expand"}</span>
        </span>
      </button>
      {open ? (
        <div className="houseRuleCollapsibleBody" id={panelId} role="region" aria-label={title}>
          {children}
        </div>
      ) : (
        <button
          aria-controls={panelId}
          className="houseRuleCollapsiblePeek"
          onClick={onToggle}
          type="button"
        >
          <span className="houseRuleCollapsiblePeekDots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Click to expand full checklist · {totalCount} rules</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Label strip for an option row — optional crest/card-back art + title text. */
function OptionRowLabel({
  title,
  hint,
  iconSrc,
  iconClassName,
  icons
}: {
  title: string;
  hint?: string;
  iconSrc?: string;
  iconClassName?: string;
  /** Multiple icons (e.g. positive + negative morale backs). */
  icons?: string[];
}) {
  const srcs = icons?.length ? icons : iconSrc ? [iconSrc] : [];
  return (
    <span className="optionRowLabel" title={hint}>
      {srcs.length > 0 ? (
        <span className={`optionRowIcons ${srcs.length > 1 ? "pair" : ""}`} aria-hidden="true">
          {srcs.map((src) => (
            <img
              alt=""
              className={iconClassName ?? "optionRowIcon"}
              decoding="async"
              key={src}
              src={assetUrl(src)}
            />
          ))}
        </span>
      ) : null}
      <span className="optionRowLabelText">{title}</span>
    </span>
  );
}

/**
 * One-click "Enable all / Disable all" for a group of house rules — for players
 * who run the same package every game. Enabling turns on every rule that CAN be
 * enabled (dependency-blocked ones like Rolled Bank Sizes without Creature Banks
 * are skipped); disabling turns the whole group off. All in a single dispatch.
 */
function GroupToggleAllButton({
  rules,
  groupLabel,
  houseRules,
  creatureBanksEnabled,
  setHouseRules,
  enableExtras
}: {
  rules: (typeof HOUSE_RULES)[number][];
  groupLabel: string;
  houseRules: Record<HouseRuleId, boolean>;
  creatureBanksEnabled: boolean;
  setHouseRules: (updates: Partial<Record<HouseRuleId, boolean>>) => void;
  /**
   * Companion rules auto-enabled alongside the group (e.g. the Polish package
   * pulls in "split-decks" — divided Artifact decks — which its Random
   * Artifacts rule depends on). Dependency checks are evaluated AS IF the
   * extras were already on, so a rule blocked only by an extra still enables
   * in the same dispatch. Never touched by "Disable all".
   */
  enableExtras?: Partial<Record<HouseRuleId, boolean>>;
}) {
  // Evaluate dependencies as if the auto-enabled companions were already on
  // (they land in the SAME dispatch), so e.g. Random Artifacts is not skipped
  // just because Divided decks is currently off.
  const withExtras = { ...houseRules, ...enableExtras };
  const enableable = rules.filter(
    (rule) => !houseRuleToggleDisabled(rule.id, withExtras, creatureBanksEnabled)
  );
  const allOn = enableable.length > 0 && enableable.every((rule) => houseRules[rule.id]);
  const anyOn = rules.some((rule) => houseRules[rule.id]);
  // Nothing to do only if the group cannot be enabled AND is already all-off.
  const inert = enableable.length === 0 && !anyOn;
  const apply = () => {
    const updates: Partial<Record<HouseRuleId, boolean>> = {};
    if (allOn) {
      for (const rule of rules) updates[rule.id] = false;
    } else {
      for (const [id, value] of Object.entries(enableExtras ?? {})) {
        if (value && !houseRules[id as HouseRuleId]) {
          updates[id as HouseRuleId] = true;
        }
      }
      for (const rule of enableable) updates[rule.id] = true;
    }
    setHouseRules(updates);
  };
  return (
    <button
      aria-label={`${allOn ? "Disable" : "Enable"} all ${groupLabel} rules`}
      className={`houseRuleGroupToggleAll ${allOn ? "on" : "off"}`}
      disabled={inert}
      onClick={apply}
      title={
        allOn
          ? `Turn every ${groupLabel} rule off`
          : `Turn on every ${groupLabel} rule (dependency-blocked rules are skipped)`
      }
      type="button"
    >
      {allOn ? "Disable all" : "Enable all"}
    </button>
  );
}

/**
 * One category's header + toggle grid, rendered straight from the engine
 * registry. Shared by the BINH and the standalone Global map-rules panels so
 * their markup can never drift. Returns null for an empty category.
 */
function HouseRuleCategoryGroup({
  category,
  houseRules,
  creatureBanksEnabled,
  setHouseRule,
  setHouseRules
}: {
  category: string;
  houseRules: Record<HouseRuleId, boolean>;
  creatureBanksEnabled: boolean;
  setHouseRule: (id: HouseRuleId, value: boolean) => void;
  setHouseRules: (updates: Partial<Record<HouseRuleId, boolean>>) => void;
}) {
  const rules = HOUSE_RULES.filter((rule) => rule.category === category);
  if (rules.length === 0) {
    return null;
  }
  const groupIconSrc = HOUSE_RULE_CATEGORY_ICONS[category];
  return (
    <div className="houseRuleGroup" key={category}>
      <div className="houseRuleGroupHeader">
        <span className="houseRuleGroupLabel">
          {groupIconSrc ? (
            <img
              alt=""
              aria-hidden="true"
              className="houseRuleGroupIcon"
              draggable={false}
              src={assetUrl(groupIconSrc)}
            />
          ) : null}
          {HOUSE_RULE_CATEGORY_LABELS[category]}
        </span>
        <GroupToggleAllButton
          creatureBanksEnabled={creatureBanksEnabled}
          groupLabel={HOUSE_RULE_CATEGORY_LABELS[category]}
          houseRules={houseRules}
          rules={rules}
          setHouseRules={setHouseRules}
        />
      </div>
      <div className="houseRuleGrid">
        {rules.map((rule) => (
          <HouseRuleToggleButton
            disabled={houseRuleToggleDisabled(rule.id, houseRules, creatureBanksEnabled)}
            key={rule.id}
            lockedOn={false}
            on={houseRules[rule.id]}
            onToggle={() => setHouseRule(rule.id, !houseRules[rule.id])}
            rule={rule}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The individual house-rule toggles, rendered straight from the engine registry
 * so the menu and the engine never drift. Each button flips exactly one rule
 * (the reducer merges it); the value shown is the resolved effective boolean.
 *
 * BINH core rules, the Global map rules, and Polish type-1 rules each live in
 * their own collapsible panel (default minimized) so the Mode & Rules tab stays
 * scannable.
 */
function HouseRulesSection({
  houseRules,
  creatureBanksEnabled,
  setHouseRule,
  setHouseRules
}: {
  houseRules: Record<HouseRuleId, boolean>;
  creatureBanksEnabled: boolean;
  setHouseRule: (id: HouseRuleId, value: boolean) => void;
  setHouseRules: (updates: Partial<Record<HouseRuleId, boolean>>) => void;
}) {
  // Default minimized — expand only when the host digs into the checklist.
  const [binhOpen, setBinhOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [polishOpen, setPolishOpen] = useState(false);

  const binhRules = HOUSE_RULES.filter((rule) =>
    (BINH_HOUSE_RULE_CATEGORIES as readonly string[]).includes(rule.category)
  );
  const globalRules = HOUSE_RULES.filter((rule) =>
    (GLOBAL_HOUSE_RULE_CATEGORIES as readonly string[]).includes(rule.category)
  );
  // The Polish package shares these artifact re-tier switches with BINH: both
  // rows edit the same rules. Grail/Utopia is a map-designer concern now; its
  // legacy id remains loadable for old saves but is no longer offered here.
  const polishRules = HOUSE_RULES.filter(
    (rule) =>
      rule.id === "torso-of-legion-major" ||
      rule.id === "eversmoking-ring-of-sulfur-major" ||
      (rule.category === "polish" && rule.id !== "polish-grail-utopia")
  );
  const binhOn = binhRules.filter((rule) => houseRules[rule.id]).length;
  const globalOn = globalRules.filter((rule) => houseRules[rule.id]).length;
  const polishOn = polishRules.filter((rule) => houseRules[rule.id]).length;

  return (
    <div className="houseRuleSection" aria-label="House rules">
      <div className="houseRuleHead">
        <strong>House rules</strong>
        <small>
          BINH starts with its core tweaks on. Polish house rule type 1 stays opt-in, and Legacy clears every rule.
          Expand a section to flip individual checkboxes.
        </small>
      </div>

      <HouseRuleCollapsible
        crestSrc={assetUrl("/assets/ui/mode-binh-crest-clear.webp")}
        crestClassName="houseRuleCollapsibleCrest binh"
        id="binh-house-rules"
        onCount={binhOn}
        onToggle={() => setBinhOpen((v) => !v)}
        open={binhOpen}
        subtitle="Core BINH tweaks — decks, units, abilities, combat"
        title="BINH house rules"
        totalCount={binhRules.length}
        variant="binh"
      >
        {BINH_HOUSE_RULE_CATEGORIES.map((category) => (
          <HouseRuleCategoryGroup
            category={category}
            creatureBanksEnabled={creatureBanksEnabled}
            houseRules={houseRules}
            key={category}
            setHouseRule={setHouseRule}
            setHouseRules={setHouseRules}
          />
        ))}
        <p className="houseRuleAlwaysOn">
          <Info size={11} aria-hidden="true" />
          <span>
            Earthquake already matches the wiki, so there is nothing to toggle — its Power-2 collapse of the Arrow Tower
            is the standard “a full breach fells the tower” rule, not a buff.
          </span>
        </p>
      </HouseRuleCollapsible>

      <HouseRuleCollapsible
        crestSrc={assetUrl(REWARD_GLYPH_ICONS.map)}
        crestClassName="houseRuleCollapsibleCrest global"
        id="global-map-rules"
        onCount={globalOn}
        onToggle={() => setGlobalOpen((v) => !v)}
        open={globalOpen}
        subtitle="Map-wide difficulty tweaks — apply to every game on any map"
        title="Global map rules"
        totalCount={globalRules.length}
        variant="binh"
      >
        {GLOBAL_HOUSE_RULE_CATEGORIES.map((category) => (
          <HouseRuleCategoryGroup
            category={category}
            creatureBanksEnabled={creatureBanksEnabled}
            houseRules={houseRules}
            key={category}
            setHouseRule={setHouseRule}
            setHouseRules={setHouseRules}
          />
        ))}
      </HouseRuleCollapsible>

      <HouseRuleCollapsible
        crestSrc={assetUrl("/assets/ui/polish-house-rules-flag.webp")}
        crestClassName="houseRuleCollapsibleCrest polish"
        id="polish-house-rules"
        onCount={polishOn}
        onToggle={() => setPolishOpen((v) => !v)}
        open={polishOpen}
        subtitle="Optional competitive Polish package — all opt-in, default off"
        title="Polish house rule type 1"
        totalCount={polishRules.length}
        variant="polish"
      >
        <div className="houseRuleGroup polish">
          <div className="houseRuleGroupHeader">
            <span className="houseRuleGroupLabel">Whole Polish package</span>
            <GroupToggleAllButton
              creatureBanksEnabled={creatureBanksEnabled}
              enableExtras={{ "split-decks": true }}
              groupLabel="Polish"
              houseRules={houseRules}
              rules={polishRules}
              setHouseRules={setHouseRules}
            />
          </div>
          <div className="houseRuleGrid">
            {polishRules.map((rule) => (
              <HouseRuleToggleButton
                disabled={houseRuleToggleDisabled(rule.id, houseRules, creatureBanksEnabled)}
                key={rule.id}
                lockedOn={false}
                on={houseRules[rule.id]}
                onToggle={() => setHouseRule(rule.id, !houseRules[rule.id])}
                rule={rule}
              />
            ))}
          </div>
        </div>
      </HouseRuleCollapsible>
    </div>
  );
}

/** High-level setup modes shown as a card row (SetupModeId lives in setup-hub-summary.ts). */
const SETUP_MODE_CARDS: {
  id: SetupModeId;
  label: string;
  blurb: string;
  hint: string;
  /** Optional crest art under public/assets/ui (passed through assetUrl). */
  iconSrc?: string;
}[] = [
  {
    id: "legacy",
    label: "Legacy",
    blurb: "Printed rulebook",
    hint: "Turns every house rule off. Toggles stay free — re-enable any rule you want.",
    // Falls back to a book-ish glyph if the crest is not yet present.
    iconSrc: "/assets/ui/mode-legacy-crest-clear.webp"
  },
  {
    id: "binh",
    label: "BINH",
    blurb: "House-rule edition",
    hint: "Default fan edition: every house rule on, Spell Book on. Mods (WOG) stay free to toggle.",
    // Classic griffin-on-blue-shield crest (transparent, blends into the panel).
    iconSrc: "/assets/ui/mode-binh-crest-clear.webp"
  },
  {
    id: "tournament",
    label: "Tournament",
    blurb: "Competitive preset",
    hint: "Tier-split Spell/Artifact decks, other house rules off, tournament bans on, Hard difficulty, human-controlled Neutrals.",
    iconSrc: "/assets/ui/mode-tournament-crest-clear.webp"
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "Your saved setup",
    hint: "Save the current map & rules to a file, or load one of your setting files — each player keeps their own."
  }
];

/**
 * The Game-mode section: the four mode preset cards plus the WOG/Anime mod
 * rows and their portal option windows. Shared by the full Game-options panel
 * (Mode & Rules tab) and the Setup Hub's Game-mode window — one wiring, two
 * hosts. `onCustomSelected` lets the host navigate to its custom-settings
 * surface when the Custom card is picked; `customNotice`/`customHint` let it
 * word the Custom texts for its own layout.
 */
function GameModeSection({
  state,
  viewerPlayerId,
  onAction,
  onCustomSelected,
  customNotice,
  customHint
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  onCustomSelected?: () => void;
  customNotice?: string;
  customHint?: string;
}) {
  const [wogOptionsOpen, setWogOptionsOpen] = useState(false);
  const [animeOptionsOpen, setAnimeOptionsOpen] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }

  const options = lobby.options;
  const wog = { ...DEFAULT_WOG_OPTIONS, ...options.wog };
  const anime = { ...DEFAULT_ANIME_OPTIONS, ...options.anime };
  const send = (next: Partial<GameSetupOptions>) =>
    onAction({ type: "SET_GAME_OPTIONS", playerId: viewerPlayerId, options: next });

  /** Which big mode card is highlighted from the current options. */
  const activeSetupMode = deriveActiveSetupMode(options);

  const applySetupMode = (mode: SetupModeId) => {
    if (mode === "custom") {
      send({ customMode: true });
      onCustomSelected?.();
      setModeNotice(
        customNotice ??
          "Custom mode selected: save the current setup to a file, or load a setting file, in Map & Setup."
      );
      return;
    }
    if (mode === "legacy") {
      send({
        ...MODE_PRESET_PAYLOADS.legacy,
        wog: { ...wog, enabled: false },
        anime: { ...anime, enabled: false }
      });
      setModeNotice(
        "Legacy mode applied: every house rule is off (printed rulebook). " +
          "Nothing is locked — you can re-enable any house rule, Spell Book, or tournament rule below. " +
          "WOG and Anime (Mods) are off under Legacy."
      );
      return;
    }
    if (mode === "binh") {
      // BINH does not force WOG off — the Mod row is independent.
      send({ ...MODE_PRESET_PAYLOADS.binh });
      setModeNotice(null);
      return;
    }
    // Tournament competitive preset — turns WOG + Anime off with the competitive
    // package. Neutrals default to human control (next player clockwise).
    send({
      ...MODE_PRESET_PAYLOADS.tournament,
      wog: { ...wog, enabled: false },
      anime: { ...anime, enabled: false }
    });
    setModeNotice(
      "Tournament mode applied: Spell/Artifact decks split by tier, other house rules off, Diplomacy + Hourglass banned, second player +1 morale, " +
        "Hard difficulty, and Neutrals under human control (next player clockwise). Toggles below stay free if you need to adjust."
    );
  };

  return (
    <>
      <div className="optionRow modePresetRow">
        <small title="One-click presets. Individual rules below stay editable after any preset.">Game mode</small>
        <div className="modePresetGrid" role="group" aria-label="Game mode presets">
          {SETUP_MODE_CARDS.map((card) => (
            <button
              aria-pressed={activeSetupMode === card.id}
              className={`modePresetCard mode-${card.id} ${activeSetupMode === card.id ? "selected" : ""}`}
              key={card.id}
              onClick={() => applySetupMode(card.id)}
              title={card.hint}
              type="button"
            >
              {card.iconSrc ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="modePresetIcon"
                  decoding="async"
                  src={assetUrl(card.iconSrc)}
                />
              ) : null}
              <span className="modePresetCardText">
                <strong>{card.label}</strong>
                <span>{card.blurb}</span>
                <small>{card.hint}</small>
              </span>
            </button>
          ))}
        </div>
        <small className="optionHint">
          {activeSetupMode === "custom"
            ? customHint ??
              "Personal custom setup: in Map & Setup, save the current map & rules to a file or load one of your setting files."
            : activeSetupMode === "legacy"
            ? RULESET_DESCRIPTIONS.legacy
            : activeSetupMode === "tournament"
            ? "Competitive preset: rulebook baseline + tournament deck bans + tier-split Spell/Artifact decks + Hard difficulty + human-controlled Neutrals."
            : RULESET_DESCRIPTIONS.binh}
        </small>
      </div>

      {modeNotice ? (
        <div className="modeNoticeBanner" role="status">
          <Info size={14} aria-hidden="true" />
          <p>{modeNotice}</p>
          <button aria-label="Dismiss notice" onClick={() => setModeNotice(null)} type="button">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className={`optionRow wogOptionRow ${wog.enabled ? "enabled" : ""}`}>
        <small title="Optional modules you can stack on a game mode (not a separate mode)">Mod</small>
        <div className="wogOptionControls">
          <button
            aria-label={wog.enabled ? "Disable Wake of Gods mod" : "Enable Wake of Gods mod"}
            aria-pressed={wog.enabled}
            className={`wogCrestButton ${wog.enabled ? "selected" : ""}`}
            onClick={() => {
              const nextEnabled = !wog.enabled;
              // Keep any module choices already made; the reducer flips a Legacy
              // table to BINH when WOG is enabled so the modules can load.
              send({
                wog: {
                  ...DEFAULT_WOG_OPTIONS,
                  ...wog,
                  enabled: nextEnabled
                }
              });
              if (nextEnabled) {
                setWogOptionsOpen(true);
              }
            }}
            title={
              wog.enabled
                ? "WOG on — click to turn off. Configure commanders / neutrals / objects."
                : "Enable the Wake of Gods mod (works with BINH; turning it on while Legacy switches to BINH)."
            }
            type="button"
          >
            <img
              alt=""
              aria-hidden="true"
              className="wogCrestIcon"
              decoding="async"
              src={assetUrl("/assets/ui/mod-wog-eye-clear.webp")}
              onError={(event) => {
                // Prefer clear HD eye; fall back to classic pixel eye if missing.
                const img = event.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.src = assetUrl("/assets/ui/mod-wog-eye.webp");
                }
              }}
            />
            <strong>WOG</strong>
            <span>{wog.enabled ? "ON" : "OFF"}</span>
          </button>
          <div className="wogOptionSummary">
            <strong>Wake of Gods</strong>
            <small>
              {wog.enabled
                ? "Enabled — configure commanders, neutrals and objects"
                : "Optional mod — stack with BINH house rules, Event deck, Morale Cards, …"}
            </small>
            {wog.enabled ? (
              <button className="wogConfigureButton" onClick={() => setWogOptionsOpen(true)} type="button">
                Mod options
              </button>
            ) : null}
          </div>
        </div>
        <small className="optionHint">
          WOG is a mod, not a game mode — toggle it on alongside house rules and other optional rules. Enabling it
          under Legacy switches the table to BINH so the modules can load.
        </small>
      </div>

      <div className={`optionRow wogOptionRow animeOptionRow ${anime.enabled ? "enabled" : ""}`}>
        <small title="Optional modules you can stack on a game mode (not a separate mode)">Mod</small>
        <div className="wogOptionControls">
          <button
            aria-label={anime.enabled ? "Disable Anime mod" : "Enable Anime mod"}
            aria-pressed={anime.enabled}
            className={`wogCrestButton animeCrestButton ${anime.enabled ? "selected" : ""}`}
            onClick={() => {
              const nextEnabled = !anime.enabled;
              // Keep any module choices already made; the reducer flips a Legacy
              // table to BINH when the Anime mod is enabled so it can load.
              send({
                anime: {
                  ...DEFAULT_ANIME_OPTIONS,
                  ...anime,
                  enabled: nextEnabled
                }
              });
              if (nextEnabled) {
                setAnimeOptionsOpen(true);
              }
            }}
            title={
              anime.enabled
                ? "Anime mod on — click to turn off. Configure map objects / artifacts / cultivation / grades / equipment."
                : "Enable the Anime mod (Ninefold Realms × Otherworld Gate — works with BINH; turning it on while Legacy switches to BINH)."
            }
            type="button"
          >
            <img
              alt=""
              aria-hidden="true"
              className="wogCrestIcon"
              decoding="async"
              src={assetUrl("/assets/ui/mod-anime-crest-clear.webp")}
              onError={(event) => {
                // Prefer the transparent crest; fall back to the dark-backdrop variant.
                const img = event.currentTarget;
                if (!img.dataset.fallback) {
                  img.dataset.fallback = "1";
                  img.src = assetUrl("/assets/ui/mod-anime-crest.webp");
                }
              }}
            />
            <strong>Anime</strong>
            <span>{anime.enabled ? "ON" : "OFF"}</span>
          </button>
          <div className="wogOptionSummary">
            <strong>Anime mod</strong>
            <small>
              {anime.enabled
                ? "Enabled — configure map objects, artifacts, cultivation, grades and equipment"
                : "Optional mod — Ninefold Realms × Otherworld Gate; stack with BINH, WOG and other rules"}
            </small>
            {anime.enabled ? (
              <button className="wogConfigureButton" onClick={() => setAnimeOptionsOpen(true)} type="button">
                Mod options
              </button>
            ) : null}
          </div>
        </div>
        <small className="optionHint">
          Anime is a mod, not a game mode — stack it alongside WOG, house rules and other optional rules. Enabling it
          under Legacy switches the table to BINH so the modules can load.
        </small>
      </div>

      {wog.enabled && wogOptionsOpen && typeof document !== "undefined"
        ? createPortal((
          <div className="wogWindowBackdrop" onMouseDown={() => setWogOptionsOpen(false)}>
          <section
            aria-label="Wake of Gods mod options"
            aria-modal="true"
            className="wogOptionsWindow"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <span className="wogWindowEyebrow">Optional mod</span>
                <h4>Wake of Gods</h4>
              </div>
              <button aria-label="Close WOG options" onClick={() => setWogOptionsOpen(false)} type="button">
                <X size={16} />
              </button>
            </header>
            <div className="wogModuleList">
              {([
                ["newCreatures", "New neutral creatures", "Adds the WOG roster to the Bronze, Silver, Gold and Azure Neutral decks."],
                ["commanders", "Commanders", "Every player gets their faction's commander: it fights in the main hero's battles as the army's 5th unit (you deploy up to 4), grades up at hero level 2, 4 and 6, and casts a command ability once per combat round."],
                ["artifacts", "Artifacts", "Shuffles 5 Wake of Gods hero Artifact cards (Magic Wand, Gate Key, Crimson Shield, Warlord's Banner, Dragonheart) into the shared Artifact decks by tier."],
                ["newObjects", "New adventure objects", "Adds 3 Wake of Gods single-hex map objects to the Field Override pool: Emerald Tower (guarded; trains your commander or hero), Mirror of the Home-Way (pay 2 gold to teleport to a Town), and Junk Merchant (sell weak Artifacts / buy an Artifact search). Turns Field Overrides on."],
                ["unitExperience", "Unit experience", "WoG Unit Experience System (board adaptation): units surviving won battles gain XP and veteran ranks — stat bonuses, an Elite ability per faction's signature unit, XP dilution on reinforce, and Drill training anywhere (1 movement outside Towns, Settlements and Random Towns)."],
                ["neutralRankUp", "Neutral rank-up", "Neutral-OWNED guards toughen with the round: bronze Seasoned/Veteran/Elite at rounds 3/5/8; silver at 6/8/12; gold at 6/10/14. Creature Banks use Far 4/6/9 or Near 6/8/12. Winning against Veteran guards adds +1 unit XP; Elite adds +2. This never gates player-controlled recruited Neutral XP."],
                ["monsterWaves", "Monster waves", "Calamity Waves: every Nth round, EVERY live player fights a themed invasion at round start. A Far-tile Calamity Gate can be visited beforehand to cancel that wave's battle event for you. Standard and Brutal rewards/pillage are configurable below, as is optional elimination after repeated defeats."],
                ["raidBosses", "Raid bosses", "A persistent multi-layer world boss lairs in a Rift Lair near map center from round 5 (announced one round ahead). Its wounds persist between attempts; every layer YOU break pays 2 gold at once, and the kill pays 5 gold + a relic-tier Artifact search. An ignored boss regrows a layer every 4th round."],
                ["dungeon", "Dungeon Gate", "Adds one shared Dungeon Gate. Each player tracks their own floor and sees the same seeded rooms. Choose a room, defeat the floor guard, and claim escalating rewards; floors 5 and 10 have bosses. Entering uses normal movement, and continuing after a win uses the cost selected below."]
              ] as const).map(([key, label, description]) => {
                const active = wog[key];
                return (
                  <button
                    aria-pressed={active}
                    className={`wogModuleToggle ${active ? "selected" : ""}`}
                    key={key}
                    onClick={() => send({ wog: { ...wog, [key]: !active } })}
                    type="button"
                  >
                    <span className="wogModuleCheck">{active ? <Check size={15} /> : null}</span>
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </button>
                );
              })}
              {wog.monsterWaves ? (
                <div className="waveCadenceRow" role="group" aria-label="Wave cadence">
                  <strong>Wave cadence</strong>
                  {([3, 4, 5] as const).map((cadence) => (
                    <button
                      aria-pressed={(wog.waveCadence ?? 4) === cadence}
                      className={`waveCadenceChip ${(wog.waveCadence ?? 4) === cadence ? "selected" : ""}`}
                      key={cadence}
                      onClick={() => send({ wog: { ...wog, waveCadence: cadence } })}
                      type="button"
                    >
                      Every {cadence === 3 ? "3rd" : `${cadence}th`} round
                    </button>
                  ))}
                </div>
              ) : null}
              {/* No PvE THEME picker for WOG: the Doom theme is an anime-mod
                  feature, so WOG's PvE encounters are always the classic
                  (Erathian) world. The theme picker lives in the Anime mod
                  window instead. */}
              {wog.raidBosses ? (
                <div className="waveCadenceRow pveSettingRow" role="group" aria-label="Raid boss arrival">
                  <strong>Rift Lair arrival</strong>
                  {([4, 5, 6] as const).map((round) => (
                    <button
                      aria-pressed={(wog.raidBossSpawnRound ?? 5) === round}
                      className={`waveCadenceChip ${(wog.raidBossSpawnRound ?? 5) === round ? "selected" : ""}`}
                      key={round}
                      onClick={() => send({ wog: { ...wog, raidBossSpawnRound: round } })}
                      type="button"
                    >
                      Round {round}
                    </button>
                  ))}
                  <small>Warning appears one round earlier.</small>
                </div>
              ) : null}
              {wog.dungeon ? (
                <>
                  <div className="waveCadenceRow pveSettingRow" role="group" aria-label="Dungeon campaign length">
                    <strong>Dungeon campaign</strong>
                    {([5, 10] as const).map((depth) => (
                      <button
                        aria-pressed={(wog.dungeonDepth ?? 10) === depth}
                        className={`waveCadenceChip ${(wog.dungeonDepth ?? 10) === depth ? "selected" : ""}`}
                        key={depth}
                        onClick={() => send({ wog: { ...wog, dungeonDepth: depth } })}
                        type="button"
                      >
                        {depth === 5 ? "5-floor expedition" : "10-floor campaign"}
                      </button>
                    ))}
                  </div>
                  <div className="waveCadenceRow pveSettingRow" role="group" aria-label="Continue after a Dungeon win">
                    <strong>Continue after a win</strong>
                    {([0, 1, 2] as const).map((cost) => (
                      <button
                        aria-pressed={(wog.dungeonDescentCost ?? 1) === cost}
                        className={`waveCadenceChip ${(wog.dungeonDescentCost ?? 1) === cost ? "selected" : ""}`}
                        key={cost}
                        onClick={() => send({ wog: { ...wog, dungeonDescentCost: cost } })}
                        type="button"
                      >
                        {cost === 0 ? "Free" : `${cost} movement`}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {wog.monsterWaves ? (
                <>
                  <div className="waveCadenceRow" role="group" aria-label="Wave pressure">
                    <strong>Rewards &amp; pillage</strong>
                    {(["standard", "brutal"] as const).map((pressure) => (
                      <button
                        aria-pressed={(wog.wavePressure ?? "standard") === pressure}
                        className={`waveCadenceChip ${(wog.wavePressure ?? "standard") === pressure ? "selected" : ""}`}
                        key={pressure}
                        onClick={() => send({ wog: { ...wog, wavePressure: pressure } })}
                        type="button"
                      >
                        {pressure === "standard" ? "Standard" : "Brutal (+rewards, -1 morale)"}
                      </button>
                    ))}
                  </div>
                  <div className="waveCadenceRow" role="group" aria-label="Wave loss limit">
                    <strong>Lost waves</strong>
                    {([0, 3, 2] as const).map((limit) => (
                      <button
                        aria-pressed={(wog.waveDefeatLimit ?? 0) === limit}
                        className={`waveCadenceChip ${(wog.waveDefeatLimit ?? 0) === limit ? "selected" : ""}`}
                        key={limit}
                        onClick={() => send({ wog: { ...wog, waveDefeatLimit: limit } })}
                        type="button"
                      >
                        {limit === 0 ? "Pillage only" : `Eliminate after ${limit}`}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <div className="wogRosterPreview" aria-label="WOG neutral creature roster">
              <strong>Neutral roster</strong>
              <span><i className="tierDot bronze" /> Santa Gremlin</span>
              <span><i className="tierDot silver" /> Ghost · Messengers · War Zealot · Sharpshooters · Sylvan Centaur · Werewolf</span>
              <span><i className="tierDot gold" /> Nightmare · Hell Steed · Gorynych</span>
              <span><i className="tierDot azure" /> Dracolich</span>
            </div>
            <footer>
              <button className="selected" onClick={() => setWogOptionsOpen(false)} type="button">Done</button>
            </footer>
          </section>
          </div>
        ), document.body)
        : null}

      {anime.enabled && animeOptionsOpen && typeof document !== "undefined"
        ? createPortal((
          <div className="wogWindowBackdrop" onMouseDown={() => setAnimeOptionsOpen(false)}>
          <section
            aria-label="Anime mod options"
            aria-modal="true"
            className="wogOptionsWindow animeOptionsWindow"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <span className="wogWindowEyebrow">Optional mod</span>
                <h4>Anime mod</h4>
              </div>
              <button aria-label="Close Anime options" onClick={() => setAnimeOptionsOpen(false)} type="button">
                <X size={16} />
              </button>
            </header>
            <small className="wogWindowDesc">
              Ninefold Realms × Otherworld Gate — a stack of BINH-family modules (xianxia + isekai). Tick
              only what you want; each is independent and coexists with WOG and the house rules. Doom is
              available as its own explicit neutral-monster checkbox below.
            </small>
            <div className="wogModuleList">
              {([
                ["isekaiTowns", "Fuyuki + Hidden Leaf + Azur Lane + Little Busters", "Adds four complete anime towns: Fuyuki City, Hidden Leaf Village, Azur Lane Naval Base, and Little Busters Campus — each with seven units, original heroes, its town board, buildings, starting tile, commander, and themed progression."],
                ["xianxiaTowns", "Azure Breeze Sect", "Adds the complete wuxia sect: 7-unit cultivation roster, two original heroes, its mountain town board, buildings, starting tile, and wuxia-themed system vocabulary."],
                ["doomNeutrals", "Doom monsters", "Adds the 16 classic Doom neutral monsters across the exact Bronze, Silver, Gold and Azure decks. Independent checkbox; off by default."],
                ["mapObjects", "Map objects (Ninefold locations)", "Adds the anime single-hex map locations (Secret Realm, Sword Mound, Merchant Guild Post, gambling den, hot spring, …) to the Field Override pool. Turns Field Overrides on."],
                ["combatEvents", "Forced battle events", "Scripted combat events on anime fields (the Bí Cảnh spirit-mist / earthvein-surge). Fully automatic — no new prompts."],
                ["xianxiaArtifacts", "Pháp Bảo artifacts", "Shuffles 5 anime hero Artifact cards (Túi Càn Khôn, Phong Hỏa Luân, Tru Tiên Kiếm, Bát Quái Kính, Tụ Linh Bàn) into the shared Artifact decks by tier."],
                ["cultivation", "Cultivation realms", "A per-hero Cultivation Realm track (hand limit / reroll / spell Power) plus the Heavenly Tribulation map action."],
                ["heroGrades", "Hero Grades", "A per-hero Merit → grade track that unlocks a small passive / skill tree (shared by every hero)."],
                ["equipment", "Hero Equipment", "Always-on hero items in 4 slots (weapon / armor / accessory / mount), bought at outfitter map locations."],
                ["unitStacks", "Unit Stacks", "Pack / Neutral cards buy persistent Stack layers at the Citadel (+1 Attack, each layer soaks a lethal blow). The Polish Unit Stacks machinery — one pricing, coexists with the house rule."],
                ["unitExperience", "Unit Experience", "Army unit cards that survive a won combat gain XP, ranking up (Seasoned → Veteran → Elite) for stat bonuses, signature abilities, reinforcements, Stack layers, and Drill training."],
                ["monsterWaves", "Calamity Waves", "Every Nth round, EVERY live player fights a themed Gate invasion at round start. Visit the Far-tile Calamity Gate beforehand to cancel that wave's battle event for you. Standard and Brutal rewards/pillage are configurable below, as is optional elimination after repeated defeats."],
                ["raidBosses", "Raid Bosses", "A persistent multi-layer world boss lairs in a Rift Lair near map center from round 5 (announced one round ahead — \"the sky cracks\"). Wounds persist between attempts; every layer YOU break pays 2 gold at once, and the kill pays 5 gold + a relic-tier Artifact search. An ignored boss regrows a layer every 4th round."],
                ["dungeon", "Dungeon Gate", "Adds one shared Dungeon Gate. Each player tracks their own floor and sees the same seeded rooms. Choose a room, defeat the floor guard, and claim escalating rewards; floors 5 and 10 have bosses. Entering uses normal movement, and continuing after a win uses the cost selected below."]
              ] as const).map(([key, label, description]) => {
                const active = anime[key];
                return (
                  <button
                    aria-pressed={active}
                    className={`wogModuleToggle ${active ? "selected" : ""}`}
                    data-testid={`anime-module-${key}`}
                    key={key}
                    onClick={() => send({ anime: { ...anime, [key]: !active } })}
                    type="button"
                  >
                    <span className="wogModuleCheck">{active ? <Check size={15} /> : null}</span>
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </button>
                );
              })}
              {anime.monsterWaves ? (
                <div className="waveCadenceRow" role="group" aria-label="Wave cadence">
                  <strong>Wave cadence</strong>
                  {([3, 4, 5] as const).map((cadence) => (
                    <button
                      aria-pressed={(anime.waveCadence ?? 4) === cadence}
                      className={`waveCadenceChip ${(anime.waveCadence ?? 4) === cadence ? "selected" : ""}`}
                      data-testid={`anime-wave-cadence-${cadence}`}
                      key={cadence}
                      onClick={() => send({ anime: { ...anime, waveCadence: cadence } })}
                      type="button"
                    >
                      Every {cadence === 3 ? "3rd" : `${cadence}th`} round
                    </button>
                  ))}
                </div>
              ) : null}
              {anime.monsterWaves || anime.raidBosses || anime.dungeon ? (
                <div className="pveDirectorPanel">
                  <div className="pveDirectorHeading">
                    <span>Encounter director</span>
                    <strong>Choose the world these battles belong to</strong>
                  </div>
                  <div className="pveThemeCards" role="group" aria-label="PvE encounter theme">
                    {([
                      ["classic", "Erathian", "Arcane calamity", "/assets/board/battlefield-4x5-pve-calamity-classic-scenery.webp"],
                      ["doom", "Doom", "Infernal invasion", "/assets/board/battlefield-4x5-pve-calamity-doom-scenery.webp"]
                    ] as const).map(([theme, label, subtitle, image]) => (
                      <button
                        aria-label={label}
                        aria-pressed={(anime.pveTheme ?? "classic") === theme}
                        className={(anime.pveTheme ?? "classic") === theme ? "selected" : ""}
                        data-testid={`anime-pve-theme-${theme}`}
                        key={theme}
                        onClick={() => send({ anime: { ...anime, pveTheme: theme } })}
                        type="button"
                      >
                        <img alt="" aria-hidden="true" src={assetUrl(image)} />
                        <span><strong>{label}</strong><small>{subtitle}</small></span>
                      </button>
                    ))}
                    <button
                      aria-label="Random"
                      aria-pressed={anime.pveTheme === "random"}
                      className={`pveThemeRandom${anime.pveTheme === "random" ? " selected" : ""}`}
                      data-testid="anime-pve-theme-random"
                      onClick={() => send({ anime: { ...anime, pveTheme: "random" } })}
                      type="button"
                    >
                      <span><strong>Random</strong><small>Seeded once</small></span>
                    </button>
                  </div>
                </div>
              ) : null}
              {anime.raidBosses ? (
                <div className="waveCadenceRow pveSettingRow" role="group" aria-label="Raid boss arrival">
                  <strong>Rift Lair arrival</strong>
                  {([4, 5, 6] as const).map((round) => (
                    <button
                      aria-pressed={(anime.raidBossSpawnRound ?? 5) === round}
                      className={`waveCadenceChip ${(anime.raidBossSpawnRound ?? 5) === round ? "selected" : ""}`}
                      data-testid={`anime-raid-round-${round}`}
                      key={round}
                      onClick={() => send({ anime: { ...anime, raidBossSpawnRound: round } })}
                      type="button"
                    >
                      Round {round}
                    </button>
                  ))}
                  <small>Warning appears one round earlier.</small>
                </div>
              ) : null}
              {anime.dungeon ? (
                <>
                  <div className="waveCadenceRow pveSettingRow" role="group" aria-label="Dungeon campaign length">
                    <strong>Dungeon campaign</strong>
                    {([5, 10] as const).map((depth) => (
                      <button
                        aria-pressed={(anime.dungeonDepth ?? 10) === depth}
                        className={`waveCadenceChip ${(anime.dungeonDepth ?? 10) === depth ? "selected" : ""}`}
                        data-testid={`anime-dungeon-depth-${depth}`}
                        key={depth}
                        onClick={() => send({ anime: { ...anime, dungeonDepth: depth } })}
                        type="button"
                      >
                        {depth === 5 ? "5-floor expedition" : "10-floor campaign"}
                      </button>
                    ))}
                  </div>
                  <div className="waveCadenceRow pveSettingRow" role="group" aria-label="Continue after a Dungeon win">
                    <strong>Continue after a win</strong>
                    {([0, 1, 2] as const).map((cost) => (
                      <button
                        aria-pressed={(anime.dungeonDescentCost ?? 1) === cost}
                        className={`waveCadenceChip ${(anime.dungeonDescentCost ?? 1) === cost ? "selected" : ""}`}
                        data-testid={`anime-dungeon-cost-${cost}`}
                        key={cost}
                        onClick={() => send({ anime: { ...anime, dungeonDescentCost: cost } })}
                        type="button"
                      >
                        {cost === 0 ? "Free" : `${cost} movement`}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {anime.monsterWaves ? (
                <>
                  <div className="waveCadenceRow" role="group" aria-label="Wave pressure">
                    <strong>Rewards &amp; pillage</strong>
                    {(["standard", "brutal"] as const).map((pressure) => (
                      <button
                        aria-pressed={(anime.wavePressure ?? "standard") === pressure}
                        className={`waveCadenceChip ${(anime.wavePressure ?? "standard") === pressure ? "selected" : ""}`}
                        data-testid={`anime-wave-pressure-${pressure}`}
                        key={pressure}
                        onClick={() => send({ anime: { ...anime, wavePressure: pressure } })}
                        type="button"
                      >
                        {pressure === "standard" ? "Standard" : "Brutal (+rewards, -1 morale)"}
                      </button>
                    ))}
                  </div>
                  <div className="waveCadenceRow" role="group" aria-label="Wave loss limit">
                    <strong>Lost waves</strong>
                    {([0, 3, 2] as const).map((limit) => (
                      <button
                        aria-pressed={(anime.waveDefeatLimit ?? 0) === limit}
                        className={`waveCadenceChip ${(anime.waveDefeatLimit ?? 0) === limit ? "selected" : ""}`}
                        data-testid={`anime-wave-loss-${limit}`}
                        key={limit}
                        onClick={() => send({ anime: { ...anime, waveDefeatLimit: limit } })}
                        type="button"
                      >
                        {limit === 0 ? "Pillage only" : `Eliminate after ${limit}`}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <footer>
              <button className="selected" onClick={() => setAnimeOptionsOpen(false)} type="button">Done</button>
            </footer>
          </section>
          </div>
        ), document.body)
        : null}
    </>
  );
}

/**
 * The seat-count control: computer-opponent count in single-player, player
 * count in multiplayer. Shared by the Map & Setup tab and the Setup Hub's
 * Heroes & Draft window (the user picks opponents where they pick heroes).
 */
function SeatCountControl({
  state,
  viewerPlayerId,
  onAction,
  footer
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  /**
   * Rendered only when the control itself renders. A scenario with a single
   * legal seat count shows nothing at all, and a note pointing at a control
   * that is not there would be worse than no note.
   */
  footer?: ReactNode;
}) {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const options = lobby.options;
  const send = (next: Partial<GameSetupOptions>) =>
    onAction({ type: "SET_GAME_OPTIONS", playerId: viewerPlayerId, options: next });
  const scenario = scenarioDefinitions[options.scenarioId];
  const max = Math.min(scenario?.maxPlayers ?? 2, scenario?.layout.starts.length ?? 2);
  if (state.sessionMode === "single-player") {
    const current = lobby.seats.length - 1;
    const authoredDeployment = singlePlayerMapDeployment(options.customMap, max - 1);
    if (!authoredDeployment) {
      const enemyCounts = Array.from({ length: Math.max(0, max - 1) }, (_, index) => index + 1);
      return enemyCounts.length > 0 ? (
        <>
          <div className="optionRow">
            <small title="Choose the exact number of computer enemies for this single-player game">
              Computer enemies
            </small>
            <div className="optionButtons" role="group" aria-label="Number of computer enemies">
              {enemyCounts.map((count) => (
                <button
                  aria-pressed={current === count}
                  className={current === count ? "selected" : ""}
                  key={count}
                  onClick={() =>
                    onAction({
                      type: "SET_COMPUTER_OPPONENTS",
                      playerId: viewerPlayerId,
                      count
                    })
                  }
                  title={`Fight ${count} computer ${count === 1 ? "enemy" : "enemies"}`}
                  type="button"
                >
                  {count} {count === 1 ? "enemy" : "enemies"}
                </button>
              ))}
            </div>
            <small className="optionHint">
              Opens exactly one human seat plus the selected computer enemies. You can customize each enemy’s Town
              and hero below. A map with authored solo spawn Towns locks this choice to its designed enemy count.
            </small>
          </div>
          {footer}
        </>
      ) : null;
    }
    return (
      <>
      <div className="optionRow">
        <small title="The selected map determines the solo enemy count and starting locations">
          Solo deployment
        </small>
        <div className="optionButtons" role="group" aria-label="Map-selected computer opponents">
          <span className="selected">
            {current} computer opponent{current === 1 ? "" : "s"}
          </span>
        </div>
        <small className="optionHint">
          Locked by this map’s authored solo spawn Towns. Choose another map to select a different count, or change
          the You / Enemy AI starting Town markers in Map Designer. These settings are ignored in multiplayer.
        </small>
      </div>
      {footer}
      </>
    );
  }
  const min = scenario?.minPlayers ?? 2;
  const seatCount = lobby.seats.length;
  const counts: number[] = [];
  for (let n = min; n <= max; n += 1) {
    counts.push(n);
  }
  return counts.length > 1 ? (
    <>
    <div className="optionRow">
      <small title="How many seats this game opens — each needs a faction before the adventure starts">
        Players
      </small>
      <div className="optionButtons">
        {counts.map((count) => (
          <button
            aria-pressed={seatCount === count}
            className={seatCount === count ? "selected" : ""}
            key={count}
            onClick={() => send({ playerCount: count })}
            title={`Play with ${count} players`}
            type="button"
          >
            {count} players
          </button>
        ))}
      </div>
      <small className="optionHint">
        Seats beyond two open empty — anyone can sit in them from the table’s seat switcher and pick a faction.
      </small>
    </div>
    {footer}
    </>
  ) : null;
}

/**
 * Adjustable setup: scenario, neutral difficulty (Impossible default),
 * starting resources, base income (10 gold / 0 / 0 default), starting unit
 * tiers and pre-built buildings. Any seated player may adjust; everything
 * syncs through the same action stream as the rest of the game.
 */
/**
 * "This control is the same choice as the <box> box" — the Advanced window
 * hosts the FULL option set, so a few of its rows (game mode, seats, map,
 * difficulty) edit exactly what a dedicated hub box owns. They share one
 * component and one `setupLobby.options`, so they can never disagree; this note
 * says so and jumps straight to that box's window.
 */
function SameChoiceAsBoxNote({
  box,
  boxLabel,
  onOpenBox
}: {
  box: SetupHubBoxId;
  boxLabel: string;
  onOpenBox?: (box: SetupHubBoxId) => void;
}) {
  if (!onOpenBox) {
    return null;
  }
  return (
    <small className="optionHint sameChoiceNote">
      Same choice as the <strong>{boxLabel}</strong> box — changing it here changes it there.{" "}
      <button
        aria-label={`Open the ${SAME_CHOICE_ARIA[box]} window`}
        className="sameChoiceLink"
        onClick={() => onOpenBox(box)}
        type="button"
      >
        Open {boxLabel}
      </button>
    </small>
  );
}

/** Distinct from the strip's "Switch to the … box" labels (unique names). */
const SAME_CHOICE_ARIA: Record<SetupHubBoxId, string> = {
  mode: "Game-mode",
  heroes: "Heroes",
  map: "Map",
  advanced: "Advanced"
};

function GameOptionsPanel({
  state,
  viewerPlayerId,
  onAction,
  onOpenBox
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  /** Jump to the hub box that OWNS a duplicated row (absent = no cross-links). */
  onOpenBox?: (box: SetupHubBoxId) => void;
}) {
  const [tournamentRulesOpen, setTournamentRulesOpen] = useState(false);
  const [tab, setTab] = useState<OptionsTabId>("rules");
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }

  const options = lobby.options;
  const mapOwnsGrailOrUtopia = mapHasAuthoredGrailOrUtopia(
    options.customMap,
    options.customMapPreset
  );
  const viewerFactionId = lobby.seats.find((seat) => seat.playerId === viewerPlayerId)?.factionId ?? null;
  const send = (next: Partial<GameSetupOptions>) =>
    onAction({ type: "SET_GAME_OPTIONS", playerId: viewerPlayerId, options: next });
  // Effective house-rule booleans (explicit toggle, else the chosen mode's
  // default). Flipping one sends just that id; the reducer merges it.
  const houseRules = resolveHouseRules(options);
  const setHouseRule = (id: HouseRuleId, value: boolean) => {
    if (id === "polish-spell-book" && value) {
      send({ houseRules: { [id]: true }, spellBook: false });
      return;
    }
    send({ houseRules: { [id]: value } });
  };
  // Flip a whole group of rules in ONE dispatch (the reducer merges the ids).
  // Enabling the Polish Spell Book also forces the stash Spell Book off, exactly
  // like the single-rule toggle above.
  const setHouseRules = (updates: Partial<Record<HouseRuleId, boolean>>) => {
    const next: Partial<GameSetupOptions> = { houseRules: updates };
    if (updates["polish-spell-book"]) {
      next.spellBook = false;
    }
    send(next);
  };
  const tournamentRules = resolveTournamentRules(options);

  return (
    <div className="gameOptions" aria-label="Game options">
      <header className="gameOptionsHead">
        <span className="gameOptionsEyebrow">⚜ Fan-made house-rule edition · BINH</span>
        <h3>Game Setup</h3>
        <small className="gameOptionsHeadSub">Pick a mode, toggle the house rules, and set up your army.</small>
      </header>

      <nav className="optionTabs" role="tablist" aria-label="Setup sections">
        {OPTION_TABS.map((entry) => (
          <button
            aria-selected={tab === entry.id}
            className={`optionTab ${tab === entry.id ? "selected" : ""}`}
            key={entry.id}
            onClick={() => setTab(entry.id)}
            role="tab"
            type="button"
          >
            {entry.icon}
            <span>{entry.label}</span>
          </button>
        ))}
      </nav>

      {tab === "rules" ? (
      <div className="optionTabPanel" role="tabpanel" aria-label="Rules">

      <GameModeSection
        onAction={onAction}
        onCustomSelected={() => setTab("map")}
        state={state}
        viewerPlayerId={viewerPlayerId}
      />
      <SameChoiceAsBoxNote box="mode" boxLabel="Game mode" onOpenBox={onOpenBox} />

      {(() => {
        const tournamentDefs: {
          key: string;
          label: string;
          on: boolean;
          hint: string;
          toggle: () => void;
        }[] = [
          {
            key: "tournamentBanDiplomacy",
            label: "Ban Diplomacy",
            on: tournamentRules.banDiplomacy,
            hint: "Remove Diplomacy from the shared Ability deck (heroes keep a starting copy).",
            toggle: () => send({ tournamentBanDiplomacy: !tournamentRules.banDiplomacy })
          },
          {
            key: "tournamentBanHourglass",
            label: "Ban Hourglass",
            on: tournamentRules.banHourglass,
            hint: "Remove Hourglass of the Evil Hour from the shared Artifact deck.",
            toggle: () => send({ tournamentBanHourglass: !tournamentRules.banHourglass })
          },
          {
            key: "tournamentSecondPlayerMorale",
            label: "2nd player +1 morale",
            on: tournamentRules.secondPlayerMorale,
            hint: "The second player gains 1 positive morale at game start.",
            toggle: () => send({ tournamentSecondPlayerMorale: !tournamentRules.secondPlayerMorale })
          },
          {
            key: "tournamentObservatoryRerotate",
            label: "Observatory re-rotates a nearby tile",
            on: tournamentRules.observatoryRerotate,
            hint: "The Redwood Observatory may rotate one adjacent revealed tile with no Hero on it, then still discovers a face-down tile normally.",
            toggle: () => send({ tournamentObservatoryRerotate: !tournamentRules.observatoryRerotate })
          },
          {
            // The SAME `split-decks` house rule BINH ticks, shown here as a
            // Tournament rule too: it is the package's headline (tier-split
            // Spell / Artifact decks) and was previously invisible — a table
            // could be "in Tournament rules" with one mixed deck and nothing on
            // screen said so. Turning any full tournament package on forces it
            // (adventure-setup's setGameOptions seam); this tick reflects and
            // may override that.
            key: "split-decks",
            label: "Divided Spell & Artifact decks",
            on: houseRules["split-decks"],
            hint: "Tournament headline (and the BINH house rule of the same name): separate Basic/Expert Spell decks and Minor/Major/Relic Artifact decks instead of one mixed deck each.",
            toggle: () => setHouseRule("split-decks", !houseRules["split-decks"])
          }
        ];
        const tournamentOn = tournamentDefs.filter((rule) => rule.on).length;
        return (
          <HouseRuleCollapsible
            crestSrc={assetUrl("/assets/ui/mode-tournament-crest-clear.webp")}
            crestClassName="houseRuleCollapsibleCrest tournament"
            id="tournament-rules"
            onCount={tournamentOn}
            onToggle={() => setTournamentRulesOpen((v) => !v)}
            open={tournamentRulesOpen}
            subtitle="Rulebook Tournament setup (p.54) — each rule toggleable on its own"
            title="Tournament rules"
            totalCount={tournamentDefs.length}
            variant="tournament"
          >
            <div className="tournamentRuleGrid">
              {tournamentDefs.map((rule) => (
                <button
                  aria-pressed={rule.on}
                  className={`tournamentRuleToggle ${rule.on ? "on" : "off"}`}
                  key={rule.key}
                  onClick={rule.toggle}
                  title={rule.hint}
                  type="button"
                >
                  <span aria-hidden="true" className="houseRuleCheck">
                    {rule.on ? <Check size={13} /> : null}
                  </span>
                  <span>
                    <strong>{rule.label}</strong>
                    <small>{rule.hint}</small>
                  </span>
                  <span className={`houseRuleState ${rule.on ? "on" : "off"}`}>{rule.on ? "ON" : "OFF"}</span>
                </button>
              ))}
            </div>
            <small className="optionHint">
              Toggle each Tournament setup rule independently, or use the Tournament mode card above to apply the full
              competitive package. “Divided Spell &amp; Artifact decks” is the same house rule the BINH list shows (both
              ticks read and write one setting); turning the whole Tournament package on switches it on for you.
            </small>
          </HouseRuleCollapsible>
        );
      })()}

      {/* Optional systems clustered together: VP · Event · Morale · Spell Book */}
      {(() => {
        const vpOn = options.victoryPoints === true;
        const vpRoundLimit = options.victoryPointsRoundLimit ?? 0;
        const presetVpEnabled = options.customMapPreset?.victoryPoints?.enabled === true;
        const eventsOn = options.events ?? false;
        const moraleCardsOn = options.moraleCards ?? false;
        const polishSpellBookOn = houseRules["polish-spell-book"];
        const spellBookOn = !polishSpellBookOn && (options.spellBook ?? options.ruleset === "binh");
        const undoMovesOn = options.undoMoves ?? false;
        const manualGuardControlOn = options.manualGuardControl ?? false;
        const startingHandMulliganOn = options.startingHandMulligan !== false;
        const unitExperienceOn = options.unitExperience ?? false;
        return (
          <div className="optionalRulesCluster" aria-label="Optional scoring, decks, spell book, and testing aids">
            <div className="optionalRulesClusterHead">
              <strong>Optional systems</strong>
              <small>Victory Points, Event deck, Morale Cards, Spell Book, Unit experience, and Undo moves</small>
            </div>

            <div className="optionRow">
              <OptionRowLabel
                hint="Optional Victory Points scoring: at the round limit (or on victory completion) the player with the most Victory Points wins — the full rulebook scoring table."
                iconClassName="optionRowIcon crest"
                iconSrc="/assets/ui/option-victory-points-clear.webp"
                title="Victory points"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={vpOn === on}
                    className={vpOn === on ? "selected" : ""}
                    key={on ? "on" : "off"}
                    onClick={() => send({ victoryPoints: on })}
                    title={on ? "Victory Points scoring on" : "Victory Points scoring off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              {vpOn ? (
                <div aria-label="Victory points round limit" className="optionButtons" role="group">
                  {[0, 5, 10, 15, 20, 25].map((rounds) => (
                    <button
                      aria-pressed={vpRoundLimit === rounds}
                      className={vpRoundLimit === rounds ? "selected" : ""}
                      key={rounds}
                      onClick={() => send({ victoryPointsRoundLimit: rounds })}
                      title={rounds === 0 ? "No round limit" : `${rounds} rounds`}
                      type="button"
                    >
                      {rounds === 0 ? "No limit" : rounds}
                    </button>
                  ))}
                </div>
              ) : null}
              <small className="optionHint">
                {presetVpEnabled
                  ? "The designed map already enables Victory Points — its own scoring settings and round limit apply, so this toggle does not govern them."
                  : "The game ends at the round limit (or when a player completes the victory condition), and the player with the most Victory Points wins — the full rulebook scoring table (heroes defeated, buildings, hero levels, flagged mines/settlements, artifacts). Without a round limit a conquest-style game ends only by completion or last-faction-standing."}
              </small>
            </div>

            <div className="optionRow">
              <OptionRowLabel
                hint="Fortress expansion optional rule (OFF by default): an Event card is drawn at the start of every Resource round (multiplayer only)"
                iconClassName="optionRowIcon cardBack"
                iconSrc="/assets/card_back-events.webp"
                title="Event deck"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={eventsOn === on}
                    className={eventsOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() => send({ events: on })}
                    title={on ? "Event deck on (Fortress expansion)" : "Event deck off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {eventsOn
                  ? "Each Resource round (after income) the next Event card is drawn and resolved clockwise from its drawer; the drawing player rotates. Multiplayer only — a solo game skips the deck."
                  : "Off by default. No Event deck — Resource rounds pay income only. Turn it On to add the Fortress-expansion Events (multiplayer only)."}
              </small>
            </div>

            <div className="optionRow">
              <OptionRowLabel
                hint="Optional rule: replace normal morale tokens with Positive and Negative Morale decks"
                iconClassName="optionRowIcon cardBack"
                icons={[
                  "/assets/morale-cards/morale-positive-back.png",
                  "/assets/morale-cards/morale-negative-back.png"
                ]}
                title="Morale Cards"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={moraleCardsOn === on}
                    className={moraleCardsOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() => send({ moraleCards: on })}
                    title={on ? "Morale Cards on" : "Normal morale tokens"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {moraleCardsOn
                  ? "Morale draws cards instead of changing the morale token: positive morale clears one Negative card first, then draws Positive cards (max 2 held)."
                  : "Normal morale tokens: positive morale can be spent for draw/redraw/reroll, and doubled negative morale discards your hand at turn end."}
              </small>
            </div>

            <div className="optionRow">
              <OptionRowLabel
                hint="House rule: each player keeps a personal Spell Book to stash, cast and boost Spells from"
                iconClassName="optionRowIcon spellBook"
                iconSrc="/assets/ui/spell-book-button.png"
                title="Spell Book"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={spellBookOn === on}
                    className={spellBookOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() =>
                      send({
                        spellBook: on,
                        ...(on ? { houseRules: { "polish-spell-book": false } } : {})
                      })
                    }
                    title={on ? "Spell Book on (house rule)" : "Spell Book off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {polishSpellBookOn
                  ? "Off because Polish Spell Book is selected; the two lifecycles cannot be combined."
                  : spellBookOn
                  ? "Each player may set Spells aside in a personal Spell Book to free hand slots, then cast or boost from it (one Book Power boost per turn)."
                  : "No Spell Book — Spells live only in hand, deck and discard."}
              </small>
            </div>

            <div className="optionRow undoMovesRow">
              <OptionRowLabel
                hint="Testing/debug aid (OFF by default): lets a player roll the game back to before a recent action, so bugs are easier to reproduce and hunt"
                iconClassName="optionRowIcon crest"
                iconSrc="/assets/ui/option-undo-moves-clear.webp"
                title="Undo moves (testing)"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={undoMovesOn === on}
                    className={undoMovesOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() => send({ undoMoves: on })}
                    title={on ? "Undo moves on (testing aid)" : "Undo moves off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {undoMovesOn
                  ? "Debug/testing only: an Undo button on the map rolls the whole game back to the state before a recent action (up to the last 10). Not for competitive play — every rewind is announced in the feed."
                  : "Off by default. Turn it On only for manual testing / bug-hunting; it exposes a map Undo button that rewinds recent actions."}
              </small>
            </div>

            <div className="optionRow manualGuardControlRow">
              <OptionRowLabel
                hint="Fight the Neutral guards yourself: in your own Neutral combats YOU command each guard (it must still attack when it can; with the Polish Wait rule it may Wait instead, but its Waited re-activation must attack) — or press the automatic button to let the rulebook AI play that guard"
                iconClassName="optionRowIcon crest"
                iconSrc="/assets/spell-icons/bloodlust.png"
                title="Manual guard control"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={manualGuardControlOn === on}
                    className={manualGuardControlOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() => send({ manualGuardControl: on })}
                    title={on ? "Manual guard control on" : "Manual guard control off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {manualGuardControlOn
                  ? "You play the Neutral units in your own guard and Creature-Bank fights — same must-attack discipline as PvP Neutral Control — with a \u201cLet the unit act\u201d button to hand any single guard back to the automatic player. PvP Neutral Control wins when both modes are on."
                  : "Off: the rulebook Neutral player plays the guards automatically, exactly as usual."}
              </small>
            </div>

            <div className="optionRow startingHandMulliganRow">
              <OptionRowLabel
                hint="Default ON: after you fill your hand to the limit (keeping or ditching a difficulty-bonus artifact), you may discard 0–N cards to your deck and redraw that many. OFF: only the fill step — ditch bonus artifact(s) or keep them, then draw to 4; no full-hand Mulligan."
                iconClassName="optionRowIcon crest"
                iconSrc="/assets/spell-icons/view_air.png"
                title="First-round hand Mulligan"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={startingHandMulliganOn === on}
                    className={startingHandMulliganOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() => send({ startingHandMulligan: on })}
                    title={on ? "First-round hand Mulligan on" : "First-round hand Mulligan off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {startingHandMulliganOn
                  ? "On (default): fill to hand limit first (you may ditch a difficulty-bonus artifact), then Mulligan — discard 0–N cards to the bottom of your deck and draw that many."
                  : "Off: fill to hand limit only — keep or ditch difficulty-bonus card(s), then draw up to 4. No second full-hand Mulligan. Later rounds discard normally."}
              </small>
            </div>

            <div className="optionRow unitExperienceRow">
              <OptionRowLabel
                hint="WoG Unit Experience (board adaptation): surviving army units gain XP and veteran ranks; Drill is free at Towns, Settlements and Random Towns, or costs 1 movement elsewhere"
                iconClassName="optionRowIcon crest"
                iconSrc="/assets/spell-icons/slayer.png"
                title="Unit experience"
              />
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={unitExperienceOn === on}
                    className={unitExperienceOn === on ? "selected" : ""}
                    key={on ? "on" : "off"}
                    onClick={() => send({ unitExperience: on })}
                    title={on ? "Unit experience on" : "Unit experience off"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {unitExperienceOn
                  ? "Survivors of won battles earn XP (guard difficulty / bank size / 2 for PvP), plus +1 against Veteran neutral-owned guards or +2 against Elite. Player-controlled recruited Neutrals always use this XP system. Reinforcing halves XP; Stack layers cost 1 XP. Drill costs 1 gold for bronze or recruited Neutral, 2 for silver, and 3 for gold; heroes may Drill 1/2/3 times per round at levels I/IV/VII."
                  : "Off by default. Also available as a Wake of Gods module — units level up like in the WoG Unit Experience System, adapted to the board game."}
              </small>
            </div>
          </div>
        );
      })()}

      <HouseRulesSection
        creatureBanksEnabled={options.creatureBanks ?? true}
        houseRules={houseRules}
        setHouseRule={setHouseRule}
        setHouseRules={setHouseRules}
      />
      </div>
      ) : null}

      {tab === "play" ? (
      <div className="optionTabPanel" role="tabpanel" aria-label="Play">

      {(() => {
        const victoryMode = options.victoryMode ?? "conquest";
        return (
          <div className="optionRow">
            <small title="How this game is won">Win condition</small>
            <div className="optionButtons">
              {(["conquest", "grail", "dragon-hunt", "dragon-conqueror"] as const).map((mode) => (
                <button
                  aria-pressed={victoryMode === mode}
                  className={victoryMode === mode ? "selected" : ""}
                  disabled={mapOwnsGrailOrUtopia && mode !== "conquest"}
                  key={mode}
                  onClick={() => send({ victoryMode: mode })}
                  title={
                    mapOwnsGrailOrUtopia && mode !== "conquest"
                      ? "Unavailable: the selected map already contains Hidden Grail / Dragon Utopia fields."
                      : VICTORY_MODE_DESCRIPTIONS[mode]
                  }
                  type="button"
                >
                  {VICTORY_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {mapOwnsGrailOrUtopia
                ? "This map already owns its Hidden Grail / Dragon Utopia fields. Holy Grail, Dragon Hunt and Dragon Conqueror cannot add a second objective; use Conquest, custom wins, or Victory Points."
                : VICTORY_MODE_DESCRIPTIONS[victoryMode]}
            </small>
          </div>
        );
      })()}

      {(() => {
        // The Dragon Utopia guards: either the explicit four-dragon scenario
        // party or the complete Field Difficulty table composition.
        const victoryMode = options.victoryMode ?? "conquest";
        if (victoryMode !== "dragon-hunt" && victoryMode !== "dragon-conqueror") {
          return null;
        }
        const guards = options.dragonUtopiaGuards ?? "by-difficulty";
        return (
          <div className="optionRow">
            <small title="How the Dragon Utopia objective is guarded">Dragon Utopia guards</small>
            <div className="optionButtons">
              <button
                aria-pressed={guards === "four"}
                className={guards === "four" ? "selected" : ""}
                onClick={() => send({ dragonUtopiaGuards: "four" })}
                title="The full four-dragon party — Azure, Rust, Crystal and Faerie"
                type="button"
              >
                4 dragons
              </button>
              <button
                aria-pressed={guards === "by-difficulty"}
                className={guards === "by-difficulty" ? "selected" : ""}
                onClick={() => send({ dragonUtopiaGuards: "by-difficulty" })}
                title="Use the full Field Difficulty table composition (Hard VII: 1 golden + 2 azure)"
                type="button"
              >
                Difficulty table
              </button>
            </div>
            <small className="optionHint">
              {guards === "four"
                ? "Four dragons guard the Utopia — Azure, Rust, Crystal and Faerie. The featured lead is a random Azure or Rust Dragon."
                : "The complete difficulty row is used, including tiers (Hard VII: 1 golden + 2 azure)."}
            </small>
          </div>
        );
      })()}

      {(() => {
        // Custom win conditions — rendered HERE, directly beside the Win
        // condition selector above, so the extra early-end triggers live with
        // the rest of the victory setup. The map's own list is read-only (the
        // lobby can only ADD, never remove a map-authored one) plus the
        // host-added list for THIS game. The first player to satisfy any
        // condition wins.
        const mapConditions = options.customMapPreset?.customWinConditions ?? [];
        const hostConditions = options.customWinConditions ?? [];
        const effective = mergeCustomWinConditions(mapConditions, hostConditions);
        const atCap = effective.length >= MAX_CUSTOM_WIN_CONDITIONS;
        const sendConditions = (nextConditions: CustomWinCondition[]) =>
          send({ customWinConditions: nextConditions });
        const addCondition = () => {
          if (atCap) {
            return;
          }
          sendConditions([...hostConditions, defaultCustomWinCondition("control-towns")]);
        };
        const updateCondition = (index: number, condition: CustomWinCondition) =>
          sendConditions(hostConditions.map((entry, i) => (i === index ? condition : entry)));
        const removeCondition = (index: number) =>
          sendConditions(hostConditions.filter((_, i) => i !== index));
        return (
          <div className="optionRow">
            <small title="Extra early-end triggers: the first player to satisfy any listed condition wins immediately, on top of the victory mode. Map-set conditions can't be removed here — you can only add your own for this game.">
              Custom win condition
            </small>
            <div className="customWinConditions" role="group" aria-label="Custom win conditions">
              {mapConditions.map((condition, index) => (
                <div className="customWinConditionRow mapSet" key={`map-${index}`}>
                  <span className="customWinConditionText">🏁 {describeCustomWinCondition(condition)}</span>
                  <span className="customWinConditionTag">map</span>
                </div>
              ))}
              {hostConditions.map((condition, index) => {
                const option = CUSTOM_WIN_CONDITION_OPTIONS.find((entry) => entry.id === condition.kind);
                const paramValue =
                  condition.kind === "hero-level"
                    ? condition.level
                    : condition.kind === "gold"
                      ? condition.amount
                      : "count" in condition
                        ? condition.count
                        : null;
                return (
                  <div className="customWinConditionRow" key={`host-${index}`}>
                    <select
                      aria-label={`Custom win condition ${index + 1} kind`}
                      onChange={(event) =>
                        updateCondition(
                          index,
                          defaultCustomWinCondition(event.target.value as CustomWinCondition["kind"])
                        )
                      }
                      value={condition.kind}
                    >
                      {CUSTOM_WIN_CONDITION_OPTIONS.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    {option?.param && paramValue !== null ? (
                      <input
                        aria-label={`Custom win condition ${index + 1} value`}
                        max={option.param.max}
                        min={option.param.min}
                        onChange={(event) => {
                          const raw = Number(event.target.value) || option.param!.min;
                          const clamped = Math.max(option.param!.min, Math.min(option.param!.max, raw));
                          updateCondition(index, {
                            ...condition,
                            [option.param!.field]: clamped
                          } as CustomWinCondition);
                        }}
                        type="number"
                        value={paramValue}
                      />
                    ) : null}
                    <button
                      aria-label={`Remove custom win condition ${index + 1}`}
                      className="customWinConditionRemove"
                      onClick={() => removeCondition(index)}
                      type="button"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              <button
                className="customWinConditionAdd"
                disabled={atCap}
                onClick={addCondition}
                type="button"
              >
                <Plus size={13} aria-hidden="true" /> Add win condition
              </button>
            </div>
            <small className="optionHint">
              {effective.length === 0
                ? "None set. Add a condition and the first player to reach it wins immediately — an extra early-end trigger on top of the victory mode."
                : "The first player to satisfy any condition wins immediately. Map-set conditions can't be removed here — you can only add your own for this game."}
            </small>
          </div>
        );
      })()}

      {(() => {
        // WHO GOES FIRST — a match-level rule, so it lives beside the win
        // conditions. Random (default) is the rulebook setup-step-22 Attack-die
        // roll + its ceremony; Chosen order lets the host write the whole turn
        // order and skips the roll entirely. The displayed order is re-derived
        // from the OPEN seats through the engine's own sanitiser, so a stale
        // stored list (a closed seat) can never render a ghost row.
        const seatIds = lobby.seats.map((seat) => seat.playerId);
        const orderMode = options.playerOrderMode ?? "random";
        const order = sanitizeManualPlayerOrder(seatIds, options.manualPlayerOrder);
        const seatLabel = (playerId: PlayerId) =>
          state.players[playerId]?.name ??
          lobby.seats.find((seat) => seat.playerId === playerId)?.name ??
          playerId;
        const moveSeat = (index: number, delta: number) => {
          const target = index + delta;
          if (target < 0 || target >= order.length) {
            return;
          }
          const next = [...order];
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved!);
          send({ manualPlayerOrder: next });
        };
        return (
          // Styling is BORROWED from the neighbouring Custom-win-condition
          // section (`customWinConditions` / `customWinConditionRow` /
          // `customWinConditionText` / `customWinConditionAdd`) rather than
          // hand-rolled: the two are the same "stacked list of small rows with
          // pill buttons" shape, and reusing proven values keeps this row from
          // being the one unstyled thing in the panel. The `playerOrder*`
          // classes alongside them are semantic/test hooks with no CSS of their
          // own.
          <div className="optionRow playerOrderRow">
            <small title="Who takes the first turn: the rulebook Attack-die roll, or an order you set yourself">
              Player order
            </small>
            <div className="optionButtons">
              {(["random", "manual"] as const).map((mode) => (
                <button
                  aria-pressed={orderMode === mode}
                  className={orderMode === mode ? "selected" : ""}
                  key={mode}
                  onClick={() => send({ playerOrderMode: mode })}
                  title={
                    mode === "random"
                      ? "Roll the Attack die for the starting player (rulebook setup step 22)"
                      : "Set the whole turn order yourself — no roll, no opening ceremony"
                  }
                  type="button"
                >
                  {mode === "random" ? "Random roll" : "Chosen order"}
                </button>
              ))}
            </div>
            {orderMode === "manual" ? (
              <div className="customWinConditions playerOrderList" role="group" aria-label="Player order">
                {order.map((playerId, index) => (
                  <div className="customWinConditionRow playerOrderEntry" key={playerId}>
                    <span className="customWinConditionText playerOrderSeat">
                      {index + 1}. {seatLabel(playerId)}
                    </span>
                    <button
                      aria-label={`Move ${seatLabel(playerId)} earlier`}
                      className="customWinConditionAdd"
                      disabled={index === 0}
                      onClick={() => moveSeat(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${seatLabel(playerId)} later`}
                      className="customWinConditionAdd"
                      disabled={index === order.length - 1}
                      onClick={() => moveSeat(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <small className="optionHint">
              {orderMode === "manual"
                ? "The game uses exactly this order — no Attack die is rolled and the opening first-player ceremony is skipped (a feed line announces the order instead). Position 1 also takes map position 1."
                : "Default: the Attack die decides the first player after the starting bonuses, announced by the opening ceremony."}
            </small>
          </div>
        );
      })()}

      {(() => {
        const pvpTroopLoss = options.pvpTroopLoss ?? "normal";
        return (
          <div className="optionRow">
            <small title="Whether player-vs-player Combat costs the fighters their dead units">PvP combat</small>
            <div className="optionButtons">
              {(["normal", "none"] as const).map((mode) => (
                <button
                  aria-pressed={pvpTroopLoss === mode}
                  className={pvpTroopLoss === mode ? "selected" : ""}
                  key={mode}
                  onClick={() => send({ pvpTroopLoss: mode })}
                  title={PVP_TROOP_LOSS_DESCRIPTIONS[mode]}
                  type="button"
                >
                  {PVP_TROOP_LOSS_LABELS[mode]}
                </button>
              ))}
            </div>
            <small className="optionHint">{PVP_TROOP_LOSS_DESCRIPTIONS[pvpTroopLoss]}</small>
          </div>
        );
      })()}

      {(() => {
        const neutralControlOn = options.pvpNeutralControl ?? false;
        const mustAttackOn = options.pvpNeutralControlMustAttack ?? true;
        return (
          <>
            <div className="optionRow">
              <small title="Optional mode (OFF by default): the next seat clockwise plays the Neutral units in every Neutral combat, including human/computer single-player tables">
                PvP Neutral Control
              </small>
              <div className="optionButtons">
                {BOOLEAN_OPTION_ORDER.map((on) => (
                  <button
                    aria-pressed={neutralControlOn === on}
                    className={neutralControlOn === on ? "selected" : ""}
                    key={String(on)}
                    onClick={() => send({ pvpNeutralControl: on })}
                    title={on ? "A human plays the Neutral units (next player clockwise)" : "The Neutral AI plays the guards"}
                    type="button"
                  >
                    {on ? "On" : "Off"}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                {neutralControlOn
                  ? "Every Neutral combat becomes PvP-like: the NEXT seat clockwise plays the guards — moving and attacking each one, breaking activation ties, and answering ability targets and dice rerolls. In single-player, you control guards in computer heroes' fights; computer seats control them in yours. A one-seat game keeps the Neutral AI."
                  : "Off by default. The Neutral AI plays the guards by the rulebook (same-tier priority, nearest target); the fighting player only breaks its ties."}
              </small>
            </div>
            {neutralControlOn ? (
              <div className="optionRow">
                <small title="Sub-rule of PvP Neutral Control: whether the guards keep the rulebook 'must attack' behaviour">
                  Neutral Control — guards
                </small>
                <div className="optionButtons">
                  {BOOLEAN_OPTION_ORDER.map((on) => (
                    <button
                      aria-pressed={mustAttackOn === on}
                      className={mustAttackOn === on ? "selected" : ""}
                      key={String(on)}
                      onClick={() => send({ pvpNeutralControlMustAttack: on })}
                      title={
                        on
                          ? "Guards must attack when they can — no defending or stalling"
                          : "Guards play with no constraint, exactly like the player's own units"
                      }
                      type="button"
                    >
                      {on ? "Must attack" : "Free"}
                    </button>
                  ))}
                </div>
                <small className="optionHint">
                  {mustAttackOn
                    ? "Rulebook spirit: a guard that can reach an enemy must attack it (pick which), may not Defend, and may only step closer when no attack is reachable — no buying time until the round limit."
                    : "No constraint: the controlling player moves, defends, attacks or holds each guard entirely freely, exactly like their own units in PvP."}
                </small>
              </div>
            ) : null}
          </>
        );
      })()}

      {(() => {
        const parallelRounds = Math.max(0, Math.min(MAX_PARALLEL_TURN_ROUNDS, options.parallelTurns ?? 0));
        const presets = [0, 1, 2, 3, 4, 6] as const;
        return (
          <div className="optionRow">
            <small title="Optional: everyone plays their turns at the same time for the first rounds (multiplayer only)">
              Parallel turns
            </small>
            <div className="optionButtons">
              {presets.map((rounds) => (
                <button
                  aria-pressed={parallelRounds === rounds}
                  className={parallelRounds === rounds ? "selected" : ""}
                  key={rounds}
                  onClick={() => send({ parallelTurns: rounds })}
                  title={
                    rounds === 0
                      ? "Classic one-at-a-time turns"
                      : `Everyone plays at once for the first ${rounds} round${rounds === 1 ? "" : "s"}`
                  }
                  type="button"
                >
                  {rounds === 0 ? "Off" : `${rounds}`}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {parallelRounds > 0
                ? `Everyone plays at the same time for the first ${parallelRounds} round${parallelRounds === 1 ? "" : "s"} — move, build and end your turn independently; battles and choices still resolve one at a time (quiet moves stay open meanwhile), and shared-deck draws go to whoever acts first. The mode STOPS with a warning — and play turns classic — the moment a PvP battle starts or someone steals another player's mine/settlement (e.g. a View Earth capture; hand discards don't count), or when the period ends. Multiplayer only.`
                : "Classic turns: one player at a time, in seat order."}
            </small>
          </div>
        );
      })()}

      </div>
      ) : null}

      {tab === "map" ? (
      <div className="optionTabPanel" role="tabpanel" aria-label="Map">

      {(() => {
        const creatureBanksOn = options.creatureBanks ?? true;
        return (
          <div className="optionRow">
            <small title="Naval Battles optional rule: discovering a Far/Near tile with a Blocked Field lets you place a Creature Bank there">
              Creature Banks
            </small>
            <div className="optionButtons">
              {BOOLEAN_OPTION_ORDER.map((on) => (
                <button
                  aria-pressed={creatureBanksOn === on}
                  className={creatureBanksOn === on ? "selected" : ""}
                  key={String(on)}
                  onClick={() => send({ creatureBanks: on })}
                  title={on ? "Creature Banks on" : "Creature Banks off"}
                  type="button"
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {creatureBanksOn
                ? "Discovering a Far/Near tile with a Blocked Field offers a Creature Bank token — a guarded lair with a scaled reward. Off removes the piles and the offer."
                : "No Creature Banks — Blocked Fields stay bare."}
            </small>
          </div>
        );
      })()}

      {(() => {
        // GLOBAL single-hex Field Overrides (not Monolith/Gate/Whirlpool —
        // those are basic teleports). Auto-ticks ON when a designed map has
        // fieldOverride pins. Placement: Auto (random) vs Manual (player picks).
        // A map-objects content module (WOG New Objects / Anime map objects)
        // FORCES this on — the engine `setGameOptions` chokepoint flips it, and
        // the row here renders locked-ON so the requirement is visible.
        const mapObjectsLocked = mapObjectsModuleActive(options);
        const fieldOverridesOn = (options.fieldOverrides ?? false) || mapObjectsLocked;
        const placement = options.fieldOverridePlacement ?? "manual-or-refuse";
        return (
          <div className="optionRow" data-testid="option-field-overrides">
            <small title="Global single-hex replacements with real visit mechanics. Content objects come from packages (Anime mod, future mods, core). Monolith/Whirlpool/Gate/Subterranean Gate are basic teleports and do NOT use this toggle.">
              Field Overrides
            </small>
            <div className="optionButtons">
              {BOOLEAN_OPTION_ORDER.map((on) => (
                <button
                  aria-pressed={fieldOverridesOn === on}
                  className={fieldOverridesOn === on ? "selected" : ""}
                  disabled={mapObjectsLocked}
                  key={String(on)}
                  onClick={() => send({ fieldOverrides: on })}
                  title={
                    mapObjectsLocked
                      ? "On — WOG/Anime map objects are selected"
                      : on
                        ? "Field Overrides on"
                        : "Field Overrides off"
                  }
                  type="button"
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            {fieldOverridesOn ? (
              <div className="optionButtons" data-testid="option-field-override-placement">
                {(
                  [
                    ["random", "Auto"],
                    ["manual", "Manual"],
                    ["manual-or-refuse", "Manual / refuse"]
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    aria-pressed={placement === mode}
                    className={placement === mode ? "selected" : ""}
                    key={mode}
                    onClick={() => send({ fieldOverridePlacement: mode })}
                    title={
                      mode === "random"
                        ? "Engine places the override on a legal hex automatically"
                        : mode === "manual"
                          ? "Discovering player must pick a glowing hex"
                          : "Discovering player picks a hex or may refuse"
                    }
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <small className="optionHint">
              {mapObjectsLocked
                ? `On — WOG/Anime map objects are selected, so Field Overrides is required (they place the objects). Placement: ${
                    placement === "random"
                      ? "Auto"
                      : placement === "manual"
                        ? "Manual pick"
                        : "Manual pick (or refuse)"
                  }. Untick the map-objects module to unlock this.`
                : fieldOverridesOn
                  ? `On — each Far/Near/Center tile open replaces ≥1 hex with a function object. Placement: ${
                      placement === "random"
                        ? "Auto"
                        : placement === "manual"
                          ? "Manual pick"
                          : "Manual pick (or refuse)"
                    }. Designer pins auto-enable this when the map is picked. Not for Monolith/Gate/Whirlpool/underground gates.`
                  : "Off — no single-hex overrides. Picking a map that already has override objects will tick this On automatically."}
            </small>
          </div>
        );
      })()}

      {(() => {
        const farTileOpeningOn = options.farTileOpening ?? true;
        return (
          <div className="optionRow">
            <small title="Whether players may open their own Ⅱ–Ⅲ Far tiles onto the map">
              Ⅱ–Ⅲ tile opening
            </small>
            <div className="optionButtons">
              {BOOLEAN_OPTION_ORDER.map((on) => (
                <button
                  aria-pressed={farTileOpeningOn === on}
                  className={farTileOpeningOn === on ? "selected" : ""}
                  key={String(on)}
                  onClick={() => send({ farTileOpening: on })}
                  title={on ? "Players may open Ⅱ–Ⅲ tiles" : "Players cannot open Ⅱ–Ⅲ tiles"}
                  type="button"
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {farTileOpeningOn
                ? "Each player gets a face-down Ⅱ–Ⅲ Far-tile supply they may place onto the map for 1 movement point. The tile is rolled at random when placed."
                : "No Ⅱ–Ⅲ supply — players cannot open Far tiles (use this when the map already includes its Ⅱ–Ⅲ tiles)."}
            </small>
          </div>
        );
      })()}

      {(() => {
        const farTileOpeningOn = options.farTileOpening ?? true;
        if (!farTileOpeningOn) {
          return null;
        }
        const scenarioDefault = scenarioDefinitions[options.scenarioId]?.farTiles.perPlayer ?? 2;
        const current = options.farTilesPerPlayer ?? scenarioDefault;
        // 0..MAX_FAR_TILES_PER_PLAYER (the engine clamps to this range).
        const counts = [0, 1, 2, 3, 4, 5, 6];
        return (
          <div className="optionRow">
            <small title="How many NEW Ⅱ–Ⅲ tiles each player may add to the map (their supply size)">
              New Ⅱ–Ⅲ tiles / player
            </small>
            <div className="optionButtons">
              {counts.map((count) => (
                <button
                  aria-pressed={current === count}
                  className={current === count ? "selected" : ""}
                  key={count}
                  onClick={() => send({ farTilesPerPlayer: count })}
                  title={`Each player may add ${count} new Ⅱ–Ⅲ tile${count === 1 ? "" : "s"}`}
                  type="button"
                >
                  {count}
                </button>
              ))}
            </div>
            <small className="optionHint">
              Each player may add this many new Ⅱ–Ⅲ tiles (default {scenarioDefault}). Set 0 when a designed map already
              places its own Ⅱ–Ⅲ tiles. Tile replacement for Ore or a missing Settlement is controlled only by the
              BINH house rule in Combat &amp; map rules.
            </small>
          </div>
        );
      })()}

      {(() => {
        const farTileOpeningOn = options.farTileOpening ?? true;
        if (!farTileOpeningOn) {
          return null;
        }
        const blindChoiceOn = options.farTileBlindChoice ?? false;
        return (
          <div className="optionRow">
            <small title="Optional: before seeing any tile, a player opening a Ⅱ–Ⅲ tile blindly picks whether they want one with a gold mine, one with a valuables mine, or no preference — the random draw is filtered by that pick">
              Blind Ⅱ–Ⅲ tile choice
            </small>
            <div className="optionButtons">
              {BOOLEAN_OPTION_ORDER.map((on) => (
                <button
                  aria-pressed={blindChoiceOn === on}
                  className={blindChoiceOn === on ? "selected" : ""}
                  key={String(on)}
                  onClick={() => send({ farTileBlindChoice: on })}
                  title={on ? "Blind tile-type pick before the draw" : "No blind pick — draw straight away"}
                  type="button"
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {blindChoiceOn
                ? "Opening a Ⅱ–Ⅲ tile first asks — blindly, before any tile is seen — for a GOLD-mine tile, a VALUABLES-mine tile, or no preference; the random draw then matches the pick (falling back to a plain draw, with a note, when none is left)."
                : "Off: opening a Ⅱ–Ⅲ tile draws straight from the pool at random, exactly as usual."}
            </small>
          </div>
        );
      })()}

      {(() => {
        const farTileOpeningOn = options.farTileOpening ?? true;
        if (!farTileOpeningOn) {
          return null;
        }
        const typeChoiceOn = options.farTileTypeChoice ?? false;
        return (
          <div className="optionRow">
            <small title="Optional: the undecided Ⅱ–Ⅲ tile in a player's hand works like a hidden tile — placing it asks WHICH KIND of tile they want (gold mine, crystal mine, stone mine, Settlement) and a random tile of that kind is drawn">
              Ⅱ–Ⅲ tile type choice
            </small>
            <div className="optionButtons">
              {BOOLEAN_OPTION_ORDER.map((on) => (
                <button
                  aria-pressed={typeChoiceOn === on}
                  className={typeChoiceOn === on ? "selected" : ""}
                  key={String(on)}
                  onClick={() => send({ farTileTypeChoice: on })}
                  title={on ? "Choose the tile kind when placing" : "No type pick — draw straight away"}
                  type="button"
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {typeChoiceOn
                ? "Placing a Ⅱ–Ⅲ tile from your hand asks WHICH KIND you want — a GOLD mine, a CRYSTAL (valuables) mine, a STONE (ore) mine or a SETTLEMENT — and a random tile of that kind is drawn. Only kinds still left in the Ⅱ–Ⅲ supply are offered; with none left the tile is drawn at random with a note. A designed map may narrow the list (e.g. crystal or gold). Supersedes the blind choice above while on."
                : "Off: opening a Ⅱ–Ⅲ tile draws straight from the pool at random, exactly as usual."}
            </small>
          </div>
        );
      })()}

      <SeatCountControl
        footer={<SameChoiceAsBoxNote box="heroes" boxLabel="Heroes & Draft" onOpenBox={onOpenBox} />}
        onAction={onAction}
        state={state}
        viewerPlayerId={viewerPlayerId}
      />

      <div className="optionRow">
        <small title="The map you play on — a built-in scenario sheet or a designed map a player saved in the map designer">
          Map
        </small>
        <MapPicker options={options} send={send} singlePlayer={state.sessionMode === "single-player"} />
      </div>
      <SameChoiceAsBoxNote box="map" boxLabel="Map" onOpenBox={onOpenBox} />
      {onOpenBox ? (
        <small className="optionHint sameChoiceNote">
          Saving or loading a whole setup as a <strong>Custom setting</strong> file lives with the game modes — it is
          what the Custom mode card is.{" "}
          <button
            aria-label="Open the Game-mode window for Custom setting files"
            className="sameChoiceLink"
            onClick={() => onOpenBox("mode")}
            type="button"
          >
            Open Game mode
          </button>
        </small>
      ) : null}

      <div className="optionRow">
        <small title="Field Difficulty Level Table column used when guards are drawn, and the printed starting bonus each player receives at setup (rulebook p.10)">
          Neutral difficulty
        </small>
        <div className="optionButtons">
          {DIFFICULTY_CHOICES.map((choice) => (
            <button
              aria-pressed={options.difficulty === choice.id}
              className={options.difficulty === choice.id ? "selected" : ""}
              key={choice.id}
              onClick={() => send({ difficulty: choice.id })}
              title={choice.hint}
              type="button"
            >
              {choice.label}
            </button>
          ))}
        </div>
        <small className="optionHint">
          <strong>Starting bonus ({options.difficulty}):</strong>{" "}
          {startingBonusDescription(options.difficulty, {
            polishReduced: Boolean(options.houseRules?.["polish-reduced-starting-bonus"])
          })}
          {" "}Guards use the Field Difficulty Level Table column for this difficulty.
        </small>
      </div>
      <SameChoiceAsBoxNote box="map" boxLabel="Map" onOpenBox={onOpenBox} />

      </div>
      ) : null}

      {tab === "army" ? (
      <div className="optionTabPanel" role="tabpanel" aria-label="Town & Resources">

      <div className="optionRow">
        <small>Starting resources</small>
        <div className="optionSteppers">
          <ResourceStepper
            iconSrc={RESOURCE_ICONS.gold}
            label="gold"
            onChange={(gold) => send({ startingResources: { ...options.startingResources, gold } })}
            value={options.startingResources.gold}
          />
          <ResourceStepper
            iconSrc={RESOURCE_ICONS.buildingMaterials}
            label="materials"
            onChange={(buildingMaterials) =>
              send({ startingResources: { ...options.startingResources, buildingMaterials } })
            }
            value={options.startingResources.buildingMaterials}
          />
          <ResourceStepper
            iconSrc={RESOURCE_ICONS.valuables}
            label="valuables"
            onChange={(valuables) => send({ startingResources: { ...options.startingResources, valuables } })}
            value={options.startingResources.valuables}
          />
        </div>
      </div>

      <div className="optionRow">
        <small title="Base resource gain each Resource Round, before mines/settlements/buildings">
          Resource gain (income base)
        </small>
        <div className="optionSteppers">
          <ResourceStepper
            iconSrc={RESOURCE_ICONS.gold}
            label="gold"
            onChange={(gold) => send({ startingProduction: { ...options.startingProduction, gold } })}
            value={options.startingProduction.gold}
          />
          <ResourceStepper
            iconSrc={RESOURCE_ICONS.buildingMaterials}
            label="materials"
            onChange={(buildingMaterials) =>
              send({ startingProduction: { ...options.startingProduction, buildingMaterials } })
            }
            value={options.startingProduction.buildingMaterials}
          />
          <ResourceStepper
            iconSrc={RESOURCE_ICONS.valuables}
            label="valuables"
            onChange={(valuables) => send({ startingProduction: { ...options.startingProduction, valuables } })}
            value={options.startingProduction.valuables}
          />
        </div>
      </div>

      <div className="optionRow">
        <small title="One few or pack pick per unit level — each player gets their own faction's unit of that level">
          Starting units (level 1–7)
        </small>
        <StartingUnitsPicker
          onChange={(startingUnits) => send({ startingUnits })}
          startingUnits={options.startingUnits ?? []}
          viewerFactionId={viewerFactionId}
        />
      </div>

      <div className="optionRow">
        <small>Pre-built buildings</small>
        <div className="optionButtons">
          {STARTING_BUILDING_CHOICES.map((building) => {
            const checked = options.startingBuildings.includes(building.id);
            return (
              <button
                aria-pressed={checked}
                className={checked ? "selected" : ""}
                key={building.id}
                onClick={() =>
                  send({
                    startingBuildings: checked
                      ? options.startingBuildings.filter((candidate) => candidate !== building.id)
                      : [...options.startingBuildings, building.id]
                  })
                }
                type="button"
              >
                {building.label}
              </button>
            );
          })}
        </div>
      </div>

      </div>
      ) : null}
    </div>
  );
}

/** Best human rules text for a card id: its printed prose tag, else the auto effect. */
function cardRulesText(cardId: string | undefined): string {
  if (!cardId) {
    return "";
  }
  const card = cardLibrary[cardId];
  if (!card) {
    return "";
  }
  // Several abilities/specialties carry their printed wording as a multi-word tag
  // (Wisdom, the unit-specialist helpers); prefer it, exactly like the native
  // specialty card does, and otherwise fall back to the generated effect text.
  const prose = (card.tags ?? []).filter((tag) => /\s/.test(tag)).sort((a, b) => b.length - a.length)[0];
  return prose ?? describeCardEffect(card);
}

const SPECIALTY_LEVEL_NUMERAL: Record<1 | 4 | 6, string> = { 1: "I", 4: "IV", 6: "VI" };

/**
 * Read-only card for one hero: starting statistics, the starting ability and all
 * three specialty levels (I / IV / VI), each with the same rules text the table
 * shows when the card is zoomed. Shown beside the faction grid when a hero is
 * clicked or its info button is pressed.
 */
/** The printed statistic symbol (crossed swords / shield / spell book / tomes). */
function HeroInfoStatIcon({ stat }: { stat: keyof typeof HERO_INFO_STAT_ICONS }) {
  return <img alt="" aria-hidden="true" className="heroStatSymbol" src={assetUrl(HERO_INFO_STAT_ICONS[stat])} />;
}

/** The starting-ability's real secondary-skill emblem (or nothing if unmapped). */
function AbilitySymbol({ cardId }: { cardId: string | undefined }) {
  const src = abilitySymbolIcon(cardId);
  if (!src) {
    return null;
  }
  return (
    <span aria-hidden="true" className="heroAbilitySymbol">
      <img alt="" src={assetUrl(src)} />
    </span>
  );
}

/**
 * A hero's specialty symbol. Prefers the curated transparent specialty symbol
 * (contained in the chip, never cropped) — for the unit / spell / skill
 * specialists AND the Cove roster, whose full-card scans are inset in their
 * canvas and mis-crop through the fixed `.heroSpecArt img` window. Only when no
 * symbol is shipped does it fall back to the top-centre crop of the printed
 * scan (the classic roster, whose edge-to-edge scans crop cleanly); a hero with
 * neither just shows the numeral.
 */
function SpecialtySymbol({ cardId }: { cardId: string | undefined }) {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const scan = card?.assets?.cardImage;
  const nativeIcon = specialtyIconSrc(cardId);
  return (
    <span aria-hidden="true" className="heroSpecArt">
      {nativeIcon ? (
        <img alt="" className="heroSpecIcon" src={assetUrl(nativeIcon)} />
      ) : scan ? (
        <img alt="" src={assetUrl(scan)} />
      ) : null}
    </span>
  );
}

function HeroSetupDetail({ heroDefId }: { heroDefId: string }) {
  const hero = coreHeroDefinitions[heroDefId];
  if (!hero) {
    return null;
  }
  const faction = coreFactionDefinitions[hero.faction];
  const ability = cardLibrary[hero.startingAbilityCardId];
  const stats: { key: keyof typeof HERO_INFO_STAT_ICONS; label: string }[] = [
    { key: "attack", label: "Attack" },
    { key: "defense", label: "Defense" },
    { key: "power", label: "Power" },
    { key: "knowledge", label: "Knowledge" }
  ];

  return (
    <div className="heroDetail" aria-label={`${hero.name} details`}>
      <div className="heroDetailHead">
        <HeroPortrait name={hero.name} portrait={hero.portrait} size={54} />
        <div className="heroDetailTitle">
          <strong style={{ color: faction?.color }}>{hero.name}</strong>
          <small>
            {hero.class} · {hero.type} · {faction?.name ?? titleCase(hero.faction)}
          </small>
        </div>
      </div>

      <div className="heroDetailStats" aria-label="Starting statistics">
        {stats.map((stat) => (
          <div
            aria-label={`${stat.label} ${hero.startingStats[stat.key]}`}
            className="heroStat"
            key={stat.key}
            role="group"
          >
            <span className="heroStatIcon">
              <HeroInfoStatIcon stat={stat.key} />
            </span>
            <span className="heroStatValue">{hero.startingStats[stat.key]}</span>
            <span className="heroStatLabel">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="heroDetailSection">
        <h4>Starting ability</h4>
        {ability ? (
          <div className="heroDetailEntry heroDetailEntrySymbol">
            <AbilitySymbol cardId={hero.startingAbilityCardId} />
            <div className="heroDetailEntryText">
              <strong>{ability.name}</strong>
              <span>{cardRulesText(hero.startingAbilityCardId)}</span>
            </div>
          </div>
        ) : (
          <span className="heroDetailEmpty">—</span>
        )}
      </div>

      <div className="heroDetailSection">
        <h4>Specialties</h4>
        {([1, 4, 6] as const).map((level) => {
          const cardId = hero.specialtyCardIds?.[level];
          const card = cardId ? cardLibrary[cardId] : undefined;
          return (
            <div className="heroDetailEntry heroDetailEntrySymbol" key={level}>
              <span className="heroSpecArtWrap">
                <SpecialtySymbol cardId={cardId} />
                <span className="heroSpecLevel">{SPECIALTY_LEVEL_NUMERAL[level]}</span>
              </span>
              <div className="heroDetailEntryText">
                <strong>{card?.name ?? cardId ?? "—"}</strong>
                <span>{cardRulesText(cardId)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Modal popup with one hero's full card — stats, starting ability and all three
 * specialty levels. Opened from any hero's info button in the setup lobby and
 * dismissed with the ✕, a backdrop click or Escape. This replaces the old inline
 * detail panel so the hero list is never pushed down by a giant card.
 */
function HeroInfoModal({ heroDefId, onClose }: { heroDefId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      aria-label="Hero details"
      aria-modal="true"
      className="modalBackdrop heroInfoBackdrop"
      onClick={onClose}
      role="dialog"
    >
      <div className="heroInfoModal" onClick={(event) => event.stopPropagation()}>
        <button aria-label="Close hero details" className="heroInfoClose" onClick={onClose} type="button">
          <X aria-hidden="true" size={16} />
        </button>
        <HeroSetupDetail heroDefId={heroDefId} />
      </div>
    </div>
  );
  // Portal to <body>: the hero grid now lives inside the Setup Hub's own
  // (body-level) window, so an inline modal would be trapped in the lobby's
  // stacking context and render UNDER it however high its z-index.
  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}

/** One hero in a faction's hero list: a pick button + an info button (popup). */
function LobbyHeroEntry({
  heroDefId,
  selected,
  disabled,
  banned,
  pickTitle,
  onPick,
  onInspect
}: {
  heroDefId: string;
  selected: boolean;
  disabled: boolean;
  banned: boolean;
  pickTitle?: string;
  onPick: () => void;
  onInspect: () => void;
}) {
  const hero = coreHeroDefinitions[heroDefId];
  return (
    <div className="lobbyHeroRow">
      <button
        className={`lobbyHero ${selected ? "selected" : ""}${banned ? " banned" : ""}`}
        disabled={disabled}
        onClick={onPick}
        title={pickTitle}
        type="button"
      >
        <HeroPortrait name={hero?.name ?? heroDefId} portrait={hero?.portrait} size={34} style={{ gridRow: "span 2" }} />
        <span>
          {hero?.name ?? heroDefId}
          {banned ? " · banned" : ""}
        </span>
        <small>
          {hero?.class} · {hero?.type}
        </small>
      </button>
      <button
        aria-label="Show hero details"
        className="lobbyHeroInfo"
        onClick={onInspect}
        title={`${hero?.name ?? heroDefId}: specialty, ability & stats`}
        type="button"
      >
        <Info aria-hidden="true" size={14} />
      </button>
    </div>
  );
}

/**
 * Faction + hero grid, shared by free pick (every untaken town) and the draft
 * pick phase (only the seat's own town, banned heroes greyed out). `heroStateFor`
 * returns each hero's pick state; `onPick` commits it; `onInspect` opens the popup.
 */
function FactionPickGrid({
  factionIds,
  takenByOthers,
  heroStateFor,
  onPick,
  onInspect
}: {
  factionIds: FactionId[];
  takenByOthers: Set<FactionId>;
  heroStateFor: (
    factionId: FactionId,
    heroDefId: string
  ) => { selected: boolean; banned: boolean; disabled: boolean; title?: string };
  onPick: (factionId: FactionId, heroDefId: string) => void;
  onInspect: (heroDefId: string) => void;
}) {
  return (
    <div className="factionGrid" aria-label="Pick a faction and hero">
      {factionIds.map((factionId) => {
        const faction = coreFactionDefinitions[factionId];
        if (!faction) {
          return null;
        }
        const taken = takenByOthers.has(factionId);
        return (
          <div className={`factionCard ${taken ? "taken" : ""}`} key={factionId} style={{ borderColor: faction.color }}>
            <strong style={{ color: faction.color }}>{faction.name}</strong>
            {faction.ignoresMorale ? <small>ignores morale</small> : null}
            <div className="factionHeroes">
              {faction.heroes.map((heroDefId) => {
                const heroState = heroStateFor(factionId, heroDefId);
                return (
                  <LobbyHeroEntry
                    banned={heroState.banned}
                    disabled={heroState.disabled || taken}
                    heroDefId={heroDefId}
                    key={heroDefId}
                    onInspect={() => onInspect(heroDefId)}
                    onPick={() => onPick(factionId, heroDefId)}
                    pickTitle={heroState.title}
                    selected={heroState.selected}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A town (faction) choice button used by the town-lock steps. */
function TownChoiceButton({
  factionId,
  onClick,
  disabled,
  title
}: {
  factionId: FactionId;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const faction = coreFactionDefinitions[factionId];
  return (
    <button
      className="draftTownButton"
      disabled={disabled}
      onClick={onClick}
      style={{ borderColor: faction?.color }}
      title={title}
      type="button"
    >
      <strong style={{ color: faction?.color }}>{faction?.name ?? factionId}</strong>
      <small>{faction?.heroes.length ?? 0} heroes</small>
    </button>
  );
}

/** Per-seat "start over" control. */
function ResetSeatButton({
  viewerPlayerId,
  onAction,
  label = "Reset my pick"
}: {
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  label?: string;
}) {
  return (
    <button
      className="draftResetBtn"
      onClick={() => onAction({ type: "RESET_SEAT_DRAFT", playerId: viewerPlayerId })}
      type="button"
    >
      <RotateCcw aria-hidden="true" size={14} /> {label}
    </button>
  );
}

const DRAFT_FORMAT_BLURB: Record<DraftFormat, string> = {
  open: "Free pick — choose any untaken town and any of its heroes.",
  draft:
    "Lock a town (from a rolled pair, or by choosing one), ban heroes from each other’s towns, then pick your hero.",
  random: "Both town and hero are rolled at random for every seat.",
  "random-choice": "Roll a pair of towns and keep one, then roll a pair of that town’s heroes and keep one."
};

/** The four-way setup-format selector (TYPE 1–4). */
function SetupFormatSelector({
  format,
  viewerPlayerId,
  onAction
}: {
  format: DraftFormat;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  return (
    <div className="draftFormatRow" aria-label="Setup format">
      <small className="draftSectionLabel">Setup format</small>
      <div className="optionButtons draftFormatButtons">
        {(["open", "draft", "random", "random-choice"] as const).map((entry) => (
          <button
            aria-pressed={format === entry}
            className={format === entry ? "selected" : ""}
            key={entry}
            onClick={() => onAction({ type: "SET_DRAFT_FORMAT", playerId: viewerPlayerId, format: entry })}
            title={DRAFT_FORMAT_BLURB[entry]}
            type="button"
          >
            {DRAFT_FORMAT_LABELS[entry]}
          </button>
        ))}
      </div>
      <small className="optionHint">{DRAFT_FORMAT_BLURB[format]}</small>
    </div>
  );
}

type DraftFlowProps = {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  onInspect: (heroDefId: string) => void;
};

/** TYPE 2 — full random: roll the seat's town + hero (and re-roll the hero). */
function RandomSeatFlow({ state, viewerPlayerId, onAction }: Omit<DraftFlowProps, "onInspect">) {
  const seat = state.setupLobby?.seats.find((candidate) => candidate.playerId === viewerPlayerId);
  if (!seat) {
    return null;
  }
  const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
  const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
  return (
    <div className="draftFlow" aria-label="Full random">
      <div className="draftRandom">
        <button
          className="draftRollBtn"
          onClick={() => onAction({ type: "RANDOM_ASSIGN_SEAT", playerId: viewerPlayerId, scope: "faction" })}
          type="button"
        >
          <Dices aria-hidden="true" size={16} />
          <span>Roll random town &amp; hero</span>
        </button>
        <button
          className="draftRollBtn"
          disabled={!seat.factionId}
          onClick={() => onAction({ type: "RANDOM_ASSIGN_SEAT", playerId: viewerPlayerId, scope: "hero" })}
          title={seat.factionId ? "Re-roll a random hero of your town" : "Roll a town first"}
          type="button"
        >
          <Dices aria-hidden="true" size={16} />
          <span>Re-roll hero</span>
        </button>
      </div>
      {faction && hero ? (
        <p className="draftLockNote">
          <Check aria-hidden="true" size={14} /> Rolled{" "}
          <strong style={{ color: faction.color }}>{hero.name}</strong> of {faction.name}.
        </p>
      ) : (
        <p className="draftHint">Roll the dice to get a random town and hero.</p>
      )}
      {seat.factionId || seat.heroDefId ? (
        <ResetSeatButton onAction={onAction} viewerPlayerId={viewerPlayerId} />
      ) : null}
    </div>
  );
}

/** TYPE 1, step 1 — lock a town: roll a pair and pick, or select one directly. */
function DraftTownPhase({ state, viewerPlayerId, onAction }: Omit<DraftFlowProps, "onInspect">) {
  const lobby = state.setupLobby;
  const seat = lobby?.seats.find((candidate) => candidate.playerId === viewerPlayerId);
  if (!lobby || !seat) {
    return null;
  }
  const lockedCount = lobby.seats.filter((candidate) => candidate.factionId).length;
  const takenByOthers = reservedTownIdsForOtherSeats(lobby, viewerPlayerId);
  const untaken = (Object.values(coreFactionDefinitions) as { id: FactionId }[])
    .map((faction) => faction.id)
    .filter((id) => !takenByOthers.has(id) && isPlayableFaction(id, lobby.options.anime));
  const options = lobby.draft?.seatRolls?.[viewerPlayerId]?.townOptions ?? [];
  const lockedFaction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;

  return (
    <div className="draftFlow" aria-label="Lock your town">
      <div className="draftPhaseHead">
        <strong>Step 1 — lock your town</strong>
        <small>
          {lockedCount}/{lobby.seats.length} towns locked
        </small>
      </div>
      {lockedFaction ? (
        <>
          <p className="draftLockNote">
            <Lock aria-hidden="true" size={14} /> Locked to{" "}
            <strong style={{ color: lockedFaction.color }}>{lockedFaction.name}</strong>. Waiting for the other seats
            to lock their towns.
          </p>
          <ResetSeatButton label="Reset my town" onAction={onAction} viewerPlayerId={viewerPlayerId} />
        </>
      ) : (
        <>
          <div className="draftRandom">
            <button
              className="draftRollBtn"
              onClick={() => onAction({ type: "ROLL_TOWN_OPTIONS", playerId: viewerPlayerId })}
              type="button"
            >
              <Dices aria-hidden="true" size={16} />
              <span>{options.length ? "Re-roll two towns" : "Roll two towns"}</span>
            </button>
            {options.length ? (
              <ResetSeatButton label="Clear roll" onAction={onAction} viewerPlayerId={viewerPlayerId} />
            ) : null}
          </div>
          {options.length ? (
            <>
              <small className="draftHint">Pick one of your two rolled towns:</small>
              <div className="draftTownChoices">
                {options.map((factionId) => (
                  <TownChoiceButton
                    factionId={factionId}
                    key={factionId}
                    onClick={() => onAction({ type: "CHOOSE_TOWN", playerId: viewerPlayerId, factionId })}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <small className="draftHint">…or select a town directly:</small>
              <div className="draftTownChoices">
                {untaken.map((factionId) => (
                  <TownChoiceButton
                    factionId={factionId}
                    key={factionId}
                    onClick={() => onAction({ type: "CHOOSE_TOWN", playerId: viewerPlayerId, factionId })}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** TYPE 1, step 2 — the ban phase: each seat bans opponents' heroes in turn. */
function DraftBanPhase({ state, viewerPlayerId, onAction, onInspect }: DraftFlowProps) {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const draft = lobby.draft ?? { format: "draft" as const, bannedHeroDefIds: [] };
  const phase = getDraftPhase(lobby);
  const playerName = (playerId: PlayerId) => state.players[playerId]?.name ?? playerId;
  const myTurn = phase.currentBannerPlayerId === viewerPlayerId;
  const byFaction = new Map<FactionId, string[]>();
  if (myTurn) {
    for (const heroDefId of bannableHeroesForSeat(lobby, viewerPlayerId)) {
      const factionId = coreHeroDefinitions[heroDefId]?.faction as FactionId | undefined;
      if (!factionId) {
        continue;
      }
      byFaction.set(factionId, [...(byFaction.get(factionId) ?? []), heroDefId]);
    }
  }

  return (
    <div className="draftFlow" aria-label="Ban heroes">
      <div className="draftPhaseHead">
        <strong>Step 2 — ban phase</strong>
        <small>
          {phase.banPicksMade}/{phase.totalBans} bans · {phase.banBudgetPerSeat} per seat
        </small>
      </div>
      {myTurn ? (
        <>
          <p className="draftTurnNote">Your turn — ban one hero from another player’s town.</p>
          <div className="draftBans">
            {[...byFaction.entries()].map(([factionId, heroes]) => (
              <div className="draftBanFaction" key={factionId}>
                <strong style={{ color: coreFactionDefinitions[factionId]?.color }}>
                  {coreFactionDefinitions[factionId]?.name ?? factionId}
                </strong>
                <div className="draftBanHeroes">
                  {heroes.map((heroDefId) => (
                    <span className="draftBanChip" key={heroDefId}>
                      <button
                        className="draftBanHero"
                        onClick={() => onAction({ type: "BAN_HERO", playerId: viewerPlayerId, heroDefId })}
                        title={`Ban ${coreHeroDefinitions[heroDefId]?.name ?? heroDefId}`}
                        type="button"
                      >
                        <Ban aria-hidden="true" size={12} />
                        <span>{coreHeroDefinitions[heroDefId]?.name ?? heroDefId}</span>
                      </button>
                      <button
                        aria-label="Show hero details"
                        className="draftBanInfo"
                        onClick={() => onInspect(heroDefId)}
                        type="button"
                      >
                        <Info aria-hidden="true" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="draftTurnNote waiting">
          Waiting for {playerName(phase.currentBannerPlayerId ?? "")} to ban…
        </p>
      )}
      {draft.bannedHeroDefIds.length ? (
        <p className="draftBannedList">
          <Ban aria-hidden="true" size={13} /> Banned:{" "}
          {draft.bannedHeroDefIds.map((id) => coreHeroDefinitions[id]?.name ?? id).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/** TYPE 1, step 3 — pick your hero from your own town (banned heroes locked out). */
function DraftPickPhase({ state, viewerPlayerId, onAction, onInspect }: DraftFlowProps) {
  const lobby = state.setupLobby;
  const seat = lobby?.seats.find((candidate) => candidate.playerId === viewerPlayerId);
  if (!lobby || !seat?.factionId) {
    return null;
  }
  const factionId = seat.factionId;
  const banned = new Set(lobby.draft?.bannedHeroDefIds ?? []);
  return (
    <div className="draftFlow" aria-label="Pick your hero">
      <div className="draftPhaseHead">
        <strong>Step 3 — pick your hero</strong>
        <small>{coreFactionDefinitions[factionId]?.name} · banned heroes are greyed out</small>
      </div>
      <FactionPickGrid
        factionIds={[factionId]}
        heroStateFor={(_factionId, heroDefId) => ({
          selected: seat.heroDefId === heroDefId,
          banned: banned.has(heroDefId),
          disabled: banned.has(heroDefId),
          title: banned.has(heroDefId) ? "Banned out of this draft" : undefined
        })}
        onInspect={onInspect}
        onPick={(pickFactionId, heroDefId) =>
          onAction({ type: "CHOOSE_FACTION", playerId: viewerPlayerId, factionId: pickFactionId, heroDefId })
        }
        takenByOthers={new Set()}
      />
    </div>
  );
}

/** TYPE 3 — random with choice: roll-2-pick-1 for the town, then for the hero. */
function RandomChoiceFlow({ state, viewerPlayerId, onAction, onInspect }: DraftFlowProps) {
  const lobby = state.setupLobby;
  const seat = lobby?.seats.find((candidate) => candidate.playerId === viewerPlayerId);
  if (!lobby || !seat) {
    return null;
  }
  const rolls = lobby.draft?.seatRolls?.[viewerPlayerId] ?? {};

  if (!seat.factionId) {
    const townOptions = rolls.townOptions ?? [];
    return (
      <div className="draftFlow" aria-label="Roll and pick a town">
        <div className="draftPhaseHead">
          <strong>Step 1 — town</strong>
          <small>roll two, keep one</small>
        </div>
        <div className="draftRandom">
          <button
            className="draftRollBtn"
            onClick={() => onAction({ type: "ROLL_TOWN_OPTIONS", playerId: viewerPlayerId })}
            type="button"
          >
            <Dices aria-hidden="true" size={16} />
            <span>{townOptions.length ? "Re-roll two towns" : "Roll two towns"}</span>
          </button>
          {townOptions.length ? (
            <ResetSeatButton label="Clear roll" onAction={onAction} viewerPlayerId={viewerPlayerId} />
          ) : null}
        </div>
        {townOptions.length ? (
          <div className="draftTownChoices">
            {townOptions.map((factionId) => (
              <TownChoiceButton
                factionId={factionId}
                key={factionId}
                onClick={() => onAction({ type: "CHOOSE_TOWN", playerId: viewerPlayerId, factionId })}
              />
            ))}
          </div>
        ) : (
          <small className="draftHint">Roll to get two town options.</small>
        )}
      </div>
    );
  }

  const factionId = seat.factionId;
  const faction = coreFactionDefinitions[factionId];
  if (!seat.heroDefId) {
    const heroOptions = rolls.heroOptions ?? [];
    return (
      <div className="draftFlow" aria-label="Roll and pick a hero">
        <div className="draftPhaseHead">
          <strong>Step 2 — hero</strong>
          <small>{faction?.name} · roll two, keep one</small>
        </div>
        <div className="draftRandom">
          <button
            className="draftRollBtn"
            onClick={() => onAction({ type: "ROLL_HERO_OPTIONS", playerId: viewerPlayerId })}
            type="button"
          >
            <Dices aria-hidden="true" size={16} />
            <span>{heroOptions.length ? "Re-roll two heroes" : "Roll two heroes"}</span>
          </button>
          <ResetSeatButton label="Reset town" onAction={onAction} viewerPlayerId={viewerPlayerId} />
        </div>
        {heroOptions.length ? (
          <div className="factionGrid">
            <div className="factionCard" style={{ borderColor: faction?.color }}>
              <strong style={{ color: faction?.color }}>{faction?.name}</strong>
              <div className="factionHeroes">
                {heroOptions.map((heroDefId) => (
                  <LobbyHeroEntry
                    banned={false}
                    disabled={false}
                    heroDefId={heroDefId}
                    key={heroDefId}
                    onInspect={() => onInspect(heroDefId)}
                    onPick={() => onAction({ type: "CHOOSE_FACTION", playerId: viewerPlayerId, factionId, heroDefId })}
                    selected={false}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <small className="draftHint">Roll to get two hero options.</small>
        )}
      </div>
    );
  }

  const hero = coreHeroDefinitions[seat.heroDefId];
  return (
    <div className="draftFlow">
      <p className="draftLockNote">
        <Check aria-hidden="true" size={14} /> Locked <strong style={{ color: faction?.color }}>{hero?.name}</strong> of{" "}
        {faction?.name}.
      </p>
      <ResetSeatButton onAction={onAction} viewerPlayerId={viewerPlayerId} />
    </div>
  );
}

/**
 * The "Heroes & draft" tab body: the setup-format selector plus the flow for the
 * chosen format. Every control dispatches the matching engine action
 * (SET_DRAFT_FORMAT / ROLL_TOWN_OPTIONS / CHOOSE_TOWN / ROLL_HERO_OPTIONS /
 * BAN_HERO / CHOOSE_FACTION / RANDOM_ASSIGN_SEAT), so the result is shared and
 * enforced for every seat.
 */
function DraftFlowPanel({ state, viewerPlayerId, onAction, onInspect }: DraftFlowProps) {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const seat = lobby.seats.find((candidate) => candidate.playerId === viewerPlayerId);
  const draft = lobby.draft ?? { format: "open" as const, bannedHeroDefIds: [] };
  const phase = getDraftPhase(lobby);
  const takenByOthers = new Set(
    lobby.seats
      .filter((candidate) => candidate.playerId !== viewerPlayerId)
      .map((candidate) => candidate.factionId)
      .filter((id): id is FactionId => Boolean(id))
  );

  let flow: ReactNode = null;
  if (!seat) {
    flow = <p className="observerNote">Observer — waiting for the players to finish setup.</p>;
  } else if (draft.format === "open") {
    flow = (
      <FactionPickGrid
        factionIds={(Object.keys(coreFactionDefinitions) as FactionId[]).filter((id) =>
          isPlayableFaction(id, lobby.options.anime)
        )}
        heroStateFor={(factionId, heroDefId) => ({
          selected: seat.factionId === factionId && seat.heroDefId === heroDefId,
          banned: false,
          disabled: false
        })}
        onInspect={onInspect}
        onPick={(factionId, heroDefId) =>
          onAction({ type: "CHOOSE_FACTION", playerId: viewerPlayerId, factionId, heroDefId })
        }
        takenByOthers={takenByOthers}
      />
    );
  } else if (draft.format === "random") {
    flow = <RandomSeatFlow onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />;
  } else if (draft.format === "random-choice") {
    flow = (
      <RandomChoiceFlow onAction={onAction} onInspect={onInspect} state={state} viewerPlayerId={viewerPlayerId} />
    );
  } else if (phase.banPhaseActive) {
    flow = <DraftBanPhase onAction={onAction} onInspect={onInspect} state={state} viewerPlayerId={viewerPlayerId} />;
  } else if (phase.pickPhaseOpen) {
    flow = <DraftPickPhase onAction={onAction} onInspect={onInspect} state={state} viewerPlayerId={viewerPlayerId} />;
  } else {
    flow = <DraftTownPhase onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />;
  }

  return (
    <div className="draftPanel" aria-label="Draft and random">
      <SetupFormatSelector format={draft.format} onAction={onAction} viewerPlayerId={viewerPlayerId} />
      {flow}
    </div>
  );
}

/**
 * Single-player only: the human owner's per-opponent faction/hero picker. Each
 * COMPUTER seat gets a block showing its current pick (faction crest colour +
 * hero portrait + names) or a "Random at start" badge, plus controls to
 * hand-pick a town & hero (reusing FactionPickGrid — no second grid), roll a
 * random one now, or clear back to auto. Hidden outside single-player, for a
 * non-human viewer, and in any non-"open" format (the draft/random flows own the
 * picks there). Every button dispatches SET_COMPUTER_SEAT_FACTION, so the engine
 * validates and shares the result (a bot never re-picks a seat already set).
 */
function ComputerOpponentPickers({ state, viewerPlayerId, onAction, onInspect }: DraftFlowProps) {
  const [openSeatId, setOpenSeatId] = useState<PlayerId | null>(null);
  const lobby = state.setupLobby;
  const format = lobby?.draft?.format ?? "open";
  if (
    !lobby ||
    state.sessionMode !== "single-player" ||
    state.controllers?.[viewerPlayerId]?.kind !== "human" ||
    format !== "open"
  ) {
    return null;
  }
  const computerSeats = lobby.seats.filter((seat) => state.controllers?.[seat.playerId]?.kind === "computer");
  if (computerSeats.length === 0) {
    return null;
  }
  const takenByOthersFor = (seatPlayerId: PlayerId) =>
    new Set(
      lobby.seats
        .filter((candidate) => candidate.playerId !== seatPlayerId)
        .map((candidate) => candidate.factionId)
        .filter((id): id is FactionId => Boolean(id))
    );
  const playableFactions = (Object.keys(coreFactionDefinitions) as FactionId[]).filter((id) =>
    isPlayableFaction(id, lobby.options.anime)
  );

  return (
    <section className="computerSeatPickers" aria-label="Computer opponents setup">
      <div className="draftPhaseHead">
        <strong>Your computer opponents</strong>
        <small>Hand-pick each one’s town &amp; hero, roll one at random, or leave it on auto (picked at game start).</small>
      </div>
      {computerSeats.map((seat) => {
        // A designed map may FORCE this enemy's town type — the seat is then
        // locked (no pick/roll/clear); the engine picks the map's faction.
        const forcedFactionId = mapForcedComputerFaction(state, seat.playerId);
        const forcedFaction = forcedFactionId ? coreFactionDefinitions[forcedFactionId] : null;
        const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
        const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
        const expanded = openSeatId === seat.playerId;
        const picked = Boolean(seat.factionId || seat.heroDefId);
        if (forcedFaction) {
          return (
            <div className="computerSeatPicker locked" key={seat.playerId} aria-label={`${seat.name} — town set by map`}>
              <div className="computerSeatPickerHead">
                <span className="computerSeatPickerName">{seat.name}</span>
                <span className="computerSeatPickerPick">
                  <Lock aria-hidden="true" size={13} />
                  <span className="computerSeatPickerNames">
                    <strong style={{ color: forcedFaction.color }}>{forcedFaction.name}</strong>
                    <small>Town set by this map</small>
                  </span>
                </span>
              </div>
            </div>
          );
        }
        return (
          <div className="computerSeatPicker" key={seat.playerId} aria-label={`Set up ${seat.name}`}>
            <div className="computerSeatPickerHead">
              <span className="computerSeatPickerName">{seat.name}</span>
              {faction && hero ? (
                <span className="computerSeatPickerPick">
                  <HeroPortrait name={hero.name} portrait={hero.portrait} size={28} />
                  <span className="computerSeatPickerNames">
                    <strong style={{ color: faction.color }}>{hero.name}</strong>
                    <small>{faction.name}</small>
                  </span>
                </span>
              ) : (
                <span className="computerSeatPickerAuto">
                  <Dices aria-hidden="true" size={13} /> Random at start
                </span>
              )}
            </div>
            <div className="computerSeatPickerButtons">
              <button
                aria-expanded={expanded}
                className="draftResetBtn"
                onClick={() => setOpenSeatId(expanded ? null : seat.playerId)}
                type="button"
              >
                <Castle aria-hidden="true" size={14} /> {expanded ? "Close" : "Pick faction & hero"}
              </button>
              <button
                className="draftResetBtn"
                onClick={() =>
                  onAction({
                    type: "SET_COMPUTER_SEAT_FACTION",
                    playerId: viewerPlayerId,
                    seatPlayerId: seat.playerId,
                    choice: "roll"
                  })
                }
                type="button"
              >
                <Dices aria-hidden="true" size={14} /> Roll random now
              </button>
              {picked ? (
                <button
                  className="draftResetBtn"
                  onClick={() =>
                    onAction({
                      type: "SET_COMPUTER_SEAT_FACTION",
                      playerId: viewerPlayerId,
                      seatPlayerId: seat.playerId,
                      choice: "clear"
                    })
                  }
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={14} /> Back to auto
                </button>
              ) : null}
            </div>
            {expanded ? (
              <FactionPickGrid
                factionIds={playableFactions}
                heroStateFor={(factionId, heroDefId) => ({
                  selected: seat.factionId === factionId && seat.heroDefId === heroDefId,
                  banned: false,
                  disabled: false
                })}
                onInspect={onInspect}
                onPick={(factionId, heroDefId) => {
                  onAction({
                    type: "SET_COMPUTER_SEAT_FACTION",
                    playerId: viewerPlayerId,
                    seatPlayerId: seat.playerId,
                    choice: { factionId, heroDefId }
                  });
                  setOpenSeatId(null);
                }}
                takenByOthers={takenByOthersFor(seat.playerId)}
              />
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

// SetupHubBoxId and SETUP_HUB_MODE_NAMES live in setup-hub-summary.ts — shared
// with the Map window and the cross-window strip.

/**
 * One hub box's full-bleed painted panel (SETUP_HUB_ART): the art, a bottom
 * shade so the title plate always reads over it, and the hover light-sweep
 * layer. Pure presentation — aria-hidden, the button text carries the meaning.
 */
function SetupHubBoxArt({ id }: { id: SetupHubBoxId }) {
  return (
    <span aria-hidden="true" className="setupHubBoxArt">
      <img alt="" className="setupHubBoxArtImg" decoding="async" src={assetUrl(SETUP_HUB_ART[id])} />
      <span className="setupHubBoxArtShade" />
      <span className="setupHubBoxSheen" />
    </span>
  );
}

/**
 * The Setup Hub: four large painted panels (2×2, centered) that open the setup
 * windows, each summarizing the current choice on its bottom plate. The panel
 * art is the codex-generated SETUP_HUB_ART set (framed oil-painted scenes).
 */
function SetupHub({
  state,
  viewerPlayerId,
  onOpen
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onOpen: (box: SetupHubBoxId) => void;
}) {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const options = lobby.options;
  const mode = deriveActiveSetupMode(options);
  const wogOn = options.wog?.enabled === true;
  const animeOn = options.anime?.enabled === true;
  const heroes = heroesSummary(state, viewerPlayerId);
  const map = mapSummary(state);
  const advanced = advancedSettingsChanged(options);

  return (
    <div className="setupHubGrid" role="group" aria-label="Setup sections">
      <button
        aria-label="Game mode"
        aria-haspopup="dialog"
        className="setupHubBox setupHubBox--mode"
        onClick={() => onOpen("mode")}
        title="Pick a game mode preset and toggle the WOG / Anime mods"
        type="button"
      >
        <SetupHubBoxArt id="mode" />
        <span className="setupHubBoxPlate">
          <strong className="setupHubBoxTitle">Game mode</strong>
          <span className="setupHubBoxSummary">
            <span className="setupHubBoxLine">{SETUP_HUB_MODE_NAMES[mode]}</span>
            {wogOn || animeOn ? (
              <span className="setupHubBoxLine setupHubChips">
                {wogOn ? <span className="setupHubChip">WOG</span> : null}
                {animeOn ? <span className="setupHubChip">Anime</span> : null}
              </span>
            ) : null}
          </span>
        </span>
      </button>

      <button
        aria-label="Heroes & Draft"
        aria-haspopup="dialog"
        className="setupHubBox setupHubBox--heroes"
        onClick={() => onOpen("heroes")}
        title="Pick the setup format, your town & hero — and the computer opponents"
        type="button"
      >
        <SetupHubBoxArt id="heroes" />
        <span className="setupHubBoxPlate">
          <strong className="setupHubBoxTitle">Heroes &amp; Draft</strong>
          <span className="setupHubBoxSummary">
            {heroes ? (
              <>
                <span className="setupHubBoxLine">{heroes.yourPick ?? "Pick your town & hero"}</span>
                <span className="setupHubBoxLine setupHubBoxDim">
                  {heroes.formatLabel} · {heroes.picked}/{heroes.seats} picked
                  {heroes.computers > 0 ? ` · ${heroes.computers} computer${heroes.computers === 1 ? "" : "s"}` : ""}
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>

      <button
        aria-label="Map"
        aria-haspopup="dialog"
        className="setupHubBox setupHubBox--map"
        onClick={() => onOpen("map")}
        title="Choose the map you play on and the neutral difficulty"
        type="button"
      >
        <SetupHubBoxArt id="map" />
        <span className="setupHubBoxPlate">
          <strong className="setupHubBoxTitle">Map</strong>
          <span className="setupHubBoxSummary">
            {map ? (
              <>
                <span className="setupHubBoxLine">{map.name}</span>
                <span className="setupHubBoxLine setupHubBoxDim">
                  {map.seats} players ·{" "}
                  <img
                    alt=""
                    aria-hidden="true"
                    className="setupHubDifficultyIcon"
                    decoding="async"
                    src={assetUrl(DIFFICULTY_CHESS_ICONS[map.difficulty])}
                  />{" "}
                  {map.difficultyLabel}
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>

      <button
        aria-label="Advanced settings"
        aria-haspopup="dialog"
        className="setupHubBox setupHubBox--advanced"
        onClick={() => onOpen("advanced")}
        title="Every option — win condition, house rules, optional systems, army & resources"
        type="button"
      >
        <SetupHubBoxArt id="advanced" />
        <span className="setupHubBoxPlate">
          <strong className="setupHubBoxTitle">Advanced settings</strong>
          <span className="setupHubBoxSummary">
            <span className={`setupHubBoxLine${advanced.changed ? "" : " setupHubBoxDim"}`}>{advanced.label}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

/** The Game-mode window: the 4 mode cards + the WOG/Anime mod rows (and, under Custom, the setting-file panel). */
function GameModeModal({
  state,
  viewerPlayerId,
  onAction,
  onClose
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  onClose: () => void;
}) {
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }
  const options = lobby.options;
  const send = (next: Partial<GameSetupOptions>) =>
    onAction({ type: "SET_GAME_OPTIONS", playerId: viewerPlayerId, options: next });
  return (
    <SetupHubWindow
      className="setupHubWindow--mode"
      eyebrow="Game setup"
      label="Game mode"
      onClose={onClose}
    >
      <GameModeSection
        customHint="Personal custom setup: save the current map & rules to a file below, or load one of your setting files."
        customNotice="Custom mode selected: save the current setup to a file, or load a setting file, below."
        onAction={onAction}
        state={state}
        viewerPlayerId={viewerPlayerId}
      />
      {/*
        The setting-FILE panel is the Custom card's other half, and it is the
        ONLY copy in the app (it used to be duplicated inside the Map & Setup
        picker, where two independent name fields could disagree). It renders in
        every mode on purpose: saving IS what puts the table in Custom mode
        (saveToFile sends customMode: true), so gating it behind already being
        in Custom mode would leave a BINH/Legacy table unable to save at all.
      */}
      <PersonalCustomSettingsPanel options={options} send={send} />
    </SetupHubWindow>
  );
}

/** The Heroes & Draft window: setup format + faction/hero picks + the computer-opponent selection. */
function HeroesDraftModal({
  state,
  viewerPlayerId,
  onAction,
  onInspect,
  onClose
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  onInspect: (heroDefId: string) => void;
  onClose: () => void;
}) {
  // Hot-seat (open table, several seats, one browser): the local seat switcher
  // lives in the top bar, which this window covers — say so instead of leaving
  // the player hunting for it.
  const hotSeat = !state.room?.hosted && (state.setupLobby?.seats.length ?? 0) > 1;
  return (
    <SetupHubWindow
      className="setupHubWindow--heroes"
      eyebrow="Map setup"
      label="Heroes & Draft"
      onClose={onClose}
    >
      <SeatCountControl onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />
      <DraftFlowPanel onAction={onAction} onInspect={onInspect} state={state} viewerPlayerId={viewerPlayerId} />
      <ComputerOpponentPickers onAction={onAction} onInspect={onInspect} state={state} viewerPlayerId={viewerPlayerId} />
      {hotSeat ? (
        <small className="optionHint">
          Playing several seats in one browser? Close this window to reach the seat switcher at the top, then open it
          again for the next seat.
        </small>
      ) : null}
    </SetupHubWindow>
  );
}

/** The Advanced-settings window: the full classic Game-options panel, all four tabs. */
function AdvancedSettingsModal({
  state,
  viewerPlayerId,
  onAction,
  onOpenBox,
  onClose
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  onOpenBox: (box: SetupHubBoxId) => void;
  onClose: () => void;
}) {
  return (
    <SetupHubWindow
      className="setupHubWindow--advanced"
      eyebrow="Full options"
      label="Advanced settings"
      onClose={onClose}
    >
      <GameOptionsPanel onAction={onAction} onOpenBox={onOpenBox} state={state} viewerPlayerId={viewerPlayerId} />
    </SetupHubWindow>
  );
}

/**
 * Red "take-back" warning, shown to EVERY player (seated or observing) the
 * moment any seat clears a roll, resets a town, or resets a pick during setup —
 * in all four formats. The reset broadcasts a SETUP_SEAT_RESET event into the
 * shared log, so each client renders the same banner from synced state; it names
 * the offender and calls the take-back what it is (cheating). Dismissible, and it
 * re-appears for the next reset (a newer event id clears the dismissal).
 */
function SetupCheatWarning({ state, viewerPlayerId }: { state: GameState; viewerPlayerId: PlayerId }) {
  const latest = useMemo(() => {
    for (let index = state.eventLog.length - 1; index >= 0; index -= 1) {
      const event = state.eventLog[index];
      if (event.type === "SETUP_SEAT_RESET") {
        return event;
      }
    }
    return null;
  }, [state.eventLog]);

  const [dismissedId, setDismissedId] = useState<string | null>(null);
  if (!latest || latest.id === dismissedId) {
    return null;
  }

  const actorIsViewer = latest.playerId === viewerPlayerId;
  const actor = actorIsViewer ? "You" : state.players[latest.playerId]?.name ?? latest.playerId;
  const possessive = actorIsViewer ? "your" : "their";
  const did =
    latest.scope === "pick"
      ? `reset ${possessive} hero pick`
      : latest.scope === "town"
        ? `reset ${possessive} rolled town`
        : "cleared the roll";

  return (
    <div className="setupCheatWarning" role="alert" aria-live="assertive">
      <span className="setupCheatIcon" aria-hidden="true">
        ☠
      </span>
      <span className="setupCheatText">
        <strong>Setup take-back — the table remembers.</strong>
        <span>
          {actor} {did} after seeing the result. Re-rolling or re-picking a revealed result is cheating, and the whole
          table saw it.
        </span>
      </span>
      <button
        aria-label="Dismiss warning"
        className="setupCheatDismiss"
        onClick={() => setDismissedId(latest.id)}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * The pre-start ready check (multiplayer hosted table). Once a player presses
 * Start, every seated player must confirm within 30 seconds. This panel shows
 * the live countdown and the confirm/cancel controls, and — crucially — auto-
 * fires CANCEL_START_ADVENTURE the moment its own countdown hits zero, so an AFK
 * seat that never confirms drops the whole table back to setup ("AFK 30s → go
 * back"). Every live client runs the same countdown, so the abort fires even if
 * the presser themselves went away; the server re-checks the deadline against
 * its own clock, so the first arriving abort wins and the rest no-op.
 */
export function StartReadyCheck({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const check = state.setupLobby?.startCheck ?? null;
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  // Reset the one-shot auto-cancel guard whenever a (new) check opens/closes.
  useEffect(() => {
    firedRef.current = false;
  }, [check?.startedAt]);

  // Tick every 250ms while a check is open so the countdown is smooth and the
  // deadline auto-cancel fires promptly.
  useEffect(() => {
    if (!check) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [check]);

  const confirmers = readyCheckConfirmers(state);
  const viewerIsConfirmer = confirmers.includes(viewerPlayerId);

  // Deadline auto-cancel: once the window elapses, any live seated client fires
  // the abort (guarded so it fires once per open check).
  useEffect(() => {
    if (!check || !viewerIsConfirmer || firedRef.current) {
      return;
    }
    if (now >= check.deadline) {
      firedRef.current = true;
      onAction({ type: "CANCEL_START_ADVENTURE", playerId: viewerPlayerId });
    }
  }, [check, now, viewerIsConfirmer, onAction, viewerPlayerId]);

  if (!check) {
    return null;
  }

  const secondsLeft = Math.max(0, Math.ceil((check.deadline - now) / 1000));
  const confirmedCount = confirmers.filter((seat) => check.confirmations.includes(seat)).length;
  const viewerConfirmed = check.confirmations.includes(viewerPlayerId);
  const starterName = state.players[check.startedByPlayerId]?.name ?? check.startedByPlayerId;

  return (
    <div className="startReadyCheck" role="dialog" aria-label="Start ready check">
      <div className="startReadyCheckBody">
        <Hourglass aria-hidden="true" size={16} />
        <strong>{starterName} wants to start the adventure.</strong>
        <span className="startReadyCheckProgress">
          {confirmedCount}/{confirmers.length} ready · {secondsLeft}s left
        </span>
        {viewerIsConfirmer ? (
          <span className="startReadyCheckButtons">
            <button
              className="commandButton primary"
              disabled={viewerConfirmed}
              onClick={() => onAction({ type: "CONFIRM_START_ADVENTURE", playerId: viewerPlayerId })}
              type="button"
            >
              <Check aria-hidden="true" size={14} /> {viewerConfirmed ? "Ready — waiting…" : "Confirm start"}
            </button>
            <button
              className="commandButton danger"
              onClick={() => onAction({ type: "CANCEL_START_ADVENTURE", playerId: viewerPlayerId })}
              type="button"
            >
              <X aria-hidden="true" size={14} /> Cancel
            </button>
          </span>
        ) : (
          <span className="startReadyCheckWaiting">Waiting for the players to confirm…</span>
        )}
      </div>
    </div>
  );
}

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
  // Which Setup Hub window is open (null = the four boxes only).
  const [openBox, setOpenBox] = useState<SetupHubBoxId | null>(null);
  // The hero info popup (replaces the old inline detail panel). Null = closed.
  const [infoHeroId, setInfoHeroId] = useState<string | null>(null);
  // Re-open the helper-tips prompt after the player already chose (optional).
  const [forceHelperPrompt, setForceHelperPrompt] = useState(false);
  const helperCoach = useHelperCoachPreference();
  if (!lobby) {
    return null;
  }

  const mySeat = lobby.seats.find((seat) => seat.playerId === viewerPlayerId);
  const allChosen = lobby.seats.every((seat) => seat.factionId && seat.heroDefId);
  const scenarioName = scenarioDefinitions[lobby.options.scenarioId]?.name ?? lobby.scenarioId;
  const singlePlayer = state.sessionMode === "single-player";

  return (
    <section className={`setupLobby${allChosen ? " setupLobby--ready" : ""}`} aria-label="Map setup">
      <SetupSceneArt />
      {/* First-visit opt-in: next-step coach + card reasons (local browser pref). */}
      <HelperCoachLobbyPrompt force={forceHelperPrompt} onClose={() => setForceHelperPrompt(false)} />
      <header>
        <h2>Map setup — {scenarioName}</h2>
        {singlePlayer ? (
          <p>
            <strong>Playing with computer.</strong> Open <strong>Heroes &amp; Draft</strong> for your town, your hero
            and the computer opponents. Each box shows its current choice.
          </p>
        ) : (
          <p>
            Set the game up through the four boxes — each one shows the table&apos;s current choice.
          </p>
        )}
        {helperCoach.ready && helperCoach.preference !== null ? (
          <p className="helperCoachLobbyNote">
            Helper tips are <strong>{helperCoach.enabled ? "on" : "off"}</strong>.{" "}
            <button className="helperCoachLobbyLink" onClick={() => setForceHelperPrompt(true)} type="button">
              Change
            </button>
          </p>
        ) : null}
      </header>

      <SetupCheatWarning state={state} viewerPlayerId={viewerPlayerId} />

      <div className="lobbySeats">
        {lobby.seats.map((seat) => {
          const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
          const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
          const isComputer = state.controllers?.[seat.playerId]?.kind === "computer";
          return (
            <div className={`lobbySeat ${seat.playerId === viewerPlayerId ? "mine" : ""}`} key={seat.playerId}>
              <strong>
                {state.players[seat.playerId]?.name ?? seat.name}
                {isComputer ? <span className="computerSeatBadge">Computer</span> : null}
                {singlePlayer && seat.playerId === viewerPlayerId ? (
                  <span className="computerSeatBadge you">You</span>
                ) : null}
              </strong>
              {faction && hero ? (
                <small>
                  {faction.name} — {hero.name} ({hero.class})
                </small>
              ) : faction ? (
                <small>{faction.name} — choosing hero…</small>
              ) : (
                <small>choosing…</small>
              )}
            </div>
          );
        })}
      </div>

      {mySeat ? (
        <>
          <SetupHub onOpen={setOpenBox} state={state} viewerPlayerId={viewerPlayerId} />
          {/* Always-visible consolidated summary, pinned to the right of the
              scene — the painted boxes show only their titles. */}
          <SetupSummaryRail onOpen={setOpenBox} state={state} viewerPlayerId={viewerPlayerId} />
          {openBox === "mode" ? (
            <GameModeModal
              onAction={onAction}
              onClose={() => setOpenBox(null)}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
          {openBox === "heroes" ? (
            <HeroesDraftModal
              onAction={onAction}
              onClose={() => setOpenBox(null)}
              onInspect={setInfoHeroId}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
          {openBox === "map" ? (
            <MapPickModal
              onAction={onAction}
              onClose={() => setOpenBox(null)}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
          {openBox === "advanced" ? (
            <AdvancedSettingsModal
              onAction={onAction}
              onClose={() => setOpenBox(null)}
              onOpenBox={setOpenBox}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
        </>
      ) : (
        (() => {
          // In a HOSTED/closed room a fresh joiner (and the host) starts as an
          // unseated observer and MUST claim a seat before they can pick a
          // faction or do anything — but a plain "waiting for the players" note
          // read as "just sit tight", so people got stuck thinking the room was
          // broken and "couldn't do anything". When a seat is still open, tell
          // them to take one (the seat controls live in the top bar).
          const room = state.room;
          const openSeatExists =
            Boolean(room?.hosted) &&
            lobby.seats.some(
              (candidate) => !(room?.members ?? []).some((member) => member.seat === candidate.playerId)
            );
          return openSeatExists ? (
            <p className="observerNote">
              You&apos;re observing — <strong>take a seat</strong> using the seat controls at the top of the screen to
              pick a faction and play.
            </p>
          ) : (
            <p className="observerNote">Observer: waiting for the players to finish map setup.</p>
          );
        })()
      )}

      {mySeat ? (
        <button
          aria-label={allChosen ? "New Game — Start game" : "Waiting for every seat to pick"}
          className="newGameMenuButton setupSceneStartButton"
          disabled={!allChosen || Boolean(lobby.startCheck)}
          onClick={() => onAction({ type: "START_ADVENTURE", playerId: viewerPlayerId })}
          title={allChosen ? "Start the adventure" : "Every seat must pick a faction and hero first"}
          type="button"
        >
          <img
            alt=""
            aria-hidden="true"
            className="newGameMenuIcon"
            draggable={false}
            src={assetUrl("/assets/skills/slayer.webp")}
          />
          <span className={`newGameMenuLabel${allChosen ? "" : " waiting"}`}>
            {allChosen ? "Start game" : "Waiting for everyone…"}
          </span>
        </button>
      ) : null}

      <StartReadyCheck onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />

      {infoHeroId ? <HeroInfoModal heroDefId={infoHeroId} onClose={() => setInfoHeroId(null)} /> : null}
    </section>
  );
}

export function titleCaseLocation(location: string): string {
  return titleCase(location);
}

// ---------------------------------------------------------------------------
// Adventure event feed: every visit, gain and fight outcome spelled out
// ---------------------------------------------------------------------------

/**
 * Event types surfaced as toasts, with an icon and a sound-cue name. The cue
 * names are the future audio hook: when sound lands, map each cue to a file
 * and play it where the feed item is enqueued — nothing else has to change.
 */
export const ADVENTURE_FEED_CUES: Partial<Record<GameEventType, { icon: string; cue: string }>> = {
  FIELD_VISITED: { icon: "📍", cue: "visit" },
  FIELD_FLAGGED: { icon: "🚩", cue: "flag" },
  RESOURCES_GAINED: { icon: "🪙", cue: "coins" },
  RESOURCES_SPENT: { icon: "💸", cue: "pay" },
  ADVENTURE_DICE_ROLLED: { icon: "🎲", cue: "dice" },
  EXPERIENCE_GAINED: { icon: "📈", cue: "experience" },
  // Unit Experience: a unit card crossing a veteran-rank threshold.
  UNIT_RANK_UP: { icon: "🎖️", cue: "experience" },
  HERO_LEVEL_UP: { icon: "⭐", cue: "level-up" },
  // Anime Cultivation (§5.6): a realm breakthrough rings the level-up sting; the
  // Tribulation dice show quietly, a failure uses the defeat sting.
  CULTIVATION_REALM_ADVANCED: { icon: "☯️", cue: "level-up" },
  CULTIVATION_TRIBULATION_ROLLED: { icon: "🎲", cue: "dice" },
  CULTIVATION_TRIBULATION_FAILED: { icon: "🌩️", cue: "retreat" },
  HERO_GAINED: { icon: "🧙", cue: "recruit" },
  HERO_LOST: { icon: "🏳", cue: "retreat" },
  MORALE_CHANGED: { icon: "🎺", cue: "morale" },
  MORALE_CARD_DRAWN: { icon: "🎺", cue: "morale" },
  MORALE_CARD_DISCARDED: { icon: "🎺", cue: "morale" },
  MORALE_CARD_USED: { icon: "🎺", cue: "morale" },
  QUICK_COMBAT_WON: { icon: "⚡", cue: "quick-combat" },
  // Forced Battle Events (Anime mod, §3.12): a scripted combat event announces
  // itself in the feed (environment mist, an obstacle formation, a round pulse).
  COMBAT_SCRIPT_TRIGGERED: { icon: "🌀", cue: "combat-start" },
  NEUTRAL_COMBAT_STARTED: { icon: "⚔️", cue: "battle-begin" },
  NEUTRAL_ARMY_REVEALED: { icon: "👁", cue: "reveal" },
  PLAYER_COMBAT_STARTED: { icon: "⚔️", cue: "battle-begin" },
  COMBAT_ENDED: { icon: "🏆", cue: "combat-end" },
  COMBAT_RETREATED: { icon: "🏳", cue: "retreat" },
  TRADE_EXECUTED: { icon: "⚖", cue: "trade" },
  WAR_MACHINE_BOUGHT: { icon: "⚙", cue: "trade" },
  PERMANENT_PLAYED: { icon: "⚙", cue: "build" },
  WAR_MACHINE_TRIGGERED: { icon: "💥", cue: "combat-start" },
  UNIT_RECRUITED: { icon: "🛡", cue: "recruit" },
  PRODUCTION_CHANGED: { icon: "🏭", cue: "income" },
  STRUCTURE_BUILT: { icon: "🔨", cue: "build" },
  ASTROLOGERS_DRAWN: { icon: "🔭", cue: "astrologers" },
  ASTROLOGERS_HAND_RESHUFFLED: { icon: "🃏", cue: "astrologers" },
  // Event deck (Fortress optional rule): a drawn Event announces itself in the
  // feed too — the big EventDrawnOverlay owns the sound, so this cue is silent.
  EVENT_CARD_DRAWN: { icon: "📜", cue: "event" },
  NEUTRAL_DRAW_SWAPPED: { icon: "🔄", cue: "swap" },
  // A genuinely NEW member joining the room announces itself (page.tsx filters
  // out the newMember:false reconnect re-emits, so refreshes stay silent).
  ROOM_MEMBER_JOINED: { icon: "👋", cue: "join" },
  GAME_OPTIONS_CHANGED: { icon: "⚙️", cue: "options" },
  SETUP_SEAT_RESET: { icon: "⚠️", cue: "warning" },
  GAME_WON: { icon: "👑", cue: "victory" },
  VP_SCORING: { icon: "🎖️", cue: "victory" },
  PLAYER_ELIMINATED: { icon: "💀", cue: "defeat" },
  PLAYER_ELIMINATION_CLOCK: { icon: "⏳", cue: "warning" },
  FIRST_PLAYER_ROLLED: { icon: "🎲", cue: "dice" },
  TOWN_BUILDING_USED: { icon: "🏛", cue: "build" },
  SIEGE_FORTIFICATIONS_PLACED: { icon: "🏰", cue: "build" },
  FORTIFICATION_DESTROYED: { icon: "💥", cue: "combat-start" },
  COMBAT_TOKEN_PLACED: { icon: "🔘", cue: "swap" },
  PARALLEL_TURNS_STARTED: { icon: "🔀", cue: "options" },
  PARALLEL_TURN_ENDED: { icon: "🔀", cue: "options" },
  PARALLEL_TURNS_STOPPED: { icon: "⚠️", cue: "warning" },
  // OPTIONAL Undo mode (debug/testing): a rewind is never silent — it always
  // shows a feed line + warning cue so the whole table sees the roll-back.
  MOVES_UNDONE: { icon: "↩", cue: "warning" },
  // WOG Commanders: level-ups (grade-ups), death and revival announce
  // themselves in the feed alongside the dock tile's blink.
  COMMANDER_GRADED_UP: { icon: "👑", cue: "level-up" },
  COMMANDER_DIED: { icon: "🪦", cue: "defeat" },
  COMMANDER_REVIVED: { icon: "👑", cue: "recruit" },
  COMMANDER_FIRST_AID_USED: { icon: "⛑", cue: "recruit" },
  COMMANDER_SPECIALTY_TRIGGERED: { icon: "👑", cue: "options" }
};

type GameEventType = GameState["eventLog"][number]["type"];

export type AdventureFeedItem = {
  id: string;
  icon: string;
  text: string;
  cue: string;
};

/**
 * Floating feed of what just happened on the map — visits state their
 * effects in words ("gains 3 gold (Resource die)" and so on), fights
 * announce themselves, reveals and level-ups stand out. Click to dismiss.
 */
export function AdventureEventFeed({
  items,
  onDismiss
}: {
  items: AdventureFeedItem[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="adventureFeed" aria-label="What just happened" aria-live="polite">
      {items.map((item) => (
        <button className="feedItem" key={item.id} onClick={() => onDismiss(item.id)} title="Dismiss" type="button">
          <span aria-hidden="true" className="feedIcon">
            {item.icon}
          </span>
          <span>{item.text}</span>
        </button>
      ))}
    </div>
  );
}
