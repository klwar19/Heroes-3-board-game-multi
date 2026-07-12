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

  it("renders mode presets and house-rule toggles on Mode & Rules (BINH default)", () => {
    openOptions();
    expect(screen.getByRole("button", { name: /Legacy/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /^BINH/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^WOG/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tournament/i })).toBeTruthy();

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

  it("Mode & Rules wires Event deck, Morale Cards, and Ban Diplomacy", () => {
    const onAction = openOptions();

    const eventRow = screen.getByText("Event deck").closest(".optionRow");
    expect(eventRow).toBeTruthy();
    fireEvent.click(within(eventRow as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { events: true }
    });

    onAction.mockClear();
    const moraleRow = screen.getByText("Morale Cards").closest(".optionRow");
    fireEvent.click(within(moraleRow as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { moraleCards: true }
    });

    onAction.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Ban Diplomacy/i }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { tournamentBanDiplomacy: true }
    });
  });

  it("Legacy preset turns house rules off without locking them (notice + free toggle)", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Legacy/i }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({
          ruleset: "legacy",
          spellBook: false,
          tournamentMode: false
        })
      })
    );
    expect(screen.getByRole("status").textContent).toMatch(/not locked|Nothing is locked|re-enable/i);

    // House-rule chips stay clickable after the preset (soft Legacy).
    onAction.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Estates nerf/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "estates-nerf": false } }
    });
  });

  it("Tournament preset applies competitive package (rules off, bans, hard, AI neutrals)", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /^Tournament/i }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({
          ruleset: "legacy",
          tournamentMode: true,
          tournamentBanDiplomacy: true,
          tournamentBanHourglass: true,
          tournamentSecondPlayerMorale: true,
          difficulty: "hard",
          pvpNeutralControl: false
        })
      })
    );
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
