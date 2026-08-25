// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { createAdventureGameState, createAdventureLobbyState } from "@/engine";
import { AnimeFactionMechanicsOverlay, animeMechanicsIntroKey } from "./anime-faction-mechanics-overlay";

describe("AnimeFactionMechanicsOverlay", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows a readable seven-town table at game start and highlights the viewer's faction", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-ui",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Riki", factionId: "little_busters", heroDefId: "riki_naoe" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /Anime and cultivation faction penalties/i });
    expect(dialog.querySelectorAll('[role="row"]')).toHaveLength(7);
    expect(dialog.textContent).toContain("−5 gold and −1 material each Resource round");
    expect(dialog.querySelector(".animeMechanicsRow.selected")?.textContent).toContain("Little Busters");
    expect(animeMechanicsIntroKey(state, "p1")).toContain("start:");
  });

  it("turns a matching engine note into the faction-art penalty notice", () => {
    const state = createAdventureGameState({
      seed: "anime-penalty-event-ui",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Riki", factionId: "little_busters", heroDefId: "riki_naoe" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    state.eventLog.push({ id: "event_penalty", type: "EVENT_NOTE", playerId: "p1", message: "School Contribution Fund — 5 gold and 1 building material paid." });
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    const dialog = screen.getByRole("dialog", { name: /School Contribution Fund/i });
    expect(dialog.textContent).toContain("5 gold and 1 building material");
    expect(dialog.querySelector<HTMLElement>(".animePenaltyNotice")?.style.backgroundImage).toContain("little-busters-contribution-v2.webp");
  });

  it("opens a separate pick briefing when an anime faction is selected in setup", () => {
    const state = createAdventureLobbyState({ seed: "anime-penalty-pick-ui", rollFirstPlayer: false });
    const seat = state.setupLobby!.seats.find((candidate) => candidate.playerId === "p1")!;
    seat.factionId = "hidden_leaf";
    seat.heroDefId = "naruto";
    render(<AnimeFactionMechanicsOverlay state={state} viewerPlayerId="p1" />);
    expect(screen.getByRole("dialog", { name: /Anime and cultivation faction penalties/i })).toBeTruthy();
    expect(screen.getByText(/Hidden Leaf Village: −1 hand limit each Resource round/i)).toBeTruthy();
    expect(animeMechanicsIntroKey(state, "p1")).toContain("pick:");
  });
});
