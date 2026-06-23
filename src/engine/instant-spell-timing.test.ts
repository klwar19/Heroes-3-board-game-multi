import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Cure and Dispel are INSTANT spells (per the verbatim wiki cards), so they cast
 * at instant speed — including OFF-TURN, during the opponent's turn, without
 * Intelligence — exactly like Counterstrike / Stone Skin. They were previously
 * mislabeled `timing: "combat"` (Activation), which wrongly confined them to the
 * caster's own unit activation.
 *
 * The control is an ACTIVATION spell (Lightning Bolt): it is NOT castable
 * off-turn without Intelligence (that gate is exactly what Intelligence lifts).
 * Each test fails if Cure/Dispel regress to Activation timing (the off-turn offer
 * disappears) OR if the activation gate is removed (the control would wrongly be
 * offered) — a real two-player flow, not a data check.
 *
 * Sandbox (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** A sandbox combat mid-way through p2's turn (a p2 unit is active) → p1 off-turn. */
function p2TurnState(p1Hand: string[]): GameState {
  const state = createInitialGameState("instant-timing-seed");
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [];
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
  return state;
}

function offTurnCast(state: GameState, cardId: string): GameAction | undefined {
  return getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId
  )?.action;
}

function offTurnCastOn(state: GameState, cardId: string, unitId: UnitId): GameAction | undefined {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  )?.action;
}

// ---------------------------------------------------------------------------
// Cure — Instant: heal + remove negative effects, castable off-turn.
// ---------------------------------------------------------------------------

describe("Cure is an Instant (castable off-turn)", () => {
  it("the off-turn player may cast Cure on a wounded friendly unit and heal it", () => {
    const state = p2TurnState(["spell.cure"]);
    const wounded = state.combat!.units.unit_p1_crusaders;
    wounded.maxHealth = 10;
    wounded.damage = 3;
    const cast = offTurnCastOn(state, "spell.cure", "unit_p1_crusaders");
    expect(cast, "Cure should be castable off-turn on a friendly unit").toBeTruthy();
    const healed = passAllReactions(applyOk(state, cast!));
    // Power 0 → heal 1 damage: 3 → 2 (a fight under the old combat-timing gate
    // could never reach this off-turn).
    expect(healed.combat!.units.unit_p1_crusaders.damage).toBe(2);
  });

  it("control: an Activation spell (Lightning Bolt) is NOT castable off-turn", () => {
    const state = p2TurnState(["spell.lightning_bolt"]);
    expect(offTurnCast(state, "spell.lightning_bolt")).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Dispel — Instant: strip removable ongoing effects, castable off-turn.
// ---------------------------------------------------------------------------

describe("Dispel is an Instant (castable off-turn)", () => {
  function pushBuff(state: GameState, unitId: UnitId): void {
    state.activeEffects.push({
      id: "dispel_target_buff",
      name: "buff",
      scope: "unit",
      duration: { type: "combat" },
      polarity: "positive",
      removable: true,
      modifiers: [{ type: "ATTACK_BONUS", amount: 2 }],
      source: { type: "system" },
      controllerId: state.combat!.units[unitId].controllerId,
      target: { type: "unit", unitId },
      startedRound: state.round,
      startedCombatRound: state.combat!.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });
  }

  it("the off-turn player may cast Dispel and strip a removable effect mid-enemy-turn", () => {
    const state = p2TurnState(["spell.dispel"]);
    // Strip the active enemy unit's buff during its own turn — only possible
    // because Dispel is an instant (the old Activation gate forbade it off-turn).
    pushBuff(state, "unit_p2_skeletons");
    const cast = offTurnCastOn(state, "spell.dispel", "unit_p2_skeletons");
    expect(cast, "Dispel should be castable off-turn").toBeTruthy();
    const dispelled = passAllReactions(applyOk(state, cast!));
    expect(dispelled.activeEffects.some((effect) => effect.id === "dispel_target_buff")).toBe(false);
  });

  it("control: an Activation spell (Lightning Bolt) is NOT castable off-turn", () => {
    const state = p2TurnState(["spell.lightning_bolt"]);
    expect(offTurnCast(state, "spell.lightning_bolt")).toBeFalsy();
  });
});
