import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, seatOfClient, type GameAction, type GameState } from "./index";

// ---------------------------------------------------------------------------
// Room membership / host / seats / observers.
//
// Membership lives in `state.room` and flows through applyAction. Two modes:
//   - open table (no `room`, or hosted:false): no seat enforcement — the
//     original free-seat test mode is preserved.
//   - hosted: host-controlled seats, locked for players, seat-ownership on
//     every game action.
//
// Each test below pins a rule that a regression would break.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "room-test", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction, actorClientId?: string) {
  return applyAction(state, action, actorClientId ? { actorClientId } : {});
}

function expectOk(state: GameState, action: GameAction, actorClientId?: string): GameState {
  const result = apply(state, action, actorClientId);
  expect(result.errors.map((error) => error.message).join("; ")).toBe("");
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, actorClientId?: string): string {
  const result = apply(state, action, actorClientId);
  expect(result.errors.length).toBeGreaterThan(0);
  // A rejected action never mutates the room.
  expect(result.state.room).toEqual(state.room);
  return result.errors[0]?.message ?? "";
}

/** Joins three clients and makes c1 the host. Returns the hosted state. */
function hostedRoomWithThree(): GameState {
  let state = makeGame();
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c3", name: "Cara" });
  state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
  return state;
}

describe("joining a room", () => {
  it("registers a new client as an observer and is idempotent on re-join", () => {
    let state = makeGame();
    expect(state.room).toBeUndefined();

    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    expect(state.room?.members).toHaveLength(1);
    expect(seatOfClient(state, "c1")).toBe("observer");
    expect(state.room?.hosted).toBe(false);

    // Re-join refreshes the display name without adding a duplicate member.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice II" });
    expect(state.room?.members).toHaveLength(1);
    expect(state.room?.members[0].name).toBe("Alice II");
  });

  it("supports many observers", () => {
    let state = makeGame();
    for (let i = 0; i < 8; i += 1) {
      state = expectOk(state, { type: "JOIN_ROOM", clientId: `obs${i}`, name: `Watcher ${i}` });
    }
    expect(state.room?.members).toHaveLength(8);
    expect(state.room?.members.every((member) => member.seat === "observer")).toBe(true);
  });
});

describe("becoming the host", () => {
  it("makes the caller the host and marks the member", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });

    expect(state.room?.hosted).toBe(true);
    expect(state.room?.hostClientId).toBe("c1");
    expect(state.room?.members.find((member) => member.clientId === "c1")?.isHost).toBe(true);
  });

  it("refuses to let a non-member or a second player seize host", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });

    // c2 cannot grab host while c1 holds it.
    expectRejected(state, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    // A stranger who never joined cannot host.
    expectRejected(state, { type: "SET_ROOM_HOSTED", clientId: "ghost", hosted: true });
  });
});

describe("host-controlled seating", () => {
  it("lets the host seat players, including themselves as Player 1", () => {
    let state = hostedRoomWithThree();

    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });

    expect(seatOfClient(state, "c1")).toBe("p1"); // host can be Player 1
    expect(seatOfClient(state, "c2")).toBe("p2");
    expect(seatOfClient(state, "c3")).toBe("observer");
  });

  it("bumps the previous occupant to observer when a seat is reassigned", () => {
    let state = hostedRoomWithThree();
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p1" });
    expect(seatOfClient(state, "c2")).toBe("p1");

    // Seat c3 at p1 — c2 is bumped back to observer (single occupancy).
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c3", seat: "p1" });
    expect(seatOfClient(state, "c3")).toBe("p1");
    expect(seatOfClient(state, "c2")).toBe("observer");
  });

  it("rejects an unknown seat", () => {
    const state = hostedRoomWithThree();
    expectRejected(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p9" });
  });

  it("forbids a player from changing their own or another seat", () => {
    let state = hostedRoomWithThree();
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });

    // c2 cannot move themselves, and cannot move c3 — only the host assigns.
    expectRejected(state, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p1" });
    expectRejected(state, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c3", seat: "p1" });
  });
});

