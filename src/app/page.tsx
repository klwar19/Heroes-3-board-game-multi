"use client";

import { Crosshair, Eye, Map as MapIcon, StepForward, Swords } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  astrologersCardDefinitions,
  effectiveHandLimit,
  effectHasExpertMode,
  ENGINE_SIGNATURE,
  getEffectiveCardEffect,
  getLegalActions,
  getPlayerView,
  getRuleset,
  healLegacyPlayerFields,
  rulesetCardNote,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import {
  BattlefieldBoard,
  CommandDock,
  EffectsRail,
  InitiativeRail,
  InspectPanel,
  LogDrawer
} from "@/components/table/board";
import { CardFrame, HandFan, OpponentBar, PermanentSlot, PlayerDock } from "@/components/table/seats";
import { assetUrl } from "@/lib/asset-url";
import { HeroBoard } from "@/components/hero-board";
import {
  CombatResultModal,
  DiceOverlay,
  DrawOverlay,
  FirstPlayerRollOverlay,
  MapDiceOverlay,
  MapNoticeOverlay,
  NeutralStepOverlay,
  NewDayOverlay,
  AstrologersProclamationOverlay,
  ReactionTray,
  RerollModal,
  SearchModal,
  DICE_PRESENT_MS,
  type DiceCue,
  type DrawCue,
  type FirstPlayerRollCue,
  type MapDiceCue,
  type MapNoticeCue,
  type NewDayCue,
  type AstrologersProclamationCue
} from "@/components/table/overlays";
import { CardZoomProvider, useCardZoom, ZoomButton } from "@/components/table/zoom";
import { TableErrorBoundary } from "@/components/error-boundary";
import {
  ADVENTURE_FEED_CUES,
  AdventureDecksPanel,
  AdventureEventFeed,
  AdventureHud,
  AdventureOwnDeck,
  ArmyPanel,
  FarTileTray,
  HexMapBoard,
  LearningOfferModal,
  LOCATION_GLYPHS,
  MarketPanel,
  PileModal,
  PlacementPanel,
  PreBattlePanel,
  PromptTray,
  SetupLobbyScreen,
  TownPanel,
  type AdventureFeedItem,
  type HeroMoveCue,
  type TilePlacementSelection
} from "@/components/adventure/screen";
import {
  actionKey,
  cardName,
  costCardEligible,
  formatEvent,
  titleCase,
  unitName,
  type CardBoardAction
} from "@/components/table/utils";
import {
  ATTACK_ANIM_MS,
  ATTACK_IMPACT_MS,
  COMBAT_MOVE_MS,
  DRAW_STAGGER_MS,
  FLIGHT_MS,
  FLIGHT_OUT_MS,
  FxStage,
  HOLD_CENTER_MS,
  NEUTRAL_ATTACK_PAUSE_MS,
  RANGED_RELEASE_MS,
  type FxCue
} from "@/components/table/fx";
import {
  abilityFxPlans,
  cancelFx,
  healFxPlans,
  spellFxPlans,
  spellPresentationMs,
  warMachineFxPlans,
  type SpellFxPlan
} from "@/data/fx";
import { orderFxEventsForPresentation, partitionCombatMoves } from "@/components/table/fx-sequence";
import {
  LOCATION_VISIT_SOUNDS,
  MAP_CUE_SOUNDS,
  MAP_CUE_VOLUME,
  MAP_MOVE_VOLUME,
  TERRAIN_MOVE_SOUNDS,
  TILE_SOUNDS
} from "@/data/map-sounds";
import { allTileDefinitions } from "@/data/map/tiles";
import { playLibrarySound, playUnitSound } from "@/lib/sound";
import { unitAttackFlourish } from "@/data/unit-sounds";
import { useBackgroundMusic, type MusicScene } from "@/lib/music";
import { MusicToggle } from "@/components/music-toggle";
import { connectRoom, type GameRoomSnapshot, type RoomConnection } from "@/lib/realtime";
import { clearCachedRoom, loadCachedRoom, saveCachedRoom } from "@/lib/room-cache";

/** Events that move cards or play battle effects on the table. */
const FX_EVENT_TYPES = new Set<GameEvent["type"]>([
  "CARDS_DRAWN",
  "CARD_PLAYED",
  "SPELL_CAST_STARTED",
  "SPELL_DICE_ROLLED",
  "SPELL_CAST_RESOLVED",
  "SPELL_CAST_CANCELLED",
  "DAMAGE_ASSIGNED",
  "DAMAGE_HEALED",
  "UNIT_ABILITY_TRIGGERED",
  "HAND_REFRESHED",
  // Creature voices: each unit speaks with its own H3 clips in combat.
  "COMBAT_UNIT_PLACED",
  "UNIT_ATTACK_DECLARED",
  "UNIT_MOVED",
  "UNIT_DEFENDED",
  "UNIT_REMOVED",
  // Battlefield-obstacle spells: token placement and the bites/halts they cause.
  "BATTLEFIELD_TOKEN_PLACED",
  "BATTLEFIELD_TOKEN_TRIGGERED",
  // Remove Obstacle / Earthquake / siege: obstacle markers and fortifications
  // clearing off the board carry their own crumble cue.
  "COMBAT_OBSTACLE_REMOVED",
  "FORTIFICATION_DESTROYED"
]);

const OBSERVER_SEAT = "observer";

/** Magnifier for the adventure hand; lives inside the CardZoomProvider. */
function AdventureHandZoom({ cardId }: { cardId: string }) {
  const { zoomCard } = useCardZoom();
  return <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId)} />;
}

/** Pay a play's printed discard cost by toggling hand cards (combat plays). */
function CostPlayBar({
  pending,
  hand,
  onPick,
  onConfirm,
  onCancel
}: {
  pending: { action: { cardId: string }; exact?: number; upTo?: number; filter?: "spell" | "power-source"; picks: number[] };
  hand: string[];
  onPick: (index: number) => void;
  onConfirm: (hand: string[]) => void;
  onCancel: () => void;
}) {
  const playedIndex = hand.indexOf(pending.action.cardId);
  const ready =
    pending.exact !== undefined ? pending.picks.length === pending.exact : pending.picks.length <= (pending.upTo ?? 0);
  return (
    <div className="targetBanner costPicker" aria-label="Pay the card cost">
      <Crosshair aria-hidden="true" size={15} />
      <strong>{cardName(pending.action.cardId)}</strong>
      <span>
        {pending.exact !== undefined ? `Discard exactly ${pending.exact}` : `Discard up to ${pending.upTo ?? 0}`}
        {pending.filter === "spell"
          ? " (Spell cards only)"
          : pending.filter === "power-source"
            ? " (Power statistics or Spells)"
            : ""}{" "}
        — {pending.picks.length} picked
      </span>
      {hand.map((cardId, index) => {
        if (index === playedIndex) {
          return null;
        }
        const eligible = costCardEligible(cardId, pending.filter);
        const picked = pending.picks.includes(index);
        return (
          <button
            className={picked ? "selected" : ""}
            disabled={!eligible && !picked}
            key={`${cardId}-${index}`}
            onClick={() => onPick(index)}
            type="button"
          >
            {cardName(cardId)}
          </button>
        );
      })}
      <button disabled={!ready} onClick={() => onConfirm(hand)} type="button">
        Pay &amp; play
      </button>
      <button onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  );
}

/**
 * Morale caps at +1. Gaining a positive token while already at the cap (e.g.
 * playing Leadership at full morale) does not stack — the extra token must be
 * spent right away. This modal pops up to spend it: draw a card, or discard and
 * draw that many (rerolling a die is not an option for the overflow token).
 */
