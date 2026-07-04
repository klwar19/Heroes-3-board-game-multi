import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  dropDisconnectedMember,
  seatOfClient,
  type GameAction,
  type GameState
} from "./index";

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

describe("presence cleanup on disconnect (dropDisconnectedMember)", () => {
  it("reaps an open-table observer so a rejoin isn't counted twice", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    expect(state.room?.members).toHaveLength(2);

    // c2's tab closes → their stale membership is removed, not left as a ghost.
    expect(dropDisconnectedMember(state, "c2")).toBe(true);
    expect(state.room?.members.map((member) => member.clientId)).toEqual(["c1"]);

    // Idempotent: a second teardown signal for the same client changes nothing.
    expect(dropDisconnectedMember(state, "c2")).toBe(false);
    // A non-member / empty client id is a no-op too.
    expect(dropDisconnectedMember(state, "stranger")).toBe(false);
    expect(dropDisconnectedMember(state, "")).toBe(false);
  });

  it("NEVER reaps a seated player — a blip can't unseat them or move their turn", () => {
    let state = hostedRoomWithThree();
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });

    // c2 holds seat p2 in a hosted game: a dropped socket must keep the seat, or
    // their turn/choice authority would silently transfer on a reconnect.
    expect(dropDisconnectedMember(state, "c2")).toBe(false);
    expect(seatOfClient(state, "c2")).toBe("p2");
    expect(state.room?.members.some((member) => member.clientId === "c2")).toBe(true);

    // The seat lock still binds p2 to c2 alone after the (no-op) drop: nobody
    // else may act for p2, and c2 may not act for p1. (It is p1's turn, so this
    // asserts the lock, not the turn order.)
    expect(
      applyAction(state, { type: "END_TURN", playerId: "p2" }, { actorClientId: "c1" }).errors[0]?.message ?? ""
    ).toContain("Seats are locked");
    expect(
      applyAction(state, { type: "END_TURN", playerId: "p1" }, { actorClientId: "c2" }).errors[0]?.message ?? ""
    ).toContain("Seats are locked");
    // c1 (seat p1) still owns the active turn.
    expect(
      applyAction(state, { type: "END_TURN", playerId: "p1" }, { actorClientId: "c1" }).errors
    ).toHaveLength(0);
  });

  it("NEVER reaps the host, even when the host is only observing", () => {
    // c1 hosts but seats c2/c3, staying an observer themselves.
    let state = hostedRoomWithThree();
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p1" });
    expect(seatOfClient(state, "c1")).toBe("observer");

    expect(dropDisconnectedMember(state, "c1")).toBe(false);
    expect(state.room?.hostClientId).toBe("c1");
    expect(state.room?.members.some((member) => member.clientId === "c1")).toBe(true);
  });

  it("reaps a hosted-room spectator (an unseated non-host observer)", () => {
    const state = hostedRoomWithThree(); // c1 host, c2/c3 unseated observers
    expect(dropDisconnectedMember(state, "c3")).toBe(true);
    expect(state.room?.members.some((member) => member.clientId === "c3")).toBe(false);
    // The host and the room mode are untouched.
    expect(state.room?.hosted).toBe(true);
    expect(state.room?.hostClientId).toBe("c1");
  });
});

describe("naming a room", () => {
  it("lets any member name an open table and clears back to default when blank", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });

    state = expectOk(state, { type: "SET_ROOM_NAME", clientId: "c1", name: "  Friday Night  " });
    expect(state.room?.name).toBe("Friday Night"); // trimmed

    // A blank name removes it (falls back to the id-derived default in the UI).
    state = expectOk(state, { type: "SET_ROOM_NAME", clientId: "c1", name: "   " });
    expect(state.room?.name).toBeUndefined();
  });

  it("caps the name length", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "SET_ROOM_NAME", clientId: "c1", name: "x".repeat(200) });
    expect(state.room?.name?.length).toBe(40);
  });

  it("requires membership and, when hosted, restricts renaming to the host", () => {
    // A stranger who never joined cannot name the room.
    expectRejected(makeGame(), { type: "SET_ROOM_NAME", clientId: "ghost", name: "Nope" });

    let state = hostedRoomWithThree();
    // The host can rename a hosted room.
    state = expectOk(state, { type: "SET_ROOM_NAME", clientId: "c1", name: "Hosted Table" });
    expect(state.room?.name).toBe("Hosted Table");
    // A non-host member cannot.
    expect(expectRejected(state, { type: "SET_ROOM_NAME", clientId: "c2", name: "Hijack" })).toContain(
      "Only the host"
    );
    // The name is unchanged after the rejected rename.
    expect(state.room?.name).toBe("Hosted Table");
  });
});

describe("setting the match type (Ranked / Normal)", () => {
  const lobby = () => createAdventureLobbyState({ seed: "rank-test" });

  it("any member sets it on an open lobby; false marks a casual game and logs the change", () => {
    let state = lobby();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "SET_ROOM_RANKED", clientId: "c1", ranked: false });
    expect(state.room?.ranked).toBe(false);
    expect(
      state.eventLog.some((event) => event.type === "ROOM_RANKED_CHANGED" && event.ranked === false)
    ).toBe(true);
    // And back to ranked.
    state = expectOk(state, { type: "SET_ROOM_RANKED", clientId: "c1", ranked: true });
    expect(state.room?.ranked).toBe(true);
  });

  it("hosted: only the host may change the match type (a non-host is the CONTROL)", () => {
    let state = lobby();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    expect(expectRejected(state, { type: "SET_ROOM_RANKED", clientId: "c2", ranked: false }, "c2")).toContain(
      "Only the host"
    );
    state = expectOk(state, { type: "SET_ROOM_RANKED", clientId: "c1", ranked: false }, "c1");
    expect(state.room?.ranked).toBe(false);
  });

  it("a non-member cannot set it, and it is locked once the adventure has started", () => {
    expect(expectRejected(lobby(), { type: "SET_ROOM_RANKED", clientId: "ghost", ranked: true })).toContain(
      "Join the room"
    );
    // A started game (no longer a setup lobby) refuses the change.
    let started = makeGame();
    started = expectOk(started, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    expect(expectRejected(started, { type: "SET_ROOM_RANKED", clientId: "c1", ranked: false })).toContain(
      "before the adventure starts"
    );
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
