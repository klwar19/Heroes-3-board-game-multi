"use client";

import { Castle, CheckCircle2, Crosshair, Eye, Hand as HandIcon, Layers, Lock, Map as MapIcon, Maximize2, Menu as MenuIcon, Minimize2, StepForward, Swords } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  astrologersCardDefinitions,
  eventCardDefinitions,
  effectiveHandLimit,
  effectHasExpertMode,
  ENGINE_SIGNATURE,
  getEffectiveCardEffect,
  getActiveAstrologersCard,
  getLegalActions,
  getPermanentCardIds,
  getPlayerView,
  hasOpenAdventureTurn,
  healLegacyPlayerFields,
  combatHasHumanParticipant,
  isCastASpellCard,
  isCombatSandboxSetup,
  isComputerPlayer,
  roomDisplayName,
  computerDecisionOwner,
  isParallelActor,
  isResetVoteApproved,
  polishSpellBookEnabled,
  resetVoteRequired,
  rulesetCardNote,
  spellBookPowerAvailable,
  spellPowerValueOfCard,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameEvent,
  type GameMode,
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
import { maybeClaimFinishedMatch } from "@/lib/match-claim-client";
import { HeroBoard } from "@/components/hero-board";
import {
  CombatResultModal,
  DiceOverlay,
  DrawOverlay,
  FirstPlayerRollOverlay,
  MapDiceOverlay,
  MapNoticeOverlay,
  MoraleCardOverlay,
  NeutralStepOverlay,
  NewDayOverlay,
  AstrologersProclamationOverlay,
  EventDrawnOverlay,
  MapEventOverlay,
  AfkVotePanel,
  ResetVotePanel,
  ReactionTray,
  RerollModal,
  SearchModal,
  DeckSearchModeModal,
  ABILITY_DICE_READ_MS,
  DICE_PRESENT_MS,
  DICE_ROLL_MS,
  type DiceCue,
  type DrawCue,
  type FirstPlayerRollCue,
  type MapDiceCue,
  type MapNoticeCue,
  type NewDayCue,
  type AstrologersProclamationCue,
  type EventDrawnCue,
  type MapEventCue
} from "@/components/table/overlays";
import { MapSpellBoostModal } from "@/components/table/map-spell-boost-modal";
import { StoryOverlay, type StoryCue } from "@/components/table/story-overlay";
import { SinglePlayerSavePanel } from "@/components/single-player-save-panel";
import { takePendingSinglePlayerLoad } from "@/lib/single-player-saves";
import { campaignSceneToFire, campaignSetupActions } from "@/lib/campaign-triggers";
import { getCampaignChapter } from "@/data/story/campaigns";
import {
  getCampaignBinding,
  isCampaignIntroShown,
  isCampaignOutcomeShown,
  isCampaignSetupApplied,
  markCampaignIntroShown,
  markCampaignOutcomeShown,
  markCampaignSetupApplied,
  markChapterCompleted
} from "@/lib/campaign-progress";
import { CardZoomProvider, useCardZoom, ZoomButton } from "@/components/table/zoom";
import {
  buildMoraleCardCues,
  isMoraleCardEvent,
  type MoraleCardCue
} from "@/components/table/morale-card-cue";
import { buildTownCaptureCue, isEnemyTownCapture } from "@/components/table/town-capture-cue";
import { CombatMoralePanel } from "@/components/table/combat-morale-panel";
import { CombatSandboxSetupScreen } from "@/components/table/combat-sandbox-setup";
import { HelperCoachLobbyPrompt, HelperCoachStrip } from "@/components/table/helper-coach-ui";
import { PhoneTabBar, type PhoneTab } from "@/components/table/phone-tab-bar";
import { UiModePrompt, UiModeToggle } from "@/components/table/ui-mode-prompt";
import { useUiModePreference } from "@/lib/ui-mode-preference";
import { cardUnplayableReason } from "@/components/table/helper-coach";
import { useHelperCoachPreference } from "@/lib/helper-coach-preference";
import { healFreezeDisplayDamage } from "@/components/table/heal-display";
import {
  buildComputerMoveReplay,
  REPLAY_STEP_MS,
  useComputerMoveReplay,
  type ComputerMoveReplay,
} from "@/components/table/computer-move-replay";
import {
  buildComputerBattleReport,
  type ComputerBattleCue,
} from "@/components/table/computer-battle-report";
import { OpponentTurnOverlay } from "@/components/table/opponent-turn-overlay";
import { usePacedComputerAdvance } from "@/components/table/computer-auto-advance";
import { TableErrorBoundary } from "@/components/error-boundary";
import {
  ADVENTURE_FEED_CUES,
  AdventureDecksPanel,
  AdventureEventFeed,
  AdventureHud,
  AdventureOwnDeck,
  ArmyPanel,
  TownHeroDock,
  FarTileTray,
  HexMapBoard,
  LearningOfferModal,
  LOCATION_GLYPHS,
  MarketPanel,
  MoraleCardsDock,
  PileModal,
  PlacementPanel,
  PreBattlePanel,
  PromptTray,
  SetupLobbyScreen,
  SpellBookModal,
  type AdventureFeedItem,
  type HeroMoveCue,
  type TilePlacementSelection
} from "@/components/adventure/screen";
import { SetupAmbientFx } from "@/components/adventure/setup-ambient";
import { HeroActionsDock } from "@/components/adventure/hero-actions-dock";
import { AzureClawChill } from "@/components/adventure/azure-claw-chill";
import { OpponentInfoDock } from "@/components/adventure/opponent-info";
import { VictoryPointsDock, VictoryPointsScoringOverlay } from "@/components/adventure/victory-points-panel";
import { TownWindow } from "@/components/adventure/town-board";
import { isDemoTrayEnabled, seedDemoTrayCards } from "@/lib/demo-tray-seed";
import {
  moveIntoBattleWithTroopsToBuy,
  actionKey,
  cardName,
  costCardEligible,
  formatEvent,
  noticeRewardsFromEvents,
  reconnectRoundStartCues,
  titleCase,
  unitName,
  type CardBoardAction
} from "@/components/table/utils";
import {
  armedPaymentFor,
  boardCardDiscardCost,
  shouldAutoArmOnPick,
  type ArmedCardPayment
} from "@/components/table/discard-first";
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
  cardShotFxPlans,
  healFxPlans,
  spellFxPlans,
  spellPresentationMs,
  unitShotFxPlan,
  warMachineFxPlans,
  type SpellFxPlan
} from "@/data/fx";
import {
  orderFxEventsForPresentation,
  partitionCombatMoves,
  planActivationSpellPreamble,
  planApproachAttackPreDelays,
  planApproachMoveDelays,
  planHarpyReturnHolds,
  planMoveArrivalBeats,
  planReturnMoveDelays
} from "@/components/table/fx-sequence";
import {
  heroMoveSoundKey,
  locationVisitSoundCue,
  MAP_CUE_SOUNDS,
  MAP_CUE_VOLUME,
  MAP_MOVE_VOLUME,
  TILE_SOUNDS
} from "@/data/map-sounds";
import { COMBAT_EVENT_SOUNDS } from "@/data/combat-event-sounds";
import { commanderCastFxPlan, commanderSpecialtySound } from "@/data/commander-fx";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  playLibrarySound,
  playLibrarySoundThen,
  playSpellBookOpen,
  playTableUiClickSound,
  playUnitSound
} from "@/lib/sound";
import { commanderVoiceId, unitAttackFlourish } from "@/data/unit-sounds";
import { useBackgroundMusic, type MusicScene } from "@/lib/music";
import { MusicToggle } from "@/components/music-toggle";
import {
  connectRoom,
  createRoomOnServer,
  isResetDenied,
  requestAdminCloseRoom,
  requestCloseRoom,
  type ConnectionQualitySample,
  type GameRoomSnapshot,
  type RoomConnection,
  type SnapshotMeta
} from "@/lib/realtime";
import { ConnectionQualityChip, retainQualitySample } from "@/components/table/connection-quality";
import {
  beginPendingEcho,
  echoNow,
  initialPendingEchoState,
  pendingEchoCardIds,
  prunePendingEchoes,
  resolvePendingEcho,
  type PendingEchoState
} from "@/lib/pending-action-echo";
import { pollTickAllowed } from "@/lib/hidden-tab-poll";
import { clearCachedRoom, loadCachedRoom, saveCachedRoom } from "@/lib/room-cache";
import { getAccountIdentity, getClientId, getDisplayName, setDisplayName as persistDisplayName } from "@/lib/identity";
import { fetchSession, fetchSocketToken } from "@/lib/auth-client";
import {
  decideSnapshot,
  initialSnapshotArbiterState,
  type SnapshotArbiterState
} from "@/lib/room-snapshot-arbiter";
import { metricNow, observeBrowserResponsiveness, recordPerformanceMetric } from "@/lib/performance-metrics";
import { DEFAULT_MAX_PRESENTATION_MS, presentationWatchdogDelay } from "@/lib/presentation-watchdog";
import {
  initialPresentationEventCursor,
  presentationEventWindow,
  type PresentationEventCursor
} from "@/lib/presentation-event-window";
import { leavePresence, sendPresence } from "@/lib/lobby-presence-client";
import {
  takePendingRoomHosted,
  takePendingRoomMode,
  takePendingRoomName,
  takePendingRoomPassword,
  takePendingRoomRanked
} from "@/lib/pending-room-name";
import { RoomPanel } from "@/components/table/room-panel";
import { LoadingScreen } from "@/components/menu/loading-screen";
import { useRouter } from "next/navigation";
import { TableReactionsLayer } from "@/components/table/table-reactions";
import { ChatPanel } from "@/components/table/chat-panel";
import { InvitePopup } from "@/components/invite-popup";

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
  "FORTIFICATION_DESTROYED",
  // Bulwark: an army crossing a Rune-Level threshold rings the rune cue.
  "RUNE_LEVEL_REACHED"
]);

const MAX_PRESENTATION_MS = DEFAULT_MAX_PRESENTATION_MS;

/** Heals that need the unmistakable green-cross pulse in addition to a sprite. */
const FIRST_AID_GRAPHIC_CARD_IDS = new Set(["war_machine.first_aid_tent", "ability.first_aid"]);

/**
 * Safety net for the freshly-drawn-card "incoming" hide (visibility:hidden):
 * however a draw flight is presented, the hidden tail MUST clear within this
 * window. The longest legitimate draw flight is ~FLIGHT_MS + 5×DRAW_STAGGER_MS
 * (≈1.3s for a full 6-card hand), so this generous backstop never pre-empts a
 * real flight — it only catches the case where a per-snapshot reveal timer is
 * dropped (a snapshot race, a reconnect mid-flight, an interrupted ceremony),
 * which would otherwise leave the whole hand invisible across turns with no
 * game event to explain it.
 */
const HIDDEN_HAND_REVEAL_BACKSTOP_MS = 4000;

/**
 * "[activation]" abilities that resolve as a damage SPELL the unit casts BEFORE
 * it then moves/attacks in the same neutral pump — today only the Faerie
 * Dragon's Ice Bolt. Because the whole activation lands in one snapshot, the
 * cast/damage and the unit's glide arrive together; played back in log order the
 * dragon would slide before it ever casts. The FX builder presents these first
 * (a preamble) and shifts the move + dice past them, so the table reads
 * "cast → damage → move → attack". Keyed by the UNIT_ABILITY_TRIGGERED abilityId.
 */
const LEADING_ACTIVATION_SPELL_ABILITIES = new Set<string>(["faerie-dragon-spell"]);

const OBSERVER_SEAT = "observer";

/**
 * Phone UI mode: which full-screen panel each surface shows. Pure
 * presentation — the panels are the SAME regions the desktop lays out side by
 * side; `.phoneMode[data-phone-tab="…"]` CSS decides visibility. "battle" /
 * "map" are NOT phone tabs: those entries flip the existing `combatTab`
 * surface switch instead.
 */
/**
 * One feed audio cue: a plain library key, or a visit pair whose map-object
 * ambience is chained to start only after the one-shot sfx has ended.
 */
type FeedSoundCue = string | { sfx: string; ambient: string };

/** Dedupe identity for a feed sound cue (pairs keyed by both halves). */
function feedSoundCueKey(cue: FeedSoundCue): string {
  return typeof cue === "string" ? cue : `${cue.sfx}>${cue.ambient}`;
}

type PhoneMapTab = "map" | "hand" | "army" | "decks" | "menu";
type PhoneCombatTab = "board" | "hand" | "menu";

/** Magnifier for the adventure hand; lives inside the CardZoomProvider. */
function AdventureHandZoom({ cardId }: { cardId: string }) {
  const { zoomCard } = useCardZoom();
  return <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId)} />;
}

/** Pay a play's printed discard cost by toggling hand cards (combat plays). */
function CostPlayBar({
  pending,
  hand,
  bookCards = [],
  bookCardId,
  onPick,
  onBookPick,
  onConfirm,
  onCancel
}: {
  pending: {
    action: { cardId: string };
    exact?: number;
    upTo?: number;
    filter?: "spell" | "power-source";
    picks: number[];
    /** "Discard first" arming: confirming aims the card rather than playing it now. */
    armSelection?: unknown;
  };
  hand: string[];
  /** Polish Crown of Dragontooth may remove one refreshed or used Book Spell. */
  bookCards?: string[];
  bookCardId?: string;
  onPick: (index: number, hand: string[]) => void;
  onBookPick?: (cardId: string) => void;
  onConfirm: (hand: string[]) => void;
  onCancel: () => void;
}) {
  const playedIndex = hand.indexOf(pending.action.cardId);
  const arming = Boolean(pending.armSelection);
  const pickedCount = pending.picks.length + (bookCardId ? 1 : 0);
  const ready =
    pending.exact !== undefined ? pickedCount === pending.exact : pickedCount <= (pending.upTo ?? 0);
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
        — {pickedCount} picked
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
            onClick={() => onPick(index, hand)}
            type="button"
          >
            {cardName(cardId)}
          </button>
        );
      })}
      {[...new Set(bookCards)].map((cardId) => (
        <button
          className={bookCardId === cardId ? "selected" : ""}
          key={`book-cost-${cardId}`}
          onClick={() => onBookPick?.(cardId)}
          title="Remove this owned Spell from the Polish Spell Book"
          type="button"
        >
          📖 {cardName(cardId)}
        </button>
      ))}
      <button disabled={!ready} onClick={() => onConfirm(hand)} type="button">
        {arming ? "Discard, then aim" : "Pay & play"}
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
 * The room from the URL `?room=` param, or `null` when none is present — then
 * the app shows the multiplayer lobby (room browser) instead of dropping the
 * player straight into a fixed "dev-room". A shared `?room=` link still opens
 * that room directly.
 */
function getInitialRoomId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("room") || null;
}

/**
 * Art preloaded behind the join-room loading bar: the setup-lobby wallpaper
 * (the very next screen) and the map backdrop. Module-level so the manifest
 * is referentially stable across renders.
 */
const JOIN_ROOM_PRELOAD_SLOTS = ["menu-backdrop", "lobby-backdrop"] as const;

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
    // The defender's Defend die, the commander's Might dice and any morale/
    // artifact/spell adjustment that changed this roll all read out with it.
    ...(event.defendRoll !== undefined ? { defendRoll: event.defendRoll } : {}),
    ...(event.mightRolls?.length ? { mightRolls: event.mightRolls } : {}),
    ...(event.rollModifiers?.length ? { modifiers: event.rollModifiers } : {}),
    ...(preDelayMs > 0 ? { preDelayMs } : {})
  };
}

/**
 * An ability's own dice throw (Death Stare, the Thunderbird extra die, the
 * morale skip-activation check…): shown in the same overlay as an attack
 * roll, headed with the ability + roller and a short outcome read-out. All
 * its dice count (none dim) and the read is shorter — it follows an attack
 * that already had its full dice beat.
 */
function makeAbilityDiceCue(
  state: GameState,
  event: Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>,
  dice: NonNullable<Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>["dice"]>,
  preDelayMs = 0
): DiceCue {
  return {
    id: `${event.id}-dice`,
    rolls: dice.rolls,
    roll: dice.success ? 1 : 0,
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
    tone: dice.success ? "good" : "bad",
    title: `${dice.label} — ${unitName(state, event.unitId)}`,
    caption: dice.caption,
    readMs: ABILITY_DICE_READ_MS,
    // Morale curses / window rerolls that changed this roll read out as chips.
    ...(dice.modifiers?.length ? { modifiers: dice.modifiers } : {}),
    ...(preDelayMs > 0 ? { preDelayMs } : {})
  };
}

/**
 * The board-settle beat an ability's dice wait out when they follow attack
 * dice in the same snapshot: the strike lands (ATTACK_IMPACT_MS) and its
 * damage number reads before the follow-up cube is thrown.
 */
const ABILITY_DICE_AFTER_STRIKE_MS = ATTACK_IMPACT_MS + 450;

/** Deliberate single-player auto pace: visible, but without a click per AI beat. */
const COMPUTER_AUTO_RECAP_MS = 700;
const COMPUTER_AUTO_MATCH_STORAGE_KEY = "homm3bg.singlePlayerAutoMatch";

