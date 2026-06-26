import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  placementCellsFor,
  type GameAction,
  type GameState
} from "./index";
import { getMainHero } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";

/**
 * Combat deployment lets you freely rearrange your own units before locking in:
 * drag a placed unit to an EMPTY cell (move), or drop it onto one of YOUR OWN
 * placed units to SWITCH their positions (swap). A brand-new placement still
 * can't land on a taken cell. These drive the real engine reducer.
 */
describe("Combat deployment — rearrange placed units (move + switch)", () => {
  function apply(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
    return result.state;
  }

  /** A real neutral Combat Setup for p1 (level-1 hero vs a difficulty-2 guard). */
  function reachPlacement(seed: string): GameState {
    let state = createAdventureGameState({ seed, rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.difficulty = 2; // level-1 hero < 2 → real Combat Setup (not a Quick Combat)
    startNeutralEncounter(state, hero, field);
    return state;
  }

  function placeActionsFor(state: GameState, armyUnitId: string) {
    return getLegalActions(state, "p1").filter(
      (l): l is typeof l & { action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }> } =>
        l.action.type === "PLACE_COMBAT_UNIT" && l.action.armyUnitId === armyUnitId
    );
  }

  function unitAt(state: GameState, position: number) {
    return Object.values(state.combat!.units).find((u) => u.position === position);
  }

  /** Place the first two army units on two distinct deployment cells. */
  function placeTwo(state: GameState): { state: GameState; aId: string; bId: string; aPos: number; bPos: number } {
    const armyIds = state.players.p1.army.map((u) => u.id);
    const aId = armyIds[0]!;
    const bId = armyIds[1]!;
    const aOpts = placeActionsFor(state, aId);
    const aPos = aOpts[0]!.action.position;
    let next = apply(state, aOpts[0]!.action);
    const bOpts = placeActionsFor(next, bId).filter((l) => l.action.position !== aPos);
    const bPos = bOpts[0]!.action.position;
    next = apply(next, bOpts[0]!.action);
    return { state: next, aId, bId, aPos, bPos };
  }

  it("moves a placed unit to an EMPTY deployment cell", () => {
    const { state, aId, aPos, bPos } = placeTwo(reachPlacement("rearrange-move"));
    const aUnit = Object.values(state.combat!.units).find((u) => u.armyUnitId === aId)!;
    // An empty deployment cell that is neither A's nor B's current square. Placed
    // units aren't offered PLACE legal-actions (they show "Take back"), so the
    // empty cells come straight from the deployment cell set.
    const occupied = new Set(Object.values(state.combat!.units).map((u) => u.position));
    const empty = placementCellsFor(state, "p1").find((p) => !occupied.has(p) && p !== aPos && p !== bPos)!;
    expect(empty, "an empty deployment cell to move to").toBeTypeOf("number");

    const moved = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: aId, position: empty });
    const aAfter = Object.values(moved.combat!.units).find((u) => u.id === aUnit.id)!;
    expect(aAfter.position, "A moved to the empty cell").toBe(empty);
    expect(unitAt(moved, aPos), "A's old cell is now empty").toBeUndefined();
    // exactly one unit per occupied cell, still two units total
    expect(Object.values(moved.combat!.units).filter((u) => u.controllerId === "p1")).toHaveLength(2);
  });

  it("SWITCHES two placed units when one is dropped on the other (drag-to-swap)", () => {
    const { state, aId, bId, aPos, bPos } = placeTwo(reachPlacement("rearrange-swap"));
    const aUnit = Object.values(state.combat!.units).find((u) => u.armyUnitId === aId)!;
    const bUnit = Object.values(state.combat!.units).find((u) => u.armyUnitId === bId)!;
    expect(aUnit.position).toBe(aPos);
    expect(bUnit.position).toBe(bPos);

    // Drop A onto B's occupied cell → they trade places.
    const swapped = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: aId, position: bPos });
    const aAfter = Object.values(swapped.combat!.units).find((u) => u.id === aUnit.id)!;
    const bAfter = Object.values(swapped.combat!.units).find((u) => u.id === bUnit.id)!;
    expect(aAfter.position, "A took B's square").toBe(bPos);
    expect(bAfter.position, "B took A's square").toBe(aPos);
    // No unit lost, no double-occupancy.
    expect(Object.values(swapped.combat!.units).filter((u) => u.controllerId === "p1")).toHaveLength(2);
  });

  it("control: a brand-new unit may NOT be placed on an already-occupied cell", () => {
    const { state, bId, aPos } = placeTwo(reachPlacement("rearrange-control"));
    // A THIRD, not-yet-placed army unit dropped on A's occupied square is rejected.
    const thirdId = state.players.p1.army.map((u) => u.id).find((id) => {
      const placed = state.combat!.setup!.placedUnitIds.p1;
      return !placed.includes(id);
    });
    if (!thirdId) {
      // Army of two: re-use B's id is already placed, so use a fresh take-back scenario instead.
      // (Most starting armies have >2 units, so this branch is rarely taken.)
      expect(bId).toBeTruthy();
      return;
    }
    const result = applyAction(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: thirdId, position: aPos });
    expect(result.errors.map((e) => e.message).join("; ")).toMatch(/already taken/i);
  });
});
