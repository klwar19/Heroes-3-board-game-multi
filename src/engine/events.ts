import type { GameEvent, GameState } from "./state";

type EventDraft = Omit<GameEvent, "id">;

/**
 * The log keeps only the most recent events. Long adventures used to grow the
 * log (and with it every snapshot, clone and player view) without bound until
 * clicks took seconds; the cap keeps the working set constant while staying
 * far larger than anything the UI or in-flight resolutions look back at.
 */
const EVENT_LOG_LIMIT = 500;

/** Next unique event number; tolerant of snapshots saved before the counter. */
export function nextEventNumber(state: GameState): number {
  const counter = Math.max(state.eventCounter ?? 0, state.eventLog.length) + 1;
  state.eventCounter = counter;
  return counter;
}

/**
 * Ever-increasing number for random seeds and generated ids. Reading the
 * capped log length instead would freeze the value (and with it every "new"
 * die roll) once the log is full.
 */
export function eventSeedNumber(state: GameState): number {
  return Math.max(state.eventCounter ?? 0, state.eventLog.length);
}

export function appendEvent<T extends EventDraft>(
  state: GameState,
  event: T
): Extract<GameEvent, { type: T["type"] }> {
  const nextEvent = {
    id: `evt_${nextEventNumber(state)}`,
    ...event
  } as unknown as Extract<GameEvent, { type: T["type"] }>;

  state.eventLog.push(nextEvent);
  if (state.eventLog.length > EVENT_LOG_LIMIT) {
    state.eventLog.splice(0, state.eventLog.length - EVENT_LOG_LIMIT);
  }
  return nextEvent;
}
