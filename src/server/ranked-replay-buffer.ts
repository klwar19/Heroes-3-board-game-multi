import type { EngineResult, GameAction, GameState, PlayerId } from "@/engine";
import {
  appendRankedReplayEntry,
  createRankedReplay,
  finishRankedReplay,
  rankedClashReplayEligible,
  rankedReplayEnabled,
  type RankedReplay,
} from "@/server/ranked-replay";

declare global {
  var __homm3bgRankedReplayBuffers: Map<string, RankedReplay> | undefined;
}

const buffers = globalThis.__homm3bgRankedReplayBuffers ?? new Map<string, RankedReplay>();
globalThis.__homm3bgRankedReplayBuffers = buffers;

/** Built-in room backend collector. Kept wholly outside GameRoomSnapshot. */
export function captureRankedReplayAction(
  roomId: string,
  before: GameState,
  action: GameAction,
  result: EngineResult,
  options: { actorClientId?: string; entropy?: string; now?: number } = {},
  enabled = rankedReplayEnabled(process.env.HOMM3BG_RANKED_REPLAY_ENABLED),
): void {
  if (!enabled) return;
  let replay = buffers.get(roomId);
  if (replay && replay.matchId !== before.seed) {
    buffers.delete(roomId);
    replay = undefined;
  }
  if (!replay) {
    if (rankedClashReplayEligible(before)) {
      replay = createRankedReplay(before, options.now, "mid-match-recovery");
    } else if (rankedClashReplayEligible(result.state)) {
      // START_ADVENTURE is setup, not a strategy sample. The freshly built map
      // becomes the exact initial state for all later decisions.
      buffers.set(roomId, createRankedReplay(result.state, options.now, "adventure-start"));
      return;
    } else {
      return;
    }
  }
  buffers.set(roomId, appendRankedReplayEntry(replay, before, action, result, options));
}

export function takeFinishedRankedReplay(
  roomId: string,
  matchId: string,
  now = Date.now(),
  winnerPlayerId?: PlayerId,
): RankedReplay | null {
  const replay = buffers.get(roomId);
  buffers.delete(roomId);
  return replay?.matchId === matchId ? finishRankedReplay(replay, now, winnerPlayerId) : null;
}

export function discardRankedReplay(roomId: string): void {
  buffers.delete(roomId);
}

/** Test/diagnostic read; returns a serializable copy so callers cannot mutate capture. */
export function peekRankedReplay(roomId: string): RankedReplay | null {
  const replay = buffers.get(roomId);
  return replay ? (JSON.parse(JSON.stringify(replay)) as RankedReplay) : null;
}
