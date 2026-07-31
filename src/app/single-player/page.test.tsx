// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SinglePlayerPage from "./page";

const { push, createSinglePlayerRoom } = vi.hoisted(() => ({
  push: vi.fn(),
  createSinglePlayerRoom: vi.fn()
}));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/realtime", () => ({ createSinglePlayerRoom }));

afterEach(() => {
  cleanup();
  push.mockClear();
  createSinglePlayerRoom.mockReset();
});

describe("/single-player (creation panel)", () => {
  it("shows exactly VS Computer, Campaign and Back before configuration", () => {
    render(<SinglePlayerPage />);
    expect(screen.getByRole("heading", { name: /Single Player/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /VS Computer/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Campaign/i }).getAttribute("href")).toBe("/story");
    expect(screen.getByRole("link", { name: /Back/i }).getAttribute("href")).toBe("/menu");
    expect(screen.queryByRole("group", { name: /Computer opponents/i })).toBeNull();
  });

  it("opens the opponent picker on VS Computer and defaults to one", () => {
    render(<SinglePlayerPage />);
    fireEvent.click(screen.getByRole("button", { name: /VS Computer/i }));
    const group = screen.getByRole("group", { name: /Computer opponents/i });
    const one = screen.getByRole("button", { name: "1 computer opponent" });
    expect(group.contains(one)).toBe(true);
    expect(one.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3 computer opponents" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("uses the generated campaign art on the Campaign entry", () => {
    render(<SinglePlayerPage />);
    const story = screen.getByRole("link", { name: /Campaign/i });
    expect(story.getAttribute("href")).toBe("/story");
    const icon = story.querySelector("img.singlePlayerNavArt");
    expect(icon).toBeTruthy();
    expect(icon!.getAttribute("src")).toContain("/assets/ui/single-player/campaign.webp");
  });

  it("creates the private game with the chosen count and navigates to the room", async () => {
    createSinglePlayerRoom.mockResolvedValue({ roomId: "sp-abc123" });
    render(<SinglePlayerPage />);

    fireEvent.click(screen.getByRole("button", { name: /VS Computer/i }));
    fireEvent.click(screen.getByRole("button", { name: "3 computer opponents" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue with 3 opponents/i }));

    await waitFor(() => expect(createSinglePlayerRoom).toHaveBeenCalledWith(3));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?room=sp-abc123"));
  });

  it("surfaces a creation failure instead of navigating", async () => {
    createSinglePlayerRoom.mockRejectedValue(new Error("offline"));
    render(<SinglePlayerPage />);

    fireEvent.click(screen.getByRole("button", { name: /VS Computer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue with 1 opponent/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("offline"));
    expect(push).not.toHaveBeenCalled();
  });
});
