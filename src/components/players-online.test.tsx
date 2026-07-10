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
  it("shows an empty state when nobody is online", () => {
    render(<PlayersOnline players={[]} clientId="me" onJoinRoom={vi.fn()} onInvite={vi.fn()} />);
    expect(screen.getByText(/nobody else is online/i)).toBeTruthy();
  });

  it("labels a verified account by name and a guest as 'guest — name'", () => {
    render(<PlayersOnline players={[alice, bob]} clientId="me" onJoinRoom={vi.fn()} onInvite={vi.fn()} />);
    // The verified account shows its plain nickname (no 'guest —' prefix)…
    expect(screen.getByText("Alice")).toBeTruthy();
    // …and its row is flagged verified, not guest — the mislabel bug's control.
    expect(screen.getByText("Alice").closest(".playerOnline")?.className).toMatch(/\bverified\b/);
    // The guest is honestly labelled.
    expect(screen.getByText(/guest — Bob/)).toBeTruthy();
    expect(screen.getByText(/guest — Bob/).closest(".playerOnline")?.className).toMatch(/\bguest\b/);
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
