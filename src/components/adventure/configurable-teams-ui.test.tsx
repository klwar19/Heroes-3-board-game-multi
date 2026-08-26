// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { applyAction, createAdventureLobbyState, type GameAction, type GameState } from "@/engine";
import { SetupLobbyScreen } from "./screen";

vi.mock("@/lib/shared-maps", () => ({ fetchSharedMaps: vi.fn(async () => []) }));
afterEach(cleanup);

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function show(state: GameState, onAction = vi.fn()) {
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
  return onAction;
}

describe("starting-position team picker", () => {
  it("shows every human and computer seat in co-op and dispatches one complete assignment", () => {
    let state = createAdventureLobbyState({ seed: "teams-ui", scenarioId: "skirmish", playerCount: 3 });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "coop" } });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 3 });
    const onAction = show(state);

    const picker = screen.getByRole("region", { name: "Starting position teams" });
    expect(picker.querySelectorAll(".teamSetupRow")).toHaveLength(6);
    expect(picker.textContent).toContain("S1 ·");
    expect(picker.textContent).toContain("S6 · Computer 3 (Computer)");
    expect(within(screen.getByRole("group", { name: "Team for S1" })).getByRole("button", { name: "Team 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("group", { name: "Team for S4" })).getByRole("button", { name: "Team 2" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(screen.getByRole("group", { name: "Team for S4" })).getByRole("button", { name: "Team 1" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: { p1: 1, p2: 1, p3: 1, p4: 1, p5: 2, p6: 2 } }
    });
  });

  it("is available in single-player, resets to defaults, and stays absent from Clash", () => {
    const solo = createAdventureLobbyState({
      seed: "teams-ui-solo",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2
    });
    solo.setupLobby!.options.teamAssignments = { p1: 1, p2: 1, p3: 2 };
    const onAction = show(solo);
    fireEvent.click(screen.getByRole("button", { name: "Default teams" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { teamAssignments: {} }
    });

    cleanup();
    const clash = createAdventureLobbyState({ seed: "teams-ui-clash", scenarioId: "skirmish" });
    show(clash);
    expect(screen.queryByRole("region", { name: "Starting position teams" })).toBeNull();
  });

  it("replaces the default human-vs-computer banner copy after custom teams are selected", () => {
    const state = createAdventureLobbyState({ seed: "teams-ui-copy", scenarioId: "skirmish" });
    state.setupLobby!.options.gameMode = "coop";
    state.setupLobby!.options.teamAssignments = { p1: 1, p2: 2 };
    show(state);
    expect(screen.getByText(/2 custom teams · players and computers may be allies/i)).toBeTruthy();
    expect(screen.getByText(/selected starting-position teams decide every alliance/i)).toBeTruthy();
  });
});
