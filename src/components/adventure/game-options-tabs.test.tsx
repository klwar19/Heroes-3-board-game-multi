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

/** House-rule checklists default to minimized — expand before querying toggles. */
function expandBinhHouseRules() {
  fireEvent.click(screen.getByRole("button", { name: /BINH house rules/i }));
}

function expandPolishHouseRules() {
  fireEvent.click(screen.getByRole("button", { name: /Polish house rule type 1/i }));
}

function expandTournamentRules() {
  fireEvent.click(screen.getByRole("button", { name: /Tournament rules/i }));
}

describe("Game options — tabbed layout", () => {
  it("shows the four setup tabs", () => {
    openOptions();
    for (const name of [/Mode & Rules/, /Match/, /Map & Setup/, /Army/]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("renders mode presets, Mod (WOG), and collapsible house-rule panels on Mode & Rules (BINH default)", () => {
    openOptions();
    const modeGrid = screen.getByRole("group", { name: /Game mode presets/i });
    expect(within(modeGrid).getByRole("button", { name: /Legacy/i }).getAttribute("aria-pressed")).toBe("false");
    expect(within(modeGrid).getByRole("button", { name: /BINH/i }).getAttribute("aria-pressed")).toBe("true");
    // WOG is a Mod line, not a game-mode card.
    expect(screen.queryByRole("button", { name: /^WOG$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Enable Wake of Gods mod|Disable Wake of Gods mod/i })).toBeTruthy();
    expect(within(modeGrid).getByRole("button", { name: /Tournament/i })).toBeTruthy();

    // Mode crest icons (BINH griffin + Tournament competitive crest).
    expect(document.querySelector(".modePresetCard.mode-binh .modePresetIcon")?.getAttribute("src")).toContain(
      "mode-binh-crest-clear",
    );
    expect(document.querySelector(".modePresetCard.mode-tournament .modePresetIcon")?.getAttribute("src")).toContain(
      "mode-tournament-crest-clear",
    );
    expect(document.querySelector(".wogCrestIcon")?.getAttribute("src")).toMatch(/mod-wog-eye-clear|mod-wog-eye/);

    // House-rule checklists are minimized by default (toggles not in the DOM yet).
    const binhPanel = screen.getByRole("button", { name: /BINH house rules/i });
    const polishPanel = screen.getByRole("button", { name: /Polish house rule type 1/i });
    expect(binhPanel.getAttribute("aria-expanded")).toBe("false");
    expect(polishPanel.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /Griffin buff/ })).toBeNull();
    expect(document.querySelector(".houseRuleCollapsibleCrest.polish")?.getAttribute("src")).toContain(
      "polish-house-rules-flag.webp",
    );

    expandBinhHouseRules();
    expect(binhPanel.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Obelisk die rewards/i })).toBeTruthy();
    const griffin = screen.getByRole("button", { name: /Griffin buff/ });
    expect(griffin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Split Spell\/Artifact decks by tier/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Estates nerf/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gelu IV Sharpshooter buff/ })).toBeTruthy();

    expandPolishHouseRules();
    expect(polishPanel.getAttribute("aria-expanded")).toBe("true");
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

  it("the WOG mod window lists an Artifacts module row and toggling it dispatches wog.artifacts", () => {
    const onAction = openOptionsWith((state) => {
      // WOG must be ON for the mod-options window (and its module rows) to render.
      state.setupLobby!.options.wog = {
        ...state.setupLobby!.options.wog!,
        enabled: true,
        artifacts: false
      };
    });
    // Open the WOG mod-options window (only shown while WOG is enabled).
    fireEvent.click(screen.getByRole("button", { name: /Mod options/i }));
    const dialog = screen.getByRole("dialog", { name: /Wake of Gods mod options/i });
    // The New-adventure-objects row's description also mentions "Artifacts",
    // so anchor on this row's unique card list instead of the bare word.
    const artifactsRow = within(dialog).getByRole("button", { name: /Shuffles 5 Wake of Gods hero Artifact cards/i });
    expect(artifactsRow).toBeTruthy();
    expect(artifactsRow.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(artifactsRow);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({
          wog: expect.objectContaining({ enabled: true, artifacts: true })
        })
      })
    );
  });

  it("renders the Anime mod crest row alongside the WOG row (both Mod lines)", () => {
    openOptions();
    // Both crest rows exist and are independent Mod lines (not game-mode cards).
    expect(screen.getByRole("button", { name: /Enable Wake of Gods mod|Disable Wake of Gods mod/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enable Anime mod|Disable Anime mod/i })).toBeTruthy();
    // The Anime crest icon points at the generated crest art (with the fallback).
    const animeCrest = document.querySelector(".animeCrestButton .wogCrestIcon");
    expect(animeCrest?.getAttribute("src")).toMatch(/mod-anime-crest-clear|mod-anime-crest/);
  });

  it("toggling the Anime mod dispatches SET_GAME_OPTIONS with anime.enabled", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("button", { name: /Enable Anime mod/i }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({
          anime: expect.objectContaining({ enabled: true })
        })
      })
    );
  });

  it("the Anime mod window ticks each shipped module — dispatching that flag", () => {
    const onAction = openOptionsWith((state) => {
      // Anime must be ON for the mod-options window (and its rows) to render.
      state.setupLobby!.options.anime = {
        ...state.setupLobby!.options.anime!,
        enabled: true
      };
    });
    // Open the Anime mod-options window (only shown while the mod is enabled).
    // Two "Mod options" buttons exist (WOG + Anime) once both are visible; here
    // only Anime is ON, so its button is the one shown.
    fireEvent.click(screen.getByRole("button", { name: /Mod options/i }));
    const dialog = screen.getByRole("dialog", { name: /Anime mod options/i });

    // Each shipped module has a tick button that dispatches only its own flag.
    const modules: Array<[string, string]> = [
      ["anime-module-isekaiTowns", "isekaiTowns"],
      ["anime-module-xianxiaTowns", "xianxiaTowns"],
      ["anime-module-mapObjects", "mapObjects"],
      ["anime-module-combatEvents", "combatEvents"],
      ["anime-module-xianxiaArtifacts", "xianxiaArtifacts"],
      ["anime-module-cultivation", "cultivation"],
      ["anime-module-heroGrades", "heroGrades"],
      ["anime-module-equipment", "equipment"],
      ["anime-module-unitStacks", "unitStacks"],
      ["anime-module-unitExperience", "unitExperience"]
    ];
    for (const [testid, flag] of modules) {
      onAction.mockClear();
      const row = within(dialog).getByTestId(testid);
      fireEvent.click(row);
      const call = onAction.mock.calls.at(-1)?.[0];
      expect(call).toMatchObject({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { anime: expect.objectContaining({ enabled: true }) }
      });
      // The clicked flag was flipped in the dispatched payload.
      expect(call.options.anime).toHaveProperty(flag);
    }

    // Dead / unshipped flags are NOT surfaced as tick buttons.
    expect(within(dialog).queryByTestId("anime-module-destiny")).toBeNull();
  });

  it("the Legacy preset forces BOTH the WOG and Anime mods off", () => {
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.wog = { ...state.setupLobby!.options.wog!, enabled: true };
      state.setupLobby!.options.anime = { ...state.setupLobby!.options.anime!, enabled: true };
    });
    const modeGrid = screen.getByRole("group", { name: /Game mode presets/i });
    fireEvent.click(within(modeGrid).getByRole("button", { name: /Legacy/i }));
    const call = onAction.mock.calls.at(-1)?.[0];
    expect(call).toMatchObject({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        ruleset: "legacy",
        wog: expect.objectContaining({ enabled: false }),
        anime: expect.objectContaining({ enabled: false })
      }
    });
  });

  it("clicking a house-rule toggle dispatches just that rule's flag", () => {
    const onAction = openOptions();
    expandBinhHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Estates nerf/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "estates-nerf": false } }
    });
  });

  it("wires the opt-in Polish bank-size variant through the shared registry UI", () => {
    const onAction = openOptions();
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Rolled Creature Bank sizes/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "polish-bank-sizes": true } }
    });
  });

  it("selecting Polish Spell Book switches the standard Spell Book off", () => {
    const onAction = openOptions();
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Polish Spell Book/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "polish-spell-book": true }, spellBook: false }
    });
  });

  it("greys out Polish bank sizes while the base Creature Banks option is off", () => {
    openOptions(vi.fn(), { creatureBanks: false });
    expandPolishHouseRules();
    const toggle = screen.getByRole("button", { name: /Rolled Creature Bank sizes/ }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.textContent).toContain("BANKS OFF");
  });

  it("Enable-all turns the whole Polish group on in one dispatch (Spell Book side effect included)", () => {
    const onAction = openOptions();
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: "Enable all Polish rules" }));
    const call = onAction.mock.calls.at(-1)?.[0] as {
      type: string;
      options: { houseRules: Record<string, boolean>; spellBook?: boolean };
    };
    expect(call.type).toBe("SET_GAME_OPTIONS");
    // Every dependency-free Polish rule flips on in a single action.
    expect(call.options.houseRules["polish-reduced-starting-bonus"]).toBe(true);
    expect(call.options.houseRules["polish-wait"]).toBe(true);
    expect(call.options.houseRules["polish-spell-book"]).toBe(true);
    // Turning on Polish Spell Book also forces the stash Spell Book off.
    expect(call.options.spellBook).toBe(false);
  });

  it("selecting ANY Polish rule auto-selects Divided Artifact decks (split-decks) in the same dispatch", () => {
    // Seed split-decks OFF (BINH defaults it on) so the auto-companion is observable.
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.houseRules = {
        ...state.setupLobby!.options.houseRules,
        "split-decks": false
      };
    });
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Wait \(combat\)/i }));
    expect(onAction).toHaveBeenLastCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "split-decks": true, "polish-wait": true } }
    });

    // CONTROL A: with split-decks already ON, only the rule itself dispatches.
    cleanup();
    const onDefault = openOptions();
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Wait \(combat\)/i }));
    expect(onDefault).toHaveBeenLastCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "polish-wait": true } }
    });

    // CONTROL B: turning a Polish rule OFF never touches split-decks.
    cleanup();
    const onOff = openOptionsWith((state) => {
      state.setupLobby!.options.houseRules = {
        ...state.setupLobby!.options.houseRules,
        "split-decks": false,
        "polish-wait": true
      };
    });
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Wait \(combat\)/i }));
    expect(onOff).toHaveBeenLastCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "polish-wait": false } }
    });
  });

  it("Enable-all Polish also auto-selects split-decks AND enables Random Artifacts (blocked only by it)", () => {
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.houseRules = {
        ...state.setupLobby!.options.houseRules,
        "split-decks": false
      };
    });
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: "Enable all Polish rules" }));
    const hr = (onAction.mock.calls.at(-1)?.[0] as { options: { houseRules: Record<string, boolean> } })
      .options.houseRules;
    // The companion lands in the SAME dispatch…
    expect(hr["split-decks"]).toBe(true);
    // …and Random Artifacts (which depends on it) is no longer skipped.
    expect(hr["polish-random-artifacts"]).toBe(true);
  });

  it("Enable-all skips a dependency-blocked rule (Rolled Bank Sizes without Creature Banks)", () => {
    const onAction = openOptions(vi.fn(), { creatureBanks: false });
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: "Enable all Polish rules" }));
    const hr = (onAction.mock.calls.at(-1)?.[0] as { options: { houseRules: Record<string, boolean> } })
      .options.houseRules;
    // Blocked (banks off) → not enabled; a free rule alongside it still turns on.
    expect(hr["polish-bank-sizes"]).toBeUndefined();
    expect(hr["polish-reduced-starting-bonus"]).toBe(true);
  });

  it("with the whole Polish group already on, the group button disables it in one dispatch", () => {
    const polishOn: Record<string, boolean> = {
      "split-decks": true,
      "polish-spell-book": true,
      "polish-bank-sizes": true,
      "polish-unit-stacks": true,
      "polish-reduced-starting-bonus": true,
      "polish-rule-111": true,
      "polish-reduced-surrender": true,
      "polish-random-artifacts": true,
      "polish-pandora-search": true,
      "polish-wait": true
    };
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.houseRules = {
        ...state.setupLobby!.options.houseRules,
        ...polishOn
      };
    });
    expandPolishHouseRules();
    fireEvent.click(screen.getByRole("button", { name: "Disable all Polish rules" }));
    const hr = (onAction.mock.calls.at(-1)?.[0] as { options: { houseRules: Record<string, boolean> } })
      .options.houseRules;
    expect(hr["polish-reduced-starting-bonus"]).toBe(false);
    expect(hr["polish-wait"]).toBe(false);
  });

  it("Map & Setup exposes the Blind Ⅱ–Ⅲ tile choice toggle, default OFF, wired to farTileBlindChoice", () => {
    const onAction = openOptions();
    fireEvent.click(screen.getByRole("tab", { name: /Map & Setup/ }));
    const row = screen.getByText("Blind Ⅱ–Ⅲ tile choice").closest(".optionRow");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { farTileBlindChoice: true }
    });

    // CONTROL: with Ⅱ–Ⅲ tile opening OFF, the blind-choice row is hidden.
    cleanup();
    openOptionsWith((state) => {
      state.setupLobby!.options.farTileOpening = false;
    });
    fireEvent.click(screen.getByRole("tab", { name: /Map & Setup/ }));
    expect(screen.queryByText("Blind Ⅱ–Ⅲ tile choice")).toBeNull();
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
    expandTournamentRules();
    fireEvent.click(screen.getByRole("button", { name: /Ban Diplomacy/i }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { tournamentBanDiplomacy: true }
    });
  });

  it("exposes the OPTIONAL Undo-moves (testing) toggle, default OFF, wired to undoMoves", () => {
    const onAction = openOptions();
    const undoRow = screen.getByText("Undo moves (testing)").closest(".optionRow");
    expect(undoRow).toBeTruthy();
    // Default OFF: the Off button is pressed, On is not.
    expect(
      within(undoRow as HTMLElement).getByRole("button", { name: "Off" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      within(undoRow as HTMLElement).getByRole("button", { name: "On" }).getAttribute("aria-pressed")
    ).toBe("false");
    fireEvent.click(within(undoRow as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { undoMoves: true }
    });
  });

  it("exposes the OPTIONAL Manual-guard-control toggle, default OFF, wired to manualGuardControl", () => {
    const onAction = openOptions();
    const row = screen.getByText("Manual guard control").closest(".optionRow");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(within(row as HTMLElement).getByRole("button", { name: "On" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { manualGuardControl: true }
    });
  });

  it("exposes the OPTIONAL Unit-experience toggle, default OFF, wired to unitExperience", () => {
    const onAction = openOptions();
    const row = screen.getByText("Unit experience").closest(".optionRow");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(within(row as HTMLElement).getByRole("button", { name: "On" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "On" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { unitExperience: true }
    });
  });

  it("the WOG mod window lists a Unit-experience module row and toggling it dispatches wog.unitExperience", () => {
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.wog = {
        ...state.setupLobby!.options.wog!,
        enabled: true
      };
    });
    fireEvent.click(screen.getByRole("button", { name: /Mod options/i }));
    const dialog = screen.getByRole("dialog", { name: /Wake of Gods mod options/i });
    const row = within(dialog).getByRole("button", { name: /WoG Unit Experience System/i });
    expect(row.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(row);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({
          wog: expect.objectContaining({ enabled: true, unitExperience: true })
        })
      })
    );
  });

  it("Legacy preset turns house rules off without locking them (notice + free toggle)", () => {
    const onAction = openOptions();
    fireEvent.click(within(screen.getByRole("group", { name: /Game mode presets/i })).getByRole("button", { name: /Legacy/i }));
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
    expandBinhHouseRules();
    fireEvent.click(screen.getByRole("button", { name: /Estates nerf/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { houseRules: { "estates-nerf": false } }
    });
  });

  it("Tournament preset applies competitive package (rules off, bans, hard, human Neutrals)", () => {
    const onAction = openOptions();
    fireEvent.click(
      within(screen.getByRole("group", { name: /Game mode presets/i })).getByRole("button", { name: /Tournament/i })
    );
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
          pvpNeutralControl: true
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
 * The Field Overrides row + placement chips (Map & Setup tab). A map-objects
 * content module (WOG New Objects / Anime Map objects) REQUIRES the global
 * Field Override mechanism, so while such a module is active the row renders
 * locked-ON. The three placement chips dispatch the exact
 * SET_GAME_OPTIONS.fieldOverridePlacement the engine reads. (The engine force
 * seam is pinned by field-override-map-objects-force.test.ts.)
 */
describe("Game options — Field Overrides row + placement", () => {
  function foRow(): HTMLElement {
    fireEvent.click(screen.getByRole("tab", { name: /Map & Setup/ }));
    return screen.getByTestId("option-field-overrides");
  }

  it("renders the placement chips when FO is on and dispatches the chosen mode", () => {
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.fieldOverrides = true;
    });
    const row = foRow();
    const chips = within(row).getByTestId("option-field-override-placement");
    fireEvent.click(within(chips).getByRole("button", { name: "Manual" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { fieldOverridePlacement: "manual" }
    });
    onAction.mockClear();
    fireEvent.click(within(chips).getByRole("button", { name: "Auto" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { fieldOverridePlacement: "random" }
    });
  });

  it("no placement chips render while FO is off (default)", () => {
    openOptions();
    const row = foRow();
    expect(within(row).queryByTestId("option-field-override-placement")).toBeNull();
  });

  it("locks the row ON (both buttons disabled) while WOG New Objects is active", () => {
    openOptionsWith((state) => {
      state.setupLobby!.options.wog = {
        ...state.setupLobby!.options.wog!,
        enabled: true,
        newObjects: true
      };
      // Deliberately leave fieldOverrides unset — the row must still read ON.
      state.setupLobby!.options.fieldOverrides = undefined;
    });
    const row = foRow();
    const onBtn = within(row).getByRole("button", { name: "On" }) as HTMLButtonElement;
    const offBtn = within(row).getByRole("button", { name: "Off" }) as HTMLButtonElement;
    expect(onBtn.getAttribute("aria-pressed")).toBe("true");
    expect(onBtn.disabled).toBe(true);
    expect(offBtn.disabled).toBe(true);
    // The locked hint is visible, and the placement chips still render.
    expect(row.textContent).toMatch(/map objects are selected/i);
    expect(within(row).getByTestId("option-field-override-placement")).toBeTruthy();
  });

  it("locks the row ON while the Anime Map-objects module is active (absent mapObjects === on)", () => {
    openOptionsWith((state) => {
      state.setupLobby!.options.anime = {
        ...state.setupLobby!.options.anime!,
        enabled: true,
        mapObjects: true
      };
      state.setupLobby!.options.fieldOverrides = false;
    });
    const row = foRow();
    const onBtn = within(row).getByRole("button", { name: "On" }) as HTMLButtonElement;
    expect(onBtn.getAttribute("aria-pressed")).toBe("true");
    expect(onBtn.disabled).toBe(true);
  });

  it("CONTROL: the row is a normal free toggle when no map-objects module is active", () => {
    const onAction = openOptions();
    const row = foRow();
    const onBtn = within(row).getByRole("button", { name: "On" }) as HTMLButtonElement;
    const offBtn = within(row).getByRole("button", { name: "Off" }) as HTMLButtonElement;
    // Default OFF, both buttons enabled (free), clicking On dispatches it.
    expect(offBtn.getAttribute("aria-pressed")).toBe("true");
    expect(onBtn.disabled).toBe(false);
    fireEvent.click(onBtn);
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { fieldOverrides: true }
    });
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
  it("renders Victory points inside the Optional systems cluster, default Off", () => {
    openOptions();
    const cluster = screen.getByLabelText(/Optional scoring, decks/i);
    const victoryPoints = within(cluster).getByText("Victory points");
    // Cluster also holds Event / Morale / Spell Book / Undo together.
    expect(within(cluster).getByText("Event deck")).toBeTruthy();
    expect(within(cluster).getByText("Morale Cards")).toBeTruthy();
    expect(within(cluster).getByText("Spell Book")).toBeTruthy();
    expect(within(cluster).getByText("Undo moves (testing)")).toBeTruthy();

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

  it("the round-limit buttons appear only when ON and dispatch the chosen number", () => {
    // Default (Off): no round-limit buttons.
    openOptions();
    expect(screen.queryByRole("group", { name: "Victory points round limit" })).toBeNull();
    cleanup();

    // With the toggle ON in state, the button group shows and dispatches the number.
    const onAction = openOptionsWith((state) => {
      state.setupLobby!.options.victoryPoints = true;
    });
    const group = screen.getByRole("group", { name: "Victory points round limit" });
    expect(group).toBeTruthy();
    // Offers 5..25 in fives (plus "No limit").
    for (const label of ["No limit", "5", "10", "15", "20", "25"]) {
      expect(within(group).getByRole("button", { name: label })).toBeTruthy();
    }
    fireEvent.click(within(group).getByRole("button", { name: "20" }));
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

/**
 * The "Custom win condition" lobby section — on the MATCH tab, directly beside
 * the "Win condition" (victory mode) selector, so the extra early-end triggers
 * live with the rest of the victory setup. These assert it is WIRED — Add
 * dispatches the exact SET_GAME_OPTIONS the engine reads, map-set conditions
 * render read-only, and the effective cap disables Add. (The engine half is
 * pinned by custom-win-conditions.test.ts.)
 */
describe("Game options — Custom win condition", () => {
  /** Open the options and switch to the Match tab, where the section lives. */
  function openMatchTab(onAction = vi.fn(), mutate?: (state: GameState) => void) {
    if (mutate) {
      openOptionsWith(mutate, onAction);
    } else {
      openOptions(onAction);
    }
    fireEvent.click(screen.getByRole("tab", { name: /Match/ }));
    return onAction;
  }

  it("lives on the MATCH tab beside the Win condition selector — NOT on Mode & Rules", () => {
    openOptions();
    // Mode & Rules (the default tab) does NOT carry the section any more.
    expect(screen.queryByText("Custom win condition")).toBeNull();

    // The Match tab renders it DIRECTLY BELOW the Win condition (victory mode) row.
    fireEvent.click(screen.getByRole("tab", { name: /Match/ }));
    const winCondition = screen.getByText("Win condition");
    const customRow = screen.getByText("Custom win condition");
    expect(
      winCondition.compareDocumentPosition(customRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("renders the Custom win condition row and Add dispatches the default control-towns condition", () => {
    const onAction = openMatchTab();
    const row = screen.getByText("Custom win condition").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Add win condition" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "control-towns", count: 3 }] }
    });
  });

  it("shows map-set conditions read-only and Add APPENDS to the host list", () => {
    const onAction = openMatchTab(vi.fn(), (state) => {
      state.setupLobby!.options.customMapPreset = {
        customWinConditions: [{ kind: "control-towns", count: 3 }]
      };
      state.setupLobby!.options.customWinConditions = [{ kind: "gold", amount: 200 }];
    });
    const row = screen.getByText("Custom win condition").closest(".optionRow") as HTMLElement;
    // The map-set condition is listed with a "map" tag (read-only — no controls).
    expect(within(row).getByText(/control 3 Towns/)).toBeTruthy();
    expect(within(row).getByText("map")).toBeTruthy();
    // Add appends the new condition to the HOST list, keeping the existing host one.
    fireEvent.click(within(row).getByRole("button", { name: "Add win condition" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customWinConditions: [
          { kind: "gold", amount: 200 },
          { kind: "control-towns", count: 3 }
        ]
      }
    });
  });

  it("removing a host condition dispatches the shrunk list", () => {
    const onAction = openMatchTab(vi.fn(), (state) => {
      state.setupLobby!.options.customWinConditions = [
        { kind: "gold", amount: 200 },
        { kind: "hero-level", level: 5 }
      ];
    });
    const row = screen.getByText("Custom win condition").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Remove custom win condition 1" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "hero-level", level: 5 }] }
    });
  });

  it("Add is disabled at the effective cap (map + host = 4)", () => {
    openMatchTab(vi.fn(), (state) => {
      state.setupLobby!.options.customMapPreset = {
        customWinConditions: [
          { kind: "control-towns", count: 3 },
          { kind: "gold", amount: 200 }
        ]
      };
      state.setupLobby!.options.customWinConditions = [
        { kind: "hero-level", level: 5 },
        { kind: "flag-mines", count: 4 }
      ];
    });
    const row = screen.getByText("Custom win condition").closest(".optionRow") as HTMLElement;
    expect((within(row).getByRole("button", { name: "Add win condition" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
