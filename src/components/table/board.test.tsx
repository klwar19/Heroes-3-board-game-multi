// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, type GameAction, type LegalAction } from "@/engine";
import type { CardBoardAction } from "./utils";

afterEach(cleanup);

/**
 * Regression test for the space-target cast fix: an area spell that selects a
 * SPACE (Inferno / Frost Ring / Xyron's Inferno) must be castable on a space
 * that HOLDS a unit, not only on empty cells. Before the fix, board.tsx only
 * resolved the space-target action for empty cells (`!unit`), so a stack of
 * units standing on the chosen centre could never be clicked.
 */
describe("BattlefieldBoard — area spells target occupied spaces", () => {
  function renderBoardWithInfernoSelected() {
    const state = createInitialGameState("board-occupied-space");
    // Put an enemy unit ON the space we will aim the blast at (position 9).
    state.combat!.units.unit_p2_skeletons.position = 9;

    const castOnOccupied: GameAction = {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.inferno",
      target: { type: "space", position: 9 }
    };
    const selectedCardAction = castOnOccupied as CardBoardAction;
    const legalActions: LegalAction[] = [{ label: "Inferno: cast on B3", action: castOnOccupied }];
    const onAction = vi.fn();

    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={legalActions}
          selectedCardAction={selectedCardAction}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    return { onAction, castOnOccupied };
  }

  it("renders the occupied centre cell as a clickable cast target and fires the cast", () => {
    const { onAction, castOnOccupied } = renderBoardWithInfernoSelected();

    // The cell at the skeletons' space is a "Cast on …" button (it was inert
    // before the fix because the space had a unit on it).
    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="9"]');
    expect(cell, "the occupied centre cell should be a button").toBeTruthy();
    expect(cell!.getAttribute("aria-label")).toMatch(/Cast on/i);

    fireEvent.click(cell!);
    expect(onAction).toHaveBeenCalledWith(castOnOccupied);
  });
});

describe("BattlefieldBoard — battlefield-obstacle spell tokens", () => {
  function renderBoard(state: ReturnType<typeof createInitialGameState>, onAction = vi.fn()) {
    render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={[]}
          selectedCardAction={null}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    return { onAction };
  }

  it("draws a Fire Wall marker with its damage on the token's space", () => {
    const state = createInitialGameState("board-fire-wall");
    state.combat!.battlefieldTokens = [{ id: "t1", kind: "fire_wall", position: 10, controllerId: "p1", damage: 2 }];
    renderBoard(state);
    const cell = document.querySelector('[data-fx-cell="10"]');
    const mark = cell!.querySelector(".battlefieldToken.fire_wall");
    expect(mark, "a Fire Wall marker should render on space 10").toBeTruthy();
    expect(mark!.textContent).toContain("2");
  });

  it("shows the opponent only a face-down marker, but a revealed armed trap to all", () => {
    const hiddenState = createInitialGameState("board-hidden-trap");
    // armed === undefined mirrors what getPlayerView leaves for an enemy trap.
    hiddenState.combat!.battlefieldTokens = [{ id: "t1", kind: "land_mine", position: 10, controllerId: "p2" }];
    renderBoard(hiddenState);
    const hidden = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(hidden!.className).toContain("faceDown");

    cleanup();

    const revealedState = createInitialGameState("board-revealed-trap");
    revealedState.combat!.battlefieldTokens = [
      { id: "t1", kind: "land_mine", position: 10, controllerId: "p2", armed: true, revealed: true, damage: 2 }
    ];
    renderBoard(revealedState);
    const revealed = document.querySelector('[data-fx-cell="10"] .battlefieldToken');
    expect(revealed!.className).not.toContain("faceDown");
    expect(revealed!.className).toContain("revealed");
  });

  it("runs the placement picker: empty cells place a token and a Stop button ends it", () => {
    const state = createInitialGameState("board-place-picker");
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    state.pendingChoice = {
      id: "choice_place",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Quicksand: place a token on an empty space (1 left), or stop.",
      options: [{ label: "Place at C1" }, { label: "Stop placing tokens" }],
      context: "place-battlefield-tokens",
      placeTokens: { kind: "quicksand", positions: [10], armedSlots: [true, false], placedCount: 1, remaining: 1, triggerDamage: 0 },
      returnPhase: "combat"
    };
    const { onAction } = renderBoard(state);

    // The offered empty space is a clickable placement target.
    const cell = document.querySelector<HTMLButtonElement>('button[data-fx-cell="10"]');
    expect(cell!.getAttribute("aria-label")).toMatch(/Place token on/i);
    fireEvent.click(cell!);
    expect(onAction).toHaveBeenCalledWith({ type: "CHOOSE_OPTION", playerId: "p1", choiceId: "choice_place", optionIndex: 0 });

    // The "Stop placing tokens" banner button submits the trailing option.
    const stop = Array.from(document.querySelectorAll("button")).find((b) => /stop placing/i.test(b.textContent ?? ""));
    expect(stop, "a Stop placing button should render").toBeTruthy();
    fireEvent.click(stop!);
    expect(onAction).toHaveBeenCalledWith({ type: "CHOOSE_OPTION", playerId: "p1", choiceId: "choice_place", optionIndex: 1 });
  });
});
