// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";
import * as authClient from "@/lib/auth-client";
import * as realtime from "@/lib/realtime";
import type { RoomDirectoryEntry } from "@/lib/realtime";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/lib/music", () => ({ useBackgroundMusic: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }) }));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return { ...actual, fetchSession: vi.fn(), adminListPlayers: vi.fn(), adminAction: vi.fn() };
});
vi.mock("@/lib/realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...actual, fetchRoomList: vi.fn(), requestCloseRoom: vi.fn() };
});

const ADMIN = { id: "a1", nickname: "Overlord", email: "boss@x.io", role: "admin", mmr: 1000 } as never;

function room(over: Partial<RoomDirectoryEntry>): RoomDirectoryEntry {
  return {
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
    canClose: false,
    ...over
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
  replace.mockClear();
  vi.mocked(authClient.fetchSession).mockResolvedValue(ADMIN);
  vi.mocked(authClient.adminListPlayers).mockResolvedValue([ADMIN]);
  vi.mocked(realtime.fetchRoomList).mockResolvedValue({ rooms: [room({})], supported: true });
  vi.mocked(realtime.requestCloseRoom).mockResolvedValue({ closed: true });
});

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
});

describe("/admin — room management", () => {
  it("lists active rooms for an admin", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText("Rooms")).toBeTruthy());
    expect(screen.getByText("Border Skirmish")).toBeTruthy();
    // A hosted (closed) setup room is labelled as such.
    expect(screen.getByText(/closed/)).toBeTruthy();
  });

  it("deletes a room through the admin-authenticated close path", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText("Border Skirmish")).toBeTruthy());

    const roomRow = screen.getByText("Border Skirmish").closest("tr") as HTMLElement;
    fireEvent.click(roomRow.querySelector("button.danger") as HTMLElement);

    // The socket-token provider is passed so the cross-origin edge can verify
    // this admin's session (the built-in backend ignores it).
    await waitFor(() =>
      expect(realtime.requestCloseRoom).toHaveBeenCalledWith("room-xyz", expect.any(String), expect.any(Function))
    );
    confirmSpy.mockRestore();
  });
});
