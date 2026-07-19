// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameAction, LegalAction } from "@/engine";
import { singlePlayerAutoAdvanceDefault, usePacedComputerAdvance } from "./computer-auto-advance";

const advance: LegalAction = {
  label: "Next computer step",
  action: { type: "ADVANCE_COMPUTER", playerId: "p1" } as GameAction,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("singlePlayerAutoAdvanceDefault", () => {
  it("is ON by default for a single-player match (the AI takes its turn without manual Next)", () => {
    // Fresh match, nothing stored → auto-advance is on. If this flips to false
    // (the old opt-in default), the single-player AI never advances its map turn
    // until the human clicks "Next" for every beat — the "AI doesn't move" bug.
    expect(singlePlayerAutoAdvanceDefault("single-player", null, "seed-1")).toBe(true);
    // The legacy per-match "Skip confirmations" marker (a bare seed) keeps it on.
    expect(singlePlayerAutoAdvanceDefault("single-player", "seed-1", "seed-1")).toBe(true);
    expect(singlePlayerAutoAdvanceDefault("single-player", "other-seed", "seed-1")).toBe(true);
  });

  it("respects the per-match MANUAL opt-out and is OFF outside single-player (CONTROLs)", () => {
    // Explicit manual opt-out for THIS match → off (step through by hand).
    expect(singlePlayerAutoAdvanceDefault("single-player", "manual:seed-1", "seed-1")).toBe(false);
    // A manual marker for a DIFFERENT match does not disable this one.
    expect(singlePlayerAutoAdvanceDefault("single-player", "manual:other", "seed-1")).toBe(true);
    // CONTROL: multiplayer / undefined session never auto-advances (humans play).
    expect(singlePlayerAutoAdvanceDefault(undefined, null, "seed-1")).toBe(false);
    expect(singlePlayerAutoAdvanceDefault("multiplayer", null, "seed-1")).toBe(false);
  });
});

describe("usePacedComputerAdvance", () => {
  it("waits, submits once per room version, then advances the next version", async () => {
    vi.useFakeTimers();
    const submit = vi.fn(async () => true);
    const { rerender } = renderHook(
      ({ version, blocked }) =>
        usePacedComputerAdvance({
          enabled: true,
          roomKey: "room:match-seed",
          version,
          blocked,
          legalActions: [advance],
          submit,
          delayMs: 100,
        }),
      { initialProps: { version: 4, blocked: false } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });
    expect(submit).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(submit).toHaveBeenCalledTimes(1);

    // Presentation rerender, same authoritative version: never double-submit.
    rerender({ version: 4, blocked: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(submit).toHaveBeenCalledTimes(1);

    rerender({ version: 5, blocked: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("does not run while presentation is blocked", async () => {
    vi.useFakeTimers();
    const submit = vi.fn(async () => true);
    const { rerender } = renderHook(
      ({ blocked }) =>
        usePacedComputerAdvance({
          enabled: true,
          roomKey: "room:match-seed",
          version: 1,
          blocked,
          legalActions: [advance],
          submit,
          delayMs: 100,
        }),
      { initialProps: { blocked: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(submit).not.toHaveBeenCalled();

    rerender({ blocked: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
