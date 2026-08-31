import { describe, expect, it } from "vitest";

import { createInitialGameState } from "./index";
import { reduceFirstDamageByAbility } from "./events";

describe("Imperium — Duty Eternal", () => {
  it("reduces damage only once per Combat, not once per round", () => {
    const state = createInitialGameState("imperium-duty-eternal");
    const dreadnought = state.combat!.units.unit_p1_crusaders;
    dreadnought.abilities = ["imperium-duty-eternal-few"];

    expect(reduceFirstDamageByAbility(state, dreadnought.id, 3)).toMatchObject({
      amount: 2, reduced: 1, abilityId: "imperium-duty-eternal-few"
    });
    expect(reduceFirstDamageByAbility(state, dreadnought.id, 3)).toEqual({ amount: 3, reduced: 0 });

    state.combat!.round = 2;
    expect(reduceFirstDamageByAbility(state, dreadnought.id, 3)).toEqual({ amount: 3, reduced: 0 });
  });

  it("uses the Pack's 2-damage reduction while preserving Iron Horus's round reset", () => {
    const state = createInitialGameState("imperium-duty-eternal-pack");
    const unit = state.combat!.units.unit_p1_crusaders;
    unit.abilities = ["imperium-duty-eternal-pack"];
    expect(reduceFirstDamageByAbility(state, unit.id, 3)).toMatchObject({ amount: 1, reduced: 2 });

    unit.abilities = ["kivotos-iron-horus"];
    unit.dutyEternalUsedThisCombat = undefined;
    expect(reduceFirstDamageByAbility(state, unit.id, 2)).toMatchObject({ amount: 1, reduced: 1 });
    expect(reduceFirstDamageByAbility(state, unit.id, 2)).toEqual({ amount: 2, reduced: 0 });
    state.combat!.round = 2;
    expect(reduceFirstDamageByAbility(state, unit.id, 2)).toMatchObject({ amount: 1, reduced: 1 });
  });
});
