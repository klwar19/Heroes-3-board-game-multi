import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { placeCombatToken } from "./tokens";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Regression coverage for the OBSERVABLE effect of a Paralysis token — the part
 * that actually matters in play: a paralysed unit LOSES ITS NEXT ACTIVATION.
 *
 * Every pre-existing Blind/Medusa/Stone-Gaze test only asserts that a paralysis
 * token was PLACED (`hasToken(unit, "paralysis")`), which is a data-check: the
 * shared skip consumer in `setActiveUnit` (reducer.ts) could be deleted and that
 * whole suite would stay green. This file asserts the game outcome instead:
 *  1. a unit carrying the token has its turn SKIPPED (it "acted" without moving
 *     or attacking, the active unit advances past it, and the token is consumed);
 *  2. CONTROL — the SAME unit WITHOUT the token activates normally (it becomes
 *     the active unit and can move/attack), proving the skip is caused by the
 *     token, not the setup;
 *  3. end-to-end — placing the token via a real Blind cast (PLACE_PARALYSIS)
 *     produces the same skip, covering spell -> token -> skip in one go.
 *
 * Mirrors the Sorrow skip-activation assertion style in
 * `rampart-inferno-spells.test.ts` (which drives a target into activation by
 * ending the current unit's turn so the next fresh unit becomes active).
 *
 * Sandbox grades/types (createInitialGameState):
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

/** Does `unitId` have a legal move or attack right now (i.e. did it really get a turn)? */
function unitCanAct(state: GameState, playerId: "p1" | "p2", unitId: UnitId): boolean {
  return getLegalActions(state, playerId).some(
    (legal) =>
      (legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === unitId) ||
      (legal.action.type === "MOVE_UNIT" && legal.action.unitId === unitId)
  );
}

/**
 * Leaves exactly `unit_p1_griffins` (the driver) and `targetId` (a p2 unit)
 * fresh; everyone else has already activated. With `activeUnitId` on griffins,
 * ending griffins' turn makes `targetId` the next unit to activate — the moment
 * the Paralysis skip would fire.
 */
function aboutToActivate(seed: string, targetId: UnitId): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  for (const unit of Object.values(state.combat!.units)) {
    unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== targetId;
  }
  return state;
}

describe("Paralysis token skips the next activation", () => {
  const TARGET: UnitId = "unit_p2_skeletons";

  it("a paralysed unit loses its turn: it 'acts' without moving/attacking and the active unit advances past it", () => {
    const state = aboutToActivate("blind-skip", TARGET);
    // Place the Paralysis token directly to isolate the skip CONSUMER.
    placeCombatToken(state, state.combat!.units[TARGET], "paralysis", 0, "Blind");
    expect(state.combat!.units[TARGET].activatedThisRound, "target starts the round fresh").toBe(false);

    // End the driver's turn; the engine advances to the paralysed target.
    const next = passAllReactions(applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" }));
    const skeletons = next.combat!.units[TARGET];

    // Observable outcome: the unit's activation was skipped.
    expect(skeletons.activatedThisRound, "its turn was consumed (skipped)").toBe(true);
    expect(skeletons.movedThisActivation, "it never moved").toBe(false);
    expect(skeletons.attackedThisActivation, "it never attacked").toBeFalsy();
    expect(skeletons.tokens?.some((token) => token.kind === "paralysis"), "the token was consumed by the skip").toBe(
      false
    );
    // The active unit advanced past the skipped unit (it never holds the turn).
    expect(next.combat!.activeUnitId).not.toBe(TARGET);
    // The skip never let the paralysed unit attack — confirm via legal actions too.
    expect(unitCanAct(next, "p2", TARGET), "a skipped unit is offered no move/attack").toBe(false);
  });

  it("CONTROL: the SAME unit WITHOUT a paralysis token activates normally and can move/attack", () => {
    const state = aboutToActivate("blind-control", TARGET);
    // No token placed.
    const next = passAllReactions(applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" }));
    const skeletons = next.combat!.units[TARGET];

    // Without the token the unit really takes its turn: it is the active unit,
    // is NOT marked as already acted, and is offered a move/attack.
    expect(next.combat!.activeUnitId, "the un-paralysed unit becomes active").toBe(TARGET);
    expect(skeletons.activatedThisRound, "it has NOT been skipped").toBe(false);
    expect(unitCanAct(next, "p2", TARGET), "an un-paralysed unit can move/attack on its turn").toBe(true);
  });

  it("end-to-end: a real Blind cast (PLACE_PARALYSIS) skips the target's next activation", () => {
    // p1's marksmen casts Blind on the bronze skeletons (Power 0 reaches bronze).
    const state = createInitialGameState("blind-e2e");
    state.players.p1.hand = ["spell.blind"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units[TARGET].grade = "bronze";

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.blind" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === TARGET
    );
    expect(cast, "Blind should be a legal cast on the bronze enemy unit").toBeTruthy();
    let casted = passAllReactions(applyOk(state, cast!.action));
    expect(
      casted.combat!.units[TARGET].tokens?.some((token) => token.kind === "paralysis"),
      "Blind placed the paralysis token"
    ).toBe(true);

    // Now drive the blinded unit into its activation: only marksmen (driver) and
    // the blinded target stay fresh, then end the driver's turn.
    casted.activePlayerId = "p1";
    casted.combat!.activeUnitId = "unit_p1_marksmen";
    for (const unit of Object.values(casted.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_marksmen" && unit.id !== TARGET;
    }
    const next = passAllReactions(
      applyOk(casted, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_marksmen" })
    );

    const skeletons = next.combat!.units[TARGET];
    expect(skeletons.activatedThisRound, "the blinded unit's turn was skipped").toBe(true);
    expect(skeletons.movedThisActivation).toBe(false);
    expect(skeletons.attackedThisActivation).toBeFalsy();
    expect(skeletons.tokens?.some((token) => token.kind === "paralysis"), "the token was consumed").toBe(false);
    expect(next.combat!.activeUnitId).not.toBe(TARGET);
    expect(unitCanAct(next, "p2", TARGET), "the blinded unit is offered no move/attack").toBe(false);
  });
});
