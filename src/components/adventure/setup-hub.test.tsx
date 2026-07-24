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

  it("picking Custom reveals the setting-FILE panel inside the same window", () => {
    const { onAction } = renderLobby();
    fireEvent.click(box(/Game mode/));
    const dialog = screen.getByRole("dialog", { name: "Game mode" });
    // Not there under a normal mode.
    expect(within(dialog).queryByLabelText(/Custom setting — save or load a file/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Custom/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMode: true }
    });

    // Re-render in Custom mode: the save/load panel is right there in the popup.
    cleanup();
    renderLobby((state) => {
      state.setupLobby!.options.customMode = true;
    });
    fireEvent.click(box(/Game mode/));
    const custom = screen.getByRole("dialog", { name: "Game mode" });
    expect(within(custom).getByLabelText(/Custom setting — save or load a file/)).toBeTruthy();
    expect(within(custom).getByRole("button", { name: "Save to file" })).toBeTruthy();
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

  it("single-player: the computer-opponent COUNT and per-seat pickers live here", () => {
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

    // The seat-count control (computer opponents, not "Players").
    const countRow = within(dialog).getByText("Computer opponents").closest(".optionRow") as HTMLElement;
    fireEvent.click(within(countRow).getByRole("button", { name: /3 computers/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 3 });

    // …and the per-seat pickers.
    const pickers = within(dialog).getByLabelText("Computer opponents setup");
    fireEvent.click(within(pickers).getByLabelText("Set up Computer 1").querySelector("button") as HTMLElement);
    expect(onAction).toHaveBeenCalled();
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
    for (const name of [/Mode & Rules/, /Match/, /Map & Setup/, /Army/]) {
      expect(within(dialog).getByRole("tab", { name })).toBeTruthy();
    }
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
