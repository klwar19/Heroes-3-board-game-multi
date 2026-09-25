import { describe, expect, it } from "vitest";
import {
  getBattlefieldDistance,
  getHexCellBehind,
  getHexDeploymentZone,
  getOrthogonalNeighbors,
  getReachableDestinations,
  hexPosition,
  isAdjacent
} from "./battlefield";
import { generateHexObstacleTokens, hexStandardDeploymentZones } from "./hex-battlefield";
import { HOUSE_RULES } from "./house-rules";
import { createInitialGameState } from "./index";
import { effectiveInitiative } from "./active-effects";
import { getAttackRollMode, getUnitMoveRange } from "./legal-actions";

/**
 * Hex Battlefield mode (Battlefield Expansion rules for regular games). Every
 * hex rule is asserted where it DIVERGES from the 4x5 board, with the grid as
 * the control, so removing the hex branch fails the test.
 *
 * Board: 13 hexes x 9 rows, even rows shifted right; labels are row letter +
 * column number (E7 = row 4, column 6).
 */
const hex = (column: number, row: number): number => {
  const position = hexPosition(column, row);
  if (position === null) throw new Error(`off board ${column},${row}`);
  return position;
};

describe("hex battlefield geometry", () => {
  it("a hex has six neighbours; grid squares keep four (control)", () => {
    expect(getOrthogonalNeighbors(hex(6, 4))).toHaveLength(6);
    expect(getOrthogonalNeighbors(5)).toHaveLength(4);
  });

  it("even rows are shifted right: E7 touches D7/D8 and F7/F8", () => {
    const e7 = hex(6, 4);
    for (const neighbour of [hex(6, 3), hex(7, 3), hex(6, 5), hex(7, 5), hex(5, 4), hex(7, 4)]) {
      expect(isAdjacent(e7, neighbour)).toBe(true);
    }
    expect(isAdjacent(e7, hex(5, 3))).toBe(false);
  });

  it("never mixes boards: a hex and a square are not adjacent and out of range", () => {
    expect(isAdjacent(hex(0, 0), 1)).toBe(false);
    expect(getBattlefieldDistance(hex(0, 0), 0)).toBeGreaterThan(20);
  });

  it("the cell behind a target continues the attack line", () => {
    expect(getHexCellBehind(hex(5, 4), hex(6, 4))).toBe(hex(7, 4));
    expect(getHexCellBehind(hex(5, 4), hex(12, 4))).toBeNull();
  });

  it("walks around a blocked hex instead of through it", () => {
    const start = hex(3, 4);
    const blocked = new Set([hex(4, 4), hex(4, 3), hex(3, 3), hex(3, 5), hex(4, 5)]);
    const reach = getReachableDestinations(start, 2, blocked, false);
    expect(reach).not.toContain(hex(5, 4));
    // A flyer ignores the ring (control).
    expect(getReachableDestinations(start, 2, blocked, true)).toContain(hex(5, 4));
  });

  it("deployment zones are the two edge columns of every row", () => {
    expect(getHexDeploymentZone("attacker")).toHaveLength(18);
    expect(getHexDeploymentZone("attacker")).toContain(hex(1, 8));
    expect(getHexDeploymentZone("defender")).toContain(hex(11, 0));
    expect(getHexDeploymentZone("defender")).not.toContain(hex(10, 0));
  });
});

describe("hex battlefield rules", () => {
  it("is an optional house rule, off by default", () => {
    const rule = HOUSE_RULES.find((entry) => entry.id === "hex-battlefield");
    expect(rule).toBeTruthy();
    expect(rule!.default).toBe(false);
  });

  it("units move their Initiative in hexes; on the 4x5 board ground units move 3 (control)", () => {
    const hexState = createInitialGameState("hex-move", { hexBattlefield: true });
    const gridState = createInitialGameState("hex-move");
    const hexUnit = hexState.combat!.units.unit_p1_crusaders;
    const initiative = effectiveInitiative(hexUnit, hexState.activeEffects, hexState.combat);
    expect(initiative).not.toBe(3);
    expect(getUnitMoveRange(hexUnit, hexState)).toBe(initiative);
    expect(getUnitMoveRange(gridState.combat!.units.unit_p1_crusaders, gridState)).toBe(3);
  });

  it("ranged units also move their Initiative on hex (grid shooters move 1)", () => {
    const hexState = createInitialGameState("hex-ranged-move", { hexBattlefield: true });
    const gridState = createInitialGameState("hex-ranged-move");
    const shooter = hexState.combat!.units.unit_p1_marksmen;
    expect(getUnitMoveRange(shooter, hexState)).toBe(
      effectiveInitiative(shooter, hexState.activeEffects, hexState.combat)
    );
    expect(getUnitMoveRange(gridState.combat!.units.unit_p1_marksmen, gridState)).toBe(1);
  });

  it("a shot at 8 or more hexes rolls with the penalty; 7 hexes does not", () => {
    const state = createInitialGameState("hex-long-shot", { hexBattlefield: true });
    const combat = state.combat!;
    const shooter = combat.units.unit_p1_marksmen;
    const target = combat.units.unit_p2_skeletons;
    // Park everyone else on the far edge so nobody stands next to the shooter.
    Object.values(combat.units).forEach((unit, index) => {
      unit.position = hex(12, index);
    });
    shooter.position = hex(0, 4);
    target.position = hex(7, 4);
    expect(getBattlefieldDistance(shooter.position, target.position)).toBe(7);
    expect(getAttackRollMode(shooter, target, state)).not.toBe("disadvantage");
    target.position = hex(8, 4);
    expect(getBattlefieldDistance(shooter.position, target.position)).toBe(8);
    expect(getAttackRollMode(shooter, target, state)).toBe("disadvantage");
  });

  it("random obstacles are deterministic and never touch a deployment zone or each other", () => {
    const zones = hexStandardDeploymentZones();
    const first = generateHexObstacleTokens("seed-a", zones, []);
    expect(generateHexObstacleTokens("seed-a", zones, [])).toEqual(first);
    // The PC's 5-12 blocked hexes scaled to the 63 open hexes: 3-6 (+1 overshoot).
    for (const seed of ["seed-a", "seed-b", "seed-c", "seed-d"]) {
      const blocked = generateHexObstacleTokens(seed, zones, []).reduce((sum, token) => sum + token.cells.length, 0);
      expect(blocked).toBeGreaterThanOrEqual(3);
      expect(blocked).toBeLessThanOrEqual(7);
    }
    const zoneSet = new Set(zones);
    first.forEach((token, index) => {
      for (const cell of token.cells) {
        expect(zoneSet.has(cell)).toBe(false);
        expect(getOrthogonalNeighbors(cell).some((neighbour) => zoneSet.has(neighbour))).toBe(false);
        for (const other of first.slice(index + 1)) {
          for (const otherCell of other.cells) {
            expect(otherCell === cell || isAdjacent(cell, otherCell)).toBe(false);
          }
        }
      }
    });
  });
});
