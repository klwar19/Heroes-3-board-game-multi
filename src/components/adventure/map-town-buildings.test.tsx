// @vitest-environment jsdom
/**
 * Map town-buildings dock: a MAP-screen shortcut that lets a player USE their
 * controlled town's special building actions without opening the town window.
 *
 * The dock is READ from the live legal actions — it appears IFF the engine is
 * offering a building use to this seat right now, and opening it reuses the town
 * view's own BuildingDetailPanel so the action dispatches the real engine
 * payload. Each assertion below fails if that wiring is removed, and the CONTROL
 * (a town with no actionable special building) pins that the gate is the
 * actionable building, not merely controlling a town or having an open turn.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { MapTownBuildingsDock } from "./map-town-buildings";
import {
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  type GameState,
  type TownState
} from "@/engine";

afterEach(cleanup);

/** p1's controlled town in a fresh adventure state. */
function viewerTown(state: GameState): TownState {
  return Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
}

/**
 * A fresh adventure with p1 to act, a hero moved away from town, and a hand/deck
 * ready — exactly the "usable from anywhere on your turn" setup the engine test
 * `cover-of-darkness.test.ts` uses. The caller decides which special building
 * (if any) the town has built.
 */
function mapActionState(): GameState {
  const state = createAdventureGameState({ seed: "map-town-buildings", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  getMainHero(state, "p1")!.spaceId = "99,99";
  state.players.p1.hand = ["stat.attack", "ability.necromancy"];
  state.players.p1.discard = [];
  state.players.p1.deck = ["stat.defense", "stat.power"];
  return state;
}

function renderDock(state: GameState, onAction = vi.fn()) {
  const view = render(
    <MapTownBuildingsDock
      legalActions={getLegalActions(state, "p1")}
      onAction={onAction}
      state={state}
      viewerPlayerId="p1"
    />
  );
  return { ...view, onAction };
}

describe("MapTownBuildingsDock — use town buildings from the map", () => {
  it("shows the button when a controlled town has an actionable special building", () => {
    const state = mapActionState();
    viewerTown(state).buildings.push("necropolis.cover_of_darkness");
    const { container } = renderDock(state);
    expect(container.querySelector(".mapTownBuildingsButton")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use Cover of Darkness/i })).toBeTruthy();
  });

  it("opens a window that renders the Cover of Darkness panel and dispatches USE_TOWN_BUILDING", () => {
    const state = mapActionState();
    viewerTown(state).buildings.push("necropolis.cover_of_darkness");
    const { onAction } = renderDock(state);

    fireEvent.click(screen.getByRole("button", { name: /Use Cover of Darkness/i }));

    const dialog = screen.getByRole("dialog", { name: /Town building actions/i });
    const panel = within(dialog).getByLabelText("Cover of Darkness effect");
    expect(panel).toBeTruthy();

    // Pick a hand card, then trigger the real building action from the reused
    // BuildingDetailPanel — the map dock must fire the engine payload, not a stub.
    const checkboxes = panel.querySelectorAll("input[type='checkbox']");
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(within(panel).getByRole("button", { name: /Discard .*and draw/i }));

    const call = onAction.mock.calls.find((c) => c[0]?.type === "USE_TOWN_BUILDING");
    expect(call, "the panel should dispatch a USE_TOWN_BUILDING").toBeTruthy();
    expect(call![0].buildingId).toBe("necropolis.cover_of_darkness");
    expect(call![0].playerId).toBe("p1");
  });

  it("CONTROL: a controlled town with no actionable special building shows no button", () => {
    const state = mapActionState();
    // Same open turn, same hand — the ONLY difference from the first test is that
    // the town offers no special building action, so the dock must not appear.
    viewerTown(state).buildings = [];
    const { container } = renderDock(state);
    expect(container.querySelector(".mapTownBuildingsButton")).toBeNull();
    expect(container.querySelector(".mapTownBuildingsDock")).toBeNull();
    expect(screen.queryByRole("button", { name: /Use .*[Bb]uilding/i })).toBeNull();
  });
});
