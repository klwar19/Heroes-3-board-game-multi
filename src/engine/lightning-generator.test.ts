import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
import { BATTLEFIELD_COLUMNS, BATTLEFIELD_ROWS, isAdjacent } from "./battlefield";
import { applyAction, createInitialGameState } from "./index";
import { startWarMachineRound } from "./permanents";
import type { GameAction, GameState } from "./state";

// Official Forge card: "At the beginning of each Combat round, choose a unit
// and roll an Attack die. On a "+1", deal it 1 damage. On a "0", deal 1 damage
// to a unit adjacent to it." Cost bar: War Machine Factory 6 / Trading Post 9.

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A sandbox combat at round start with p1's Generator in play and one scripted die. */
function generatorRound(seed: string, roll: number): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.permanents = ["war_machine.lightning_generator"];
  state.players.p2.permanents = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.pendingChoice = null;
  state.combat!.activeUnitId = null;
  state.combat!.dice.scriptedRolls = [roll];
  state.combat!.dice.rollCount = 0;
  for (const unit of Object.values(state.combat!.units)) unit.maxHealth = 20;
  startWarMachineRound(state);
  return state;
}

/** Leaves the enemy target with exactly ONE living neighbour (a friendly unit). */
function isolateWithOneNeighbour(state: GameState, targetId: string, neighbourId: string): void {
  const units = state.combat!.units;
  const target = units[targetId]!;
  const free = (position: number) => !Object.values(units).some((unit) => unit.position === position);
  let spot = -1;
  for (let position = 0; position < BATTLEFIELD_COLUMNS * BATTLEFIELD_ROWS && spot < 0; position += 1) {
    if (free(position) && isAdjacent(target.position, position)) spot = position;
  }
  expect(spot).toBeGreaterThanOrEqual(0);
  units[neighbourId]!.position = spot;
  // Park every other unit away from the target (off-board reserves).
  for (const unit of Object.values(units)) {
    if (unit.id !== targetId && unit.id !== neighbourId && isAdjacent(target.position, unit.position)) unit.position = -1;
  }
}

describe("Forge Lightning Generator (printed card)", () => {
  it("is sold like every war machine at its printed 6 / 9 gold", () => {
    expect(WAR_MACHINE_CARD_IDS).toContain("war_machine.lightning_generator");
    expect(cardLibrary["war_machine.lightning_generator"]?.warMachineCosts).toEqual({
      factory: { gold: 6 },
      tradingPost: { gold: 9 },
    });
  });

  it("offers ANY unit on the battlefield — friendly units too", () => {
    const state = generatorRound("lg-any-unit", 1);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    const owners = new Set(choice.candidateUnitIds.map((id) => state.combat!.units[id]?.controllerId));
    expect(owners.has("p1")).toBe(true);
    expect(owners.has("p2")).toBe(true);
  });

  it('"+1" damages the chosen unit; "-1" does nothing', () => {
    const hit = generatorRound("lg-plus", 1);
    const enemyId = Object.values(hit.combat!.units).find((unit) => unit.controllerId === "p2" && unit.position >= 0)!.id;
    const afterHit = applyOk(hit, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: hit.pendingChoice!.id, targetUnitId: enemyId });
    expect(afterHit.combat!.units[enemyId]!.damage).toBe(1);

    const miss = generatorRound("lg-minus", -1);
    const before = Object.fromEntries(Object.values(miss.combat!.units).map((unit) => [unit.id, unit.damage]));
    const afterMiss = applyOk(miss, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: miss.pendingChoice!.id, targetUnitId: enemyId });
    for (const unit of Object.values(afterMiss.combat!.units)) expect(unit.damage).toBe(before[unit.id]);
  });

  it('"0" spares the chosen unit and damages the unit adjacent to it (any side)', () => {
    const state = generatorRound("lg-zero", 0);
    const units = Object.values(state.combat!.units);
    const enemyId = units.find((unit) => unit.controllerId === "p2" && unit.position >= 0)!.id;
    const friendId = units.find((unit) => unit.controllerId === "p1" && unit.position >= 0)!.id;
    isolateWithOneNeighbour(state, enemyId, friendId);
    const after = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: state.pendingChoice!.id, targetUnitId: enemyId });
    expect(after.combat!.units[enemyId]!.damage).toBe(0);
    expect(after.combat!.units[friendId]!.damage).toBe(1);
  });
});
