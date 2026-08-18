// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnimationToggle } from "./animation-toggle";
import { SKIP_ANIMATIONS_STORAGE_KEY } from "@/lib/animation-preference";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AnimationToggle (the table-menu switch)", () => {
  it("flips the stored skip-animations preference both ways", () => {
    render(<AnimationToggle />);
    const toggle = screen.getByRole("button", { name: /animations/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(window.localStorage.getItem(SKIP_ANIMATIONS_STORAGE_KEY)).toBe("1");
    const on = screen.getByRole("button", { name: /skip fx/i });
    expect(on.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(on);
    expect(window.localStorage.getItem(SKIP_ANIMATIONS_STORAGE_KEY)).toBe("0");
  });
});
