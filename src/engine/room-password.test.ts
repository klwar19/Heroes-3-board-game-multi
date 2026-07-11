import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getPlayerView,
  hashRoomPassword,
  normalizeRoomPassword,
  PASSWORD_REDACTED,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";

// ---------------------------------------------------------------------------
// Room join-password (casual join-gate). A locked room:
//   - refuses a NEW joiner without the correct password (host + reconnect are
//     exempt);
//   - stores ONLY a salted hash, never the plaintext, and redacts even that in
//     any player view;
//   - lets only members (who supplied the password) take game actions — even on
//     an OPEN table, where seats are otherwise free.
// Every rule is pinned with a wrong-password / no-password CONTROL so a
// regression that drops the gate fails a test (CLAUDE.md #1).
// ---------------------------------------------------------------------------

function makeGame(seed = "room-password"): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
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
  return result.errors[0]?.message ?? "";
}

/** A hosted room whose host (c1) has set the join password to "swordfish". */
function hostedLockedRoom(): GameState {
  let state = makeGame();
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
  state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
  state = expectOk(state, { type: "SET_ROOM_PASSWORD", clientId: "c1", password: "swordfish" });
  return state;
}

describe("SET_ROOM_PASSWORD — setting and clearing the lock", () => {
  it("stores a HASH of the password (never the plaintext) and clears on a blank", () => {
    let state = hostedLockedRoom();
    expect(state.room?.passwordHash).toBe(hashRoomPassword("swordfish"));
    // The plaintext appears nowhere in the room record.
    expect(JSON.stringify(state.room)).not.toContain("swordfish");

    // A blank password clears the lock entirely.
    state = expectOk(state, { type: "SET_ROOM_PASSWORD", clientId: "c1", password: "  " }, "c1");
    expect(state.room?.passwordHash).toBeUndefined();
    expect(
      state.eventLog.some((event) => event.type === "ROOM_PASSWORD_CHANGED" && event.hasPassword === false)
    ).toBe(true);
  });

  it("is host-only on a hosted room (a non-host member is refused)", () => {
    let state = hostedLockedRoom();
    // c2 joins WITH the password, then tries to change it — only the host may.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Guest", password: "swordfish" });
    expect(
      expectRejected(state, { type: "SET_ROOM_PASSWORD", clientId: "c2", password: "hijack" }, "c2")
    ).toContain("Only the host");
    // The lock is unchanged.
    expect(state.room?.passwordHash).toBe(hashRoomPassword("swordfish"));
  });

  it("lets any member set a password on an OPEN table", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "SET_ROOM_PASSWORD", clientId: "c1", password: "hunter2" }, "c1");
    expect(state.room?.hosted).toBe(false);
    expect(state.room?.passwordHash).toBe(hashRoomPassword("hunter2"));
  });
});

describe("JOIN_ROOM — the password gate", () => {
  it("admits a new member with the correct password; a wrong / absent one is refused", () => {
    const locked = hostedLockedRoom();

    // Correct password → joins as a member.
    const joined = expectOk(locked, { type: "JOIN_ROOM", clientId: "c2", name: "Guest", password: "swordfish" });
    expect(joined.room?.members.some((member) => member.clientId === "c2")).toBe(true);

    // CONTROL (wrong password): refused, and no member is added.
    expect(
      expectRejected(locked, { type: "JOIN_ROOM", clientId: "c3", name: "Wrong", password: "guess" })
    ).toContain("Incorrect room password");
    // CONTROL (absent password): refused too.
    expect(
      expectRejected(locked, { type: "JOIN_ROOM", clientId: "c3", name: "None" })
    ).toContain("Incorrect room password");

    // Whitespace around the SAME password still matches (normalised both ways).
    const padded = expectOk(locked, { type: "JOIN_ROOM", clientId: "c4", name: "Padded", password: "  swordfish  " });
    expect(padded.room?.members.some((member) => member.clientId === "c4")).toBe(true);
    expect(normalizeRoomPassword("  swordfish  ")).toBe("swordfish");
  });

  it("exempts the host and an existing member reconnecting (they never re-enter the password)", () => {
    let state = hostedLockedRoom();
    // The host re-joins (reconnect) with NO password — never blocked.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    expect(state.room?.hostClientId).toBe("c1");

    // A guest joins with the password, then reconnects with none — still fine.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Guest", password: "swordfish" });
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Guest again" });
    expect(state.room?.members.find((member) => member.clientId === "c2")?.name).toBe("Guest again");
  });
});

describe("roomActionGuard — only members may play a locked room (open OR hosted)", () => {
  it("blocks a non-member's game action on a password-protected OPEN table; a member is allowed", () => {
    // Open table (not hosted) WITH a password: seats are otherwise free, so the
    // password is the only thing separating a spectator from a player.
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = expectOk(state, { type: "SET_ROOM_PASSWORD", clientId: "c1", password: "letmein" }, "c1");
    const activeSeat = state.activePlayerId as PlayerId;

    // A client that reached the room by id but never joined (no password) cannot act.
    expect(
      expectRejected(state, { type: "END_TURN", playerId: activeSeat }, "intruder")
    ).toContain("password-protected");

    // The member c1 is NOT blocked by the password gate (open table → acts as any seat).
    const memberResult = apply(state, { type: "END_TURN", playerId: activeSeat }, "c1");
    expect(memberResult.errors.map((error) => error.message).join("; ")).not.toContain("password-protected");
  });

  it("CONTROL: the SAME open table WITHOUT a password lets the non-member act", () => {
    let state = makeGame();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    const activeSeat = state.activePlayerId as PlayerId;
    // No password set → an open table enforces nothing, so the guard never fires.
    const result = apply(state, { type: "END_TURN", playerId: activeSeat }, "intruder");
    expect(result.errors.map((error) => error.message).join("; ")).not.toContain("password-protected");
  });
});

describe("player-view redaction — the hash never reaches a client render", () => {
  it("replaces a set passwordHash with the redaction sentinel (presence preserved)", () => {
    const state = hostedLockedRoom();
    const view = getPlayerView(state, state.activePlayerId as PlayerId);
    expect(view.room?.passwordHash).toBe(PASSWORD_REDACTED);
    expect(view.room?.passwordHash).not.toBe(hashRoomPassword("swordfish"));

    // CONTROL: an unlocked room's view carries no hash at all.
    const openState = makeGame("room-password-open");
    const openView = getPlayerView(openState, openState.activePlayerId as PlayerId);
    expect(openView.room?.passwordHash).toBeUndefined();
  });
});
