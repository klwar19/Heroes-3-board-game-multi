// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StoryPage from "./page";
import { getCampaignBinding } from "@/lib/campaign-progress";

const { push, createSinglePlayerRoom } = vi.hoisted(() => ({ push: vi.fn(), createSinglePlayerRoom: vi.fn() }));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/lib/realtime", () => ({ createSinglePlayerRoom }));

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); push.mockClear(); createSinglePlayerRoom.mockReset(); });

describe("/story (Erathia campaign map)", () => {
  it("returns to the main menu's Scenario/Campaign submenu", () => {
    render(<StoryPage />);
    expect(screen.getByRole("link", { name: /Back/i }).getAttribute("href")).toBe(
      "/menu?view=singlePlayer",
    );
  });

  it("shows only Restoration of Erathia on the main map and keeps mods in the corner", () => {
    render(<StoryPage />);
    expect(screen.getByRole("heading", { name: "Restoration of Erathia" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "The Jianghu Chronicle" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /MODS/i }));
    expect(screen.getByText("The Jianghu Chronicle")).toBeTruthy();
    expect(screen.getByText("Bin's Otherworld Chronicle")).toBeTruthy();
  });

  it("renders the six-mission restoration route with sequential locks", () => {
    render(<StoryPage />);
    expect(screen.getByRole("button", { name: /Homecoming — available/i })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Guardian Angels — locked/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Griffin Cliff — locked/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Road to Steadwick — locked/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Liberation Day — locked/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Throne of Ash — locked/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens a full briefing with rules, bonuses, heroes and computer forces", () => {
    render(<StoryPage />);
    fireEvent.click(screen.getByRole("button", { name: /Open briefing/i }));
    expect(screen.getByRole("dialog", { name: /Homecoming briefing/i })).toBeTruthy();
    expect(screen.getAllByText("Defeat Terraneus's marked garrison or control 2 towns; then score VP").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Militia Muster/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Catherine")).toBeTruthy();
    expect(screen.getByText("Dungeon")).toBeTruthy();
    expect(screen.getByText(/20 fixed tiles/i)).toBeTruthy();
    expect(screen.getByText(/Authored map locked/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Event cards/i }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Spell Book/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("mints the room with the chapter opponent count and selected bonus binding", async () => {
    createSinglePlayerRoom.mockResolvedValue({ roomId: "sp-story-1" });
    render(<StoryPage />);
    fireEvent.click(screen.getByRole("button", { name: /Open briefing/i }));
    fireEvent.click(screen.getByRole("button", { name: /Supply Wagons/i }));
    fireEvent.click(screen.getByRole("button", { name: /Event cards/i }));
    fireEvent.click(screen.getByRole("button", { name: /Morale cards/i }));
    fireEvent.click(screen.getByRole("button", { name: /Unit experience/i }));
    fireEvent.click(screen.getByRole("button", { name: /Begin chapter/i }));
    await waitFor(() => expect(createSinglePlayerRoom).toHaveBeenCalledWith(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?room=sp-story-1"));
    expect(getCampaignBinding("sp-story-1")).toEqual({
      campaignId: "erathia",
      chapterId: "homecoming",
      bonusId: "rare-resources",
      rules: {
        events: true,
        moraleCards: true,
        spellBook: true,
        creatureBanks: true,
        startingHandMulligan: true,
        unitExperience: true,
      },
    });
  });

  it("unlocks Guardian Angels after Homecoming completion", async () => {
    window.localStorage.setItem("binh-campaign:erathia", JSON.stringify({ completed: ["homecoming"] }));
    render(<StoryPage />);
    await waitFor(() => expect((screen.getByRole("button", { name: /Guardian Angels — available/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /Guardian Angels — available/i }));
    expect(screen.getByRole("heading", { name: "Guardian Angels" })).toBeTruthy();
  });

  it("moves the language switch to the corner and localizes campaign copy", () => {
    render(<StoryPage />);
    const toggle = screen.getByRole("button", { name: "EN" });
    expect(toggle.className).toContain("campaignLanguage");
    fireEvent.click(toggle);
    expect(screen.getByRole("heading", { name: "Phục Hưng Erathia" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ngày Trở Về/ })).toBeTruthy();
  });
});
