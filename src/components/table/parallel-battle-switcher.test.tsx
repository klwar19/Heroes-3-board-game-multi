// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdventureGameState } from "@/engine";
import { ParallelBattleSwitcher } from "./parallel-battle-switcher";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

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

  // 2026-09-05: "observer can't see both battles". A viewer with no decision in
  // a battle gets a read-only WATCH window — it must be labelled as such, so a
  // player never mistakes it for a window that owes them an action.
  it("labels a read-only WATCH window and switches to it", async () => {
    const state = fixture();
    state.parallelContextOptions = [
      state.parallelContextOptions![0],
      { ownerPlayerId: "p2", contextId: "battle2", role: "watch", fighterName: "Sandro", waitingFor: "Watching", needsInput: false, hasCombat: true },
    ];
    const onAction = vi.fn(async () => true);
    const { rerender } = render(<ParallelBattleSwitcher state={state} playerId="p1" onAction={onAction} />);
    const watch = screen.getByRole("button", { name: /Watch Sandro/ });
    expect(within(watch).getByText(/Read-only/)).toBeTruthy();
    // CONTROL: a window that DOES owe this viewer an action is never labelled
    // read-only (the "neutrals" role of the other fixture).
    expect(screen.queryByRole("button", { name: /Neutrals vs/ })).toBeNull();
    fireEvent.click(watch);
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p2" });
    await waitFor(() => expect((watch as HTMLButtonElement).disabled).toBe(false));
    rerender(<ParallelBattleSwitcher state={{ ...state, parallelCombatOwnerId: "p2" }} playerId="p1" onAction={onAction} />);
    expect(screen.getByRole("status").textContent).toContain("watching Sandro's battle");
  });

  it("does not add windows to ordinary multiplayer or single-player", () => {
    const state = fixture();
    state.turn.mode = "ordered";
    const { container } = render(<ParallelBattleSwitcher state={state} playerId="p1" onAction={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("can be moved without losing its reserved layout slot, then reset", () => {
    const { container } = render(
      <ParallelBattleSwitcher state={fixture()} playerId="p1" onAction={vi.fn()} />,
    );
    const panel = container.querySelector(".parallelBattleSwitcher") as HTMLElement;
    const move = screen.getByRole("button", { name: "Move battle windows" });

    fireEvent.pointerDown(move, { button: 0, clientX: 100, clientY: 40, pointerId: 9 });
    fireEvent.pointerMove(move, { clientX: 160, clientY: 75, pointerId: 9 });
    fireEvent.pointerUp(move, { clientX: 160, clientY: 75, pointerId: 9 });

    expect(panel.style.transform).toBe("translate(60px, 35px)");
    const reset = screen.getByRole("button", { name: "Reset battle-window position" });
    expect((reset as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(reset);
    expect(panel.style.transform).toBe("");
    expect((reset as HTMLButtonElement).disabled).toBe(true);
  });

  it("publishes its measured grid footprint for fixed desktop chrome", () => {
    const offsetTop = vi
      .spyOn(HTMLElement.prototype, "offsetTop", "get")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("parallelBattleSwitcher")) return 12;
        if (this.classList.contains("tableTopRow")) return 156;
        return 0;
      });
    const { container } = render(
      <main className="tableRoot">
        <ParallelBattleSwitcher state={fixture()} playerId="p1" onAction={vi.fn()} />
        <div className="tableTopRow" />
      </main>,
    );

    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--parallel-battle-offset")).toBe("144px");
    offsetTop.mockRestore();
  });

  it("restores a moved position after a battle-context remount", async () => {
    const first = render(
      <ParallelBattleSwitcher state={fixture()} playerId="p1" onAction={vi.fn()} />,
    );
    const move = screen.getByRole("button", { name: "Move battle windows" });
    fireEvent.pointerDown(move, { button: 0, clientX: 100, clientY: 40, pointerId: 11 });
    fireEvent.pointerMove(move, { clientX: 145, clientY: 65, pointerId: 11 });
    fireEvent.pointerUp(move, { clientX: 145, clientY: 65, pointerId: 11 });
    await waitFor(() =>
      expect(sessionStorage.getItem("heroes3.parallelBattleSwitcher.position")).toBe('{"x":45,"y":25}'),
    );
    first.unmount();

    const second = render(
      <ParallelBattleSwitcher state={fixture()} playerId="p1" onAction={vi.fn()} />,
    );
    await waitFor(() =>
      expect((second.container.querySelector(".parallelBattleSwitcher") as HTMLElement).style.transform)
        .toBe("translate(45px, 25px)"),
    );
  });
});
