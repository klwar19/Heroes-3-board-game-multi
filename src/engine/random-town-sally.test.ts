import { describe, expect, it } from "vitest";
import { hexPosition } from "./battlefield";
import { createInitialGameState } from "./index";
import { planRandomTownActivation } from "./random-town-tactics";
import { makeArrowTowerUnit, makeHexSiegeFortifications } from "./siege";
import type { CombatUnitState, GameState } from "./state";

/**
 * User report 2026-10-01 ("AI in random town ... never go out and hit anything
 * anymore"): an outgunned siege garrison (no shooter of its own with a target,
 * Arrow Tower down or outgunned) must leave its Walls instead of passing while
 * the besieger's shooters pick it apart. CONTROL: the same board with a
 * garrison shooter that out-shoots the besieger still holds (the old plan).
 */

const hex = (column: number, row: number): number => {
  const position = hexPosition(column, row);
  if (position === null) throw new Error(`off board ${column},${row}`);
  return position;
};

const INSIDE = new Set(
  [11, 12].flatMap((column) => Array.from({ length: 9 }, (_, row) => hex(column, row)))
);

function body(template: CombatUnitState, overrides: Partial<CombatUnitState>): CombatUnitState {
  return {
    ...template,
    damage: 0,
    abilities: [],
    tokens: [],
    activatedThisRound: false,
    movedThisActivation: false,
    attackedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    ...overrides
  } as CombatUnitState;
}

/**
 * p2 holds the hex siege: one melee guard on the inner Gate hex (column 10,
 * row 4). p1 besieges with three shooters far left and one tough melee body
 * outside the Gate, so walking out costs melee exposure the guard cannot
 * answer (Attack 1 into Defense 3) — the old plan always passed here.
 */
function siege(seed: string, garrisonExtras: CombatUnitState[] = []): { state: GameState; guard: CombatUnitState } {
  const state = createInitialGameState(seed, { hexBattlefield: true });
  const combat = state.combat!;
  expect(combat.geometry).toBe("hex");
  const p1 = combat.units.unit_p1_marksmen;
  const p2 = combat.units.unit_p2_skeletons;
  const guard = body(p2, {
    id: "guard", controllerId: "p2", type: "ground", attack: 1, defense: 0, maxHealth: 20, initiative: 3, position: hex(10, 4)
  });
  const shooters = [1, 4, 7].map((row, index) => body(p1, {
    id: `shooter_${index}`, controllerId: "p1", type: "ranged", attack: 4, defense: 1, maxHealth: 20, initiative: 2, position: hex(0, row)
  }));
  const brute = body(combat.units.unit_p1_crusaders, {
    id: "brute", controllerId: "p1", type: "ground", attack: 2, defense: 3, maxHealth: 20, initiative: 4, position: hex(7, 4)
  });
  combat.units = Object.fromEntries([guard, ...shooters, brute, ...garrisonExtras].map((unit) => [unit.id, unit]));
  combat.obstacles = [];
  combat.battlefieldTokens = [];
  combat.activeUnitId = guard.id;
  combat.siege = { townPlayerId: "p2", arrowTowerUnitId: null, ...makeHexSiegeFortifications() };
  state.activeEffects = [];
  return { state, guard };
}

describe("Random Town garrison sallies against outgunning shooters", () => {
  it("leaves the Walls when it has no shooter and no Arrow Tower", () => {
    const { state, guard } = siege("rt-sally-none");
    const intent = planRandomTownActivation(state, state.combat!, guard);
    expect(intent.kind).toBe("move");
    expect(intent.kind === "move" && INSIDE.has(intent.destination)).toBe(false);
  });

  it("still sallies when the Arrow Tower stands but is outgunned", () => {
    const tower = makeArrowTowerUnit("tower", "p2");
    const { state, guard } = siege("rt-sally-tower", [tower]);
    state.combat!.siege!.arrowTowerUnitId = tower.id;
    const intent = planRandomTownActivation(state, state.combat!, guard);
    expect(intent.kind).toBe("move");
  });

  it("CONTROL: holds when a garrison shooter out-shoots the besiegers", () => {
    const p2 = createInitialGameState("rt-sally-control", { hexBattlefield: true }).combat!.units.unit_p2_skeletons;
    const gunner = body(p2, {
      id: "gunner", controllerId: "p2", type: "ranged", attack: 20, defense: 0, maxHealth: 20, initiative: 1, position: hex(12, 0)
    });
    const { state, guard } = siege("rt-sally-control", [gunner]);
    expect(planRandomTownActivation(state, state.combat!, guard)).toEqual({ kind: "pass" });
  });
});
