import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/engine";
import { orderFxEventsForPresentation } from "./fx-sequence";

/** Minimal event stand-ins; only `type` (and an id for tracking) matter here. */
function ev(type: GameEvent["type"], id: string): { type: GameEvent["type"]; id: string } {
  return { type, id };
}

const typesOf = (events: { type: GameEvent["type"] }[]) => events.map((e) => e.type);

describe("orderFxEventsForPresentation", () => {
  it("moves a damage spell's resolution ahead of the damage and death it caused", () => {
    // Engine log order: the card flies, damage is dealt, the unit dies, THEN the
    // spell pops off the stack as resolved.
    const log = [
      ev("SPELL_CAST_STARTED", "a"),
      ev("DAMAGE_ASSIGNED", "b"),
      ev("UNIT_REMOVED", "c"),
      ev("SPELL_CAST_RESOLVED", "d")
    ];
    expect(typesOf(orderFxEventsForPresentation(log))).toEqual([
      "SPELL_CAST_STARTED",
      "SPELL_CAST_RESOLVED", // the fireball now plays first
      "DAMAGE_ASSIGNED", // then the number
      "UNIT_REMOVED" // then the unit falls
    ]);
  });

  it("orders a heal spell's resolution ahead of its DAMAGE_HEALED", () => {
    const log = [ev("SPELL_CAST_STARTED", "a"), ev("DAMAGE_HEALED", "b"), ev("SPELL_CAST_RESOLVED", "c")];
    expect(typesOf(orderFxEventsForPresentation(log))).toEqual([
      "SPELL_CAST_STARTED",
      "SPELL_CAST_RESOLVED",
      "DAMAGE_HEALED"
    ]);
  });

  it("leaves attack damage untouched (no spell resolution to pull ahead)", () => {
    const log = [ev("UNIT_ATTACK_DECLARED", "a"), ev("DAMAGE_ASSIGNED", "b"), ev("UNIT_REMOVED", "c")];
    expect(typesOf(orderFxEventsForPresentation(log))).toEqual([
      "UNIT_ATTACK_DECLARED",
      "DAMAGE_ASSIGNED",
      "UNIT_REMOVED"
    ]);
  });

  it("leaves unit-ability damage untouched (it already logs trigger before damage)", () => {
    const log = [ev("UNIT_ABILITY_TRIGGERED", "a"), ev("DAMAGE_ASSIGNED", "b"), ev("UNIT_REMOVED", "c")];
    expect(typesOf(orderFxEventsForPresentation(log))).toEqual([
      "UNIT_ABILITY_TRIGGERED",
      "DAMAGE_ASSIGNED",
      "UNIT_REMOVED"
    ]);
  });

  it("handles two spells in one batch independently", () => {
    const log = [
      ev("SPELL_CAST_STARTED", "s1"),
      ev("DAMAGE_ASSIGNED", "d1"),
      ev("SPELL_CAST_RESOLVED", "r1"),
      ev("SPELL_CAST_STARTED", "s2"),
      ev("DAMAGE_ASSIGNED", "d2"),
      ev("SPELL_CAST_RESOLVED", "r2")
    ];
    const out = orderFxEventsForPresentation(log);
    expect(out.map((e) => (e as { id: string }).id)).toEqual(["s1", "r1", "d1", "s2", "r2", "d2"]);
  });

  it("keeps a buff spell (no result events) in place", () => {
    const log = [ev("SPELL_CAST_STARTED", "a"), ev("SPELL_CAST_RESOLVED", "b")];
    expect(typesOf(orderFxEventsForPresentation(log))).toEqual(["SPELL_CAST_STARTED", "SPELL_CAST_RESOLVED"]);
  });

  it("preserves the relative order of damage then removal within a cast", () => {
    const log = [
      ev("SPELL_CAST_STARTED", "a"),
      ev("DAMAGE_ASSIGNED", "dmg"),
      ev("UNIT_REMOVED", "rm"),
      ev("SPELL_CAST_RESOLVED", "res")
    ];
    const out = orderFxEventsForPresentation(log);
    const dmgIndex = out.findIndex((e) => (e as { id: string }).id === "dmg");
    const rmIndex = out.findIndex((e) => (e as { id: string }).id === "rm");
    expect(dmgIndex).toBeLessThan(rmIndex);
  });

  it("flushes a non-spell damage run before the next non-result event", () => {
    // Fire Shield retaliation damage with no spell behind it must not be pulled
    // around a following event.
    const log = [ev("DAMAGE_ASSIGNED", "fs"), ev("UNIT_DEFENDED", "def")];
    expect(orderFxEventsForPresentation(log).map((e) => (e as { id: string }).id)).toEqual(["fs", "def"]);
  });
});
