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
  it("says Playing with computer and defaults to ONE computer opponent", () => {
    render(<SinglePlayerPage />);
    expect(screen.getByRole("heading", { name: /Playing with computer/i })).toBeTruthy();
    const group = screen.getByRole("group", { name: /Computer opponents/i });
    const one = screen.getByRole("button", { name: "1" });
    expect(group.contains(one)).toBe(true);
    expect(one.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("creates the private game with the chosen count and navigates to the room", async () => {
    createSinglePlayerRoom.mockResolvedValue({ roomId: "sp-abc123" });
    render(<SinglePlayerPage />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: /Create game/i }));

    await waitFor(() => expect(createSinglePlayerRoom).toHaveBeenCalledWith(3));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?room=sp-abc123"));
  });

  it("surfaces a creation failure instead of navigating", async () => {
    createSinglePlayerRoom.mockRejectedValue(new Error("offline"));
    render(<SinglePlayerPage />);

    fireEvent.click(screen.getByRole("button", { name: /Create game/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("offline"));
    expect(push).not.toHaveBeenCalled();
  });
});
