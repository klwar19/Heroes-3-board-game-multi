import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./index";
import { getAttackRollMode } from "./legal-actions";
import type { GameState } from "./state";
import { coreUnitDefinitions } from "@/data/factions/units";

/**
 * Ranged combat-penalty waivers (Evil Eyes / Medusas / Zealots / Titans vs.
 * Magi / Sharpshooters / Halflings).
 *
 * A ranged attack rolls at disadvantage when it strikes an ADJACENT unit, and
 * separately when it shoots from the back row across to the opposite back row
 * (the long-range / behind-wall penalty). The two abilities differ:
 *
 *   • "ignore-combat-penalties"      (card: "...against adjacent units") waives
 *      ONLY the adjacent-attack penalty — the long-range one still applies.
 *   • "ignore-all-combat-penalties"  (card: "Ignore the combat penalties")
 *      waives BOTH.
 *
 * In the default combat setup p1's Marksmen sit in their own back row (1) and
 * the enemy Dread Knights in the opposite back row (18) — a long-range shot.
 * Moving the Skeletons next to the Marksmen (2) makes an adjacent shot.
 */

function combatWith(abilities: string[]): GameState {
  const state = createInitialGameState();
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }
  const marksmen = state.combat.units.unit_p1_marksmen;
  marksmen.type = "ranged";
  marksmen.abilities = abilities;
  // Put the Skeletons directly beside the Marksmen so they are an adjacent shot.
  state.combat.units.unit_p2_skeletons.position = 2;
  return state;
}

function adjacentMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state);
}

function longRangeMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_dread_knights, state);
}

/** The same adjacent shot, but resolved as this unit's Retaliation Attack. */
function adjacentRetaliationMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state, true);
}

describe("ranged combat-penalty waivers", () => {
  it("baseline: a ranged unit with no waiver suffers both the adjacent and the long-range penalty", () => {
    const state = combatWith([]);
    expect(adjacentMode(state)).toBe("disadvantage");
    expect(longRangeMode(state)).toBe("disadvantage");
  });

  it("Evil Eyes' ability waives the adjacent penalty but NOT the long-range one", () => {
    const state = combatWith(["ignore-combat-penalties"]);
    // The reported Evil Eye fix: adjacent shot is unpenalised…
    expect(adjacentMode(state)).toBe("normal");
    // …but a too-far / behind-wall shot still rolls at disadvantage.
    expect(longRangeMode(state)).toBe("disadvantage");
  });

  it("the general 'ignore the combat penalties' ability waives BOTH penalties", () => {
    const state = combatWith(["ignore-all-combat-penalties"]);
    expect(adjacentMode(state)).toBe("normal");
    expect(longRangeMode(state)).toBe("normal");
  });

  // The Sharpshooter / Magi / Halfling waiver is printed "[unit_attack] Ignore the
  // combat penalties" — it fires only when this unit ATTACKS, never on its
  // Retaliation Attack. A retaliating Sharpshooter that must hit its adjacent
  // attacker therefore rolls at the melee penalty like any other ranged unit.
  it("the [unit_attack] full waiver applies on the unit's own attack but NOT on a retaliation", () => {
    const state = combatWith(["ignore-all-combat-penalties"]);
    // Its own attack: unpenalised (the control).
    expect(adjacentMode(state)).toBe("normal");
    // Retaliating against the adjacent attacker: the melee penalty is back.
    expect(adjacentRetaliationMode(state)).toBe("disadvantage");
  });

  // The "[unit_passive] … against adjacent units" melee waiver (Evil Eyes /
  // Medusas / Zealots / Titans) is passive, not attack-gated, so it keeps
  // waiving the adjacent penalty even on a Retaliation Attack — the CONTROL that
  // proves only the [unit_attack] waiver is scoped to attacks.
  it("the [unit_passive] adjacent waiver still applies on a retaliation", () => {
    const state = combatWith(["ignore-combat-penalties"]);
    expect(adjacentMode(state)).toBe("normal");
    expect(adjacentRetaliationMode(state)).toBe("normal");
  });
});

/**
 * "Roll 2 Attack dice and resolve the higher one" (attack-roll-advantage). The
 * two printed variants differ by icon:
 *   • Leprechaun / Halflings — "[unit_attack] Roll 2 Attack dice …": fires ONLY
 *     on the unit's own declared attack, NOT on a Retaliation Attack.
 *   • Crusaders — "[unit_passive] During any attack …": applies to every attack,
 *     retaliations included (the CONTROL that proves only the [unit_attack]
 *     variant is attack-scoped).
 */
describe("twin Attack dice advantage", () => {
  // A ground melee attacker (no ranged penalty to muddy the mode) hitting an
  // adjacent enemy, carrying the given unit's real ability list.
  function groundAttackerWith(abilities: readonly string[] | undefined): GameState {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    const attacker = state.combat.units.unit_p1_marksmen;
    attacker.type = "ground";
    attacker.abilities = [...(abilities ?? [])];
    state.combat.units.unit_p2_skeletons.position = 2;
    return state;
  }

  function ownAttackMode(state: GameState): ReturnType<typeof getAttackRollMode> {
    const combat = state.combat!;
    return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state);
  }

  function retaliationMode(state: GameState): ReturnType<typeof getAttackRollMode> {
    const combat = state.combat!;
    return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state, true);
  }

  it("the neutral Leprechaun rolls advantage on its own attack but NORMAL on a retaliation", () => {
    const state = groundAttackerWith(coreUnitDefinitions["neutral.leprechaun"].neutral?.abilities);
    expect(ownAttackMode(state)).toBe("advantage");
    expect(retaliationMode(state)).toBe("normal");
  });

  it("the Factory Halflings' [unit_attack] advantage is likewise dropped on a retaliation", () => {
    const state = groundAttackerWith(coreUnitDefinitions["factory.halflings"].few?.abilities);
    expect(ownAttackMode(state)).toBe("advantage");
    expect(retaliationMode(state)).toBe("normal");
  });

  it("CONTROL: the Crusaders' [unit_passive] advantage still applies on a retaliation", () => {
    const state = groundAttackerWith(coreUnitDefinitions["neutral.crusaders"].neutral?.abilities);
    expect(ownAttackMode(state)).toBe("advantage");
    expect(retaliationMode(state)).toBe("advantage");
  });
});
