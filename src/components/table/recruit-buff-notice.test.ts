import { describe, expect, it } from "vitest";
import { formatEvent } from "./utils";
import type { GameEvent, GameState } from "@/engine/state";

/**
 * House rule (BINH) — Gelu IV: a Sharpshooters recruited via his level-IV
 * specialty is permanently buffed (+1 Attack in every combat). The recruit event
 * carries `attackBuff`, and formatEvent must spell out that the unit is BUFFED so
 * the player's notice/toast makes the buff obvious. This guards that wording (and
 * that a normal recruit stays silent about any buff).
 */
const state = { players: { p1: { name: "Gelu" } } } as unknown as GameState;

describe("Recruit BUFF notice (event feed)", () => {
  it("announces the +1 Attack BUFF on a Gelu-recruited Sharpshooters", () => {
    const event = {
      id: "e1",
      type: "UNIT_RECRUITED",
      playerId: "p1",
      unitDefId: "neutral.sharpshooters",
      kind: "recruit",
      cost: {},
      attackBuff: 1
    } satisfies GameEvent;
    const text = formatEvent(event, state);
    expect(text).toContain("sharpshooters");
    expect(text).toContain("BUFF");
    expect(text).toMatch(/\+1 Attack in every combat/);
  });

  it("CONTROL: a normal recruit says nothing about a buff", () => {
    const event = {
      id: "e2",
      type: "UNIT_RECRUITED",
      playerId: "p1",
      unitDefId: "castle.griffins",
      kind: "recruit",
      cost: { gold: 8 }
    } satisfies GameEvent;
    const text = formatEvent(event, state);
    expect(text).toContain("griffins");
    expect(text).not.toContain("BUFF");
  });
});
