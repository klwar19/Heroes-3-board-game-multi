import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getActivationStep, NEUTRAL_PLAYER_ID } from "./index";
import type { GameAction, GameState, PendingChoice } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Cleared-active-unit END_COMBAT_ROUND, so a fresh round opens cleanly. */
function startFreshRound(state: GameState): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = "p1";
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
}

function orderChoice(state: GameState): Extract<PendingChoice, { type: "OPTION_CHOICE" }> | null {
  const choice = state.pendingChoice;
  return choice?.type === "OPTION_CHOICE" && choice.context === "combat-activation-order" ? choice : null;
}

const P1 = ["unit_p1_marksmen", "unit_p1_griffins", "unit_p1_crusaders"] as const;
const P2 = ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"] as const;

function setInitiatives(state: GameState, values: Record<string, number>): void {
  for (const [id, initiative] of Object.entries(values)) {
    state.combat!.units[id].initiative = initiative;
  }
}

describe("combat activation order — same-speed handling", () => {
  it("prompts the controlling player to pick when two of their own units share the top speed", () => {
    let state = createInitialGameState("order-same-team");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // p1's Griffins + Crusaders tie for the fastest; everything else is slower.
    setInitiatives(state, {
      unit_p1_griffins: 8,
      unit_p1_crusaders: 8,
      unit_p1_marksmen: 2,
      unit_p2_skeletons: 3,
      unit_p2_vampires: 3,
      unit_p2_dread_knights: 1
    });

    state = startFreshRound(state);

    // No unit is auto-activated; the owner is asked which tied unit goes first.
    const choice = orderChoice(state);
    expect(choice, "an activation-order choice should open").toBeTruthy();
    expect(state.combat!.activeUnitId).toBeNull();
    expect(choice!.playerId).toBe("p1");
    expect(new Set(choice!.activationOrder!.unitIds)).toEqual(new Set(["unit_p1_griffins", "unit_p1_crusaders"]));

    // Pick the Crusaders to go first.
    const crusadersIndex = choice!.activationOrder!.unitIds.indexOf("unit_p1_crusaders");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: crusadersIndex
    });
    expect(state.combat!.activeUnitId).toBe("unit_p1_crusaders");

    // After it acts, the tied teammate is the only one left at that speed — no
    // second prompt, it just comes up.
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_crusaders" });
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");
  });

  it("never prompts when a single unit holds the top speed", () => {
    let state = createInitialGameState("order-single");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setInitiatives(state, {
      unit_p1_griffins: 9,
      unit_p1_marksmen: 4,
      unit_p1_crusaders: 4,
      unit_p2_skeletons: 3,
      unit_p2_vampires: 3,
      unit_p2_dread_knights: 2
    });

    state = startFreshRound(state);
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");
  });

  it("alternates sides on a cross-side tie, with no attacker edge (defender goes first)", () => {
    let state = createInitialGameState("order-cross-side");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // One unit per side tied at the top; the rest are slower and distinct.
    setInitiatives(state, {
      unit_p1_griffins: 7,
      unit_p1_marksmen: 4,
      unit_p1_crusaders: 3,
      unit_p2_vampires: 7,
      unit_p2_skeletons: 2,
      unit_p2_dread_knights: 1
    });

    state = startFreshRound(state);

    // Single candidate per side, so no prompt — and the defender's unit acts
    // first (the old "ties favor the attacker" edge is gone).
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).toBe("unit_p2_vampires");

    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: "unit_p2_vampires" });
    expect(state.combat!.activeUnitId).toBe("unit_p1_griffins");
  });

  it("interleaves the two sides when both have several units at the same speed", () => {
    let state = createInitialGameState("order-cross-multi");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Two per side tied at init 7; the odd units sit lower.
    setInitiatives(state, {
      unit_p1_griffins: 7,
      unit_p1_crusaders: 7,
      unit_p1_marksmen: 1,
      unit_p2_vampires: 7,
      unit_p2_skeletons: 7,
      unit_p2_dread_knights: 1
    });

    state = startFreshRound(state);

    // Even split → the defender side picks first.
    let choice = orderChoice(state);
    expect(choice, "defender picks first on an even tie").toBeTruthy();
    expect(choice!.playerId).toBe("p2");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 0 });
    const firstDefender = state.combat!.activeUnitId!;
    expect(P2).toContain(firstDefender);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: firstDefender });

    // Now the attacker is behind, so it activates next — and it has two tied
    // units, so its owner is prompted.
    choice = orderChoice(state);
    expect(choice, "attacker picks after the defender's first unit").toBeTruthy();
    expect(choice!.playerId).toBe("p1");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });
    const firstAttacker = state.combat!.activeUnitId!;
    expect(P1).toContain(firstAttacker);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: firstAttacker });

    // Back to the defender's remaining unit — only one left at this speed, so no
    // prompt this time.
    expect(orderChoice(state)).toBeNull();
    const secondDefender = state.combat!.activeUnitId!;
    expect(P2).toContain(secondDefender);
    expect(secondDefender).not.toBe(firstDefender);
  });
});

