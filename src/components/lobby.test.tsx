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
    expect(screen.getByText("Game on")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Watch \/ play/i }));
    expect(handlers.onJoin).toHaveBeenCalledWith("room-1");
  });

  it("a locked room asks for a password on Join; empty password never joins", () => {
    const handlers = renderLobby({
      rooms: [
        entry({
          roomId: "room-locked",
          name: "Secret Table",
          locked: true,
          memberCount: 1,
          hostName: "Host"
        })
      ]
    });

    // Room row Join (not the empty join-by-code control).
    const roomJoin = screen
      .getAllByRole("button", { name: /^Join$/i })
      .find((btn) => !(btn as HTMLButtonElement).disabled);
    expect(roomJoin).toBeTruthy();
    fireEvent.click(roomJoin!);
    // Prompt is open — no navigation yet.
    expect(handlers.onJoin).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Room password/i })).toBeTruthy();

    // Empty password: Join stays disabled / no-op.
    const joinInDialog = within(screen.getByRole("dialog")).getByRole("button", { name: /^Join$/i });
    expect((joinInDialog as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(joinInDialog);
    expect(handlers.onJoin).not.toHaveBeenCalled();

    // Typed password → join with it.
    const dialog = screen.getByRole("dialog", { name: /Room password/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Room password"), {
      target: { value: "swordfish" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Join$/i }));
    expect(handlers.onJoin).toHaveBeenCalledWith("room-locked", "swordfish");
  });

  it("admin can still delete a locked room without entering the password", () => {
    const handlers = renderLobby({
      isAdmin: true,
      rooms: [
        entry({
          roomId: "room-admin-del",
          name: "Admin Target",
          locked: true,
          canClose: false
        })
      ]
    });
    fireEvent.click(screen.getByRole("button", { name: /Admin: delete Admin Target/i }));
    expect(handlers.onClose).toHaveBeenCalledWith("room-admin-del");
    expect(handlers.onJoin).not.toHaveBeenCalled();
  });

  it("labels guests only when accounts are ON, and marks who is actually connected", () => {
    const prev = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
    try {
      renderLobby({
        rooms: [
          entry({
            roomId: "room-live",
            name: "Live Table",
            memberCount: 2,
            seatedCount: 2,
            members: [
              { name: "Alice", host: true, guest: false, seated: true },
              { name: "Bob", host: false, guest: true, seated: true }
            ]
          })
        ],
        onlinePlayers: [
          { clientId: "cA", name: "Alice", verified: true, roomId: "room-live", roomName: "Live Table" }
        ]
      });
      // Verified nickname plain (and linked to their profile); guest honestly labeled.
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Alice" }).getAttribute("href")).toBe("/players/Alice");
      expect(screen.getByText(/guest — Bob/)).toBeTruthy();
      // Alice is connected (presence); Bob is on the roster but not online.
      expect(screen.getByText("Alice").closest(".lobbyRoomPerson")?.className).toMatch(/\blive\b/);
      expect(screen.getByText(/guest — Bob/).closest(".lobbyRoomPerson")?.className).toMatch(/\baway\b/);
      // Connected count uses presence, not the full roster.
      expect(screen.getByText(/1 online \/ 2/)).toBeTruthy();
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = prev;
      }
    }
  });

  it("creates an OPEN, NORMAL room with the typed name by default", () => {
    const handlers = renderLobby();
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "My Table" } });
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    // Open table + Normal (casual) are the defaults: hosted = false, ranked = false.
    expect(handlers.onCreate).toHaveBeenCalledWith("My Table", false, false);
  });

  it("creates a CLOSED (hosted) room when Closed table is picked", () => {
    const handlers = renderLobby();
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Locked Table" } });
    // Name is exact to the table-type radio (ranked's hint also says "closed table").
    fireEvent.click(screen.getByRole("radio", { name: /^Closed table/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    expect(handlers.onCreate).toHaveBeenCalledWith("Locked Table", true, false);
    // Control: switching back to Open reverts the choice (re-type — create clears the field).
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Free Table" } });
    fireEvent.click(screen.getByRole("radio", { name: /^Open table/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    expect(handlers.onCreate).toHaveBeenLastCalledWith("Free Table", false, false);
  });

  it("creates a RANKED room as CLOSED (hosted) — open tables cannot attribute W/L", () => {
    const handlers = renderLobby();
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Ladder Match" } });
    fireEvent.click(screen.getByRole("radio", { name: /Ranked game/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    // Ranked forces hosted=true so seats exist for match reporting.
    expect(handlers.onCreate).toHaveBeenCalledWith("Ladder Match", true, true);
    // Control: switching back to Normal keeps the closed table choice the UI
    // set when Ranked was picked (user can open it again explicitly).
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Casual Match" } });
    fireEvent.click(screen.getByRole("radio", { name: /Normal game/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create room/i }));
    expect(handlers.onCreate).toHaveBeenLastCalledWith("Casual Match", true, false);
  });

  it("shows each room's match type so everyone in the lobby can see it", () => {
    renderLobby({
      rooms: [
        entry({ roomId: "r1", name: "Ranked Room", ranked: true }),
        entry({ roomId: "r2", name: "Normal Room", ranked: false })
      ]
    });
    const ranked = screen.getByText("Ranked Room").closest("li") as HTMLElement;
    const normal = screen.getByText("Normal Room").closest("li") as HTMLElement;
    expect(within(ranked).getByText("Ranked")).toBeTruthy();
    expect(within(normal).getByText("Normal")).toBeTruthy();
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

  it("gives a platform admin a delete control on rooms they could not otherwise close", () => {
    // A room the viewer does NOT own (canClose:false). As an admin, a delete
    // control appears anyway (the server re-verifies the admin session).
    const handlers = renderLobby({ isAdmin: true, rooms: [entry({ roomId: "any", name: "Someone Else", canClose: false })] });
    const deleteButton = screen.getByLabelText(/Admin: delete Someone Else/i);
    fireEvent.click(deleteButton);
    expect(handlers.onClose).toHaveBeenCalledWith("any");
  });

  it("does NOT show a delete control to a non-admin on a room they cannot close (control)", () => {
    renderLobby({ isAdmin: false, rooms: [entry({ roomId: "any", name: "Someone Else", canClose: false })] });
    expect(screen.queryByLabelText(/delete Someone Else/i)).toBeNull();
    expect(screen.queryByLabelText(/Close Someone Else/i)).toBeNull();
  });

  it("filters a long room list by name or host; a short list shows no filter (control)", () => {
    // Short list: no filter box.
    renderLobby({ rooms: [entry({ roomId: "r1", name: "Only Table" })] });
    expect(screen.queryByLabelText("Filter rooms")).toBeNull();
    cleanup();

    // Long list (6+): the filter appears and narrows by name / host / creator.
    const rooms = [
      entry({ roomId: "r1", name: "Dragon Pass", hostName: "Sandro", createdByName: null }),
      entry({ roomId: "r2", name: "Griffin Keep", hostName: null, createdByName: "Adela" }),
      entry({ roomId: "r3", name: "Fortress Run", hostName: null, createdByName: null }),
      entry({ roomId: "r4", name: "Casual Friday", hostName: null, createdByName: null }),
      entry({ roomId: "r5", name: "Tower Duel", hostName: null, createdByName: null }),
      entry({ roomId: "r6", name: "Necro Night", hostName: null, createdByName: null })
    ];
    renderLobby({ rooms });
    const filter = screen.getByLabelText("Filter rooms");

    fireEvent.change(filter, { target: { value: "griffin" } });
    expect(screen.getByText("Griffin Keep")).toBeTruthy();
    expect(screen.queryByText("Dragon Pass")).toBeNull();
    expect(screen.getByText("1 / 6")).toBeTruthy();

    // Host name matches too.
    fireEvent.change(filter, { target: { value: "sandro" } });
    expect(screen.getByText("Dragon Pass")).toBeTruthy();
    expect(screen.queryByText("Griffin Keep")).toBeNull();

    // No match → an honest empty state naming the filter, not a blank list.
    fireEvent.change(filter, { target: { value: "zzz" } });
    expect(screen.getByText(/No rooms match/i)).toBeTruthy();

    // Clearing restores everything.
    fireEvent.change(filter, { target: { value: "" } });
    expect(screen.getByText("Dragon Pass")).toBeTruthy();
    expect(screen.getByText("Necro Night")).toBeTruthy();
  });
});
