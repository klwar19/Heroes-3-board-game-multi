import { describe, expect, it } from "vitest";
import type { GameEvent, GameState } from "@/engine";
import { buildTownCaptureCue, isEnemyTownCapture } from "./town-capture-cue";

/**
 * The town-capture pop-up is pure over the engine's real state: it reads the
 * former owner's post-action `eliminationCountdown` to decide the wording, and
 * only the conqueror and the former owner get a cue. These pin that behaviour.
 */

type Clock = number | null;

function stateWith(p2: { eliminated?: boolean; eliminationCountdown?: Clock }): GameState {
  return {
    players: {
      p1: { name: "Dracon" },
      p2: { name: "Catherine", eliminated: p2.eliminated ?? false, eliminationCountdown: p2.eliminationCountdown ?? null }
    }
  } as unknown as GameState;
}

const captureEvent = (over: Partial<GameEvent> = {}): GameEvent =>
  ({
    id: "evt-1",
    type: "FIELD_FLAGGED",
    playerId: "p1",
    fieldId: "3,4",
    location: "town",
    previousOwnerId: "p2",
    ...over
  }) as GameEvent;

describe("isEnemyTownCapture", () => {
  it("matches only an enemy faction-town flag taken from a rival", () => {
    expect(isEnemyTownCapture(captureEvent())).toBe(true);
    // A first-flag (no previous owner) is not a capture.
    expect(isEnemyTownCapture(captureEvent({ previousOwnerId: null }))).toBe(false);
    // A settlement / mine flag routes through its own system.
    expect(isEnemyTownCapture(captureEvent({ location: "settlement" }))).toBe(false);
    // Re-flagging your own town is not a capture.
    expect(isEnemyTownCapture(captureEvent({ previousOwnerId: "p1" }))).toBe(false);
    // Neutral-held is not a rival capture.
    expect(isEnemyTownCapture(captureEvent({ previousOwnerId: "neutrals" }))).toBe(false);
  });
});

describe("buildTownCaptureCue", () => {
  it("returns null for a seat that is neither the conqueror nor the former owner", () => {
    expect(buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: 2 }), "p3")).toBeNull();
  });

  it("returns null for a non-capture event", () => {
    expect(buildTownCaptureCue(captureEvent({ location: "mine" }), stateWith({}), "p1")).toBeNull();
  });

  it("tells the CONQUEROR it is not an instant win and names the former owner's clock", () => {
    const cue = buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: 2 }), "p1");
    expect(cue).not.toBeNull();
    expect(cue!.title).toBe("Enemy town captured!");
    expect(cue!.subtitle).toContain("Catherine");
    const text = cue!.lines.join(" ");
    expect(text).toContain("NOT an instant win");
    expect(text).toContain("Catherine has 2 more turns");
    expect(text).toContain("last faction standing");
  });

  it("tells the FORMER OWNER their grace period when they are on the clock", () => {
    const cue = buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: 2 }), "p2");
    expect(cue).not.toBeNull();
    expect(cue!.title).toBe("Your town was captured!");
    const text = cue!.lines.join(" ");
    expect(text).toContain("2 more of your turns");
    expect(text).toContain("Grab a new base");
  });

  it("uses the singular for a one-turn clock", () => {
    const owner = buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: 1 }), "p2");
    expect(owner!.lines.join(" ")).toContain("1 more of your turns");
    const conq = buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: 1 }), "p1");
    expect(conq!.lines.join(" ")).toContain("Catherine has 1 more turn ");
  });

  it("says the former owner fights on when they still hold a base (clock null)", () => {
    // CONTROL: with no clock, the conqueror is told the rival still holds a base
    // (so this is exactly why capturing their town did NOT win).
    const conq = buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: null }), "p1");
    expect(conq!.lines.join(" ")).toContain("still holds another Town or Settlement");
    const owner = buildTownCaptureCue(captureEvent(), stateWith({ eliminationCountdown: null }), "p2");
    expect(owner!.lines.join(" ")).toContain("You still hold another Town or Settlement");
  });

  it("says eliminated when the former owner has no base left", () => {
    const owner = buildTownCaptureCue(
      captureEvent(),
      stateWith({ eliminated: true, eliminationCountdown: 0 }),
      "p2"
    );
    expect(owner!.lines.join(" ")).toContain("been eliminated");
  });
});
