"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ARTIFACT_SET_BY_MEMBER, artifactSetDefinition, artifactSetIconImage } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { ArtifactSetArmingProvider } from "./artifact-set-powers";

// ---------------------------------------------------------------------------
// Polish Set Artifacts — the set ICON worn in the corner of every member
// Artifact card face (`CardFrame`, src/components/table/seats.tsx).
//
// The membership itself is pure card data (`ARTIFACT_SET_BY_MEMBER`), but
// whether the badge should show at all depends on the house rule being ON — and
// `CardFrame` takes no `state`. So the table screens publish that one boolean
// through this context; with no provider (every other screen, and every test
// that renders a card face in isolation) the default is `false`, i.e. the badge
// is a strict opt-in and the rule-off render is byte-identical to before.
// ---------------------------------------------------------------------------

const ArtifactSetIconsContext = createContext(false);

/**
 * Publish "the Polish Set Artifacts rule is on" to every card face below — and,
 * in the same wrapper, the ONE board-arming slot the combat command dock and the
 * battlefield share (a set power with several unit targets is aimed on the
 * board, not listed as one button per unit). Both table screens already mount
 * this provider around their whole tree, so folding the arming slot in here
 * keeps a single mount point and cannot leave one surface armed and the other
 * unaware.
 */
export function ArtifactSetIconsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return (
    <ArtifactSetIconsContext.Provider value={enabled}>
      <ArtifactSetArmingProvider>{children}</ArtifactSetArmingProvider>
    </ArtifactSetIconsContext.Provider>
  );
}

export function useArtifactSetIconsEnabled(): boolean {
  return useContext(ArtifactSetIconsContext);
}

/**
 * The set id this card belongs to, or null — null when the rule is off, when
 * the card is not a set member, or when there is no card at all. `CardFrame`
 * only wraps its `<img>` in a badge frame when this returns a set, so the
 * ordinary card face keeps exactly the DOM it has always had.
 */
export function useCardArtifactSetId(cardId: string | undefined): string | null {
  const enabled = useArtifactSetIconsEnabled();
  if (!enabled || !cardId) {
    return null;
  }
  return ARTIFACT_SET_BY_MEMBER[cardId] ?? null;
}

/**
 * Wrap a card FACE so the badge can sit in its corner. Renders the children
 * UNTOUCHED (no wrapper element at all) when the rule is off or the card is not
 * a set member, so every ordinary card face keeps exactly the DOM it has always
 * had. Use this where the face sits in normal flow.
 *
 * `.cardSetFrame` is `position: relative; display: inline-flex`, so it sizes to
 * the face — safe wherever the face has an intrinsic or fixed width, and NOT
 * usable where the face is `width: 100%` or `position: absolute` (a percentage
 * would resolve against an indefinite box; an absolute face would re-anchor to
 * the wrapper and collapse it). Those sites use `CardSetCornerBadge` instead.
 */
export function CardSetFrame({
  cardId,
  children,
  className
}: {
  cardId?: string;
  children: ReactNode;
  /** Extra class on the wrapper (e.g. the zoom reader's larger badge sizing). */
  className?: string;
}) {
  const setId = useCardArtifactSetId(cardId);
  if (!setId) {
    return <>{children}</>;
  }
  return (
    <span className={className ? `cardSetFrame ${className}` : "cardSetFrame"}>
      {children}
      <ArtifactSetBadge setId={setId} />
    </span>
  );
}

/**
 * The badge ALONE, for a card face whose parent is already a positioning context
 * (a `position: relative` tile/button that also hosts other absolute overlays —
 * the `.empoweredBadgeOverlay` precedent). Renders nothing when the rule is off
 * or the card is not a member, so those tiles are untouched by default.
 *
 * Use this — never a second copy of the badge markup — for a face that fills its
 * parent (`position: absolute; inset: 0`, or `width: 100%`), where wrapping the
 * face would break its sizing.
 */
export function CardSetCornerBadge({ cardId }: { cardId?: string }) {
  const setId = useCardArtifactSetId(cardId);
  return setId ? <ArtifactSetBadge setId={setId} /> : null;
}

/** The corner badge itself: the set's own artwork, cut to a 256×256 webp. */
export function ArtifactSetBadge({ setId }: { setId: string }) {
  const name = artifactSetDefinition(setId)?.name ?? setId;
  return (
    <img
      alt=""
      aria-hidden="true"
      className="cardSetIcon"
      data-set-id={setId}
      decoding="async"
      draggable={false}
      loading="lazy"
      src={assetUrl(artifactSetIconImage(setId))}
      title={`${name} set piece`}
    />
  );
}
