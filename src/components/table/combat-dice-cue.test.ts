import { describe, expect, it } from "vitest";
import { appendEvent, createInitialGameState } from "@/engine";
import { makeCombatDiceCue, mergeDiceCuesInEventOrder } from "./combat-dice-cue";
import type { DiceCue } from "./overlays";

describe("combat dice cues for printed follow-up attacks", () => {
  it("keeps the Gold Dragon declaration attached to the second roll", () => {
    const state = createInitialGameState("gold-line-visible-roll");
    const dragon = state.combat!.units.unit_p1_griffins;
    const pegasi = state.combat!.units.unit_p1_marksmen;
    dragon.name = dragon.cardName = "Gold Dragons";
    pegasi.name = pegasi.cardName = "Pegasi";

    appendEvent(state, {
      type: "UNIT_ATTACK_DECLARED",
      playerId: "p1",
      attackerId: dragon.id,
      defenderId: pegasi.id,
      isRetaliation: false,
      attackKind: "melee",
      rollMode: "normal",
      abilityAttack: { abilityId: "dragon-line-attack-3", baseAttack: 3 }
    });
    const rolled = appendEvent(state, {
      type: "ATTACK_ROLLED",
      attackerId: dragon.id,
      defenderId: pegasi.id,
      rolls: [0],
      roll: 0,
      rollMode: "normal",
      attackBonus: 0,
      defenseBonus: 0,
      attackValue: 3,
      defenseValue: 0,
      damage: 3,
      isRetaliation: false
    });
    expect(rolled.type).toBe("ATTACK_ROLLED");
    if (rolled.type !== "ATTACK_ROLLED") throw new Error("expected attack roll");

    expect(makeCombatDiceCue(state, rolled)).toMatchObject({
      attackerName: "Gold Dragons",
      defenderName: "Pegasi",
      attackValue: 3,
      damage: 3,
      abilityAttack: { name: "Dragon Breath", baseAttack: 3 }
    });
  });

  it("does not mislabel an earlier roll when a later follow-up hits the same target", () => {
    const state = createInitialGameState("same-target-follow-up-cues");
    const attacker = state.combat!.units.unit_p1_griffins;
    const defender = state.combat!.units.unit_p2_skeletons;
    const declaration = {
      playerId: "p1" as const,
      attackerId: attacker.id,
      defenderId: defender.id,
      isRetaliation: false,
      attackKind: "melee" as const,
      rollMode: "normal" as const
    };
    appendEvent(state, { type: "UNIT_ATTACK_DECLARED", ...declaration });
    const firstRoll = appendEvent(state, {
      type: "ATTACK_ROLLED",
      attackerId: attacker.id,
      defenderId: defender.id,
      rolls: [0],
      roll: 0,
      rollMode: "normal",
      attackBonus: 0,
      defenseBonus: 0,
      attackValue: 4,
      defenseValue: 1,
      damage: 3,
      isRetaliation: false
    });
    appendEvent(state, {
      type: "UNIT_ATTACK_DECLARED",
      ...declaration,
      abilityAttack: { abilityId: "dragon-line-attack-3", baseAttack: 3 }
    });

    if (firstRoll.type !== "ATTACK_ROLLED") throw new Error("expected attack roll");
    expect(makeCombatDiceCue(state, firstRoll).abilityAttack).toBeUndefined();
  });

  it("carries a forced '+1' reroll onto the cue so the overlay can replay it", () => {
    const state = createInitialGameState("reroll-beat-cue");
    const attacker = state.combat!.units.unit_p2_skeletons;
    const defender = state.combat!.units.unit_p1_griffins;
    appendEvent(state, {
      type: "UNIT_ATTACK_DECLARED",
      playerId: "p2",
      attackerId: attacker.id,
      defenderId: defender.id,
      isRetaliation: false,
      attackKind: "melee",
      rollMode: "normal"
    });
    const rolled = appendEvent(state, {
      type: "ATTACK_ROLLED",
      attackerId: attacker.id,
      defenderId: defender.id,
      rolls: [-1],
      roll: -1,
      rollMode: "normal",
      attackBonus: 0,
      defenseBonus: 0,
      attackValue: 4,
      defenseValue: 0,
      damage: 4,
      isRetaliation: false,
      rerollBeats: [{ index: 0, from: 1, to: -1 }]
    });
    if (rolled.type !== "ATTACK_ROLLED") throw new Error("expected attack roll");
    expect(makeCombatDiceCue(state, rolled).rerollBeats).toEqual([{ index: 0, from: 1, to: -1 }]);
    // A roll with no forced reroll leaves the field off the cue entirely.
    const plain = { ...rolled, rerollBeats: undefined };
    expect(makeCombatDiceCue(state, plain).rerollBeats).toBeUndefined();
  });
});

