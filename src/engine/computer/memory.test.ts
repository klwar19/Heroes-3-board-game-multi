import { describe, expect, it } from "vitest";
import type { GameState } from "../state";
import {
  economyFocusBias,
  emptyComputerMemory,
  getComputerMemory,
  inferEconomyFocus,
  noteComputerAction,
  refreshComputerMemory,
  setStickyObjective,
} from "./memory";

function baseState(round: number, gold: number, army: number): GameState {
  return {
    seed: "memory-test",
    round,
    activePlayerId: "p2",
    turn: { mode: "ordered", completedPlayerIds: [] },
    players: {
      p2: {
        id: "p2",
        resources: { gold, buildingMaterials: 1, valuables: 0 },
        army: Array.from({ length: army }, (_, i) => ({ id: `u${i}` })),
      },
    },
    towns: {
      t1: { id: "t1", controllerId: "p2", buildings: ["citadel"] },
    },
    heroes: {},
  } as unknown as GameState;
}

describe("inferEconomyFocus", () => {
  it("prefers army when the force is thin or stagnant", () => {
    expect(inferEconomyFocus([], 2)).toBe("army");
    const stagnant = [
      { round: 1, gold: 15, mats: 2, vals: 0, army: 3, buildings: 1 },
      { round: 2, gold: 14, mats: 2, vals: 0, army: 3, buildings: 1 },
      { round: 3, gold: 16, mats: 2, vals: 0, army: 3, buildings: 2 },
    ];
    expect(inferEconomyFocus(stagnant, 3)).toBe("army");
  });

  it("prefers income when gold stays chronically low", () => {
    const broke = [
      { round: 1, gold: 4, mats: 3, vals: 1, army: 5, buildings: 2 },
      { round: 2, gold: 6, mats: 4, vals: 1, army: 5, buildings: 2 },
      { round: 3, gold: 5, mats: 3, vals: 2, army: 5, buildings: 3 },
    ];
    expect(inferEconomyFocus(broke, 5)).toBe("income");
  });

  it("CONTROL: flush healthy army is balanced or magic, not army", () => {
    const healthy = [
      { round: 1, gold: 20, mats: 3, vals: 1, army: 5, buildings: 3 },
      { round: 2, gold: 22, mats: 2, vals: 1, army: 6, buildings: 4 },
    ];
    const focus = inferEconomyFocus(healthy, 6);
    expect(focus === "balanced" || focus === "magic").toBe(true);
    expect(focus).not.toBe("army");
  });
});

describe("economyFocusBias", () => {
  it("boosts recruit under army focus and income builds under income focus", () => {
    const armyMem = { ...emptyComputerMemory(2), focus: "army" as const };
    const incomeMem = { ...emptyComputerMemory(2), focus: "income" as const };
    expect(economyFocusBias(armyMem, "recruit")).toBeGreaterThan(
      economyFocusBias(incomeMem, "recruit"),
    );
    expect(economyFocusBias(incomeMem, "build-income")).toBeGreaterThan(
      economyFocusBias(armyMem, "build-income"),
    );
  });
});

describe("refreshComputerMemory / sticky / notes", () => {
  it("appends a trail sample and persists sticky objective", () => {
    let state = baseState(1, 8, 3);
    state = refreshComputerMemory(state, "p2");
    const mem = getComputerMemory(state, "p2");
    expect(mem.resourceTrail.length).toBe(1);
    expect(mem.resourceTrail[0].army).toBe(3);
    expect(mem.focus).toBe("army");

    state = setStickyObjective(state, "p2", "field-a");
    expect(getComputerMemory(state, "p2").stickyObjectiveSpaceId).toBe("field-a");

    // Same round refresh overwrites trail tail, does not grow forever.
    state = refreshComputerMemory(state, "p2");
    expect(getComputerMemory(state, "p2").resourceTrail.length).toBe(1);
  });

  it("notes MOVE_HERO visits and market rounds", () => {
    let state = baseState(2, 12, 4);
    state = refreshComputerMemory(state, "p2");
    state = noteComputerAction(state, "p2", {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "h2",
      to: "1,2",
      path: [],
    } as never);
    expect(getComputerMemory(state, "p2").visitedThisTurn).toContain("1,2");

    state = noteComputerAction(state, "p2", {
      type: "OPEN_MARKET",
      playerId: "p2",
      heroId: "h2",
    } as never);
    expect(getComputerMemory(state, "p2").lastMarketRound).toBe(2);
  });

  it("notes a REVISIT_FIELD on the hero's field — the Stables loop breaker", () => {
    // A Stables revisit refunds the 1 MP it costs, so without this note an
    // idle hero revisited it FOREVER (real 256-step runner stall, seed
    // measure-f). Recording the field arms the map-policy thrash-skip gate.
    let state = baseState(2, 12, 4);
    (state.heroes as Record<string, unknown>).h2 = {
      id: "h2",
      controllerId: "p2",
      kind: "main",
      spaceId: "stables-field",
    };
    state = noteComputerAction(state, "p2", {
      type: "REVISIT_FIELD",
      playerId: "p2",
      heroId: "h2",
    } as never);
    expect(getComputerMemory(state, "p2").visitedThisTurn).toContain(
      "stables-field",
    );
  });

  it("CONTROL: empty memory for unknown seats", () => {
    const state = baseState(1, 10, 4);
    const mem = getComputerMemory(state, "p9");
    expect(mem.resourceTrail).toEqual([]);
    expect(mem.focus).toBe("balanced");
  });

  it("clears the sticky objective when a combat end is acknowledged", () => {
    // A LOST fight otherwise leaves the seat committed to the guard that just
    // beat it — the hero parks beside (or re-enters) the same field instead of
    // re-planning. Won fights consume their objective anyway, so clearing on
    // every acknowledge costs only one deterministic re-pick.
    let state = baseState(3, 12, 4);
    state = setStickyObjective(state, "p2", "field-guard");
    state = noteComputerAction(state, "p2", {
      type: "ACKNOWLEDGE_COMBAT_END",
      playerId: "p2",
    } as never);
    expect(getComputerMemory(state, "p2").stickyObjectiveSpaceId).toBeNull();

    // CONTROL: an ordinary map action keeps the march commitment.
    state = setStickyObjective(state, "p2", "field-guard");
    state = noteComputerAction(state, "p2", {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "h2",
      to: "1,3",
      path: [],
    } as never);
    expect(getComputerMemory(state, "p2").stickyObjectiveSpaceId).toBe(
      "field-guard",
    );
  });
});
