// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BattlePage from "./page";
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
    roomId: "arena-1",
    name: "Test Arena",
    mode: "combat-sandbox",
    phase: "combat",
    inProgress: true,
    memberCount: 1,
    seatedCount: 1,
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
  // The server returns BOTH an arena and an adventure table; the battle lobby
  // must show only the arena.
  fetchRoomList.mockReset().mockResolvedValue({
    rooms: [entry(), entry({ roomId: "adv-9", name: "Adventure Table", mode: "adventure" })],
    supported: true
  });
  createRoomOnServer.mockReset().mockResolvedValue({ roomId: "new-arena-3" });
  requestCloseRoom.mockReset().mockResolvedValue({ closed: true });
});

afterEach(cleanup);

describe("/battle (combat-sandbox arena browser)", () => {
  it("shows the Battle Test lobby and only combat-sandbox arenas", async () => {
    render(<BattlePage />);

    expect(screen.getByText("Battle Test Arenas")).toBeTruthy();
    expect(screen.getByText(/set up and try a fight/i)).toBeTruthy();

    // The arena appears; the adventure table is filtered out (that lives on /play).
    expect(await screen.findByText("Test Arena")).toBeTruthy();
    expect(screen.queryByText("Adventure Table")).toBeNull();
  });

  it("creates a combat-sandbox arena and stashes the mode handoff before navigating", async () => {
    window.localStorage.setItem("homm3bg.displayName", "Binh");
    render(<BattlePage />);
    await screen.findByText("Test Arena");

    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "My Arena" } });
    fireEvent.click(screen.getByRole("button", { name: /Create arena/i }));

    expect(createRoomOnServer).toHaveBeenCalledWith({
      name: "My Arena",
      createdByName: "Binh",
      mode: "combat-sandbox",
      ranked: false,
      // Ranked forces a closed table; a Normal room carries the explicit choice
      // (default Open) so the edge seeds the same hosting the client applies.
      hosted: false
    });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/?room=new-arena-3"));
    // The mode crosses the navigation so the game page switches the fresh room
    // to combat-sandbox (PartyKit makes every room an adventure lobby first).
    expect(window.sessionStorage.getItem("homm3bg.pendingRoomMode")).toBe(
      JSON.stringify({ roomId: "new-arena-3", mode: "combat-sandbox" })
    );
  });
});
