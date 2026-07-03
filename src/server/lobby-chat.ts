/**
 * Lobby chat — the ephemeral, GLOBAL live feed for the room browser (people who
 * are not in a game room yet). It is the lobby-scoped sibling of the in-room
 * chat (src/engine/chat.ts): same "temporary, bounded, nothing stored per
 * account" spirit, but it lives OUTSIDE the game snapshot (there is no room to
 * hang it on), so it is a small in-memory ring buffer served over REST.
 *
 * This module is the pure, framework-free board — a class with an injectable
 * clock so its bounds/flood/sanitise rules are unit-tested deterministically
 * (the same testability bar as AccountStore). The process-wide singleton and
 * the HTTP routes wrap it (see lobby-chat-instance.ts / api/lobby-chat).
 */

export type LobbyChatMessage = {
  /** Monotonic, unique within this process lifetime. */
  seq: number;
  /** The sender's stable per-tab client id (attribution / "you" styling). */
  clientId: string;
  /** Display name at send time (the account nickname when signed in). */
  name: string;
  /** The message body: control-stripped, whitespace-collapsed, trimmed, capped. */
  text: string;
  /** Server receive time (ms) — display only. */
  at: number;
};

/** Longest lobby history kept in memory (bounds the payload). */
export const MAX_LOBBY_CHAT_MESSAGES = 50;

/** Longest single lobby message; longer is truncated. */
export const MAX_LOBBY_CHAT_TEXT_LENGTH = 300;

/** Longest display name shown on a lobby line. */
export const MAX_LOBBY_CHAT_NAME_LENGTH = 24;

/** A client may not own more than this many of the most-recent lines (anti-flood). */
export const LOBBY_CHAT_FLOOD_LIMIT = 5;

/** Strip C0 controls + DEL, collapse whitespace to one space, trim, cap. */
export function sanitizeLobbyText(raw: unknown, cap: number): string {
  if (typeof raw !== "string") {
    return "";
  }
  let stripped = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    stripped += code <= 0x1f || code === 0x7f ? " " : char;
  }
  return stripped.replace(/\s+/g, " ").trim().slice(0, cap);
}

export type PostLobbyChatInput = { clientId: unknown; name: unknown; text: unknown };

export class LobbyChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LobbyChatError";
  }
}

export class LobbyChatBoard {
  private messages: LobbyChatMessage[] = [];
  private seq = 0;
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /** Recent messages, oldest → newest (a defensive copy). */
  list(): LobbyChatMessage[] {
    return this.messages.map((message) => ({ ...message }));
  }

  /**
   * Post one line. Throws LobbyChatError on an empty/oversized-clientId send or a
   * per-client flood. Returns the stored message. Text and name are sanitised
   * and capped; a per-client flood cap (like the in-room chat) stops one client
   * monopolising the feed.
   */
  post(input: PostLobbyChatInput): LobbyChatMessage {
    const clientId = typeof input.clientId === "string" ? input.clientId.trim().slice(0, 80) : "";
    if (!clientId) {
      throw new LobbyChatError("A client id is required to chat.");
    }
    const text = sanitizeLobbyText(input.text, MAX_LOBBY_CHAT_TEXT_LENGTH);
    if (!text) {
      throw new LobbyChatError("Enter a message to send.");
    }
    const name = sanitizeLobbyText(input.name, MAX_LOBBY_CHAT_NAME_LENGTH) || "Player";

    if (this.messages.length >= LOBBY_CHAT_FLOOD_LIMIT) {
      const recent = this.messages.slice(-LOBBY_CHAT_FLOOD_LIMIT);
      if (recent.every((message) => message.clientId === clientId)) {
        throw new LobbyChatError("Slow down — too many messages at once.");
      }
    }

    this.seq += 1;
    const message: LobbyChatMessage = { seq: this.seq, clientId, name, text, at: this.now() };
    this.messages.push(message);
    if (this.messages.length > MAX_LOBBY_CHAT_MESSAGES) {
      this.messages = this.messages.slice(-MAX_LOBBY_CHAT_MESSAGES);
    }
    return message;
  }
}
