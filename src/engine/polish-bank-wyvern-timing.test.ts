import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("Polish bank reward Wyverns", () => {
  it("rolls Poison after its attack resolves and before the retaliation", () => {
    const state = createInitialGameState("polish-wyvern-poison-order");
    state.adventure = {
      houseRules: { "polish-creature-banks": true, "polish-bank-sizes": true },
    } as unknown as GameState["adventure"];
    state.players.p1.hand = [];
    state.players.p2.hand = [];

    const wyverns = state.combat!.units.unit_p1_griffins;
    wyverns.cardName = "Wyverns";
    wyverns.bankUnit = true;
    wyverns.abilities = ["wyvern-sting"];
    wyverns.position = 9;
    wyverns.attack = 4;
    wyverns.maxHealth = 50;

    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.maxHealth = 50;
    defender.abilities = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = wyverns.id;
    state.combat!.dice.scriptedRolls = [0, 0, 0];
    state.combat!.dice.rollCount = 0;

    const resolved = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: wyverns.id,
      defenderId: defender.id,
    });
    const attackIndex = resolved.eventLog.findIndex(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation && event.attackerId === wyverns.id,
    );
    const poisonIndex = resolved.eventLog.findIndex(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wyvern-sting",
    );
    const retaliationIndex = resolved.eventLog.findIndex(
      (event) => event.type === "ATTACK_ROLLED" && event.isRetaliation && event.attackerId === defender.id,
    );
    expect(attackIndex).toBeGreaterThanOrEqual(0);
    expect(poisonIndex).toBeGreaterThan(attackIndex);
    expect(retaliationIndex).toBeGreaterThan(poisonIndex);
  });
});
