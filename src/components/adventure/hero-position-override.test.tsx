// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

describe("hero pawn on a STANDALONE teleport-object hex (Monolith) is selectable", () => {
  // Reported: "I can't interact with a hero standing on a monolith — you select
  // the monolith instead of the hero." The standalone-hex pawn was hardcoded
  // pointer-events:none with no onClick, so a click always fell through to the
  // object hex underneath, whose click dispatches the Monolith revisit/travel.
  // The pawn must take the SAME click-to-switch wiring the tile-hex pawn has.
  function standaloneMonolithState(): GameState {
    const state = createAdventureGameState({ seed: "standalone-pawn", rollFirstPlayer: false });
    const main = state.heroes.hero_p1!;
    const spaceId = "h:50:50";
    state.adventure!.fields[spaceId] = {
      spaceId,
      tileInstanceId: `object:${spaceId}`,
      slot: 0,
      location: "monolith",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      standalone: true,
    } as never;
    state.heroes.sec_p1 = { ...main, id: "sec_p1", kind: "secondary", spaceId };
    return state;
  }

  it("the own pawn is click-enabled and clicking it switches the active hero", () => {
    const state = standaloneMonolithState();
    const onAction = vi.fn();
    const { container } = render(
      <HexMapBoard
        legalActions={getLegalActions(state, "p1")}
        moveCue={null}
        onAction={onAction}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />,
    );
    const pawn = container.querySelector('[data-hero-id="sec_p1"]')!;
    // The fix: the pawn accepts pointer events (it was "none" — click-through).
    expect(pawn.getAttribute("style") ?? "").toContain("pointer-events: auto");

    // Before the click the gold active ring sits on the MAIN hero's pawn.
    expect(container.querySelector('[data-hero-id="sec_p1"] circle[stroke="#ffd34d"]')).toBeNull();
    fireEvent.click(pawn);
    // The click SELECTED the hero (ring moves) and never fired a map action —
    // in particular not the Monolith's revisit/teleport underneath.
    expect(container.querySelector('[data-hero-id="sec_p1"] circle[stroke="#ffd34d"]')).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("CONTROL: an opponent's pawn on the same hex stays click-transparent", () => {
    const state = standaloneMonolithState();
    state.heroes.sec_p1!.controllerId = "p2";
    const { container } = render(
      <HexMapBoard
        legalActions={getLegalActions(state, "p1")}
        moveCue={null}
        onAction={vi.fn()}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />,
    );
    const pawn = container.querySelector('[data-hero-id="sec_p1"]')!;
    expect(pawn.getAttribute("style") ?? "").toContain("pointer-events: none");
  });
});
