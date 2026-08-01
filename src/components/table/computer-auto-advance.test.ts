// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameAction, LegalAction } from "@/engine";
import { computerAutoAdvanceEnabled, usePacedComputerAdvance } from "./computer-auto-advance";

const advance: LegalAction = {
  label: "Next computer step",
  action: { type: "ADVANCE_COMPUTER", playerId: "p1" } as GameAction,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("computerAutoAdvanceEnabled", () => {
  it("moves AI by default in every single-player match and nowhere else", () => {
    expect(computerAutoAdvanceEnabled("single-player")).toBe(true);
    expect(computerAutoAdvanceEnabled("multiplayer")).toBe(false);
    expect(computerAutoAdvanceEnabled(undefined)).toBe(false);
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

  it("immediately resumes the pending step when a suspended tab wakes", async () => {
    vi.useFakeTimers();
    const submit = vi.fn(async () => true);
    renderHook(() =>
      usePacedComputerAdvance({
        enabled: true,
        roomKey: "room:match-seed",
        version: 8,
        blocked: false,
        legalActions: [advance],
        submit,
        delayMs: 10_000,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
