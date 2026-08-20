"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { cardFaceImage } from "@/data/cards/empowered-card-art";
import { polishBalanceCardImage, polishBalanceEmpoweredCardImage } from "@/data/cards/polish-balance-art";
import {
  communityBalanceCardImage,
  communityBalanceEmpoweredCardImage,
  communityBalanceUnitFaceImage
} from "@/data/cards/community-balance-art";

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

/**
 * The two balance packs a table can have on at once. Kept as ONE context value
 * (rather than a second fighting provider) so `resolveCardFaceImage` stays the
 * single face-precedence rule every surface reads.
 */
export type BalanceArtFlags = {
  /** `polish-card-balance` */
  polish: boolean;
  /** `community-card-balance` */
  community: boolean;
};

const BOTH_OFF: BalanceArtFlags = { polish: false, community: false };

const PolishBalanceArtContext = createContext<BalanceArtFlags>(BOTH_OFF);

/**
 * Publish "which balance packs are on" to every card face below. `enabled` is
 * the Polish Balance Pack (the original prop, unchanged); `communityEnabled` is
 * the Community Balance Change and defaults to OFF, so every existing mount and
 * test renders byte-identically.
 */
export function PolishBalanceArtProvider({
  children,
  enabled,
  communityEnabled = false
}: {
  children: ReactNode;
  enabled: boolean;
  communityEnabled?: boolean;
}) {
  const value = useMemo<BalanceArtFlags>(
    () => ({ polish: enabled, community: communityEnabled }),
    [enabled, communityEnabled]
  );
  return <PolishBalanceArtContext.Provider value={value}>{children}</PolishBalanceArtContext.Provider>;
}

/** Both packs' booleans — what a surface passes to `resolveCardFaceImage`. */
export function useBalanceArtFlags(): BalanceArtFlags {
  return useContext(PolishBalanceArtContext);
}

export function usePolishBalanceArtEnabled(): boolean {
  return useContext(PolishBalanceArtContext).polish;
}

export function useCommunityBalanceArtEnabled(): boolean {
  return useContext(PolishBalanceArtContext).community;
}

/**
 * The ONE face-precedence rule, as a pure function so a surface that cannot call
 * a hook where it needs the face (a `.map()` row, or a component that has
 * already returned early) reads the identical ordering.
 *
 * Precedence, top to bottom (each rung only when that pack's rule is ON and the
 * card has a WIRED reprint in it):
 *  1. the DEDICATED empowered COMMUNITY face, when the card is shown Empowered;
 *  2. the plain COMMUNITY face;
 *  3. the DEDICATED empowered POLISH face, when the card is shown Empowered
 *     (the 12 abilities in `POLISH_BALANCE_EMPOWERED_ABILITY_IDS`);
 *  4. the plain POLISH face;
 *  5. the classic printed `-empowered` scan / card face (`cardFaceImage`).
 * COMMUNITY WINS over POLISH for a card both packs cover, matching the engine's
 * `balanceCardLibrary` (the community swap is applied after the polish one), so
 * the face a player reads is always the text the engine runs.
 * Every balance face beats the printed `-empowered` fan scan: that scan prints
 * the OLD rules text, so an Empowered holder must still read the NEW card. The
 * render surfaces still draw their gold ring / badge on top of whichever face
 * this returns.
 *
 * `flags` accepts a bare boolean for the Polish-only callers that predate the
 * community pack (equivalent to `{ polish: value, community: false }`).
 */
export function resolveCardFaceImage(
  flags: boolean | BalanceArtFlags,
  cardId: string | undefined,
  empowered: boolean
): string | undefined {
  const { polish, community } = typeof flags === "boolean" ? { polish: flags, community: false } : flags;
  if (community) {
    if (empowered) {
      const empoweredCommunity = communityBalanceEmpoweredCardImage(cardId);
      if (empoweredCommunity) {
        return empoweredCommunity;
      }
    }
    const communityFace = communityBalanceCardImage(cardId);
    if (communityFace) {
      return communityFace;
    }
  }
  if (polish) {
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

/** `resolveCardFaceImage` with both rules read from context — the usual surface. */
export function useCardFaceImage(cardId: string | undefined, empowered: boolean): string | undefined {
  return resolveCardFaceImage(useBalanceArtFlags(), cardId, empowered);
}

/**
 * The ONE face-precedence rule for a UNIT SIDE (a unit side has no card id, so
 * `resolveCardFaceImage` cannot serve it).
 *
 * Only the COMMUNITY pack reprints unit sides — the Polish Balance Pack does
 * not — so the ordering is just: the community face when that pack is ON and
 * THIS side has a wired reprint, else the printed `side.cardImage` the caller
 * passes in. With the pack off (the default context) it returns `printed`
 * unchanged, so every surface is byte-identical.
 */
export function resolveUnitFaceImage(
  flags: boolean | BalanceArtFlags,
  unitDefId: string | undefined,
  side: string | undefined,
  printed: string | undefined
): string | undefined {
  const community = typeof flags === "boolean" ? flags : flags.community;
  if (!community) {
    return printed;
  }
  return communityBalanceUnitFaceImage(unitDefId, side) ?? printed;
}

/** `resolveUnitFaceImage` with the rule read from context. */
export function useUnitFaceImage(
  unitDefId: string | undefined,
  side: string | undefined,
  printed: string | undefined
): string | undefined {
  return resolveUnitFaceImage(useBalanceArtFlags(), unitDefId, side, printed);
}
