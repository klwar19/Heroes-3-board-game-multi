"use client";

import { Music, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isMusicMuted, setMusicMuted, subscribeMusic } from "@/lib/music";

/**
 * Music on/off switch. Toggles the looping background theme only; the one-shot
 * sound effects (unit voices, spell hits, dice) keep playing regardless, so a
 * player who finds the music distracting can silence it without losing the
 * combat foley. The choice persists across sessions (localStorage).
 */
export function MusicToggle(): React.JSX.Element {
  // The server has no localStorage, so it always renders "music on"; the client
  // reconciles to the stored choice. suppressHydrationWarning keeps that
  // expected first-paint difference from logging a warning.
  const muted = useSyncExternalStore(
    subscribeMusic,
    isMusicMuted,
    () => false
  );
  return (
    <button
      aria-pressed={!muted}
      className="musicToggle"
      onClick={() => setMusicMuted(!muted)}
      suppressHydrationWarning
      title={muted ? "Turn the music on" : "Turn the music off"}
      type="button"
    >
      {muted ? <VolumeX aria-hidden="true" size={13} /> : <Music aria-hidden="true" size={13} />}
      <span suppressHydrationWarning>{muted ? "Music off" : "Music on"}</span>
    </button>
  );
}
