// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() })
}));

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

afterEach(cleanup);

describe("/login (guest mode)", () => {
  it("persists the typed name and forwards to /menu", () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/name other players will see/i), {
      target: { value: "  Catherine " }
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));

    // The same localStorage key the rooms read (src/lib/identity.ts).
    expect(window.localStorage.getItem("homm3bg.displayName")).toBe("Catherine");
    expect(push).toHaveBeenCalledWith("/menu");
  });

  it("prefills the stored name and keeps it when submitted unchanged-empty", () => {
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    render(<LoginPage />);

    const input = screen.getByLabelText(/name other players will see/i) as HTMLInputElement;
    expect(input.value).toBe("Binh");

    // Clearing the field and continuing must not erase the stored name —
    // a blank submit just skips the rename.
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));
    expect(window.localStorage.getItem("homm3bg.displayName")).toBe("Binh");
    expect(push).toHaveBeenCalledWith("/menu");
  });
});
