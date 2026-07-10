// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SetupAmbientFx } from "./setup-ambient";

afterEach(cleanup);

describe("SetupAmbientFx", () => {
  it("mounts WC3-style wisps and spirit motes only (no dragon overlays)", () => {
    const { container } = render(<SetupAmbientFx />);
    const root = container.querySelector(".setupAmbient");
    expect(root).toBeTruthy();
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.getAttribute("data-testid")).toBe("setup-ambient");

    // No dragon wing/eye/haze layers — those clipped the frame and background.
    expect(root?.querySelector(".setupDragonLive")).toBeNull();
    expect(root?.querySelector(".setupDragonWing")).toBeNull();
    expect(root?.querySelector(".setupDragonEye")).toBeNull();
    expect(root?.querySelector(".setupForestHaze")).toBeNull();

    // WC3 Sentinels wisps — sprite img + wrapper.
    expect(root?.querySelectorAll(".setupWisp").length).toBe(6);
    const wispImg = root?.querySelector(".setupWispImg") as HTMLImageElement | null;
    expect(wispImg).toBeTruthy();
    expect(wispImg?.getAttribute("src") ?? "").toContain("wc3-wisp.webp");

    // Fine spirit motes.
    expect(root?.querySelectorAll(".setupMote").length).toBe(10);
  });
});
