"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { DEFAULT_SERVER } from "@/data/servers";
import { getDisplayName } from "@/lib/identity";

/**
 * Main menu (expansion plan Phase 0): the hub between login and the
 * multiplayer lobby. Single player is deliberately greyed out — playing vs AI
 * is out of scope by design (plan §6) — and Logout does not exist yet: it
 * ships WITH accounts in Phase 1; rendering a dead button here would be a
 * decorative stub (CLAUDE.md rule 1).
 */
export default function MenuPage() {
  // Read after mount so the statically prerendered markup (no name) matches
  // the first client render; see the same pattern in src/app/page.tsx.
  const [displayName, setDisplayNameState] = useState("");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = getDisplayName();
    if (stored) {
      setDisplayNameState(stored);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <MenuShell
      title="Heroes III — The Board Game"
      footer={
        <span className="menuIdentityLine" suppressHydrationWarning>
          {displayName ? `Playing as ${displayName} · ` : "No player name set · "}
          <Link href="/login">{displayName ? "Change name" : "Choose a name"}</Link>
        </span>
      }
    >
      <nav aria-label="Main menu" className="menuNav">
        <button
          className="menuNavButton"
          disabled
          title="Not available yet — games vs AI are outside the multiplayer foundation"
          type="button"
        >
          Single player
          <small>Coming later — this fan project is multiplayer first</small>
        </button>
        <Link className="menuNavButton" href="/play">
          Multiplayer
          <small>
            {DEFAULT_SERVER.name} server — browse tables or open your own
          </small>
        </Link>
        <Link className="menuNavButton" href="/hall-of-fame">
          Hall of Fame
          <small>Rankings open with player accounts</small>
        </Link>
        <Link className="menuNavButton" href="/credits">
          Credits
          <small>Sources and art attribution</small>
        </Link>
      </nav>
    </MenuShell>
  );
}
