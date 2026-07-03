// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "./page";

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })
}));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe("/menu (main menu)", () => {
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
