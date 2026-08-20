"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cardFaceImage } from "@/data/cards/empowered-card-art";
import { polishBalanceCardImage, polishBalanceEmpoweredCardImage } from "@/data/cards/polish-balance-art";

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
 * Precedence (while the rule is on and the card has a WIRED reprint):
 *  1. the DEDICATED empowered balance face, when the card is shown Empowered and
 *     one exists (the 12 abilities in `POLISH_BALANCE_EMPOWERED_ABILITY_IDS`);
 *  2. otherwise the plain balance face.
 * Both beat the printed `-empowered` fan scan and the classic face. The empowered
 * balance face prints the NEW rules text (unlike the classic `-empowered` scan,
 * which prints the OLD text — the reason the plain balance face used to win over
 * it), so an Empowered holder reads the right card. The render surfaces still draw
 * their gold ring / badge on top of whichever face this returns.
 */
export function resolveCardFaceImage(
  balanceEnabled: boolean,
  cardId: string | undefined,
  empowered: boolean
): string | undefined {
  if (balanceEnabled) {
    if (empowered) {
      const empoweredBalance = polishBalanceEmpoweredCardImage(cardId);
      if (empoweredBalance) {
        return empoweredBalance;
      }
    }
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
