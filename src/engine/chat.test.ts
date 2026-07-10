import { describe, expect, it } from "vitest";
import {
  appendSystemChat,
  applyAction,
  CHAT_FLOOD_LIMIT,
  createAdventureGameState,
  getPlayerView,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TEXT_LENGTH,
  NEUTRAL_PLAYER_ID,
  sanitizeChatText,
  type ChatMessage,
  type GameAction,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Room chat: an ephemeral live feed that flows through applyAction into the
// bounded ring buffer state.room.chat. Every test pins a rule a regression
// would break, each with a mutation control alongside (per CLAUDE.md #1a).
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "chat-test", difficulty: "normal", rollFirstPlayer: false });
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
  const before = state.room?.chat ?? [];
  const result = apply(state, action, actorClientId);
  expect(result.errors.length).toBeGreaterThan(0);
  // A rejected message never touches the buffer.
  expect(result.state.room?.chat ?? []).toEqual(before);
  return result.errors[0]?.message ?? "";
}

/**
 * An open table with two joined members (Alice=c1, Bob=c2). Each NEW join now
 * announces itself with a forced system line ("… joined the room." — see
 * room.ts / room-membership.test.ts), so the buffer starts with TWO system
 * notices; the player-line assertions below read through playerLinesOf.
 */
function tableWithTwo(): GameState {
  let state = makeGame();
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
  return state;
}

function chatOf(state: GameState): ChatMessage[] {
  return state.room?.chat ?? [];
}

/** Only the members' own lines — system notices (join announcements) excluded. */
function playerLinesOf(state: GameState): ChatMessage[] {
  return chatOf(state).filter((entry) => entry.kind === "chat");
}

function realSeatId(state: GameState): string {
  const seat = state.turnOrder.find((id) => id !== NEUTRAL_PLAYER_ID);
  if (!seat) {
    throw new Error("test setup: no real seat in turnOrder");
  }
  return seat;
}

describe("sending a chat message", () => {
  it("records the message attributed to the sending member", () => {
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "Well met, Bob." });

    // The two join announcements are system lines; the player line follows.
    expect(chatOf(state).filter((entry) => entry.kind === "system")).toHaveLength(2);
    expect(playerLinesOf(state)).toHaveLength(1);
    const line = playerLinesOf(state)[0];
    expect(line.text).toBe("Well met, Bob.");
    expect(line.name).toBe("Alice");
    expect(line.clientId).toBe("c1");
    expect(line.kind).toBe("chat");
    expect(line.seq).toBe(3);
  });

  it("attributes to the member's CURRENT name — the account nickname flows in on rejoin", () => {
    // A signed-in player rejoins under their account nickname (JOIN_ROOM is
    // idempotent and refreshes the name); the next chat line must use it, proving
    // chat reads member.name and never a stale value.
    let state = tableWithTwo();
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Sir Mullich" });
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "Renamed." });
    expect(chatOf(state).at(-1)?.name).toBe("Sir Mullich");
    // Control: a member who never renamed keeps their original name.
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "Still Bob." });
    expect(chatOf(state).at(-1)?.name).toBe("Bob");
  });

  it("is never seat- or turn-gated: an observer may chat on anyone's turn", () => {
    // Bob (c2) holds no seat and it is not his turn, yet his line lands — chat
    // carries no seat playerId, so roomActionGuard / turn checks skip it.
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "Watching." }, "c2");
    expect(playerLinesOf(state).map((entry) => entry.name)).toEqual(["Bob"]);
    expect(playerLinesOf(state)[0].seat).toBe("observer");
  });

  it("carries the sender's assigned seat in a hosted room (for seat-coloured names)", () => {
    let state = tableWithTwo();
    const seatId = realSeatId(state);
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }, "c1");
    state = expectOk(
      state,
      { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: seatId },
      "c1"
    );
    // Seated Bob chats (actorClientId supplied — the hosted seat lock must NOT
    // block chat, which has no seat playerId).
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "Seated." }, "c2");
    expect(chatOf(state).at(-1)?.seat).toBe(seatId);
    // Control: the host, still unseated, chats as observer.
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "Host here." }, "c1");
    expect(chatOf(state).at(-1)?.seat).toBe("observer");
  });
});

describe("chat validation and hygiene", () => {
  it("rejects an empty / whitespace-only message (control: real text is accepted)", () => {
    const state = tableWithTwo();
    expect(expectRejected(state, { type: "SEND_CHAT", clientId: "c1", text: "   " })).toMatch(/message/i);
    // Control: the same flow with real text lands.
    const ok = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "hi" });
    expect(playerLinesOf(ok)).toHaveLength(1);
  });

  it("strips control characters and collapses whitespace to a single line", () => {
    let state = tableWithTwo();
    // Newlines, tabs and doubled spaces are collapsed to a single clean line.
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "hello\n\n\tthere  world" });
    expect(chatOf(state).at(-1)?.text).toBe("hello there world");
    // Control: an already-clean single-line string is stored verbatim.
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "just fine" });
    expect(chatOf(state).at(-1)?.text).toBe("just fine");
  });

  it("truncates an over-long message to the cap (control: a short one is kept whole)", () => {
    let state = tableWithTwo();
    const long = "x".repeat(MAX_CHAT_TEXT_LENGTH + 250);
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: long });
    expect(chatOf(state).at(-1)?.text).toHaveLength(MAX_CHAT_TEXT_LENGTH);
    // Control: a short message is not truncated.
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "short" });
    expect(chatOf(state).at(-1)?.text).toBe("short");
  });

  it("sanitizeChatText is pure and matches the stored behaviour", () => {
    expect(sanitizeChatText("  a\tb  ")).toBe("a b");
    expect(sanitizeChatText("")).toBe("");
    expect(sanitizeChatText("y".repeat(MAX_CHAT_TEXT_LENGTH + 5))).toHaveLength(MAX_CHAT_TEXT_LENGTH);
  });
});

