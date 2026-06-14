// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TownPanel } from "./screen";
import { createAdventureGameState, getLegalActions } from "@/engine";
import type { FactionId } from "@/data/factions/types";

afterEach(cleanup);

/**
 * The town panel reads the viewer's faction (for the building list) and the
 * town it controls (for what is built). We seed a real adventure game, then
 * point p1 at the faction whose special building we want to exercise and mark
 * the building built — independent of which faction the seed happened to deal.
 */
function townWith(factionId: FactionId, built: string[]) {
  const state = createAdventureGameState({ seed: "ui-bld", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  state.players.p1.factionId = factionId;
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
  if (!town) {
    throw new Error("p1 should control a town");
  }
  town.factionId = factionId;
  town.buildings = [...built];
  return { state, town };
}

function tileFor(name: string): HTMLElement {
  const tile = screen.getByText(name).closest(".townBuilding");
  if (!(tile instanceof HTMLElement)) {
    throw new Error(`no building tile for ${name}`);
  }
  return tile;
}

function openPanel(buildingName: string): HTMLElement {
  fireEvent.click(within(tileFor(buildingName)).getByRole("button", { name: /Effect|Use/ }));
  return screen.getByLabelText(`${buildingName} effect`);
}

describe("TownPanel — in-place special-building effect / use buttons", () => {
  it("explains Inferno's Brimstone Stormclouds and its stored combat cubes", () => {
    const { state, town } = townWith("inferno", ["inferno.brimstone_stormclouds"]);
    town.factionCubes = { "inferno.brimstone_stormclouds": 2 };
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Brimstone Stormclouds");
    expect(panel.textContent).toMatch(/\+1 Power/i);
    // Live cube status reflects the two cubes we stored.
    expect(panel.textContent).toMatch(/2 of 3 faction cubes/i);
  });

  it("explains Stronghold's Hall of Valhalla as a once-per-round combat boost", () => {
    const { state } = townWith("stronghold", ["stronghold.hall_of_valhalla"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Hall of Valhalla");
    expect(panel.textContent).toMatch(/\+1 attack/i);
    expect(panel.textContent).toMatch(/once per round/i);
    expect(panel.textContent).toMatch(/offered in combat/i);
  });

  it("marks Stronghold's Freelancer's Guild as an always-on bonus", () => {
    const { state } = townWith("stronghold", ["stronghold.freelancers_guild"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const panel = openPanel("Freelancer's Guild");
    expect(panel.textContent).toMatch(/win against Neutral Units, gain 1 gold/i);
    expect(panel.textContent).toMatch(/always on/i);
  });

  it("lets the player exploit Castle Gate in place and dispatches its action", () => {
    const { state } = townWith("inferno", ["inferno.castle_gate"]);
    state.players.p1.resources.gold = 10;
    // Exactly one opponent (p2) holds a card, so the random-discard option is
    // offered once and unambiguously.
    for (const candidate of Object.values(state.players)) {
      if (candidate.id !== "p1" && candidate.id !== "neutrals") {
        candidate.hand = candidate.id === "p2" ? ["stat.attack"] : [];
      }
    }
    const onAction = vi.fn();
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />);

    // An available action shows the "Use" affordance, not just "Effect".
    fireEvent.click(within(tileFor("Castle Gate")).getByRole("button", { name: /Use/ }));
    const panel = screen.getByLabelText("Castle Gate effect");
    fireEvent.click(within(panel).getByRole("button", { name: /random discard/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({
      type: "USE_TOWN_BUILDING",
      playerId: "p1",
      buildingId: "inferno.castle_gate"
    });
  });

  it("offers no effect button for a plain dwelling", () => {
    const { state } = townWith("castle", ["castle.dwelling_bronze"]);
    render(<TownPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    expect(within(tileFor("Towers")).queryByRole("button", { name: /Effect|Use/ })).toBeNull();
  });
});
