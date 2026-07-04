// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WelcomeNotice } from "./welcome-notice";

afterEach(cleanup);
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("WelcomeNotice", () => {
  it("greets the player as a fan-made game by BINH", () => {
    render(<WelcomeNotice />);
    const dialog = screen.getByRole("dialog", { name: "Welcome" });
    expect(dialog.textContent).toMatch(/fan-made/i);
    expect(dialog.textContent).toMatch(/BINH/);
    expect(dialog.textContent).toMatch(/house rules/i);
  });

  it("closes on Enter and does not reappear in the same session", () => {
    const first = render(<WelcomeNotice />);
    fireEvent.click(screen.getByRole("button", { name: /Enter Erathia/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();

    // Same session: the sessionStorage flag suppresses the repeat.
    render(<WelcomeNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("'Don't show again' persists a localStorage opt-out across sessions", () => {
    render(<WelcomeNotice />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Don't show this again/i }));
    fireEvent.click(screen.getByRole("button", { name: /Enter Erathia/ }));
    expect(localStorage.getItem("binh-welcome-dismissed")).toBe("1");

    // A brand-new session (clear only session storage) still stays hidden.
    cleanup();
    sessionStorage.clear();
    render(<WelcomeNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
