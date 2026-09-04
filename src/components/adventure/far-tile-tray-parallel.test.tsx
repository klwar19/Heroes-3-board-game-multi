// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FarTileTray } from "./screen";
import { createAdventureGameState, getPlayerView, type GameState } from "@/engine";

/**
 * Parallel turns (2026-09-04 audit): the Ⅱ–Ⅲ supply tray is the ONLY way to
 * arm a `PLACE_TILE` placement, and it used to render only for
 * `state.activePlayerId`. In parallel mode every open turn may place a held
 * tile (`placeTile` gates on the parallel-aware `assertActiveTurn`), so a seat
 * that was not the nominal active seat had no way to place its tile at all.
 */
function makeGame(parallelTurns: number): GameState {
  const state = createAdventureGameState({
    seed: "far-tile-tray-parallel",
    difficulty: "normal",
    rollFirstPlayer: false,
    parallelTurns
  });
  // Give the non-active seat a held tile; keep heroes without movement so the
  // tray never asks the geometry for a placement (the tray's presence is the
  // contract under test, not its per-tile usability).
  state.adventure!.playerFarTiles.p2 = ["far.gold_mine"];
  for (const hero of Object.values(state.heroes)) {
    hero.movementPoints = 0;
  }
  state.activePlayerId = "p1";
  return state;
}

function renderTray(state: GameState, viewer: "p1" | "p2") {
  return render(
    <FarTileTray
      state={state}
      view={getPlayerView(state, viewer)}
      viewerPlayerId={viewer}
      placement={null}
      onTogglePlacement={() => {}}
    />
  );
}

describe("FarTileTray — parallel turns", () => {
  afterEach(() => cleanup());

  it("renders for a seat whose PARALLEL turn is open even though it is not activePlayerId", () => {
    const state = makeGame(3);
    expect(state.turn.mode).toBe("parallel");
    const { container } = renderTray(state, "p2");
    expect(container.querySelector(".farTileTray")).not.toBeNull();
    expect(container.querySelectorAll(".farTileBack")).toHaveLength(1);
  });

  it("stays hidden once that seat has ENDED its parallel turn", () => {
    const state = makeGame(3);
    state.turn.completedPlayerIds = ["p2"];
    const { container } = renderTray(state, "p2");
    expect(container.querySelector(".farTileTray")).toBeNull();
  });

  it("CONTROL: in ordered mode the non-active seat still sees no tray", () => {
    const state = makeGame(0);
    expect(state.turn.mode).toBe("ordered");
    const { container } = renderTray(state, "p2");
    expect(container.querySelector(".farTileTray")).toBeNull();
  });
});
