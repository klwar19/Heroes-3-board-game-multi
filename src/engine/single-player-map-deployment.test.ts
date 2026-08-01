import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  hexSpaceId,
  scenarioDefinitions,
  singlePlayerMapDeployment,
  type CustomMapTilePlan,
  type GameState
} from "./index";

const starts = scenarioDefinitions.skirmish.layout.starts;

/** Placement order is deliberately different from solo role order. */
const SOLO_TOWNS: CustomMapTilePlan[] = [
  {
    ...starts[0],
    group: "starting",
    faceDown: false,
    singlePlayer: {
      role: "computer",
      bonus: { gold: 3, buildingMaterials: 1, valuables: 0 }
    }
  },
  {
    ...starts[1],
    group: "starting",
    faceDown: false,
    singlePlayer: { role: "human" }
  },
  {
    ...starts[2],
    group: "starting",
    faceDown: false,
    singlePlayer: {
      role: "computer",
      bonus: { gold: 0, buildingMaterials: 0, valuables: 2 }
    }
  },
  { ...starts[3], group: "starting", faceDown: false }
];

const PLAYERS = [
  { id: "p1", name: "You", factionId: "castle" as const },
  { id: "p2", name: "Computer 1", factionId: "necropolis" as const },
  { id: "p3", name: "Computer 2", factionId: "dungeon" as const }
];

function applySoloMap(state: GameState): GameState {
  return applyAction(state, {
    type: "SET_GAME_OPTIONS",
    playerId: "p1",
    options: {
      playerCount: 4,
      customMap: SOLO_TOWNS,
      customMapName: "Role Test",
      customMapPreset: {
        computerStartingBonus: { gold: 2, buildingMaterials: 0, valuables: 1 }
      }
    }
  }).state;
}

describe("map-authored single-player deployment", () => {
  it("requires exactly one human and at least one computer role", () => {
    expect(singlePlayerMapDeployment(SOLO_TOWNS)?.computers).toHaveLength(2);
    expect(
      singlePlayerMapDeployment(
        SOLO_TOWNS.map((plan) => ({ ...plan, singlePlayer: { role: "computer" as const } }))
      )
    ).toBeNull();
    expect(singlePlayerMapDeployment(SOLO_TOWNS, 1)).toBeNull();
    expect(singlePlayerMapDeployment(SOLO_TOWNS.map((plan) => ({ ...plan, singlePlayer: undefined })))).toBeNull();
  });

  it("resizes a solo lobby from the map and resists later manual seat-count changes", () => {
    let state = createAdventureLobbyState({
      seed: "solo-map-lobby",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    state = applySoloMap(state);

    expect(state.setupLobby?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2", "p3"]);
    expect(state.controllers).toEqual({
      p1: { kind: "human" },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
      p3: { kind: "computer", difficulty: "standard", policyVersion: 1 }
    });

    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4 }
    }).state;
    expect(state.setupLobby?.seats).toHaveLength(3);
    const rejected = applyAction(state, {
      type: "SET_COMPUTER_OPPONENTS",
      playerId: "p1",
      count: 3
    });
    expect(rejected.errors).toHaveLength(1);
    expect(rejected.state.setupLobby?.seats).toHaveLength(3);
  });

  it("places the human and AIs at their marked Towns and combines per-map/per-AI bonuses", () => {
    const state = createAdventureGameState({
      seed: "solo-map-build",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: {
        computerStartingBonus: { gold: 2, buildingMaterials: 0, valuables: 1 }
      },
      players: PLAYERS
    });

    expect(state.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[1]));
    expect(state.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[0]));
    expect(state.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[2]));
    expect(state.players.p1.resources).toEqual({ gold: 10, buildingMaterials: 2, valuables: 1 });
    expect(state.players.p2.resources).toEqual({ gold: 15, buildingMaterials: 3, valuables: 2 });
    expect(state.players.p3.resources).toEqual({ gold: 12, buildingMaterials: 2, valuables: 4 });
  });

  it("CONTROL: the identical map keeps multiplayer seat order/count and grants no AI-only bonus", () => {
    let lobby = createAdventureLobbyState({ seed: "same-map-mp", scenarioId: "skirmish", playerCount: 2 });
    lobby = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4, customMap: SOLO_TOWNS, customMapName: "Role Test" }
    }).state;
    expect(lobby.setupLobby?.seats).toHaveLength(4);
    expect(lobby.controllers).toBeUndefined();

    const game = createAdventureGameState({
      seed: "same-map-mp-build",
      scenarioId: "skirmish",
      sessionMode: "multiplayer",
      rollFirstPlayer: false,
      startingBonus: false,
      customMap: SOLO_TOWNS,
      customMapPreset: {
        computerStartingBonus: { gold: 9, buildingMaterials: 9, valuables: 9 }
      },
      // Even an unusual hosted multiplayer snapshot with a computer controller
      // must not activate solo map rules.
      controllers: {
        p1: { kind: "human" },
        p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
        p3: { kind: "human" }
      },
      players: PLAYERS
    });

    expect(game.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[0]));
    expect(game.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[1]));
    expect(game.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[2]));
    expect(game.players.p2.resources).toEqual({ gold: 10, buildingMaterials: 2, valuables: 1 });
  });
});
