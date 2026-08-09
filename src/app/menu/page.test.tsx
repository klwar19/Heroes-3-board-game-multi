// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "./page";
import * as authClient from "@/lib/auth-client";

const { push, replace, createSinglePlayerRoom } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  createSinglePlayerRoom: vi.fn(),
}));

// Keep the real mute store (the corner MusicToggle drives it); only the
// playback hook is stubbed out — jsdom has no HTMLMediaElement.play().
vi.mock("@/lib/music", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/music")>();
  return { ...actual, useBackgroundMusic: vi.fn() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn() }),
}));
vi.mock("@/lib/realtime", () => ({ createSinglePlayerRoom }));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...actual,
    fetchSession: vi.fn().mockResolvedValue(null),
    logout: vi.fn(),
  };
});

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
  replace.mockClear();
  createSinglePlayerRoom.mockReset();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
  vi.mocked(authClient.fetchSession).mockResolvedValue(null);
});

afterEach(cleanup);

describe("/menu (main menu, guest-only build)", () => {
  it("shows the compact main choices and swaps in the requested submenus", () => {
    render(<MenuPage />);

    expect(screen.getByRole("button", { name: /Single player/i })).toBeTruthy();

    // Story mode moved INTO the single-player page (2026-07) — the main menu
    // no longer carries a direct /story entry.
    expect(screen.queryByRole("link", { name: /Story mode/i })).toBeNull();

    expect(
      screen.getByRole("link", { name: /Map Editor/i }).getAttribute("href"),
    ).toBe("/designer");
    expect(screen.queryByRole("link", { name: /Battle Test/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Single player/i }));
    expect(screen.getByRole("button", { name: /Scenario/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Campaign/i }).getAttribute("href"),
    ).toBe("/story");
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(screen.queryByRole("link", { name: /Scenario/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Multiplayer/i }));
    expect(
      screen.getByRole("link", { name: /Skirmish/i }).getAttribute("href"),
    ).toBe("/play");
    const battleTest = screen.getByRole("link", { name: /Battle Test/i });
    const coOp = screen.getByRole("link", { name: /Co-op/i });
    expect(battleTest.getAttribute("href")).toBe("/battle");
    expect(battleTest.querySelector("img")?.getAttribute("src")).toContain(
      "/assets/ui/menu/buttons/battle-test-fire.webp",
    );
    // CO-OP is a PLACEHOLDER, not a second mode: /play reads no query params, so
    // this lands on the very same adventure lobby Skirmish does (see the
    // NOT-IMPLEMENTED note at the button). Asserted only so the placeholder
    // cannot quietly turn into a broken route.
    expect(coOp.getAttribute("href")).toBe("/play?mode=co-op");
    expect(coOp.querySelector("img")?.getAttribute("src")).toContain(
      "/assets/ui/menu/buttons/co-op-tactics.webp",
    );
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    // Back really returns to the main view — the submenu entries are gone again.
    expect(screen.queryByRole("link", { name: /Skirmish/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Single player/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Miscellaneous/i }));
    expect(
      screen.getByRole("link", { name: /Hall of Fame/i }).getAttribute("href"),
    ).toBe("/hall-of-fame");
    expect(
      screen.getByRole("link", { name: /Credits/i }).getAttribute("href"),
    ).toBe("/credits");
    expect(
      screen.getByRole("link", { name: /Profile/i }).getAttribute("href"),
    ).toBe("/profile");
    // Admin stays gated on an admin ACCOUNT — never shown to a guest.
    expect(screen.queryByRole("link", { name: /Admin/i })).toBeNull();
  });

  it("Scenario creates a private computer room and goes straight to preparation", async () => {
    createSinglePlayerRoom.mockResolvedValue({ roomId: "sp-direct" });
    render(<MenuPage />);
    fireEvent.click(screen.getByRole("button", { name: /Single player/i }));
    fireEvent.click(screen.getByRole("button", { name: /Scenario/i }));
    await waitFor(() => expect(createSinglePlayerRoom).toHaveBeenCalledOnce());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?room=sp-direct"));
  });

  it("every menu button in EVERY view carries an accessible name (the label is baked into the art)", async () => {
    // The art IS the button — there is no text node — so a dropped `aria-label`
    // leaves a nameless control that a screen reader (and every getByRole query)
    // cannot address. Walks all three views, admin entry included, so a button
    // added to a SUBMENU cannot skip the check.
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
    vi.mocked(authClient.fetchSession).mockResolvedValue({
      id: "u1",
      nickname: "Boss",
      role: "admin",
    } as never);
    try {
      render(<MenuPage />);
      await waitFor(() =>
        expect(screen.getByText(/Signed in as Boss/)).toBeTruthy(),
      );

      let checked = 0;
      const auditVisibleButtons = () => {
        for (const el of Array.from(
          document.querySelectorAll(".menuNavButton"),
        )) {
          expect(el.getAttribute("aria-label")?.trim()).toBeTruthy();
          // The art itself must stay out of the accessibility tree.
          const art = el.querySelector("img");
          expect(art?.getAttribute("alt")).toBe("");
          expect(art?.getAttribute("aria-hidden")).toBe("true");
          checked += 1;
        }
      };

      auditVisibleButtons();
      fireEvent.click(screen.getByRole("button", { name: /Single player/i }));
      auditVisibleButtons();
      fireEvent.click(screen.getByRole("button", { name: /Back/i }));
      fireEvent.click(screen.getByRole("button", { name: /Multiplayer/i }));
      auditVisibleButtons();
      fireEvent.click(screen.getByRole("button", { name: /Back/i }));
      fireEvent.click(screen.getByRole("button", { name: /Miscellaneous/i }));
      auditVisibleButtons();

      // Main 5 + single-player 3 + multiplayer 4 + miscellaneous 5 = 17.
      expect(checked).toBe(17);
    } finally {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    }
  });

  it("carries the compact corner music switch, and clicking it really mutes the store", async () => {
    const music = await import("@/lib/music");
    music.__resetMusicForTests();
    render(<MenuPage />);

    // Icon-only compact form pinned by the `.menuMusicToggle` corner class.
    const toggle = screen.getByRole("button", { name: /Turn the music off/i });
    expect(toggle.className).toContain("musicToggle");
    expect(toggle.className).toContain("compact");
    expect(toggle.className).toContain("menuMusicToggle");
    // No text node — the compact form is the icon alone.
    expect(toggle.textContent).toBe("");

    // The observable effect: the persisted music store actually flips.
    expect(music.isMusicMuted()).toBe(false);
    fireEvent.click(toggle);
    expect(music.isMusicMuted()).toBe(true);
    expect(window.localStorage.getItem("h3-music-muted")).toBe("1");
    expect(screen.getByRole("button", { name: /Turn the music on/i })).toBe(toggle);
    fireEvent.click(toggle);
    expect(music.isMusicMuted()).toBe(false);
  });

  it("plays the menu loop MUTED and keeps the still art behind it as the fallback", () => {
    // Browsers BLOCK un-muted autoplay, so a missing `muted` silently kills the
    // backdrop. The still <img> must also stay mounted underneath: it is what
    // shows through on a slow/failed video load and under reduced motion (where
    // CSS hides the video), instead of a bare black page.
    render(<MenuPage />);
    const video = document.querySelector(
      "video.menuShellBackdropVideo",
    ) as HTMLVideoElement | null;
    expect(video).toBeTruthy();
    expect(video?.muted).toBe(true);
    expect(video?.hasAttribute("autoplay")).toBe(true);
    expect(video?.hasAttribute("loop")).toBe(true);
    expect(video?.hasAttribute("playsinline")).toBe(true);
    expect(video?.getAttribute("src")).toContain(
      "/assets/ui/menu/main-menu-loop-v6.mp4",
    );
    expect(video?.getAttribute("poster")).toContain(
      "/assets/ui/menu/main-menu-fallback.webp",
    );

    const still = document.querySelector("img.menuShellBackdrop");
    expect(still).toBeTruthy();
    expect(still?.getAttribute("src")).toContain(
      "/assets/ui/menu/main-menu-fallback.webp",
    );
    // The still is BEHIND the video (earlier in document order = painted under).
    expect(
      (still as Element).compareDocumentPosition(video as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("Logout in guest mode CLEARS the guest flag and returns to login", () => {
    window.localStorage.setItem("homm3bg.guest", "1");
    render(<MenuPage />);
    fireEvent.click(screen.getByRole("button", { name: /Logout/i }));
    // The observable outcome, not just the navigation: the guest flag is gone,
    // so /login does not wave the same stale guest straight back through.
    expect(window.localStorage.getItem("homm3bg.guest")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("shows the persisted guest name with a change-name link to /login", () => {
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    render(<MenuPage />);
    expect(screen.getByText(/Playing as Binh/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Change name/i }).getAttribute("href"),
    ).toBe("/login");
  });

  it("prompts for a name when none is stored", () => {
    render(<MenuPage />);
    expect(screen.getByText(/No player name set/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Choose a name/i }).getAttribute("href"),
    ).toBe("/login");
  });

  it("asks the Computer/Phone layout question at the very start (preference unset)", () => {
    // localStorage is cleared in beforeEach, so the per-browser mode is unset:
    // the entry-page mount must show the pre-game prompt straight away. Fails if
    // the <UiModePrompt /> mount is removed from the menu page.
    render(<MenuPage />);
    expect(
      screen.getByRole("dialog", { name: /choose your screen layout/i }),
    ).toBeTruthy();
  });

  it("does NOT ask the layout question once the mode is already chosen (CONTROL)", () => {
    window.localStorage.setItem("binh-ui-mode", "computer");
    render(<MenuPage />);
    expect(
      screen.queryByRole("dialog", { name: /choose your screen layout/i }),
    ).toBeNull();
  });
});

describe("/menu (accounts enabled) — guest login temporarily disabled", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
  });

  it("a stale guest flag is NO LONGER let through — it is bounced to /login", async () => {
    // Even a previously-chosen guest (flag set, no session) is now redirected,
    // because guest login is disabled. This is the behaviour that changed.
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    window.localStorage.setItem("homm3bg.guest", "1");
    render(<MenuPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("no session AND no guest choice → redirected to /login", async () => {
    render(<MenuPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("CONTROL: a signed-in account is UNAFFECTED — shown by nickname with a Logout button", async () => {
    vi.mocked(authClient.fetchSession).mockResolvedValue({
      id: "u1",
      nickname: "Boss",
      role: "player",
    } as never);
    render(<MenuPage />);
    await waitFor(() =>
      expect(screen.getByText(/Signed in as Boss/)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Logout/i })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("a signed-in account's Logout ends the SESSION (not just the guest flag)", async () => {
    vi.mocked(authClient.fetchSession).mockResolvedValue({
      id: "u1",
      nickname: "Boss",
      role: "player",
    } as never);
    render(<MenuPage />);
    await waitFor(() =>
      expect(screen.getByText(/Signed in as Boss/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Logout/i }));
    await waitFor(() =>
      expect(vi.mocked(authClient.logout)).toHaveBeenCalled(),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("Admin is offered to an admin under Miscellaneous — and NOT to a plain player (CONTROL)", async () => {
    vi.mocked(authClient.fetchSession).mockResolvedValue({
      id: "u1",
      nickname: "Boss",
      role: "admin",
    } as never);
    render(<MenuPage />);
    await waitFor(() =>
      expect(screen.getByText(/Signed in as Boss/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Miscellaneous/i }));
    expect(
      screen.getByRole("link", { name: /Admin/i }).getAttribute("href"),
    ).toBe("/admin");

    cleanup();
    vi.mocked(authClient.fetchSession).mockResolvedValue({
      id: "u2",
      nickname: "Rank",
      role: "player",
    } as never);
    render(<MenuPage />);
    await waitFor(() =>
      expect(screen.getByText(/Signed in as Rank/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Miscellaneous/i }));
    expect(screen.queryByRole("link", { name: /Admin/i })).toBeNull();
  });
});
