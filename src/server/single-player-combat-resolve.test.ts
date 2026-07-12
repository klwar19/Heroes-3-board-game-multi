/**
 * Single-player combat handling: an AI battle resolves IMMEDIATELY, server-side,
 * with no human wait — the runner drives a combat that has no human participant
 * all the way to its outcome. The lone EXCEPTION is a PvP fight (a computer
 * attacking the human): there the runner STOPS the moment control reaches the
 * human's own unit, leaving the combat OPEN for the human to play. Each claim
 * fails if that wiring is removed, with the other case as the control.
 */
import { describe, expect, it } from "vitest";
import {
  computerDecisionOwner,
  createInitialGameState,
  getLegalActions,
  standardComputerController,
} from "@/engine";
import { driveComputerPlayers } from "./computer-runner";

describe("single-player combat resolution", () => {
  it("resolves an AI-only battle to completion without any human decision", () => {
    const state = createInitialGameState("sp-ai-battle");
    // Both seats are computers: no human is a participant of this fight.
    state.controllers = {
      p1: standardComputerController(),
      p2: standardComputerController(),
    };
    // Deterministic dice at the expected value, empty hands / effects so no
    // reaction window ever interrupts the resolve.
    const combat = state.combat!;
    combat.dice.scriptedRolls = Array(60).fill(0);
    combat.dice.rollCount = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activeEffects = [];

    // Trim the defender to a single fragile skeleton so a lethal opening blow
    // ends the fight; strip abilities so no rebirth/retaliation quirk survives.
    delete combat.units.unit_p2_vampires;
    delete combat.units.unit_p2_dread_knights;
    const skeletons = combat.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.defense = 0;
    skeletons.maxHealth = 4;
    skeletons.damage = 0;
    skeletons.position = 8;

    // A lethal attacker adjacent to it; the other attackers sit this round out.
    const griffins = combat.units.unit_p1_griffins;
    griffins.abilities = [];
    griffins.attack = 30;
    griffins.position = 9;
    griffins.activatedThisRound = false;
    combat.units.unit_p1_marksmen.activatedThisRound = true;
    combat.units.unit_p1_crusaders.activatedThisRound = true;

    state.activePlayerId = "p1";
    combat.activeUnitId = "unit_p1_griffins";

    const run = driveComputerPlayers(state);

    // The runner drove the whole battle: it did not stall, the skeleton was
    // removed, and nothing is left for anyone (human or computer) to decide.
    expect(run.stalled, run.reason).toBe(false);
    expect(
      run.state.eventLog.some(
        (event) =>
          event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons",
      ),
    ).toBe(true);
    expect(run.state.combat?.outcome?.winnerPlayerId).toBe("p1");
    expect(computerDecisionOwner(run.state)).toBeNull();
  });

  it("CONTROL: a PvP fight is NOT auto-resolved — it stops for the human", () => {
    const state = createInitialGameState("sp-pvp-battle");
    // Only p2 is a computer; p1 is the human.
    state.controllers = { p2: standardComputerController() };
    const combat = state.combat!;
    combat.dice.scriptedRolls = Array(60).fill(0);
    combat.dice.rollCount = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activeEffects = [];

    // The computer's Dread Knights are the only unit yet to act this round; its
    // strike is survivable, so after it acts a HUMAN (p1) unit activates next.
    const attacker = combat.units.unit_p2_dread_knights;
    attacker.abilities = [];
    attacker.attack = 4;
    attacker.position = 9;
    attacker.activatedThisRound = false;
    combat.units.unit_p2_skeletons.activatedThisRound = true;
    combat.units.unit_p2_vampires.activatedThisRound = true;
    for (const id of ["unit_p1_marksmen", "unit_p1_griffins", "unit_p1_crusaders"] as const) {
      const durable = combat.units[id];
      durable.abilities = [];
      durable.defense = 4;
      durable.maxHealth = 40;
      durable.damage = 0;
    }
    combat.units.unit_p1_marksmen.position = 8; // adjacent target for the attacker

    state.activePlayerId = "p2";
    combat.activeUnitId = "unit_p2_dread_knights";

    const run = driveComputerPlayers(state);

    // The runner played only the computer's unit, then handed control to the
    // human: the combat is still OPEN (no outcome), a p1 unit is active, and the
    // human owes the next decision — the runner never plays it for them.
    expect(run.stalled, run.reason).toBe(false);
    expect(run.state.combat).not.toBeNull();
    expect(run.state.combat?.outcome).toBeNull();
    const activeUnit = run.state.combat!.units[run.state.combat!.activeUnitId!];
    expect(activeUnit.controllerId).toBe("p1");
    expect(computerDecisionOwner(run.state)).toBeNull();
    // The human really has combat work waiting (their unit must act).
    const humanOffers = getLegalActions(run.state, "p1").map((legal) => legal.action.type);
    expect(
      humanOffers.some((type) =>
        ["ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT", "MOVE_COMBAT_UNIT", "DEFEND_UNIT", "END_ACTIVATION"].includes(
          type,
        ),
      ),
      `human combat offers: ${humanOffers.join(", ")}`,
    ).toBe(true);
    // The computer's unit really acted (it is spent for the round).
    expect(run.state.combat!.units.unit_p2_dread_knights.activatedThisRound).toBe(true);
  });
});
