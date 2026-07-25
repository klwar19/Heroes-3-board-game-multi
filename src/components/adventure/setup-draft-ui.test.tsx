// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { applyAction, createAdventureLobbyState } from "@/engine";
import type { GameAction, GameState } from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";

afterEach(cleanup);

/** Builds a real lobby state by running the given engine actions in order. */
function build(seed: string, actions: GameAction[]): GameState {
  let state = createAdventureLobbyState({ seed });
  for (const action of actions) {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    state = result.state;
  }
  return state;
}

/** The faction/hero picks live in the Heroes & Draft hub window — open it. */
function openHeroes() {
  fireEvent.click(screen.getByRole("button", { name: /Heroes & Draft/ }));
}

describe("SetupLobbyScreen — hero info popup", () => {
  it("opens a closeable popup with stats, ability and all three specialties; inspecting does not choose", () => {
    const state = createAdventureLobbyState({ seed: "ui-popup" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    // Closed by default — no detail card on screen.
    expect(screen.queryByLabelText("Rion details")).toBeNull();

    // The info button sits beside the Rion pick button. Clicking it opens the
    // popup and must NOT commit the seat to Rion.
    const rionRow = (screen.getByRole("button", { name: /Rion/ }).closest(".lobbyHeroRow")) as HTMLElement;
    fireEvent.click(within(rionRow).getByRole("button", { name: "Show hero details" }));
    expect(onAction).not.toHaveBeenCalled();

    const detail = screen.getByLabelText("Rion details");
    const hero = coreHeroDefinitions.rion;
    for (const [label, value] of [
      ["Attack", hero.startingStats.attack],
      ["Defense", hero.startingStats.defense],
      ["Power", hero.startingStats.power],
      ["Knowledge", hero.startingStats.knowledge]
    ] as const) {
      expect(within(detail).getByRole("group", { name: `${label} ${value}` })).toBeTruthy();
    }
    expect(within(detail).getByText(cardLibrary[hero.startingAbilityCardId].name)).toBeTruthy();
    for (const level of [1, 4, 6] as const) {
      expect(within(detail).getByText(cardLibrary[hero.specialtyCardIds![level]].name), `specialty ${level}`).toBeTruthy();
    }

    // Closing the popup hides it again.
    fireEvent.click(screen.getByRole("button", { name: "Close hero details" }));
    expect(screen.queryByLabelText("Rion details")).toBeNull();
  });
});

describe("SetupLobbyScreen — setup format selector", () => {
  it("each format button dispatches SET_DRAFT_FORMAT", () => {
    const state = createAdventureLobbyState({ seed: "ui-format" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    fireEvent.click(screen.getByRole("button", { name: "Draft (ban-pick)" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });

    fireEvent.click(screen.getByRole("button", { name: "Full random" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random" });

    fireEvent.click(screen.getByRole("button", { name: "Random with choice" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" });
  });
});

describe("SetupLobbyScreen — hosted/closed room observer guidance", () => {
  it("tells an unseated observer in a hosted room to TAKE A SEAT when one is open", () => {
    const state = createAdventureLobbyState({ seed: "ui-observer" });
    // A hosted room where nobody holds a seat yet: the viewer is an observer.
    state.room = { hosted: true, hostClientId: "c1", members: [{ clientId: "c1", name: "Host", seat: "observer", isHost: true }] };
    render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId={"observer" as never} />);
    // The misleading "just wait" note is replaced by an actionable take-a-seat hint.
    expect(screen.getByText(/take a seat/i)).toBeTruthy();
    expect(screen.queryByText(/waiting for the players to finish setup/i)).toBeNull();
  });

  it("keeps the plain waiting note on an OPEN table (no seat lock) — gating control", () => {
    const state = createAdventureLobbyState({ seed: "ui-observer-open" });
    // Open table (not hosted): the observer note stays the original wording.
    render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId={"observer" as never} />);
    expect(screen.getByText(/waiting for the players to finish map setup/i)).toBeTruthy();
    expect(screen.queryByText(/take a seat/i)).toBeNull();
  });
});

describe("SetupLobbyScreen — TYPE 4 free pick", () => {
  it("clicking a hero dispatches CHOOSE_FACTION", () => {
    const state = createAdventureLobbyState({ seed: "ui-open" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    fireEvent.click(screen.getByRole("button", { name: /Catherine/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
  });
});

describe("SetupLobbyScreen — TYPE 2 full random", () => {
  it("rolls the seat's town and hero via RANDOM_ASSIGN_SEAT", () => {
    const state = build("ui-random", [{ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random" }]);
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    fireEvent.click(screen.getByRole("button", { name: /Roll random town/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
  });
});

describe("SetupLobbyScreen — TYPE 1 draft", () => {
  it("the town phase rolls two towns and locks a directly-selected town", () => {
    const state = build("ui-draft-town", [{ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" }]);
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    fireEvent.click(screen.getByRole("button", { name: /Roll two towns/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "ROLL_TOWN_OPTIONS", playerId: "p1" });

    // The direct-select town buttons each lock that town.
    fireEvent.click(screen.getByRole("button", { name: /Castle/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });
  });

  it("hides another player's pending rolled towns from the direct-pick grid", () => {
    const state = build("ui-draft-reserved-towns", [
      { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" },
      { type: "ROLL_TOWN_OPTIONS", playerId: "p1" }
    ]);
    const reserved = state.setupLobby?.draft?.seatRolls?.p1?.townOptions ?? [];
    render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId="p2" />);
    openHeroes();

    expect(reserved).toHaveLength(2);
    for (const factionId of reserved) {
      expect(screen.queryByRole("button", { name: new RegExp(coreFactionDefinitions[factionId].name, "i") })).toBeNull();
    }
  });

  it("the ban phase offers ONLY the opponent's heroes to the current banner, and clicking one bans it", () => {
    const state = build("ui-draft-ban", [
      { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" },
      { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" },
      { type: "CHOOSE_TOWN", playerId: "p2", factionId: "necropolis" }
    ]);
    const onAction = vi.fn();
    // p1 is the first banner.
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    // A necropolis (opponent) hero is offered to ban; a castle (own) hero is not.
    fireEvent.click(screen.getByRole("button", { name: /Sandro/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" });
    expect(screen.queryByRole("button", { name: /^Catherine$/ })).toBeNull();
  });

  it("in the pick phase a banned hero's pick button is disabled while a sibling stays enabled", () => {
    const state = build("ui-draft-pick", [
      { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" },
      { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" },
      { type: "CHOOSE_TOWN", playerId: "p2", factionId: "necropolis" },
      { type: "BAN_HERO", playerId: "p1", heroDefId: "sandro" },
      { type: "BAN_HERO", playerId: "p2", heroDefId: "catherine" },
      { type: "BAN_HERO", playerId: "p1", heroDefId: "tamika" },
      { type: "BAN_HERO", playerId: "p2", heroDefId: "rion" }
    ]);
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    openHeroes();

    // Catherine + Rion were banned by p2 → disabled in p1's castle pick grid.
    expect((screen.getByRole("button", { name: /Catherine/ }) as HTMLButtonElement).disabled).toBe(true);
    // Adelaide (un-banned castle sibling) is pickable.
    const adelaide = screen.getByRole("button", { name: /Adelaide/ }) as HTMLButtonElement;
    expect(adelaide.disabled).toBe(false);
    fireEvent.click(adelaide);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "adelaide"
    });
  });
});

describe("SetupLobbyScreen — setup take-back warning (all players, red popup)", () => {
  it("shows a red 'cheating' alert to OTHER players when a seat resets; absent before any reset", () => {
    // p1 makes a normal pick — no warning yet, even to the other player.
    const clean = build("ui-cheat", [
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }
    ]);
    const { unmount } = render(<SetupLobbyScreen onAction={vi.fn()} state={clean} viewerPlayerId="p2" />);
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();

    // p1 takes it back — every viewer (here the OTHER seat, p2) sees the red alert.
    const afterReset = applyAction(clean, { type: "RESET_SEAT_DRAFT", playerId: "p1" }).state;
    render(<SetupLobbyScreen onAction={vi.fn()} state={afterReset} viewerPlayerId="p2" />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/cheating/i)).toBeTruthy();
    expect(alert.querySelector(".setupCheatIcon")?.textContent).toContain("☠");
    expect(alert.textContent).toMatch(/reset their hero pick/i);
  });

  it("shows the skull warning when a player uses the Re-roll button directly", () => {
    const rerolled = build("ui-cheat-reroll", [
      { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" },
      { type: "ROLL_TOWN_OPTIONS", playerId: "p1" },
      { type: "ROLL_TOWN_OPTIONS", playerId: "p1" }
    ]);
    render(<SetupLobbyScreen onAction={vi.fn()} state={rerolled} viewerPlayerId="p2" />);

    const alert = screen.getByRole("alert");
    expect(alert.querySelector(".setupCheatIcon")?.textContent).toContain("☠");
    expect(alert.textContent).toMatch(/re-rolling or re-picking/i);
  });

  it("is dismissible by the viewer", () => {
    const afterReset = build("ui-cheat-dismiss", [
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" },
      { type: "RESET_SEAT_DRAFT", playerId: "p1" }
    ]);
    render(<SetupLobbyScreen onAction={vi.fn()} state={afterReset} viewerPlayerId="p1" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss warning" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SetupLobbyScreen — merged Map picker", () => {
  it("lists scenario sheets and designed maps in one picker; picking a sheet drops any custom map", () => {
    const state = createAdventureLobbyState({ seed: "ui-map" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
    // The Game-options panel is itself tabbed; the Map picker lives on "Map & Setup".
    fireEvent.click(screen.getByRole("tab", { name: /Map & Setup/ }));

    // One unified control, clearly split into built-in sheets and custom-made maps.
    expect(screen.getByText(/Scenario sheets/i)).toBeTruthy();
    expect(screen.getByText(/custom-made by a person/i)).toBeTruthy();

    // Picking a built-in scenario sheet clears any designed map in the SAME
    // action, and touches nothing else — notably not `customMode`, which the
    // Game-mode box owns (sending it here silently dropped a table out of a
    // deliberately chosen Custom mode on every map pick).
    fireEvent.click(screen.getByRole("button", { name: "Twin Kingdoms (2P Land)" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "land-2p", customMap: null, customMapName: null }
    });
  });
});

describe("SetupLobbyScreen — TYPE 3 random with choice", () => {
  it("rolls two towns, and after locking one rolls two heroes", () => {
    const townState = build("ui-rc", [{ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" }]);
    const onAction = vi.fn();
    const { unmount } = render(<SetupLobbyScreen onAction={onAction} state={townState} viewerPlayerId="p1" />);
    openHeroes();

    fireEvent.click(screen.getByRole("button", { name: /Roll two towns/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "ROLL_TOWN_OPTIONS", playerId: "p1" });
    unmount();

    // After rolling and locking a town, the hero roll appears.
    const rolled = build("ui-rc", [{ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" }, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" }]);
    const townOptions = rolled.setupLobby?.draft?.seatRolls?.p1?.townOptions ?? [];
    expect(townOptions.length).toBe(2);
    const heroState = applyAction(rolled, { type: "CHOOSE_TOWN", playerId: "p1", factionId: townOptions[0] }).state;

    const onAction2 = vi.fn();
    render(<SetupLobbyScreen onAction={onAction2} state={heroState} viewerPlayerId="p1" />);
    openHeroes();
    fireEvent.click(screen.getByRole("button", { name: /Roll two heroes/ }));
    expect(onAction2).toHaveBeenCalledWith({ type: "ROLL_HERO_OPTIONS", playerId: "p1" });
  });
});
