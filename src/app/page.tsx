"use client";

import { Crosshair, Eye, StepForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialGameState,
  getLegalActions,
  getPlayerView,
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
import { DeckWells, HandFan, OpponentBar, PlayerDock } from "@/components/table/seats";
import {
  DiceOverlay,
  ReactionTray,
  RerollModal,
  SearchModal,
  type DiceCue
} from "@/components/table/overlays";
import { cardName, unitName, type CardBoardAction } from "@/components/table/utils";

type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
};

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
  const [state, setState] = useState(() => createInitialGameState());
  const [viewerPlayerId, setViewerPlayerId] = useState<PlayerId>("p1");
  const [errors, setErrors] = useState<string[]>([]);
  const [roomId, setRoomId] = useState("dev-room");
  const [roomInput, setRoomInput] = useState("dev-room");
  const [roomVersion, setRoomVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState("connecting");
  const [selectedCardAction, setSelectedCardAction] = useState<CardBoardAction | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [dice, setDice] = useState<{ current: DiceCue | null; queue: DiceCue[] }>({
    current: null,
    queue: []
  });
  const seenRollIdsRef = useRef<Set<string> | null>(null);

  // Every server snapshot funnels through here so new attack rolls cue the
  // dice cinematic on every seat. The first snapshot only primes the
  // seen-set, so a page reload does not replay old rolls.
  const ingestServerState = useCallback((nextState: GameState) => {
    const rolls = nextState.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
    );

    if (!seenRollIdsRef.current) {
      seenRollIdsRef.current = new Set(rolls.map((event) => event.id));
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
    }

    setState(nextState);
  }, []);

  const dismissDice = useCallback(() => {
    setDice((current) =>
      current.queue.length > 0
        ? { current: current.queue[0], queue: current.queue.slice(1) }
        : { current: null, queue: [] }
    );
  }, []);

  const playerView = useMemo(() => getPlayerView(state, viewerPlayerId), [state, viewerPlayerId]);
  const legalActions = useMemo(() => getLegalActions(state, viewerPlayerId), [viewerPlayerId, state]);
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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchRoom(roomId)
        .then((snapshot) => {
          setRoomVersion((currentVersion) => {
            if (snapshot.version > currentVersion) {
              ingestServerState(snapshot.state);
              setSelectedCardAction(null);
              setSyncStatus(`synced v${snapshot.version}`);
              return snapshot.version;
            }

            setSyncStatus(`synced v${currentVersion}`);
            return currentVersion;
          });
        })
        .catch(() => setSyncStatus("room sync failed"));
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [roomId, ingestServerState]);

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
    }
  };

  const resetRoom = async () => {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reset: true })
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

  return (
    <main className="tableRoot">
      <div className="tableTopRow">
        <OpponentBar state={state} view={playerView} viewerPlayerId={viewerPlayerId} />
        <div className="tableMenu" aria-label="Table controls">
          <div className="menuRow seatSwitch">
            {state.turnOrder.map((playerId) => (
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
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="errorBanner" aria-label="Rules errors">
          {errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
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
            legalActions={legalActions}
            onAction={submitAction}
            onInspect={setInspectedUnitId}
            selectedCardAction={selectedCardAction}
            state={state}
            viewerPlayerId={viewerPlayerId}
          />
        </div>
        <div className="rightRail">
          <InspectPanel state={state} unitId={inspectedUnitId} />
          <CommandDock
            legalActions={legalActions}
            onAction={submitAction}
            onReset={resetRoom}
            state={state}
            viewerPlayerId={viewerPlayerId}
          />
        </div>
      </div>

      <div className="tableSeatRow">
        <PlayerDock view={playerView} viewerPlayerId={viewerPlayerId} />
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
      </div>

      <LogDrawer state={state} />

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
      {dice.current ? <DiceOverlay cue={dice.current} key={dice.current.id} onDone={dismissDice} /> : null}
    </main>
  );
}
