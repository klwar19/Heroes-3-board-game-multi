import { describe, expect, it } from "vitest";
import { getAttackRollMode } from "./index";
import { ARROW_TOWER_POSITION, makeArrowTowerUnit } from "./siege";
import type { CombatUnitState } from "./state";

/**
 * Arrow Tower, rulebook p.46 / wiki: "It acts like a Ranged unit, except that
 * it is not affected by anything related to its positioning. For example, it
 * never gets ranged penalty against enemy units and vice versa."
 *
 * In this game the only ranged penalties are the adjacent (melee) penalty and
 * the long-range penalty (back row to the opposite back row). The Tower fights
 * from beside the board (position -1), so it can be neither adjacent nor in a
 * back row — and thus escapes both penalties as attacker AND as target. These
 * tests lock that: a normal ranged unit in the Tower's logical place DOES take
 * the penalty, the Tower never does. If the Tower were ever put on the board,
 * or the penalty geometry stopped excluding it, these fail.
 */

function rangedUnit(overrides: Partial<CombatUnitState> & { id: string; position: number }): CombatUnitState {
  return {
    controllerId: "p1",
    name: "Test Shooter",
    cardName: "Test Shooter",
    variant: "pack",
    grade: "bronze",
    type: "ranged",
    attack: 4,
    defense: 1,
    maxHealth: 5,
    damage: 0,
    initiative: 5,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    ...overrides
  };
}

describe("Arrow Tower — not affected by anything related to its positioning", () => {
  it("sits off the board, at position -1", () => {
    expect(makeArrowTowerUnit("t", "p2").position).toBe(ARROW_TOWER_POSITION);
    expect(ARROW_TOWER_POSITION).toBe(-1);
  });

  it("a normal ranged unit shooting back-row to opposite back-row takes the long-range penalty", () => {
    const shooter = rangedUnit({ id: "shooter", position: 0 }); // top back row
    const target = rangedUnit({ id: "target", controllerId: "p2", position: 16 }); // bottom back row
    expect(getAttackRollMode(shooter, target)).toBe("disadvantage");
  });

  it("the Arrow Tower takes NO ranged penalty shooting that same far target", () => {
    const tower = makeArrowTowerUnit("tower", "p2");
    const target = rangedUnit({ id: "target", controllerId: "p1", position: 16 });
    expect(getAttackRollMode(tower, target)).toBe("normal");
  });

  it("an enemy shooting the Arrow Tower takes NO ranged penalty either (vice versa)", () => {
    const shooter = rangedUnit({ id: "shooter", position: 0 });
    const tower = makeArrowTowerUnit("tower", "p2");
    expect(getAttackRollMode(shooter, tower)).toBe("normal");
  });

  it("a normal ranged unit beside its target takes the adjacent (melee) penalty, the Tower never can", () => {
    const shooter = rangedUnit({ id: "shooter", position: 5 });
    const adjacentEnemy = rangedUnit({ id: "enemy", controllerId: "p2", position: 9 }); // adjacent to 5
    expect(getAttackRollMode(shooter, adjacentEnemy)).toBe("disadvantage");

    // The Tower (off the board) is never adjacent to anyone, so it shoots clean.
    const tower = makeArrowTowerUnit("tower", "p1");
    expect(getAttackRollMode(tower, adjacentEnemy)).toBe("normal");
  });
});
