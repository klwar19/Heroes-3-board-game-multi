"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { WelcomeNotice } from "@/components/menu/welcome-notice";
import { SKILL_ICONS } from "@/data/assets/homm-assets";
import { DEFAULT_SERVER } from "@/data/servers";
import { assetUrl } from "@/lib/asset-url";
import { fetchSession, logout, type SelfProfile } from "@/lib/auth-client";
import { authEnabled } from "@/lib/auth-mode";
import { getDisplayName, isGuestMode } from "@/lib/identity";

/**
 * Main-menu buttons in the actual-game style: the secondary-skill emblem itself
 * IS the button art — one LARGE emblem fills the gilt plaque and the engraved
 * golden serif label is laid directly across (over) it. Each button's emblem is
 * the logical skill for that destination.
 */
function MenuNavIcon({ icon }: { icon: string }) {
  return <img alt="" aria-hidden="true" className="menuNavIcon" draggable={false} src={assetUrl(icon)} />;
}

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
        if (profile) {
          setAccount(profile);
          setDisplayNameState(profile.nickname);
        } else if (isGuestMode()) {
          // Guest-beside-accounts: a player who chose "Continue as guest" is
          // allowed to play without an account (no bounce back to /login).
          setDisplayNameState(getDisplayName());
        } else {
          // Neither signed in nor a chosen guest → go pick at the entry screen.
          router.replace("/login");
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
    <>
    <WelcomeNotice />
    <MenuShell
      logo
      frameless
      footer={
        accounts ? (
          account ? (
            <span className="menuIdentityLine" suppressHydrationWarning>
              Signed in as {account.nickname}
            </span>
          ) : (
            <span className="menuIdentityLine" suppressHydrationWarning>
              {displayName ? `Playing as guest: ${displayName} · ` : "Guest · "}
              <Link href="/login">Sign in or create an account</Link>
            </span>
          )
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
          <MenuNavIcon icon={SKILL_ICONS.attack} />
          <span className="menuNavText">
            <span className="menuNavLabel">Single player</span>
            <small>Coming later — this fan project is multiplayer first</small>
          </span>
        </button>
        <Link className="menuNavButton" href="/play">
          <MenuNavIcon icon={SKILL_ICONS.leadership} />
          <span className="menuNavText">
            <span className="menuNavLabel">Multiplayer</span>
            <small>{DEFAULT_SERVER.name} server — browse tables or open your own</small>
          </span>
        </Link>
        <Link className="menuNavButton" href="/battle">
          <MenuNavIcon icon={SKILL_ICONS.artillery} />
          <span className="menuNavText">
            <span className="menuNavLabel">Battle Test</span>
            <small>Shared arenas — set up and try a fight with other players</small>
          </span>
        </Link>
        <Link className="menuNavButton" href="/designer">
          <MenuNavIcon icon={SKILL_ICONS.pathfinding} />
          <span className="menuNavText">
            <span className="menuNavLabel">Map Designer</span>
            <small>Build and share custom maps for everyone to play on</small>
          </span>
        </Link>
        <Link className="menuNavButton" href="/hall-of-fame">
          <MenuNavIcon icon={SKILL_ICONS.luck} />
          <span className="menuNavText">
            <span className="menuNavLabel">Hall of Fame</span>
            <small>{accounts ? "Rankings by MMR" : "Rankings open with player accounts"}</small>
          </span>
        </Link>
        <Link className="menuNavButton" href="/credits">
          <MenuNavIcon icon={SKILL_ICONS.wisdom} />
          <span className="menuNavText">
            <span className="menuNavLabel">Credits</span>
            <small>Sources and art attribution</small>
          </span>
        </Link>
        {accounts && account ? (
          <>
            <Link className="menuNavButton" href="/profile">
              <MenuNavIcon icon={SKILL_ICONS.intelligence} />
              <span className="menuNavText">
                <span className="menuNavLabel">Profile</span>
                <small>Contact details other players can reach you at</small>
              </span>
            </Link>
            {account.role === "admin" ? (
              <Link className="menuNavButton" href="/admin">
                <MenuNavIcon icon={SKILL_ICONS.interference} />
                <span className="menuNavText">
                  <span className="menuNavLabel">Admin</span>
                  <small>Moderate players and rooms</small>
                </span>
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
              <MenuNavIcon icon={SKILL_ICONS.logistics} />
              <span className="menuNavText">
                <span className="menuNavLabel">Logout</span>
                <small>End this session</small>
              </span>
            </button>
          </>
        ) : null}
      </nav>
    </MenuShell>
    </>
  );
}
