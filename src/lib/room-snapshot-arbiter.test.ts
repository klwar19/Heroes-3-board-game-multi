import { describe, expect, it } from "vitest";
import { decideSnapshot, initialSnapshotArbiterState, type SnapshotArbiterState } from "./room-snapshot-arbiter";

function accept(state: SnapshotArbiterState, version: number, extra = {}) {
  return decideSnapshot(state, { version, source: "broadcast", ...extra });
}

describe("room snapshot arbiter", () => {
  it("drops broadcast/action acknowledgement duplicates in either order", () => {
    const first = accept(initialSnapshotArbiterState(), 4);
    expect(first.accept).toBe(true);
    expect(decideSnapshot(first.state, { version: 4, source: "action-ack" })).toMatchObject({
      accept: false,
      reason: "duplicate"
    });
    const ackFirst = decideSnapshot(initialSnapshotArbiterState(), { version: 4, source: "action-ack" });
    expect(accept(ackFirst.state, 4)).toMatchObject({ accept: false, reason: "duplicate" });
  });

  it("allows exactly one observer-to-seat upgrade", () => {
    const observer = accept(initialSnapshotArbiterState(), 8, { viewerSeat: "observer" });
    const seat = decideSnapshot(observer.state, {
      version: 8,
      viewerSeat: "p1",
      source: "http-recovery",
      seatAuthoritative: true
    });
    expect(seat).toMatchObject({ accept: true, reason: "seat-upgrade" });
    expect(decideSnapshot(seat.state, {
      version: 8,
      viewerSeat: "p1",
      source: "http-recovery",
      seatAuthoritative: true
    })).toMatchObject({ accept: false, reason: "duplicate" });
  });

  it("rejects repeated HTTP versions and conflicting seats", () => {
    const first = accept(initialSnapshotArbiterState(), 2, { viewerSeat: "p1", seatAuthoritative: true });
    expect(accept(first.state, 2, { viewerSeat: "p1", seatAuthoritative: true })).toMatchObject({ accept: false });
    expect(accept(first.state, 2, { viewerSeat: "p2", seatAuthoritative: true })).toMatchObject({
      accept: false,
      reason: "wrong-seat"
    });
  });

  it("accepts a lower version on a new boot and rejects the retired boot", () => {
    const oldBoot = accept(initialSnapshotArbiterState(), 20, { bootId: "old" });
    const newBoot = accept(oldBoot.state, 1, { bootId: "new" });
    expect(newBoot).toMatchObject({ accept: true, reason: "new-boot" });
    expect(accept(newBoot.state, 21, { bootId: "old" })).toMatchObject({ accept: false, reason: "older" });
  });

  it("recognizes the first boot id after legacy bootless frames", () => {
    const legacy = accept(initialSnapshotArbiterState(), 20);
    expect(accept(legacy.state, 1, { bootId: "first-stamped-boot" })).toMatchObject({
      accept: true,
      reason: "new-boot"
    });
  });

  it("a fresh arbiter accepts a lower-version room after a room switch", () => {
    const switched = accept(initialSnapshotArbiterState(), 1, { bootId: "room-b" });
    expect(switched).toMatchObject({ accept: true, reason: "newer" });
  });
});
