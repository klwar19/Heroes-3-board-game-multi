import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { unitAbilities } from "@/data/units/abilities";
import type { GameAction, GameState } from "./state";

/**
 * Veteran Ayssids (rank 2 "Twin Talons"): the two-dice apply-both roll lets the
 * controller reroll EACH "-1" die once — the same interactive per-die window
 * the Troglodytes' "Threefold Savage" opens, labelled after the Ayssids' own
 * ability. CONTROL: a plain apply-both ability (Champions) never opens it.
 */

const TWIN_TALONS = "veteran-ayssid-two-dice";
const PLAIN_APPLY_BOTH = "champion-roll-two-dice";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passReactions(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (safety-- > 0 && current.reactionWindow) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

function meleeAttack(seed: string, abilityId: string, rolls: number[]): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.type = "ground";
  attacker.attack = 5;
  attacker.position = 9;
  attacker.abilities = [abilityId];
  defender.position = 13;
  defender.defense = 1;
  defender.maxHealth = 40;
  defender.damage = 0;
  defender.abilities = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  const declared = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: defender.id,
  });
  return passReactions(declared);
}

function rerollOffers(state: GameState) {
  return getLegalActions(state, "p1").filter(
    (legal) => legal.action.type === "REROLL_PENDING_CHOICE" && legal.action.dieIndex !== undefined,
  );
}

describe("veteran Ayssids — Twin Talons rerolls each \"-1\" die once", () => {
  it("opens the per-die \"-1\" reroll window named after Twin Talons; each die once, non-negative dice never", () => {
    expect(unitAbilities[TWIN_TALONS]?.effect).toMatchObject({
      type: "ROLL_TWO_DICE_APPLY_BOTH",
      diceCount: 2,
      negativeRerollChoice: true,
    });
    // Dice: [-1, +1] for the attack, then -1 again for the reroll of die 1.
    const state = meleeAttack("ayssid-twin-talons", TWIN_TALONS, [-1, 1, -1]);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") return;
    expect(choice.rerollNegativeDiceOnly).toBe(true);
    expect(choice.rerollSources[0]).toMatchObject({ name: "Twin Talons", abilityId: TWIN_TALONS });

    // Only the "-1" die (index 0) is offered; the +1 die is not.
    const offers = rerollOffers(state);
    expect(offers.map((legal) => (legal.action as { dieIndex?: number }).dieIndex)).toEqual([0]);
    expect(offers[0]!.label).toContain("Twin Talons");

    // Rerolling it lands on another "-1" — still no second reroll of that die.
    const rerolled = applyOk(state, offers[0]!.action);
    expect(rerolled.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(rerollOffers(rerolled)).toEqual([]);
  });

  it("CONTROL: a plain apply-both roll with the same dice resolves straight through (no reroll window)", () => {
    const state = meleeAttack("ayssid-twin-talons-control", PLAIN_APPLY_BOTH, [-1, 1, -1]);
    expect(state.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(rerollOffers(state)).toEqual([]);
  });
});
