"use client";

import { Crosshair, Eye, Map as MapIcon, StepForward, Swords } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  effectiveHandLimit,
  getLegalActions,
  getPlayerView,
  getRuleset,
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
import { CardFrame, DeckWells, HandFan, OpponentBar, PermanentSlot, PlayerDock } from "@/components/table/seats";
import { HeroBoard } from "@/components/hero-board";
import {
  CombatResultModal,
  DiceOverlay,
  DrawOverlay,
  MapDiceOverlay,
  MapNoticeOverlay,
  ReactionTray,
  RerollModal,
  SearchModal,
  type DiceCue,
  type DrawCue,
  type MapDiceCue,
  type MapNoticeCue
} from "@/components/table/overlays";
import { CardZoomProvider, useCardZoom, ZoomButton } from "@/components/table/zoom";
import {
  ADVENTURE_FEED_CUES,
  AdventureDecksPanel,
  AdventureEventFeed,
  AdventureHud,
  ArmyPanel,
  FarTileTray,
  HexMapBoard,
  LOCATION_GLYPHS,
  MarketPanel,
  PileModal,
  PlacementPanel,
  PromptTray,
  SetupLobbyScreen,
  TownPanel,
  type AdventureFeedItem,
  type HeroMoveCue,
  type TilePlacementSelection
} from "@/components/adventure/screen";
import { actionKey, cardName, formatEvent, titleCase, unitName, type CardBoardAction } from "@/components/table/utils";
import {
  DRAW_STAGGER_MS,
  FLIGHT_MS,
  FLIGHT_OUT_MS,
  FxStage,
  HOLD_CENTER_MS,
  type FxCue
} from "@/components/table/fx";
import { abilityFxPlans, cancelFx, spellFxPlans, type SpellFxPlan } from "@/data/fx";
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
import { connectRoom, type GameRoomSnapshot, type RoomConnection } from "@/lib/realtime";

/** Events that move cards or play battle effects on the table. */
const FX_EVENT_TYPES = new Set<GameEvent["type"]>([
  "CARDS_DRAWN",
  "CARD_PLAYED",
  "SPELL_CAST_STARTED",
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
  "UNIT_REMOVED"
]);

const OBSERVER_SEAT = "observer";

/** Magnifier for the adventure hand; lives inside the CardZoomProvider. */
function AdventureHandZoom({ cardId }: { cardId: string }) {
  const { zoomCard } = useCardZoom();
  return <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId)} />;
}

function getInitialRoomId(): string {
  if (typeof window === "undefined") {
    return "dev-room";
  }

  return new URLSearchParams(window.location.search).get("room") || "dev-room";
}

