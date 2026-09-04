/**
 * polish-wait: a Waited unit's RE-ACTIVATION is an ordinary activation for
 * MOVEMENT — the unit may move its full normal reach and then attack a target
 * that was not adjacent when the re-activation opened. (The once-per-activation
 * riders the printed rule defers stay spent: the re-activation still does not
 * re-fire regeneration / an "[activation]" ability — pinned in
 * polish-house-rules-extra.test.ts.)
 *
 * Every claim carries a CONTROL (rule off / a normal activation / the Wait gate).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getLegalActions
} from "./index";
import { getLegalMoveDestinations } from "./legal-actions";
import { isAdjacent } from "./battlefield";
import type { CombatUnitState, GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * A sandbox combat with the polish-wait rule on, every unit already activated
 * this round except `opener` and `waiter` (both p1). Ending the opener's
 * activation hands the slot to the waiter; Waiting from there opens the Waited
 * re-activation phase immediately (nobody else owes an activation).
 */
function makeWaitBoard(
  seed: string,
  ruleOn = true
): { state: GameState; waiterId: string; openerId: string } {
  const state = createInitialGameState(seed);
  state.adventure = {
    ...(state.adventure ?? ({} as NonNullable<GameState["adventure"]>)),
    houseRules: { "polish-wait": ruleOn }
  } as GameState["adventure"];
  state.ruleset = "binh";
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const combat = state.combat!;
  combat.setup = null;
  combat.outcome = null;
  combat.waitPhase = false;
  state.phase = "combat";
  state.stack = [];
  state.reactionWindow = null;
  state.pendingChoice = null;

  const units = Object.values(combat.units);
  const waiter = units.find((unit) => unit.controllerId === "p1")!;
  const opener = units.find(
    (unit) => unit.controllerId === "p1" && unit.id !== waiter.id
  )!;
  for (const unit of units) {
    unit.activatedThisRound = true;
    unit.waitToken = undefined;
    unit.waitPending = undefined;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
  }
  waiter.activatedThisRound = false;
  opener.activatedThisRound = false;
  combat.activeUnitId = opener.id;
  return { state, waiterId: waiter.id, openerId: opener.id };
}

function moveOffers(state: GameState, unitId: string): number[] {
  return getLegalActions(state, "p1")
    .filter(
      (legal) =>
        legal.action.type === "MOVE_UNIT" && legal.action.unitId === unitId
    )
    .map((legal) =>
      legal.action.type === "MOVE_UNIT" ? legal.action.destination : -1
    )
    .sort((left, right) => left - right);
}

function unitOf(state: GameState, unitId: string): CombatUnitState {
  return state.combat!.units[unitId]!;
}

describe("polish-wait — the Waited re-activation moves normally", () => {
  it("offers the unit's FULL normal reach on the re-activation (CONTROL: the same unit's reach on a normal activation)", () => {
    // CONTROL: the reach the unit is offered when it simply activates.
    const control = makeWaitBoard("polish-wait-move-control");
    let controlState = applyOk(control.state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: control.openerId
    });
    expect(controlState.combat!.activeUnitId).toBe(control.waiterId);
    const normalReach = moveOffers(controlState, control.waiterId);
    expect(
      normalReach.length,
      "the sandbox unit must have somewhere to walk for this test to mean anything"
    ).toBeGreaterThan(0);

    // The same unit Waits instead, then re-activates in the Wait phase.
    const board = makeWaitBoard("polish-wait-move");
    let state = applyOk(board.state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: board.openerId
    });
    expect(state.combat!.activeUnitId).toBe(board.waiterId);
    state = applyOk(state, {
      type: "WAIT_UNIT",
      playerId: "p1",
      unitId: board.waiterId
    });
    expect(state.combat!.waitPhase, "the Waited re-activation phase opened").toBe(true);
    expect(state.combat!.activeUnitId).toBe(board.waiterId);

    // The re-activation is an ordinary activation for movement.
    expect(unitOf(state, board.waiterId).movedThisActivation ?? false).toBe(false);
    expect(
      getLegalMoveDestinations(
        state.combat!,
        unitOf(state, board.waiterId),
        state
      ).sort((a, b) => a - b),
      "the engine's own reach on the re-activation"
    ).toEqual(normalReach);
    expect(
      moveOffers(state, board.waiterId),
      "MOVE_UNIT is offered for the full normal reach on the Waited re-activation"
    ).toEqual(normalReach);
  });

  it("the Waited unit really MOVES and then attacks a unit that was NOT adjacent when the re-activation opened", () => {
    const board = makeWaitBoard("polish-wait-move-attack");
    let state = board.state;
    const combat = state.combat!;
    const waiter = combat.units[board.waiterId]!;
    const target = Object.values(combat.units).find(
      (unit) => unit.controllerId === "p2"
    )!;
    // Park the waiter two steps away from the target so the strike is only
    // reachable by MOVING first.
    // "ground" is what gives the engine's move range 3 (a "ranged" unit gets 1
    // and would give up its attack by moving — getUnitMoveRange/canUnitAttack).
    waiter.position = 0;
    waiter.type = "ground";
    target.position = 2;
    const targetId = target.id;

    state = applyOk(state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: board.openerId
    });
    state = applyOk(state, {
      type: "WAIT_UNIT",
      playerId: "p1",
      unitId: board.waiterId
    });
    expect(state.combat!.waitPhase).toBe(true);
    expect(state.combat!.activeUnitId).toBe(board.waiterId);

    // At re-activation start the target is NOT attackable from where it stands.
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "ATTACK_UNIT" &&
          legal.action.attackerId === board.waiterId &&
          legal.action.defenderId === targetId
      ),
      "the target is out of reach before the move"
    ).toBe(false);

    const step = moveOffers(state, board.waiterId).find((destination) =>
      isAdjacent(destination, unitOf(state, targetId).position)
    );
    expect(step, "a cell adjacent to the target must be offered").toBeDefined();

    const healthBefore =
      unitOf(state, targetId).damage ?? 0;
    state = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: board.waiterId,
      destination: step!
    });
    const attack = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === board.waiterId &&
        legal.action.defenderId === targetId
    );
    expect(attack, "after moving, the strike is offered").toBeTruthy();
    state = applyOk(state, attack!.action);
    expect(
      unitOf(state, targetId).damage ?? 0,
      "the blow landed after the Waited unit walked into contact"
    ).toBeGreaterThan(healthBefore);
  });

  it("CONTROL: Wait itself is still only offered at activation START and only with the rule on", () => {
    // Rule off: no Wait at all.
    const off = makeWaitBoard("polish-wait-move-off", false);
    const offState = applyOk(off.state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: off.openerId
    });
    expect(
      getLegalActions(offState, "p1").some(
        (legal) => legal.action.type === "WAIT_UNIT"
      )
    ).toBe(false);

    // Rule on, but the unit already MOVED this activation: Wait is withheld
    // (the printed rule is "at the beginning of its activation").
    const board = makeWaitBoard("polish-wait-move-gate");
    let state = applyOk(board.state, {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: board.openerId
    });
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "WAIT_UNIT" &&
          legal.action.unitId === board.waiterId
      ),
      "Wait is offered at activation start"
    ).toBe(true);
    const destination = moveOffers(state, board.waiterId)[0];
    expect(destination).toBeDefined();
    state = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: board.waiterId,
      destination: destination!
    });
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "WAIT_UNIT" &&
          legal.action.unitId === board.waiterId
      ),
      "a unit that already moved may no longer Wait"
    ).toBe(false);
  });
});
