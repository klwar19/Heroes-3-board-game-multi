import { describe, expect, it } from "vitest";
import { pollTickAllowed } from "./hidden-tab-poll";

describe("pollTickAllowed — decorative polls stop in hidden tabs", () => {
  it("allows ticks while the tab is visible", () => {
    expect(pollTickAllowed({ visibilityState: "visible" })).toBe(true);
  });

  it("skips ticks while the tab is hidden (the edge-request leak fix)", () => {
    expect(pollTickAllowed({ visibilityState: "hidden" })).toBe(false);
  });

  it("never blocks without a document (SSR safety)", () => {
    expect(pollTickAllowed(null)).toBe(true);
  });
});
