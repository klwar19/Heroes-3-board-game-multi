"use client";

import { Crosshair, Eye, StepForward, Swords } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  NEUTRAL_PLAYER_ID,
  type EngineResult,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId
} from "@/engine";
import {
  BattlefieldBoard,
  CommandDock,
  EffectsRail,
  InitiativeRail,
  InspectPanel,
  LogDrawer
} from "@/components/table/board";
import { CardFrame, DeckWells, HandFan, HeroPanel, OpponentBar, PlayerDock } from "@/components/table/seats";
import {
  DiceOverlay,
  DrawOverlay,
  ReactionTray,
  RerollModal,
  SearchModal,
  type DiceCue,
  type DrawCue
} from "@/components/table/overlays";
import { CardZoomProvider, useCardZoom, ZoomButton } from "@/components/table/zoom";
import {
  AdventureDecksPanel,
  AdventureHud,
  ArmyPanel,
  FarTileTray,
  HeroBoardPanel,
  HexMapBoard,
  PileModal,
  PlacementPanel,
  PromptTray,
  TownPanel
} from "@/components/adventure/screen";
import { cardName, unitName, type CardBoardAction } from "@/components/table/utils";

type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
};

const OBSERVER_SEAT = "observer";

/** Magnifier for the adventure hand; lives inside the CardZoomProvider. */
function AdventureHandZoom({ cardId }: { cardId: string }) {
  const { zoomCard } = useCardZoom();
  return <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId)} />;
}

async function fetchRoom(roomId: string): Promise<GameRoomSnapshot> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Could not load room.");
  }

  return (await response.json()) as GameRoomSnapshot;
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

