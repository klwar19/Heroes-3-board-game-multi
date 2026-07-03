// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "./page";
import * as authClient from "@/lib/auth-client";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() })
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return { ...actual, fetchSession: vi.fn().mockResolvedValue(null), logout: vi.fn() };
});

beforeEach(() => {
  window.localStorage.clear();
  replace.mockClear();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
  vi.mocked(authClient.fetchSession).mockResolvedValue(null);
});

afterEach(cleanup);

describe("/menu (main menu, guest-only build)", () => {
  it("greys out Single player and links Multiplayer, Battle Test, Map Designer, Hall of Fame and Credits", () => {
    render(<MenuPage />);

    const single = screen.getByRole("button", { name: /Single player/i });
    expect(single).toHaveProperty("disabled", true);

    expect(screen.getByRole("link", { name: /Multiplayer/i }).getAttribute("href")).toBe("/play");
    // The shared Battle Test arenas and Map Designer are first-class menu destinations.
    expect(screen.getByRole("link", { name: /Battle Test/i }).getAttribute("href")).toBe("/battle");
    expect(screen.getByRole("link", { name: /Map Designer/i }).getAttribute("href")).toBe("/designer");
    expect(screen.getByRole("link", { name: /Hall of Fame/i }).getAttribute("href")).toBe("/hall-of-fame");
    expect(screen.getByRole("link", { name: /Credits/i }).getAttribute("href")).toBe("/credits");
  });

  it("hides Logout in guest mode (accounts are not built yet)", () => {
    render(<MenuPage />);
    expect(screen.queryByText(/Logout/i)).toBeNull();
  });

  it("shows the persisted guest name with a change-name link to /login", () => {
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    render(<MenuPage />);
    expect(screen.getByText(/Playing as Binh/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Change name/i }).getAttribute("href")).toBe("/login");
  });

  it("prompts for a name when none is stored", () => {
    render(<MenuPage />);
    expect(screen.getByText(/No player name set/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Choose a name/i }).getAttribute("href")).toBe("/login");
  });
});

describe("/menu (accounts enabled) — guest is let through, not bounced to login", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
  });

  it("a chosen guest (guest flag set, no session) stays on the menu and plays", async () => {
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    window.localStorage.setItem("homm3bg.guest", "1");
    render(<MenuPage />);

    // Multiplayer is reachable and the footer greets the guest.
    await waitFor(() => expect(screen.getByText(/Playing as guest: Binh/)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Multiplayer/i }).getAttribute("href")).toBe("/play");
    // Crucially, it did NOT bounce back to /login.
    expect(replace).not.toHaveBeenCalled();
  });

  it("CONTROL: no session AND no guest choice → redirected to /login", async () => {
    render(<MenuPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("a signed-in account is shown by nickname with a Logout button", async () => {
    vi.mocked(authClient.fetchSession).mockResolvedValue({ id: "u1", nickname: "Boss", role: "player" } as never);
    render(<MenuPage />);
    await waitFor(() => expect(screen.getByText(/Signed in as Boss/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Logout/i })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
