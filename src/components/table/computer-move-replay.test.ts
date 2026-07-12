// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { standardComputerController, type GameState } from "@/engine";
import {
  buildComputerMoveReplay,
  useComputerMoveReplay,
  type ComputerMoveEvent,
} from "./computer-move-replay";

/** Minimal state carrying only what isComputerPlayer reads. */
function stateWithComputers(computerIds: string[]): GameState {
  const controllers = Object.fromEntries(
    computerIds.map((id) => [id, standardComputerController()]),
  );
  return { controllers } as unknown as GameState;
}

function move(
  id: string,
  playerId: string,
  heroId: string,
  from: string,
  to: string,
): ComputerMoveEvent {
  return { id, playerId, heroId, from, to } as ComputerMoveEvent;
}

describe("buildComputerMoveReplay", () => {
  it("keeps computer hero walks in order and drops human ones", () => {
    const state = stateWithComputers(["p2"]);
    const replay = buildComputerMoveReplay(state, [
      move("m1", "p1", "hero_p1", "a1", "a2"), // human — excluded
      move("m2", "p2", "hero_p2", "b1", "b2"),
      move("m3", "p2", "hero_p2", "b2", "b3"),
    ]);

    expect(replay).not.toBeNull();
    // Only the computer hero's two steps become frames, in order.
    expect(replay!.frames).toEqual([
      { heroId: "hero_p2", playerId: "p2", cell: "b2" },
      { heroId: "hero_p2", playerId: "p2", cell: "b3" },
    ]);
    // The hero is pinned to its FIRST pre-move cell, not the second step's from.
    expect(replay!.initialPositions).toEqual({ hero_p2: "b1" });
    expect(replay!.heroPlayerIds).toEqual({ hero_p2: "p2" });
  });

  it("CONTROL: a game with no computer controllers yields no replay", () => {
    // Same moves, but every seat is human (an ordinary multiplayer snapshot).
    const state = stateWithComputers([]);
    const replay = buildComputerMoveReplay(state, [
      move("m2", "p2", "hero_p2", "b1", "b2"),
      move("m3", "p2", "hero_p2", "b2", "b3"),
    ]);
    expect(replay).toBeNull();
  });

  it("plays multiple computer heroes one after another in appearance order", () => {
    const state = stateWithComputers(["p2", "p3"]);
    const replay = buildComputerMoveReplay(state, [
      move("m1", "p2", "hero_p2", "b1", "b2"),
      move("m2", "p2", "hero_p2", "b2", "b3"),
      move("m3", "p3", "hero_p3", "c1", "c2"),
    ]);

    expect(replay!.initialPositions).toEqual({ hero_p2: "b1", hero_p3: "c1" });
    // p2's whole walk precedes p3's — one hero at a time.
    expect(replay!.frames.map((frame) => frame.cell)).toEqual(["b2", "b3", "c2"]);
    expect(replay!.frames.map((frame) => frame.playerId)).toEqual(["p2", "p2", "p3"]);
  });
});

describe("useComputerMoveReplay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals one cell per step, then releases the override", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useComputerMoveReplay(100));

    const replay = buildComputerMoveReplay(stateWithComputers(["p2"]), [
      move("m1", "p2", "hero_p2", "b1", "b2"),
      move("m2", "p2", "hero_p2", "b2", "b3"),
    ])!;

    act(() => {
      result.current.start(replay);
    });
    // Held at the start cell before any step fires.
    expect(result.current.overrides).toEqual({ hero_p2: "b1" });
    expect(result.current.activePlayerId).toBe("p2");

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.overrides).toEqual({ hero_p2: "b2" });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.overrides).toEqual({ hero_p2: "b3" });

    // Trailing dwell releases the pawns back to the settled positions.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.overrides).toBeNull();
    expect(result.current.activePlayerId).toBeNull();
  });

  it("cancel snaps the override away immediately", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useComputerMoveReplay(100));
    const replay = buildComputerMoveReplay(stateWithComputers(["p2"]), [
      move("m1", "p2", "hero_p2", "b1", "b2"),
    ])!;

    act(() => {
      result.current.start(replay);
    });
    expect(result.current.overrides).not.toBeNull();

    act(() => {
      result.current.cancel();
    });
    expect(result.current.overrides).toBeNull();

    // No frame fires after cancel (the timer was cleared).
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.overrides).toBeNull();
  });
});
