import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

function ready(offense: boolean) {
  const state = createInitialGameState("vakin-sharpshooter");
  state.adventure = {
    astrologers: { activeCardId: offense ? "astrologers.offense" : null },
  } as NonNullable<GameState["adventure"]>;
  state.players.p1.hand = ["stat.defense", "stat.defense", "specialty.gelu.1", "stat.power", "spell.magic_arrow"];
  state.players.p2.hand = [];
  const shooter = state.combat!.units.unit_p2_skeletons;
  shooter.unitDefId = "neutral.sharpshooters";
  shooter.cardName = "Sharpshooters";
  shooter.type = "ranged";
  shooter.attack = 3;
  shooter.abilities = ["ignore-all-combat-penalties"];
  const target = state.combat!.units.unit_p1_marksmen;
  target.defense = 0;
  target.maxHealth = 30;
  target.abilities = [];
  state.combat!.activeUnitId = shooter.id;
  state.activePlayerId = "p2";
  state.combat!.dice.scriptedRolls = [0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

function apply(state: GameState, action: GameAction) {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

const shot: GameAction = { type: "ATTACK_UNIT", playerId: "p2",
  attackerId: "unit_p2_skeletons", defenderId: "unit_p1_marksmen" };

describe("Sharpshooter defense windows and Astrologers Offense", () => {
  it("pauses before damage and lets Defense reduce a Sharpshooter shot without Offense", () => {
    let state = apply(ready(false), shot);
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(0);
    const defense = getLegalActions(state, "p1").find(l => l.action.type === "PLAY_REACTION" && l.action.cardId === "stat.defense");
    expect(defense).toBeTruthy();
    state = apply(state, defense!.action);
    while (state.reactionWindow) state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(2);
  });

  it("resolves the shot when Offense converts every held defense into an attack bonus", () => {
    const state = apply(ready(true), shot);
    expect(state.reactionWindow).toBeNull();
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(3);
    expect(state.players.p1.hand).toContain("stat.defense");
    expect(state.players.p1.hand).toContain("specialty.gelu.1");
  });
});
