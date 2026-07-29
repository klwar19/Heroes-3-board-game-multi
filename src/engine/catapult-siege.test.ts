import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { fortificationTargetId, makeArrowTowerUnit } from "./siege";
import type { GameAction, GameState, PlayerId, SiegeState } from "./state";

/**
 * Engine tests for the Catapult war machine BOMBARDING fortifications. The card:
 * "At the beginning of each Combat round, you may pay 1 building material to
 * choose 2 adjacent targets (any combination of units, Walls and the Gate) and
 * deal 1 damage to each of them." A Wall/Gate has no HP, so one hit fells it
 * (the rulebook's auto-success). Every assertion fails if the wiring that lets
 * the Catapult aim at Walls/Gate is removed.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** END_COMBAT_ROUND with the active unit cleared (round may end any time here). */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

/** A p1-owned Catapult, p2 defending behind the given fortifications. */
function catapultSiege(seed: string, siegeOverrides: Partial<SiegeState> = {}): { state: GameState; siege: SiegeState } {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.permanents = ["war_machine.catapult"];
  state.players.p2.permanents = [];
  state.players.p1.resources.buildingMaterials = 3;
  state.combat!.obstacles = [];

  // Park the attacker's own units out of the fortification row so adjacency is
  // about the walls and the chosen defenders only.
  state.combat!.units.unit_p1_marksmen.position = 16;
  state.combat!.units.unit_p1_griffins.position = 17;
  state.combat!.units.unit_p1_crusaders.position = 19;

  const siege: SiegeState = {
    townPlayerId: "p2",
    walls: [8, 9, 10],
    gatePosition: 11,
    arrowTowerUnitId: null,
    ...siegeOverrides
  };
  state.combat!.siege = siege;
  return { state, siege };
}

function fireCatapult(state: GameState): GameState {
  const offered = endRound(state, "p1");
  const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes("Fire the Catapult"));
  expect(fire, "the Catapult fire offer should be open at round start").toBeTruthy();
  return applyOk(offered, fire!.action);
}

/**
 * Pick a Catapult target through the REAL action flow: it must be surfaced as a
 * legal CHOOSE_ABILITY_TARGET (this is the path the UI and multiplayer take —
 * hand-building the action would hide a missing legal-action enumeration).
 */
function chooseTarget(state: GameState, targetId: string): GameState {
  const legal = getLegalActions(state, "p1").find(
    (entry) => entry.action.type === "CHOOSE_ABILITY_TARGET" && entry.action.targetUnitId === targetId
  );
  expect(legal, `the Catapult should offer ${targetId} as a legal target`).toBeTruthy();
  return applyOk(state, legal!.action);
}

function standingCount(siege: SiegeState | null): number {
  if (!siege) {
    return 0;
  }
  return siege.walls.length + (siege.gatePosition !== null ? 1 : 0);
}

