// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AdventureHud, SetupLobbyScreen, TownPanel } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { applyAction, createAdventureGameState, createAdventureLobbyState, getLegalActions } from "@/engine";

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
  it("shows a map location preview and dispatches the exact selected Field", () => {
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
    const locationPicker = within(hireSection).getByLabelText("Choose hire location");
    const locationButtons = within(locationPicker).getAllByRole("button");
    expect(locationButtons.length, "at least one map location").toBeGreaterThan(0);
    expect(
      locationButtons[0].querySelector("img, .hireLocationFallback"),
      "the location is visual, not a generic text box"
    ).toBeTruthy();

    fireEvent.click(locationButtons[0]);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "HIRE_SECONDARY_HERO",
      playerId: "p1",
      fieldId: expect.any(String)
    });
  });

  it("adds a live Secondary Hero movement counter to the adventure HUD after purchase", () => {
    const state = createAdventureGameState({ seed: "ui-secondary-move", rollFirstPlayer: false });
    state.players.p1.resources.gold = 10;
    const hire = getLegalActions(state, "p1").find((legal) => legal.action.type === "HIRE_SECONDARY_HERO");
    expect(hire, "engine offers the purchase").toBeTruthy();

    const hiredState = applyAction(state, hire!.action).state;
    const secondary = Object.values(hiredState.heroes).find(
      (hero) => hero.controllerId === "p1" && hero.kind === "secondary"
    );
    expect(secondary?.movementPoints).toBe(2);

    render(
      <CardZoomProvider>
        <AdventureHud
          legalActions={getLegalActions(hiredState, "p1")}
          onAction={vi.fn()}
          state={hiredState}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );

    const counter = screen.getByLabelText("Secondary Hero movement points: 2");
    expect(counter.querySelector("b")?.textContent).toBe("2");
    expect(counter.textContent).toMatch(/secondary move/i);
  });
});
