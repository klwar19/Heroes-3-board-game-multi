// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { createAdventureLobbyState, type GameState } from "@/engine";

afterEach(cleanup);

/**
 * The tabbed Game-options panel. These assert the toggles are WIRED — clicking a
 * house-rule chip or an army preset dispatches the exact SET_GAME_OPTIONS action
 * the engine reads — not merely that the label renders. (The engine half is
 * pinned by house-rules.test.ts.)
 */
function openOptions(onAction = vi.fn(), optionOverrides: { creatureBanks?: boolean } = {}) {
  const state = createAdventureLobbyState({ seed: "options-tabs" });
  Object.assign(state.setupLobby!.options, optionOverrides);
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  fireEvent.click(screen.getByRole("tab", { name: "Game options" }));
  return onAction;
}

/** Open the options with a chance to mutate the seeded lobby state first. */
function openOptionsWith(mutate: (state: GameState) => void, onAction = vi.fn()) {
  const state = createAdventureLobbyState({ seed: "options-tabs-vp" });
  mutate(state);
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

  it("renders mode presets, Mod (WOG), and house-rule toggles on Mode & Rules (BINH default)", () => {
    openOptions();
    expect(screen.getByRole("button", { name: /Legacy/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /^BINH/i }).getAttribute("aria-pressed")).toBe("true");
    // WOG is a Mod line, not a game-mode card.
    expect(screen.queryByRole("button", { name: /^WOG$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Enable Wake of Gods mod|Disable Wake of Gods mod/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Tournament/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Obelisk die rewards/i })).toBeTruthy();

    const griffin = screen.getByRole("button", { name: /Griffin buff/ });
    expect(griffin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Split Spell\/Artifact decks by tier/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Estates nerf/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gelu IV Sharpshooter buff/ })).toBeTruthy();
    expect(screen.getAllByText(/Polish house rules/i).length).toBeGreaterThan(0);
    expect(document.querySelector(".polishRuleCrest")?.getAttribute("src")).toContain(
      "polish-house-rules-flag.webp",
    );
    const bankSizes = screen.getByRole("button", { name: /Rolled Creature Bank sizes/ });
    expect(bankSizes.getAttribute("aria-pressed")).toBe("false");
    expect((bankSizes as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Polish Spell Book/ })).toBeTruthy();
  });

  it("toggling WOG on the Mod line dispatches SET_GAME_OPTIONS with wog.enabled", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Enable Wake of Gods mod/i }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({
          wog: expect.objectContaining({ enabled: true })
        })
      })
    );
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

  it("wires the opt-in Polish bank-size variant through the shared registry UI", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Rolled Creature Bank sizes/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "polish-bank-sizes": true } }
    });
  });

  it("selecting Polish Spell Book switches the standard Spell Book off", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Polish Spell Book/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "polish-spell-book": true }, spellBook: false }
    });
  });

  it("greys out Polish bank sizes while the base Creature Banks option is off", () => {
    openOptions(vi.fn(), { creatureBanks: false });
    const toggle = screen.getByRole("button", { name: /Rolled Creature Bank sizes/ }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.textContent).toContain("BANKS OFF");
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

/**
 * The lobby Victory-Points toggle (Mode & Rules tab, directly below Game mode,
 * default Off). These assert the row is WIRED — clicking On / picking a round
 * limit dispatches the exact SET_GAME_OPTIONS the engine reads — and that a
 * designed preset which already enables VP is surfaced as authoritative. (The
 * engine half is pinned by victory-points.test.ts.)
 */
describe("Game options — Victory points", () => {
  it("renders the Victory points row DIRECTLY BELOW the Game mode row, default Off", () => {
    openOptions();
    const gameMode = screen.getByText("Game mode");
    const victoryPoints = screen.getByText("Victory points");
    // DOM order: the Victory points label follows the Game mode label.
    expect(gameMode.compareDocumentPosition(victoryPoints) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const row = victoryPoints.closest(".optionRow") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(row).getByRole("button", { name: "On" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking On dispatches victoryPoints: true", () => {
    const onAction = openOptions();
    const row = screen.getByText("Victory points").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { victoryPoints: true }
    });
  });

  it("the round-limit select appears only when ON and dispatches the chosen number", () => {
    // Default (Off): no round-limit select.
    openOptions();
    expect(screen.queryByLabelText("Victory points round limit")).toBeNull();
    cleanup();

    // With the toggle ON in state, the select shows and dispatches the number.
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.victoryPoints = true;
    });
    const select = screen.getByLabelText("Victory points round limit");
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: "20" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { victoryPointsRoundLimit: 20 }
    });
  });

  it("shows the preset-authoritative note when the selected map preset already enables VP", () => {
    openOptionsWith((state) => {
      state.setupLobby!.options.customMapPreset = { victoryPoints: { enabled: true } };
    });
    const row = screen.getByText("Victory points").closest(".optionRow") as HTMLElement;
    expect(row.textContent).toMatch(/designed map already enables Victory Points/i);
  });
});
