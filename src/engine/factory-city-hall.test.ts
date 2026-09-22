import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

/**
 * Factory City Hall: at each Resource round choose "Gain 4 gold" OR recruit /
 * reinforce the level-3 bronze Armadillos for free. The Armadillo option is
 * only offered when it can do something: recruit the Few when unowned, or
 * reinforce an owned Few to its Pack.
 */
describe("Factory City Hall — free Armadillos recruit or reinforce", () => {
  const ARMADILLOS = "factory.armadillos";

  function applyOk(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return result.state;
  }

  function factoryCityHallGame(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    for (const town of Object.values(state.towns)) {
      town.buildings = town.controllerId === "p1" ? ["factory.city_hall"] : [];
    }
    // Start without any Armadillos so the recruit branch is reachable.
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== ARMADILLOS);
    return state;
  }

  function startResourceRound(state: GameState, round: number): void {
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
      state.adventure.pendingVisit = null;
    }
    state.round = round;
    startAdventureRound(state);
    pumpAdventureQueues(state);
  }

  function cityHallLabels(state: GameState): string[] {
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      return [];
    }
    return choice.options.map((option) => option.label);
  }

  function pick(state: GameState, labelPart: string): GameState {
    const legal = getLegalActions(state, "p1").find((candidate) => candidate.label.includes(labelPart));
    expect(legal, `a legal "${labelPart}" option`).toBeTruthy();
    return applyOk(state, legal!.action);
  }

  function armadillos(state: GameState) {
    return state.players.p1.army.filter((unit) => unit.unitDefId === ARMADILLOS);
  }

  it("recruits a free Armadillos Few when none are owned (gold unchanged)", () => {
    let state = factoryCityHallGame("factory-ch-recruit");
    startResourceRound(state, 3);
    expect(cityHallLabels(state)).toEqual([
      "Gain 4 gold",
      "Recruit or reinforce the level 3 bronze unit (Armadillos) for free"
    ]);

    state = pick(state, "Recruit or reinforce the level 3 bronze unit");
    // The follow-up offers exactly the recruit (no reinforce target) plus Skip.
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Recruit Armadillos (free)"))).toBe(true);
    expect(labels.some((label) => label.includes("Reinforce Armadillos"))).toBe(false);
    expect(labels.some((label) => label === "Skip" || label.includes("Skip"))).toBe(true);

    const goldBefore = state.players.p1.resources.gold;
    state = pick(state, "Recruit Armadillos (free)");
    expect(armadillos(state)).toHaveLength(1);
    expect(armadillos(state)[0].side).toBe("few");
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });

  it("with an owned Few, offers the free reinforce to a Pack; with only a Pack, only the gold option", () => {
    let state = factoryCityHallGame("factory-ch-reinforce");
    startResourceRound(state, 3);
    state = pick(state, "Recruit or reinforce the level 3 bronze unit");
    state = pick(state, "Recruit Armadillos (free)");
    expect(armadillos(state).map((unit) => unit.side)).toEqual(["few"]);

    // Round 5: the owned Few can be reinforced — never a duplicate recruit.
    startResourceRound(state, 5);
    expect(cityHallLabels(state)).toContain("Recruit or reinforce the level 3 bronze unit (Armadillos) for free");
    state = pick(state, "Recruit or reinforce the level 3 bronze unit");
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Recruit Armadillos"))).toBe(false);
    const goldBefore = state.players.p1.resources.gold;
    state = pick(state, "Reinforce Armadillos to a Pack (free)");
    expect(armadillos(state).map((unit) => unit.side)).toEqual(["pack"]);
    expect(state.players.p1.resources.gold).toBe(goldBefore);

    // Round 7: only a Pack is owned — the Armadillo option would do nothing, so
    // it is filtered out and only the gold remains.
    startResourceRound(state, 7);
    expect(cityHallLabels(state)).toEqual(["Gain 4 gold"]);
  });

  it("CONTROL: the gold option pays 4 gold and grants no Armadillos", () => {
    let state = factoryCityHallGame("factory-ch-gold");
    startResourceRound(state, 3);
    const goldBefore = state.players.p1.resources.gold;
    state = pick(state, "Gain 4 gold");
    expect(state.players.p1.resources.gold).toBe(goldBefore + 4);
    expect(armadillos(state)).toHaveLength(0);
  });
});
