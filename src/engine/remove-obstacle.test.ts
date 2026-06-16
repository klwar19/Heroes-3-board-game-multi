import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId, SiegeState } from "./state";

/**
 * Engine tests for Remove Obstacle (Basic Water, Instant): it clears obstacles
 * from the Combat board — the random obstacle markers and any standing siege
 * Wall or Gate — up to the Power paid (0/1/2 -> 1/2/3), picked one at a time.
 * Every rule below fails if its wiring is removed.
 *
 * Sandbox (createInitialGameState): combat.obstacles = [8, 11], no siege.
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

/** Find the no-target Remove Obstacle cast in the active player's legal actions. */
function findRemoveObstacleCast(state: GameState, playerId: PlayerId) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.remove_obstacle"
  );
}

/**
 * Cast Remove Obstacle at the chosen Power and keep resolving its choice picks
 * (always option 0) until it stops asking. Returns the resolved state.
 */
function castRemoveObstacleAt(state: GameState, power: number): GameState {
  state.players.p1.hand = ["spell.remove_obstacle", "stat.power", "stat.power", "stat.power", "stat.power"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";

  const cast = findRemoveObstacleCast(state, "p1");
  expect(cast, "Remove Obstacle should be a legal cast when obstacles stand").toBeTruthy();
  const casted = applyOk(state, cast!.action);
  // Stand in for paying N Power into the cast (Empower / Power statistics), the
  // same hook the Implosion / Dispel tests use.
  casted.stack[0]!.modifiers.spellPowerBonus = power;
  let current = passAllReactions(casted);

  // Resolve each obstacle pick (option 0) until the choice closes.
  let safety = 10;
  while (current.pendingChoice?.type === "OPTION_CHOICE" && current.pendingChoice.context === "remove-obstacle" && safety > 0) {
    safety -= 1;
    current = applyOk(current, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: current.pendingChoice.id,
      optionIndex: 0
    });
  }
  return current;
}

describe("Remove Obstacle spell", () => {
  it("Power 0 removes exactly 1 obstacle marker and logs it", () => {
    const state = createInitialGameState("remove-obstacle-1");
    expect(state.combat!.obstacles).toEqual([8, 11]);

    const result = castRemoveObstacleAt(state, 0);
    expect(result.combat!.obstacles!.length).toBe(1);
    const removed = result.eventLog.some(
      (event) => event.type === "COMBAT_OBSTACLE_REMOVED" && event.position === 8
    );
    expect(removed).toBe(true);
  });

  it("scales with Power: Power 1 clears 2 markers, Power 2 clears 3", () => {
    const two = createInitialGameState("remove-obstacle-2");
    expect(castRemoveObstacleAt(two, 1).combat!.obstacles!.length).toBe(0);

    const three = createInitialGameState("remove-obstacle-3");
    three.combat!.obstacles = [8, 11, 14];
    const after = castRemoveObstacleAt(three, 2);
    expect(after.combat!.obstacles!.length).toBe(0);
    const removedCount = after.eventLog.filter((event) => event.type === "COMBAT_OBSTACLE_REMOVED").length;
    expect(removedCount).toBe(3);
  });

  it("never removes more than the obstacles that stand (Power 2, only 2 markers)", () => {
    const state = createInitialGameState("remove-obstacle-cap");
    expect(state.combat!.obstacles).toEqual([8, 11]);
    const result = castRemoveObstacleAt(state, 2);
    expect(result.combat!.obstacles!.length).toBe(0);
    // Only two markers existed, so only two removals happened — the third
    // "charge" finds nothing and the choice closes.
    expect(result.eventLog.filter((event) => event.type === "COMBAT_OBSTACLE_REMOVED").length).toBe(2);
    expect(result.pendingChoice).toBeNull();
  });

  it("is not castable when there is no obstacle marker, Wall or Gate", () => {
    const state = createInitialGameState("remove-obstacle-gated");
    state.combat!.obstacles = [];
    state.combat!.siege = null;
    state.players.p1.hand = ["spell.remove_obstacle"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(findRemoveObstacleCast(state, "p1")).toBeFalsy();
  });

  it("brings down a standing siege Wall (the shared fortification path)", () => {
    const state = createInitialGameState("remove-obstacle-wall");
    state.combat!.obstacles = [];
    const siege: SiegeState = {
      townPlayerId: "p2",
      walls: [9, 10],
      gatePosition: 13,
      arrowTowerUnitId: null
    };
    state.combat!.siege = siege;

    const result = castRemoveObstacleAt(state, 0);
    const standing = result.combat!.siege!;
    // Power 0 removes exactly one fortification (the first listed Wall).
    const total = standing.walls.length + (standing.gatePosition !== null ? 1 : 0);
    expect(total).toBe(2);
    const felled = result.eventLog.some((event) => event.type === "FORTIFICATION_DESTROYED");
    expect(felled).toBe(true);
  });

  it("offers obstacle markers AND fortifications together, gated by Power", () => {
    const state = createInitialGameState("remove-obstacle-mixed");
    state.combat!.obstacles = [8, 11];
    state.combat!.siege = {
      townPlayerId: "p2",
      walls: [9],
      gatePosition: null,
      arrowTowerUnitId: null
    };
    state.players.p1.hand = ["spell.remove_obstacle"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const cast = findRemoveObstacleCast(state, "p1");
    expect(cast).toBeTruthy();
    const casted = passAllReactions(applyOk(state, cast!.action));
    expect(casted.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (casted.pendingChoice?.type === "OPTION_CHOICE") {
      expect(casted.pendingChoice.context).toBe("remove-obstacle");
      // Two markers + one Wall = three removable obstacles offered.
      expect(casted.pendingChoice.options.length).toBe(3);
      expect(casted.pendingChoice.removeObstacle?.remaining).toBe(1); // Power 0
    }
  });
});
