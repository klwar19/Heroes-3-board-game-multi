"use client";

/* eslint-disable @next/next/no-img-element */
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { uiArtSlot, type UiArtSlotId } from "@/data/ui-art";
import { assetUrl } from "@/lib/asset-url";
import { useBackgroundMusic } from "@/lib/music";
import { playLibrarySound } from "@/lib/sound";

/**
 * The converted Heroes III button click, played on any menu nav button across
 * every pre-game screen. A single delegated handler on the shell catches clicks
 * on `.menuNavButton` elements (or a nested icon/label inside one) so each menu
 * screen gets the click sound without wiring every `<button>`/`<Link>` by hand.
 * A detached `new Audio()` keeps playing even when a nav Link navigates away.
 */
export function playMenuNavClickSound(event: ReactMouseEvent<HTMLElement>): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest?.(".menuNavButton")) {
    playLibrarySound("ui/button", 0.4);
  }
}

/**
 * Shared chrome for every pre-game screen (login, main menu, multiplayer
 * lobby, hall of fame): a full-bleed backdrop from the art-slot registry, a
 * vignette so overlaid text stays readable, an optional centered panel, and
 * the menu music theme. Expansion plan §D7 — screens consume art SLOTS, so
 * upgrading a backdrop later is a registry edit, never a component change.
 *
 * `as="div"` lets a page that already renders its own <main> landmark (the
 * reused LobbyScreen does) embed the shell without nesting two <main>s.
 */
export function MenuShell({
  backdrop = "menu-backdrop",
  title,
  children,
  panel = true,
  wide = false,
  logo = false,
  frameless = false,
  as: Root = "main",
  footer
}: {
  backdrop?: UiArtSlotId;
  /** Heading rendered inside the panel (omit to compose your own). */
  title?: string;
  children: ReactNode;
  /** false → children render full-width on the backdrop (no framed panel). */
  panel?: boolean;
  /** Wider panel for list-heavy screens (hall of fame, room browser). */
  wide?: boolean;
  /** true → float the official gold wordmark above the panel (main menu). */
  logo?: boolean;
  /** true → drop the panel box entirely so children float over the backdrop
   *  (main menu: only the option emblems + words show over the dragon). */
  frameless?: boolean;
  as?: "main" | "div";
  /** Small line pinned under the panel (e.g. "Playing as …"). */
  footer?: ReactNode;
}) {
  useBackgroundMusic("menu");
  const art = uiArtSlot(backdrop);
  const brand = uiArtSlot("game-logo");

  return (
    <Root className="menuShellRoot">
      <img alt="" aria-hidden className="menuShellBackdrop" src={assetUrl(art.src)} />
      <div aria-hidden className="menuShellVignette" />
      <div className="menuShellContent" onClick={playMenuNavClickSound}>
        {logo ? <img alt={brand.alt} className="menuGameLogo" src={assetUrl(brand.src)} /> : null}
        {panel ? (
          <section className={`menuShellPanel${wide ? " wide" : ""}${frameless ? " bare" : ""}`}>
            {title ? <h1 className="menuShellTitle">{title}</h1> : null}
            {children}
          </section>
        ) : (
          children
        )}
        {footer ? <div className="menuShellFooter">{footer}</div> : null}
      </div>
    </Root>
  );
}
