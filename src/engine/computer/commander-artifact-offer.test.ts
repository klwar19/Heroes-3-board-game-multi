import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import type { GameState } from "../state";
import { scoreChoiceAction } from "./choice-policy";
import { getComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";

// WoG commander artifact offers were scored by the generic option pick, which
// bought every one: ranked-rule lab seats spent 5-12 gold of them before R7
// and reached the level-7 by R8 in 36% of seats (57% without the module).

function offerState(gold: number): GameState {
  const state = createAdventureGameState({ seed: "commander-artifact-offer", difficulty: "impossible", events: false, rollFirstPlayer: false });
  state.round = 5;
  state.activePlayerId = "p1";
  const player = state.players.p1;
  expect(player.factionId).toBe("castle");
  // Silver dwelling standing, Gold dwelling + Archangels still to buy: 10 gold /
  // 9 materials / 4 valuables + 20 gold / 1 valuable.
  Object.values(state.towns).find(town => town.controllerId === "p1")!.buildings.push("castle.dwelling_silver");
  player.resources = { gold, buildingMaterials: 9, valuables: 4 };
  player.production = { gold: 10, buildingMaterials: 4, valuables: 1 };
  state.pendingChoice = {
    id: "offer", type: "OPTION_CHOICE", playerId: "p1", context: "commander-artifact-offer", prompt: "Commander artifact",
    options: [{ label: "Iron Cudgel" }, { label: "Axe of Smashing" }, { label: "Decline" }],
    commanderArtifactOffer: { cardIds: ["wog.artifact.iron_cudgel", "wog.artifact.axe_of_smashing"], cost: 7, source: "level-2 Neutral" },
    returnPhase: "player-turn",
  } as unknown as GameState["pendingChoice"];
  return state;
}

function score(state: GameState, optionIndex: number): number {
  const observation = { playerId: "p1", state: state as unknown as ComputerObservation["state"], legalActions: [], memory: getComputerMemory(state, "p1") } as ComputerObservation;
  return scoreChoiceAction(observation, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: "offer", optionIndex })!.score;
}

describe("commander artifact offers are bought from surplus only", () => {
  it("declines an offer whose price would push the first level-7 to a later Resource Round", () => {
    // 20 gold now + R7 income lands Gold dwelling + Archangels on R7; 7 gold less pushes them to R9.
    const saving = offerState(20);
    expect(score(saving, 2)).toBeGreaterThan(score(saving, 0));
    expect(score(saving, 2)).toBeGreaterThan(score(saving, 1));
  });

  it("before the first level-7 stands, only gold beyond its whole remaining cost is spent", () => {
    // 34 gold covers the 30-gold milestone now, but not after a 7-gold artifact.
    const flushButShort = offerState(34);
    expect(score(flushButShort, 2)).toBeGreaterThan(score(flushButShort, 1));
  });

  it("CONTROL: a seat with gold to spare buys, preferring the higher grade", () => {
    const rich = offerState(80);
    expect(score(rich, 1)).toBeGreaterThan(score(rich, 0));
    expect(score(rich, 0)).toBeGreaterThan(score(rich, 2));
  });
});
