"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { assetUrl } from "@/lib/asset-url";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ban, Castle, Check, ChevronsUp, Crown, Dices, Fence, Hammer, Hourglass, Image as ImageIcon, Info, Layers, Lock, Minus, Plus, RotateCcw, RotateCw, Sparkles, Swords, Unlock, X } from "lucide-react";
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
import { CREATURE_BANKS, type CreatureBankId } from "@/data/map/creature-banks";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  NEUTRAL_DECK_IDS,
  NEUTRAL_PLAYER_ID,
  DEFAULT_WOG_OPTIONS,
  PVP_TROOP_LOSS_DESCRIPTIONS,
  PVP_TROOP_LOSS_LABELS,
  RULESET_DESCRIPTIONS,
  RULESET_LABELS,
  VICTORY_MODE_DESCRIPTIONS,
  VICTORY_MODE_LABELS,
  applyUnitSideRules,
  bannableHeroesForSeat,
  deckDisplayName,
  describeCardEffect,
  describeCustomMapPresetEntries,
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
  tournamentRulesAllOn,
  getTileBorderSegments,
  hasOpenAdventureTurn,
  hexDistance,
  hexSpaceId,
  hexToPixel,
  inCombatPrep,
  isMapTokenLocation,
  isParallelActor,
  isRoundStartEventBarrierActive,
  MAX_PARALLEL_TURN_ROUNDS,
  parallelInteractionBlocker,
  parallelTurnsActive,
  readyCheckConfirmers,
  remainingParallelPlayerIds,
  observatoryRevealTargets,
  parseHexSpaceId,
  seatPickSummary,
  reservedTownIdsForOtherSeats,
  scenarioDefinitions,
  startingBonusDescription,
  tileFootprint,
  tierOfLevel,
  UNIT_LEVELS,
  unitAbilities,
  unitSideRuleOverrides,
  validateCustomMapPlan,
  astrologersCardDefinitions,
  eventCardDefinitions,
  type CustomStartingUnit,
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
  type MapSpaceId,
  type MapTileState,
  type PlayerId,
  type PlayerVisibleState
} from "@/engine";
import {
  abilitySymbolIcon,
  creatureBankFieldImage,
  HERO_INFO_STAT_ICONS,
  mapTokenImage,
  monolithTokenImage,
  moraleIcon,
  RESOURCE_ICONS,
  subterraneanGateTokenImage,
  tileBackImage,
  TILE_BACK_IMAGES,
  whirlpoolTokenImage
} from "@/data/assets/homm-assets";
import { specialtyIconSrc } from "@/components/specialty-card-data";
import { CommanderCard, CommanderLevelUpOverlay } from "@/components/commander-card";
import { commanderDefinitions, commanderReviveCost, type CommanderSlug } from "@/data/commanders";
import { CARD_BACK_IMAGES, getDeckBack } from "@/data/decks";
import { actionKey, cardName, formatCost, isEmpoweredStatisticCard, titleCase } from "@/components/table/utils";
import { beginUnitPointerDrag } from "@/components/table/pointer-drag";
import { MAP_SCALE_MAX, MAP_SCALE_MIN, pinchCamera, type PinchStart } from "@/components/adventure/map-pinch";
import { computeMapFloatPosition } from "@/components/adventure/map-float-position";
import { HeroBoard } from "@/components/hero-board";
import { useCardZoom } from "@/components/table/zoom";
import {
  BuildingDetailPanel,
  HeroPortrait,
  HireHeroesSection,
  TownRecruitSection,
  hasBuildingEffectPanel,
  activeBuildingActions
} from "@/components/adventure/town-sections";
import { fetchSharedMaps, type SharedMapRecord } from "@/lib/shared-maps";

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
  whirlpool: "🌀"
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
  // Creature Bank fields are drawn border-free by default; this toggle brings the
  // printed bank outline (its outer arc) back for players who want it.
  const [showBankBorders, setShowBankBorders] = useState(false);
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

  // Only surface the bank-border toggle once a Creature Bank is actually on the
  // map (otherwise it toggles nothing).
  const hasCreatureBank = useMemo(
    () => Object.values(adventure?.fields ?? {}).some((field) => field.location === "creature_bank"),
    [adventure]
  );

  // A tap on a would-be move target while the MANDATORY start-of-turn draw is
  // still pending shows a brief, single, auto-fading "draw first" note anchored
  // at that hex — a gentle reminder, never a stacked or repeating toast (a fresh
  // tap just re-anchors the one note and restarts its timer).
  const [drawReminderAt, setDrawReminderAt] = useState<MapSpaceId | null>(null);
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
  // destination field to the action that selects it.
  const endTurnMoveTargets = useMemo(() => {
    const targets = new Map<MapSpaceId, GameAction>();
    if (readOnly) {
      return targets;
    }
    const visit = rawAdventure?.pendingVisit;
    const step = visit?.steps[0];
    if (!visit || visit.playerId !== viewerPlayerId || step?.type !== "CHOOSE_ONE") {
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

  // Map-targeted spell choices belong on the map. Dimension Door and View
  // Earth used to expose only opaque location-code buttons; index-align their
  // legal actions with the destination fields so the glowing hex is clickable.
  const pendingMapChoiceTargets = useMemo(() => {
    const targets = new Map<MapSpaceId, GameAction>();
    const choice = state.pendingChoice;
    if (readOnly || choice?.type !== "OPTION_CHOICE" || choice.playerId !== viewerPlayerId) {
      return targets;
    }
    const spaceIds =
      choice.context === "dimension-door"
        ? choice.dimensionDoor?.destinations
        : choice.context === "view-earth"
          ? choice.viewEarth?.mineSpaceIds
          : choice.context === "subterranean-gate-placement"
            ? choice.subterraneanGate?.candidates.map((candidate) => candidate.hex)
            : choice.context === "place-map-token"
              ? choice.mapToken?.candidates
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

  // During the Subterranean Gate pick-on-reveal choice, tag every candidate hex
  // so the map can spell out — right on the flower — which field would become the
  // Gate (down, on a Surface tile) or the Path up (a Subterranean tile's entrance
  // to the Surface). The choice is otherwise legible only from the prompt text.
  const gatePlacementChoice = useMemo(() => {
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
    // Every candidate of one choice carves the same half type — it depends only on
    // which layer was just revealed — so a single role labels the whole set.
    const role = candidates[0]?.role ?? "gate";
    return { role, hexes: new Set<MapSpaceId>(candidates.map((candidate) => candidate.hex)) };
  }, [state.pendingChoice, viewerPlayerId, readOnly]);

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
    if (!placement || !rawAdventure || !myHero) {
      return [] as { row: number; col: number }[];
    }
    const tileDefId = rawAdventure.playerFarTiles?.[viewerPlayerId]?.[placement.supplyIndex];
    return farTilePlacementCenters(state, myHero, tileDefId);
  }, [placement, rawAdventure, myHero, state, viewerPlayerId]);

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
      // A designed Monolith/Whirlpool token riding this face-down tile is
      // public info (the physical Scenario Map Layout prints token positions),
      // so show it on the back: whoever discovers the tile places the token on
      // a field of their choosing, and travelling to it reveals the tile.
      if (tile.pendingToken) {
        artLayer.push(
          <image
            className="tileBackPendingToken"
            height={2 * HEX_SIZE * 0.9}
            href={assetUrl(mapTokenImage(tile.pendingToken.kind, tile.pendingToken.number))}
            key={`back-token-${tile.id}`}
            opacity={0.9}
            preserveAspectRatio="xMidYMid meet"
            style={{ pointerEvents: "none" }}
            width={HEX_WIDTH * 0.9}
            x={centerPixel.x - (HEX_WIDTH * 0.9) / 2}
            y={centerPixel.y - HEX_SIZE * 0.9}
          />
        );
      }
      // A still-hidden Subterranean tile can never be discovered from the Surface
      // (or vice versa) — only a hero entering a Subterranean Gate opens it. When
      // it isn't otherwise discoverable, a tap explains that instead of doing
      // nothing, so players aren't left clicking a dead tile.
      const cavernNeedsGate = tile.group === "subterranean" && !discover && !readOnly;
      for (const [slot, coord] of footprint.entries()) {
        const { x, y } = hexToPixel(coord, HEX_SIZE);
        track(x, y);
        cells.push(
          <g key={`${tile.id}-${slot}`}>
            <polygon
              className={`hexFaceDown ${discover && !readOnly ? "discoverable" : ""} ${cavernNeedsGate ? "needsGate" : ""}`}
              data-tile-id={tile.id}
              onClick={
                discover && !readOnly
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
                  discover
                    ? normalDiscover
                      ? `Spend 1 movement point to discover this ${backLabelDisplay} tile`
                      : `Reveal this adjacent ${backLabelDisplay} tile with the Observatory`
                    : cavernNeedsGate
                      ? `Underground tile (${backLabelDisplay}) — you can't discover it from the Surface. Enter a Subterranean Gate to open it.`
                      : `Face-down tile ${backLabelDisplay}`
                }${
                  tile.pendingToken
                    ? ` — carries a ${tile.pendingToken.kind === "monolith" ? "Monolith" : "Whirlpool"} token: whoever discovers the tile places it on a field of their choosing`
                    : ""
                }`}
              </title>
            </polygon>
          </g>
        );
        if (slot === 0 && discover && !readOnly) {
          overlays.push(
            <text
              className="hexFaceDownLabel"
              key={`${tile.id}-back`}
              textAnchor="middle"
              x={x}
              y={y + HEX_SIZE * 0.78}
            >
              {normalDiscover ? "🐎 1 movement point: discover" : "Observatory: reveal this tile"}
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
      const bankPreviewSlot =
        reservedBankId && tileDef ? tileDef.fields.findIndex((field) => field.location === "blocked_field") : -1;
      const previewBankSlots = bankPreviewSlot >= 0 ? new Set([bankPreviewSlot]) : undefined;
      const borderSegments = tileDef ? getTileBorderSegments(tileDef, previewBankSlots, showBankBorders) : [];
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
              <text className="hexBankLabel" textAnchor="middle" x={x} y={y + HEX_SIZE * 0.66}>
                {CREATURE_BANKS[reservedBankId]?.name ?? "Creature Bank"}
              </text>
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
        // Printed yellow border lines (full arcs + blocked-field rings)
        // move with the rotation preview.
        for (const segment of borderSegments) {
          if (segment.slot !== slot) {
            continue;
          }
          const direction = (segment.edge + rotation) % 6;
          const edge = hexEdgeForDirection(x, y, HEX_SIZE - 1.2, direction);
          overlays.push(
            <line className="tileBorderLine" key={`${tile.id}-rot-border-${slot}-${segment.edge}`} {...edge} />
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
    // The printed scan already shows the locations, numerals and mine icons:
    // hide the built-in markers and keep only live game state (cubes, flags,
    // settlement production, movement) on top of the art.
    const artShown = showArt && Boolean(tileDef?.assets?.tileImage);
    const footprint = tileFootprint(center, tile.rotation);
    // A Blocked Field carved into a Creature Bank is open inward (you walk in
    // from within the Tile) — tell the border builder so it draws only the
    // bank's outer arc, not a full ring that would look impassable.
    const bankSlots = new Set<number>();
    footprint.forEach((coord, slot) => {
      if (adventure.fields[`h:${coord.row}:${coord.col}`]?.location === "creature_bank") {
        bankSlots.add(slot);
      }
    });
    const borderSegments = tileDef ? getTileBorderSegments(tileDef, bankSlots, showBankBorders) : [];
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
      const guarded = Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
      const glyph = LOCATION_GLYPHS[field.location] ?? "";
      const isSelected = selectedTarget?.spaceId === spaceId;

      cells.push(
        <polygon
          className={[
            "hexCell",
            field.location === "blocked_field" ? "blocked" : "",
            target ? "moveTarget" : "",
            remindMove ? "moveTargetLocked" : "",
            endTurnMove ? "endTurnMoveTarget" : "",
            mapChoice ? "mapChoiceTarget" : "",
            isSelected ? "selectedTarget" : "",
            artShown ? "withArt" : ""
          ].join(" ")}
          data-space-id={spaceId}
          fill={terrain}
          key={spaceId}
          onClick={
            readOnly
              ? undefined
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
                    : undefined
          }
          points={hexCorners(x, y, HEX_SIZE - 1.2)}
        >
          <title>
            {`${
              field.location === "creature_bank" && field.bankId
                ? `${CREATURE_BANKS[field.bankId as CreatureBankId]?.name ?? "Creature Bank"} (Creature Bank)`
                : (location?.name ?? field.location)
            }${field.difficulty && guarded ? ` (guard ${ROMAN[field.difficulty]})` : ""}${
              field.flagOwnerId ? ` — flagged by ${state.players[field.flagOwnerId]?.name}` : ""
            }${
              field.location === "subterranean_gate"
                ? tile.group === "subterranean"
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
              mapChoice
                ? " — click to choose this location"
                : endTurnMove
                  ? " — click to move your hero here"
                  : ""
            }`}
          </title>
        </polygon>
      );

      // A reachable Subterranean Gate is the ONLY way across the layer divide, so
      // mark it with a "descend/ascend" cue — otherwise players don't realise the
      // cave-mouth hex is a doorway they can step onto to open the tile beyond.
      if (field.location === "subterranean_gate" && (target || remindMove)) {
        overlays.push(
          <text className="hexGateCue" key={`${spaceId}-gate-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
            {tile.group === "subterranean" ? "↥ ascend" : "↧ descend"}
          </text>
        );
      }

      // A reachable Monolith/Whirlpool is a doorway too: cue the teleport so
      // players realise stepping on moves them across the map.
      if (isMapTokenLocation(field.location) && (target || remindMove)) {
        overlays.push(
          <text className="hexGateCue" key={`${spaceId}-token-cue`} textAnchor="middle" x={x} y={y + HEX_SIZE * 0.92}>
            ⇄ teleport
          </text>
        );
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
            {tokenPlacementChoice.kind === "monolith" ? "⛩ monolith here" : "🌀 whirlpool here"}
          </text>
        );
      }

      // Pick-on-reveal Subterranean Gate placement: label each candidate field on
      // the map so the player sees exactly which hex becomes the Gate (Surface) or
      // the Path up (Underground) before committing — the field also glows and is
      // clickable via pendingMapChoiceTargets above.
      if (gatePlacementChoice?.hexes.has(spaceId)) {
        overlays.push(
          <text
            className="hexGateChoiceCue"
            key={`${spaceId}-gate-choice-cue`}
            textAnchor="middle"
            x={x}
            y={y + HEX_SIZE * 0.92}
          >
            {gatePlacementChoice.role === "gate" ? "🕳 gate here" : "🕳 path up here"}
          </text>
        );
      }

      // Location Token art (the Subterranean Gate) sits on top of the tile scan
      // on the field it sacrificed, shown in both art and icon modes. The two
      // halves are distinct: the skull cave-mouth GATE on a Surface tile, the
      // lighter passage ENTRANCE on a Subterranean tile.
      const tokenImage =
        field.location === "subterranean_gate"
          ? subterraneanGateTokenImage(tile.group === "subterranean" ? "subterranean" : "surface")
          : field.location === "creature_bank"
            ? creatureBankFieldImage(field.bankId)
            : field.location === "monolith"
              ? monolithTokenImage()
              : field.location === "whirlpool"
                ? whirlpoolTokenImage(field.whirlpoolNumber)
                : undefined;
      if (tokenImage) {
        if (field.location === "creature_bank") {
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
      if (!artShown && glyph && field.location !== "empty_field" && !tokenImage) {
        overlays.push(
          <text className="hexGlyph" key={`${spaceId}-glyph`} textAnchor="middle" x={x} y={y + 6}>
            {glyph}
          </text>
        );
      }
      if (!artShown && field.difficulty && guarded) {
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
      // Printed yellow border lines: outer arcs, blocked-field rings and any
      // internal borders, exactly as scanned.
      for (const segment of borderSegments) {
        if (segment.slot !== slot) {
          continue;
        }
        const direction = (segment.edge + tile.rotation) % 6;
        const edge = hexEdgeForDirection(x, y, HEX_SIZE - 1.2, direction);
        overlays.push(<line className="tileBorderLine" key={`${spaceId}-border-${segment.edge}`} {...edge} />);
      }

      // Hero pawns: separate top layer keyed by hero id so moves glide.
      const occupants = heroesBySpace.get(spaceId) ?? [];
      for (const [index, occupant] of occupants.entries()) {
        const heroDef = occupant.heroDefId ? coreHeroDefinitions[occupant.heroDefId] : undefined;
        const portrait = heroDef?.portrait;
        const isOwnHero = occupant.playerId === viewerPlayerId;
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

  const rotationConnected =
    rotatingTile && iAmRotating ? legalRotations.size === 0 || legalRotations.has(previewRotation) : true;

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
      return "Take your start-of-turn draw first (bottom of the screen)";
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

  if (selectedTarget && myHero && !readOnly) {
    const coord = parseHexSpaceId(selectedTarget.spaceId);
    if (coord) {
      const cost = selectedTarget.cost;
      mapFloats.push({
        key: "move-confirm-float",
        mapPoint: hexToPixel(coord, HEX_SIZE),
        cardWidth: 230,
        cardHeight: 104,
        gap: HEX_SIZE * 0.62,
        render: () => (
          <div
            aria-label="Confirm movement"
            className="mapFloatCard moveConfirmFloat"
            onPointerDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <span className="mapFloatLabel">
              <span aria-hidden="true">🐎</span> Move {cost} field{cost === 1 ? "" : "s"} ({cost} MP)
            </span>
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
                <Check size={13} /> Move there
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

  if (pendingTileChoice && rotatingTile) {
    mapFloats.push({
      key: "rotate-float",
      mapPoint: hexToPixel({ row: rotatingTile.centerRow, col: rotatingTile.centerCol }, HEX_SIZE),
      cardWidth: iAmRotating ? 272 : 230,
      cardHeight: iAmRotating ? 158 : 70,
      // The rotating tile spans a 5-hex-tall flower; clear its top edge so the
      // card never covers the art it is acting on.
      gap: HEX_SIZE * 2.9,
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
            </div>
            {!rotationConnected ? <small className="mapFloatWarn">Border lines seal the tile off — keep rotating.</small> : null}
          </div>
        ) : (
          <div className="mapFloatCard passive">
            <small>{state.players[pendingTileChoice.playerId]?.name ?? "A player"} is rotating the new tile…</small>
          </div>
        )
    });
  }

  return (
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

      {/* Floating map controls as HTML overlays (see the MapFloat note above):
          positioned in real screen pixels via the shared camera/viewBox math, so
          they paint on phones where SVG foreignObject does not, and are clamped
          fully on-screen. The wrapper is click-through (pointer-events:none); only
          the card inside takes taps (pointer-events:auto). */}
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
        {hasCreatureBank ? (
          <button
            aria-pressed={showBankBorders}
            className={showBankBorders ? "selected" : ""}
            onClick={() => setShowBankBorders((value) => !value)}
            title={
              showBankBorders
                ? "Creature Bank borders shown — click to hide them (default)"
                : "Creature Bank fields are border-free — click to show their borders"
            }
            type="button"
          >
            <Fence size={13} />
          </button>
        ) : null}
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
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const player = state.players[viewerPlayerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === viewerPlayerId && candidate.kind === "main"
  );
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
        <div className="advHudCell moveMoraleCell" aria-label="Movement and morale">
          <span
            className="statChip"
            title={`${hero.movementPoints} movement point${hero.movementPoints === 1 ? "" : "s"} left this turn`}
          >
            <span aria-hidden="true" className="movePointIcon">
              🐎
            </span>
            <b>{hero.movementPoints}</b>
            <small>move</small>
          </span>
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
        </div>
      ) : null}
      <div className="advHudCell">
        <strong>{RULESET_LABELS[getRuleset(state)]}</strong>
        <small>game mode</small>
      </div>
      {(() => {
        const mode = state.adventure?.victoryMode ?? "conquest";
        let status = "flag an enemy town";
        if (mode === "grail") {
          const grail = state.adventure?.grail;
          status =
            grail?.status === "carried" && grail.carrierHeroId
              ? `Grail carried by ${state.players[state.heroes[grail.carrierHeroId]?.controllerId ?? ""]?.name ?? "a hero"}`
              : "capture the Grail / beat all heroes";
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
      src={assetUrl(townIconUrl(factionId))}
      style={{ width: size, height: size }}
    />
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
  onAction
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
}) {
  const [openHeroSeat, setOpenHeroSeat] = useState<PlayerId | null>(null);
  const [armyOpen, setArmyOpen] = useState(false);
  const [commanderOpen, setCommanderOpen] = useState(false);
  const player = state.players[viewerPlayerId];
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;

  const heroSeats = (heroSeatIds ?? [viewerPlayerId]).filter((seatId) => {
    const seat = state.players[seatId];
    return seat && seat.id !== "neutrals" && seat.heroDefId;
  });

  const armyPlayer = armySeatId ? state.players[armySeatId] : undefined;
  const army = armyPlayer?.army ?? [];

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
    <div className="townHeroDock" aria-label="Town and hero">
      {onOpenTown && faction ? (
        <button
          aria-label={`Open your ${faction.name} town`}
          className="dockTile townDockTile"
          onClick={onOpenTown}
          style={{ "--dock-faction": faction.color } as CSSProperties}
          title="Open your town — build structures, recruit units and buy spells"
          type="button"
        >
          <TownIcon factionId={faction.id} size={82} />
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
            <HeroPortrait name={heroDef.name} portrait={heroDef.portrait} size={82} />
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
              const side = unit.side === "few" ? def?.few : def?.pack;
              return side?.cardImage ? (
                <img alt="" className="dockUnitThumb" key={unit.id} src={assetUrl(side.cardImage)} style={{ zIndex: 3 - index }} />
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
            <HeroBoard playerId={openHeroSeat} state={state} />
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
              />
            </div>
          </div>
        </>
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
            <ArmyPanel playerId={armyPlayer.id} state={state} />
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
        {back.image ? <img alt="" aria-hidden="true" src={assetUrl(back.image)} /> : null}
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
              {card?.assets?.cardImage ? <img alt="" src={assetUrl(card.assets.cardImage)} /> : <span>{polarity[0].toUpperCase()}</span>}
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
                {card?.assets?.cardImage ? <img alt="" src={assetUrl(card.assets.cardImage)} /> : <span>{negative ? "N" : "P"}</span>}
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

  const ruleset = getRuleset(state);
  // Honour the individual Griffin/Marksman toggles so the roster shows the same
  // live stats the engine will fight with (not just the bundled mode default).
  const sideOverrides = unitSideRuleOverrides(state);

  return (
    <section className="armyPanel" aria-label="Unit deck">
      <h3>Unit deck ({player.army.length})</h3>
      <ul>
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const printed = unit.side === "few" ? def?.few : def?.pack;
          // BINH stat tweaks (Griffins, Marksmen) show live values.
          const side = printed ? applyUnitSideRules(ruleset, unit.unitDefId, unit.side, printed, sideOverrides) : printed;
          const engineLines = implementedAbilityLines(side?.abilities);
          const hoverTitle = [side?.abilityText, ...engineLines].filter(Boolean).join("\n") || `Read ${def?.name ?? unit.unitDefId}`;
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
                      side?.abilityText ?? "",
                      ...engineLines
                    ].filter(Boolean)
                  })
                }
                title={hoverTitle}
                type="button"
              >
                {side?.cardImage ? (
                  <img alt="" aria-hidden="true" className="armyUnitThumb" loading="lazy" src={assetUrl(side.cardImage)} />
                ) : (
                  <span className={`armyUnitThumb fallback tier-${def?.tier ?? "bronze"}`} />
                )}
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

  const openBuilding =
    openBuildingId && town.buildings.includes(openBuildingId) ? coreBuildingDefinitions[openBuildingId] : null;

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
          if (!building) {
            return null;
          }
          const built = town.buildings.includes(buildingId);
          const action = buildActions.find(
            (legal) => legal.action.type === "BUILD_STRUCTURE" && legal.action.buildingId === buildingId
          );
          const cubes = town.factionCubes?.[buildingId] ?? 0;
          const effectPanel = built && hasBuildingEffectPanel(building);
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
              {/* Building art slot: fills in as soon as assets.image lands. */}
              {building.assets?.image ? (
                <img
                  alt={`${building.name} building tile`}
                  className="townBuildingArt"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={assetUrl(building.assets.image)}
                />
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

      <HireHeroesSection legalActions={legalActions} onAction={onAction} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prompt tray for pending visit steps / choices
// ---------------------------------------------------------------------------

type VisitRewardArt = {
  image?: string;
  name: string;
  /** Map-tile options (Disruption): rotation in 60° turns, for the thumb. */
  tileRotation?: number;
  /** Short caption under the thumb (degrees, unit side, …) when the full legal label is long. */
  caption?: string;
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
  for (const step of steps) {
    if (!step || typeof step !== "object") {
      continue;
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
        const side = def?.[armyUnit.side];
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

/** Resolve a card / unit / event id to display art + name. Never the Astrologers card. */
function rewardArtForId(cardId: string): VisitRewardArt {
  const card = cardLibrary[cardId];
  if (card) {
    return { image: card.assets?.cardImage, name: card.name, caption: card.name };
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
  const visit = state.adventure?.pendingVisit;
  const choice = state.pendingChoice;
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
  // "Skip Necromancy" button never rendered on the map and the winner was forced to
  // play the reinforce card ("after combat, no choice but to use it"). This branch
  // renders the window's own actions: play the Necromancy reinforce, or skip it.
  const necromancyActions = legalActions.filter(
    (legal) =>
      legal.action.type === "SKIP_NECROMANCY" ||
      (legal.action.type === "PLAY_CARD" &&
        cardLibrary[legal.action.cardId]?.effect.type === "NECROMANCY_REINFORCE")
  );
  const necromancyOpen = state.adventure?.pendingNecromancy?.playerId === viewerPlayerId;
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
    choice && choice.playerId !== viewerPlayerId
      ? choice.type === "OPTION_CHOICE" && choice.context === "learning-level-up"
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

  if (
    choice?.type === "OPTION_CHOICE" &&
    choice.playerId === viewerPlayerId &&
    // The Learning level-up offer has its own card-showing modal (LearningOfferModal).
    choice.context !== "learning-level-up"
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
    // Necropolis Necromancy window: reinforce a unit for half the gold cost, or
    // skip. Skipping is a real choice — the winner is not forced to reinforce (the
    // field reward stays withheld only until they decide, engine-gated).
    title = "Necromancy — reinforce a unit for half the gold cost, or skip";
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
            <img
              alt={auctionLotCard.name}
              className="auctionLotCard"
              loading="lazy"
              referrerPolicy="no-referrer"
              src={assetUrl(auctionLotCard.assets.cardImage)}
            />
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
                    <img alt={art.name} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(art.image)} />
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
    }
    body = visitActions;
  } else if (combatGate.length > 0) {
    title = "The combat round is over";
    body = combatGate;
  }

  // Safety net against a frozen table: ANY pending choice OWNED by this viewer
  // that no surface above claimed — and that no sibling modal owns (DECK_SEARCH →
  // SearchModal, ATTACK_DIE_REROLL → RerollModal, learning-level-up →
  // LearningOfferModal) — still renders its resolving actions here. A pending
  // choice returns ONLY its own resolving actions from getLegalActions, so this
  // can never leak unrelated turn actions. It exists so a new/rare choice type
  // (the Tarnum-search class of bug) can never silently strand its owner with a
  // blank table — the failure the closed-room report described.
  if (!title && choice && choice.playerId === viewerPlayerId) {
    const ownedElsewhere =
      choice.type === "DECK_SEARCH" ||
      choice.type === "ATTACK_DIE_REROLL" ||
      (choice.type === "OPTION_CHOICE" && choice.context === "learning-level-up");
    if (!ownedElsewhere && legalActions.length > 0) {
      title = choice.type === "OPTION_CHOICE" ? choice.prompt : "Choose how to resolve this";
      body = legalActions;
    }
  }

  if (!title || body.length === 0) {
    return null;
  }

  // Prefer graphic reward tiles when the open CHOOSE_ONE options carry a real
  // pick (unit, artifact, spell, statistic, war machine, map tile, …).
  const rewardOptions = chooseOneOptions
    ? body.map((legal) => {
        const optionIndex =
          legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex !== undefined
            ? legal.action.optionIndex
            : undefined;
        const option =
          optionIndex !== undefined && chooseOneOptions && optionIndex < chooseOneOptions.length
            ? chooseOneOptions[optionIndex]
            : undefined;
        const art = rewardArtFromVisitSteps(state, viewerPlayerId, option?.steps);
        return { legal, art };
      })
    : body.map((legal) => ({ legal, art: null as VisitRewardArt | null }));
  const hasAnyRewardArt = rewardOptions.some((entry) => Boolean(entry.art?.image || entry.art?.name));
  const hasTileRewardArt = rewardOptions.some((entry) => entry.art?.tileRotation !== undefined);

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

  return (
    <div
      className={`promptTray${hasAnyRewardArt ? " withRewardCards" : ""}${hasTileRewardArt ? " withTileCards" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <strong>{title}</strong>
      {preview}
      <div className={`promptOptions${hasAnyRewardArt ? " rewardCards" : ""}${hasTileRewardArt ? " tileCards" : ""}`}>
        {rewardOptions.map(({ legal, art }) =>
          art ? (
            <button
              aria-label={legal.label}
              className={`promptRewardCard${art.tileRotation !== undefined ? " tileThumb" : ""}`}
              key={actionKey(legal.action)}
              onClick={() => onAction(legal.action)}
              title={legal.label}
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
                  <img alt="" aria-hidden="true" loading="lazy" referrerPolicy="no-referrer" src={assetUrl(art.image)} />
                </span>
              ) : (
                <span className="marketCardFallback">{art.name}</span>
              )}
              <small>
                {art.caption && art.caption.endsWith("°") ? art.caption : legal.label}
              </small>
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

  // While another player is deciding, show a quiet waiting strip instead.
  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <ChevronsUp aria-hidden="true" size={15} />
        <span>{state.players[choice.playerId]?.name ?? choice.playerId} is about to level up…</span>
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
    <div className="modalBackdrop" role="dialog" aria-label="Learning — about to level up">
      <div className="searchModal learningOfferModal">
        <header>
          <strong>Your Hero is about to level up!</strong>
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
              return (
                <button
                  className="marketSellCard"
                  key={actionKey(legal.action)}
                  onClick={() => onAction(legal.action)}
                  title={legal.label}
                  type="button"
                >
                  {card?.assets?.cardImage ? (
                    <img alt={card.name} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(card.assets.cardImage)} />
                  ) : (
                    <span className="marketCardFallback">{card?.name ?? cardId}</span>
                  )}
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
              return (
                <button
                  className="marketSellCard"
                  key={actionKey(legal.action)}
                  onClick={() => onAction(legal.action)}
                  title={legal.label}
                  type="button"
                >
                  {card?.assets?.cardImage ? (
                    <img alt={card.name} loading="lazy" referrerPolicy="no-referrer" src={assetUrl(card.assets.cardImage)} />
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
  onShowPile: (title: string, cardIds: string[], kind: "cards" | "units" | "astrologers" | "events") => void;
}) {
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  // Top of the discard is face-up — show the actual card graphic (not a bare count).
  const topDiscardId = player.discard.length > 0 ? player.discard[player.discard.length - 1] : undefined;
  const topDiscard = topDiscardId ? cardLibrary[topDiscardId] : undefined;
  const topImage = topDiscard?.assets?.cardImage;

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
        onClick={() => onShowPile(`${player.name} — discard pile`, player.discard, "cards")}
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
  onShowPile: (title: string, cardIds: string[], kind: "cards" | "units" | "astrologers" | "events") => void;
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
  onClose
}: {
  title: string;
  cardIds: string[];
  kind: "cards" | "units" | "astrologers" | "events";
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

function PileModalCards({ cardIds, kind }: { cardIds: string[]; kind: "cards" | "units" | "astrologers" | "events" }) {
  const { zoomCard, zoomContent } = useCardZoom();

  return (
    <ul>
      {[...cardIds].reverse().map((cardId, index) => {
        const card = kind === "cards" ? cardLibrary[cardId] : undefined;
        const unit = kind === "units" ? coreUnitDefinitions[cardId] : undefined;
        const astro = kind === "astrologers" ? astrologersCardDefinitions[cardId] : undefined;
        const eventCard = kind === "events" ? eventCardDefinitions[cardId] : undefined;
        const image = card?.assets?.cardImage ?? unit?.neutral?.cardImage ?? astro?.image ?? eventCard?.image;
        // Empowered Statistics are intrinsic, so a pile browse can flag them
        // from the card alone; Empowered abilities are per-owner and shown where
        // the owner is known (hand fan, trays, discard tops).
        const empowered = kind === "cards" && isEmpoweredStatisticCard(cardId);
        const zoom = () =>
          card
            ? zoomCard(cardId)
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
// Pre-battle preparation panel (shown on the adventure MAP, not the battlefield)
// ---------------------------------------------------------------------------

/**
 * The player-vs-player pre-battle preparation panel. When an enemy hero attacks,
 * BOTH sides prepare here — on the map, with their town, resources and army in
 * full view — spending any remaining town actions (build / recruit / buy spells
 * at the town panel to the right) before pressing "Accept the battle". Deployment
 * begins only once both the attacker and the defender have accepted; either side
 * may instead Retreat / Surrender out of the fight. Renders nothing outside an
 * open PvP prep window.
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
    <div className="preBattlePanel" aria-label="Prepare for battle">
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
          <small className="prepNote">
            Prepare before the fight: spend any town actions you have left this round (build, recruit, buy spells) — right
            here below, or in your town window (the Town button). Units you recruit now join your army in time to be
            deployed. When you are ready, accept the battle — deployment begins once both sides accept.
          </small>
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
            {escapeActions.map((legal) => (
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
  const versusBank = combat.context.kind === "neutral" && Boolean(combat.context.bankId);

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
      <div className="placementUnits">
        {player.army.map((unit) => {
          const def = coreUnitDefinitions[unit.unitDefId];
          const portrait = def?.[unit.side]?.cardImage;
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

const DIFFICULTY_CHOICES: { id: GameSetupOptions["difficulty"]; label: string; hint: string }[] = [
  {
    id: "easy",
    label: "Easy",
    hint: "Smallest guard armies. Starting bonus: Roll 2 Resource Dice and receive Resources from both — OR — Search (2) the Artifact Deck, twice."
  },
  {
    id: "normal",
    label: "Normal",
    hint: "Printed baseline guards. Starting bonus: Roll 2 Resource Dice and receive the Resources from one of them — OR — Search (2) the Artifact Deck."
  },
  {
    id: "hard",
    label: "Hard",
    hint: "Stronger guards. Starting bonus: Roll 1 Resource Die and receive the Resources on it — OR — reveal cards until you find 1 Minor Artifact (to hand)."
  },
  {
    id: "impossible",
    label: "Impossible",
    hint: "Default — strongest guards. No starting bonus."
  }
];

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
  send
}: {
  options: GameSetupOptions;
  send: (next: Partial<GameSetupOptions>) => void;
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

  // A built-in scenario sheet is in play whenever no designed map is loaded.
  const usingScenarioSheet = !options.customMap;

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
                // leaves a stale map attached to a different scenario).
                onClick={() => send({ scenarioId: scenario.id, customMap: null, customMapName: null })}
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
              const problems = scenario
                ? validateCustomMapPlan(record.tiles, scenario).problems
                : ["Unknown scenario."];
              const selected =
                Boolean(options.customMap) &&
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
                  onClick={() =>
                    send({
                      ...(record.scenarioId !== options.scenarioId ? { scenarioId: record.scenarioId } : {}),
                      playerCount: record.players,
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

      {options.customMap ? (
        <div className="mapPresetLobbyNote">
          <small className="optionHint">
            Playing the designed map {options.customMapName ? `“${options.customMapName}” ` : ""}with{" "}
            {options.customMap.length} tile{options.customMap.length === 1 ? "" : "s"} — face-down Secret landmarks draw
            a random matching tile from their pool.
          </small>
          {options.customMapPreset ? (
            <div className="mapPresetLobbyBanner" role="status">
              <strong>📜 This map has special conditions</strong>
              <ul className="mapPresetEntryList">
                {describeCustomMapPresetEntries(options.customMapPreset).map((entry) => (
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

function ResourceStepper({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="optionStepper">
      <small>{label}</small>
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
  { id: "army", label: "Army", icon: <Castle size={13} /> }
];

const HOUSE_RULE_CATEGORY_LABELS: Record<string, string> = {
  decks: "Decks",
  units: "Unit buffs",
  abilities: "Abilities & heroes",
  combat: "Combat & map rules"
};

/**
 * The individual house-rule toggles, rendered straight from the engine registry
 * so the menu and the engine never drift. Each button flips exactly one rule
 * (the reducer merges it); the value shown is the resolved effective boolean.
 */
function HouseRulesSection({
  houseRules,
  setHouseRule
}: {
  houseRules: Record<HouseRuleId, boolean>;
  setHouseRule: (id: HouseRuleId, value: boolean) => void;
}) {
  const categories = ["decks", "units", "abilities", "combat"] as const;
  return (
    <div className="houseRuleSection" aria-label="House rules">
      <div className="houseRuleHead">
        <strong>House rules</strong>
        <small>
          BINH starts with every tweak on. Legacy / Tournament presets clear them — any rule can still be re-enabled.
        </small>
      </div>
      {categories.map((category) => {
        const rules = HOUSE_RULES.filter((rule) => rule.category === category);
        if (rules.length === 0) {
          return null;
        }
        return (
          <div className="houseRuleGroup" key={category}>
            <span className="houseRuleGroupLabel">{HOUSE_RULE_CATEGORY_LABELS[category]}</span>
            <div className="houseRuleGrid">
              {rules.map((rule) => {
                const on = houseRules[rule.id];
                return (
                  <button
                    aria-pressed={on}
                    className={`houseRuleToggle ${on ? "on" : "off"}`}
                    key={rule.id}
                    onClick={() => setHouseRule(rule.id, !on)}
                    title={rule.description}
                    type="button"
                  >
                    <span aria-hidden="true" className="houseRuleCheck">
                      {on ? <Check size={13} /> : null}
                    </span>
                    <span className="houseRuleText">
                      <strong>{rule.label}</strong>
                      <small>{rule.description}</small>
                    </span>
                    <span className={`houseRuleState ${on ? "on" : "off"}`}>{on ? "ON" : "OFF"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="houseRuleAlwaysOn">
        <Info size={11} aria-hidden="true" />
        <span>
          Earthquake already matches the wiki, so there is nothing to toggle — its Power-2 collapse of the Arrow Tower
          is the standard “a full breach fells the tower” rule, not a buff.
        </span>
      </p>
    </div>
  );
}

/** High-level setup modes shown as a card row on the Mode & Rules tab. */
type SetupModeId = "legacy" | "binh" | "wog" | "tournament";

const SETUP_MODE_CARDS: {
  id: SetupModeId;
  label: string;
  blurb: string;
  hint: string;
}[] = [
  {
    id: "legacy",
    label: "Legacy",
    blurb: "Printed rulebook",
    hint: "Turns every house rule off. Toggles stay free — re-enable any rule you want."
  },
  {
    id: "binh",
    label: "BINH",
    blurb: "House-rule edition",
    hint: "Default fan edition: every house rule on, Spell Book on, WOG off."
  },
  {
    id: "wog",
    label: "WOG",
    blurb: "Wake of Gods",
    hint: "BINH plus the Wake of Gods modules (commanders, new neutrals, …)."
  },
  {
    id: "tournament",
    label: "Tournament",
    blurb: "Competitive preset",
    hint: "House rules off, tournament bans on, Hard difficulty, Neutral AI, Diplomacy banned."
  }
];

/**
 * Adjustable setup: scenario, neutral difficulty (Impossible default),
 * starting resources, base income (10 gold / 0 / 0 default), starting unit
 * tiers and pre-built buildings. Any seated player may adjust; everything
 * syncs through the same action stream as the rest of the game.
 */
function GameOptionsPanel({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const [wogOptionsOpen, setWogOptionsOpen] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<OptionsTabId>("rules");
  const lobby = state.setupLobby;
  if (!lobby) {
    return null;
  }

  const options = lobby.options;
  const wog = { ...DEFAULT_WOG_OPTIONS, ...options.wog };
  const viewerFactionId = lobby.seats.find((seat) => seat.playerId === viewerPlayerId)?.factionId ?? null;
  const send = (next: Partial<GameSetupOptions>) =>
    onAction({ type: "SET_GAME_OPTIONS", playerId: viewerPlayerId, options: next });
  // Effective house-rule booleans (explicit toggle, else the chosen mode's
  // default). Flipping one sends just that id; the reducer merges it.
  const houseRules = resolveHouseRules(options);
  const setHouseRule = (id: HouseRuleId, value: boolean) => send({ houseRules: { [id]: value } });
  const tournamentRules = resolveTournamentRules(options);
  const tournamentAllOn = tournamentRulesAllOn(options);

  /** Which big mode card is highlighted from the current options. */
  const activeSetupMode: SetupModeId = (() => {
    if (tournamentAllOn && options.ruleset === "legacy" && !wog.enabled && options.difficulty === "hard") {
      return "tournament";
    }
    if (wog.enabled && options.ruleset === "binh") {
      return "wog";
    }
    if (options.ruleset === "legacy") {
      return "legacy";
    }
    return "binh";
  })();

  const applySetupMode = (mode: SetupModeId) => {
    if (mode === "legacy") {
      send({
        ruleset: "legacy",
        wog: { ...wog, enabled: false },
        spellBook: false,
        tournamentMode: false,
        tournamentBanDiplomacy: false,
        tournamentBanHourglass: false,
        tournamentSecondPlayerMorale: false
      });
      setModeNotice(
        "Legacy mode applied: every house rule is off (printed rulebook). " +
          "Nothing is locked — you can re-enable any house rule, Spell Book, or tournament rule below."
      );
      return;
    }
    if (mode === "binh") {
      send({
        ruleset: "binh",
        wog: { ...wog, enabled: false },
        spellBook: true,
        tournamentMode: false,
        tournamentBanDiplomacy: false,
        tournamentBanHourglass: false,
        tournamentSecondPlayerMorale: false
      });
      setModeNotice(null);
      return;
    }
    if (mode === "wog") {
      send({
        ruleset: "binh",
        wog: { ...DEFAULT_WOG_OPTIONS, ...wog, enabled: true },
        spellBook: true,
        tournamentMode: false,
        tournamentBanDiplomacy: false,
        tournamentBanHourglass: false,
        tournamentSecondPlayerMorale: false
      });
      setModeNotice(null);
      setWogOptionsOpen(true);
      return;
    }
    // Tournament competitive preset.
    send({
      ruleset: "legacy",
      wog: { ...wog, enabled: false },
      spellBook: false,
      tournamentMode: true,
      tournamentBanDiplomacy: true,
      tournamentBanHourglass: true,
      tournamentSecondPlayerMorale: true,
      difficulty: "hard",
      pvpNeutralControl: false,
      events: false,
      moraleCards: false
    });
    setModeNotice(
      "Tournament mode applied: house rules off, Diplomacy + Hourglass banned, second player +1 morale, " +
        "Hard difficulty, and Neutral units stay under the AI. Toggles below stay free if you need to adjust."
    );
  };

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

      <div className="optionRow modePresetRow">
        <small title="One-click presets. Individual rules below stay editable after any preset.">Game mode</small>
        <div className="modePresetGrid" role="group" aria-label="Game mode presets">
          {SETUP_MODE_CARDS.map((card) => (
            <button
              aria-pressed={activeSetupMode === card.id}
              className={`modePresetCard ${activeSetupMode === card.id ? "selected" : ""}`}
              key={card.id}
              onClick={() => applySetupMode(card.id)}
              title={card.hint}
              type="button"
            >
              <strong>{card.label}</strong>
              <span>{card.blurb}</span>
              <small>{card.hint}</small>
            </button>
          ))}
        </div>
        <small className="optionHint">
          {activeSetupMode === "legacy"
            ? RULESET_DESCRIPTIONS.legacy
            : activeSetupMode === "wog"
            ? "Wake of Gods modules on top of BINH house rules."
            : activeSetupMode === "tournament"
            ? "Competitive preset: rulebook baseline + tournament deck bans + Hard difficulty + Neutral AI."
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

      {wog.enabled ? (
        <div className={`optionRow wogOptionRow enabled`}>
          <small title="Wake of Gods module options">WOG modules</small>
          <div className="wogOptionControls">
            <button
              aria-label="Configure Wake of Gods modules"
              className="wogCrestButton selected"
              onClick={() => setWogOptionsOpen(true)}
              title="Open WOG module options"
              type="button"
            >
              <span aria-hidden="true" className="wogCrestWings">◆</span>
              <strong>WOG</strong>
              <span>ON</span>
            </button>
            <div className="wogOptionSummary">
              <strong>Wake of Gods</strong>
              <small>Enabled — configure commanders, neutrals and objects</small>
              <button className="wogConfigureButton" onClick={() => setWogOptionsOpen(true)} type="button">
                Mod options
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="optionRow tournamentRulesRow">
        <small title="Rulebook Tournament Mode setup rules (p.54), each toggleable on its own">
          Tournament rules
        </small>
        <div className="tournamentRuleGrid">
          {(
            [
              {
                key: "tournamentBanDiplomacy" as const,
                label: "Ban Diplomacy",
                on: tournamentRules.banDiplomacy,
                hint: "Remove Diplomacy from the shared Ability deck (heroes keep a starting copy)."
              },
              {
                key: "tournamentBanHourglass" as const,
                label: "Ban Hourglass",
                on: tournamentRules.banHourglass,
                hint: "Remove Hourglass of the Evil Hour from the shared Artifact deck."
              },
              {
                key: "tournamentSecondPlayerMorale" as const,
                label: "2nd player +1 morale",
                on: tournamentRules.secondPlayerMorale,
                hint: "The second player gains 1 positive morale at game start."
              }
            ] as const
          ).map((rule) => (
            <button
              aria-pressed={rule.on}
              className={`tournamentRuleToggle ${rule.on ? "on" : "off"}`}
              key={rule.key}
              onClick={() => send({ [rule.key]: !rule.on })}
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
          Toggle each Tournament setup rule independently, or use the Tournament mode card above to apply the full competitive package.
        </small>
      </div>

      {(() => {
        const eventsOn = options.events ?? false;
        const moraleCardsOn = options.moraleCards ?? false;
        return (
          <>
            <div className="optionRow">
              <small title="Fortress expansion optional rule (OFF by default): an Event card is drawn at the start of every Resource round (multiplayer only)">
                Event deck
              </small>
              <div className="optionButtons">
                {([true, false] as const).map((on) => (
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
              <small title="Optional rule: replace normal morale tokens with Positive and Negative Morale decks">
                Morale Cards
              </small>
              <div className="optionButtons">
                {([true, false] as const).map((on) => (
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
          </>
        );
      })()}

      <HouseRulesSection houseRules={houseRules} setHouseRule={setHouseRule} />

      {(() => {
        const spellBookOn = options.spellBook ?? options.ruleset === "binh";
        return (
          <div className="optionRow">
            <small title="House rule: each player keeps a personal Spell Book to stash, cast and boost Spells from">
              Spell Book
            </small>
            <div className="optionButtons">
              {([true, false] as const).map((on) => (
                <button
                  aria-pressed={spellBookOn === on}
                  className={spellBookOn === on ? "selected" : ""}
                  key={String(on)}
                  onClick={() => send({ spellBook: on })}
                  title={on ? "Spell Book on (house rule)" : "Spell Book off"}
                  type="button"
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
            <small className="optionHint">
              {spellBookOn
                ? "Each player may set Spells aside in a personal Spell Book to free hand slots, then cast or boost from it (one Book Power boost per turn)."
                : "No Spell Book — Spells live only in hand, deck and discard."}
            </small>
          </div>
        );
      })()}
      </div>
      ) : null}

      {options.ruleset === "binh" && wog.enabled && wogOptionsOpen && typeof document !== "undefined"
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
                <span className="wogWindowEyebrow">BINH optional module</span>
                <h4>Wake of Gods</h4>
              </div>
              <button aria-label="Close WOG options" onClick={() => setWogOptionsOpen(false)} type="button">
                <X size={16} />
              </button>
            </header>
            <div className="wogModuleList">
              {([
                ["newCreatures", "New neutral creatures", "Adds the 15-card WOG roster to the Bronze, Silver, Gold and Azure Neutral decks."],
                ["commanders", "Commanders", "Every player gets their faction's commander: it fights in the main hero's battles as the army's 5th unit (you deploy up to 4), grades up at hero level 2, 4 and 6, and casts a command ability once per combat round."],
                ["newObjects", "New adventure objects", "Saves the object module choice; WOG map objects will be added as their data and art arrive."]
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
                  key={mode}
                  onClick={() => send({ victoryMode: mode })}
                  title={VICTORY_MODE_DESCRIPTIONS[mode]}
                  type="button"
                >
                  {VICTORY_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <small className="optionHint">{VICTORY_MODE_DESCRIPTIONS[victoryMode]}</small>
          </div>
        );
      })()}

      {(() => {
        // The Dragon Utopia guards — the single win-condition tuning knob for the
        // two modes where the Utopia IS the objective. The base party is always
        // the four dragons (Azure, Rust, Crystal, Faerie); the only choice is
        // whether the full party stands or the guard COUNT scales with difficulty
        // (Easy 1 / Normal 2 / Hard 3 / Impossible 4). The featured lead is always
        // an Azure or Rust Dragon. Stored on `options.dragonUtopiaGuards`.
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
                title="As many dragons as the difficulty would draw (Easy 1 / Normal 2 / Hard 3 / Impossible 4)"
                type="button"
              >
                Scale by difficulty
              </button>
            </div>
            <small className="optionHint">
              {guards === "four"
                ? "Four dragons guard the Utopia — Azure, Rust, Crystal and Faerie. The featured lead is a random Azure or Rust Dragon."
                : "The guard count follows the difficulty (Easy 1 · Normal 2 · Hard 3 · Impossible 4). The featured lead is always an Azure or Rust Dragon."}
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
              <small title="Optional PvP mode (OFF by default): the next player clockwise plays the Neutral units in every Neutral combat, like a real PvP side (multiplayer only)">
                PvP Neutral Control
              </small>
              <div className="optionButtons">
                {([true, false] as const).map((on) => (
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
                  ? "Every Neutral combat becomes PvP-like: the NEXT player clockwise plays the guards — moving and attacking each one, breaking their activation ties, and answering their ability targets and dice rerolls. That player is notified when the fight starts. Multiplayer only — a solo game keeps the Neutral AI."
                  : "Off by default. The Neutral AI plays the guards by the rulebook (same-tier priority, nearest target); the fighting player only breaks its ties."}
              </small>
            </div>
            {neutralControlOn ? (
              <div className="optionRow">
                <small title="Sub-rule of PvP Neutral Control: whether the guards keep the rulebook 'must attack' behaviour">
                  Neutral Control — guards
                </small>
                <div className="optionButtons">
                  {([true, false] as const).map((on) => (
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
              {([true, false] as const).map((on) => (
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
        const farTileOpeningOn = options.farTileOpening ?? true;
        return (
          <div className="optionRow">
            <small title="Whether players may open their own Ⅱ–Ⅲ Far tiles onto the map">
              Ⅱ–Ⅲ tile opening
            </small>
            <div className="optionButtons">
              {([true, false] as const).map((on) => (
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
              places its own Ⅱ–Ⅲ tiles. The 2nd tile a player opens is guaranteed a Settlement (keep / reroll until one
              appears, then pick); any tile showing a resource Mine may be rerolled once.
            </small>
          </div>
        );
      })()}

      {(() => {
        const scenario = scenarioDefinitions[options.scenarioId];
        const max = Math.min(scenario?.maxPlayers ?? 2, scenario?.layout.starts.length ?? 2);
        // Single-player: the seat count is 1 human + N computers, changed only
        // through the dedicated action (the engine reasserts the controller
        // invariant on every resize — no resize can mint a human opponent).
        if (state.sessionMode === "single-player") {
          const current = lobby.seats.length - 1;
          const counts: number[] = [];
          for (let n = 1; n < max; n += 1) {
            counts.push(n);
          }
          return counts.length > 1 ? (
            <div className="optionRow">
              <small title="How many computer opponents this game seats — leave them on auto and they pick their own factions after you, or hand-pick / roll each one's town & hero in the Heroes & draft tab">
                Computer opponents
              </small>
              <div className="optionButtons">
                {counts.map((count) => (
                  <button
                    aria-pressed={current === count}
                    className={current === count ? "selected" : ""}
                    key={count}
                    onClick={() =>
                      onAction({ type: "SET_COMPUTER_OPPONENTS", playerId: viewerPlayerId, count })
                    }
                    title={`Play against ${count} computer opponent${count === 1 ? "" : "s"}`}
                    type="button"
                  >
                    {count === 1 ? "1 computer" : `${count} computers`}
                  </button>
                ))}
              </div>
              <small className="optionHint">
                Playing with computer — every other seat is a computer opponent; nobody else can join this game.
              </small>
            </div>
          ) : null;
        }
        const min = scenario?.minPlayers ?? 2;
        const seatCount = lobby.seats.length;
        const counts: number[] = [];
        for (let n = min; n <= max; n += 1) {
          counts.push(n);
        }
        return counts.length > 1 ? (
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
        ) : null;
      })()}

      <div className="optionRow">
        <small title="The map you play on — a built-in scenario sheet or a designed map a player saved in the map designer">
          Map
        </small>
        <MapPicker options={options} send={send} />
      </div>

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
          {startingBonusDescription(options.difficulty)}
          {" "}Guards use the Field Difficulty Level Table column for this difficulty.
        </small>
      </div>

      </div>
      ) : null}

      {tab === "army" ? (
      <div className="optionTabPanel" role="tabpanel" aria-label="Starting army">

      <div className="optionRow">
        <small>Starting resources</small>
        <div className="optionSteppers">
          <ResourceStepper
            label="🪙 gold"
            onChange={(gold) => send({ startingResources: { ...options.startingResources, gold } })}
            value={options.startingResources.gold}
          />
          <ResourceStepper
            label="⚒ materials"
            onChange={(buildingMaterials) =>
              send({ startingResources: { ...options.startingResources, buildingMaterials } })
            }
            value={options.startingResources.buildingMaterials}
          />
          <ResourceStepper
            label="♦ valuables"
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
            label="🪙 gold"
            onChange={(gold) => send({ startingProduction: { ...options.startingProduction, gold } })}
            value={options.startingProduction.gold}
          />
          <ResourceStepper
            label="⚒ materials"
            onChange={(buildingMaterials) =>
              send({ startingProduction: { ...options.startingProduction, buildingMaterials } })
            }
            value={options.startingProduction.buildingMaterials}
          />
          <ResourceStepper
            label="♦ valuables"
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
 * A hero's specialty symbol only — the top-centre art of the printed specialty
 * card, cropped by CSS (`.heroSpecArt img`) exactly as the hero board does, or,
 * for an art-less specialty (Bulwark/Conflux/spell specialists), the transparent
 * specialty symbol contained in the chip. A missing scan just shows the numeral.
 */
function SpecialtySymbol({ cardId }: { cardId: string | undefined }) {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const scan = card?.assets?.cardImage;
  const nativeIcon = !scan ? specialtyIconSrc(cardId) : undefined;
  return (
    <span aria-hidden="true" className="heroSpecArt">
      {scan ? (
        <img alt="" src={assetUrl(scan)} />
      ) : nativeIcon ? (
        <img alt="" className="heroSpecIcon" src={assetUrl(nativeIcon)} />
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

  return (
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
    .filter((id) => !takenByOthers.has(id) && isPlayableFaction(id));
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
        factionIds={(Object.keys(coreFactionDefinitions) as FactionId[]).filter(isPlayableFaction)}
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
  const playableFactions = (Object.keys(coreFactionDefinitions) as FactionId[]).filter(isPlayableFaction);

  return (
    <section className="computerSeatPickers" aria-label="Computer opponents setup">
      <div className="draftPhaseHead">
        <strong>Your computer opponents</strong>
        <small>Hand-pick each one’s town &amp; hero, roll one at random, or leave it on auto (picked at game start).</small>
      </div>
      {computerSeats.map((seat) => {
        const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
        const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
        const expanded = openSeatId === seat.playerId;
        const picked = Boolean(seat.factionId || seat.heroDefId);
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

type SetupTab = "heroes" | "options";

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
  const [tab, setTab] = useState<SetupTab>("heroes");
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

  const tabs: { id: SetupTab; label: string }[] = [
    { id: "heroes", label: "Heroes & draft" },
    { id: "options", label: "Game options" }
  ];

  return (
    <section className="setupLobby" aria-label="Map setup">
      {/* First-visit opt-in: next-step coach + card reasons (local browser pref). */}
      <HelperCoachLobbyPrompt force={forceHelperPrompt} onClose={() => setForceHelperPrompt(false)} />
      <header>
        <h2>Map setup — {scenarioName}</h2>
        {singlePlayer ? (
          <p>
            <strong>Playing with computer.</strong> Claim your own town and hero — and, below, hand-pick or roll each
            computer opponent’s town &amp; hero too, or leave it on auto (the computer picks at game start). Click any
            hero’s <Info aria-hidden="true" size={12} /> for its stats; the game options live on the second tab.
          </p>
        ) : (
          <p>
            Pick a setup format (free pick, draft + ban, full random, or random with choice), then claim a town and
            hero. Click any hero’s <Info aria-hidden="true" size={12} /> for its stats, ability and specialties. The
            table also sets the game options on the second tab.
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
          <div className="setupTabs" role="tablist" aria-label="Setup sections">
            {tabs.map((entry) => (
              <button
                aria-selected={tab === entry.id}
                className={`setupTab ${tab === entry.id ? "active" : ""}`}
                key={entry.id}
                onClick={() => setTab(entry.id)}
                role="tab"
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === "options" ? (
            <GameOptionsPanel onAction={onAction} state={state} viewerPlayerId={viewerPlayerId} />
          ) : (
            <>
              <DraftFlowPanel
                onAction={onAction}
                onInspect={setInfoHeroId}
                state={state}
                viewerPlayerId={viewerPlayerId}
              />
              <ComputerOpponentPickers
                onAction={onAction}
                onInspect={setInfoHeroId}
                state={state}
                viewerPlayerId={viewerPlayerId}
              />
            </>
          )}
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
          className="newGameMenuButton"
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
            {allChosen ? "New Game" : "Waiting for every seat to pick…"}
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
  HERO_LEVEL_UP: { icon: "⭐", cue: "level-up" },
  HERO_GAINED: { icon: "🧙", cue: "recruit" },
  HERO_LOST: { icon: "🏳", cue: "retreat" },
  MORALE_CHANGED: { icon: "🎺", cue: "morale" },
  MORALE_CARD_DRAWN: { icon: "🎺", cue: "morale" },
  MORALE_CARD_DISCARDED: { icon: "🎺", cue: "morale" },
  MORALE_CARD_USED: { icon: "🎺", cue: "morale" },
  QUICK_COMBAT_WON: { icon: "⚡", cue: "quick-combat" },
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
