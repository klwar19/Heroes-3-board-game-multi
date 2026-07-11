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

function renderDock(state: GameState) {
  return render(
    <CardZoomProvider>
      <OpponentInfoDock seatIds={["p1", "p2"]} state={state} variant="map" viewerPlayerId="p1" />
    </CardZoomProvider>
  );
}

describe("OpponentInfoDock", () => {
  it("shows one button per OPPONENT (not the viewer's own seat)", () => {
    renderDock(twoPlayerGame());
    // Bob is an opponent → a button; Alice is the viewer → no button.
    expect(screen.getByRole("button", { name: /Bob/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Alice/ })).toBeNull();
  });

  it("opens a panel with the opponent's resources, buildings, hero level and units", () => {
    renderDock(twoPlayerGame());
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

  it("renders nothing when the viewer has no opponents", () => {
    const { container } = render(
      <CardZoomProvider>
        <OpponentInfoDock seatIds={["p1"]} state={twoPlayerGame()} variant="combat" viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    expect(container.querySelector(".opponentInfoDock")).toBeNull();
  });
});
