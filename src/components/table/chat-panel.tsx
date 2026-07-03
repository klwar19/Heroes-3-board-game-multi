"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { MAX_CHAT_TEXT_LENGTH, type ChatMessage, type GameState, type PlayerVisibleState, type RoomSeat } from "@/engine";
import { coreFactionDefinitions } from "@/data/factions/core";

/**
 * Table chat — the in-room, ephemeral live feed (see src/engine/chat.ts). A
 * docked, collapsible widget shown at any real multiplayer table; it reads the
 * synced ring buffer `state.room.chat` and dispatches `SEND_CHAT` through the
 * same action pipe as everything else, so it works identically on both
 * transports and in every mode. Purely presentational otherwise — every rule
 * (membership, flood cap, length) is enforced by the engine, which this UI only
 * mirrors (disabled Send when empty, a soft client-side cooldown).
 */

type ChatState = Pick<GameState, "room"> | Pick<PlayerVisibleState, "room">;

/** Seat colour for a name — the player's faction colour, else a neutral tone. */
function seatColor(state: ChatState & { players?: GameState["players"] }, seat: RoomSeat): string {
  if (seat === "observer") {
    return "#9aa7b4";
  }
  const players = (state as { players?: GameState["players"] }).players;
  const factionId = players?.[seat]?.factionId;
  return (factionId && coreFactionDefinitions[factionId]?.color) || "#c9a94a";
}

/** A compact "time ago" label from a client timestamp (display only). */
function timeAgo(at: number | undefined, now: number): string {
  if (!at || !Number.isFinite(at)) {
    return "";
  }
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 5) {
    return "now";
  }
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.round(secs / 60);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hours = Math.round(mins / 60);
  return `${hours}h`;
}

const SEND_COOLDOWN_MS = 600;

export function ChatPanel({
  state,
  clientId,
  onSend
}: {
  state: GameState | PlayerVisibleState;
  clientId: string;
  /** Dispatches a SEND_CHAT action (page.tsx wires this to submitAction). */
  onSend: (text: string) => void;
}) {
  const room = state.room ?? null;
  const messages = useMemo<ChatMessage[]>(() => room?.chat ?? [], [room?.chat]);
  const memberCount = room?.members.length ?? 0;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastSeenSeqRef = useRef(0);
  const lastSendAtRef = useRef(0);
  const initializedRef = useRef(false);
  const [unread, setUnread] = useState(0);

  const latestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0;

  // Tick a clock only while the panel is open, so the "time ago" labels stay
  // fresh without spinning a timer on every table forever. `now` is seeded in
  // the open handler (an event, not the effect), so the effect only owns the
  // interval — the async tick never trips the no-setState-in-effect rule.
  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [open]);

  // Unread accounting: while collapsed, count new lines from OTHER clients; on
  // open, mark everything seen. Own messages never count. History present at
  // mount is adopted silently (no badge for what was said before you arrived),
  // mirroring the reactions overlay. This is derived-from-props state that must
  // settle in an effect (it accumulates against a "seen" ref), the same scoped
  // pattern the app uses elsewhere for mount-time state syncing.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeenSeqRef.current = latestSeq;
      return;
    }
    if (open) {
      lastSeenSeqRef.current = latestSeq;
      setUnread(0);
      return;
    }
    const fresh = messages.filter(
      (message) => message.seq > lastSeenSeqRef.current && message.clientId !== clientId
    );
    if (fresh.length > 0) {
      setUnread((count) => Math.min(99, count + fresh.length));
      lastSeenSeqRef.current = latestSeq;
    }
  }, [messages, latestSeq, open, clientId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-scroll to the newest line when open.
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, latestSeq]);

  // No room membership yet → nothing to dock (solo sandbox, pre-join).
  if (!room || memberCount === 0) {
    return null;
  }

  const submit = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    const at = Date.now();
    if (at - lastSendAtRef.current < SEND_COOLDOWN_MS) {
      return; // soft client cooldown; the engine also flood-caps server-side
    }
    lastSendAtRef.current = at;
    onSend(text);
    setDraft("");
  };

  const remaining = MAX_CHAT_TEXT_LENGTH - draft.length;

  return (
    <div className={`chatDock ${open ? "open" : ""}`} aria-label="Table chat">
      {open ? (
        <div className="chatPanel" role="log" aria-live="polite">
          <div className="chatHeader">
            <MessageSquare aria-hidden="true" size={14} />
            <span className="chatHeaderTitle">Table chat</span>
            <span className="chatHeaderMeta">{memberCount} here</span>
            <button aria-label="Close chat" className="chatIconButton" onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={14} />
            </button>
          </div>

          <div className="chatMessages" ref={listRef}>
            {messages.length === 0 ? (
              <p className="chatEmpty">No messages yet — say hello.</p>
            ) : (
              messages.map((message) =>
                message.kind === "system" ? (
                  <p className="chatSystemLine" key={message.seq}>
                    {message.text}
                  </p>
                ) : (
                  <p
                    className={`chatLine ${message.clientId === clientId ? "mine" : ""}`}
                    key={message.seq}
                  >
                    <span className="chatAuthor" style={{ color: seatColor(state, message.seat) }}>
                      {message.name}
                    </span>
                    <span className="chatText">{message.text}</span>
                    {message.at && now ? <span className="chatTime">{timeAgo(message.at, now)}</span> : null}
                  </p>
                )
              )
            )}
          </div>

          <form
            className="chatComposer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              aria-label="Chat message"
              className="chatInput"
              maxLength={MAX_CHAT_TEXT_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message the table…"
              value={draft}
            />
            {remaining <= 40 ? <span className="chatCount">{remaining}</span> : null}
            <button aria-label="Send message" className="chatSend" disabled={draft.trim().length === 0} type="submit">
              <Send aria-hidden="true" size={15} />
            </button>
          </form>
        </div>
      ) : (
        <button
          className="chatFab"
          onClick={() => {
            setNow(Date.now());
            setOpen(true);
          }}
          type="button"
          title="Open table chat"
        >
          <MessageSquare aria-hidden="true" size={18} />
          <span>Chat</span>
          {unread > 0 ? <span className="chatBadge">{unread}</span> : null}
        </button>
      )}
    </div>
  );
}
