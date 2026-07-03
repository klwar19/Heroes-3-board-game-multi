// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  savePendingRoomHosted,
  savePendingRoomName,
  takePendingRoomHosted,
  takePendingRoomName
} from "./pending-room-name";

afterEach(() => window.sessionStorage.clear());

describe("pending room name handoff", () => {
  it("round-trips a name once, then clears (one-shot)", () => {
    savePendingRoomName("room-1", "Friday Night");
    expect(takePendingRoomName()).toEqual({ roomId: "room-1", name: "Friday Night" });
    // One-shot: a second read returns null (never re-applied).
    expect(takePendingRoomName()).toBeNull();
  });

  it("stores nothing for an empty name (room keeps its default)", () => {
    savePendingRoomName("room-2", "");
    expect(takePendingRoomName()).toBeNull();
  });
});

describe("pending room hosted (Closed table) handoff", () => {
  it("round-trips the closed choice once, then clears (one-shot)", () => {
    savePendingRoomHosted("room-9");
    expect(takePendingRoomHosted()).toBe("room-9");
    // One-shot: not re-applied on a later read.
    expect(takePendingRoomHosted()).toBeNull();
  });

  it("is independent of the pending name (Open room stores nothing to host)", () => {
    // A named but OPEN room: name is carried, hosted is not.
    savePendingRoomName("room-3", "Open Table");
    expect(takePendingRoomHosted()).toBeNull();
    expect(takePendingRoomName()).toEqual({ roomId: "room-3", name: "Open Table" });
  });

  it("carries the closed choice even when the room has no name", () => {
    savePendingRoomHosted("room-4");
    expect(takePendingRoomName()).toBeNull();
    expect(takePendingRoomHosted()).toBe("room-4");
  });
});
