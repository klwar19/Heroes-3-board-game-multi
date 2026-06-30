// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  observatoryRevealTargets,
  type GameAction,
  type GameState
} from "@/engine";
import { HexMapBoard, PromptTray } from "./screen";

afterEach(cleanup);

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function dimensionDoorChoice(): GameState {
  let state = createAdventureGameState({ seed: "dimension-door-board", rollFirstPlayer: false });
  state.players.p1.canMulligan = false;
  state.players.p1.needsHandRefresh = false;
  state.players.p1.hand = ["spell.dimension_door"];
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "spell.dimension_door" &&
      legal.action.optionIndex === 0
  );
  expect(play, "Dimension Door needs a Power 0 map play").toBeTruthy();
  state = applyOk(state, play!.action);
  expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("dimension-door");
  return state;
}

describe("map spell destinations on the adventure board", () => {
  it("highlights every Dimension Door destination and dispatches its choice by clicking the hex", () => {
    const state = dimensionDoorChoice();
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "dimension-door") {
      throw new Error("missing Dimension Door choice");
    }
    const destination = choice.dimensionDoor!.destinations[0];
    const onAction = vi.fn<(action: GameAction) => void>();
    const { container } = render(
      <HexMapBoard
        legalActions={getLegalActions(state, "p1")}
        moveCue={null}
        onAction={onAction}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );

    const target = container.querySelector<SVGPolygonElement>(`[data-space-id="${destination}"]`);
    expect(target).toBeTruthy();
    expect(target!.classList.contains("mapChoiceTarget")).toBe(true);
    fireEvent.click(target!);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 0
    });
  });

  it("uses readable location-and-distance labels instead of raw hex codes", () => {
    const state = dimensionDoorChoice();
    render(
      <PromptTray
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        state={state}
        viewerPlayerId="p1"
      />
    );

    const labels = screen.getAllByRole("button").map((button) => button.textContent ?? "");
    expect(labels.some((label) => /field(?:s)? away/i.test(label))).toBe(true);
    expect(labels.some((label) => /h:-?\d+:-?\d+/.test(label))).toBe(false);
  });
});

describe("map-object tile choices on the adventure board", () => {
  it("lets a Redwood Observatory reveal an adjacent face-down tile by clicking that tile", () => {
    const state = createAdventureGameState({ seed: "observatory-board", rollFirstPlayer: false });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    const hero = state.heroes.hero_p1;
    const field = state.adventure!.fields[hero.spaceId!];
    const sourceTile = state.adventure!.tiles[field.tileInstanceId];
    const candidates = observatoryRevealTargets(state, hero, sourceTile);
    expect(candidates.length, "the scenario should place a face-down tile next to the home tile").toBeGreaterThan(0);
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "DISCOVER_ADJACENT_TILE" }]
    };

    const legalActions = getLegalActions(state, "p1");
    const expectedAction = legalActions.find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 0
    )?.action;
    expect(expectedAction).toBeTruthy();
    const onAction = vi.fn<(action: GameAction) => void>();
    const { container } = render(
      <HexMapBoard
        legalActions={legalActions}
        moveCue={null}
        onAction={onAction}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );

    const target = container.querySelector<SVGPolygonElement>(`[data-tile-id="${candidates[0].id}"]`);
    expect(target).toBeTruthy();
    expect(target!.classList.contains("discoverable")).toBe(true);
    fireEvent.click(target!);
    expect(onAction).toHaveBeenCalledWith(expectedAction);
  });

  it("draws a clickable preview at the future centre when the Observatory can place a brand-new Far tile", () => {
    const state = createAdventureGameState({ seed: "observatory-place-board", rollFirstPlayer: false });
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    const hero = state.heroes.hero_p1;
    const field = state.adventure!.fields[hero.spaceId!];
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "DISCOVER_ADJACENT_TILE" }]
    };
    const legalActions = getLegalActions(state, "p1");
    const placement = legalActions.find((legal) => legal.action.type === "PLACE_OBSERVATORY_TILE")?.action;
    expect(placement, "the starting map should leave an Observatory Far-tile slot open").toBeTruthy();
    const onAction = vi.fn<(action: GameAction) => void>();
    const { container } = render(
      <HexMapBoard
        legalActions={legalActions}
        moveCue={null}
        onAction={onAction}
        placement={null}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );

    const marker = container.querySelector<SVGGElement>('.observatoryPlacementTarget[aria-label="Place a Far tile here"]');
    expect(marker).toBeTruthy();
    fireEvent.click(marker!);
    expect(onAction).toHaveBeenCalledWith(placement);
  });
});
