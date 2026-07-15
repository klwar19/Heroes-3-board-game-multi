// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { VictoryPointsDock, VictoryPointsScoringOverlay } from "./victory-points-panel";
import { createAdventureGameState, type GameState } from "@/engine";

afterEach(cleanup);

/** A 2-player VP-mode game with base VP confounders zeroed for known totals. */
function vpGame(): GameState {
  const state = createAdventureGameState({
    seed: "vp-panel-ui",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.adventure!.mapPreset = { victoryPoints: { enabled: true, victoryConditionVp: 3 } };
  for (const town of Object.values(state.towns)) {
    town.buildings = [];
  }
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.spellBook = [];
    player.removed = [];
    player.permanents = [];
  }
  for (const hero of Object.values(state.heroes)) {
    if (hero.kind === "main") {
      hero.level = hero.controllerId === "p1" ? 4 : 2;
    }
  }
  return state;
}

describe("VictoryPointsDock (live standings)", () => {
  it("renders the live 'if scored now' standings for every seat", () => {
    render(<VictoryPointsDock state={vpGame()} viewerPlayerId="p1" />);
    const dock = screen.getByLabelText("Victory Points standings");
    // Both seats, with their live totals (hero levels 4 and 2, everything else zeroed).
    expect(within(dock).getByText("Alice")).toBeTruthy();
    expect(within(dock).getByText("4")).toBeTruthy();
    expect(within(dock).getByText("Bob")).toBeTruthy();
    expect(within(dock).getByText("2")).toBeTruthy();
  });

  it("opens the full per-player breakdown on click", () => {
    render(<VictoryPointsDock state={vpGame()} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Show the full Victory Points breakdown/ }));
    const dialog = screen.getByRole("dialog", { name: "Victory Points standings" });
    // Both seat cards carry the hero-level row (levels 4 and 2).
    expect(within(dialog).getAllByText("Hero Experience Levels").length).toBe(2);
    expect(within(dialog).getByText("Victory Points — if scored now")).toBeTruthy();
  });

  it("CONTROL: renders nothing when VP mode is OFF", () => {
    const state = vpGame();
    state.adventure!.mapPreset = null;
    const { container } = render(<VictoryPointsDock state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".vpDock")).toBeNull();
  });
});

describe("VictoryPointsScoringOverlay (game-over breakdown)", () => {
  it("renders the VP_SCORING breakdown with the winner crowned", () => {
    const state = vpGame();
    state.eventLog.push({
      id: "evt_vp",
      type: "VP_SCORING",
      completerPlayerId: "p1",
      reason: "the 10-round limit was reached",
      winnerPlayerId: "p2",
      breakdown: [
        { playerId: "p2", total: 9, rows: [{ label: "Hero Experience Levels", vp: 9 }] },
        { playerId: "p1", total: 4, rows: [{ label: "Completed the victory condition", vp: 3 }, { label: "Hero Experience Levels", vp: 1 }] }
      ]
    });

    render(<VictoryPointsScoringOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: "Victory Points scoring" });
    // The winner (Bob) is named at the top.
    expect(within(dialog).getByText(/Bob wins on Victory Points/)).toBeTruthy();
    expect(within(dialog).getByText(/the 10-round limit was reached/)).toBeTruthy();
    // Both breakdowns with a specific row and totals.
    expect(within(dialog).getByText("Completed the victory condition")).toBeTruthy();
    expect(within(dialog).getByText("9 VP")).toBeTruthy();
    expect(within(dialog).getByText("4 VP")).toBeTruthy();
  });

  it("CONTROL: renders nothing without a VP_SCORING event", () => {
    const { container } = render(<VictoryPointsScoringOverlay state={vpGame()} viewerPlayerId="p1" />);
    expect(container.querySelector(".vpScoringOverlay")).toBeNull();
  });
});
