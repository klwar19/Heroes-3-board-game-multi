import type { GameEvent } from "@/engine";

export type PresentationEventCursor = {
  initialized: boolean;
  lastEventId: string | null;
};

export type PresentationEventWindow = {
  /** Events eligible for presentation in this snapshot. */
  events: readonly GameEvent[];
  /** True when presentation state should be primed instead of replayed. */
  prime: boolean;
  /** The previous cursor fell outside the server's bounded event log. */
  gap: boolean;
  cursor: PresentationEventCursor;
};

export function initialPresentationEventCursor(): PresentationEventCursor {
  return { initialized: false, lastEventId: null };
}

/**
 * Select the unseen suffix of the bounded authoritative event log.
 *
 * Event ids are unique but not necessarily consecutive: the engine's shared
 * counter also allocates ids for choices, units and effects. Finding the exact
 * previous tail is therefore safer than assuming `last + 1`. If that tail has
 * rotated out, callers prime from the current log and rebuild active overlays
 * from state rather than replaying an unknown partial timeline.
 */
export function presentationEventWindow(
  current: PresentationEventCursor,
  log: readonly GameEvent[]
): PresentationEventWindow {
  const lastEventId = log.at(-1)?.id ?? null;
  const cursor = { initialized: true, lastEventId } satisfies PresentationEventCursor;

  if (!current.initialized) {
    return { events: log, prime: true, gap: false, cursor };
  }

  if (current.lastEventId === null) {
    return { events: log, prime: false, gap: false, cursor };
  }

  const previousTail = log.findIndex((event) => event.id === current.lastEventId);
  if (previousTail >= 0) {
    return { events: log.slice(previousTail + 1), prime: false, gap: false, cursor };
  }

  // An empty log can occur after a game reset. Prime it just like a rotated
  // log so stale presentation queues from the previous adventure are cleared.
  return { events: log, prime: true, gap: true, cursor };
}
