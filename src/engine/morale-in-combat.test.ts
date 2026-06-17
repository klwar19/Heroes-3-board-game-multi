import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function moraleActions(state: GameState, playerId: string) {
  return getLegalActions(state, playerId).filter((l) => l.action.type === "SPEND_MORALE");
}

describe("morale during combat (combat sandbox)", () => {
  it("offers the draw and discard-redraw morale plays to a combat participant who holds a token", () => {
    const state = createInitialGameState("morale-combat-offer");
    state.players.p1.morale = 1;
    state.players.p1.hand = ["stat.attack", "stat.defense"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    const offers = moraleActions(state, "p1");
    const benefits = offers.map((l) => (l.action as { benefit?: string }).benefit);
    expect(benefits).toContain("draw");
    expect(benefits).toContain("redraw");
  });

  it("spends the token to draw a card in combat", () => {
    let state = createInitialGameState("morale-combat-draw");
    state.players.p1.morale = 1;
    state.players.p1.hand = [];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    state = applyOk(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "draw" });
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.hand.length).toBe(1);
  });

  it("discards chosen cards and redraws that many in combat", () => {
    let state = createInitialGameState("morale-combat-redraw");
    state.players.p1.morale = 1;
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.deck = ["stat.defense", "stat.power"];
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";

    state = applyOk(state, {
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "redraw",
      discardCardIds: ["stat.attack"]
    });
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.discard).toContain("stat.attack");
    expect(state.players.p1.hand.length).toBe(1);
  });

  it("offers the morale token as an attack-die reroll source in combat", () => {
    let state = createInitialGameState("morale-combat-reroll");
    state.players.p1.morale = 1;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9; // adjacent to skeletons
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 1, -1];

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });

    // A reroll choice opens, listing the morale token as a source.
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") {
      return;
    }
    expect(choice.rerollSources.some((s) => s.morale)).toBe(true);

    const reroll = getLegalActions(state, "p1").find((l) => l.action.type === "REROLL_PENDING_CHOICE");
    expect(reroll, "a morale reroll should be offered").toBeTruthy();
    state = applyOk(state, reroll!.action);
    // Taking the reroll spends the morale token.
    expect(state.players.p1.morale).toBe(0);
  });
});
