import { describe, expect, it } from "vitest";
import {
  LobbyChatBoard,
  LobbyChatError,
  LOBBY_CHAT_FLOOD_LIMIT,
  MAX_LOBBY_CHAT_MESSAGES,
  MAX_LOBBY_CHAT_NAME_LENGTH,
  MAX_LOBBY_CHAT_TEXT_LENGTH,
  sanitizeLobbyText
} from "./lobby-chat";

function reason(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof LobbyChatError ? error.message : "UNEXPECTED";
  }
  return "NO_THROW";
}

describe("LobbyChatBoard", () => {
  it("posts a message with attribution, a stamped time, and a monotonic seq", () => {
    let t = 1000;
    const board = new LobbyChatBoard({ now: () => t });
    const first = board.post({ clientId: "c1", name: "Alice", text: "Hi lobby" });
    expect(first).toMatchObject({ seq: 1, clientId: "c1", name: "Alice", text: "Hi lobby", at: 1000 });
    t = 2000;
    const second = board.post({ clientId: "c2", name: "Bob", text: "Hey" });
    expect(second.seq).toBe(2);
    expect(second.at).toBe(2000);
    expect(board.list().map((m) => m.text)).toEqual(["Hi lobby", "Hey"]);
  });

  it("sanitizes control chars + whitespace and caps length (control: clean text is verbatim)", () => {
    const board = new LobbyChatBoard();
    expect(board.post({ clientId: "c1", name: "A", text: "a\n\n\tb   c" }).text).toBe("a b c");
    expect(board.post({ clientId: "c2", name: "B", text: "x".repeat(MAX_LOBBY_CHAT_TEXT_LENGTH + 20) }).text).toHaveLength(
      MAX_LOBBY_CHAT_TEXT_LENGTH
    );
    // Control: an already-clean line is stored unchanged.
    expect(board.post({ clientId: "c3", name: "C", text: "just fine" }).text).toBe("just fine");
  });

  it("rejects an empty message and a missing client id (controls: valid input is accepted)", () => {
    const board = new LobbyChatBoard();
    expect(reason(() => board.post({ clientId: "c1", name: "A", text: "   " }))).toMatch(/message/i);
    expect(reason(() => board.post({ clientId: "", name: "A", text: "hello" }))).toMatch(/client id/i);
    // Controls: a real client + text lands.
    expect(board.post({ clientId: "c1", name: "A", text: "ok" }).text).toBe("ok");
  });

  it("falls back to a default name and caps an over-long name", () => {
    const board = new LobbyChatBoard();
    expect(board.post({ clientId: "c1", name: "   ", text: "hi" }).name).toBe("Player");
    expect(board.post({ clientId: "c2", name: "z".repeat(MAX_LOBBY_CHAT_NAME_LENGTH + 10), text: "hi" }).name).toHaveLength(
      MAX_LOBBY_CHAT_NAME_LENGTH
    );
  });

  it("keeps only the last MAX_LOBBY_CHAT_MESSAGES lines (oldest roll off)", () => {
    const board = new LobbyChatBoard();
    const senders = ["c1", "c2", "c3"];
    const total = MAX_LOBBY_CHAT_MESSAGES + 8;
    for (let i = 0; i < total; i += 1) {
      board.post({ clientId: senders[i % senders.length], name: "N", text: `m${i}` });
    }
    const list = board.list();
    expect(list).toHaveLength(MAX_LOBBY_CHAT_MESSAGES);
    expect(list[0].text).toBe(`m${total - MAX_LOBBY_CHAT_MESSAGES}`);
    expect(list.at(-1)?.text).toBe(`m${total - 1}`);
  });

  it("flood-caps one client and another sender resets the budget (control)", () => {
    const board = new LobbyChatBoard();
    for (let i = 0; i < LOBBY_CHAT_FLOOD_LIMIT; i += 1) {
      board.post({ clientId: "c1", name: "A", text: `s${i}` });
    }
    expect(reason(() => board.post({ clientId: "c1", name: "A", text: "again" }))).toMatch(/slow down/i);
    // Control: any other sender clears the run.
    board.post({ clientId: "c2", name: "B", text: "interject" });
    expect(board.post({ clientId: "c1", name: "A", text: "back" }).text).toBe("back");
  });

  it("list() returns a defensive copy (mutating it cannot corrupt the board)", () => {
    const board = new LobbyChatBoard();
    board.post({ clientId: "c1", name: "A", text: "one" });
    const copy = board.list();
    copy.push({ seq: 999, clientId: "x", name: "x", text: "hax", at: 0 });
    copy[0].text = "tampered";
    expect(board.list()).toHaveLength(1);
    expect(board.list()[0].text).toBe("one");
  });
});

describe("sanitizeLobbyText", () => {
  it("is pure and matches the board's behaviour", () => {
    expect(sanitizeLobbyText("  a\tb ", 100)).toBe("a b");
    expect(sanitizeLobbyText(42, 100)).toBe("");
    expect(sanitizeLobbyText("yyyyy", 3)).toBe("yyy");
  });
});