describe("getActivationStep — the ordering primitive", () => {
  it("returns every tied unit of the acting side as candidates", () => {
    const state = createInitialGameState("step-candidates");
    setInitiatives(state, {
      unit_p1_griffins: 8,
      unit_p1_crusaders: 8,
      unit_p1_marksmen: 2,
      unit_p2_skeletons: 3,
      unit_p2_vampires: 3,
      unit_p2_dread_knights: 1
    });
    // Nobody has acted yet this round.
    for (const id of [...P1, ...P2]) {
      state.combat!.units[id].activatedThisRound = false;
    }

    const step = getActivationStep(state.combat!, state.activeEffects);
    expect(step?.side).toBe("p1");
    expect(step?.initiative).toBe(8);
    expect(new Set(step?.candidates.map((unit) => unit.id))).toEqual(
      new Set(["unit_p1_griffins", "unit_p1_crusaders"])
    );
  });

  it("auto-activates a tied neutral side instead of prompting (the AI can't answer a choice)", () => {
    let state = createInitialGameState("neutral-auto");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Hand the defender's units to the neutral army (and give it a player record
    // so the round bookkeeping has somewhere to write).
    state.players[NEUTRAL_PLAYER_ID] = { ...structuredClone(state.players.p2), id: NEUTRAL_PLAYER_ID };
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    // Two neutral units tie for the top speed.
    setInitiatives(state, {
      unit_p2_skeletons: 9,
      unit_p2_vampires: 9,
      unit_p2_dread_knights: 4,
      unit_p1_griffins: 2,
      unit_p1_marksmen: 1,
      unit_p1_crusaders: 1
    });

    state = startFreshRound(state);

    // No activation-order choice is opened for the neutral side — one of its
    // tied units is simply made active.
    expect(orderChoice(state)).toBeNull();
    expect(state.combat!.activeUnitId).not.toBeNull();
    expect(state.combat!.units[state.combat!.activeUnitId!].controllerId).toBe(NEUTRAL_PLAYER_ID);
  });

  it("reports the neutral army as the acting side so the engine auto-runs it (no prompt)", () => {
    const state = createInitialGameState("step-neutral");
    // Reassign the defender's units to the neutral army and tie them at the top.
    state.combat!.defenderPlayerId = NEUTRAL_PLAYER_ID;
    setInitiatives(state, {
      unit_p1_griffins: 2,
      unit_p1_marksmen: 1,
      unit_p1_crusaders: 1,
      unit_p2_skeletons: 9,
      unit_p2_vampires: 9,
      unit_p2_dread_knights: 4
    });
    for (const id of P2) {
      state.combat!.units[id].controllerId = NEUTRAL_PLAYER_ID;
    }
    for (const id of [...P1, ...P2]) {
      state.combat!.units[id].activatedThisRound = false;
    }

    const step = getActivationStep(state.combat!, state.activeEffects);
    // The neutral side is up with two tied units; advanceActiveUnit auto-takes
    // the first for a NEUTRAL_PLAYER_ID side rather than prompting.
    expect(step?.side).toBe(NEUTRAL_PLAYER_ID);
    expect(step?.candidates.length).toBe(2);
  });
});
