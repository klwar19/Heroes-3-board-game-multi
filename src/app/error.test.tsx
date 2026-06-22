// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TableError from "./error";

/**
 * Regression guard for the "I click but can't go back" bug: the route-level
 * crash screen used to only call Next.js's `reset()`, which re-renders the same
 * crashed segment. When the error recurs on render the click looks dead and the
 * player is trapped. Recovery must do a real `window.location.reload()`, and a
 * second control must drop the room query to escape a broken room.
 */
describe("TableError route boundary", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    reloadSpy = vi.fn();
    // jsdom's location is read-only; swap in a writable stand-in.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        reload: reloadSpy,
        pathname: "/",
        href: "http://localhost/?room=broken"
      }
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  it("hard-reloads the page when 'Reload the table' is clicked", () => {
    const reset = vi.fn();
    render(<TableError error={new Error("boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: /reload the table/i }));

    // A full reload is the guaranteed recovery; reset() alone would re-show the
    // same crash. (reset may also be attempted, but the reload must happen.)
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("drops the room query to return to the menu", () => {
    render(<TableError error={new Error("boom")} reset={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /return to the menu/i }));

    expect(window.location.href).toBe("/");
  });

  it("wipes the recovery cache when returning to the menu", () => {
    // A poisoned save is exactly what keeps the crash screen coming back; the
    // escape hatch must clear it, not just navigate (a plain reload would
    // restore it again).
    window.localStorage.setItem("homm3bg-room:dev-room", JSON.stringify({ version: 1, state: {} }));

    render(<TableError error={new Error("boom")} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /return to the menu/i }));

    expect(window.localStorage.getItem("homm3bg-room:dev-room")).toBeNull();
  });
});
