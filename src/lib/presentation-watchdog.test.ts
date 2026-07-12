import { describe, expect, it } from "vitest";
import { presentationWatchdogDelay } from "./presentation-watchdog";

describe("presentation watchdog", () => {
  it("returns the remaining bounded presentation time", () => {
    expect(presentationWatchdogDelay(1_000, 6_000, 20_000)).toBe(15_000);
    expect(presentationWatchdogDelay(1_000, 30_000, 20_000)).toBe(0);
  });

  it("does not extend the timeline when the clock moves backwards", () => {
    expect(presentationWatchdogDelay(2_000, 1_000, 20_000)).toBe(20_000);
  });
});
