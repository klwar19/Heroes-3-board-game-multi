"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Minimize2, Send } from "lucide-react";
import { MAX_CHAT_TEXT_LENGTH, type ChatMessage, type GameState, type PlayerVisibleState, type RoomSeat } from "@/engine";
import { coreFactionDefinitions } from "@/data/factions/core";
import { playTableChatMessage } from "@/lib/sound";
import { getUiModePreference, useUiModePreference } from "@/lib/ui-mode-preference";

/**
 * Table chat — the in-room, ephemeral live feed (see src/engine/chat.ts). A
 * docked, collapsible widget shown at any real multiplayer table; it reads the
 * synced ring buffer `state.room.chat` and dispatches `SEND_CHAT` through the
 * same action pipe as everything else, so it works identically on both
 * transports and in every mode. Purely presentational otherwise — every rule
 * (membership, flood cap, length) is enforced by the engine, which this UI only
 * mirrors (disabled Send when empty, a soft client-side cooldown).
 *
 * Starts OPEN so the table can talk during events / overlays; the minimize
 * button (or Escape) collapses to a FAB. The dock sits above event/modal
 * layers so chat is never covered by proclamations, dice, or notice cards.
 *
 * Visibility extras (presentation only):
 *  - unread badge + last-line preview on the minimized FAB;
 *  - a short toast + soft chime when a new line arrives while minimized;
 *  - a "New messages" divider when reopening with unread;
 *  - smart auto-scroll (stick only when already near the bottom);
 *  - verified authors' names link to their public profile.
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

/** Truncate a preview line for the FAB / toast (keeps the UI compact). */
function previewText(text: string, max = 42): string {
  const clean = text.trim();
  if (clean.length <= max) {
    return clean;
  }
  return `${clean.slice(0, max - 1)}…`;
}

const SEND_COOLDOWN_MS = 600;
/** How long the collapsed "someone said…" toast stays visible. */
const PREVIEW_TOAST_MS = 4500;
/** Within this many px of the bottom, new lines auto-scroll into view. */
const STICK_BOTTOM_PX = 56;