describe("chat membership and anti-spam", () => {
  it("rejects a non-member sender (control: a member's line is accepted)", () => {
    const state = tableWithTwo();
    expect(
      expectRejected(state, { type: "SEND_CHAT", clientId: "stranger", text: "let me in" }, "stranger")
    ).toMatch(/join the room/i);
    // Control: a joined member on the same table can chat.
    const ok = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "member" });
    expect(playerLinesOf(ok)).toHaveLength(1);
  });

  it("flood-caps one client, and another sender resets the budget (control)", () => {
    let state = tableWithTwo();
    // c1 sends exactly the allowed run.
    for (let i = 0; i < CHAT_FLOOD_LIMIT; i += 1) {
      state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: `spam ${i}` });
    }
    // The next consecutive c1 line is refused.
    expect(expectRejected(state, { type: "SEND_CHAT", clientId: "c1", text: "one more" })).toMatch(/slow down/i);
    // Control: after ANY other member speaks, c1 is unblocked again.
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "interjection" });
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "back in" });
    expect(chatOf(state).at(-1)?.text).toBe("back in");
  });

  it("assigns a strictly increasing seq across senders", () => {
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "a" });
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c2", text: "b" });
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "c" });
    // Two join notices took seq 1-2; the player lines continue the same
    // strictly-increasing counter.
    const seqs = playerLinesOf(state).map((entry) => entry.seq);
    expect(seqs).toEqual([3, 4, 5]);
  });
});

describe("chat is ephemeral and public", () => {
  it("keeps only the last MAX_CHAT_MESSAGES lines (oldest roll off)", () => {
    let state = tableWithTwo();
    // Three members so we can cycle senders and never trip the per-client flood.
    state = expectOk(state, { type: "JOIN_ROOM", clientId: "c3", name: "Cat" });
    const senders = ["c1", "c2", "c3"];
    const total = MAX_CHAT_MESSAGES + 12;
    for (let i = 0; i < total; i += 1) {
      state = expectOk(state, { type: "SEND_CHAT", clientId: senders[i % senders.length], text: `msg-${i}` });
    }
    const chat = chatOf(state);
    expect(chat).toHaveLength(MAX_CHAT_MESSAGES);
    // The oldest lines are gone; the most recent survive; seq still monotonic.
    expect(chat[0].text).toBe(`msg-${total - MAX_CHAT_MESSAGES}`);
    expect(chat.at(-1)?.text).toBe(`msg-${total - 1}`);
    expect(chat.at(-1)!.seq).toBeGreaterThan(chat[0].seq);
  });

  it("is public: every seat's player view carries the same chat (nothing redacted)", () => {
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "public banter" });
    const seatId = realSeatId(state);
    const otherSeat = state.turnOrder.find((id) => id !== NEUTRAL_PLAYER_ID && id !== seatId) ?? seatId;
    const viewA = getPlayerView(state, seatId);
    const viewB = getPlayerView(state, otherSeat);
    expect(viewA.room?.chat).toEqual(state.room?.chat);
    expect(viewB.room?.chat?.at(-1)?.text).toBe("public banter");
  });

  it("survives a membership change (lives in state.room, not a per-turn field)", () => {
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "before rename" });
    // A room-level action (renaming the table) does not wipe the feed.
    state = expectOk(state, { type: "SET_ROOM_NAME", clientId: "c1", name: "The Round Table" });
    expect(chatOf(state).at(-1)?.text).toBe("before rename");
  });
});

describe("system chat notices (appendSystemChat)", () => {
  it("seeds a system line when forced, and is a no-op on a silent table otherwise", () => {
    const state = tableWithTwo();
    // A genuinely SILENT table (the join notices cleared away — the empty-buffer
    // contract this test pins): not forced + empty feed → nothing added.
    state.room!.chat = [];
    expect(appendSystemChat(state, "Bob left the table")).toBeNull();
    expect(chatOf(state)).toHaveLength(0);
    // Forced → a system line appears, distinct kind, not counted as a player line.
    const added = appendSystemChat(state, "Game reset", { force: true });
    expect(added?.kind).toBe("system");
    expect(chatOf(state).at(-1)?.kind).toBe("system");
  });

  it("system lines do not consume a client's flood budget", () => {
    let state = tableWithTwo();
    for (let i = 0; i < CHAT_FLOOD_LIMIT - 1; i += 1) {
      state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: `p${i}` });
    }
    // Interleave a system notice; it must not push c1 over the flood limit.
    appendSystemChat(state, "someone joined", { force: true });
    state = expectOk(state, { type: "SEND_CHAT", clientId: "c1", text: "still ok" });
    expect(chatOf(state).at(-1)?.text).toBe("still ok");
  });
});
