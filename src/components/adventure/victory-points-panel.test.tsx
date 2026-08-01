// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ScenarioObjectivesDock, VictoryPointsDock, VictoryPointsScoringOverlay } from "./victory-points-panel";
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
    // The hero-level rows are tagged with the experience board glyph.
    expect(dialog.querySelectorAll('.vpRowGlyph[src*="experience"]').length, "experience glyphs").toBe(2);
  });

  it("CONTROL: renders nothing when VP mode is OFF", () => {
    const state = vpGame();
    state.adventure!.mapPreset = null;
    const { container } = render(<VictoryPointsDock state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".vpDock")).toBeNull();
  });
});

describe("ScenarioObjectivesDock", () => {
  it("shows a specific marked encounter plus live win and VP-objective progress", () => {
    const state = vpGame();
    state.adventure!.mapPreset = {
      roundLimit: 12,
      customWinConditions: [{ kind: "control-towns", count: 2 }],
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 4,
        objectives: [{ kind: "hero-level", level: 5, vp: 2 }]
      }
    };
    const target = Object.values(state.adventure!.fields).find((field) => field.location === "mine")
      ?? Object.values(state.adventure!.fields)[0]!;
    target.location = "creature_bank";
    target.difficulty = 6;
    target.designerWinCondition = true;

    render(<ScenarioObjectivesDock state={state} viewerPlayerId="p1" />);
    expect(screen.getByText("Defeat Creature Bank")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show scenario objectives" }));
    const dialog = screen.getByRole("dialog", { name: "Scenario objectives" });
    expect(within(dialog).getByText(/level 6 encounter/)).toBeTruthy();
    expect(within(dialog).getByText("control 2 Towns")).toBeTruthy();
    expect(within(dialog).getByText("Reach Hero level 5")).toBeTruthy();
    expect(within(dialog).getAllByText(/Your progress:/).map((node) => node.textContent)).toEqual(
      expect.arrayContaining(["Your progress: 1 / 2", "Your progress: 4 / 5"])
    );
    expect(within(dialog).getByText("+2 VP")).toBeTruthy();
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
    // The "completed" row shows the green-tick status glyph (colour kept — the
    // .status class opts it out of the monochrome invert).
    expect(dialog.querySelector('.vpRowGlyph.status[src*="green_tick"]'), "completed tick glyph").toBeTruthy();
  });

  it("CONTROL: renders nothing without a VP_SCORING event", () => {
    const { container } = render(<VictoryPointsScoringOverlay state={vpGame()} viewerPlayerId="p1" />);
    expect(container.querySelector(".vpScoringOverlay")).toBeNull();
  });
});
