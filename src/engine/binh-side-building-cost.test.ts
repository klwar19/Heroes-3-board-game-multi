import { describe, expect, it } from "vitest";

import { coreBuildingDefinitions } from "@/data/factions/core";
import {
  applyAction,
  createAdventureGameState,
  effectiveTownBuildingCost,
  getLegalActions,
  houseRuleDefaultFor,
  isSideTownBuilding,
} from "./index";
import type { GameState } from "./state";

const RULE = "side-buildings-materials-only" as const;

function makeGame(enabled: boolean): GameState {
  let state = createAdventureGameState({
    seed: `side-building-cost-${enabled}`,
    difficulty: "normal",
    rollFirstPlayer: false,
    ruleset: "binh",
    houseRules: { [RULE]: enabled },
    startingBuildings: [],
    players: [
      { id: "p1", name: "Dungeon", factionId: "dungeon", heroDefId: "alamar" },
      { id: "p2", name: "Castle", factionId: "castle", heroDefId: "catherine" },
    ],
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    const refreshed = applyAction(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: [],
    });
    expect(refreshed.errors).toHaveLength(0);
    state = refreshed.state;
  }
  state.players.p1.townTokens.build = true;
  return state;
}

function hasBuild(state: GameState, buildingId: string): boolean {
  return getLegalActions(state, "p1").some(
    (legal) =>
      legal.action.type === "BUILD_STRUCTURE" &&
      legal.action.buildingId === buildingId,
  );
}

describe("BINH side-building materials-only option", () => {
  it("is opt-in in both presets, preserving every existing game by default", () => {
    expect(houseRuleDefaultFor("binh", RULE)).toBe(false);
    expect(houseRuleDefaultFor("legacy", RULE)).toBe(false);
  });

  it("recognizes side slots while excluding every named core building role", () => {
    expect(isSideTownBuilding(coreBuildingDefinitions["factory.bank"]!)).toBe(true);
    expect(isSideTownBuilding(coreBuildingDefinitions["imperium.armoury"]!)).toBe(true);
    for (const id of [
      "castle.city_hall",
      "castle.citadel",
      "castle.mage_guild",
      "castle.dwelling_bronze",
      "castle.dwelling_silver",
      "castle.dwelling_gold",
    ]) {
      expect(isSideTownBuilding(coreBuildingDefinitions[id]!), id).toBe(false);
    }
  });

  it("charges materials plus converted valuables, with no gold or valuables", () => {
    let state = makeGame(true);
    const building = coreBuildingDefinitions["dungeon.portal_of_summoning"]!;
    expect(building.cost).toEqual({ gold: 7, buildingMaterials: 3, valuables: 1 });
    expect(effectiveTownBuildingCost(state, building)).toEqual({ buildingMaterials: 4 });

    state.players.p1.resources = { gold: 0, buildingMaterials: 3, valuables: 0 };
    expect(hasBuild(state, building.id)).toBe(false);
    state.players.p1.resources.buildingMaterials = 4;
    expect(hasBuild(state, building.id)).toBe(true);

    const result = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: building.id,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.state.players.p1.resources).toEqual({
      gold: 0,
      buildingMaterials: 0,
      valuables: 0,
    });
    expect(result.events.at(-1)).toMatchObject({
      type: "STRUCTURE_BUILT",
      buildingId: building.id,
      cost: { buildingMaterials: 4 },
    });
  });

  it("uses printed costs when disabled and never changes excluded buildings", () => {
    const off = makeGame(false);
    const side = coreBuildingDefinitions["dungeon.portal_of_summoning"]!;
    off.players.p1.resources = { gold: 0, buildingMaterials: 100, valuables: 100 };
    expect(effectiveTownBuildingCost(off, side)).toBe(side.cost);
    expect(hasBuild(off, side.id)).toBe(false);

    const on = makeGame(true);
    for (const id of [
      "dungeon.city_hall",
      "dungeon.citadel",
      "dungeon.mage_guild",
      "dungeon.dwelling_bronze",
    ]) {
      const building = coreBuildingDefinitions[id]!;
      expect(effectiveTownBuildingCost(on, building), id).toBe(building.cost);
    }
  });
});
