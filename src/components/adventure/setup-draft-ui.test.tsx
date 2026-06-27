// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SetupLobbyScreen } from "./screen";
import { createAdventureLobbyState } from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";

afterEach(cleanup);

describe("SetupLobbyScreen — hero detail panel", () => {
  it("clicking a hero shows its stats, starting ability and all three specialties", () => {
    const state = createAdventureLobbyState({ seed: "ui-detail" });
    render(<SetupLobbyScreen onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // Before any click, the detail is just a prompt.
    expect(screen.queryByLabelText("Catherine details")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Catherine/ }));

    const detail = screen.getByLabelText("Catherine details");
    const hero = coreHeroDefinitions.catherine;

    // Stats — the group's accessible name encodes the live value, so a wrong
    // binding (e.g. showing defense for power) fails this query.
    expect(within(detail).getByRole("group", { name: `Attack ${hero.startingStats.attack}` })).toBeTruthy();
    expect(within(detail).getByRole("group", { name: `Defense ${hero.startingStats.defense}` })).toBeTruthy();
    expect(within(detail).getByRole("group", { name: `Power ${hero.startingStats.power}` })).toBeTruthy();
    expect(within(detail).getByRole("group", { name: `Knowledge ${hero.startingStats.knowledge}` })).toBeTruthy();

    // Starting ability name (Leadership).
    expect(within(detail).getByText(cardLibrary[hero.startingAbilityCardId].name)).toBeTruthy();

    // All three specialty levels by their real card names (Crusaders I/IV/VI).
    for (const level of [1, 4, 6] as const) {
      const card = cardLibrary[hero.specialtyCardIds[level]];
      expect(within(detail).getByText(card.name), `specialty ${level}`).toBeTruthy();
    }
  });

  it("the info button inspects a hero without choosing them", () => {
    const state = createAdventureLobbyState({ seed: "ui-info" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    // The info button sits in the same row as the Rion pick button.
    const rionRow = screen.getByRole("button", { name: /Rion/ }).closest(".lobbyHeroRow") as HTMLElement;
    const infoButton = within(rionRow).getByRole("button", { name: "Show hero details" });
    fireEvent.click(infoButton);

    expect(screen.getByLabelText("Rion details")).toBeTruthy();
    // Inspecting must not commit the seat to that hero.
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe("SetupLobbyScreen — Draft & random tab", () => {
  it("rolls a random town and hero via RANDOM_ASSIGN_SEAT", () => {
    const state = createAdventureLobbyState({ seed: "ui-draft" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByRole("tab", { name: /Draft/ }));
    fireEvent.click(screen.getByRole("button", { name: /Random town/ }));

    expect(onAction).toHaveBeenCalledWith({ type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" });
  });

  it("turning on ban-pick dispatches SET_DRAFT_MODE", () => {
    const state = createAdventureLobbyState({ seed: "ui-mode" });
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByRole("tab", { name: /Draft/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ban-pick" }));

    expect(onAction).toHaveBeenCalledWith({ type: "SET_DRAFT_MODE", playerId: "p1", mode: "ban" });
  });

  it("in ban-pick mode a hero chip dispatches TOGGLE_HERO_BAN and the banned hero is unpickable in the grid", () => {
    const state = createAdventureLobbyState({ seed: "ui-ban" });
    // Drive the screen from a state already in ban mode with Catherine banned.
    state.setupLobby!.draft = { mode: "ban", bannedHeroDefIds: ["catherine"] };
    const onAction = vi.fn();
    render(<SetupLobbyScreen onAction={onAction} state={state} viewerPlayerId="p1" />);

    // Grid (Heroes tab): the banned hero's pick button is disabled.
    const pickCatherine = screen.getByRole("button", { name: /Catherine/ }) as HTMLButtonElement;
    expect(pickCatherine.disabled, "banned hero is unpickable").toBe(true);

    // Draft tab: a banned chip is pressed, and clicking an open hero bans them.
    fireEvent.click(screen.getByRole("tab", { name: /Draft/ }));
    const banList = screen.getByLabelText("Ban heroes");
    expect((within(banList).getByRole("button", { name: /Catherine/ }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(within(banList).getByRole("button", { name: /Rion/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "TOGGLE_HERO_BAN", playerId: "p1", heroDefId: "rion" });
  });
});
