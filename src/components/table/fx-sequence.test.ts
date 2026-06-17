import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/engine";
import { orderFxEventsForPresentation, partitionCombatMoves } from "./fx-sequence";

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

describe("partitionCombatMoves (Harpy Strike-and-Return ordering)", () => {
  // The neutral Harpy resolves move → attack → fly-back in one snapshot. The
  // approach move precedes its ATTACK_ROLLED in the log; the return move follows
  // it. The return must be held until after the strike, or the Harpy teleports
  // home before its die is thrown.
  const log = [
    { type: "UNIT_MOVED" as const, id: "m-approach", unitId: "harpy" },
    { type: "ATTACK_ROLLED" as const, id: "roll", attackerId: "harpy" },
    { type: "RETALIATION_ATTACKED" as const, id: "retal" },
    { type: "UNIT_MOVED" as const, id: "m-return", unitId: "harpy" }
  ];

  it("classifies the pre-attack move as approach and the post-attack move as fly-back", () => {
    const moves = [
      { id: "m-approach", unitId: "harpy", from: "10" },
      { id: "m-return", unitId: "harpy", from: "2" }
    ];
    const { approach, afterAttack } = partitionCombatMoves(log, moves);
    expect(approach.map((m) => m.id)).toEqual(["m-approach"]);
    expect(afterAttack.map((m) => m.id)).toEqual(["m-return"]);
  });

  it("treats a unit's move as approach when it has no attack this snapshot", () => {
    // A plain repositioning unit (no ATTACK_ROLLED) always animates up front.
    const moves = [{ id: "m-approach", unitId: "ghost", from: "10" }];
    const { approach, afterAttack } = partitionCombatMoves(log, moves);
    expect(approach.map((m) => m.id)).toEqual(["m-approach"]);
    expect(afterAttack).toEqual([]);
  });

  it("only pins the moving unit's own attack — another unit's roll does not reorder it", () => {
    const otherLog = [
      { type: "ATTACK_ROLLED" as const, id: "roll-other", attackerId: "marksmen" },
      { type: "UNIT_MOVED" as const, id: "m1", unitId: "harpy" }
    ];
    const { approach, afterAttack } = partitionCombatMoves(otherLog, [{ id: "m1", unitId: "harpy", from: "5" }]);
    expect(approach.map((m) => m.id)).toEqual(["m1"]);
    expect(afterAttack).toEqual([]);
  });
});
