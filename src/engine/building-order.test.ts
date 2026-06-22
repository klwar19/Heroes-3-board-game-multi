import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { applyAction, createAdventureGameState } from "./index";
import type { GameAction, GameState } from "./state";

// ---------------------------------------------------------------------------
// Dwelling build order: a town's dwellings must be built lowest tier first —
// Bronze before Silver, Silver before Gold. This is enforced two ways and both
// are pinned here:
//   (1) the data — every faction's Silver dwelling lists its Bronze as a
//       prerequisite, every Gold lists its Silver; and
//   (2) the engine — buildStructureAdventure refuses an out-of-order build.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "build-order", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  return (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
    ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : state;
}

/** Re-arm p1's Build token with deep pockets so a follow-up build only gates on order. */
function readyToBuild(state: GameState): void {
  state.players.p1.townTokens.build = true;
  state.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
}

function buildError(state: GameState, buildingId: string): boolean {
  return (
    applyAction(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: "town_p1", buildingId }).errors.length > 0
  );
}

function factionOf(buildingId: string): string {
  return buildingId.slice(0, buildingId.indexOf("."));
}

describe("dwelling build order — data", () => {
  it("every Silver dwelling requires its Bronze, every Gold requires its Silver, Bronze opens the chain", () => {
    const all = Object.values(coreBuildingDefinitions);
    const bronzes = all.filter((building) => building.id.endsWith(".dwelling_bronze"));
    const silvers = all.filter((building) => building.id.endsWith(".dwelling_silver"));
    const golds = all.filter((building) => building.id.endsWith(".dwelling_gold"));

    // All eight core factions ship the full three-tier chain.
    expect(bronzes.length).toBeGreaterThanOrEqual(8);
    expect(silvers.length).toBe(bronzes.length);
    expect(golds.length).toBe(bronzes.length);

    for (const silver of silvers) {
      expect(silver.prerequisites ?? [], silver.id).toContain(`${factionOf(silver.id)}.dwelling_bronze`);
    }
    for (const gold of golds) {
      expect(gold.prerequisites ?? [], gold.id).toContain(`${factionOf(gold.id)}.dwelling_silver`);
    }
    for (const bronze of bronzes) {
      // Bronze is the first buildable dwelling — it must not depend on a higher tier.
      expect(bronze.prerequisites ?? [], bronze.id).not.toContain(`${factionOf(bronze.id)}.dwelling_silver`);
      expect(bronze.prerequisites ?? [], bronze.id).not.toContain(`${factionOf(bronze.id)}.dwelling_gold`);
    }
  });
});

describe("dwelling build order — engine enforcement (Castle town)", () => {
  it("refuses Silver before Bronze and Gold before Silver", () => {
    const state = refreshP1(makeGame());
    readyToBuild(state); // deep pockets + token, so the only gate is the missing dwelling
    expect(buildError(state, "castle.dwelling_silver")).toBe(true);
    expect(buildError(state, "castle.dwelling_gold")).toBe(true);
  });

  it("only lets Gold be built after Bronze and Silver already stand", () => {
    let state = refreshP1(makeGame());
    readyToBuild(state);

    state = apply(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: "town_p1", buildingId: "castle.dwelling_bronze" });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_bronze");

    // Bronze alone is not enough for Gold — Silver is still missing.
    readyToBuild(state);
    expect(buildError(state, "castle.dwelling_gold")).toBe(true);

    state = apply(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: "town_p1", buildingId: "castle.dwelling_silver" });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_silver");

    // With Bronze and Silver up, Gold finally builds.
    readyToBuild(state);
    state = apply(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: "town_p1", buildingId: "castle.dwelling_gold" });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_gold");
  });
});