function MoraleOverflowPrompt({
  count,
  canRedraw,
  onDraw,
  onRedraw
}: {
  count: number;
  canRedraw: boolean;
  onDraw: () => void;
  onRedraw: () => void;
}) {
  if (count <= 0) {
    return null;
  }
  return (
    <div className="moraleOverflowBackdrop" role="dialog" aria-modal="true" aria-label="Spend extra morale">
      <div className="moraleOverflowPopup">
        <strong>Morale is already at its maximum (+1)</strong>
        <p>
          You gained {count} more positive morale token{count === 1 ? "" : "s"}. It cannot be stored — spend it now.
        </p>
        <div className="handButtons">
          <button className="commandButton primary" onClick={onDraw} type="button">
            Draw a card
          </button>
          {canRedraw ? (
            <button className="commandButton" onClick={onRedraw} type="button">
              Discard &amp; draw
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Spend the positive morale token DURING combat: draw 1, or discard any number
 * of cards and redraw that many. (The token's third use — rerolling a die — is
 * offered inside the attack-die reroll prompt when a die is thrown.) Shown in
 * the combat table when the engine offers the morale plays to this seat.
 */
function CombatMoralePanel({
  legalActions,
  hand,
  viewerPlayerId,
  onAction
}: {
  legalActions: LegalAction[];
  hand: string[];
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);

  const drawAction = legalActions.find(
    (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "draw"
  );
  const redrawAction = legalActions.find(
    (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "redraw"
  );

  if (!drawAction && !redrawAction) {
    return null;
  }

  const confirmRedraw = () => {
    if (picks.length === 0) {
      return;
    }
    onAction({
      type: "SPEND_MORALE",
      playerId: viewerPlayerId,
      benefit: "redraw",
      discardCardIds: picks.map((index) => hand[index])
    });
    setPicking(false);
    setPicks([]);
  };

  return (
    <div className="combatMorale" aria-label="Spend morale">
      <div className="handButtons">
        {drawAction ? (
          <button className="commandButton" onClick={() => onAction(drawAction.action)} type="button">
            🎖 Morale: draw 1
          </button>
        ) : null}
        {redrawAction ? (
          <button className="commandButton" onClick={() => setPicking(true)} type="button">
            🎖 Morale: discard &amp; redraw
          </button>
        ) : null}
      </div>
      {picking ? (
        <div className="moraleOverflowBackdrop" role="dialog" aria-modal="true" aria-label="Discard and redraw">
          <div className="moraleOverflowPopup">
            <strong>Spend morale: discard cards, draw that many</strong>
            <div className="moraleRedrawCards">
              {hand.map((cardId, index) => (
                <button
                  aria-pressed={picks.includes(index)}
                  className={`trayChip ${picks.includes(index) ? "picked" : ""}`}
                  key={`${cardId}-${index}`}
                  onClick={() =>
                    setPicks((current) =>
                      current.includes(index)
                        ? current.filter((value) => value !== index)
                        : [...current, index]
                    )
                  }
                  type="button"
                >
                  {cardName(cardId)}
                </button>
              ))}
            </div>
            <div className="handButtons">
              <button className="commandButton primary" disabled={picks.length === 0} onClick={confirmRedraw} type="button">
                Discard {picks.length} &amp; draw {picks.length}
              </button>
              <button
                className="commandButton ghost"
                onClick={() => {
                  setPicking(false);
                  setPicks([]);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getInitialRoomId(): string {
  if (typeof window === "undefined") {
    return "dev-room";
  }

  return new URLSearchParams(window.location.search).get("room") || "dev-room";
}

// ---------------------------------------------------------------------------
// Local recovery cache: the latest in-progress game is mirrored to
// localStorage so that if the (ephemeral) server recycles and comes back with
// an empty setup lobby, we can push the saved game straight back instead of
// dumping the player on the menu after a tab switch. The cache is version-gated
// by ENGINE_SIGNATURE (see src/lib/room-cache.ts) so a save from an older
// engine is discarded rather than restored into a crash loop.
// ---------------------------------------------------------------------------

function isFreshLobbyState(state: GameState): boolean {
  return state.phase === "setup" && Boolean(state.setupLobby);
}

/**
 * After a blow's damage number / death cry are queued, the struck unit's real
 * health (and its removal) is revealed this much later — long enough for the
 * floater and slash to anchor to the still-standing card before it falls.
 */
const DAMAGE_REVEAL_DELAY_MS = 150;

/**
 * Whether a resolved attack was melee or ranged. The ATTACK_ROLLED event
 * doesn't carry the kind, so recover it from its UNIT_ATTACK_DECLARED — which
 * always precedes the roll in the log even when a reaction window pushes the
 * roll into a later snapshot. Defaults to melee if the declaration scrolled off.
 */
function attackKindForRoll(
  log: GameState["eventLog"],
  attackerId: string,
  defenderId: string,
  isRetaliation: boolean
): "melee" | "ranged" {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const event = log[i];
    if (
      event.type === "UNIT_ATTACK_DECLARED" &&
      event.attackerId === attackerId &&
      event.defenderId === defenderId &&
      event.isRetaliation === isRetaliation
    ) {
      return event.attackKind;
    }
  }
  return "melee";
}

function makeDiceCue(
  state: GameState,
  event: Extract<GameEvent, { type: "ATTACK_ROLLED" }>,
  preDelayMs = 0
): DiceCue {
  return {
    id: event.id,
    rolls: event.rolls,
    roll: event.roll,
    dieMultiplier: event.dieMultiplier ?? 1,
    rollMode: event.rollMode,
    attackerName: unitName(state, event.attackerId),
    defenderName: unitName(state, event.defenderId),
    attackValue: event.attackValue,
    defenseValue: event.defenseValue,
    attackBonus: event.attackBonus,
    defenseBonus: event.defenseBonus,
    damage: event.damage,
    isRetaliation: event.isRetaliation,
    // Slayer (and the Champions' "apply both") sum every die — keep them all lit.
    ...(event.sumAllDice ? { sumAllDice: true } : {}),
    ...(preDelayMs > 0 ? { preDelayMs } : {})
  };
}

/**
 * The dice a Spell rolls to size its own effect (Inferno): shown in the same
 * attack-die overlay, but headed with the spell's name and a "N hits" read-out
 * instead of an attacker-vs-defender breakdown. Every die counts, so none dim.
 */
function makeSpellDiceCue(
  event: Extract<GameEvent, { type: "SPELL_DICE_ROLLED" }>,
  preDelayMs = 0
): DiceCue {
  const card = cardLibrary[event.spellCardId];
  return {
    id: event.id,
    rolls: event.rolls,
    roll: event.hits,
    dieMultiplier: 1,
    rollMode: "normal",
    attackerName: "",
    defenderName: "",
    attackValue: 0,
    defenseValue: 0,
    attackBonus: 0,
    defenseBonus: 0,
    damage: 0,
    isRetaliation: false,
    sumAllDice: true,
    spellMode: true,
    title: card?.name ?? "Spell",
    caption: event.hits > 0 ? `${event.hits} hit${event.hits === 1 ? "" : "s"} → ${event.hits} damage each` : "No effect",
    ...(preDelayMs > 0 ? { preDelayMs } : {})
  };
}

/** How the hand rail is currently being used. */
type HandMode = null | "mulligan" | "morale-redraw";

export default function Home() {
  const [state, setState] = useState<GameState | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<PlayerId>("p1");
  const [errors, setErrors] = useState<string[]>([]);
  const [roomId, setRoomId] = useState(getInitialRoomId);
  const [roomInput, setRoomInput] = useState(getInitialRoomId);
  const [roomVersion, setRoomVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState("connecting");
  /**
   * The room server's engine signature from the latest snapshot. When it
   * disagrees with this frontend's ENGINE_SIGNATURE the room server is running
   * older engine code (PartyKit was not redeployed) and will reject actions
   * the UI offers — we warn instead of failing silently. See engine/version.ts.
   */
  const [serverSignature, setServerSignature] = useState<string | null>(null);
  const [selectedCardAction, setSelectedCardAction] = useState<CardBoardAction | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [handMode, setHandMode] = useState<HandMode>(null);
  const [handDiscards, setHandDiscards] = useState<number[]>([]);
  /** Adventure hand: which card slot has its play menu open. */
  const [openHandIndex, setOpenHandIndex] = useState<number | null>(null);
  /** Spell Book (house rule): whether the map Spell Book window is open. */
  const [spellBookOpen, setSpellBookOpen] = useState(false);
  /** A chosen play waiting for its discard-cost payment (cost card picks). */
  const [pendingCostPlay, setPendingCostPlay] = useState<{
    action: Extract<GameAction, { type: "PLAY_CARD" }>;
    exact?: number;
    upTo?: number;
    filter?: "spell" | "power-source";
    picks: number[];
  } | null>(null);
  const [tilePlacement, setTilePlacement] = useState<TilePlacementSelection>(null);
  const [combatTab, setCombatTab] = useState<"battle" | "map">("battle");
  const [pile, setPile] = useState<{ title: string; cardIds: string[]; kind: "cards" | "units" | "astrologers" } | null>(null);
  const [dice, setDice] = useState<{ current: DiceCue | null; queue: DiceCue[] }>({
    current: null,
    queue: []
  });
  const [mapDice, setMapDice] = useState<{ current: MapDiceCue | null; queue: MapDiceCue[] }>({
    current: null,
    queue: []
  });
  const [mapNotice, setMapNotice] = useState<{ current: MapNoticeCue | null; queue: MapNoticeCue[] }>({
    current: null,
    queue: []
  });
  const [firstRoll, setFirstRoll] = useState<FirstPlayerRollCue | null>(null);
  const [newDay, setNewDay] = useState<{ current: NewDayCue | null; queue: NewDayCue[] }>({
    current: null,
    queue: []
  });
  const [astrologerCue, setAstrologerCue] = useState<AstrologersProclamationCue | null>(null);
  const [drawCue, setDrawCue] = useState<DrawCue | null>(null);
  const [moveCue, setMoveCue] = useState<HeroMoveCue | null>(null);
  const [flippedUnitIds, setFlippedUnitIds] = useState<Set<string>>(new Set());
  const [feedItems, setFeedItems] = useState<AdventureFeedItem[]>([]);
  const [fxCues, setFxCues] = useState<FxCue[]>([]);
  const [hiddenHandTail, setHiddenHandTail] = useState(0);
  const [tintedUnits, setTintedUnits] = useState<Map<string, string>>(new Map());
  /**
   * True while a combat attack's dice + strike animation + damage are still
   * playing out. Holds back anything that would otherwise resolve over the top
   * of the roll: the next neutral guard's "react?" preview, and the end-of-combat
   * result modal on a killing blow. Cleared a beat after the last strike lands.
   */
  const [combatPresenting, setCombatPresenting] = useState(false);
  /**
   * unitId -> the damage value the board should show while an attack's dice and
   * strike animation play, so a struck unit keeps its pre-hit health (and a
   * slain unit stays on the board) until the blow lands. Cleared per unit at
   * its impact beat.
   */
  const [combatDamageDisplay, setCombatDamageDisplay] = useState<Map<string, number>>(new Map());
  const seenRollIdsRef = useRef<Set<string> | null>(null);
  /** Server store generation last seen; a change means the host restarted. */
  const seenBootIdRef = useRef<string | null>(null);
  /** Server boot we already tried to recover from (avoids restore loops). */
  const restoredForBootRef = useRef<string | null>(null);
  /** Stable handle to ingestSnapshot so the restore result can re-enter it. */
  const ingestSnapshotRef = useRef<(snapshot: GameRoomSnapshot) => void>(() => {});
  const seenMapDiceIdsRef = useRef<Set<string>>(new Set());
  const seenVisitIdsRef = useRef<Set<string>>(new Set());
  const seenFirstRollIdsRef = useRef<Set<string>>(new Set());
  const seenTurnIdsRef = useRef<Set<string>>(new Set());
  // Last round whose Astrologers proclamation this client already popped, so the
  // card resurfaces once per round (not on every action) and never on reconnect.
  const seenAstrologerRoundRef = useRef<number | null>(null);
  const seenDrawIdsRef = useRef<Set<string>>(new Set());
  const seenFlipIdsRef = useRef<Set<string>>(new Set());
  const seenMoveIdsRef = useRef<Set<string>>(new Set());
  const seenTileIdsRef = useRef<Set<string>>(new Set());
  const seenFeedIdsRef = useRef<Set<string>>(new Set());
  const seenFxIdsRef = useRef<Set<string>>(new Set());
  // Unit id -> definition id, kept across snapshots: the death that ends a
  // combat arrives in the snapshot where the combat is already gone.
  const unitDefIdsRef = useRef<Map<string, string>>(new Map());
  const hiddenHandTimerRef = useRef<number | null>(null);
  const combatPresentTimerRef = useRef<number | null>(null);
  /** Pending timers that reveal each unit's real health once its blow lands. */
  const damageRevealTimersRef = useRef<number[]>([]);
  /**
   * The opening deal, held behind the first-player ceremony: the roll must lead
   * the game, so the freshly dealt hand's deck->hand flights wait here and run
   * only when the player dismisses the roll.
   */
  const deferredStartDrawRef = useRef<{ fxCues: FxCue[]; viewerDraws: number; revealAtMs: number } | null>(null);
  /**
   * Visit toasts whose dice are still tumbling, held until the die settles so
   * the roll reads first and the calculation/notice follow — never spoiling the
   * result mid-roll. Accumulates across batches while any map die is on screen.
   */
  const pendingDiceFeedRef = useRef<{ items: AdventureFeedItem[]; sounds: string[] }>({ items: [], sounds: [] });
  const connectionRef = useRef<RoomConnection | null>(null);
  // The draw cue needs the live seat without resubscribing the stream.
  const viewerRef = useRef<PlayerId>("p1");
  useEffect(() => {
    viewerRef.current = viewerPlayerId;
  }, [viewerPlayerId]);

  // Map -> battle hand-off: the combat/map toggle is local and sticky, so a
  // fight opened (or finished) while it still pointed at "map" from a previous
  // combat would leave the player stranded on the map — the new battlefield
  // and even the result modal never showing. Snap to the battlefield whenever
  // a new fight starts or reaches its outcome. Edge-triggered via refs, so
  // anyone may still flip back to the map mid-fight.
  const lastCombatIdRef = useRef<string | null>(null);
  const lastResultCombatIdRef = useRef<string | null>(null);
  useEffect(() => {
    const combatId = state?.combat?.id ?? null;
    if (combatId && combatId !== lastCombatIdRef.current) {
      setCombatTab("battle");
      // A fresh battle starts with a clean presentation slate, so a die,
      // freeze or pause left mid-flight by the previous combat can't bleed
      // into (and mis-sequence) this battle's first attack.
      setDice({ current: null, queue: [] });
      setCombatDamageDisplay(new Map());
      setCombatPresenting(false);
      if (combatPresentTimerRef.current) {
        window.clearTimeout(combatPresentTimerRef.current);
        combatPresentTimerRef.current = null;
      }
      for (const timer of damageRevealTimersRef.current) {
        window.clearTimeout(timer);
      }
      damageRevealTimersRef.current = [];
    }
    lastCombatIdRef.current = combatId;

    const resultId = state?.combat?.outcome ? combatId : null;
    if (resultId && resultId !== lastResultCombatIdRef.current) {
      setCombatTab("battle");
    }
    lastResultCombatIdRef.current = resultId;
  }, [state?.combat?.id, state?.combat?.outcome]);

  // Drops a batch of feed toasts on screen with their staggered audio cues and
  // an 8s auto-expiry. Pulled out so a visit's toasts can either show at once or
  // wait out a die roll (see pendingDiceFeedRef) through the same path.
  const showFeedItems = useCallback((items: AdventureFeedItem[], sounds: string[]) => {
    if (items.length === 0) {
      return;
    }
    sounds
      .filter((key, index) => sounds.indexOf(key) === index)
      .slice(0, 3)
      .forEach((key, index) => {
        window.setTimeout(() => playLibrarySound(key, MAP_CUE_VOLUME), index * 220);
      });
    setFeedItems((current) => [...current, ...items].slice(-6));
    window.setTimeout(() => {
      const expired = new Set(items.map((item) => item.id));
      setFeedItems((current) => current.filter((item) => !expired.has(item.id)));
    }, 8000);
  }, []);

  // Every server snapshot funnels through here so new attack rolls, card
  // draws, hero walks and pack flips cue their animations on every seat. The
  // first snapshot only primes the seen-sets, so a reload replays nothing.
  const ingestServerState = useCallback((nextState: GameState) => {
    // A game serialized before the Spell Book release has players with no
    // `spellBook` array; getPlayerView spreads it on render and would throw
    // ("can't access property Symbol.iterator, spellBook is undefined"),
    // crashing the whole table. Backfill it before anything reads the state.
    healLegacyPlayerFields(nextState);

    const rolls = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    const draws = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "CARDS_DRAWN" }> => event.type === "CARDS_DRAWN"
    );
    const flips = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_FLIPPED" }> => event.type === "UNIT_FLIPPED"
    );
    const moves = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "HERO_MOVED" }> => event.type === "HERO_MOVED"
    );
    const tileEvents = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "TILE_REVEALED" } | { type: "TILE_PLACED" }> =>
        event.type === "TILE_REVEALED" || event.type === "TILE_PLACED"
    );
    const mapDiceEvents = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> => event.type === "ADVENTURE_DICE_ROLLED"
    );
    const turnEvents = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "TURN_STARTED" }> => event.type === "TURN_STARTED"
    );
    const visitEvents = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "FIELD_VISITED" }> => event.type === "FIELD_VISITED"
    );
    const feedEvents = nextState.eventLog.filter((event) => ADVENTURE_FEED_CUES[event.type]);
    const fxEvents = nextState.eventLog.filter((event) => FX_EVENT_TYPES.has(event.type));

    if (!seenRollIdsRef.current) {
      // Fresh room connection: forget the previous room's units.
      unitDefIdsRef.current = new Map();
    }
    if (nextState.combat) {
      for (const unit of Object.values(nextState.combat.units)) {
        if (unit.unitDefId) {
          unitDefIdsRef.current.set(unit.id, unit.unitDefId);
        }
      }
    }

    if (!seenRollIdsRef.current) {
      seenRollIdsRef.current = new Set(rolls.map((event) => event.id));
      seenDrawIdsRef.current = new Set(draws.map((event) => event.id));
      seenFlipIdsRef.current = new Set(flips.map((event) => event.id));
      seenMoveIdsRef.current = new Set(moves.map((event) => event.id));
      seenTileIdsRef.current = new Set(tileEvents.map((event) => event.id));
      seenMapDiceIdsRef.current = new Set(mapDiceEvents.map((event) => event.id));
      seenVisitIdsRef.current = new Set(visitEvents.map((event) => event.id));
      seenFeedIdsRef.current = new Set(feedEvents.map((event) => event.id));
      seenFxIdsRef.current = new Set(fxEvents.map((event) => event.id));
      seenFirstRollIdsRef.current = new Set(
        nextState.eventLog.filter((event) => event.type === "FIRST_PLAYER_ROLLED").map((event) => event.id)
      );
      // A fresh connection joins mid-game without replaying every past turn's
      // sunrise: the first snapshot's TURN_STARTED events count as already seen.
      seenTurnIdsRef.current = new Set(turnEvents.map((event) => event.id));
      // ...and without popping the current round's proclamation again on join.
      seenAstrologerRoundRef.current = nextState.round;
      // Fresh room connection: drop any presentation state from the last room.
      setFxCues([]);
      setHiddenHandTail(0);
      setTintedUnits(new Map());
      if (combatPresentTimerRef.current) {
        window.clearTimeout(combatPresentTimerRef.current);
        combatPresentTimerRef.current = null;
      }
      setCombatPresenting(false);
      for (const timer of damageRevealTimersRef.current) {
        window.clearTimeout(timer);
      }
      damageRevealTimersRef.current = [];
      setCombatDamageDisplay(new Map());
      setMapDice({ current: null, queue: [] });
      setMapNotice({ current: null, queue: [] });
      setFirstRoll(null);
      setNewDay({ current: null, queue: [] });
      deferredStartDrawRef.current = null;
      pendingDiceFeedRef.current = { items: [], sounds: [] };
    } else {
      // Adventure feed: spell out every visit effect, fight, gain and reveal
      // as a toast. The cue name is the future audio hook.
      const freshFeed = feedEvents.filter((event) => !seenFeedIdsRef.current.has(event.id));
      for (const event of freshFeed) {
        seenFeedIdsRef.current.add(event.id);
      }
      if (freshFeed.length > 0) {
        // The promised audio hook: each cue name maps to a sound, visits
        // upgrade to their location's own recording. Deduped and staggered
        // so one snapshot never piles identical sounds.
        const cueSounds: string[] = [];
        for (const event of freshFeed) {
          const cue = ADVENTURE_FEED_CUES[event.type]?.cue;
          let key = cue ? MAP_CUE_SOUNDS[cue] : null;
          if (event.type === "FIELD_VISITED") {
            key = LOCATION_VISIT_SOUNDS[event.location] ?? key;
          }
          if (key && !cueSounds.includes(key)) {
            cueSounds.push(key);
          }
        }

        const items = freshFeed.map((event) => {
          const cue = ADVENTURE_FEED_CUES[event.type];
          return {
            id: event.id,
            icon: cue?.icon ?? "•",
            cue: cue?.cue ?? "default",
            text: formatEvent(event, nextState)
          } satisfies AdventureFeedItem;
        });

        // A visit that throws the yellow/Resource die rolls first: hold its
        // toasts (the calculation and notice) until the die settles, rather
        // than spelling out the result while the cube is still tumbling. The
        // seen-set for map dice is stamped just below, so an as-yet-unseen
        // ADVENTURE_DICE_ROLLED in this batch marks a live roll to wait on.
        const rollingMapDice = mapDiceEvents.some((event) => !seenMapDiceIdsRef.current.has(event.id));
        if (rollingMapDice) {
          pendingDiceFeedRef.current = {
            items: [...pendingDiceFeedRef.current.items, ...items],
            sounds: [...pendingDiceFeedRef.current.sounds, ...cueSounds]
          };
        } else {
          showFeedItems(items, cueSounds);
        }
      }

      // Map dice: every Resource / Treasure / Attack die rolled on the map
      // tumbles center screen, exactly like the combat attack die.
      const freshMapDice = mapDiceEvents.filter((event) => !seenMapDiceIdsRef.current.has(event.id));
      for (const event of mapDiceEvents) {
        seenMapDiceIdsRef.current.add(event.id);
      }
      if (freshMapDice.length > 0) {
        const cues = freshMapDice.map(
          (event) =>
            ({
              id: event.id,
              playerName: nextState.players[event.playerId]?.name ?? event.playerId,
              dice: event.dice,
              results: event.results,
              resourceRolls: event.resourceRolls,
              treasureRolls: event.treasureRolls,
              attackRolls: event.attackRolls
            }) satisfies MapDiceCue
        );
        setMapDice((current) => {
          const queue = [...current.queue, ...cues];
          return current.current ? { ...current, queue } : { current: queue[0], queue: queue.slice(1) };
        });
      }

      // Visit notice: the visited location pops into the player's face with
      // everything the visit did (gains, XP, flags…) spelled out.
      const freshVisits = visitEvents.filter((event) => !seenVisitIdsRef.current.has(event.id));
      for (const event of visitEvents) {
        seenVisitIdsRef.current.add(event.id);
      }
      if (freshVisits.length > 0) {
        const eventNumber = (id: string) => Number(id.slice(4));
        const outcomeTypes = new Set<GameEvent["type"]>([
          "RESOURCES_GAINED",
          "RESOURCES_SPENT",
          "ADVENTURE_DICE_ROLLED",
          "EXPERIENCE_GAINED",
          "HERO_LEVEL_UP",
          "MORALE_CHANGED",
          "FIELD_FLAGGED",
          "QUICK_COMBAT_WON",
          "NEUTRAL_COMBAT_STARTED",
          "PRODUCTION_CHANGED"
        ]);
        const cues = freshVisits.map((visit) => {
          const from = eventNumber(visit.id);
          const nextVisit = freshVisits.find((candidate) => eventNumber(candidate.id) > from);
          const to = nextVisit ? eventNumber(nextVisit.id) : Number.POSITIVE_INFINITY;
          const lines = nextState.eventLog
            .filter((event) => {
              const number = eventNumber(event.id);
              return (
                number > from &&
                number < to &&
                outcomeTypes.has(event.type) &&
                ("playerId" in event ? event.playerId === visit.playerId : true)
              );
            })
            .slice(0, 5)
            .map((event) => formatEvent(event, nextState));
          return {
            id: visit.id,
            icon: LOCATION_GLYPHS[visit.location] ?? "📍",
            title: titleCase(visit.location),
            subtitle: `${nextState.players[visit.playerId]?.name ?? visit.playerId} ${
              visit.revisit ? "revisits" : "visits"
            }`,
            lines,
            location: visit.location
          } satisfies MapNoticeCue;
        });
        setMapNotice((current) => {
          const queue = [...current.queue, ...cues];
          return current.current ? { ...current, queue } : { current: queue[0], queue: queue.slice(1) };
        });
      }

      // First-player roll: a center-screen notice listing everyone's die,
      // attempt by attempt, and who plays first.
      const firstRolls = nextState.eventLog.filter(
        (event): event is Extract<GameEvent, { type: "FIRST_PLAYER_ROLLED" }> => event.type === "FIRST_PLAYER_ROLLED"
      );
      const freshFirstRolls = firstRolls.filter((event) => !seenFirstRollIdsRef.current.has(event.id));
      for (const event of firstRolls) {
        seenFirstRollIdsRef.current.add(event.id);
      }
      // The opening ceremony leads everything else: while it shows, the deal's
      // deck->hand flights wait (stashed below), so the roll plays first and the
      // cards draw only once the player begins the adventure.
      const isGameStart = freshFirstRolls.length > 0;
      if (isGameStart) {
        // The interactive ceremony replays the engine's recorded rounds: each
        // seat rolls the Attack die, ties reroll, the highest starts.
        const event = freshFirstRolls[freshFirstRolls.length - 1];
        const order = nextState.turnOrder
          .filter((id) => id !== NEUTRAL_PLAYER_ID)
          .map((id) => ({ playerId: id, name: nextState.players[id]?.name ?? id }));
        setFirstRoll({
          id: event.id,
          attempts: event.attempts,
          winnerPlayerId: event.winnerPlayerId,
          winnerName: nextState.players[event.winnerPlayerId]?.name ?? event.winnerPlayerId,
          order
        });
      }

      // New day: the sunrise cinematic at the start of every turn, driven off
      // the shared TURN_STARTED event so it plays the same for every seat. A
      // newer turn supersedes any sunrise still queued (never shown), so quick
      // back-to-back turns never stack up a backlog of sunrises.
      const freshTurns = turnEvents.filter((event) => !seenTurnIdsRef.current.has(event.id));
      for (const event of turnEvents) {
        seenTurnIdsRef.current.add(event.id);
      }
      if (freshTurns.length > 0) {
        const latest = freshTurns[freshTurns.length - 1];
        const cue = {
          id: latest.id,
          playerName: nextState.players[latest.playerId]?.name ?? latest.playerId,
          round: latest.round
        } satisfies NewDayCue;
        setNewDay((current) => (current.current ? { current: current.current, queue: [cue] } : { current: cue, queue: [] }));
      }

      // Astrologers proclamation: once the sunrise has played, pop the round's
      // active card into the player's face — once per round per client, so it
      // resurfaces every round it stays face up without nagging every action.
      if (freshTurns.length > 0 && !isGameStart) {
        const round = freshTurns[freshTurns.length - 1].round;
        const activeCardId = nextState.adventure?.astrologers?.activeCardId ?? null;
        const card = activeCardId ? astrologersCardDefinitions[activeCardId] : undefined;
        if (activeCardId && card && seenAstrologerRoundRef.current !== round) {
          seenAstrologerRoundRef.current = round;
          setAstrologerCue({
            id: `astro-${round}-${activeCardId}`,
            cardId: activeCardId,
            name: card.name,
            text: card.text,
            image: card.image,
            expansion: card.expansion,
            ongoing: card.ongoing,
            round
          });
        }
      }

      const seen = seenRollIdsRef.current;
      // Attacks that never rolled the Attack die (Bless, Elemental damage) carry
      // no rolling-dice cinematic — the damage shows through the normal hit
      // floater instead. Mark them seen so they are skipped, never queued.
      const fresh = rolls.filter((event) => !seen.has(event.id) && !event.noDie);
      for (const event of rolls) {
        seen.add(event.id);
      }

      // Combat unit moves arriving this batch (peeked without consuming the FX
      // seen-set, which the card-flight pass below owns). A neutral guard that
      // slides into range and then attacks in the same step has its move and
      // attack roll bundled together — hold the dice so the table watches the
      // guard arrive and pause before the die is thrown.
      const freshCombatMoves = nextState.combat
        ? nextState.eventLog.filter(
            (event): event is Extract<GameEvent, { type: "UNIT_MOVED" }> =>
              event.type === "UNIT_MOVED" && !seenFxIdsRef.current.has(event.id)
          )
        : [];
      const movedNeutralAttackerIds = new Set(
        freshCombatMoves
          .filter((move) => move.playerId === NEUTRAL_PLAYER_ID && fresh.some((roll) => roll.attackerId === move.unitId))
          .map((move) => move.unitId)
      );
      const neutralPreDelayMs = movedNeutralAttackerIds.size > 0 ? COMBAT_MOVE_MS + NEUTRAL_ATTACK_PAUSE_MS : 0;

      // Each attack die is its own beat: the cube rolls and reads, then the
      // table holds (ATTACK_ANIM_MS) so the striking unit's lunge / slash / shot
      // plays in the gap before the next die is thrown. `diceDismissAt[k]` is
      // when the k-th die finishes reading (the moment its strike begins),
      // measured from this snapshot; the FX timeline below pins its strikes to
      // those beats, and the total drives the post-action pause.
      const pendingPreDelay = new Set(movedNeutralAttackerIds);
      const diceDismissAt: number[] = [];
      let diceClock = 0;
      const freshDiceCues = fresh.map((event, index) => {
        let preDelay = 0;
        // The guard that just slid into range waits out its move + the
        // pre-attack pause before its first die.
        if (neutralPreDelayMs > 0 && pendingPreDelay.has(event.attackerId)) {
          pendingPreDelay.delete(event.attackerId);
          preDelay += neutralPreDelayMs;
        }
        // Every later die holds for the previous attack's strike animation.
        if (index > 0) {
          preDelay += ATTACK_ANIM_MS;
        }
        diceClock += preDelay + DICE_PRESENT_MS;
        diceDismissAt.push(diceClock);
        return makeDiceCue(nextState, event, preDelay);
      });

      if (freshDiceCues.length > 0) {
        setDice((current) => {
          const queue = [...current.queue, ...freshDiceCues];
          if (!current.current && queue.length > 0) {
            return { current: queue[0], queue: queue.slice(1) };
          }
          return { ...current, queue };
        });
      }

      // Draw announcement: the FX stage flies cards deck->hand wherever the
      // seat is on screen (combat table, or your own seat on the adventure
      // map). The center-screen cinematic stays only for opponents drawing
      // on the map, where their deck and hand have no on-screen home.
      const freshDraw = draws.filter((event) => !seenDrawIdsRef.current.has(event.id)).at(-1);
      for (const event of draws) {
        seenDrawIdsRef.current.add(event.id);
      }
      if (freshDraw && freshDraw.count > 0 && !nextState.combat && freshDraw.playerId !== viewerRef.current) {
        const isViewer = freshDraw.playerId === viewerRef.current;
        setDrawCue({
          id: freshDraw.id,
          playerName: nextState.players[freshDraw.playerId]?.name ?? freshDraw.playerId,
          isViewer,
          count: freshDraw.count,
          cardIds: isViewer ? (nextState.players[freshDraw.playerId]?.hand.slice(-freshDraw.count) ?? []) : [],
          reshuffled: freshDraw.reshuffledDiscard
        });
      }

      // Hero walks: chain this batch's steps into one animated arrow.
      const freshMoves = moves.filter((event) => !seenMoveIdsRef.current.has(event.id));
      for (const event of moves) {
        seenMoveIdsRef.current.add(event.id);
      }
      if (freshMoves.length > 0) {
        const byHero = new Map<string, { from: string; steps: string[] }>();
        for (const event of freshMoves) {
          const entry = byHero.get(event.heroId);
          if (entry) {
            entry.steps.push(event.to);
          } else {
            byHero.set(event.heroId, { from: event.from, steps: [event.to] });
          }
        }
        const [heroId, walk] = [...byHero.entries()][0];
        const destination = walk.steps.at(-1);
        const destinationField = destination ? nextState.adventure?.fields[destination] : undefined;
        const destinationTile = destinationField
          ? nextState.adventure?.tiles[destinationField.tileInstanceId]
          : undefined;
        const terrain = destinationTile ? allTileDefinitions[destinationTile.tileDefId]?.terrain : undefined;
        playLibrarySound(TERRAIN_MOVE_SOUNDS[terrain ?? "grass"] ?? TERRAIN_MOVE_SOUNDS.grass, MAP_MOVE_VOLUME);
        setMoveCue({
          id: freshMoves[0].id,
          heroId,
          path: [walk.from, ...walk.steps]
        });
        window.setTimeout(() => {
          setMoveCue((current) => (current?.id === freshMoves[0].id ? null : current));
        }, 1800);
      }

      // Pack-to-Few flips get a short card-flip animation on the board.
      const freshFlips = flips.filter((event) => !seenFlipIdsRef.current.has(event.id));
      for (const event of freshFlips) {
        seenFlipIdsRef.current.add(event.id);
      }
      if (freshFlips.length > 0) {
        setFlippedUnitIds((current) => {
          const next = new Set(current);
          for (const event of freshFlips) {
            next.add(event.unitId);
          }
          return next;
        });
        window.setTimeout(() => {
          setFlippedUnitIds((current) => {
            const next = new Set(current);
            for (const event of freshFlips) {
              next.delete(event.unitId);
            }
            return next;
          });
        }, 2400);
      }

      // Tiles announce themselves: discovery sting on reveal, earthy thud
      // on placement.
      const freshTiles = tileEvents.filter((event) => !seenTileIdsRef.current.has(event.id));
      for (const event of tileEvents) {
        seenTileIdsRef.current.add(event.id);
      }
      if (freshTiles.length > 0) {
        const key = freshTiles.some((event) => event.type === "TILE_REVEALED")
          ? TILE_SOUNDS.revealed
          : TILE_SOUNDS.placed;
        playLibrarySound(key, MAP_CUE_VOLUME);
      }

      // Combat table presentation: card flights, spell sprites, projectiles
      // and damage floaters, chained on one timeline per snapshot so a cast
      // reads as "card to center -> effect on target -> damage number".
      const freshFx = fxEvents.filter((event) => !seenFxIdsRef.current.has(event.id));
      for (const event of fxEvents) {
        seenFxIdsRef.current.add(event.id);
      }
      if (freshFx.length > 0 || fresh.length > 0) {
        const cues: FxCue[] = [];
        // Spell rolls (Inferno) feed the attack-die overlay; collected as the loop
        // sequences them so they show after the spell card flies and before its
        // burst lands, then flushed into the overlay queue once the batch is built.
        const spellDiceCues: DiceCue[] = [];
        const viewerId = viewerRef.current;
        const inCombat = Boolean(nextState.combat);
        // Nothing combat-side shows until the dice have rolled and read: when an
        // attack die is in this batch the timeline starts after the dice finish,
        // so damage numbers, ability splashes and heals never pre-empt the roll.
        // Each attack's own strike is pinned to its die more precisely below.
        let timeline = fresh.length > 0 ? diceClock + ATTACK_IMPACT_MS : 0;
        let viewerDraws = 0;
        // defender unitId -> when its blow lands (its die's dismiss + the strike).
        const impactByTarget = new Map<string, number>();
        // defender unitId -> the pre-hit health the board shows until it lands.
        // Populated for attacks here, and for spell/ability damage & heals in the
        // event loop below so a struck/healed unit holds its old health on the
        // board until the spell that changed it has finished animating.
        const freezeDamage = new Map<string, number>();
        // unitId -> when a spell/ability hit/heal it visibly resolves (its number
        // floats, the bar moves, a slain unit falls). Set after the effect's
        // sprites + sound finish, never during them.
        const spellRevealAt = new Map<string, number>();
        // unitId -> total spell/ability damage seen this batch, so repeated hits
        // freeze back to the health from before the first one.
        const spellDamageSeen = new Map<string, number>();
        // attacker unitId -> when its Fire Shield burn resolves (after the burn's
        // sprite + sound finish). Set when the "fire-shield" ability cue is
        // queued and consumed once by that burn's DAMAGE_ASSIGNED, so the burn
        // number/health land after the animation and never on the unrelated
        // retaliation strike beat the attacker may also carry.
        const fireShieldBurnAt = new Map<string, number>();
        // True once any spell/ability has queued damage, a heal or a death in
        // combat — holds the victory notice and the next guard's prompt until the
        // effect (and the death it caused) has played out, exactly like a strike.
        let combatFxActive = false;
        // When the last strike's number / death has played out (drives the pause).
        let combatPresentationEnd = 0;

        // A seat's deck/hand/discard anchors are on screen during combat
        // (every seat) and on the adventure map (the viewer's own seat).
        // Cues for unmounted anchors would self-heal anyway; skipping them
        // up front keeps the timeline tight.
        const seatVisible = (playerId: PlayerId) => Boolean(nextState.combat) || playerId === viewerId;

        // Definition behind a combat unit, surviving the unit's removal so
        // the killing blow still gets its death cry.
        const unitVoice = (unitId: string) =>
          nextState.combat?.units[unitId]?.unitDefId ?? unitDefIdsRef.current.get(unitId);

        // Combat steps: a unit's card visibly glides from its old cell to its
        // new one instead of teleporting, trailing a couple of after-images and
        // its footstep sound. The board has already re-rendered the unit at its
        // destination, so the FX layer hides the real card and flies a ghost.
        // Approach moves (a unit sliding toward its target) play up front;
        // after-attack moves — a Harpy's "Strike and Return" fly-back, or a
        // ranged unit's step after shooting — are held until the strike has
        // played out (queued after the attack loop below). A neutral guard
        // resolves move → attack → return in one snapshot, so without this the
        // Harpy would teleport home before its die was ever thrown.
        const { approach: approachMoves, afterAttack: returnMoves } = partitionCombatMoves(
          nextState.eventLog,
          freshCombatMoves
        );
        approachMoves.forEach((event, index) => {
          const unit = nextState.combat?.units[event.unitId];
          const moveDelay = index * 130;
          cues.push({
            kind: "move",
            id: `${event.id}-move`,
            unitId: event.unitId,
            from: `cell:${event.from}`,
            to: `unit:${event.unitId}`,
            cardImage: unit?.assets?.cardImage,
            // Cards always stand upright now (the seat flip only mirrors cell
            // positions), so the ghost never turns.
            flip: false,
            delayMs: moveDelay
          });
          playUnitSound(unitVoice(event.unitId), "move", moveDelay);
        });

        // Attack strikes are driven off the rolls, not the declarations: an
        // ATTACK_ROLLED event always shares a snapshot with its dice and damage,
        // whereas a reaction window can leave UNIT_ATTACK_DECLARED in an earlier
        // frame. Each strike plays the instant its die finishes reading
        // (diceDismissAt), the struck unit holds its pre-hit health until the
        // blow lands, and its damage number / death are pinned to that beat.
        fresh.forEach((roll, index) => {
          const strikeAt = diceDismissAt[index];
          const impactAt = strikeAt + ATTACK_IMPACT_MS;
          impactByTarget.set(roll.defenderId, impactAt);
          combatPresentationEnd = Math.max(combatPresentationEnd, impactAt + 1200);

          const attacker = nextState.combat?.units[roll.attackerId];
          const defender = nextState.combat?.units[roll.defenderId];
          const defenderCell =
            defender && defender.position >= 0 ? `cell:${defender.position}` : undefined;
          if (defender && defender.position >= 0) {
            // Show the struck unit's pre-hit health (the blow's damage backed out)
            // until impact, so a killing blow keeps it on the board until then.
            freezeDamage.set(roll.defenderId, Math.max(0, defender.damage - roll.damage));
          }
          if (!attacker || !defenderCell) {
            return;
          }

          const ranged =
            attackKindForRoll(nextState.eventLog, roll.attackerId, roll.defenderId, roll.isRetaliation) ===
            "ranged";
          // The attacker's own H3 voice as it strikes (after the die, not on the
          // declaration). A magical striker (the Magic Elemental) layers a magic
          // zap over its voice so its blow reads as raw magic, not a plain thwack.
          const attackerVoice = unitVoice(roll.attackerId);
          playUnitSound(attackerVoice, ranged ? "shoot" : "attack", strikeAt);
          const attackFlourish = unitAttackFlourish(attackerVoice);
          if (attackFlourish) {
            window.setTimeout(() => playLibrarySound(attackFlourish, 0.4), strikeAt);
          }
          cues.push({
            kind: "lunge",
            id: `${roll.id}-lunge`,
            attackerId: roll.attackerId,
            to: defenderCell,
            attackKind: ranged ? "ranged" : "melee",
            // Cards always stand upright now, so the lunge uses the plain
            // screen-space direction to the target.
            flip: false,
            delayMs: strikeAt
          });
          if (ranged) {
            const attackerCell =
              attacker.position >= 0 ? `cell:${attacker.position}` : `unit:${roll.attackerId}`;
            cues.push({
              kind: "bolt",
              id: `${roll.id}-bolt`,
              from: attackerCell,
              to: defenderCell,
              delayMs: strikeAt + RANGED_RELEASE_MS
            });
          } else {
            cues.push({ kind: "slash", id: `${roll.id}-slash`, at: defenderCell, delayMs: impactAt });
          }
          // The struck unit recoils at the moment of impact.
          cues.push({ kind: "shake", id: `${roll.id}-shake`, unitId: roll.defenderId, delayMs: impactAt });
        });

        // After-attack moves now that the strike beats are known: a Harpy's
        // fly-back (or a shooter's step) glides home once the last strike's
        // number/death has played out, so the activation reads "move in → dice →
        // attack/sfx → fly back". Each carries the unit's own footstep/voice and
        // pushes out the post-action pause so the table holds until it lands.
        returnMoves.forEach((event, index) => {
          const unit = nextState.combat?.units[event.unitId];
          const moveDelay = combatPresentationEnd + index * 130;
          cues.push({
            kind: "move",
            id: `${event.id}-move`,
            unitId: event.unitId,
            from: `cell:${event.from}`,
            to: `unit:${event.unitId}`,
            cardImage: unit?.assets?.cardImage,
            flip: false,
            delayMs: moveDelay
          });
          playUnitSound(unitVoice(event.unitId), "move", moveDelay);
          combatPresentationEnd = Math.max(combatPresentationEnd, moveDelay + COMBAT_MOVE_MS);
        });

        // A struck unit holds its pre-hit health until its blow lands (above for
        // attacks, in the event loop below for spell/ability hits & heals). The
        // freeze map and the per-unit reveal beats are applied together once the
        // whole batch is sequenced — see "Reveal frozen health" after the loop.

        // Mulligans / forced discards: the discarded cards fly out to the
        // discard pile before the replacement draws fly in. The reducer
        // logs CARDS_DRAWN before HAND_REFRESHED, so queue these first to
        // restore the physical order.
        for (const event of freshFx) {
          if (event.type !== "HAND_REFRESHED" || event.discarded <= 0 || !seatVisible(event.playerId)) {
            continue;
          }
          const discardedIds = nextState.players[event.playerId]?.discard.slice(-event.discarded) ?? [];
          const flightCount = Math.min(event.discarded, 6);
          for (let i = 0; i < flightCount; i += 1) {
            cues.push({
              kind: "flight",
              id: `${event.id}-discard-${i}`,
              from: `hand:${event.playerId}`,
              to: `discard:${event.playerId}`,
              cardId: discardedIds[i],
              delayMs: timeline + i * 90
            });
          }
          timeline += FLIGHT_MS + (flightCount - 1) * 90;
        }

        // Queue a spell/ability's board presentation (projectile, hit burst,
        // affect shimmer and/or tint) anchored on the target, starting at the
        // current timeline. `fromAnchor` is where a projectile launches from
        // (the caster's hand for spells, the casting unit for abilities). The
        // timeline is advanced by the effect's *full* on-screen + audio length
        // (spellPresentationMs), so whatever the engine resolved next — a damage
        // number, a heal, a death — is queued strictly after it finishes.
        const queueBoardFx = (
          plan: SpellFxPlan,
          eventId: string,
          fromAnchor: string,
          targetUnitId: string
        ) => {
          const at = `unit:${targetUnitId}`;
          const start = timeline;
          if (plan.projectile) {
            cues.push({
              kind: "projectile",
              id: `${eventId}-projectile`,
              fxKey: plan.projectile,
              from: fromAnchor,
              to: at,
              hitFxKey: plan.hit,
              sound: plan.sound,
              hitSound: plan.hitSound,
              delayMs: start
            });
          } else if (plan.hit) {
            cues.push({
              kind: "sprite",
              id: `${eventId}-hit`,
              fxKey: plan.hit,
              at,
              sound: plan.hitSound ?? plan.sound,
              delayMs: start
            });
          }
          plan.affect?.forEach((entry, index) => {
            cues.push({
              kind: "sprite",
              id: `${eventId}-affect-${index}`,
              fxKey: entry.key,
              at,
              sound: index === 0 ? plan.sound : undefined,
              delayMs: start + (entry.delayMs ?? 0)
            });
          });
          if (plan.tint) {
            const tint = plan.tint;
            const soundKey = plan.sound;
            window.setTimeout(() => {
              if (soundKey) {
                playLibrarySound(soundKey);
              }
              setTintedUnits((current) => new Map(current).set(targetUnitId, tint));
              window.setTimeout(() => {
                setTintedUnits((current) => {
                  const next = new Map(current);
                  next.delete(targetUnitId);
                  return next;
                });
              }, 1600);
            }, start);
          }
          // Sound-only plan (Teleport): no sprite/projectile/tint carries the
          // cue, so the cast sound is played directly over the target unit.
          if (!plan.projectile && !plan.hit && !plan.affect?.length && !plan.tint && plan.sound) {
            const soundKey = plan.sound;
            window.setTimeout(() => playLibrarySound(soundKey), start);
          }
          timeline = start + spellPresentationMs(plan);
        };

        // Walk the events in *presentation* order, not log order: a spell's
        // sprite must lead the damage / death / heal it caused, even though the
        // engine records the outcome first (the spell is still on the stack).
        for (const event of orderFxEventsForPresentation(freshFx)) {
          switch (event.type) {
            case "CARDS_DRAWN": {
              if (event.count <= 0 || !seatVisible(event.playerId)) {
                break;
              }
              const isViewer = event.playerId === viewerId;
              const drawnIds = isViewer
                ? (nextState.players[event.playerId]?.hand.slice(-event.count) ?? [])
                : [];
              const flightCount = Math.min(event.count, 6);
              if (event.reshuffledDiscard) {
                cues.push({
                  kind: "pulse",
                  id: `${event.id}-shuffle`,
                  at: `deck:${event.playerId}`,
                  text: "Reshuffled",
                  delayMs: timeline
                });
                timeline += 750;
              }
              for (let i = 0; i < flightCount; i += 1) {
                cues.push({
                  kind: "flight",
                  id: `${event.id}-card-${i}`,
                  from: `deck:${event.playerId}`,
                  to: `hand:${event.playerId}`,
                  cardId: isViewer ? drawnIds[i] : undefined,
                  delayMs: timeline + i * DRAW_STAGGER_MS
                });
              }
              timeline += FLIGHT_MS + (flightCount - 1) * DRAW_STAGGER_MS;
              if (isViewer) {
                viewerDraws += event.count;
              }
              break;
            }
            case "CARD_PLAYED": {
              if (!seatVisible(event.playerId)) {
                break;
              }
              const start = timeline;
              cues.push({
                kind: "flight",
                id: `${event.id}-play`,
                from: `hand:${event.playerId}`,
                to: `discard:${event.playerId}`,
                cardId: event.cardId,
                holdMs: HOLD_CENTER_MS,
                delayMs: start
              });
              timeline += FLIGHT_MS + HOLD_CENTER_MS + FLIGHT_OUT_MS;
              // A Spell that resolves through a card play (rather than a spell
              // cast) carries its cue here: map spells (Town Portal, Fly,
              // Visions…) and combat trigger/reaction instants (Weakness,
              // Slayer, Sorrow, Magic Mirror, Prayer…). A played card has no
              // board target, so its sprite bursts at centre stage over the
              // card. A Spell discarded for its "+1 Power" side toward another
              // cast is not itself resolving, so it is skipped (it still gets
              // the card-flight foley).
              const isPowerBoost = event.optionLabel?.startsWith("+1 Power") ?? false;
              const playedPlan = isPowerBoost ? undefined : spellFxPlans[event.cardId];
              if (playedPlan) {
                const at = start + FLIGHT_MS;
                const affectKey = playedPlan.affect?.[0]?.key;
                if (affectKey) {
                  cues.push({
                    kind: "sprite",
                    id: `${event.id}-played-fx`,
                    fxKey: affectKey,
                    at: "center",
                    sound: playedPlan.sound,
                    delayMs: at
                  });
                } else if (playedPlan.sound) {
                  const soundKey = playedPlan.sound;
                  window.setTimeout(() => playLibrarySound(soundKey), at);
                }
              }
              break;
            }
            case "SPELL_CAST_STARTED": {
              if (!seatVisible(event.playerId)) {
                break;
              }
              cues.push({
                kind: "flight",
                id: `${event.id}-cast`,
                from: `hand:${event.playerId}`,
                to: `discard:${event.playerId}`,
                cardId: event.spellCardId,
                holdMs: HOLD_CENTER_MS,
                delayMs: timeline
              });
              // Board effects may begin while the card exits to the discard.
              timeline += FLIGHT_MS + HOLD_CENTER_MS;
              break;
            }
            case "SPELL_DICE_ROLLED": {
              // Roll the dice out first — the cube clatter under the spell's own
              // roar — then push the burst and the damage past the read-out, so
              // the player sees what was rolled before any unit is touched. The
              // dice overlay waits out the current beat (the spell card's flight).
              const startAt = timeline;
              spellDiceCues.push(makeSpellDiceCue(event, startAt));
              const dicePlan = spellFxPlans[event.spellCardId];
              if (dicePlan?.sound) {
                const soundKey = dicePlan.sound;
                window.setTimeout(() => playLibrarySound(soundKey), startAt);
              }
              timeline = startAt + DICE_PRESENT_MS;
              if (inCombat) {
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 1200);
              }
              break;
            }
            case "SPELL_CAST_RESOLVED": {
              const plan = spellFxPlans[event.spellCardId];
              if (!plan) {
                break;
              }
              if (event.target.type === "unit") {
                queueBoardFx(plan, event.id, `hand:${event.playerId}`, event.target.unitId);
              } else if (event.target.type === "space") {
                const at = timeline;
                if (plan.hit) {
                  // Inferno / Frost Ring burst on the chosen space (no unit to
                  // anchor on): the sheet flares over the cell, then its per-unit
                  // damage floaters fire after it. Inferno's roar already played
                  // under SPELL_DICE_ROLLED; a dice-less blast (Frost Ring) rides
                  // its impact sound on the burst here.
                  cues.push({
                    kind: "sprite",
                    id: `${event.id}-burst`,
                    fxKey: plan.hit,
                    at: `cell:${event.target.position}`,
                    sound: plan.hitSound,
                    delayMs: at
                  });
                  timeline += spellPresentationMs(plan);
                  // Hold the combat presentation past the burst so a dice-less
                  // space blast (Frost Ring) does not snap the board forward
                  // before its ring has played (Inferno's dice already did this).
                  if (inCombat) {
                    combatFxActive = true;
                    combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 1200);
                  }
                } else if (plan.sound) {
                  // Summon Elemental resolves on an empty space — no unit to
                  // anchor board FX on, so play the cast sound on the timeline.
                  const soundKey = plan.sound;
                  window.setTimeout(() => playLibrarySound(soundKey), at);
                }
              } else if (plan.affect || plan.sound) {
                // A player-scoped spell with no single target unit (Mirth):
                // there is nothing on the board to anchor on, so its sprite
                // bursts at centre stage with the cast sound.
                const at = timeline;
                const affectKey = plan.affect?.[0]?.key;
                if (affectKey) {
                  cues.push({
                    kind: "sprite",
                    id: `${event.id}-fx`,
                    fxKey: affectKey,
                    at: "center",
                    sound: plan.sound,
                    delayMs: at
                  });
                } else if (plan.sound) {
                  const soundKey = plan.sound;
                  window.setTimeout(() => playLibrarySound(soundKey), at);
                }
              }
              break;
            }
            case "SPELL_CAST_CANCELLED": {
              // Protection from X carries its own element sprite + sound (keyed by
              // the cancelling card); a generic counter (Resistance) falls back to
              // the dispel fizzle.
              const cancelPlan = spellFxPlans[event.cancelledByCardId];
              cues.push({
                kind: "sprite",
                id: `${event.id}-fizzle`,
                fxKey: cancelPlan?.affect?.[0]?.key ?? cancelFx.key,
                at: "center",
                sound: cancelPlan?.sound ?? cancelFx.sound,
                delayMs: timeline
              });
              cues.push({
                kind: "floater",
                id: `${event.id}-note`,
                at: "center",
                text: "Cancelled!",
                tone: "info",
                delayMs: timeline + 150
              });
              timeline += 800;
              break;
            }
            case "WAR_MACHINE_TRIGGERED": {
              // A firing war machine (Ballista, Catapult, Cannon) looses its shot
              // here, just before the DAMAGE_ASSIGNED it logs next. Play its H3
              // shot clip and advance the timeline by the clip's length so the
              // struck unit's hurt cry + damage number (queued on that following
              // DAMAGE_ASSIGNED) land only once the shot has been heard. The
              // First Aid Tent never reaches this event (it heals — see
              // healFxPlans); the Ammo Cart is a passive buff that never fires.
              const shotPlan = warMachineFxPlans[event.cardId];
              if (shotPlan?.sound) {
                if (event.targetUnitId) {
                  queueBoardFx(shotPlan, `${event.id}-shot`, "center", event.targetUnitId);
                } else {
                  const soundKey = shotPlan.sound;
                  const at = timeline;
                  window.setTimeout(() => playLibrarySound(soundKey), at);
                  timeline = at + spellPresentationMs(shotPlan);
                }
                if (inCombat) {
                  combatFxActive = true;
                  combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 1200);
                }
              }
              break;
            }
            case "DAMAGE_ASSIGNED": {
              if (event.target.type === "unit" && event.amount > 0) {
                const targetId = event.target.unitId;
                // Fire Shield burn: its cue queued a reveal beat for this attacker
                // (after the flare). Consume it once so the burn number/health
                // land after the animation, and the attacker's later retaliation
                // strike still pins to its own beat below.
                const burnAt = fireShieldBurnAt.get(targetId);
                // Attack damage lands on its strike beat; spell/ability damage
                // lands only once its sprite + sound have finished (the timeline
                // was just advanced past them by queueBoardFx / the ability cue).
                const attackBeat = burnAt === undefined ? impactByTarget.get(targetId) : undefined;
                const at = burnAt ?? attackBeat ?? timeline;
                if (burnAt !== undefined) {
                  fireShieldBurnAt.delete(targetId);
                }
                playUnitSound(unitVoice(targetId), "hurt", at);
                cues.push({
                  kind: "floater",
                  id: `${event.id}-floater`,
                  at: `unit:${targetId}`,
                  text: `−${event.amount}`,
                  tone: "damage",
                  delayMs: at
                });
                // Spell/ability hit (not a strike): freeze the struck unit's
                // pre-hit health on the board so a wound — or a death — never
                // shows before its spell finished. Revealed a beat after the
                // number floats. Attack hits already do this in the pre-pass.
                if (attackBeat === undefined && inCombat) {
                  const defender = nextState.combat?.units[targetId];
                  if (defender && defender.position >= 0) {
                    if (burnAt !== undefined) {
                      // Fire Shield burn: back the burn out of whatever is already
                      // frozen (a pending retaliation the pre-pass froze) so the
                      // attacker's health drop waits for the flare, while its
                      // retaliation still reveals on its own strike beat.
                      const base = freezeDamage.get(targetId) ?? defender.damage;
                      freezeDamage.set(targetId, Math.max(0, base - event.amount));
                    } else {
                      const seen = (spellDamageSeen.get(targetId) ?? 0) + event.amount;
                      spellDamageSeen.set(targetId, seen);
                      freezeDamage.set(targetId, Math.max(0, defender.damage - seen));
                    }
                  }
                  const revealAt = at + DAMAGE_REVEAL_DELAY_MS;
                  spellRevealAt.set(targetId, Math.max(spellRevealAt.get(targetId) ?? 0, revealAt));
                  combatFxActive = true;
                  combatPresentationEnd = Math.max(combatPresentationEnd, revealAt + 1200);
                }
              }
              break;
            }
            case "DAMAGE_HEALED": {
              if (event.target.type === "unit" && event.amount > 0) {
                const targetId = event.target.unitId;
                // First Aid Tent (and any future non-spell heal) heals outside the
                // spell flow, so it carries its own shimmer + chime here. Spell
                // heals (Cure) already animated through their cast above, so the
                // registry deliberately omits them — no double cue.
                const healPlan =
                  event.source.type === "card" ? healFxPlans[event.source.cardId] : undefined;
                if (healPlan) {
                  queueBoardFx(healPlan, `${event.id}-heal`, `unit:${targetId}`, targetId);
                }
                // The "+N" and the bar climbing back up wait for the heal effect
                // (its own here, or the Cure cast just queued) to finish.
                const at = timeline;
                cues.push({
                  kind: "floater",
                  id: `${event.id}-floater`,
                  at: `unit:${targetId}`,
                  text: `+${event.amount}`,
                  tone: "heal",
                  delayMs: at
                });
                if (inCombat) {
                  const unit = nextState.combat?.units[targetId];
                  if (unit && unit.position >= 0) {
                    // Hold the more-wounded pre-heal health until the shimmer ends.
                    freezeDamage.set(targetId, Math.min(unit.maxHealth, unit.damage + event.amount));
                    const revealAt = at + DAMAGE_REVEAL_DELAY_MS;
                    spellRevealAt.set(targetId, Math.max(spellRevealAt.get(targetId) ?? 0, revealAt));
                    combatFxActive = true;
                    combatPresentationEnd = Math.max(combatPresentationEnd, revealAt + 800);
                  }
                }
              }
              break;
            }
            case "UNIT_ABILITY_TRIGGERED": {
              const plan = abilityFxPlans[event.abilityId];
              if (!plan) {
                break;
              }
              const targetUnitId = event.targetUnitId ?? event.unitId;
              if (event.abilityId === "fire-shield") {
                // The burn answers the melee attack that just struck the shielded
                // unit (event.unitId). Play the fire flare on the attacker
                // (targetUnitId) right after that strike lands — on the strike's
                // beat, NOT the main timeline — so the SFX + animation always run
                // before the burn number/health, which is held back to match.
                const strikeBeat = impactByTarget.get(event.unitId);
                const start = (strikeBeat ?? timeline) + DAMAGE_REVEAL_DELAY_MS;
                plan.affect?.forEach((entry, index) => {
                  cues.push({
                    kind: "sprite",
                    id: `${event.id}-fireshield-${index}`,
                    fxKey: entry.key,
                    at: `unit:${targetUnitId}`,
                    sound: index === 0 ? plan.sound : undefined,
                    delayMs: start + (entry.delayMs ?? 0)
                  });
                });
                const burnAt = start + spellPresentationMs(plan);
                fireShieldBurnAt.set(targetUnitId, burnAt);
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, burnAt + DAMAGE_REVEAL_DELAY_MS + 1200);
                break;
              }
              // A bolt only flies when there's a separate target to fly to;
              // a self-anchored ability drops its projectile and just bursts in
              // place. Either way queueBoardFx advances the timeline by the
              // effect's full length so the damage it deals waits for it.
              const flies = Boolean(plan.projectile && event.targetUnitId && event.targetUnitId !== event.unitId);
              const effectivePlan = flies ? plan : { ...plan, projectile: undefined };
              queueBoardFx(effectivePlan, `${event.id}-ability`, `unit:${event.unitId}`, targetUnitId);
              break;
            }
            // Creature voices: the unit's own H3 clips, sequenced on the
            // same timeline so an exchange reads "strike -> wince -> death
            // cry -> retaliation".
            case "COMBAT_UNIT_PLACED": {
              playUnitSound(unitVoice(event.unitId), "move", timeline);
              break;
            }
            case "UNIT_ATTACK_DECLARED": {
              // The strike (voice + lunge + slash/shot + the struck unit's
              // recoil) is queued off the attack roll in the beats pre-pass
              // above, so it lands after the dice rather than on the declaration
              // — which a reaction window can strand a whole snapshot earlier.
              break;
            }
            case "UNIT_MOVED": {
              // The card-glide and footstep are queued in the movement pre-pass
              // above (on their own timeline), so nothing to do here.
              break;
            }
            case "UNIT_DEFENDED": {
              playUnitSound(unitVoice(event.unitId), "defend", timeline);
              break;
            }
            case "UNIT_REMOVED": {
              // A unit slain by an attack cries out as its blow lands; one slain
              // by a spell/ability cries out as it falls — the beat its frozen
              // health is revealed, just after its damage number, never during
              // the spell. Other removals follow the timeline.
              const impactAt = impactByTarget.get(event.unitId);
              const spellFallAt = spellRevealAt.get(event.unitId);
              if (impactAt !== undefined) {
                playUnitSound(unitVoice(event.unitId), "death", impactAt + DAMAGE_REVEAL_DELAY_MS);
              } else if (spellFallAt !== undefined) {
                playUnitSound(unitVoice(event.unitId), "death", spellFallAt);
                combatPresentationEnd = Math.max(combatPresentationEnd, spellFallAt + 1200);
              } else {
                playUnitSound(unitVoice(event.unitId), "death", timeline);
                timeline += 650;
              }
              break;
            }
            case "BATTLEFIELD_TOKEN_PLACED": {
              // A spell laid a token on a board space. Force Field / Fire Wall
              // flare into place with their cast cue; the face-down traps drop
              // quietly — their bite waits until a unit springs them.
              const at = timeline;
              if (event.kind === "force_field") {
                cues.push({ kind: "sprite", id: `${event.id}-place`, fxKey: "force-field", at: `cell:${event.position}`, sound: "spells/force-field", delayMs: at });
                timeline += 520;
              } else if (event.kind === "fire_wall") {
                cues.push({ kind: "sprite", id: `${event.id}-place`, fxKey: "fire-wall-e", at: `cell:${event.position}`, sound: "spells/fire-wall", delayMs: at });
                timeline += 520;
              } else {
                const soundKey = event.kind === "land_mine" ? "spells/land-mine" : "spells/quicksand";
                window.setTimeout(() => playLibrarySound(soundKey), at);
              }
              break;
            }
            case "BATTLEFIELD_TOKEN_TRIGGERED": {
              // A unit moving over a token sprang it: a Fire Wall flames, an armed
              // Land Mine detonates, an armed Quicksand swallows, and a face-down
              // decoy flips up empty and is cleared away. Any damage number floats
              // off the DAMAGE_ASSIGNED that follows.
              const at = timeline;
              if (event.outcome === "decoy") {
                // An empty decoy: the dull token cue plays as it is removed, no bite.
                window.setTimeout(() => playLibrarySound(event.kind === "land_mine" ? "spells/land-mine" : "spells/quicksand"), at);
                cues.push({ kind: "floater", id: `${event.id}-decoy`, at: `cell:${event.position}`, text: "Empty", tone: "info", delayMs: at + 120 });
              } else if (event.kind === "fire_wall") {
                cues.push({ kind: "sprite", id: `${event.id}-burn`, fxKey: "fire-wall-e", at: `cell:${event.position}`, sound: "spells/fire-wall", delayMs: at });
              } else if (event.kind === "land_mine") {
                cues.push({ kind: "sprite", id: `${event.id}-boom`, fxKey: "land-mine-hit", at: `cell:${event.position}`, sound: "spells/land-mine-trigger", delayMs: at });
              } else {
                // Armed Quicksand: the sandy pit bubbles up as the unit is mired.
                cues.push({ kind: "sprite", id: `${event.id}-sink`, fxKey: "quicksand", at: `cell:${event.position}`, sound: "spells/quicksand", delayMs: at });
                cues.push({ kind: "floater", id: `${event.id}-stuck`, at: `cell:${event.position}`, text: "Stuck!", tone: "info", delayMs: at + 120 });
              }
              timeline += 600;
              if (inCombat) {
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 600);
              }
              break;
            }
            case "COMBAT_OBSTACLE_REMOVED": {
              // Remove Obstacle lifted an obstacle marker: the H3 crumble cue
              // plays on that cell as the marker clears off the board.
              const at = timeline;
              window.setTimeout(() => playLibrarySound("spells/remove-obstacle"), at);
              cues.push({
                kind: "floater",
                id: `${event.id}-removed`,
                at: `cell:${event.position}`,
                text: "Removed",
                tone: "info",
                delayMs: at + 120
              });
              timeline += 600;
              if (inCombat) {
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 400);
              }
              break;
            }
            case "FORTIFICATION_DESTROYED": {
              // A Wall, the Gate or the Arrow Tower comes down (Earthquake,
              // Remove Obstacle, Ballistics, a Cyclops). The siege-wall impact
              // cue cracks it; the Tower's own removal cry still plays on its
              // UNIT_REMOVED. Previously these fell silently.
              const at = timeline;
              window.setTimeout(() => playLibrarySound("effects/siege-wall-hit"), at);
              if (event.position !== undefined) {
                cues.push({
                  kind: "floater",
                  id: `${event.id}-fall`,
                  at: `cell:${event.position}`,
                  text: event.kind === "gate" ? "Gate down" : "Wall down",
                  tone: "info",
                  delayMs: at + 120
                });
              }
              timeline += 600;
              if (inCombat) {
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 400);
              }
              break;
            }
            default:
              break;
          }
        }

        // Show any spell rolls (Inferno) collected above in the attack-die
        // overlay, each waiting out the beat the loop scheduled it at (the spell
        // card's flight) before its cube tumbles.
        if (spellDiceCues.length > 0) {
          setDice((current) => {
            const queue = [...current.queue, ...spellDiceCues];
            if (!current.current && queue.length > 0) {
              return { current: queue[0], queue: queue.slice(1) };
            }
            return { ...current, queue };
          });
        }

        // Reveal frozen health. Every struck/healed unit shows its old health
        // until its blow/spell visibly resolves, then snaps to the real value
        // (a slain unit vanishes, a healed one fills back up). Attacks reveal a
        // beat after their strike lands; spells/heals at the beat recorded while
        // the loop sequenced them — always after the effect has played. Only
        // touched when this batch froze something, so a still-pending reveal from
        // an earlier snapshot is left to fire on its own.
        if (freezeDamage.size > 0) {
          for (const timer of damageRevealTimersRef.current) {
            window.clearTimeout(timer);
          }
          damageRevealTimersRef.current = [];
          const revealAt = new Map<string, number>(spellRevealAt);
          impactByTarget.forEach((impactMs, unitId) => {
            // Cover blocked attacks (frozen with no damage event) too.
            revealAt.set(unitId, Math.max(revealAt.get(unitId) ?? 0, impactMs + DAMAGE_REVEAL_DELAY_MS));
          });
          setCombatDamageDisplay(freezeDamage);
          freezeDamage.forEach((_shown, unitId) => {
            const at = revealAt.get(unitId) ?? 0;
            const timer = window.setTimeout(() => {
              setCombatDamageDisplay((current) => {
                if (!current.has(unitId)) {
                  return current;
                }
                const next = new Map(current);
                next.delete(unitId);
                return next;
              });
            }, at);
            damageRevealTimersRef.current.push(timer);
          });
        }

        if (isGameStart) {
          // Roll first, then deal: hide the freshly dealt hand now and stash its
          // deck->hand flights so they run the moment the player dismisses the
          // first-player ceremony (dismissFirstRoll flushes deferredStartDrawRef).
          if (viewerDraws > 0) {
            setHiddenHandTail(viewerDraws);
          }
          deferredStartDrawRef.current = { fxCues: cues, viewerDraws, revealAtMs: timeline + 80 };
        } else {
          if (viewerDraws > 0) {
            setHiddenHandTail(viewerDraws);
            if (hiddenHandTimerRef.current) {
              window.clearTimeout(hiddenHandTimerRef.current);
            }
            hiddenHandTimerRef.current = window.setTimeout(() => setHiddenHandTail(0), timeline + 80);
          }
          if (cues.length > 0) {
            setFxCues((current) => [...current, ...cues]);
          }
        }

        // Whenever this snapshot resolved one or more attacks — or a spell /
        // ability that dealt damage, healed or killed in combat — hold the things
        // that would otherwise resolve over the top of it until every die,
        // strike, sprite, damage number and death has played out: the next
        // neutral guard's "react?" preview (which then counts down its own 2s
        // breather) and, on the killing blow, the victory/defeat modal.
        // combatPresentationEnd tracks the last effect's full tail; timeline
        // covers trailing cues.
        if (fresh.length > 0 || combatFxActive) {
          const presentationMs = Math.max(timeline, combatPresentationEnd);
          if (combatPresentTimerRef.current) {
            window.clearTimeout(combatPresentTimerRef.current);
          }
          setCombatPresenting(true);
          combatPresentTimerRef.current = window.setTimeout(() => {
            setCombatPresenting(false);
            combatPresentTimerRef.current = null;
          }, presentationMs);
        }
      }
    }

    setState(nextState);
  }, [showFeedItems]);

  const ingestSnapshot = useCallback(
    (snapshot: GameRoomSnapshot) => {
      // Record the room server's engine signature from every frame (even ones
      // the version gate later drops) so a stale-server warning shows promptly.
      if (snapshot.serverSignature) {
        setServerSignature(snapshot.serverSignature);
      }

      // The version gate keeps out-of-order frames from rolling the table
      // back — but when the server process restarted (new bootId) its version
      // counter starts over, and refusing those snapshots froze the table
      // ("nothing moves anymore"). A boot change always wins.
      const bootChanged = Boolean(snapshot.bootId) && snapshot.bootId !== seenBootIdRef.current;

      // Recovery: the server came back (new boot) holding only a fresh setup
      // lobby while we have a saved in-progress game for this room — the room
      // was lost to a recycle. Push our cached game back instead of dropping to
      // the menu. Guarded per-boot so it runs at most once.
      if (
        bootChanged &&
        isFreshLobbyState(snapshot.state) &&
        restoredForBootRef.current !== (snapshot.bootId ?? null)
      ) {
        const cached = loadCachedRoom(roomId);
        if (cached && !isFreshLobbyState(cached.state)) {
          restoredForBootRef.current = snapshot.bootId ?? null;
          seenBootIdRef.current = snapshot.bootId ?? null;
          connectionRef.current
            ?.restoreRoom(cached.state)
            .then((restored) => ingestSnapshotRef.current(restored))
            .catch(() => {
              // Restore failed: fall back to showing whatever the server has.
              ingestServerState(snapshot.state);
              setRoomVersion(snapshot.version);
            });
          return;
        }
      }

      if (snapshot.bootId) {
        seenBootIdRef.current = snapshot.bootId;
      }
      // Mirror in-progress games for recovery; never cache a bare lobby (that
      // would let a later recycle overwrite a real game).
      if (!isFreshLobbyState(snapshot.state)) {
        saveCachedRoom(roomId, snapshot.version, snapshot.state);
      }
      setRoomVersion((currentVersion) => {
        if (bootChanged || snapshot.version > currentVersion) {
          ingestServerState(snapshot.state);
          return snapshot.version;
        }
        return currentVersion;
      });
    },
    [ingestServerState, roomId]
  );

  useEffect(() => {
    ingestSnapshotRef.current = ingestSnapshot;
  }, [ingestSnapshot]);

  const dismissDice = useCallback(() => {
    setDice((current) =>
      current.queue.length > 0
        ? { current: current.queue[0], queue: current.queue.slice(1) }
        : { current: null, queue: [] }
    );
  }, []);

  const dismissMapDice = useCallback(() => {
    setMapDice((current) =>
      current.queue.length > 0
        ? { current: current.queue[0], queue: current.queue.slice(1) }
        : { current: null, queue: [] }
    );
  }, []);

  const dismissMapNotice = useCallback(() => {
    setMapNotice((current) =>
      current.queue.length > 0
        ? { current: current.queue[0], queue: current.queue.slice(1) }
        : { current: null, queue: [] }
    );
  }, []);

  const dismissNewDay = useCallback(() => {
    setNewDay((current) =>
      current.queue.length > 0
        ? { current: current.queue[0], queue: current.queue.slice(1) }
        : { current: null, queue: [] }
    );
  }, []);

  // Closing the first-player ceremony releases the opening deal: the deck->hand
  // flights stashed at game start fly now, and the freshly dealt hand reveals as
  // they land — the roll having led, the cards draw after.
  const dismissFirstRoll = useCallback(() => {
    const deferred = deferredStartDrawRef.current;
    deferredStartDrawRef.current = null;
    if (deferred) {
      if (deferred.fxCues.length > 0) {
        setFxCues((current) => [...current, ...deferred.fxCues]);
      }
      if (deferred.viewerDraws > 0) {
        if (hiddenHandTimerRef.current) {
          window.clearTimeout(hiddenHandTimerRef.current);
        }
        hiddenHandTimerRef.current = window.setTimeout(() => setHiddenHandTail(0), deferred.revealAtMs);
      }
    }
    setFirstRoll(null);
  }, []);

  // The yellow/Resource die reads first: once the last map die clears the
  // screen, release the visit toasts (the calculation and notice) held behind
  // it. Fires on natural settle and on a click-to-skip alike, since both drain
  // the queue down to nothing.
  useEffect(() => {
    if (mapDice.current) {
      return;
    }
    const pending = pendingDiceFeedRef.current;
    if (pending.items.length > 0) {
      pendingDiceFeedRef.current = { items: [], sounds: [] };
      showFeedItems(pending.items, pending.sounds);
    }
  }, [mapDice, showFeedItems]);

  const handleFxDone = useCallback((id: string) => {
    setFxCues((current) => current.filter((cue) => cue.id !== id));
  }, []);

  // One live connection per room: PartyKit edge socket when configured,
  // otherwise the built-in API + SSE stream.
  useEffect(() => {
    seenRollIdsRef.current = null;
    // Each room gets its own recovery attempt, even on the same server boot.
    restoredForBootRef.current = null;

    const connection = connectRoom(roomId, {
      onSnapshot: ingestSnapshot,
      onStatus: setSyncStatus
    });
    connectionRef.current = connection;

    connection
      .fetchSnapshot()
      .then(ingestSnapshot)
      .catch(() => setSyncStatus("room sync failed"));

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [roomId, ingestSnapshot]);

  const submitAction = async (action: GameAction) => {
    // A play with a printed discard cost (Xyron's Inferno, "discard N: …"
    // options) opens the cost picker first when the cost has not been paid yet.
    // The reaction tray pays its own costs, so it always passes costCardIds.
    if (action.type === "PLAY_CARD" && !action.costCardIds) {
      const card = cardLibrary[action.cardId];
      const option =
        card?.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
          ? card.effect.options[action.optionIndex]
          : undefined;
      const cost = option?.cost;
      if (cost && (cost.discardCards !== undefined || cost.discardCardsUpTo !== undefined)) {
        setPendingCostPlay({
          action,
          exact: cost.discardCards,
          upTo: cost.discardCardsUpTo,
          filter: cost.costCardFilter,
          picks: []
        });
        return;
      }
    }

    const connection = connectionRef.current;
    if (!connection) {
      return;
    }

    setSyncStatus("submitting");
    try {
      const payload = await connection.submitAction(action);
      // A successful action can still carry a player-facing notice: e.g. a Clone
      // cast that could not reach the chosen unit's grade is refunded (card +
      // Power returned) rather than wasted, and says so. Surface those alongside
      // any rules errors so the player sees why nothing changed.
      const refundNotices = payload.result.events
        .filter(
          (event): event is Extract<GameEvent, { type: "SPELL_CAST_REFUNDED" }> =>
            event.type === "SPELL_CAST_REFUNDED"
        )
        .map((event) => event.reason);
      setErrors([...payload.result.errors.map((error) => error.message), ...refundNotices]);
      ingestSnapshot(payload.snapshot);
      setSyncStatus(`synced v${payload.snapshot.version}`);

      if (payload.result.errors.length === 0) {
        setSelectedCardAction(null);
        setHandMode(null);
        setHandDiscards([]);
        setTilePlacement(null);
      } else {
        // The server refused an action the local table thought was legal: the
        // local snapshot is stale (missed frames, server restart). Resync so
        // the next click works instead of staying frozen on old state.
        connection
          .fetchSnapshot()
          .then(ingestSnapshot)
          .catch(() => {
            /* the live stream keeps trying */
          });
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "The action could not be submitted."]);
      setSyncStatus("submit failed");
      // Network hiccup mid-submit: the action may or may not have landed.
      // Refetch the authoritative state either way.
      connection
        .fetchSnapshot()
        .then(ingestSnapshot)
        .catch(() => {
          /* the live stream keeps trying */
        });
    }
  };

  /** Toggle a hand card as payment for the pending discard-cost play. */
  const toggleCostPick = (index: number) => {
    setPendingCostPlay((current) => {
      if (!current) {
        return current;
      }
      const has = current.picks.includes(index);
      const max = current.exact ?? current.upTo ?? 0;
      if (!has && current.picks.length >= max) {
        return current;
      }
      return {
        ...current,
        picks: has ? current.picks.filter((value) => value !== index) : [...current.picks, index]
      };
    });
  };

  /** Pay the picked cards and submit the play that was waiting on its cost. */
  const confirmPendingCostPlay = (hand: string[]) => {
    setPendingCostPlay((current) => {
      if (current) {
        void submitAction({ ...current.action, costCardIds: current.picks.map((index) => hand[index]) });
      }
      return null;
    });
  };

  const resetRoom = async (mode: "adventure" | "combat-sandbox") => {
    const connection = connectionRef.current;
    if (!connection) {
      setErrors(["Not connected to the room yet — give it a second and try again."]);
      return;
    }

    // Step 1 — the network reset. This, and only this, decides whether the
    // reset failed: a thrown error here means the server never reset.
    let snapshot: GameRoomSnapshot;
    try {
      snapshot = await connection.resetRoom({ mode });
    } catch (resetError) {
      // The request may still have landed (a dropped response, an SSE frame
      // that beat the HTTP reply); pull the authoritative snapshot before
      // declaring failure so a flaky network doesn't strand the table.
      console.error("Reset request failed; trying to resync.", resetError);
      try {
        snapshot = await connection.fetchSnapshot();
      } catch (resyncError) {
        console.error("Resync after a failed reset also failed.", resyncError);
        setErrors(["Could not reset the room."]);
        return;
      }
    }

    // Step 2 — the reset reached the server. Applying it locally must never
    // masquerade as a reset failure: a presentation hiccup here is logged, not
    // surfaced as "could not reset", and never leaves the refs half-cleared.
    seenRollIdsRef.current = null;
    // A deliberate reset discards the saved game so a later recycle can't
    // "recover" it over the new room.
    clearCachedRoom(roomId);
    restoredForBootRef.current = null;
    if (snapshot.bootId) {
      seenBootIdRef.current = snapshot.bootId;
    }
    try {
      ingestServerState(snapshot.state);
    } catch (ingestError) {
      console.error("Applying the reset snapshot failed.", ingestError);
    }
    setRoomVersion(snapshot.version);
    setErrors([]);
    setSelectedCardAction(null);
    setHandMode(null);
    setHandDiscards([]);
    setCombatTab("battle");
    setDice({ current: null, queue: [] });
    setMapDice({ current: null, queue: [] });
    setMapNotice({ current: null, queue: [] });
    setFirstRoll(null);
    setNewDay({ current: null, queue: [] });
    setFeedItems([]);
    deferredStartDrawRef.current = null;
    pendingDiceFeedRef.current = { items: [], sounds: [] };
    setSyncStatus(`synced v${snapshot.version}`);
  };

  const joinRoom = () => {
    const nextRoomId = roomInput.trim() || "dev-room";
    if (nextRoomId === roomId) {
      return;
    }
    window.history.replaceState(null, "", `?room=${encodeURIComponent(nextRoomId)}`);
    setErrors([]);
    setSelectedCardAction(null);
    // Fresh room: drop the old snapshot so lower version numbers apply.
    setRoomVersion(0);
    setState(null);
    setFeedItems([]);
    setRoomId(nextRoomId);
  };

  const isSeated = Boolean(state && viewerPlayerId !== OBSERVER_SEAT && state.players[viewerPlayerId]);
  const playerView = useMemo(
    () => (state ? getPlayerView(state, isSeated ? viewerPlayerId : OBSERVER_SEAT) : null),
    [state, viewerPlayerId, isSeated]
  );
  const legalActions = useMemo(
    () => (state && isSeated ? getLegalActions(state, viewerPlayerId) : []),
    [viewerPlayerId, state, isSeated]
  );

  // Background-music scene, mirroring the three render branches below: the
  // map-setup lobby (menu theme), the adventure map (grass theme) and the
  // combat table (combat theme). Computed before the early return so the music
  // hook runs on every render (rules of hooks); a null state plays nothing.
  const musicScene: MusicScene | null = !state
    ? null
    : state.mode === "adventure" && Boolean(state.setupLobby) && state.phase === "setup"
      ? "menu"
      : // PvP pre-battle preparation happens on the map, so keep the map theme
        // playing until the fight actually begins (deployment).
        state.mode === "adventure" && (!state.combat || combatTab === "map" || Boolean(state.combat.prep))
        ? "map"
        : "combat";
  useBackgroundMusic(musicScene);

  if (!state || !playerView) {
    return (
      <main className="tableRoot loadingRoot">
        {/* The room id comes from the URL, which the server cannot see. */}
        <p className="observerNote" suppressHydrationWarning>
          Joining room “{roomId}”… {syncStatus}
        </p>
      </main>
    );
  }

  const selectedCardTargetCount = selectedCardAction
    ? legalActions.filter(
        (legal) =>
          (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
          legal.action.cardId === selectedCardAction.cardId &&
          legal.action.target?.type === "unit"
      ).length
    : 0;

  const trayActive = Boolean(state.reactionWindow && state.reactionWindow.priorityPlayerId === viewerPlayerId);
  const seatIds = state.turnOrder.filter((playerId) => playerId !== NEUTRAL_PLAYER_ID);
  const combatVisible = Boolean(state.combat);
  // PvP pre-battle preparation is done on the adventure map, not the battlefield.
  // Once the fight is decided (e.g. a Retreat straight out of prep) the result
  // belongs on the battle screen, so the forced-map override lifts.
  const inBattlePrep = Boolean(state.combat?.prep) && !state.combat?.outcome;
  const adventureMode = state.mode === "adventure";
  const inLobby = Boolean(state.setupLobby) && state.phase === "setup";

  const tableMenu = (
    <div className="tableMenu" aria-label="Table controls">
      <div className="menuRow seatSwitch">
        {seatIds.map((playerId) => (
          <button
            aria-pressed={viewerPlayerId === playerId}
            className={viewerPlayerId === playerId ? "selected" : ""}
            key={playerId}
            onClick={() => setViewerPlayerId(playerId)}
            title={`Sit as ${state.players[playerId]?.name ?? playerId}`}
            type="button"
          >
            <Eye aria-hidden="true" size={13} />
            <span>{state.players[playerId]?.name ?? playerId}</span>
          </button>
        ))}
        <button
          aria-pressed={viewerPlayerId === OBSERVER_SEAT}
          className={viewerPlayerId === OBSERVER_SEAT ? "selected" : ""}
          onClick={() => setViewerPlayerId(OBSERVER_SEAT)}
          title="Watch without a seat: hands stay hidden, every fight is visible"
          type="button"
        >
          <Eye aria-hidden="true" size={13} />
          <span>Observer</span>
        </button>
      </div>
      <div className="menuRow roomRow">
        <input aria-label="Room ID" onChange={(event) => setRoomInput(event.target.value)} suppressHydrationWarning value={roomInput} />
        <button onClick={joinRoom} title="Join room" type="button">
          <StepForward aria-hidden="true" size={13} />
        </button>
      </div>
      <div className="menuRow statusRow">
        <span suppressHydrationWarning>{roomId}</span>
        <small suppressHydrationWarning>
          v{roomVersion} · {syncStatus} · {state.phase}
        </small>
        <MusicToggle />
      </div>
      <div className="menuRow resetRow">
        <button onClick={() => resetRoom("adventure")} title="Start a new adventure (map setup first)" type="button">
          New adventure
        </button>
        <button onClick={() => resetRoom("combat-sandbox")} title="Open the combat sandbox" type="button">
          <Swords aria-hidden="true" size={12} />
        </button>
        <button
          onClick={() => window.open("/designer", "_blank")}
          title="Open the map designer: create and save maps to play on"
          type="button"
        >
          <MapIcon aria-hidden="true" size={12} /> Designer
        </button>
      </div>
    </div>
  );

  // The room server (PartyKit) reported a different engine signature than this
  // frontend: it is running older code and will silently reject newer actions
  // (the Moandor/Zydar/Hire-Secondary-Hero class of bug). Warn loudly.
  const serverStale = serverSignature !== null && serverSignature !== ENGINE_SIGNATURE;

  const errorBanner =
    serverStale || errors.length > 0 ? (
      <div className="errorBanner" aria-label="Rules errors">
        {serverStale ? (
          <span className="serverStaleWarning">
            ⚠ The room server is out of date — new content (extra heroes, Secondary Heroes…) will be rejected until
            it&apos;s redeployed. Run <code>npx partykit deploy</code> to update it.
            <small>
              {" "}
              (server {serverSignature}, app {ENGINE_SIGNATURE})
            </small>
          </span>
        ) : null}
        {errors.map((error) => (
          <span key={error}>{error}</span>
        ))}
      </div>
    ) : null;

  // ---- Map-setup lobby ------------------------------------------------------
  if (adventureMode && inLobby) {
    return (
      <CardZoomProvider>
        <main className="tableRoot adventureRoot setupPhase">
          <div className="tableTopRow">
            <div className="advHud">
              <div className="advHudCell">
                <strong>Map setup</strong>
                <small>pick factions &amp; heroes</small>
              </div>
            </div>
            {tableMenu}
          </div>
          {errorBanner}
          <SetupLobbyScreen
            onAction={submitAction}
            state={state}
            viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
          />
          <LogDrawer state={state} />
        </main>
      </CardZoomProvider>
    );
  }

  // ---- Adventure map screen -------------------------------------------------
  // Force the map in front during pre-battle prep so both sides plan with their
  // towns and resources in view, not on the empty battlefield.
  const showMapScreen = adventureMode && (!combatVisible || combatTab === "map" || inBattlePrep);

  if (showMapScreen) {
    const viewer = isSeated ? state.players[viewerPlayerId] : null;
    const handCards = isSeated ? (playerView.players[viewerPlayerId]?.hand ?? []) : [];
    // Spell Book (house rule): the seated player's stored Spells (owner-private).
    const spellBookCards = isSeated ? (playerView.players[viewerPlayerId]?.spellBook ?? []) : [];
    // The panel is shown from the very start of the game (even empty) whenever
    // the house rule is on, so a player always knows the Book exists and can open
    // it to see whether it holds any Spells.
    const spellBookOn = isSeated && (state.adventure?.spellBook ?? true);
    const handLimit = viewer ? effectiveHandLimit(state, viewerPlayerId) : 0;
    // Over the hand limit at the start of the turn (only via card effects):
    // the player MUST discard down to the limit before acting.
    const forcedDiscard = Boolean(viewer?.needsHandRefresh) && state.activePlayerId === viewerPlayerId;
    // The optional start-of-turn draw is available this turn (every turn,
    // including the first): one either/or — "draw new" (discard nothing, draw
    // up to the limit) or "discard and draw new". Never both, since the hand is
    // not auto-drawn. It does not block playing or moving.
    const canDraw =
      Boolean(viewer?.canMulligan) && state.activePlayerId === viewerPlayerId && !forcedDiscard;
    const hasMorale = (viewer?.morale ?? 0) > 0;
    const moraleOverflow = viewer?.moraleOverflow ?? 0;
    const overLimit = viewer ? handCards.length - handDiscards.length - handLimit : 0;
    const selecting = handMode !== null || forcedDiscard;
    const mapReadOnly = combatVisible;

    const confirmHandAction = () => {
      const discardCardIds = handDiscards.map((index) => handCards[index]);
      if (handMode === "morale-redraw") {
        void submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "redraw", discardCardIds });
        return;
      }
      void submitAction({ type: "REFRESH_HAND", playerId: viewerPlayerId, discardCardIds });
    };

    // Card plays available from the hand right now (Estates, Luck, Scouting,
    // Eagle Eye, Town Portal, artifact map sides…), grouped per hand card. Map
    // casts FROM the Spell Book (fromSpellBook) are kept in a SEPARATE map keyed
    // by the Book Spell's id, so a Spell present in both hand and Book is never
    // offered on the wrong card (the hand shows hand plays; the Book panel shows
    // Book casts).
    type PlayLegal = LegalAction & { action: Extract<GameAction, { type: "PLAY_CARD" }> };
    const playActionsByCard = new Map<string, PlayLegal[]>();
    const bookPlayActionsByCard = new Map<string, PlayLegal[]>();
    for (const legal of legalActions) {
      if (legal.action.type !== "PLAY_CARD") {
        continue;
      }
      const target = legal.action.fromSpellBook ? bookPlayActionsByCard : playActionsByCard;
      const list = target.get(legal.action.cardId) ?? [];
      list.push(legal as PlayLegal);
      target.set(legal.action.cardId, list);
    }

    // Spell Book (house rule): "Move <Spell> to your Spell Book" offers, keyed by
    // the hand card they stash. Surfaced as a button on the hand card's menu.
    const stashActionByCard = new Map<string, Extract<GameAction, { type: "MOVE_SPELL_TO_SPELL_BOOK" }>>();
    for (const legal of legalActions) {
      if (legal.action.type === "MOVE_SPELL_TO_SPELL_BOOK") {
        stashActionByCard.set(legal.action.cardId, legal.action);
      }
    }

    const optionCostOf = (action: Extract<GameAction, { type: "PLAY_CARD" }>) => {
      const card = cardLibrary[action.cardId];
      if (card?.effect.type !== "CHOOSE_ONE" || action.optionIndex === undefined) {
        return undefined;
      }
      return card.effect.options[action.optionIndex]?.cost;
    };

    const startPlay = (legal: LegalAction & { action: Extract<GameAction, { type: "PLAY_CARD" }> }) => {
      const cost = optionCostOf(legal.action);
      if (cost && (cost.discardCards !== undefined || cost.discardCardsUpTo !== undefined)) {
        setPendingCostPlay({
          action: legal.action,
          exact: cost.discardCards,
          upTo: cost.discardCardsUpTo,
          filter: cost.costCardFilter,
          picks: []
        });
        setOpenHandIndex(null);
        return;
      }
      setOpenHandIndex(null);
      void submitAction(legal.action);
    };

    const confirmCostPlay = () => {
      if (!pendingCostPlay) {
        return;
      }
      void submitAction({
        ...pendingCostPlay.action,
        costCardIds: pendingCostPlay.picks.map((index) => handCards[index])
      });
      setPendingCostPlay(null);
    };

    return (
      <CardZoomProvider>
        <main className="tableRoot adventureRoot">
          <div className="tableTopRow">
            <AdventureHud
              legalActions={legalActions}
              onAction={submitAction}
              state={state}
              viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]}
            />
            {tableMenu}
          </div>

          {errorBanner}

          {inBattlePrep ? (
            <PreBattlePanel
              legalActions={legalActions}
              onAction={submitAction}
              state={state}
              viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
            />
          ) : combatVisible ? (
            <div className="combatContextBanner">
              <Swords aria-hidden="true" size={14} />
              <span>A combat is being fought on this map.</span>
              <button className="commandButton" onClick={() => setCombatTab("battle")} type="button">
                <Swords aria-hidden="true" size={12} /> Return to the battle
              </button>
            </div>
          ) : null}

          <div className="adventureMidRow">
            <div className="leftRail">
              <AdventureDecksPanel
                onAction={submitAction}
                onShowPile={(title, cardIds, kind) => setPile({ title, cardIds, kind })}
                scoutableDeckIds={
                  new Set(
                    legalActions.flatMap((legal) =>
                      legal.action.type === "ROGUES_SCOUT_DECK" ? [legal.action.deckId] : []
                    )
                  )
                }
                view={playerView}
                viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]}
              />
            </div>
            <div className="mapColumn">
              <HexMapBoard
                legalActions={legalActions}
                moveCue={moveCue}
                onAction={submitAction}
                placement={tilePlacement}
                readOnly={mapReadOnly || !isSeated}
                state={state}
                view={playerView}
                viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
              />
              {isSeated && !mapReadOnly ? (
                <FarTileTray
                  onTogglePlacement={setTilePlacement}
                  placement={tilePlacement}
                  state={state}
                  view={playerView}
                  viewerPlayerId={viewerPlayerId}
                />
              ) : null}
            </div>
            <div className="rightRail adventureRail">
              {isSeated ? (
                <>
                  <HeroBoard playerId={viewerPlayerId} state={state} />
                  <PermanentSlot
                    legalActions={legalActions}
                    onAction={submitAction}
                    playerId={viewerPlayerId}
                    state={state}
                    viewerPlayerId={viewerPlayerId}
                  />
                  <TownPanel
                    legalActions={legalActions}
                    onAction={submitAction}
                    state={state}
                    viewerPlayerId={viewerPlayerId}
                  />
                  <ArmyPanel playerId={viewerPlayerId} state={state} />
                </>
              ) : (
                seatIds.map((playerId) => (
                  <div key={playerId}>
                    <HeroBoard playerId={playerId} state={state} />
                    <PermanentSlot playerId={playerId} state={state} />
                    <ArmyPanel playerId={playerId} state={state} />
                  </div>
                ))
              )}
            </div>
          </div>

          {isSeated ? (
            <div className={`adventureHand ${selecting ? "refreshing" : ""}`} aria-label="Your hand">
              <AdventureOwnDeck
                onShowPile={(title, cardIds, kind) => setPile({ title, cardIds, kind })}
                view={playerView}
                viewerPlayerId={viewerPlayerId}
              />
              {spellBookOn ? (
                <div className={`spellBookPanel ${spellBookCards.length === 0 ? "empty" : ""}`}>
                  <button
                    aria-expanded={spellBookOpen}
                    className={`spellBookToggle ${spellBookOpen ? "open" : ""}`}
                    onClick={() => setSpellBookOpen((value) => !value)}
                    title={
                      spellBookCards.length === 0
                        ? "Your Spell Book is empty — stash a hand Spell with its 📖 button to store it here"
                        : "Your Spell Book — stored Spells you can cast (normal Spell limit applies)"
                    }
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- small pixelated game icon, not a content image */}
                    <img alt="" aria-hidden="true" className="spellBookIcon" src={assetUrl("/assets/ui/spell-book-button.png")} />
                    <span className="spellBookCount">{spellBookCards.length}</span>
                    <small>Spell Book</small>
                  </button>
                  {spellBookOpen ? (
                    <div className="spellBookWindow" role="menu" aria-label="Spell Book">
                      <strong>Spell Book</strong>
                      {spellBookCards.length === 0 ? (
                        <>
                          <small>Your Spell Book is empty.</small>
                          <small className="spellBookHint">
                            Stash a hand Spell here with the 📖 button on its card to free a hand slot (Magic Arrow
                            cannot be stored).
                          </small>
                        </>
                      ) : (
                        <small>Cast a stored Spell, or stash a hand Spell here with the 📖 button on its card.</small>
                      )}
                      {spellBookCards.map((spellId, bookIndex) => {
                        const casts = bookPlayActionsByCard.get(spellId) ?? [];
                        return (
                          <div className="spellBookSpell" key={`${spellId}-${bookIndex}`}>
                            <span className="spellBookSpellName">{cardName(spellId)}</span>
                            <div className="spellBookSpellActions">
                              {casts.map((legal) => (
                                <button
                                  className="commandButton"
                                  key={actionKey(legal.action)}
                                  onClick={() => {
                                    startPlay(legal);
                                    setSpellBookOpen(false);
                                  }}
                                  type="button"
                                >
                                  {legal.label}
                                </button>
                              ))}
                              {casts.length === 0 ? (
                                <small className="spellBookHint">Castable in combat — or as a Map Spell on your turn.</small>
                              ) : null}
                              <AdventureHandZoom cardId={spellId} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="handTopBar">
                <small>
                  Hand {handCards.length}/{handLimit}
                </small>
                {forcedDiscard ? (
                  <span className="handWarning">
                    Over the hand limit: discard down to {handLimit}.{overLimit > 0 ? ` Pick ${overLimit} more.` : ""}
                  </span>
                ) : null}
                {/* The start-of-turn draw: one either/or — draw new, OR discard
                    and draw new. Available every turn (including the first), but
                    optional, so playing and moving are still possible. */}
                {!forcedDiscard && handMode === null ? (
                  <div className="handButtons">
                    {canDraw ? (
                      <>
                        <span className="handHint">Start of turn:</span>
                        <button
                          className="commandButton primary"
                          onClick={() =>
                            submitAction({ type: "REFRESH_HAND", playerId: viewerPlayerId, discardCardIds: [] })
                          }
                          type="button"
                        >
                          Draw new (up to {handLimit})
                        </button>
                        {handCards.length > 0 ? (
                          <button className="commandButton" onClick={() => setHandMode("mulligan")} type="button">
                            Discard and draw new
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {hasMorale ? (
                      <>
                        <button
                          className="commandButton"
                          onClick={() => submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "draw" })}
                          type="button"
                        >
                          Morale: draw 1
                        </button>
                        {handCards.length > 0 ? (
                          <button className="commandButton" onClick={() => setHandMode("morale-redraw")} type="button">
                            Morale: redraw cards
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
                {selecting ? (
                  <div className="handButtons">
                    <span>
                      {handMode === "morale-redraw"
                        ? `Spend morale: discard ${handDiscards.length || "some"} and draw that many.`
                        : forcedDiscard
                          ? `Discard at least ${Math.max(0, handCards.length - handLimit)}, then draw up to ${handLimit}.`
                          : `Discard ${handDiscards.length} card${handDiscards.length === 1 ? "" : "s"}, then draw up to ${handLimit}.`}
                    </span>
                    <button
                      className="commandButton primary"
                      disabled={
                        handMode === "morale-redraw" ? handDiscards.length === 0 : forcedDiscard ? overLimit > 0 : false
                      }
                      onClick={confirmHandAction}
                      type="button"
                    >
                      {handMode === "morale-redraw"
                        ? `Redraw ${handDiscards.length}`
                        : `Discard ${handDiscards.length} & draw`}
                    </button>
                    {!forcedDiscard ? (
                      <button
                        className="commandButton ghost"
                        onClick={() => {
                          setHandMode(null);
                          setHandDiscards([]);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {pendingCostPlay ? (
                <div className="handButtons costPicker" aria-label="Pay the card cost">
                  <span>
                    {cardName(pendingCostPlay.action.cardId)}:{" "}
                    {pendingCostPlay.exact !== undefined
                      ? `pick exactly ${pendingCostPlay.exact} card${pendingCostPlay.exact === 1 ? "" : "s"} to discard`
                      : `pick up to ${pendingCostPlay.upTo} card${(pendingCostPlay.upTo ?? 0) === 1 ? "" : "s"} to discard`}
                    {pendingCostPlay.filter === "spell"
                      ? " (Spell cards only)"
                      : pendingCostPlay.filter === "power-source"
                        ? " (Power statistics or Spells)"
                        : ""}{" "}
                    — {pendingCostPlay.picks.length} picked
                  </span>
                  <button
                    className="commandButton primary"
                    disabled={pendingCostPlay.exact !== undefined && pendingCostPlay.picks.length !== pendingCostPlay.exact}
                    onClick={confirmCostPlay}
                    type="button"
                  >
                    Pay &amp; play
                  </button>
                  <button className="commandButton ghost" onClick={() => setPendingCostPlay(null)} type="button">
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="adventureHandCards" data-fx-anchor={`hand:${viewerPlayerId}`}>
                {handCards.length === 0 ? <small className="emptyHand">No cards in hand.</small> : null}
                {handCards.map((cardId, index) => {
                  const plays = playActionsByCard.get(cardId) ?? [];
                  // Spell Book (house rule): a Spell can be stashed into the Book.
                  const stashAction = stashActionByCard.get(cardId);
                  // A Spell with no map play is still actionable when it can be
                  // stashed — clicking opens the menu instead of marking a discard.
                  const actionable = plays.length > 0 || Boolean(stashAction);
                  const isPayingSource = pendingCostPlay !== null;
                  const pickedForCost = Boolean(pendingCostPlay?.picks.includes(index));
                  const eligibleForCost =
                    isPayingSource &&
                    handCards[index] !== undefined &&
                    index !== handCards.indexOf(pendingCostPlay!.action.cardId) &&
                    costCardEligible(cardId, pendingCostPlay!.filter);

                  return (
                    <div
                      className={`adventureHandSlot ${index >= handCards.length - hiddenHandTail ? "incoming" : ""}`}
                      key={`${cardId}-${index}`}
                    >
                      <button
                        className={`adventureHandCard ${handDiscards.includes(index) ? "discarding" : ""} ${
                          pickedForCost ? "discarding" : ""
                        } ${!selecting && !isPayingSource && actionable ? "playable" : ""}`}
                        onClick={() => {
                          // Paying a card cost: clicks toggle the payment.
                          if (isPayingSource) {
                            if (!eligibleForCost) {
                              return;
                            }
                            setPendingCostPlay((current) => {
                              if (!current) {
                                return current;
                              }
                              const has = current.picks.includes(index);
                              const max = current.exact ?? current.upTo ?? 0;
                              if (!has && current.picks.length >= max) {
                                return current;
                              }
                              return {
                                ...current,
                                picks: has ? current.picks.filter((value) => value !== index) : [...current.picks, index]
                              };
                            });
                            return;
                          }
                          // During the start-of-turn draw window, clicking a
                          // card that has no play marks it for the discard pile —
                          // the confirm button then discards them all and draws
                          // back up to the hand limit in one go. A stashable Spell
                          // is actionable, so it opens its menu instead.
                          if (!selecting && canDraw && plays.length === 0 && !stashAction) {
                            setHandMode("mulligan");
                            setHandDiscards([index]);
                            return;
                          }
                          if (selecting) {
                            setHandDiscards((current) =>
                              current.includes(index)
                                ? current.filter((value) => value !== index)
                                : [...current, index]
                            );
                            return;
                          }
                          // Otherwise: open the play menu for this card (plays
                          // and/or the Spell Book stash).
                          if (actionable) {
                            setOpenHandIndex((current) => (current === index ? null : index));
                          }
                        }}
                        title={
                          selecting
                            ? `Toggle discard ${cardName(cardId)}`
                            : isPayingSource
                              ? eligibleForCost
                                ? `Toggle ${cardName(cardId)} as payment`
                                : cardName(cardId)
                              : plays.length > 0
                                ? `Play ${cardName(cardId)}`
                                : stashAction
                                  ? `Move ${cardName(cardId)} to your Spell Book`
                                  : canDraw
                                    ? `Click to mark ${cardName(cardId)} to discard, then draw`
                                    : cardName(cardId)
                        }
                        type="button"
                      >
                        <CardFrame cardId={cardId} className="handCardImage" />
                      </button>
                      {openHandIndex === index && !selecting && !isPayingSource && actionable ? (
                        <div className="handPlayMenu" role="menu" aria-label={`${cardName(cardId)} plays`}>
                          <strong>{cardName(cardId)}</strong>
                          {rulesetCardNote(getRuleset(state), cardId) ? (
                            <small className="rulesetNote">{rulesetCardNote(getRuleset(state), cardId)}</small>
                          ) : null}
                          {plays.map((legal) => (
                            <button key={actionKey(legal.action)} onClick={() => startPlay(legal)} type="button">
                              {legal.label}
                            </button>
                          ))}
                          {stashAction ? (
                            <button
                              className="spellBookStash"
                              onClick={() => {
                                submitAction(stashAction);
                                setOpenHandIndex(null);
                              }}
                              title="Set this Spell aside in your Spell Book, freeing a hand slot (no new card drawn)"
                              type="button"
                            >
                              📖 Move to Spell Book
                            </button>
                          ) : null}
                          {(() => {
                            // The card has an expert side, but no expert play is
                            // offered AND the player has no crowns left this
                            // combat round — show the option locked, not hidden,
                            // so it is clear why expert cannot be chosen.
                            if (!state.combat) {
                              return null;
                            }
                            const viewer = state.players[viewerPlayerId];
                            const crownsLeft = viewer
                              ? viewer.limits.expertUses +
                                (viewer.combatStats.expertUseBonusThisRound ?? 0) -
                                viewer.combatStats.expertUsesSpentThisRound
                              : 0;
                            const effect = getEffectiveCardEffect(cardLibrary[cardId], undefined);
                            const hasExpertSide = effect ? effectHasExpertMode(effect) : false;
                            const expertOffered = plays.some(
                              (legal) => (legal.action as { mode?: string }).mode === "expert"
                            );
                            if (!hasExpertSide || expertOffered || crownsLeft > 0) {
                              return null;
                            }
                            return (
                              <button
                                aria-disabled="true"
                                className="expertLocked"
                                disabled
                                title="No expert-effect crowns left this combat round."
                                type="button"
                              >
                                🔒 Expert — no crowns left
                              </button>
                            );
                          })()}
                          <button className="ghost" onClick={() => setOpenHandIndex(null)} type="button">
                            Close
                          </button>
                        </div>
                      ) : null}
                      <AdventureHandZoom cardId={cardId} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <AdventureEventFeed
            items={feedItems}
            onDismiss={(id) => setFeedItems((current) => current.filter((item) => item.id !== id))}
          />
          {isSeated ? (
            <MarketPanel
              legalActions={legalActions}
              onAction={submitAction}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
          <PromptTray legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
          <LearningOfferModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
          <SearchModal onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
          <LogDrawer state={state} />
          {isSeated && handMode === null && !forcedDiscard ? (
            <MoraleOverflowPrompt
              canRedraw={handCards.length > 0}
              count={moraleOverflow}
              onDraw={() => submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "draw" })}
              onRedraw={() => setHandMode("morale-redraw")}
            />
          ) : null}
          {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
          {drawCue && !firstRoll ? <DrawOverlay cue={drawCue} key={drawCue.id} onDone={() => setDrawCue(null)} /> : null}
          {mapNotice.current && !mapDice.current ? (
            <MapNoticeOverlay cue={mapNotice.current} key={mapNotice.current.id} onDone={dismissMapNotice} />
          ) : null}
          {mapDice.current ? (
            <MapDiceOverlay cue={mapDice.current} key={mapDice.current.id} onDone={dismissMapDice} />
          ) : null}
          {firstRoll ? (
            <FirstPlayerRollOverlay cue={firstRoll} key={firstRoll.id} onDone={dismissFirstRoll} />
          ) : null}
          {!firstRoll && newDay.current ? (
            <NewDayOverlay cue={newDay.current} key={newDay.current.id} onDone={dismissNewDay} />
          ) : null}
          {!firstRoll && !newDay.current && astrologerCue ? (
            <AstrologersProclamationOverlay
              cue={astrologerCue}
              key={astrologerCue.id}
              onDone={() => setAstrologerCue(null)}
            />
          ) : null}
          <FxStage cues={fxCues} onDone={handleFxDone} />
        </main>
      </CardZoomProvider>
    );
  }

  // ---- Combat table (sandbox games and adventure combats) ------------------
  return (
    <TableErrorBoundary
      resetKey={roomVersion}
      syncStatus={syncStatus}
      onReset={() => {
        connectionRef.current
          ?.fetchSnapshot()
          .then(ingestSnapshot)
          .catch(() => setSyncStatus("room sync failed"));
      }}
    >
    <CardZoomProvider>
    <main className="tableRoot">
      {/* All card logistics live up here: every opponent's hand/deck/discard and
          the viewer's own dock + permanents + playable hand. Card-flight
          animations land in this strip. Heroes stay on the right rail. */}
      <div className="tableTopRow">
        <div className="combatCardStrip">
          {isSeated ? <OpponentBar state={state} view={playerView} viewerPlayerId={viewerPlayerId} /> : null}
          {isSeated ? (
            <div className="tableSeatRow">
              <PlayerDock state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
              <PermanentSlot
                legalActions={legalActions}
                onAction={submitAction}
                playerId={viewerPlayerId}
                state={state}
                viewerPlayerId={viewerPlayerId}
              />
              <div className="handColumn">
                <button
                  className="commandButton ghost handBrowse"
                  onClick={() =>
                    setPile({
                      title: "Your hand",
                      cardIds: playerView.players[viewerPlayerId]?.hand ?? [],
                      kind: "cards"
                    })
                  }
                  title="Read every card in your hand at full size"
                  type="button"
                >
                  <Eye aria-hidden="true" size={13} /> View hand (
                  {playerView.players[viewerPlayerId]?.hand.length ?? 0})
                </button>
                <HandFan
                  hiddenTailCount={hiddenHandTail}
                  legalActions={legalActions}
                  onAction={submitAction}
                  onSelectCardAction={setSelectedCardAction}
                  selectedCardAction={selectedCardAction}
                  state={state}
                  trayActive={trayActive}
                  view={playerView}
                  viewerPlayerId={viewerPlayerId}
                />
                <CombatMoralePanel
                  hand={playerView.players[viewerPlayerId]?.hand ?? []}
                  legalActions={legalActions}
                  onAction={submitAction}
                  viewerPlayerId={viewerPlayerId}
                />
              </div>
            </div>
          ) : (
            <div className="observerNote">Observer mode: hands stay hidden, the fight is live.</div>
          )}
        </div>
        {tableMenu}
      </div>

      {errorBanner}

      {isSeated && handMode === null ? (
        <MoraleOverflowPrompt
          canRedraw={(playerView.players[viewerPlayerId]?.hand?.length ?? 0) > 0}
          count={state.players[viewerPlayerId]?.moraleOverflow ?? 0}
          onDraw={() => submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "draw" })}
          onRedraw={() => {
            // The selective discard-and-draw picker lives on the map view; flip
            // to it so the player can pick which cards to cycle.
            setCombatTab("map");
            setHandMode("morale-redraw");
          }}
        />
      ) : null}

      {adventureMode && state.combat ? (
        <div className="combatContextBanner">
          <Swords aria-hidden="true" size={14} />
          <span>
            {state.combat.context.kind === "neutral"
              ? `${state.players[state.combat.attackerPlayerId]?.name} fights neutral guards (level ${state.combat.context.kind === "neutral" ? state.combat.context.difficulty : ""}) — anyone may watch`
              : state.combat.context.kind === "player"
                ? `${state.players[state.combat.attackerPlayerId]?.name} attacks ${state.players[state.combat.defenderPlayerId]?.name} — anyone may watch`
                : "Combat sandbox"}
          </span>
          <button className="commandButton" onClick={() => setCombatTab("map")} type="button">
            <MapIcon aria-hidden="true" size={12} /> View the adventure map
          </button>
        </div>
      ) : null}

      {selectedCardAction ? (
        <div className="targetBanner" aria-label="Selected card target">
          <Crosshair aria-hidden="true" size={15} />
          <strong>{cardName(selectedCardAction.cardId)}</strong>
          <span>{selectedCardTargetCount > 0 ? "Click a glowing unit on the board" : "No legal board target"}</span>
          <button onClick={() => setSelectedCardAction(null)} type="button">
            Cancel
          </button>
        </div>
      ) : null}

      {pendingCostPlay ? (
        <CostPlayBar
          hand={state.players[isSeated ? viewerPlayerId : seatIds[0]]?.hand ?? []}
          onCancel={() => setPendingCostPlay(null)}
          onConfirm={confirmPendingCostPlay}
          onPick={toggleCostPick}
          pending={pendingCostPlay}
        />
      ) : null}

      <div className={`tableMidRow ${state.combat?.setup && isSeated ? "withPlacement" : ""}`}>
        <div className="boardColumn">
          <InitiativeRail state={state} />
          <BattlefieldBoard
            damageDisplay={combatDamageDisplay}
            flippedUnitIds={flippedUnitIds}
            legalActions={legalActions}
            onAction={submitAction}
            onInspect={setInspectedUnitId}
            selectedCardAction={selectedCardAction}
            state={state}
            tintedUnits={tintedUnits}
            viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
          />
          {/* Active table effects used to sit in a left rail; with that gone they
              ride under the board (the rail renders nothing when there are none). */}
          <EffectsRail legalActions={legalActions} onAction={submitAction} state={state} />
        </div>
        {state.combat?.setup && isSeated ? (
          <div className="placementColumn">
            <PlacementPanel
              legalActions={legalActions}
              onAction={submitAction}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          </div>
        ) : null}
        <div className="rightRail">
          {!adventureMode
            ? // Battle simulator: both level 5 hero boards stay on the table.
              seatIds.map((playerId) => <HeroBoard key={playerId} playerId={playerId} state={state} />)
            : null}
          <InspectPanel state={state} unitId={inspectedUnitId} />
          {isSeated ? (
            <CommandDock
              legalActions={legalActions}
              onAction={submitAction}
              onReset={() => resetRoom(adventureMode ? "adventure" : "combat-sandbox")}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
        </div>
      </div>

      <LogDrawer state={state} />

      <AdventureEventFeed
        items={feedItems}
        onDismiss={(id) => setFeedItems((current) => current.filter((item) => item.id !== id))}
      />
      <PromptTray legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      <LearningOfferModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      {/* Hold the instant window back until the attack-die animation has fully
          played out, so a post-roll reaction prompt (e.g. a lethal-save window
          in a neutral fight) never pops over the rolling dice. */}
      {!dice.current ? (
        <ReactionTray
          key={`${state.reactionWindow?.id ?? "none"}:${state.reactionWindow?.priorityPlayerId ?? ""}`}
          legalActions={legalActions}
          onAction={submitAction}
          onViewHand={
            isSeated
              ? () =>
                  setPile({
                    title: "Your hand",
                    cardIds: playerView.players[viewerPlayerId]?.hand ?? [],
                    kind: "cards"
                  })
              : undefined
          }
          state={state}
          view={playerView}
          viewerPlayerId={viewerPlayerId}
        />
      ) : null}
      {/* Hold the victory/defeat notice until the killing blow's dice + strike
          + death have played out, so the battle never "ends" before the roll
          that ended it. (Retreat/surrender carry no roll, so it shows at once.) */}
      {!combatPresenting ? (
        <CombatResultModal
          key={`result-${state.combat?.id ?? "none"}`}
          legalActions={legalActions}
          onAction={submitAction}
          onReset={() => resetRoom(adventureMode ? "adventure" : "combat-sandbox")}
          state={state}
          viewerPlayerId={viewerPlayerId}
        />
      ) : null}
      {/* Keep the next guard's "react?" preview (and its auto-resume countdown)
          off screen while the current action is still playing — both the
          attack dice (dice.current) and the strike animation that follows them
          (combatPresenting). The component mounts fresh only once both have
          cleared, so the next neutral move is queued a clean ~2s after the
          previous strike finishes rather than over the top of it. */}
      {!dice.current && !combatPresenting ? (
        <NeutralStepOverlay
          legalActions={legalActions}
          onAction={submitAction}
          state={state}
          viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
        />
      ) : null}
      <SearchModal onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
      <RerollModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
      {drawCue && !dice.current && !firstRoll ? (
        <DrawOverlay cue={drawCue} key={drawCue.id} onDone={() => setDrawCue(null)} />
      ) : null}
      {dice.current ? <DiceOverlay cue={dice.current} key={dice.current.id} onDone={dismissDice} /> : null}
      {!dice.current && mapNotice.current && !mapDice.current ? (
        <MapNoticeOverlay cue={mapNotice.current} key={mapNotice.current.id} onDone={dismissMapNotice} />
      ) : null}
      {!dice.current && mapDice.current ? (
        <MapDiceOverlay cue={mapDice.current} key={mapDice.current.id} onDone={dismissMapDice} />
      ) : null}
      {firstRoll ? (
        <FirstPlayerRollOverlay cue={firstRoll} key={firstRoll.id} onDone={dismissFirstRoll} />
      ) : null}
      {!firstRoll && newDay.current ? (
        <NewDayOverlay cue={newDay.current} key={newDay.current.id} onDone={dismissNewDay} />
      ) : null}
      {!firstRoll && !dice.current && !newDay.current && astrologerCue ? (
        <AstrologersProclamationOverlay
          cue={astrologerCue}
          key={astrologerCue.id}
          onDone={() => setAstrologerCue(null)}
        />
      ) : null}
      <FxStage cues={fxCues} onDone={handleFxDone} />
    </main>
    </CardZoomProvider>
    </TableErrorBoundary>
  );
}
