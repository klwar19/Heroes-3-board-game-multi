// @vitest-environment jsdom
/**
 * The map's floating control cards (move-confirm, rotate, passive "is rotating")
 * are rendered as plain HTML overlays inside `.hexMapOuter` (siblings of the
 * isolated `.hexMapWrap`, so their z-index can beat the Far-tile tray) — NOT as SVG
 * `<foreignObject>` (mobile WebKit silently fails to paint foreignObject under
 * the map's camera transform, so on phones these cards showed nothing). These
 * tests pin the NEW DOM and the behaviour that must survive the move:
 *  - the cards render as HTML in the map wrap, with NO foreignObject anywhere;
 *  - move-confirm's "Move there" dispatches MOVE_HERO_PATH;
 *  - the rotate card renders for the rotating viewer with working CW/CCW buttons
 *    and a Confirm that dispatches SET_TILE_ROTATION;
 *  - a NON-rotating viewer sees the passive "… is rotating the new tile" card.
 * The pixel math that positions them is unit-tested in map-float-position.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  getAdjacentSpaceIds,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";

afterEach(cleanup);

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function renderBoard(
  state: GameState,
  viewerPlayerId: PlayerId = "p1",
  legalActions: LegalAction[] = getLegalActions(state, viewerPlayerId)
) {
  const onAction = vi.fn();
  const { container } = render(
    <HexMapBoard
      legalActions={legalActions}
      moveCue={null}
      onAction={onAction}
      placement={null}
      state={state}
      view={getPlayerView(state, viewerPlayerId)}
      viewerPlayerId={viewerPlayerId}
    />
  );
  return { container, onAction };
}

function clickButton(root: HTMLElement, name: RegExp): void {
  fireEvent.click(within(root).getByRole("button", { name }));
}

/** A p1 turn that can actually move: draw taken, one open crossable neighbour. */
function movableState(): { state: GameState; openSpaceId: string } {
  let state = createAdventureGameState({ seed: "map-floats", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  const heroSpace = state.heroes.hero_p1!.spaceId as string;
  let openSpaceId: string | undefined;
  for (const spaceId of getAdjacentSpaceIds(heroSpace)) {
    const field = state.adventure!.fields[spaceId];
    if (!field) {
      continue;
    }
    field.location = "empty_field";
    delete field.difficulty;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
    if (canCrossEdge(state, heroSpace, spaceId)) {
      openSpaceId = spaceId;
      break;
    }
  }
  expect(openSpaceId, "need one crossable open neighbour to move onto").toBeTruthy();
  return { state, openSpaceId: openSpaceId! };
}

describe("map floating cards — rendered as HTML overlays, not SVG foreignObject", () => {
  it("the move-confirm card renders in the map wrap (no foreignObject) and Move there dispatches MOVE_HERO_PATH", () => {
    const { state } = movableState();
    const { container, onAction } = renderBoard(state);

    // A live move target exists; clicking it opens the confirm card.
    const target = container.querySelector(".hexCell.moveTarget");
    expect(target, "a live move-target hex").toBeTruthy();
    fireEvent.click(target!);

    const card = container.querySelector(".moveConfirmFloat");
    expect(card, "the move-confirm float").toBeTruthy();
    // The fix: HTML in the map wrap, and NOTHING lives in an SVG foreignObject.
    expect(container.querySelector("foreignObject")).toBeNull();
    expect(card!.closest(".hexMapOuter")).toBeTruthy();
    expect(card!.closest(".hexMapWrap")).toBeNull(); // outside the isolated wrap so z-index beats the Far-tile tray
    expect(card!.closest("svg")).toBeNull();

    clickButton(container, /Move there/i);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "MOVE_HERO_PATH", playerId: "p1", heroId: state.heroes.hero_p1!.id })
    );
  });

  it("the rotate card renders for the rotating viewer with working CW/CCW + Confirm (dispatches SET_TILE_ROTATION)", () => {
    const state = createAdventureGameState({ seed: "map-floats-rotate", rollFirstPlayer: false });
    const tileId = Object.keys(state.adventure!.tiles)[0]!;
    state.adventure!.pendingTileChoice = { tileInstanceId: tileId, playerId: "p1", kind: "starting" };
    // Empty legal actions → no rotation is "sealed", so Confirm stays enabled and
    // the preview starts at 0° deterministically.
    const { container, onAction } = renderBoard(state, "p1", []);

    const card = container.querySelector(".rotateFloat");
    expect(card, "the rotate float for the rotating viewer").toBeTruthy();
    expect(container.querySelector("foreignObject")).toBeNull();
    expect(card!.closest(".hexMapOuter")).toBeTruthy();
    expect(card!.closest(".hexMapWrap")).toBeNull(); // outside the isolated wrap so z-index beats the Far-tile tray
    expect(within(card as HTMLElement).getByText(/Rotate your/i)).toBeTruthy();

    const degrees = () => (card!.querySelector(".rotateDegrees") as HTMLElement).textContent;
    expect(degrees()).toBe("0°");
    // Clockwise advances one 60° step; counter-clockwise winds it back.
    fireEvent.click(within(card as HTMLElement).getByTitle(/Rotate clockwise/i));
    expect(degrees()).toBe("60°");
    fireEvent.click(within(card as HTMLElement).getByTitle(/Rotate counter-clockwise/i));
    expect(degrees()).toBe("0°");

    fireEvent.click(within(card as HTMLElement).getByTitle(/Rotate clockwise/i));
    clickButton(card as HTMLElement, /Confirm/i);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: tileId, rotation: 1 })
    );
  });

  it("a NON-rotating viewer sees the passive 'is rotating the new tile' card, not the rotate controls", () => {
    const state = createAdventureGameState({ seed: "map-floats-passive", rollFirstPlayer: false });
    const tileId = Object.keys(state.adventure!.tiles)[0]!;
    // Another seat owns the rotation; the p1 viewer only watches.
    state.adventure!.pendingTileChoice = { tileInstanceId: tileId, playerId: "p2", kind: "reveal" };
    const { container } = renderBoard(state, "p1", []);

    expect(container.querySelector(".rotateFloat")).toBeNull();
    const passive = container.querySelector(".mapFloatCard.passive");
    expect(passive, "the passive watching card").toBeTruthy();
    expect(passive!.textContent).toMatch(/is rotating the new tile/i);
    expect(passive!.closest(".hexMapOuter")).toBeTruthy();
    expect(passive!.closest(".hexMapWrap")).toBeNull(); // outside the isolated wrap so z-index beats the Far-tile tray
    expect(container.querySelector("foreignObject")).toBeNull();
  });
});
