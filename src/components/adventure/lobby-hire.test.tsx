// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen, TownPanel } from "./screen";
import { createAdventureGameState, createAdventureLobbyState, getLegalActions } from "@/engine";

afterEach(cleanup);

describe("SetupLobbyScreen — portrait-less heroes are still selectable", () => {
  it("renders Moandor and Zydar with names and enabled, clickable buttons", () => {
    const state = createAdventureLobbyState({ seed: "ui-lobby" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));

    // Moandor (Necropolis) and Zydar (Inferno) have no portrait asset; they must
    // still show their name and be selectable, exactly like the other heroes.
    for (const name of ["Moandor", "Zydar", "Sandro", "Tamika"]) {
      const button = screen.getByRole("button", { name: new RegExp(name) });
      expect(button, name).toBeTruthy();
      expect((button as HTMLButtonElement).disabled, `${name} disabled`).toBe(false);
    }

    fireEvent.click(screen.getByRole("button", { name: /Moandor/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "necropolis",
      heroDefId: "moandor"
    });
  });
});

describe("TownPanel — hiring a Secondary Hero with exactly 10 gold", () => {
  it("shows the hire section and dispatches HIRE_SECONDARY_HERO on click", () => {
    const state = createAdventureGameState({ seed: "ui-town", rollFirstPlayer: false });
    state.players.p1.resources.gold = 10; // exactly the 10-gold cost
    const legalActions = getLegalActions(state, "p1");
    expect(
      legalActions.some((legal) => legal.action.type === "HIRE_SECONDARY_HERO"),
      "engine should offer the hire with 10 gold"
    ).toBe(true);

    const onAction = vi.fn();
    render(<TownPanel legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);

    const hireSection = screen.getByLabelText("Hire a Secondary Hero");
    const hireButtons = within(hireSection).getAllByRole("button");
    expect(hireButtons.length, "at least one hire button").toBeGreaterThan(0);

    fireEvent.click(hireButtons[0]);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "HIRE_SECONDARY_HERO", playerId: "p1" });
  });
});
