// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOBBY_POLL_MS, RoomBrowser, type RoomBrowserLabels } from "./room-browser";
import * as authClient from "@/lib/auth-client";
import * as realtime from "@/lib/realtime";
import type { RoomDirectoryEntry } from "@/lib/realtime";
import { takePendingCoopRoomSetup } from "@/lib/pending-room-name";

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return { ...actual, fetchSession: vi.fn() };
});
vi.mock("@/lib/lobby-chat-client", () => ({
  fetchLobbyChat: vi.fn().mockResolvedValue([]),
  postLobbyChat: vi.fn()
}));
vi.mock("@/lib/lobby-invites-client", () => ({
  fetchLobbyInvites: vi.fn().mockResolvedValue([]),
  sendLobbyInvite: vi.fn().mockResolvedValue({ id: "inv-1" }),
  dismissLobbyInvite: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/lobby-presence-client", () => ({
  sendPresence: vi.fn().mockResolvedValue([]),
  leavePresence: vi.fn(),
  fetchPresence: vi.fn().mockResolvedValue([])
}));
vi.mock("@/lib/realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realtime")>();
  return {
    ...actual,
    fetchRoomList: vi.fn(),
    requestCloseRoom: vi.fn(),
    requestAdminCloseRoom: vi.fn(),
    createRoomOnServer: vi.fn()
  };
});

const ADMIN = { id: "a1", nickname: "Overlord", email: "boss@x.io", role: "admin", mmr: 1000 } as never;

const ROOM: RoomDirectoryEntry = {
  roomId: "room-xyz",
  name: "Border Skirmish",
  mode: "adventure",
  phase: "setup",
  inProgress: false,
  memberCount: 2,
  seatedCount: 1,
  hosted: true,
  hostName: "Alice",
  ranked: false,
  createdByName: "Alice",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  canClose: false
};

const LABELS: RoomBrowserLabels = {
  badgeNote: "Adventure tables",
  title: "Multiplayer Lobby",
  createLabel: "Create room",
  emptyHint: "No tables yet.",
  backdrop: "lobby-backdrop"
};

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(authClient.fetchSession).mockResolvedValue(ADMIN);
  vi.mocked(realtime.fetchRoomList).mockResolvedValue({ rooms: [ROOM], supported: true });
  vi.mocked(realtime.requestAdminCloseRoom).mockResolvedValue({ closed: true });
  vi.mocked(realtime.requestCloseRoom).mockResolvedValue({ closed: true });
  vi.mocked(realtime.createRoomOnServer).mockReset();
});

afterEach(cleanup);

describe("lobby polling — hidden tabs stop spending edge requests", () => {
  // Every lobby tick fires same-origin /api requests (billed edge requests on
  // the production host); browsers throttle hidden-tab timers but never stop
  // them, so a forgotten tab kept spending around the clock. The gate skips
  // hidden ticks entirely — the visibilitychange refresh restores freshness
  // the instant the tab is looked at again.
  function setVisibility(value: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  }

  afterEach(() => {
    setVisibility("visible");
    vi.useRealTimers();
  });

  it("skips interval ticks while hidden and refreshes instantly on tab focus", async () => {
    vi.useFakeTimers();
    render(<RoomBrowser labels={LABELS} mode="adventure" />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const baseline = vi.mocked(realtime.fetchRoomList).mock.calls.length;
    expect(baseline).toBeGreaterThan(0);

    setVisibility("hidden");
    await act(() => vi.advanceTimersByTimeAsync(LOBBY_POLL_MS * 3));
    expect(vi.mocked(realtime.fetchRoomList).mock.calls.length).toBe(baseline);

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(vi.mocked(realtime.fetchRoomList).mock.calls.length).toBe(baseline + 1);
  });

  it("CONTROL: a visible tab keeps polling on the interval", async () => {
    vi.useFakeTimers();
    render(<RoomBrowser labels={LABELS} mode="adventure" />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const baseline = vi.mocked(realtime.fetchRoomList).mock.calls.length;

    await act(() => vi.advanceTimersByTimeAsync(LOBBY_POLL_MS));
    expect(vi.mocked(realtime.fetchRoomList).mock.calls.length).toBe(baseline + 1);
  });
});

describe("lobby room browser — admin delete goes through the reliable same-origin path", () => {
  it("an admin deletes via requestAdminCloseRoom (cookie-verified, NOT the cross-origin edge)", async () => {
    // The LOBBY is where an admin sees a Delete button on every table. The old
    // cross-origin socket-ticket close kept refusing with "Only members of this
    // room can close it"; an admin now deletes through the same-origin app,
    // which verifies the cookie and forwards to the edge server-side.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RoomBrowser labels={LABELS} mode="adventure" />);
    await waitFor(() => expect(screen.getByText("Border Skirmish")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Admin: delete Border Skirmish/ }));

    await waitFor(() => expect(realtime.requestAdminCloseRoom).toHaveBeenCalledWith("room-xyz"));
    // The fragile cross-origin ticket close is NOT used for the admin action.
    expect(realtime.requestCloseRoom).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("Co-op room browser", () => {
  it("filters out Clash rooms and creates a real unranked Co-op table with AI enemies", async () => {
    vi.mocked(realtime.createRoomOnServer).mockResolvedValue({ roomId: "coop-real" });
    render(
      <RoomBrowser
        labels={{ ...LABELS, title: "Co-op War Room", createLabel: "Open expedition", backdrop: "coop-backdrop" }}
        mode="adventure"
        tableMode="coop"
      />
    );

    await waitFor(() => expect(screen.queryByText("Border Skirmish")).toBeTruthy());
    // The listed fixture has no tableMode, which means legacy Clash, so only
    // the selected battlefield card is visible — not its room-row Join button.
    expect(screen.queryByRole("button", { name: /Watch \/ play Border Skirmish/i })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /2/ }));
    fireEvent.click(screen.getByRole("button", { name: /Open expedition/i }));

    await waitFor(() =>
      expect(realtime.createRoomOnServer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "adventure",
          gameMode: "coop",
          scenarioId: "skirmish",
          ranked: false,
          hosted: true
        })
      )
    );
    expect(takePendingCoopRoomSetup()).toEqual({
      roomId: "coop-real",
      scenarioId: "skirmish",
      computerOpponents: 2
    });
  });
});
