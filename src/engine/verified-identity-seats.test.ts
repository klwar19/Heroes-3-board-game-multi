import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, seatOfClient, type GameAction, type GameState } from "./index";

// ---------------------------------------------------------------------------
// Verified-identity seats (Phase 2).
//
// A hosted room's seat-ownership guard binds a SIGNED-IN actor to the member
// carrying their verified account id (`userId`), stamped server-side and never
// read from the forgeable action body. This closes the documented trust
// boundary: forging `actorClientId` can no longer act for a verified seat.
//
// Every test pins a rule with a mutation CONTROL that diverges — the forged-id
// variant that is rejected, or the guest-table variant that (deliberately) is
// not protected, so a test fails if the verified binding is removed.
// ---------------------------------------------------------------------------

type Actor = { clientId?: string; userId?: string };

function makeGame(): GameState {
  return createAdventureGameState({ seed: "verified-seats", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction, actor: Actor = {}) {
  return applyAction(state, action, {
    ...(actor.clientId ? { actorClientId: actor.clientId } : {}),
    ...(actor.userId ? { actorUserId: actor.userId } : {})
  });
}

function expectOk(state: GameState, action: GameAction, actor: Actor = {}): GameState {
  const result = apply(state, action, actor);
  expect(result.errors.map((error) => error.message).join("; ")).toBe("");
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, actor: Actor = {}): string {
  const result = apply(state, action, actor);
  expect(result.errors.length).toBeGreaterThan(0);
  // A rejected action never mutates the room.
  expect(result.state.room).toEqual(state.room);
  return result.errors[0]?.message ?? "";
}

/**
 * A hosted room where Alice (account uA, tab cA) holds seat p1 and Bob (account
 * uB, tab cB) holds seat p2. The host (hClient, no account needed to host) does
 * the seating. Both seated members carry their verified userId.
 */
function verifiedSeatedGame(): GameState {
  let state = makeGame();
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "hClient", name: "Host" });
  state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "hClient", hosted: true });
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "cB", name: "Bob" }, { clientId: "cB", userId: "uB" });
  state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "hClient", targetClientId: "cA", seat: "p1" });
  state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "hClient", targetClientId: "cB", seat: "p2" });
  expect(state.activePlayerId).toBe("p1");
  return state;
}

describe("binding the verified account to the member", () => {
  it("stamps the server-verified userId onto the member (guests carry none)", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "g1", name: "Guest" });

    expect(state.room?.members.find((m) => m.clientId === "cA")?.userId).toBe("uA");
    // The guest member has no bound account id — the mutation control.
    expect(state.room?.members.find((m) => m.clientId === "g1")?.userId).toBeUndefined();
  });

  it("upgrades a guest member to verified when it later signs in (same tab)", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" });
    expect(state.room?.members[0].userId).toBeUndefined();

    // Same tab, now authenticated: the existing member is upgraded, not doubled.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
    expect(state.room?.members).toHaveLength(1);
    expect(state.room?.members[0].userId).toBe("uA");
  });
});

describe("one account = one seat", () => {
  it("re-binds a second tab of the same account to the SAME member", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "hClient", name: "Host" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "hClient", hosted: true });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "hClient", targetClientId: "cA", seat: "p1" });

    // Alice opens a second tab (new clientId) under the same account.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA2", name: "Alice" }, { clientId: "cA2", userId: "uA" });

    // Still ONE Alice member, still one seat — never two members / two seats.
    const aliceMembers = state.room?.members.filter((m) => m.userId === "uA") ?? [];
    expect(aliceMembers).toHaveLength(1);
    expect(aliceMembers[0].seat).toBe("p1");
    // The member now tracks the latest tab.
    expect(aliceMembers[0].clientId).toBe("cA2");

    // CONTROL: a genuinely different account takes its own seat (no collapse).
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cB", name: "Bob" }, { clientId: "cB", userId: "uB" });
    expect(state.room?.members.filter((m) => m.userId === "uB")).toHaveLength(1);
    expect(state.room?.members.filter((m) => m.userId)).toHaveLength(2);
  });

  it("moves the host role with the account across tabs", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cH", name: "Host" }, { clientId: "cH", userId: "uH" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "cH", hosted: true });
    expect(state.room?.hostClientId).toBe("cH");

    // The host reconnects on a new tab under the same account.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cH2", name: "Host" }, { clientId: "cH2", userId: "uH" });
    expect(state.room?.members.filter((m) => m.userId === "uH")).toHaveLength(1);
    expect(state.room?.hostClientId).toBe("cH2");
    expect(state.room?.members.find((m) => m.clientId === "cH2")?.isHost).toBe(true);
  });
});

