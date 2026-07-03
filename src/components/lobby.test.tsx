// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LobbyScreen } from "./lobby";
import type { RoomDirectoryEntry } from "@/lib/realtime";

afterEach(cleanup);

function entry(overrides: Partial<RoomDirectoryEntry> = {}): RoomDirectoryEntry {
  return {
    roomId: "room-abc",
    name: "Binh's Game",
    phase: "setup",
    inProgress: false,
    memberCount: 1,
    seatedCount: 0,
    hosted: false,
    hostName: null,
    createdByName: "Binh",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canClose: false,
    ...overrides
  };
}

function renderLobby(props: Partial<Parameters<typeof LobbyScreen>[0]> = {}) {
  const handlers = {
    onRename: vi.fn(),
    onRefresh: vi.fn(),
    onJoin: vi.fn(),
    onCreate: vi.fn(),
    onClose: vi.fn()
  };
  render(
    <LobbyScreen
      rooms={[]}
      supported
      loading={false}
      error={null}
      displayName="Binh"
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("LobbyScreen", () => {
  it("lists rooms with their name and status, and joining fires onJoin", () => {
    const handlers = renderLobby({
      rooms: [entry({ roomId: "room-1", name: "Friday Night", inProgress: true, memberCount: 2, seatedCount: 2 })]
    });

    expect(screen.getByText("Friday Night")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Watch \/ play/i }));
    expect(handlers.onJoin).toHaveBeenCalledWith("room-1");
  });

  it("creates an OPEN room with the typed name by default", () => {
    const handlers = renderLobby();
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "My Table" } });
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    // Open table is the default (hosted = false).
    expect(handlers.onCreate).toHaveBeenCalledWith("My Table", false);
  });

  it("creates a CLOSED (hosted) room when Closed table is picked", () => {
    const handlers = renderLobby();
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Locked Table" } });
    fireEvent.click(screen.getByRole("radio", { name: /Closed table/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    expect(handlers.onCreate).toHaveBeenCalledWith("Locked Table", true);
    // Control: switching back to Open reverts the choice (re-type — create clears the field).
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Free Table" } });
    fireEvent.click(screen.getByRole("radio", { name: /Open table/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    expect(handlers.onCreate).toHaveBeenLastCalledWith("Free Table", false);
  });

  it("joins by room code", () => {
    const handlers = renderLobby();
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "  room-xyz  " } });
    fireEvent.click(screen.getByRole("button", { name: /^Join$/i }));
    expect(handlers.onJoin).toHaveBeenCalledWith("room-xyz");
  });

  it("only shows the close control on rooms the viewer can close", () => {
    const handlers = renderLobby({
      rooms: [
        entry({ roomId: "mine", name: "Mine", canClose: true }),
        entry({ roomId: "theirs", name: "Theirs", canClose: false })
      ]
    });

    const mineRow = screen.getByText("Mine").closest("li") as HTMLElement;
    const theirsRow = screen.getByText("Theirs").closest("li") as HTMLElement;
    expect(within(mineRow).queryByLabelText(/Close Mine/i)).toBeTruthy();
    expect(within(theirsRow).queryByLabelText(/Close Theirs/i)).toBeNull();

    fireEvent.click(within(mineRow).getByLabelText(/Close Mine/i));
    expect(handlers.onClose).toHaveBeenCalledWith("mine");
  });

  it("shows the edge-backend fallback note instead of a list when unsupported", () => {
    renderLobby({ supported: false, rooms: [entry()] });
    expect(screen.getByText(/isn't available on the edge/i)).toBeTruthy();
    // The room list is suppressed entirely.
    expect(screen.queryByText("Binh's Game")).toBeNull();
  });

  it("shows a loading note while the first fetch is in flight", () => {
    renderLobby({ loading: true, rooms: [] });
    expect(screen.getByText(/Loading rooms/i)).toBeTruthy();
  });
});
