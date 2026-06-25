import { describe, expect, it } from "vitest";
import { formatEvent } from "./utils";
import type { GameEvent, GameState } from "@/engine/state";

/**
 * The forced-hand Astrologers proclamations (Big Cleanup, Annoying Lizard) mutate
 * the hand silently between turns; without a player-facing line they read as the
 * optional start-of-turn draw and feel skippable. formatEvent turns the engine's
 * ASTROLOGERS_HAND_RESHUFFLED notice into that line — this guards its wording.
 */
const state = { players: { p1: { name: "Catherine" } } } as unknown as GameState;

describe("Astrologers forced-hand notice (event feed)", () => {
  it("spells out the forced full discard for Big Cleanup", () => {
    const event = {
      id: "e1",
      type: "ASTROLOGERS_HAND_RESHUFFLED",
      playerId: "p1",
      cardId: "astrologers.big_cleanup",
      name: "Big Cleanup",
      mode: "discard-all",
      discarded: 4,
      drawn: 4,
      round: 2
    } satisfies GameEvent;
    const text = formatEvent(event, state);
    expect(text).toContain("Big Cleanup");
    expect(text).toContain("Catherine");
    expect(text).toMatch(/must discard their whole hand \(4\) and draw 4 new cards/);
  });

  it("spells out the Spell/Artifact reshuffle for Annoying Lizard (singular count)", () => {
    const event = {
      id: "e2",
      type: "ASTROLOGERS_HAND_RESHUFFLED",
      playerId: "p1",
      cardId: "astrologers.annoying_lizard",
      name: "Annoying Lizard",
      mode: "reshuffle-spells",
      discarded: 1,
      drawn: 1,
      round: 4
    } satisfies GameEvent;
    const text = formatEvent(event, state);
    expect(text).toContain("Annoying Lizard");
    expect(text).toMatch(/shuffle 1 Spell\/Artifact card back and draw 1 new/);
  });
});
