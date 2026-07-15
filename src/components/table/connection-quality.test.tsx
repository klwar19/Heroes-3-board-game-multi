// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ConnectionQualityChip,
  connectionQualityTier,
  formatQualityMs,
  retainQualitySample
} from "./connection-quality";

describe("connection quality helpers", () => {
  it("grades RTT into the plan's tiers (green <150, yellow <400, red above)", () => {
    expect(connectionQualityTier(30)).toBe("good");
    expect(connectionQualityTier(149)).toBe("good");
    expect(connectionQualityTier(150)).toBe("fair");
    expect(connectionQualityTier(399)).toBe("fair");
    expect(connectionQualityTier(400)).toBe("poor");
    expect(connectionQualityTier(1200)).toBe("poor");
  });

  it("rounds the display to a 10 ms step with a 10 ms floor", () => {
    expect(formatQualityMs(4)).toBe(10);
    expect(formatQualityMs(83)).toBe(80);
    expect(formatQualityMs(87)).toBe(90);
    expect(formatQualityMs(400)).toBe(400);
  });

  it("keeps the previous sample reference when the display would not change", () => {
    const prev = { rttMs: 82, at: 1000 };
    // 78 rounds to the same 80 ms / good tier → same reference, no re-render.
    expect(retainQualitySample(prev, { rttMs: 78, at: 2000 })).toBe(prev);
    // 95 rounds to 100 ms → a real update.
    const moved = retainQualitySample(prev, { rttMs: 95, at: 3000 });
    expect(moved).toEqual({ rttMs: 95, at: 3000 });
    // A sample without a measured rtt never overwrites a real one.
    expect(retainQualitySample(prev, { at: 4000 })).toBe(prev);
    // First real sample lands on an empty state.
    expect(retainQualitySample(null, { rttMs: 50, at: 500 })).toEqual({ rttMs: 50, at: 500 });
  });
});

describe("ConnectionQualityChip", () => {
  it.each([
    [90, "quality-good", "90 ms"],
    [220, "quality-fair", "220 ms"],
    [512, "quality-poor", "510 ms"]
  ])("renders %i ms with its threshold class", (rttMs, tierClass, label) => {
    const { container, unmount } = render(<ConnectionQualityChip sample={{ rttMs, at: 1 }} />);
    const chip = container.querySelector(".connectionQualityChip");
    expect(chip?.classList.contains(tierClass)).toBe(true);
    expect(chip?.textContent).toContain(label);
    // The tooltip explains the room-lives-near-its-creator geography.
    expect(chip?.getAttribute("title")).toContain("The room lives near its creator");
    unmount();
  });

  it("renders nothing before the first measured sample", () => {
    const none = render(<ConnectionQualityChip sample={null} />);
    expect(none.container.querySelector(".connectionQualityChip")).toBeNull();
    none.unmount();
    const unmeasured = render(<ConnectionQualityChip sample={{ at: 1 }} />);
    expect(unmeasured.container.querySelector(".connectionQualityChip")).toBeNull();
    unmeasured.unmount();
  });
});