describe("kicking and host transfer", () => {
  it("lets the host kick a member but never themselves", () => {
    let state = hostedRoomWithThree();
    expectRejected(state, { type: "KICK_MEMBER", clientId: "c1", targetClientId: "c1" });

    state = expectOk(state, { type: "KICK_MEMBER", clientId: "c1", targetClientId: "c3" });
    expect(state.room?.members.some((member) => member.clientId === "c3")).toBe(false);
  });

  it("refuses a kick from anyone but the host", () => {
    const state = hostedRoomWithThree();
    expectRejected(state, { type: "KICK_MEMBER", clientId: "c2", targetClientId: "c3" });
  });

  it("transfers host explicitly and on host leave", () => {
    let state = hostedRoomWithThree();
    state = expectOk(state, { type: "TRANSFER_HOST", clientId: "c1", targetClientId: "c2" });
    expect(state.room?.hostClientId).toBe("c2");
    expect(state.room?.members.find((member) => member.clientId === "c1")?.isHost).toBe(false);
    expect(state.room?.members.find((member) => member.clientId === "c2")?.isHost).toBe(true);

    // The new host leaving hands host to a remaining member.
    state = expectOk(state, { type: "LEAVE_ROOM", clientId: "c2" });
    expect(state.room?.members.some((member) => member.clientId === "c2")).toBe(false);
    expect(state.room?.hostClientId).not.toBeNull();
    expect(state.room?.members.find((member) => member.clientId === state.room?.hostClientId)?.isHost).toBe(true);
  });
});

describe("seat-ownership on game actions (hosted)", () => {
  /** A hosted game with c1 seated at p1 (active) and c2 at p2. */
  function seatedGame(): GameState {
    let state = hostedRoomWithThree();
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });
    expect(state.activePlayerId).toBe("p1");
    return state;
  }

  it("lets a seated client act for its own seat", () => {
    const state = seatedGame();
    // p1's occupant ends p1's turn.
    const next = expectOk(state, { type: "END_TURN", playerId: "p1" }, "c1");
    expect(next.activePlayerId).toBe("p2");
  });

  it("blocks acting for someone else's seat — the core seat lock", () => {
    const state = seatedGame();

    // c2 (seat p2) tries to end p1's turn → rejected by the seat lock.
    const asOther = expectRejected(state, { type: "END_TURN", playerId: "p1" }, "c2");
    expect(asOther).toContain("Seats are locked");

    // The p1 occupant trying to act for p2 is also rejected by the lock (before
    // any "not your turn" check).
    expect(expectRejected(state, { type: "END_TURN", playerId: "p2" }, "c1")).toContain("Seats are locked");

    // An observer holds no seat and cannot act at all.
    expect(expectRejected(state, { type: "END_TURN", playerId: "p1" }, "c3")).toContain("own seat");

    // A non-member is likewise refused.
    expect(expectRejected(state, { type: "END_TURN", playerId: "p1" }, "stranger")).toContain("Join the room");
  });

  it("never seat-gates membership actions", () => {
    const state = seatedGame();
    // An observer may still leave even though they hold no seat.
    expectOk(state, { type: "LEAVE_ROOM", clientId: "c3" }, "c3");
  });
});

describe("open table preserves the free-seat test mode", () => {
  it("ignores seat ownership when the room is not hosted", () => {
    // No JOIN/host at all: legacy/open snapshot, room is undefined.
    const open = makeGame();
    expect(open.room).toBeUndefined();
    // Any client id may act for any seat (the original local seat-switch model).
    const next = expectOk(open, { type: "END_TURN", playerId: "p1" }, "whoever");
    expect(next.activePlayerId).toBe("p2");
  });

  it("still ignores seat ownership after joining but before hosting", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    // hosted is false → the guard is inert; the actorClientId mismatch is fine.
    const next = expectOk(state, { type: "END_TURN", playerId: "p1" }, "someone-else");
    expect(next.activePlayerId).toBe("p2");
  });
});
