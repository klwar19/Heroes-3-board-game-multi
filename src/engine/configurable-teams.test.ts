import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  lobbyTeamAssignments,
  playersAreAllied,
  type GameAction,
  type GameState,
  type PlayerController
} from "./index";
import { eliminatePlayer } from "./adventure";

const FACTIONS = ["castle", "necropolis", "dungeon", "rampart", "inferno", "tower"] as const;

function players(count = 6) {
  return FACTIONS.slice(0, count).map((factionId, index) => ({
    id: `p${index + 1}`,
    name: `Seat ${index + 1}`,
    factionId
  }));
}

function controllers(computers: string[]): Record<string, PlayerController> {
  return Object.fromEntries(
    computers.map((id) => [id, { kind: "computer", difficulty: "standard", policyVersion: 1 }])
  );
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("configurable setup teams", () => {
  it("supports mixed human/computer alliances and makes the chosen teams decide victory", () => {
    const state = createAdventureGameState({
      seed: "mixed-team-victory",
      gameMode: "coop",
      rollFirstPlayer: false,
      players: players(),
      controllers: controllers(["p4", "p5", "p6"]),
      // 1P + 2 AI vs 2P vs 1 AI.
      teamAssignments: { p1: 1, p2: 2, p3: 2, p4: 1, p5: 1, p6: 3 }
    });

    expect(state.gameMode).toBe("coop");
    expect(playersAreAllied(state, "p1", "p4"), "human and AI on Team 1").toBe(true);
    expect(playersAreAllied(state, "p4", "p5"), "both allied AI seats").toBe(true);
    expect(playersAreAllied(state, "p2", "p3"), "the two-human Team 2").toBe(true);
    expect(playersAreAllied(state, "p1", "p2"), "different teams remain enemies").toBe(false);
    expect(playersAreAllied(state, "p1", "p6"), "the lone AI is a third side").toBe(false);

    eliminatePlayer(state, "p2", "conquered", false);
    eliminatePlayer(state, "p3", "conquered", false);
    expect(state.adventure?.winnerPlayerId, "Team 3 is still alive").toBeNull();
    eliminatePlayer(state, "p6", "conquered", false);

    expect(state.phase).toBe("game-over");
    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.players.p4.eliminated, "allied AI co-winner stays alive").toBeFalsy();
    expect(state.players.p5.eliminated, "second allied AI co-winner stays alive").toBeFalsy();
  });

  it("supports one human plus allied AI against an opposing AI team in single-player", () => {
    const state = createAdventureGameState({
      seed: "solo-mixed-teams",
      sessionMode: "single-player",
      rollFirstPlayer: false,
      players: players(),
      controllers: {
        p1: { kind: "human" },
        ...controllers(["p2", "p3", "p4", "p5", "p6"])
      },
      teamAssignments: { p1: 1, p2: 1, p3: 1, p4: 2, p5: 2, p6: 2 }
    });

    expect(state.gameMode, "custom solo teams do not masquerade as co-op mode").toBeUndefined();
    expect(playersAreAllied(state, "p1", "p2")).toBe(true);
    expect(playersAreAllied(state, "p1", "p3")).toBe(true);
    expect(playersAreAllied(state, "p1", "p4")).toBe(false);
    expect(playersAreAllied(state, "p4", "p6")).toBe(true);
  });

  it("keeps legacy defaults when no assignment exists and validates lobby payloads", () => {
    const defaultCoop = createAdventureGameState({
      seed: "team-default-control",
      gameMode: "coop",
      players: players(3),
      controllers: controllers(["p3"])
    });
    expect(playersAreAllied(defaultCoop, "p1", "p2")).toBe(true);
    expect(playersAreAllied(defaultCoop, "p1", "p3")).toBe(false);

    let lobby = createAdventureLobbyState({ seed: "team-lobby", scenarioId: "skirmish" });
    lobby = apply(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "coop" } });
    expect(lobbyTeamAssignments(lobby)).toEqual({ p1: 1, p2: 1 });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: { p1: 1, p2: 2 } }
    });
    expect(lobby.setupLobby?.options.teamAssignments).toEqual({ p1: 1, p2: 2 });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: {} }
    });
    expect(lobby.setupLobby?.options.teamAssignments).toBeUndefined();

    const malformed = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: { p1: 1 } }
    });
    expect(malformed.errors[0]?.message).toMatch(/Every starting position/);
    expect(malformed.state.setupLobby?.options.teamAssignments).toBeUndefined();
  });

  it("carries the lobby matrix through START_ADVENTURE instead of restoring co-op defaults", () => {
    let state = createAdventureLobbyState({ seed: "team-lobby-build", scenarioId: "skirmish" });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "coop" } });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: { p1: 1, p2: 2 } }
    });
    state = apply(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
    state = apply(state, {
      type: "CHOOSE_FACTION",
      playerId: "p2",
      factionId: "rampart",
      heroDefId: "gelu"
    });
    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    expect(state.gameMode).toBe("coop");
    expect(state.playerTeams).toEqual({ p1: "setup-team-1", p2: "setup-team-2" });
    expect(playersAreAllied(state, "p1", "p2"), "the co-op default must not overwrite the pick").toBe(false);
  });

  it("refuses a custom setup with no opposing team", () => {
    expect(() =>
      createAdventureGameState({
        seed: "one-team-refused",
        gameMode: "coop",
        players: players(3),
        controllers: controllers(["p3"]),
        teamAssignments: { p1: 1, p2: 1, p3: 1 }
      })
    ).toThrow(/at least two teams/i);
  });

  it("makes map-authored S1..SN teams authoritative", () => {
    const state = createAdventureGameState({
      seed: "fixed-map-teams",
      gameMode: "coop",
      players: players(4),
      controllers: controllers(["p3", "p4"]),
      teamAssignments: { p1: 1, p2: 2, p3: 1, p4: 2 },
      customMapPreset: { fixedTeams: [1, 1, 2, 2] }
    });
    expect(state.playerTeams).toEqual({
      p1: "setup-team-1",
      p2: "setup-team-1",
      p3: "setup-team-2",
      p4: "setup-team-2"
    });

    const lobby = createAdventureLobbyState({ seed: "fixed-map-team-lobby", scenarioId: "skirmish" });
    lobby.setupLobby!.options.customMapPreset = { fixedTeams: [1, 2] };
    expect(lobbyTeamAssignments(lobby)).toEqual({ p1: 1, p2: 2 });
    const edit = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: { p1: 1, p2: 1 } }
    });
    expect(edit.errors[0]?.message).toMatch(/scenario fixes/i);
  });
});
