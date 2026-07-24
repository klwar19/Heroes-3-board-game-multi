// @vitest-environment jsdom
/**
 * Setup lobby in SINGLE-PLAYER: the screen says "Playing with computer",
 * computer seats carry a Computer badge, and the Heroes & Draft hub window
 * (plus the Advanced settings → Map & Setup tab) replaces the multiplayer
 * "Players" control with a "Computer opponents" control that dispatches the
 * dedicated SET_COMPUTER_OPPONENTS action (never SET_GAME_OPTIONS.playerCount).
 * A multiplayer lobby is the CONTROL: no badges, the classic Players control.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdventureLobbyState } from "@/engine";
import { SetupLobbyScreen } from "./screen";

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));

afterEach(cleanup);

/** The picks + computer selection live in the Heroes & Draft hub window. */
function openHeroes() {
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
}

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

  it("offers Computer opponents (SET_COMPUTER_OPPONENTS) in the Heroes & Draft window, not the multiplayer Players control", () => {
    const onAction = renderSinglePlayer();
    openHeroes();

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
    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
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

/**
 * The per-opponent faction/hero picker: in single-player Free-pick, each computer
 * seat gets a block that shows its pick (or "Random at start") and dispatches
 * SET_COMPUTER_SEAT_FACTION for a roll, a hand-picked town+hero, or a clear.
 * Hidden in a multiplayer lobby (the CONTROL).
 */
describe("SetupLobbyScreen — single-player computer opponent pickers", () => {
  it("renders one picker per computer seat (Random at start) and dispatches a roll", () => {
    const onAction = renderSinglePlayer();
    openHeroes();
    const section = screen.getByLabelText("Computer opponents setup");
    // Two computer seats (computerOpponents: 2): "Computer 1" (p2), "Computer 2" (p3).
    expect(within(section).getByLabelText("Set up Computer 1")).toBeTruthy();
    expect(within(section).getByLabelText("Set up Computer 2")).toBeTruthy();
    expect(within(section).getAllByText("Random at start")).toHaveLength(2);

    const seatBlock = screen.getByLabelText("Set up Computer 1");
    fireEvent.click(within(seatBlock).getByRole("button", { name: /Roll random now/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: "roll"
    });
  });

  it("expands the faction grid and dispatches a hand-picked town + hero", () => {
    const onAction = renderSinglePlayer();
    openHeroes();
    const seatBlock = screen.getByLabelText("Set up Computer 1");
    // No grid until expanded.
    expect(within(seatBlock).queryByLabelText("Pick a faction and hero")).toBeNull();
    fireEvent.click(within(seatBlock).getByRole("button", { name: /Pick faction/ }));

    const grid = within(seatBlock).getByLabelText("Pick a faction and hero");
    const catherine = within(grid).getByText("Catherine", { selector: ".lobbyHero span" }).closest("button");
    fireEvent.click(catherine as HTMLElement);
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    });
  });

  it("shows a set seat's pick and dispatches clear (Back to auto)", () => {
    const onAction = vi.fn();
    const state = createAdventureLobbyState({
      seed: "sp-clear-ui",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2
    });
    const seat = state.setupLobby!.seats.find((candidate) => candidate.playerId === "p2")!;
    seat.factionId = "castle";
    seat.heroDefId = "catherine";
    state.players.p2.name = "Catherine of Castle";
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    const seatBlock = screen.getByLabelText("Set up Computer 1");
    // Shows the pick, not the auto badge.
    expect(within(seatBlock).queryByText("Random at start")).toBeNull();
    expect(within(seatBlock).getByText("Catherine")).toBeTruthy();

    fireEvent.click(within(seatBlock).getByRole("button", { name: /Back to auto/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: "clear"
    });
  });

  it("CONTROL: a multiplayer lobby renders no computer opponent pickers", () => {
    const onAction = vi.fn();
    const state = createAdventureLobbyState({ seed: "mp-pickers", scenarioId: "skirmish", playerCount: 3 });
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();
    expect(screen.queryByLabelText("Computer opponents setup")).toBeNull();
  });
});
