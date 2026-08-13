"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cardFaceImage } from "@/data/cards/empowered-card-art";
import { polishBalanceCardImage } from "@/data/cards/polish-balance-art";

// ---------------------------------------------------------------------------
// Polish Balance Pack (`polish-card-balance`) — the FACE-SWAP seam.
//
// `cardFaceImage(cardId, empowered)` is already the ONE resolver every card-face
// surface reads (the hand fan / trays / piles via `CardFrame`, the zoom reader,
// the own-discard top and the pile browser). It is a pure data lookup and takes
// no GameState, so — exactly like `ArtifactSetIconsProvider` — the table screens
// publish the single boolean "the Balance Pack is on" through this context and
// every surface swaps through `useCardFaceImage`.
//
// With no provider (every other screen, and every test that renders a card face
// in isolation) the default is `false`, so the swap is a strict opt-in and the
// rule-off render is byte-identical to before.
// ---------------------------------------------------------------------------

const PolishBalanceArtContext = createContext(false);

/** Publish "the Polish Balance Pack is on" to every card face below. */
export function PolishBalanceArtProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return <PolishBalanceArtContext.Provider value={enabled}>{children}</PolishBalanceArtContext.Provider>;
}

export function usePolishBalanceArtEnabled(): boolean {
  return useContext(PolishBalanceArtContext);
}

/**
 * The ONE face-precedence rule, as a pure function so a surface that cannot call
 * a hook where it needs the face (a `.map()` row, or a component that has
 * already returned early) reads the identical ordering.
 *
 * Precedence: the Balance-Pack face (while the rule is on and the card has a
 * WIRED reprint) beats both the printed `-empowered` scan and the classic face.
 * That is deliberate: the `-empowered` scan prints the OLD rules text, so an
 * Empowered holder would otherwise read rules the engine no longer runs. The
 * Empowered cue itself is unaffected — the render surfaces keep drawing their
 * gold ring / badge on top of whichever face this returns.
 */
export function resolveCardFaceImage(
  balanceEnabled: boolean,
  cardId: string | undefined,
  empowered: boolean
): string | undefined {
  if (balanceEnabled) {
    const balance = polishBalanceCardImage(cardId);
    if (balance) {
      return balance;
    }
  }
  return cardFaceImage(cardId, empowered);
}

/** `resolveCardFaceImage` with the rule read from context — the usual surface. */
export function useCardFaceImage(cardId: string | undefined, empowered: boolean): string | undefined {
  return resolveCardFaceImage(usePolishBalanceArtEnabled(), cardId, empowered);
}
