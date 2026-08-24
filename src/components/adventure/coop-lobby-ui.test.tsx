// @vitest-environment jsdom
/**
 * CO-OP MODE — step 6: the LOBBY UI that finally makes the feature reachable by
 * clicking. Everything here is PRESENTATION over engine seams that already
 * shipped in steps 1–5; no engine rule is asserted in this file (those live in
 * `coop-mode.test.ts` / `coop-step2.test.ts` / `coop-objectives.test.ts` /
 * `coop-map-deployment.test.ts`).
 *
 * What is pinned, each with a CONTROL that must NOT show the co-op behaviour:
 *  1. The Game-mode window's Clash / Co-op row — the exact SET_GAME_OPTIONS
 *     payload, the single-player CONTROL (no row at all), and a map that
 *     supports only one mode disabling the other with the reason.
 *  2. The multiplayer "Computer enemies" stepper — the exact
 *     SET_COMPUTER_OPPONENTS payload, the seat cap, the parallel-turns block,
 *     and the single-player rendering left untouched.
 *  3. The two co-op win conditions selectable from the lobby dropdown, their
 *     payloads, and the raid-boss module hint.
 *  4. The two neutral-control rows disabled on a co-op table, with clash
 *     CONTROLs on the identical lobby.
 *
 * jsdom cannot compute CSS, so nothing here proves a pixel — only the DOM
 * contract and the dispatched actions. There is no e2e spec for any of it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import {
  applyAction,
  createAdventureLobbyState,
  DEFAULT_WOG_OPTIONS,
  type CustomMapPreset,
  type GameAction,
  type GameState
} from "@/engine";

// The Map window fetches the shared map library on mount; keep it offline.
vi.mock("@/lib/shared-maps", () => ({ fetchSharedMaps: vi.fn(async () => []) }));

afterEach(cleanup);

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A fresh MULTIPLAYER map-setup lobby, rendered as the Setup Hub. */
function renderLobby(mutate?: (state: GameState) => GameState | void, onAction = vi.fn()) {
  let state = createAdventureLobbyState({ seed: "coop-ui", scenarioId: "skirmish" });
  state = (mutate?.(state) as GameState | undefined) ?? state;
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  return { onAction, state };
}

/** A SINGLE-PLAYER map-setup lobby — the CONTROL surface for every claim below. */
function renderSoloLobby(onAction = vi.fn()) {
  const state = createAdventureLobbyState({
    seed: "coop-ui-solo",
    scenarioId: "skirmish",
    sessionMode: "single-player",
    computerOpponents: 1
  });
  render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
  return { onAction, state };
}

const openGameMode = () => fireEvent.click(screen.getByRole("button", { name: /Game mode/ }));
const openHeroes = () => fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
const openAdvanced = () => fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
const matchTab = () => fireEvent.click(screen.getByRole("tab", { name: /Match/ }));

/** A designed map preset declaring support for exactly one table mode. */
function modePreset(clash: boolean, coop: boolean): CustomMapPreset {
  return { supportedModes: { clash, coop } };
}

// ===========================================================================
// 1. the table-mode row
// ===========================================================================

