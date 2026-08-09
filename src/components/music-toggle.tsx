"use client";

import { Music, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isMusicMuted, setMusicMuted, subscribeMusic } from "@/lib/music";

/**
 * Music on/off switch. Toggles the looping background theme only; the one-shot
 * sound effects (unit voices, spell hits, dice) keep playing regardless, so a
 * player who finds the music distracting can silence it without losing the
 * combat foley. The choice persists across sessions (localStorage).
 *
 * `compact` renders the icon-only round form (the main menu's corner button);
 * the default keeps the labelled pill the in-game table menu has always used.
 */
export function MusicToggle({
  compact = false,
  className
}: {
  compact?: boolean;
  className?: string;
} = {}): React.JSX.Element {
  // The server has no localStorage, so it always renders "music on"; the client
  // reconciles to the stored choice. suppressHydrationWarning keeps that
  // expected first-paint difference from logging a warning.
  const muted = useSyncExternalStore(
    subscribeMusic,
    isMusicMuted,
    () => false
  );
  const label = muted ? "Turn the music on" : "Turn the music off";
  return (
    <button
      aria-label={label}
      aria-pressed={!muted}
      className={`musicToggle${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => setMusicMuted(!muted)}
      suppressHydrationWarning
      title={label}
      type="button"
    >
      {muted ? (
        <VolumeX aria-hidden="true" size={compact ? 16 : 13} />
      ) : (
        <Music aria-hidden="true" size={compact ? 16 : 13} />
      )}
      {compact ? null : <span suppressHydrationWarning>{muted ? "Music off" : "Music on"}</span>}
    </button>
  );
}
