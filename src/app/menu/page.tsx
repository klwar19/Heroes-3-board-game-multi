"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { DEFAULT_SERVER } from "@/data/servers";
import { fetchSession, logout, type SelfProfile } from "@/lib/auth-client";
import { authEnabled } from "@/lib/auth-mode";
import { getDisplayName } from "@/lib/identity";

/**
 * Main menu: the hub between login and the multiplayer lobby. Single player is
 * deliberately greyed out (out of scope by design, plan §6).
 *
 * Guest mode (accounts flag off): unchanged — a display-name footer with a
 * change-name link, no Logout. Accounts mode: requires a session (redirects to
 * /login when signed out), shows the account nickname, a Logout button, a
 * Profile link, and an Admin link for admins.
 */
export default function MenuPage() {
  const router = useRouter();
  const [displayName, setDisplayNameState] = useState("");
  const [account, setAccount] = useState<SelfProfile | null>(null);
  const started = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (authEnabled()) {
      void fetchSession().then((profile) => {
        if (!profile) {
          router.replace("/login");
        } else {
          setAccount(profile);
          setDisplayNameState(profile.nickname);
        }
      });
    } else {
      const stored = getDisplayName();
      if (stored) {
        setDisplayNameState(stored);
      }
    }
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const accounts = authEnabled();

  return (
    <MenuShell
      title="Heroes III — The Board Game"
      footer={
        accounts ? (
          <span className="menuIdentityLine" suppressHydrationWarning>
            {account ? `Signed in as ${account.nickname}` : "Not signed in"}
          </span>
        ) : (
          <span className="menuIdentityLine" suppressHydrationWarning>
            {displayName ? `Playing as ${displayName} · ` : "No player name set · "}
            <Link href="/login">{displayName ? "Change name" : "Choose a name"}</Link>
          </span>
        )
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
          <small>{DEFAULT_SERVER.name} server — browse tables or open your own</small>
        </Link>
        <Link className="menuNavButton" href="/hall-of-fame">
          Hall of Fame
          <small>{accounts ? "Rankings by MMR" : "Rankings open with player accounts"}</small>
        </Link>
        <Link className="menuNavButton" href="/credits">
          Credits
          <small>Sources and art attribution</small>
        </Link>
        {accounts && account ? (
          <>
            <Link className="menuNavButton" href="/profile">
              Profile
              <small>Contact details other players can reach you at</small>
            </Link>
            {account.role === "admin" ? (
              <Link className="menuNavButton" href="/admin">
                Admin
                <small>Moderate players and rooms</small>
              </Link>
            ) : null}
            <button
              className="menuNavButton"
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              type="button"
            >
              Logout
              <small>End this session</small>
            </button>
          </>
        ) : null}
      </nav>
    </MenuShell>
  );
}
