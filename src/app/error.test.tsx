// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TableError from "./error";

/**
 * Regression guard for the "I press the button but keep staying there" bug. The
 * crash screen must offer recovery that actually escapes:
 *  - "Reload this table" does a real window.location.reload() (a bare reset()
 *    just re-renders the same crash).
 *  - "Start a fresh table" navigates to a NEW room id and wipes the recovery
 *    cache, which is the only path that escapes a crash caused by the room's
 *    own state (reconnecting to the same room re-loads the poison).
 *  - The thrown error's text is shown so it can be reported.
 */
describe("TableError route boundary", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let assignSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    window.localStorage.clear();
    originalLocation = window.location;
    reloadSpy = vi.fn();
    assignSpy = vi.fn();
    // jsdom's location is read-only; swap in a writable stand-in.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        reload: reloadSpy,
        assign: assignSpy,
        pathname: "/",
        href: "http://localhost/?room=broken"
      }
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("hard-reloads the page when 'Reload this table' is clicked", () => {
    const reset = vi.fn();
    render(<TableError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: /reload this table/i }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("navigates to a brand-new room and wipes the cache on 'Start a fresh table'", () => {
    window.localStorage.setItem("homm3bg-room:broken", JSON.stringify({ version: 1, state: {} }));

    render(<TableError error={new Error("boom")} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /start a fresh table/i }));

    // A NEW room id (not the broken one) is the guaranteed escape.
    expect(assignSpy).toHaveBeenCalledTimes(1);
    const target = assignSpy.mock.calls[0][0] as string;
    expect(target).toMatch(/\?room=room-/);
    expect(target).not.toContain("broken");
    // The poisoned save must be gone so no future room can restore it.
    expect(window.localStorage.getItem("homm3bg-room:broken")).toBeNull();
  });

  it("surfaces the thrown error text so it can be reported", () => {
    render(<TableError error={new Error("Cannot read properties of undefined (reading 'spellBook')")} reset={vi.fn()} />);

    expect(screen.getByLabelText(/error detail/i).textContent).toContain("spellBook");
  });
});
