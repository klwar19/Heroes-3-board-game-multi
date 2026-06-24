import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/engine";
import {
  orderFxEventsForPresentation,
  partitionCombatMoves,
  planActivationSpellPreamble,
  planApproachAttackPreDelays,
  planApproachMoveDelays,
  planReturnMoveDelays
} from "./fx-sequence";

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

describe("planApproachAttackPreDelays (Harpy fly-in: glide before the die)", () => {
  const GLIDE = 300;
  const PAUSE = 250;

  it("holds a PLAYER mover's die for the glide so it never rolls mid-flight", () => {
    // The regression: this was neutral-only, so a player Harpy rolled while
    // still gliding. A player mover must now get the glide hold (no pause).
    const delays = planApproachAttackPreDelays(
      [{ unitId: "harpy", neutral: false }],
      [{ attackerId: "harpy" }],
      GLIDE,
      PAUSE
    );
    expect(delays.get("harpy")).toBe(GLIDE);
  });

  it("adds the dramatic pause on top for a NEUTRAL mover (unchanged behaviour)", () => {
    const delays = planApproachAttackPreDelays(
      [{ unitId: "guard", neutral: true }],
      [{ attackerId: "guard" }],
      GLIDE,
      PAUSE
    );
    expect(delays.get("guard")).toBe(GLIDE + PAUSE);
  });

  it("ignores a mover that does not attack this snapshot, and an attacker that did not move", () => {
    const delays = planApproachAttackPreDelays(
      [
        { unitId: "wanderer", neutral: false }, // moved but no roll → no hold
        { unitId: "harpy", neutral: false }
      ],
      [
        { attackerId: "harpy" },
        { attackerId: "already-adjacent" } // rolled but never moved → no hold
      ],
      GLIDE,
      PAUSE
    );
    expect(delays.has("wanderer")).toBe(false);
    expect(delays.has("already-adjacent")).toBe(false);
    expect(delays.get("harpy")).toBe(GLIDE);
    expect(delays.size).toBe(1);
  });
});

describe("planActivationSpellPreamble (Faerie Dragon cast-before-move ordering)", () => {
  const LEADING = new Set(["faerie-dragon-spell"]);
  // A cast that presents for 800ms, then holds its damage 150ms before the move.
  const timing = () => ({ castMs: 800, holdMs: 150 });

  function ability(id: string, abilityId: string, unitId: string, targetUnitId?: string) {
    return { type: "UNIT_ABILITY_TRIGGERED" as const, id, abilityId, unitId, targetUnitId };
  }

  it("leads the cast at t=0, lands its damage at the burst, and shifts the rest by cast+hold", () => {
    const log = [
      ability("bolt", "faerie-dragon-spell", "dragon", "victim"),
      { type: "UNIT_MOVED" as const, id: "move", unitId: "dragon" },
      { type: "DAMAGE_ASSIGNED" as const, id: "atk-dmg" }
    ];
    const { leadMs, casts } = planActivationSpellPreamble(log, LEADING, timing);
    // The whole timeline (move + dice) shifts by the cast + its damage hold.
    expect(leadMs).toBe(950);
    expect(casts).toHaveLength(1);
    // The cast plays first; its damage lands as the bolt bursts, BEFORE leadMs
    // (the move starts) — i.e. cast → damage → move.
    expect(casts[0]).toMatchObject({ eventId: "bolt", castStart: 0, damageAt: 800, targetUnitId: "victim" });
    expect(casts[0].damageAt).toBeLessThan(leadMs);
  });

  it("does not shift a snapshot with no leading activation spell (every ordinary combat)", () => {
    const log = [
      ability("sting", "wyvern-sting", "wyvern", "victim"), // a normal on-attack ability
      { type: "UNIT_MOVED" as const, id: "move", unitId: "wyvern" },
      { type: "ATTACK_ROLLED" as const, id: "roll" }
    ];
    expect(planActivationSpellPreamble(log, LEADING, timing)).toEqual({ leadMs: 0, casts: [] });
  });

  it("sequences two leading casts back-to-back", () => {
    const log = [
      ability("b1", "faerie-dragon-spell", "d1", "v1"),
      ability("b2", "faerie-dragon-spell", "d2", "v2")
    ];
    const { leadMs, casts } = planActivationSpellPreamble(log, LEADING, timing);
    expect(casts.map((c) => c.castStart)).toEqual([0, 950]);
    expect(casts.map((c) => c.damageAt)).toEqual([800, 1750]);
    expect(leadMs).toBe(1900);
  });

  it("falls back to the caster as the target when no target is named", () => {
    const log = [ability("b", "faerie-dragon-spell", "dragon")];
    expect(planActivationSpellPreamble(log, LEADING, timing).casts[0].targetUnitId).toBe("dragon");
  });
});

describe("planApproachMoveDelays / planReturnMoveDelays (batched neutral activations)", () => {
  // The neutral pump batches several guards into one snapshot when the human
  // has nothing to react with. A Harpy that attacks AFTER an earlier guard must
  // fly IN as its own die is thrown (not at t=0, over the earlier guard's dice)
  // and fly BACK after its OWN strike (not after every later guard has struck).
  it("pins a batched approach glide to the unit's own die throw, not t=0", () => {
    // Earlier guard's die throws at 100; the Harpy's at 600, with a 300ms
    // glide+pause folded into that wait. The glide must START at 600-300 = 300
    // (just after the earlier guard's dice), never at the snapshot start.
    const delays = planApproachMoveDelays(
      [{ unitId: "harpy" }],
      new Map([["other", 100], ["harpy", 600]]),
      new Map([["harpy", 300]]),
      0,
      130
    );
    expect(delays).toEqual([300]);
  });

  it("floors the glide at the lead and falls back to the stagger when a mover has no die", () => {
    // dieThrow - preDelay would be negative → floored at the lead (40).
    const floored = planApproachMoveDelays([{ unitId: "harpy" }], new Map([["harpy", 100]]), new Map([["harpy", 300]]), 40, 130);
    expect(floored).toEqual([40]);
    // A plain reposition (no die this snapshot) keeps the old lead+stagger path.
    const noDie = planApproachMoveDelays(
      [{ unitId: "ghost-a" }, { unitId: "ghost-b" }],
      new Map(),
      new Map(),
      40,
      130
    );
    expect(noDie).toEqual([40, 170]);
  });

  it("leaves a fly-back after the unit's OWN strike, falling back to the timeline end with no strike", () => {
    // The Harpy strikes (end 800) while a later guard ends at 2000: the Harpy
    // still flies back at 800, independent of the later guard.
    const own = planReturnMoveDelays(
      [{ unitId: "harpy" }],
      new Map([["harpy", 800], ["later", 2000]]),
      9999,
      130
    );
    expect(own).toEqual([800]);
    // A player Harpy's fly-back arrives a frame later with no strike of its own,
    // so it trails the running timeline end (the fallback).
    const fallback = planReturnMoveDelays([{ unitId: "harpy" }], new Map(), 450, 130);
    expect(fallback).toEqual([450]);
  });
});