describe("the seat guard binds by verified account, not by claimed clientId", () => {
  it("lets a verified player act for their seat even with a spoofed actorClientId", () => {
    const state = verifiedSeatedGame();
    // Alice's session is verified (uA); her *claimed* clientId is irrelevant —
    // even a wrong one is ignored because the userId is authoritative.
    const next = expectOk(state, { type: "END_TURN", playerId: "p1" }, { clientId: "not-alice", userId: "uA" });
    expect(next.activePlayerId).toBe("p2");
  });

  it("rejects a verified player acting for someone else's seat", () => {
    const state = verifiedSeatedGame();
    // Alice (uA) tries to end Bob's turn — rejected by the seat lock, regardless
    // of what clientId she claims.
    expect(
      expectRejected(state, { type: "END_TURN", playerId: "p2" }, { clientId: "cB", userId: "uA" })
    ).toContain("Seats are locked");
  });

  it("CLOSES the forge hole: a guest cannot act for a verified seat by claiming its clientId", () => {
    const state = verifiedSeatedGame();
    // Mallory learns Alice's tab id cA and replays it as a GUEST (no session).
    // Alice's seat is bound to her verified account, so the guard refuses it.
    expect(
      expectRejected(state, { type: "END_TURN", playerId: "p1" }, { clientId: "cA" })
    ).toContain("verified account");
  });

  it("CONTROL: the identical clientId forge DOES pass on a guest-only hosted table", () => {
    // The same room, but Alice seated as a GUEST (no userId). Now the seat is not
    // account-bound, so replaying her clientId is (deliberately) accepted — proving
    // it is the verified binding, not some other check, that closes the hole above.
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "hClient", name: "Host" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "hClient", hosted: true });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }); // guest
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "hClient", targetClientId: "cA", seat: "p1" });
    expect(state.activePlayerId).toBe("p1");

    const next = expectOk(state, { type: "END_TURN", playerId: "p1" }, { clientId: "cA" });
    expect(next.activePlayerId).toBe("p2");
  });

  it("refuses a verified actor who is not a member of the room", () => {
    const state = verifiedSeatedGame();
    expect(
      expectRejected(state, { type: "END_TURN", playerId: "p1" }, { clientId: "cX", userId: "uStranger" })
    ).toContain("Join the room");
  });
});

describe("requireAuth: a hosted room the host locked to accounts", () => {
  function hostedRoom(): GameState {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cH", name: "Host" }, { clientId: "cH", userId: "uH" });
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "cH", hosted: true });
    return state;
  }

  it("is host-only and hosted-only to set", () => {
    // Open table: refused (nothing to protect).
    let open = makeGame();
    open = expectOk(open, { type: "JOIN_ROOM", clientId: "c1", name: "A" });
    expect(
      expectRejected(open, { type: "SET_ROOM_REQUIRE_AUTH", clientId: "c1", requireAuth: true })
    ).toContain("hosted room");

    // Hosted, but a non-host member: refused.
    let state = hostedRoom();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cG", name: "G" }, { clientId: "cG", userId: "uG" });
    expect(
      expectRejected(state, { type: "SET_ROOM_REQUIRE_AUTH", clientId: "cG", requireAuth: true }, { clientId: "cG", userId: "uG" })
    ).toContain("Only the host");
  });

  it("refuses a guest join but admits a verified one once enabled", () => {
    let state = hostedRoom();
    state = expectOk(state, { type: "SET_ROOM_REQUIRE_AUTH", clientId: "cH", requireAuth: true }, { clientId: "cH", userId: "uH" });
    expect(state.room?.requireAuth).toBe(true);

    // A guest is turned away…
    expect(
      expectRejected(state, { type: "JOIN_ROOM", clientId: "guest", name: "Guest" })
    ).toContain("verified account");

    // …but a signed-in player joins normally.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
    expect(state.room?.members.some((m) => m.userId === "uA")).toBe(true);

    // CONTROL: turning the lock back off lets the very same guest in.
    state = expectOk(state, { type: "SET_ROOM_REQUIRE_AUTH", clientId: "cH", requireAuth: false }, { clientId: "cH", userId: "uH" });
    expect(state.room?.requireAuth).toBeUndefined();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "guest", name: "Guest" });
    expect(seatOfClient(state, "guest")).toBe("observer");
  });

  it("does not strand an existing member when the lock is switched on mid-session", () => {
    let state = hostedRoom();
    // A guest is already seated before the host flips the switch.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cG", name: "Guest" });
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "cH", targetClientId: "cG", seat: "p1" });
    state = expectOk(state, { type: "SET_ROOM_REQUIRE_AUTH", clientId: "cH", requireAuth: true }, { clientId: "cH", userId: "uH" });

    // The already-present guest can still reconnect (re-join) — grandfathered.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cG", name: "Guest" });
    expect(seatOfClient(state, "cG")).toBe("p1");
  });
});

describe("open tables and guests are unchanged", () => {
  it("applies no verified-identity guard on an open table", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
    // Open table (never hosted): the seat lock is inert, so any actor may act.
    expect(apply(state, { type: "END_TURN", playerId: "p1" }, { clientId: "whoever" }).errors).toHaveLength(0);
  });
});
