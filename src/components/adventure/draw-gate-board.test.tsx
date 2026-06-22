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

function setField(state: GameState, spaceId: string, location: string): void {
  const field = state.adventure!.fields[spaceId]!;
  field.location = location;
  delete field.difficulty;
  field.blackCube = false;
  field.flagOwnerId = null;
  field.everFlagged = false;
}

/** A p1 map turn with the mandatory draw STILL PENDING and one open neighbour. */
function gateState(): GameState {
  const state = createAdventureGameState({ seed: "draw-gate-ui", rollFirstPlayer: false });
  state.activePlayerId = "p1";
  // Deliberately leave canMulligan set — that is the gate under test.
  expect(state.players.p1.canMulligan).toBe(true);

  const heroSpace = state.heroes.hero_p1!.spaceId as string;
  const open = getAdjacentSpaceIds(heroSpace).find((spaceId) => {
    if (!state.adventure!.fields[spaceId]) {
      return false;
    }
    setField(state, spaceId, "empty_field");
    return canCrossEdge(state, heroSpace, spaceId);
  });
  expect(open, "need at least one crossable open neighbour").toBeTruthy();
  return state;
}

function renderBoard(state: GameState): HTMLElement {
  const { container } = render(
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
  return container;
}

describe("Mandatory draw — the board withholds movement until the draw is taken", () => {
  it("shows NO live move-target hexes while the start-of-turn draw is pending", () => {
    const state = gateState();
    const container = renderBoard(state);
    expect(container.querySelectorAll(".hexCell.moveTarget").length).toBe(0);
  });

  it("shows would-be targets as LOCKED, and a tap on one pops the draw reminder", () => {
    const state = gateState();
    const container = renderBoard(state);

    // The fields the hero could reach are shown locked (dimmed), not live moves.
    const locked = container.querySelectorAll(".hexCell.moveTargetLocked");
    expect(locked.length).toBeGreaterThan(0);

    // No reminder note until the player actually attempts a (locked) move.
    expect(container.querySelector(".drawReminderFloat")).toBeNull();
    fireEvent.click(locked[0]);
    expect(container.querySelector(".drawReminderFloat")).toBeTruthy();
  });

  it("reveals live move-target hexes (and no locked ones) once the draw is taken", () => {
    const pending = gateState();
    const drawn = applyOk(pending, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(drawn.players.p1.canMulligan).toBe(false);
    const container = renderBoard(drawn);
    expect(container.querySelectorAll(".hexCell.moveTarget").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".hexCell.moveTargetLocked").length).toBe(0);
  });
});
