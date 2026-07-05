// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomBrowser, type RoomBrowserLabels } from "./room-browser";
import * as authClient from "@/lib/auth-client";
import * as realtime from "@/lib/realtime";
import type { RoomDirectoryEntry } from "@/lib/realtime";

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
vi.mock("@/lib/realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...actual, fetchRoomList: vi.fn(), requestCloseRoom: vi.fn(), createRoomOnServer: vi.fn() };
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
  vi.mocked(authClient.fetchSession).mockResolvedValue(ADMIN);
  vi.mocked(realtime.fetchRoomList).mockResolvedValue({ rooms: [ROOM], supported: true });
  vi.mocked(realtime.requestCloseRoom).mockResolvedValue({ closed: true });
});

afterEach(cleanup);

describe("lobby room browser — admin delete goes through the ticketed close path", () => {
  it("passes the socket-token provider so the PartyKit edge can verify the admin session", async () => {
    // The /admin page attaches the ticket, but the LOBBY is where an admin
    // actually sees a Delete button on every table — a close from here used to
    // omit the ticket, so the cross-origin edge saw a stranger and refused
    // ("Only members of this room can close it"). Pin the wired call shape.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RoomBrowser labels={LABELS} mode="adventure" />);
    await waitFor(() => expect(screen.getByText("Border Skirmish")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Admin: delete Border Skirmish/ }));

    await waitFor(() =>
      expect(realtime.requestCloseRoom).toHaveBeenCalledWith("room-xyz", expect.any(String), expect.any(Function))
    );
    // The provider handed over IS the session-ticket minting function — not
    // some inert stub — so the edge can resolve the admin's session.
    const provider = vi.mocked(realtime.requestCloseRoom).mock.calls[0][2];
    expect(provider).toBe(authClient.fetchSocketToken);
    confirmSpy.mockRestore();
  });
});
