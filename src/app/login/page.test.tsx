// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() })
}));

// AccountAuth (rendered only in the accounts-on branch) talks to the network on
// mount — stub the client so the login page renders offline in tests.
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...actual,
    fetchSession: vi.fn().mockResolvedValue(null),
    login: vi.fn(),
    register: vi.fn(),
    requestReset: vi.fn(),
    resendConfirmation: vi.fn(),
    checkAvailability: vi.fn()
  };
});

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
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

describe("/login (accounts enabled) — guest is a choice beside accounts", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
  });

  it("shows the account Sign in / Register tabs AND a Continue-as-guest option", () => {
    render(<LoginPage />);
    // Primary path: real accounts.
    expect(screen.getByRole("tab", { name: /Sign in/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Register/i })).toBeTruthy();
    // Secondary path, right beside it.
    expect(screen.getByRole("button", { name: /Continue as guest/i })).toBeTruthy();
  });

  it("continuing as guest stores the name, clears a cached account, and forwards to /menu", () => {
    // Simulate a previously signed-in identity cached in this browser.
    window.localStorage.setItem(
      "homm3bg.account",
      JSON.stringify({ userId: "u1", nickname: "Old", role: "player" })
    );
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/Guest name other players will see/i), {
      target: { value: " Binh " }
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));

    expect(window.localStorage.getItem("homm3bg.displayName")).toBe("Binh");
    // The stale signed-in identity is dropped so the player is a true guest.
    expect(window.localStorage.getItem("homm3bg.account")).toBeNull();
    expect(push).toHaveBeenCalledWith("/menu");
  });
});
