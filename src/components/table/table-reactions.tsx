"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import {
  Eye,
  Hand,
  Hourglass,
  Laugh,
  type LucideIcon,
  MessageCircle,
  Smile,
  Sparkles,
  ThumbsUp,
  Zap
} from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { playTableReaction } from "@/lib/sound";
import {
  factionCrestAsset,
  getTableReaction,
  TABLE_REACTIONS,
  type GameState,
  type TableReaction,
  type TableReactionDef
} from "@/engine";

/**
 * Table reactions (emotes) UI. Two pieces, both driven off the synced
 * `state.tableReactions` ring buffer so every client stays in lockstep:
 *
 *  - <TableReactionBar> — a tucked-away "React" button that pops a palette;
 *    clicking a reaction dispatches SEND_TABLE_REACTION (a client-side cooldown
 *    stops accidental spam alongside the engine's flood cap).
 *  - <TableReactionOverlay> — floating bubbles for reactions that arrive AFTER
 *    this client mounted (history is adopted silently, never replayed), each
 *    carrying the sender's authentic faction crest + a chime, then fading.
 *
 * <TableReactionsLayer> wires both together and shows the bar only at a real
 * multiplayer table (two or more people in the room).
 */

/** Lucide glyphs for the text reactions; the art reactions use their image. */
const REACTION_GLYPHS: Record<string, LucideIcon> = {
  greet: Hand,
  well_played: ThumbsUp,
  wow: Sparkles,
  laugh: Laugh,
  think: MessageCircle,
  hurry: Hourglass,
  oops: Zap
};

/** How long a reaction bubble stays on screen before it fades out (ms). */
const BUBBLE_LIFETIME_MS = 4800;
/** Never float more than this many bubbles at once (newest win). */
const MAX_VISIBLE_BUBBLES = 6;
/** Client-side cooldown between sends (the engine also caps floods). */
const SEND_COOLDOWN_MS = 1100;

function ReactionIcon({ reaction, size }: { reaction: TableReactionDef; size: number }) {
  const [failed, setFailed] = useState(false);
  if (reaction.image && !failed) {
    return (
      <img
        alt=""
        className="reactionArt"
        height={size}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={assetUrl(reaction.image)}
        width={size}
      />
    );
  }
  const Glyph = REACTION_GLYPHS[reaction.id] ?? Smile;
  return <Glyph aria-hidden="true" size={Math.round(size * 0.72)} />;
}

export function TableReactionBar({
  onSend,
  disabled = false
}: {
  onSend: (reactionId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const cooldownRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (cooldownRef.current !== null) {
        window.clearTimeout(cooldownRef.current);
      }
    },
    []
  );

  const send = (reactionId: string) => {
    if (cooling || disabled) {
      return;
    }
    onSend(reactionId);
    setOpen(false);
    setCooling(true);
    cooldownRef.current = window.setTimeout(() => setCooling(false), SEND_COOLDOWN_MS);
  };

  return (
    <div className={`tableReactionBar ${open ? "open" : ""}`}>
      {open ? (
        <div className="reactionPalette" role="menu" aria-label="Table reactions">
          {TABLE_REACTIONS.map((reaction) => (
            <button
              aria-label={reaction.label}
              className="reactionOption"
              disabled={cooling || disabled}
              key={reaction.id}
              onClick={() => send(reaction.id)}
              role="menuitem"
              title={reaction.phrase}
              type="button"
            >
              <ReactionIcon reaction={reaction} size={26} />
            </button>
          ))}
        </div>
      ) : null}
      <button
        aria-expanded={open}
        aria-label="Send a table reaction"
        className="reactionToggle"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Smile aria-hidden="true" size={16} />
        <span>React</span>
      </button>
    </div>
  );
}

function ReactionBubble({ reaction }: { reaction: TableReaction }) {
  const def = getTableReaction(reaction.reactionId);
  const crest = factionCrestAsset(reaction.factionId);
  const [crestFailed, setCrestFailed] = useState(false);
  return (
    <div className="reactionBubble" role="status">
      <span className="reactionCrest">
        {crest && !crestFailed ? (
          <img
            alt=""
            onError={() => setCrestFailed(true)}
            referrerPolicy="no-referrer"
            src={assetUrl(crest)}
          />
        ) : (
          <Eye aria-hidden="true" size={16} />
        )}
      </span>
      <span className="reactionBubbleBody">
        <span className="reactionBubbleName">{reaction.name}</span>
        <span className="reactionBubblePhrase">
          {def ? <ReactionIcon reaction={def} size={18} /> : null}
          <span>{def?.phrase ?? ""}</span>
        </span>
      </span>
    </div>
  );
}

export function TableReactionOverlay({ reactions }: { reactions?: TableReaction[] }) {
  const [active, setActive] = useState<TableReaction[]>([]);
  // null until the first render adopts the current high-water seq — so history
  // already in the buffer when we joined never floods the screen or chimes.
  const lastSeenSeq = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = reactions ?? [];
    const highest = list.reduce((max, reaction) => Math.max(max, reaction.seq), 0);
    if (lastSeenSeq.current === null) {
      lastSeenSeq.current = highest;
      return;
    }
    const fresh = list.filter((reaction) => reaction.seq > (lastSeenSeq.current ?? 0));
    if (fresh.length === 0) {
      return;
    }
    lastSeenSeq.current = highest;
    setActive((prev) => [...prev, ...fresh].slice(-MAX_VISIBLE_BUBBLES));
    playTableReaction();
    for (const reaction of fresh) {
      const timer = window.setTimeout(() => {
        setActive((prev) => prev.filter((entry) => entry.seq !== reaction.seq));
      }, BUBBLE_LIFETIME_MS);
      timers.current.push(timer);
    }
  }, [reactions]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    []
  );

  if (active.length === 0) {
    return null;
  }

  return (
    <div className="tableReactionOverlay" aria-live="polite">
      {active.map((reaction) => (
        <ReactionBubble key={reaction.seq} reaction={reaction} />
      ))}
    </div>
  );
}

export function TableReactionsLayer({
  state,
  onSend
}: {
  state: GameState;
  onSend: (reactionId: string) => void;
}) {
  const memberCount = state.room?.members.length ?? 0;
  const isMultiplayer = memberCount >= 2;
  return (
    <>
      <TableReactionOverlay reactions={state.tableReactions} />
      {isMultiplayer ? <TableReactionBar onSend={onSend} /> : null}
    </>
  );
}
