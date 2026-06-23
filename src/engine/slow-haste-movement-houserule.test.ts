import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  getLegalMoveDestinations,
  getUnitMoveRange
} from "./index";
import type { GameAction, GameState, UnitId } from "./state";

// ---------------------------------------------------------------------------
// House rule (BINH only): Haste effects (the Haste spell + Cyra's Haste
// specialty) ALSO grant +1 Combat movement; Slow effects (the Slow spell +
// Gundula's Slow specialty I/VI) ALSO reduce it by 1. Base movement is 3 for
// ground/flying units (ranged 1), floored at 1. Legacy keeps the fixed range.
// ---------------------------------------------------------------------------

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

function findPlay(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function ground(state: GameState, id: UnitId) {
  const unit = state.combat!.units[id];
  unit.type = "ground";
  unit.abilities = [];
  return unit;
}

describe("getUnitMoveRange base values", () => {
  it("is 3 for ground/flying and 1 for ranged with no effects", () => {
    const state = createInitialGameState("move-base");
    const g = ground(state, "unit_p1_griffins");
    expect(getUnitMoveRange(g, state)).toBe(3);
    g.type = "flying";
    expect(getUnitMoveRange(g, state)).toBe(3);
    g.type = "ranged";
    expect(getUnitMoveRange(g, state)).toBe(1);
  });
});

describe("Slow effects reduce Combat movement by 1 (BINH house rule)", () => {
  it("Gundula's Slow I lands a −1 movement on the enemy in BINH, but not in Legacy", () => {
    const binh = createInitialGameState("slow-spec-binh");
    binh.players.p1.hand = ["specialty.gundula.1"];
    binh.activePlayerId = "p1";
    binh.combat!.activeUnitId = "unit_p1_griffins";
    const enemy = ground(binh, "unit_p2_skeletons");
    expect(getUnitMoveRange(enemy, binh), "enemy moves 3 before the Slow").toBe(3);
    const after = applyOk(binh, findPlay(binh, "specialty.gundula.1", "unit_p2_skeletons")!.action);
    expect(getUnitMoveRange(after.combat!.units.unit_p2_skeletons, after), "Slow I → 3 − 1 = 2").toBe(2);

    // Legacy keeps the fixed range even though the same effect is on the unit.
    const legacy = { ...after, ruleset: "legacy" as const };
    expect(getUnitMoveRange(legacy.combat!.units.unit_p2_skeletons, legacy), "Legacy ignores the house rule").toBe(3);
  });

  it("Gundula's Slow VI also lands a −1 movement (alongside its −4 initiative)", () => {
    const state = createInitialGameState("slow-spec-6");
    state.players.p1.hand = ["specialty.gundula.6"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    ground(state, "unit_p2_skeletons");
    const after = applyOk(state, findPlay(state, "specialty.gundula.6", "unit_p2_skeletons")!.action);
    expect(getUnitMoveRange(after.combat!.units.unit_p2_skeletons, after)).toBe(2);
  });

  it("the Slow spell reduces enemy movement by 1 (3 → 2)", () => {
    let state = createInitialGameState("slow-spell");
    state.players.p1.hand = ["spell.slow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    ground(state, "unit_p2_skeletons");
    state = passAllReactions(
      applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.slow",
        target: { type: "unit", unitId: "unit_p2_skeletons" }
      })
    );
    expect(getUnitMoveRange(state.combat!.units.unit_p2_skeletons, state)).toBe(2);
  });

  it("never drops a unit below 1 movement (a slowed ranged unit stays at 1)", () => {
    const state = createInitialGameState("slow-floor");
    state.players.p1.hand = ["specialty.gundula.1"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const enemy = ground(state, "unit_p2_skeletons");
    enemy.type = "ranged"; // base move 1
    const after = applyOk(state, findPlay(state, "specialty.gundula.1", "unit_p2_skeletons")!.action);
    expect(getUnitMoveRange(after.combat!.units.unit_p2_skeletons, after), "max(1, 1 − 1) = 1").toBe(1);
  });
});

describe("Haste effects raise Combat movement by 1 (BINH house rule)", () => {
  it("Cyra's Haste I lands a +1 movement on a friendly unit (3 → 4)", () => {
    const state = createInitialGameState("haste-spec-1");
    state.players.p1.hand = ["specialty.cyra.1"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    ground(state, "unit_p1_griffins");
    const after = applyOk(state, findPlay(state, "specialty.cyra.1", "unit_p1_griffins")!.action);
    expect(getUnitMoveRange(after.combat!.units.unit_p1_griffins, after)).toBe(4);
  });

  it("Cyra's Haste VI also lands a +1 movement (alongside its +3 initiative / defense)", () => {
    const state = createInitialGameState("haste-spec-6");
    state.players.p1.hand = ["specialty.cyra.6"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    ground(state, "unit_p1_griffins");
    const after = applyOk(state, findPlay(state, "specialty.cyra.6", "unit_p1_griffins")!.action);
    expect(getUnitMoveRange(after.combat!.units.unit_p1_griffins, after)).toBe(4);
  });

  it("the Haste spell raises friendly movement by 1 (3 → 4)", () => {
    let state = createInitialGameState("haste-spell");
    state.players.p1.hand = ["spell.haste"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    ground(state, "unit_p1_griffins");
    state = passAllReactions(
      applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.haste",
        target: { type: "unit", unitId: "unit_p1_griffins" }
      })
    );
    expect(getUnitMoveRange(state.combat!.units.unit_p1_griffins, state)).toBe(4);
  });

  it("actually reaches further on the board: a Hasted unit's reachable cells grow", () => {
    const state = createInitialGameState("haste-reach");
    state.players.p1.hand = ["specialty.cyra.1"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffin = ground(state, "unit_p1_griffins");
    griffin.position = 0; // top-left corner
    griffin.activatedThisRound = false;
    griffin.movedThisActivation = false;
    // Park every other unit far in the opposite corner so they don't block the lane.
    let far = 19;
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.id !== "unit_p1_griffins") {
        unit.position = far;
        far -= 1;
      }
    }
    const base = getLegalMoveDestinations(state.combat!, griffin, state).length; // range 3
    const after = applyOk(state, findPlay(state, "specialty.cyra.1", "unit_p1_griffins")!.action);
    const hasted = getLegalMoveDestinations(after.combat!, after.combat!.units.unit_p1_griffins, after).length; // range 4
    expect(hasted, "Haste's +1 range reaches strictly more cells").toBeGreaterThan(base);
  });
});