describe("Catapult — bombarding the fortifications", () => {
  it("offers Walls and the Gate as aimable targets, not only units", () => {
    const { state } = catapultSiege("catapult-targets");
    // Put an enemy beside the wall line so units are offered too.
    state.combat!.units.unit_p2_skeletons.position = 13; // adjacent to the Gate-column wall at 9

    const aiming = fireCatapult(state);
    expect(aiming.players.p1.resources.buildingMaterials).toBe(2); // paid 1
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    const candidates =
      aiming.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? aiming.pendingChoice.candidateUnitIds : [];

    expect(candidates).toContain(fortificationTargetId("wall", 9));
    expect(candidates).toContain(fortificationTargetId("gate", 11));
    expect(candidates).toContain("unit_p2_skeletons");
    // The off-board Arrow Tower is never a Catapult target.
    expect(candidates.some((id) => id.includes("tower"))).toBe(false);
  });

  it("fells a Wall and damages an adjacent enemy unit with the two shots", () => {
    const { state, siege } = catapultSiege("catapult-wall-and-unit");
    state.combat!.units.unit_p2_skeletons.position = 13; // adjacent to wall 9
    state.combat!.units.unit_p2_vampires.position = 0; // out of the way
    expect(standingCount(siege)).toBe(4);

    const aiming = fireCatapult(state);
    const firstShot = chooseTarget(aiming, fortificationTargetId("wall", 9));
    // Wall 9 is down already; a second adjacent target is being asked for.
    expect(firstShot.combat!.siege!.walls).not.toContain(9);
    expect(firstShot.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    const second =
      firstShot.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? firstShot.pendingChoice.candidateUnitIds : [];
    expect(second).toContain("unit_p2_skeletons");
    expect(second).toContain(fortificationTargetId("wall", 8));
    expect(second).toContain(fortificationTargetId("wall", 10));

    const resolved = chooseTarget(firstShot, "unit_p2_skeletons");
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // Only Wall 9 fell; the rest of the line (8, 10) and the Gate (11) stand.
    expect(resolved.combat!.siege!.walls.sort((a, b) => a - b)).toEqual([8, 10]);
    expect(resolved.combat!.siege!.gatePosition).toBe(11);
    expect(resolved.pendingChoice).toBeNull();
  });

  it("auto-pairs the only adjacent target, felling two abutting Walls at once", () => {
    const { state } = catapultSiege("catapult-two-walls", { walls: [8, 9], gatePosition: null });
    // No units anywhere near the wall line: 8's only neighbour is 9.
    state.combat!.units.unit_p2_skeletons.position = 0;
    state.combat!.units.unit_p2_vampires.position = 1;
    state.combat!.units.unit_p2_dread_knights.position = 2;

    const aiming = fireCatapult(state);
    const resolved = chooseTarget(aiming, fortificationTargetId("wall", 8));
    // 8 and its sole neighbour 9 both come down; no further choice needed.
    expect(resolved.combat!.siege!.walls).toEqual([]);
    expect(resolved.pendingChoice).toBeNull();
    expect(resolved.eventLog.filter((event) => event.type === "FORTIFICATION_DESTROYED").length).toBe(2);
  });

  it("collapses the Arrow Tower when the bombardment fells the last fortification", () => {
    const { state } = catapultSiege("catapult-breach", { walls: [8], gatePosition: null });
    const tower = makeArrowTowerUnit("unit_tower", "p2");
    state.combat!.units.unit_tower = tower;
    state.combat!.siege!.arrowTowerUnitId = tower.id;
    // One enemy beside Wall 8 (position 12) to be the second target.
    state.combat!.units.unit_p2_skeletons.position = 12;
    state.combat!.units.unit_p2_vampires.position = 0;
    state.combat!.units.unit_p2_dread_knights.position = 1;

    const aiming = fireCatapult(state);
    const resolved = chooseTarget(aiming, fortificationTargetId("wall", 8));

    expect(resolved.combat!.siege!.walls).toEqual([]);
    expect(resolved.combat!.siege!.arrowTowerUnitId).toBeNull();
    expect(
      resolved.eventLog.some((event) => event.type === "FORTIFICATION_DESTROYED" && event.kind === "arrow-tower")
    ).toBe(true);
    // The paired enemy still took its hit.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("logs the Catapult firing (sound/animation) when it batters a Wall", () => {
    const { state } = catapultSiege("catapult-event", { walls: [8, 9], gatePosition: null });
    state.combat!.units.unit_p2_skeletons.position = 0;
    state.combat!.units.unit_p2_vampires.position = 1;
    state.combat!.units.unit_p2_dread_knights.position = 2;

    const aiming = fireCatapult(state);
    const resolved = chooseTarget(aiming, fortificationTargetId("wall", 8));
    const fired = resolved.eventLog.filter(
      (event) => event.type === "WAR_MACHINE_TRIGGERED" && event.cardId === "war_machine.catapult"
    );
    expect(fired.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Catapult — no siege: only units are aimed at (no regression)", () => {
  it("offers no fortification pseudo-targets when there is no siege", () => {
    const state = createInitialGameState("catapult-no-siege");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.catapult"];
    state.players.p2.permanents = [];
    state.players.p1.resources.buildingMaterials = 3;
    state.combat!.siege = null;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_vampires.position = 14; // adjacent pair

    const aiming = fireCatapult(state);
    const candidates =
      aiming.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? aiming.pendingChoice.candidateUnitIds : [];
    expect(candidates.some((id) => id.startsWith("siege-fortification:"))).toBe(false);
    expect(candidates).toContain("unit_p2_skeletons");
  });
});

describe("Cannon — siege fortifications", () => {
  it("offers and destroys an enemy Wall", () => {
    const { state } = catapultSiege("cannon-wall");
    state.players.p1.permanents = ["war_machine.cannon"];
    state.players.p1.limits.expertUses = 1;

    const offered = endRound(state, "p1");
    const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes("Fire the Cannon"));
    expect(fire).toBeTruthy();
    const aiming = applyOk(offered, fire!.action);
    const wall = fortificationTargetId("wall", 9);
    const candidates =
      aiming.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? aiming.pendingChoice.candidateUnitIds : [];
    expect(candidates).toContain(wall);

    const resolved = chooseTarget(aiming, wall);
    expect(resolved.combat!.siege!.walls).not.toContain(9);
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("does not let the town defender target their own Walls", () => {
    const { state } = catapultSiege("cannon-own-wall");
    state.players.p1.permanents = [];
    state.players.p2.permanents = ["war_machine.cannon"];
    state.players.p2.limits.expertUses = 1;

    const offered = endRound(state, "p1");
    const fire = getLegalActions(offered, "p2").find((legal) => legal.label.includes("Fire the Cannon"));
    expect(fire).toBeTruthy();
    const aiming = applyOk(offered, fire!.action);
    const candidates =
      aiming.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? aiming.pendingChoice.candidateUnitIds : [];
    expect(candidates.some((id) => id.startsWith("siege-fortification:"))).toBe(false);
  });
});
