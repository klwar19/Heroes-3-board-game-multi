import { describe, expect, it } from "vitest";
import type { CombatState, CombatUnitState, GameAction, GameState } from "../state";
import { combatHorizonAdjustment } from "./planning-horizon";

function unit(id: string, overrides: Partial<CombatUnitState>): CombatUnitState {
  return {
    id, name: id, cardName: id, controllerId: "p1", variant: "few",
    grade: "bronze", type: "ground", attack: 3, defense: 0,
    maxHealth: 3, damage: 0, initiative: 5, position: 0,
    activatedThisRound: true, movedThisActivation: false,
    retaliatedThisRound: false, defenseToken: false, abilities: [],
    ...overrides,
  } as CombatUnitState;
}

/** Our silver A (6 Attack) can remove the enemy X (3 Health) next to it. */
function state(units: CombatUnitState[]): GameState {
  const combat = {
    id: "forecast", round: 1, activeUnitId: "A", attackerPlayerId: "p2", defenderPlayerId: "p1",
    context: { kind: "player" }, obstacles: [], units: Object.fromEntries(units.map(entry => [entry.id, entry])),
  } as unknown as CombatState;
  return { seed: "forecast", round: 1, eventCounter: 0, combat, activeEffects: [], stack: [], players: {} } as unknown as GameState;
}

const board = () => [
  unit("A", { controllerId: "p2", grade: "silver", attack: 6, defense: 1, maxHealth: 12, position: 9, activatedThisRound: false }),
  unit("X", { grade: "silver", attack: 7, maxHealth: 3, initiative: 1, position: 8 }),
];
const attackX = { type: "ATTACK_UNIT", playerId: "p2", attackerId: "A", defenderId: "X" } as GameAction;

describe("combat forecast removal gate", () => {
  it("forecasts a kill of a unit carrying per-combat veterancy bookkeeping", () => {
    const expected = combatHorizonAdjustment(state(board()), attackX, undefined, 1);
    expect(expected).toBeGreaterThan(0);
    // Nearly every unit carries these records once it has acted; they are
    // bookkeeping, not removal triggers.
    const tracked = board().map(entry => ({
      ...entry, townVeterancy: { lastRoll: 0 }, factionVeterancy: { movedRound: 1 },
    }) as unknown as CombatUnitState);
    expect(combatHorizonAdjustment(state(tracked), attackX, undefined, 1)).toBe(expected);
  });

  it("still steps aside for a real removal-time veterancy ability", () => {
    // CONTROL: a Final Curse unit survives the lethal hit, so the ordinary
    // removal the forecast would project is wrong — it must not score it.
    const cursed = board().map(entry => entry.id === "X"
      ? { ...entry, abilities: ["veteran-mummy-last-stand"] } : entry);
    expect(combatHorizonAdjustment(state(cursed), attackX, undefined, 1)).toBe(0);
  });
});
