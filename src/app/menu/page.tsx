"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { WelcomeNotice } from "@/components/menu/welcome-notice";
import { UiModePrompt } from "@/components/table/ui-mode-prompt";
import { assetUrl } from "@/lib/asset-url";
import { fetchSession, logout, type SelfProfile } from "@/lib/auth-client";
import { authEnabled, GUEST_LOGIN_DISABLED } from "@/lib/auth-mode";
import { clearGuestMode, getDisplayName, isGuestMode } from "@/lib/identity";

type MenuView = "main" | "multiplayer" | "miscellaneous";

const MENU_ART = {
  singlePlayer: "/assets/ui/menu/buttons/single-player.webp",
  multiplayer: "/assets/ui/menu/buttons/multiplayer.webp",
  mapEditor: "/assets/ui/menu/buttons/map-editor.webp",
  miscellaneous: "/assets/ui/menu/buttons/miscellaneous.webp",
  logout: "/assets/ui/menu/buttons/logout.webp",
  skirmish: "/assets/ui/menu/buttons/skirmish.webp",
  battleTest: "/assets/ui/menu/buttons/battle-test.webp",
  coOp: "/assets/ui/menu/buttons/co-op.webp",
  back: "/assets/ui/menu/buttons/back.webp",
  hallOfFame: "/assets/ui/menu/buttons/hall-of-fame.webp",
  credits: "/assets/ui/menu/buttons/credits.webp",
  profile: "/assets/ui/menu/buttons/profile.webp",
  admin: "/assets/ui/menu/buttons/admin.webp"
} as const;

function MenuArt({ src }: { src: string }) {
  return <img alt="" aria-hidden className="menuNavArt" draggable={false} src={assetUrl(src)} />;
}

export default function MenuPage() {
  const router = useRouter();
  const [displayName, setDisplayNameState] = useState("");
  const [account, setAccount] = useState<SelfProfile | null>(null);
  const [view, setView] = useState<MenuView>("main");
  const started = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (authEnabled()) {
      void fetchSession().then((profile) => {
        if (profile) {
          setAccount(profile);
          setDisplayNameState(profile.nickname);
        } else if (isGuestMode() && !GUEST_LOGIN_DISABLED) {
          setDisplayNameState(getDisplayName());
        } else {
          router.replace("/login");
        }
      });
    } else {
      const stored = getDisplayName();
      if (stored) setDisplayNameState(stored);
    }
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    for (const src of Object.values(MENU_ART)) {
      const image = new Image();
      image.src = assetUrl(src);
    }
  }, []);

  const accounts = authEnabled();

  return (
    <>
      <UiModePrompt />
      <WelcomeNotice />
      <MenuShell
        className="mainMenuShell"
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
        frameless
        logo
        videoBackdrop="/assets/ui/menu/main-menu-loop-v5.mp4"
      >
        <nav aria-label={view === "main" ? "Main menu" : `${view} menu`} className={`menuNav menuNav-${view}`}>
          {view === "main" ? (
            <>
              <Link aria-label="SINGLE PLAYER" className="menuNavButton" href="/single-player">
                <MenuArt src={MENU_ART.singlePlayer} />
              </Link>
              <button aria-label="MULTIPLAYER" className="menuNavButton" onClick={() => setView("multiplayer")} type="button">
                <MenuArt src={MENU_ART.multiplayer} />
              </button>
              <Link aria-label="MAP EDITOR" className="menuNavButton" href="/designer">
                <MenuArt src={MENU_ART.mapEditor} />
              </Link>
              <button aria-label="MISCELLANEOUS" className="menuNavButton" onClick={() => setView("miscellaneous")} type="button">
                <MenuArt src={MENU_ART.miscellaneous} />
              </button>
              <button
                aria-label="LOGOUT"
                className="menuNavButton"
                onClick={async () => {
                  if (accounts && account) {
                    await logout();
                  } else {
                    clearGuestMode();
                  }
                  router.replace("/login");
                }}
                type="button"
              >
                <MenuArt src={MENU_ART.logout} />
              </button>
            </>
          ) : null}

          {view === "multiplayer" ? (
            <>
              <Link aria-label="SKIRMISH" className="menuNavButton" href="/play">
                <MenuArt src={MENU_ART.skirmish} />
              </Link>
              <Link aria-label="BATTLE TEST" className="menuNavButton" href="/battle">
                <MenuArt src={MENU_ART.battleTest} />
              </Link>
              <Link aria-label="CO-OP" className="menuNavButton" href="/play?mode=co-op">
                <MenuArt src={MENU_ART.coOp} />
              </Link>
              <button aria-label="BACK" className="menuNavButton" onClick={() => setView("main")} type="button">
                <MenuArt src={MENU_ART.back} />
              </button>
            </>
          ) : null}

          {view === "miscellaneous" ? (
            <>
              <Link aria-label="HALL OF FAME" className="menuNavButton" href="/hall-of-fame">
                <MenuArt src={MENU_ART.hallOfFame} />
              </Link>
              <Link aria-label="CREDITS" className="menuNavButton" href="/credits">
                <MenuArt src={MENU_ART.credits} />
              </Link>
              <Link aria-label="PROFILE" className="menuNavButton" href="/profile">
                <MenuArt src={MENU_ART.profile} />
              </Link>
              {accounts && account?.role === "admin" ? (
                <Link aria-label="ADMIN" className="menuNavButton" href="/admin">
                  <MenuArt src={MENU_ART.admin} />
                </Link>
              ) : null}
              <button aria-label="BACK" className="menuNavButton" onClick={() => setView("main")} type="button">
                <MenuArt src={MENU_ART.back} />
              </button>
            </>
          ) : null}
        </nav>
      </MenuShell>
    </>
  );
}