function storedComputerAutoMatchSeed(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(COMPUTER_AUTO_MATCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeComputerAutoMatchSeed(seed: string): void {
  try {
    window.sessionStorage.setItem(COMPUTER_AUTO_MATCH_STORAGE_KEY, seed);
  } catch {
    // Auto mode still works in-memory when session storage is unavailable.
  }
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
type HandMode = null | "mulligan" | "opening-mulligan" | "morale-redraw" | "cover-of-darkness";

export default function Home() {
  const [state, setState] = useState<GameState | null>(null);
  /** Match seed whose computer confirmations were skipped in this tab. */
  const [autoAdvanceMatchSeed, setAutoAdvanceMatchSeed] = useState<string | null>(
    storedComputerAutoMatchSeed,
  );
  /** Latest ingested state — used as `prev` for ladder dual-claim detection. */
  const stateRef = useRef<GameState | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<PlayerId>("p1");
  /** Stable per-browser identity for room membership (host/seat enforcement). */
  const clientId = useMemo(() => getClientId(), []);
  /**
   * The signed-in account id (null for guests / SSR). Seeded from the
   * localStorage cache for instant recognition, then refreshed from the
   * httpOnly session cookie via fetchSession — the cache alone is NOT enough:
   * a direct ?room= link or a missing localStorage entry used to freeze
   * accountUserId at null for the whole session, so the guest→verified upgrade
   * never ran and real accounts stayed labelled "guest". The server still
   * verifies the real session on every action; this id only identifies OUR
   * member row and triggers the one-shot re-JOIN upgrade.
   */
  const [accountUserId, setAccountUserId] = useState<string | null>(
    () => (typeof window !== "undefined" ? getAccountIdentity()?.userId ?? null : null)
  );
  /** The signed-in account's platform role (admins may delete any room). */
  const [accountRole, setAccountRole] = useState<"player" | "admin" | null>(
    () => (typeof window !== "undefined" ? getAccountIdentity()?.role ?? null : null)
  );
  // Browser-only state (persisted name, URL room) is read AFTER mount (see the
  // effect below), not in the useState initializers: the page is statically
  // prerendered (window/localStorage absent), so seeding from them here would
  // hydrate the lobby/empty-name markup into a mismatched tree. Start at the
  // SSR-safe defaults and populate on mount.
  const [displayName, setDisplayNameState] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  /** Current room id, or null while the player is in the lobby (room browser). */
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [roomVersion, setRoomVersion] = useState(0);
  // A name to apply once a freshly created room connects (the create flow on
  // /play seeds it server-side too, but PartyKit needs this client path; the
  // value crosses the /play→/?room= navigation via sessionStorage).
  const pendingRoomNameRef = useRef<{ roomId: string; name: string } | null>(null);
  // A Closed table chosen at /play: host this room once connected (creator → host).
  const pendingRoomHostedRef = useRef<string | null>(null);
  // A Battle Test chosen at /battle: switch this fresh room to combat-sandbox
  // once connected (PartyKit makes every room an adventure lobby first).
  const pendingRoomModeRef = useRef<{ roomId: string; mode: GameMode } | null>(null);
  // Ranked/Normal chosen at /play: apply the match type once connected (PartyKit
  // seeds nothing at creation, so the first client sets it).
  const pendingRoomRankedRef = useRef<{ roomId: string; ranked: boolean } | null>(null);
  // Password typed in the lobby Join dialog for a locked room.
  const pendingRoomPasswordRef = useRef<{ roomId: string; password: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState("connecting");
  // Latest transport round-trip sample (pong / action ack) for the RTT chip.
  // Presentation-only; retainQualitySample keeps the reference stable when the
  // displayed value would not change, so per-ack jitter never re-renders.
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQualitySample | null>(null);
  // Pending-action echo (plan N2): presentation-only in-flight entries, keyed
  // per submit. The REF is the source of truth (submitAction's duplicate latch
  // must read synchronously — two rapid clicks land before any re-render); the
  // state mirror only drives rendering (the hand panels' in-flight dim).
  const pendingEchoesRef = useRef<PendingEchoState>(initialPendingEchoState());
  const [pendingEchoView, setPendingEchoView] = useState<PendingEchoState>(initialPendingEchoState);
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
  /** On-screen next-step coach + card reasons (local browser preference). */
  const helperCoach = useHelperCoachPreference();
  /** Adventure hand: which card slot has its play menu open. */
  const [openHandIndex, setOpenHandIndex] = useState<number | null>(null);
  /** Spell Book (house rule): whether the map Spell Book window is open. */
  const [spellBookOpen, setSpellBookOpen] = useState(false);
  /**
   * Polish Spell Book: which Cast a Spell hand slot has its inline "List the
   * spells" shortcut expanded (the alternative to opening the full grimoire).
   */
  const [castListHandIndex, setCastListHandIndex] = useState<number | null>(null);
  /**
   * Adventure hand: an immediate (no-target, no-cost) play staged for an explicit
   * Confirm, so an accidental click is always cancellable. Nothing is sent to the
   * engine until Confirm, so this is multiplayer-safe (the action only leaves this
   * client on Confirm). Card plays that need a board target or a discard cost have
   * their own cancellable steps (target picking / the cost picker) and never arm
   * this one.
   */
  const [armedHandPlay, setArmedHandPlay] = useState<{
    action: Extract<GameAction, { type: "PLAY_CARD" }>;
    label: string;
  } | null>(null);
  /** A chosen play waiting for its discard/Power-cost payment (cost card picks). */
  const [pendingCostPlay, setPendingCostPlay] = useState<{
    action: Extract<GameAction, { type: "PLAY_CARD" }>;
    exact?: number;
    upTo?: number;
    /** Power-value cost (View Air / Dimension Door / Sorrow-style map tiers). */
    powerCost?: number;
    filter?: "spell" | "power-source";
    picks: number[];
    /**
     * Parallel to picks: "expert" values a Power statistic at expertAmount and
     * spends a crown (map Power tiers). Index-aligned with `picks`.
     */
    pickModes: ("basic" | "expert")[];
    /**
     * Spell Book (house rule): ONE Book Spell may help pay a Power cost (the
     * once-per-turn Book Power budget). Held by card id — a Book Spell has no
     * hand index. Map Spells like Fly count as +1 Power when stashed here.
     */
    bookCardId?: string;
    /**
     * "Discard first to use": when set, confirming the picker does NOT submit the
     * play — it banks the payment (see `armedCardPayment`) and arms this selection
     * for board targeting. The play only reaches the engine once a target is
     * clicked. Absent for the ordinary "target first, then pay" path.
     */
    armSelection?: CardBoardAction;
  } | null>(null);
  /**
   * "Discard first to use" (house rule): the discard a board-target card
   * (Frost Ring / Xyron's Inferno specialties) paid at SELECTION time, remembered
   * until its target is clicked and then re-attached to the play. Cleared when the
   * selection is cancelled or the play resolves.
   */
  const [armedCardPayment, setArmedCardPayment] = useState<ArmedCardPayment | null>(null);
  /**
   * A hero move (MOVE_HERO / MOVE_HERO_PATH) held at the pre-battle gate: it
   * walks into a Combat while the player can still buy troops, so we confirm
   * first ("keep moving, or stop and recruit?"). Stores the exact move to replay
   * on "keep moving".
   */
  const [pendingBattleTroopWarn, setPendingBattleTroopWarn] = useState<GameAction | null>(null);
  // Set true for the single submitAction call the battle-troop confirmation
  // replays, so the guard lets it through instead of re-opening the dialog.
  const battleTroopConfirmedRef = useRef(false);
  const [tilePlacement, setTilePlacement] = useState<TilePlacementSelection>(null);
  const [combatTab, setCombatTab] = useState<"battle" | "map">("battle");
  /**
   * Phone UI mode (per-browser preference, asked before the game begins).
   * `uiMode` stays "computer" until the player explicitly picks "phone", so an
   * unanswered prompt renders the classic desktop table untouched.
   */
  const uiModePref = useUiModePreference();
  const phoneUi = uiModePref.uiMode === "phone";
  /** Phone mode: the active full-screen panel per surface (local, never sent). */
  const [phoneMapTab, setPhoneMapTab] = useState<PhoneMapTab>("map");
  const [phoneCombatTab, setPhoneCombatTab] = useState<PhoneCombatTab>("board");
  const [tableControlsOpen, setTableControlsOpen] = useState(false);
  /**
   * Phone mode auto-switch: when the viewer OWES a tile rotation (the round-1
   * forced home-tile rotation, or a mid-round reveal/placement landing while they
   * sit on another tab) the rotate card lives on the map, so a non-map tab would
   * hide it entirely — the reported "map rotate on phone shows nothing". Snap to
   * the Map tab on the transition INTO the pending state, keyed on the pending
   * choice's identity so it fires once and never fights a later re-tab.
   */
  const owedTileRotationId =
    state?.adventure?.pendingTileChoice && state.adventure.pendingTileChoice.playerId === viewerPlayerId
      ? state.adventure.pendingTileChoice.tileInstanceId
      : null;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (phoneUi && owedTileRotationId) {
      setPhoneMapTab("map");
    }
  }, [phoneUi, owedTileRotationId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  /**
   * Phone mode auto-switch (combat surface): a fresh fight must open on the
   * Board tab. `phoneCombatTab` is component state that PERSISTS across fights,
   * so a player who ended the previous battle reading their Hand tab would open
   * the NEXT one still on Hand — the battlefield hidden, the reported "combat
   * shows nothing but my cards". Snap to Board on each new combat id.
   */
  const activeCombatId = state?.combat?.id ?? null;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (phoneUi && activeCombatId) {
      setPhoneCombatTab("board");
    }
  }, [phoneUi, activeCombatId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  /**
   * Phone mode auto-switch (combat surface): selecting a hand card that must be
   * aimed at a board target (Magic Arrow, Bloodlust, Inferno…) arms
   * `selectedCardAction` and then expects a tap on a GLOWING unit/space on the
   * battlefield. That board lives on the Board tab; a player who picked the card
   * from the Hand tab would see the "click a glowing unit" banner but no board —
   * the reported "many options when click, see nothing". Snap to the Board tab
   * on the transition into targeting, keyed on the armed selection's identity so
   * it fires once and never fights a later manual re-tab. (No fixed-overlay
   * fallback exists for a board target the way the PromptTray backs map-spell
   * choices, so the tab MUST move.)
   */
  const combatBoardTargetKey =
    phoneUi && selectedCardAction
      ? `${selectedCardAction.type}:${selectedCardAction.cardId}:${JSON.stringify(
          (selectedCardAction as { target?: unknown }).target ?? null,
        )}`
      : null;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (combatBoardTargetKey) {
      setPhoneCombatTab("board");
    }
  }, [combatBoardTargetKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  /** The Town window popup (board / buildings views) over the adventure map. */
  const [townOpen, setTownOpen] = useState(false);
  /** Desktop map: expand the crowded left command rail into a large window. */
  const [leftRailExpanded, setLeftRailExpanded] = useState(false);
  useEffect(() => {
    if (!leftRailExpanded) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // A window stacked ABOVE the panel (Town, hero info, opponent dossier,
      // VP standings, a pile, a card zoom, a fly-out board, a mod-system
      // window) owns the Escape — the SetupHubWindow rule: closing both at
      // once would throw the player back two levels.
      if (
        document.querySelector(
          ".townWindowBackdrop, .heroInfoBackdrop, .opponentInfoBackdrop, .vpStandingsBackdrop, .pileModalBackdrop, .zoomBackdrop, .heroDropBackdrop, .heroSystemBackdrop, .commanderEquipmentBackdrop, .commanderLevelUpBackdrop"
        )
      ) {
        return;
      }
      setLeftRailExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [leftRailExpanded]);
  const [pile, setPile] = useState<{ title: string; cardIds: string[]; kind: "cards" | "units" | "astrologers" | "events" } | null>(null);
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
  // Morale-card moments (draw / auto-strike / cancel / absorb): queued big-card
  // overlays with the H3 good/bad-morale sting, shown on map AND combat screens.
  const [moraleCue, setMoraleCue] = useState<{ current: MoraleCardCue | null; queue: MoraleCardCue[] }>({
    current: null,
    queue: []
  });
  const [astrologerCue, setAstrologerCue] = useState<AstrologersProclamationCue | null>(null);
  const [eventCue, setEventCue] = useState<EventDrawnCue | null>(null);
  const [mapEventCue, setMapEventCue] = useState<MapEventCue | null>(null);
  // Anime mod §11: a designer-triggered visual-novel scene, popped once per
  // STORY_SCENE_TRIGGERED event id (never replayed on reconnect). Same cue
  // semantics as the MapEventOverlay above.
  const [storyCue, setStoryCue] = useState<StoryCue | null>(null);
  // Campaign story mode (Anime mod §12): a single-player room launched from
  // /story carries a localStorage binding; the chapter's intro / victory /
  // defeat scenes pop through the SAME storyCue pipeline. A room with NO binding
  // (every normal table) is inert — campaignSceneToFire returns null.
  const campaignBinding = useMemo(() => (roomId ? getCampaignBinding(roomId) : null), [roomId]);
  const firedCampaignStartRef = useRef(false);
  const firedCampaignOutcomeRef = useRef(false);
  const appliedCampaignSetupRef = useRef(false);
  const [drawCue, setDrawCue] = useState<DrawCue | null>(null);
  const [moveCue, setMoveCue] = useState<HeroMoveCue | null>(null);
  // Single-player: a computer opponent's whole map turn settles at once, so its
  // hero walks are replayed for the human slowly, cell by cell, one hero at a
  // time. The pawns render at these override cells until the walk finishes.
  const computerReplay = useComputerMoveReplay();
  const autoAdvanceEnabled = Boolean(
    state?.sessionMode === "single-player" && autoAdvanceMatchSeed === state.seed,
  );
  const startComputerReplayRef = useRef(computerReplay.start);
  startComputerReplayRef.current = computerReplay.start;
  const cancelComputerReplayRef = useRef(computerReplay.cancel);
  cancelComputerReplayRef.current = computerReplay.cancel;
  const stepComputerReplayRef = useRef(computerReplay.stepNext);
  stepComputerReplayRef.current = computerReplay.stepNext;
  // Single-player: computers pace live (one action per broadcast). Battle recaps
  // still use this overlay; multi-hop catch-up batches can still queue a replay.
  const [opponentTurnSummary, setOpponentTurnSummary] = useState<{
    id: string;
    cues: ComputerBattleCue[];
    replay: ComputerMoveReplay | null;
  } | null>(null);
  const opponentSummaryCounterRef = useRef(0);
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
  const snapshotArbiterRef = useRef<SnapshotArbiterState>(initialSnapshotArbiterState());
  /** Tail cursor for exactly-once, incremental presentation event ingestion. */
  const presentationEventCursorRef = useRef<PresentationEventCursor>(initialPresentationEventCursor());
  /** Server boot we already tried to recover from (avoids restore loops). */
  const restoredForBootRef = useRef<string | null>(null);
  /** Stable handle to ingestSnapshot so the restore result can re-enter it. */
  const ingestSnapshotRef = useRef<(snapshot: GameRoomSnapshot, meta?: SnapshotMeta) => void>(() => {});
  /**
   * Room version whose seat-authoritative (own-seat-redacted) frame has already
   * been ingested — lets an equal-version HTTP/action frame upgrade the hosted
   * room's observer connect frame exactly once, without re-rendering on every
   * later poll of the same version.
   */
  /**
   * The live connection dropped since membership was last confirmed. The server
   * reaps an unseated member on disconnect, so the join effect re-joins when the
   * member is missing after a drop — while a kick over a LIVE socket never sets
   * this, so a kicked player still does not silently auto-rejoin.
   */
  const connectionDroppedRef = useRef(false);
  const seenMapDiceIdsRef = useRef<Set<string>>(new Set());
  const seenVisitIdsRef = useRef<Set<string>>(new Set());
  const seenFirstRollIdsRef = useRef<Set<string>>(new Set());
  const seenTurnIdsRef = useRef<Set<string>>(new Set());
  // Last round whose Astrologers proclamation this client already popped, so the
  // card resurfaces once per round (not on every action) and never on reconnect.
  const seenAstrologerRoundRef = useRef<number | null>(null);
  const seenAstrologerDrawIdsRef = useRef<Set<string>>(new Set());
  // Event draws (Fortress deck) already popped as the big EventDrawnOverlay —
  // one pop per draw, never replayed on reconnect.
  const seenEventDrawIdsRef = useRef<Set<string>>(new Set());
  // Designed-map timed events already popped as the MapEventOverlay —
  // one pop per firing, never replayed on reconnect.
  const seenMapEventIdsRef = useRef<Set<string>>(new Set());
  // Story scenes (Anime mod §11) already popped as the StoryOverlay —
  // one pop per firing, never replayed on reconnect (MapEventOverlay semantics).
  const seenStoryIdsRef = useRef<Set<string>>(new Set());
  // Parallel-turn stop warnings already popped (never replayed on reconnect).
  const seenParallelStopIdsRef = useRef<Set<string>>(new Set());
  const seenNeutralControlIdsRef = useRef<Set<string>>(new Set());
  const seenDrawIdsRef = useRef<Set<string>>(new Set());
  const seenFlipIdsRef = useRef<Set<string>>(new Set());
  const seenMoveIdsRef = useRef<Set<string>>(new Set());
  /** Battle-result events already summarised in the opponent-turn overlay. */
  const seenBattleResultIdsRef = useRef<Set<string>>(new Set());
  const seenTileIdsRef = useRef<Set<string>>(new Set());
  // Town buildings the viewer has already seen go up — so the construction
  // burst fires once per genuine build, never on a mid-game join or a re-render.
  const seenStructureIdsRef = useRef<Set<string>>(new Set());
  const seenFeedIdsRef = useRef<Set<string>>(new Set());
  const seenFxIdsRef = useRef<Set<string>>(new Set());
  // Morale-card events already popped as the big MoraleCardOverlay — one pop
  // per event, never replayed on reconnect.
  const seenMoraleCueIdsRef = useRef<Set<string>>(new Set());
  // House rule (BINH) notices, popped once per event and pre-seeded on reconnect:
  //  - Dracon reaching level IV (his new Few-of-Magi recruit option).
  //  - A Gelu-recruited Sharpshooters joining the army with its +1 Attack BUFF.
  const seenLevelNoticeIdsRef = useRef<Set<string>>(new Set());
  const seenBuffRecruitIdsRef = useRef<Set<string>>(new Set());
  // Enemy-town captures already popped as the "captured their town but didn't
  // win" pop-up — one pop per capture, never replayed on reconnect.
  const seenTownCaptureIdsRef = useRef<Set<string>>(new Set());
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
  const pendingDiceFeedRef = useRef<{ items: AdventureFeedItem[]; sounds: FeedSoundCue[] }>({ items: [], sounds: [] });
  const connectionRef = useRef<RoomConnection | null>(null);

  // Hydrate browser-only state once, after mount: the URL's ?room= (enter that
  // room directly from a shared link) and the persisted display name. This is
  // the intended "sync with an external system (URL + localStorage) on mount"
  // use of an effect — it MUST run post-hydration so the static SSR markup
  // (lobby, empty name) matches the first client render, then populates. Hence
  // the scoped disable of the no-setState-in-effect lint for exactly this case.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const initialRoom = getInitialRoomId();
    if (initialRoom) {
      setRoomId(initialRoom);
      setRoomInput(initialRoom);
      // A room created on /play carries its chosen name across the navigation;
      // pick it up so applyPendingName can set it once connected (PartyKit).
      const pendingName = takePendingRoomName();
      if (pendingName && pendingName.roomId === initialRoom) {
        pendingRoomNameRef.current = pendingName;
      }
      // A Closed table chosen at create time → host it once we are a member.
      const pendingHosted = takePendingRoomHosted();
      if (pendingHosted && pendingHosted === initialRoom) {
        pendingRoomHostedRef.current = pendingHosted;
      }
      // A Battle Test chosen at create time → switch the room to that mode.
      const pendingMode = takePendingRoomMode();
      if (pendingMode && pendingMode.roomId === initialRoom) {
        pendingRoomModeRef.current = pendingMode;
      }
      // Ranked/Normal chosen at create time → apply once we are a member.
      const pendingRanked = takePendingRoomRanked();
      if (pendingRanked && pendingRanked.roomId === initialRoom) {
        pendingRoomRankedRef.current = pendingRanked;
      }
      // Password typed in the lobby before Join — seed JOIN_ROOM so a locked
      // room never auto-joins without a typed password (host online or not).
      const pendingPassword = takePendingRoomPassword();
      if (pendingPassword && pendingPassword.roomId === initialRoom) {
        pendingRoomPasswordRef.current = pendingPassword;
      }
    }
    // Prefer the signed-in nickname (localStorage cache) so a verified player
    // never JOINs under a stale guest display name from a previous session.
    const account = getAccountIdentity();
    const storedName = account?.nickname ?? getDisplayName();
    if (storedName) {
      setDisplayNameState(storedName);
    }
    if (account) {
      setAccountUserId(account.userId);
      setAccountRole(account.role);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => observeBrowserResponsiveness(), []);

  // Authoritative session from the httpOnly cookie. Refreshes accountUserId so
  // the guest→verified re-JOIN upgrade can fire even when localStorage was
  // empty (direct room link, cleared storage, fresh device). Forces the room
  // display name to the registered nickname so the roster never shows a
  // signed-in player under an old guest alias.
  useEffect(() => {
    let cancelled = false;
    fetchSession()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        if (profile) {
          setAccountUserId(profile.id);
          setAccountRole(profile.role);
          setDisplayNameState(profile.nickname);
          persistDisplayName(profile.nickname);
        } else {
          setAccountUserId(null);
          setAccountRole(null);
        }
      })
      .catch(() => {
        /* keep the localStorage seed; next action still verifies server-side */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The room browser moved to /play and the landing screen to /menu (expansion
  // plan Phase 0): a bare visit — and any return to "no room", e.g. the host
  // closing the table — leaves this page for the menu. The URL is consulted
  // directly because on a shared ?room= link this effect can run BEFORE the
  // mount effect above has copied the room id into state; a deep link must
  // never bounce to the menu.
  const router = useRouter();
  useEffect(() => {
    if (roomId === null && !getInitialRoomId()) {
      router.replace("/menu");
    }
  }, [roomId, router]);

  // The draw cue needs the live seat without resubscribing the stream.
  const viewerRef = useRef<PlayerId>("p1");
  useEffect(() => {
    viewerRef.current = viewerPlayerId;
  }, [viewerPlayerId]);

  // Campaign SETUP INJECTION (Anime mod §12): a room launched from /story carries
  // the chapter's config. Once the human is seated in the setup lobby, push the
  // chapter's game options (anime + fieldOverrides + difficulty) and a faction
  // preselect through the NORMAL action pipeline (SET_GAME_OPTIONS +
  // CHOOSE_FACTION) — no new server surface. Once per room (persisted marker +
  // ref), only while still in setup, so the player still sees the setup screen
  // and may change anything. Unbound / non-campaign rooms inject nothing.
  useEffect(() => {
    const connection = connectionRef.current;
    if (!state || !roomId || !campaignBinding || !connection) {
      return;
    }
    if (state.phase !== "setup" || !state.setupLobby) {
      return;
    }
    if (appliedCampaignSetupRef.current || isCampaignSetupApplied(roomId)) {
      return;
    }
    const seat = state.room?.members.find((member) => member.clientId === clientId)?.seat;
    if (!seat || seat === OBSERVER_SEAT) {
      return;
    }
    const chapter = getCampaignChapter(campaignBinding.campaignId, campaignBinding.chapterId);
    if (!chapter) {
      return;
    }
    const actions = campaignSetupActions(chapter, seat);
    if (actions.length === 0) {
      return;
    }
    appliedCampaignSetupRef.current = true;
    markCampaignSetupApplied(roomId);
    // Sequential so options land before (or alongside) the faction pick; a
    // failed submit degrades to the plain setup screen (the player picks by hand).
    void (async () => {
      for (const action of actions) {
        await connection.submitAction(action).catch(() => {});
      }
    })();
  }, [state, roomId, campaignBinding, clientId]);

  // Campaign story-mode triggers (Anime mod §12): fire the chapter's onStart
  // when the adventure first becomes visible, and onVictory / onDefeat at
  // game-over — each once per room (localStorage markers + refs guard re-fire;
  // markChapterCompleted persists a win). The decision is the pure
  // campaignSceneToFire; this wiring stays thin. Unbound rooms fire nothing.
  useEffect(() => {
    if (!state || !roomId || !campaignBinding) {
      return;
    }
    const trigger = campaignSceneToFire(state, campaignBinding, viewerPlayerId, {
      introShown: firedCampaignStartRef.current || isCampaignIntroShown(roomId),
      outcomeShown: firedCampaignOutcomeRef.current || isCampaignOutcomeShown(roomId)
    });
    if (!trigger) {
      return;
    }
    if (trigger.kind === "start") {
      firedCampaignStartRef.current = true;
      markCampaignIntroShown(roomId);
      setStoryCue({ id: `campaign:${roomId}:start`, sceneId: trigger.sceneId });
      return;
    }
    firedCampaignOutcomeRef.current = true;
    markCampaignOutcomeShown(roomId);
    if (trigger.kind === "victory") {
      markChapterCompleted(trigger.complete.campaignId, trigger.complete.chapterId);
    }
    if (trigger.sceneId) {
      setStoryCue({ id: `campaign:${roomId}:outcome`, sceneId: trigger.sceneId });
    }
  }, [state, roomId, campaignBinding, viewerPlayerId]);

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
  const showFeedItems = useCallback((items: AdventureFeedItem[], sounds: FeedSoundCue[]) => {
    if (items.length === 0) {
      return;
    }
    sounds
      .filter((cue, index) => sounds.findIndex((other) => feedSoundCueKey(other) === feedSoundCueKey(cue)) === index)
      .slice(0, 3)
      .forEach((cue, index) => {
        window.setTimeout(() => {
          if (typeof cue === "string") {
            playLibrarySound(cue, MAP_CUE_VOLUME);
          } else {
            // Visit pair: the one-shot sfx first; the map-object ambience sits
            // just behind it, starting only once the sfx has ENDED.
            playLibrarySoundThen(cue.sfx, MAP_CUE_VOLUME, () => playLibrarySound(cue.ambient, MAP_CUE_VOLUME));
          }
        }, index * 220);
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

    // Ladder dual-claim backup: when this frame ends a multiplayer game, each
    // signed-in participant posts once so W/L still records if the PartyKit
    // edge report key is missing. Uses the previous client state as `prev`.
    maybeClaimFinishedMatch(stateRef.current ?? undefined, nextState);
    stateRef.current = nextState;

    const eventWindow = presentationEventWindow(presentationEventCursorRef.current, nextState.eventLog);
    const presentationEvents = eventWindow.events;
    if (eventWindow.prime) {
      // Initial join, room reset, or a log-rotation gap: seed every seen-set
      // from current history and reconstruct only overlays that remain active
      // in authoritative state. Never replay an unknown partial timeline.
      seenRollIdsRef.current = null;
    }
    if (eventWindow.gap) {
      recordPerformanceMetric({
        name: "room.presentation.event-gap",
        at: metricNow(),
        fields: { events: nextState.eventLog.length, eventCounter: nextState.eventCounter ?? 0 }
      });
    }

    const rolls = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );
    const draws = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "CARDS_DRAWN" }> => event.type === "CARDS_DRAWN"
    );
    const flips = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_FLIPPED" }> => event.type === "UNIT_FLIPPED"
    );
    const moves = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "HERO_MOVED" }> => event.type === "HERO_MOVED"
    );
    const tileEvents = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "TILE_REVEALED" } | { type: "TILE_PLACED" }> =>
        event.type === "TILE_REVEALED" || event.type === "TILE_PLACED"
    );
    const structureEvents = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "STRUCTURE_BUILT" }> => event.type === "STRUCTURE_BUILT"
    );
    const mapDiceEvents = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> => event.type === "ADVENTURE_DICE_ROLLED"
    );
    const astrologerDrawEvents = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "ASTROLOGERS_DRAWN" }> => event.type === "ASTROLOGERS_DRAWN"
    );
    const turnEvents = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "TURN_STARTED" }> => event.type === "TURN_STARTED"
    );
    const visitEvents = presentationEvents.filter(
      (event): event is Extract<GameEvent, { type: "FIELD_VISITED" }> => event.type === "FIELD_VISITED"
    );
    const feedEvents = presentationEvents.filter(
      (event) =>
        ADVENTURE_FEED_CUES[event.type] &&
        // Join toasts announce genuinely NEW members only — reconnects and
        // cross-tab rebinds re-emit the event with newMember:false and must
        // not pop "joined" on every refresh.
        (event.type !== "ROOM_MEMBER_JOINED" || event.newMember === true)
    );
    const fxEvents = presentationEvents.filter((event) => FX_EVENT_TYPES.has(event.type));
    const moraleCardEvents = presentationEvents.filter((event) => isMoraleCardEvent(event));

    if (!seenRollIdsRef.current) {
      // Fresh room connection: forget the previous room's units.
      unitDefIdsRef.current = new Map();
    }
    if (nextState.combat) {
      for (const unit of Object.values(nextState.combat.units)) {
        // WOG commanders carry no unitDefId; they voice by `commander:<slug>`.
        const voiceId = unit.commanderSlug ? commanderVoiceId(unit.commanderSlug) : unit.unitDefId;
        if (voiceId) {
          unitDefIdsRef.current.set(unit.id, voiceId);
        }
      }
    }

    if (!seenRollIdsRef.current) {
      seenRollIdsRef.current = new Set(rolls.map((event) => event.id));
      seenDrawIdsRef.current = new Set(draws.map((event) => event.id));
      seenFlipIdsRef.current = new Set(flips.map((event) => event.id));
      seenMoveIdsRef.current = new Set(moves.map((event) => event.id));
      seenTileIdsRef.current = new Set(tileEvents.map((event) => event.id));
      seenStructureIdsRef.current = new Set(structureEvents.map((event) => event.id));
      seenMapDiceIdsRef.current = new Set(mapDiceEvents.map((event) => event.id));
      seenVisitIdsRef.current = new Set(visitEvents.map((event) => event.id));
      seenFeedIdsRef.current = new Set(feedEvents.map((event) => event.id));
      seenFxIdsRef.current = new Set(fxEvents.map((event) => event.id));
      seenMoraleCueIdsRef.current = new Set(moraleCardEvents.map((event) => event.id));
      // A mid-game join must not re-pop a past Dracon level-up or buffed recruit.
      seenLevelNoticeIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "HERO_LEVEL_UP").map((event) => event.id)
      );
      seenBuffRecruitIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "UNIT_RECRUITED").map((event) => event.id)
      );
      // A mid-game join must not re-pop a past enemy-town-capture notice.
      seenTownCaptureIdsRef.current = new Set(
        nextState.eventLog.filter((event) => isEnemyTownCapture(event)).map((event) => event.id)
      );
      seenFirstRollIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "FIRST_PLAYER_ROLLED").map((event) => event.id)
      );
      // ...and without re-popping a parallel-turns stop warning from the past.
      seenParallelStopIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "PARALLEL_TURNS_STOPPED").map((event) => event.id)
      );
      // ...and without re-popping a "you command the Neutral units" notice.
      seenNeutralControlIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED").map((event) => event.id)
      );
      seenAstrologerDrawIdsRef.current = new Set(astrologerDrawEvents.map((event) => event.id));
      // A fresh connection joins mid-game without replaying every past turn's
      // sunrise: the first snapshot's TURN_STARTED events count as already seen.
      seenTurnIdsRef.current = new Set(turnEvents.map((event) => event.id));
      // ...and without popping the current round's proclamation again on join.
      seenAstrologerRoundRef.current = nextState.round;
      // ...and without re-popping Event draws from before this connection.
      seenEventDrawIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "EVENT_CARD_DRAWN").map((event) => event.id)
      );
      // ...and without re-popping past designed-map timed events.
      seenMapEventIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "MAP_PRESET_TRIGGERED").map((event) => event.id)
      );
      // ...and without re-popping past story scenes (Anime mod §11).
      seenStoryIdsRef.current = new Set(
        presentationEvents.filter((event) => event.type === "STORY_SCENE_TRIGGERED").map((event) => event.id)
      );
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
      setMoraleCue({ current: null, queue: [] });
      setFirstRoll(null);
      setNewDay({ current: null, queue: [] });
      setAstrologerCue(null);
      setEventCue(null);
      setMapEventCue(null);
      setStoryCue(null);
      deferredStartDrawRef.current = null;
      pendingDiceFeedRef.current = { items: [], sounds: [] };
      // Mid-barrier (re)connect: the table is still resolving this round's
      // Astrologers proclamation / Event — the priming above just marked its
      // draw event as "seen", so without this the (re)joining client would sit
      // frozen with no idea what everyone is resolving ("one player sees the
      // event, the other doesn't"). Rebuild the overlay cue from live state.
      const reconnectCues = reconnectRoundStartCues(nextState, viewerRef.current);
      if (reconnectCues.astrologers) {
        setAstrologerCue(reconnectCues.astrologers);
      }
      if (reconnectCues.event) {
        setEventCue(reconnectCues.event);
      }
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
        const cueSounds: FeedSoundCue[] = [];
        const pushCue = (cue: FeedSoundCue | null | undefined) => {
          if (cue && !cueSounds.some((other) => feedSoundCueKey(other) === feedSoundCueKey(cue))) {
            cueSounds.push(cue);
          }
        };
        for (const event of freshFeed) {
          // Morale-card events pop the big MoraleCardOverlay, which owns the
          // good/bad-morale sting — their feed lines stay silent (the plain
          // MORALE_CHANGED token event keeps the generic morale cue).
          if (isMoraleCardEvent(event)) {
            continue;
          }
          const cue = ADVENTURE_FEED_CUES[event.type]?.cue;
          if (event.type === "FIELD_VISITED") {
            // Visit one-shot first; the map object's ambience is kept paired
            // with it so playback can chain it to start once the sfx ends.
            const visitCue = locationVisitSoundCue(event.location);
            if (visitCue) {
              pushCue(visitCue.ambient ? { sfx: visitCue.sfx, ambient: visitCue.ambient } : visitCue.sfx);
            } else {
              pushCue(cue ? MAP_CUE_SOUNDS[cue] : null);
            }
          } else {
            pushCue(cue ? MAP_CUE_SOUNDS[cue] : null);
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

      // Morale-card moments: every draw, automatic strike, cancel and absorb
      // pops the big card overlay (art + who + what happened) with the H3
      // good/bad-morale sting — on the map AND over the battlefield.
      const freshMoraleCardEvents = moraleCardEvents.filter((event) => !seenMoraleCueIdsRef.current.has(event.id));
      for (const event of freshMoraleCardEvents) {
        seenMoraleCueIdsRef.current.add(event.id);
      }
      if (freshMoraleCardEvents.length > 0) {
        const cues = buildMoraleCardCues(freshMoraleCardEvents, nextState, viewerRef.current);
        if (cues.length > 0) {
          setMoraleCue((current) => {
            const queue = [...current.queue, ...cues];
            return current.current ? { ...current, queue } : { current: queue[0], queue: queue.slice(1) };
          });
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
          const outcomeEvents = nextState.eventLog.filter((event) => {
            const number = eventNumber(event.id);
            return (
              number > from &&
              number < to &&
              outcomeTypes.has(event.type) &&
              ("playerId" in event ? event.playerId === visit.playerId : true)
            );
          });
          const lines = outcomeEvents.slice(0, 5).map((event) => formatEvent(event, nextState));
          // Compact reward chips (resource token / XP / morale + "+N") — the
          // treasure-chest / mine result with the correct icons, replacing the
          // text list; the mine's resource token also becomes the notice art.
          const { rewards, iconImage } = noticeRewardsFromEvents(outcomeEvents, nextState);
          return {
            id: visit.id,
            icon: LOCATION_GLYPHS[visit.location] ?? "📍",
            title: titleCase(visit.location),
            subtitle: `${nextState.players[visit.playerId]?.name ?? visit.playerId} ${
              visit.revisit ? "revisits" : "visits"
            }`,
            lines,
            location: visit.location,
            rewards,
            iconImage
          } satisfies MapNoticeCue;
        });
        setMapNotice((current) => {
          const queue = [...current.queue, ...cues];
          return current.current ? { ...current, queue } : { current: queue[0], queue: queue.slice(1) };
        });
      }

      // House rule (BINH) notices, queued onto the same map-notice overlay.
      //  - Dracon reaching level IV: announce his new "Few of Magi + 6 gold →
      //    Enchanters" recruit option (fires once, even off a combat-XP level-up).
      const levelNotices = presentationEvents.filter(
        (event): event is Extract<GameEvent, { type: "HERO_LEVEL_UP" }> =>
          event.type === "HERO_LEVEL_UP" &&
          event.level === 4 &&
          nextState.players[event.playerId]?.heroDefId === "dracon"
      );
      const freshLevelNotices = levelNotices.filter((event) => !seenLevelNoticeIdsRef.current.has(event.id));
      for (const event of levelNotices) {
        seenLevelNoticeIdsRef.current.add(event.id);
      }
      //  - A Gelu-recruited Sharpshooters: announce that the new unit is BUFFED
      //    with a permanent +1 Attack in every combat.
      const buffRecruits = presentationEvents.filter(
        (event): event is Extract<GameEvent, { type: "UNIT_RECRUITED" }> =>
          event.type === "UNIT_RECRUITED" && Boolean(event.attackBuff)
      );
      const freshBuffRecruits = buffRecruits.filter((event) => !seenBuffRecruitIdsRef.current.has(event.id));
      for (const event of buffRecruits) {
        seenBuffRecruitIdsRef.current.add(event.id);
      }
      // THE parallel-turns warning: parallel play stopped (a PvP battle, a
      // serious PvP interaction, or the period ran out) — pop it into every
      // player's face, not just the log.
      const parallelStops = presentationEvents.filter(
        (event): event is Extract<GameEvent, { type: "PARALLEL_TURNS_STOPPED" }> =>
          event.type === "PARALLEL_TURNS_STOPPED"
      );
      const freshParallelStops = parallelStops.filter((event) => !seenParallelStopIdsRef.current.has(event.id));
      for (const event of parallelStops) {
        seenParallelStopIdsRef.current.add(event.id);
      }
      // PvP Neutral Control: pop the "YOU command the Neutral units" notice
      // into the commander's face when a Neutral fight assigns them the guards
      // (everyone else just gets the feed line).
      const neutralControlAssignments = presentationEvents.filter(
        (event): event is Extract<GameEvent, { type: "NEUTRAL_CONTROL_ASSIGNED" }> =>
          event.type === "NEUTRAL_CONTROL_ASSIGNED"
      );
      const freshNeutralCommands = neutralControlAssignments.filter(
        (event) => !seenNeutralControlIdsRef.current.has(event.id) && event.playerId === viewerRef.current
      );
      for (const event of neutralControlAssignments) {
        seenNeutralControlIdsRef.current.add(event.id);
      }

      // Enemy-town capture: pop the "you captured their town / your town was
      // captured" explainer into BOTH players' faces. Flagging an enemy Town is
      // NOT an instant win (it starts the former owner's elimination clock), a
      // recurring point of confusion — so both the conqueror and the former owner
      // get a clear pop-up; every other seat just gets the feed line.
      const townCaptures = nextState.eventLog.filter(isEnemyTownCapture);
      const freshTownCaptures = townCaptures.filter((event) => !seenTownCaptureIdsRef.current.has(event.id));
      for (const event of townCaptures) {
        seenTownCaptureIdsRef.current.add(event.id);
      }
      const freshTownCaptureCues = freshTownCaptures
        .map((event) => buildTownCaptureCue(event, nextState, viewerRef.current))
        .filter((cue): cue is MapNoticeCue => cue !== null);

      const houseRuleCues: MapNoticeCue[] = [
        ...freshTownCaptureCues,
        ...freshNeutralCommands.map(
          (event) =>
            ({
              id: `neutral-command-${event.id}`,
              icon: "🎯",
              title: "You play the Neutral units",
              subtitle: `${nextState.players[event.combatPlayerId]?.name ?? event.combatPlayerId} fights Neutral units`,
              lines: [
                "PvP Neutral Control: drive the guards this whole fight like your own units —",
                "move and attack each one, break their activation ties, answer their ability targets and rolls."
              ]
            }) satisfies MapNoticeCue
        ),
        ...freshParallelStops.map(
          (event) =>
            ({
              id: `parallel-stop-${event.id}`,
              icon: event.reason === "period-ended" ? "⏳" : "⚔️",
              title: "Parallel turns have stopped",
              subtitle:
                event.reason === "pvp-battle"
                  ? "A player-vs-player battle begins"
                  : event.reason === "pvp-interaction"
                    ? "A serious interaction against another player"
                    : "The agreed period is over",
              lines: [event.message, "Play continues in normal turn order — one player at a time."]
            }) satisfies MapNoticeCue
        ),
        ...freshLevelNotices.map(
          (event) =>
            ({
              id: `level-notice-${event.id}`,
              icon: "⭐",
              title: "Dracon reaches Level IV",
              subtitle: `${nextState.players[event.playerId]?.name ?? event.playerId} — new recruit option`,
              lines: [
                "Enchanters IV now also lets you recruit the Enchanters",
                "from a Few of Magi by paying 6 extra gold."
              ]
            }) satisfies MapNoticeCue
        ),
        ...freshBuffRecruits.map(
          (event) =>
            ({
              id: `buff-recruit-${event.id}`,
              icon: "💪",
              title: "BUFF — Sharpshooters",
              subtitle: `${nextState.players[event.playerId]?.name ?? event.playerId} recruits a buffed unit`,
              lines: [
                `This ${event.unitDefId.split(".")[1] ?? event.unitDefId} permanently gains +${
                  event.attackBuff ?? 1
                } Attack`,
                "in every combat, from beginning to end."
              ]
            }) satisfies MapNoticeCue
        )
      ];
      if (houseRuleCues.length > 0) {
        setMapNotice((current) => {
          const queue = [...current.queue, ...houseRuleCues];
          return current.current ? { ...current, queue } : { current: queue[0], queue: queue.slice(1) };
        });
      }

      // First-player roll: a center-screen notice listing everyone's die,
      // attempt by attempt, and who plays first.
      const firstRolls = presentationEvents.filter(
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

      const freshAstrologerDraws = astrologerDrawEvents.filter((event) => !seenAstrologerDrawIdsRef.current.has(event.id));
      for (const event of astrologerDrawEvents) {
        seenAstrologerDrawIdsRef.current.add(event.id);
      }
      const latestAstrologerDraw = freshAstrologerDraws[freshAstrologerDraws.length - 1];
      if (latestAstrologerDraw && !isGameStart) {
        const card = astrologersCardDefinitions[latestAstrologerDraw.cardId];
        if (card) {
          let reshuffle: { discarded: number; drawn: number } | undefined;
          for (let i = nextState.eventLog.length - 1; i >= 0; i -= 1) {
            const logEvent = nextState.eventLog[i];
            if (
              logEvent.type === "ASTROLOGERS_HAND_RESHUFFLED" &&
              logEvent.round === latestAstrologerDraw.round &&
              logEvent.cardId === latestAstrologerDraw.cardId &&
              logEvent.playerId === viewerRef.current
            ) {
              reshuffle = { discarded: logEvent.discarded, drawn: logEvent.drawn };
              break;
            }
          }
          seenAstrologerRoundRef.current = latestAstrologerDraw.round;
          setAstrologerCue({
            id: latestAstrologerDraw.id,
            cardId: latestAstrologerDraw.cardId,
            name: card.name,
            text: card.text,
            image: card.image,
            expansion: card.expansion,
            ongoing: card.ongoing,
            round: latestAstrologerDraw.round,
            ...(reshuffle ? { reshuffle } : {})
          });
        }
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
        // A parallel round starts EVERYONE's turn at once — one sunrise for the
        // whole table instead of naming the last seat whose turn-start logged.
        const parallelRound = nextState.turn.mode === "parallel" && freshTurns.length > 1;
        const cue = {
          id: latest.id,
          playerName: parallelRound
            ? "All players"
            : (nextState.players[latest.playerId]?.name ?? latest.playerId),
          round: latest.round
        } satisfies NewDayCue;
        setNewDay((current) => (current.current ? { current: current.current, queue: [cue] } : { current: cue, queue: [] }));
      }

      // The full-screen proclamation is shown only for the fresh draw above.
      // The compact HUD card remains available for later reference.

      // Event draw (Fortress deck): pop the freshly-drawn Event card into every
      // player's face, once per draw, so a new Event is impossible to miss. The
      // copy names the drawer and that resolution runs clockwise from them.
      {
        const freshEventDraws = presentationEvents.filter(
          (event): event is Extract<GameEvent, { type: "EVENT_CARD_DRAWN" }> =>
            event.type === "EVENT_CARD_DRAWN" && !seenEventDrawIdsRef.current.has(event.id)
        );
        for (const event of freshEventDraws) {
          seenEventDrawIdsRef.current.add(event.id);
        }
        const latest = freshEventDraws[freshEventDraws.length - 1];
        if (latest) {
          const card = eventCardDefinitions[latest.cardId];
          if (card) {
            setEventCue({
              id: latest.id,
              cardId: latest.cardId,
              name: card.name,
              text: card.text,
              image: card.image,
              expansion: card.expansion,
              round: latest.round,
              drawerName: nextState.players[latest.drawerId]?.name ?? latest.drawerId,
              viewerIsDrawer: latest.drawerId === viewerRef.current
            });
          }
        }
      }

      // Designed-map timed events (map-designer "Timed events"): pop the ornate
      // announcement card once per firing. All effects due the same round fire
      // in one action, so the batch stacks into a single card.
      {
        const freshMapEvents = presentationEvents.filter(
          (event): event is Extract<GameEvent, { type: "MAP_PRESET_TRIGGERED" }> =>
            event.type === "MAP_PRESET_TRIGGERED" && !seenMapEventIdsRef.current.has(event.id)
        );
        for (const event of freshMapEvents) {
          seenMapEventIdsRef.current.add(event.id);
        }
        const first = freshMapEvents[0];
        if (first) {
          const messages = freshMapEvents.map((event) => {
            // The engine line reads "Map event (round N): every player …" — the
            // card's own header already says that, so show just the effect.
            const stripped = event.message.replace(/^Map event \(round \d+\):\s*/i, "");
            return stripped.charAt(0).toUpperCase() + stripped.slice(1);
          });
          setMapEventCue({ id: first.id, round: first.round ?? nextState.round, messages });
        }
      }

      // Victory-Points "final round" warning: pop the same ornate overlay (with
      // a distinct header) once when the last round begins, so the impending
      // end is never a surprise. Same seen-set/never-replay semantics; the
      // synthesized cue id can never collide with a real event id.
      {
        const freshFinalRound = presentationEvents.filter(
          (event): event is Extract<GameEvent, { type: "FINAL_ROUND" }> => event.type === "FINAL_ROUND"
        );
        const last = freshFinalRound[freshFinalRound.length - 1];
        if (last) {
          const cueId = `final-round-${last.round}`;
          if (!seenMapEventIdsRef.current.has(cueId)) {
            seenMapEventIdsRef.current.add(cueId);
            setMapEventCue({
              id: cueId,
              round: last.round,
              finalRound: true,
              messages: [
                "This is the final round — the game ends once it is over, and the player with the most Victory Points wins."
              ]
            });
          }
        }
      }

      // Designer-triggered story scenes (Anime mod §11): pop the StoryOverlay
      // once per firing. Same seen-set/never-replay semantics as the map-event
      // block above; the LATEST unseen scene wins if several fire this batch.
      {
        const freshStoryEvents = presentationEvents.filter(
          (event): event is Extract<GameEvent, { type: "STORY_SCENE_TRIGGERED" }> =>
            event.type === "STORY_SCENE_TRIGGERED" && !seenStoryIdsRef.current.has(event.id)
        );
        for (const event of freshStoryEvents) {
          seenStoryIdsRef.current.add(event.id);
        }
        const latest = freshStoryEvents[freshStoryEvents.length - 1];
        if (latest) {
          setStoryCue({ id: latest.id, sceneId: latest.sceneId });
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
        ? presentationEvents.filter(
            (event): event is Extract<GameEvent, { type: "UNIT_MOVED" }> =>
              event.type === "UNIT_MOVED" && !seenFxIdsRef.current.has(event.id)
          )
        : [];
      // Split a unit's moves into the approach (its slide toward the target,
      // before its die) and the after-attack fly-back (a Harpy's "Strike and
      // Return"). Done up front so the neutral pre-attack pause keys off the
      // APPROACH only — a return move arriving in the post-reaction snapshot
      // (when a reaction window split the roll off a frame later) must never be
      // mistaken for an approach and stall the dice waiting for it.
      const { approach: approachMoves, afterAttack: returnMoves } = partitionCombatMoves(
        nextState.eventLog,
        freshCombatMoves
      );
      // A Harpy that struck and flies home this snapshot has its real card
      // already committed back on its origin, but its fly-back is held until the
      // enemy's Retaliation Attack has played (see the return-move block below).
      // Until then it should read as still standing on the cell it struck from,
      // so the Retaliation strike lands THERE and the card never teleports home
      // early and then glides home a second time. planHarpyReturnHolds picks the
      // held units (Harpy returns that do not roll their own attack this
      // snapshot) and maps each to that strike cell.
      const rollingAttackerIds = new Set(fresh.map((roll) => roll.attackerId));
      const harpyHoldCellByUnit = planHarpyReturnHolds(
        returnMoves,
        rollingAttackerIds,
        (unitId) => nextState.combat?.units[unitId]?.abilities?.includes("harpy-return") ?? false
      );
      // An attacker that slid into range this snapshot holds its first die until
      // its glide finishes (so the cube is never thrown over a still-moving
      // card) — a Harpy flies IN, THEN the die rolls, THEN it strikes. Neutral
      // guards add a dramatic pause on top. Applies to EVERY controller: it was
      // once neutral-only, which left a player's Harpy rolling mid-glide.
      const movePreDelayByAttacker = planApproachAttackPreDelays(
        approachMoves.map((move) => ({ unitId: move.unitId, neutral: move.playerId === NEUTRAL_PLAYER_ID })),
        fresh,
        COMBAT_MOVE_MS,
        NEUTRAL_ATTACK_PAUSE_MS
      );

      // A leading activation spell (the neutral Faerie Dragon's Ice Bolt) is cast
      // BEFORE its caster then moves/attacks, all in one snapshot. Its cast +
      // damage are presented first as a preamble (see the cue block below), so
      // everything that follows — the approach move and the attack dice — is held
      // back by `activationSpellLeadMs` to keep the order "cast → damage → move →
      // attack". `leadMs` is 0 (no shift) for every combat without such a spell.
      const freshAbilityEvents = nextState.combat
        ? presentationEvents.filter(
            (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
              event.type === "UNIT_ABILITY_TRIGGERED" && !seenFxIdsRef.current.has(event.id)
          )
        : [];
      const activationSpellPreamble = planActivationSpellPreamble(
        freshAbilityEvents,
        LEADING_ACTIVATION_SPELL_ABILITIES,
        (abilityId) => {
          const plan = abilityFxPlans[abilityId];
          return {
            castMs: plan ? spellPresentationMs(plan) : 0,
            holdMs: plan ? DAMAGE_REVEAL_DELAY_MS : 0
          };
        }
      );
      const activationSpellLeadMs = activationSpellPreamble.leadMs;

      // Each attack die is its own beat: the cube rolls and reads, then the
      // table holds (ATTACK_ANIM_MS) so the striking unit's lunge / slash / shot
      // plays in the gap before the next die is thrown. `diceDismissAt[k]` is
      // when the k-th die finishes reading (the moment its strike begins),
      // measured from this snapshot; the FX timeline below pins its strikes to
      // those beats, and the total drives the post-action pause. Each die's
      // `preDelay` is carried into its overlay cue, so the cube and its strike
      // always share a clock — the lead below shifts BOTH together.
      const pendingPreDelay = new Set(movePreDelayByAttacker.keys());
      const diceDismissAt: number[] = [];
      let diceClock = 0;
      const freshDiceCues = fresh.map((event, index) => {
        // The first cube waits out any leading-activation-spell preamble (the
        // Faerie Dragon's cast), so the dice — and the strikes pinned to them —
        // trail the cast rather than rolling on top of it.
        let preDelay = index === 0 ? activationSpellLeadMs : 0;
        // An attacker that just slid into range waits out its glide (and, for a
        // neutral guard, the pre-attack pause) before its first die is thrown.
        const movePause = movePreDelayByAttacker.get(event.attackerId);
        if (movePause !== undefined && pendingPreDelay.has(event.attackerId)) {
          pendingPreDelay.delete(event.attackerId);
          preDelay += movePause;
        }
        // Every later die holds for the previous attack's strike animation.
        if (index > 0) {
          preDelay += ATTACK_ANIM_MS;
        }
        diceClock += preDelay + DICE_PRESENT_MS;
        diceDismissAt.push(diceClock);
        return makeDiceCue(nextState, event, preDelay);
      });

      // When each attacker's FIRST die is thrown (its strike beat backed out by
      // the present time). A unit's approach glide is pinned to land here, so in
      // a snapshot that batches several guards' activations the later guard's
      // fly-in waits for the earlier guard's dice instead of playing at t=0.
      const dieThrowByAttacker = new Map<string, number>();
      fresh.forEach((roll, index) => {
        if (!dieThrowByAttacker.has(roll.attackerId)) {
          dieThrowByAttacker.set(roll.attackerId, diceDismissAt[index] - DICE_PRESENT_MS);
        }
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

      // Hero walks.
      // - Human moves: instant path arrow (own click).
      // - Computer map steps: the pump sends ONE HERO_MOVED per tick — path
      //   arrow on the map only. AI-only/neutral fights bulk-resolve server-
      //   side in that same tick, so the human NEVER enters a dumb AI battle
      //   screen; only a short battle recap toast may appear after.
      // - Catch-up batches (reconnect / multi-hop in one snapshot): stepped
      //   Next/Confirm replay so nothing teleports.
      // - PvP combat (human is a participant): cancel map replay; fight plays
      //   on the normal combat board at normal pace.
      const freshMoves = moves.filter((event) => !seenMoveIdsRef.current.has(event.id));
      for (const event of moves) {
        seenMoveIdsRef.current.add(event.id);
      }
      const freshHumanMoves = freshMoves.filter(
        (event) => !isComputerPlayer(nextState, event.playerId)
      );
      const freshComputerMoves = freshMoves.filter((event) =>
        isComputerPlayer(nextState, event.playerId)
      );
      const humanInOpenCombat =
        Boolean(nextState.combat) && combatHasHumanParticipant(nextState);
      // Live path arrow: human always; computer only for a single paced step
      // while NOT mid-PvP (map view). Multi-hop computer batches use the overlay.
      const liveWalks =
        freshHumanMoves.length > 0
          ? freshHumanMoves
          : !humanInOpenCombat && freshComputerMoves.length === 1
            ? freshComputerMoves
            : [];
      if (liveWalks.length > 0) {
        const byHero = new Map<string, { from: string; steps: string[] }>();
        for (const event of liveWalks) {
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
        // Monolith / Gate / Whirlpool / Subterranean Gate / spell teleports
        // carry HERO_MOVED.teleport — object clips, not horse steps.
        playLibrarySound(heroMoveSoundKey(liveWalks, terrain), MAP_MOVE_VOLUME);
        setMoveCue({
          id: liveWalks[0].id,
          heroId,
          path: [walk.from, ...walk.steps]
        });
        window.setTimeout(() => {
          setMoveCue((current) => (current?.id === liveWalks[0].id ? null : current));
        }, 1800);
      }
      if (humanInOpenCombat) {
        // PvP: human fights on the combat board; drop any map replay/recap.
        cancelComputerReplayRef.current();
        setOpponentTurnSummary(null);
      } else {
        // Map view: recap any AI-only battles that bulk-resolved off-screen,
        // and gate multi-hop catch-up walks behind Next / Confirm.
        // NEVER open a combat board for AI-only fights (server bulk-resolves
        // them; if a mid-fight frame ever leaked, combat is absent here).
        const batchedComputerMoves =
          freshComputerMoves.length > 1 ? freshComputerMoves : [];
        const replay =
          batchedComputerMoves.length > 0
            ? buildComputerMoveReplay(nextState, batchedComputerMoves)
            : null;
        const freshBattleResults = nextState.eventLog.filter(
          (event) =>
            (event.type === "COMBAT_ENDED" || event.type === "QUICK_COMBAT_WON") &&
            !seenBattleResultIdsRef.current.has(event.id)
        );
        for (const event of freshBattleResults) {
          seenBattleResultIdsRef.current.add(event.id);
        }
        const battleCues = buildComputerBattleReport(nextState, freshBattleResults);
        if (replay) {
          opponentSummaryCounterRef.current += 1;
          setOpponentTurnSummary({
            id: `opp-turn-${opponentSummaryCounterRef.current}`,
            cues: battleCues,
            replay,
          });
        } else if (battleCues.length > 0) {
          // Off-screen AI fight finished: short recap only, stay on the map.
          opponentSummaryCounterRef.current += 1;
          setOpponentTurnSummary({
            id: `opp-turn-${opponentSummaryCounterRef.current}`,
            cues: battleCues,
            replay: null,
          });
        }
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
      // on placement — plus a dramatic golden burst over the new land.
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

      // A town building going up gets its own construction burst. Fires once per
      // genuine build (seenStructureIdsRef dedupes) and only for the viewer's own
      // town, where the built bar's `building:<id>` anchor is on screen; a burst
      // whose anchor is absent is consumed silently by the FX stage.
      const freshStructures = structureEvents.filter((event) => !seenStructureIdsRef.current.has(event.id));
      for (const event of structureEvents) {
        seenStructureIdsRef.current.add(event.id);
      }
      const mapBurstCues: FxCue[] = [];
      for (const event of freshTiles) {
        mapBurstCues.push({ kind: "burst", id: `burst:${event.id}`, at: `tile:${event.tileInstanceId}`, tone: "tile" });
      }
      for (const event of freshStructures) {
        if (event.playerId !== viewerRef.current) {
          continue;
        }
        mapBurstCues.push({ kind: "burst", id: `burst:${event.id}`, at: `building:${event.buildingId}`, tone: "build" });
      }
      if (mapBurstCues.length > 0) {
        setFxCues((current) => [...current, ...mapBurstCues]);
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
        // With no dice the timeline still starts after any leading-spell preamble.
        let timeline = fresh.length > 0 ? diceClock + ATTACK_IMPACT_MS : activationSpellLeadMs;
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
        // Leading activation spells (Faerie Dragon Ice Bolt) presented in the
        // preamble below: their UNIT_ABILITY_TRIGGERED ids (skipped in the main
        // loop) and the beat each one's damage lands on (consumed once by that
        // target's first DAMAGE_ASSIGNED, so the bolt's damage holds back to the
        // cast while a later same-target strike still pins to its own beat).
        const leadingSpellEventIds = new Set<string>();
        const leadingSpellDamageAt = new Map<string, number>();
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
        // the killing blow still gets its death cry. A WOG commander has no
        // unitDefId — it voices by `commander:<slug>` (unitDefIdsRef preserves
        // that too, so its fall/death cry still plays after removal).
        const unitVoice = (unitId: string) => {
          const unit = nextState.combat?.units[unitId];
          const voiceId = unit?.commanderSlug ? commanderVoiceId(unit.commanderSlug) : unit?.unitDefId;
          return voiceId ?? unitDefIdsRef.current.get(unitId);
        };

        // Leading activation-spell preamble: present the cast(s) FIRST — at the
        // very front of the timeline — so a neutral Faerie Dragon's Ice Bolt
        // flies and bursts (and its damage lands) BEFORE the dragon glides toward
        // its melee target. The move pre-pass and the dice clock were already
        // shifted past this by `activationSpellLeadMs`. Each cast's damage beat is
        // recorded so its DAMAGE_ASSIGNED, processed normally in the loop, pins to
        // the bolt's landing instead of the (post-dice) timeline; the cast event
        // itself is skipped there. Empty — and a no-op — for every other combat.
        for (const cast of activationSpellPreamble.casts) {
          const plan = abilityFxPlans[cast.abilityId];
          if (!plan) {
            continue;
          }
          leadingSpellEventIds.add(cast.eventId);
          if (plan.projectile) {
            cues.push({
              kind: "projectile",
              id: `${cast.eventId}-lead`,
              fxKey: plan.projectile,
              from: `unit:${cast.unitId}`,
              to: `unit:${cast.targetUnitId}`,
              hitFxKey: plan.hit,
              sound: plan.sound,
              hitSound: plan.hitSound,
              delayMs: cast.castStart
            });
          } else if (plan.affect?.length) {
            plan.affect.forEach((entry, index) => {
              cues.push({
                kind: "sprite",
                id: `${cast.eventId}-lead-${index}`,
                fxKey: entry.key,
                at: `unit:${cast.targetUnitId}`,
                sound: index === 0 ? plan.sound : undefined,
                delayMs: cast.castStart + (entry.delayMs ?? 0)
              });
            });
          }
          // The bolt's damage lands as it bursts (end of the cast presentation),
          // pinned so the number never pre-empts the sprite.
          leadingSpellDamageAt.set(cast.targetUnitId, cast.damageAt);
          combatFxActive = true;
        }
        combatPresentationEnd = Math.max(combatPresentationEnd, activationSpellLeadMs);

        // Combat steps: a unit's card visibly glides from its old cell to its
        // new one instead of teleporting, trailing a couple of after-images and
        // its footstep sound. The board has already re-rendered the unit at its
        // destination, so the FX layer hides the real card and flies a ghost.
        // Approach moves (a unit sliding toward its target) play up front;
        // after-attack moves — a Harpy's "Strike and Return" fly-back, or a
        // ranged unit's step after shooting — are held until the strike has
        // played out (queued after the attack loop below). A neutral guard
        // resolves move → attack → return in one snapshot, so without this the
        // Harpy would teleport home before its die was ever thrown. The
        // approach/return split was computed up front (see above) so the dice
        // pacing and this presentation share one source of truth. Each approach
        // glide is pinned to its OWN attacker's first die (planApproachMoveDelays)
        // — so when a snapshot batches several guards, a later guard's fly-in
        // waits for the earlier guard's dice instead of all playing at t=0.
        const approachMoveDelays = planApproachMoveDelays(
          approachMoves,
          dieThrowByAttacker,
          movePreDelayByAttacker,
          activationSpellLeadMs,
          130
        );
        // Each mover's ARRIVAL beat (glide start + glide duration). A Fire Wall /
        // Land Mine burn sprung by the move — its flare, its "−N" and the hurt
        // cry — is held to this beat (see the BATTLEFIELD_TOKEN_TRIGGERED and
        // DAMAGE_ASSIGNED handlers) so it lands as the card reaches the wall,
        // not at t=0 before it has glided there.
        const moveArrivalByUnit = planMoveArrivalBeats(approachMoves, approachMoveDelays, COMBAT_MOVE_MS);
        approachMoves.forEach((event, index) => {
          const unit = nextState.combat?.units[event.unitId];
          const moveDelay = approachMoveDelays[index];
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

        // How long the slide-in takes (the last approach ghost reaching its
        // cell). A neutral guard that moves in and then declares its attack lands
        // its move + declaration in one snapshot, BEFORE its die is rolled (a
        // reaction window can strand the roll a snapshot later). Holding the
        // presentation for this long keeps the "react?" window / reaction tray
        // off screen until the unit has finished arriving — so a Harpy reads as
        // "fly in → attack window → (after the strike) fly back", never a window
        // popping over a card still sliding across the board.
        const approachMovesEnd = approachMoveDelays.reduce(
          (latest, delay) => Math.max(latest, delay + COMBAT_MOVE_MS),
          0
        );
        combatPresentationEnd = Math.max(combatPresentationEnd, approachMovesEnd);

        // Attack strikes are driven off the rolls, not the declarations: an
        // ATTACK_ROLLED event always shares a snapshot with its dice and damage,
        // whereas a reaction window can leave UNIT_ATTACK_DECLARED in an earlier
        // frame. Each strike plays the instant its die finishes reading
        // (diceDismissAt), the struck unit holds its pre-hit health until the
        // blow lands, and its damage number / death are pinned to that beat.
        // When each attacker's last strike (+ its result tail) has fully played,
        // so its OWN fly-back leaves then — not after every later guard in a
        // batched snapshot has also struck.
        const strikeEndByAttacker = new Map<string, number>();
        fresh.forEach((roll, index) => {
          const strikeAt = diceDismissAt[index];
          const impactAt = strikeAt + ATTACK_IMPACT_MS;
          impactByTarget.set(roll.defenderId, impactAt);
          const strikeEnd = impactAt + 1200;
          combatPresentationEnd = Math.max(combatPresentationEnd, strikeEnd);
          strikeEndByAttacker.set(
            roll.attackerId,
            Math.max(strikeEndByAttacker.get(roll.attackerId) ?? 0, strikeEnd)
          );

          const attacker = nextState.combat?.units[roll.attackerId];
          const defender = nextState.combat?.units[roll.defenderId];
          // A Harpy being retaliated against this snapshot is shown parked on
          // the cell it struck from (its real card is committed home but held);
          // aim the strike there so the Retaliation Attack visibly lands on it,
          // not on the now-empty origin it is about to fly back to.
          const defenderHoldCell = harpyHoldCellByUnit.get(roll.defenderId);
          const defenderCell =
            defenderHoldCell !== undefined
              ? `cell:${defenderHoldCell}`
              : defender && defender.position >= 0
                ? `cell:${defender.position}`
                : undefined;
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
          // A unit whose ranged SHOT is a spell bolt (the Santa Gremlin's Ice
          // Bolt) flies the real projectile + burst + spell sound below; its
          // spell sound then carries the shot, so the extra flourish is skipped
          // (playing it too would double the ice-bolt cue).
          const shotPlan = ranged ? unitShotFxPlan(attackerVoice) : undefined;
          const attackFlourish = shotPlan?.projectile ? undefined : unitAttackFlourish(attackerVoice);
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
            if (shotPlan?.projectile) {
              // The Ice Bolt projectile flies from the shooter to the target and
              // bursts on impact, with the Ice Bolt spell's launch + hit sounds.
              cues.push({
                kind: "projectile",
                id: `${roll.id}-bolt`,
                fxKey: shotPlan.projectile,
                from: attackerCell,
                to: defenderCell,
                hitFxKey: shotPlan.hit,
                sound: shotPlan.sound,
                hitSound: shotPlan.hitSound,
                delayMs: strikeAt + RANGED_RELEASE_MS
              });
            } else {
              cues.push({
                kind: "bolt",
                id: `${roll.id}-bolt`,
                from: attackerCell,
                to: defenderCell,
                delayMs: strikeAt + RANGED_RELEASE_MS
              });
            }
          } else {
            cues.push({ kind: "slash", id: `${roll.id}-slash`, at: defenderCell, delayMs: impactAt });
          }
          // The struck unit recoils at the moment of impact.
          cues.push({ kind: "shake", id: `${roll.id}-shake`, unitId: roll.defenderId, delayMs: impactAt });
        });

        // After-attack moves now that the strike beats are known: a Harpy's
        // fly-back (or a shooter's step) glides home once its OWN strike's
        // number/death has played out, so the activation reads "move in → dice →
        // attack/sfx → fly back" — even batched behind another guard, where the
        // global timeline end would hold the fly-back until every later guard
        // had struck too. A player Harpy's fly-back lands in a later snapshot
        // with no strike of its own, so it trails the running timeline end.
        const returnMoveDelays = planReturnMoveDelays(returnMoves, strikeEndByAttacker, combatPresentationEnd, 130);
        returnMoves.forEach((event, index) => {
          const unit = nextState.combat?.units[event.unitId];
          const moveDelay = returnMoveDelays[index];
          const isHarpyReturn = unit?.abilities?.includes("harpy-return") ?? false;
          // A held Harpy fly-back parks on its strike cell from the instant the
          // snapshot lands (delay 0) and waits out the Retaliation Attack before
          // gliding home, so the card never teleports to its origin early and
          // then glides home a SECOND time. Other after-attack steps (a shooter
          // repositioning) just glide at their cue time as before.
          const held = harpyHoldCellByUnit.has(event.unitId);
          cues.push({
            kind: "move",
            id: `${event.id}-move`,
            unitId: event.unitId,
            from: `cell:${event.from}`,
            to: `unit:${event.unitId}`,
            cardImage: unit?.assets?.cardImage,
            flip: false,
            delayMs: held ? 0 : moveDelay,
            ...(held ? { holdMs: moveDelay } : {})
          });
          // The Harpy already voiced a footstep on its fly-IN; the fly-back is
          // the same round trip home, so it does not speak a second time. Other
          // after-attack steps keep their move sound.
          if (!isHarpyReturn) {
            playUnitSound(unitVoice(event.unitId), "move", moveDelay);
          }
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
            case "RUNE_LEVEL_REACHED": {
              // A Bulwark army just crossed a Rune-Level threshold — ring the rune
              // cue at the current beat (it rides over the action that earned it,
              // or sounds as a Rune-Empowered battle opens). It's a public board
              // event, so it plays for either side reaching a level.
              const runeSound = COMBAT_EVENT_SOUNDS.RUNE_LEVEL_REACHED;
              if (runeSound) {
                window.setTimeout(() => playLibrarySound(runeSound), timeline);
              }
              break;
            }
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
              const isPowerBoost = /^\+\d+ Power/u.test(event.optionLabel ?? "");
              const playedPlan = isPowerBoost ? undefined : spellFxPlans[event.cardId];
              if (playedPlan) {
                const at = start + FLIGHT_MS;
                // Attack-window / Sorrow reactions carry the unit they land on
                // (Curse on the defender, Bloodlust on the attacker). Anchor the
                // H3 sprite/tint there; map spells and untargeted plays stay
                // centre-stage over the card flight.
                const anchor =
                  event.targetUnitId && inCombat ? `unit:${event.targetUnitId}` : "center";
                const affectKey = playedPlan.affect?.[0]?.key;
                if (affectKey) {
                  cues.push({
                    kind: "sprite",
                    id: `${event.id}-played-fx`,
                    fxKey: affectKey,
                    at: anchor,
                    sound: playedPlan.sound,
                    delayMs: at
                  });
                } else if (playedPlan.tint) {
                  // Bloodlust: no sprite in H3 — red battle-rage wash on the
                  // buffed unit when known, else centre stage over the card.
                  if (event.targetUnitId && inCombat) {
                    const tint = playedPlan.tint;
                    const soundKey = playedPlan.sound;
                    const unitId = event.targetUnitId;
                    window.setTimeout(() => {
                      if (soundKey) {
                        playLibrarySound(soundKey);
                      }
                      setTintedUnits((current) => new Map(current).set(unitId, tint));
                      window.setTimeout(() => {
                        setTintedUnits((current) => {
                          const next = new Map(current);
                          next.delete(unitId);
                          return next;
                        });
                      }, 1600);
                    }, at);
                  } else {
                    cues.push({
                      kind: "glow",
                      id: `${event.id}-played-tint`,
                      at: "center",
                      tint: playedPlan.tint,
                      sound: playedPlan.sound,
                      delayMs: at
                    });
                  }
                } else if (playedPlan.sound) {
                  const soundKey = playedPlan.sound;
                  window.setTimeout(() => playLibrarySound(soundKey), at);
                }
                if (inCombat && event.targetUnitId) {
                  combatFxActive = true;
                  combatPresentationEnd = Math.max(
                    combatPresentationEnd,
                    at + spellPresentationMs(playedPlan) + 400
                  );
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
            case "COMMANDER_CAST_USED": {
              // WOG commander command ability — the activation cast AND the
              // Shield / Stone Skin instant reaction both emit this. Reuse the
              // matching H3 spell's sprite + sound over the buffed/healed target
              // so every commander cast animates and sounds (Bloodlust tints red,
              // Animate Dead falls back to a heal shimmer).
              const plan = commanderCastFxPlan(event.commanderSlug);
              queueBoardFx(plan, event.id, `hand:${event.playerId}`, event.targetUnitId);
              if (inCombat) {
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 900);
              }
              break;
            }
            case "COMMANDER_SPECIALTY_TRIGGERED": {
              // A themed sting for an in-combat commander specialty (Charming,
              // Elemental Scourge, Rune Ritual). No single unit to anchor a sprite
              // on, so the sound plays on the timeline; the specialty's own
              // damage/token FX (if any) ride their normal events.
              const specialtySound = commanderSpecialtySound(event.specialtyId);
              if (specialtySound) {
                const at = timeline;
                window.setTimeout(() => playLibrarySound(specialtySound), at);
                if (inCombat) {
                  combatFxActive = true;
                  combatPresentationEnd = Math.max(combatPresentationEnd, at + 600);
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
              // Leading activation spell (Faerie Dragon Ice Bolt) presented in the
              // preamble: its damage lands on the recorded cast beat. Consume the
              // entry on the spell's OWN damage event — looked up and cleared even
              // for a 0-damage bolt (one a spell-damage reducer fully absorbed),
              // which the amount guard below skips — so a later same-target strike
              // is never mispinned back to the (earlier) cast beat.
              const leadTargetId = event.target.type === "unit" ? event.target.unitId : undefined;
              const leadAt = leadTargetId !== undefined ? leadingSpellDamageAt.get(leadTargetId) : undefined;
              if (leadTargetId !== undefined && leadAt !== undefined) {
                leadingSpellDamageAt.delete(leadTargetId);
              }
              if (event.target.type === "unit" && event.amount > 0) {
                const targetId = event.target.unitId;
                // Fire Shield burn: its cue queued a reveal beat for this attacker
                // (after the flare). Consume it once so the burn number/health
                // land after the animation, and the attacker's later retaliation
                // strike still pins to its own beat below.
                const burnAt = leadAt === undefined ? fireShieldBurnAt.get(targetId) : undefined;
                // A battlefield-token burn (Fire Wall / Land Mine, damageKind
                // "effect") sprung by THIS unit's move: hold its "−N" until the
                // card has glided onto the token's cell, so it lands as the unit
                // arrives — not at t=0, before the glide. Only effect damage on a
                // unit that moved this batch; attacks pin to their strike beat.
                const tokenMoveAt =
                  leadAt === undefined && burnAt === undefined && event.damageKind === "effect"
                    ? moveArrivalByUnit.get(targetId)
                    : undefined;
                // Attack damage lands on its strike beat; spell/ability damage
                // lands only once its sprite + sound have finished (the timeline
                // was just advanced past them by queueBoardFx / the ability cue).
                const attackBeat =
                  leadAt === undefined && burnAt === undefined && tokenMoveAt === undefined
                    ? impactByTarget.get(targetId)
                    : undefined;
                let at = leadAt ?? burnAt ?? tokenMoveAt ?? attackBeat ?? timeline;
                if (burnAt !== undefined) {
                  fireShieldBurnAt.delete(targetId);
                }
                // A card that fires a SHOT rather than a Spell (the Artillery
                // ability's Ballista-style volley) reports here, on the same beat
                // its damage would otherwise show, and pushes the struck unit's
                // hurt cry + number out behind the shot so the report is heard
                // first — exactly like a war machine's WAR_MACHINE_TRIGGERED shot.
                // Only on non-attack card damage: an attack already carries its
                // own strike sfx pinned to the impact beat.
                const shotPlan =
                  attackBeat === undefined && event.source.type === "card"
                    ? cardShotFxPlans[event.source.cardId]
                    : undefined;
                if (shotPlan?.sound) {
                  const shotSound = shotPlan.sound;
                  const shotAt = at;
                  window.setTimeout(() => playLibrarySound(shotSound), shotAt);
                  at = shotAt + spellPresentationMs(shotPlan);
                  timeline = at;
                  if (inCombat) {
                    combatFxActive = true;
                  }
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
                const healStartsAt = timeline;
                const healPlan =
                  event.source.type === "card" ? healFxPlans[event.source.cardId] : undefined;
                if (healPlan) {
                  queueBoardFx(healPlan, `${event.id}-heal`, `unit:${targetId}`, targetId);
                }
                // The First Aid Tent may fire inside an attack reaction window,
                // where the board is visually busy. Give it a guaranteed,
                // sprite-independent cross pulse on the healed card so the
                // instant never reads as a bare health-number change.
                if (event.source.type === "card" && FIRST_AID_GRAPHIC_CARD_IDS.has(event.source.cardId)) {
                  cues.push({
                    kind: "pulse",
                    id: `${event.id}-first-aid-cross`,
                    at: `unit:${targetId}`,
                    text: "✚",
                    delayMs: healStartsAt
                  });
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
                    const revealAt = at + DAMAGE_REVEAL_DELAY_MS;
                    // Hold the more-wounded pre-heal health until the shimmer ends —
                    // but NEVER let a unit that survives read as dead. A First Aid
                    // heal used as an instant the moment a unit is attacked lands
                    // BEFORE the incoming hit, so unit.damage here already includes
                    // that hit; unit.damage + heal then over-counts to maxHealth and
                    // the surviving unit vanishes, then reappears when the strike's
                    // own reveal fires. healFreezeDisplayDamage keeps the attack's
                    // pre-hit freeze (returns undefined) or caps below max.
                    const frozen = healFreezeDisplayDamage({
                      finalDamage: unit.damage,
                      maxHealth: unit.maxHealth,
                      healAmount: event.amount,
                      alreadyFrozen: freezeDamage.has(targetId)
                    });
                    if (frozen !== undefined) {
                      freezeDamage.set(targetId, frozen);
                      spellRevealAt.set(targetId, Math.max(spellRevealAt.get(targetId) ?? 0, revealAt));
                    }
                    combatFxActive = true;
                    combatPresentationEnd = Math.max(combatPresentationEnd, revealAt + 800);
                  }
                }
              }
              break;
            }
            case "UNIT_ABILITY_TRIGGERED": {
              // A leading activation spell (Faerie Dragon Ice Bolt) was already
              // presented up front in the preamble; its damage pins to that beat
              // below. Skip it here so the cast is not queued a second time.
              if (leadingSpellEventIds.has(event.id)) {
                break;
              }
              // An ability that physically threw dice (Death Stare, the
              // Thunderbird extra die, the Dwarven resistance die, the morale
              // skip-activation check…) rolls them out in the attack-die
              // overlay BEFORE its effect FX and the damage it caused land.
              // Queued behind this snapshot's attack dice it waits only a
              // short strike-settle beat — the overlay queue itself provides
              // the ordering — while a batch with no attack dice (a spell
              // resisted mid-cast) waits out the running timeline like the
              // Inferno roll does.
              if (event.dice) {
                const afterStrike = fresh.length > 0;
                const startAt = afterStrike ? ABILITY_DICE_AFTER_STRIKE_MS : timeline;
                spellDiceCues.push(makeAbilityDiceCue(nextState, event, event.dice, startAt));
                timeline += (afterStrike ? ABILITY_DICE_AFTER_STRIKE_MS : 0) + DICE_ROLL_MS + ABILITY_DICE_READ_MS;
                if (inCombat) {
                  combatFxActive = true;
                  combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 1200);
                }
              }
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
              if (event.abilityId === "wog-dracolich-armor") {
                // The Dracolich's "-1" armor die soaked the blow: a spell-resistance
                // shimmer over it + its own DEFEND cry, pinned to the strike it
                // blocked (the Dracolich is that attack's DEFENDER, so its strike
                // beat is impactByTarget). Anchored on event.unitId, never queued on
                // the main timeline — where it would flash before the sword lands
                // (the armor event is logged just BEFORE the attack's roll).
                const strikeBeat = impactByTarget.get(event.unitId);
                const start = (strikeBeat ?? timeline) + DAMAGE_REVEAL_DELAY_MS;
                plan.affect?.forEach((entry, index) => {
                  cues.push({
                    kind: "sprite",
                    id: `${event.id}-armor-${index}`,
                    fxKey: entry.key,
                    at: `unit:${event.unitId}`,
                    delayMs: start + (entry.delayMs ?? 0)
                  });
                });
                playUnitSound(unitVoice(event.unitId), "defend", start);
                combatFxActive = true;
                combatPresentationEnd = Math.max(combatPresentationEnd, start + spellPresentationMs(plan) + 400);
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
              // A token laid on a board space. Force Field / Fire Wall flare into
              // place with their cast cue; the face-down traps drop quietly —
              // their bite waits until a unit springs them. A token placed by an
              // ATTACK (the Hell Steed's Fire Wall) must flare AFTER the strike
              // that placed it, so hold it until the latest strike impact this
              // batch; a spell-CAST token (no strikes) still drops on the cast
              // beat (timeline), since strikeImpactEnd is 0 with no attack rolls.
              const strikeImpactEnd =
                impactByTarget.size > 0
                  ? Math.max(...impactByTarget.values()) + DAMAGE_REVEAL_DELAY_MS
                  : 0;
              const at = Math.max(timeline, strikeImpactEnd);
              if (event.kind === "force_field") {
                cues.push({ kind: "sprite", id: `${event.id}-place`, fxKey: "force-field", at: `cell:${event.position}`, sound: "spells/force-field", delayMs: at });
                timeline = at + 520;
              } else if (event.kind === "fire_wall") {
                cues.push({ kind: "sprite", id: `${event.id}-place`, fxKey: "fire-wall-e", at: `cell:${event.position}`, sound: "spells/fire-wall", delayMs: at });
                timeline = at + 520;
                if (inCombat) {
                  combatFxActive = true;
                  combatPresentationEnd = Math.max(combatPresentationEnd, timeline + 400);
                }
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
              // off the DAMAGE_ASSIGNED that follows. When a MOVE sprang it, the
              // flare is held to the beat the card glides onto the token's cell
              // (moveArrivalByUnit) — not t=0, before the unit has arrived; a
              // token sprung with no move (e.g. begun-activation-on-a-wall) has no
              // arrival beat and plays on the running timeline as before.
              const springArrivalAt =
                event.unitId !== undefined ? moveArrivalByUnit.get(event.unitId) : undefined;
              const at = springArrivalAt ?? timeline;
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
              // Advance past this burn's beat (which may sit ahead of `timeline`
              // when it was pinned to a move arrival) so later events follow it.
              timeline = Math.max(timeline, at) + 600;
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
        if (fresh.length > 0 || combatFxActive || approachMoves.length > 0) {
          const presentationMs = Math.min(MAX_PRESENTATION_MS, Math.max(timeline, combatPresentationEnd));
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

    // Advance only after every presentation delta above was derived without
    // throwing, so a failed ingestion can be retried by the next recovery frame.
    presentationEventCursorRef.current = eventWindow.cursor;
    recordPerformanceMetric({
      name: "room.presentation.event-window",
      at: metricNow(),
      fields: {
        totalEvents: nextState.eventLog.length,
        eligibleEvents: presentationEvents.length,
        prime: eventWindow.prime,
        gap: eventWindow.gap
      }
    });
    setState(nextState);
  }, [showFeedItems]);

  const ingestSnapshot = useCallback(
    (snapshot: GameRoomSnapshot, meta?: SnapshotMeta) => {
      // No live room (lobby): ignore any straggling frame. Narrows roomId to a
      // string for the cache calls below.
      if (!roomId || snapshot.roomId !== roomId) {
        return;
      }
      // Record the room server's engine signature from every frame (even ones
      // the version gate later drops) so a stale-server warning shows promptly.
      if (snapshot.serverSignature) {
        setServerSignature(snapshot.serverSignature);
      }

      const previousArbiterVersion = snapshotArbiterRef.current.version;
      const decision = decideSnapshot(snapshotArbiterRef.current, {
        bootId: snapshot.bootId,
        version: snapshot.version,
        viewerSeat: snapshot.viewerSeat,
        source: meta?.source ?? "broadcast",
        seatAuthoritative: meta?.seatAuthoritative
      });
      if (!decision.accept) {
        recordPerformanceMetric({
          name: "room.snapshot.rejected",
          at: metricNow(),
          fields: { version: snapshot.version, reason: decision.reason, source: meta?.source ?? "broadcast" }
        });
        return;
      }
      // Commit ordering synchronously before any cache, recovery, React, audio,
      // animation, timer or match-claim side effect can run.
      snapshotArbiterRef.current = decision.state;
      // Pending-action echo TTL sweep (plan N2): a submit whose promise never
      // settles (hung fetch) still un-dims once the authoritative state flows.
      const prunedEchoes = prunePendingEchoes(pendingEchoesRef.current, echoNow());
      if (prunedEchoes !== pendingEchoesRef.current) {
        pendingEchoesRef.current = prunedEchoes;
        setPendingEchoView(prunedEchoes);
      }
      const bootChanged = decision.reason === "new-boot";
      // A fresh mount (arbiter at version -1) reconnecting to a room the server
      // recycled to a bare setup lobby must still restore the cached in-progress
      // game — the old seenBootIdRef treated the first frame as a boot change,
      // but the arbiter reports "newer" (not "new-boot") on it, so the recovery
      // block below would otherwise never fire on an F5 / direct room link. The
      // fresh-lobby + cached-game guards keep this scoped exactly as before.
      const firstFrameRecovery = previousArbiterVersion < 0 && Boolean(snapshot.bootId);
      if (bootChanged || decision.reason === "seat-upgrade") {
        // Event ids/counters are scoped to one server generation. A hosted
        // observer-to-seat upgrade also changes which pending Event/choice is
        // visible without changing the version. Prime either viewer context
        // from authoritative state so a reconnect overlay cannot remain hidden
        // until F5 or the next action.
        presentationEventCursorRef.current = initialPresentationEventCursor();
      }
      recordPerformanceMetric({
        name: "room.snapshot.accepted",
        at: metricNow(),
        fields: { version: snapshot.version, reason: decision.reason, source: meta?.source ?? "broadcast" }
      });

      // The version gate keeps out-of-order frames from rolling the table
      // back — but when the server process restarted (new bootId) its version
      // counter starts over, and refusing those snapshots froze the table
      // ("nothing moves anymore"). A boot change always wins.
      // Recovery: the server came back (new boot) holding only a fresh setup
      // lobby while we have a saved in-progress game for this room — the room
      // was lost to a recycle. Push our cached game back instead of dropping to
      // the menu. Guarded per-boot so it runs at most once.
      if (
        (bootChanged || firstFrameRecovery) &&
        isFreshLobbyState(snapshot.state) &&
        restoredForBootRef.current !== (snapshot.bootId ?? null)
      ) {
        const cached = loadCachedRoom(roomId);
        if (cached && !isFreshLobbyState(cached.state)) {
          restoredForBootRef.current = snapshot.bootId ?? null;
          connectionRef.current
            ?.restoreRoom(cached.state)
            .then((restored) => ingestSnapshotRef.current(restored, { seatAuthoritative: true }))
            .catch(() => {
              // Restore failed: fall back to showing whatever the server has.
              ingestServerState(snapshot.state);
              setRoomVersion(snapshot.version);
            });
          return;
        }
      }

      // Mirror in-progress games for recovery; never cache a bare lobby (that
      // would let a later recycle overwrite a real game).
      if (!isFreshLobbyState(snapshot.state)) {
        saveCachedRoom(roomId, snapshot.version, snapshot.state);
      }
      const presentationStart = metricNow();
      ingestServerState(snapshot.state);
      recordPerformanceMetric({
        name: "room.snapshot.presentation-derived",
        at: presentationStart,
        durationMs: metricNow() - presentationStart,
        fields: { version: snapshot.version, events: snapshot.state.eventLog.length }
      });
      setRoomVersion(snapshot.version);
      requestAnimationFrame(() => {
        recordPerformanceMetric({
          name: "room.snapshot.first-frame",
          at: presentationStart,
          durationMs: metricNow() - presentationStart,
          fields: { version: snapshot.version, events: snapshot.state.eventLog.length }
        });
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

  const dismissMoraleCue = useCallback(() => {
    setMoraleCue((current) =>
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

  // Backstop the freshly-drawn-card hide. Freshly drawn cards are held
  // `visibility:hidden` (the "incoming" class) until their draw flight lands,
  // which is normally cleared by a per-snapshot reveal timer or the first-roll
  // dismiss. If any of those reset paths is ever dropped — a snapshot race, a
  // reconnect mid-flight, an interrupted draw — the hidden tail would stick and
  // the hand would look empty (0 cards) across turns even though the engine
  // still holds every card (hence "no event"). This guarantees a stuck hidden
  // tail always clears shortly after the longest possible flight. It is gated on
  // `!firstRoll` so it never reveals the opening hand early while the
  // first-player ceremony is still showing (that hand is hidden on purpose until
  // the player dismisses the roll).
  useEffect(() => {
    if (hiddenHandTail <= 0 || firstRoll) {
      return;
    }
    const timer = window.setTimeout(() => setHiddenHandTail(0), HIDDEN_HAND_REVEAL_BACKSTOP_MS);
    return () => window.clearTimeout(timer);
  }, [hiddenHandTail, firstRoll]);

  const handleFxDone = useCallback((id: string) => {
    setFxCues((current) => current.filter((cue) => cue.id !== id));
  }, []);

  const presentationStartedAtRef = useRef<number | null>(null);
  const skipPresentation = useCallback((reason: "manual" | "watchdog") => {
    const startedAt = presentationStartedAtRef.current;
    recordPerformanceMetric({
      name: "room.presentation.skipped",
      at: metricNow(),
      fields: {
        reason,
        version: snapshotArbiterRef.current.version,
        actualMs: startedAt === null ? 0 : Math.round(metricNow() - startedAt),
        maximumMs: MAX_PRESENTATION_MS
      }
    });
    setDice({ current: null, queue: [] });
    setMapDice({ current: null, queue: [] });
    setMapNotice({ current: null, queue: [] });
    setFirstRoll(null);
    setNewDay({ current: null, queue: [] });
    setMoraleCue({ current: null, queue: [] });
    setAstrologerCue(null);
    setEventCue(null);
    setMapEventCue(null);
    setStoryCue(null);
    setDrawCue(null);
    setMoveCue(null);
    setFxCues([]);
    setCombatPresenting(false);
    setCombatDamageDisplay(new Map());
    setFlippedUnitIds(new Set());
    setTintedUnits(new Map());
    setHiddenHandTail(0);
    deferredStartDrawRef.current = null;
    pendingDiceFeedRef.current = { items: [], sounds: [] };
    if (combatPresentTimerRef.current) window.clearTimeout(combatPresentTimerRef.current);
    combatPresentTimerRef.current = null;
    for (const timer of damageRevealTimersRef.current) window.clearTimeout(timer);
    damageRevealTimersRef.current = [];
    presentationStartedAtRef.current = null;
  }, []);

  const presentationActive = Boolean(
    dice.current || mapDice.current || mapNotice.current || firstRoll || newDay.current || moraleCue.current ||
    astrologerCue || eventCue || mapEventCue || storyCue || drawCue || moveCue || fxCues.length > 0 || combatPresenting
  );
  useEffect(() => {
    if (!presentationActive) {
      presentationStartedAtRef.current = null;
      return;
    }
    presentationStartedAtRef.current ??= metricNow();
    const timer = window.setTimeout(
      () => skipPresentation("watchdog"),
      presentationWatchdogDelay(presentationStartedAtRef.current, metricNow(), MAX_PRESENTATION_MS)
    );
    return () => window.clearTimeout(timer);
  }, [presentationActive, skipPresentation]);

  // One live connection per room: PartyKit edge socket when configured,
  // otherwise the built-in API + SSE stream. No connection while in the lobby.
  useEffect(() => {
    if (!roomId) {
      return;
    }
    snapshotArbiterRef.current = initialSnapshotArbiterState();
    presentationEventCursorRef.current = initialPresentationEventCursor();
    seenRollIdsRef.current = null;
    // Each room gets its own recovery attempt, even on the same server boot.
    restoredForBootRef.current = null;
    // No eager reset of the RTT sample / pending echoes on a room switch: the
    // RTT measures the transport host (same for every room, refreshed by the
    // first ack), and echo entries self-clear via their submit's settle path
    // plus the TTL sweeps. A synchronous setState here would cascade renders.

    const connection = connectRoom(
      roomId,
      {
        onSnapshot: ingestSnapshot,
        onStatus: setSyncStatus,
        // Round-trip samples (pong / action ack) feed the RTT chip. The
        // functional update returns the SAME reference when the displayed
        // value is unchanged, so React skips the re-render.
        onQuality: (quality) => setConnectionQuality((prev) => retainQualitySample(prev, quality)),
        // A transient drop may have let the server reap this client's unseated
        // membership — arm the join effect's re-join (see connectionDroppedRef).
        onDropped: () => {
          connectionDroppedRef.current = true;
        },
        // The host closed this room: drop the cached game and return to the lobby.
        onClosed: () => {
          clearCachedRoom(roomId);
          setErrors(["This room was closed by the host."]);
          setState(null);
          setRoomVersion(0);
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname);
          }
          setRoomId(null);
        }
      },
      clientId,
      // Verified-identity seats (Phase 2): on the cross-origin PartyKit edge a
      // signed-in player attaches a short-lived socket ticket so the server binds
      // their seat to the verified account. A guest resolves undefined and simply
      // connects unauthenticated; the built-in backend ignores this (it reads the
      // same-origin session cookie directly).
      //
      // ALWAYS ask for the ticket rather than gating on the localStorage account
      // cache: the httpOnly SESSION COOKIE is the real source of truth, and
      // fetchSocketToken() rides it (same-origin) — so a player signed in by
      // cookie but with a missing/stale local cache (a fresh device, a direct
      // link straight into the room, cleared storage) still gets bound to their
      // account instead of being shown as a guest. A true guest just gets a 401
      // → undefined and connects unauthenticated, exactly as before.
      () => fetchSocketToken()
    );
    connectionRef.current = connection;

    connection
      .fetchSnapshot()
      .then((snapshot) => ingestSnapshot(snapshot, { seatAuthoritative: true }))
      .catch(() => setSyncStatus("room sync failed"));

    return () => {
      connection.close();
      connectionRef.current = null;
    };
  }, [roomId, ingestSnapshot, clientId]);

  // Single-player save slots: a Load clicked on the /single-player menu page
  // (no live connection there) navigates here with a pending marker; apply it
  // ONCE per room as soon as the connection and the first snapshot exist. The
  // server validates owner + solo mode, and a stale or foreign marker is
  // dropped by takePendingSinglePlayerLoad itself.
  const pendingSpLoadRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || !state || pendingSpLoadRoomRef.current === roomId) {
      return;
    }
    const connection = connectionRef.current;
    if (!connection) {
      return;
    }
    pendingSpLoadRoomRef.current = roomId;
    const pending = takePendingSinglePlayerLoad(roomId);
    if (!pending) {
      return;
    }
    connection
      .loadSinglePlayerSave(pending.state)
      .then((snapshot) => ingestSnapshotRef.current(snapshot, { seatAuthoritative: true }))
      .catch((error) => {
        // The in-game save panel remains the manual fallback.
        console.warn("Pending single-player load failed:", error);
      });
  }, [roomId, state]);

  const submitAction = async (action: GameAction) => {
    // The human is taking their turn: snap any in-flight computer-move replay to
    // the settled positions so a paced pawn never lags under a fresh action.
    cancelComputerReplayRef.current();

    const inputAt = metricNow();
    recordPerformanceMetric({ name: "room.action.input", at: inputAt, fields: { actionType: action.type } });
    // The action actually sent to the engine — a costed board-target play that
    // was armed "discard first" gets its banked payment attached here.
    let outgoing = action;

    // A play with a printed discard / Power cost (View Air tiers, Xyron's
    // Inferno, "discard N: …" options) opens the cost picker first when the
    // cost has not been paid yet. The reaction tray pays its own costs, so it
    // always passes costCardIds.
    if (action.type === "PLAY_CARD" && !action.costCardIds) {
      const card = cardLibrary[action.cardId];
      const option =
        card?.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
          ? card.effect.options[action.optionIndex]
          : undefined;
      const cost = option?.cost;
      if (
        cost &&
        (cost.discardCards !== undefined ||
          cost.discardCardsUpTo !== undefined ||
          cost.powerCost !== undefined)
      ) {
        // "Discard first": a board-target play banks its discard when the card is
        // selected, so the payment is ready by the time the target is clicked —
        // attach it and play. Only fall back to the picker when the play was NOT
        // pre-armed (a no-target costed play submitted straight from the hand).
        const banked = armedPaymentFor(armedCardPayment, action);
        if (banked) {
          outgoing = { ...action, costCardIds: banked };
        } else {
          setPendingCostPlay({
            action,
            exact: cost.discardCards,
            upTo: cost.discardCardsUpTo,
            powerCost: cost.powerCost,
            filter: cost.costCardFilter,
            picks: [],
            pickModes: []
          });
          return;
        }
      }
    }

    // Pre-battle troop gate: a hero move that walks straight into a Combat while
    // the player can still buy troops pops a "keep moving, or stop and recruit?"
    // confirmation so the fight is never entered under-strength by mistake.
    // Skipped for the replay the confirmation itself fires. Legal actions are
    // recomputed here (only for a move) so "can buy troops" reflects live rules.
    if (battleTroopConfirmedRef.current) {
      battleTroopConfirmedRef.current = false;
    } else if (state && (action.type === "MOVE_HERO" || action.type === "MOVE_HERO_PATH")) {
      const moveLegalActions = getLegalActions(state, viewerPlayerId);
      if (moveIntoBattleWithTroopsToBuy(state, viewerPlayerId, action, moveLegalActions)) {
        setPendingBattleTroopWarn(action);
        return;
      }
    }

    const connection = connectionRef.current;
    if (!connection) {
      return false;
    }

    // Pending-action echo (plan N2): register the submit. A duplicate of the
    // SAME action while its first copy is still unacknowledged is refused
    // client-side (the double-click latch); the entry also drives the hand
    // panels' in-flight dim. Presentation + latch only — GameState is never
    // predicted, and the entry self-clears in the finally below.
    const echoBegin = beginPendingEcho(pendingEchoesRef.current, outgoing, echoNow());
    pendingEchoesRef.current = echoBegin.state;
    setPendingEchoView(echoBegin.state);
    if (!echoBegin.accepted) {
      return false;
    }

    setSyncStatus("submitting");
    recordPerformanceMetric({
      name: "room.action.validation",
      at: inputAt,
      durationMs: metricNow() - inputAt,
      fields: { actionType: outgoing.type }
    });
    try {
      const payload = await connection.submitAction(outgoing);
      // A successful action can still carry a player-facing notice: e.g. a Clone
      // cast that could not reach the chosen unit's grade is refunded (card +
      // Power returned) rather than wasted, and says so. Surface those alongside
      // any rules errors so the player sees why nothing changed.
      setErrors([...payload.errors.map((error) => error.message), ...payload.notices]);
      setSyncStatus(`acknowledged v${payload.version}`);

      if (payload.errors.length === 0) {
        setSelectedCardAction(null);
        setArmedCardPayment(null);
        setHandMode(null);
        setHandDiscards([]);
        setTilePlacement(null);
      } else if (payload.version !== snapshotArbiterRef.current.version) {
        // The server refused an action the local table thought was legal: the
        // local snapshot is stale (missed frames, server restart). Resync so
        // the next click works instead of staying frozen on old state.
        connection
          .fetchSnapshot()
          .then((snapshot) => ingestSnapshot(snapshot, { seatAuthoritative: true }))
          .catch(() => {
            /* the live stream keeps trying */
          });
      }
      return payload.errors.length === 0;
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "The action could not be submitted."]);
      setSyncStatus("submit failed");
      // Network hiccup mid-submit: the action may or may not have landed.
      // Refetch the authoritative state either way.
      connection
        .fetchSnapshot()
        .then((snapshot) => ingestSnapshot(snapshot, { seatAuthoritative: true }))
        .catch(() => {
          /* the live stream keeps trying */
        });
      return false;
    } finally {
      // Echo settle (ack, error result, or thrown submit/timeout alike):
      // dropping the entry restores the card's normal presentation.
      const settled = resolvePendingEcho(pendingEchoesRef.current, echoBegin.id);
      pendingEchoesRef.current = settled;
      setPendingEchoView(settled);
    }
  };

  const onRename = useCallback((name: string) => {
    persistDisplayName(name);
    setDisplayNameState(name);
  }, []);

  // Register this client in the room once per (room, name): on first load, after
  // a rename, or after switching rooms. Deliberately NOT re-sent on every
  // snapshot, so a kicked player does not silently auto-rejoin.
  const joinedRoomRef = useRef<string | null>(null);
  // A signed-in player whose member is still flagged guest (their JOIN reached
  // the server before its verified token could resolve) is re-JOINed ONCE to
  // upgrade it — the fix for "a real account is shown as guest in the roster".
  // Bounded to one attempt per room so a genuinely unverifiable session (edge
  // misconfig) can never spin the effect: keyed by the room we last tried.
  const verifiedUpgradeRoomRef = useRef<string | null>(null);
  // Why a JOIN_ROOM was refused, if it was (e.g. a guest hitting a room that
  // requires a verified account). The engine returns this in result.errors
  // rather than throwing, so it would otherwise be swallowed — leaving the
  // viewer a non-member who can never seat. Surfaced in the seat panel below.
  const [roomJoinError, setRoomJoinError] = useState<string | null>(null);
  // Room join password: the value the viewer supplied for a password-protected
  // room, sent in JOIN_ROOM. Submitting it clears the one-shot join guard so the
  // effect re-joins WITH the password. Both the submitted value and the live
  // input draft are TAGGED with the room they belong to, so switching rooms reads
  // back "" without any reset effect (which would be a cascading setState).
  const [joinPasswordEntry, setJoinPasswordEntry] = useState<{ roomId: string; value: string }>({
    roomId: "",
    value: ""
  });
  // Prefer a password the player typed in the lobby (or re-typed in-room).
  const pendingLobbyPassword =
    pendingRoomPasswordRef.current && pendingRoomPasswordRef.current.roomId === roomId
      ? pendingRoomPasswordRef.current.password
      : "";
  const joinRoomPassword =
    joinPasswordEntry.roomId === roomId && joinPasswordEntry.value
      ? joinPasswordEntry.value
      : pendingLobbyPassword;
  const [joinDraftEntry, setJoinDraftEntry] = useState<{ roomId: string; value: string }>({
    roomId: "",
    value: ""
  });
  const joinPasswordDraft = joinDraftEntry.roomId === roomId ? joinDraftEntry.value : "";
  useEffect(() => {
    const connection = connectionRef.current;
    if (!roomId || !state || !connection) {
      return;
    }
    const desiredName = displayName.trim() || "Player";
    const joinKey = `${roomId}:${desiredName}`;
    const me = state.room?.members.find((member) => member.clientId === clientId) ?? null;

    // Apply a name chosen at create time once we are a member of that room (the
    // API backend already seeded it server-side; PartyKit relies on this path).
    const applyPendingName = () => {
      const pending = pendingRoomNameRef.current;
      if (pending && pending.roomId === roomId && pending.name) {
        pendingRoomNameRef.current = null;
        void connection.submitAction({ type: "SET_ROOM_NAME", clientId, name: pending.name }).catch(() => {});
      }
      // Closed table: turn hosting on now that we are a member (idempotent — a
      // no-op if the room is already hosted, e.g. after a reconnect). Keep the
      // pending hint until the room actually shows hosted so a failed submit
      // (network blip) is retried on the next snapshot instead of stranding an
      // open table that can never record ranked W/L.
      const hostedRoomId = pendingRoomHostedRef.current;
      if (hostedRoomId && hostedRoomId === roomId) {
        if (state.room?.hosted) {
          pendingRoomHostedRef.current = null;
        } else {
          void connection
            .submitAction({ type: "SET_ROOM_HOSTED", clientId, hosted: true })
            .then(() => {
              pendingRoomHostedRef.current = null;
            })
            .catch(() => {
              /* retry on next snapshot while the ref stays set */
            });
        }
      }
      // Ranked/Normal: apply the chosen match type once we are a member (only
      // while still a setup lobby, matching the engine's lock; a no-op if the
      // room already carries the choice, e.g. the API backend seeded it).
      // Ranked always re-asserts hosted so seat identity exists for the ladder.
      const pendingRanked = pendingRoomRankedRef.current;
      if (pendingRanked && pendingRanked.roomId === roomId) {
        if (state.room?.ranked === pendingRanked.ranked) {
          pendingRoomRankedRef.current = null;
        } else if (state.phase === "setup" && Boolean(state.setupLobby)) {
          void connection
            .submitAction({ type: "SET_ROOM_RANKED", clientId, ranked: pendingRanked.ranked })
            .then(() => {
              pendingRoomRankedRef.current = null;
            })
            .catch(() => {
              /* retry on next snapshot */
            });
          if (pendingRanked.ranked && !state.room?.hosted) {
            void connection.submitAction({ type: "SET_ROOM_HOSTED", clientId, hosted: true }).catch(() => {});
          }
        }
      }
      // Battle Test: switch a freshly created room to combat-sandbox. Only ever
      // converts a brand-new adventure setup lobby — never wipes a game already
      // under way (the API backend already made it a sandbox, so this no-ops
      // there). Reset carries the room membership (name/host/seats) across.
      const pendingMode = pendingRoomModeRef.current;
      if (pendingMode && pendingMode.roomId === roomId && pendingMode.mode !== "adventure") {
        pendingRoomModeRef.current = null;
        if (state.mode !== pendingMode.mode && state.phase === "setup" && Boolean(state.setupLobby)) {
          void connection.resetRoom({ mode: pendingMode.mode }).catch(() => {});
        }
      }
    };

    // Membership reaped after a transient disconnect: the server drops an
    // unseated member (observer / open-table member) when its connection dies,
    // and the one-shot guard below would otherwise never re-join — leaving the
    // viewer a permanent non-member until they navigate rooms. Only an observed
    // connection DROP arms this; a kick over a live socket does not, so a
    // kicked player still never silently auto-rejoins.
    const reapedAfterDrop = !me && connectionDroppedRef.current;
    // Signed in, but the server still sees this member as a guest (no bound
    // userId): the JOIN landed before its verified token resolved. Re-send JOIN
    // once — carrying a fresh verified token — so the member upgrades and the
    // roster stops labelling a real account "guest". One attempt per room
    // (verifiedUpgradeRoomRef) so an unverifiable session never loops.
    const needsVerifiedUpgrade =
      Boolean(accountUserId) && Boolean(me) && !me?.userId && verifiedUpgradeRoomRef.current !== roomId;
    if (joinedRoomRef.current === joinKey && !reapedAfterDrop && !needsVerifiedUpgrade) {
      if (me) {
        // Membership confirmed on live state — clear any drop since then.
        connectionDroppedRef.current = false;
        setRoomJoinError(null);
        applyPendingName();
      }
      return;
    }
    if (reapedAfterDrop) {
      connectionDroppedRef.current = false;
    }
    if (needsVerifiedUpgrade) {
      verifiedUpgradeRoomRef.current = roomId;
    }
    joinedRoomRef.current = joinKey;
    // Already a member under this name (carried across a reset / reconnect)? Adopt
    // it — UNLESS we still need the verified upgrade (fall through to re-JOIN so
    // the guest-flagged member gets its account id stamped).
    if (me && me.name === desiredName && !needsVerifiedUpgrade) {
      setRoomJoinError(null);
      applyPendingName();
      return;
    }
    // Fire-and-forget through the connection directly: the live stream delivers
    // the resulting snapshot. (Routing JOIN through the submitAction wrapper
    // would be a setState during this effect.) A REFUSED join comes back in
    // result.errors (not a throw), so capture it — otherwise the viewer is left
    // a silent non-member who can only get "That member is not in the room" if
    // they try to seat. A network/timeout rejection leaves the last state.
    void connection
      .submitAction({
        type: "JOIN_ROOM",
        clientId,
        name: desiredName,
        ...(joinRoomPassword ? { password: joinRoomPassword } : {})
      })
      .then((res) => {
        const joinError = res.errors[0]?.message ?? null;
        setRoomJoinError(joinError);
        if (!joinError) {
          applyPendingName();
        } else {
          // Let a later change (e.g. the host lifting the account requirement,
          // the player signing in, or a room password being entered) re-attempt
          // the join instead of latching.
          joinedRoomRef.current = null;
        }
      })
      .catch(() => {});
  }, [state, roomId, displayName, clientId, accountUserId, joinRoomPassword]);

  // Global presence while IN a room: heartbeat to the lobby's "Players online"
  // board so this player shows up as "in <room>" (and can be invited/joined),
  // the same board the /play lobby feeds when idle. Read the live room name and
  // display name from refs so the interval stays stable (keyed only on the
  // room/tab) instead of restarting on every snapshot. The refs are refreshed
  // in an effect (never during render) so the interval always sees current data.
  const presenceStateRef = useRef<GameState | null>(null);
  const presenceNameRef = useRef<string>("");
  useEffect(() => {
    presenceStateRef.current = state;
    presenceNameRef.current = displayName;
  });
  useEffect(() => {
    if (!roomId) {
      return;
    }
    const beat = () => {
      const liveState = presenceStateRef.current;
      const roomName = liveState ? roomDisplayName(liveState, roomId) : undefined;
      // Fresh setup lobby = "setting up"; anything else (game started, combat
      // sandbox mid-fight, post-setup phases) = "playing" so the online list
      // and lobby can tell a live game from an empty seating screen.
      const roomStatus =
        liveState &&
        liveState.phase === "setup" &&
        (Boolean(liveState.setupLobby) || Boolean(liveState.combatSandboxSetup))
          ? ("setup" as const)
          : ("playing" as const);
      void sendPresence({
        clientId,
        name: presenceNameRef.current.trim() || "Player",
        roomId,
        ...(roomName ? { roomName } : {}),
        roomStatus
      });
    };
    beat();
    // 30 s cadence against the 120 s presence TTL (was 12 s — 10× the need),
    // and hidden tabs skip beats entirely: every same-origin /api request is a
    // billed edge request on the production host, and beating again the moment
    // the tab is visible snaps the board back to fresh data anyway.
    const intervalId = window.setInterval(() => {
      if (!pollTickAllowed()) {
        return;
      }
      beat();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      // Drop off promptly on leaving the room (back to lobby / new room / tab
      // close); the lobby browser re-registers us as idle within its next poll.
      leavePresence(clientId);
    };
  }, [roomId, clientId]);

  // The room member this client acts as: matched by this tab's clientId, or —
  // when signed in — by the verified account id. The engine's one-account-one-
  // seat rule re-binds a member's clientId to the account's LATEST tab, so an
  // older tab (or a reconnect that re-verified late) must still recognise its
  // own seat: the server accepts its actions by userId regardless of clientId.
  const myMember = (() => {
    if (!state?.room) {
      return null;
    }
    const byClient = state.room.members.find((member) => member.clientId === clientId);
    if (byClient) {
      return byClient;
    }
    return accountUserId
      ? (state.room.members.find((member) => member.userId === accountUserId) ?? null)
      : null;
  })();
  // Hosted rooms drive the viewer's seat from their host assignment (seats are
  // locked); open tables keep the manual seat switcher untouched.
  const hostedSeat: PlayerId | typeof OBSERVER_SEAT | null = (() => {
    if (!state?.room?.hosted) {
      return null;
    }
    const seat = myMember?.seat ?? "observer";
    return seat !== "observer" && state.players[seat] ? seat : OBSERVER_SEAT;
  })();
  // Whether the viewer has actually JOINED the room yet. The seat-claim buttons
  // dispatch ASSIGN_SEAT keyed by the member's clientId, which the engine
  // refuses with "That member is not in the room" unless a matching member
  // exists — so a non-member (JOIN still in flight on connect, or refused) must
  // never be shown a Take-seat button that can only fail. Distinct from
  // hostedSeat, which collapses "no membership" and "observer member" into the
  // same value.
  const isRoomMember = Boolean(myMember);
  // Membership actions (ASSIGN_SEAT self-serve) validate by the MEMBER's
  // clientId — use it, so a signed-in player whose member is bound to another
  // tab's clientId can still take/leave a seat from this one.
  const memberClientId = myMember?.clientId ?? clientId;
  // Adjust the locked seat during render (React's supported "derive state from
  // props" pattern) rather than in an effect; it converges in one extra render
  // once viewerPlayerId already equals the assignment.
  if (hostedSeat && hostedSeat !== viewerPlayerId) {
    setViewerPlayerId(hostedSeat);
  }

  /**
   * Resolve a fully-paid discard/Power-cost picker with an explicit set of picks.
   * For a "discard first" arming (`armSelection` set) it BANKS the payment and
   * arms the selection for board targeting (the play is sent later, when the
   * target is clicked and submitAction re-attaches it); otherwise it submits
   * straight away.
   */
  const resolveCostPlay = (
    pending: NonNullable<typeof pendingCostPlay>,
    picks: number[],
    pickModes: ("basic" | "expert")[],
    hand: string[],
    bookCardId?: string
  ) => {
    const costCardIds = [
      ...picks.map((index) => hand[index]),
      ...(bookCardId ? [bookCardId] : [])
    ];
    // Index-aligned modes: hand sources by their chosen mode, then the Book
    // Spell (always basic — a Spell has no expert Power side).
    const fullModes: ("basic" | "expert")[] = [
      ...pickModes,
      ...(bookCardId ? (["basic"] as ("basic" | "expert")[]) : [])
    ];
    const costCardModes = fullModes.some((mode) => mode === "expert") ? fullModes : undefined;
    const armSelection = pending.armSelection;
    if (armSelection) {
      setArmedCardPayment({
        cardId: armSelection.cardId,
        optionIndex: armSelection.type === "PLAY_CARD" ? armSelection.optionIndex : undefined,
        costCardIds
      });
      setSelectedCardAction(armSelection);
    } else {
      void submitAction({
        ...pending.action,
        costCardIds,
        ...(costCardModes ? { costCardModes } : {})
      });
    }
    setPendingCostPlay(null);
  };

  /** Toggle a hand card as payment for the pending discard/Power-cost play. */
  const toggleCostPick = (index: number, hand: string[]) => {
    const pending = pendingCostPlay;
    if (!pending) {
      return;
    }
    const has = pending.picks.includes(index);
    // Power-value costs have no fixed card count — pick any number of sources.
    const max =
      pending.powerCost !== undefined
        ? hand.length
        : (pending.exact ?? pending.upTo ?? 0);
    if (!has && pending.picks.length >= max && pending.powerCost === undefined) {
      return;
    }
    let nextPicks: number[];
    let nextModes: ("basic" | "expert")[];
    if (has) {
      const at = pending.picks.indexOf(index);
      nextPicks = pending.picks.filter((value) => value !== index);
      nextModes = pending.pickModes.filter((_, i) => i !== at);
    } else {
      nextPicks = [...pending.picks, index];
      nextModes = [...pending.pickModes, "basic"];
    }

    // "Click to discard, then aim": picking the final card of an EXACT discard
    // cost in arming mode banks the payment and starts aiming immediately — no
    // separate "Discard, then aim" click (Frost Ring's one-card discard is the
    // common case). An up-to cost still confirms explicitly (fewer may be meant).
    // Power-value costs never auto-arm (exact count is undefined).
    const bookCount = pending.bookCardId ? 1 : 0;
    if (shouldAutoArmOnPick(pending, nextPicks.length + bookCount)) {
      resolveCostPlay(pending, nextPicks, nextModes, hand, pending.bookCardId);
      return;
    }

    setPendingCostPlay({ ...pending, picks: nextPicks, pickModes: nextModes });
  };

  /**
   * Confirm the discard picker (the explicit "Pay & play" / "Discard, then aim"
   * button, and the only path for an `up-to` cost). Exact costs normally auto-arm
   * on the final pick (see toggleCostPick), so this covers the up-to case.
   */
  const confirmPendingCostPlay = (hand: string[]) => {
    if (!pendingCostPlay) {
      return;
    }
    resolveCostPlay(
      pendingCostPlay,
      pendingCostPlay.picks,
      pendingCostPlay.pickModes,
      hand,
      pendingCostPlay.bookCardId
    );
  };

  /**
   * Select a board-target card for aiming. "Discard first to use": if the card
   * carries a printed discard cost, open the discard picker BEFORE targeting (an
   * `armSelection`); confirming it banks the payment and then arms targeting.
   * Cards with no such cost select straight away, and clearing the selection also
   * drops any banked payment.
   */
  const selectBoardCardAction = (action: CardBoardAction | null) => {
    if (!action) {
      setSelectedCardAction(null);
      setArmedCardPayment(null);
      return;
    }
    const cost = boardCardDiscardCost(action, cardLibrary);
    if (cost && action.type === "PLAY_CARD") {
      setPendingCostPlay({
        action,
        armSelection: action,
        exact: cost.discardCards,
        upTo: cost.discardCardsUpTo,
        powerCost: cost.powerCost,
        filter: cost.costCardFilter,
        picks: [],
        pickModes: []
      });
      return;
    }
    setSelectedCardAction(action);
  };

  const resetRoom = async (mode: "adventure" | "combat-sandbox") => {
    const connection = connectionRef.current;
    if (!connection || !roomId) {
      setErrors(["Not connected to the room yet — give it a second and try again."]);
      return;
    }

    // A reset wipes the running game for every seat. Hosted-room rule (the
    // server enforces it; this guard just fails fast for the clear-cut case):
    // the host always may; members may once the host is offline (the server
    // knows connectivity, so members always get to ASK); strangers never —
    // unless this browser carries the developer's admin key, which the server
    // verifies against its HOMM3BG_ADMIN_KEY.
    const room = state?.room;
    const isMember = Boolean(room?.members.some((member) => member.clientId === clientId));
    const hasAdminKey = Boolean(
      typeof window !== "undefined" && window.localStorage.getItem("homm3bg.adminKey")
    );
    if (room?.hosted && !isMember && !hasAdminKey) {
      setErrors(["Only members of this room can start a new game in it."]);
      return;
    }

    // Step 1 — the network reset. This, and only this, decides whether the
    // reset failed: a thrown error here means the server never reset.
    let snapshot: GameRoomSnapshot;
    try {
      snapshot = await connection.resetRoom({ mode });
    } catch (resetError) {
      // An authority refusal is NOT a network failure: the room was left
      // untouched on purpose — say why and stop (no resync, no cache clear).
      if (isResetDenied(resetError)) {
        setErrors([(resetError as Error).message]);
        return;
      }
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
    presentationEventCursorRef.current = initialPresentationEventCursor();
    // A deliberate reset discards the saved game so a later recycle can't
    // "recover" it over the new room.
    clearCachedRoom(roomId);
    restoredForBootRef.current = null;
    try {
      ingestSnapshot(snapshot, { source: "reset", seatAuthoritative: true });
    } catch (ingestError) {
      console.error("Applying the reset snapshot failed.", ingestError);
    }
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

  // "New adventure" entry point. While a multiplayer game is IN PROGRESS this
  // does NOT wipe it immediately — it opens the "all players must confirm" vote
  // (resetVoteRequired), and the reset fires only once every live seat has
  // agreed (the effect below). A setup lobby, a solo game, a finished game and
  // the Battle Test sandbox reset directly, as before.
  const requestNewGame = (mode: "adventure" | "combat-sandbox") => {
    if (mode === "adventure" && state && resetVoteRequired(state) && viewerPlayerId !== OBSERVER_SEAT) {
      void submitAction({ type: "REQUEST_ROOM_RESET", playerId: viewerPlayerId, clientId });
      return;
    }
    void resetRoom(mode);
  };

  // The browser that opened a passed new-adventure vote completes it: once every
  // live seat has confirmed, fire the actual reset exactly once (the reset RPC
  // clears the vote for everyone). Keyed by the vote's opener+start so a single
  // vote fires a single reset, however many snapshots carry the approved state.
  // resetRoom is redefined each render, so keep the latest in a ref (updated in
  // an effect, never during render) for the fire effect to call.
  const resetRoomRef = useRef(resetRoom);
  useEffect(() => {
    resetRoomRef.current = resetRoom;
  });
  const resetVoteFiredRef = useRef<string | null>(null);
  useEffect(() => {
    const vote = state?.resetVote;
    if (!state || !vote || vote.startedByClientId !== clientId || !isResetVoteApproved(state)) {
      return;
    }
    const voteKey = `${vote.startedByClientId}:${vote.startedAt}`;
    if (resetVoteFiredRef.current === voteKey) {
      return;
    }
    resetVoteFiredRef.current = voteKey;
    void resetRoomRef.current("adventure");
  }, [state, clientId]);

  const switchToRoom = (nextRoomId: string) => {
    if (nextRoomId === roomId) {
      return;
    }
    // Entering (or RE-entering) a room is fresh presence: clear the one-shot JOIN
    // guard so membership is re-registered. The server reaps an unseated member
    // the moment their previous connection dropped (the fix for one computer
    // being counted as many), so without this a player who returns to a room they
    // just left would stay a non-member. This runs only on an explicit room
    // entry, never on a snapshot, so a host's KICK still doesn't auto-rejoin.
    joinedRoomRef.current = null;
    window.history.replaceState(null, "", `?room=${encodeURIComponent(nextRoomId)}`);
    setErrors([]);
    setSelectedCardAction(null);
    // Fresh room: drop the old snapshot so lower version numbers apply.
    setRoomVersion(0);
    setState(null);
    setFeedItems([]);
    setRoomInput(nextRoomId);
    setRoomId(nextRoomId);
  };

  const joinRoom = () => {
    const code = roomInput.trim();
    if (code) {
      switchToRoom(code);
    }
  };

  /** Open a brand-new room on the server (named/owned), then go to it. */
  const createRoom = () => {
    createRoomOnServer({ createdByName: displayName.trim() || undefined })
      .then(({ roomId: newRoomId }) => switchToRoom(newRoomId))
      .catch(() => setErrors(["Could not create the room."]));
  };

  /**
   * Leave the current room for the room browser it belongs to — the Multiplayer
   * lobby (/play) for an adventure, or the Battle Test lobby (/battle) for a
   * combat sandbox — so "Browse rooms" always lands on the matching kind of
   * table. Navigation unmounts this page, which closes the connection and drops
   * all in-room state.
   */
  const goToLobby = () => {
    router.push(state?.mode === "combat-sandbox" ? "/battle" : "/play");
  };

  /** Close (delete) the room the player is currently in, then go to the lobby. */
  const closeCurrentRoom = () => {
    if (!roomId) {
      return;
    }
    // A PLATFORM ADMIN closes through the SAME-ORIGIN app (cookie-verified, then
    // forwarded to the edge server-side) — the reliable path. The host/member
    // closing their OWN room keeps the direct edge close (their clientId is the
    // authority there). The host-close broadcast (onClosed) bounces clients.
    const closing =
      accountRole === "admin"
        ? requestAdminCloseRoom(roomId)
        : requestCloseRoom(roomId, clientId, fetchSocketToken);
    void closing.catch(() => {});
    goToLobby();
  };

  const isSeated = Boolean(state && viewerPlayerId !== OBSERVER_SEAT && state.players[viewerPlayerId]);
  // UI-check: ?demoTray=1 injects real permanent + ongoing cards for the seated
  // player so the tray boxes show real card art. Re-applied each render so a
  // server snapshot cannot wipe the preview while the flag is on.
  const [demoTrayOn, setDemoTrayOn] = useState(false);
  useEffect(() => {
    setDemoTrayOn(isDemoTrayEnabled());
  }, [roomId]);
  const uiState = useMemo(() => {
    if (!state || !isSeated || !demoTrayOn) {
      return state;
    }
    return seedDemoTrayCards(state, viewerPlayerId);
  }, [state, isSeated, demoTrayOn, viewerPlayerId]);
  const playerView = useMemo(
    () => (uiState ? getPlayerView(uiState, isSeated ? viewerPlayerId : OBSERVER_SEAT) : null),
    [uiState, viewerPlayerId, isSeated]
  );
  const legalActions = useMemo(
    () => (uiState && isSeated ? getLegalActions(uiState, viewerPlayerId) : []),
    [viewerPlayerId, uiState, isSeated]
  );

  const enableComputerAutoAdvance = useCallback(() => {
    const current = stateRef.current;
    if (current?.sessionMode !== "single-player") {
      return;
    }
    storeComputerAutoMatchSeed(current.seed);
    setAutoAdvanceMatchSeed(current.seed);
    cancelComputerReplayRef.current();
    setOpponentTurnSummary(null);
  }, []);

  // Catch-up snapshots may contain several computer moves. In auto mode, start
  // their visual replay without opening a blocking confirmation dialog.
  useEffect(() => {
    if (!autoAdvanceEnabled || !opponentTurnSummary || computerReplay.active) {
      return;
    }
    const timer = window.setTimeout(() => {
      const replay = opponentTurnSummary.replay;
      setOpponentTurnSummary(null);
      if (replay) {
        startComputerReplayRef.current(replay);
      }
    }, COMPUTER_AUTO_RECAP_MS);
    return () => window.clearTimeout(timer);
  }, [autoAdvanceEnabled, opponentTurnSummary, computerReplay.active]);

  // Auto-replayed catch-up walks still reveal one cell at a readable cadence.
  useEffect(() => {
    if (!autoAdvanceEnabled || !computerReplay.active) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (computerReplay.finished) {
        cancelComputerReplayRef.current();
      } else {
        stepComputerReplayRef.current();
      }
    }, REPLAY_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [autoAdvanceEnabled, computerReplay.active, computerReplay.finished, computerReplay.remainingSteps]);

  // The server still applies exactly one authoritative AI decision per action.
  // The hook only submits the already-legal advance when visual pacing is idle.
  usePacedComputerAdvance({
    enabled: autoAdvanceEnabled,
    roomKey: `${roomId ?? ""}:${state?.seed ?? ""}`,
    version: roomVersion,
    blocked: Boolean(
      firstRoll ||
        presentationActive ||
        opponentTurnSummary ||
        computerReplay.active ||
        syncStatus === "submitting",
    ),
    legalActions,
    submit: submitAction,
  });

  // Background-music scene, mirroring the three render branches below: the
  // map-setup lobby (menu theme), the adventure map (grass theme) and the
  // combat table (combat theme). Computed before the early return so the music
  // hook runs on every render (rules of hooks); a null state plays nothing.
  const musicScene: MusicScene | null = !state
    ? null
    : state.mode === "adventure" && Boolean(state.setupLobby) && state.phase === "setup"
      ? "menu"
      : state.mode === "combat-sandbox" && state.phase === "setup"
        ? "menu"
        : // PvP pre-battle preparation happens on the map, so keep the map theme
          // playing until the fight actually begins (deployment). AI-only SP
          // fights stay on the map theme (they never open the battle board).
          state.mode === "adventure" &&
          (!state.combat ||
            combatTab === "map" ||
            Boolean(state.combat.prep) ||
            (state.sessionMode === "single-player" && !combatHasHumanParticipant(state)))
          ? "map"
          : "combat";
  useBackgroundMusic(musicScene);

  // No room selected → this page has nothing to show anymore: the effect
  // above is already replacing it with /menu (the room browser lives on
  // /play). This renders during SSR/hydration and for the moment the
  // redirect takes; a shared ?room= link instead sets roomId right after
  // mount and never leaves this page.
  if (roomId === null) {
    return <LoadingScreen title="Opening the main menu…" />;
  }

  if (!state || !playerView) {
    return (
      <LoadingScreen
        // The room id comes from the URL, which the server cannot see
        // (LoadingScreen suppresses the hydration warning on the title).
        title={`Joining room “${roomId}”…`}
        status={syncStatus}
        // Real progress: the wallpaper of the setup lobby that renders next
        // and the adventure-map backdrop behind it.
        preloadSlots={JOIN_ROOM_PRELOAD_SLOTS}
      />
    );
  }

  // The board targets a selected card can land on. SPACE casts (Summon Elemental
  // onto an empty space, Inferno/Frost Ring area centres, Force Field, …) count
  // too — they glow on the board exactly like unit targets, so the banner must
  // not claim "no legal board target" just because the card aims at a space.
  const selectedCardTargetTypes: ("unit" | "space")[] = [];
  if (selectedCardAction) {
    for (const legal of legalActions) {
      const candidate = legal.action;
      if (
        (candidate.type === "CAST_SPELL" || candidate.type === "PLAY_CARD") &&
        candidate.cardId === selectedCardAction.cardId &&
        (candidate.target?.type === "unit" || candidate.target?.type === "space")
      ) {
        selectedCardTargetTypes.push(candidate.target.type);
      }
    }
  }
  const selectedCardTargetCount = selectedCardTargetTypes.length;
  const selectedCardHasUnitTarget = selectedCardTargetTypes.includes("unit");
  const selectedCardHasSpaceTarget = selectedCardTargetTypes.includes("space");

  const trayActive = Boolean(state.reactionWindow && state.reactionWindow.priorityPlayerId === viewerPlayerId);
  const seatIds = state.turnOrder.filter((playerId) => playerId !== NEUTRAL_PLAYER_ID);
  // Single-player: AI-only / neutral fights bulk-resolve off-screen. Never open
  // the battle board for them (even if a mid-tick frame briefly still has
  // combat). PvP — human is a participant — always shows at normal pace.
  const combatVisible = Boolean(
    state.combat &&
      (state.sessionMode !== "single-player" || combatHasHumanParticipant(state)),
  );
  // PvP pre-battle preparation is done on the adventure map, not the battlefield.
  // Once the fight is decided (e.g. a Retreat straight out of prep) the result
  // belongs on the battle screen, so the forced-map override lifts.
  const inBattlePrep =
    Boolean(state.combat?.prep) &&
    !state.combat?.outcome &&
    combatVisible;
  const adventureMode = state.mode === "adventure";
  const inLobby = Boolean(state.setupLobby) && state.phase === "setup";
  const inCombatSandboxSetup = isCombatSandboxSetup(state);

  const roomHosted = Boolean(state.room?.hosted);
  const lockedSeatLabel =
    hostedSeat && hostedSeat !== OBSERVER_SEAT ? state.players[hostedSeat]?.name ?? hostedSeat : "Observer";
  // Seats a player could occupy: the game's turn order once started, or the
  // lobby's seats during setup (turn order isn't populated until the map builds).
  const claimableSeatIds =
    inLobby && state.setupLobby ? state.setupLobby.seats.map((seat) => seat.playerId) : seatIds;
  const seatDisplayName = (seatId: PlayerId) =>
    state.players[seatId]?.name ??
    state.setupLobby?.seats.find((seat) => seat.playerId === seatId)?.name ??
    seatId;
  // Seats not held by another member — a player may self-serve into any of these
  // even in a hosted/closed room (the host can still move/kick anyone).
  const openHostedSeats = claimableSeatIds.filter(
    (seatId) =>
      !(state.room?.members ?? []).some((member) => member.clientId !== memberClientId && member.seat === seatId)
  );

  // Password gate for a joiner: a locked room (passwordHash present, even
  // redacted) the viewer has not joined shows a password prompt. Submitting it
  // stores the attempt and clears the one-shot join guard so the JOIN effect
  // re-fires WITH the password. Works for open AND hosted locked rooms.
  const roomLockedForViewer = Boolean(state.room?.passwordHash) && !isRoomMember;
  const submitJoinPassword = () => {
    const attempt = joinPasswordDraft.trim();
    if (attempt.length === 0) {
      return;
    }
    joinedRoomRef.current = null;
    setJoinPasswordEntry({ roomId, value: attempt });
  };
  // `.roomPasswordRow` keeps this gate VISIBLE while the in-game table controls
  // are collapsed behind the "Table" trigger (globals.css excludes it from the
  // collapse) — a locked-room joiner must be able to type the password without
  // first discovering a menu button.
  const roomPasswordPrompt = roomLockedForViewer ? (
    <div className="menuRow seatLocked roomPasswordRow" aria-label="Room password">
      <Lock aria-hidden="true" size={13} />
      <span className="seatClaimHint">
        {joinRoomPassword && roomJoinError && /password/i.test(roomJoinError)
          ? "Incorrect password — try again."
          : "This room is password-protected."}
      </span>
      <input
        aria-label="Room password"
        autoComplete="off"
        maxLength={32}
        onChange={(event) => setJoinDraftEntry({ roomId, value: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            submitJoinPassword();
          }
        }}
        placeholder="Enter password"
        type="password"
        value={joinPasswordDraft}
      />
      <button
        className="seatClaimButton"
        disabled={joinPasswordDraft.trim().length === 0}
        onClick={submitJoinPassword}
        type="button"
      >
        Join
      </button>
    </div>
  ) : null;

  // The same table-controls panel is rendered in the setup lobby, the Battle
  // Test setup, and the two in-game table screens (map + combat). Only the
  // in-game placements sit in the top-row band beside the HUD, so they carry
  // `tableMenuInline`, which strips EVERY wrapping box (no gem frame, no
  // border/background — scoped in globals.css) so the self-styled controls sit
  // bare in the band; the setup screens keep the ornate box. Behaviour is
  // identical either way.
  const inGameTable = !inLobby && !inCombatSandboxSetup;
  // Single-player Save / Load slots. Grouped with the "New adventure" control
  // as one game-lifecycle cluster at the end of the table menu (conventional
  // Save/Load-next-to-New-Game placement), not floating at the top.
  const singlePlayerSaveSection =
    state.sessionMode === "single-player" ? (
      <SinglePlayerSavePanel
        compact
        onFetchSaveState={() => {
          const connection = connectionRef.current;
          return connection
            ? connection.fetchSinglePlayerSave()
            : Promise.reject(new Error("Not connected to the room."));
        }}
        onLoadSave={async (saved) => {
          const connection = connectionRef.current;
          if (!connection) {
            throw new Error("Not connected to the room.");
          }
          const snapshot = await connection.loadSinglePlayerSave(saved);
          ingestSnapshotRef.current(snapshot, { seatAuthoritative: true });
        }}
        roomId={roomId}
        state={state}
      />
    ) : null;

  const tableMenu = (
    <div
      className={`tableMenu${inGameTable ? " tableMenuInline" : ""}${tableControlsOpen ? " controlsOpen" : ""}`}
      aria-label="Table controls"
    >
      {inGameTable ? (
        <button
          aria-expanded={tableControlsOpen}
          className="tableControlsToggle"
          onClick={() => setTableControlsOpen((current) => !current)}
          title={tableControlsOpen ? "Close table controls" : "Open room, connection, save and game controls"}
          type="button"
        >
          <MenuIcon aria-hidden="true" size={14} />
          <span>Table</span>
        </button>
      ) : null}
      {roomPasswordPrompt}
      {roomHosted ? (
        // Hosted/closed room: the host controls seats, but a player may still
        // self-serve into an OPEN seat or step down to observer — so joiners are
        // never stuck watching. The host keeps the move/kick controls in the Room
        // panel below.
        <div className="menuRow seatLocked" aria-label="Your seat">
          <Lock aria-hidden="true" size={13} />
          {hostedSeat === OBSERVER_SEAT && !isRoomMember ? (
            // Not a member yet: the JOIN is either still in flight or was
            // refused. Offering Take-seat here would only yield "That member is
            // not in the room", so show the real status instead.
            <span className="seatClaimHint">
              {roomJoinError ?? "Joining the room…"}
            </span>
          ) : hostedSeat === OBSERVER_SEAT ? (
            <>
              <span>You are an observer —</span>
              {openHostedSeats.length > 0 ? (
                openHostedSeats.map((seatId) => (
                  <button
                    className="seatClaimButton"
                    key={seatId}
                    onClick={() =>
                      void submitAction({
                        type: "ASSIGN_SEAT",
                        clientId: memberClientId,
                        targetClientId: memberClientId,
                        seat: seatId
                      })
                    }
                    title={`Take the ${seatDisplayName(seatId)} seat and play`}
                    type="button"
                  >
                    Take {seatDisplayName(seatId)}
                  </button>
                ))
              ) : (
                <span className="seatClaimHint">every seat is taken — ask the host</span>
              )}
            </>
          ) : (
            <>
              <span>You are at {lockedSeatLabel}</span>
              <button
                className="seatClaimButton ghost"
                onClick={() =>
                  void submitAction({
                    type: "ASSIGN_SEAT",
                    clientId: memberClientId,
                    targetClientId: memberClientId,
                    seat: "observer"
                  })
                }
                title="Leave your seat and watch"
                type="button"
              >
                Leave seat
              </button>
            </>
          )}
        </div>
      ) : (
        // Open table: the original free local seat switcher (handy for testing).
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
      )}
      <RoomPanel
        clientId={clientId}
        displayName={displayName}
        onAction={(action) => void submitAction(action)}
        onBrowseRooms={goToLobby}
        onCloseRoom={closeCurrentRoom}
        onCreateRoom={createRoom}
        onRename={onRename}
        roomId={roomId}
        state={state}
        compact={inGameTable || (adventureMode && inLobby)}
      />
      {!inGameTable ? (
        <div className="menuRow roomRow">
          <input aria-label="Room ID" onChange={(event) => setRoomInput(event.target.value)} suppressHydrationWarning value={roomInput} />
          <button onClick={joinRoom} title="Join room" type="button">
            <StepForward aria-hidden="true" size={13} />
          </button>
        </div>
      ) : null}
      <div className="menuRow statusRow">
        {!inGameTable ? <span suppressHydrationWarning>{roomId}</span> : null}
        <small suppressHydrationWarning>
          {inGameTable ? `${syncStatus} · ${state.phase}` : `v${roomVersion} · ${syncStatus} · ${state.phase}`}
        </small>
        <ConnectionQualityChip sample={connectionQuality} />
        <MusicToggle />
        {/* Per-browser layout switch (also the escape hatch out of phone mode). */}
        <UiModeToggle />
      </div>
      {/* Game-lifecycle controls, grouped: restart the table, and (single-player)
          the Save / Load slots right beside it. The combat sandbox and the map
          designer are their own destinations on the main menu now (Battle Test /
          Map Designer), so they are not duplicated here. */}
      <div className="menuRow gameControlsRow" aria-label="Game controls">
        <div className="menuGroupLabel">Game</div>
        <button
          className="commandButton"
          onClick={() => requestNewGame(adventureMode ? "adventure" : "combat-sandbox")}
          title={
            adventureMode
              ? "Restart this table from a fresh map setup"
              : "Restart this arena with a fresh battle test"
          }
          type="button"
        >
          {adventureMode ? (
            <>
              <MapIcon aria-hidden="true" size={13} /> New adventure
            </>
          ) : (
            <>
              <Swords aria-hidden="true" size={13} /> New battle test
            </>
          )}
        </button>
        {singlePlayerSaveSection}
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

  // Table social overlays, mounted on every in-game screen (setup, map, combat).
  // Fixed-position, so they overlay whatever layout is beneath them and only
  // surface at a real multiplayer table (each component self-gates on the room):
  //  - table reactions (emotes): the floating "React" bar + drifting bubbles;
  //  - table chat: the collapsible, ephemeral live message dock (SEND_CHAT).
  const reactionsLayer = (
    <>
      <TableReactionsLayer
        state={state}
        onSend={(reactionId) =>
          void submitAction({
            type: "SEND_TABLE_REACTION",
            clientId,
            reactionId,
            name: displayName.trim() || undefined
          })
        }
      />
      <ChatPanel
        state={state}
        clientId={clientId}
        onSend={(text) => void submitAction({ type: "SEND_CHAT", clientId, text, at: Date.now() })}
      />
      {/* Room invite from the lobby / another table — Join switches into that room. */}
      <InvitePopup clientId={clientId} onJoinRoom={switchToRoom} />
      <AfkVotePanel
        state={state}
        viewerPlayerId={viewerPlayerId}
        onAction={(action) => void submitAction(action)}
      />
      <ResetVotePanel
        state={state}
        viewerPlayerId={viewerPlayerId}
        onAction={(action) => void submitAction(action)}
        canForceReset={Boolean(state.room?.hosted && myMember?.isHost)}
        onForceReset={() => void resetRoom("adventure")}
      />
    </>
  );

  const presentationSkipControl = presentationActive ? (
    <button
      className="commandButton ghost presentationSkip"
      onClick={() => skipPresentation("manual")}
      title="Clear visual holds and show the current authoritative game state"
      type="button"
    >
      Skip animation
    </button>
  ) : null;

  // ---- Map-setup lobby ------------------------------------------------------
  if (adventureMode && inLobby) {
    return (
      <CardZoomProvider>
        <main className={`tableRoot adventureRoot setupPhase${phoneUi ? " phoneMode" : ""}`} onClick={playTableUiClickSound}>
          {/* Green spirit wisps + gold-dragon shimmer over the setup backdrop. */}
          <SetupAmbientFx />
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
          {/* Before the game begins: pick Computer vs Phone layout (per browser). */}
          <UiModePrompt />
          <SetupLobbyScreen
            onAction={submitAction}
            state={state}
            viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
          />
          <LogDrawer state={state} viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT} />
          {reactionsLayer}
        </main>
      </CardZoomProvider>
    );
  }

  // ---- Battle Test free setup (factions / units / cards / battlefield) ------
  if (inCombatSandboxSetup) {
    return (
      <CardZoomProvider>
        <main className={`tableRoot adventureRoot setupPhase sandboxSetupPhase${phoneUi ? " phoneMode" : ""}`} onClick={playTableUiClickSound}>
          <div className="tableTopRow">
            <div className="advHud">
              <div className="advHudCell">
                <strong>Battle Test setup</strong>
                <small>build armies, then deploy like PvP</small>
              </div>
            </div>
            {tableMenu}
          </div>
          {errorBanner}
          {/* Before the game begins: pick Computer vs Phone layout (per browser). */}
          <UiModePrompt />
          {/* Same helper-tips opt-in as the map-setup lobby (Battle Test has no map lobby). */}
          <HelperCoachLobbyPrompt />
          <CombatSandboxSetupScreen
            onAction={submitAction}
            state={state}
            viewerPlayerId={isSeated ? viewerPlayerId : "p1"}
          />
          <LogDrawer state={state} viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT} />
          {reactionsLayer}
        </main>
      </CardZoomProvider>
    );
  }

  // Pending-action echo (plan N2): hand cards with a play in flight — dimmed
  // in BOTH hand panels (map + combat) until the ack/snapshot settles.
  const inFlightCardIds = pendingEchoCardIds(pendingEchoView);

  // ---- Adventure map screen -------------------------------------------------
  // Force the map in front during pre-battle prep so both sides plan with their
  // towns and resources in view, not on the empty battlefield.
  const showMapScreen = adventureMode && (!combatVisible || combatTab === "map" || inBattlePrep);

  if (showMapScreen) {
    const viewer = isSeated ? state.players[viewerPlayerId] : null;
    const handCards = isSeated ? (playerView.players[viewerPlayerId]?.hand ?? []) : [];
    // Spell Book (house rules): refreshed Spells stay owner-private; Polish
    // used Spells are face-up and remain visible on their greyed pages.
    const spellBookCards = isSeated ? (playerView.players[viewerPlayerId]?.spellBook ?? []) : [];
    const spellBookUsedCards = isSeated ? (playerView.players[viewerPlayerId]?.spellBookUsed ?? []) : [];
    const polishBook = polishSpellBookEnabled(state);
    // The panel is shown from the very start of the game (even empty) whenever
    // the house rule is on, so a player always knows the Book exists and can open
    // it to see whether it holds any Spells.
    const legacySpellBookOn = isSeated && (state.adventure?.spellBook ?? true);
    const spellBookOn = legacySpellBookOn || (isSeated && polishBook);
    const handLimit = viewer ? effectiveHandLimit(state, viewerPlayerId) : 0;
    const activeAstrologersEffect = getActiveAstrologersCard(state)?.effect;
    const explorersActive =
      activeAstrologersEffect?.type === "EMPOWER_PER_DISCARD" && activeAstrologersEffect.per > 0;
    const explorersDiscardPending =
      Boolean(viewer?.explorersDiscardPending) && hasOpenAdventureTurn(state, viewerPlayerId);
    // Over the hand limit at the start of the turn (only via card effects):
    // the player MUST discard down to the limit before acting. Parallel turns:
    // every open parallel turn counts as "my turn" here.
    const forcedDiscard = Boolean(viewer?.needsHandRefresh) && hasOpenAdventureTurn(state, viewerPlayerId);
    // The MANDATORY start-of-turn draw is pending this turn (every turn, including
    // the first): one either/or — "draw new" (discard nothing, draw up to the
    // limit) or "discard and draw new". Never both, since the hand is not
    // auto-drawn. Until it is taken, the engine blocks moving, exploring and
    // using cards (legal-actions withholds those offers), so the player can never
    // forget it.
    const canDraw =
      Boolean(viewer?.canMulligan) && hasOpenAdventureTurn(state, viewerPlayerId) && !forcedDiscard;
    // Round-1 fill-to-limit: may only ditch UNDER-limit cards (difficulty bonus
    // artifact). A full hand on R1 uses "Draw new" only; the full 0–N redraw is
    // the separate opening-mulligan step when the lobby option is ON.
    const r1UnderLimitFill =
      state.round === 1 && canDraw && handCards.length > 0 && handCards.length < handLimit;
    const r1FullHandNoFillDiscard = state.round === 1 && canDraw && handCards.length >= handLimit;
    // First-round opening Mulligan (default ON): after fill-to-limit, discard
    // 0–N to the deck and draw the same number (or keep).
    const canOpeningMulligan =
      Boolean(viewer?.canOpeningMulligan) &&
      hasOpenAdventureTurn(state, viewerPlayerId) &&
      !forcedDiscard &&
      !canDraw;
    const hasMorale = (viewer?.morale ?? 0) > 0;
    const moraleRedrawCardAvailable = legalActions.some(
      (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "redraw"
    );
    // Positive Morale card plays that only open during the holder's own combat
    // (+1 Attack/Defense for this Combat; remove a negative token from an own
    // unit). Offered straight from legal actions, so they appear exactly when
    // the engine accepts them.
    const moraleCombatPlays = legalActions.filter(
      (legal) =>
        legal.action.type === "SPEND_MORALE" &&
        (legal.action.benefit === "combat-bonus" || legal.action.benefit === "remove-token")
    );
    const coverOfDarknessAction = legalActions.find(
      (legal) =>
        legal.action.type === "USE_TOWN_BUILDING" &&
        legal.action.buildingId === "necropolis.cover_of_darkness"
    );
    const moraleOverflow = viewer?.moraleOverflow ?? 0;
    const overLimit = viewer ? handCards.length - handDiscards.length - handLimit : 0;
    const selecting =
      handMode !== null ||
      forcedDiscard ||
      explorersDiscardPending ||
      (canOpeningMulligan && handMode === "opening-mulligan");
    // Hand-step directives banner: a MANDATORY step (start-of-turn draw,
    // over-limit discard, opening Mulligan, or an open discard pick) gets the
    // prominent scroll banner; optional morale plays share the container in
    // its quiet form. Rendered OUTSIDE the one-line hand header so the fixed
    // desktop tray can anchor it above the cards — the cards used to paint
    // over the mandatory "Draw new" button there, making it unclickable.
    const handStepMandatory = canDraw || canOpeningMulligan || explorersDiscardPending || selecting;
    const handOptionalPlays =
      handMode === null &&
      !forcedDiscard &&
      !explorersDiscardPending &&
      (hasMorale ||
        moraleRedrawCardAvailable ||
        moraleCombatPlays.length > 0 ||
        Boolean(coverOfDarknessAction));
    // Parallel turns: a bystander (open parallel turn, NOT fighting) keeps the
    // map interactive while someone else's battle runs — they may flip to the
    // map tab and keep taking their quiet moves. Everyone else gets the classic
    // read-only map while a combat is open.
    const parallelMapBystander =
      combatVisible &&
      isParallelActor(state, viewerPlayerId) &&
      state.combat?.attackerPlayerId !== viewerPlayerId &&
      state.combat?.defenderPlayerId !== viewerPlayerId;
    const mapReadOnly = combatVisible && !parallelMapBystander;

    const confirmHandAction = () => {
      const discardCardIds = handDiscards.map((index) => handCards[index]);
      // Clear the picker BEFORE the request leaves the browser. PartyKit first
      // broadcasts the authoritative post-draw snapshot and then sends the
      // request's action-result. If the old slot indexes stay selected during
      // that gap, the replacement card occupying one of those slots is rendered
      // as though it too were being discarded — the reported "drew one, then
      // lost the new card" bug. The engine never removed it, but the stale local
      // selection made the new card look lost. Clearing optimistically is safe:
      // an error leaves the start-of-turn gate armed, so the player can reopen
      // the picker and retry without any card-state mutation.
      const mode = handMode;
      setHandMode(null);
      setHandDiscards([]);
      setOpenHandIndex(null);
      if (mode === "morale-redraw") {
        void submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "redraw", discardCardIds });
        return;
      }
      // Cover of Darkness always RETURNS here, even when its offer vanished
      // between opening the picker and confirming (a parallel-turn enemy attack
      // opens a combat, which withdraws every town action). Falling through
      // would fire REFRESH_HAND and discard the picked cards as a hand refresh.
      if (mode === "cover-of-darkness") {
        if (coverOfDarknessAction?.action.type === "USE_TOWN_BUILDING") {
          void submitAction({ ...coverOfDarknessAction.action, cardIds: discardCardIds });
        }
        return;
      }
      if (mode === "opening-mulligan") {
        void submitAction({ type: "OPENING_HAND_MULLIGAN", playerId: viewerPlayerId, discardCardIds });
        return;
      }
      if (explorersDiscardPending) {
        void submitAction({ type: "RESOLVE_EXPLORERS_DISCARD", playerId: viewerPlayerId, discardCardIds });
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
    type HandCardLegal = LegalAction & {
      action: Extract<GameAction, { type: "PLAY_CARD" | "ASTROLOGERS_HERO_EMPOWER" }>;
    };
    const playActionsByCard = new Map<string, HandCardLegal[]>();
    const bookPlayActionsByCard = new Map<string, PlayLegal[]>();
    for (const legal of legalActions) {
      if (legal.action.type === "ASTROLOGERS_HERO_EMPOWER") {
        const list = playActionsByCard.get(legal.action.cardId) ?? [];
        list.push(legal as HandCardLegal);
        playActionsByCard.set(legal.action.cardId, list);
        continue;
      }
      if (legal.action.type !== "PLAY_CARD") {
        continue;
      }
      if (legal.action.fromSpellBook) {
        const list = bookPlayActionsByCard.get(legal.action.cardId) ?? [];
        list.push(legal as PlayLegal);
        bookPlayActionsByCard.set(legal.action.cardId, list);
      } else {
        const list = playActionsByCard.get(legal.action.cardId) ?? [];
        list.push(legal as HandCardLegal);
        playActionsByCard.set(legal.action.cardId, list);
      }
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

    const startPlay = (legal: HandCardLegal) => {
      if (legal.action.type === "ASTROLOGERS_HERO_EMPOWER") {
        setOpenHandIndex(null);
        setArmedHandPlay(null);
        void submitAction(legal.action);
        return;
      }
      const cost = optionCostOf(legal.action);
      if (
        cost &&
        (cost.discardCards !== undefined ||
          cost.discardCardsUpTo !== undefined ||
          cost.powerCost !== undefined)
      ) {
        setPendingCostPlay({
          action: legal.action,
          exact: cost.discardCards,
          upTo: cost.discardCardsUpTo,
          powerCost: cost.powerCost,
          filter: cost.costCardFilter,
          picks: [],
          pickModes: []
        });
        setOpenHandIndex(null);
        return;
      }
      // Stage the play for an explicit Confirm instead of firing immediately, so
      // an accidental click is always cancellable. Nothing reaches the engine
      // until the player confirms.
      setOpenHandIndex(null);
      setArmedHandPlay({ action: legal.action, label: legal.label });
    };

    const confirmCostPlay = () => {
      if (!pendingCostPlay) {
        return;
      }
      resolveCostPlay(
        pendingCostPlay,
        pendingCostPlay.picks,
        pendingCostPlay.pickModes,
        handCards,
        pendingCostPlay.bookCardId
      );
    };

    // +Power banked on the map by a Sorcery / Scales "+Power, then draw" rider:
    // it counts toward a map Spell's tier exactly like a discarded power source,
    // so the picker shows fewer cards needed (and agrees with the engine, which
    // folds it into standing Power in payCardCost).
    const mapPowerBank = viewer?.mapSpellPowerBank ?? 0;
    // Live Power total for the map cost picker (View Air / Dimension Door tiers),
    // including the banked draw-rider Power and one optional Spell Book payment
    // (once-per-turn Book Power budget).
    const pendingPowerTotal = (() => {
      if (!pendingCostPlay?.powerCost) {
        return 0;
      }
      const schools = cardLibrary[pendingCostPlay.action.cardId]?.spellSchools ?? [];
      const fromHand = pendingCostPlay.picks.reduce((sum, handIndex, pickIndex) => {
        const payId = handCards[handIndex];
        const mode = pendingCostPlay.pickModes[pickIndex] ?? "basic";
        return sum + spellPowerValueOfCard(cardLibrary[payId], schools, mode);
      }, 0);
      const fromBook = pendingCostPlay.bookCardId
        ? spellPowerValueOfCard(cardLibrary[pendingCostPlay.bookCardId], schools)
        : 0;
      return mapPowerBank + fromHand + fromBook;
    })();
    const pendingPowerOk =
      pendingCostPlay?.powerCost === undefined ||
      (pendingPowerTotal >= pendingCostPlay.powerCost &&
        // No wasteful over-payment: every picked card must be necessary.
        (() => {
          const schools = cardLibrary[pendingCostPlay.action.cardId]?.spellSchools ?? [];
          const values = [
            ...pendingCostPlay.picks.map((handIndex, pickIndex) =>
              spellPowerValueOfCard(
                cardLibrary[handCards[handIndex]],
                schools,
                pendingCostPlay.pickModes[pickIndex] ?? "basic"
              )
            ),
            ...(pendingCostPlay.bookCardId
              ? [spellPowerValueOfCard(cardLibrary[pendingCostPlay.bookCardId], schools)]
              : [])
          ];
          return values.every((value) => pendingPowerTotal - value < (pendingCostPlay.powerCost ?? 0));
        })());
    const viewerCrownsLeft = viewer
      ? viewer.limits.expertUses +
        (viewer.combatStats.expertUseBonusThisRound ?? 0) -
        viewer.combatStats.expertUsesSpentThisRound
      : 0;
    // Multiple Power sources may each be upgraded with their OWN crown; the
    // selection must never spend more crowns than the viewer holds.
    const pendingCrownsSelected = (pendingCostPlay?.pickModes ?? []).filter((mode) => mode === "expert").length;
    const pendingCrownsOk = pendingCrownsSelected <= viewerCrownsLeft;

    // The Town window opens only for a seated viewer who actually owns a town.
    const viewerTown = isSeated
      ? Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId)
      : undefined;

    // Phone mode: the bottom tab bar's entries for this surface. The Hand tab
    // pulses while the MANDATORY start-of-turn hand step (or a forced discard)
    // is pending, so the gate that blocks the whole turn is never hidden
    // behind an inactive tab.
    const phoneMapTabs: PhoneTab[] = [
      { id: "map", label: "Map", icon: <MapIcon size={17} /> },
      ...(combatVisible && !inBattlePrep
        ? [{ id: "battle", label: "Battle", icon: <Swords size={17} /> }]
        : []),
      ...(isSeated
        ? [
            {
              id: "hand",
              label: "Hand",
              icon: <HandIcon size={17} />,
              badge: handCards.length,
              attention: canDraw || forcedDiscard,
              attentionLabel: forcedDiscard ? "Discard!" : "Draw!"
            }
          ]
        : []),
      { id: "army", label: "Army", icon: <Castle size={17} /> },
      { id: "decks", label: "Decks", icon: <Layers size={17} /> },
      ...(legalActions.some((legal) => legal.action.type === "END_TURN")
        ? [{ id: "end-turn", label: "End turn", icon: <CheckCircle2 size={19} />, action: true }]
        : []),
      { id: "menu", label: "Menu", icon: <MenuIcon size={17} /> }
    ];

    return (
      <CardZoomProvider>
        <main
          className={`tableRoot adventureRoot${phoneUi ? " phoneMode" : ""}`}
          data-phone-tab={phoneUi ? phoneMapTab : undefined}
          onClick={playTableUiClickSound}
        >
          {presentationSkipControl}
          <div className="tableTopRow">
            <AdventureHud
              eventLogControl={
                !phoneUi ? (
                  <LogDrawer state={state} viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT} />
                ) : undefined
              }
              legalActions={legalActions}
              onAction={submitAction}
              state={state}
              viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]}
            />
            {tableMenu}
          </div>

          {errorBanner}

          {/* Mid-game join: still ask the layout question once per browser. */}
          <UiModePrompt />
          {/* Mid-game join / skipped lobby: still ask once if no preference yet. */}
          <HelperCoachLobbyPrompt />

          {isSeated ? (
            <HelperCoachStrip
              legalActions={legalActions}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}

          {inBattlePrep ? (
            <PreBattlePanel
              legalActions={legalActions}
              onAction={submitAction}
              onOpenTown={viewerTown ? () => setTownOpen(true) : undefined}
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
            {leftRailExpanded ? (
              <button
                aria-label="Close expanded command panel"
                className="leftRailExpandedBackdrop"
                onClick={() => setLeftRailExpanded(false)}
                type="button"
              />
            ) : null}
            <div
              aria-label={leftRailExpanded ? "Full command panel" : undefined}
              aria-modal={leftRailExpanded || undefined}
              className={`leftRail${leftRailExpanded ? " leftRailExpanded" : ""}`}
              role={leftRailExpanded ? "dialog" : undefined}
            >
              <div className="leftRailToolbar">
                <strong>Command panel</strong>
                <button
                  aria-expanded={leftRailExpanded}
                  aria-label={leftRailExpanded ? "Return command panel to sidebar" : "View full command panel"}
                  className="leftRailExpandButton"
                  onClick={() => setLeftRailExpanded((expanded) => !expanded)}
                  title={leftRailExpanded ? "Return to the compact sidebar" : "Open every left-panel control in a large view"}
                  type="button"
                >
                  {leftRailExpanded ? <Minimize2 aria-hidden="true" size={14} /> : <Maximize2 aria-hidden="true" size={14} />}
                  <span>{leftRailExpanded ? "Back to sidebar" : "View all"}</span>
                </button>
              </div>
              {/* Town · Hero · Unit deck now anchor a vertical command column on
                  the left (Warcraft-style sidebar), freeing the whole center for
                  the map. Their fly-out boards open to the right, over the map. */}
              <div className="leftRailDock">
                {/* A seated player inspects any opponent's public state
                    (resources, units, hero level, buildings) with a small
                    click-to-open button. Kept at the TOP of the rail so it is
                    a compact button, never a big panel, and never reaches the
                    bottom-left chat dock. */}
                {isSeated ? (
                  <OpponentInfoDock seatIds={seatIds} state={state} variant="map" viewerPlayerId={viewerPlayerId} />
                ) : null}
                <TownHeroDock
                  armySeatId={isSeated ? viewerPlayerId : undefined}
                  heroSeatIds={isSeated ? [viewerPlayerId] : seatIds}
                  legalActions={isSeated ? legalActions : undefined}
                  onAction={isSeated ? submitAction : undefined}
                  onOpenTown={isSeated && viewerTown ? () => setTownOpen(true) : undefined}
                  state={state}
                  viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]}
                />
                {/* Anime hero map actions (Cultivation §5.6 / Hero Grades
                    §3.11): Train / Forced March / Heavenly Tribulation, shown
                    only while the engine offers them to this seat. */}
                {isSeated ? (
                  <HeroActionsDock legalActions={legalActions} onAction={submitAction} />
                ) : null}
                <MoraleCardsDock state={state} viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]} />
                {/* Live "if scored now" Victory-Points standings — visible to
                    everyone when the designed map turns VP mode on. */}
                <VictoryPointsDock state={state} viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]} />
              </div>
              {/* Game-over VP scoring breakdown (reads the VP_SCORING event). */}
              {state.phase === "game-over" ? (
                <VictoryPointsScoringOverlay state={state} viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]} />
              ) : null}
              {/* Observers see every seat's permanent(s) + unit deck listed here. */}
              {isSeated
                ? null
                : seatIds.map((playerId) => (
                    <div key={playerId}>
                      <PermanentSlot playerId={playerId} state={state} />
                      <ArmyPanel playerId={playerId} state={state} />
                    </div>
                  ))}
            </div>
            <div className="mapColumn">
              {/* The map fills the whole center column now — the town/hero/unit
                  dock moved to the left rail, so nothing crowds the map. The
                  Far-tile tray anchors to THIS wrapper, overlaying the map's
                  top-left corner. */}
              <div className="mapStage">
                <HexMapBoard
                  heroPositionOverrides={computerReplay.overrides ?? undefined}
                  legalActions={legalActions}
                  moveCue={moveCue}
                  onAction={submitAction}
                  placement={tilePlacement}
                  readOnly={mapReadOnly || !isSeated}
                  state={state}
                  view={playerView}
                  viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
                />
                {computerReplay.activePlayerId ? (
                  <div className="computerMovingBanner" role="status">
                    <span className="computerMovingDot" />
                    {state.players[computerReplay.activePlayerId]?.name ?? "Computer"} is moving…
                  </div>
                ) : null}
                {/*
                  Single-player map: manual pacing asks for Next while a computer
                  owns the decision. Skip confirmations switches only this match
                  to the paced auto-submit hook above. Hidden during first-player
                  dice so the ceremony finishes before any step is offered.
                */}
                {(() => {
                  const advanceLegal = legalActions.find(
                    (legal) => legal.action.type === "ADVANCE_COMPUTER",
                  );
                  const computerOwner = computerDecisionOwner(state);
                  // combatVisible is false for AI-only SP fights; PvP opens the
                  // board (combatVisible true) and auto-pumps — no Next gate.
                  const showGate =
                    Boolean(advanceLegal) &&
                    !autoAdvanceEnabled &&
                    !firstRoll &&
                    !opponentTurnSummary &&
                    !computerReplay.active &&
                    !combatVisible &&
                    state.sessionMode === "single-player";
                  if (!showGate || !advanceLegal) return null;
                  const name =
                    (computerOwner && state.players[computerOwner]?.name) ||
                    "Computer";
                  return (
                    <div
                      className="opponentTurnBackdrop"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Computer's turn — confirm next step"
                    >
                      <div className="opponentTurnCard">
                        <h2 className="opponentTurnTitle">{name}&apos;s turn</h2>
                        <p className="opponentTurnNoBattles">
                          Press Next for each map step. Neutral battles resolve
                          off-screen. PvP fights still play normally.
                        </p>
                        <div className="opponentTurnActions">
                          <button
                            type="button"
                            className="opponentTurnWatch"
                            onClick={() => {
                              void submitAction(advanceLegal.action);
                            }}
                          >
                            Next step →
                          </button>
                          <button
                            type="button"
                            className="opponentTurnSkip"
                            onClick={enableComputerAutoAdvance}
                          >
                            Skip confirmations
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {!autoAdvanceEnabled && (opponentTurnSummary || computerReplay.active) ? (
                  <OpponentTurnOverlay
                    cues={opponentTurnSummary?.cues ?? []}
                    hasReplay={Boolean(
                      opponentTurnSummary?.replay || computerReplay.active,
                    )}
                    replayPhase={
                      computerReplay.active
                        ? computerReplay.finished
                          ? "done"
                          : "stepping"
                        : "idle"
                    }
                    remainingSteps={computerReplay.remainingSteps}
                    onWatch={() => {
                      const replay = opponentTurnSummary?.replay;
                      if (replay) {
                        // Keep the overlay; only clear the queued payload once
                        // the walk starts so battle lines stay visible while stepping.
                        setOpponentTurnSummary((current) =>
                          current
                            ? { ...current, replay: null, cues: current.cues }
                            : current,
                        );
                        startComputerReplayRef.current(replay);
                      }
                    }}
                    onStepNext={() => {
                      stepComputerReplayRef.current();
                    }}
                    onDismiss={() => {
                      cancelComputerReplayRef.current();
                      setOpponentTurnSummary(null);
                    }}
                    onSkipConfirmations={enableComputerAutoAdvance}
                  />
                ) : null}
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
            </div>
          </div>

          {/* BOTTOM deck rail: the shared Spell / Neutral / Artifact / Event
              decks and their discard piles, laid out as a horizontal bar
              spanning the width under the map (the "library shelf"). */}
          <div className="advDecksBottom">
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

          {isSeated && viewerTown ? (
            <TownWindow
              errors={errors}
              legalActions={legalActions}
              onAction={submitAction}
              onClose={() => setTownOpen(false)}
              open={townOpen}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}

          {/* The real, two-page Spell Book overlay (opened by the top-bar tome). */}
          {isSeated && spellBookOn && spellBookOpen ? (
            <SpellBookModal
              cardIds={spellBookCards}
              usedCardIds={polishBook ? spellBookUsedCards : []}
              polishMode={polishBook}
              castsByCard={bookPlayActionsByCard}
              onCast={(legal) => {
                // Book casts come from bookPlayActionsByCard, so every one is a
                // PLAY_CARD legal — narrow it back for startPlay's staging.
                startPlay(legal as PlayLegal);
                setSpellBookOpen(false);
              }}
              onClose={() => setSpellBookOpen(false)}
            />
          ) : null}

          {isSeated ? (
            <div className={`adventureHand playerCardBar ${selecting ? "refreshing" : ""}`} aria-label="Your hand">
              {/* LEFT: deck+discard box + Spell Book on one row (same vertical center). */}
              <div className="ownDeckColumn" aria-label="Your deck, discard, and Spell Book">
                <div className="ownDeckToolsRow">
                  <AdventureOwnDeck
                    onShowPile={(title, cardIds, kind) => setPile({ title, cardIds, kind })}
                    view={playerView}
                    viewerPlayerId={viewerPlayerId}
                  />
                  {spellBookOn ? (
                    <div className={`spellBookPanel ${spellBookCards.length + spellBookUsedCards.length === 0 ? "empty" : ""}`}>
                      <button
                        aria-expanded={spellBookOpen}
                        aria-haspopup="dialog"
                        className={`spellBookToggle ${spellBookOpen ? "open" : ""}`}
                        onClick={() => {
                          const opening = !spellBookOpen;
                          setSpellBookOpen(opening);
                          if (opening) {
                            playSpellBookOpen();
                          }
                        }}
                        title={
                          polishBook
                            ? `${spellBookCards.length} refreshed, ${spellBookUsedCards.length} used — Cast a Spell is required`
                            : spellBookCards.length === 0
                              ? "Your Spell Book is empty — stash a hand Spell with its 📖 button to store it here"
                              : "Open your Spell Book — stored Spells you can cast (normal Spell limit applies)"
                        }
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- small pixelated game icon, not a content image */}
                        <img alt="" aria-hidden="true" className="spellBookIcon" src={assetUrl("/assets/ui/spell-book-button.png")} />
                        <span className="spellBookCount">
                          {polishBook
                            ? `${spellBookCards.length}/${spellBookCards.length + spellBookUsedCards.length}`
                            : spellBookCards.length}
                        </span>
                        <small>Spell Book</small>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* RIGHT column: permanents box on top, hand box below. */}
              <div className="handMain">
              <div className="permanentEffectsPanel" aria-label="Permanents, ongoing effects, and Spell Scrolls">
                <div className="trayBoxHeader">
                  <strong>Permanents &amp; Ongoing</strong>
                </div>
                <PermanentSlot
                  legalActions={legalActions}
                  onAction={submitAction}
                  playerId={viewerPlayerId}
                  state={uiState ?? state}
                  viewerPlayerId={viewerPlayerId}
                />
                {getPermanentCardIds(uiState ?? state, viewerPlayerId).length === 0 &&
                ((uiState ?? state).players[viewerPlayerId]?.ongoingCards?.length ?? 0) === 0 &&
                ((uiState ?? state).players[viewerPlayerId]?.scrolls?.length ?? 0) === 0 ? (
                  <small className="trayBoxEmpty">No permanent, ongoing, or Spell Scroll effects in play.</small>
                ) : null}
              </div>
              <div className="handArea" aria-label="Your hand">
              <div className="handTopBar">
                <small>
                  Hand {handCards.length}/{handLimit}
                </small>
              </div>
              {/* Hand-step directives: the mandatory start-of-turn draw /
                  over-limit discard / opening Mulligan / discard pick, plus
                  optional morale plays. Lives OUTSIDE the one-line header —
                  the desktop HUD re-anchors it as a fixed banner ABOVE the
                  tray, so the hand cards can never paint over its buttons. */}
              {handStepMandatory || handOptionalPlays ? (
              <div
                className={`handDirectives${handStepMandatory ? " mandatory" : ""}`}
                role="group"
                aria-label="Hand step"
              >
                {handStepMandatory ? (
                  <strong className="handDirectivesTitle">
                    {forcedDiscard
                      ? "Over the hand limit"
                      : explorersDiscardPending
                        ? "Explorers — choose discards"
                      : handMode === "opening-mulligan"
                        ? "Opening Mulligan"
                        : handMode === "mulligan"
                          ? "Discard & draw"
                          : handMode === "morale-redraw"
                            ? "Morale redraw"
                            : handMode === "cover-of-darkness"
                              ? "Cover of Darkness"
                              : canDraw
                              ? "Start of turn — draw your hand"
                              : "Opening Mulligan"}
                  </strong>
                ) : null}
                {forcedDiscard ? (
                  <span className="handWarning">
                    Over the hand limit: discard down to {handLimit}.{overLimit > 0 ? ` Pick ${overLimit} more.` : ""}
                  </span>
                ) : null}
                {/* Start-of-turn draw still pending: it is MANDATORY, so tell the
                    player they must draw (or discard and draw) before they can
                    move, explore or use a card. The engine withholds those
                    actions until the draw is taken. */}
                {canDraw && handMode === null ? (
                  <span className="handWarning drawWarning">
                    {explorersActive
                      ? "Explorers: first draw up to your hand limit. You will then choose any number of cards to discard."
                      : "You must draw (or discard under-limit cards and draw) before moving or using a card."}
                  </span>
                ) : null}
                {explorersDiscardPending ? (
                  <span className="handWarning drawWarning">
                    Explorers: select any number of cards to discard, then confirm. Every 3 discarded cards lets you
                    replace one Statistic with its Empowered version.
                  </span>
                ) : null}
                {canOpeningMulligan && handMode === null ? (
                  <span className="handHint mulliganHint">
                    Opening Mulligan available — keep your hand, or discard cards to your deck and redraw that many.
                  </span>
                ) : null}
                {r1FullHandNoFillDiscard && handMode === null ? (
                  <span className="handHint mulliganHint">
                    Round 1: draw to fill only. After your hand is full
                    {state.adventure?.startingHandMulligan !== false
                      ? ", you may Mulligan cards."
                      : " (opening Mulligan is off — keep the hand)."}
                  </span>
                ) : null}
                {r1UnderLimitFill && handMode === null ? (
                  <span className="handHint mulliganHint">
                    Round 1: you may discard your difficulty-bonus card(s), then draw up to {handLimit}.
                  </span>
                ) : null}
                {/* The mandatory start-of-turn draw: fill to hand limit. Round 1
                    only allows ditching under-limit cards (bonus artifact). Later
                    rounds may discard freely then draw up. */}
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
                        {!explorersActive && handCards.length > 0 && (state.round !== 1 || r1UnderLimitFill) ? (
                          <button className="commandButton" onClick={() => setHandMode("mulligan")} type="button">
                            {state.round === 1
                              ? "Discard bonus card(s) & draw up"
                              : "Discard and draw new"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {canOpeningMulligan ? (
                      <>
                        <span className="handHint">Opening Mulligan:</span>
                        <button
                          className="commandButton primary"
                          onClick={() =>
                            submitAction({
                              type: "OPENING_HAND_MULLIGAN",
                              playerId: viewerPlayerId,
                              discardCardIds: []
                            })
                          }
                          type="button"
                        >
                          Keep hand
                        </button>
                        {handCards.length > 0 ? (
                          <button
                            className="commandButton"
                            onClick={() => setHandMode("opening-mulligan")}
                            type="button"
                          >
                            Discard &amp; redraw
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {hasMorale || moraleRedrawCardAvailable ? (
                      <>
                        {hasMorale ? (
                          <button
                            className="commandButton"
                            onClick={() => submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "draw" })}
                            type="button"
                          >
                            Morale: draw 1
                          </button>
                        ) : null}
                        {handCards.length > 0 && (hasMorale || moraleRedrawCardAvailable) ? (
                          <button className="commandButton" onClick={() => setHandMode("morale-redraw")} type="button">
                            {hasMorale ? "Morale: redraw cards" : "Positive Morale: redraw cards"}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    {moraleCombatPlays.map((legal) => (
                      <button
                        className="commandButton"
                        key={legal.label}
                        onClick={() => submitAction(legal.action)}
                        type="button"
                      >
                        {legal.label}
                      </button>
                    ))}
                    {coverOfDarknessAction ? (
                      <button
                        className="commandButton"
                        onClick={() => {
                          setHandDiscards([]);
                          setHandMode("cover-of-darkness");
                        }}
                        type="button"
                      >
                        Cover of Darkness
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {selecting ? (
                  <div className="handButtons">
                    <span>
                      {handMode === "morale-redraw"
                        ? `Spend morale: discard ${handDiscards.length || "some"} and draw that many.`
                        : handMode === "cover-of-darkness"
                          ? `Cover of Darkness: discard ${handDiscards.length || "1 or 2"} and draw that many.`
                        : explorersDiscardPending
                          ? `Explorers: discard ${handDiscards.length} card${handDiscards.length === 1 ? "" : "s"} (you may choose 0).`
                          : handMode === "opening-mulligan"
                          ? `Discard ${handDiscards.length} card${handDiscards.length === 1 ? "" : "s"} to your deck and draw that many.`
                          : forcedDiscard
                            ? `Discard at least ${Math.max(0, handCards.length - handLimit)}, then draw up to ${handLimit}.`
                            : `Discard ${handDiscards.length} card${handDiscards.length === 1 ? "" : "s"}, then draw up to ${handLimit}.`}
                    </span>
                    <button
                      className="commandButton primary"
                      disabled={
                        handMode === "morale-redraw" || handMode === "cover-of-darkness"
                          ? handDiscards.length === 0
                          : forcedDiscard
                            ? overLimit > 0
                            : false
                      }
                      onClick={confirmHandAction}
                      type="button"
                    >
                      {handMode === "morale-redraw"
                        ? `Redraw ${handDiscards.length}`
                        : handMode === "cover-of-darkness"
                          ? `Discard ${handDiscards.length} & draw`
                        : explorersDiscardPending
                          ? handDiscards.length === 0
                            ? "Discard none"
                            : `Discard ${handDiscards.length}`
                          : handMode === "opening-mulligan"
                          ? handDiscards.length === 0
                            ? "Keep hand"
                            : `Discard ${handDiscards.length} & redraw`
                          : `Discard ${handDiscards.length} & draw`}
                    </button>
                    {!forcedDiscard && !explorersDiscardPending ? (
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
              ) : null}
              {pendingCostPlay ? (
                <div className="handButtons costPicker" aria-label="Pay the card cost">
                  <span>
                    {cardName(pendingCostPlay.action.cardId)}:{" "}
                    {pendingCostPlay.powerCost !== undefined
                      ? // Map power tiers: play the spell first, then add Power
                        // (like combat) — the bank + picked sources pay the tier.
                        `cast ready — add Power (${pendingPowerTotal}/${pendingCostPlay.powerCost} needed for this effect)`
                      : pendingCostPlay.exact !== undefined
                        ? `pick exactly ${pendingCostPlay.exact} card${pendingCostPlay.exact === 1 ? "" : "s"} to discard`
                        : `pick up to ${pendingCostPlay.upTo} card${(pendingCostPlay.upTo ?? 0) === 1 ? "" : "s"} to discard`}
                    {pendingCostPlay.filter === "spell"
                      ? " (Spell cards only)"
                      : pendingCostPlay.filter === "power-source"
                        ? " (Power statistics or Spells; crown = expert Power)"
                        : ""}{" "}
                    {pendingCostPlay.powerCost === undefined
                      ? `— ${pendingCostPlay.picks.length} picked`
                      : null}
                    {pendingCostPlay.powerCost !== undefined && mapPowerBank > 0 ? (
                      <em className="costPickerBankNote"> (+{mapPowerBank} banked from Sorcery/Scales)</em>
                    ) : null}
                  </span>
                  {pendingCostPlay.powerCost !== undefined && pendingCostPlay.picks.length > 0 ? (
                    <div className="costPickerModes" aria-label="Expert Power payments">
                      {pendingCostPlay.picks.map((handIndex, pickIndex) => {
                        const payId = handCards[handIndex];
                        const payCard = cardLibrary[payId];
                        const addPower =
                          payCard?.effect.type === "ADD_SPELL_POWER"
                            ? payCard.effect
                            : payCard?.effect.type === "CHOOSE_ONE"
                              ? payCard.effect.options.find((o) => o.effect.type === "ADD_SPELL_POWER")?.effect
                              : undefined;
                        const canExpert =
                          addPower?.type === "ADD_SPELL_POWER" &&
                          addPower.expertAmount !== undefined &&
                          addPower.expertAmount > addPower.amount &&
                          // Already expert (so it can be toggled back), or there
                          // is at least one crown still free for another upgrade.
                          (pendingCostPlay.pickModes[pickIndex] === "expert" ||
                            viewerCrownsLeft - pendingCrownsSelected > 0);
                        if (!canExpert) {
                          return null;
                        }
                        const isExpert = pendingCostPlay.pickModes[pickIndex] === "expert";
                        return (
                          <button
                            className={`commandButton ${isExpert ? "primary" : "ghost"}`}
                            key={`expert-pay-${handIndex}`}
                            onClick={() => {
                              setPendingCostPlay((current) => {
                                if (!current) {
                                  return current;
                                }
                                const nextModes = [...current.pickModes];
                                nextModes[pickIndex] = isExpert ? "basic" : "expert";
                                return { ...current, pickModes: nextModes };
                              });
                            }}
                            type="button"
                          >
                            {isExpert ? "Expert" : "Basic"} {cardName(payId)}
                            {addPower?.type === "ADD_SPELL_POWER"
                              ? ` (+${isExpert ? addPower.expertAmount : addPower.amount})`
                              : ""}
                            {isExpert ? " · 1 crown" : ""}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {/* Spell Book (house rule): one stashed Book Spell may pay map
                      Power costs (View Air / Fly tiers, …) — once per turn. */}
                  {((legacySpellBookOn && viewer && spellBookPowerAvailable(viewer)) ||
                    (polishBook &&
                      pendingCostPlay.action.cardId === "artifact.crown_of_dragontooth" &&
                      pendingCostPlay.filter === "spell")) &&
                  (pendingCostPlay.powerCost !== undefined ||
                    pendingCostPlay.exact !== undefined ||
                    pendingCostPlay.upTo !== undefined) ? (
                    <div className="costPickerModes" aria-label="Spell Book Power payments">
                      {[...new Set(polishBook ? [...spellBookCards, ...spellBookUsedCards] : spellBookCards)]
                        .filter((id) => id !== pendingCostPlay.action.cardId)
                        .filter((id) => {
                          if (!pendingCostPlay.filter) {
                            return cardLibrary[id]?.kind === "spell";
                          }
                          if (pendingCostPlay.filter === "spell") {
                            return cardLibrary[id]?.kind === "spell";
                          }
                          // power-source: any Spell counts as +1
                          return cardLibrary[id]?.kind === "spell";
                        })
                        .map((bookId) => {
                          const picked = pendingCostPlay.bookCardId === bookId;
                          const schools = cardLibrary[pendingCostPlay.action.cardId]?.spellSchools ?? [];
                          const powerValue =
                            pendingCostPlay.powerCost !== undefined
                              ? spellPowerValueOfCard(cardLibrary[bookId], schools)
                              : 0;
                          return (
                            <button
                              className={`commandButton ${picked ? "primary" : "ghost"}`}
                              key={`book-pay-${bookId}`}
                              onClick={() => {
                                setPendingCostPlay((current) =>
                                  current
                                    ? {
                                        ...current,
                                        bookCardId: current.bookCardId === bookId ? undefined : bookId
                                      }
                                    : current
                                );
                              }}
                              title={
                                polishBook
                                  ? "Remove this owned Spell for Crown of Dragontooth"
                                  : "Spend a Spell Book Spell for Power (once per turn)"
                              }
                              type="button"
                            >
                              📖 {cardName(bookId)}
                              {pendingCostPlay.powerCost !== undefined ? ` (+${powerValue})` : ""}
                            </button>
                          );
                        })}
                    </div>
                  ) : null}
                  <button
                    className="commandButton primary"
                    disabled={
                      pendingCostPlay.powerCost !== undefined
                        ? !pendingPowerOk || !pendingCrownsOk
                        : pendingCostPlay.exact !== undefined &&
                          pendingCostPlay.picks.length + (pendingCostPlay.bookCardId ? 1 : 0) !==
                            pendingCostPlay.exact
                    }
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
              {armedHandPlay ? (
                <div className="handButtons playConfirm" aria-label="Confirm card play">
                  <span>
                    Play {cardName(armedHandPlay.action.cardId)}
                    {armedHandPlay.label && armedHandPlay.label !== cardName(armedHandPlay.action.cardId)
                      ? ` — ${armedHandPlay.label}`
                      : ""}
                    ?
                  </span>
                  <button
                    className="commandButton primary"
                    onClick={() => {
                      const { action } = armedHandPlay;
                      setArmedHandPlay(null);
                      void submitAction(action);
                    }}
                    type="button"
                  >
                    Confirm
                  </button>
                  <button className="commandButton ghost" onClick={() => setArmedHandPlay(null)} type="button">
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
                  // Polish Spell Book: a Cast a Spell card opens a two-option menu
                  // (Open Spell Book / List the spells), so it is always actionable.
                  const isCastCard = polishBook && isCastASpellCard(cardId);
                  // A Spell with no map play is still actionable when it can be
                  // stashed — clicking opens the menu instead of marking a discard.
                  const actionable = plays.length > 0 || Boolean(stashAction) || isCastCard;
                  const isPayingSource = pendingCostPlay !== null;
                  const pickedForCost = Boolean(pendingCostPlay?.picks.includes(index));
                  const eligibleForCost =
                    isPayingSource &&
                    handCards[index] !== undefined &&
                    index !== handCards.indexOf(pendingCostPlay!.action.cardId) &&
                    costCardEligible(cardId, pendingCostPlay!.filter);
                  const whyBlocked =
                    !actionable && helperCoach.enabled && !selecting && !isPayingSource
                      ? cardUnplayableReason(state, viewerPlayerId, cardId)
                      : null;
                  // Helper tips: always allow opening a non-playable card to read
                  // why; otherwise keep the old gate (playable / start-of-turn draw /
                  // an available first-round Mulligan replacement).
                  // The first-round Mulligan is now folded into the start-of-turn
                  // draw step (canDraw), so no separate mulligan term is needed.
                  const canOpenMenu = actionable || canDraw || Boolean(whyBlocked);

                  return (
                    <div
                      className={`adventureHandSlot ${index >= handCards.length - hiddenHandTail ? "incoming" : ""}`}
                      key={`${cardId}-${index}`}
                    >
                      <button
                        className={`adventureHandCard ${handDiscards.includes(index) ? "discarding" : ""} ${
                          pickedForCost ? "discarding" : ""
                        } ${!selecting && !isPayingSource && actionable ? "playable" : ""} ${
                          whyBlocked ? "helperBlocked" : ""
                        } ${inFlightCardIds.has(cardId) ? "cardInFlight" : ""}`}
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
                              const max =
                                current.powerCost !== undefined
                                  ? handCards.length
                                  : (current.exact ?? current.upTo ?? 0);
                              if (!has && current.picks.length >= max && current.powerCost === undefined) {
                                return current;
                              }
                              if (has) {
                                const at = current.picks.indexOf(index);
                                return {
                                  ...current,
                                  picks: current.picks.filter((value) => value !== index),
                                  pickModes: current.pickModes.filter((_, i) => i !== at)
                                };
                              }
                              return {
                                ...current,
                                picks: [...current.picks, index],
                                pickModes: [...current.pickModes, "basic"]
                              };
                            });
                            return;
                          }
                          if (selecting) {
                            setHandDiscards((current) =>
                              current.includes(index)
                                ? current.filter((value) => value !== index)
                                : handMode === "cover-of-darkness" && current.length >= 2
                                  ? current
                                  : [...current, index]
                            );
                            return;
                          }
                          // Otherwise — INCLUDING the mandatory start-of-turn draw
                          // window — a click OPENS the card's menu (read it, play
                          // it, stash it, or EXPLICITLY mark it for discard). A
                          // click never auto-selects a card for discard nor
                          // auto-plays it, so an accidental click is always
                          // recoverable. (The old behaviour auto-marked any card
                          // for discard on a single click during the draw window —
                          // and since the engine withholds every play until the
                          // draw is taken, that fired for EVERY card, so the game
                          // appeared to "select cards for you" with no way out.)
                          // Drop any staged play so a stale confirm bar never
                          // lingers from another card.
                          if (canOpenMenu) {
                            setArmedHandPlay(null);
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
                              : whyBlocked
                                ? `${cardName(cardId)} — ${whyBlocked}`
                                : plays.length > 0
                                  ? `Play ${cardName(cardId)}`
                                  : stashAction
                                    ? `Move ${cardName(cardId)} to your Spell Book`
                                    : canDraw
                                      ? `Open ${cardName(cardId)} — read it, or mark it for discard`
                                      : cardName(cardId)
                        }
                        type="button"
                      >
                        <CardFrame cardId={cardId} className="handCardImage" />
                        {whyBlocked ? (
                          <span className="helperBlockedBadge" aria-hidden="true" title={whyBlocked}>
                            ?
                          </span>
                        ) : null}
                      </button>
                      {openHandIndex === index && !selecting && !isPayingSource && canOpenMenu ? (
                        <div className="handPlayMenu" role="menu" aria-label={`${cardName(cardId)} plays`}>
                          <strong>{cardName(cardId)}</strong>
                          {rulesetCardNote(state, cardId) ? (
                            <small className="rulesetNote">{rulesetCardNote(state, cardId)}</small>
                          ) : null}
                          {whyBlocked ? <small className="rulesetNote helperWhy">{whyBlocked}</small> : null}
                          {canDraw && plays.length === 0 ? (
                            <small className="rulesetNote">
                              Take your start-of-turn draw first to play cards — or mark this one for discard below.
                            </small>
                          ) : null}
                          {plays.map((legal) => (
                            <button key={actionKey(legal.action)} onClick={() => startPlay(legal)} type="button">
                              {legal.label}
                            </button>
                          ))}
                          {isCastCard ? (
                            // Cast a Spell (Polish): two ways to reach the same
                            // cast — open the full grimoire, or pick from a quick
                            // shortcut list. Either way the chosen Spell runs the
                            // NORMAL map cast flow (target + power/Knowledge window).
                            <div className="castASpellChoice" aria-label="Cast a Spell options">
                              <button
                                className="castASpellOpenBook"
                                onClick={() => {
                                  setSpellBookOpen(true);
                                  setCastListHandIndex(null);
                                  setOpenHandIndex(null);
                                }}
                                type="button"
                              >
                                📖 Open Spell Book
                              </button>
                              <button
                                className="castASpellList"
                                onClick={() =>
                                  setCastListHandIndex((current) => (current === index ? null : index))
                                }
                                type="button"
                              >
                                {castListHandIndex === index ? "Hide the spells" : "List the spells"}
                              </button>
                              {castListHandIndex === index ? (
                                <div className="castASpellSpells" role="menu" aria-label="Castable Book Spells">
                                  {bookPlayActionsByCard.size === 0 ? (
                                    <small className="rulesetNote">No refreshed Spell is castable right now.</small>
                                  ) : (
                                    [...bookPlayActionsByCard.entries()].map(([spellId, spellPlays]) =>
                                      spellPlays.map((legal) => (
                                        <button
                                          key={actionKey(legal.action)}
                                          onClick={() => {
                                            setCastListHandIndex(null);
                                            startPlay(legal as PlayLegal);
                                          }}
                                          type="button"
                                        >
                                          {`Cast ${cardName(spellId)}${
                                            legal.label && legal.label !== cardName(spellId)
                                              ? ` — ${legal.label.replace(" (Spell Book · Cast a Spell)", "").replace(" (Spell Book)", "")}`
                                              : ""
                                          }`}
                                        </button>
                                      ))
                                    )
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {canDraw ? (
                            <button
                              className="discardThenDraw"
                              onClick={() => {
                                setHandMode("mulligan");
                                setHandDiscards((current) => (current.includes(index) ? current : [...current, index]));
                                setOpenHandIndex(null);
                              }}
                              title="Mark this card for the start-of-turn discard, then draw back up to your hand limit"
                              type="button"
                            >
                              Discard this card, then draw
                            </button>
                          ) : null}
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
              </div>
              {/* Living Azure claw + frost/chill — after hand content so the
                  stack paints over cards; pointer-events none. */}
              <AzureClawChill />
              {/* Ice spikes + soft mist around them — tray bottom, left tools only. */}
              <div aria-hidden className="trayFootFrost" data-testid="tray-foot-frost">
                {/* eslint-disable-next-line @next/next/no-img-element -- ice spike fringe art */}
                <img alt="" draggable={false} src={assetUrl("/assets/ui/ornate/tray-foot-frost.webp")} />
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
          {/* Hold any choice prompt (a Treasure die's "choose one result", the
              Resource-die gains, …) until the dice it is asking about have
              finished tumbling — so the calculation never reads out over a die
              still in the air. */}
          {!dice.current && !mapDice.current ? (
            <PromptTray legalActions={legalActions} onAction={submitAction} onSwitchSeat={roomHosted ? undefined : (seat) => setViewerPlayerId(seat)} state={state} viewerPlayerId={viewerPlayerId} />
          ) : null}
          <LearningOfferModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
          <DeckSearchModeModal
            legalActions={legalActions}
            onAction={submitAction}
            state={state}
            view={playerView}
            viewerPlayerId={viewerPlayerId}
          />
          <MapSpellBoostModal
            legalActions={legalActions}
            onAction={submitAction}
            state={state}
            viewerPlayerId={viewerPlayerId}
          />
          <SearchModal legalActions={legalActions} onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
          {phoneUi ? (
            <LogDrawer state={state} viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT} />
          ) : null}
          {isSeated && handMode === null && !forcedDiscard ? (
            <MoraleOverflowPrompt
              canRedraw={handCards.length > 0}
              count={moraleOverflow}
              onDraw={() => submitAction({ type: "SPEND_MORALE", playerId: viewerPlayerId, benefit: "draw" })}
              onRedraw={() => setHandMode("morale-redraw")}
            />
          ) : null}
          {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
          {pendingBattleTroopWarn ? (
            <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Move into battle?">
              <div className="confirmModal">
                <strong>Move into battle?</strong>
                <p>
                  This move walks your hero straight into a Combat — and you can still buy troops at your town this
                  turn. Keep moving into the fight, or stop and recruit first?
                </p>
                <div className="confirmModalButtons">
                  <button
                    className="commandButton primary"
                    onClick={() => {
                      const action = pendingBattleTroopWarn;
                      setPendingBattleTroopWarn(null);
                      battleTroopConfirmedRef.current = true;
                      void submitAction(action);
                    }}
                    type="button"
                  >
                    Keep moving into battle
                  </button>
                  <button className="commandButton ghost" onClick={() => setPendingBattleTroopWarn(null)} type="button">
                    Stop — let me buy troops
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
          {!firstRoll && !newDay.current && !astrologerCue && eventCue ? (
            <EventDrawnOverlay cue={eventCue} key={eventCue.id} onDone={() => setEventCue(null)} />
          ) : null}
          {!firstRoll && !newDay.current && !astrologerCue && !eventCue && mapEventCue ? (
            <MapEventOverlay cue={mapEventCue} key={mapEventCue.id} onDone={() => setMapEventCue(null)} />
          ) : null}
          {!firstRoll && !newDay.current && !astrologerCue && !eventCue && !mapEventCue && storyCue ? (
            <StoryOverlay cue={storyCue} key={storyCue.id} onDone={() => setStoryCue(null)} />
          ) : null}
          {/* Morale-card moment: waits out dice and the bigger round ceremonies,
              then pops the card with its good/bad-morale sting. */}
          {!firstRoll && !newDay.current && !astrologerCue && !eventCue && !mapEventCue && !mapDice.current && moraleCue.current ? (
            <MoraleCardOverlay cue={moraleCue.current} key={moraleCue.current.id} onDone={dismissMoraleCue} />
          ) : null}
          <FxStage cues={fxCues} onDone={handleFxDone} />
          {reactionsLayer}
          {phoneUi ? (
            <PhoneTabBar
              active={phoneMapTab}
              onSelect={(id) => {
                if (id === "battle") {
                  // Surface switch, not a phone panel: back to the open fight.
                  setCombatTab("battle");
                  return;
                }
                if (id === "end-turn") {
                  const endTurn = legalActions.find((legal) => legal.action.type === "END_TURN");
                  if (endTurn) {
                    void submitAction(endTurn.action);
                  }
                  return;
                }
                setPhoneMapTab(id as PhoneMapTab);
              }}
              tabs={phoneMapTabs}
            />
          ) : null}
        </main>
      </CardZoomProvider>
    );
  }

  // ---- Combat table (sandbox games and adventure combats) ------------------
  // Phone mode: this surface's tab-bar entries ("map" flips the existing
  // combatTab surface switch, exactly like the banner button).
  const phoneCombatTabs: PhoneTab[] = [
    { id: "board", label: "Board", icon: <Swords size={17} /> },
    ...(adventureMode && state.combat ? [{ id: "map", label: "Map", icon: <MapIcon size={17} /> }] : []),
    ...(isSeated
      ? [
          {
            id: "hand",
            label: "Hand",
            icon: <HandIcon size={17} />,
            badge: (playerView.players[viewerPlayerId]?.hand ?? []).length
          }
        ]
      : []),
    { id: "menu", label: "Menu", icon: <MenuIcon size={17} /> }
  ];

  return (
    <TableErrorBoundary
      resetKey={roomVersion}
      syncStatus={syncStatus}
      onReset={() => {
        connectionRef.current
          ?.fetchSnapshot()
          .then((snapshot) => ingestSnapshot(snapshot, { seatAuthoritative: true }))
          .catch(() => setSyncStatus("room sync failed"));
      }}
    >
    <CardZoomProvider>
    <main
      className={`tableRoot${phoneUi ? " phoneMode" : ""}`}
      data-phone-tab={phoneUi ? phoneCombatTab : undefined}
      onClick={playTableUiClickSound}
    >
      {presentationSkipControl}
      {/* All card logistics live up here: every opponent's hand/deck/discard and
          the viewer's own dock + permanents + playable hand. Card-flight
          animations land in this strip. Heroes stay on the right rail. */}
      <div className="tableTopRow">
        <div className="combatCardStrip">
          {isSeated ? (
            <div className="combatOpponentRow">
              <OpponentInfoDock seatIds={seatIds} state={state} variant="combat" viewerPlayerId={viewerPlayerId} />
              <OpponentBar state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
              {adventureMode && state.combat ? (
                <div className="combatContextBanner compact">
                  <Swords aria-hidden="true" size={12} />
                  <span>
                    {state.combat.context.kind === "neutral"
                      ? `${state.players[state.combat.attackerPlayerId]?.name} vs L${state.combat.context.difficulty} guards`
                      : state.combat.context.kind === "player"
                        ? `${state.players[state.combat.attackerPlayerId]?.name} vs ${state.players[state.combat.defenderPlayerId]?.name}`
                        : "Battle"}
                  </span>
                  <button className="commandButton" onClick={() => setCombatTab("map")} type="button">
                    <MapIcon aria-hidden="true" size={11} /> Map
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!isSeated && adventureMode && state.combat ? (
            /* An unseated observer has no phone tab bar / seated strip on the
               desktop combat screen — keep the context line and its "Map"
               switch (the old full-width banner was every observer's only way
               back to the adventure map). */
            <div className="combatOpponentRow">
              <div className="combatContextBanner compact">
                <Swords aria-hidden="true" size={12} />
                <span>
                  {state.combat.context.kind === "neutral"
                    ? `${state.players[state.combat.attackerPlayerId]?.name} vs L${state.combat.context.difficulty} guards`
                    : state.combat.context.kind === "player"
                      ? `${state.players[state.combat.attackerPlayerId]?.name} vs ${state.players[state.combat.defenderPlayerId]?.name}`
                      : "Battle"}
                </span>
                <button className="commandButton" onClick={() => setCombatTab("map")} type="button">
                  <MapIcon aria-hidden="true" size={11} /> Map
                </button>
              </div>
            </div>
          ) : null}
          {isSeated && adventureMode && state.combat && state.adventure?.undoMoves ? (
            <button
              className="commandButton undoMove combatUndoMove"
              onClick={() => submitAction({ type: "UNDO_MOVE", playerId: viewerPlayerId })}
              title="Testing aid: roll the game back to before your most recent action."
              type="button"
            >
              ↩ Undo
            </button>
          ) : null}
          {isSeated ? (
            <div className="tableSeatRow">
              <PlayerDock
                onShowPile={(title, cardIds, kind) => setPile({ title, cardIds, kind })}
                state={state}
                view={playerView}
                viewerPlayerId={viewerPlayerId}
              />
              <PermanentSlot
                compact
                legalActions={legalActions}
                onAction={submitAction}
                playerId={viewerPlayerId}
                showEmpty
                state={state}
                viewerPlayerId={viewerPlayerId}
              />
              <div className="handColumn">
                {/* The combat "View hand" pile-browser button was removed to
                    declutter the top strip: the HandFan below already shows every
                    hand card, and each card is click/hover-zoomable for a full-size
                    read. Deck and discard stay available in the compact top dock. */}
                <HandFan
                  hiddenTailCount={hiddenHandTail}
                  inFlightCardIds={inFlightCardIds}
                  legalActions={legalActions}
                  onAction={submitAction}
                  onSelectCardAction={selectBoardCardAction}
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
                  state={state}
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

      {/* Mid-game join: still ask the layout question once per browser. */}
      <UiModePrompt />
      {/* Mid-game join / Battle Test: ask once if no preference yet. */}
      <HelperCoachLobbyPrompt />

      {isSeated ? (
        <HelperCoachStrip
          legalActions={legalActions}
          state={state}
          viewerPlayerId={viewerPlayerId}
        />
      ) : null}

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

      {selectedCardAction ? (
        <div className="targetBanner" aria-label="Selected card target">
          <Crosshair aria-hidden="true" size={15} />
          <strong>{cardName(selectedCardAction.cardId)}</strong>
          <span>
            {selectedCardTargetCount === 0
              ? "No legal board target"
              : selectedCardHasUnitTarget && selectedCardHasSpaceTarget
                ? "Click a glowing unit or space on the board"
                : selectedCardHasSpaceTarget
                  ? "Click a glowing space on the board"
                  : "Click a glowing unit on the board"}
          </span>
          <button
            onClick={() => {
              setSelectedCardAction(null);
              setArmedCardPayment(null);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {pendingCostPlay ? (
        <CostPlayBar
          bookCardId={pendingCostPlay.bookCardId}
          bookCards={
            polishSpellBookEnabled(state) &&
            pendingCostPlay.action.cardId === "artifact.crown_of_dragontooth" &&
            pendingCostPlay.filter === "spell"
              ? [
                  ...(state.players[isSeated ? viewerPlayerId : seatIds[0]]?.spellBook ?? []),
                  ...(state.players[isSeated ? viewerPlayerId : seatIds[0]]?.spellBookUsed ?? [])
                ]
              : []
          }
          hand={state.players[isSeated ? viewerPlayerId : seatIds[0]]?.hand ?? []}
          onCancel={() => setPendingCostPlay(null)}
          onBookPick={(cardId) =>
            setPendingCostPlay((current) =>
              current
                ? { ...current, bookCardId: current.bookCardId === cardId ? undefined : cardId }
                : current
            )
          }
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
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
        </div>
      </div>

      {/* Bottom combat deck/discard rail — map-mode parity: full discard browse. */}
      <LogDrawer state={state} viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT} />

      <AdventureEventFeed
        items={feedItems}
        onDismiss={(id) => setFeedItems((current) => current.filter((item) => item.id !== id))}
      />
      {/* Same gate on the combat-table layout: a choice prompt waits out any
          attack/map die animation before reading its result. */}
      {!dice.current && !mapDice.current ? (
        <PromptTray legalActions={legalActions} onAction={submitAction} onSwitchSeat={roomHosted ? undefined : (seat) => setViewerPlayerId(seat)} state={state} viewerPlayerId={viewerPlayerId} />
      ) : null}
      <LearningOfferModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      <DeckSearchModeModal
        legalActions={legalActions}
        onAction={submitAction}
        state={state}
        view={playerView}
        viewerPlayerId={viewerPlayerId}
      />
      <MapSpellBoostModal
        legalActions={legalActions}
        onAction={submitAction}
        state={state}
        viewerPlayerId={viewerPlayerId}
      />
      {/* Hold the instant window back until the attack-die animation has fully
          played out, so a post-roll reaction prompt (e.g. a lethal-save window
          in a neutral fight) never pops over the rolling dice. `combatPresenting`
          also covers a guard's slide-in: the reaction window waits until the
          attacker has finished moving into range (a Harpy flies in BEFORE its
          attack window opens), never popping over the card still gliding. */}
      {!dice.current && !combatPresenting ? (
        <ReactionTray
          key={`${state.reactionWindow?.id ?? "none"}:${state.reactionWindow?.priorityPlayerId ?? ""}`}
          legalActions={legalActions}
          onAction={submitAction}
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
      <SearchModal legalActions={legalActions} onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
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
      {!firstRoll && !dice.current && !newDay.current && !astrologerCue && eventCue ? (
        <EventDrawnOverlay cue={eventCue} key={eventCue.id} onDone={() => setEventCue(null)} />
      ) : null}
      {!firstRoll && !dice.current && !newDay.current && !astrologerCue && !eventCue && mapEventCue ? (
        <MapEventOverlay cue={mapEventCue} key={mapEventCue.id} onDone={() => setMapEventCue(null)} />
      ) : null}
      {!firstRoll && !dice.current && !newDay.current && !astrologerCue && !eventCue && !mapEventCue && storyCue ? (
        <StoryOverlay cue={storyCue} key={storyCue.id} onDone={() => setStoryCue(null)} />
      ) : null}
      {/* Morale-card moment over the battlefield: a Negative card striking
          mid-fight (skipped activation, forced −1 die…) or a Positive card
          being used pops with its art and sting — but only once the dice and
          the strike animation they gate have fully played out. */}
      {!firstRoll && !dice.current && !combatPresenting && !newDay.current && !astrologerCue && !eventCue && !mapEventCue && moraleCue.current ? (
        <MoraleCardOverlay cue={moraleCue.current} key={moraleCue.current.id} onDone={dismissMoraleCue} />
      ) : null}
      <FxStage cues={fxCues} onDone={handleFxDone} />
      {reactionsLayer}
      {phoneUi ? (
        <PhoneTabBar
          active={phoneCombatTab}
          onSelect={(id) => {
            if (id === "map") {
              // Surface switch, not a phone panel: view the adventure map.
              setCombatTab("map");
              return;
            }
            setPhoneCombatTab(id as PhoneCombatTab);
          }}
          tabs={phoneCombatTabs}
        />
      ) : null}
    </main>
    </CardZoomProvider>
    </TableErrorBoundary>
  );
}
