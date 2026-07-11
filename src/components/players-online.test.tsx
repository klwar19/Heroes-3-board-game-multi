// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayersOnline } from "./players-online";
import type { PresenceEntry } from "@/lib/lobby-presence-client";

afterEach(cleanup);

const alice: PresenceEntry = { clientId: "cA", name: "Alice", verified: true, roomId: "r1", roomName: "Friday Night" };
const bob: PresenceEntry = { clientId: "cB", name: "Bob", verified: false };
const me: PresenceEntry = { clientId: "me", name: "Me", verified: true };

describe("PlayersOnline", () => {
  it("shows a loading state on an empty list (the viewer's own beat would list THEM)", () => {
    render(<PlayersOnline players={[]} clientId="me" onJoinRoom={vi.fn()} onInvite={vi.fn()} />);
    // A loaded list always contains at least the viewer (their heartbeat adds
    // them), so empty means "first poll pending" — never claim nobody is online.
    expect(screen.getByText(/checking who is online/i)).toBeTruthy();
  });

  it("labels a verified account by name and a guest as 'guest — name' when accounts are ON", () => {
    const prev = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
    try {
      render(<PlayersOnline players={[alice, bob]} clientId="me" onJoinRoom={vi.fn()} onInvite={vi.fn()} />);
      // The verified account shows its plain nickname (no 'guest —' prefix)…
      expect(screen.getByText("Alice")).toBeTruthy();
      // …and its row is flagged verified, not guest — the mislabel bug's control.
      expect(screen.getByText("Alice").closest(".playerOnline")?.className).toMatch(/\bverified\b/);
      // The guest is honestly labelled.
      expect(screen.getByText(/guest — Bob/)).toBeTruthy();
      expect(screen.getByText(/guest — Bob/).closest(".playerOnline")?.className).toMatch(/\bguest\b/);
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = prev;
      }
    }
  });

  it("does NOT prefix everyone with 'guest —' when accounts are OFF", () => {
    const prev = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    try {
      render(<PlayersOnline players={[alice, bob]} clientId="me" onJoinRoom={vi.fn()} onInvite={vi.fn()} />);
      // With accounts off, verified is meaningless — show plain names only.
      expect(screen.getByText("Alice")).toBeTruthy();
      expect(screen.getByText("Bob")).toBeTruthy();
      expect(screen.queryByText(/guest —/)).toBeNull();
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = prev;
      }
    }
  });

  it("shows whether a player is setting up or already playing", () => {
    const prev = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
    try {
      const playing: PresenceEntry = {
        ...alice,
        roomStatus: "playing"
      };
      const seating: PresenceEntry = {
        clientId: "cS",
        name: "Sam",
        verified: true,
        roomId: "r2",
        roomName: "New Table",
        roomStatus: "setup"
      };
      render(
        <PlayersOnline players={[playing, seating]} clientId="me" onJoinRoom={vi.fn()} onInvite={vi.fn()} />
      );
      expect(screen.getByText(/in Friday Night · playing/)).toBeTruthy();
      expect(screen.getByText(/in New Table · setting up/)).toBeTruthy();
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
      } else {
        process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = prev;
      }
    }
  });

  it("offers Join only for a player who is in a room, and wires the room id", () => {
    const onJoinRoom = vi.fn();
    render(<PlayersOnline players={[alice, bob]} clientId="me" onJoinRoom={onJoinRoom} onInvite={vi.fn()} />);
    // Alice is in a room → a Join button; Bob (lobby) has none.
    const joins = screen.getAllByRole("button", { name: /join/i });
    expect(joins).toHaveLength(1);
    fireEvent.click(joins[0]);
    expect(onJoinRoom).toHaveBeenCalledWith("r1");
  });

  it("invites a player and never shows actions for yourself", () => {
    const onInvite = vi.fn();
    render(<PlayersOnline players={[alice, me]} clientId="me" onJoinRoom={vi.fn()} onInvite={onInvite} />);
    // My own row is marked "(you)" and carries no Join/Invite buttons.
    expect(screen.getByText(/\(you\)/)).toBeTruthy();
    // Only Alice's row has an Invite button (mine has no actions at all).
    const invites = screen.getAllByRole("button", { name: /invite/i });
    expect(invites).toHaveLength(1);
    fireEvent.click(invites[0]);
    expect(onInvite).toHaveBeenCalledWith(alice);
  });
});
