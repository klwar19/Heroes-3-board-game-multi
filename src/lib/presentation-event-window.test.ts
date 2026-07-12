import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/engine";
import {
  initialPresentationEventCursor,
  presentationEventWindow
} from "./presentation-event-window";

function events(...ids: string[]): GameEvent[] {
  return ids.map((id) => ({ id, type: "ROUND_STARTED", round: 1 }) as GameEvent);
}

describe("presentation event window", () => {
  it("primes an initial connection without treating history as live", () => {
    const result = presentationEventWindow(initialPresentationEventCursor(), events("evt_2", "evt_7"));

    expect(result).toMatchObject({ prime: true, gap: false });
    expect(result.events.map((event) => event.id)).toEqual(["evt_2", "evt_7"]);
    expect(result.cursor.lastEventId).toBe("evt_7");
  });

  it("returns only events after the previously processed tail", () => {
    const first = presentationEventWindow(initialPresentationEventCursor(), events("evt_2", "evt_7"));
    const next = presentationEventWindow(first.cursor, events("evt_2", "evt_7", "evt_11", "evt_15"));

    expect(next).toMatchObject({ prime: false, gap: false });
    expect(next.events.map((event) => event.id)).toEqual(["evt_11", "evt_15"]);
  });

  it("returns no events for a duplicate snapshot", () => {
    const first = presentationEventWindow(initialPresentationEventCursor(), events("evt_3"));
    expect(presentationEventWindow(first.cursor, events("evt_3")).events).toEqual([]);
  });

  it("accepts the first events after an initially empty log", () => {
    const empty = presentationEventWindow(initialPresentationEventCursor(), []);
    const next = presentationEventWindow(empty.cursor, events("evt_9"));

    expect(next).toMatchObject({ prime: false, gap: false });
    expect(next.events.map((event) => event.id)).toEqual(["evt_9"]);
  });

  it("detects rotation and primes current history instead of replaying a partial timeline", () => {
    const first = presentationEventWindow(initialPresentationEventCursor(), events("evt_1", "evt_2"));
    const rotated = presentationEventWindow(first.cursor, events("evt_100", "evt_101"));

    expect(rotated).toMatchObject({ prime: true, gap: true });
    expect(rotated.events.map((event) => event.id)).toEqual(["evt_100", "evt_101"]);
  });
});
