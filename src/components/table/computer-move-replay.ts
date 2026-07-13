import { useCallback, useRef, useState } from "react";
import { isComputerPlayer } from "@/engine";
import type { GameState, MapSpaceId, PlayerId } from "@/engine";

/**
 * Single-player presentation: a computer opponent's whole map turn settles
 * server-side (possibly many HERO_MOVED events in one snapshot). Rather than
 * teleporting the pawns, the human advances the walk one cell at a time with
 * an explicit Next press — battles already resolved off-screen and are never
 * shown. Nothing here gates rules progression: the settled state is already
 * authoritative; the pawns merely lag behind it until Confirm releases them.
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
 * the instant path-arrow; only opponents the human cannot control get the
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
 * Legacy auto-pace interval (ms). Kept for tests that still pass a step timer;
 * live UI uses manual Next instead so nothing races past confirmation.
 */
export const REPLAY_STEP_MS = 900;

export type ComputerMoveReplayControl = {
  /** Map override to render pawns at (heroId -> cell), or null when idle. */
  overrides: Record<string, MapSpaceId> | null;
  /** The seat whose hero is walking right now, for the on-screen indicator. */
  activePlayerId: PlayerId | null;
  /** True while a replay is loaded and not yet confirmed through the last step. */
  active: boolean;
  /** True when every frame has been revealed and Confirm should finish. */
  finished: boolean;
  /** Remaining frames after the current position (0 when finished). */
  remainingSteps: number;
  /** Begin (or restart) a replay. Holds pawns at start cells until stepNext. */
  start: (replay: ComputerMoveReplay) => void;
  /** Advance one cell. No-op when idle or already finished. */
  stepNext: () => void;
  /** Snap the pawns back to the settled positions immediately. */
  cancel: () => void;
  /** Alias of cancel — release overrides after the human confirms the walk. */
  confirm: () => void;
};

/**
 * Manual, confirmation-gated pacing of a ComputerMoveReplay. Holds every
 * replaying hero at its start cell, then advances ONE frame per `stepNext`
 * call (player presses Next), and releases the override on `confirm` after the
 * last cell (or on cancel). No timers — the human never has moves flash by
 * without a press, and the engine never waits on this hook (pure presentation).
 */
export function useComputerMoveReplay(
  _stepMs: number = REPLAY_STEP_MS,
): ComputerMoveReplayControl {
  const [overrides, setOverrides] = useState<Record<string, MapSpaceId> | null>(
    null,
  );
  const [activePlayerId, setActivePlayerId] = useState<PlayerId | null>(null);
  const [index, setIndex] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [active, setActive] = useState(false);
  const framesRef = useRef<ComputerReplayFrame[]>([]);
  const indexRef = useRef(0);

  const cancel = useCallback(() => {
    framesRef.current = [];
    indexRef.current = 0;
    setOverrides(null);
    setActivePlayerId(null);
    setIndex(0);
    setFrameCount(0);
    setActive(false);
  }, []);

  const start = useCallback((replay: ComputerMoveReplay) => {
    // Hold every hero at its first pre-move cell before the first step.
    framesRef.current = replay.frames;
    indexRef.current = 0;
    setOverrides({ ...replay.initialPositions });
    setActivePlayerId(replay.frames[0]?.playerId ?? null);
    setIndex(0);
    setFrameCount(replay.frames.length);
    setActive(true);
  }, []);

  const stepNext = useCallback(() => {
    const frame = framesRef.current[indexRef.current];
    if (!frame) {
      return;
    }
    indexRef.current += 1;
    setOverrides((current) => ({
      ...(current ?? {}),
      [frame.heroId]: frame.cell,
    }));
    setActivePlayerId(frame.playerId);
    setIndex(indexRef.current);
  }, []);

  const finished = active && index >= frameCount && frameCount > 0;
  const remainingSteps = active ? Math.max(0, frameCount - index) : 0;

  return {
    overrides,
    activePlayerId,
    active,
    finished,
    remainingSteps,
    start,
    stepNext,
    cancel,
    confirm: cancel,
  };
}
