// @vitest-environment jsdom
/**
 * The Setup Hub: four large icon boxes (Game mode · Heroes & Draft · Map ·
 * Advanced settings) that each open a popup window and summarize the table's
 * current choice underneath. These assert the WIRING — each box opens its own
 * dialog, the dialogs close, the choices dispatch the exact engine actions, and
 * the summaries follow the live options — plus the stacking rule that keeps the
 * hero-info / mod windows usable from INSIDE a hub window.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { MODE_PRESET_PAYLOADS } from "./setup-hub-summary";
import { createAdventureLobbyState, DEFAULT_WOG_OPTIONS, type GameState } from "@/engine";

// The Map window fetches the shared map library on mount; keep it offline.
vi.mock("@/lib/shared-maps", () => ({ fetchSharedMaps: vi.fn(async () => []) }));

afterEach(cleanup);

function renderLobby(mutate?: (state: GameState) => void, onAction = vi.fn()) {
  const state = createAdventureLobbyState({ seed: "setup-hub" });
  mutate?.(state);
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  return { onAction, state };
}

function box(name: RegExp) {
  return screen.getByRole("button", { name });
}

describe("Setup Hub — the four boxes", () => {
  it("renders exactly four boxes, each opening its own dialog", () => {
    renderLobby();
    const grid = screen.getByRole("group", { name: "Setup sections" });
    expect(within(grid).getAllByRole("button")).toHaveLength(4);

    for (const [boxName, dialogName] of [
      [/Game mode/, "Game mode"],
      [/Heroes & Draft/, "Heroes & Draft"],
      [/^Map/, "Choose a map"],
      [/Advanced settings/, "Advanced settings"]
    ] as const) {
      expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
      fireEvent.click(box(boxName));
      const dialog = screen.getByRole("dialog", { name: dialogName });
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      // Only ONE hub window at a time.
      expect(document.querySelectorAll(".setupHubWindow")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: `Close ${dialogName}` }));
      expect(screen.queryByRole("dialog", { name: dialogName })).toBeNull();
    }
  });

  it("closes on Escape and on a backdrop click", () => {
    renderLobby();
    fireEvent.click(box(/Game mode/));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Game mode" })).toBeNull();

    fireEvent.click(box(/Game mode/));
    fireEvent.mouseDown(document.querySelector(".setupHubBackdrop") as HTMLElement);
    expect(screen.queryByRole("dialog", { name: "Game mode" })).toBeNull();
  });

  it("summarizes the live choices under each box", () => {
    // A table on Legacy with WOG on, a designed map, Easy difficulty, and a
    // picked seat — every box's summary reads that state back.
    renderLobby((state) => {
      const options = state.setupLobby!.options;
      options.ruleset = "legacy";
      options.wog = { ...DEFAULT_WOG_OPTIONS, enabled: true };
      options.difficulty = "easy";
      options.customMap = [{ row: 0, col: 0, group: "starting", faceDown: false }];
      options.customMapName = "Twin Peaks";
      const seat = state.setupLobby!.seats.find((entry) => entry.playerId === "p1")!;
      seat.factionId = "castle";
      seat.heroDefId = "catherine";
    });

    expect(box(/Game mode/).textContent).toContain("Legacy");
    expect(box(/Game mode/).textContent).toContain("WOG");
    expect(box(/Heroes & Draft/).textContent).toContain("Castle — Catherine");
    expect(box(/Heroes & Draft/).textContent).toMatch(/Free pick · 1\/2 picked/);
    expect(box(/^Map/).textContent).toContain("Twin Peaks");
    expect(box(/^Map/).textContent).toMatch(/2 players/);
    expect(box(/^Map/).textContent).toContain("Easy");
  });

  it("the Advanced box reads Default fresh and Customized once an option deviates", () => {
    const fresh = renderLobby();
    expect(box(/Advanced settings/).textContent).toContain("Default");
    cleanup();
    expect(fresh.onAction).not.toHaveBeenCalled();

    renderLobby((state) => {
      state.setupLobby!.options.events = true;
    });
    expect(box(/Advanced settings/).textContent).toContain("Customized");
  });

  it("CONTROL: an unseated observer gets no hub boxes", () => {
    const state = createAdventureLobbyState({ seed: "setup-hub-observer" });
    render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId={"observer" as never} />);
    expect(screen.queryByRole("group", { name: "Setup sections" })).toBeNull();
    expect(screen.getByText(/waiting for the players to finish map setup/i)).toBeTruthy();
  });
});

describe("Setup Hub — Game mode window", () => {
  it("shows the four mode cards and both Mod rows, and NOT the house-rule checklists", () => {
    renderLobby();
    fireEvent.click(box(/Game mode/));
    const dialog = screen.getByRole("dialog", { name: "Game mode" });

    const modeGrid = within(dialog).getByRole("group", { name: /Game mode presets/i });
    for (const name of [/Legacy/, /BINH/, /Tournament/, /Custom/]) {
      expect(within(modeGrid).getByRole("button", { name })).toBeTruthy();
    }
    expect(within(dialog).getByRole("button", { name: /Enable Wake of Gods mod/i })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Enable Anime mod/i })).toBeTruthy();
    // The full option tabs / house-rule groups stay in Advanced settings.
    expect(within(dialog).queryByRole("tab", { name: /Map & Setup/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /BINH house rules/i })).toBeNull();
  });

  it("a mode card dispatches its preset payload", () => {
    const { onAction } = renderLobby();
    fireEvent.click(box(/Game mode/));
    const modeGrid = screen.getByRole("group", { name: /Game mode presets/i });
    fireEvent.click(within(modeGrid).getByRole("button", { name: /Legacy/ }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: expect.objectContaining({ ruleset: "legacy", spellBook: false, customMode: false })
      })
    );
  });

  it("holds the ONE setting-FILE panel, in every mode (saving is what makes a setup Custom)", () => {
    const { onAction } = renderLobby();
    fireEvent.click(box(/Game mode/));
    const dialog = screen.getByRole("dialog", { name: "Game mode" });
    // Available on a plain BINH table too: saveToFile is what sends
    // customMode: true, so gating it behind Custom mode would be circular and
    // leave a BINH/Legacy table unable to save its setup at all.
    expect(within(dialog).getByLabelText(/Custom setting — save or load a file/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save to file" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /Custom/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMode: true }
    });

    // Re-render in Custom mode: still exactly one panel, still right here.
    cleanup();
    renderLobby((state) => {
      state.setupLobby!.options.customMode = true;
    });
    fireEvent.click(box(/Game mode/));
    const custom = screen.getByRole("dialog", { name: "Game mode" });
    expect(within(custom).getAllByLabelText(/Custom setting — save or load a file/)).toHaveLength(1);
  });

  it("CONTROL: the setting-FILE panel is NOT duplicated in the Advanced window's map picker", () => {
    // Two copies each kept their own name field, so a name typed in one was
    // ignored by the other's Save button.
    renderLobby();
    fireEvent.click(box(/Advanced settings/));
    fireEvent.click(screen.getByRole("tab", { name: /Map & Setup/ }));
    expect(screen.queryByLabelText(/Custom setting — save or load a file/)).toBeNull();
    // …and the map picker points at the box that does own it.
    expect(screen.getByRole("button", { name: /Open the Game-mode window for Custom setting files/ })).toBeTruthy();
  });

  it("a Mod window opens ON TOP of the hub window (both stay mounted) and Escape closes only it", () => {
    renderLobby((state) => {
      state.setupLobby!.options.wog = { ...DEFAULT_WOG_OPTIONS, enabled: true };
    });
    fireEvent.click(box(/Game mode/));
    fireEvent.click(screen.getByRole("button", { name: "Mod options" }));

    // Both dialogs coexist — the mod window never replaces the hub window.
    expect(screen.getByRole("dialog", { name: "Wake of Gods mod options" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Game mode" })).toBeTruthy();

    // Escape defers to the topmost dialog, so the hub window survives it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Game mode" })).toBeTruthy();

    // With the mod window closed, Escape closes the hub window.
    fireEvent.click(screen.getByRole("button", { name: "Close WOG options" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Game mode" })).toBeNull();
  });
});

describe("Setup Hub — Heroes & Draft window", () => {
  it("holds the format selector, the faction grid and the hero-info popup", () => {
    const { onAction } = renderLobby();
    fireEvent.click(box(/Heroes & Draft/));
    const dialog = screen.getByRole("dialog", { name: "Heroes & Draft" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Draft (ban-pick)" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });

    fireEvent.click(within(dialog).getByRole("button", { name: /Catherine/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
  });

  it("the hero-info popup opens from inside the window and both stay mounted", () => {
    renderLobby();
    fireEvent.click(box(/Heroes & Draft/));
    const row = screen.getByRole("button", { name: /Rion/ }).closest(".lobbyHeroRow") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Show hero details" }));

    const heroInfo = screen.getByRole("dialog", { name: "Hero details" });
    expect(heroInfo).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Heroes & Draft" })).toBeTruthy();
    // It must PORTAL to <body>, beside the hub window: rendered inline it would
    // be trapped in the lobby's stacking context and drawn UNDER the window
    // (its close button unclickable) however high its z-index.
    expect(heroInfo.parentElement).toBe(document.body);
    // Escape belongs to the hero popup while it is open.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Heroes & Draft" })).toBeTruthy();
  });

  it("single-player: the map-owned deployment summary and per-seat pickers live here", () => {
    const onAction = vi.fn();
    const state = createAdventureLobbyState({
      seed: "setup-hub-sp",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2
    });
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(box(/Heroes & Draft/));
    const dialog = screen.getByRole("dialog", { name: "Heroes & Draft" });

    // The count is map-owned and read-only (not a Players/enemy-count picker).
    const countRow = within(dialog).getByText("Solo deployment").closest(".optionRow") as HTMLElement;
    expect(within(countRow).getByLabelText("Map-selected computer opponents").textContent).toContain(
      "2 computer opponents"
    );
    expect(within(countRow).queryByRole("button")).toBeNull();

    // …and the per-seat pickers.
    const pickers = within(dialog).getByLabelText("Computer opponents setup");
    fireEvent.click(
      within(within(pickers).getByLabelText("Set up Computer 1")).getByRole("button", { name: "Roll random now" })
    );
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: "roll"
    });
  });

  it("CONTROL: a multiplayer table shows the Players count and no computer pickers", () => {
    const onAction = vi.fn();
    const state = createAdventureLobbyState({ seed: "setup-hub-mp", scenarioId: "skirmish", playerCount: 2 });
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(box(/Heroes & Draft/));
    const dialog = screen.getByRole("dialog", { name: "Heroes & Draft" });

    expect(within(dialog).queryByLabelText("Computer opponents setup")).toBeNull();
    const countRow = within(dialog).getByText("Players").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(countRow).getByRole("button", { name: "3 players" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 3 }
    });
  });
});

describe("Setup Hub — Advanced settings window", () => {
  it("hosts the full four-tab options panel", () => {
    renderLobby();
    fireEvent.click(box(/Advanced settings/));
    const dialog = screen.getByRole("dialog", { name: "Advanced settings" });
    for (const name of [/Mode & Rules/, /Match/, /Map & Setup/, /Town & Resources/]) {
      expect(within(dialog).getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("its rows that duplicate another box say so and jump there", () => {
    renderLobby();
    fireEvent.click(box(/Advanced settings/));
    // Mode & Rules hosts the same mode grid the Game-mode box does.
    expect(screen.getByRole("button", { name: "Open the Game-mode window" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the Game-mode window" }));
    expect(screen.getByRole("dialog", { name: "Game mode" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Advanced settings" })).toBeNull();
  });
});

/**
 * The setup SUMMARY RAIL. The painted scene shows only each box's TITLE (the
 * per-box summary is hidden), so the consolidated live view of every choice
 * lives in ONE always-visible panel pinned to the right of the scene — not
 * inside the popup windows anymore. It reads the same derivation the boxes use,
 * and each chip is one click into that box.
 */
