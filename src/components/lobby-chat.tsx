"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { MAX_LOBBY_CHAT_TEXT_LENGTH, type LobbyChatMessage } from "@/server/lobby-chat";

/**
 * Lobby chat panel — the global, ephemeral feed shown in the room browser
 * (/play) for people not yet in a game room. Presentational: the /play page owns
 * polling `messages` and the `onSend` transport (postLobbyChat), so this only
 * renders and validates input (disabled Send when empty, a soft client
 * cooldown; the server also flood-caps).
 */
const SEND_COOLDOWN_MS = 600;

function timeAgo(at: number, now: number): string {
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 5) {
    return "now";
  }
  if (secs < 60) {
    return `${secs}s`;
  }
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
}

export function LobbyChat({
  clientId,
  messages,
  error,
  onSend
}: {
  clientId: string;
  messages: LobbyChatMessage[];
  error?: string | null;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastSendAtRef = useRef(0);
  const latestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0;

  // Seed the display clock on mount and refresh it so "time ago" labels stay
  // current (the async interval tick is fine; the one synchronous seed uses the
  // same scoped exception the app applies to mount-time state syncing).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [latestSeq]);

  const submit = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    const at = Date.now();
    if (at - lastSendAtRef.current < SEND_COOLDOWN_MS) {
      return;
    }
    lastSendAtRef.current = at;
    onSend(text);
    setDraft("");
  };

  return (
    <section className="lobbyChat" aria-label="Lobby chat">
      <header className="lobbyChatHeader">
        <MessageSquare aria-hidden="true" size={15} />
        <span>Lobby chat</span>
        <small>while you pick a room</small>
      </header>

      <div className="lobbyChatMessages" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="lobbyChatEmpty">No messages yet — say hello to the lobby.</p>
        ) : (
          messages.map((message) => (
            <p className={`lobbyChatLine ${message.clientId === clientId ? "mine" : ""}`} key={message.seq}>
              <span className="lobbyChatAuthor">{message.name}</span>
              <span className="lobbyChatText">{message.text}</span>
              {now ? <span className="lobbyChatTime">{timeAgo(message.at, now)}</span> : null}
            </p>
          ))
        )}
      </div>

      {error ? <p className="lobbyChatError">{error}</p> : null}

      <form
        className="lobbyChatComposer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="Lobby message"
          maxLength={MAX_LOBBY_CHAT_TEXT_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message the lobby…"
          value={draft}
        />
        <button aria-label="Send lobby message" className="commandButton" disabled={draft.trim().length === 0} type="submit">
          <Send aria-hidden="true" size={14} />
        </button>
      </form>
    </section>
  );
}
