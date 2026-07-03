import type { ChatMessage, GameAction, GameState, RoomMembershipState, RoomSeat } from "./state";

/**
 * Room chat — an ephemeral, live message feed for the multiplayer table.
 *
 * A chat line flows through `applyAction` like any other action: it is
 * self-validating (so it lives in the reducer's `HANDLER_VALIDATED_ACTIONS`),
 * mutates only the bounded ring buffer `state.room.chat`, and is never seat- or
 * turn-gated. Because a `SEND_CHAT` action carries the sender's `clientId` and
 * NO seat `playerId`, `roomActionGuard` and the parallel-turn bystander backstop
 * both skip it (they act only on seat-scoped actions) — so it is safe in every
 * mode (solo/open/hosted/parallel), an observer may chat, and a player may chat
 * on anyone's turn.
 *
 * "Temporary" by design: only the last MAX_CHAT_MESSAGES lines are kept (older
 * ones roll off), nothing is stored per account, and the whole feed lives inside
 * the room membership record — so it is public (rides `getPlayerView` to every
 * seat/observer) and is carried across a game reset with the rest of the room,
 * but never grows the snapshot without bound.
 *
 * Two guards keep it honest, both deterministic (no wall-clock) so replays and
 * tests stay reproducible:
 *  - the buffer is capped at MAX_CHAT_MESSAGES (oldest dropped); and
 *  - a per-client flood cap rejects a client that already owns the last
 *    CHAT_FLOOD_LIMIT *player* lines, so one seat can't monopolise the feed
 *    (paired with a client-side send cooldown for the everyday case).
 */

/** Longest chat history kept in synced state (bounds the snapshot size). */
export const MAX_CHAT_MESSAGES = 60;

/** Longest single message; anything longer is truncated to this many characters. */
export const MAX_CHAT_TEXT_LENGTH = 400;

/**
 * A client may not own more than this many of the most-recent *player* lines.
 * Rejecting the (LIMIT+1)-th consecutive line from one client stops a single
 * seat from flooding, with no timestamp needed. System lines never count.
 */
export const CHAT_FLOOD_LIMIT = 5;

export function isChatAction(action: GameAction): boolean {
  return action.type === "SEND_CHAT";
}

/**
 * Normalise raw chat input to one safe, single-line, bounded string:
 *  - drop C0 control characters (code points 0x00–0x1F) and DEL (0x7F) so
 *    nothing can smuggle newlines, tabs or terminal escapes into the feed
 *    (each becomes a space, collapsed below);
 *  - collapse every remaining whitespace run to a single space (chat is one
 *    line — a wall of blank lines can't be used to shove the feed around);
 *  - trim the ends and cap the length.
 * Returns "" when nothing printable remains (an empty send, rejected upstream).
 * The stored text stays otherwise verbatim; HTML/JSX escaping is the renderer's
 * job (React escapes `{text}` by default), so no markup can execute.
 */
export function sanitizeChatText(raw: string): string {
  if (typeof raw !== "string") {
    return "";
  }
  let stripped = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    stripped += code <= 0x1f || code === 0x7f ? " " : char;
  }
  return stripped.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_TEXT_LENGTH);
}

/** The chat buffer for a room, always as an array (absent → empty). */
function chatBuffer(room: RoomMembershipState): ChatMessage[] {
  return room.chat ?? [];
}

/**
 * Append a message to the room's ring buffer, dropping the oldest lines past the
 * cap so the snapshot stays bounded. Shared by player lines and system notices.
 */
function pushChat(room: RoomMembershipState, message: Omit<ChatMessage, "seq">): ChatMessage {
  const seq = (room.chatSeq ?? 0) + 1;
  room.chatSeq = seq;
  const full: ChatMessage = { seq, ...message };
  const next = [...chatBuffer(room), full];
  room.chat = next.length > MAX_CHAT_MESSAGES ? next.slice(-MAX_CHAT_MESSAGES) : next;
  return full;
}

/**
 * Emit a "system" chat line (a join/leave notice, etc.). Never flood-capped and
 * never counts toward a client's flood budget — it is engine-authored, not a
 * player send. By default a no-op on a table where nobody has chatted yet (so a
 * silent table doesn't sprout a system-only feed); pass `force` to seed one.
 */
export function appendSystemChat(
  state: GameState,
  text: string,
  options: { force?: boolean } = {}
): ChatMessage | null {
  const room = state.room;
  if (!room) {
    return null;
  }
  const clean = sanitizeChatText(text);
  if (!clean) {
    return null;
  }
  if (!options.force && chatBuffer(room).length === 0) {
    return null;
  }
  return pushChat(room, { clientId: "system", name: "Table", seat: "observer", text: clean, kind: "system" });
}

export function sendChat(state: GameState, action: Extract<GameAction, { type: "SEND_CHAT" }>): void {
  if (!action.clientId) {
    throw new Error("A client id is required to chat.");
  }
  const text = sanitizeChatText(action.text);
  if (!text) {
    throw new Error("Enter a message to send.");
  }

  const room = state.room;
  // Chat is inherently a table activity: you must be a member of the room to
  // post. The client always JOIN_ROOMs on entering a room, so by the time the
  // chat box is usable the sender is a member. Mirrors the "claimed identity"
  // trust model the rest of the room actions use.
  const member = room?.members.find((entry) => entry.clientId === action.clientId) ?? null;
  if (!room || !member) {
    throw new Error("Join the room before chatting.");
  }

  // Per-client flood cap: refuse when this client already owns the last
  // CHAT_FLOOD_LIMIT *player* lines (system notices don't count). Deterministic,
  // so it never depends on the wall clock.
  const playerLines = chatBuffer(room).filter((entry) => entry.kind === "chat");
  if (playerLines.length >= CHAT_FLOOD_LIMIT) {
    const recent = playerLines.slice(-CHAT_FLOOD_LIMIT);
    if (recent.every((entry) => entry.clientId === action.clientId)) {
      throw new Error("Slow down — too many messages at once.");
    }
  }

  const seat: RoomSeat = member.seat;
  pushChat(room, {
    clientId: action.clientId,
    name: member.name,
    seat,
    text,
    kind: "chat",
    ...(typeof action.at === "number" && Number.isFinite(action.at) ? { at: Math.floor(action.at) } : {})
  });
}
