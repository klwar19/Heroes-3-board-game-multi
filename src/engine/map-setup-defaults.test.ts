import { describe, expect, it } from "vitest";
import { applyAction } from "./reducer";
import { createAdventureGameState, createAdventureLobbyState } from "./adventure-setup";
import { unlockedRecruitTiers } from "./adventure";
import type { GameAction, GameState } from "./state";
import { DEFAULT_SETUP_STARTING_BUILDINGS } from "@/data/map/scenarios";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";

/**
 * Map-setup default pre-built buildings. A fresh setup lobby opens with the
 * three universal core town cards — Citadel, Mage Guild and Bronze Dwelling —
 * already standing, and any seat may toggle each off before the adventure
 * starts. These tests assert the OBSERVABLE outcome (the buildings stand in the
 * started town and Bronze Dwelling actually unlocks bronze recruiting), not just
 * the option array, with a control proving it is a toggleable default rather
 * than something town creation hardcodes.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Seat p1 Castle + p2 Necropolis and start the adventure. */
function startDefaultGame(state: GameState): GameState {
  let next = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
  next = apply(next, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "necropolis", heroDefId: "sandro" });
  return apply(next, { type: "START_ADVENTURE", playerId: "p1" });
}

describe("map-setup default pre-built buildings", () => {
  it("defaults a fresh lobby to Citadel, Mage Guild and Bronze Dwelling", () => {
    const state = createAdventureLobbyState({ seed: "default-buildings" });
    expect(state.setupLobby?.options.startingBuildings).toEqual(DEFAULT_SETUP_STARTING_BUILDINGS);
    expect(DEFAULT_SETUP_STARTING_BUILDINGS).toEqual(["citadel", "mage_guild", "dwelling_bronze"]);
  });

  it("stands those three buildings in every started town, faction-prefixed", () => {
    const started = startDefaultGame(createAdventureLobbyState({ seed: "default-buildings-start" }));

    expect(started.phase).toBe("player-turn");
    for (const id of ["castle.citadel", "castle.mage_guild", "castle.dwelling_bronze"]) {
      expect(started.towns.town_p1.buildings).toContain(id);
    }
    for (const id of ["necropolis.citadel", "necropolis.mage_guild", "necropolis.dwelling_bronze"]) {
      expect(started.towns.town_p2.buildings).toContain(id);
    }

    // Effect-level: the default Bronze Dwelling actually unlocks bronze
    // recruiting (the building runs, it is not inert display text).
    expect(unlockedRecruitTiers(started, "p1").has("bronze")).toBe(true);
  });

  it("CONTROL: clearing the picker removes them — proving it is a toggleable default, not hardcoded", () => {
    let state = createAdventureLobbyState({ seed: "default-buildings-off" });
    // Toggle every pre-built building off, exactly as the Game options picker does.
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { startingBuildings: [] } });
    expect(state.setupLobby?.options.startingBuildings).toEqual([]);

    const started = startDefaultGame(state);
    for (const id of ["castle.citadel", "castle.mage_guild", "castle.dwelling_bronze"]) {
      expect(started.towns.town_p1.buildings).not.toContain(id);
    }
    // With no Bronze Dwelling, bronze recruiting is NOT unlocked at the town.
    expect(unlockedRecruitTiers(started, "p1").has("bronze")).toBe(false);
  });

  it("every faction board carries all three default buildings, so none is silently dropped", () => {
    for (const factionId of Object.keys(coreFactionDefinitions)) {
      for (const buildingId of DEFAULT_SETUP_STARTING_BUILDINGS) {
        expect(
          coreBuildingDefinitions[`${factionId}.${buildingId}`],
          `${factionId} is missing ${buildingId}`
        ).toBeDefined();
      }
    }
  });

  it("direct createAdventureGameState also stands the default buildings (Diplomacy recruit works)", () => {
    // Without this, a direct build (tests / quick starts) left towns empty and
    // Diplomacy's basic Map recruit was never offered — a silent "does nothing".
    const state = createAdventureGameState({ seed: "default-buildings-direct", difficulty: "normal" });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_bronze");
    expect(unlockedRecruitTiers(state, "p1").has("bronze")).toBe(true);
  });
});
