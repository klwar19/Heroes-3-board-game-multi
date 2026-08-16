// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard } from "./board";
import { CardZoomProvider } from "./zoom";
import { createInitialGameState, type GameState, type LegalAction } from "@/engine";
import {
  getTacticsMoveActions,
  getTacticsSwapActions,
  swapPartnerActions,
  swapSelectableUnitIds,
  tacticsSetupActiveFor
} from "./utils";

afterEach(cleanup);

function cell(index: number): HTMLElement | null {
  return document.querySelector(`[data-fx-cell="${index}"]`);
}

function renderBoard(state: GameState, legalActions: LegalAction[], onAction = vi.fn()) {
  render(
    <CardZoomProvider>
      <BattlefieldBoard
        state={state}
        viewerPlayerId="p1"
        legalActions={legalActions}
        selectedCardAction={null}
        onAction={onAction}
        onInspect={() => {}}
      />
    </CardZoomProvider>
  );
  return onAction;
}

// ---------------------------------------------------------------------------
// Pure helpers (the swap-selection logic the board renders)
// ---------------------------------------------------------------------------

describe("Tactics swap helpers", () => {
  const swap = (unitIdA: string, unitIdB: string): LegalAction => ({
    label: `switch ${unitIdA} and ${unitIdB}`,
    action: { type: "SWAP_COMBAT_UNITS", playerId: "p1", unitIdA, unitIdB }
  });

  it("collects swap actions and the units that can be picked first", () => {
    const legal = [swap("a", "b"), swap("a", "c"), swap("b", "c"), { label: "x", action: { type: "FINISH_TACTICS", playerId: "p1" } } as LegalAction];
    const swaps = getTacticsSwapActions(legal);
    expect(swaps).toHaveLength(3);
    expect([...swapSelectableUnitIds(swaps)].sort()).toEqual(["a", "b", "c"]);
  });

  it("collects the Balance Pack one-space Tactics actions", () => {
    const legal: LegalAction[] = [
      { label: "move", action: { type: "TACTICS_MOVE_UNIT", playerId: "p1", unitId: "a", position: 2 } },
      { label: "keep", action: { type: "FINISH_TACTICS", playerId: "p1" } }
    ];
    expect(getTacticsMoveActions(legal)).toEqual([
      { type: "TACTICS_MOVE_UNIT", playerId: "p1", unitId: "a", position: 2 }
    ]);
  });

  it("resolves the partner -> action map from either side of a pair", () => {
    const swaps = getTacticsSwapActions([swap("a", "b"), swap("c", "a")]);
    const partners = swapPartnerActions(swaps, "a");
    expect([...partners.keys()].sort()).toEqual(["b", "c"]);
    expect(partners.get("b")).toMatchObject({ type: "SWAP_COMBAT_UNITS", unitIdA: "a", unitIdB: "b" });
    // The "c,a" pair still resolves c as a's partner.
    expect(partners.get("c")).toMatchObject({ type: "SWAP_COMBAT_UNITS", unitIdA: "c", unitIdB: "a" });
  });

  it("detects the viewer's start-of-combat Tactics window", () => {
    const state = { combat: { pendingTacticsSwaps: ["p1"] } } as unknown as GameState;
    expect(tacticsSetupActiveFor(state, "p1")).toBe(true);
    expect(tacticsSetupActiveFor(state, "p2")).toBe(false);
    expect(tacticsSetupActiveFor({ combat: {} } as unknown as GameState, "p1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tactics swap on the board (click-to-select)
// ---------------------------------------------------------------------------

describe("BattlefieldBoard — Tactics swap interaction", () => {
  function tacticsState(): { state: GameState; legalActions: LegalAction[] } {
    const state = createInitialGameState("board-tactics");
    // Enter p1's start-of-combat Tactics window.
    state.combat!.pendingTacticsSwaps = ["p1"];
    const pairs: [string, string][] = [
      ["unit_p1_marksmen", "unit_p1_griffins"],
      ["unit_p1_marksmen", "unit_p1_crusaders"],
      ["unit_p1_griffins", "unit_p1_crusaders"]
    ];
    const legalActions: LegalAction[] = pairs.map(([unitIdA, unitIdB]) => ({
      label: `switch ${unitIdA} and ${unitIdB}`,
      action: { type: "SWAP_COMBAT_UNITS", playerId: "p1", unitIdA, unitIdB }
    }));
    legalActions.push({
      label: "move Marksmen to A1",
      action: { type: "TACTICS_MOVE_UNIT", playerId: "p1", unitId: "unit_p1_marksmen", position: 0 }
    });
    return { state, legalActions };
  }

  it("offers each of your units as a swap source before one is picked", () => {
    const { state, legalActions } = tacticsState();
    renderBoard(state, legalActions);
    // Marksmen(1), Griffins(5), Crusaders(6) are all swap sources.
    for (const index of [1, 5, 6]) {
      expect(cell(index)?.className).toContain("swapSource");
    }
    // The enemy units are not swap sources.
    expect(cell(13)?.className ?? "").not.toContain("swapSource");
  });

  it("selecting a unit lights up its partners, and confirming dispatches the swap", () => {
    const { state, legalActions } = tacticsState();
    const onAction = renderBoard(state, legalActions);

    // First click selects the Marksmen — no action dispatched yet.
    fireEvent.click(cell(1)!);
    expect(onAction).not.toHaveBeenCalled();
    expect(cell(1)?.className).toContain("swapSelected");
    expect(cell(5)?.className).toContain("swapTarget");
    expect(cell(6)?.className).toContain("swapTarget");

    // Clicking a partner confirms the switch.
    fireEvent.click(cell(5)!);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "SWAP_COMBAT_UNITS",
      playerId: "p1",
      unitIdA: "unit_p1_marksmen",
      unitIdB: "unit_p1_griffins"
    });
  });

  it("clicking the selected unit again clears the pick (no swap)", () => {
    const { state, legalActions } = tacticsState();
    const onAction = renderBoard(state, legalActions);
    fireEvent.click(cell(1)!);
    expect(cell(1)?.className).toContain("swapSelected");
    fireEvent.click(cell(1)!);
    expect(onAction).not.toHaveBeenCalled();
    expect(cell(1)?.className).toContain("swapSource");
    expect(cell(5)?.className ?? "").not.toContain("swapTarget");
  });

  it("selecting a unit exposes the one-space OR destination and dispatches the Tactics move", () => {
    const { state, legalActions } = tacticsState();
    const onAction = renderBoard(state, legalActions);
    fireEvent.click(cell(1)!);
    expect(cell(0)?.className).toContain("moveTarget");
    fireEvent.click(cell(0)!);
    expect(onAction).toHaveBeenCalledWith({
      type: "TACTICS_MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_marksmen",
      position: 0
    });
  });

  it("expert Tactics can be armed and selected outside the setup window", () => {
    const { state, legalActions } = tacticsState();
    state.combat!.pendingTacticsSwaps = null;
    renderBoard(state, legalActions);
    fireEvent.click(document.querySelector('[aria-label="Expert Tactics"] .commandButton')!);
    expect(cell(1)?.className).toContain("swapSource");
    fireEvent.click(cell(1)!);
    expect(cell(0)?.className).toContain("moveTarget");
  });

  it("shows the ghost + arrow preview when hovering a swap partner", () => {
    const { state, legalActions } = tacticsState();
    renderBoard(state, legalActions);
    fireEvent.click(cell(1)!);
    expect(document.querySelector(".repositionArrowSvg")).toBeFalsy();
    fireEvent.mouseEnter(cell(5)!);
    expect(document.querySelector(".repositionArrowSvg")).toBeTruthy();
    // Two ghosts in a swap: the picked unit going out, the partner coming back.
    expect(document.querySelectorAll(".repositionGhost").length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Necklace of Swiftness one-space move on the board (combat-step choice)
// ---------------------------------------------------------------------------

describe("BattlefieldBoard — one-space move interaction", () => {
  function moveState(): GameState {
    const state = createInitialGameState("board-move");
    // Marksmen sit at B1 (1); A1 (0) and C1 (2) are empty destinations.
    state.pendingChoice = {
      id: "choice_1",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Move Marksmen one space.",
      options: [{ label: "Move to A1" }, { label: "Move to C1" }],
      context: "combat-step",
      step: { unitId: "unit_p1_marksmen", positions: [0, 2] },
      returnPhase: "combat"
    };
    return state;
  }

  it("marks the moving unit's origin and offers the empty destinations", () => {
    const state = moveState();
    renderBoard(state, []);
    expect(cell(1)?.className).toContain("repositionSource");
    expect(cell(0)?.getAttribute("aria-label")).toMatch(/Move to A1/i);
    expect(cell(2)?.getAttribute("aria-label")).toMatch(/Move to C1/i);
  });

  it("hovering a destination shows the ghost + arrow; clicking it resolves the choice and flashes", () => {
    const state = moveState();
    const onAction = renderBoard(state, []);

    fireEvent.mouseEnter(cell(0)!);
    expect(document.querySelector(".repositionArrowSvg")).toBeTruthy();

    fireEvent.click(cell(0)!);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_1",
      optionIndex: 0
    });
    // The destination flashes the moment the move is confirmed.
    expect(cell(0)?.className).toContain("fxRepositionFlash");
  });
});
