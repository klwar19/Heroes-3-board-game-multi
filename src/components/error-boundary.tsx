"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /**
   * When this value changes, the boundary clears a caught error and re-renders.
   * Pass the live room version so a fresh server snapshot recovers the table
   * automatically — the game state is server-authoritative, so a render crash
   * never loses progress.
   */
  resetKey?: unknown;
  /** Recovery action surfaced on the fallback (re-fetch the room snapshot). */
  onReset?: () => void;
  syncStatus?: string;
};

type State = { error: Error | null };

/**
 * Catches render-time crashes in the table/adventure UI so a single bad frame
 * no longer unmounts the whole app back to a blank menu. The fallback keeps the
 * live connection alive: the next server snapshot (new resetKey) clears the
 * error on its own, and a manual "Reload the table" button re-syncs on demand.
 */
export class TableErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Keep the crash visible for debugging without tearing down the session.
    console.error("Table render error (recovered):", error);
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="tableRoot loadingRoot">
          <div className="errorRecovery" role="alert">
            <h2>The table hit a snag</h2>
            <p>
              Your game is safe — it lives on the server, not in this window. The board reloads from the latest
              synced state, so nothing is lost.
            </p>
            {this.props.syncStatus ? <p className="observerNote">{this.props.syncStatus}</p> : null}
            <button
              className="commandButton"
              type="button"
              onClick={() => {
                this.props.onReset?.();
                this.setState({ error: null });
              }}
            >
              Reload the table
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
