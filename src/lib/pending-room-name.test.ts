// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  savePendingCoopRoomSetup,
  savePendingRoomHosted,
  savePendingRoomMode,
  savePendingRoomName,
  takePendingCoopRoomSetup,
  takePendingRoomHosted,
  takePendingRoomMode,
  takePendingRoomName
} from "./pending-room-name";

describe("pending Co-op room setup handoff", () => {
  it("round-trips the battlefield and computer-enemy count once", () => {
    savePendingCoopRoomSetup({ roomId: "coop-1", scenarioId: "skirmish", computerOpponents: 2 });
    expect(takePendingCoopRoomSetup()).toEqual({
      roomId: "coop-1",
      scenarioId: "skirmish",
      computerOpponents: 2
    });
    expect(takePendingCoopRoomSetup()).toBeNull();
  });
});

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

describe("pending room mode (Battle Test) handoff", () => {
  it("round-trips the chosen mode once, then clears (one-shot)", () => {
    savePendingRoomMode("room-5", "combat-sandbox");
    expect(takePendingRoomMode()).toEqual({ roomId: "room-5", mode: "combat-sandbox" });
    // One-shot: not re-applied on a later read.
    expect(takePendingRoomMode()).toBeNull();
  });

  it("is stored in its own slot, independent of name and hosted", () => {
    savePendingRoomName("room-6", "Arena");
    savePendingRoomHosted("room-6");
    savePendingRoomMode("room-6", "combat-sandbox");
    expect(takePendingRoomMode()).toEqual({ roomId: "room-6", mode: "combat-sandbox" });
    expect(takePendingRoomName()).toEqual({ roomId: "room-6", name: "Arena" });
    expect(takePendingRoomHosted()).toBe("room-6");
  });

  it("rejects a malformed mode value", () => {
    window.sessionStorage.setItem("homm3bg.pendingRoomMode", JSON.stringify({ roomId: "x", mode: "bogus" }));
    expect(takePendingRoomMode()).toBeNull();
  });
});
