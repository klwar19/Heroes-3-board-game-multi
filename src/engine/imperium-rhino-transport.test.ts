import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function transportState(seed: string): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  const rhino = combat.units.unit_p1_griffins;
  const passenger = combat.units.unit_p1_marksmen;

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  combat.activeUnitId = rhino.id;
  Object.assign(rhino, {
    cardName: "Rhino",
    abilities: ["imperium-rhino-transport"],
    type: "ground",
    position: 4,
    activatedThisRound: false,
    movedThisActivation: false,
    attackedThisActivation: false,
  });
  Object.assign(passenger, {
    position: 5,
    damage: 0,
    activatedThisRound: false,
    movedThisActivation: false,
  });

  // Remove unrelated fixture units so no Bind aura or occupied space changes
  // the transport scenario.
  for (const unit of Object.values(combat.units)) {
    if (unit.id === rhino.id || unit.id === passenger.id) continue;
    unit.damage = unit.maxHealth;
  }
  return state;
}

describe("Imperium Rhino — Armoured Transport", () => {
  it("may carry one ally that started adjacent and does not spend the passenger's activation", () => {
    let state = transportState("imperium-rhino-carry");
    const offeredMove = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "MOVE_UNIT" && entry.action.destination === 0,
    );
    expect(offeredMove, JSON.stringify(getLegalActions(state, "p1"))).toBeTruthy();
    state = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 0,
    });

    const choice = state.pendingChoice;
    expect(choice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-transport" });
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.moveTransport) {
      throw new Error("Expected a Rhino transport choice.");
    }
    expect(choice.moveTransport.placements.every((entry) => entry.unitId !== "unit_p2_skeletons")).toBe(true);
    const optionIndex = choice.moveTransport.placements.findIndex(
      (entry) => entry.unitId === "unit_p1_marksmen" && entry.destination === 1,
    );
    expect(optionIndex).toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex,
    });

    expect(state.combat!.units.unit_p1_griffins.position).toBe(0);
    expect(state.combat!.units.unit_p1_marksmen.position).toBe(1);
    expect(state.combat!.units.unit_p1_marksmen.movedThisActivation).toBe(false);
    expect(state.pendingChoice).toBeNull();
    expect(state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "UNIT_ABILITY_TRIGGERED",
        abilityId: "imperium-rhino-transport",
        unitId: "unit_p1_griffins",
        targetUnitId: "unit_p1_marksmen",
      }),
    );
  });

  it("can decline transport without moving the adjacent ally", () => {
    let state = transportState("imperium-rhino-decline");
    state = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 0,
    });
    expect(state.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-transport" });

    const choice = state.pendingChoice;
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.moveTransport) {
      throw new Error("Expected a Rhino transport choice.");
    }
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.moveTransport.placements.length,
    });

    expect(state.combat!.units.unit_p1_marksmen.position).toBe(5);
    expect(state.pendingChoice).toBeNull();
  });

  it("still ends the Rhino's activation after it carries an ally out of Quicksand", () => {
    let state = transportState("imperium-rhino-quicksand");
    state.combat!.battlefieldTokens = [{
      id: "quicksand-rhino",
      kind: "quicksand",
      position: 0,
      controllerId: "p2",
      armed: true,
    }];

    state = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 0,
      path: [0],
    });
    expect(state.combat!.units.unit_p1_griffins.position).toBe(0);
    const choice = state.pendingChoice;
    expect(choice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "combat-transport",
      moveTransport: { endActivationAfterChoice: true },
    });
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.moveTransport) {
      throw new Error("Expected a Rhino transport choice after Quicksand.");
    }

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.moveTransport.placements.length,
    });
    expect(state.combat!.units.unit_p1_griffins.activatedThisRound).toBe(true);
    expect(state.combat!.activeUnitId).not.toBe("unit_p1_griffins");
  });
});