/**
 * USER RULE (2026-09-05) — "Death Stare must happen BEFORE the retaliation."
 * The visible half of that rule: the overlay queue is built in two passes
 * (attack dice, then ability/spell dice), so a stare fired between a blow and
 * its parked Retaliation used to be SHOWN after the counter-blow's die.
 * The whole-flow pin is `src/app/page-death-stare-dice-order.test.tsx`; these
 * pin the splice itself, including the fallback that keeps every unordered cue
 * exactly where it used to land.
 */
describe("mergeDiceCuesInEventOrder", () => {
  const cue = (id: string): DiceCue =>
    ({
      id,
      rolls: [0],
      roll: 0,
      dieMultiplier: 1,
      rollMode: "normal",
      attackerName: "",
      defenderName: "",
      attackValue: 0,
      defenseValue: 0,
      attackBonus: 0,
      defenseBonus: 0,
      damage: 0,
      isRetaliation: false
    }) satisfies DiceCue;

  it("splices an ability roll in front of the later attack die it preceded", () => {
    const order = new Map([
      ["evt_blow", 1],
      ["evt_stare-dice", 2],
      ["evt_retaliation", 3]
    ]);
    const merged = mergeDiceCuesInEventOrder(
      [cue("evt_blow"), cue("evt_retaliation")],
      [cue("evt_stare-dice")],
      order
    );
    expect(merged.map((entry) => entry.id)).toEqual(["evt_blow", "evt_stare-dice", "evt_retaliation"]);
  });

  it("CONTROL: a cue with no recorded place, and a leftover queue, keep the old append", () => {
    // No order entry (a spell roll the page still queues blind) -> appended.
    expect(
      mergeDiceCuesInEventOrder(
        [cue("evt_blow"), cue("evt_retaliation")],
        [cue("evt_inferno")],
        new Map([
          ["evt_blow", 1],
          ["evt_retaliation", 3]
        ])
      ).map((entry) => entry.id)
    ).toEqual(["evt_blow", "evt_retaliation", "evt_inferno"]);

    // A cue left over from an EARLIER snapshot has no place in this batch's
    // order either, so it is never jumped over.
    expect(
      mergeDiceCuesInEventOrder(
        [cue("evt_old"), cue("evt_blow"), cue("evt_retaliation")],
        [cue("evt_stare-dice")],
        new Map([
          ["evt_blow", 1],
          ["evt_stare-dice", 2],
          ["evt_retaliation", 3]
        ])
      ).map((entry) => entry.id)
    ).toEqual(["evt_old", "evt_blow", "evt_stare-dice", "evt_retaliation"]);
  });

  it("keeps two ability rolls of one exchange in their own event order", () => {
    const order = new Map([
      ["evt_blow", 1],
      ["evt_a-dice", 2],
      ["evt_b-dice", 3],
      ["evt_retaliation", 4]
    ]);
    expect(
      mergeDiceCuesInEventOrder(
        [cue("evt_blow"), cue("evt_retaliation")],
        [cue("evt_a-dice"), cue("evt_b-dice")],
        order
      ).map((entry) => entry.id)
    ).toEqual(["evt_blow", "evt_a-dice", "evt_b-dice", "evt_retaliation"]);
  });
});
