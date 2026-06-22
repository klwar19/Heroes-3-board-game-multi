"use client";

import { useEffect } from "react";

/**
 * Route-level safety net: catches any render/hook crash in the table page that
 * the in-table boundary cannot (errors thrown in the component body before its
 * JSX mounts). Reloading re-mounts the page, which reconnects to the same room
 * and fetches the latest server snapshot — the game state is server-side, so
 * progress is never lost.
 *
 * Recovery does a hard `window.location.reload()` rather than Next.js's
 * `reset()`: `reset()` only re-renders the same crashed segment, so when the
 * error recurs on render (a bad snapshot, a hook that throws on mount) the
 * screen just reappears and the click looks dead — the player is trapped with
 * no way back. A full reload always re-mounts the page and re-syncs from the
 * server. "Return to the menu" drops the room query as a last-resort escape
 * from a room whose state is what crashes.
 */
export default function TableError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Table route error (recoverable):", error);
  }, [error]);

  const reload = () => {
    // Try Next.js's soft recovery first (cheap when the error was transient),
    // then force a full reload so a persistent crash can never strand the
    // player on this screen. The reload re-mounts the page and reconnects.
    try {
      reset();
    } catch {
      // Ignore — the hard reload below is the real recovery.
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const returnToMenu = () => {
    if (typeof window !== "undefined") {
      // Drop ?room (and any other query) so the page reconnects to the default
      // room and shows the setup lobby — an escape from a broken room.
      window.location.href = window.location.pathname;
    }
  };

  return (
    <main className="tableRoot loadingRoot">
      <div className="errorRecovery" role="alert">
        <h2>The table hit a snag</h2>
        <p>
          Your game is safe — it lives on the server, not in this window. Reload to rejoin the room from the
          latest synced state; no progress is lost.
        </p>
        <div className="handButtons">
          <button className="commandButton primary" type="button" onClick={reload}>
            Reload the table
          </button>
          <button className="commandButton ghost" type="button" onClick={returnToMenu}>
            Return to the menu
          </button>
        </div>
      </div>
    </main>
  );
}
