/**
 * UI art slots — the single registry mapping every pre-game screen visual
 * (menu backdrops, panel frames, emblems, loading banners) to its current
 * asset file.
 *
 * Components consume SLOTS (`uiArtSlot("menu-backdrop")`), never hardcoded
 * paths, so upgrading a visual later — e.g. with newly generated art — is one
 * registry line (or dropping a new file on the same path), zero component
 * changes. This is the Phase 0 foundation of the platform expansion plan
 * (docs/game-expansion-plan.md §D7).
 *
 * Every slot documents its intended render context and target shape so an
 * image-generation prompt can be written against it (the repo convention —
 * see docs/*-art-prompts.md). The first pass reuses existing shipped assets;
 * `src` must always point at a real file under /public (enforced by
 * ui-art.test.ts).
 */

export type UiArtSlot = {
  /** Root-relative /public path. Route through assetUrl() when rendering. */
  src: string;
  /** Accessible description of the current artwork. */
  alt: string;
  /**
   * Target shape for replacement art, e.g. "1920x1080 full-bleed" or
   * "512x512 square emblem". Guidance for future generated art, not a
   * rendering constraint.
   */
  size: string;
};

export const UI_ART_SLOTS = {
  /** Full-bleed backdrop behind the login / name screen. */
  "login-backdrop": {
    // Soft, low-contrast parchment castle from the Homm3BG layout kit — calm
    // enough for the name/sign-in form overlaid on it.
    src: "/assets/ui/layout/castle.jpg",
    alt: "Misty parchment vista of a castle beside a lake",
    size: "1920x1080 full-bleed, dark edges (text is overlaid)"
  },
  /** Full-bleed backdrop behind the main menu. */
  "menu-backdrop": {
    // Cinematic cover art (the board-game box dragon) — the dramatic hero
    // screen. The vignette + panel keep the menu text readable over it.
    src: "/assets/ui/layout/cover.jpg",
    alt: "A great dragon breathing fire — Heroes III board game cover art",
    size: "1920x1080 full-bleed, dark edges (menu panel is overlaid)"
  },
  /** Full-bleed backdrop behind the multiplayer lobby (room browser). */
  "lobby-backdrop": {
    src: "/assets/ui/map-backdrop.jpg",
    alt: "Weathered parchment map of Erathia",
    size: "1920x1080 full-bleed, low contrast (room list is overlaid)"
  },
  /** Full-bleed backdrop behind loading screens (room join, map entry). */
  "loading-backdrop": {
    src: "/assets/ui/layout/cover.jpg",
    alt: "A great dragon breathing fire — Heroes III board game cover art",
    size: "1920x1080 full-bleed, low contrast (progress bar is overlaid)"
  },
  /** The official gold "Heroes III — The Board Game" wordmark logo. */
  "game-logo": {
    src: "/assets/ui/layout/logo.png",
    alt: "Heroes III of Might and Magic — The Board Game",
    size: "1000x400 transparent PNG wordmark (rendered above the menu panel)"
  },
  /** Square emblem for the Erathia game server (server browser badge). */
  "server-emblem-erathia": {
    src: "/assets/town-icon-castle.webp",
    alt: "Castle crest of Erathia",
    size: "512x512 square emblem on transparent background"
  }
} as const satisfies Record<string, UiArtSlot>;

export type UiArtSlotId = keyof typeof UI_ART_SLOTS;

export function uiArtSlot(id: UiArtSlotId): UiArtSlot {
  return UI_ART_SLOTS[id];
}
