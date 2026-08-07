"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ARTIFACT_SET_BY_MEMBER, artifactSetDefinition, artifactSetIconImage } from "@/engine";
import { assetUrl } from "@/lib/asset-url";

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

/** Publish "the Polish Set Artifacts rule is on" to every card face below. */
export function ArtifactSetIconsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  return <ArtifactSetIconsContext.Provider value={enabled}>{children}</ArtifactSetIconsContext.Provider>;
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
