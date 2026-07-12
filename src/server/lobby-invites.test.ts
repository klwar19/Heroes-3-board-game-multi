import { describe, expect, it } from "vitest";
import {
  LobbyInviteBoard,
  LobbyInviteError,
  LOBBY_INVITE_TTL_MS
} from "./lobby-invites";

function reason(error: unknown): string {
  return error instanceof LobbyInviteError ? error.message : "UNEXPECTED";
}

describe("LobbyInviteBoard", () => {
  it("delivers an invite to the target clientId and not to others", () => {
    const board = new LobbyInviteBoard({ now: () => 1_000 });
    board.send({
      fromClientId: "c1",
      fromName: "Alice",
      toClientId: "c2",
      roomId: "room-a",
      roomName: "Castle"
    });
    expect(board.listFor("c2")).toHaveLength(1);
    expect(board.listFor("c2")[0].fromName).toBe("Alice");
    expect(board.listFor("c2")[0].roomId).toBe("room-a");
    expect(board.listFor("c1")).toHaveLength(0);
    expect(board.listFor("c3")).toHaveLength(0);
  });

  it("matches a verified invitee by userId on any of their tabs", () => {
    const board = new LobbyInviteBoard({ now: () => 1_000 });
    board.send({
      fromClientId: "host",
      fromName: "Host",
      toClientId: "tab-old",
      toUserId: "user-bob",
      roomId: "r1"
    });
    // Bob opened a new tab with a different clientId but same account cookie.
    expect(board.listFor("tab-new", { userId: "user-bob" })).toHaveLength(1);
    expect(board.listFor("stranger", { userId: "user-other" })).toHaveLength(0);
  });

  it("replaces a duplicate pending invite from the same sender/room", () => {
    const board = new LobbyInviteBoard({ now: () => 1_000 });
    board.send({
      fromClientId: "c1",
      fromName: "Alice",
      toClientId: "c2",
      roomId: "r1",
      roomName: "Old"
    });
    board.send({
      fromClientId: "c1",
      fromName: "Alice",
      toClientId: "c2",
      roomId: "r1",
      roomName: "New name"
    });
    const list = board.listFor("c2");
    expect(list).toHaveLength(1);
    expect(list[0].roomName).toBe("New name");
  });

  it("dismisses only for the invitee", () => {
    const board = new LobbyInviteBoard({ now: () => 1_000 });
    const invite = board.send({
      fromClientId: "c1",
      fromName: "Alice",
      toClientId: "c2",
      roomId: "r1"
    });
    expect(board.dismiss(invite.id, "c1")).toBe(false);
    expect(board.listFor("c2")).toHaveLength(1);
    expect(board.dismiss(invite.id, "c2")).toBe(true);
    expect(board.listFor("c2")).toHaveLength(0);
  });

  it("expires invites past the TTL", () => {
    let t = 1_000;
    const board = new LobbyInviteBoard({ now: () => t });
    board.send({
      fromClientId: "c1",
      fromName: "Alice",
      toClientId: "c2",
      roomId: "r1"
    });
    t += LOBBY_INVITE_TTL_MS + 1;
    expect(board.listFor("c2")).toHaveLength(0);
  });

  it("rejects self-invites and missing targets", () => {
    const board = new LobbyInviteBoard();
    expect(reason(catching(() => board.send({ fromClientId: "c1", fromName: "A", toClientId: "c1" })))).toMatch(
      /yourself/i
    );
    expect(reason(catching(() => board.send({ fromClientId: "c1", fromName: "A", toClientId: "" })))).toMatch(
      /pick a player/i
    );
  });
});

function catching(fn: () => void): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}
