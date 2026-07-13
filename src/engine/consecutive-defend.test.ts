import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Rule: a unit may not Defend on two consecutive activations. After Defending,
 * its next activation must do something else; only then may it Defend again.
 *
 * Observable outcomes (not just the flag):
 *  1. After a Defend, the same unit is NOT offered DEFEND_UNIT on its next
 *     activation, and a forced DEFEND_UNIT is rejected.
 *  2. CONTROL — a unit that attacked/held instead of Defending IS offered
 *     Defend on its next activation.
 *  3. After Defend → something else → Defend is legal again.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyFail(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be rejected").toBeGreaterThan(0);
  return result.state;
}

function passReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function canDefend(state: GameState, playerId: "p1" | "p2", unitId: UnitId): boolean {
  return getLegalActions(state, playerId).some(
    (legal) => legal.action.type === "DEFEND_UNIT" && legal.action.unitId === unitId
  );
}

/** Open a fresh combat round with `unitId` as the active unit (everyone else already acted). */
function startRoundWithActive(state: GameState, unitId: UnitId, playerId: "p1" | "p2" = "p1"): GameState {
  state.combat!.activeUnitId = null;
  for (const unit of Object.values(state.combat!.units)) {
    unit.activatedThisRound = true;
  }
  // Keep the target fresh so advance/setActive can pick it — force it directly.
  state.combat!.units[unitId].activatedThisRound = false;
  state.combat!.activeUnitId = unitId;
  state.activePlayerId = playerId;
  // Mimic a real activation start (clear leftover activation flags).
  const unit = state.combat!.units[unitId];
  unit.movedThisActivation = false;
  unit.attackedThisActivation = false;
  unit.attacksThisActivation = 0;
  if (unit.defenseToken) {
    unit.defenseToken = false;
  }
  return state;
}

function endRound(state: GameState): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = "p1";
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
}

describe("consecutive Defend ban", () => {
  const UNIT: UnitId = "unit_p1_griffins";

  it("after Defending, the unit cannot Defend again on its next activation", () => {
    let state = createInitialGameState("no-double-defend");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state = startRoundWithActive(state, UNIT);

    expect(canDefend(state, "p1", UNIT), "fresh unit may Defend").toBe(true);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: UNIT });
    expect(state.combat!.units[UNIT].defendedLastActivation, "Defend stamps the ban").toBe(true);
    expect(state.combat!.units[UNIT].defenseToken, "Defense token is placed").toBe(true);

    // Next activation of the same unit (new round — one activation per unit per round).
    state = endRound(state);
    state = startRoundWithActive(state, UNIT);

    expect(canDefend(state, "p1", UNIT), "Defend is NOT offered after a consecutive Defend").toBe(false);
    // Reducer backstop — forging DEFEND_UNIT is rejected.
    applyFail(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: UNIT });
  });

  it("CONTROL: a unit that did something else (not Defend) may Defend on its next activation", () => {
    let state = createInitialGameState("defend-after-other-action");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state = startRoundWithActive(state, UNIT);

    // Move (not Defend), then hold — something else.
    const move = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "MOVE_UNIT" && legal.action.unitId === UNIT
    );
    expect(move, "griffins should be able to move").toBeTruthy();
    state = applyOk(state, move!.action);
    state = applyOk(state, { type: "END_ACTIVATION", playerId: "p1", unitId: UNIT });
    expect(state.combat!.units[UNIT].defendedLastActivation, "non-Defend clears the ban").toBe(false);

    state = endRound(state);
    state = startRoundWithActive(state, UNIT);

    expect(canDefend(state, "p1", UNIT), "CONTROL: unit that did not Defend may Defend next").toBe(true);
  });

  it("after Defend → something else → Defend is legal again", () => {
    let state = createInitialGameState("defend-then-other-then-defend");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state = startRoundWithActive(state, UNIT);

    // Activation 1: Defend
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: UNIT });

    // Activation 2: cannot Defend — move + hold instead
    state = endRound(state);
    state = startRoundWithActive(state, UNIT);
    expect(canDefend(state, "p1", UNIT)).toBe(false);
    const move = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "MOVE_UNIT" && legal.action.unitId === UNIT
    );
    expect(move).toBeTruthy();
    state = passReactions(applyOk(state, move!.action));
    state = applyOk(state, { type: "END_ACTIVATION", playerId: "p1", unitId: UNIT });
    expect(state.combat!.units[UNIT].defendedLastActivation).toBe(false);

    // Activation 3: Defend is legal again
    state = endRound(state);
    state = startRoundWithActive(state, UNIT);
    expect(canDefend(state, "p1", UNIT), "Defend returns after a non-Defend activation").toBe(true);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: UNIT });
    expect(state.combat!.units[UNIT].defenseToken).toBe(true);
    expect(state.combat!.units[UNIT].defendedLastActivation).toBe(true);
  });
});
