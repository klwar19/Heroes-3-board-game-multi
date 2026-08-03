import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { destroyFortification, fortificationTargetId } from "./siege";
import type { GameAction, GameState, PlayerId, SiegeState } from "./state";

/**
 * Gate shield (house rule): a DEFENDING unit may move onto — and stop on — its
 * own Gate, and while it stands there the Gate cannot be destroyed. This lets a
 * champion plug the Gate to keep it from being battered down.
 *
 * Every assertion here fails if the shielding wiring is removed:
 *  - the guard in `destroyFortification` (blocks EVERY destruction path);
 *  - the Catapult / Cannon target filters (`splashTargets` / `cannonTargetIds`);
 *  - the melee-demolish offer filter (`addFortificationActions`).
 * Each is paired with a control where the Gate is empty and DOES fall / IS
 * offered, so the shield — not some unrelated gate — is what the test measures.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** END_COMBAT_ROUND with the active unit cleared. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

/** A p1-owned besieger, p2 defending behind walls [8,9,10] + Gate at 11. */
function gateSiege(seed: string, siegeOverrides: Partial<SiegeState> = {}): { state: GameState; siege: SiegeState } {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.permanents = [];
  state.players.p2.permanents = [];
  state.combat!.obstacles = [];
  // Park the attacker's own units off the fortification row.
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

function fireWarMachine(state: GameState, label: string): GameState {
  const offered = endRound(state, "p1");
  const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes(label));
  expect(fire, `${label} offer should be open at round start`).toBeTruthy();
  return applyOk(offered, fire!.action);
}

function candidatesOf(state: GameState): string[] {
  return state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? state.pendingChoice.candidateUnitIds : [];
}

describe("Gate shield — a defender standing on the Gate blocks its destruction", () => {
  it("a defender genuinely MOVES onto its own Gate via a legal action, and the walked-on Gate is shielded", () => {
    // The real path (not a hand-set position): "Defending units may move through
    // the Gate and may stop on it" — so the shield is reachable in actual play.
    const { state } = gateSiege("gate-shield-move");
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 15; // directly below the Gate at 11
    defender.activatedThisRound = false;
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";

    const move = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "MOVE_UNIT" && legal.action.destination === 11
    );
    expect(move, "the Gate is offered as a move destination to the defender").toBeTruthy();
    const moved = applyOk(state, move!.action);
    expect(moved.combat!.units.unit_p2_skeletons.position).toBe(11);

    destroyFortification(moved, null, "gate", 11);
    expect(moved.combat!.siege!.gatePosition, "the walked-on Gate is shielded").toBe(11);
  });

  it("destroyFortification leaves an OCCUPIED Gate standing; an empty Gate falls (CONTROL)", () => {
    const { state, siege } = gateSiege("gate-shield-destroy");
    // A defender stands on the Gate (position 11).
    state.combat!.units.unit_p2_skeletons.position = 11;

    destroyFortification(state, null, "gate", 11);
    expect(siege.gatePosition, "an occupied Gate is shielded and stands").toBe(11);
    expect(state.eventLog.some((event) => event.type === "FORTIFICATION_DESTROYED")).toBe(false);

    // CONTROL: vacate the Gate — now the very same call fells it.
    state.combat!.units.unit_p2_skeletons.position = 0;
    destroyFortification(state, null, "gate", 11);
    expect(siege.gatePosition, "an empty Gate is destroyed").toBeNull();
  });

  it("the Catapult is not aimed at an OCCUPIED Gate; an empty Gate IS a target (CONTROL)", () => {
    const occupied = gateSiege("gate-shield-catapult", {})!;
    occupied.state.players.p1.permanents = ["war_machine.catapult"];
    occupied.state.players.p1.resources.buildingMaterials = 3;
    occupied.state.combat!.units.unit_p2_skeletons.position = 11; // defender on the Gate
    const aiming = fireWarMachine(occupied.state, "Fire the Catapult");
    const cands = candidatesOf(aiming);
    expect(cands).not.toContain(fortificationTargetId("gate", 11));
    expect(cands, "walls are still targetable").toContain(fortificationTargetId("wall", 10));
    expect(cands, "the unit on the Gate is still an ordinary target").toContain("unit_p2_skeletons");

    // CONTROL: an empty Gate IS offered.
    const control = gateSiege("gate-shield-catapult-ctrl");
    control.state.players.p1.permanents = ["war_machine.catapult"];
    control.state.players.p1.resources.buildingMaterials = 3;
    control.state.combat!.units.unit_p2_skeletons.position = 13; // adjacent to wall 9, off the Gate
    const aimingCtrl = fireWarMachine(control.state, "Fire the Catapult");
    expect(candidatesOf(aimingCtrl)).toContain(fortificationTargetId("gate", 11));
  });

  it("the Cannon is not aimed at an OCCUPIED Gate; an empty Gate IS a target (CONTROL)", () => {
    const occupied = gateSiege("gate-shield-cannon");
    occupied.state.players.p1.permanents = ["war_machine.cannon"];
    occupied.state.players.p1.limits.expertUses = 1;
    occupied.state.combat!.units.unit_p2_skeletons.position = 11;
    const aiming = fireWarMachine(occupied.state, "Fire the Cannon");
    expect(candidatesOf(aiming)).not.toContain(fortificationTargetId("gate", 11));

    const control = gateSiege("gate-shield-cannon-ctrl");
    control.state.players.p1.permanents = ["war_machine.cannon"];
    control.state.players.p1.limits.expertUses = 1;
    control.state.combat!.units.unit_p2_skeletons.position = 0;
    const aimingCtrl = fireWarMachine(control.state, "Fire the Cannon");
    expect(candidatesOf(aimingCtrl)).toContain(fortificationTargetId("gate", 11));
  });

  it("a besieger is not offered to demolish an OCCUPIED Gate; an empty Gate IS offered (CONTROL)", () => {
    const gateTargetsDemolish = (state: GameState): boolean =>
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "ATTACK_FORTIFICATION" &&
          legal.action.target?.kind === "gate" &&
          legal.action.target.position === 11
      );

    // A non-ranged besieger adjacent to the Gate (15 is directly below 11).
    const control = gateSiege("gate-shield-melee-ctrl");
    control.state.combat!.units.unit_p1_griffins.position = 15;
    control.state.combat!.activeUnitId = "unit_p1_griffins";
    control.state.activePlayerId = "p1";
    expect(gateTargetsDemolish(control.state), "an empty Gate can be demolished").toBe(true);

    const occupied = gateSiege("gate-shield-melee");
    occupied.state.combat!.units.unit_p1_griffins.position = 15;
    occupied.state.combat!.units.unit_p2_skeletons.position = 11; // defender plugs the Gate
    occupied.state.combat!.activeUnitId = "unit_p1_griffins";
    occupied.state.activePlayerId = "p1";
    expect(gateTargetsDemolish(occupied.state), "an occupied Gate is not offered for demolish").toBe(false);
  });
});
