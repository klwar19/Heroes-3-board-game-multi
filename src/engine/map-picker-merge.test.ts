import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, type CustomMapTilePlan, type GameAction, type GameState } from "./index";

/**
 * Merged Map picker. "Starting map" (a built-in scenario sheet) and "Map design"
 * (a designed map) used to be two separate lobby controls, so a designed map
 * could stay attached after the scenario was switched out from under it — a
 * designed map is validated against the scenario it was built on, so a stale one
 * pointing at a different scenario is the "strange interaction" the merge kills.
 *
 * The unified picker sends a designed map together with its scenarioId, so a
 * BARE scenario switch (scenarioId alone) now means "use this built-in sheet" and
 * must drop any designed map. These tests assert that observable outcome, with a
 * control proving a designed map sent WITH its scenario is kept.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

// A small designed map that interlocks with skirmish seat 0 (valid on skirmish).
const SKIRMISH_MAP: CustomMapTilePlan[] = [
  { row: 9, col: 4, group: "near", faceDown: true },
  { row: 11, col: 2, group: "far", faceDown: true }
];

describe("merged Map picker drops a stale designed map on a scenario switch", () => {
  it("a bare scenario switch clears a designed map built on the old scenario", () => {
    let state = createAdventureLobbyState({ seed: "merge-clear", scenarioId: "skirmish" });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: SKIRMISH_MAP, customMapName: "Mine" }
    });
    expect(state.setupLobby?.options.customMap).toHaveLength(SKIRMISH_MAP.length);

    // Pick a built-in scenario sheet — the merged picker can send just the
    // scenario id; the now-mismatched designed map must drop on its own.
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { scenarioId: "land-2p" } });
    expect(state.setupLobby?.options.scenarioId).toBe("land-2p");
    expect(state.setupLobby?.options.customMap).toBeNull();
    expect(state.setupLobby?.options.customMapName).toBeNull();
  });

  it("CONTROL: a designed map sent WITH its scenario is kept", () => {
    // The picker's designed-map payload: scenarioId + playerCount + tiles in one
    // action. The map must survive the same-action scenario change.
    let state = createAdventureLobbyState({ seed: "merge-keep", scenarioId: "land-2p" });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "skirmish", playerCount: 2, customMap: SKIRMISH_MAP, customMapName: "Mine" }
    });
    expect(state.setupLobby?.options.scenarioId).toBe("skirmish");
    expect(state.setupLobby?.options.customMap).toHaveLength(SKIRMISH_MAP.length);
    expect(state.setupLobby?.options.customMapName).toBe("Mine");
  });

  it("re-selecting the SAME scenario keeps the designed map (only a real switch drops it)", () => {
    let state = createAdventureLobbyState({ seed: "merge-same", scenarioId: "skirmish" });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: SKIRMISH_MAP, customMapName: "Mine" }
    });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { scenarioId: "skirmish" } });
    expect(state.setupLobby?.options.customMap).toHaveLength(SKIRMISH_MAP.length);
    expect(state.setupLobby?.options.customMapName).toBe("Mine");
  });
});
