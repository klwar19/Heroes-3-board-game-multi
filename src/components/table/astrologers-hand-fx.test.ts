import { describe, expect, it } from "vitest";
import { DRAW_STAGGER_MS, FLIGHT_MS } from "./fx";
import { buildBigCleanupHandFx } from "./astrologers-hand-fx";

describe("Big Cleanup hand presentation", () => {
  it("flies the whole hand to discard before replacement cards fly in", () => {
    const plan = buildBigCleanupHandFx("astro-2", "p1", 3, 3);
    const flights = plan.cues.filter((cue) => cue.kind === "flight");

    expect(flights).toHaveLength(6);
    expect(flights.slice(0, 3)).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "hand:p1", to: "discard:p1" })
    ]));
    expect(flights.slice(3)).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "deck:p1", to: "hand:p1" })
    ]));
    expect(flights[3]?.delayMs).toBe(FLIGHT_MS + 2 * 90);
    expect(plan.durationMs).toBe(2 * FLIGHT_MS + 2 * 90 + 2 * DRAW_STAGGER_MS);
  });

  it("caps the visual fan at six cards without changing the reported counts", () => {
    const plan = buildBigCleanupHandFx("astro-many", "p2", 9, 9);
    expect(plan.cues).toHaveLength(12);
    expect(plan.cues.filter((cue) => cue.id.includes("discard"))).toHaveLength(6);
    expect(plan.cues.filter((cue) => cue.id.includes("draw"))).toHaveLength(6);
  });
});
