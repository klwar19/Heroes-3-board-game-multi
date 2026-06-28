// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { applyAction, createAdventureLobbyState } from "@/engine";
import type { GameAction, GameState } from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";

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

describe("SetupLobbyScreen — hero info popup", () => {
  it("opens a closeable popup with stats, ability and all three specialties; inspecting does not choose", () => {
    const state = createAdventureLobbyState({ seed: "ui-popup" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

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
      expect(within(detail).getByText(cardLibrary[hero.specialtyCardIds[level]].name), `specialty ${level}`).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: "Draft (ban-pick)" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });

    fireEvent.click(screen.getByRole("button", { name: "Full random" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random" });

    fireEvent.click(screen.getByRole("button", { name: "Random with choice" }));
    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" });
  });
});

describe("SetupLobbyScreen — TYPE 4 free pick", () => {
  it("clicking a hero dispatches CHOOSE_FACTION", () => {
    const state = createAdventureLobbyState({ seed: "ui-open" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

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

    fireEvent.click(screen.getByRole("button", { name: /Roll random town/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
  });
});

describe("SetupLobbyScreen — TYPE 1 draft", () => {
  it("the town phase rolls two towns and locks a directly-selected town", () => {
    const state = build("ui-draft-town", [{ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" }]);
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /Roll two towns/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "ROLL_TOWN_OPTIONS", playerId: "p1" });

    // The direct-select town buttons each lock that town.
    fireEvent.click(screen.getByRole("button", { name: /Castle/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" });
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

describe("SetupLobbyScreen — TYPE 3 random with choice", () => {
  it("rolls two towns, and after locking one rolls two heroes", () => {
    const townState = build("ui-rc", [{ type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" }]);
    const onAction = vi.fn();
    const { unmount } = render(<SetupLobbyScreen onAction={onAction} state={townState} viewerPlayerId="p1" />);

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
    fireEvent.click(screen.getByRole("button", { name: /Roll two heroes/ }));
    expect(onAction2).toHaveBeenCalledWith({ type: "ROLL_HERO_OPTIONS", playerId: "p1" });
  });
});
