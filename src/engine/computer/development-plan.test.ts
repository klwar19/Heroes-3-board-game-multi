import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import {
  coreFactionDefinitions,
  coreBuildingDefinitions,
} from "@/data/factions/core";
import { updateDevelopmentPlan, developmentPlanBias } from "./development-plan";
import { refreshComputerMemory, getComputerMemory } from "./memory";
import { chooseComputerAction } from "./policy";
import type { PlayerVisibleState, GameAction } from "../state";
describe("persistent development plan", () => {
  it("advances from silver to gold, pauses to rebuild, and resumes gold after recovery", () => {
    let state = createAdventureGameState({
      seed: "plan",
      playerCount: 2,
      events: false,
      rollFirstPlayer: false,
    });
    const player = state.players.p2;
    player.factionId = "stronghold";
    const bronze = [
      "stronghold.goblins",
      "stronghold.orcs",
      "stronghold.ogres",
    ].map((unitDefId, i) => ({
      id: "army" + i,
      unitDefId,
      side: "pack" as const,
    }));
    player.army = bronze;
    const town = Object.values(state.towns).find(
      (t) => t.controllerId === "p2",
    )!;
    town.buildings = coreFactionDefinitions.stronghold.buildings.filter(
      (id) => {
        const e = coreBuildingDefinitions[id].effect;
        return (
          e?.type === "UNLOCK_REINFORCE" ||
          (e?.type === "UNLOCK_RECRUIT_TIER" && e.tier === "bronze")
        );
      },
    );
    state = refreshComputerMemory(state, "p2");
    expect(getComputerMemory(state, "p2").developmentPlan?.goal).toBe("silver");
    state.towns[town.id].buildings.push("stronghold.dwelling_silver");
    state.round = 4;
    state = refreshComputerMemory(state, "p2");
    const gold = getComputerMemory(state, "p2").developmentPlan!;
    expect(gold.goal).toBe("gold");
    expect(gold.buildingId).toBe("stronghold.dwelling_gold");
    // Saved input is not casually consumed by a side building.
    state.players.p2.resources = {
      gold: 30,
      buildingMaterials: 8,
      valuables: 4,
    };
    expect(
      developmentPlanBias(
        state,
        "p2",
        {
          type: "BUILD_STRUCTURE",
          playerId: "p2",
          townId: town.id,
          buildingId: "stronghold.city_hall",
        },
        gold,
      ),
    ).toBeLessThan(0);
    state.players.p2.army = [];
    state.round = 5;
    state = refreshComputerMemory(state, "p2");
    expect(getComputerMemory(state, "p2").developmentPlan?.goal).toBe(
      "rebuild",
    );
    state = JSON.parse(JSON.stringify(state));
    state.players.p2.army = bronze;
    state.round = 6;
    state = refreshComputerMemory(state, "p2");
    expect(getComputerMemory(state, "p2").developmentPlan?.goal).toBe("gold");
    const build: GameAction = {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: town.id,
      buildingId: "stronghold.dwelling_gold",
    };
    const decision = chooseComputerAction({
      playerId: "p2",
      state: state as unknown as PlayerVisibleState,
      memory: getComputerMemory(state, "p2"),
      legalActions: [
        { label: "gold", action: build },
        { label: "end", action: { type: "END_TURN", playerId: "p2" } },
      ],
    });
    expect(decision?.action).toEqual(build);
    state.towns[town.id].buildings.push("stronghold.dwelling_gold");
    expect(updateDevelopmentPlan(state, "p2").goal).toBe("gold-recruit");
  });
});
