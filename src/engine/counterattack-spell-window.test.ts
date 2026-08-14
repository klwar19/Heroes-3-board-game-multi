import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("counterattack spell timing", () => {
  it("never lets the defending computer cast Magic Arrow during an attack or its retaliation", () => {
    let state = createInitialGameState("no-magic-arrow-counterattack");
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.magic_arrow"];
    const attacker = state.combat!.units.unit_p1_griffins;
    const defender = state.combat!.units.unit_p2_skeletons;
    attacker.position = 9;
    defender.position = 10;
    attacker.maxHealth = 30;
    defender.maxHealth = 30;
    attacker.damage = 0;
    defender.damage = 0;
    attacker.retaliatedThisRound = false;
    defender.retaliatedThisRound = false;
    state.combat!.activeUnitId = attacker.id;
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0];

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: attacker.id,
      defenderId: defender.id
    });

    while (state.reactionWindow) {
      const priority = state.reactionWindow.priorityPlayerId;
      if (priority === "p2") {
        const legal = getLegalActions(state, "p2");
        expect(
          legal.some((entry) => entry.action.type === "CAST_SPELL" && entry.action.cardId === "spell.magic_arrow")
        ).toBe(false);
      }
      state = applyOk(state, { type: "PASS_REACTION", playerId: priority });
    }

    expect(
      state.eventLog.some(
        (event) => event.type === "SPELL_CAST_STARTED" && event.spellCardId === "spell.magic_arrow"
      )
    ).toBe(false);
    expect(
      state.eventLog.some((event) => event.type === "ATTACK_ROLLED" && event.isRetaliation)
    ).toBe(true);
    expect(state.players.p2.hand).toContain("spell.magic_arrow");
  });
});
