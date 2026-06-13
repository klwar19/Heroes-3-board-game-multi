"use client";

import { useEffect } from "react";

/**
 * Route-level safety net: catches any render/hook crash in the table page that
 * the in-table boundary cannot (errors thrown in the component body before its
 * JSX mounts). Reloading re-mounts the page, which reconnects to the same room
 * and fetches the latest server snapshot — the game state is server-side, so
 * progress is never lost.
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

  return (
    <main className="tableRoot loadingRoot">
      <div className="errorRecovery" role="alert">
        <h2>The table hit a snag</h2>
        <p>
          Your game is safe — it lives on the server, not in this window. Reload to rejoin the room from the
          latest synced state; no progress is lost.
        </p>
        <button className="commandButton" type="button" onClick={() => reset()}>
          Reload the table
        </button>
      </div>
    </main>
  );
}
