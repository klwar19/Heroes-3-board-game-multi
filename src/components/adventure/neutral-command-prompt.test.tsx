// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createInitialGameState, getLegalActions } from "@/engine";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * The neutral move-to-attack landing-cell prompt (BINH house rule, AI-driven
 * neutral fights): the chooser gets a board-click instruction — the cells are
 * clicked on the battlefield, never listed as a wall of buttons — and every
 * other seat gets the waiting strip.
 */

function stateWithNeutralDestinationChoice(): GameState {
  const state = createInitialGameState("neutral-destination-prompt-ui");
  const guard = state.combat!.units.unit_p2_skeletons;
  guard.controllerId = "neutrals";
  state.pendingChoice = {
    id: "choice_test",
    type: "OPTION_CHOICE",
    playerId: "p1",
    prompt: "Choose where it moves.",
    options: [{ label: "Move to B1" }, { label: "Move to C1" }],
    context: "neutral-destination",
    neutralDestination: { unitId: guard.id, positions: [1, 2], defenderId: "unit_p1_griffins" },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = "p1";
  return state;
}

describe("neutral landing-cell prompt", () => {
  it("shows the chooser a board-click instruction with no per-cell buttons", () => {
    const state = stateWithNeutralDestinationChoice();
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(screen.getByText(/click the empty slot it should move to/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /move to/i })).toBeNull();
  });

  it("CONTROL: a non-owner seat sees the waiting strip instead", () => {
    const state = stateWithNeutralDestinationChoice();
    render(
      <PromptTray legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    expect(screen.getByText(/is deciding/i)).toBeTruthy();
  });
});
