"use client";

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { uiArtSlot, type UiArtSlotId } from "@/data/ui-art";
import { assetUrl } from "@/lib/asset-url";
import { useBackgroundMusic } from "@/lib/music";

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
  as?: "main" | "div";
  /** Small line pinned under the panel (e.g. "Playing as …"). */
  footer?: ReactNode;
}) {
  useBackgroundMusic("menu");
  const art = uiArtSlot(backdrop);

  return (
    <Root className="menuShellRoot">
      <img alt="" aria-hidden className="menuShellBackdrop" src={assetUrl(art.src)} />
      <div aria-hidden className="menuShellVignette" />
      <div className="menuShellContent">
        {panel ? (
          <section className={`menuShellPanel${wide ? " wide" : ""}`}>
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
