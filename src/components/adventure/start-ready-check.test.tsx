// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StartReadyCheck } from "./screen";
import { createAdventureLobbyState, redactStateForSeat } from "@/engine";
import type { GameState } from "@/engine";

afterEach(cleanup);

/** A hosted 2-player setup lobby with an OPEN ready check (p1 confirmed). */
function lobbyWithCheck(startedAt = 1_000): GameState {
  const state = createAdventureLobbyState({ seed: "ready-ui", playerCount: 2 });
  state.room = {
    hosted: true,
    hostClientId: "c1",
    ranked: true,
    members: [
      { clientId: "c1", name: "Alice", seat: "p1", isHost: true },
      { clientId: "c2", name: "Bob", seat: "p2", isHost: false }
    ]
  };
  state.setupLobby!.startCheck = {
    startedByPlayerId: "p1",
    startedAt,
    deadline: startedAt + 30_000,
    confirmations: ["p1"]
  };
  return state;
}

describe("StartReadyCheck", () => {
  it("shows Confirm/Cancel to a seated player and dispatches their choice", () => {
    vi.useRealTimers();
    // Ranked/hosted clients receive a per-seat redacted snapshot in production.
    // The non-creator must retain the same ready-check controls on that frame.
    const state = redactStateForSeat(lobbyWithCheck(Date.now()), "p2");
    const onAction = vi.fn();
    render(<StartReadyCheck onAction={onAction} state={state} viewerPlayerId="p2" />);

    fireEvent.click(screen.getByRole("button", { name: /confirm start/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "CONFIRM_START_ADVENTURE", playerId: "p2" });

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "CANCEL_START_ADVENTURE", playerId: "p2" });
  });

  it("auto-cancels once the 30-second window elapses (AFK seat never confirmed)", () => {
    vi.useFakeTimers();
    try {
      const started = Date.now();
      const state = lobbyWithCheck(started);
      const onAction = vi.fn();
      render(<StartReadyCheck onAction={onAction} state={state} viewerPlayerId="p2" />);
      // Before the deadline: no auto-cancel.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(onAction).not.toHaveBeenCalled();
      // Past the deadline: the client fires the abort itself.
      act(() => {
        vi.advanceTimersByTime(21_000);
      });
      expect(onAction).toHaveBeenCalledWith({ type: "CANCEL_START_ADVENTURE", playerId: "p2" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("CONTROL: renders nothing when no check is open", () => {
    const state = createAdventureLobbyState({ seed: "no-check", playerCount: 2 });
    const { container } = render(<StartReadyCheck onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(container.firstChild).toBeNull();
  });
});
