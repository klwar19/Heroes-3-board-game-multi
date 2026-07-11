// @vitest-environment jsdom
/**
 * Setup lobby in SINGLE-PLAYER: the screen says "Playing with computer",
 * computer seats carry a Computer badge, and the Map & Setup tab replaces the
 * multiplayer "Players" control with a "Computer opponents" control that
 * dispatches the dedicated SET_COMPUTER_OPPONENTS action (never
 * SET_GAME_OPTIONS.playerCount). A multiplayer lobby is the CONTROL: no
 * badges, the classic Players control.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdventureLobbyState } from "@/engine";
import { SetupLobbyScreen } from "./screen";

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));

afterEach(cleanup);

function renderSinglePlayer(onAction = vi.fn()) {
  const state = createAdventureLobbyState({
    seed: "sp-setup-ui",
    scenarioId: "skirmish",
    sessionMode: "single-player",
    computerOpponents: 2
  });
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  return onAction;
}

describe("SetupLobbyScreen — single-player", () => {
  it("says Playing with computer and badges the computer seats", () => {
    renderSinglePlayer();
    expect(screen.getByText(/Playing with computer/i)).toBeTruthy();
    // Two computer seats, each with a badge; the human seat says You instead.
    expect(screen.getAllByText("Computer", { selector: ".computerSeatBadge" })).toHaveLength(2);
    expect(screen.getByText("You", { selector: ".computerSeatBadge" })).toBeTruthy();
  });

  it("offers Computer opponents (SET_COMPUTER_OPPONENTS), not the multiplayer Players control", () => {
    const onAction = renderSinglePlayer();
    fireEvent.click(screen.getByRole("tab", { name: "Game options" }));
    fireEvent.click(screen.getByRole("tab", { name: "Map & Setup" }));

    expect(screen.queryByText("Players", { selector: ".optionRow small" })).toBeNull();
    const row = screen.getByText("Computer opponents").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /3 computers/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 3 });
  });

  it("CONTROL: a multiplayer lobby keeps the Players control and shows no badges", () => {
    const onAction = vi.fn();
    const state = createAdventureLobbyState({ seed: "mp-setup-ui", scenarioId: "skirmish", playerCount: 2 });
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    expect(screen.queryByText("Computer", { selector: ".computerSeatBadge" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Game options" }));
    fireEvent.click(screen.getByRole("tab", { name: "Map & Setup" }));
    const row = screen.getByText("Players").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "3 players" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 3 }
    });
  });
});