describe("Setup Hub — the summary rail", () => {
  function railValues() {
    const rail = document.querySelector(".setupSummaryRail") as HTMLElement | null;
    return Array.from(rail?.querySelectorAll(".setupHubNavItem") ?? []).map((item) => item.textContent ?? "");
  }

  it("shows every box's live choice in one always-visible rail, all four as buttons", () => {
    renderLobby((state) => {
      const options = state.setupLobby!.options;
      options.ruleset = "legacy";
      options.wog = { ...DEFAULT_WOG_OPTIONS, enabled: true };
      options.difficulty = "easy";
      options.customMap = [{ row: 0, col: 0, group: "starting", faceDown: false }];
      options.customMapName = "Twin Peaks";
      const seat = state.setupLobby!.seats.find((entry) => entry.playerId === "p1")!;
      seat.factionId = "castle";
      seat.heroDefId = "catherine";
    });

    const values = railValues();
    expect(values).toHaveLength(4);
    // The rail reflects EVERY box at once — mode, mods, hero, map, difficulty.
    expect(values.join(" | ")).toContain("Legacy");
    expect(values.join(" | ")).toContain("WOG");
    expect(values.join(" | ")).toContain("Castle — Catherine");
    expect(values.join(" | ")).toContain("Twin Peaks");
    expect(values.join(" | ")).toContain("Easy");
    // No "you are here" span on the scene: all four chips are actionable.
    expect(document.querySelectorAll(".setupHubNavItem.here")).toHaveLength(0);
    const rail = document.querySelector(".setupSummaryRail") as HTMLElement;
    expect(rail.querySelectorAll("button.setupHubNavItem")).toHaveLength(4);
  });

  it("the rail is NOT inside any popup window — the strip was removed from windows", () => {
    renderLobby();
    // The rail sits on the scene, a sibling of the boxes — never inside a window.
    expect(document.querySelector(".setupHubWindow .setupSummaryRail")).toBeNull();
    for (const [boxName, dialogName] of [
      [/Game mode/, "Game mode"],
      [/Heroes & Draft/, "Heroes & Draft"],
      [/^Map/, "Choose a map"],
      [/Advanced settings/, "Advanced settings"]
    ] as const) {
      fireEvent.click(box(boxName));
      const content = document.querySelector(".setupHubWindowContent") as HTMLElement;
      expect(content.querySelector(".setupHubNavItem")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: `Close ${dialogName}` }));
    }
  });

  it("a rail chip opens straight into that box's window", () => {
    renderLobby();
    fireEvent.click(screen.getByRole("button", { name: "Change the Map box" }));
    expect(screen.getByRole("dialog", { name: "Choose a map" })).toBeTruthy();
    // Still exactly one hub window open.
    expect(document.querySelectorAll(".setupHubWindow")).toHaveLength(1);
  });

  it("REGRESSION: picking a designed map leaves the Game-mode choice alone", () => {
    // The Map window used to send `customMode: true`, so choosing a map threw
    // the table into "Custom — your saved setup" and the Advanced box stopped
    // reporting anything but "Custom setup file".
    renderLobby((state) => {
      const options = state.setupLobby!.options;
      // The full Legacy preset (the mode card's payload) — setting `ruleset`
      // alone would leave the BINH Spell Book on, which honestly reads as a
      // deviation from Legacy and would report "Customized" for that reason.
      Object.assign(options, MODE_PRESET_PAYLOADS.legacy);
      options.customMap = [{ row: 0, col: 0, group: "starting", faceDown: false }];
      options.customMapName = "Twin Peaks";
    });
    expect(box(/Game mode/).textContent).toContain("Legacy");
    expect(box(/Advanced settings/).textContent).toContain("Default");

    // The always-visible rail reflects both the mode and the designed map.
    expect(railValues().join(" | ")).toContain("Legacy");
    expect(railValues().join(" | ")).toContain("Twin Peaks");
  });
});

describe("Setup Hub — the Start button is untouched", () => {
  it("stays gated on every seat picking, and starts the adventure when they have", () => {
    const waiting = renderLobby();
    expect((screen.getByRole("button", { name: /Waiting for every seat to pick/ }) as HTMLButtonElement).disabled).toBe(
      true
    );
    cleanup();
    expect(waiting.onAction).not.toHaveBeenCalled();

    const { onAction } = renderLobby((state) => {
      for (const seat of state.setupLobby!.seats) {
        seat.factionId = "castle";
        seat.heroDefId = "catherine";
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /New Game/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "START_ADVENTURE", playerId: "p1" });
  });
});
