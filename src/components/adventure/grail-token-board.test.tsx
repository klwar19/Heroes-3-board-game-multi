// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameState
} from "@/engine";
import { HexMapBoard } from "./screen";

afterEach(cleanup);

function renderBoard(state: GameState): void {
  render(
    <HexMapBoard
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={vi.fn()}
      placement={null}
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />
  );
}

describe("Grail token map marker", () => {
  it("follows the carrying Hero pawn", () => {
    const state = createAdventureGameState({ seed: "grail-map-carried", rollFirstPlayer: false });
    state.adventure!.grail = { status: "carried", carrierHeroId: "hero_p1" };

    renderBoard(state);

    expect(screen.getByRole("img", { name: "Carrying the Grail" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Grail built here" })).toBeNull();
  });

  it("stays on the controlled location after construction", () => {
    const state = createAdventureGameState({ seed: "grail-map-built", rollFirstPlayer: false });
    const fieldId = state.heroes.hero_p1!.spaceId!;
    state.adventure!.grail = { status: "built", builtFieldId: fieldId };

    renderBoard(state);

    expect(screen.getByRole("img", { name: "Grail built here" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Carrying the Grail" })).toBeNull();
  });
});
