"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { createSinglePlayerRoom } from "@/lib/realtime";

/**
 * Single-player front door (plan §5.1): a short creation panel that mints a
 * PRIVATE room with one human seat and the chosen number of computer seats,
 * then drops the player into the normal setup screen at /?room=<id>. The
 * opponent count picked here is only the starting value — the setup screen's
 * own "Computer opponents" control (SET_COMPUTER_OPPONENTS) can change it up
 * to the selected scenario's capacity before the adventure starts.
 */
export default function SinglePlayerPage() {
  const router = useRouter();
  const [opponents, setOpponents] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { roomId } = await createSinglePlayerRoom(opponents);
      router.push(`/?room=${encodeURIComponent(roomId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the game.");
      setCreating(false);
    }
  };

  return (
    <MenuShell backdrop="lobby-backdrop" title="Playing with computer">
      <p className="loadingStatus">
        A private table: you against computer opponents. Nobody else can join or
        watch, and the game never appears in the multiplayer lobby or the ladder.
      </p>
      <p className="loadingTip">
        The computer opponents build up their towns, recruit units, march their
        heroes toward objectives and fight — they take on the neutral guards they
        can beat and will attack you when their army is a match. Their battles
        resolve instantly; you get a recap of each result, then choose when to
        watch their moves play out on the map.
      </p>
      <div className="singlePlayerOpponents" role="group" aria-label="Computer opponents">
        <span className="loadingStatus">Computer opponents</span>
        <div className="singlePlayerOpponentChoices">
          {[1, 2, 3].map((count) => (
            <button
              aria-pressed={opponents === count}
              className={`menuNavButton singlePlayerOpponentChoice${opponents === count ? " selected" : ""}`}
              key={count}
              onClick={() => setOpponents(count)}
              type="button"
            >
              {count}
            </button>
          ))}
        </div>
        <small className="loadingStatus">
          Some scenarios seat fewer players — the count is capped by the map you
          pick during setup.
        </small>
      </div>
      {error ? <p className="authError" role="alert">{error}</p> : null}
      <nav className="menuNav" aria-label="Single player">
        <button className="menuNavButton" disabled={creating} onClick={() => void create()} type="button">
          <span className="menuNavText">
            <span className="menuNavLabel">{creating ? "Creating…" : "Create game"}</span>
            <small>Pick your faction and hero on the next screen, then start</small>
          </span>
        </button>
        <Link className="menuNavButton" href="/menu">
          <span className="menuNavText">
            <span className="menuNavLabel">Back</span>
            <small>Return to the main menu</small>
          </span>
        </Link>
      </nav>
    </MenuShell>
  );
}
