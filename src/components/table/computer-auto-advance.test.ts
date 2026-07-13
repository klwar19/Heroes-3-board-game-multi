// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameAction, LegalAction } from "@/engine";
import { usePacedComputerAdvance } from "./computer-auto-advance";

const advance: LegalAction = {
  label: "Next computer step",
  action: { type: "ADVANCE_COMPUTER", playerId: "p1" } as GameAction,
};

afterEach(() => {
  vi.useRealTimers();
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
