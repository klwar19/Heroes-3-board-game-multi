import { describe, expect, it } from "vitest";
import { appendEvent, createInitialGameState } from "@/engine";
import { makeCombatDiceCue } from "./combat-dice-cue";

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
});