type PreviewToast = { seq: number; name: string; text: string; system: boolean };

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

  // Default open: the table chat should be visible during events and other
  // overlays so players can talk without hunting for the FAB first. On the
  // PHONE layout it starts collapsed instead — an open dock eats half a phone
  // screen and floats over the panels/dialogs. (Initializer-only read: the
  // panel first mounts client-side once room state exists, so this never runs
  // during prerender; "computer"/unset keep the desktop default exactly.)
  const [open, setOpen] = useState(() => getUiModePreference() !== "phone");
  // The pre-game prompt can flip the mode AFTER this panel mounted (first-ever
  // session: chat mounts with the lobby, THEN the player picks Phone). Collapse
  // once on the computer→phone edge; the player may reopen freely afterwards,
  // and a desktop session (mode never flips) is untouched.
  const uiModePref = useUiModePreference();
  const prevUiModeRef = useRef(uiModePref.uiMode);
  useEffect(() => {
    if (prevUiModeRef.current !== "phone" && uiModePref.uiMode === "phone") {
      setOpen(false);
    }
    prevUiModeRef.current = uiModePref.uiMode;
  }, [uiModePref.uiMode]);
  const [draft, setDraft] = useState("");
  // Seeded immediately because the panel starts open (time-ago labels ready).
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Highest seq marked as read (only advances on open / while open). */
  const lastReadSeqRef = useRef(0);
  const lastSendAtRef = useRef(0);
  const initializedRef = useRef(false);
  /** Highest seq scrolled into view while open (smart stick / jump chip). */
  const lastStuckSeqRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const previewTimerRef = useRef<number | null>(null);
  /** Last preview seq we already chimed for (avoid re-chime on same line). */
  const lastChimSeqRef = useRef(0);
  const [unread, setUnread] = useState(0);
  /** Seq after which lines are "new" when the panel was just opened with unread. */
  const [newSinceSeq, setNewSinceSeq] = useState<number | null>(null);
  /** Collapsed toast for the latest unseen line from someone else. */
  const [preview, setPreview] = useState<PreviewToast | null>(null);
  /** When open but scrolled up, how many lines arrived after last stick. */
  const [missedWhileReading, setMissedWhileReading] = useState(0);

  const latestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0;
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  // Tick a clock only while the panel is open, so the "time ago" labels stay
  // fresh without spinning a timer on every table forever.
  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(
    () => () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    },
    []
  );

  // Unread accounting: while collapsed, count lines from OTHER clients after
  // lastReadSeq (the cursor only advances when the panel is open). History
  // present at mount is adopted silently (no badge for what was said before
  // you arrived), mirroring the reactions overlay.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastReadSeqRef.current = latestSeq;
      lastStuckSeqRef.current = latestSeq;
      lastChimSeqRef.current = latestSeq;
      return;
    }
    if (open) {
      lastReadSeqRef.current = latestSeq;
      setUnread(0);
      if (stickToBottomRef.current) {
        lastStuckSeqRef.current = latestSeq;
        setMissedWhileReading(0);
      } else {
        const missed = messages.filter((message) => message.seq > lastStuckSeqRef.current).length;
        setMissedWhileReading(Math.min(99, missed));
      }
      return;
    }

    const fresh = messages.filter(
      (message) => message.seq > lastReadSeqRef.current && message.clientId !== clientId
    );
    setUnread(Math.min(99, fresh.length));
    if (fresh.length === 0) {
      return;
    }
    const last = fresh[fresh.length - 1];
    setPreview({
      seq: last.seq,
      name: last.kind === "system" ? "Table" : last.name,
      text: last.text,
      system: last.kind === "system"
    });
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      setPreview(null);
      previewTimerRef.current = null;
    }, PREVIEW_TOAST_MS);
    if (last.seq > lastChimSeqRef.current) {
      lastChimSeqRef.current = last.seq;
      playTableChatMessage();
    }
  }, [messages, latestSeq, open, clientId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-scroll to the newest line when open AND the user is stuck to bottom
  // (or just opened). Opening always snaps to the end.
  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }
    if (stickToBottomRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      lastStuckSeqRef.current = latestSeq;
      setMissedWhileReading(0);
    }
  }, [open, latestSeq]);

  const openPanel = () => {
    setNow(Date.now());
    // Capture the last *read* seq before the open path marks everything seen.
    if (unread > 0) {
      setNewSinceSeq(lastReadSeqRef.current);
    } else {
      setNewSinceSeq(null);
    }
    setPreview(null);
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    stickToBottomRef.current = true;
    lastStuckSeqRef.current = latestSeq;
    lastChimSeqRef.current = latestSeq;
    setMissedWhileReading(0);
    setOpen(true);
  };

  const closePanel = () => {
    setOpen(false);
    setNewSinceSeq(null);
    setMissedWhileReading(0);
  };

  const scrollToLatest = () => {
    if (listRef.current) {
      stickToBottomRef.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
      lastStuckSeqRef.current = latestSeq;
      setMissedWhileReading(0);
    }
  };

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) {
      return;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const stuck = distance <= STICK_BOTTOM_PX;
    stickToBottomRef.current = stuck;
    if (stuck) {
      lastStuckSeqRef.current = latestSeq;
      setMissedWhileReading(0);
    }
  };

  // No room membership yet → nothing to dock (solo sandbox, pre-join).
  if (!room || memberCount === 0) {
    return null;
  }

  /** Verified nickname for a chat author (undefined for guests / system). */
  const verifiedNameFor = (message: ChatMessage): string | undefined => {
    if (message.kind === "system") {
      return undefined;
    }
    const member = room.members.find((entry) => entry.clientId === message.clientId);
    return member?.userId ? member.name : undefined;
  };

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
    stickToBottomRef.current = true;
    onSend(text);
    setDraft("");
  };

  const remaining = MAX_CHAT_TEXT_LENGTH - draft.length;

  // FAB secondary line: latest message when there is unread activity.
  const fabPreview =
    !open && unread > 0 && latestMessage
      ? latestMessage.kind === "system"
        ? previewText(latestMessage.text, 36)
        : `${latestMessage.name}: ${previewText(latestMessage.text, 28)}`
      : null;

  return (
    <div className={`chatDock ${open ? "open" : ""}`} aria-label="Table chat">
      {open ? (
        <div
          className="chatPanel"
          role="log"
          aria-live="polite"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              closePanel();
            }
          }}
        >
          <div className="chatHeader">
            <MessageSquare aria-hidden="true" size={15} />
            <span className="chatHeaderTitle">Table chat</span>
            <span className="chatHeaderMeta">{memberCount} here</span>
            <button
              aria-label="Minimize chat"
              className="chatIconButton"
              onClick={closePanel}
              title="Minimize chat"
              type="button"
            >
              <Minimize2 aria-hidden="true" size={14} />
            </button>
          </div>

          <div className="chatMessages" ref={listRef} onScroll={onListScroll}>
            {messages.length === 0 ? (
              <p className="chatEmpty">No messages yet — say hello.</p>
            ) : (
              messages.map((message, index) => {
                const showDivider =
                  newSinceSeq !== null &&
                  message.seq > newSinceSeq &&
                  (index === 0 || messages[index - 1].seq <= newSinceSeq);
                return (
                  <div className="chatLineBlock" key={message.seq}>
                    {showDivider ? (
                      <div className="chatNewDivider" role="separator">
                        <span>New messages</span>
                      </div>
                    ) : null}
                    {message.kind === "system" ? (
                      <p className="chatSystemLine">{message.text}</p>
                    ) : (
                      <p className={`chatLine ${message.clientId === clientId ? "mine" : ""}`}>
                        {(() => {
                          const profileName = verifiedNameFor(message);
                          const authorStyle = { color: seatColor(state, message.seat) };
                          return profileName ? (
                            <a
                              className="chatAuthor profileNameLink"
                              href={`/players/${encodeURIComponent(profileName)}`}
                              rel="noreferrer"
                              style={authorStyle}
                              target="_blank"
                              title={`View ${profileName}'s profile`}
                            >
                              {message.name}
                            </a>
                          ) : (
                            <span className="chatAuthor" style={authorStyle}>
                              {message.name}
                            </span>
                          );
                        })()}
                        <span className="chatText">{message.text}</span>
                        {message.at && now ? <span className="chatTime">{timeAgo(message.at, now)}</span> : null}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {missedWhileReading > 0 ? (
            <button className="chatJumpLatest" onClick={scrollToLatest} type="button">
              ↓ {missedWhileReading === 1 ? "1 new message" : `${missedWhileReading} new messages`}
            </button>
          ) : null}

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
        <div className="chatCollapsed">
          {preview ? (
            <button
              className={`chatPreviewToast ${preview.system ? "system" : ""}`}
              onClick={openPanel}
              type="button"
              title="Open table chat"
            >
              {preview.system ? (
                <span className="chatPreviewText">{previewText(preview.text, 48)}</span>
              ) : (
                <>
                  <span className="chatPreviewAuthor">{preview.name}</span>
                  <span className="chatPreviewText">{previewText(preview.text, 40)}</span>
                </>
              )}
            </button>
          ) : null}
          <button className="chatFab" onClick={openPanel} type="button" title="Open table chat">
            <MessageSquare aria-hidden="true" size={18} />
            <span className="chatFabLabel">
              <span className="chatFabTitle">Chat</span>
              {fabPreview ? <span className="chatFabSnippet">{fabPreview}</span> : null}
            </span>
            {unread > 0 ? <span className="chatBadge">{unread}</span> : null}
          </button>
        </div>
      )}
    </div>
  );
}
