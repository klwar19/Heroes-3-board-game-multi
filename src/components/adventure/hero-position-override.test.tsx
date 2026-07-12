// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import {
  createAdventureGameState,
  getAdjacentSpaceIds,
  getLegalActions,
  getPlayerView,
  type GameState,
} from "@/engine";

afterEach(cleanup);

function renderBoard(
  state: GameState,
  overrides?: Record<string, string>,
): HTMLElement {
  const { container } = render(
    <HexMapBoard
      heroPositionOverrides={overrides}
      legalActions={getLegalActions(state, "p1")}
      moveCue={null}
      onAction={vi.fn()}
      placement={null}
      state={state}
      view={getPlayerView(state, "p1")}
      viewerPlayerId="p1"
    />,
  );
  return container;
}

/** The inline transform of a hero pawn is where it is drawn on the board. */
function pawnTransform(container: HTMLElement, heroId: string): string {
  const pawn = container.querySelector(`[data-hero-id="${heroId}"]`);
  expect(pawn, `pawn for ${heroId}`).toBeTruthy();
  return pawn!.getAttribute("style") ?? "";
}

describe("HexMapBoard hero-position override (computer-move replay)", () => {
  it("draws the pawn at the override cell — exactly as if it were really there", () => {
    const state = createAdventureGameState({ seed: "override-ui", rollFirstPlayer: false });
    const heroSpace = state.heroes.hero_p1!.spaceId as string;
    const dest = getAdjacentSpaceIds(heroSpace).find(
      (spaceId) => state.adventure!.fields[spaceId] && spaceId !== heroSpace,
    );
    expect(dest, "an adjacent materialized field").toBeTruthy();

    // The pawn's true position, and its position when overridden to `dest`.
    const trueTransform = pawnTransform(renderBoard(state), "hero_p1");
    const overriddenTransform = pawnTransform(
      renderBoard(state, { hero_p1: dest! }),
      "hero_p1",
    );
    // The override actually moved the pawn.
    expect(overriddenTransform).not.toBe(trueTransform);

    // ...and moved it to EXACTLY where the hero would draw if it truly stood on
    // `dest`: a control render with the real spaceId set to `dest`.
    const moved = createAdventureGameState({ seed: "override-ui", rollFirstPlayer: false });
    moved.heroes.hero_p1!.spaceId = dest!;
    const controlTransform = pawnTransform(renderBoard(moved), "hero_p1");
    expect(overriddenTransform).toBe(controlTransform);
  });

  it("CONTROL: overriding a hero to its own cell leaves the pawn where it was", () => {
    const state = createAdventureGameState({ seed: "override-ui", rollFirstPlayer: false });
    const heroSpace = state.heroes.hero_p1!.spaceId as string;

    const before = pawnTransform(renderBoard(state), "hero_p1");
    const same = pawnTransform(renderBoard(state, { hero_p1: heroSpace }), "hero_p1");
    expect(same).toBe(before);
  });
});
