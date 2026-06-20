// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandDock } from "./board";
import { createInitialGameState, type GameAction, type GameState } from "@/engine";

afterEach(cleanup);

function renderDock(state: GameState, onAction: (action: GameAction) => void) {
  return render(
    <CommandDock
      legalActions={[]}
      onAction={onAction}
      onReset={() => {}}
      state={state}
      viewerPlayerId="p1"
    />
  );
}

describe("sandbox Add-card picker", () => {
  it("opens a card list and dispatches SANDBOX_ADD_CARD for the picked card", () => {
    const onAction = vi.fn();
    renderDock(createInitialGameState(), onAction);

    // The picker is closed: no dialog yet.
    expect(screen.queryByRole("dialog")).toBeNull();

    // Open it — the dialog must actually appear (the bug was it never showed).
    fireEvent.click(screen.getByRole("button", { name: /add card/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Narrow to Magic Arrow and pick it.
    fireEvent.change(screen.getByPlaceholderText(/filter cards/i), { target: { value: "magic_arrow" } });
    fireEvent.click(screen.getByRole("button", { name: /magic arrow/i }));

    expect(onAction).toHaveBeenCalledWith({
      type: "SANDBOX_ADD_CARD",
      playerId: "p1",
      cardId: "spell.magic_arrow"
    });
  });

  it("lists war machines (First Aid Tent, Cannon) and adds them to hand", () => {
    const onAction = vi.fn();
    renderDock(createInitialGameState(), onAction);

    fireEvent.click(screen.getByRole("button", { name: /add card/i }));

    // First Aid Tent and Cannon used to be unreachable in combat test mode.
    fireEvent.change(screen.getByPlaceholderText(/filter cards/i), { target: { value: "first aid tent" } });
    fireEvent.click(screen.getByRole("button", { name: /first aid tent/i }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SANDBOX_ADD_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent"
    });

    fireEvent.change(screen.getByPlaceholderText(/filter cards/i), { target: { value: "cannon" } });
    fireEvent.click(screen.getByRole("button", { name: /cannon/i }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SANDBOX_ADD_CARD",
      playerId: "p1",
      cardId: "war_machine.cannon"
    });
  });

  it("only offers the picker in the combat sandbox", () => {
    const state = createInitialGameState();
    state.combat = null; // not a sandbox combat
    renderDock(state, vi.fn());

    expect(screen.queryByRole("button", { name: /add card/i })).toBeNull();
  });
});
