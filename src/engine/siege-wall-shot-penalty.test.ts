import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import { makeActiveEffect } from "./active-effects";
import { siegeRangedDamageReduction } from "./siege";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import type { GameAction, GameState, SiegeState } from "./state";

/**
 * The siege behind-Wall shot penalty: "Defenders in the column of an intact
 * Wall/Gate take 1 less damage from ranged attacks shot from the attacker's
 * side" (`siegeRangedDamageReduction`).
 *
 * REPORTED BUG: a unit carrying the FULL "Ignore combat penalties" waiver (Tower
 * Magi and friends) still lost the damage. The waiver's printed text
 * ("ignore-all-combat-penalties": "…both attacking an adjacent unit and the
 * long-range / behind-wall shot") covers this penalty, but the siege read never
 * consulted it. Every case below asserts the ACTUAL damage dealt, so it fails if
 * the waiver wiring is removed — or if the penalty itself stops working.
 *
 * Note the deliberate split, per the printed cards: the NARROWER
 * "ignore-combat-penalties" variant prints "The long-range / behind-wall penalty
 * still applies", so it keeps taking the hit (its own CONTROL below).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass reactions / decline rerolls until the attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

/**
 * p1 besieges p2's town: a p1 ranged shooter on the attacker's side of the board
 * (position 13, row 3 — deliberately NOT a back row, so the backline-to-backline
 * Combat penalty can never confuse the reading) shoots a p2 defender standing on
 * its own side at position 1 (row 0, column 1), whose column carries the intact
 * Wall at 9. Attack 3 vs Defense 0 with a scripted die of 0 → 3 damage before the
 * wall's −1.
 */
function wallShot(attackerAbilities: string[], siegeOverrides: Partial<SiegeState> = {}): GameState {
  const state = createInitialGameState("siege-wall-shot");
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.permanents = [];
  state.players.p2.permanents = [];
  state.combat!.obstacles = [];

  const attacker = state.combat!.units.unit_p1_marksmen; // type "ranged"
  attacker.abilities = attackerAbilities;
  attacker.attack = 3;
  attacker.position = 13;

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 1;
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;

  // Keep every other body clear of the wall line and of the shot.
  state.combat!.units.unit_p1_griffins.position = 17;
  state.combat!.units.unit_p1_crusaders.position = 19;
  state.combat!.units.unit_p2_vampires.position = 4;

  state.combat!.siege = {
    townPlayerId: "p2",
    walls: [8, 9, 10],
    gatePosition: 11,
    arrowTowerUnitId: null,
    ...siegeOverrides
  };

  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

const ATTACK: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

function damageDealt(state: GameState): number {
  return settle(applyOk(state, ATTACK)).combat!.units.unit_p2_skeletons.damage;
}

describe("siege behind-Wall shot — the 'Ignore combat penalties' waiver", () => {
  it("CONTROL: a plain ranged unit shooting through an intact Wall deals 1 less damage", () => {
    expect(damageDealt(wallShot([]))).toBe(2); // 3 attack − the wall's 1
  });

  it("a shooter with the full 'Ignore combat penalties' waiver takes NO wall penalty", () => {
    // The reported bug: this used to land 2, exactly like the plain unit above.
    expect(damageDealt(wallShot(["ignore-all-combat-penalties"]))).toBe(3);
  });

  it("the Tower Magi (both sides) really carry that full waiver", () => {
    const magi = coreUnitDefinitions["tower.magi"];
    for (const side of [magi.few, magi.pack]) {
      expect(side?.abilities).toContain("ignore-all-combat-penalties");
    }
    // The waiver's printed text is what makes it cover the behind-wall shot.
    expect(unitAbilities["ignore-all-combat-penalties"].effect).toEqual({ type: "IGNORE_RANGED_PENALTIES" });
    expect(unitAbilities["ignore-all-combat-penalties"].text).toMatch(/behind-wall/i);
  });

  it("CONTROL: the NARROWER 'No Adjacent Penalty' variant still takes the wall penalty (printed text)", () => {
    // "ignore-combat-penalties" prints "The long-range / behind-wall penalty
    // still applies" — so it must NOT be read by the siege waiver.
    expect(unitAbilities["ignore-combat-penalties"].text).toMatch(/behind-wall penalty still applies/i);
    expect(damageDealt(wallShot(["ignore-combat-penalties"]))).toBe(2);
  });

  it("CONTROL: a destroyed Wall removes the penalty for everyone", () => {
    // Wall 9 (the defender's column) gone: the plain unit lands its full 3 too.
    expect(damageDealt(wallShot([], { walls: [8, 10] }))).toBe(3);
    expect(damageDealt(wallShot(["ignore-all-combat-penalties"], { walls: [8, 10] }))).toBe(3);
  });

  it("the Ammo Cart's player-scoped waiver drops the wall penalty too", () => {
    const state = wallShot([]);
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Ammo Cart",
          scope: "player",
          duration: { type: "combat" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "RANGED_IGNORE_ALL_PENALTIES" }]
        },
        { type: "card", cardId: "war_machine.ammo_cart", controllerId: "p1" },
        "p1"
      )
    );
    expect(damageDealt(state)).toBe(3);
  });

  it("the UNIT ability waiver is own-attack only ([unit_attack]); the Ammo Cart's effect is not", () => {
    // A Retaliation Attack keeps the wall penalty for the printed unit ability —
    // the same retaliation gate `getAttackRollMode` applies to the roll penalty.
    const state = wallShot(["ignore-all-combat-penalties"]);
    const combat = state.combat!;
    const attacker = combat.units.unit_p1_marksmen;
    const defender = combat.units.unit_p2_skeletons;

    expect(siegeRangedDamageReduction(combat, attacker, defender, "ranged", state, false)).toBe(0);
    expect(siegeRangedDamageReduction(combat, attacker, defender, "ranged", state, true)).toBe(1);

    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Ammo Cart",
          scope: "player",
          duration: { type: "combat" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "RANGED_IGNORE_ALL_PENALTIES" }]
        },
        { type: "card", cardId: "war_machine.ammo_cart", controllerId: "p1" },
        "p1"
      )
    );
    expect(siegeRangedDamageReduction(combat, attacker, defender, "ranged", state, true)).toBe(0);
  });
});
