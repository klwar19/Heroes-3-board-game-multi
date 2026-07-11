// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createInitialGameState, getLegalActions } from "@/engine";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * PvP Neutral Control — the commander-facing prompt tray:
 *  - the free-move choice (no defender, `allowHold`) shows the board-click
 *    instruction plus a working "holds position" button that dispatches the
 *    trailing option index;
 *  - the classic move-to-attack pick keeps its instruction and gains NO button;
 *  - a non-owner seat gets the waiting strip, never the commander's controls.
 */

function stateWithNeutralMoveChoice(options: { allowHold: boolean }): GameState {
  const state = createInitialGameState("neutral-command-prompt-ui");
  const guard = state.combat!.units.unit_p2_skeletons;
  guard.controllerId = "neutrals";
  state.pendingChoice = {
    id: "choice_test",
    type: "OPTION_CHOICE",
    playerId: "p2",
    prompt: "You command the Neutral units.",
    options: options.allowHold
      ? [{ label: "Move to B1" }, { label: "Move to C1" }, { label: `${guard.name} holds position` }]
      : [{ label: "Move to B1" }, { label: "Move to C1" }],
    context: "neutral-destination",
    neutralDestination: {
      unitId: guard.id,
      positions: [1, 2],
      ...(options.allowHold ? { allowHold: true } : { defenderId: "unit_p1_griffins" })
    },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = "p2";
  return state;
}

describe("PvP Neutral Control prompt — free move or hold", () => {
  it("offers the commander the board-click instruction AND a working hold button", () => {
    const state = stateWithNeutralMoveChoice({ allowHold: true });
    const onAction = vi.fn();
    render(
      <PromptTray legalActions={getLegalActions(state, "p2")} onAction={onAction} state={state} viewerPlayerId="p2" />
    );

    expect(screen.getByText(/click the cell .* moves to, or hold/i)).toBeTruthy();
    const hold = screen.getByRole("button", { name: /holds position/i });
    fireEvent.click(hold);
    expect(onAction).toHaveBeenCalledWith({
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: "choice_test",
      optionIndex: 2 // the trailing hold option, AFTER both move cells
    });
    // The move cells stay board clicks, never tray buttons.
    expect(screen.queryByRole("button", { name: /move to/i })).toBeNull();
  });

  it("CONTROL: the move-to-attack pick keeps its instruction with NO hold button", () => {
    const state = stateWithNeutralMoveChoice({ allowHold: false });
    render(
      <PromptTray legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    expect(screen.getByText(/click the empty slot it should move to/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /holds position/i })).toBeNull();
  });

  it("CONTROL: a non-owner seat sees the waiting strip, not the commander's controls", () => {
    const state = stateWithNeutralMoveChoice({ allowHold: true });
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(screen.getByText(/is deciding/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /holds position/i })).toBeNull();
  });
});
