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
