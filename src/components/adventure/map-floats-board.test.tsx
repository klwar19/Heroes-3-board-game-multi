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

  it("clicking the occupied hex dispatches a freshly reopened one-use field", () => {
    const { state } = movableState();
    const hero = state.heroes.hero_p1!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.location = "water_wheel";
    field.blackCube = false; // cleared by a timed/round event while the hero stands here
    hero.movementPoints = 3;

    const legalActions = getLegalActions(state, "p1");
    const resolve = legalActions.find(
      (entry) => entry.action.type === "REVISIT_FIELD" && entry.action.heroId === hero.id
    );
    expect(resolve?.label).toMatch(/Resolve Water Wheel/i);

    const { container, onAction } = renderBoard(state, "p1", legalActions);
    const occupied = container.querySelector(`.hexCell[data-space-id="${hero.spaceId}"]`);
    expect(occupied, "the hero's newly reopened field should be clickable").toBeTruthy();
    fireEvent.click(occupied!);
    expect(onAction).toHaveBeenCalledWith(resolve!.action);

    const resolved = applyOk(state, resolve!.action);
    expect(resolved.adventure!.fields[hero.spaceId!].blackCube).toBe(true);
    expect(resolved.heroes.hero_p1!.movementPoints).toBe(2);
  });

  it("a reopened field whose GUARD was also re-armed offers no Resolve (the fight comes first)", () => {
    // clear_tile_cubes re-seeds printed guards along with the cube: resolving
    // from the occupied hex would hand out the reward without the fight.
    const { state } = movableState();
    const hero = state.heroes.hero_p1!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.location = "water_wheel";
    field.blackCube = false;
    field.difficulty = 2; // the re-armed guard
    field.everFlagged = false;
    hero.movementPoints = 3;

    const legalActions = getLegalActions(state, "p1");
    expect(
      legalActions.some((entry) => entry.action.type === "REVISIT_FIELD" && entry.action.heroId === hero.id)
    ).toBe(false);
    const forged = applyAction(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: hero.id });
    expect(forged.errors[0]?.message).toMatch(/revisitable or newly reopened/i);
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

describe("map floating cards — designer altered-guard preview + confirm", () => {
  /** A p1 turn with a reachable, guarded neighbour — optionally designer-altered. */
  function guardedNeighbour(seed: string, altered: boolean): { state: GameState; spaceId: string } {
    let state = createAdventureGameState({ seed, rollFirstPlayer: false });
    state.activePlayerId = "p1";
    if (state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    // Ample movement so stepping onto the neighbour is a normal target (not an
    // end-of-turn move, which would dispatch directly with no confirm float).
    state.heroes.hero_p1!.movementPoints = 5;
    const heroSpace = state.heroes.hero_p1!.spaceId as string;
    for (const spaceId of getAdjacentSpaceIds(heroSpace)) {
      const field = state.adventure!.fields[spaceId];
      if (!field) {
        continue;
      }
      field.location = "empty_field";
      field.difficulty = 2;
      field.blackCube = false;
      field.flagOwnerId = null;
      field.everFlagged = false;
      delete field.customGuardUnits;
      delete field.designedGuard;
      if (altered) {
        field.designedGuard = true;
        field.customGuardUnits = ["neutral.cyclopes", "neutral.troglodytes"];
      }
      if (canCrossEdge(state, heroSpace, spaceId)) {
        return { state, spaceId };
      }
    }
    throw new Error("need a crossable guarded neighbour");
  }

  it("marks the hex and warns with the guard's army + an Attack button before an altered fight", () => {
    const { state, spaceId } = guardedNeighbour("altered-guard-confirm", true);
    const { container } = renderBoard(state);
    // The map flags the altered fight at a glance (gear + data attribute).
    expect(container.querySelector('[data-altered-guard="true"]')).toBeTruthy();
    expect(container.querySelector(".hexAlteredGuard")).toBeTruthy();

    const hex = container.querySelector(`.hexCell[data-space-id="${spaceId}"]`) as HTMLElement;
    expect(hex, "the altered guarded neighbour hex").toBeTruthy();
    fireEvent.click(hex);

    const float = container.querySelector(".moveConfirmFloat") as HTMLElement;
    expect(float, "the move-confirm float").toBeTruthy();
    const warn = float.querySelector(".alteredGuardWarn");
    expect(warn, "the altered-guard warning").toBeTruthy();
    expect(warn!.textContent).toContain("Cyclopes");
    expect(warn!.textContent).toContain("Troglodytes");
    // The primary button reads "Attack", not "Move there".
    expect(within(float).getByRole("button", { name: /Attack/i })).toBeTruthy();
  });

  it("CONTROL: a PRINTED guard shows the plain Move there, no altered warning", () => {
    const { state, spaceId } = guardedNeighbour("printed-guard-confirm", false);
    const { container } = renderBoard(state);
    expect(container.querySelector('[data-altered-guard="true"]')).toBeNull();

    const hex = container.querySelector(`.hexCell[data-space-id="${spaceId}"]`) as HTMLElement;
    fireEvent.click(hex);
    const float = container.querySelector(".moveConfirmFloat") as HTMLElement;
    expect(float).toBeTruthy();
    expect(float.querySelector(".alteredGuardWarn")).toBeNull();
    expect(within(float).getByRole("button", { name: /Move there/i })).toBeTruthy();
  });
});

describe("map floating cards — click-to-inspect a designer-altered object", () => {
  it("clicking an altered hex OUT of movement reach opens the guard-details float; a second click closes it", () => {
    // Reuse the altered-guard neighbour but drain the hero's movement so the
    // hex is NOT a move target (no move-confirm float competes) — the click
    // falls through to the inspect handler.
    let state = createAdventureGameState({ seed: "inspect-altered", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    if (state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.heroes.hero_p1!.movementPoints = 0;
    const heroSpace = state.heroes.hero_p1!.spaceId as string;
    const spaceId = getAdjacentSpaceIds(heroSpace).find((id) => state.adventure!.fields[id]);
    expect(spaceId, "an adjacent field").toBeTruthy();
    const field = state.adventure!.fields[spaceId!];
    field.location = "mine";
    field.difficulty = 4;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
    field.designedGuard = true;
    field.customGuardUnits = ["neutral.cyclopes", "neutral.troglodytes"];
    field.designerReward = { gold: 7 };
    field.designerRewardVp = 2;

    const { container } = renderBoard(state);
    const hex = container.querySelector(`.hexCell[data-space-id="${spaceId}"]`) as HTMLElement;
    expect(hex).toBeTruthy();
    fireEvent.click(hex);

    const float = container.querySelector(".designedGuardInspectFloat") as HTMLElement;
    expect(float, "the inspect float").toBeTruthy();
    expect(float.textContent).toContain("altered by the map designer");
    expect(float.textContent).toContain("Cyclopes");
    expect(float.textContent).toContain("Troglodytes");
    expect(float.textContent).toContain("7 gold");
    expect(float.textContent).toContain("+2 VP");

    // A second click on the same hex closes it.
    fireEvent.click(hex);
    expect(container.querySelector(".designedGuardInspectFloat")).toBeNull();
  });

  it("CONTROL: a plain printed field out of reach opens nothing on click", () => {
    let state = createAdventureGameState({ seed: "inspect-plain", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    if (state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.heroes.hero_p1!.movementPoints = 0;
    const heroSpace = state.heroes.hero_p1!.spaceId as string;
    const spaceId = getAdjacentSpaceIds(heroSpace).find((id) => state.adventure!.fields[id]);
    const field = state.adventure!.fields[spaceId!];
    field.location = "mine";
    field.difficulty = 4;
    delete field.designedGuard;
    delete field.customGuardUnits;

    const { container } = renderBoard(state);
    const hex = container.querySelector(`.hexCell[data-space-id="${spaceId}"]`) as HTMLElement;
    fireEvent.click(hex);
    expect(container.querySelector(".designedGuardInspectFloat")).toBeNull();
  });
});

describe("map floating cards — Polish strength-based Quick Combat readout", () => {
  /** A p1 turn with a reachable, ordinary guarded neighbour; house rule toggled. */
  function guardedNeighbour(seed: string, ruleOn: boolean): { state: GameState; spaceId: string } {
    let state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      houseRules: { "polish-quick-combat": ruleOn }
    });
    state.activePlayerId = "p1";
    if (state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.heroes.hero_p1!.movementPoints = 5;
    const heroSpace = state.heroes.hero_p1!.spaceId as string;
    for (const spaceId of getAdjacentSpaceIds(heroSpace)) {
      const field = state.adventure!.fields[spaceId];
      if (!field) {
        continue;
      }
      field.location = "empty_field";
      field.difficulty = 2;
      field.blackCube = false;
      field.flagOwnerId = null;
      field.everFlagged = false;
      delete field.customGuardUnits;
      delete field.designedGuard;
      if (canCrossEdge(state, heroSpace, spaceId)) {
        return { state, spaceId };
      }
    }
    throw new Error("need a crossable guarded neighbour");
  }

  it("the move-confirm float shows the viewer's army strength vs. the required strength (rule ON)", () => {
    const { state, spaceId } = guardedNeighbour("pqc-float-on", true);
    const { container } = renderBoard(state);
    fireEvent.click(container.querySelector(`.hexCell[data-space-id="${spaceId}"]`)!);

    const note = container.querySelector(".moveConfirmFloat .quickCombatNote") as HTMLElement;
    expect(note, "the Quick Combat readout").toBeTruthy();
    expect(note.textContent).toMatch(/army strength/i);
    expect(note.textContent).toMatch(/needs/i);
  });

  it("CONTROL: no readout when the rule is OFF", () => {
    const { state, spaceId } = guardedNeighbour("pqc-float-off", false);
    const { container } = renderBoard(state);
    fireEvent.click(container.querySelector(`.hexCell[data-space-id="${spaceId}"]`)!);

    expect(container.querySelector(".moveConfirmFloat"), "the move-confirm float still opens").toBeTruthy();
    expect(container.querySelector(".quickCombatNote"), "but no Quick Combat readout").toBeNull();
  });
});
