import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { makeArrowTowerUnit } from "./siege";
import type { GameAction, GameState } from "./state";

/**
 * The Arrow Tower is not a decoration: in a siege it ACTS like a Ranged unit and
 * shoots attackers for real damage. These tests drive the defender's tower
 * through the live action flow (legal-action enumeration + the reducer) and
 * assert the observable outcome — an attacker losing health — not just that the
 * tower card exists. They fail if the tower stops being an activatable shooter.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A p2-defended siege with a live Arrow Tower and a p1 attacker in the open. */
function siegeWithTower(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const combat = state.combat!;
  combat.obstacles = [];

  const tower = makeArrowTowerUnit("siege_tower", "p2");
  combat.units[tower.id] = tower;
  combat.siege = {
    townPlayerId: "p2",
    walls: [8, 10, 11],
    gatePosition: 9,
    arrowTowerUnitId: tower.id
  };

  // Spread the other units across real cells far from the off-board tower. (No
  // on-board cell is ever orthogonally adjacent to position -1, so the tower
  // always shoots without an adjacency penalty — that is the point of the rule.)
  const parkingCells = [0, 1, 2, 17, 18, 19];
  let next = 0;
  for (const unit of Object.values(combat.units)) {
    if (unit.id !== tower.id) {
      unit.position = parkingCells[next++ % parkingCells.length];
    }
  }
  return state;
}

describe("Arrow Tower — it actually shoots", () => {
  it("offers the tower's shot as a legal action and deals its full Attack", () => {
    const state = siegeWithTower("tower-fire");
    const combat = state.combat!;

    const target = combat.units.unit_p1_marksmen;
    target.position = 16; // attacker's back row, in the open
    target.defense = 0;
    target.maxHealth = 10;
    target.damage = 0;

    combat.activeUnitId = "siege_tower";
    state.activePlayerId = "p2";

    // The shot must be a *surfaced* legal action — the path the UI/multiplayer
    // take. Hand-building the attack would hide a missing enumeration.
    const shot = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === "siege_tower" &&
        legal.action.defenderId === "unit_p1_marksmen"
    );
    expect(shot, "the Arrow Tower should offer a shot at the exposed attacker").toBeTruthy();

    combat.dice.scriptedRolls = [0]; // neutral attack die
    const after = applyOk(state, shot!.action);

    // ATK 4 vs DEF 0, neutral die → 4 damage lands on the attacker.
    expect(after.combat!.units.unit_p1_marksmen.damage).toBe(4);
    const rolled = [...after.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.damage : null).toBe(4);
  });

  it("shoots without any positioning penalty (off-board, never adjacent or back-row)", () => {
    const state = siegeWithTower("tower-fire-nopenalty");
    const combat = state.combat!;

    // A target sitting where a normal shooter WOULD take the long-range penalty.
    const target = combat.units.unit_p1_marksmen;
    target.position = 16;
    target.defense = 1;
    target.maxHealth = 10;
    target.damage = 0;

    combat.activeUnitId = "siege_tower";
    state.activePlayerId = "p2";
    combat.dice.scriptedRolls = [0];

    const after = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "siege_tower",
      defenderId: "unit_p1_marksmen"
    });
    // 4 ATK − 1 DEF with NO disadvantage = 3 damage. (Disadvantage would re-roll
    // the die low; the neutral scripted roll proves the mode was "normal".)
    expect(after.combat!.units.unit_p1_marksmen.damage).toBe(3);
  });

  it("pauses the tower shot so the attacked player can play Armorer", () => {
    let state = siegeWithTower("tower-armorer-window");
    const combat = state.combat!;
    const target = combat.units.unit_p1_marksmen;
    target.position = 16;
    target.defense = 0;
    target.maxHealth = 10;
    target.damage = 0;
    state.players.p1.hand = ["ability.armorer"];
    state.players.p1.deck = ["stat.attack"];
    combat.activeUnitId = "siege_tower";
    state.activePlayerId = "p2";
    combat.dice.scriptedRolls = [0];

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "siege_tower",
      defenderId: target.id
    });
    expect(state.combat!.units.unit_p1_marksmen.damage, "the attack waits while reactions are offered").toBe(0);
    const armorer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.armorer"
    );
    expect(armorer, "Armorer is offered against an Arrow Tower attack").toBeTruthy();
    state = applyOk(state, armorer!.action);
    while (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }

    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(3);
    expect(state.players.p1.discard).toContain("ability.armorer");
    expect(state.players.p1.hand).toContain("stat.attack");
  });
});
