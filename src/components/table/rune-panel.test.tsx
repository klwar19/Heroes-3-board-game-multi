// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInitialGameState } from "@/engine";
import type { GameState } from "@/engine/state";
import { RunePanel } from "./rune-panel";

/**
 * Bulwark Rune tracker panel (combat right rail). Everything shown comes from
 * the engine's `getRuneTrack`: the nine-cell main track (one token per earned
 * Rune), the reserve pile, and the three Level plaques with their
 * active / pending / locked status against the Sieidi/Altar cap.
 */
describe("RunePanel — Bulwark Rune tracker", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  function bulwarkCombat(buildings: string[], runes: { count: number; reserve: number; appliedLevel: number }): GameState {
    const state = createInitialGameState("rune-panel-ui");
    state.players.p1.factionId = "bulwark";
    state.towns.town_p1.factionId = "bulwark";
    state.towns.town_p1.buildings.push(...buildings);
    state.combat!.runes = { p1: runes };
    return state;
  }

  it("draws the track tokens, the reserve and each level's status", () => {
    // Sieidi built (cap 2), Level 2 already earned, 3 Runes on the fresh track, 10 in reserve.
    const state = bulwarkCombat(["bulwark.sieidi"], { count: 3, reserve: 10, appliedLevel: 2 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);

    expect(screen.getByLabelText(/Runes for .*: track 3 of 9, reserve 10, level 2 of 2/i)).toBeTruthy();
    expect(screen.getByText("+1 Attack")).toBeTruthy();
    expect(screen.getByText("+3 Speed")).toBeTruthy();
    expect(screen.getByText("+1 Defense")).toBeTruthy();

    expect(container.querySelectorAll(".runeCell")).toHaveLength(9);
    expect(container.querySelectorAll(".runeCell.filled")).toHaveLength(3);
    expect(container.querySelector(".runeReserveCount")?.textContent).toBe("10");
    expect(container.querySelector(".runeReserve.stocked")).toBeTruthy();
    expect(container.querySelectorAll(".runeLevelPlaque.active")).toHaveLength(2);
    expect(container.querySelectorAll(".runeLevelPlaque.pending")).toHaveLength(0);
    expect(container.querySelectorAll(".runeLevelPlaque.locked")).toHaveLength(1);
    // Docked by default on desktop: no floating window styling.
    expect(container.querySelector(".runePanel.docked")).toBeTruthy();
  });

  it("marks an unlocked-but-unearned level as pending and an empty reserve as unstocked", () => {
    const state = bulwarkCombat(["bulwark.sieidi"], { count: 4, reserve: 0, appliedLevel: 1 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelectorAll(".runeLevelPlaque.active")).toHaveLength(1);
    expect(container.querySelectorAll(".runeLevelPlaque.pending")).toHaveLength(1);
    expect(container.querySelectorAll(".runeLevelPlaque.locked")).toHaveLength(1);
    expect(container.querySelectorAll(".runeCell.filled")).toHaveLength(4);
    expect(container.querySelector(".runeReserve.stocked")).toBeNull();
    expect(screen.getByText("5 more Runes to Level 2")).toBeTruthy();
  });

  it("minimizes to the one-line readout and expands again", () => {
    const state = bulwarkCombat(["bulwark.sieidi", "bulwark.altar"], { count: 2, reserve: 5, appliedLevel: 1 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".runePanelBody")).toBeTruthy();
    expect(container.querySelector(".runePanelSummary")?.textContent).toBe("2/9 · R5 · Lv 1/3");

    fireEvent.click(screen.getByRole("button", { name: "Minimize the Rune tracker" }));
    expect(container.querySelector(".runePanelBody")).toBeNull();
    expect(container.querySelector(".runePanel.minimized")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand the Rune tracker" }));
    expect(container.querySelector(".runePanelBody")).toBeTruthy();
  });

  it("pops out as a floating window with a drag handle and docks back", () => {
    const state = bulwarkCombat([], { count: 0, reserve: 0, appliedLevel: 0 });
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".runePanelHandle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pop out the Rune tracker" }));
    expect(container.querySelector(".runePanel.floating")).toBeTruthy();
    expect(container.querySelector(".runePanelHandle")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dock the Rune tracker" }));
    expect(container.querySelector(".runePanel.docked")).toBeTruthy();
    expect(container.querySelector(".runePanelHandle")).toBeNull();
  });

  it("on the phone layout it floats and starts minimized so the board stays clear", () => {
    const state = bulwarkCombat(["bulwark.sieidi"], { count: 6, reserve: 0, appliedLevel: 0 });
    const { container } = render(<RunePanel phone state={state} viewerPlayerId="p1" />);
    expect(container.querySelector(".runePanel.floating.phone.minimized")).toBeTruthy();
    expect(container.querySelector(".runePanelBody")).toBeNull();
    // No dock/pop-out toggle on the phone — only the expand control.
    expect(screen.queryByRole("button", { name: /Pop out|Dock/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand the Rune tracker" }));
    expect(container.querySelectorAll(".runeCell.filled")).toHaveLength(6);
  });

  it("renders nothing when no Bulwark player is in the fight", () => {
    const state = createInitialGameState("rune-panel-none");
    state.players.p1.factionId = "castle";
    const { container } = render(<RunePanel state={state} viewerPlayerId="p1" />);
    expect(container.firstChild).toBeNull();
  });
});
