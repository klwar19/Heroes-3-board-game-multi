// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { createAdventureLobbyState } from "@/engine";

afterEach(cleanup);

/**
 * The tabbed Game-options panel. These assert the toggles are WIRED — clicking a
 * house-rule chip or an army preset dispatches the exact SET_GAME_OPTIONS action
 * the engine reads — not merely that the label renders. (The engine half is
 * pinned by house-rules.test.ts.)
 */
function openOptions(onAction = vi.fn()) {
  const state = createAdventureLobbyState({ seed: "options-tabs" });
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  fireEvent.click(screen.getByRole("tab", { name: "Game options" }));
  return onAction;
}

describe("Game options — tabbed layout", () => {
  it("shows the four setup tabs", () => {
    openOptions();
    for (const name of [/Mode & Rules/, /Match/, /Map & Setup/, /Army/]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("renders every house-rule toggle on the Mode & Rules tab (default ON in BINH)", () => {
    openOptions();
    // BINH is the default mode, so each toggle shows ON.
    const griffin = screen.getByRole("button", { name: /Griffin buff/ });
    expect(griffin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Split Spell\/Artifact decks by tier/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Estates nerf/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gelu IV Sharpshooter buff/ })).toBeTruthy();
  });

  it("clicking a house-rule toggle dispatches just that rule's flag", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Estates nerf/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "estates-nerf": false } }
    });
  });

  it("the Match tab wires the Morale Cards optional-rule toggle", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("tab", { name: /Match/ }));
    const moraleCardsRow = screen.getByText("Morale Cards").closest(".optionRow");
    expect(moraleCardsRow).toBeTruthy();

    fireEvent.click(within(moraleCardsRow as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { moraleCards: true }
    });
  });

  it("the Army tab offers the three quick presets and a Random roll", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("tab", { name: /Army/ }));

    fireEvent.click(screen.getByRole("button", { name: "Lv 3 Pack" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingUnits: [{ level: 3, side: "pack" }] }
    });

    // Random applies one of the three presets — always a valid non-empty army.
    onAction.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Random/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
    const call = onAction.mock.calls[0][0];
    expect(call.type).toBe("SET_GAME_OPTIONS");
    const units = call.options.startingUnits as { level: number; side: string }[];
    expect(units.length).toBeGreaterThan(0);
    const signature = units
      .map((unit) => `${unit.level}${unit.side}`)
      .sort()
      .join(",");
    expect(["1pack,2pack", "3pack", "4few"]).toContain(signature);
  });
});
