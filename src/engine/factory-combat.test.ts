import { describe, expect, it } from "vitest";

import { createInitialGameState } from "./index";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { getOnRemovalDetonation } from "./unit-abilities";
import type { CombatUnitState, GameState } from "./state";

/**
 * Factory Automaton "Detonate" — the signature board-game mechanic (Gamefound
 * Faction Focus: Factory): "<Passive> When this unit would be removed from
 * Combat, deal 2 damage to each adjacent unit." Hits friend AND foe; chains
 * down a row of Automatons; Frederick's specialty raises the blast. Every
 * assertion below fails if the wiring is removed, and each has a control.
 *
 * Battlefield is a 4-column grid (BATTLEFIELD_COLUMNS): position p sits at
 * row = floor(p/4), col = p%4; orthogonal neighbours of pos 5 are 1, 4, 6, 9.
 */

function setUnit(unit: CombatUnitState, patch: Partial<CombatUnitState>): void {
  Object.assign(unit, patch);
}

/** Lay out one Automaton (pos 5) ringed by three neighbours + one non-neighbour. */
function detonationBoard(seed: string): {
  state: GameState;
  automaton: CombatUnitState;
  friendAdj: CombatUnitState;
  enemyAdj1: CombatUnitState;
  enemyAdj2: CombatUnitState;
  enemyFar: CombatUnitState;
} {
  const state = createInitialGameState(seed);
  const u = state.combat!.units;
  const automaton = u.unit_p1_griffins;
  const friendAdj = u.unit_p1_crusaders;
  const enemyAdj1 = u.unit_p2_skeletons;
  const enemyAdj2 = u.unit_p2_vampires;
  const enemyFar = u.unit_p2_dread_knights;

  setUnit(automaton, {
    unitDefId: "factory.automatons",
    name: "Automatons",
    cardName: "Automatons",
    abilities: ["automaton-detonate"],
    variant: "few",
    position: 5,
    maxHealth: 6,
    damage: 0
  });
  // Three living neighbours of pos 5: a friendly (6), two enemies (1, 9).
  setUnit(friendAdj, { variant: "few", position: 6, maxHealth: 10, damage: 0, abilities: [] });
  setUnit(enemyAdj1, { variant: "few", position: 1, maxHealth: 10, damage: 0, abilities: [] });
  setUnit(enemyAdj2, { variant: "few", position: 9, maxHealth: 10, damage: 0, abilities: [] });
  // A non-neighbour at pos 2 (distance 2 from pos 5) — must be untouched.
  setUnit(enemyFar, { variant: "few", position: 2, maxHealth: 10, damage: 0, abilities: [] });
  // Park the last unit far away so it never interferes.
  setUnit(u.unit_p1_marksmen, { position: 19, maxHealth: 10, damage: 0, abilities: [] });
  return { state, automaton, friendAdj, enemyAdj1, enemyAdj2, enemyFar };
}

describe("Factory Automaton — Detonate on removal", () => {
  it("the ability is registered and reports its blast through getOnRemovalDetonation", () => {
    const { automaton } = detonationBoard("auto-1");
    expect(getOnRemovalDetonation(automaton)).toMatchObject({ abilityId: "automaton-detonate", amount: 2 });
    // CONTROL: a unit without the ability detonates nothing.
    automaton.abilities = [];
    expect(getOnRemovalDetonation(automaton)).toBeNull();
  });

  it("removing the Automaton deals 2 to EACH adjacent unit (friend and foe), and nothing to distant units", () => {
    const { state, automaton, friendAdj, enemyAdj1, enemyAdj2, enemyFar } = detonationBoard("auto-2");

    automaton.damage = automaton.maxHealth; // lethal → removed → detonates
    markUnitRemovedIfNeeded(state, automaton);

    expect(friendAdj.damage, "adjacent friendly unit takes the blast too").toBe(2);
    expect(enemyAdj1.damage, "adjacent enemy 1").toBe(2);
    expect(enemyAdj2.damage, "adjacent enemy 2").toBe(2);
    expect(enemyFar.damage, "non-adjacent unit is untouched").toBe(0);
    expect(
      state.eventLog.some((e) => e.type === "UNIT_ABILITY_TRIGGERED" && e.abilityId === "automaton-detonate"),
      "a detonation event fires"
    ).toBe(true);
  });

  it("CONTROL: without the Detonate ability, removal harms no neighbour", () => {
    const { state, automaton, friendAdj, enemyAdj1, enemyAdj2 } = detonationBoard("auto-3");
    automaton.abilities = []; // strip the ability

    automaton.damage = automaton.maxHealth;
    markUnitRemovedIfNeeded(state, automaton);

    expect(friendAdj.damage).toBe(0);
    expect(enemyAdj1.damage).toBe(0);
    expect(enemyAdj2.damage).toBe(0);
  });

  it("a flip (Pack→Few) is NOT a removal, so it does not detonate", () => {
    const { state, automaton, friendAdj } = detonationBoard("auto-flip");
    // Make the Automaton a Pack that will flip down to its Few side, not leave.
    setUnit(automaton, { variant: "pack", maxHealth: 8, damage: 8 });
    markUnitRemovedIfNeeded(state, automaton);

    expect(automaton.variant, "it flipped to Few rather than being removed").toBe("few");
    expect(friendAdj.damage, "no blast on a mere flip").toBe(0);
  });

  it("Frederick's bonus raises the blast (PlayerState.automatonDetonationBonus)", () => {
    const { state, automaton, enemyAdj1 } = detonationBoard("auto-frederick");
    state.players.p1.automatonDetonationBonus = 1; // base 2 + 1 = 3

    automaton.damage = automaton.maxHealth;
    markUnitRemovedIfNeeded(state, automaton);

    expect(enemyAdj1.damage, "base 2 + Frederick's +1").toBe(3);
  });

  it("chains: a blast that removes an adjacent Automaton detonates that one too", () => {
    const state = createInitialGameState("auto-chain");
    const u = state.combat!.units;
    const a = u.unit_p1_griffins; // first Automaton, pos 5
    const b = u.unit_p1_crusaders; // second Automaton, pos 6 (adjacent to a)
    const c = u.unit_p2_skeletons; // bystander at pos 7 (adjacent to b, NOT to a)

    setUnit(a, {
      unitDefId: "factory.automatons",
      cardName: "Automatons",
      abilities: ["automaton-detonate"],
      variant: "few",
      position: 5,
      maxHealth: 6,
      damage: 6 // lethal
    });
    setUnit(b, {
      unitDefId: "factory.automatons",
      cardName: "Automatons",
      abilities: ["automaton-detonate"],
      variant: "few",
      position: 6,
      maxHealth: 2, // a's 2-damage blast is lethal → b detonates in turn
      damage: 0
    });
    setUnit(c, { variant: "few", position: 7, maxHealth: 10, damage: 0, abilities: [] });
    setUnit(u.unit_p1_marksmen, { position: 19, abilities: [] });
    setUnit(u.unit_p2_vampires, { position: 18, abilities: [] });
    setUnit(u.unit_p2_dread_knights, { position: 16, abilities: [] });

    markUnitRemovedIfNeeded(state, a);

    expect(b.damage, "a's blast removes b").toBeGreaterThanOrEqual(b.maxHealth);
    expect(c.damage, "b's chained blast hits the bystander").toBe(2);
  });
});
