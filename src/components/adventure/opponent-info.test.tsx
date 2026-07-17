// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OpponentInfoDock } from "./opponent-info";
import { CardZoomProvider } from "../table/zoom";
import { createAdventureGameState, type GameState } from "@/engine";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";

afterEach(cleanup);

/**
 * A 2-player game where p1 is the viewer and p2 the opponent, with p2's PUBLIC
 * state set to distinctive values so the panel can be checked against them.
 */
function twoPlayerGame(): GameState {
  const state = createAdventureGameState({
    seed: "opp-info-ui",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.players.p2.resources.gold = 42;
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p2");
  if (!town) throw new Error("p2 should control a town");
  town.buildings = ["necropolis.city_hall"];
  const hero = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main");
  if (!hero) throw new Error("p2 should have a main hero");
  hero.level = 3;
  state.players.p2.army = [{ id: "u1", unitDefId: "necropolis.skeletons", side: "few" }];
  return state;
}

/** Render the map-variant dock — the seated map placement in the left rail. */
function renderMapDock(state: GameState) {
  return render(
    <CardZoomProvider>
      <OpponentInfoDock seatIds={["p1", "p2"]} state={state} variant="map" viewerPlayerId="p1" />
    </CardZoomProvider>
  );
}

describe("OpponentInfoDock", () => {
  it("renders the opponent buttons in the left-rail map dock box", () => {
    const { container } = renderMapDock(twoPlayerGame());
    // Map placement: the clear labelled left-rail box…
    const box = container.querySelector(".opponentInfoDock.map");
    expect(box).toBeTruthy();
    // …carrying the per-opponent button…
    expect(within(box as HTMLElement).getByRole("button", { name: /Bob/ })).toBeTruthy();
    // …and NOT the retired HUD-ribbon cell.
    expect(container.querySelector(".advHudCell.opponents")).toBeNull();
  });

  it("shows one button per OPPONENT (not the viewer's own seat)", () => {
    renderMapDock(twoPlayerGame());
    // Bob is an opponent → a button; Alice is the viewer → no button.
    expect(screen.getByRole("button", { name: /Bob/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Alice/ })).toBeNull();
  });

  it("opens a panel with the opponent's resources, buildings, hero level and units", () => {
    renderMapDock(twoPlayerGame());
    fireEvent.click(screen.getByRole("button", { name: /Bob/ }));

    const dialog = screen.getByRole("dialog");
    const panel = within(dialog);

    // Resources (public): p2's 42 gold.
    expect(panel.getByText("42")).toBeTruthy();
    // Hero level (public): level 3.
    expect(panel.getByText(/Hero level 3/i)).toBeTruthy();
    // Buildings (public): the necropolis City Hall by its real name.
    const buildingName = coreBuildingDefinitions["necropolis.city_hall"].name;
    expect(panel.getByText(buildingName)).toBeTruthy();
    // Current units (public): the Skeletons unit by its real name.
    const unitName = coreUnitDefinitions["necropolis.skeletons"].name;
    expect(panel.getAllByText(new RegExp(unitName)).length).toBeGreaterThan(0);
  });

  it("renders nothing (no box, no button) when the viewer has no opponents", () => {
    // Solo / single-live-seat table: no floating box at all — the control
    // proving the dock leaves no empty residue anywhere.
    const { container } = render(
      <CardZoomProvider>
        <OpponentInfoDock seatIds={["p1"]} state={twoPlayerGame()} variant="map" viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    expect(container.querySelector(".opponentInfoDock")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("keeps the bordered dock box in COMBAT (the card-strip placement is unchanged)", () => {
    const { container } = render(
      <CardZoomProvider>
        <OpponentInfoDock seatIds={["p1", "p2"]} state={twoPlayerGame()} variant="combat" viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const box = container.querySelector(".opponentInfoDock.combat");
    expect(box).toBeTruthy();
    expect(within(box as HTMLElement).getByRole("button", { name: /Bob/ })).toBeTruthy();
  });
});
