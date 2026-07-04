// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState } from "@/engine";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * The open-table "Play as X" jump on the "…is deciding" strip. It lets whoever
 * must act reach a MAP choice they own from any seat, in ONE click, without the
 * invasive auto-switching. It appears only for a real seat, only on the map
 * (never mid-combat), and only when a switch handler is supplied (open tables).
 */
function mapChoiceOwnedBy(owner: string): GameState {
  const state = createAdventureGameState({ seed: "prompt-switch", rollFirstPlayer: false });
  state.combat = null;
  state.pendingChoice = {
    id: "c1",
    type: "OPTION_CHOICE",
    playerId: owner,
    prompt: "This Far tile has a Blocked Field — place a Creature Bank token here?",
    options: [{ label: "Place a Creature Bank" }, { label: "Leave it blocked" }],
    context: "place-creature-bank",
    creatureBank: { fieldId: "f1", tier: "far" },
    returnPhase: state.phase
  } as GameState["pendingChoice"];
  return state;
}

describe("PromptTray — open-table 'Play as X' jump", () => {
  it("offers a one-click switch to the choice owner when viewing another seat", () => {
    const state = mapChoiceOwnedBy("p2");
    const onSwitchSeat = vi.fn();
    render(
      <PromptTray
        legalActions={[]}
        onAction={vi.fn()}
        onSwitchSeat={onSwitchSeat}
        state={state}
        viewerPlayerId="p1"
      />
    );
    const jump = screen.getByRole("button", { name: /Play as/ });
    fireEvent.click(jump);
    expect(onSwitchSeat).toHaveBeenCalledWith("p2");
  });

  it("does NOT offer the jump with no switch handler (hosted room: seat is fixed)", () => {
    const state = mapChoiceOwnedBy("p2");
    render(<PromptTray legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("button", { name: /Play as/ })).toBeNull();
    // The waiting strip still names the owner.
    expect(screen.getByText(/is deciding/i)).toBeTruthy();
  });

  it("does NOT offer the jump mid-combat (switching seats in a fight is disorienting)", () => {
    const state = mapChoiceOwnedBy("p2");
    state.combat = { id: "x" } as GameState["combat"];
    render(
      <PromptTray legalActions={[]} onAction={vi.fn()} onSwitchSeat={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(screen.queryByRole("button", { name: /Play as/ })).toBeNull();
  });
});
