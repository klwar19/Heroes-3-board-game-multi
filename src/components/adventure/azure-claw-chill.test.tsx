// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AzureClawChill } from "./azure-claw-chill";

afterEach(cleanup);

describe("AzureClawChill", () => {
  it("mounts claw + frost rim (no glow divs that box)", () => {
    const { container } = render(<AzureClawChill />);
    const root = container.querySelector(".azureClawChrome");
    expect(root).toBeTruthy();
    expect(root?.getAttribute("aria-hidden")).toBe("true");

    const claw = root?.querySelector(".azureClawHand") as HTMLImageElement | null;
    expect(claw).toBeTruthy();
    expect(claw?.getAttribute("src") ?? "").toContain("azure-claw.webp");

    const frost = root?.querySelector(".azureClawFrostRim") as HTMLImageElement | null;
    expect(frost).toBeTruthy();
    expect(frost?.getAttribute("src") ?? "").toContain("azure-frost-rim.webp");

    expect(root?.querySelector(".azureClawGlow")).toBeNull();
    expect(root?.querySelector(".azureClawFlow")).toBeNull();
    expect(root?.querySelectorAll("img").length).toBe(2);
  });
});