function makeDiceCue(state: GameState, event: Extract<GameEvent, { type: "ATTACK_ROLLED" }>): DiceCue {
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
    isRetaliation: event.isRetaliation
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
  const [selectedCardAction, setSelectedCardAction] = useState<CardBoardAction | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [handMode, setHandMode] = useState<HandMode>(null);
  const [handDiscards, setHandDiscards] = useState<number[]>([]);
  /** Adventure hand: which card slot has its play menu open. */
  const [openHandIndex, setOpenHandIndex] = useState<number | null>(null);
  /** A chosen play waiting for its discard-cost payment (cost card picks). */
  const [pendingCostPlay, setPendingCostPlay] = useState<{
    action: Extract<GameAction, { type: "PLAY_CARD" }>;
    exact?: number;
    upTo?: number;
    filter?: "spell";
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
  const [drawCue, setDrawCue] = useState<DrawCue | null>(null);
  const [moveCue, setMoveCue] = useState<HeroMoveCue | null>(null);
  const [flippedUnitIds, setFlippedUnitIds] = useState<Set<string>>(new Set());
  const [feedItems, setFeedItems] = useState<AdventureFeedItem[]>([]);
  const [fxCues, setFxCues] = useState<FxCue[]>([]);
  const [hiddenHandTail, setHiddenHandTail] = useState(0);
  const [tintedUnits, setTintedUnits] = useState<Map<string, string>>(new Map());
  const seenRollIdsRef = useRef<Set<string> | null>(null);
  const seenMapDiceIdsRef = useRef<Set<string>>(new Set());
  const seenVisitIdsRef = useRef<Set<string>>(new Set());
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
  const connectionRef = useRef<RoomConnection | null>(null);
  // The draw cue needs the live seat without resubscribing the stream.
  const viewerRef = useRef<PlayerId>("p1");
  useEffect(() => {
    viewerRef.current = viewerPlayerId;
  }, [viewerPlayerId]);

  // Every server snapshot funnels through here so new attack rolls, card
  // draws, hero walks and pack flips cue their animations on every seat. The
  // first snapshot only primes the seen-sets, so a reload replays nothing.
  const ingestServerState = useCallback((nextState: GameState) => {
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
      // Fresh room connection: drop any presentation state from the last room.
      setFxCues([]);
      setHiddenHandTail(0);
      setTintedUnits(new Map());
      setMapDice({ current: null, queue: [] });
      setMapNotice({ current: null, queue: [] });
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
        cueSounds.slice(0, 3).forEach((key, index) => {
          window.setTimeout(() => playLibrarySound(key, MAP_CUE_VOLUME), index * 220);
        });

        const items = freshFeed.map((event) => {
          const cue = ADVENTURE_FEED_CUES[event.type];
          return {
            id: event.id,
            icon: cue?.icon ?? "•",
            cue: cue?.cue ?? "default",
            text: formatEvent(event, nextState)
          } satisfies AdventureFeedItem;
        });
        setFeedItems((current) => [...current, ...items].slice(-6));
        window.setTimeout(() => {
          const expired = new Set(items.map((item) => item.id));
          setFeedItems((current) => current.filter((item) => !expired.has(item.id)));
        }, 8000);
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
            lines
          } satisfies MapNoticeCue;
        });
        setMapNotice((current) => {
          const queue = [...current.queue, ...cues];
          return current.current ? { ...current, queue } : { current: queue[0], queue: queue.slice(1) };
        });
      }

      const seen = seenRollIdsRef.current;
      const fresh = rolls.filter((event) => !seen.has(event.id));
      for (const event of fresh) {
        seen.add(event.id);
      }

      if (fresh.length > 0) {
        setDice((current) => {
          const queue = [...current.queue, ...fresh.map((event) => makeDiceCue(nextState, event))];
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
      if (freshFx.length > 0) {
        const cues: FxCue[] = [];
        const viewerId = viewerRef.current;
        // When an attack roll cues in the same batch, let the dice settle
        // before its damage number pops.
        let timeline = fresh.length > 0 ? 1200 : 0;
        let viewerDraws = 0;

        // A seat's deck/hand/discard anchors are on screen during combat
        // (every seat) and on the adventure map (the viewer's own seat).
        // Cues for unmounted anchors would self-heal anyway; skipping them
        // up front keeps the timeline tight.
        const seatVisible = (playerId: PlayerId) => Boolean(nextState.combat) || playerId === viewerId;

        // Definition behind a combat unit, surviving the unit's removal so
        // the killing blow still gets its death cry.
        const unitVoice = (unitId: string) =>
          nextState.combat?.units[unitId]?.unitDefId ?? unitDefIdsRef.current.get(unitId);

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

        const queueBoardFx = (
          plan: SpellFxPlan,
          eventId: string,
          casterId: PlayerId,
          targetUnitId: string
        ) => {
          const at = `unit:${targetUnitId}`;
          if (plan.projectile) {
            cues.push({
              kind: "projectile",
              id: `${eventId}-projectile`,
              fxKey: plan.projectile,
              from: `hand:${casterId}`,
              to: at,
              hitFxKey: plan.hit,
              sound: plan.sound,
              hitSound: plan.hitSound,
              delayMs: timeline
            });
            timeline += 1100;
          } else if (plan.hit) {
            cues.push({
              kind: "sprite",
              id: `${eventId}-hit`,
              fxKey: plan.hit,
              at,
              sound: plan.hitSound ?? plan.sound,
              delayMs: timeline
            });
            timeline += 850;
          }
          plan.affect?.forEach((entry, index) => {
            cues.push({
              kind: "sprite",
              id: `${eventId}-affect-${index}`,
              fxKey: entry.key,
              at,
              sound: index === 0 ? plan.sound : undefined,
              delayMs: timeline + (entry.delayMs ?? 0)
            });
          });
          if (plan.affect && plan.affect.length > 0) {
            timeline += 950;
          }
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
            }, timeline);
            timeline += 900;
          }
        };

        for (const event of freshFx) {
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
              cues.push({
                kind: "flight",
                id: `${event.id}-play`,
                from: `hand:${event.playerId}`,
                to: `discard:${event.playerId}`,
                cardId: event.cardId,
                holdMs: HOLD_CENTER_MS,
                delayMs: timeline
              });
              timeline += FLIGHT_MS + HOLD_CENTER_MS + FLIGHT_OUT_MS;
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
            case "SPELL_CAST_RESOLVED": {
              const plan = spellFxPlans[event.spellCardId];
              if (plan && event.target.type === "unit") {
                queueBoardFx(plan, event.id, event.playerId, event.target.unitId);
              }
              break;
            }
            case "SPELL_CAST_CANCELLED": {
              cues.push({
                kind: "sprite",
                id: `${event.id}-fizzle`,
                fxKey: cancelFx.key,
                at: "center",
                sound: cancelFx.sound,
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
            case "DAMAGE_ASSIGNED": {
              if (event.target.type === "unit" && event.amount > 0) {
                playUnitSound(unitVoice(event.target.unitId), "hurt", timeline);
                cues.push({
                  kind: "floater",
                  id: `${event.id}-floater`,
                  at: `unit:${event.target.unitId}`,
                  text: `−${event.amount}`,
                  tone: "damage",
                  delayMs: timeline
                });
              }
              break;
            }
            case "DAMAGE_HEALED": {
              if (event.target.type === "unit" && event.amount > 0) {
                cues.push({
                  kind: "floater",
                  id: `${event.id}-floater`,
                  at: `unit:${event.target.unitId}`,
                  text: `+${event.amount}`,
                  tone: "heal",
                  delayMs: timeline
                });
              }
              break;
            }
            case "UNIT_ABILITY_TRIGGERED": {
              const plan = abilityFxPlans[event.abilityId];
              if (!plan) {
                break;
              }
              const at = `unit:${event.targetUnitId ?? event.unitId}`;
              if (plan.hit) {
                cues.push({
                  kind: "sprite",
                  id: `${event.id}-ability`,
                  fxKey: plan.hit,
                  at,
                  sound: plan.hitSound ?? plan.sound,
                  delayMs: timeline
                });
                timeline += 700;
              }
              plan.affect?.forEach((entry, index) => {
                cues.push({
                  kind: "sprite",
                  id: `${event.id}-ability-${index}`,
                  fxKey: entry.key,
                  at,
                  sound: index === 0 ? plan.sound : undefined,
                  delayMs: timeline + (entry.delayMs ?? 0)
                });
              });
              if (plan.affect && plan.affect.length > 0) {
                timeline += 800;
              }
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
              playUnitSound(
                unitVoice(event.attackerId),
                event.attackKind === "ranged" ? "shoot" : "attack",
                timeline
              );
              timeline += 500;
              break;
            }
            case "UNIT_MOVED": {
              playUnitSound(unitVoice(event.unitId), "move", timeline);
              timeline += 350;
              break;
            }
            case "UNIT_DEFENDED": {
              playUnitSound(unitVoice(event.unitId), "defend", timeline);
              break;
            }
            case "UNIT_REMOVED": {
              playUnitSound(unitVoice(event.unitId), "death", timeline);
              timeline += 650;
              break;
            }
            default:
              break;
          }
        }

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
    }

    setState(nextState);
  }, []);

  const ingestSnapshot = useCallback(
    (snapshot: GameRoomSnapshot) => {
      setRoomVersion((currentVersion) => {
        if (snapshot.version > currentVersion) {
          ingestServerState(snapshot.state);
          return snapshot.version;
        }
        return currentVersion;
      });
    },
    [ingestServerState]
  );

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

  const handleFxDone = useCallback((id: string) => {
    setFxCues((current) => current.filter((cue) => cue.id !== id));
  }, []);

  // One live connection per room: PartyKit edge socket when configured,
  // otherwise the built-in API + SSE stream.
  useEffect(() => {
    seenRollIdsRef.current = null;

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
    const connection = connectionRef.current;
    if (!connection) {
      return;
    }

    setSyncStatus("submitting");
    try {
      const payload = await connection.submitAction(action);
      setErrors(payload.result.errors.map((error) => error.message));
      ingestSnapshot(payload.snapshot);
      setSyncStatus(`synced v${payload.snapshot.version}`);

      if (payload.result.errors.length === 0) {
        setSelectedCardAction(null);
        setHandMode(null);
        setHandDiscards([]);
        setTilePlacement(null);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "The action could not be submitted."]);
      setSyncStatus("submit failed");
    }
  };

  const resetRoom = async (mode: "adventure" | "combat-sandbox") => {
    const connection = connectionRef.current;
    if (!connection) {
      return;
    }

    try {
      const snapshot = await connection.resetRoom({ mode });
      seenRollIdsRef.current = null;
      ingestServerState(snapshot.state);
      setRoomVersion(snapshot.version);
      setErrors([]);
      setSelectedCardAction(null);
      setHandMode(null);
      setHandDiscards([]);
      setCombatTab("battle");
      setDice({ current: null, queue: [] });
      setMapDice({ current: null, queue: [] });
      setMapNotice({ current: null, queue: [] });
      setFeedItems([]);
      setSyncStatus(`synced v${snapshot.version}`);
    } catch {
      setErrors(["Could not reset the room."]);
    }
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

  const errorBanner =
    errors.length > 0 ? (
      <div className="errorBanner" aria-label="Rules errors">
        {errors.map((error) => (
          <span key={error}>{error}</span>
        ))}
      </div>
    ) : null;

  // ---- Map-setup lobby ------------------------------------------------------
  if (adventureMode && inLobby) {
    return (
      <CardZoomProvider>
        <main className="tableRoot adventureRoot">
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
  const showMapScreen = adventureMode && (!combatVisible || combatTab === "map");

  if (showMapScreen) {
    const viewer = isSeated ? state.players[viewerPlayerId] : null;
    const handCards = isSeated ? (playerView.players[viewerPlayerId]?.hand ?? []) : [];
    const handLimit = viewer ? effectiveHandLimit(state, viewerPlayerId) : 0;
    const forcedDiscard = Boolean(viewer?.needsHandRefresh) && state.activePlayerId === viewerPlayerId;
    const canMulligan =
      Boolean(viewer?.canMulligan) && state.activePlayerId === viewerPlayerId && !forcedDiscard && handCards.length > 0;
    const hasMorale = (viewer?.morale ?? 0) > 0;
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
    // Eagle Eye, Town Portal, artifact map sides…), grouped per hand card.
    const playActionsByCard = new Map<string, (LegalAction & { action: Extract<GameAction, { type: "PLAY_CARD" }> })[]>();
    for (const legal of legalActions) {
      if (legal.action.type !== "PLAY_CARD") {
        continue;
      }
      const list = playActionsByCard.get(legal.action.cardId) ?? [];
      list.push(legal as LegalAction & { action: Extract<GameAction, { type: "PLAY_CARD" }> });
      playActionsByCard.set(legal.action.cardId, list);
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

          {combatVisible ? (
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
                onShowPile={(title, cardIds, kind) => setPile({ title, cardIds, kind })}
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
              <div className="handTopBar">
                <small>
                  Hand {handCards.length}/{handLimit}
                </small>
                {forcedDiscard ? (
                  <span className="handWarning">
                    Over the hand limit: discard down to {handLimit}.{overLimit > 0 ? ` Pick ${overLimit} more.` : ""}
                  </span>
                ) : null}
                {!forcedDiscard && handMode === null ? (
                  <div className="handButtons">
                    {canMulligan ? (
                      <span className="handHint">
                        Start of turn: click cards to pick discards (once per turn), or
                        <button className="commandButton" onClick={() => setHandMode("mulligan")} type="button">
                          Mulligan (discard &amp; draw)
                        </button>
                      </span>
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
                          ? ""
                          : `Discard ${handDiscards.length} card${handDiscards.length === 1 ? "" : "s"}, draw ${handDiscards.length}.`}
                    </span>
                    <button
                      className="commandButton primary"
                      disabled={forcedDiscard ? overLimit > 0 : handMode === "morale-redraw" && handDiscards.length === 0}
                      onClick={confirmHandAction}
                      type="button"
                    >
                      {forcedDiscard
                        ? `Discard ${handDiscards.length}`
                        : handMode === "morale-redraw"
                          ? `Redraw ${handDiscards.length}`
                          : `Draw ${handDiscards.length} new`}
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
                    {pendingCostPlay.filter === "spell" ? " (Spell cards only)" : ""} — {pendingCostPlay.picks.length} picked
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
                  const isPayingSource = pendingCostPlay !== null;
                  const pickedForCost = Boolean(pendingCostPlay?.picks.includes(index));
                  const eligibleForCost =
                    isPayingSource &&
                    handCards[index] !== undefined &&
                    index !== handCards.indexOf(pendingCostPlay!.action.cardId) &&
                    (pendingCostPlay!.filter !== "spell" || cardLibrary[cardId]?.kind === "spell");

                  return (
                    <div
                      className={`adventureHandSlot ${index >= handCards.length - hiddenHandTail ? "incoming" : ""}`}
                      key={`${cardId}-${index}`}
                    >
                      <button
                        className={`adventureHandCard ${handDiscards.includes(index) ? "discarding" : ""} ${
                          pickedForCost ? "discarding" : ""
                        } ${!selecting && !isPayingSource && plays.length > 0 ? "playable" : ""}`}
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
                          // While the once-per-turn mulligan window is open,
                          // clicking a card marks it for the discard pile —
                          // the confirm button then discards them all and
                          // draws that many in one go.
                          if (!selecting && canMulligan && plays.length === 0) {
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
                          // Otherwise: open the play menu for this card.
                          if (plays.length > 0) {
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
                                : canMulligan
                                  ? `Click to mark ${cardName(cardId)} for the mulligan discard`
                                  : cardName(cardId)
                        }
                        type="button"
                      >
                        <CardFrame cardId={cardId} className="handCardImage" />
                      </button>
                      {openHandIndex === index && !selecting && !isPayingSource && plays.length > 0 ? (
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
                          <button className="ghost" onClick={() => setOpenHandIndex(null)} type="button">
                            Close
                          </button>
                          {canMulligan ? (
                            <button
                              className="ghost"
                              onClick={() => {
                                setOpenHandIndex(null);
                                setHandMode("mulligan");
                                setHandDiscards([index]);
                              }}
                              type="button"
                            >
                              Mark for mulligan instead
                            </button>
                          ) : null}
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
          <SearchModal onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
          <LogDrawer state={state} />
          {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
          {drawCue ? <DrawOverlay cue={drawCue} key={drawCue.id} onDone={() => setDrawCue(null)} /> : null}
          {mapNotice.current && !mapDice.current ? (
            <MapNoticeOverlay cue={mapNotice.current} key={mapNotice.current.id} onDone={dismissMapNotice} />
          ) : null}
          {mapDice.current ? (
            <MapDiceOverlay cue={mapDice.current} key={mapDice.current.id} onDone={dismissMapDice} />
          ) : null}
          <FxStage cues={fxCues} onDone={handleFxDone} />
        </main>
      </CardZoomProvider>
    );
  }

  // ---- Combat table (sandbox games and adventure combats) ------------------
  return (
    <CardZoomProvider>
    <main className="tableRoot">
      <div className="tableTopRow">
        {isSeated ? <OpponentBar state={state} view={playerView} viewerPlayerId={viewerPlayerId} /> : <div />}
        {tableMenu}
      </div>

      {errorBanner}

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

      <div className="tableMidRow">
        <div className="leftRail">
          <DeckWells legalActions={legalActions} onAction={submitAction} view={playerView} />
          <EffectsRail legalActions={legalActions} onAction={submitAction} state={state} />
        </div>
        <div className="boardColumn">
          <InitiativeRail state={state} />
          <BattlefieldBoard
            flippedUnitIds={flippedUnitIds}
            legalActions={legalActions}
            onAction={submitAction}
            onInspect={setInspectedUnitId}
            selectedCardAction={selectedCardAction}
            state={state}
            tintedUnits={tintedUnits}
            viewerPlayerId={isSeated ? viewerPlayerId : OBSERVER_SEAT}
          />
          {state.combat?.setup && isSeated ? (
            <PlacementPanel
              legalActions={legalActions}
              onAction={submitAction}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
          ) : null}
        </div>
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

      <div className="tableSeatRow">
        {isSeated ? <PlayerDock view={playerView} viewerPlayerId={viewerPlayerId} /> : <div />}
        {isSeated ? (
          <PermanentSlot
            legalActions={legalActions}
            onAction={submitAction}
            playerId={viewerPlayerId}
            state={state}
            viewerPlayerId={viewerPlayerId}
          />
        ) : null}
        {isSeated ? (
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
          </div>
        ) : (
          <div className="observerNote">Observer mode: hands stay hidden, the fight is live.</div>
        )}
      </div>

      <LogDrawer state={state} />

      <AdventureEventFeed
        items={feedItems}
        onDismiss={(id) => setFeedItems((current) => current.filter((item) => item.id !== id))}
      />
      <PromptTray legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
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
      <CombatResultModal
        key={`result-${state.combat?.id ?? "none"}`}
        legalActions={legalActions}
        onAction={submitAction}
        onReset={() => resetRoom(adventureMode ? "adventure" : "combat-sandbox")}
        state={state}
        viewerPlayerId={viewerPlayerId}
      />
      <SearchModal onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
      <RerollModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
      {drawCue && !dice.current ? <DrawOverlay cue={drawCue} key={drawCue.id} onDone={() => setDrawCue(null)} /> : null}
      {dice.current ? <DiceOverlay cue={dice.current} key={dice.current.id} onDone={dismissDice} /> : null}
      {!dice.current && mapNotice.current && !mapDice.current ? (
        <MapNoticeOverlay cue={mapNotice.current} key={mapNotice.current.id} onDone={dismissMapNotice} />
      ) : null}
      {!dice.current && mapDice.current ? (
        <MapDiceOverlay cue={mapDice.current} key={mapDice.current.id} onDone={dismissMapDice} />
      ) : null}
      <FxStage cues={fxCues} onDone={handleFxDone} />
    </main>
    </CardZoomProvider>
  );
}
