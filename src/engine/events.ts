import type { GameEvent, GameState } from "./state";

type EventDraft = Omit<GameEvent, "id">;

export function appendEvent<T extends EventDraft>(
  state: GameState,
  event: T
): Extract<GameEvent, { type: T["type"] }> {
  const nextEvent = {
    id: `evt_${state.eventLog.length + 1}`,
    ...event
  } as unknown as Extract<GameEvent, { type: T["type"] }>;

  state.eventLog.push(nextEvent);
  return nextEvent;
}