export default function Home() {
  const [state, setState] = useState(() => createAdventureGameState());
  const [viewerPlayerId, setViewerPlayerId] = useState<PlayerId>("p1");
  const [errors, setErrors] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("dev-room");
  const [roomInput, setRoomInput] = useState("dev-room");
  const [roomVersion, setRoomVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [selectedCardAction, setSelectedCardAction] = useState<CardBoardAction | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [refreshDiscards, setRefreshDiscards] = useState<number[]>([]);
  const [tilePlacement, setTilePlacement] = useState<{ tileDefId: string; rotation: number } | null>(null);
  const [pile, setPile] = useState<{ title: string; cardIds: string[]; kind: "cards" | "units" } | null>(null);
  const [dice, setDice] = useState<{ current: DiceCue | null; queue: DiceCue[] }>({
    current: null,
    queue: []
  });
  const [drawCue, setDrawCue] = useState<DrawCue | null>(null);
  const [flippedUnitIds, setFlippedUnitIds] = useState<Set<string>>(new Set());
  const seenRollIdsRef = useRef<Set<string> | null>(null);
  const seenDrawIdsRef = useRef<Set<string>>(new Set());
  const seenFlipIdsRef = useRef<Set<string>>(new Set());
  // The draw cue needs the live seat without resubscribing the SSE stream.
  const viewerRef = useRef<PlayerId>("p1");
  useEffect(() => {
    viewerRef.current = viewerPlayerId;
  }, [viewerPlayerId]);

  // Every server snapshot funnels through here so new attack rolls, card
  // draws and pack flips cue their animations on every seat. The first
  // snapshot only primes the seen-sets, so a page reload does not replay
  // old effects.
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

    if (!seenRollIdsRef.current) {
      seenRollIdsRef.current = new Set(rolls.map((event) => event.id));
      seenDrawIdsRef.current = new Set(draws.map((event) => event.id));
      seenFlipIdsRef.current = new Set(flips.map((event) => event.id));
    } else {
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

      // Draw effect: show the cards leaving the deck for the hand. Only the
      // drawing seat sees the faces; everyone else sees card backs.
      const freshDraw = draws.filter((event) => !seenDrawIdsRef.current.has(event.id)).at(-1);
      for (const event of draws) {
        seenDrawIdsRef.current.add(event.id);
      }
      if (freshDraw && freshDraw.count > 0) {
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
    }

    setState(nextState);
  }, []);

  const ingestSnapshot = useCallback(
    (snapshot: GameRoomSnapshot) => {
      setRoomVersion((currentVersion) => {
        if (snapshot.version > currentVersion) {
          ingestServerState(snapshot.state);
          setSyncStatus(`live v${snapshot.version}`);
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

  const isSeated = viewerPlayerId !== OBSERVER_SEAT && Boolean(state.players[viewerPlayerId]);
  const playerView = useMemo(
    () => getPlayerView(state, isSeated ? viewerPlayerId : OBSERVER_SEAT),
    [state, viewerPlayerId, isSeated]
  );
  const legalActions = useMemo(
    () => (isSeated ? getLegalActions(state, viewerPlayerId) : []),
    [viewerPlayerId, state, isSeated]
  );
  const selectedCardTargetCount = selectedCardAction
    ? legalActions.filter(
        (legal) =>
          (legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD") &&
          legal.action.cardId === selectedCardAction.cardId &&
          legal.action.target?.type === "unit"
      ).length
    : 0;

  useEffect(() => {
    const initialRoomId = getInitialRoomId();
    if (initialRoomId === roomId) {
      return;
    }

    window.setTimeout(() => {
      setRoomId(initialRoomId);
      setRoomInput(initialRoomId);
    }, 0);
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;

    fetchRoom(roomId)
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        seenRollIdsRef.current = null;
        ingestServerState(snapshot.state);
        setRoomVersion(snapshot.version);
        setSyncStatus(`synced v${snapshot.version}`);
      })
      .catch((error) => {
        if (!cancelled) {
          setSyncStatus(error instanceof Error ? error.message : "room sync failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, ingestServerState]);

  // Real-time sync: a Server-Sent Events stream pushes every snapshot the
  // moment any player acts; polling stays as a slow fallback for dropped
  // streams.
  useEffect(() => {
    const source = new EventSource(`/api/rooms/${encodeURIComponent(roomId)}/stream`);
    let streamHealthy = true;

    source.onmessage = (message) => {
      streamHealthy = true;
      try {
        ingestSnapshot(JSON.parse(message.data) as GameRoomSnapshot);
      } catch {
        // Ignore malformed keep-alives.
      }
    };
    source.onerror = () => {
      streamHealthy = false;
      setSyncStatus("stream reconnecting");
    };

    const pollId = window.setInterval(() => {
      if (streamHealthy) {
        return;
      }
      fetchRoom(roomId)
        .then(ingestSnapshot)
        .catch(() => setSyncStatus("room sync failed"));
    }, 4000);

    return () => {
      source.close();
      window.clearInterval(pollId);
    };
  }, [roomId, ingestSnapshot]);

  const submitAction = async (action: GameAction) => {
    setSyncStatus("submitting");
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      setErrors(["Server rejected the action request."]);
      setSyncStatus("submit failed");
      return;
    }

    const payload = (await response.json()) as {
      snapshot: GameRoomSnapshot;
      result: EngineResult;
    };
    setErrors(payload.result.errors.map((error) => error.message));
    ingestServerState(payload.snapshot.state);
    setRoomVersion(payload.snapshot.version);
    setSyncStatus(`synced v${payload.snapshot.version}`);

    if (payload.result.errors.length === 0) {
      setSelectedCardAction(null);
      setRefreshDiscards([]);
      setTilePlacement(null);
    }
  };

  const resetRoom = async (mode: "adventure" | "combat-sandbox") => {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reset: true, mode })
    });

    if (!response.ok) {
      setErrors(["Could not reset the room."]);
      return;
    }

    const snapshot = (await response.json()) as GameRoomSnapshot;
    seenRollIdsRef.current = null;
    ingestServerState(snapshot.state);
    setRoomVersion(snapshot.version);
    setErrors([]);
    setSelectedCardAction(null);
    setDice({ current: null, queue: [] });
    setSyncStatus(`synced v${snapshot.version}`);
  };

  const joinRoom = () => {
    const nextRoomId = roomInput.trim() || "dev-room";
    window.history.replaceState(null, "", `?room=${encodeURIComponent(nextRoomId)}`);
    setErrors([]);
    setSelectedCardAction(null);
    setRoomId(nextRoomId);
  };

  const trayActive = Boolean(state.reactionWindow && state.reactionWindow.priorityPlayerId === viewerPlayerId);
  const seatIds = state.turnOrder.filter((playerId) => playerId !== NEUTRAL_PLAYER_ID);
  const combatVisible = Boolean(state.combat);
  const adventureMode = state.mode === "adventure";

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
        <input aria-label="Room ID" onChange={(event) => setRoomInput(event.target.value)} value={roomInput} />
        <button onClick={joinRoom} title="Join room" type="button">
          <StepForward aria-hidden="true" size={13} />
        </button>
      </div>
      <div className="menuRow statusRow">
        <span>{roomId}</span>
        <small>
          v{roomVersion} · {syncStatus} · {state.phase}
        </small>
      </div>
      <div className="menuRow resetRow">
        <button onClick={() => resetRoom("adventure")} title="Start a new adventure game" type="button">
          New adventure
        </button>
        <button onClick={() => resetRoom("combat-sandbox")} title="Open the combat sandbox" type="button">
          <Swords aria-hidden="true" size={12} />
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

  // ---- Adventure map screen ----------------------------------------------
  if (adventureMode && !combatVisible) {
    const viewer = isSeated ? state.players[viewerPlayerId] : null;
    const refreshPending = Boolean(viewer?.needsHandRefresh) && state.activePlayerId === viewerPlayerId;
    const handCards = isSeated ? (playerView.players[viewerPlayerId]?.hand ?? []) : [];
    const overLimit = viewer ? handCards.length - refreshDiscards.length - viewer.limits.hand : 0;

    return (
      <CardZoomProvider>
      <main className="tableRoot adventureRoot">
        <div className="tableTopRow">
          <AdventureHud
            legalActions={legalActions.filter((legal) => legal.action.type !== "REFRESH_HAND" || !refreshPending)}
            onAction={submitAction}
            state={state}
            viewerPlayerId={isSeated ? viewerPlayerId : seatIds[0]}
          />
          {tableMenu}
        </div>

        {errorBanner}

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
              onAction={submitAction}
              placement={tilePlacement}
              state={state}
              viewerPlayerId={viewerPlayerId}
            />
            {isSeated ? (
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
                <HeroBoardPanel playerId={viewerPlayerId} state={state} />
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
                  <HeroBoardPanel playerId={playerId} state={state} />
                  <ArmyPanel playerId={playerId} state={state} />
                </div>
              ))
            )}
          </div>
        </div>

        {isSeated && handCards.length > 0 ? (
          <div className={`adventureHand ${refreshPending ? "refreshing" : ""}`} aria-label="Your hand">
            {refreshPending ? (
              <div className="refreshBar">
                <span>
                  Discard any cards, then draw to {viewer?.limits.hand}.
                  {overLimit > 0 ? ` Discard ${overLimit} more.` : ""}
                </span>
                <button
                  className="commandButton primary"
                  disabled={overLimit > 0}
                  onClick={() =>
                    submitAction({
                      type: "REFRESH_HAND",
                      playerId: viewerPlayerId,
                      discardCardIds: refreshDiscards.map((index) => handCards[index])
                    })
                  }
                  type="button"
                >
                  Draw up to {viewer?.limits.hand}
                </button>
              </div>
            ) : null}
            <div className="adventureHandCards">
              {handCards.map((cardId, index) => (
                <div className="adventureHandSlot" key={`${cardId}-${index}`}>
                  <button
                    className={`adventureHandCard ${refreshDiscards.includes(index) ? "discarding" : ""}`}
                    onClick={() =>
                      refreshPending
                        ? setRefreshDiscards((current) =>
                            current.includes(index)
                              ? current.filter((value) => value !== index)
                              : [...current, index]
                          )
                        : undefined
                    }
                    title={refreshPending ? `Toggle discard ${cardName(cardId)}` : cardName(cardId)}
                    type="button"
                  >
                    <CardFrame cardId={cardId} className="handCardImage" />
                  </button>
                  <AdventureHandZoom cardId={cardId} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <PromptTray legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
        <SearchModal onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
        <LogDrawer state={state} />
        {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
        {drawCue ? <DrawOverlay cue={drawCue} key={drawCue.id} onDone={() => setDrawCue(null)} /> : null}
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
              seatIds.map((playerId) => <HeroPanel key={playerId} playerId={playerId} state={state} />)
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
          <HandFan
            legalActions={legalActions}
            onAction={submitAction}
            onSelectCardAction={setSelectedCardAction}
            selectedCardAction={selectedCardAction}
            state={state}
            trayActive={trayActive}
            view={playerView}
            viewerPlayerId={viewerPlayerId}
          />
        ) : (
          <div className="observerNote">Observer mode: hands stay hidden, the fight is live.</div>
        )}
      </div>

      <LogDrawer state={state} />

      <PromptTray legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      <ReactionTray
        key={`${state.reactionWindow?.id ?? "none"}:${state.reactionWindow?.priorityPlayerId ?? ""}`}
        legalActions={legalActions}
        onAction={submitAction}
        state={state}
        view={playerView}
        viewerPlayerId={viewerPlayerId}
      />
      <SearchModal onAction={submitAction} state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
      <RerollModal legalActions={legalActions} onAction={submitAction} state={state} viewerPlayerId={viewerPlayerId} />
      {pile ? <PileModal {...pile} onClose={() => setPile(null)} /> : null}
      {drawCue && !dice.current ? <DrawOverlay cue={drawCue} key={drawCue.id} onDone={() => setDrawCue(null)} /> : null}
      {dice.current ? <DiceOverlay cue={dice.current} key={dice.current.id} onDone={dismissDice} /> : null}
    </main>
    </CardZoomProvider>
  );
}
