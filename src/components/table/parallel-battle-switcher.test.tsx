// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdventureGameState } from "@/engine";
import { ParallelBattleSwitcher } from "./parallel-battle-switcher";

afterEach(cleanup);

function fixture() {
  const state = createAdventureGameState({ seed: "battle-switcher-ui", parallelTurns: 4, pvpNeutralControl: true, rollFirstPlayer: false });
  state.parallelCombatOwnerId = "p1";
  state.parallelContextOptions = [
    { ownerPlayerId: "p1", contextId: "battle1", role: "hero", fighterName: "Catherine", controllerName: "Sandro", waitingFor: "Waiting for Sandro", needsInput: false, hasCombat: true },
    { ownerPlayerId: "p2", contextId: "battle2", role: "neutrals", fighterName: "Sandro", waitingFor: "Your action", needsInput: true, hasCombat: true },
    { ownerPlayerId: "p3", contextId: "battle3", role: "neutrals", fighterName: "Computer Alamar", waitingFor: "Your action", needsInput: true, hasCombat: true },
  ];
  return state;
}

describe("parallel battle windows", () => {
  it("labels hero and neutral roles, waiting players, and sends the selected owner without changing seats", async () => {
    const state = fixture();
    const onAction = vi.fn(async () => true);
    const { rerender } = render(<ParallelBattleSwitcher state={state} playerId="p1" onAction={onAction} />);
    const own = screen.getByRole("button", { name: /My battle/ });
    expect(own.getAttribute("aria-pressed")).toBe("true");
    expect(within(own).getByText(/Waiting for Sandro/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Neutrals vs Computer Alamar/ }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p3" });
    await waitFor(() => expect((own as HTMLButtonElement).disabled).toBe(false));
    rerender(<ParallelBattleSwitcher state={{ ...state, parallelCombatOwnerId: "p3" }} playerId="p1" onAction={onAction} />);
    expect(screen.getByRole("status").textContent).toContain("commanding neutrals against Computer Alamar");
    expect(screen.getByRole("button", { name: /Neutrals vs Computer Alamar/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /My battle/ }));
    await waitFor(() => expect(onAction).toHaveBeenLastCalledWith({ type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p1" }));
  });

  it("does not add windows to ordinary multiplayer or single-player", () => {
    const state = fixture();
    state.turn.mode = "ordered";
    const { container } = render(<ParallelBattleSwitcher state={state} playerId="p1" onAction={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