describe("co-op step 6 — the Game-mode window's Clash / Co-op row", () => {
  it("dispatches SET_GAME_OPTIONS { gameMode } and reflects the live choice", () => {
    const { onAction } = renderLobby();
    openGameMode();
    const row = screen.getByRole("group", { name: "Table mode" });

    // Absent gameMode reads as Clash — the engine's own default.
    expect(within(row).getByRole("button", { name: "Clash" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(row).getByRole("button", { name: "Co-op" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(within(row).getByRole("button", { name: "Co-op" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { gameMode: "coop" }
    });

    // …and back again, so the row is a real two-way control.
    fireEvent.click(within(row).getByRole("button", { name: "Clash" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { gameMode: "clash" }
    });
  });

  it("shows the co-op explainer in BOTH modes (or the button is unexplained until pressed)", () => {
    const explainer = "All human players are one alliance against the computer enemies. Unranked.";

    renderLobby((state) => {
      state.setupLobby!.options.gameMode = "coop";
    });
    openGameMode();
    let row = screen.getByRole("group", { name: "Table mode" }).closest(".optionRow") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Co-op" }).getAttribute("aria-pressed")).toBe("true");
    expect(row.textContent).toContain(explainer);

    cleanup();
    // …and from a plain CLASH lobby, which is where a host reads it first.
    renderLobby();
    openGameMode();
    row = screen.getByRole("group", { name: "Table mode" }).closest(".optionRow") as HTMLElement;
    expect(row.textContent).toContain(explainer);
    expect(row.textContent).toContain("Every seat plays for itself");
  });

  it("CONTROL: a SINGLE-PLAYER lobby offers no table-mode row at all", () => {
    renderSoloLobby();
    openGameMode();
    expect(screen.queryByRole("group", { name: "Table mode" })).toBeNull();
    // The rule presets are still there — only the co-op axis is withheld.
    expect(screen.getByRole("group", { name: /Game mode presets/i })).toBeTruthy();
  });

  it("a CO-OP-ONLY map disables Clash with the map's reason (and the mirror for a clash-only map)", () => {
    renderLobby((state) => {
      state.setupLobby!.options.customMapPreset = modePreset(false, true);
    });
    openGameMode();
    let row = screen.getByRole("group", { name: "Table mode" });
    expect((within(row).getByRole("button", { name: "Clash" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(row).getByRole("button", { name: "Co-op" }) as HTMLButtonElement).disabled).toBe(false);
    expect(
      (within(row).getByRole("button", { name: "Clash" }) as HTMLButtonElement).title
    ).toContain("designed for Co-op only");

    cleanup();
    renderLobby((state) => {
      state.setupLobby!.options.customMapPreset = modePreset(true, false);
    });
    openGameMode();
    row = screen.getByRole("group", { name: "Table mode" });
    expect((within(row).getByRole("button", { name: "Co-op" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(row).getByRole("button", { name: "Clash" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(row).getByRole("button", { name: "Co-op" }) as HTMLButtonElement).title).toContain(
      "designed for Clash only"
    );
  });

  it("CONTROL: a map that declares nothing leaves BOTH modes enabled", () => {
    renderLobby();
    openGameMode();
    const row = screen.getByRole("group", { name: "Table mode" });
    for (const name of ["Clash", "Co-op"]) {
      expect((within(row).getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

// ===========================================================================
// 2. the multiplayer computer-enemies stepper
// ===========================================================================

describe("co-op step 6 — Computer enemies in a multiplayer lobby", () => {
  it("dispatches SET_COMPUTER_OPPONENTS and reads the live computer-seat count back", () => {
    const { onAction } = renderLobby();
    openHeroes();
    const row = screen.getByRole("group", { name: "Number of computer enemies" });
    expect(within(row).getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(row).getByRole("button", { name: /1 enemy/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
  });

  it("after a REAL SET_COMPUTER_OPPONENTS the stepper shows the new count and the seat pickers appear", () => {
    renderLobby((state) => apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 }));
    openHeroes();
    const row = screen.getByRole("group", { name: "Number of computer enemies" });
    expect(within(row).getByRole("button", { name: /1 enemy/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(row).getByRole("button", { name: "None" }).getAttribute("aria-pressed")).toBe("false");

    // The per-seat faction/hero pickers — single-player only before this step.
    const pickers = screen.getByRole("region", { name: "Computer opponents setup" });
    expect(pickers.textContent).toContain("The table’s computer enemies");
    expect(within(pickers).getByRole("button", { name: /Pick faction & hero/i })).toBeTruthy();
  });

  it("never offers more computer seats than the scenario can seat — the top offer is really accepted, one more is clamped", () => {
    renderLobby();
    openHeroes();
    const row = screen.getByRole("group", { name: "Number of computer enemies" });
    const labels = within(row)
      .getAllByRole("button")
      .map((button) => button.textContent);
    // Border Skirmish seats 6; the lobby opens 2 human seats, so the offers are
    // None + 1…4 — the engine clamps `humans + requested` to the capacity, and
    // an offer beyond it would silently do nothing.
    expect(labels).toEqual(["None", "1 enemy", "2 enemies", "3 enemies", "4 enemies"]);

    // The claim measured against the ENGINE, not against the constant above.
    const base = createAdventureLobbyState({ seed: "coop-ui-cap", scenarioId: "skirmish" });
    const top = apply(base, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 4 });
    expect(top.setupLobby!.seats).toHaveLength(6);
    const beyond = apply(base, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 5 });
    expect(beyond.setupLobby!.seats, "a 5th computer is clamped away — never offer it").toHaveLength(6);
  });

  it("is DISABLED with the reason while parallel turns are on (the engine refuses the combination)", () => {
    renderLobby((state) => {
      state.setupLobby!.options.parallelTurns = 2;
    });
    openHeroes();
    const row = screen.getByRole("group", { name: "Number of computer enemies" });
    const one = within(row).getByRole("button", { name: /1 enemy/ }) as HTMLButtonElement;
    expect(one.disabled).toBe(true);
    expect(one.title).toContain("Parallel turns are on");
    // "None" stays live — removing computers is always legal, so the lobby can
    // never wedge (the engine's own escape hatch).
    expect((within(row).getByRole("button", { name: "None" }) as HTMLButtonElement).disabled).toBe(false);
    expect((row.closest(".optionRow") as HTMLElement).textContent).toContain("Parallel turns are on");
  });

  it("CONTROL: the SINGLE-PLAYER rendering is untouched — its own enemy stepper, no MP row", () => {
    renderSoloLobby();
    openHeroes();
    // The solo control keeps its 1-based "N enemies" labels and has no "None".
    const row = screen.getByRole("group", { name: "Number of computer enemies" });
    expect(within(row).queryByRole("button", { name: "None" })).toBeNull();
    expect(within(row).getByRole("button", { name: /1 enemy/ }).getAttribute("aria-pressed")).toBe("true");
    // …and its pickers still use the single-player heading.
    expect(screen.getByRole("region", { name: "Computer opponents setup" }).textContent).toContain(
      "Your computer opponents"
    );
  });

  it("CONTROL: an all-human multiplayer lobby still shows the Players row it always did", () => {
    renderLobby();
    openHeroes();
    expect(screen.getByRole("button", { name: /2 players/ })).toBeTruthy();
  });

  it("CONTROL: a fixed-2-seat scenario renders NEITHER row (and so no orphan footer note)", () => {
    // "Twin Kingdoms" seats exactly 2, both human — there is no seat left for a
    // computer, so the whole control (and the footer note pointing at it) must
    // stay away, exactly as before this step.
    const state = createAdventureLobbyState({ seed: "coop-ui-2p", scenarioId: "land-2p" });
    expect(state.setupLobby!.seats).toHaveLength(2);
    render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    openHeroes();
    expect(screen.queryByRole("group", { name: "Number of computer enemies" })).toBeNull();
    expect(screen.queryByRole("button", { name: /players$/ })).toBeNull();
  });
});

// ===========================================================================
// 3. the two co-op win conditions in the lobby dropdown
// ===========================================================================

describe("co-op step 6 — the co-op objectives are selectable", () => {
  it("offers both new kinds and dispatches the exact payloads", () => {
    // The list is server state, so seed one row and drive its kind select (the
    // Add button only appends a fresh default — it cannot reach a kind).
    const next = vi.fn();
    renderLobby((state) => {
      state.setupLobby!.options.customWinConditions = [{ kind: "gold", amount: 100 }];
    }, next);
    openAdvanced();
    matchTab();
    const select = screen.getByLabelText("Custom win condition 1 kind") as HTMLSelectElement;
    const offered = Array.from(select.options).map((option) => option.value);
    expect(offered).toContain("defeat-computers");
    expect(offered).toContain("slay-raid-boss");

    fireEvent.change(select, { target: { value: "defeat-computers" } });
    expect(next).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "defeat-computers" }] }
    });

    fireEvent.change(select, { target: { value: "slay-raid-boss" } });
    expect(next).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "slay-raid-boss", count: 1 }] }
    });
  });

  it("a slay-raid-boss row edits its count 1–3 through the shared param editor", () => {
    const onAction = vi.fn();
    renderLobby((state) => {
      state.setupLobby!.options.customWinConditions = [{ kind: "slay-raid-boss", count: 1 }];
    }, onAction);
    openAdvanced();
    matchTab();
    const input = screen.getByLabelText("Custom win condition 1 value") as HTMLInputElement;
    expect(input.min).toBe("1");
    expect(input.max).toBe("3");
    fireEvent.change(input, { target: { value: "3" } });
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "slay-raid-boss", count: 3 }] }
    });
  });

  it("CONTROL: defeat-computers is parameterless — no value input at all", () => {
    renderLobby((state) => {
      state.setupLobby!.options.customWinConditions = [{ kind: "defeat-computers" }];
    });
    openAdvanced();
    matchTab();
    expect(screen.queryByLabelText("Custom win condition 1 value")).toBeNull();
  });

  it("warns that slay-raid-boss will be DROPPED when no Raid Bosses module is on, and stops warning once it is", () => {
    renderLobby((state) => {
      state.setupLobby!.options.customWinConditions = [{ kind: "slay-raid-boss", count: 1 }];
    });
    openAdvanced();
    matchTab();
    expect(screen.getByText(/needs Raid Bosses/i)).toBeTruthy();

    cleanup();
    renderLobby((state) => {
      state.setupLobby!.options.customWinConditions = [{ kind: "slay-raid-boss", count: 1 }];
      state.setupLobby!.options.wog = { ...DEFAULT_WOG_OPTIONS, enabled: true, raidBosses: true };
    });
    openAdvanced();
    matchTab();
    expect(screen.queryByText(/needs Raid Bosses/i)).toBeNull();
  });

  it("CONTROL: a lobby with no raid-boss condition never warns, module or not", () => {
    renderLobby((state) => {
      state.setupLobby!.options.customWinConditions = [{ kind: "gold", amount: 100 }];
    });
    openAdvanced();
    matchTab();
    expect(screen.queryByText(/needs Raid Bosses/i)).toBeNull();
  });
});

// ===========================================================================
// 4. the option rows the co-op engine nulls
// ===========================================================================

describe("co-op step 6 — the neutral-control rows are disabled in co-op", () => {
  function coopOptions(mutate?: (state: GameState) => void) {
    renderLobby((state) => {
      state.setupLobby!.options.gameMode = "coop";
      mutate?.(state);
    });
    openAdvanced();
  }

  function clashOptions(mutate?: (state: GameState) => void) {
    renderLobby((state) => mutate?.(state));
    openAdvanced();
  }

  it("Manual guard control is disabled with the reason (clash CONTROL: live)", () => {
    coopOptions();
    const row = document.querySelector(".manualGuardControlRow") as HTMLElement;
    expect((within(row).getByRole("button", { name: "On" }) as HTMLButtonElement).disabled).toBe(true);
    expect(row.textContent).toContain("Not available in Co-op");

    cleanup();
    clashOptions();
    const clashRow = document.querySelector(".manualGuardControlRow") as HTMLElement;
    expect((within(clashRow).getByRole("button", { name: "On" }) as HTMLButtonElement).disabled).toBe(false);
    expect(clashRow.textContent).not.toContain("Not available in Co-op");
  });

  it("PvP Neutral Control and its must-attack sub-toggle are disabled (clash CONTROL: live)", () => {
    coopOptions((state) => {
      // Already ON (e.g. from the Tournament preset) — the sub-toggle renders,
      // so the disabled state has to reach BOTH rows.
      state.setupLobby!.options.pvpNeutralControl = true;
    });
    fireEvent.click(screen.getByRole("tab", { name: /Match/ }));
    const control = screen.getByTitle(/the next seat clockwise plays the Neutral units/i).closest(
      ".optionRow"
    ) as HTMLElement;
    expect((within(control).getByRole("button", { name: "On" }) as HTMLButtonElement).disabled).toBe(true);
    expect(control.textContent).toContain("Not available in Co-op");

    const mustAttack = screen.getByTitle(/whether the guards keep the rulebook/i).closest(
      ".optionRow"
    ) as HTMLElement;
    expect((within(mustAttack).getByRole("button", { name: "Must attack" }) as HTMLButtonElement).disabled).toBe(
      true
    );

    cleanup();
    clashOptions((state) => {
      state.setupLobby!.options.pvpNeutralControl = true;
    });
    fireEvent.click(screen.getByRole("tab", { name: /Match/ }));
    const clashControl = screen.getByTitle(/the next seat clockwise plays the Neutral units/i).closest(
      ".optionRow"
    ) as HTMLElement;
    expect((within(clashControl).getByRole("button", { name: "On" }) as HTMLButtonElement).disabled).toBe(false);
    const clashMustAttack = screen.getByTitle(/whether the guards keep the rulebook/i).closest(
      ".optionRow"
    ) as HTMLElement;
    expect(
      (within(clashMustAttack).getByRole("button", { name: "Must attack" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});
