// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HexMapBoard } from "./screen";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  getAdjacentSpaceIds,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState
} from "@/engine";

afterEach(cleanup);

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Clean a field to a plain, unguarded location with no cubes/flags. */
function setField(state: GameState, spaceId: string, location: string): void {
  const field = state.adventure!.fields[spaceId]!;
  field.location = location;
  delete field.difficulty;
  field.blackCube = false;
  field.flagOwnerId = null;
  field.everFlagged = false;
}

/**
 * Sets up a p1 turn with the Logistics (basic) effect, exactly ONE crossable
 * adjacent empty field as the destination, and every other adjacent field
 * blocked — then ends the turn so the engine opens the "move to an adjacent
 * empty field" choice. Returns the state plus the single destination spaceId.
 */
function logisticsOfferState(): { state: GameState; destination: string } {
  let state = createAdventureGameState({ seed: "logi-ui", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = ["ability.logistics"];

  const heroSpace = state.heroes.hero_p1!.spaceId as string;
  // Adjacent fields that are materialized and crossable once cleared.
  const adjacent = getAdjacentSpaceIds(heroSpace).filter((spaceId) => {
    if (!state.adventure!.fields[spaceId]) {
      return false;
    }
    setField(state, spaceId, "empty_field");
    return canCrossEdge(state, heroSpace, spaceId);
  });
  expect(adjacent.length).toBeGreaterThanOrEqual(2);

  // Exactly one stays an empty field (the destination); block the rest so the
  // offer has a single, predictable target to highlight.
  const [destination, ...others] = adjacent;
  for (const spaceId of others) {
    setField(state, spaceId, "blocked_field");
  }

  state = applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "ability.logistics",
    mode: "basic",
    optionIndex: 0,
    target: { type: "none" }
  });
  state = applyOk(state, { type: "END_TURN", playerId: "p1" });

  const step = state.adventure?.pendingVisit?.steps[0];
  if (!step || step.type !== "CHOOSE_ONE") {
    throw new Error("expected the Logistics end-of-turn move choice to be open");
  }
  return { state, destination };
}

function renderBoard(state: GameState, onAction: (action: GameAction) => void): HTMLElement {
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
  return container;
}

describe("Logistics end-of-turn move — board highlight", () => {
  it("highlights the destination field as a clickable hex (not just a tray button)", () => {
    const { state } = logisticsOfferState();
    const container = renderBoard(state, vi.fn());

    const highlighted = container.querySelectorAll(".hexCell.endTurnMoveTarget");
    // Exactly the one open destination is highlighted on the board.
    expect(highlighted.length).toBe(1);
  });

  it("dispatches the matching RESOLVE_VISIT_STEP when the highlighted hex is clicked", () => {
    const { state } = logisticsOfferState();
    const onAction = vi.fn();
    const container = renderBoard(state, onAction);

    const hex = container.querySelector(".hexCell.endTurnMoveTarget");
    expect(hex).toBeTruthy();
    fireEvent.click(hex!);

    // The move option is the first option; "Stay" is last. Clicking the hex
    // resolves the move directly, the same action the text button would send.
    expect(onAction).toHaveBeenCalledWith({ type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
  });

  it("shows no end-of-turn highlight when there is no pending move choice", () => {
    let state = createAdventureGameState({ seed: "logi-ui", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const container = renderBoard(state, vi.fn());
    expect(container.querySelectorAll(".hexCell.endTurnMoveTarget").length).toBe(0);
  });
});
