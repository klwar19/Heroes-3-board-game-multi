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

/** Jet sparks that ride the continuous stream (nth-child positions in CSS). */
const DRAGON_BREATH_SPARKS = 20;
/** Ground-pool embers that smolder in the lower-right landing zone. */
const DRAGON_GROUND_EMBERS = 12;

/**
 * Ambient dragon-breath on the main-menu cover: painted fire extracted from
 * the same cover art, locked to ken-burns. The ART itself rages — multiple
 * phase-offset copies of the flame image push mouth → down so the texture
 * constantly rolls outward (not a static overlay with a soft mask). Decorative
 * only (pointer-events: none).
 */
function MenuDragonBreath() {
  const breathSrc = assetUrl("/assets/ui/ornate/dragon-breath.webp");
  return (
    <div aria-hidden className="menuDragonBreath">
      {/* Base jet — always on, raging flicker. */}
      <img alt="" className="menuDragonBreathPlume" draggable={false} src={breathSrc} />
      {/* Three phase-offset pours of the same art = seamless rolling flame. */}
      <img alt="" className="menuDragonBreathRage menuDragonBreathRage1" draggable={false} src={breathSrc} />
      <img alt="" className="menuDragonBreathRage menuDragonBreathRage2" draggable={false} src={breathSrc} />
      <img alt="" className="menuDragonBreathRage menuDragonBreathRage3" draggable={false} src={breathSrc} />
      {/* Soft heat shimmer ghost (blurred art moving faster). */}
      <img alt="" className="menuDragonBreathShimmer" draggable={false} src={breathSrc} />
      {/* Landing blaze in the lower-right pool. */}
      <img alt="" className="menuDragonBreathImpact" draggable={false} src={breathSrc} />
      <div className="menuDragonGroundBurn" />
      <img
        alt=""
        className="menuDragonBreathEmbers"
        draggable={false}
        src={assetUrl("/assets/ui/ornate/dragon-ember.webp")}
      />
      <div className="menuDragonBreathSparks">
        {Array.from({ length: DRAGON_BREATH_SPARKS }, (_, i) => (
          <span className="menuDragonSpark" key={`s${i}`} />
        ))}
      </div>
      <div className="menuDragonGroundEmbers">
        {Array.from({ length: DRAGON_GROUND_EMBERS }, (_, i) => (
          <span className="menuDragonGroundEmber" key={`g${i}`} />
        ))}
      </div>
    </div>
  );
}

/** Rising gold motes (WC3-menu fireflies), positioned per-index in CSS. */
const MENU_MOTES = 14;

/**
 * A column of rising gold motes across the main-menu backdrop (WC3-menu
 * fireflies). Decorative only (pointer-events: none), hidden under reduced
 * motion like the dragon breath.
 */
function MenuMotes() {
  return (
    <div aria-hidden className="menuGuardians">
      <div className="menuGuardianMotes">
        {Array.from({ length: MENU_MOTES }, (_, i) => (
          <span className="menuMote" key={`m${i}`} />
        ))}
      </div>
    </div>
  );
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
  dragonBreath = false,
  videoBackdrop,
  className,
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
  /**
   * true → ambient dragon-breath fire over the cover (main menu only). Not a
   * frame: the painted jet from the backdrop art surges in/out with embers.
   */
  dragonBreath?: boolean;
  /** Optional full-bleed looping video used instead of the still art slot. */
  videoBackdrop?: string;
  /** Page-specific layout hook without changing the shared shell defaults. */
  className?: string;
  as?: "main" | "div";
  /** Small line pinned under the panel (e.g. "Playing as …"). */
  footer?: ReactNode;
}) {
  useBackgroundMusic("menu");
  const art = uiArtSlot(backdrop);
  const brand = uiArtSlot("game-logo");

  return (
    <Root className={`menuShellRoot${className ? ` ${className}` : ""}`}>
      {/* The still art slot always renders: on a video screen it sits UNDER the
          video as the fallback that shows through whenever the video does not
          paint — a slow/failed load, an unsupported codec, or reduced motion
          (where CSS hides the video). It costs no extra request, being the same
          file the video already fetches as its `poster`. */}
      <img alt="" aria-hidden className="menuShellBackdrop" src={assetUrl(art.src)} />
      {videoBackdrop ? (
        <video
          aria-hidden
          autoPlay
          className="menuShellBackdrop menuShellBackdropVideo"
          loop
          muted
          playsInline
          poster={assetUrl(art.src)}
          preload="auto"
          src={assetUrl(videoBackdrop)}
        />
      ) : null}
      {dragonBreath ? <MenuDragonBreath /> : null}
      {dragonBreath ? <MenuMotes /> : null}
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
