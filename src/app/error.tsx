"use client";

import { useEffect } from "react";
import { escapeToFreshRoom } from "@/lib/recovery";

/**
 * Route-level safety net: catches any render/hook crash in the table page that
 * the in-table boundary cannot (errors thrown in the component body before its
 * JSX mounts).
 *
 * Recovery offers two paths, because reconnecting to the SAME room cannot
 * escape a crash caused by that room's own state (a stale re-restored cache, or
 * a bad snapshot from a server on older engine code) — a plain reload just
 * re-loads the poison and the screen comes back, so the player "keeps staying
 * there":
 *   1. "Reload this table" — a hard reload, for a transient/one-off crash.
 *   2. "Start a fresh table" — opens a brand-new room id the server creates
 *      empty. This ALWAYS works (see src/lib/recovery.ts); it is the guaranteed
 *      way out, at the cost of the already-broken game.
 *
 * The thrown error's text is shown so it can be reported — guessing blind is
 * how this stayed unfixed.
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

  return (
    <main className="tableRoot loadingRoot">
      <div className="errorRecovery" role="alert">
        <h2>The table hit a snag</h2>
        <p>
          Your game is safe — it lives on the server, not in this window. Try reloading first. If the table
          keeps crashing, start a fresh table — the broken game cannot be rejoined, but a new room always
          opens cleanly.
        </p>
        <div className="handButtons">
          <button className="commandButton" type="button" onClick={reload}>
            Reload this table
          </button>
          <button className="commandButton primary" type="button" onClick={escapeToFreshRoom}>
            Start a fresh table
          </button>
        </div>
        {error?.message ? (
          <pre className="errorDetail" aria-label="Error detail">
            {error.message}
            {error.digest ? `\n(digest ${error.digest})` : ""}
          </pre>
        ) : null}
      </div>
    </main>
  );
}
