// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StoryPage from "./page";
import { getCampaignBinding } from "@/lib/campaign-progress";

const { push, createSinglePlayerRoom } = vi.hoisted(() => ({
  push: vi.fn(),
  createSinglePlayerRoom: vi.fn()
}));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/realtime", () => ({ createSinglePlayerRoom }));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  push.mockClear();
  createSinglePlayerRoom.mockReset();
});

describe("/story (campaign hub)", () => {
  it("lists BOTH campaigns", () => {
    render(<StoryPage />);
    expect(screen.getByRole("heading", { name: "The Jianghu Chronicle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bin's Otherworld Chronicle" })).toBeTruthy();
  });

  it("shows Begin on the playable, unlocked Chapter 1 of each campaign", () => {
    render(<StoryPage />);
    expect(screen.getByRole("button", { name: /Begin chapter: Awakening/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Begin chapter: Summoned at Dawn/i })).toBeTruthy();
  });

  it("a LOCKED chapter is not beginnable (CONTROL)", () => {
    render(<StoryPage />);
    // Chapter 2 ("The Valley") is locked until ch-1 is completed.
    expect(screen.queryByRole("button", { name: /Begin chapter: The Valley/i })).toBeNull();
    const valley = screen.getByText("The Valley").closest("li")!;
    expect(valley.textContent).toContain("Locked");
  });

  it("mints the sp room with the chapter's opponent count and binds the campaign context", async () => {
    createSinglePlayerRoom.mockResolvedValue({ roomId: "sp-story-1" });
    render(<StoryPage />);

    fireEvent.click(screen.getByRole("button", { name: /Begin chapter: Awakening/i }));

    await waitFor(() => expect(createSinglePlayerRoom).toHaveBeenCalledWith(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?room=sp-story-1"));
    expect(getCampaignBinding("sp-story-1")).toEqual({ campaignId: "jianghu", chapterId: "ch1" });
  });

  it("renders the completed state and unlocks the next (in-development) chapter", async () => {
    window.localStorage.setItem("binh-campaign:jianghu", JSON.stringify({ completed: ["ch1"] }));
    render(<StoryPage />);

    await waitFor(() => {
      const awakening = screen.getByText("Awakening").closest("li")!;
      expect(awakening.textContent).toContain("Completed");
    });
    // ch-2 is now unlocked but still in development (no Begin button).
    const valley = screen.getByText("The Valley").closest("li")!;
    expect(valley.textContent).toContain("In development");
    expect(screen.queryByRole("button", { name: /Begin chapter: The Valley/i })).toBeNull();
  });

  it("the EN/VI toggle swaps the campaign titles", () => {
    render(<StoryPage />);
    // English by default.
    expect(screen.getByRole("heading", { name: "The Jianghu Chronicle" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    // Vietnamese titles now render.
    expect(screen.getByRole("heading", { name: "Giang Hồ Chí" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dị Giới Ký Của Bin" })).toBeTruthy();
  });
});
