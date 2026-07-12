import { useCallback, useEffect, useRef, useState } from "react";
import { isComputerPlayer } from "@/engine";
import type { GameState, MapSpaceId, PlayerId } from "@/engine";

/**
 * Single-player presentation: a computer opponent's whole map turn settles
 * server-side inside ONE action transaction (see settleComputerWork), so every
 * one of its hero walks arrives in a single snapshot. Rather than teleporting
 * the pawns to their final cells, the human should be able to WATCH each
 * computer hero walk its path slowly, one cell at a time, one hero at a time —
 * their battles already resolved off-screen and are never shown. This module is
 * the pure, testable core of that replay: it turns the fresh HERO_MOVED events
 * into an ordered list of pawn-position frames (computer heroes only), and the
 * hook paces them out over time. Nothing here gates rules progression — the
 * settled state is already authoritative; the pawns merely lag behind it.
 */

/** The subset of a HERO_MOVED event the replay needs. */
export type ComputerMoveEvent = {
  id: string;
  playerId: PlayerId;
  heroId: string;
  from: MapSpaceId;
  to: MapSpaceId;
};

/** One pawn position to reveal during the replay. */
export type ComputerReplayFrame = {
  heroId: string;
  playerId: PlayerId;
  cell: MapSpaceId;
};

export type ComputerMoveReplay = {
  /**
   * Every replaying hero pinned to its FIRST pre-move cell. Applied as the map
   * override the instant the settled snapshot arrives, so the pawn is held where
   * it started this turn instead of jumping straight to its final position.
   */
  initialPositions: Record<string, MapSpaceId>;
  /**
   * The pawn positions to reveal, in event-log order. Because the server settles
   * players one at a time and a hero's moves are contiguous, this naturally
   * plays each hero's whole walk before the next hero's — "one by one".
   */
  frames: ComputerReplayFrame[];
  /** playerId per replaying hero (for the "<Computer> is moving" indicator). */
  heroPlayerIds: Record<string, PlayerId>;
};

/**
 * Build the replay for the COMPUTER hero walks among `freshMoves` (moves not
 * yet animated this session). Human heroes are excluded — their own moves keep
 * the instant path-arrow; only opponents the human cannot control get the slow,
 * step-by-step walk. Returns null when no fresh move belongs to a computer seat
 * (every ordinary multiplayer game, and any snapshot with only human moves), so
 * the caller can cheaply skip.
 */
export function buildComputerMoveReplay(
  state: GameState,
  freshMoves: ReadonlyArray<ComputerMoveEvent>,
): ComputerMoveReplay | null {
  const initialPositions: Record<string, MapSpaceId> = {};
  const heroPlayerIds: Record<string, PlayerId> = {};
  const frames: ComputerReplayFrame[] = [];
  for (const event of freshMoves) {
    if (!isComputerPlayer(state, event.playerId)) {
      continue;
    }
    if (!(event.heroId in initialPositions)) {
      initialPositions[event.heroId] = event.from;
      heroPlayerIds[event.heroId] = event.playerId;
    }
    frames.push({ heroId: event.heroId, playerId: event.playerId, cell: event.to });
  }
  if (frames.length === 0) {
    return null;
  }
  return { initialPositions, frames, heroPlayerIds };
}

/**
 * How long each single-cell step of a computer walk dwells on screen. Kept
 * deliberately slow — the human explicitly asked to WATCH each opponent walk,
 * not have it flash by — and the walk only starts once the human accepts the
 * end-of-turn prompt (see the page's opponent-turn overlay), so nothing moves
 * behind their back.
 */
export const REPLAY_STEP_MS = 900;

export type ComputerMoveReplayControl = {
  /** Map override to render pawns at (heroId -> cell), or null when idle. */
  overrides: Record<string, MapSpaceId> | null;
  /** The seat whose hero is walking right now, for the on-screen indicator. */
  activePlayerId: PlayerId | null;
  /** Begin (or restart) a replay. Cancels any in-flight one first. */
  start: (replay: ComputerMoveReplay) => void;
  /** Snap the pawns back to the settled positions immediately. */
  cancel: () => void;
};

/**
 * Paces a ComputerMoveReplay out over real time. Holds every replaying hero at
 * its start cell, then advances one frame every `stepMs`, and finally releases
 * the override (a no-op visual — the last frame equals the settled position).
 * The map pawn glides between cells via its own CSS transition, so this only has
 * to move the target one hop at a time. Timers are the only side effect and are
 * cleared on cancel / unmount, so a torn-down table never fires a stray tick.
 */
export function useComputerMoveReplay(
  stepMs: number = REPLAY_STEP_MS,
): ComputerMoveReplayControl {
  const [overrides, setOverrides] = useState<Record<string, MapSpaceId> | null>(
    null,
  );
  const [activePlayerId, setActivePlayerId] = useState<PlayerId | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    setOverrides(null);
    setActivePlayerId(null);
  }, [clearTimer]);

  const start = useCallback(
    (replay: ComputerMoveReplay) => {
      clearTimer();
      // Hold every hero at its first pre-move cell before the first step.
      setOverrides({ ...replay.initialPositions });
      setActivePlayerId(replay.frames[0]?.playerId ?? null);
      let index = 0;
      const advance = () => {
        const frame = replay.frames[index];
        if (!frame) {
          // Trailing dwell elapsed: release the pawns to the settled state.
          timerRef.current = null;
          setOverrides(null);
          setActivePlayerId(null);
          return;
        }
        setOverrides((current) => ({ ...(current ?? {}), [frame.heroId]: frame.cell }));
        setActivePlayerId(frame.playerId);
        index += 1;
        timerRef.current = window.setTimeout(advance, stepMs);
      };
      // First step fires after the initial hold has rendered for one interval.
      timerRef.current = window.setTimeout(advance, stepMs);
    },
    [clearTimer, stepMs],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { overrides, activePlayerId, start, cancel };
}
