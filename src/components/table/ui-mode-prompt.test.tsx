// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiModePrompt, UiModeToggle } from "./ui-mode-prompt";
import { UI_MODE_STORAGE_KEY } from "@/lib/ui-mode-preference";

function stubViewport({ coarse, width, height }: { coarse: boolean; width: number; height: number }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("pointer: coarse") ? coarse : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  );
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

beforeEach(() => {
  window.localStorage.clear();
  stubViewport({ coarse: false, width: 1600, height: 900 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UiModePrompt (the pre-game Computer/Phone question)", () => {
  it("asks while the preference is unset, and choosing Phone persists + closes it", () => {
    render(<UiModePrompt />);
    expect(screen.getByRole("dialog", { name: /choose your screen layout/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /phone mode/i }));

    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("phone");
    expect(screen.queryByRole("dialog", { name: /choose your screen layout/i })).toBeNull();
  });

  it("choosing Computer persists 'computer' (an explicit answer, not just a dismissal)", () => {
    render(<UiModePrompt />);
    fireEvent.click(screen.getByRole("button", { name: /computer mode/i }));
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("computer");
  });

  it("never re-asks once answered (either way)", () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    const first = render(<UiModePrompt />);
    expect(first.container.querySelector(".uiModeBackdrop")).toBeNull();
    first.unmount();

    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    const second = render(<UiModePrompt />);
    expect(second.container.querySelector(".uiModeBackdrop")).toBeNull();
  });

  it("recommends Phone on a phone-shaped touch device — badge AND first position", () => {
    stubViewport({ coarse: true, width: 390, height: 844 });
    render(<UiModePrompt />);

    const options = screen.getAllByRole("button", { name: /mode/i });
    expect(options[0]!.textContent).toMatch(/phone mode/i);
    expect(options[0]!.className).toContain("recommended");
    expect(options[0]!.textContent).toMatch(/recommended for this device/i);
    // The computer option carries no recommendation.
    expect(options[1]!.className).not.toContain("recommended");
  });

  it("recommends Computer on a desktop — badge AND first position (CONTROL)", () => {
    render(<UiModePrompt />);
    const options = screen.getAllByRole("button", { name: /mode/i });
    expect(options[0]!.textContent).toMatch(/computer mode/i);
    expect(options[0]!.className).toContain("recommended");
  });
});

describe("UiModeToggle (the table-menu switch)", () => {
  it("flips the stored mode both ways", () => {
    render(<UiModeToggle />);
    const toggle = screen.getByRole("button", { name: /computer ui/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("phone");
    expect(screen.getByRole("button", { name: /phone ui/i }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /phone ui/i }));
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("computer");
  });
});
