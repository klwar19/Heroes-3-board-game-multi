// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayPage from "./page";
import type { RoomDirectoryEntry } from "@/lib/realtime";

const { push, fetchRoomList, createRoomOnServer, requestCloseRoom } = vi.hoisted(() => ({
  push: vi.fn(),
  fetchRoomList: vi.fn(),
  createRoomOnServer: vi.fn(),
  requestCloseRoom: vi.fn()
}));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/realtime", () => ({ fetchRoomList, createRoomOnServer, requestCloseRoom }));

function entry(overrides: Partial<RoomDirectoryEntry> = {}): RoomDirectoryEntry {
  return {
    roomId: "room-1",
    name: "Friday Night",
    mode: "adventure",
    phase: "setup",
    inProgress: false,
    memberCount: 1,
    seatedCount: 0,
    hosted: false,
    hostName: null,
    ranked: true,
    createdByName: "Binh",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canClose: false,
    ...overrides
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  push.mockClear();
  fetchRoomList.mockReset().mockResolvedValue({ rooms: [entry()], supported: true });
  createRoomOnServer.mockReset().mockResolvedValue({ roomId: "new-room-7" });
  requestCloseRoom.mockReset().mockResolvedValue({ closed: true });
});

afterEach(cleanup);

describe("/play (multiplayer room browser)", () => {
  it("shows the Erathia server badge and the room directory", async () => {
    render(<PlayPage />);

    expect(screen.getByText("Erathia")).toBeTruthy();
    expect(screen.getByText(/Adventure tables/i)).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();

    // Directory entries arrive through the reused LobbyScreen.
    expect(await screen.findByText("Friday Night")).toBeTruthy();
    expect(fetchRoomList).toHaveBeenCalled();
  });

  it("joining a room navigates to the game page's ?room= deep link", async () => {
    render(<PlayPage />);
    await screen.findByText("Friday Night");

    // The room row's main button (accessible name includes the room name).
    fireEvent.click(screen.getByRole("button", { name: /Friday Night/ }));
    expect(push).toHaveBeenCalledWith("/?room=room-1");
  });

  it("creating a named room stores the name handoff and navigates to it", async () => {
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    render(<PlayPage />);
    await screen.findByText("Friday Night");

    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "My Table" } });
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));

    expect(createRoomOnServer).toHaveBeenCalledWith({
      name: "My Table",
      createdByName: "Binh",
      mode: "adventure",
      ranked: false,
      // Ranked forces a closed table; a Normal room carries the explicit choice
      // (default Open) so the edge seeds the same hosting the client applies.
      hosted: false
    });
    // The create call resolves asynchronously before navigation.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/?room=new-room-7"));
    // The chosen name crosses the navigation for the game page to apply
    // (PartyKit names rooms client-side after the first connect).
    expect(window.sessionStorage.getItem("homm3bg.pendingRoomName")).toBe(
      JSON.stringify({ roomId: "new-room-7", name: "My Table" })
    );
  });

  it("shows the social rail — Players online + lobby chat — beside the room directory", async () => {
    render(<PlayPage />);
    await screen.findByText("Friday Night");

    // The rail is a landmark so it is discoverable and always on screen (the
    // CSS pins it as the right-hand column; narrow screens stack it below).
    const rail = screen.getByRole("complementary", { name: /Players online and lobby chat/i });
    expect(rail.className).toBe("lobbySidebar");
    // Both live panels render INSIDE the rail, not below the fold.
    expect(screen.getByText("Players online").closest("aside")).toBe(rail);
    expect(screen.getByText("Lobby chat").closest("aside")).toBe(rail);
    // Rooms stay OUTSIDE the rail, in the main column of the same layout grid.
    const layout = rail.parentElement;
    expect(layout?.className).toBe("lobbyLayout");
    expect(screen.getByText("Friday Night").closest("aside")).toBeNull();
    expect(layout?.contains(screen.getByText("Friday Night"))).toBe(true);
  });

  it("surfaces a directory failure instead of a silent empty list", async () => {
    fetchRoomList.mockRejectedValue(new Error("offline"));
    render(<PlayPage />);
    expect(await screen.findByText(/Could not load the room list/i)).toBeTruthy();
  });

  it("asks the Computer/Phone layout question at the very start (preference unset)", () => {
    // localStorage is cleared in beforeEach, so the per-browser mode is unset:
    // the lobby entry-page mount must show the pre-game prompt. Fails if the
    // <UiModePrompt /> mount is removed from the play page.
    render(<PlayPage />);
    expect(screen.getByRole("dialog", { name: /choose your screen layout/i })).toBeTruthy();
  });

  it("does NOT ask the layout question once the mode is already chosen (CONTROL)", () => {
    window.localStorage.setItem("binh-ui-mode", "computer");
    render(<PlayPage />);
    expect(screen.queryByRole("dialog", { name: /choose your screen layout/i })).toBeNull();
  });
});
