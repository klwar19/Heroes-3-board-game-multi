import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * Regression coverage for spell.counterstrike (CLAUDE.md rule #1). Counterstrike
 * was WIRED BUT UNTESTED. Printed card: "Instant: Remove the Black cube from the
 * selected unit card — that unit is now able to perform a Retaliation Attack
 * again: Power 0 bronze / 2 bronze-or-silver / 4 bronze-silver-or-gold." Engine:
 * CLEAR_RETALIATION with gradeByPower {0:"bronze",2:"silver",4:"gold"}; the
 * resolver sets the target's retaliatedThisRound = false, grade-gated (reducer.ts).
 *
 * The OBSERVABLE asserted here is a SECOND retaliation that actually deals a blow:
 *  - a bronze defender retaliates once against the first attacker (flag set),
 *  - Counterstrike (bronze, Power 0) clears the flag,
 *  - the defender then retaliates AGAIN against a second attacker — two
 *    retaliations in the same combat round, where the control gets only one.
 *  - the grade gate: at Power 0 a SILVER defender's flag is NOT cleared.
 *
 * Sandbox: p1 griffins (bronze) used as the defender (its unlimited-retaliation
 * ability is stripped so retaliation is genuinely one-per-round); p1 crusaders is
 * the silver control defender. p2 vampires + skeletons are the two attackers.
 * Initiatives are arranged so both p2 attackers act before any p1 unit, letting
 * the two attacks land in the same round without driving p1's turn.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** How many retaliation blows `unitId` has rolled so far this combat. */
function retaliationCount(state: GameState, unitId: string): number {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && event.attackerId === unitId && event.isRetaliation
  ).length;
}

/**
 * `defenderId` (a p1 unit) is pinned at 13 between two p2 attackers — vampires at
 * 9 and skeletons at 14 — both ground, both faster than every p1 unit so they act
 * first. All abilities stripped; scripted die 0 so every blow is attack − defense.
 */
function setup(seed: string, defenderId: string, p1Hand: string[] = []): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;

  const defender = combat.units[defenderId];
  defender.abilities = [];
  defender.type = "ground";
  defender.position = 13;
  defender.attack = 4;
  defender.defense = 0;
  defender.maxHealth = 99;
  defender.damage = 0;
  defender.initiative = 1;

  const vampires = combat.units.unit_p2_vampires;
  vampires.abilities = [];
  vampires.type = "ground";
  vampires.position = 9;
  vampires.attack = 4;
  vampires.defense = 0;
  vampires.maxHealth = 99;
  vampires.damage = 0;
  vampires.initiative = 50;

  const skeletons = combat.units.unit_p2_skeletons;
  skeletons.abilities = [];
  skeletons.type = "ground";
  skeletons.position = 14;
  skeletons.attack = 4;
  skeletons.defense = 0;
  skeletons.maxHealth = 99;
  skeletons.damage = 0;
  skeletons.initiative = 40;

  combat.dice.scriptedRolls = new Array(40).fill(0);
  combat.dice.rollCount = 0;
  combat.activeUnitId = "unit_p2_vampires";
  state.activePlayerId = "p2";
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [];
  return state;
}

function castCounterstrike(state: GameState, targetUnitId: string): GameAction | undefined {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === "spell.counterstrike" &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === targetUnitId
  )?.action;
}

/** The p2 attack action (move-and-attack or attack) targeting `defenderId`, if any. */
function p2AttackOn(state: GameState, defenderId: string): GameAction | undefined {
  return getLegalActions(state, "p2").find(
    (legal) =>
      (legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_AND_ATTACK_UNIT") &&
      (legal.action as { defenderId?: string }).defenderId === defenderId
  )?.action;
}

describe("Counterstrike — re-enables a spent retaliation", () => {
  it("control: a bronze defender retaliates only ONCE per round across two attacks", () => {
    let state = setup("counterstrike-control", "unit_p1_griffins");
    // First attacker: vampires.
    state = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_vampires",
        defenderId: "unit_p1_griffins"
      })
    );
    expect(retaliationCount(state, "unit_p1_griffins")).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.retaliatedThisRound).toBe(true);

    // The engine has advanced to the next p2 attacker (skeletons). Second attack.
    const second = p2AttackOn(state, "unit_p1_griffins");
    expect(second, "the second p2 attacker should be able to strike the defender").toBeTruthy();
    state = passAllReactions(applyOk(state, second!));

    // No Counterstrike → the spent retaliation is NOT renewed: still exactly one.
    expect(retaliationCount(state, "unit_p1_griffins")).toBe(1);
  });

  it("clears the Black cube so the defender retaliates AGAIN (two retaliations)", () => {
    let state = setup("counterstrike-renew", "unit_p1_griffins", ["spell.counterstrike"]);
    // First attack — the defender retaliates and spends its retaliation.
    state = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_vampires",
        defenderId: "unit_p1_griffins"
      })
    );
    expect(retaliationCount(state, "unit_p1_griffins")).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.retaliatedThisRound).toBe(true);

    // Cast Counterstrike (bronze, Power 0) on the bronze defender → flag cleared.
    const cast = castCounterstrike(state, "unit_p1_griffins");
    expect(cast, "Counterstrike should be castable on the friendly bronze defender").toBeTruthy();
    state = passAllReactions(applyOk(state, cast!));
    expect(
      state.combat!.units.unit_p1_griffins.retaliatedThisRound,
      "Counterstrike must reset the retaliation flag to false"
    ).toBe(false);

    // Second attacker strikes — the renewed retaliation fires, a SECOND blow.
    const second = p2AttackOn(state, "unit_p1_griffins");
    expect(second).toBeTruthy();
    state = passAllReactions(applyOk(state, second!));

    expect(
      retaliationCount(state, "unit_p1_griffins"),
      "Counterstrike re-enabled a second retaliation that would not happen otherwise"
    ).toBe(2);
  });

  it("grade gate: at Power 0 a SILVER defender's retaliation is NOT renewed", () => {
    let state = setup("counterstrike-grade", "unit_p1_crusaders", ["spell.counterstrike"]);
    state = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_vampires",
        defenderId: "unit_p1_crusaders"
      })
    );
    expect(state.combat!.units.unit_p1_crusaders.retaliatedThisRound).toBe(true);

    // Counterstrike at Power 0 only reaches BRONZE; the silver Crusaders are above
    // the gate, so the resolver leaves the flag set.
    const cast = castCounterstrike(state, "unit_p1_crusaders");
    expect(cast, "Counterstrike is offered (target gate is friendly-unit), the GRADE gate is at resolution").toBeTruthy();
    state = passAllReactions(applyOk(state, cast!));
    expect(
      state.combat!.units.unit_p1_crusaders.retaliatedThisRound,
      "a silver unit must keep its spent retaliation against a Power-0 Counterstrike"
    ).toBe(true);

    // And no second retaliation fires from the silver defender.
    const second = p2AttackOn(state, "unit_p1_crusaders");
    expect(second).toBeTruthy();
    state = passAllReactions(applyOk(state, second!));
    expect(retaliationCount(state, "unit_p1_crusaders")).toBe(1);
  });
});
